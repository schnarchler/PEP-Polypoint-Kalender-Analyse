#!/usr/bin/env bash
# ============================================================
# start.sh – Dienstplanung Web-Interface starten
# ============================================================
# Aktiviert die virtuelle Umgebung, prüft Abhängigkeiten
# und öffnet das Web-Interface im Browser.
#
# Aufruf:
#   ./start.sh
#   ./start.sh --port 5001
#   ./start.sh --no-browser
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$SCRIPT_DIR/.envPEP"
PYTHON="$VENV_DIR/bin/python"

cd "$SCRIPT_DIR"

# ── 0. config.py sicherstellen ────────────────────────────────────────────────
if [ ! -f "$SCRIPT_DIR/config.py" ]; then
  echo "  config.py nicht gefunden – wird aus config.py.example erstellt..."
  cp "$SCRIPT_DIR/config.py.example" "$SCRIPT_DIR/config.py"
  echo "  → Bitte SMTP und Dienstzeiten unter Einstellungen konfigurieren."
fi

# ── 1. Virtuelle Umgebung sicherstellen ───────────────────────────────────────
if [ ! -f "$PYTHON" ]; then
  echo "  Virtuelle Umgebung nicht gefunden – wird erstellt..."
  python3 -m venv "$VENV_DIR"
fi

# ── 2. Abhängigkeiten prüfen und bei Bedarf installieren ─────────────────────
DEPS_STAMP="$VENV_DIR/.deps_installed"
if [ ! -f "$DEPS_STAMP" ] || [ "$SCRIPT_DIR/requirements.txt" -nt "$DEPS_STAMP" ]; then
  echo "  Abhängigkeiten werden installiert (pip install -r requirements.txt)..."
  "$PYTHON" -m pip install -r requirements.txt -q
  touch "$DEPS_STAMP"
fi

# ── 3. Web-Interface starten ──────────────────────────────────────────────────
echo ""
echo "  Dienstplanung wird gestartet..."

# Wenn kein --port-Argument übergeben: automatisch freien Port wählen (5000 oder 5001)
if [[ " $* " != *" --port "* ]]; then
  if ! ss -tlnp 2>/dev/null | grep -q ':5000 ' && ! nc -z 127.0.0.1 5000 2>/dev/null; then
    PORT_ARG="--port 5000"
  else
    PORT_ARG="--port 5001"
  fi
  exec "$PYTHON" gui.py $PORT_ARG "$@"
fi

exec "$PYTHON" gui.py "$@"
