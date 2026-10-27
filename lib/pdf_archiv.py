"""
pdf_archiv.py – Archivierung alter Dienstplan-PDFs

Verschiebt vor dem Speichern einer neuen PDF alle bestehenden Pläne desselben
Monats (inkl. gleichnamiger Datei) nach pdf_archiv/ mit Zeitstempel-Präfix.
"""
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from config import BASE_DIR, PDF_DIR

PDF_ARCHIV_DIR = BASE_DIR / "pdf_archiv"


def _parse_monat_jahr(name: str):
    from config import MONATE_DE
    m = re.search(r"-\s+(\S+)\s+(\d{4})\.pdf$", name)
    if not m:
        return "", 0
    monat_raw, jahr = m.group(1), int(m.group(2))
    for k in MONATE_DE:
        if k.lower() == monat_raw.lower():
            return k, jahr
    return monat_raw, jahr


def archiviere_alte_pdfs(neuer_name: str) -> list[str]:
    """Archiviert bestehende PDFs, die durch `neuer_name` ersetzt werden.

    Betrifft die gleichnamige Datei sowie alle anderen PDFs desselben
    Monats/Jahrs. Gibt die Liste der archivierten Original-Dateinamen zurück.
    """
    if not PDF_DIR.exists():
        return []
    monat, jahr = _parse_monat_jahr(neuer_name)
    ts = datetime.now().strftime("%Y-%m-%dT%H-%M")
    archiviert = []
    for existing in PDF_DIR.glob("*.pdf"):
        if existing.name == neuer_name:
            betroffen = True
        elif monat and jahr:
            em, ej = _parse_monat_jahr(existing.name)
            betroffen = (em == monat and ej == jahr)
        else:
            betroffen = False
        if not betroffen:
            continue
        PDF_ARCHIV_DIR.mkdir(parents=True, exist_ok=True)
        ziel = PDF_ARCHIV_DIR / f"{ts}_{existing.name}"
        # Kollision (mehrere Archivierungen in derselben Minute) vermeiden
        n = 1
        while ziel.exists():
            ziel = PDF_ARCHIV_DIR / f"{ts}-{n}_{existing.name}"
            n += 1
        # shutil.move statt Path.rename: funktioniert auch über Dateisystem-Grenzen
        # (z. B. wenn pdf_archiv auf einem anderen Laufwerk/Mount liegt)
        shutil.move(str(existing), str(ziel))
        archiviert.append(existing.name)
    return archiviert
