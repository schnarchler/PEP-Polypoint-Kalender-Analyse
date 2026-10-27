"""
pdf_utils.py – Gemeinsame PDF-Bild-Utilities
=============================================
Hilfsfunktionen zur Extraktion und Klassifizierung von Icons aus PEP-PDFs.
Werden von dienstplan_extract.py (Import-Pipeline) und icon_learn.py (Mapping-Tool) verwendet.
"""

import hashlib
import logging
from collections import Counter
from typing import Optional

log = logging.getLogger(__name__)


# ── Pixel-Fingerprint ──────────────────────────────────────────────────────────

def pixel_fingerprint(img: dict) -> str:
    """
    Average hash (aHash): Graustufen → 8×8 → Schwellwert → 64-bit Hex.
    Stabil gegen leichte Pixel-Abweichungen, Farb-Shifts und kleine Größenunterschiede
    desselben Icons über verschiedene PDF-Exporte hinweg.
    """
    try:
        from PIL import Image
        raw  = img["stream"].get_data()
        w, h = img["srcsize"]
        bits = img.get("bits", 8)
        cs   = str(img.get("colorspace", ""))

        if bits == 1:
            result = _get_indexed_palette(img)
            fg, bg = result if result else ((0, 0, 0), (255, 255, 255))
            pil = Image.new("RGB", (w, h))
            px  = pil.load()
            bi  = 0
            for y in range(h):
                for x in range(w):
                    byte_i, bit_p = bi // 8, 7 - (bi % 8)
                    px[x, y] = bg if byte_i < len(raw) and (raw[byte_i] >> bit_p) & 1 else fg
                    bi += 1
        elif "DeviceRGB" in cs and len(raw) >= w * h * 3:
            pil = Image.frombytes("RGB", (w, h), bytes(raw[:w * h * 3]))
        else:
            pil = Image.frombytes("L", (w, h), bytes(raw[:w * h])).convert("RGB")

        # aHash: Graustufen → 8×8 → Mittelwert-Schwellwert → 64-bit Hex
        gray  = pil.convert("L")
        small = gray.resize((8, 8), Image.LANCZOS)
        px    = list(small.getdata())
        avg   = sum(px) / 64
        bits_str = "".join("1" if p > avg else "0" for p in px)
        return format(int(bits_str, 2) if bits_str else 0, "016x")
    except Exception:
        try:
            return hashlib.md5(img["stream"].get_data()).hexdigest()[:12]
        except Exception:
            return "unknown"


def build_ahash_bridge(mapping: dict, cache_dir) -> dict:
    """
    Erstellt Alias-Einträge für Icons im Cache die noch mit alten MD5-Fingerprints
    gespeichert sind. Gibt ein erweitertes Mapping zurück (alte + neue Keys).
    Wird beim Laden des Mappings aufgerufen, bis der Nutzer die Hashes migriert.
    """
    from pathlib import Path
    cache_path = Path(cache_dir)
    if not cache_path.exists():
        return mapping

    try:
        from PIL import Image

        def _ahash(img: Image.Image) -> str:
            gray  = img.convert("L").resize((8, 8), Image.LANCZOS)
            px    = list(gray.getdata())
            avg   = sum(px) / 64
            bits  = "".join("1" if p > avg else "0" for p in px)
            return format(int(bits, 2) if bits else 0, "016x")

        extended = dict(mapping)
        for png in cache_path.glob("*.png"):
            stem = png.stem
            if stem.endswith("_ctx") or stem.startswith("bar_"):
                continue
            is_half_h = stem.startswith("half_h_")
            old_key   = ("half_h:" + stem[7:]) if is_half_h else stem
            if old_key not in mapping:
                continue
            try:
                new_hash = _ahash(Image.open(png))
            except Exception:
                continue
            new_key = ("half_h:" + new_hash) if is_half_h else new_hash
            if new_key not in extended:
                extended[new_key] = mapping[old_key]
        return extended
    except Exception:
        return mapping


# ── Farb-Extraktion ────────────────────────────────────────────────────────────

def _get_indexed_palette(img: dict) -> Optional[tuple[tuple, tuple]]:
    """Liest Vordergrund/Hintergrund aus einer 1-bit Indexed-Color-Palette."""
    try:
        from pdfminer.pdftypes import PDFStream
        for entry in img.get("colorspace", []):
            if not isinstance(entry, list):
                continue
            for item in entry:
                if isinstance(item, PDFStream):
                    pal = item.get_data()
                    if len(pal) >= 6:
                        return (pal[0], pal[1], pal[2]), (pal[3], pal[4], pal[5])
    except Exception:
        pass
    return None


def _dominant_color_rgb(raw: bytes, w: int, h: int) -> tuple:
    """
    Dominante Nicht-Hintergrund-Farbe aus einem 8-bit RGB-Pixelstream.
    Hintergrund = häufigste Farbe. Icon-Farbe = zweithäufigste.
    """
    pixels = [(raw[i], raw[i+1], raw[i+2]) for i in range(0, len(raw) - 2, 3)]
    ranked = Counter(pixels).most_common()
    if len(ranked) >= 2:
        return ranked[1][0]
    return ranked[0][0] if ranked else (128, 128, 128)


def extract_icon_palette(img: dict) -> Optional[tuple]:
    """Dominante Icon-Farbe — funktioniert für 1-bit Indexed und 8-bit RGB."""
    bits = img.get("bits", 8)
    try:
        if bits == 1:
            result = _get_indexed_palette(img)
            return result[0] if result else None
        else:
            raw = img["stream"].get_data()
            w, h = img["srcsize"]
            return _dominant_color_rgb(raw, w, h)
    except Exception:
        return None


# ── Dekoration vs. Icon ────────────────────────────────────────────────────────

def is_decoration(img: dict) -> bool:
    """
    True wenn das Bild eine Dekoration ist (Linie, Rahmen, einfarbige Fläche).
    Kriterium: >90% der Pixel haben dieselbe Farbe.
    """
    try:
        raw  = img["stream"].get_data()
        bits = img.get("bits", 8)
        w, h = img["srcsize"]

        if bits == 1:
            return False  # 1-bit Icons sind nie Dekorationen

        cs_str = str(img.get("colorspace", ""))
        if "DeviceRGB" in cs_str:
            pixels = [(raw[i], raw[i+1], raw[i+2]) for i in range(0, len(raw) - 2, 3)]
        else:
            pixels = list(raw[:w * h])

        top_count = Counter(pixels).most_common(1)[0][1]
        return (top_count / (w * h)) > 0.90

    except Exception:
        return False


# ── Grössen-Erkennung ──────────────────────────────────────────────────────────

def detect_icon_size(page) -> tuple[int, int]:
    """
    Ermittelt die Standard-Icon-Grösse: häufigste srcsize aller Bilder.
    Kleinere Icons (geteilte Dienste) werden separat toleriert.
    """
    sizes = Counter(
        img["srcsize"] for img in page.images
        if img.get("srcsize") and img["srcsize"][0] > 0
    )
    if not sizes:
        log.warning("Keine Bilder gefunden — Fallback auf 24×24")
        return 24, 24
    most_common = sizes.most_common(1)[0][0]
    log.info("Icon-Grösse erkannt: %d×%d px", most_common[0], most_common[1])
    return most_common


def detect_std_cell_size(page) -> tuple[float, float]:
    """Standard-Rendergrösse (w×h im PDF) = häufigste Kombination aller Bilder."""
    sizes = Counter(
        (round(img["x1"] - img["x0"], 1), round(img["bottom"] - img["top"], 1))
        for img in page.images
        if img.get("srcsize") and img["srcsize"][0] > 0
    )
    if not sizes:
        return 12.72, 10.08
    return sizes.most_common(1)[0][0]
