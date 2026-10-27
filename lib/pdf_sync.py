"""
pdf_sync.py – Automatische PDF-Synchronisation

Kopiert neue/geänderte PDFs aus einem konfigurierten Quell-Ordner nach PEP_pdf/
und startet für jeden geänderten Plan den Monatslauf automatisch (ohne Mail).
"""
import logging
import shutil
import sys
import threading
import time
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

_log = logging.getLogger(__name__)
_lock = threading.Lock()

_state: dict = {
    "letzter_sync":     None,   # "dd.MM.YYYY HH:mm" or None
    "letztes_ergebnis": None,   # result dict or None
    "laeuft":           False,
}


def _parse_monat_jahr(name: str):
    import re
    from config import MONATE_DE
    m = re.search(r"-\s+(\S+)\s+(\d{4})\.pdf$", name)
    if not m:
        return "", 0
    monat_raw, jahr = m.group(1), int(m.group(2))
    for k in MONATE_DE:
        if k.lower() == monat_raw.lower():
            return k, jahr
    return monat_raw, jahr


def get_state() -> dict:
    return dict(_state)


def next_sync_str(uhrzeit: str) -> str:
    from datetime import timedelta
    try:
        h, m = int(uhrzeit[:2]), int(uhrzeit[3:5])
    except Exception:
        h, m = 3, 0
    now = datetime.now()
    candidate = now.replace(hour=h, minute=m, second=0, microsecond=0)
    if candidate <= now:
        candidate += timedelta(days=1)
    return candidate.strftime("%d.%m.%Y %H:%M")


def sync_once() -> dict:
    if _state["laeuft"]:
        return {"ok": False, "error": "Sync läuft bereits"}
    with _lock:
        _state["laeuft"] = True
        try:
            return _do_sync()
        finally:
            _state["laeuft"] = False


def _do_sync() -> dict:
    from settings import load as _load
    from config import PDF_DIR

    s = _load()
    sync_dir = (s.get("pdf_sync_ordner") or "").strip()

    if not sync_dir:
        result = {"ok": False, "error": "Kein Sync-Ordner konfiguriert"}
        _finish(result)
        return result

    sync_path = Path(sync_dir)
    if not sync_path.exists():
        result = {"ok": False, "error": f"Ordner nicht gefunden: {sync_dir}"}
        _finish(result)
        return result

    PDF_DIR.mkdir(parents=True, exist_ok=True)

    copied = []
    errors = []

    for src in sorted(sync_path.glob("*.pdf")):
        dest = PDF_DIR / src.name
        try:
            src_mtime  = src.stat().st_mtime
            dest_mtime = dest.stat().st_mtime if dest.exists() else 0
            if src_mtime > dest_mtime + 1:  # +1s Toleranz
                from pdf_archiv import archiviere_alte_pdfs
                archiviere_alte_pdfs(src.name)
                shutil.copy2(src, dest)
                copied.append(src.name)
                _log.info("pdf_sync: kopiert '%s'", src.name)
        except Exception as exc:
            errors.append(f"{src.name}: {exc}")
            _log.warning("pdf_sync: Fehler bei '%s': %s", src.name, exc)

    started = []
    if copied:
        from tasks import start_task
        for name in copied:
            monat, jahr = _parse_monat_jahr(name)
            if monat and jahr:
                cmd = [sys.executable, "lib/main_month.py",
                       "--month", monat, "--year", str(jahr),
                       "--pdf", name, "--skip-icon-check", "--no-backup"]
                start_task(cmd, log_label=f"auto_sync_{monat}_{jahr}")
                started.append(f"{monat} {jahr}")
                _log.info("pdf_sync: Import gestartet für %s %s", monat, jahr)

    result = {
        "ok":        True,
        "kopiert":   copied,
        "importiert": started,
        "fehler":    errors,
    }
    _finish(result)
    return result


def _finish(result: dict) -> None:
    _state["letzter_sync"]     = datetime.now().strftime("%d.%m.%Y %H:%M")
    _state["letztes_ergebnis"] = result


def start_scheduler() -> None:
    t = threading.Thread(target=_scheduler_loop, daemon=True, name="pdf-sync-scheduler")
    t.start()
    _log.info("pdf_sync: Scheduler gestartet")


def _scheduler_loop() -> None:
    last_run_date: date | None = None

    while True:
        time.sleep(60)
        try:
            from settings import load as _load
            s = _load()

            if not s.get("pdf_sync_aktiv"):
                continue

            uhrzeit = (s.get("pdf_sync_uhrzeit") or "03:00").strip()
            try:
                h, m = int(uhrzeit[:2]), int(uhrzeit[3:5])
            except Exception:
                h, m = 3, 0

            now   = datetime.now()
            today = now.date()

            if last_run_date == today:
                continue

            if now.hour > h or (now.hour == h and now.minute >= m):
                last_run_date = today
                _log.info("pdf_sync: Tagesync startet (geplant %s)", uhrzeit)
                sync_once()

        except Exception as exc:
            _log.exception("pdf_sync: Scheduler-Fehler: %s", exc)
