import calendar
from datetime import date, timedelta

from flask import Blueprint, jsonify, request

from config import MONATE_DE

bp = Blueprint("mitarbeiter", __name__)


def _last_day(jahr: int, monat_num: int) -> str:
    last = calendar.monthrange(jahr, monat_num)[1]
    return f"{jahr:04d}-{monat_num:02d}-{last:02d}"


def _first_day(jahr: int, monat_num: int) -> str:
    return f"{jahr:04d}-{monat_num:02d}-01"


@bp.route("/api/ma/list")
def api_ma_list():
    monat    = request.args.get("month", "").strip()
    jahr_str = request.args.get("year",  "").strip()
    try:
        from db_setup import get_connection
        from mail_adressen import get_ma_list, ensure_email_column
        conn = get_connection()
        ensure_email_column(conn)
        data = get_ma_list(conn, monat=monat, jahr=int(jahr_str) if jahr_str.isdigit() else None)
        conn.close()
        return jsonify(data)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@bp.route("/api/ma/monat")
def api_ma_monat():
    kuerzel  = request.args.get("kuerzel", "").strip()
    monat    = request.args.get("month",   "").strip()
    jahr_str = request.args.get("year",    "").strip()
    if not kuerzel or monat not in MONATE_DE or not jahr_str.isdigit():
        return jsonify({"error": "Ungültige Parameter"}), 400
    month_num = MONATE_DE[monat]
    try:
        from db_setup import get_connection
        conn = get_connection()
        rows = conn.execute("""
            SELECT s.datum, s.dienst_code AS dienstcode, dt.kategorie
            FROM schichten s
            JOIN mitarbeiter m ON m.id = s.mitarbeiter_id
            LEFT JOIN dienst_typen dt ON dt.code = s.dienst_code
            WHERE m.kuerzel = ?
              AND strftime('%Y', s.datum) = ?
              AND strftime('%m', s.datum) = ?
            ORDER BY s.datum
        """, (kuerzel, jahr_str, f"{month_num:02d}")).fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows])
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@bp.route("/api/ma/neu_nach_import")
def api_ma_neu_nach_import():
    try:
        from db_setup import get_connection
        conn = get_connection()
        rows = conn.execute("""
            SELECT kuerzel, vorname, nachname
            FROM mitarbeiter
            WHERE erstellt_am >= (
                SELECT importiert_am FROM import_log ORDER BY id DESC LIMIT 1
            )
            ORDER BY nachname, vorname, kuerzel
        """).fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows])
    except Exception:
        return jsonify([])


@bp.route("/api/ma/alle")
def api_ma_alle():
    try:
        from db_setup import get_connection
        conn = get_connection()
        rows = conn.execute(
            "SELECT kuerzel, vorname, nachname, aktiv FROM mitarbeiter ORDER BY nachname, vorname, kuerzel"
        ).fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows])
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@bp.route("/api/ma/merge", methods=["POST"])
def api_ma_merge():
    try:
        from db_setup import get_connection
        from db_mitarbeiter import merge_mitarbeiter
        data  = request.get_json()
        quell = (data.get("quell") or "").strip()
        ziel  = (data.get("ziel")  or "").strip()
        if not quell or not ziel:
            return jsonify({"error": "Quell und Ziel müssen angegeben werden"}), 400
        conn   = get_connection()
        result = merge_mitarbeiter(conn, quell, ziel)
        conn.close()
        if result.get("ok"):
            from db_setup import log_aktivitaet
            log_aktivitaet("merge", f"MA zusammengeführt: {quell} → {ziel}",
                           f"{result.get('schichten', 0)} Schichten übertragen")
        return jsonify(result)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@bp.route("/api/ma/trends")
def api_ma_trends():
    """Schichtanzahl (Arbeitstage) pro MA für die letzten 6 Monate."""
    try:
        from db_setup import get_connection
        conn = get_connection()
        rows = conn.execute("""
            SELECT m.kuerzel,
                   strftime('%Y-%m', s.datum) AS ym,
                   COUNT(*) AS anzahl
            FROM schichten s
            JOIN mitarbeiter m  ON m.id  = s.mitarbeiter_id
            JOIN dienst_typen dt ON dt.code = s.dienst_code
            WHERE m.aktiv = 1
              AND dt.kategorie = 'Arbeit'
              AND s.datum >= date('now', '-6 months')
            GROUP BY m.kuerzel, ym
            ORDER BY m.kuerzel, ym
        """).fetchall()
        conn.close()

        months = []
        d = date.today().replace(day=1)
        for _ in range(6):
            months.append(d.strftime('%Y-%m'))
            d = (d - timedelta(days=1)).replace(day=1)
        months.reverse()

        trends: dict[str, dict] = {}
        for r in rows:
            k = r["kuerzel"]
            if k not in trends:
                trends[k] = {m: 0 for m in months}
            if r["ym"] in trends[k]:
                trends[k][r["ym"]] = r["anzahl"]

        return jsonify({k: [v[m] for m in months] for k, v in trends.items()})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@bp.route("/api/ma/unmerge", methods=["POST"])
def api_ma_unmerge():
    try:
        from db_setup import get_connection
        from db_mitarbeiter import unmerge_mitarbeiter
        data  = request.get_json()
        quell = (data.get("quell") or "").strip()
        if not quell:
            return jsonify({"error": "Kürzel des alten Eintrags fehlt"}), 400
        conn   = get_connection()
        result = unmerge_mitarbeiter(conn, quell)
        conn.close()
        if result.get("ok"):
            from db_setup import log_aktivitaet
            log_aktivitaet("unmerge",
                           f"Merge rückgängig: {quell} ← {result.get('ziel_kuerzel', '?')}",
                           f"{result.get('zurueckverschoben', 0)} Schichten zurückverschoben")
        return jsonify(result)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@bp.route("/api/ma/merge/verlauf")
def api_ma_merge_verlauf():
    try:
        from db_setup import get_connection
        conn = get_connection()
        rows = conn.execute("""
            SELECT m.kuerzel, m.vorname, m.nachname,
                   substr(m.geaendert_am, 1, 10) AS datum,
                   z.kuerzel AS ziel_kuerzel,
                   z.vorname AS ziel_vorname,
                   z.nachname AS ziel_nachname
            FROM mitarbeiter m
            JOIN mitarbeiter z ON z.id = m.zusammengefuehrt_in_id
            WHERE m.zusammengefuehrt_in_id IS NOT NULL
            ORDER BY m.geaendert_am DESC
        """).fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows])
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@bp.route("/api/ma/save", methods=["POST"])
def api_ma_save():
    try:
        from db_setup import get_connection
        from mail_adressen import save_emails, ensure_email_column
        payload = request.get_json()
        if not isinstance(payload, dict):
            return jsonify({"error": "Ungültige Daten"}), 400
        conn = get_connection()
        ensure_email_column(conn)
        updated = save_emails(conn, payload)
        conn.close()
        return jsonify({"ok": True, "updated": updated})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@bp.route("/api/ma/nie_aktivieren", methods=["POST"])
def api_ma_nie_aktivieren():
    try:
        from db_setup import get_connection
        data    = request.get_json() or {}
        kuerzel = data.get("kuerzel", "").strip()
        wert    = 1 if data.get("wert") else 0
        if not kuerzel:
            return jsonify({"error": "Kein Kürzel angegeben"}), 400
        conn = get_connection()
        # Bei nie_aktivieren=1 auch aktiv=0 setzen
        if wert:
            conn.execute(
                "UPDATE mitarbeiter SET nie_aktivieren = 1, aktiv = 0, geaendert_am = datetime('now') WHERE kuerzel = ?",
                (kuerzel,)
            )
        else:
            conn.execute(
                "UPDATE mitarbeiter SET nie_aktivieren = 0, geaendert_am = datetime('now') WHERE kuerzel = ?",
                (kuerzel,)
            )
        conn.commit()
        conn.close()
        return jsonify({"ok": True})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@bp.route("/api/ma/webcal_token", methods=["POST"])
def api_ma_webcal_token():
    try:
        import secrets
        from db_setup import get_connection
        data    = request.get_json() or {}
        kuerzel = data.get("kuerzel", "").strip()
        action  = data.get("action", "generate")   # "generate" | "revoke"
        if not kuerzel:
            return jsonify({"error": "Kein Kürzel angegeben"}), 400
        conn = get_connection()
        if action == "revoke":
            # Auch Tokens zusammengeführter Alias-MA löschen — deren Feed liefert
            # sonst über die Merge-Kette weiterhin den Plan dieses MA.
            conn.execute(
                """UPDATE mitarbeiter SET webcal_token = NULL, geaendert_am = datetime('now')
                   WHERE kuerzel = ?
                      OR zusammengefuehrt_in_id = (SELECT id FROM mitarbeiter WHERE kuerzel = ?)""",
                (kuerzel, kuerzel),
            )
            conn.commit()
            conn.close()
            return jsonify({"ok": True, "token": None})
        # generate / regenerate — Alias-Tokens dabei ungültig machen,
        # sonst bliebe der alte Link über die Merge-Kette parallel aktiv
        token = secrets.token_hex(32)
        conn.execute(
            """UPDATE mitarbeiter SET webcal_token = NULL, geaendert_am = datetime('now')
               WHERE zusammengefuehrt_in_id = (SELECT id FROM mitarbeiter WHERE kuerzel = ?)
                 AND webcal_token IS NOT NULL""",
            (kuerzel,),
        )
        conn.execute(
            "UPDATE mitarbeiter SET webcal_token = ?, geaendert_am = datetime('now') WHERE kuerzel = ?",
            (token, kuerzel),
        )
        conn.commit()
        conn.close()
        return jsonify({"ok": True, "token": token})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@bp.route("/api/ma/webcal-uebersicht")
def api_ma_webcal_uebersicht():
    try:
        from db_setup import get_connection
        conn = get_connection()
        cols = [r[1] for r in conn.execute("PRAGMA table_info(mitarbeiter)").fetchall()]
        email_col = ("COALESCE(NULLIF(m.email,''),"
                     " (SELECT NULLIF(a.email,'') FROM mitarbeiter a"
                     "  WHERE a.zusammengefuehrt_in_id = m.id"
                     "    AND NULLIF(a.email,'') IS NOT NULL LIMIT 1), '')"
                     if "email" in cols else "''")
        rows = conn.execute(f"""
            SELECT m.kuerzel,
                   COALESCE(m.vorname, '') AS vorname,
                   COALESCE(m.nachname, '') AS nachname,
                   {email_col} AS email,
                   CASE WHEN m.webcal_token IS NOT NULL
                             OR EXISTS (SELECT 1 FROM mitarbeiter a
                                        WHERE a.zusammengefuehrt_in_id = m.id
                                          AND a.webcal_token IS NOT NULL)
                        THEN 1 ELSE 0 END AS webcal_aktiv,
                   COALESCE(m.webcal_mail_modus, 'ics') AS webcal_mail_modus,
                   m.aktiv,
                   COALESCE(m.nie_aktivieren, 0) AS nie_aktivieren
            FROM mitarbeiter m
            WHERE m.zusammengefuehrt_in_id IS NULL
            ORDER BY webcal_aktiv DESC, m.nachname, m.vorname, m.kuerzel
        """).fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows])
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@bp.route("/api/ma/webcal_modus", methods=["POST"])
def api_ma_webcal_modus():
    data    = request.get_json() or {}
    kuerzel = (data.get("kuerzel") or "").strip()
    modus   = (data.get("modus")   or "ics").strip()
    if not kuerzel:
        return jsonify({"error": "kuerzel fehlt"}), 400
    if modus not in ("ics", "webcal", "beide"):
        return jsonify({"error": "Ungültiger Modus"}), 400
    try:
        from db_setup import get_connection
        conn = get_connection()
        conn.execute(
            "UPDATE mitarbeiter SET webcal_mail_modus = ?, geaendert_am = datetime('now') WHERE kuerzel = ?",
            (modus, kuerzel),
        )
        conn.commit()
        conn.close()
        return jsonify({"ok": True, "modus": modus})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
