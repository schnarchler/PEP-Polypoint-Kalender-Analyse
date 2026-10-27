"""
db_migrate.py – Datenbank-Migration für bestehende Installationen
==================================================================
Fügt neue Spalten/Tabellen hinzu. Sicher auszuführen: prüft ob bereits vorhanden.

Aufruf: python db_migrate.py
"""
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from config import DB_PATH


def column_exists(conn, table: str, column: str) -> bool:
    cols = [row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()]
    return column in cols


def table_exists(conn, table: str) -> bool:
    return bool(conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone())


def main():
    if not DB_PATH.exists():
        print(f"❌ Datenbank nicht gefunden: {DB_PATH}")
        print("   Zuerst: python db_setup.py")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys=OFF")   # während Migration
    changes = 0

    # ── Spalten-Migrationen ───────────────────────────────────────────────────
    col_migrations = [
        ("schichten",        "dienst_code2",  "TEXT"),
        ("schichten",        "bar_code",      "TEXT"),
        ("schichten",        "ics_sequence",  "INTEGER DEFAULT 0"),  # RFC 5545 SEQUENCE für stabile ICS-UIDs
        ("zusatzfunktionen", "ics_export",    "INTEGER DEFAULT 0"),
        ("zusatzfunktionen", "ist_ganztaegig","INTEGER DEFAULT 1"),
        ("zusatzfunktionen", "dienstbeginn",  "TEXT"),
        ("zusatzfunktionen", "dienstende",    "TEXT"),
    ]
    for table, column, definition in col_migrations:
        if not column_exists(conn, table, column):
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
            print(f"  ✅ {table}.{column} hinzugefügt")
            changes += 1
        else:
            print(f"  — {table}.{column} bereits vorhanden")

    # ── Neue Tabelle: zusatzfunktionen ────────────────────────────────────────
    # ── Neue Tabelle: ma_pensum_verlauf ──────────────────────────────────────────
    if not table_exists(conn, "ma_pensum_verlauf"):
        conn.execute("""
            CREATE TABLE ma_pensum_verlauf (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                mitarbeiter_id INTEGER NOT NULL REFERENCES mitarbeiter(id),
                jahr           INTEGER NOT NULL,
                monat          INTEGER NOT NULL,
                pensum_pct     INTEGER NOT NULL,
                import_id      INTEGER REFERENCES import_log(id),
                erfasst_am     DATETIME DEFAULT (datetime('now')),
                UNIQUE(mitarbeiter_id, jahr, monat)
            )""")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_pensum_verlauf_ma ON ma_pensum_verlauf(mitarbeiter_id, jahr, monat)")
        print("  ✅ Tabelle ma_pensum_verlauf erstellt")
        changes += 1
    else:
        print("  — ma_pensum_verlauf bereits vorhanden")

    if not table_exists(conn, "zusatzfunktionen"):
        conn.execute("""
            CREATE TABLE zusatzfunktionen (
                code           TEXT PRIMARY KEY,
                anzeigename    TEXT NOT NULL,
                farbe_hex      TEXT,
                kalender_titel TEXT,
                notizen        TEXT
            )""")
        print("  ✅ Tabelle zusatzfunktionen erstellt")
        changes += 1
    else:
        print("  — zusatzfunktionen bereits vorhanden")

    # ── Neue Tabelle: schicht_zusatz ──────────────────────────────────────────
    if not table_exists(conn, "schicht_zusatz"):
        conn.execute("""
            CREATE TABLE schicht_zusatz (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                schicht_id  INTEGER NOT NULL REFERENCES schichten(id) ON DELETE CASCADE,
                zusatz_code TEXT    NOT NULL REFERENCES zusatzfunktionen(code),
                farbe_hex   TEXT,
                UNIQUE(schicht_id, zusatz_code)
            )""")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_schicht_zusatz_schicht ON schicht_zusatz(schicht_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_schicht_zusatz_code    ON schicht_zusatz(zusatz_code)")
        print("  ✅ Tabelle schicht_zusatz erstellt")
        changes += 1

        # bar_code → schicht_zusatz migrieren (wenn Einträge vorhanden)
        if column_exists(conn, "schichten", "bar_code"):
            bar_rows = conn.execute(
                "SELECT id, bar_code FROM schichten WHERE bar_code IS NOT NULL AND bar_code != ''"
            ).fetchall()
            migrated = 0
            for row in bar_rows:
                schicht_id, bar_code = row
                # Sicherstellen dass bar_code in dienst_typen existiert
                exists = conn.execute(
                    "SELECT 1 FROM dienst_typen WHERE code = ?", (bar_code,)
                ).fetchone()
                if not exists:
                    # Wenn bar_code nicht in dienst_typen: als Zusatzfunktion anlegen
                    zf_exists = conn.execute(
                        "SELECT 1 FROM zusatzfunktionen WHERE code = ?", (bar_code,)
                    ).fetchone()
                    if not zf_exists:
                        conn.execute(
                            "INSERT INTO zusatzfunktionen (code, anzeigename) VALUES (?, ?)",
                            (bar_code, bar_code)
                        )
                    conn.execute(
                        "INSERT OR IGNORE INTO schicht_zusatz (schicht_id, zusatz_code) VALUES (?, ?)",
                        (schicht_id, bar_code)
                    )
                    migrated += 1
            if migrated:
                print(f"  ✅ {migrated} bar_code-Einträge nach schicht_zusatz migriert")
    else:
        print("  — schicht_zusatz bereits vorhanden")

    # ── Neue Tabelle: mail_versand_log ────────────────────────────────────────
    if not table_exists(conn, "mail_versand_log"):
        conn.execute("""
            CREATE TABLE mail_versand_log (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                kuerzel         TEXT    NOT NULL,
                monat           TEXT    NOT NULL,   -- z.B. 'März'
                jahr            INTEGER NOT NULL,
                empfaenger      TEXT    NOT NULL,
                gesendet_am     DATETIME DEFAULT (datetime('now')),
                ics_hash        TEXT,               -- SHA256 des ICS-Inhalts beim Versand
                modus           TEXT    DEFAULT 'alle'  -- 'alle' oder 'aenderungen'
            )""")
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_mail_log_ma_monat
            ON mail_versand_log(kuerzel, monat, jahr)""")
        print("  ✅ Tabelle mail_versand_log erstellt")
        changes += 1
    else:
        print("  — mail_versand_log bereits vorhanden")

    # ── View v_kollegen erneuern ──────────────────────────────────────────────
    conn.execute("DROP VIEW IF EXISTS v_kollegen")
    conn.execute("""
CREATE VIEW v_kollegen AS
SELECT
    s1.id            AS schicht_id,
    s1.datum,
    s1.wochentag,
    s1.ist_wochenende,
    s1.ist_nachtdienst,
    s1.ist_ganztaegig,
    s1.ma_kuerzel,
    s1.ma_name,
    s1.vorname,
    s1.nachname,
    s1.dienst_code,
    s1.anzeigename,
    s1.ort,
    s1.dienstbeginn,
    s1.dienstende,
    s1.kategorie,
    GROUP_CONCAT(
        COALESCE(s2.vorname || \'\' || s2.nachname, s2.ma_kuerzel), \', \'
    ) AS kollegen_namen,
    GROUP_CONCAT(s2.ma_kuerzel, \', \') AS kollegen_kuerzel,
    COUNT(s2.id) AS anzahl_kollegen
FROM v_schichten s1
LEFT JOIN v_schichten s2
    ON  s1.datum       = s2.datum
    AND s1.ort         = s2.ort
    AND s1.id         != s2.id
    AND s2.kategorie   = \'Arbeit\'
WHERE s1.kategorie = \'Arbeit\'
GROUP BY s1.id
""")
    print("  ✅ v_kollegen erneuert")

    # ── View v_schicht_zusatz erneuern ────────────────────────────────────────
    conn.execute("DROP VIEW IF EXISTS v_schicht_zusatz")
    conn.execute("""
CREATE VIEW v_schicht_zusatz AS
SELECT
    sz.id,
    s.datum,
    m.kuerzel  AS ma_kuerzel,
    COALESCE(m.vorname || \' \'|| m.nachname, m.kuerzel) AS ma_name,
    sz.schicht_id,
    sz.zusatz_code,
    zf.anzeigename  AS zusatz_anzeigename,
    COALESCE(zf.kalender_titel, zf.anzeigename) AS kalender_titel,
    COALESCE(sz.farbe_hex, zf.farbe_hex)        AS farbe_hex,
    s.dienst_code,
    s.anzeigename   AS dienst_anzeigename
FROM schicht_zusatz sz
JOIN schichten    s  ON sz.schicht_id = s.id
JOIN mitarbeiter  m  ON s.mitarbeiter_id = m.id
JOIN zusatzfunktionen zf ON sz.zusatz_code = zf.code
""")
    print("  ✅ v_schicht_zusatz erstellt/erneuert")
    changes += 1

    # ── View v_schichten_expanded (neu: ½-Icon = 2 Zeilen) ───────────────────
    conn.execute("DROP VIEW IF EXISTS v_schichten_expanded")
    conn.execute("""
CREATE VIEW v_schichten_expanded AS
SELECT
    s.id,
    s.datum,
    strftime('%Y', s.datum)  AS jahr,
    strftime('%m', s.datum)  AS monat_num,
    strftime('%W', s.datum)  AS kalenderwoche,
    CASE strftime('%w', s.datum)
        WHEN '0' THEN 'So' WHEN '1' THEN 'Mo' WHEN '2' THEN 'Di'
        WHEN '3' THEN 'Mi' WHEN '4' THEN 'Do' WHEN '5' THEN 'Fr'
        WHEN '6' THEN 'Sa'
    END AS wochentag,
    CASE WHEN strftime('%w', s.datum) IN ('0','6') THEN 1 ELSE 0 END AS ist_wochenende,
    m.kuerzel                AS ma_kuerzel,
    m.vorname,
    m.nachname,
    COALESCE(m.vorname || ' ' || m.nachname, m.kuerzel) AS ma_name,
    m.pensum_pct,
    s.dienst_code,
    dt.anzeigename,
    s.dienstbeginn,
    s.dienstende,
    s.ort,
    dt.kategorie,
    dt.ist_nachtdienst,
    dt.ist_ganztaegig,
    CASE
        WHEN s.dienstbeginn IS NOT NULL AND s.dienstbeginn != ''
         AND s.dienstende   IS NOT NULL AND s.dienstende   != ''
        THEN (
            (CAST(substr(s.dienstende,   1,2) AS REAL)*60 + CAST(substr(s.dienstende,   4,2) AS REAL)) -
            (CAST(substr(s.dienstbeginn, 1,2) AS REAL)*60 + CAST(substr(s.dienstbeginn, 4,2) AS REAL)) +
            CASE WHEN substr(s.dienstende,1,2) < substr(s.dienstbeginn,1,2) THEN 1440 ELSE 0 END
        ) / 60.0
        ELSE NULL
    END AS arbeitsstunden
FROM schichten s
JOIN mitarbeiter  m  ON s.mitarbeiter_id = m.id
JOIN dienst_typen dt ON s.dienst_code    = dt.code
UNION ALL
SELECT
    s.id,
    s.datum,
    strftime('%Y', s.datum),
    strftime('%m', s.datum),
    strftime('%W', s.datum),
    CASE strftime('%w', s.datum)
        WHEN '0' THEN 'So' WHEN '1' THEN 'Mo' WHEN '2' THEN 'Di'
        WHEN '3' THEN 'Mi' WHEN '4' THEN 'Do' WHEN '5' THEN 'Fr'
        WHEN '6' THEN 'Sa'
    END,
    CASE WHEN strftime('%w', s.datum) IN ('0','6') THEN 1 ELSE 0 END,
    m.kuerzel,
    m.vorname,
    m.nachname,
    COALESCE(m.vorname || ' ' || m.nachname, m.kuerzel),
    m.pensum_pct,
    s.dienst_code2,
    dt2.anzeigename,
    NULL,
    NULL,
    s.ort,
    dt2.kategorie,
    dt2.ist_nachtdienst,
    dt2.ist_ganztaegig,
    NULL
FROM schichten s
JOIN mitarbeiter  m   ON s.mitarbeiter_id = m.id
JOIN dienst_typen dt2 ON s.dienst_code2   = dt2.code
""")
    print("  ✅ v_schichten_expanded erstellt")
    changes += 1

    # ── View v_statistiken_ma auf v_schichten_expanded umstellen ─────────────
    conn.execute("DROP VIEW IF EXISTS v_statistiken_ma")
    conn.execute("""
CREATE VIEW v_statistiken_ma AS
SELECT
    ma_kuerzel,
    ma_name,
    strftime('%Y-%m', datum)                                                        AS jahr_monat,
    COUNT(*)                                                                        AS total_eintraege,
    COUNT(DISTINCT CASE WHEN kategorie = 'Arbeit' THEN datum END)                  AS arbeitstage,
    SUM(CASE WHEN kategorie = 'Frei'        THEN 1 ELSE 0 END)                     AS freitage,
    SUM(CASE WHEN kategorie = 'Abwesenheit' THEN 1 ELSE 0 END)                     AS abwesenheitstage,
    SUM(CASE WHEN ist_nachtdienst = 1       THEN 1 ELSE 0 END)                     AS nachtdienste,
    SUM(CASE WHEN ist_wochenende = 1 AND kategorie = 'Arbeit' THEN 1 ELSE 0 END)   AS wochenenddienste,
    ROUND(SUM(COALESCE(arbeitsstunden, 0)), 1)                                      AS total_stunden,
    ROUND(AVG(CASE WHEN arbeitsstunden IS NOT NULL THEN arbeitsstunden END), 1)     AS avg_stunden_pro_dienst
FROM v_schichten_expanded
GROUP BY ma_kuerzel, strftime('%Y-%m', datum)
""")
    print("  ✅ v_statistiken_ma erneuert (½-Icon: arbeitstage = COUNT DISTINCT datum)")
    changes += 1

    conn.execute("PRAGMA foreign_keys=ON")
    conn.commit()
    conn.close()
    print(f"\n✅ Migration abgeschlossen ({changes} Änderungen)")


if __name__ == "__main__":
    main()
