import sys

from flask import Blueprint, jsonify, request

from config import MONATE_DE, PDF_DIR
from tasks import start_task

bp = Blueprint("monatslauf", __name__)


@bp.route("/api/monatslauf", methods=["POST"])
def api_monatslauf():
    monat   = request.form.get("month",   "").strip()
    jahr    = request.form.get("year",    "").strip()
    pdf     = request.form.get("pdf",     "").strip()
    smtp_pw = request.form.get("smtp_pw", "").strip()
    analyse = request.form.get("analyse", "0") == "1"

    if monat not in MONATE_DE:
        return jsonify({"error": f"Unbekannter Monat: {monat}"})
    if not jahr.isdigit():
        return jsonify({"error": "Ungültiges Jahr"})

    cmd = [sys.executable, "lib/main_month.py", "--month", monat, "--year", jahr, "--skip-icon-check"]
    if pdf:
        cmd += ["--pdf", pdf]
    if request.form.get("dry_run"):
        cmd.append("--dry-run")
    if request.form.get("no_backup"):
        cmd.append("--no-backup")
    if request.form.get("mail"):
        cmd.append("--mail")
        if not smtp_pw:
            return jsonify({"error": "SMTP-Passwort fehlt für Mail-Versand"})
    if request.form.get("nur_aenderungen"):
        cmd.append("--nur-aenderungen")

    # Analyse als Post-Schritt
    post_cmds = None
    if analyse:
        analyse_cmd = [sys.executable, "lib/db_analyse.py", "--export-excel",
                       "--month", monat, "--year", jahr]
        post_cmds = [analyse_cmd]

    env = {"DIENSTPLAN_SMTP_TOKEN": smtp_pw} if smtp_pw else None
    label = f"pep_plan_{monat}_{jahr}"
    return jsonify({"task_id": start_task(cmd, env=env, post_cmds=post_cmds, log_label=label)})


@bp.route("/api/analyse", methods=["POST"])
def api_analyse():
    monat = request.form.get("month", "").strip()
    jahr  = request.form.get("year",  "").strip()
    cmd = [sys.executable, "lib/db_analyse.py", "--export-excel"]
    if monat and monat in MONATE_DE:
        cmd += ["--month", monat]
    if jahr and jahr.isdigit():
        cmd += ["--year", jahr]
    label = f"analyse_{monat}_{jahr}" if monat and jahr else "analyse"
    return jsonify({"task_id": start_task(cmd, log_label=label)})
