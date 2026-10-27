"""
db_migrate_mail_log.py – Migration: Tabelle mail_versand_log hinzufügen
========================================================================
Einmalig ausführen um das Mail-Versand-Tracking zu aktivieren.
Berührt keine bestehenden Tabellen oder Daten.

Aufruf: python db_migrate_mail_log.py
"""
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from config import DB_PATH


def main():
    if not DB_PATH.exists():
        print(f"❌ Datenbank nicht gefunden: {DB_PATH}")
        print("   Zuerst: python db_setup.py")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)

    # Prüfen ob Tabelle bereits existiert
    exists = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='mail_versand_log'"
    ).fetchone()

    if exists:
        print("  — mail_versand_log bereits vorhanden, nichts zu tun.")
        conn.close()
        return

    conn.execute("""
        CREATE TABLE mail_versand_log (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            kuerzel         TEXT    NOT NULL,
            monat           TEXT    NOT NULL,
            jahr            INTEGER NOT NULL,
            empfaenger      TEXT    NOT NULL,
            gesendet_am     DATETIME DEFAULT (datetime('now')),
            ics_hash        TEXT,
            modus           TEXT    DEFAULT 'alle'
        )""")
    conn.execute("""
        CREATE INDEX idx_mail_log_ma_monat
        ON mail_versand_log(kuerzel, monat, jahr)""")
    conn.commit()
    conn.close()
    print("  ✅ Tabelle mail_versand_log erstellt.")
    print("  ✅ Migration abgeschlossen.")


if __name__ == "__main__":
    main()
