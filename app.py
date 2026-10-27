"""
app.py – Flask-Instanz (einmalig erstellt, von allen Routen importiert)
"""
import os
import sys
from pathlib import Path

# Erzwingt UTF-8 für alle lib/*.py-Subprozesse (icon_learn.py, main_month.py, …).
# Ohne das crashen sie unter Windows an Emoji/Sonderzeichen in Log-Ausgaben,
# weil dort die Konsole/Pipe standardmässig cp1252 statt UTF-8 verwendet.
os.environ.setdefault("PYTHONUTF8", "1")

sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent / "lib"))

from flask import Flask

app = Flask(__name__)
try:
    from settings import get_or_create_secret_key
    app.secret_key = get_or_create_secret_key()
except Exception:
    import secrets
    app.secret_key = secrets.token_hex(32)
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0
