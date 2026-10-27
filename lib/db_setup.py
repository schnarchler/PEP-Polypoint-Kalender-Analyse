"""
db_setup.py – Datenbank-Schema erstellen
==========================================
Erstellt alle Tabellen, Views und Indizes für die Dienstplan-DB.

Aufruf:
  python db_setup.py           # erstellt dienstplan.db
  python db_setup.py --reset   # löscht alles und beginnt neu
"""

import argparse
import logging
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import BASE_DIR, DB_PATH

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)


SCHEMA_SQL = """
-- ── Mitarbeiter-Stammdaten ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mitarbeiter (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    kuerzel                 TEXT    NOT NULL UNIQUE,
    vorname                 TEXT,
    nachname                TEXT,
    pensum_pct              INTEGER DEFAULT 100,
    eintrittsdatum          DATE,
    austrittsdatum          DATE,
    aktiv                   INTEGER DEFAULT 1,
    nie_aktivieren          INTEGER DEFAULT 0,
    webcal_token            TEXT,
    notizen                 TEXT,
    zusammengefuehrt_in_id  INTEGER REFERENCES mitarbeiter(id),
    erstellt_am             DATETIME DEFAULT (datetime('now')),
    geaendert_am            DATETIME DEFAULT (datetime('now'))
);

-- ── Dienst-Typen ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dienst_typen (
    code            TEXT    PRIMARY KEY,
    anzeigename     TEXT    NOT NULL,
    dienstbeginn    TEXT,
    dienstende      TEXT,
    ort             TEXT,
    kategorie       TEXT    NOT NULL
        CHECK(kategorie IN ('Arbeit', 'Frei', 'Abwesenheit', 'Sonstiges')),
    ist_nachtdienst INTEGER DEFAULT 0,
    ist_ganztaegig  INTEGER DEFAULT 0,
    notizen         TEXT
);

-- ── Pensum-Verlauf (pro MA und Monat) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ma_pensum_verlauf (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    mitarbeiter_id  INTEGER NOT NULL REFERENCES mitarbeiter(id),
    jahr            INTEGER NOT NULL,
    monat           INTEGER NOT NULL,   -- 1-12
    pensum_pct      INTEGER NOT NULL,
    import_id       INTEGER REFERENCES import_log(id),
    erfasst_am      DATETIME DEFAULT (datetime('now')),
    UNIQUE(mitarbeiter_id, jahr, monat)
);
CREATE INDEX IF NOT EXISTS idx_pensum_verlauf_ma ON ma_pensum_verlauf(mitarbeiter_id, jahr, monat);

-- ── Import-Log ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS import_log (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    pdf_dateiname    TEXT    NOT NULL,
    monat            TEXT    NOT NULL,
    jahr             INTEGER NOT NULL,
    importiert_am    DATETIME DEFAULT (datetime('now')),
    anzahl_eintraege INTEGER DEFAULT 0,
    status           TEXT    DEFAULT 'OK'
);

-- ── Schichten (Kerntabelle) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schichten (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    mitarbeiter_id  INTEGER NOT NULL REFERENCES mitarbeiter(id),
    dienst_code     TEXT    NOT NULL REFERENCES dienst_typen(code),
    dienst_code2    TEXT    REFERENCES dienst_typen(code), -- 2. Dienst bei geteiltem Tag
    bar_code        TEXT    REFERENCES dienst_typen(code), -- Farbbalken / Zusatzaufgabe
    datum           DATE    NOT NULL,
    import_id       INTEGER REFERENCES import_log(id),
    dienstbeginn    TEXT,
    dienstende      TEXT,
    ort             TEXT,
    anzeigename     TEXT,
    ics_sequence    INTEGER DEFAULT 0,  -- Hochzählen bei jeder Änderung (RFC 5545 SEQUENCE)
    erstellt_am     DATETIME DEFAULT (datetime('now')),
    UNIQUE(mitarbeiter_id, datum)
);

CREATE INDEX IF NOT EXISTS idx_schichten_datum        ON schichten(datum);
CREATE INDEX IF NOT EXISTS idx_schichten_ma           ON schichten(mitarbeiter_id);
CREATE INDEX IF NOT EXISTS idx_schichten_dienst       ON schichten(dienst_code);
CREATE INDEX IF NOT EXISTS idx_schichten_datum_dienst ON schichten(datum, dienst_code);
CREATE INDEX IF NOT EXISTS idx_schichten_datum_ort    ON schichten(datum, ort);


-- ── Pensum-Historie (Änderungen nachvollziehen) ─────────────────────────────
CREATE TABLE IF NOT EXISTS ma_pensum_history (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    mitarbeiter_id  INTEGER NOT NULL REFERENCES mitarbeiter(id),
    monat           TEXT    NOT NULL,   -- 'YYYY-MM'
    pensum_pct      INTEGER NOT NULL,
    import_id       INTEGER REFERENCES import_log(id),
    erfasst_am      DATETIME DEFAULT (datetime('now')),
    UNIQUE(mitarbeiter_id, monat)
);
CREATE INDEX IF NOT EXISTS idx_pensum_hist_ma ON ma_pensum_history(mitarbeiter_id);

-- ── Zusatzfunktionen (Farbbalken-Definitionen) ───────────────────────────────
CREATE TABLE IF NOT EXISTS zusatzfunktionen (
    code            TEXT    PRIMARY KEY,
    anzeigename     TEXT    NOT NULL,
    farbe_hex       TEXT,                         -- Ursprüngliche Balkenfarbe #RRGGBB
    kalender_titel  TEXT,                         -- Optional: abweichender Kalendertitel
    ics_export      INTEGER DEFAULT 0,            -- 1 = als ICS-Event exportieren
    ist_ganztaegig  INTEGER DEFAULT 1,            -- 1 = ganztägig, 0 = Zeitdienst
    dienstbeginn    TEXT,                         -- "HH:MM" wenn nicht ganztägig
    dienstende      TEXT,                         -- "HH:MM" wenn nicht ganztägig
    notizen         TEXT
);

-- ── Mail-Versand-Log ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mail_versand_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    kuerzel     TEXT    NOT NULL,
    monat       TEXT    NOT NULL,
    jahr        INTEGER NOT NULL,
    empfaenger  TEXT    NOT NULL,
    gesendet_am DATETIME DEFAULT (datetime('now')),
    ics_hash    TEXT,
    modus       TEXT    DEFAULT 'alle'
);
CREATE INDEX IF NOT EXISTS idx_mail_log_ma_monat ON mail_versand_log(kuerzel, monat, jahr);

-- ── Schicht-Zusatzfunktionen (n:m) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schicht_zusatz (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    schicht_id      INTEGER NOT NULL REFERENCES schichten(id) ON DELETE CASCADE,
    zusatz_code     TEXT    NOT NULL REFERENCES zusatzfunktionen(code),
    farbe_hex       TEXT,                         -- tatsächliche Balkenfarbe (kann variieren)
    UNIQUE(schicht_id, zusatz_code)
);

CREATE INDEX IF NOT EXISTS idx_schicht_zusatz_schicht ON schicht_zusatz(schicht_id);
CREATE INDEX IF NOT EXISTS idx_schicht_zusatz_code    ON schicht_zusatz(zusatz_code);

-- ══════════════════════════════════════════════════════════════════════════════
-- VIEWS
-- ══════════════════════════════════════════════════════════════════════════════

CREATE VIEW IF NOT EXISTS v_schichten AS
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
    s.anzeigename,
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
JOIN dienst_typen dt ON s.dienst_code    = dt.code;


CREATE VIEW IF NOT EXISTS v_schichten_expanded AS
-- Hauptdienst (dienst_code) — immer vorhanden
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
-- Zweiter Dienst (dienst_code2) — nur bei geteilten Tagen (½-Icon)
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
JOIN dienst_typen dt2 ON s.dienst_code2   = dt2.code;


CREATE VIEW IF NOT EXISTS v_besetzung AS
SELECT
    s1.datum,
    s1.wochentag,
    s1.ist_wochenende,
    s1.ort,
    s1.anzeigename       AS dienst,
    s1.dienstbeginn,
    s1.dienstende,
    COUNT(*)             AS anzahl_ma,
    GROUP_CONCAT(s1.ma_kuerzel, ', ') AS ma_kuerzel_liste,
    GROUP_CONCAT(
        COALESCE(s1.vorname || ' ' || s1.nachname, s1.ma_kuerzel), ', '
    ) AS ma_namen_liste
FROM v_schichten s1
WHERE s1.kategorie = 'Arbeit'
GROUP BY s1.datum, s1.ort, s1.dienst_code, s1.dienstbeginn, s1.dienstende;


CREATE VIEW IF NOT EXISTS v_kollegen AS
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
        COALESCE(s2.vorname || ' ' || s2.nachname, s2.ma_kuerzel), ', '
    ) AS kollegen_namen,
    GROUP_CONCAT(s2.ma_kuerzel, ', ') AS kollegen_kuerzel,
    COUNT(s2.id) AS anzahl_kollegen
FROM v_schichten s1
LEFT JOIN v_schichten s2
    ON  s1.datum       = s2.datum
    AND s1.ort         = s2.ort
    AND s1.id         != s2.id
    AND s2.kategorie   = 'Arbeit'
WHERE s1.kategorie = 'Arbeit'
GROUP BY s1.id;


CREATE VIEW IF NOT EXISTS v_statistiken_ma AS
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
GROUP BY ma_kuerzel, strftime('%Y-%m', datum);


CREATE VIEW IF NOT EXISTS v_abwesenheiten AS
SELECT datum, wochentag, ma_kuerzel, ma_name, anzeigename AS abwesenheitsgrund, kategorie
FROM v_schichten
WHERE kategorie IN ('Abwesenheit', 'Frei') AND anzeigename != ''
ORDER BY datum, ma_kuerzel;


CREATE VIEW IF NOT EXISTS v_schicht_zusatz AS
SELECT
    sz.id,
    s.datum,
    m.kuerzel  AS ma_kuerzel,
    COALESCE(m.vorname || ' ' || m.nachname, m.kuerzel) AS ma_name,
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
JOIN zusatzfunktionen zf ON sz.zusatz_code = zf.code;
"""


def create_database(db_path: Path, reset: bool = False) -> sqlite3.Connection:
    if reset and db_path.exists():
        db_path.unlink()
        log.info("Bestehende DB gelöscht: %s", db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.executescript(SCHEMA_SQL)
    conn.commit()
    log.info("Schema erstellt: %s", db_path)
    return conn


# Schema-Setup und Migrationen sind idempotent, aber teuer (Schreib-Transaktionen
# bei jedem Aufruf). Pro Prozess und DB-Pfad genügt ein Durchlauf.
_initialized_paths: set = set()


def get_connection(db_path: Path = DB_PATH) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    key = str(db_path.resolve())
    if key in _initialized_paths:
        return conn
    _initialized_paths.add(key)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript(SCHEMA_SQL)
    conn.commit()
    try:
        conn.execute("ALTER TABLE mitarbeiter ADD COLUMN zusammengefuehrt_in_id INTEGER REFERENCES mitarbeiter(id)")
        conn.commit()
    except Exception:
        pass
    try:
        conn.execute("ALTER TABLE mitarbeiter ADD COLUMN nie_aktivieren INTEGER NOT NULL DEFAULT 0")
        conn.commit()
    except Exception:
        pass
    try:
        conn.execute("ALTER TABLE mitarbeiter ADD COLUMN webcal_token TEXT")
        conn.commit()
    except Exception:
        pass
    try:
        conn.execute("ALTER TABLE mitarbeiter ADD COLUMN webcal_mail_modus TEXT NOT NULL DEFAULT 'ics'")
        conn.commit()
    except Exception:
        pass
    try:
        conn.execute("ALTER TABLE schichten ADD COLUMN original_ma_id INTEGER REFERENCES mitarbeiter(id)")
        conn.commit()
    except Exception:
        pass
    try:
        conn.execute("ALTER TABLE dienst_typen ADD COLUMN ist_ausrueckdienst INTEGER DEFAULT 0")
        conn.commit()
    except Exception:
        pass
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS aktivitaeten_log (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                kind         TEXT NOT NULL,
                titel        TEXT NOT NULL,
                detail       TEXT,
                status       TEXT DEFAULT 'ok',
                erstellt_am  TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
            )
        """)
        conn.commit()
    except Exception:
        pass
    return conn


def log_aktivitaet(kind: str, titel: str, detail: str = "", status: str = "ok",
                   db_path: Path = DB_PATH) -> None:
    try:
        conn = sqlite3.connect(str(db_path))
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute(
            "INSERT INTO aktivitaeten_log (kind, titel, detail, status) VALUES (?,?,?,?)",
            (kind, titel, detail, status),
        )
        conn.commit()
        conn.close()
    except Exception:
        pass


def main() -> None:
    parser = argparse.ArgumentParser(description="Datenbank erstellen/zurücksetzen")
    parser.add_argument("--reset", action="store_true")
    parser.add_argument("--db",    default=str(DB_PATH))
    args = parser.parse_args()
    conn = create_database(Path(args.db), reset=args.reset)
    conn.close()
    log.info("✅ Datenbank bereit: %s", args.db)


if __name__ == "__main__":
    main()
