import json
import subprocess
import sys

from flask import Blueprint, Response, jsonify, request, send_file

from config import BASE_DIR, ICON_MAPPING_DIR, PDF_DIR
from tasks import start_task

PDF_ARCHIV_DIR = BASE_DIR / "pdf_archiv"

bp = Blueprint("werkzeuge", __name__)

_icon_html_cache: str | None = None
_icon_html_alle_cache: str | None = None


def _make_save_injection() -> str:
    return """
<script>
(function() {
  window.saveMapping = function() {
    // Bestehende Mappings als Basis (Globals aus build_html) – Icons anderer PDFs bleiben erhalten
    const mapping    = Object.assign({}, typeof existingMapping    !== 'undefined' ? existingMapping    : {});
    const barMapping = Object.assign({}, typeof existingBarMapping !== 'undefined' ? existingBarMapping : {});

    document.querySelectorAll('.code-input').forEach(function(inp) {
      let code       = inp.value.trim();
      const hash     = inp.dataset.hash;
      const isBar    = inp.dataset.typ === 'bar';
      const target   = isBar ? barMapping : mapping;
      const other    = isBar ? mapping    : barMapping;
      const storeKey = isBar ? hash.toUpperCase() : hash;
      if (code && code !== '?') {
        code = code.replace(/\\.png$/i, '');
        target[storeKey] = code;
        delete other[storeKey];
        delete other[hash];
      } else if (storeKey in target) {
        delete target[storeKey];
      }
    });

    // Ganztag: bestehende Einträge behalten, nur sichtbare Checkboxen aktualisieren
    const localGanztaegig = new Set(typeof ganztaegigSet !== 'undefined' ? ganztaegigSet : []);
    document.querySelectorAll('.ganztag-input').forEach(function(cb) {
      const row  = cb.closest('tr');
      const inp  = row ? row.querySelector('.code-input') : null;
      const code = (inp ? inp.value.trim().replace(/\\.png$/i, '') : '') || cb.dataset.code || '';
      if (!code) return;
      if (cb.checked) localGanztaegig.add(code);
      else            localGanztaegig.delete(code);
    });

    // ICS-Zusatz: gleiche Logik
    const localIcsZusatz = new Set(typeof icsZusatzSet !== 'undefined' ? icsZusatzSet : []);
    document.querySelectorAll('.ics-zusatz-input').forEach(function(cb) {
      const row  = cb.closest('tr');
      const inp  = row ? row.querySelector('.code-input') : null;
      const code = (inp ? inp.value.trim().replace(/\\.png$/i, '') : '') || cb.dataset.code || '';
      if (!code) return;
      if (cb.checked) localIcsZusatz.add(code);
      else            localIcsZusatz.delete(code);
    });

    // Ignoriert: bestehende Liste als Basis, Änderungen aus sichtbaren Checkboxen/Feldern einarbeiten
    const localIgn  = new Set(typeof ignoriert       !== 'undefined' ? ignoriert       : []);
    const localIgnB = new Set(typeof ignoriertBalken !== 'undefined' ? ignoriertBalken : []);
    document.querySelectorAll('.ignore-cb').forEach(function(cb) {
      const hash     = cb.dataset.hash;
      const isBar    = cb.dataset.typ === 'bar';
      const storeKey = isBar ? hash.toUpperCase() : hash;
      if (cb.checked) { if (isBar) localIgnB.add(storeKey); else localIgn.add(storeKey); }
      else            { if (isBar) localIgnB.delete(storeKey); else localIgn.delete(storeKey); }
    });
    document.querySelectorAll('.code-input').forEach(function(inp) {
      const code     = inp.value.trim().replace(/\\.png$/i, '');
      const hash     = inp.dataset.hash;
      const isBar    = inp.dataset.typ === 'bar';
      const storeKey = isBar ? hash.toUpperCase() : hash;
      if (inp.closest('tr') && inp.closest('tr').dataset.ignored === '1') return;
      if (!code || code === '?') { if (isBar) localIgnB.add(storeKey); else localIgn.add(storeKey); }
      else                       { if (isBar) localIgnB.delete(storeKey); else localIgn.delete(storeKey); }
    });

    const combined = {
      mapping:          mapping,
      bar_mapping:      barMapping,
      ganztaegig:       Array.from(localGanztaegig).sort(),
      ics_zusatz:       Array.from(localIcsZusatz).sort(),
      ics_zeiten:       typeof icsZeitenMap !== 'undefined' ? icsZeitenMap : {},
      ignoriert:        Array.from(localIgn).sort(),
      ignoriert_balken: Array.from(localIgnB).sort()
    };
    fetch('/api/icon/save', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(combined)
    }).then(function(r) { return r.json(); }).then(function(d) {
      if (!d.ok) return;
      window.parent.postMessage('icon-saved', '*');
      const t = document.getElementById('toast');
      if (t) { t.style.display = 'block'; setTimeout(function() { t.style.display = 'none'; }, 3000); }
      document.querySelectorAll('.code-input').forEach(function(inp) {
        inp.classList.remove('changed');
        if (inp.value.trim()) inp.classList.add('filled');
        const idx = inp.id.replace('input-', '');
        const s = document.getElementById('status-' + idx);
        if (s) s.textContent = inp.value.trim() ? '\\u2705' : '\\u2b1c';
        const tr = inp.closest('tr');
        if (tr) tr.dataset.hasCode = inp.value.trim() ? '1' : '0';
      });
      if (typeof updateCounter === 'function') updateCounter();
    });
  };
})();
</script>
"""


@bp.route("/api/tool/<name>", methods=["POST"])
def api_tool(name: str):
    if name == "backup":
        return jsonify({"task_id": start_task([sys.executable, "lib/db_backup.py"])})
    return jsonify({"error": f"Unbekanntes Werkzeug: {name}"})


@bp.route("/api/backup/list")
def api_backup_list():
    from lib.db_backup import BACKUP_DIR, BACKUP_PREFIX, ICON_MAPPING_PREFIX, CONFIG_PREFIX
    from datetime import datetime as dt
    if not BACKUP_DIR.exists():
        return jsonify([])
    backups = []
    for db_file in sorted(BACKUP_DIR.glob(f"{BACKUP_PREFIX}*.db"),
                          key=lambda p: p.stat().st_mtime, reverse=True):
        ts = db_file.name[len(BACKUP_PREFIX):-3]
        mtime = db_file.stat().st_mtime
        size = db_file.stat().st_size
        if size < 1024:
            size_str = f"{size} B"
        elif size < 1024 ** 2:
            size_str = f"{size / 1024:.1f} KB"
        else:
            size_str = f"{size / 1024 ** 2:.1f} MB"
        icon_file = BACKUP_DIR / f"{ICON_MAPPING_PREFIX}{ts}.json"
        config_file = BACKUP_DIR / f"{CONFIG_PREFIX}{ts}.py"
        backups.append({
            "timestamp": ts,
            "date": dt.fromtimestamp(mtime).strftime("%d.%m.%Y %H:%M"),
            "db": db_file.name,
            "db_size": size_str,
            "icon_mapping": icon_file.name if icon_file.exists() else None,
            "config": config_file.name if config_file.exists() else None,
        })
    return jsonify(backups)


@bp.route("/api/backup/upload", methods=["POST"])
def api_backup_upload():
    import re
    import sqlite3
    import tempfile
    from datetime import datetime
    from lib.db_backup import BACKUP_DIR, BACKUP_PREFIX, integrity_ok

    file = request.files.get("db")
    if not file:
        return jsonify({"error": "Keine Datei empfangen"}), 400
    if not (file.filename or "").lower().endswith(".db"):
        return jsonify({"error": "Nur .db-Dateien erlaubt"}), 400

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)

    tmp_fd, tmp_name = tempfile.mkstemp(suffix=".db", dir=str(BACKUP_DIR))
    tmp_path = Path(tmp_name)
    try:
        import os
        os.close(tmp_fd)
        file.save(str(tmp_path))

        if not integrity_ok(tmp_path):
            return jsonify({"error": "Datei ist keine gültige SQLite-Datenbank oder beschädigt"}), 400

        conn = sqlite3.connect(str(tmp_path))
        tables = {r[0] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()}
        conn.close()
        if not {"mitarbeiter", "schichten", "dienst_typen"}.issubset(tables):
            return jsonify({"error": "Datei ist keine Dienstplan-Datenbank (Pflicht-Tabellen fehlen)"}), 400

        timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        dest = BACKUP_DIR / f"{BACKUP_PREFIX}{timestamp}.db"
        tmp_path.rename(dest)
        tmp_path = None

        sz = dest.stat().st_size
        size_str = (f"{sz} B" if sz < 1024
                    else f"{sz / 1024:.1f} KB" if sz < 1024 ** 2
                    else f"{sz / 1024 ** 2:.1f} MB")
        return jsonify({"ok": True, "filename": dest.name,
                        "timestamp": timestamp, "db_size": size_str})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
    finally:
        if tmp_path and tmp_path.exists():
            tmp_path.unlink()


@bp.route("/api/backup/restore", methods=["POST"])
def api_backup_restore():
    import re
    from lib.db_backup import BACKUP_DIR, BACKUP_PREFIX
    data = request.get_json() or {}
    filename = (data.get("filename") or "").strip()
    allowed = re.compile(r"^" + re.escape(BACKUP_PREFIX) + r"[\w\-]+\.db$")
    if not allowed.match(filename):
        return jsonify({"error": "Ungültiger Dateiname"}), 400
    path = BACKUP_DIR / filename
    if not path.exists():
        return jsonify({"error": "Backup nicht gefunden"}), 404
    return jsonify({"task_id": start_task(
        [sys.executable, "lib/db_backup.py", "--restore", str(path)],
        log_label="restore",
    )})


@bp.route("/download/backup/<filename>")
def download_backup(filename: str):
    import re
    from lib.db_backup import BACKUP_DIR, BACKUP_PREFIX, ICON_MAPPING_PREFIX, CONFIG_PREFIX
    allowed = re.compile(
        r'^(' + re.escape(BACKUP_PREFIX) + r'|'
              + re.escape(ICON_MAPPING_PREFIX) + r'|'
              + re.escape(CONFIG_PREFIX) + r')[\w\-]+\.(db|json|py)$'
    )
    if not allowed.match(filename):
        return "Ungültiger Dateiname", 400
    path = BACKUP_DIR / filename
    if not path.exists() or not path.is_file():
        return "Datei nicht gefunden", 404
    return send_file(path, as_attachment=True)


@bp.route("/pdf/<path:pdf_ref>")
def serve_pdf(pdf_ref: str):
    from routes.main import _verfuegbare_pdfs
    all_pdfs = _verfuegbare_pdfs()
    pdf = next((p for p in all_pdfs if p["id"] == pdf_ref), None)
    if pdf is None:
        pdf = next((p for p in all_pdfs if p["name"] == pdf_ref), None)
    if not pdf:
        return "PDF nicht gefunden", 404
    path = PDF_DIR / pdf["name"]
    if not path.exists():
        return "Datei nicht gefunden", 404
    return send_file(path, mimetype="application/pdf")


@bp.route("/api/pdf/sync/status")
def api_pdf_sync_status():
    from pdf_sync import get_state, next_sync_str
    from settings import load as _load
    state = get_state()
    s = _load()
    aktiv   = bool(s.get("pdf_sync_aktiv"))
    uhrzeit = (s.get("pdf_sync_uhrzeit") or "03:00").strip()
    return jsonify({
        **state,
        "naechster_sync": next_sync_str(uhrzeit) if aktiv else None,
    })


@bp.route("/api/pdf/sync/jetzt", methods=["POST"])
def api_pdf_sync_jetzt():
    from pdf_sync import sync_once
    result = sync_once()
    return jsonify(result)


@bp.route("/api/pdf/list")
def api_pdf_list():
    import hashlib
    from routes.main import _parse_monat_jahr
    if not PDF_DIR.exists():
        return jsonify([])
    result = []
    for p in PDF_DIR.glob("*.pdf"):
        pdf_id = hashlib.md5(p.name.encode()).hexdigest()[:8]
        monat, jahr = _parse_monat_jahr(p.name)
        result.append({"id": pdf_id, "name": p.name, "monat": monat, "jahr": jahr})
    result.sort(key=lambda x: x["name"].lower())
    return jsonify(result)


@bp.route("/api/pdf/upload", methods=["POST"])
def api_pdf_upload():
    import hashlib
    import os
    import re
    from routes.main import _parse_monat_jahr
    file = request.files.get("pdf")
    if not file or not file.filename:
        return jsonify({"error": "Keine Datei übermittelt"}), 400
    raw_name = os.path.basename(file.filename.replace("\\", "/"))
    # Erlaubt: Buchstaben (inkl. Umlaute), Ziffern, Leerzeichen, Bindestrich, Punkt, Unterstrich
    filename = re.sub(r"[^\w\s\-\.]", "", raw_name, flags=re.UNICODE).strip()
    filename = re.sub(r"^\.+", "", filename)  # keine führenden Punkte
    if not filename:
        return jsonify({"error": "Ungültiger Dateiname"}), 400
    if not filename.lower().endswith(".pdf"):
        return jsonify({"error": "Nur PDF-Dateien erlaubt"}), 400
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    monat, jahr = _parse_monat_jahr(filename)
    # Bestehende PDFs desselben Monats (inkl. gleichnamiger Datei) ins Archiv verschieben.
    # Ein Archiv-Fehler darf den Upload nicht verhindern — nur als Warnung zurückgeben.
    archiviert: list = []
    archiv_fehler = ""
    try:
        from lib.pdf_archiv import archiviere_alte_pdfs
        archiviert = archiviere_alte_pdfs(filename)
    except Exception as exc:
        archiv_fehler = str(exc)
    file.save(PDF_DIR / filename)
    pdf_id = hashlib.md5(filename.encode()).hexdigest()[:8]
    resp = {"ok": True, "id": pdf_id, "name": filename, "monat": monat, "jahr": jahr,
            "archiviert": archiviert}
    if archiv_fehler:
        resp["archiv_fehler"] = archiv_fehler
    return jsonify(resp)


@bp.route("/api/auto-import/check", methods=["POST"])
def api_auto_import_check():
    """Prüft für die angegebenen PDFs, ob unbekannte Icons/Balken enthalten sind."""
    from routes.main import _parse_monat_jahr
    names = (request.get_json() or {}).get("pdfs", [])
    if not isinstance(names, list) or not names:
        return jsonify({"error": "Keine PDFs angegeben"}), 400
    import os
    result = []
    for name in names:
        name = str(name).strip()
        if not name or os.sep in name or name.startswith(".") or not name.lower().endswith(".pdf"):
            result.append({"name": name, "error": "Ungültiger Dateiname"})
            continue
        path = PDF_DIR / name
        if not path.exists():
            result.append({"name": name, "error": "Datei nicht gefunden"})
            continue
        monat, jahr = _parse_monat_jahr(name)
        entry = {"name": name, "monat": monat, "jahr": jahr}
        if not monat or not jahr:
            entry["error"] = "Monat/Jahr nicht aus Dateiname erkennbar"
            result.append(entry)
            continue
        try:
            from lib.icon_learn import check_neue_icons
            n_icons, n_balken = check_neue_icons(path)
            entry["neue_icons"]  = n_icons
            entry["neue_balken"] = n_balken
        except Exception as exc:
            entry["error"] = f"Icon-Check fehlgeschlagen: {exc}"
        result.append(entry)
    return jsonify(result)


@bp.route("/api/auto-import/start", methods=["POST"])
def api_auto_import_start():
    """Startet den Import für mehrere PDFs als einen sequenziellen Task (ohne Mail)."""
    from routes.main import _parse_monat_jahr
    from config import MONATE_DE
    data = request.get_json() or {}
    names = data.get("pdfs", [])
    skip_excel = data.get("skip_excel", True)
    if not isinstance(names, list) or not names:
        return jsonify({"error": "Keine PDFs angegeben"}), 400
    import os
    plaene = []
    for name in names:
        name = str(name).strip()
        if not name or os.sep in name or name.startswith(".") or not name.lower().endswith(".pdf"):
            return jsonify({"error": f"Ungültiger Dateiname: {name}"}), 400
        if not (PDF_DIR / name).exists():
            return jsonify({"error": f"Datei nicht gefunden: {name}"}), 400
        monat, jahr = _parse_monat_jahr(name)
        if not monat or not jahr or monat not in MONATE_DE:
            return jsonify({"error": f"Monat/Jahr nicht erkennbar: {name}"}), 400
        plaene.append({"name": name, "monat": monat, "jahr": jahr})

    # Chronologisch importieren (ältester Monat zuerst)
    plaene.sort(key=lambda p: (p["jahr"], MONATE_DE[p["monat"]]))

    cmds = []
    for i, p in enumerate(plaene):
        cmd = [sys.executable, "lib/main_month.py",
               "--month", p["monat"], "--year", str(p["jahr"]),
               "--pdf", p["name"], "--skip-icon-check"]
        if skip_excel:
            cmd.append("--skip-excel")
        if i > 0:
            cmd.append("--no-backup")  # ein Backup vor dem ersten Import genügt
        cmds.append(cmd)

    label = "auto_import_" + "_".join(f"{p['monat']}_{p['jahr']}" for p in plaene[:3])
    task_id = start_task(cmds[0], post_cmds=cmds[1:] or None, log_label=label)
    return jsonify({"task_id": task_id,
                    "plaene": [f"{p['monat']} {p['jahr']}" for p in plaene]})


@bp.route("/api/pdf/archiv", methods=["GET"])
def api_pdf_archiv():
    import os
    from routes.main import _parse_monat_jahr
    if not PDF_ARCHIV_DIR.exists():
        return jsonify([])
    result = []
    for f in PDF_ARCHIV_DIR.glob("*.pdf"):
        name = f.name
        # Format: 2026-06-16T18-30_Originalname.pdf
        sep = name.find("_")
        if sep == 16 and name[10] == "T":
            ts_str   = name[:sep]
            orig     = name[sep + 1:]
            # "2026-06-16T18-30" → "16.06.2026 18:30"
            d = ts_str[:10]
            t = ts_str[11:].replace("-", ":")
            display  = d[8:] + "." + d[5:7] + "." + d[:4] + " " + t
        else:
            orig    = name
            display = ""
        monat, jahr = _parse_monat_jahr(orig)
        result.append({
            "filename":      name,
            "original_name": orig,
            "archived_at":   display,
            "monat":         monat,
            "jahr":          jahr,
        })
    result.sort(key=lambda x: x["filename"], reverse=True)
    return jsonify(result)


@bp.route("/api/pdf/archiv/delete", methods=["POST"])
def api_pdf_archiv_delete():
    import os
    name = (request.get_json() or {}).get("name", "").strip()
    if not name or os.sep in name or name.startswith(".") or not name.lower().endswith(".pdf"):
        return jsonify({"error": "Ungültiger Dateiname"}), 400
    path = PDF_ARCHIV_DIR / name
    if not path.exists():
        return jsonify({"error": "Datei nicht gefunden"}), 404
    path.unlink()
    return jsonify({"ok": True})


@bp.route("/pdf/archiv/<filename>")
def serve_pdf_archiv(filename: str):
    import os
    if os.sep in filename or filename.startswith("."):
        return "Ungültig", 400
    path = PDF_ARCHIV_DIR / filename
    if not path.exists() or not path.is_file():
        return "Nicht gefunden", 404
    return send_file(path, mimetype="application/pdf")


@bp.route("/api/pdf/delete", methods=["POST"])
def api_pdf_delete():
    import hashlib, re, os
    name = (request.get_json() or {}).get("name", "").strip()
    if not name:
        return jsonify({"error": "Kein Dateiname"}), 400
    # Sicherheitscheck: nur einfache Dateinamen ohne Pfad-Traversal
    if os.sep in name or name.startswith(".") or not name.lower().endswith(".pdf"):
        return jsonify({"error": "Ungültiger Dateiname"}), 400
    path = PDF_DIR / name
    if not path.exists() or not path.is_file():
        return jsonify({"error": "Datei nicht gefunden"}), 404
    try:
        path.unlink()
    except Exception as exc:
        return jsonify({"error": f"Löschen fehlgeschlagen: {exc}"}), 500
    return jsonify({"ok": True})


@bp.route("/api/files/excel")
def api_files_excel():
    excel_dir = BASE_DIR / "excel_export"
    if not excel_dir.exists():
        return jsonify([])
    files = sorted(
        [{"name": f.name, "size": f.stat().st_size, "mtime": f.stat().st_mtime}
         for f in excel_dir.glob("*.xlsx") if f.is_file()],
        key=lambda x: x["mtime"], reverse=True,
    )
    return jsonify(files)


@bp.route("/download/excel/<filename>")
def download_excel(filename: str):
    from werkzeug.utils import secure_filename
    path = BASE_DIR / "excel_export" / secure_filename(filename)
    if not path.exists() or not path.is_file():
        return "Datei nicht gefunden", 404
    return send_file(path, as_attachment=True)


_MONAT_NR = {
    "Januar": 1, "Februar": 2, "März": 3, "Maerz": 3, "April": 4,
    "Mai": 5, "Juni": 6, "Juli": 7, "August": 8,
    "September": 9, "Oktober": 10, "November": 11, "Dezember": 12,
}

def _ics_monat_key(p):
    parts = p.name.split("_")
    if len(parts) == 2 and parts[1].isdigit():
        return (int(parts[1]), _MONAT_NR.get(parts[0], 0))
    return (0, 0)


@bp.route("/api/files/ics")
def api_files_ics():
    ics_dir = BASE_DIR / "ics_export"
    if not ics_dir.exists():
        return jsonify([])
    months = []
    for monat_dir in sorted(ics_dir.iterdir(), key=_ics_monat_key, reverse=True):
        if not monat_dir.is_dir():
            continue
        entries = sorted(
            [{"name": f.name, "mtime": f.stat().st_mtime}
             for f in monat_dir.glob("*.ics") if f.is_file()],
            key=lambda x: x["name"],
        )
        if entries:
            months.append({"monat_jahr": monat_dir.name, "files": entries})
    return jsonify(months)


@bp.route("/api/ics/preview")
def api_ics_preview():
    from werkzeug.utils import secure_filename
    monat_jahr = request.args.get("monat_jahr", "").strip()
    filename   = request.args.get("filename",   "").strip()
    if not monat_jahr or not filename:
        return jsonify({"error": "Parameter fehlen"}), 400
    path = BASE_DIR / "ics_export" / secure_filename(monat_jahr) / secure_filename(filename)
    if not path.exists() or not path.is_file():
        return jsonify({"error": "Datei nicht gefunden"}), 404
    try:
        content = path.read_text(encoding="utf-8")
        unfolded = []
        for line in content.splitlines():
            if line and line[0] in (" ", "\t") and unfolded:
                unfolded[-1] += line[1:]
            else:
                unfolded.append(line)
        events, current = [], None
        for line in unfolded:
            s = line.rstrip()
            if s == "BEGIN:VEVENT":
                current = {}
            elif s == "END:VEVENT" and current is not None:
                events.append(current)
                current = None
            elif current is not None and ":" in s:
                key, _, val = s.partition(":")
                current[key.split(";")[0]] = val
        return jsonify(events)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@bp.route("/download/ics/<monat_jahr>/<filename>")
def download_ics(monat_jahr: str, filename: str):
    from werkzeug.utils import secure_filename
    path = BASE_DIR / "ics_export" / secure_filename(monat_jahr) / secure_filename(filename)
    if not path.exists() or not path.is_file():
        return "Datei nicht gefunden", 404
    return send_file(path, as_attachment=True)


@bp.route("/api/icon/generate", methods=["POST"])
def api_icon_generate():
    global _icon_html_cache
    pdf = request.form.get("pdf", "").strip()
    if not pdf:
        return jsonify({"error": "Keine PDF-Datei ausgewählt"})
    pdf_path = PDF_DIR / pdf
    if not pdf_path.exists():
        return jsonify({"error": f"PDF nicht gefunden: {pdf}"})

    result = subprocess.run(
        [sys.executable, "lib/icon_learn.py", "--pdf", str(pdf_path), "--html-only"],
        cwd=str(ICON_MAPPING_DIR.parent), capture_output=True, text=True,
    )
    if result.returncode != 0:
        # Traceback steht am Ende von stderr, nicht am Anfang (davor stehen die INFO-Logzeilen)
        return jsonify({"error": result.stderr[-1500:] or "Fehler beim Generieren"})

    html_path = ICON_MAPPING_DIR / "icon_uebersicht.html"
    if not html_path.exists():
        return jsonify({"error": "HTML-Datei wurde nicht erstellt"})

    raw = html_path.read_text(encoding="utf-8")
    _icon_html_cache = raw.replace("</body>", _make_save_injection() + "\n</body>", 1)
    return jsonify({"ok": True})


@bp.route("/icon-tool")
def icon_tool_page():
    if not _icon_html_cache:
        return "<p>Noch kein PDF geladen. Bitte zuerst ein PDF auswählen und 'Laden' klicken.</p>", 404
    return Response(_icon_html_cache, mimetype="text/html")


@bp.route("/api/icon/save", methods=["POST"])
def api_icon_save():
    try:
        data = request.get_json()
        if not isinstance(data, dict):
            return jsonify({"error": "Ungültige Daten"}), 400
        mapping_path = ICON_MAPPING_DIR / "icon_fingerprint_map.json"
        mapping_path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        return jsonify({"ok": True})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@bp.route("/api/icon/image/<stem>")
def api_icon_image(stem: str):
    """Liefert ein gecachtes Icon-Bild aus icon_cache/."""
    import re
    if not re.fullmatch(r"[a-zA-Z0-9_]+", stem):
        return "Ungültiger Name", 400
    img_path = ICON_MAPPING_DIR / "icon_cache" / (stem + ".png")
    if not img_path.exists():
        return "Nicht gefunden", 404
    return send_file(img_path, mimetype="image/png")


@bp.route("/api/icon/generate-all", methods=["POST"])
def api_icon_generate_all():
    """Erstellt die Gesamtübersicht aus dem Icon-Cache (kein PDF-Scan, sofort)."""
    global _icon_html_alle_cache
    try:
        import sys as _sys
        _sys.path.insert(0, str(BASE_DIR))
        from lib.icon_learn import build_html_from_mapping
        mapping_path = ICON_MAPPING_DIR / "icon_fingerprint_map.json"
        cache_dir    = ICON_MAPPING_DIR / "icon_cache"
        raw = build_html_from_mapping(mapping_path, cache_dir)
        _icon_html_alle_cache = raw.replace("</body>", _make_save_injection() + "\n</body>", 1)
        return jsonify({"ok": True})
    except Exception as exc:
        return jsonify({"error": str(exc)})


@bp.route("/icon-tool-alle")
def icon_tool_alle_page():
    if not _icon_html_alle_cache:
        return "<p>Noch kein Scan durchgeführt. Bitte 'Alle Icons' klicken.</p>", 404
    return Response(_icon_html_alle_cache, mimetype="text/html")


@bp.route("/api/icon/remap-hashes", methods=["POST"])
def api_icon_remap_hashes():
    """Berechnet alle Icon-Hashes aus dem Cache neu (MD5 → aHash) und aktualisiert das Mapping."""
    import sys as _sys
    _sys.path.insert(0, str(BASE_DIR))
    try:
        from PIL import Image

        mapping_path = ICON_MAPPING_DIR / "icon_fingerprint_map.json"
        cache_dir    = ICON_MAPPING_DIR / "icon_cache"

        if not mapping_path.exists():
            return jsonify({"error": "Kein Mapping gefunden"}), 404

        raw = json.loads(mapping_path.read_text(encoding="utf-8"))
        if not isinstance(raw, dict) or "mapping" not in raw:
            return jsonify({"error": "Ungültiges Mapping-Format"}), 400

        def _ahash(img: "Image.Image") -> str:
            gray  = img.convert("L").resize((8, 8), Image.LANCZOS)
            px    = list(gray.getdata())
            avg   = sum(px) / 64
            bits  = "".join("1" if p > avg else "0" for p in px)
            return format(int(bits, 2) if bits else 0, "016x")

        meta_path = cache_dir / "meta.json"
        old_meta: dict = {}
        if meta_path.exists():
            try:
                old_meta = json.loads(meta_path.read_text(encoding="utf-8"))
            except Exception:
                pass

        remapped = 0
        kept     = 0
        rename_map: dict[str, str] = {}  # old_stem → new_stem

        def _remap_key(old_key: str) -> str:
            nonlocal remapped, kept
            is_half_h = old_key.startswith("half_h:")
            old_stem  = ("half_h_" + old_key[7:]) if is_half_h else old_key
            img_path  = cache_dir / (old_stem + ".png") if cache_dir.exists() else None
            if not img_path or not img_path.exists():
                kept += 1
                return old_key
            try:
                new_hash = _ahash(Image.open(img_path))
            except Exception:
                kept += 1
                return old_key
            new_stem = ("half_h_" + new_hash) if is_half_h else new_hash
            new_key  = ("half_h:" + new_hash) if is_half_h else new_hash
            if old_stem != new_stem:
                rename_map[old_stem] = new_stem
            remapped += 1
            return new_key

        raw["mapping"]   = {_remap_key(k): v for k, v in raw.get("mapping", {}).items()}
        raw["ignoriert"] = sorted(set(_remap_key(k) for k in raw.get("ignoriert", [])))

        # PNG-Dateien umbenennen und meta.json aktualisieren
        new_meta = {}
        for old_stem, new_stem in rename_map.items():
            old_path = cache_dir / (old_stem + ".png")
            new_path = cache_dir / (new_stem + ".png")
            if old_path.exists():
                if not new_path.exists():
                    old_path.rename(new_path)
                else:
                    old_path.unlink()
            if old_stem in old_meta:
                new_meta[new_stem] = old_meta[old_stem]

        for stem, entry in old_meta.items():
            if stem not in rename_map and stem not in new_meta:
                new_meta[stem] = entry

        if cache_dir.exists():
            meta_path.write_text(json.dumps(new_meta, indent=2, ensure_ascii=False), encoding="utf-8")

        mapping_path.write_text(json.dumps(raw, indent=2, ensure_ascii=False), encoding="utf-8")
        return jsonify({"ok": True, "remapped": remapped, "kept": kept})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
