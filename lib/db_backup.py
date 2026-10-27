"""
db_backup.py – Datenbank-Backup
================================
Erstellt ein zeitgestempeltes Backup der SQLite-Datenbank.
Verwendet SQLites eingebautes Online-Backup-API (sicher auch während laufendem Betrieb).
Backups älter als 1 Jahr werden automatisch gelöscht.

Aufruf:
  python db_backup.py                        # Backup erstellen
  python db_backup.py --list                 # Alle vorhandenen Backups anzeigen
  python db_backup.py --restore              # Neuestes Backup wiederherstellen
  python db_backup.py --restore backup/...  # Bestimmtes Backup wiederherstellen
  python db_backup.py --verify               # Integrität aller Backups prüfen
"""

import argparse
import logging
import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import BASE_DIR, DB_PATH

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

SCRIPT_DIR          = Path(__file__).parent.parent
BACKUP_DIR          = BASE_DIR / "backup"
BACKUP_PREFIX       = "dienstplan_backup_"
ICON_MAPPING_PREFIX = "icon_mapping_backup_"
CONFIG_PREFIX       = "config_backup_"
ICON_MAPPING_SRC    = SCRIPT_DIR / "icon_mapping" / "icon_fingerprint_map.json"
CONFIG_SRC          = SCRIPT_DIR / "config.py"


# ══════════════════════════════════════════════════════════════════════════════
# HILFSFUNKTIONEN
# ══════════════════════════════════════════════════════════════════════════════

def get_backups() -> list[Path]:
    """Gibt alle vorhandenen Backups sortiert nach Datum (neueste zuerst) zurück."""
    if not BACKUP_DIR.exists():
        return []
    return sorted(
        BACKUP_DIR.glob(f"{BACKUP_PREFIX}*.db"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )


def db_size_str(path: Path) -> str:
    size = path.stat().st_size
    if size < 1024:
        return f"{size} B"
    elif size < 1024 ** 2:
        return f"{size / 1024:.1f} KB"
    else:
        return f"{size / 1024 ** 2:.1f} MB"


def integrity_ok(path: Path) -> bool:
    """Prüft ob eine DB-Datei integer ist."""
    try:
        conn = sqlite3.connect(str(path))
        result = conn.execute("PRAGMA integrity_check;").fetchone()
        conn.close()
        return result and result[0] == "ok"
    except Exception:
        return False


# ══════════════════════════════════════════════════════════════════════════════
# BACKUP ERSTELLEN
# ══════════════════════════════════════════════════════════════════════════════

def create_backup(db_path: Path = DB_PATH) -> Path:
    """Erstellt ein Backup via SQLite Online-Backup-API (sicher bei laufender DB).
    Ältere Backups werden gelöscht, sobald die konfigurierte Anzahl überschritten wird.
    """
    if not db_path.exists():
        log.error("Datenbank nicht gefunden: %s", db_path)
        sys.exit(1)

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    backup_path = BACKUP_DIR / f"{BACKUP_PREFIX}{timestamp}.db"

    # SQLite Online-Backup: konsistent, auch bei gleichzeitigem Schreibzugriff
    src  = sqlite3.connect(str(db_path))
    dst  = sqlite3.connect(str(backup_path))
    src.backup(dst)
    dst.close()
    src.close()

    size = db_size_str(backup_path)
    log.info("✅ Backup erstellt: %s  (%s)", backup_path.name, size)

    # Integrität des neuen Backups prüfen
    if integrity_ok(backup_path):
        log.info("   Integritäts-Check: OK")
    else:
        log.error("   ⚠️  Integritäts-Check FEHLGESCHLAGEN — Backup möglicherweise defekt!")

    # Icon-Mapping mitbackupen
    if ICON_MAPPING_SRC.exists():
        mapping_backup = BACKUP_DIR / f"{ICON_MAPPING_PREFIX}{timestamp}.json"
        shutil.copy2(str(ICON_MAPPING_SRC), str(mapping_backup))
        log.info("   Icon-Mapping gesichert: %s", mapping_backup.name)

    # config.py mitbackupen
    if CONFIG_SRC.exists():
        config_backup = BACKUP_DIR / f"{CONFIG_PREFIX}{timestamp}.py"
        shutil.copy2(str(CONFIG_SRC), str(config_backup))
        log.info("   Konfiguration gesichert: %s", config_backup.name)

    # Alte Backups aufräumen: nur die neuesten N behalten
    try:
        from settings import load as _load_settings
        max_count = int(_load_settings().get("backup_anzahl") or 30)
    except Exception:
        max_count = 30
    max_count = max(1, max_count)

    deleted = 0
    for glob_pat, label in (
        (f"{BACKUP_PREFIX}*.db",           "DB"),
        (f"{ICON_MAPPING_PREFIX}*.json",   "Icon-Mapping"),
        (f"{CONFIG_PREFIX}*.py",           "Config"),
    ):
        files = sorted(BACKUP_DIR.glob(glob_pat), key=lambda p: p.stat().st_mtime, reverse=True)
        for old in files[max_count:]:
            old.unlink()
            log.info("   🗑️  Altes %s-Backup gelöscht: %s", label, old.name)
            deleted += 1
    remaining = len(get_backups())
    if deleted:
        log.info("   %d DB-Backup(s) behalten, %d Datei(en) gelöscht (max. %d)", remaining, deleted, max_count)
    else:
        log.info("   %d Backup(s) vorhanden (max. %d)", remaining, max_count)

    return backup_path


# ══════════════════════════════════════════════════════════════════════════════
# BACKUP AUFLISTEN
# ══════════════════════════════════════════════════════════════════════════════

def list_backups() -> None:
    backups = get_backups()
    if not backups:
        print("  Keine Backups vorhanden.")
        print(f"  Backup-Ordner: {BACKUP_DIR}")
        return

    print(f"\n{'='*65}")
    print(f"  VORHANDENE BACKUPS  –  {BACKUP_DIR}")
    print(f"{'='*65}")
    for i, b in enumerate(backups):
        mtime    = datetime.fromtimestamp(b.stat().st_mtime).strftime("%d.%m.%Y %H:%M:%S")
        size     = db_size_str(b)
        marker   = "  ← neuestes" if i == 0 else ""
        print(f"  {mtime}  {size:>8}  {b.name}{marker}")
    print(f"{'─'*65}")
    print(f"  Total: {len(backups)} Backup(s)\n")


# ══════════════════════════════════════════════════════════════════════════════
# WIEDERHERSTELLEN
# ══════════════════════════════════════════════════════════════════════════════

def restore_backup(backup_path: Path | None = None, db_path: Path = DB_PATH) -> None:
    """Stellt ein Backup wieder her. Sichert die aktuelle DB vorher automatisch."""
    if backup_path is None:
        backups = get_backups()
        if not backups:
            log.error("Keine Backups vorhanden unter: %s", BACKUP_DIR)
            sys.exit(1)
        backup_path = backups[0]
        log.info("Neuestes Backup ausgewählt: %s", backup_path.name)

    if not backup_path.exists():
        log.error("Backup nicht gefunden: %s", backup_path)
        sys.exit(1)

    # Integrität des Backups prüfen bevor wir etwas überschreiben
    if not integrity_ok(backup_path):
        log.error("⚠️  Backup besteht Integritäts-Check nicht — Abbruch.")
        sys.exit(1)

    # Aktuelle DB zuerst sichern
    if db_path.exists():
        safety = db_path.with_suffix(
            f".vor_restore_{datetime.now().strftime('%Y-%m-%d_%H-%M-%S')}.db"
        )
        shutil.copy2(str(db_path), str(safety))
        log.info("Aktuelle DB gesichert als: %s", safety.name)

    # Wiederherstellen via Online-Backup-API
    src = sqlite3.connect(str(backup_path))
    dst = sqlite3.connect(str(db_path))
    src.backup(dst)
    dst.close()
    src.close()

    log.info("✅ Wiederhergestellt: %s → %s", backup_path.name, db_path.name)


# ══════════════════════════════════════════════════════════════════════════════
# INTEGRITÄT PRÜFEN
# ══════════════════════════════════════════════════════════════════════════════

def verify_backups() -> None:
    backups = get_backups()
    if not backups:
        print("  Keine Backups vorhanden.")
        return

    print(f"\n{'='*65}")
    print("  INTEGRITÄTS-CHECK ALLER BACKUPS")
    print(f"{'='*65}")
    ok_count = 0
    for b in backups:
        status = "✅ OK" if integrity_ok(b) else "❌ DEFEKT"
        if "OK" in status:
            ok_count += 1
        print(f"  {status}  {b.name}")
    print(f"{'─'*65}")
    print(f"  {ok_count}/{len(backups)} Backups integer\n")


# ══════════════════════════════════════════════════════════════════════════════
# HAUPTPROGRAMM
# ══════════════════════════════════════════════════════════════════════════════

def main() -> None:
    parser = argparse.ArgumentParser(description="Datenbank-Backup")
    parser.add_argument("--db",      default=str(DB_PATH), help="Pfad zur DB")
    parser.add_argument("--list",    action="store_true", help="Vorhandene Backups anzeigen")
    parser.add_argument("--restore", nargs="?", const="latest", metavar="BACKUP_PFAD",
                        help="Backup wiederherstellen (ohne Pfad = neuestes)")
    parser.add_argument("--verify",  action="store_true", help="Integrität aller Backups prüfen")
    args = parser.parse_args()

    db_path = Path(args.db)

    if args.list:
        list_backups()
    elif args.restore is not None:
        backup_path = None if args.restore == "latest" else Path(args.restore)
        restore_backup(backup_path, db_path)
    elif args.verify:
        verify_backups()
    else:
        backup_path = create_backup(db_path)
        if backup_path:
            from db_setup import log_aktivitaet
            log_aktivitaet("backup", "Datenbank-Backup", backup_path.name)


if __name__ == "__main__":
    main()
