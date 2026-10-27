"""
settings.py – Persistente Benutzereinstellungen
Speicherort: ~/.config/dienstplanung/settings.json
(ausserhalb von Proton Drive / Cloud-Sync-Ordnern)
"""

import json
import secrets
from pathlib import Path

SETTINGS_FILE   = Path.home() / ".config" / "dienstplanung" / "settings.json"
SECRET_KEY_FILE = SETTINGS_FILE.parent / "secret_key"

_DEFAULTS: dict = {
    "base_dir":       None,
    # SMTP
    "smtp_host":      None,   # z.B. "smtp.protonmail.ch"
    "smtp_port":      None,   # z.B. 587
    "smtp_user":      None,   # SMTP-Login / Absender-Adresse
    # ICS-Export
    "timezone":       None,   # z.B. "Europe/Zurich"
    # PDF-Import
    "pdf_template":   None,   # z.B. "Plan - {month} {year}.pdf"
    # E-Mail-Inhalt
    "email_absender": None,
    "email_betreff":  None,
    "email_text":     None,
    # Backup
    "backup_anzahl":  30,     # Anzahl Backups die aufbewahrt werden
    # PDF-Synchronisation
    "pdf_sync_ordner":  None,    # Quell-Ordner für automatische PDF-Synchronisation
    "pdf_sync_uhrzeit": "03:00", # Tägliche Sync-Uhrzeit (HH:MM)
    "pdf_sync_aktiv":   False,   # Automatischer Tagessync aktiv
    # Dashboard
    "ort_reihenfolge": None,  # Kommagetrennt, z.B. "Standort A,Standort B" - feste Sortierung der Standort-Karten
    # Darstellung
    "brand_untertitel": None,  # Untertitel neben dem Logo, z.B. "Betrieb · Plan 1". Leer = ausgeblendet
}


def load() -> dict:
    if not SETTINGS_FILE.exists():
        return dict(_DEFAULTS)
    try:
        with open(SETTINGS_FILE, encoding="utf-8") as f:
            return {**_DEFAULTS, **json.load(f)}
    except Exception:
        return dict(_DEFAULTS)


def save(data: dict) -> None:
    SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def effective_base_dir(script_dir: Path) -> Path:
    """Returns the configured data directory, or falls back to script_dir."""
    cfg = load()
    raw = cfg.get("base_dir")
    if raw:
        p = Path(raw)
        if p.exists():
            return p
    return script_dir


def is_first_launch() -> bool:
    return not SETTINGS_FILE.exists()


def get_or_create_secret_key() -> str:
    """Flask secret_key: einmalig zufällig generiert, ausserhalb des Repos persistiert.
    Bewusst getrennt von settings.json, da dieses per /api/settings im Klartext
    an den Browser zurückgegeben wird."""
    try:
        if SECRET_KEY_FILE.exists():
            key = SECRET_KEY_FILE.read_text(encoding="utf-8").strip()
            if key:
                return key
        SECRET_KEY_FILE.parent.mkdir(parents=True, exist_ok=True)
        key = secrets.token_hex(32)
        SECRET_KEY_FILE.write_text(key, encoding="utf-8")
        return key
    except Exception:
        return secrets.token_hex(32)
