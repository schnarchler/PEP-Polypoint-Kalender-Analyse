"""Tests – Aufruf aus dem Projektordner:  python -m unittest discover -s tests -t .

Vor jedem Import von Projektmodulen wird eine isolierte Umgebung eingerichtet:
eigenes HOME mit settings.json, deren Datenordner ein Temp-Verzeichnis ist.
So greifen Tests nie auf die echte dienstplan.db oder die echten Einstellungen zu.
"""
import atexit
import json
import logging
import os
import shutil
import sys
import tempfile
from pathlib import Path

PROJEKT = Path(__file__).resolve().parent.parent

_tmp = Path(tempfile.mkdtemp(prefix="dienstplan_tests_"))
atexit.register(shutil.rmtree, _tmp, ignore_errors=True)
DATEN = _tmp / "daten"
DATEN.mkdir()
_settings = _tmp / ".config" / "dienstplanung" / "settings.json"
_settings.parent.mkdir(parents=True)
_settings.write_text(json.dumps({"base_dir": str(DATEN)}), encoding="utf-8")
os.environ["HOME"] = str(_tmp)
os.environ["USERPROFILE"] = str(_tmp)   # Windows: Path.home()

sys.path[:0] = [str(PROJEKT), str(PROJEKT / "lib")]
logging.disable(logging.WARNING)   # Import-Protokoll nicht in die Testausgabe

from config import BASE_DIR  # noqa: E402

if BASE_DIR != DATEN:
    raise RuntimeError(f"Testumgebung nicht isoliert: BASE_DIR={BASE_DIR}")
