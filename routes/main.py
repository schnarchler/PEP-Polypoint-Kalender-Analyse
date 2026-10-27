import hashlib
import queue as _queue
import re
import subprocess
import time
from datetime import date

from flask import Blueprint, Response, render_template, stream_with_context

from config import BASE_DIR, MONATE_DE, PDF_DIR, _SCRIPT_DIR
from tasks import _tasks

bp = Blueprint("main", __name__)

def _static_version() -> str:
    """Versionsstring basierend auf der neuesten JSX/CSS-Änderungszeit — zwingt Browser zur Neuladung."""
    js_dir  = _SCRIPT_DIR / "static" / "js"
    css_dir = _SCRIPT_DIR / "static" / "css"
    newest = 0
    for d in (js_dir, css_dir):
        if d.exists():
            for f in d.iterdir():
                if f.is_file():
                    newest = max(newest, f.stat().st_mtime)
    return str(int(newest)) if newest else str(int(time.time()))


def _compile_jsx() -> None:
    """Kompiliert JSX → JS wenn sich eine JSX-Datei geändert hat."""
    js_dir   = _SCRIPT_DIR / "static" / "js"
    dist_dir = js_dir / "dist"
    jsx_files = list(js_dir.glob("*.jsx"))
    if not jsx_files:
        return
    newest_jsx = max(f.stat().st_mtime for f in jsx_files)
    if dist_dir.exists():
        js_files = list(dist_dir.glob("*.js"))
        if js_files and min(f.stat().st_mtime for f in js_files) >= newest_jsx:
            return  # alles aktuell
    import logging
    log = logging.getLogger(__name__)
    log.info("JSX-Dateien geändert — kompiliere …")
    try:
        result = subprocess.run(
            ["npm", "run", "build"],
            cwd=str(_SCRIPT_DIR),
            capture_output=True, text=True,
        )
        if result.returncode == 0:
            log.info("JSX kompiliert.")
        else:
            log.warning("JSX-Kompilierung fehlgeschlagen:\n%s", result.stderr)
    except FileNotFoundError:
        log.warning("npm nicht gefunden – JSX-Kompilierung übersprungen.")


_compile_jsx()
_STATIC_V = _static_version()


def _parse_monat_jahr(name: str) -> tuple[str, int]:
    """Extrahiert (Monat, Jahr) aus dem PDF-Dateinamen, z. B. '… - Juni 2026.pdf'."""
    m = re.search(r"-\s+(\S+)\s+(\d{4})\.pdf$", name)
    if not m:
        return "", 0
    monat_raw, jahr = m.group(1), int(m.group(2))
    for k in MONATE_DE:
        if k.lower() == monat_raw.lower():
            return k, jahr
    return monat_raw, jahr


def _verfuegbare_pdfs() -> list[dict]:
    if not PDF_DIR.exists():
        return []
    result = []
    for p in PDF_DIR.glob("*.pdf"):
        pdf_id = hashlib.md5(p.name.encode()).hexdigest()[:8]
        monat, jahr = _parse_monat_jahr(p.name)
        result.append({"id": pdf_id, "name": p.name, "monat": monat, "jahr": jahr})
    result.sort(key=lambda x: x["name"].lower())
    return result


def _letzter_import() -> str:
    try:
        from db_setup import get_connection
        conn = get_connection()
        row = conn.execute(
            "SELECT monat, jahr, importiert_am FROM import_log ORDER BY id DESC LIMIT 1"
        ).fetchone()
        conn.close()
        if row:
            return f"{row['monat']} {row['jahr']}  (importiert {row['importiert_am'][:16]})"
    except Exception:
        pass
    return "–"


@bp.route("/")
def index():
    heute = date.today()
    monatsnamen = [k for k in MONATE_DE if k != "Maerz"]
    aktueller_monat = next(
        (k for k, v in MONATE_DE.items() if v == heute.month and k != "Maerz"),
        monatsnamen[0],
    )
    try:
        from settings import is_first_launch as _is_fl
        first_launch = _is_fl()
    except Exception:
        first_launch = False

    try:
        from settings import load as _load_settings
        _settings = _load_settings()
        webcal_base_url  = (_settings.get("webcal_base_url") or "").rstrip("/")
        ort_reihenfolge  = [o.strip() for o in (_settings.get("ort_reihenfolge") or "").split(",") if o.strip()]
        brand_untertitel = (_settings.get("brand_untertitel") or "").strip()
    except Exception:
        webcal_base_url = ""
        ort_reihenfolge = []
        brand_untertitel = ""

    context = {
        "monate":          monatsnamen,
        "aktueller_monat": aktueller_monat,
        "aktuelles_jahr":  heute.year,
        "pdfs":            _verfuegbare_pdfs(),
        "letzter_import":  _letzter_import(),
        "first_launch":    first_launch,
        "base_dir":        str(BASE_DIR),
        "v":               _static_version(),
        "webcal_base_url": webcal_base_url,
        "ort_reihenfolge": ort_reihenfolge,
        "brand_untertitel": brand_untertitel,
    }
    return render_template("index.html", context=context)


@bp.route("/stream/<task_id>")
def stream(task_id: str):
    def generate():
        if task_id not in _tasks:
            yield "data: [Unbekannte Task-ID]\n\n"
            return
        task = _tasks[task_id]
        while True:
            try:
                line = task["queue"].get(timeout=0.3)
                yield f"data: {line}\n\n"
            except _queue.Empty:
                if task["done"]:
                    rc = task["returncode"]
                    yield "data: \n\n"
                    yield "data: ✅  Fertig.\n\n" if rc == 0 else f"data: ❌  Fehler (Exit-Code {rc})\n\n"
                    yield "event: done\ndata: {}\n\n"
                    break

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
