import sys

from flask import Blueprint, jsonify, request

from config import MONATE_DE
from tasks import start_task

bp = Blueprint("mail", __name__)


@bp.route("/api/mail", methods=["POST"])
def api_mail():
    monat          = request.form.get("month",            "").strip()
    jahr           = request.form.get("year",             "").strip()
    empfaenger_mod = request.form.get("empfaenger_modus", "alle")
    selected_ma    = request.form.get("selected_ma",      "").strip()
    test_an        = request.form.get("test_an",          "").strip()
    smtp_pw        = request.form.get("smtp_pw",          "").strip()
    dry_run        = request.form.get("dry_run", "0") == "1"

    if monat not in MONATE_DE:
        return jsonify({"error": f"Unbekannter Monat: {monat}"})
    if not dry_run and not smtp_pw:
        return jsonify({"error": "SMTP-Passwort fehlt"})

    cmd = [sys.executable, "lib/mail_send.py", "--month", monat, "--year", jahr, "--ja"]
    if dry_run:
        cmd.append("--dry-run")
    if empfaenger_mod == "nur_aenderungen":
        cmd.append("--nur-aenderungen")
    if empfaenger_mod == "auswahl" and selected_ma:
        for kuerzel in selected_ma.split(","):
            kuerzel = kuerzel.strip()
            if kuerzel:
                cmd += ["--name", kuerzel]
    if test_an:
        cmd += ["--test-an", test_an]

    env = {"DIENSTPLAN_SMTP_TOKEN": smtp_pw} if smtp_pw else None
    return jsonify({"task_id": start_task(cmd, env=env)})


@bp.route("/api/mail/diffs")
def api_mail_diffs():
    """Gibt die Tage zurück, an denen sich Schichten seit dem letzten Versand geändert haben."""
    kuerzel = request.args.get("kuerzel", "").strip()
    monat   = request.args.get("month",   "").strip()
    jahr    = request.args.get("year",    "").strip()
    if not kuerzel or monat not in MONATE_DE or not jahr.isdigit():
        return jsonify([])
    monat_num = MONATE_DE[monat]
    prefix    = f"{jahr}-{monat_num:02d}%"
    try:
        from db_setup import get_connection
        conn = get_connection()
        # Schichten die nach dem letzten Versand importiert wurden (oder nie versandt)
        rows = conn.execute("""
            SELECT s.datum, s.dienst_code AS code
            FROM schichten s
            JOIN mitarbeiter m ON m.id = s.mitarbeiter_id
            JOIN import_log il ON il.id = s.import_id
            WHERE m.kuerzel = ?
              AND s.datum LIKE ?
              AND il.importiert_am > COALESCE(
                  (SELECT MAX(gesendet_am) FROM mail_versand_log
                   WHERE kuerzel = ? AND monat = ? AND jahr = ?),
                  '1970-01-01')
        """, (kuerzel, prefix, kuerzel, monat, int(jahr))).fetchall()
        conn.close()
        changed_days = [int(r["datum"].split("-")[2]) for r in rows]
        return jsonify(changed_days)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@bp.route("/api/mail/versand-log")
def api_mail_versand_log():
    """Gibt den letzten Versandzeitpunkt je MA für einen Monat zurück."""
    monat = request.args.get("month", "").strip()
    jahr  = request.args.get("year",  "").strip()
    if monat not in MONATE_DE or not jahr.isdigit():
        return jsonify({})
    try:
        from db_setup import get_connection
        conn = get_connection()
        rows = conn.execute("""
            SELECT kuerzel, MAX(gesendet_am) AS gesendet_am, empfaenger, modus
            FROM mail_versand_log
            WHERE monat = ? AND jahr = ?
            GROUP BY kuerzel
        """, (monat, int(jahr))).fetchall()
        conn.close()
        return jsonify({r["kuerzel"]: {
            "gesendet_am": r["gesendet_am"],
            "empfaenger":  r["empfaenger"],
            "modus":       r["modus"],
        } for r in rows})
    except Exception:
        return jsonify({})


@bp.route("/api/ics/vorschau")
def api_ics_vorschau():
    kuerzel = request.args.get("kuerzel", "").strip()
    monat   = request.args.get("month",   "").strip()
    jahr    = request.args.get("year",    "").strip()
    if not kuerzel or monat not in MONATE_DE or not jahr.isdigit():
        return jsonify({"error": "Ungültige Parameter"})
    prefix = f"{jahr}-{MONATE_DE[monat]:02d}%"
    try:
        from db_setup import get_connection
        conn = get_connection()
        rows = conn.execute("""
            SELECT e.datum, e.wochentag, e.anzeigename,
                   e.dienstbeginn, e.dienstende, e.ort,
                   e.kategorie, e.ist_nachtdienst, e.ist_ganztaegig
            FROM v_schichten_expanded e
            LEFT JOIN dienst_typen dt ON dt.code = e.dienst_code
            WHERE e.ma_kuerzel = ? AND e.datum LIKE ?
            ORDER BY e.datum, COALESCE(dt.ist_ausrueckdienst, 0) DESC
        """, (kuerzel, prefix)).fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows])
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@bp.route("/api/mail/als-versendet-markieren", methods=["POST"])
def api_mail_als_versendet_markieren():
    """Schreibt für alle MAs mit E-Mail einen manuellen Versand-Log-Eintrag."""
    data  = request.get_json(silent=True) or {}
    monat = (data.get("month") or "").strip()
    jahr  = (data.get("year")  or "").strip()
    from config import MONATE_DE
    if monat not in MONATE_DE or not jahr.isdigit():
        return jsonify({"error": "Ungültiger Monat/Jahr"}), 400
    try:
        from datetime import datetime
        from db_setup import get_connection
        from mail_send import find_ics, ics_hash
        conn = get_connection()
        mas = conn.execute(
            "SELECT kuerzel, email FROM mitarbeiter WHERE email IS NOT NULL AND email != '' AND aktiv = 1"
        ).fetchall()
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        for m in mas:
            ics_path = find_ics(m["kuerzel"], monat, int(jahr))
            h = ics_hash(ics_path) if ics_path else None
            conn.execute(
                """INSERT INTO mail_versand_log (kuerzel, monat, jahr, gesendet_am, empfaenger, ics_hash, modus)
                   VALUES (?, ?, ?, ?, ?, ?, 'manuell')""",
                (m["kuerzel"], monat, int(jahr), now, m["email"], h),
            )
        conn.commit()
        conn.close()
        return jsonify({"ok": True, "count": len(mas)})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@bp.route("/api/mail/webcal-link-senden", methods=["POST"])
def api_webcal_link_senden():
    """Sendet den persönlichen Webcal-Link per Mail an einen einzelnen MA."""
    data    = request.get_json(silent=True) or {}
    kuerzel = (data.get("kuerzel") or "").strip()
    smtp_pw = (data.get("smtp_pw") or "").strip()

    if not kuerzel:
        return jsonify({"error": "Kein Kürzel angegeben"}), 400
    if not smtp_pw:
        return jsonify({"error": "SMTP-Passwort fehlt"}), 400

    try:
        import smtplib, ssl
        from db_setup import get_connection
        from mail_send import build_webcal_mail
        from config import EMAIL_SMTP_HOST, EMAIL_SMTP_PORT, EMAIL_SMTP_USER

        conn = get_connection()
        row = conn.execute("""
            SELECT m.kuerzel,
                   COALESCE(m.vorname,'')  AS vorname,
                   COALESCE(m.nachname,'') AS nachname,
                   COALESCE(NULLIF(m.email,''),
                            (SELECT NULLIF(a.email,'') FROM mitarbeiter a
                             WHERE a.zusammengefuehrt_in_id = m.id
                               AND NULLIF(a.email,'') IS NOT NULL LIMIT 1)
                   ) AS email,
                   COALESCE(m.webcal_token,
                            (SELECT a.webcal_token FROM mitarbeiter a
                             WHERE a.zusammengefuehrt_in_id = m.id
                               AND a.webcal_token IS NOT NULL LIMIT 1)
                   ) AS webcal_token
            FROM mitarbeiter m WHERE m.kuerzel = ?
        """, (kuerzel,)).fetchone()
        conn.close()

        if not row:
            return jsonify({"error": "Mitarbeiter nicht gefunden"}), 404
        if not row["email"]:
            return jsonify({"error": "Keine E-Mail-Adresse hinterlegt"}), 400
        if not row["webcal_token"]:
            return jsonify({"error": "Kein Webcal-Token vorhanden"}), 400

        msg = build_webcal_mail(
            row["email"], kuerzel, row["vorname"], "", 0, row["webcal_token"],
            nachname=row["nachname"],
        )

        ctx = ssl.create_default_context()
        server = smtplib.SMTP(EMAIL_SMTP_HOST, EMAIL_SMTP_PORT, timeout=15)
        server.ehlo()
        server.starttls(context=ctx)
        server.ehlo()
        server.login(EMAIL_SMTP_USER, smtp_pw)
        server.sendmail(EMAIL_SMTP_USER, [row["email"]], msg.as_string())
        server.quit()

        return jsonify({"ok": True, "empfaenger": row["email"]})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@bp.route("/api/mail/vorschau")
def api_mail_vorschau():
    monat = request.args.get("month", "").strip()
    jahr  = request.args.get("year",  "").strip()
    if monat not in MONATE_DE or not jahr.isdigit():
        return jsonify({"error": "Ungültiger Monat/Jahr"})
    try:
        from db_setup import get_connection
        from mail_send import collect_versand_liste
        conn  = get_connection()
        liste = collect_versand_liste(conn, monat, int(jahr), nur_aenderungen=True)
        conn.close()
        return jsonify([{
            "kuerzel":    m["kuerzel"],
            "vorname":    m["vorname"],
            "nachname":   m["nachname"],
            "empfaenger": m["empfaenger"],
        } for m in liste])
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
