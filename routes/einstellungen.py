import os
import sys
import threading
from pathlib import Path

from flask import Blueprint, jsonify, request

from config import (
    BASE_DIR, _SCRIPT_DIR,
    _EMAIL_SMTP_HOST_DEFAULT, _EMAIL_SMTP_PORT_DEFAULT, _EMAIL_SMTP_USER_DEFAULT,
    _TIMEZONE_DEFAULT, _PDF_TEMPLATE_DEFAULT,
    _EMAIL_ABSENDER_DEFAULT, _EMAIL_BETREFF_DEFAULT, _EMAIL_TEXT_DEFAULT,
    _WEBCAL_BETREFF_DEFAULT, _WEBCAL_TEXT_DEFAULT,
)

bp = Blueprint("einstellungen", __name__)


def _nullify_dienst_references(conn, code: str) -> None:
    """Entfernt alle Schichten-Referenzen auf einen Dienst-Code, damit der Dienst-Typ
    gelöscht werden kann. Beim nächsten Import werden die betroffenen Tage neu eingelesen.
    - dienst_code (NOT NULL): betroffene Schichten werden gelöscht (CASCADE entfernt schicht_zusatz)
    - dienst_code2 / bar_code (nullable): auf NULL gesetzt"""
    conn.execute("DELETE FROM schichten WHERE dienst_code = ?", (code,))
    conn.execute("UPDATE schichten SET dienst_code2 = NULL WHERE dienst_code2 = ?", (code,))
    conn.execute("UPDATE schichten SET bar_code     = NULL WHERE bar_code     = ?", (code,))


@bp.route("/api/settings", methods=["GET"])
def api_settings_get():
    from settings import load as _load, SETTINGS_FILE as _sf
    s = _load()
    return jsonify({
        **s,
        "base_dir_effective":       str(BASE_DIR),
        "script_dir":               str(_SCRIPT_DIR),
        "settings_file":            str(_sf),
        "is_configured":            _sf.exists(),
        "smtp_host_default":        _EMAIL_SMTP_HOST_DEFAULT,
        "smtp_port_default":        _EMAIL_SMTP_PORT_DEFAULT,
        "smtp_user_default":        _EMAIL_SMTP_USER_DEFAULT,
        "timezone_default":         _TIMEZONE_DEFAULT,
        "pdf_template_default":     _PDF_TEMPLATE_DEFAULT,
        "email_absender_default":      _EMAIL_ABSENDER_DEFAULT,
        "email_betreff_default":       _EMAIL_BETREFF_DEFAULT,
        "email_text_default":          _EMAIL_TEXT_DEFAULT,
        "webcal_email_betreff_default": _WEBCAL_BETREFF_DEFAULT,
        "webcal_email_text_default":    _WEBCAL_TEXT_DEFAULT,
    })


@bp.route("/api/settings", methods=["POST"])
def api_settings_post():
    from settings import load as _load, save as _save
    data = request.get_json() or {}
    current = _load()
    restart_required = False

    if "base_dir" in data:
        raw = (data["base_dir"] or "").strip()
        if raw:
            p = Path(raw)
            if not p.exists():
                try:
                    p.mkdir(parents=True, exist_ok=True)
                except Exception as exc:
                    return jsonify({"error": f"Ordner konnte nicht erstellt werden: {exc}"}), 400
        current["base_dir"] = raw or None
        restart_required = True

    for key in ("smtp_host", "smtp_user", "timezone", "pdf_template",
                "email_absender", "email_betreff", "email_text",
                "webcal_base_url", "webcal_email_betreff", "webcal_email_text",
                "pdf_sync_ordner", "ort_reihenfolge", "brand_untertitel"):
        if key in data:
            current[key] = (data[key] or "").strip() or None

    if "pdf_sync_uhrzeit" in data:
        import re as _re
        raw = (data["pdf_sync_uhrzeit"] or "").strip()
        current["pdf_sync_uhrzeit"] = raw if _re.match(r"^\d{2}:\d{2}$", raw) else "03:00"

    if "pdf_sync_aktiv" in data:
        current["pdf_sync_aktiv"] = bool(data["pdf_sync_aktiv"])

    if "webcal_tage_vergangenheit" in data:
        try:
            current["webcal_tage_vergangenheit"] = max(0, int(data["webcal_tage_vergangenheit"]))
        except (ValueError, TypeError):
            return jsonify({"error": "webcal_tage_vergangenheit muss eine Zahl sein"}), 400

    if "smtp_port" in data:
        raw_port = data["smtp_port"]
        try:
            current["smtp_port"] = int(raw_port) if raw_port else None
        except (ValueError, TypeError):
            return jsonify({"error": "smtp_port muss eine Zahl sein"}), 400

    if "backup_anzahl" in data:
        try:
            current["backup_anzahl"] = max(1, int(data["backup_anzahl"]))
        except (ValueError, TypeError):
            return jsonify({"error": "backup_anzahl muss eine Zahl sein"}), 400

    try:
        _save(current)
    except Exception as exc:
        return jsonify({"error": f"Einstellungen konnten nicht gespeichert werden: {exc}"}), 500
    return jsonify({"ok": True, "restart_required": restart_required})


@bp.route("/api/settings/smtp-test", methods=["POST"])
def api_smtp_test():
    """Testet die SMTP-Verbindung. Nutzt die gesendeten Werte, Fallback auf gespeicherte Einstellungen."""
    import smtplib
    import ssl
    from settings import load as _load

    data = request.get_json() or {}
    password = (data.get("smtp_pw") or "").strip()

    # Gesendete Werte bevorzugen (User hat Felder ausgefüllt aber noch nicht gespeichert)
    s = _load()
    host = (data.get("smtp_host") or "").strip() or s.get("smtp_host") or _EMAIL_SMTP_HOST_DEFAULT
    port = int(data.get("smtp_port") or s.get("smtp_port") or _EMAIL_SMTP_PORT_DEFAULT)
    user = (data.get("smtp_user") or "").strip() or s.get("smtp_user") or _EMAIL_SMTP_USER_DEFAULT

    info = {"smtp_host": host, "smtp_port": port, "smtp_user": user or "(nicht gesetzt)"}

    if not host or host == _EMAIL_SMTP_HOST_DEFAULT:
        return jsonify({**info, "error": "SMTP-Host nicht ausgefüllt – bitte Host eintragen."})
    if not user:
        return jsonify({**info, "error": "SMTP-Benutzer nicht ausgefüllt – bitte Benutzer/Login eintragen."})
    if not password:
        return jsonify({**info, "error": "Kein Passwort angegeben."})

    try:
        ctx = ssl.create_default_context()
        server = smtplib.SMTP(host, port, timeout=10)
        server.ehlo()
        server.starttls(context=ctx)
        server.ehlo()
        server.login(user, password)
        server.quit()
    except Exception as exc:
        return jsonify({**info, "error": str(exc)})

    # Verbindung OK → Einstellungen direkt speichern
    from settings import save as _save
    s["smtp_host"] = host
    s["smtp_port"] = port
    s["smtp_user"] = user
    try:
        _save(s)
    except Exception as exc:
        return jsonify({**info, "ok": True, "saved": False, "save_error": str(exc)})
    return jsonify({**info, "ok": True, "saved": True})


@bp.route("/api/restart", methods=["POST"])
def api_restart():
    def _do():
        import time
        time.sleep(0.6)
        os.execv(sys.executable, [sys.executable] + sys.argv)
    threading.Thread(target=_do, daemon=True).start()
    return ("", 204)


@bp.route("/api/shutdown", methods=["POST"])
def api_shutdown():
    threading.Timer(0.5, lambda: os._exit(0)).start()
    return ("", 204)


@bp.route("/api/config/dienstzeiten", methods=["GET"])
def api_dienstzeiten_get():
    try:
        from db_setup import get_connection
        conn = get_connection()
        rows = conn.execute(
            "SELECT code, anzeigename, COALESCE(dienstbeginn,'') AS dienstbeginn,"
            " COALESCE(dienstende,'') AS dienstende, COALESCE(ort,'') AS ort,"
            " kategorie, ist_nachtdienst, COALESCE(ist_ausrueckdienst,0) AS ist_ausrueckdienst,"
            " COALESCE(ist_ganztaegig,0) AS ist_ganztaegig"
            " FROM dienst_typen ORDER BY code COLLATE NOCASE"
        ).fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows])
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@bp.route("/api/config/dienstzeiten/<code>", methods=["DELETE"])
def api_dienstzeiten_delete(code):
    try:
        from db_setup import get_connection
        conn = get_connection()
        _nullify_dienst_references(conn, code)
        conn.execute("DELETE FROM dienst_typen WHERE code = ?", (code,))
        conn.commit()
        conn.close()
        return jsonify({"ok": True})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@bp.route("/api/config/dienstzeiten", methods=["POST"])
def api_dienstzeiten_post():
    data = request.get_json() or {}
    rows    = data.get("rows",    [])
    deleted = data.get("deleted", [])
    if not isinstance(rows, list):
        return jsonify({"error": "rows muss eine Liste sein"}), 400
    try:
        from db_setup import get_connection
        conn = get_connection()
        for code in deleted:
            _nullify_dienst_references(conn, code)
            conn.execute("DELETE FROM dienst_typen WHERE code = ?", (code,))
        for r in rows:
            code = (r.get("code") or "").strip()
            if not code:
                continue
            beginn     = (r.get("dienstbeginn") or "").strip() or None
            ende       = (r.get("dienstende")   or "").strip() or None
            ort        = (r.get("ort")           or "").strip() or None
            anzeige    = (r.get("anzeigename")   or code).strip()
            kat        = r.get("kategorie", "Sonstiges")
            if kat not in ("Arbeit", "Frei", "Abwesenheit", "Sonstiges"):
                kat = "Sonstiges"
            nacht      = 1 if r.get("ist_nachtdienst")    else 0
            ausrueck   = 1 if r.get("ist_ausrueckdienst") else 0
            if "ist_ganztaegig" in r:
                ganztaegig = 1 if r["ist_ganztaegig"] else 0
            else:
                ganztaegig = 1 if (not beginn and not ende) else 0
            exists = conn.execute(
                "SELECT 1 FROM dienst_typen WHERE code = ?", (code,)
            ).fetchone()
            if exists:
                conn.execute(
                    "UPDATE dienst_typen"
                    " SET anzeigename=?, dienstbeginn=?, dienstende=?, ort=?,"
                    "     kategorie=?, ist_nachtdienst=?, ist_ganztaegig=?, ist_ausrueckdienst=?"
                    " WHERE code=?",
                    (anzeige, beginn, ende, ort, kat, nacht, ganztaegig, ausrueck, code),
                )
            else:
                conn.execute(
                    "INSERT INTO dienst_typen"
                    " (code, anzeigename, dienstbeginn, dienstende, ort, kategorie,"
                    "  ist_nachtdienst, ist_ganztaegig, ist_ausrueckdienst)"
                    " VALUES (?,?,?,?,?,?,?,?,?)",
                    (code, anzeige, beginn, ende, ort, kat, nacht, ganztaegig, ausrueck),
                )
        conn.commit()
        conn.close()
        return jsonify({"ok": True})
    except Exception as exc:
        try:
            conn.close()
        except Exception:
            pass
        return jsonify({"error": str(exc)}), 500
