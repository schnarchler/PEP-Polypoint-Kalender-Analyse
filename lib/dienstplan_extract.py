"""
dienstplan_extract.py – PDF-Extraktion (Kernmodul, kein OCR)
=============================================================

Das POLYPOINT/PEP PDF enthält alle Icons als eingebettete 24×24-Pixel-Bitmaps.
Jedes Icon ist eindeutig durch Farbe + Pixel-Fingerprint identifizierbar.
Kein pdf2image, kein Tesseract, kein OpenCV nötig.

Dieses Modul wird von db_import.py als Bibliothek verwendet.
Für den normalen Workflow: python db_import.py --pdf ... --month ... --year ...
"""

import logging
import sys
from pathlib import Path
from typing import Optional

import pdfplumber

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import ICON_MAPPING_DIR
from pdf_utils import (
    pixel_fingerprint, _get_indexed_palette, _dominant_color_rgb,
    extract_icon_palette, is_decoration, detect_icon_size, detect_std_cell_size,
    build_ahash_bridge,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)



def build_icon_registry(page) -> dict[str, tuple]:
    """
    { pdf_name → (color_rgb, pixel_hash) } — alle Dienst-Icons inkl. geteilte.
    Akzeptiert alle Bilder die KLEINER ODER GLEICH der Standard-Grösse sind.
    Filtert nur einfarbige Dekorations-Grafiken heraus.
    """
    icon_w, icon_h = detect_icon_size(page)

    registry = {}
    for img in page.images:
        w, h = img.get("srcsize", (0, 0))
        if w <= 0 or h <= 0:
            continue
        # Muss kleiner-gleich Standard-Grösse sein (±2px Toleranz für Rundung)
        if w > icon_w + 2 or h > icon_h + 2:
            continue
        # Mindestgrösse: mind. 25% der Standard-Grösse (filtert winzige Artefakte)
        if w < icon_w * 0.25 or h < icon_h * 0.25:
            continue
        if is_decoration(img):
            continue
        name = img["name"]
        if name not in registry:
            registry[name] = (extract_icon_palette(img), pixel_fingerprint(img))
    return registry


# ══════════════════════════════════════════════════════════════════════════════
# PDF-STRUKTUR LESEN
# ══════════════════════════════════════════════════════════════════════════════

def tabellen_kopf(page) -> dict:
    """
    Spalten der MA-Tabelle aus der Kopfzeile «<Planname>  BG  S  <Monat Jahr>»:
    { 'name_x', 'bg_x', 's_x' }

    Hochformat: Namen ab x≈19, BG bei x≈136. Querformat (Seite mit /Rotate 90,
    alles ≈1.24× grösser): Namen ab x≈96, BG bei x≈211. s_x None = Kopfzeile
    nicht gefunden → feste Hochformat-Werte, ohne Prüfung der S-Spalte.
    """
    words = page.extract_words()
    for bg in words:
        if bg["text"] != "BG" or bg["top"] > 120:
            continue
        zeile = [w for w in words if abs(w["top"] - bg["top"]) < 2]
        s     = next((w for w in zeile if w["text"] == "S" and 0 < w["x0"] - bg["x0"] < 40), None)
        links = [w["x0"] for w in zeile if w["x0"] < bg["x0"]]
        if s and links:
            return {"name_x": min(links), "bg_x": bg["x0"], "s_x": s["x0"]}
    log.warning("Tabellenkopf (BG/S) nicht gefunden – feste Spalten angenommen")
    return {"name_x": 19.0, "bg_x": 135.0, "s_x": None}


def extract_day_columns(page) -> dict[int, float]:
    """
    Tagesnummer (1-31) -> x-Position im PDF.
    Unterstuetzt beide Formate:
      - Anonymes PDF: einstellig "1"-"31", y ca. 58-75
      - Echtes PDF:   zweistellig "01"-"31", y ca. 65-78
    Tagesspalten beginnen rechts der S-Spalte (Hoch- und Querformat).
    """
    from collections import Counter
    words = page.extract_words()
    day_columns: dict[int, float] = {}
    kopf  = tabellen_kopf(page)
    min_x = kopf["s_x"] + 5 if kopf["s_x"] is not None else 155

    candidates = []
    for w in words:
        text = w["text"].strip()
        if text.isdigit():
            val = int(text)
            if 1 <= val <= 31 and w["x0"] > min_x:
                candidates.append((val, w["x0"], w["top"]))

    if not candidates:
        log.warning("Keine Tagesspalten-Kandidaten gefunden")
        return day_columns

    # y-Zeile mit den meisten Treffern = Tagesnummern-Zeile
    y_counts = Counter(round(top) for _, _, top in candidates)
    best_y   = y_counts.most_common(1)[0][0]

    for val, x0, top in candidates:
        if abs(round(top) - best_y) <= 2:
            day_columns[val] = x0

    log.info("Tagesspalten gefunden: %d (y=%.1f)", len(day_columns), float(best_y))
    return day_columns


def extract_ma_rows(page) -> dict[str, float]:
    """
    { 'Nachname Vorname' -> y_position } fuer alle MA-Zeilen.

    Pensum wird separat in ma_rows_with_pensum() erfasst.
    Seiten mit weniger als 5 MA-Zeilen werden als Legenden-/Statistik-Seiten
    erkannt und es wird ein leeres Dict zurueckgegeben.
    """
    return {name: y for name, (y, _) in _extract_ma_rows_internal(page).items()}


def extract_ma_pensum(page) -> dict[str, int]:
    """{ 'Nachname Vorname' -> pensum_pct } fuer alle MA-Zeilen."""
    return {name: pensum for name, (_, pensum) in _extract_ma_rows_internal(page).items()}


def _extract_ma_rows_internal(page) -> dict[str, tuple[float, int]]:
    """
    { 'Nachname Vorname' -> (y_position, pensum_pct) }
    Pensum steht in der BG-Spalte rechts vom Namen (numerisch, 10–100).

    MA-Zeilen haben einen Eintrag in der S-Spalte (M/S) oder Dienst-Icons (es gibt
    MA ohne BG/S) – Gruppen-Überschriften, «Total:»,
    «Gesamtbestand:» und die Fusszeile haben beides nicht.
    """
    import re
    HEADER_TEXTS = {"BG", "S", "M", "P", "RD"}
    BRACKET_RE   = re.compile(r"\(\w+\)")

    words = page.extract_words()
    kopf  = tabellen_kopf(page)
    name_x, bg_x, s_x = kopf["name_x"], kopf["bg_x"], kopf["s_x"]

    from collections import defaultdict
    rows_by_y: dict[float, list] = defaultdict(list)
    for w in words:
        if abs(w["x0"] - name_x) < 10 and w["top"] > 75 and not w["text"].isdigit():
            rows_by_y[round(w["top"], 1)].append(w)

    ma_rows: dict[str, tuple[float, int]] = {}
    for y, _ in sorted(rows_by_y.items()):
        if s_x is not None and not any(
                abs(w["top"] - y) < 3 and abs(w["x0"] - s_x) < 3 and w["text"].isalpha()
                for w in words) and not any(
                -8 < img["top"] - y < 0 and img["x0"] > s_x for img in page.images):
            continue
        name_words = sorted(
            [w for w in words
             if abs(w["top"] - y) < 3
             and name_x - 10 < w["x0"] < bg_x - 10
             and w["text"] not in HEADER_TEXTS
             and not BRACKET_RE.match(w["text"])
             and not (w["text"].isdigit() and int(w["text"]) >= 30)
             and not (len(w["text"]) == 1 and w["text"].isupper() and w["x0"] > name_x + 60)
            ],
            key=lambda w: w["x0"]
        )
        if not name_words:
            continue
        name = " ".join(w["text"] for w in name_words)

        # Pensum: numerischer Wert in der BG-Spalte (10..100)
        pensum = 100
        pensum_candidates = [
            w for w in words
            if abs(w["top"] - y) < 3
            and w["x0"] >= bg_x - 10
            and w["text"].isdigit()
            and 10 <= int(w["text"]) <= 100
        ]
        if pensum_candidates:
            pensum = int(min(pensum_candidates, key=lambda w: w["x0"])["text"])

        ma_rows[name] = (y, pensum)

    if len(ma_rows) < 5:
        log.info("Seite hat nur %d MA-Zeilen → wird als Legenden-Seite uebersprungen",
                 len(ma_rows))
        return {}

    log.info("%d MA-Zeilen gefunden", len(ma_rows))
    for name, (y, p) in list(ma_rows.items())[:3]:
        log.debug("  MA-Zeile: y=%.1f pensum=%d%% -> %r", y, p, name)
    return ma_rows


def classify_image(img: dict, std_cell_w: float, std_cell_h: float = 13.4) -> str:
    """
    Klassifiziert ein PDF-Bild anhand seiner gerenderten Grösse:
      'icon'    → normaler Dienst (volle Breite, volle Hoehe)
      'half'    → vertikal geteilt (halbe Breite, links|rechts nebeneinander)
      'half_h'  → horizontal geteilt (volle Breite, halbe Hoehe — oben|unten gestapelt)
      'skip'    → Farbbalken aus page.images (werden ignoriert, echte kommen aus page.rects)

    Wichtig: Bilder mit halber Hoehe (h<=8.5) und voller Breite sind horizontal
    geteilte Dienst-Icons (je zwei gestapelt = ein Dienst-Paar).
    Echte Farbbalken kommen ausschliesslich aus page.rects, nicht aus page.images.
    """
    w_pdf = img["x1"] - img["x0"]
    h_pdf = img["bottom"] - img["top"]
    if w_pdf < std_cell_w * 0.75:
        # Halbe Breite: vertikal geteilt
        if h_pdf <= std_cell_h * 0.63:
            return "skip"   # zu klein fuer sinnvolle Klassifizierung (Hochformat: 8.5)
        return "half"
    # Volle Breite: nach Hoehe unterscheiden
    if h_pdf < std_cell_h * 0.90:
        return "half_h"   # auch h<=8.5 mit voller Breite = horizontaler Split
    return "icon"


def _rect_is_gray(color) -> bool:
    """True wenn Rect-Farbe grau/weiss ist (= leere Zelle, kein Balken)."""
    if color is None:
        return True
    if isinstance(color, (int, float)):
        return True   # Graustufen-Wert
    r, g, b = color[:3]
    return max(abs(r - g), abs(r - b), abs(g - b)) < 0.05


def _rect_color_hex(color) -> str:
    """PDF-Farbe (0..1 float) → Hex-String '#RRGGBB'."""
    if color is None:
        return "#808080"
    if isinstance(color, (int, float)):
        v = int(color * 255)
        return f"#{v:02X}{v:02X}{v:02X}"
    r, g, b = (int(x * 255) for x in color[:3])
    return f"#{r:02X}{g:02X}{b:02X}"


def assign_icons_to_days(page, ma_rows: dict, day_columns: dict) -> dict[str, dict[int, dict]]:
    """
    { 'MA-Name' -> { Tag: { 'icons': [...], 'halfs': [...], 'bars': [...] } } }

    icons: normale Dienst-Icons (volle Breite)
    halfs: halbe Dienst-Icons (geteilte Zelle, je zwei pro Tag moeglich)
    bars:  Farbbalken als Hex-Strings (z.B. '#7F00FF') — aus page.rects, nicht images!
           Balken liegen ~6px UNTERHALB der MA-Zeile (y-offset positiv).
           Es sind bis zu 3 Balken pro Zelle moeglich.
    """
    if not day_columns or not ma_rows:
        return {ma: {} for ma in ma_rows}

    # Zellenbreite: Median der Spaltenabstaende
    sorted_xs = sorted(day_columns.values())
    if len(sorted_xs) >= 2:
        gaps   = [sorted_xs[i+1] - sorted_xs[i] for i in range(len(sorted_xs)-1)]
        cell_w = sorted(gaps)[len(gaps)//2]
    else:
        cell_w = 13.4

    # Zeilentoleranz fuer Icons: 45% des Median-Zeilenabstands
    sorted_ys = sorted(ma_rows.values())
    if len(sorted_ys) >= 2:
        row_gaps      = [sorted_ys[i+1] - sorted_ys[i] for i in range(len(sorted_ys)-1)]
        median_row_h  = sorted(row_gaps)[len(row_gaps)//2]
        row_tolerance = median_row_h * 0.45
    else:
        median_row_h  = 14.3
        row_tolerance = 6.0

    # Icon-Hoehe: haeufigste Bildgroesse (Hochformat 13.4, Querformat 16.6) – nicht der
    # Zeilenabstand, der waechst mit Zusatztexten unter den Icons (Querformat: bis 18)
    std_icon_h = detect_std_cell_size(page)[1]

    def x_to_day(x: float) -> Optional[int]:
        best_day, best_dist = None, float("inf")
        for day, col_x in day_columns.items():
            dist = abs(x - col_x)
            if dist < best_dist and dist < cell_w * 0.8:
                best_dist, best_day = dist, day
        return best_day

    result: dict[str, dict[int, dict]] = {ma: {} for ma in ma_rows}

    # ── Icons aus page.images ─────────────────────────────────────────────────
    # half_h (horizontal geteilt): volle Breite aber halbe Hoehe — kommen paarweise
    # uebereinander vor. Wir sammeln sie zuerst und gruppieren sie dann.
    half_h_by_col: dict = {}  # (ma_name, day) -> [(top, img_name), ...]

    for img in page.images:
        if not img.get("srcsize") or img["srcsize"][0] <= 0:
            continue
        img_type = classify_image(img, cell_w, std_icon_h)
        if img_type in ("bar", "skip"):
            continue  # Farbbalken kommen aus page.rects, nicht page.images

        # Naechste Zeile – Zeilen sind unterschiedlich hoch (mit/ohne Zusatztext)
        ma_name, ma_y = min(ma_rows.items(), key=lambda r: abs(img["top"] - r[1]))
        if abs(img["top"] - ma_y) < row_tolerance:
            day = x_to_day(img["x0"])
            if day is not None:
                if day not in result[ma_name]:
                    result[ma_name][day] = {"icons": [], "halfs": [], "bars": [], "halfs_h": []}
                elif "halfs_h" not in result[ma_name][day]:
                    result[ma_name][day]["halfs_h"] = []
                cell = result[ma_name][day]
                if img_type == "half":
                    cell["halfs"].append(img["name"])
                elif img_type == "half_h":
                    # Nach y-Position sortiert einfuegen (oben zuerst)
                    cell["halfs_h"].append((img["top"], img["name"]))
                else:
                    cell["icons"].append(img["name"])

    # half_h sortieren (oben = erster Dienst, unten = zweiter Dienst)
    for ma_name, day_map in result.items():
        for day, cell in day_map.items():
            if cell.get("halfs_h"):
                cell["halfs_h"].sort(key=lambda x: x[0])   # nach top-y

    # ── Farbbalken aus page.rects ─────────────────────────────────────────────
    # Balken sind flache Rechtecke (h <= 6px) mit bunter Fuellung.
    # Sie liegen UNTERHALB der MA-Zeile: ma_y < bar.top < ma_y + median_row_h * 0.7
    bar_y_min =  1.0   # mindestens 1px unter der Icon-Oberkante
    bar_y_max  = median_row_h * 0.70  # max. 70% der Zeilenhoehe = noch in der gleichen Zeile

    for rect in page.rects:
        h = rect.get("height", 0)
        if not (1.0 <= h <= 6.0):
            continue
        fill = rect.get("non_stroking_color")
        if _rect_is_gray(fill):
            continue

        hex_col = _rect_color_hex(fill)

        for ma_name, ma_y in ma_rows.items():
            offset = rect["top"] - ma_y
            if bar_y_min <= offset <= bar_y_max:
                day = x_to_day(rect["x0"])
                if day is not None:
                    if day not in result[ma_name]:
                        result[ma_name][day] = {"icons": [], "halfs": [], "bars": []}
                    bars = result[ma_name][day]["bars"]
                    if hex_col not in bars:
                        bars.append(hex_col)
                break

    return result


# ══════════════════════════════════════════════════════════════════════════════
# FINGERPRINT-MAPPING
# ══════════════════════════════════════════════════════════════════════════════

def build_fingerprint_to_code_map(icon_registry: dict) -> tuple[dict[str, str], set]:
    """Lädt gespeichertes Fingerprint→Dienst-Code Mapping aus calc/.
    Gibt (fingerprint_map, ignoriert_set) zurück.
    """
    mapping_file = ICON_MAPPING_DIR / "icon_fingerprint_map.json"
    if mapping_file.exists():
        import json
        with open(mapping_file) as f:
            raw = json.load(f)
        # Neues Format: {mapping: {...}, ganztaegig: [...]}
        # Altes Format: direkt {hash: code}
        if isinstance(raw, dict) and "mapping" in raw:
            mapping_data = raw["mapping"]
        else:
            mapping_data = raw
        saved = {k: v.replace(".png", "") if isinstance(v, str) else v
                 for k, v in mapping_data.items()}
        ignoriert_set = set(raw.get("ignoriert", [])) if isinstance(raw, dict) else set()
        # Backward-compat: aHash-Aliases für noch nicht migrierte MD5-Keys aufbauen
        saved = build_ahash_bridge(saved, ICON_MAPPING_DIR / "icon_cache")
        log.info("Fingerprint-Mapping geladen: %d Einträge, %d ignoriert", len(saved), len(ignoriert_set))
        return saved, ignoriert_set
    log.warning(
        "Kein Mapping gefunden (%s). Zuerst --learn ausführen.", mapping_file
    )
    return {}, set()


def resolve_icon_to_dienst(icon_pdf_name: str, icon_registry: dict, fingerprint_map: dict,
                           img_type: str = "") -> str:
    """Icon-PDF-Name → Dienst-Code (z.B. 'BD'), oder '' wenn unbekannt.
    Fuer half_h: zuerst 'half_h:<phash>' suchen, dann Fallback auf <phash>.
    """
    if icon_pdf_name not in icon_registry:
        return ""
    _, phash = icon_registry[icon_pdf_name]
    if img_type == "half_h":
        code = fingerprint_map.get(f"half_h:{phash}", "")
        if code:
            return code
    return fingerprint_map.get(phash, "")


def learn_icon_mapping(page, output_path: Path) -> None:
    """
    Interaktiver Lernmodus: Zeigt jeden unique Icon-Typ und fragt nach dem Dienst-Code.
    Speichert das Mapping als JSON für spätere Nutzung.
    """
    import json
    icon_registry = build_icon_registry(page)

    unique_by_hash: dict[str, dict] = {}
    for img in page.images:
        phash = pixel_fingerprint(img)
        if phash not in unique_by_hash:
            unique_by_hash[phash] = {
                "pdf_name": img["name"],
                "color": extract_icon_palette(img),
                "x": img["x0"],
                "y": img["top"],
            }

    # Lade bestehendes Mapping falls vorhanden
    existing: dict = {}
    if output_path.exists():
        with open(output_path) as f:
            existing = json.load(f)

    print(f"\n{'='*60}")
    print("ICON-MAPPING LERNMODUS")
    print(f"{'='*60}")
    print(f"Unique Icon-Typen: {len(unique_by_hash)}")
    print("Dienst-Code eingeben (z.B. 'BD', 'T1', 'Ferien')")
    print("Enter = überspringen | 'q' = beenden & speichern")
    print(f"{'='*60}\n")

    mapping = dict(existing)
    for i, (phash, info) in enumerate(unique_by_hash.items(), 1):
        already = existing.get(phash, "")
        hint    = f"  [aktuell: {already}]" if already else ""
        print(
            f"[{i:3d}/{len(unique_by_hash)}] "
            f"PDF: {info['pdf_name']:5s} | "
            f"Farbe: RGB{info['color']} | "
            f"x={info['x']:.0f}, y={info['y']:.0f}{hint}"
        )
        code = input("  Code: ").strip()
        if code.lower() == "q":
            break
        if code:
            code = code.replace(".png", "")   # kein .png mehr nötig
            mapping[phash] = code
            print(f"  ✓ → {code}")
        else:
            print("  – übersprungen")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(mapping, f, indent=2)
    print(f"\n✅ Mapping gespeichert: {output_path} ({len(mapping)} Einträge)")


