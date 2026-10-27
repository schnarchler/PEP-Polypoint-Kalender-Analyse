"""
gui.py – Einstiegspunkt für das Dienstplanung Web-Interface

Aufruf:
  python gui.py
  python gui.py --port 5001
  python gui.py --no-browser
"""

import argparse
import threading
import webbrowser

from app import app  # Flask-Instanz (registriert sys.path)

from routes.main          import bp as bp_main
from routes.monatslauf    import bp as bp_monatslauf
from routes.mail          import bp as bp_mail
from routes.mitarbeiter   import bp as bp_mitarbeiter
from routes.werkzeuge     import bp as bp_werkzeuge
from routes.data          import bp as bp_data
from routes.einstellungen import bp as bp_einstellungen
from routes.analyse_api   import bp as bp_analyse_api
from routes.webcal        import bp as bp_webcal

app.register_blueprint(bp_main)
app.register_blueprint(bp_monatslauf)
app.register_blueprint(bp_mail)
app.register_blueprint(bp_mitarbeiter)
app.register_blueprint(bp_werkzeuge)
app.register_blueprint(bp_data)
app.register_blueprint(bp_einstellungen)
app.register_blueprint(bp_analyse_api)
app.register_blueprint(bp_webcal)


_MANAGED_VIEWS = [
    # Reihenfolge wichtig: v_schichten_expanded muss vor v_statistiken_ma kommen
    ("v_schichten_expanded",
     "v_schichten_expanded",   # Marker: View verweist auf sich selbst → immer neu
     """CREATE VIEW v_schichten_expanded AS
SELECT s.id, s.datum,
    strftime('%Y',s.datum) AS jahr, strftime('%m',s.datum) AS monat_num,
    strftime('%W',s.datum) AS kalenderwoche,
    CASE strftime('%w',s.datum)
        WHEN '0' THEN 'So' WHEN '1' THEN 'Mo' WHEN '2' THEN 'Di'
        WHEN '3' THEN 'Mi' WHEN '4' THEN 'Do' WHEN '5' THEN 'Fr'
        WHEN '6' THEN 'Sa' END AS wochentag,
    CASE WHEN strftime('%w',s.datum) IN ('0','6') THEN 1 ELSE 0 END AS ist_wochenende,
    m.kuerzel AS ma_kuerzel, m.vorname, m.nachname,
    COALESCE(m.vorname||' '||m.nachname, m.kuerzel) AS ma_name, m.pensum_pct,
    s.dienst_code, dt.anzeigename, s.dienstbeginn, s.dienstende, s.ort,
    dt.kategorie, dt.ist_nachtdienst, dt.ist_ganztaegig,
    CASE WHEN s.dienstbeginn IS NOT NULL AND s.dienstbeginn!=''
              AND s.dienstende   IS NOT NULL AND s.dienstende  !=''
    THEN ((CAST(substr(s.dienstende,1,2) AS REAL)*60+CAST(substr(s.dienstende,4,2) AS REAL))
         -(CAST(substr(s.dienstbeginn,1,2) AS REAL)*60+CAST(substr(s.dienstbeginn,4,2) AS REAL))
         +CASE WHEN substr(s.dienstende,1,2)<substr(s.dienstbeginn,1,2) THEN 1440 ELSE 0 END)/60.0
    ELSE NULL END AS arbeitsstunden
FROM schichten s
JOIN mitarbeiter  m  ON s.mitarbeiter_id=m.id
JOIN dienst_typen dt ON s.dienst_code=dt.code
UNION ALL
SELECT s.id, s.datum,
    strftime('%Y',s.datum), strftime('%m',s.datum), strftime('%W',s.datum),
    CASE strftime('%w',s.datum)
        WHEN '0' THEN 'So' WHEN '1' THEN 'Mo' WHEN '2' THEN 'Di'
        WHEN '3' THEN 'Mi' WHEN '4' THEN 'Do' WHEN '5' THEN 'Fr'
        WHEN '6' THEN 'Sa' END,
    CASE WHEN strftime('%w',s.datum) IN ('0','6') THEN 1 ELSE 0 END,
    m.kuerzel, m.vorname, m.nachname,
    COALESCE(m.vorname||' '||m.nachname, m.kuerzel), m.pensum_pct,
    s.dienst_code2, dt2.anzeigename, NULL, NULL, s.ort,
    dt2.kategorie, dt2.ist_nachtdienst, dt2.ist_ganztaegig, NULL
FROM schichten s
JOIN mitarbeiter  m   ON s.mitarbeiter_id=m.id
JOIN dienst_typen dt2 ON s.dienst_code2=dt2.code"""),

    ("v_statistiken_ma",
     "v_schichten_expanded",   # Marker: muss auf v_schichten_expanded zeigen
     """CREATE VIEW v_statistiken_ma AS
SELECT ma_kuerzel, ma_name,
    strftime('%Y-%m', datum) AS jahr_monat,
    COUNT(*) AS total_eintraege,
    COUNT(DISTINCT CASE WHEN kategorie='Arbeit' THEN datum END) AS arbeitstage,
    SUM(CASE WHEN kategorie='Frei'        THEN 1 ELSE 0 END) AS freitage,
    SUM(CASE WHEN kategorie='Abwesenheit' THEN 1 ELSE 0 END) AS abwesenheitstage,
    SUM(CASE WHEN ist_nachtdienst=1       THEN 1 ELSE 0 END) AS nachtdienste,
    SUM(CASE WHEN ist_wochenende=1 AND kategorie='Arbeit' THEN 1 ELSE 0 END) AS wochenenddienste,
    ROUND(SUM(COALESCE(arbeitsstunden,0)),1) AS total_stunden,
    ROUND(AVG(CASE WHEN arbeitsstunden IS NOT NULL THEN arbeitsstunden END),1) AS avg_stunden_pro_dienst
FROM v_schichten_expanded
GROUP BY ma_kuerzel, strftime('%Y-%m', datum)"""),
]


def _run_migrations(conn) -> None:
    """Views auf aktuellem Stand halten: prüft ob der Marker-String im SQL vorkommt."""
    for view_name, marker, create_sql in _MANAGED_VIEWS:
        try:
            row = conn.execute(
                "SELECT sql FROM sqlite_master WHERE type='view' AND name=?",
                (view_name,)
            ).fetchone()
            current_sql = row["sql"] if row else ""
            # Prüfung: ist der Marker im gespeicherten SQL enthalten?
            if marker in (current_sql or ""):
                continue  # View ist bereits aktuell
            conn.execute(f"DROP VIEW IF EXISTS {view_name}")
            conn.execute(create_sql)
            conn.commit()
            print(f"  DB:     ✅ {view_name} migriert")
        except Exception as exc:
            print(f"  DB:     ❌ {view_name}: {exc}")


def _init_on_startup() -> None:
    """Alle benötigten Verzeichnisse und die Datenbank beim Start anlegen."""
    from config import BASE_DIR, PDF_DIR
    for d in [PDF_DIR, BASE_DIR / "pdf_archiv", BASE_DIR / "excel_export",
              BASE_DIR / "ics_export", BASE_DIR / "backup", BASE_DIR / "logs"]:
        try:
            d.mkdir(parents=True, exist_ok=True)
        except Exception:
            pass
    try:
        from db_setup import get_connection
        conn = get_connection()
        _run_migrations(conn)
        conn.commit()
        conn.close()
        print("  DB:     OK")
    except Exception as exc:
        print(f"  DB:     ⚠️  {exc}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Dienstplanung Web-Interface")
    parser.add_argument("--port",       type=int, default=5000)
    parser.add_argument("--host",       type=str, default="127.0.0.1")
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()

    url = f"http://localhost:{args.port}"
    print(f"\n  Dienstplanung Web-Interface")
    print(f"  {'─' * 38}")
    print(f"  URL:    {url}")
    print(f"  Stopp:  Ctrl+C")
    print(f"  {'─' * 38}\n")

    _init_on_startup()

    from pdf_sync import start_scheduler
    start_scheduler()

    if not args.no_browser:
        threading.Timer(0.4, lambda: webbrowser.open(url)).start()

    app.run(host=args.host, port=args.port, debug=False, threaded=True)


if __name__ == "__main__":
    main()
