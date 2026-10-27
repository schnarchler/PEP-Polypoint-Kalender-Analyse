"""
icon_learn.py – Visueller Icon-Lernmodus
==========================================
Extrahiert alle unique Icons aus dem PDF und erstellt zwei Dinge:

  1. calc/icon_uebersicht.html  – Visuelle HTML-Tabelle mit allen Icons als
                                   Bilder + Eingabefelder für Dienst-Codes.
                                   Im Browser öffnen, ausfüllen, speichern.

  2. Interaktiver Terminal-Modus mit dem Icon-Bild neben dem Prompt
     (öffnet automatisch das Bild im System-Viewer, sofern verfügbar).

Aufruf:
  python icon_learn.py --pdf "Plan.pdf"             # HTML erstellen + im Browser öffnen
  python icon_learn.py --pdf "Plan.pdf" --html-only # nur HTML erstellen, nicht öffnen

Workflow:
  1. python icon_learn.py --pdf "Plan.pdf"
  2. Browser öffnet sich mit calc/icon_uebersicht.html
  3. Für jedes Icon den Dienst-Code eintragen (Autocomplete hilft)
     Ganztag-Checkbox aktivieren für Events die ganztägig im Kalender erscheinen sollen
  4. "Speichern → JSON" klicken → icon_fingerprint_map.json in calc/ ablegen
  Beim nächsten Aufruf werden bereits bekannte Codes vorausgefüllt (neue werden unten angefügt)
"""

import argparse
import base64
import io
import json
import logging
import sys
import webbrowser
from pathlib import Path
from typing import Optional

import pdfplumber
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import ICON_MAPPING_DIR, PDF_DIR
from pdf_utils import (
    pixel_fingerprint, _get_indexed_palette, _dominant_color_rgb,
    extract_icon_palette, is_decoration, detect_icon_size, detect_std_cell_size,
    build_ahash_bridge,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)



def icon_to_pil(img: dict) -> Optional[Image.Image]:
    """
    Konvertiert ein eingebettetes PDF-Icon in ein PIL-Bild.
    Unterstützt automatisch:
      - 1-bit Indexed Color (ältere PDF-Exporte)
      - 8-bit DeviceRGB     (neuere PDF-Exporte)
    """
    try:
        raw  = img["stream"].get_data()
        w, h = img["srcsize"]
        bits = img.get("bits", 8)

        if bits == 1:
            # 1-bit: Palette auslesen, Bits entpacken
            result = _get_indexed_palette(img)
            fg, bg = result if result else ((0,0,0), (255,255,255))
            pil    = Image.new("RGB", (w, h))
            px     = pil.load()
            bi     = 0
            for y in range(h):
                for x in range(w):
                    byte_i = bi // 8
                    bit_p  = 7 - (bi % 8)
                    if byte_i < len(raw):
                        px[x, y] = bg if (raw[byte_i] >> bit_p) & 1 else fg
                    bi += 1

        else:
            # 8-bit: direkt als RGB oder Graustufen laden
            cs_str = str(img.get("colorspace", ""))
            if "DeviceRGB" in cs_str and len(raw) >= w * h * 3:
                pil = Image.frombytes("RGB", (w, h), bytes(raw[:w*h*3]))
            else:
                pil = Image.frombytes("L", (w, h), bytes(raw[:w*h])).convert("RGB")

        return pil.resize((64, 64), Image.NEAREST)

    except Exception as e:
        log.debug("Icon-Konvertierung fehlgeschlagen: %s", e)
        return None


def pil_to_base64(img: Image.Image) -> str:
    """PIL-Bild → base64-kodierter PNG-String für HTML-Einbettung."""
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def classify_image_type(img: dict, std_cell_w: float, std_cell_h: float = 13.4) -> str:
    """
    Klassifiziert ein Bild anhand der gerenderten PDF-Grösse.
    Volle Breite + reduzierte Hoehe (auch h<=8.5) = half_h (horizontaler Split).
    Echte Farbbalken kommen aus page.rects, nicht page.images.
    """
    w_pdf = img["x1"] - img["x0"]
    h_pdf = img["bottom"] - img["top"]
    if w_pdf < std_cell_w * 0.75:
        if h_pdf <= 8.5:
            return "skip"
        return "half"
    if h_pdf < std_cell_h * 0.90:
        return "half_h"
    return "icon"


def detect_std_cell_width(page) -> float:
    return detect_std_cell_size(page)[0]


def bar_color_from_img(img: dict) -> tuple[int, int, int]:
    """Liest die tatsächliche RGB-Farbe eines Farbbalkens aus den Pixeldaten."""
    try:
        raw = img["stream"].get_data()
        cs  = str(img.get("colorspace", ""))
        if "DeviceRGB" in cs and len(raw) >= 3:
            return (raw[0], raw[1], raw[2])
        if len(raw) >= 1:
            v = raw[0]
            return (v, v, v)
    except Exception:
        pass
    return (200, 200, 200)


def extract_unique_icons(page) -> list[dict]:
    """
    Gibt alle unique Icons zurück: normale, halbe UND Farbbalken.
    Jeder Eintrag hat ein 'typ'-Feld: 'icon', 'half', 'bar'.
    Filtert nur echte Artefakte (falsche srcsize) heraus.
    """
    icon_w, icon_h = detect_icon_size(page)
    std_cell_w, std_cell_h = detect_std_cell_size(page)

    seen: dict[str, dict] = {}
    skipped = 0
    for img in page.images:
        w, h = img.get("srcsize", (0, 0))
        if w <= 0 or h <= 0:
            skipped += 1
            continue
        # Srcsize muss ≤ Standard + 2px sein (keine fremden Grafiken)
        if w > icon_w + 2 or h > icon_h + 2:
            skipped += 1
            continue
        # Mindestgrösse: 25% der Standardgrösse
        if w < icon_w * 0.25 or h < icon_h * 0.25:
            skipped += 1
            continue

        # Typ bestimmen anhand gerenderter PDF-Grösse
        typ = classify_image_type(img, std_cell_w, std_cell_h)

        if typ == "skip":
            skipped += 1
            continue
        # Dekoration nur bei normalen Icons prüfen
        if typ == "icon" and is_decoration(img):
            skipped += 1
            continue

        phash = pixel_fingerprint(img)
        # half_h separat deduplizieren (gleiche Grafik wie normales Icon moeglich)
        dedup_key = f"{typ}:{phash}" if typ == "half_h" else phash
        if dedup_key in seen:
            continue

        # Für Farbbalken: echte Farbe aus Pixeldaten lesen
        if typ == "bar":
            bar_rgb = bar_color_from_img(img)
            color   = bar_rgb
        else:
            color   = extract_icon_palette(img) or (128, 128, 128)
            bar_rgb = None

        pil = icon_to_pil(img)
        seen[dedup_key] = {
            "phash":     phash,
            "dedup_key": dedup_key,   # fuer seitenuebergreifende Deduplizierung
            "pdf_name":  img["name"],
            "typ":       typ,
            "color":     color,
            "bar_rgb":   bar_rgb,
            "x":         img["x0"],
            "y":         img["top"],
            "pil":       pil,
            "b64":       pil_to_base64(pil) if pil else "",
        }

    n_icons  = sum(1 for v in seen.values() if v["typ"] == "icon")
    n_halfs  = sum(1 for v in seen.values() if v["typ"] == "half")
    n_halfs_h = sum(1 for v in seen.values() if v["typ"] == "half_h")
    n_bars   = sum(1 for v in seen.values() if v["typ"] == "bar")
    log.info("  %d Icons, %d halbe (V), %d halbe (H), %d Farbbalken, %d übersprungen",
             n_icons, n_halfs, n_halfs_h, n_bars, skipped)

    # Sortieren nach Farbe (Hue) damit ähnliche Icons zusammen stehen
    def hue_key(item):
        r, g, b = item["color"]
        mx = max(r, g, b)
        mn = min(r, g, b)
        if mx == mn:
            return (0, -mx)
        if mx == r:
            return (1, (g - b) / (mx - mn))
        if mx == g:
            return (2, (b - r) / (mx - mn))
        return (3, (r - g) / (mx - mn))

    return sorted(seen.values(), key=hue_key)


def extract_unique_bars(page) -> list[dict]:
    """
    Gibt alle einzigartigen Farbbalken aus page.rects zurück.
    Balken sind flache Rechtecke (h<=6px) mit bunter Fuellung.
    Key fuer Mapping: Hex-Farbe (#RRGGBB) — nicht phash.
    """
    def is_gray(c):
        if c is None: return True
        if isinstance(c, (int, float)): return True
        r, g, b = c[:3]
        return max(abs(r-g), abs(r-b), abs(g-b)) < 0.05

    def to_hex(c) -> str:
        if c is None: return "#808080"
        if isinstance(c, (int, float)):
            v = int(c * 255); return f"#{v:02X}{v:02X}{v:02X}"
        r, g, b = (int(x * 255) for x in c[:3])
        return f"#{r:02X}{g:02X}{b:02X}"

    def to_rgb255(c):
        if c is None: return (128, 128, 128)
        if isinstance(c, (int, float)):
            v = int(c * 255); return (v, v, v)
        return tuple(int(x * 255) for x in c[:3])

    seen: dict[str, dict] = {}   # hex → entry
    for rect in page.rects:
        h = rect.get("height", 0)
        if not (1.0 <= h <= 6.0):
            continue
        fill = rect.get("non_stroking_color")
        if is_gray(fill):
            continue
        hex_col = to_hex(fill).upper()
        if hex_col in seen:
            continue
        rgb = to_rgb255(fill)
        seen[hex_col] = {
            "phash":    hex_col,   # Hex-Farbe als "phash" fuer einheitliche API
            "pdf_name": hex_col,
            "typ":      "bar",
            "color":    rgb,
            "bar_rgb":  rgb,
            "hex":      hex_col,
            "x":        rect["x0"],
            "y":        rect["top"],
            "pil":      None,
            "b64":      "",
        }

    # Sortieren nach Hue
    def hue_key(item):
        r, g, b = [x/255 for x in item["color"]]
        mx, mn = max(r,g,b), min(r,g,b)
        if mx == mn: return (0, -mx)
        if mx == r: return (1, (g-b)/(mx-mn))
        if mx == g: return (2, (b-r)/(mx-mn))
        return (3, (r-g)/(mx-mn))

    result = sorted(seen.values(), key=hue_key)
    log.info("  %d unique Farbbalken (aus page.rects)", len(result))
    return result

# ══════════════════════════════════════════════════════════════════════════════
# KONTEXT-CROP (Ausschnitt des PDF um das Icon herum)
# ══════════════════════════════════════════════════════════════════════════════

def _crop_context(page, ic: dict, y_pad_pt: float = 3.0) -> Optional[Image.Image]:
    """
    Rendert einen horizontalen Streifen der PDF-Seite um die Position des Icons.
    Zeigt von x=0 (Mitarbeiternamenspalte) bis etwas rechts vom Icon.
    """
    try:
        x0_pt = float(ic['x'])
        y0_pt = float(ic['y'])
        typ   = ic.get('typ', 'icon')
        row_h_pt = 7.0 if typ == 'half_h' else 14.0

        ctx_x1 = min(float(page.width), x0_pt + 70.0)
        ctx_y0 = max(0.0, y0_pt - y_pad_pt)
        ctx_y1 = min(float(page.height), y0_pt + row_h_pt + y_pad_pt)
        if ctx_y1 <= ctx_y0 or ctx_x1 <= 0:
            return None

        strip = page.crop((0.0, ctx_y0, ctx_x1, ctx_y1))
        return strip.to_image(resolution=150).original
    except Exception as e:
        log.debug("Context-Crop fehlgeschlagen: %s", e)
        return None


# ══════════════════════════════════════════════════════════════════════════════
# HTML-ÜBERSICHT GENERIEREN
# ══════════════════════════════════════════════════════════════════════════════

def build_html(icons: list[dict], existing_mapping: dict, output_json_path: Path,
               ganztaegig_codes: set = None, existing_bar_mapping: dict = None,
               ics_zusatz_codes: set = None, ics_zeiten: dict = None,
               ignoriert: set = None, ignoriert_balken: set = None,
               title_suffix: str = "") -> str:
    """Erstellt eine vollständige HTML-Seite mit allen Icons und Eingabefeldern."""

    import json as _json
    from db_setup import get_connection as _get_conn
    _conn = _get_conn()
    _rows = _conn.execute("SELECT code FROM dienst_typen ORDER BY code").fetchall()
    _conn.close()
    known_codes = sorted(set(r[0] for r in _rows if r[0]))
    json_codes    = _json.dumps(known_codes)

    bar_map          = existing_bar_mapping or {}
    ics_zusatz_set   = ics_zusatz_codes or set()
    ics_zeiten_map   = ics_zeiten or {}
    ics_zeiten_json  = _json.dumps(ics_zeiten_map)
    ignoriert_set    = ignoriert or set()
    ignoriert_b_set  = ignoriert_balken or set()
    ignoriert_json   = _json.dumps(sorted(ignoriert_set))
    ignoriert_b_json = _json.dumps(sorted(ignoriert_b_set))

    # Hilfsfunktion: korrekter Lookup-Key (dedup_key für half_h, phash sonst)
    def _ic_key(ic):
        if ic.get("typ") == "half_h":
            return ic.get("dedup_key", "half_h:" + ic["phash"])
        return ic["phash"]

    # "Neu" = weder gemappt noch bewusst ignoriert
    n_new   = sum(1 for ic in icons
                  if (ic.get("typ") == "bar"
                      and ic["phash"].upper() not in bar_map
                      and ic["phash"].upper() not in ignoriert_b_set)
                  or (ic.get("typ") != "bar"
                      and _ic_key(ic) not in existing_mapping
                      and _ic_key(ic) not in ignoriert_set))
    n_total = len(icons)
    # "Nicht definiert" = kein Code zugewiesen (auch ignorierte Icons ohne Code)
    n_undef = sum(1 for ic in icons
                  if (ic.get("typ") == "bar"
                      and not bar_map.get(ic["phash"].upper(), "").replace(".png", ""))
                  or (ic.get("typ") != "bar"
                      and not existing_mapping.get(_ic_key(ic), "").replace(".png", "")))
    existing_mapping_json     = _json.dumps(existing_mapping)
    existing_bar_mapping_json = _json.dumps(bar_map)
    ganztaegig_set         = ganztaegig_codes or set()
    ganztaegig_json        = _json.dumps(sorted(ganztaegig_set))
    ics_zusatz_json        = _json.dumps(sorted(ics_zusatz_set))

    # Icons nach Code/Name sortieren: gemappte alphabetisch zuerst, ungemappte danach,
    # Farbbalken immer ganz am Schluss.
    def _code_sort_key(ic):
        is_bar = ic.get("typ") == "bar"
        if is_bar:
            code = bar_map.get(ic["phash"].upper(), "")
            group = 2
        elif ic.get("typ") == "half_h":
            dk = ic.get("dedup_key", "half_h:" + ic["phash"])
            code = existing_mapping.get(dk, "") or existing_mapping.get(ic["phash"], "")
            group = 0
        else:
            code = existing_mapping.get(ic["phash"], "")
            group = 0
        code = code.replace(".png", "").strip()
        if code:
            return (group, 0, code.lower())
        return (group, 1, "")

    icons = sorted(icons, key=_code_sort_key)

    rows_html = ""
    for i, ic in enumerate(icons):
        if ic.get("typ") == "bar":
            # Balken-Key ist Hex-Farbe in Grossbuchstaben
            existing_code = bar_map.get(ic["phash"].upper(), "")
        elif ic.get("typ") == "half_h":
            # half_h: eigener Key "half_h:phash", Fallback auf normalen phash
            dedup_k = ic.get("dedup_key", "half_h:" + ic["phash"])
            own_code      = existing_mapping.get(dedup_k, "").replace(".png", "")
            fallback_code = existing_mapping.get(ic["phash"], "").replace(".png", "")
            existing_code = own_code or fallback_code
            # Wenn nur Fallback gefunden: automatisch unter eigenem Key eintragen
            # damit der User es nicht neu eingeben muss und es beim Speichern erhalten bleibt
            if not own_code and fallback_code:
                existing_mapping[dedup_k] = fallback_code
        else:
            existing_code = existing_mapping.get(ic["phash"], "").replace(".png", "")
        is_new = not existing_code
        typ       = ic.get("typ", "icon")
        # Ignorierte Icons/Balken: gelten als bekannt (nicht NEU), bleiben aber bearbeitbar
        is_ignored = (
            (typ == "bar" and ic["phash"].upper() in ignoriert_b_set)
            or (typ != "bar" and _ic_key(ic) in ignoriert_set)
        )
        if is_new and is_ignored:
            is_new = False
        has_code_attr = '1' if existing_code else '0'
        color_css     = "rgb({},{},{})".format(*ic["color"])
        typ_labels = {"icon": "", "half": "½ Dienst", "half_h": "½ Dienst (H)", "bar": ""}
        typ_styles = {"icon": "", "half": "background:#e8f0fe;color:#1a73e8",
                      "half_h": "background:#fce8f3;color:#c2185b", "bar": ""}
        typ_label  = typ_labels.get(typ, "")
        typ_style  = typ_styles.get(typ, "")

        # Farbbalken: als farbiges Rechteck mit Hex-Code anzeigen
        if typ == "bar":
            r, g, b = ic.get("bar_rgb") or ic["color"] or (200, 200, 200)
            hex_col = f"#{r:02X}{g:02X}{b:02X}"
            # Hellen/dunklen Textfarbe je nach Helligkeit
            brightness = 0.299*r + 0.587*g + 0.114*b
            txt_col = "#000" if brightness > 128 else "#fff"
            img_tag = (f'<div style="width:48px;height:16px;background:{hex_col};'
                       f'border:1px solid #aaa;border-radius:3px;margin:16px auto 2px;'
                       f'display:flex;align-items:center;justify-content:center;'
                       f'font-size:9px;font-weight:bold;color:{txt_col};font-family:monospace">'
                       f'{hex_col}</div>')
            typ_label = f'Farbbalken {hex_col}'
            typ_style = f'background:{hex_col}33;color:#333;border:1px solid {hex_col}'
        else:
            if ic.get("src"):
                img_tag = (f'<img src="{ic["src"]}" width="48" height="48" '
                           f'style="image-rendering:pixelated" loading="lazy">')
            elif ic.get("b64"):
                img_tag = (f'<img src="data:image/png;base64,{ic["b64"]}" width="48" height="48" '
                           f'style="image-rendering:pixelated">')
            else:
                img_tag = '<span style="color:#ccc;font-size:1.5rem">?</span>'
        new_badge     = '<span class="new-badge">NEU</span>' if is_new else ''
        src_pdf = ic.get("source_pdf", "")
        if src_pdf:
            src_display = (src_pdf[:16] + '…') if len(src_pdf) > 16 else src_pdf
            source_badge = f'<div class="source-pdf" title="{src_pdf}">{src_display}</div>'
        else:
            source_badge = ''

        # Kontext-Bild (Ausschnitt des PDFs um das Icon)
        ctx_b64 = ic.get("ctx_b64", "")
        ctx_src = ic.get("ctx_src", "")
        has_ctx = bool(ctx_b64 or ctx_src)
        if has_ctx:
            if ctx_b64:
                ctx_img_tag = f'<img src="data:image/png;base64,{ctx_b64}" style="max-width:100%;height:auto">'
            else:
                ctx_img_tag = f'<img src="{ctx_src}" style="max-width:100%;height:auto" loading="lazy">'
            ctx_btn = f'<button class="ctx-btn" id="ctx-btn-{i}" onclick="toggleCtx({i})" title="Im PDF anzeigen">🔍</button>'
            ctx_row = f'<tr id="ctx-{i}" class="ctx-row" style="display:none"><td colspan="8" class="ctx-cell">{ctx_img_tag}</td></tr>'
        else:
            ctx_btn = ''
            ctx_row = ''

        _row_class = 'row-ignored' if is_ignored else ('row-new' if is_new else 'row-known')
        _inp_disabled = 'disabled' if is_ignored else ''
        _ic_hash_attr = ('half_h:' + ic['phash']) if ic.get('typ') == 'half_h' else ic['phash']
        rows_html += f"""
        <tr id="row-{i}" class="{_row_class}" data-has-code="{has_code_attr}" data-is-new="{'1' if is_new else '0'}" data-ignored="{'1' if is_ignored else '0'}">
            <td class="num">{i+1}{new_badge}{ctx_btn}</td>
            <td class="icon-cell">
                <div class="icon-wrap" style="background:{color_css}22; border:2px solid {color_css}">
                    {img_tag}
                    {'<div style="font-size:0.65rem;margin-top:2px;padding:1px 4px;border-radius:3px;' + typ_style + '">' + typ_label + '</div>' if typ_label else ''}
                </div>
                {source_badge}
            </td>
            <td class="color-cell">
                <span class="color-dot" style="background:{color_css}"></span>
                <code>RGB{ic['color']}</code>
            </td>
            <td class="code-cell">
                <div class="input-wrap">
                  <input
                    type="text"
                    id="input-{i}"
                    data-hash="{_ic_hash_attr}"
                    data-typ="{typ}"
                    data-isnew="{'1' if is_new else '0'}"
                    value="{existing_code}"
                    placeholder="Tippen oder ▾ wählen..."
                    class="code-input {'filled' if existing_code else ''}"
                    oninput="filterDropdown(this, {i})"
                    onchange="markChanged(this)"
                    onkeydown="handleKey(event, {i})"
                    onfocus="showDropdown({i})"
                    autocomplete="off"
                    {_inp_disabled}
                  />
                  <div class="dropdown" id="dd-{i}"></div>
                </div>
                {'<span class="hint-new">⚠️ Nicht in config.py?</span>' if is_new else ''}
            </td>
            <td class="status-cell" id="status-{i}">
                {'✅' if existing_code else '⬜'}
            </td>
            <td class="ignore-cell">
                <label title="Beim Import ignorieren (kein Dienst, keine Warnung)">
                  <input type="checkbox" class="ignore-cb"
                    id="ignore-{i}"
                    data-hash="{_ic_hash_attr}"
                    data-typ="{typ}"
                    {'checked' if is_ignored else ''}
                    onchange="toggleIgnore(this, {i})"/>
                  Ign.
                </label>
            </td>
            <td class="ganztag-cell">
                {'<label title="Als ganztägiges Kalender-Event exportieren"><input type="checkbox" id="ganztag-' + str(i) + '" class="ganztag-input" data-code="' + existing_code + '" ' + ("checked" if existing_code and existing_code in ganztaegig_set else "") + ' onchange="updateGanztag(this)"/> Ganztag</label>' if typ not in ("bar",) else ''}
            </td>
            <td class="ics-zusatz-cell">
                {(
                    '<label title="Als ICS-Eintrag exportieren">'
                    '<input type="checkbox" id="icszusatz-' + str(i) + '" class="ics-zusatz-input" '
                    'data-code="' + existing_code + '" '
                    + ("checked" if existing_code and existing_code in ics_zusatz_set else "")
                    + ' onchange="updateIcsZusatz(this)"/> ICS</label>'
                    '<div id="ics-zeit-' + str(i) + '" class="ics-zeit-wrap" style="'
                    + ("" if existing_code and existing_code in ics_zusatz_set else "display:none")
                    + '">'
                    '<label style="font-size:0.75em;display:block;margin-top:2px">'
                    '<input type="checkbox" id="icsganztag-' + str(i) + '" class="ics-ganztag-input" '
                    + ("checked" if not (existing_code and ics_zeiten_map.get(existing_code, {}).get("ganztaegig") == 0) else "")
                    + ' onchange="updateIcsZeit(' + str(i) + ')"/> Ganztag</label>'
                    '<div id="ics-zeiten-' + str(i) + '" style="'
                    + ("display:none" if not (existing_code and ics_zeiten_map.get(existing_code, {}).get("ganztaegig") == 0) else "")
                    + '">'
                    '<input type="time" id="ics-von-' + str(i) + '" class="ics-von" value="'
                    + str(ics_zeiten_map.get(existing_code, {}).get("von", "08:00"))
                    + '" style="width:70px;font-size:0.75em" onchange="updateIcsZeit(' + str(i) + ')"/>'
                    '–<input type="time" id="ics-bis-' + str(i) + '" class="ics-bis" value="'
                    + str(ics_zeiten_map.get(existing_code, {}).get("bis", "17:00"))
                    + '" style="width:70px;font-size:0.75em" onchange="updateIcsZeit(' + str(i) + ')"/>'
                    '</div></div>'
                ) if typ == "bar" else '<span style="color:#aaa;font-size:0.8em">—</span>'}
            </td>
        </tr>
        {ctx_row}"""

    return f"""<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<link rel="icon" type="image/png" href="/static/BrowserIcon.png">
<title>Dienstplan Icon-Mapping</title>
<style>
  * {{ box-sizing: border-box; }}
  body {{
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #f5f7fa; margin: 0; padding: 20px; color: #1a1a2e;
  }}
  h1 {{ font-size: 1.4rem; margin-bottom: 4px; }}
  .subtitle {{ color: #666; margin-bottom: 16px; font-size: 0.9rem; }}
  .toolbar {{
    display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
    background: white; padding: 12px 16px; border-radius: 10px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08); margin-bottom: 16px;
  }}
  .btn {{
    padding: 7px 16px; border-radius: 7px; border: none;
    cursor: pointer; font-size: 0.88rem; font-weight: 600; transition: all 0.15s;
    font-family: inherit;
  }}
  .btn-save     {{ background: #2ecc71; color: white; }}
  .btn-save:hover {{ background: #27ae60; }}
  .btn-secondary  {{ background: #ecf0f1; color: #555; }}
  .btn-secondary:hover {{ background: #dfe6e9; }}
  .counter {{ margin-left: auto; color: #666; font-size: 0.85rem; white-space: nowrap; }}

  /* Config-Hilfe Banner */
  .config-help {{
    background: #fff8e1; border: 1px solid #ffe082; border-radius: 8px;
    padding: 12px 16px; margin-bottom: 16px; font-size: 0.88rem; display: none;
  }}
  .config-help.visible {{ display: block; }}
  .config-help code {{ background: #f5f5f5; padding: 2px 6px; border-radius: 4px; }}
  .config-help pre {{
    background: #f5f5f5; padding: 10px; border-radius: 6px; font-size: 0.82rem;
    overflow-x: auto; margin: 8px 0 0;
  }}

  table {{
    width: 100%; border-collapse: collapse; background: white;
    border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  }}
  th {{
    background: #2c3e50; color: white; padding: 10px 14px;
    text-align: left; font-size: 0.85rem; font-weight: 600;
  }}
  tr:nth-child(even) {{ background: #f8f9fa; }}
  tr:hover {{ background: #eaf4ff; }}
  tr.row-new {{ background: #fff5f5 !important; }}
  tr.row-new:hover {{ background: #ffe8e8 !important; }}
  td {{ padding: 7px 14px; vertical-align: middle; }}
  .filter-chips {{ display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }}
  .filter-label {{ font-size: 0.82rem; color: #666; margin-right: 2px; }}
  .chip {{ padding: 5px 14px; border-radius: 20px; border: 1.5px solid #ddd; background: white; cursor: pointer; font-size: 0.82rem; font-weight: 500; color: #555; transition: all 0.15s; font-family: inherit; white-space: nowrap; }}
  .chip:hover {{ border-color: #3498db; color: #3498db; }}
  .chip.active {{ background: #3498db; border-color: #3498db; color: white; }}
  .chip-count {{ display: inline-block; padding: 0 5px; font-size: 0.75rem; margin-left: 3px; border-radius: 10px; }}
  .chip.active .chip-count {{ background: rgba(255,255,255,0.25); }}
  .chip:not(.active) .chip-count {{ background: #eee; color: #666; }}
  .source-pdf {{ font-size: 0.6rem; color: #999; text-align: center; max-width: 72px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px; }}
  .ctx-btn {{ display: inline-block; margin-left: 4px; cursor: pointer; background: none; border: none; font-size: 0.72rem; padding: 1px 3px; border-radius: 3px; opacity: 0.45; transition: opacity 0.15s; vertical-align: middle; font-family: inherit; }}
  .ctx-btn:hover {{ opacity: 1; background: #eaf4ff; }}
  .ctx-btn.open {{ opacity: 1; background: #dbeafe; }}
  .ctx-row {{ background: #f0f7ff !important; }}
  .ctx-row:hover {{ background: #e8f3ff !important; }}
  .ctx-cell {{ padding: 8px 14px 10px; }}
  .ctx-cell img {{ max-width: 100%; height: auto; border-radius: 4px; border: 1px solid #cce0ff; display: block; image-rendering: auto; }}
  .num {{ color: #aaa; font-size: 0.8rem; width: 56px; position: relative; }}
  .new-badge {{
    display: inline-block; background: #e74c3c; color: white;
    font-size: 0.65rem; font-weight: 700; padding: 1px 5px;
    border-radius: 4px; margin-left: 4px; vertical-align: middle;
  }}
  .icon-cell {{ width: 80px; text-align: center; }}
  .icon-wrap {{
    display: inline-flex; flex-direction: column; align-items: center; justify-content: center;
    width: 64px; min-height: 64px; border-radius: 8px; padding: 4px;
  }}
  .color-cell {{ width: 170px; white-space: nowrap; }}
  .color-cell code {{ background: transparent; color: #444; font-size: 0.78rem; padding: 0; }}
  .color-dot {{
    display: inline-block; width: 14px; height: 14px; border-radius: 50%;
    margin-right: 6px; vertical-align: middle; border: 1px solid rgba(0,0,0,.15);
  }}
  .code-input {{
    width: 210px; padding: 7px 10px; border-radius: 6px;
    border: 1.5px solid #ddd; font-size: 0.95rem; transition: border-color 0.15s;
  }}
  .code-input:focus {{ border-color: #3498db; outline: none; box-shadow: 0 0 0 3px rgba(52,152,219,.15); }}
  .code-input.filled  {{ border-color: #2ecc71; background: #f0fff4; }}
  .code-input.changed {{ border-color: #e67e22; background: #fff9f0; }}
  .hint-new {{
    display: block; font-size: 0.75rem; color: #e67e22; margin-top: 3px;
  }}
  .input-wrap {{ position: relative; display: inline-block; }}
  .dropdown {{
    display: none; position: absolute; top: 100%; left: 0; z-index: 1000;
    background: white; border: 1.5px solid #3498db; border-radius: 6px;
    max-height: 220px; overflow-y: auto; min-width: 230px;
    box-shadow: 0 4px 16px rgba(0,0,0,.15);
  }}
  .dropdown.open {{ display: block; }}
  .dd-item {{
    padding: 7px 12px; cursor: pointer; font-size: 0.9rem;
    border-bottom: 1px solid #f0f0f0;
  }}
  .dd-item:last-child {{ border-bottom: none; }}
  .dd-item:hover, .dd-item.active {{ background: #eaf4ff; }}
  .dd-item.no-match {{ color: #aaa; font-style: italic; cursor: default; }}
  .status-cell {{ width: 36px; font-size: 1.1rem; text-align: center; }}
  .ganztag-cell, .ics-zusatz-cell, .ignore-cell {{ text-align: center; white-space: nowrap; padding: 0 8px; }}
  .ganztag-input, .ics-zusatz-input {{ cursor: pointer; accent-color: #6c47ff; width: 14px; height: 14px; vertical-align: middle; }}
  .ganztag-cell label, .ics-zusatz-cell label {{ cursor: pointer; font-size: 0.78rem; color: #555; user-select: none; }}
  .ignore-cb {{ cursor: pointer; accent-color: #e74c3c; width: 14px; height: 14px; vertical-align: middle; }}
  .ignore-cell label {{ cursor: pointer; font-size: 0.78rem; color: #c0392b; user-select: none; }}
  tr.row-ignored {{ background: #f5f5f5 !important; opacity: 0.55; }}
  tr.row-ignored:hover {{ background: #ebebeb !important; }}
  tr.row-ignored .code-input {{ background: #f0f0f0; color: #aaa; }}
  .toast {{
    position: fixed; bottom: 24px; right: 24px; background: #2ecc71; color: white;
    padding: 12px 20px; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,.15);
    font-weight: 600; display: none; z-index: 999;
  }}
</style>
</head>
<body>

<h1>🗓 Dienstplan Icon-Mapping{title_suffix}</h1>
<p class="subtitle">
  Trage für jedes Icon den Dienst-Code ein und klicke <strong>Speichern</strong>.<br>
  Rot markierte Icons sind <strong>neu</strong> und noch nicht gemappt.
  Ist der Code nicht im Dropdown → zuerst in <code>config.py</code> eintragen.
</p>

<div class="toolbar">
  <button class="btn btn-save" onclick="saveMapping()">💾 Speichern</button>
  <div class="filter-chips">
    <span class="filter-label">Zeige:</span>
    <button class="chip {'active' if n_new == 0 else ''}" id="filter-alle" onclick="setFilter('alle')">Alle <span class="chip-count">{n_total}</span></button>
    <button class="chip {'active' if n_new > 0 else ''}" id="filter-neu" onclick="setFilter('neu')">Neu <span class="chip-count">{n_new}</span></button>
    <button class="chip" id="filter-undef" onclick="setFilter('undef')">Nicht definiert <span class="chip-count">{n_undef}</span></button>
  </div>
  <button class="btn btn-secondary" onclick="showConfigHelp()">⚙️ Config</button>
  <button class="btn btn-secondary" onclick="clearAll()">🗑</button>
  <span class="counter"><span id="filled-count">0</span> / {n_total} gemappt</span>
</div>

<!-- Config-Hilfe -->
<div class="config-help" id="config-help">
  <strong>⚙️ Neuen Dienst-Code anlegen</strong><br>
  Wenn ein Icon einen Dienst zeigt der noch nicht bekannt ist,
  zuerst in den <strong>Einstellungen → Dienstzeiten</strong> einen neuen Eintrag anlegen, dann hier den Code vergeben:
  <pre>"NeuerCode.png": "Dienstcode"</pre>
  Beispiel für einen neuen Tagesdienst auf OrtNr4:
  <pre>"T6.png":  ("06:00", "18:15", "OrtNr4", "T6"),</pre>
  Beispiel für einen ganztägigen Abwesenheits-Eintrag:
  <pre>"Militaer.png": ("", "", "Militär", "Militär"),</pre>
  Nach dem Eintrag in config.py: Seite neu laden → Code erscheint im Dropdown.
</div>

<table>
  <thead>
    <tr>
      <th>#</th><th>Icon (64×64)</th><th>Farbe</th><th>Code / Name</th><th></th><th>Ign.</th><th>Ganztag</th><th>ICS</th>
    </tr>
  </thead>
  <tbody>
{rows_html}
  </tbody>
</table>

<div class="toast" id="toast">✅ JSON gespeichert!</div>

<script>
const ALL_CODES = {json_codes};
const existingMapping    = {existing_mapping_json};
const existingBarMapping = {existing_bar_mapping_json};
let ganztaegigSet  = new Set({ganztaegig_json});
let icsZusatzSet   = new Set({ics_zusatz_json});
let icsZeitenMap   = {ics_zeiten_json};  // code -> {{ganztaegig, von, bis}}
let ignoriert      = new Set({ignoriert_json});      // phash → bewusst leer gelassen
let ignoriertBalken = new Set({ignoriert_b_json});   // hex → bewusst leer gelassen
let currentFilter = '{'neu' if n_new > 0 else 'alle'}';

function updateGanztag(cb) {{
  const code = cb.closest('tr').querySelector('.code-input').value.trim().replace(/[.]png$/i,'');
  if (cb.checked && code) {{
    ganztaegigSet.add(code);
  }} else {{
    ganztaegigSet.delete(code);
    ganztaegigSet.delete(cb.dataset.code || '');
  }}
}}

function updateIcsZusatz(cb) {{
  const code = cb.closest('tr').querySelector('.code-input').value.trim().replace(/[.]png$/i,'');
  const idx  = cb.id.replace('icszusatz-','');
  const zeitWrap = document.getElementById('ics-zeit-' + idx);
  if (cb.checked && code) {{
    icsZusatzSet.add(code);
    if (zeitWrap) zeitWrap.style.display = '';
  }} else {{
    icsZusatzSet.delete(code);
    icsZusatzSet.delete(cb.dataset.code || '');
    if (zeitWrap) zeitWrap.style.display = 'none';
  }}
}}

function updateIcsZeit(idx) {{
  const code     = document.getElementById('input-' + idx)?.value.trim().replace(/[.]png$/i,'');
  if (!code) return;
  const ganztag  = document.getElementById('icsganztag-' + idx)?.checked;
  const zeitDiv  = document.getElementById('ics-zeiten-' + idx);
  if (zeitDiv) zeitDiv.style.display = ganztag ? 'none' : '';
  const von = document.getElementById('ics-von-' + idx)?.value || '08:00';
  const bis = document.getElementById('ics-bis-' + idx)?.value || '17:00';
  icsZeitenMap[code] = {{ ganztaegig: ganztag ? 1 : 0, von: von, bis: bis }};
}}

// When code input changes, update ganztag checkbox's data-code
function syncGanztagCode(inp) {{
  const row = inp.closest('tr');
  const cb  = row ? row.querySelector('.ganztag-input') : null;
  if (cb) {{
    const oldCode = cb.dataset.code || '';
    const newCode = inp.value.trim().replace(/[.]png$/i,'');
    // Move ganztaegig flag to new code
    if (oldCode && ganztaegigSet.has(oldCode) && newCode) {{
      ganztaegigSet.delete(oldCode);
      ganztaegigSet.add(newCode);
      cb.checked = true;
    }}
    cb.dataset.code = newCode;
  }}
}}

// ── Dropdown ──────────────────────────────────────────────────────
function buildDropdown(idx, filter) {{
  const dd = document.getElementById('dd-' + idx);
  if (!dd) return;
  const q = (filter || '').toLowerCase();
  const matches = q ? ALL_CODES.filter(c => c.toLowerCase().includes(q)) : ALL_CODES;
  dd.innerHTML = matches.length
    ? matches.map(c => `<div class="dd-item" onmousedown="selectCode(${{idx}},'${{c}}')">
        ${{c}}</div>`).join('')
    : '<div class="dd-item no-match">Kein Treffer — neuen Code tippen</div>';
  dd.classList.add('open');
}}

function showDropdown(idx) {{ buildDropdown(idx, document.getElementById('input-'+idx).value); }}

function filterDropdown(inp, idx) {{
  buildDropdown(idx, inp.value);
  markChanged(inp);
}}

function selectCode(idx, code) {{
  const inp = document.getElementById('input-' + idx);
  inp.value = code;
  document.getElementById('dd-' + idx).classList.remove('open');
  markChanged(inp);
  // Nächste sichtbare Zeile fokussieren
  let next = idx + 1;
  while (next < 9999) {{
    const el = document.getElementById('input-' + next);
    if (!el) break;
    if (el.closest('tr').style.display !== 'none') {{ el.focus(); break; }}
    next++;
  }}
}}

// Dropdown schliessen wenn ausserhalb geklickt
document.addEventListener('click', e => {{
  if (!e.target.closest('.input-wrap')) {{
    document.querySelectorAll('.dropdown.open').forEach(d => d.classList.remove('open'));
  }}
}});

// ── Filter / Anzeige ──────────────────────────────────────────────
function setFilter(mode) {{
  currentFilter = mode;
  ['alle','neu','undef'].forEach(function(m) {{
    const el = document.getElementById('filter-' + m);
    if (el) el.classList.toggle('active', m === mode);
  }});
  applyFilter();
}}

function applyFilter() {{
  document.querySelectorAll('tbody tr[id^="row-"]').forEach(function(tr) {{
    const hasCode = tr.dataset.hasCode === '1';
    const isNew   = tr.dataset.isNew   === '1';
    let show = true;
    if (currentFilter === 'neu')   show = isNew;
    if (currentFilter === 'undef') show = !hasCode;
    tr.style.display = show ? '' : 'none';
    // Context-Zeile beim Ausblenden immer einklappen
    const idx = tr.id.replace('row-', '');
    const ctxRow = document.getElementById('ctx-' + idx);
    const ctxBtn = document.getElementById('ctx-btn-' + idx);
    if (!show && ctxRow) {{
      ctxRow.style.display = 'none';
      if (ctxBtn) ctxBtn.classList.remove('open');
    }}
  }});
}}

function toggleCtx(idx) {{
  const ctxRow = document.getElementById('ctx-' + idx);
  const ctxBtn = document.getElementById('ctx-btn-' + idx);
  if (!ctxRow) return;
  const wasClosed = ctxRow.style.display === 'none';
  ctxRow.style.display = wasClosed ? 'table-row' : 'none';
  if (ctxBtn) ctxBtn.classList.toggle('open', wasClosed);
}}

function updateCounter() {{
  const filled = [...document.querySelectorAll('.code-input')]
    .filter(i => i.value.trim() && i.value.trim() !== '?').length;
  document.getElementById('filled-count').textContent = filled;
}}

function markChanged(input) {{
  input.classList.remove('filled');
  input.classList.add('changed');
  const idx = input.id.replace('input-', '');
  const tr = input.closest('tr');
  const hasValue = !!input.value.trim();
  document.getElementById('status-' + idx).textContent = hasValue ? '🟡' : '⬜';
  if (tr) {{
    tr.dataset.hasCode = hasValue ? '1' : '0';
    if (input.dataset.isnew === '1' && hasValue) {{
      tr.classList.remove('row-new');
      tr.classList.add('row-known');
      tr.dataset.isNew = '0';
    }}
  }}
  updateCounter();
}}

function handleKey(event, idx) {{
  const dd = document.getElementById('dd-' + idx);
  if (event.key === 'Escape') {{
    dd && dd.classList.remove('open'); return;
  }}
  if (event.key === 'Enter' || event.key === 'Tab') {{
    event.preventDefault();
    dd && dd.classList.remove('open');
    let next = idx + 1;
    while (next < 9999) {{
      const el = document.getElementById('input-' + next);
      if (!el) break;
      if (el.closest('tr').style.display !== 'none') {{ el.focus(); break; }}
      next++;
    }}
  }}
}}

function toggleIgnore(cb, idx) {{
  const inp = document.getElementById('input-' + idx);
  const row = document.getElementById('row-' + idx);
  if (cb.checked) {{
    inp.value = '';
    inp.disabled = true;
    inp.classList.remove('filled', 'changed');
    row.classList.add('row-ignored');
    row.classList.remove('row-new', 'row-known');
    row.dataset.ignored = '1';
    document.getElementById('status-' + idx).textContent = '⬜';
    row.dataset.hasCode = '0';
  }} else {{
    inp.disabled = false;
    row.classList.remove('row-ignored');
    row.dataset.ignored = '0';
    if (inp.dataset.isnew === '1') {{
      row.classList.add('row-new');
    }} else {{
      row.classList.add('row-known');
    }}
  }}
  updateCounter();
}}

function showConfigHelp() {{
  document.getElementById('config-help').classList.toggle('visible');
}}

function clearAll() {{
  if (!confirm('Alle Einträge löschen?')) return;
  document.querySelectorAll('.code-input').forEach(inp => {{ inp.value = ''; markChanged(inp); }});
}}

function saveMapping() {{
  // Icons → mapping (phash → code)
  // Balken → bar_mapping (Hex-Farbe → code)
  const mapping    = Object.assign({{}}, existingMapping);
  const barMapping = Object.assign({{}}, existingBarMapping);

  document.querySelectorAll('.code-input').forEach(inp => {{
    let code    = inp.value.trim();
    const hash  = inp.dataset.hash;
    const isBar = inp.dataset.typ === 'bar';
    const target = isBar ? barMapping : mapping;
    const other  = isBar ? mapping    : barMapping;
    // Balken-Key = Hex uppercase (#7F00FF), Icon/half_h-Key = original (lowercase hex digest)
    const storeKey = isBar ? hash.toUpperCase() : hash;

    if (code && code !== '?') {{
      code = code.replace(/[.]png$/i, '');
      target[storeKey] = code;
      delete other[storeKey];
      delete other[hash];  // auch ohne case-Variante aufräumen
    }} else if (storeKey in target && (!code || code === '?')) {{
      delete target[storeKey];
    }}
    const idx = inp.id.replace('input-', '');
    document.getElementById('status-' + idx).textContent = code && code !== '?' ? '✅' : '⬜';
    inp.classList.remove('changed');
    if (code) inp.classList.add('filled');
  }});

  // Ganztag-Set aus Checkboxen neu aufbauen
  ganztaegigSet = new Set();
  document.querySelectorAll('.ganztag-input:checked').forEach(cb => {{
    const row  = cb.closest('tr');
    const inp  = row ? row.querySelector('.code-input') : null;
    const code = inp ? inp.value.trim().replace(/[.]png$/i,'') : '';
    if (code) ganztaegigSet.add(code);
  }});

  // ICS-Zusatz-Set aus Checkboxen neu aufbauen
  icsZusatzSet = new Set();
  document.querySelectorAll('.ics-zusatz-input:checked').forEach(cb => {{
    const row  = cb.closest('tr');
    const inp  = row ? row.querySelector('.code-input') : null;
    const code = inp ? inp.value.trim().replace(/[.]png$/i,'') : '';
    if (code) icsZusatzSet.add(code);
  }});

  // icsZeitenMap: Zeiten kommen aus icon_fingerprint_map.json (ics_zeiten), nicht aus config.py.
  // Bestehende Einträge aus dem geladenen JSON werden unverändert weitergegeben.

  // Ignoriert-Listen: explizite Checkboxen haben Vorrang, dann leere Felder
  document.querySelectorAll('.ignore-cb').forEach(cb => {{
    const hash     = cb.dataset.hash;
    const isBar    = cb.dataset.typ === 'bar';
    const storeKey = isBar ? hash.toUpperCase() : hash;
    if (cb.checked) {{
      if (isBar) ignoriertBalken.add(storeKey);
      else       ignoriert.add(storeKey);
    }} else {{
      // Nicht explizit ignoriert → Entscheidung der Leer-Feld-Logik überlassen
      if (isBar) ignoriertBalken.delete(storeKey);
      else       ignoriert.delete(storeKey);
    }}
  }});
  // Zusätzlich: leere Felder ohne Code → ebenfalls ignorieren
  document.querySelectorAll('.code-input').forEach(inp => {{
    const code    = inp.value.trim().replace(/[.]png$/i,'');
    const hash    = inp.dataset.hash;
    const isBar   = inp.dataset.typ === 'bar';
    const storeKey = isBar ? hash.toUpperCase() : hash;
    const ignored  = inp.closest('tr')?.dataset.ignored === '1';
    if (ignored) return; // bereits via Checkbox gesetzt
    if (!code || code === '?') {{
      if (isBar) ignoriertBalken.add(storeKey);
      else       ignoriert.add(storeKey);
    }} else {{
      if (isBar) ignoriertBalken.delete(storeKey);
      else       ignoriert.delete(storeKey);
    }}
  }});

  const combined = {{
    mapping:          mapping,
    bar_mapping:      barMapping,
    ganztaegig:       Array.from(ganztaegigSet).sort(),
    ics_zusatz:       Array.from(icsZusatzSet).sort(),
    ics_zeiten:       icsZeitenMap,
    ignoriert:        Array.from(ignoriert).sort(),
    ignoriert_balken: Array.from(ignoriertBalken).sort()
  }};

  const blob = new Blob([JSON.stringify(combined, null, 2)], {{type: 'application/json'}});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'icon_fingerprint_map.json'; a.click();
  URL.revokeObjectURL(url);
  document.getElementById('toast').style.display = 'block';
  setTimeout(() => document.getElementById('toast').style.display = 'none', 3000);
  updateCounter();
}}

applyFilter();
updateCounter();
</script>
</body>
</html>"""


# ══════════════════════════════════════════════════════════════════════════════
# ICON-CACHE (Disk-basiert, skaliert auf beliebig viele PDFs)
# ══════════════════════════════════════════════════════════════════════════════

def _phash_to_cache_stem(phash_key: str) -> str:
    """Macht einen phash/dedup_key zu einem sicheren Dateinamens-Stem (ohne Endung)."""
    if phash_key.startswith("half_h:"):
        return "half_h_" + phash_key[7:]
    if phash_key.startswith("#"):
        return "bar_" + phash_key[1:].upper()
    return phash_key


def save_icon_cache(icons: list[dict], cache_dir: Path) -> int:
    """
    Speichert Icon-Bilder und Metadaten (Farbe, Typ) in cache_dir.
    Bereits vorhandene Dateien werden nicht überschrieben.
    Gibt die Anzahl neu gespeicherter Einträge zurück.
    """
    cache_dir.mkdir(parents=True, exist_ok=True)
    meta_path = cache_dir / "meta.json"
    meta: dict = {}
    if meta_path.exists():
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except Exception:
            meta = {}

    saved = 0
    for ic in icons:
        typ = ic.get("typ", "icon")
        phash_key = ic.get("dedup_key", ic["phash"])
        stem = _phash_to_cache_stem(phash_key)

        # Metadaten immer aktualisieren (auch wenn Bild schon vorhanden)
        if stem not in meta:
            meta[stem] = {
                "color": list(ic["color"]),
                "typ":   typ,
                "hex":   ic.get("hex", ""),
            }
            saved += 1

        # Icon-Bild speichern
        if typ != "bar":
            img_path = cache_dir / (stem + ".png")
            if not img_path.exists() and ic.get("pil"):
                ic["pil"].save(img_path, format="PNG")

    meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")
    return saved


def build_html_from_mapping(mapping_path: Path, cache_dir: Path) -> str:
    """
    Erstellt eine Gesamtübersicht aller bekannten Icons aus dem Mapping-JSON.
    Verwendet gecachte PNG-Bilder (kein PDF-Scan nötig) → instant auch bei 1000 PDFs.
    """
    existing: dict       = {}
    existing_bar: dict   = {}
    ganztaegig_codes     = set()
    ics_zusatz_codes     = set()
    ics_zeiten: dict     = {}
    ignoriert_set        = set()
    ignoriert_b_set      = set()

    if mapping_path.exists():
        raw = json.loads(mapping_path.read_text(encoding="utf-8"))
        if isinstance(raw, dict) and "mapping" in raw:
            existing         = {k: v.replace(".png", "") for k, v in raw.get("mapping", {}).items()}
            existing_bar     = {k: v.replace(".png", "") for k, v in raw.get("bar_mapping", {}).items()}
            ganztaegig_codes = set(raw.get("ganztaegig", []))
            ics_zusatz_codes = set(raw.get("ics_zusatz", []))
            ics_zeiten       = raw.get("ics_zeiten", {})
            ignoriert_set    = set(raw.get("ignoriert", []))
            ignoriert_b_set  = set(raw.get("ignoriert_balken", []))

    # Metadaten (Farbe, Typ) aus Cache laden
    meta: dict = {}
    meta_path = cache_dir / "meta.json"
    if meta_path.exists():
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except Exception:
            meta = {}

    def _meta_color(stem: str):
        m = meta.get(stem, {})
        c = m.get("color", [128, 128, 128])
        return tuple(c) if len(c) == 3 else (128, 128, 128)

    icons: list[dict] = []

    # Icons aus Mapping + Ignoriert-Liste
    all_known = set(existing.keys()) | ignoriert_set
    for phash_key in sorted(all_known):
        stem = _phash_to_cache_stem(phash_key)
        typ  = "half_h" if phash_key.startswith("half_h:") else "icon"
        raw_phash = phash_key[7:] if phash_key.startswith("half_h:") else phash_key
        img_path  = cache_dir / (stem + ".png")
        icons.append({
            "phash":     raw_phash,
            "dedup_key": phash_key,
            "typ":       typ,
            "color":     _meta_color(stem),
            "bar_rgb":   None,
            "b64":       "",
            "src":       f"/api/icon/image/{stem}" if img_path.exists() else "",
            "ctx_src":   "",
            "pil":       None,
        })

    # Gecachte Icons die noch NICHT im Mapping/Ignoriert sind (= neu, noch nie gemappt)
    if cache_dir.exists():
        for img_file in sorted(cache_dir.glob("*.png")):
            stem = img_file.stem
            if stem.startswith("bar_") or stem.endswith("_ctx"):
                continue
            phash_key = ("half_h:" + stem[7:]) if stem.startswith("half_h_") else stem
            if phash_key not in all_known:
                raw_phash = stem[7:] if stem.startswith("half_h_") else stem
                typ = "half_h" if stem.startswith("half_h_") else "icon"
                icons.append({
                    "phash":     raw_phash,
                    "dedup_key": phash_key,
                    "typ":       typ,
                    "color":     _meta_color(stem),
                    "bar_rgb":   None,
                    "b64":       "",
                    "src":       f"/api/icon/image/{stem}",
                    "ctx_src":   "",
                    "pil":       None,
                })

    # Farbbalken aus bar_mapping + ignoriert_balken
    all_bar_keys = set(existing_bar.keys()) | ignoriert_b_set
    for hex_col in sorted(all_bar_keys):
        hx = hex_col.upper().lstrip("#")
        try:
            r, g, b = int(hx[0:2], 16), int(hx[2:4], 16), int(hx[4:6], 16)
        except Exception:
            r, g, b = 128, 128, 128
        icons.append({
            "phash":   hex_col.upper() if hex_col.startswith("#") else f"#{hex_col.upper()}",
            "dedup_key": hex_col.upper() if hex_col.startswith("#") else f"#{hex_col.upper()}",
            "typ":     "bar",
            "color":   (r, g, b),
            "bar_rgb": (r, g, b),
            "hex":     hex_col.upper() if hex_col.startswith("#") else f"#{hex_col.upper()}",
            "b64":     "",
            "src":     "",
            "pil":     None,
        })

    n_total = len(icons)
    log.info("Gesamtübersicht: %d Icons/Balken (aus Mapping + Cache)", n_total)

    return build_html(
        icons, existing, mapping_path, ganztaegig_codes, existing_bar,
        ics_zusatz_codes, ics_zeiten, ignoriert_set, ignoriert_b_set,
        title_suffix=" — Alle bekannten Icons",
    )


# ══════════════════════════════════════════════════════════════════════════════
# HAUPTPROGRAMM
# ══════════════════════════════════════════════════════════════════════════════

def check_neue_icons(pdf_path: Path) -> tuple[int, int]:
    """Prüft ob im PDF wirklich neue (noch nie gesehene) Icons oder Balken vorhanden sind.
    Ignoriert: gemappte UND bewusst leer gelassene Icons (aus ignoriert/ignoriert_balken).
    Gibt (n_neue_icons, n_neue_balken) zurück.
    """
    mapping_path = ICON_MAPPING_DIR / "icon_fingerprint_map.json"
    existing:          dict = {}
    existing_bar:      dict = {}
    ignoriert:         set  = set()
    ignoriert_balken:  set  = set()
    if mapping_path.exists():
        with open(mapping_path) as f:
            raw = json.load(f)
        if isinstance(raw, dict) and "mapping" in raw:
            existing          = raw.get("mapping", {})
            existing_bar      = {k.upper(): v for k, v in raw.get("bar_mapping", {}).items()}
            ignoriert         = set(raw.get("ignoriert", []))
            ignoriert_balken  = set(raw.get("ignoriert_balken", []))
        else:
            existing = raw

    with pdfplumber.open(str(pdf_path)) as pdf:
        all_icons: dict = {}
        all_bars:  dict = {}
        for page in pdf.pages:
            for ic in extract_unique_icons(page):
                key = ic.get("dedup_key", ic["phash"])
                if key not in all_icons:
                    all_icons[key] = ic
            for bar in extract_unique_bars(page):
                if bar["hex"] not in all_bars:
                    all_bars[bar["hex"]] = bar

    # Neu = weder gemappt noch bewusst ignoriert
    # Für half_h: dedup_key = "half_h:phash", für alle anderen = phash
    def _key(ic):
        if ic.get("typ") == "half_h":
            return ic.get("dedup_key", "half_h:" + ic["phash"])
        return ic["phash"]

    n_neue_icons  = sum(1 for ic  in all_icons.values()
                        if _key(ic) not in existing
                        and _key(ic) not in ignoriert)
    n_neue_balken = sum(1 for bar in all_bars.values()
                        if bar["hex"].upper() not in existing_bar
                        and bar["hex"].upper() not in ignoriert_balken)
    return n_neue_icons, n_neue_balken


def main() -> None:
    parser = argparse.ArgumentParser(description="Visueller Icon-Lernmodus")
    parser.add_argument("--pdf",        required=False, help="Pfad zur PDF-Datei")
    parser.add_argument("--html-only",  action="store_true",
                        help="Nur HTML erstellen, Browser nicht öffnen")
    parser.add_argument("--check-only", action="store_true",
                        help="Nur prüfen ob neue Icons vorhanden (kein HTML, Exit-Code 1 = neue vorhanden)")
    parser.add_argument("--all-pdfs",   action="store_true",
                        help="Alle PDFs in PDF_DIR scannen und Gesamtübersicht erstellen")
    args = parser.parse_args()

    if not args.all_pdfs and not args.pdf:
        parser.error("--pdf ist erforderlich (ausser bei --all-pdfs)")

    pdf_path = None
    if not args.all_pdfs:
        pdf_path = Path(args.pdf)
        # Wenn kein absoluter Pfad: erst im PEP_pdf-Ordner suchen, dann relativ
        if not pdf_path.is_absolute() and not pdf_path.exists():
            pdf_path = PDF_DIR / args.pdf
        if not pdf_path.exists():
            log.error("PDF nicht gefunden: %s", pdf_path)
            log.error("Bitte PDF in den Ordner PEP_pdf/ legen.")
            sys.exit(1)

    # --check-only: nur prüfen, kein HTML bauen (benötigt --pdf)
    if args.check_only:
        if not pdf_path:
            log.error("--check-only benötigt --pdf")
            sys.exit(1)
        n_icons, n_balken = check_neue_icons(pdf_path)
        if n_icons or n_balken:
            print(f"NEUE_ICONS:{n_icons}:{n_balken}")
            sys.exit(1)   # Exit 1 = neue Icons vorhanden
        else:
            print("KEINE_NEUEN_ICONS")
            sys.exit(0)

    ICON_MAPPING_DIR.mkdir(parents=True, exist_ok=True)
    html_path    = ICON_MAPPING_DIR / "icon_uebersicht.html"
    mapping_path = ICON_MAPPING_DIR / "icon_fingerprint_map.json"

    # Bestehendes Mapping laden (neues Format: {mapping: {...}, ganztaegig: [...]})
    existing: dict = {}
    existing_bar: dict = {}
    ganztaegig_codes: set = set()
    ics_zusatz_codes: set = set()
    ics_zeiten: dict = {}
    ignoriert_set:   set = set()
    ignoriert_b_set: set = set()
    if mapping_path.exists():
        with open(mapping_path) as f:
            raw_data = json.load(f)
        if isinstance(raw_data, dict) and "mapping" in raw_data:
            existing         = {k: v.replace(".png", "") for k, v in raw_data["mapping"].items()}
            existing_bar     = {k: v.replace(".png", "") for k, v in raw_data.get("bar_mapping", {}).items()}
            ganztaegig_codes = set(raw_data.get("ganztaegig", []))
            ics_zusatz_codes = set(raw_data.get("ics_zusatz", []))
            ics_zeiten       = raw_data.get("ics_zeiten", {})
            ignoriert_set    = set(raw_data.get("ignoriert", []))
            ignoriert_b_set  = set(raw_data.get("ignoriert_balken", []))
        else:
            existing = {k: v.replace(".png", "") for k, v in raw_data.items()}
        log.info("Bestehendes Mapping geladen: %d Icons, %d Balken, %d ganztägig, %d ICS-Zusatz, %d ignoriert",
                 len(existing), len(existing_bar), len(ganztaegig_codes), len(ics_zusatz_codes),
                 len(ignoriert_set) + len(ignoriert_b_set))
        # Backward-compat: aHash-Aliases für noch nicht migrierte MD5-Keys aufbauen
        existing = build_ahash_bridge(existing, ICON_MAPPING_DIR / "icon_cache")

    # --all-pdfs: Gesamtübersicht aus Cache (kein PDF-Scan)
    if args.all_pdfs:
        html_path_alle = ICON_MAPPING_DIR / "icon_uebersicht_alle.html"
        html = build_html_from_mapping(mapping_path, ICON_MAPPING_DIR / "icon_cache")
        html_path_alle.write_text(html, encoding="utf-8")
        log.info("✅ Gesamtübersicht erstellt: %s", html_path_alle)
        if not args.html_only:
            webbrowser.open(html_path_alle.as_uri())
        return

    log.info("📄 Lese Icons aus PDF: %s", pdf_path.name)

    with pdfplumber.open(str(pdf_path)) as pdf:
        # Icons (aus page.images) + Balken (aus page.rects) über alle Seiten sammeln
        all_icons: dict[str, dict] = {}   # phash    → icon-info
        all_bars:  dict[str, dict] = {}   # hex-farbe → bar-info
        for page_num, page in enumerate(pdf.pages, 1):
            page_icons = extract_unique_icons(page)
            page_bars  = extract_unique_bars(page)
            new_icons = new_bars = 0
            new_in_page: list = []
            for ic in page_icons:
                key = ic.get("dedup_key", ic["phash"])
                if key not in all_icons:
                    all_icons[key] = ic; new_icons += 1
                    new_in_page.append(ic)
            for bar in page_bars:
                if bar["hex"] not in all_bars:
                    all_bars[bar["hex"]] = bar; new_bars += 1
            if new_icons or new_bars:
                log.info("  Seite %d: %d neue Icons, %d neue Balken", page_num, new_icons, new_bars)
            # Kontext-Crops für neue Icons dieser Seite (Seite wird nur einmal gerendert)
            if new_in_page:
                for ic in new_in_page:
                    ic["ctx_pil"] = _crop_context(page, ic)
        icons = list(all_icons.values())
        bars  = list(all_bars.values())

    log.info("  %d unique Icon-Typen, %d unique Balkenfarben (alle Seiten)", len(icons), len(bars))

    already_mapped      = sum(1 for ic  in icons if ic["phash"]  in existing)
    already_mapped_bars = sum(1 for bar in bars  if bar["hex"].upper() in existing_bar)
    log.info("  Icons gemappt: %d/%d  |  Balken gemappt: %d/%d",
             already_mapped, len(icons), already_mapped_bars, len(bars))

    # Icons im Cache speichern (Bilder + Metadaten) — baut den Icon-Cache schrittweise auf
    n_cached = save_icon_cache(icons + bars, ICON_MAPPING_DIR / "icon_cache")
    if n_cached:
        log.info("  %d neue Einträge im Icon-Cache gespeichert", n_cached)

    # Kontext-Crops als base64 für das HTML vorbereiten
    for ic in icons:
        if ic.get("ctx_pil"):
            ic["ctx_b64"] = pil_to_base64(ic["ctx_pil"])

    # HTML erstellen: Icons + Balken kombiniert (Balken kommen ans Ende)
    html = build_html(icons + bars, existing, mapping_path, ganztaegig_codes, existing_bar,
                      ics_zusatz_codes, ics_zeiten, ignoriert_set, ignoriert_b_set)
    html_path.write_text(html, encoding="utf-8")
    log.info("✅ HTML erstellt: %s", html_path)

    # Hinweis auf Workflow
    print(f"""
┌─────────────────────────────────────────────────────────┐
│  ICON-LERNMODUS                                         │
├─────────────────────────────────────────────────────────┤
│  1. HTML öffnet sich im Browser                         │
│  2. Für jedes Icon den Dienst-Code eintragen            │
│     (Autocomplete zeigt bekannte Codes)                 │
│  3. 'Speichern → JSON' klicken                          │
│  4. JSON wird automatisch in icon_mapping/ gespeichert  │
│                                                         │
│  Datei: {str(html_path):<47} │
└─────────────────────────────────────────────────────────┘
""")

    if not args.html_only:
        webbrowser.open(html_path.as_uri())
        log.info("🌐 Browser geöffnet")


if __name__ == "__main__":
    main()
