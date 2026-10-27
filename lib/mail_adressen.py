"""
mail_adressen.py – E-Mail-Adressen der MA verwalten
====================================================
Erstellt eine HTML-Seite zum Erfassen der E-Mail-Adressen.
Speichert die Adressen direkt in der Datenbank (mitarbeiter.email).

Aufruf:
  python mail_adressen.py          # HTML erstellen und im Browser öffnen
  python mail_adressen.py --list   # Aktuelle Adressen in der Konsole anzeigen
"""

import argparse
import json
import logging
import sys
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).parent.parent))
from db_setup import DB_PATH, get_connection

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════════════════
# DB: email-Spalte sicherstellen
# ══════════════════════════════════════════════════════════════════════════════

def ensure_email_column(conn) -> None:
    cols = [r[1] for r in conn.execute("PRAGMA table_info(mitarbeiter)").fetchall()]
    if "email" not in cols:
        conn.execute("ALTER TABLE mitarbeiter ADD COLUMN email TEXT")
        conn.commit()
        log.info("Spalte mitarbeiter.email angelegt")


def get_ma_list(conn, monat: str = "", jahr: int | None = None) -> list[dict]:
    ensure_email_column(conn)

    _MONATE_DE = {
        "Januar": 1, "Februar": 2, "März": 3, "Maerz": 3,
        "April": 4, "Mai": 5, "Juni": 6, "Juli": 7,
        "August": 8, "September": 9, "Oktober": 10,
        "November": 11, "Dezember": 12,
    }
    try:
        from config import MONATE_DE as _MONATE_DE  # noqa: F811
    except ImportError:
        pass

    if monat and jahr and monat in _MONATE_DE:
        month_num = _MONATE_DE[monat]
        ym = f"{jahr:04d}-{month_num:02d}"
        # Aktiv = im Schichten-Eintrag für diesen Monat vorhanden.
        # Zusammengeführte MA werden ausgeblendet (gelten als 1 MA).
        rows = conn.execute("""
            SELECT m.kuerzel,
                   COALESCE(m.vorname,'') AS vorname,
                   COALESCE(m.nachname,'') AS nachname,
                   m.pensum_pct,
                   CASE WHEN EXISTS (
                       SELECT 1 FROM schichten s
                       WHERE s.mitarbeiter_id = m.id
                         AND strftime('%Y-%m', s.datum) = ?
                   ) THEN 1 ELSE 0 END AS aktiv,
                   COALESCE(NULLIF(m.email,''),
                            (SELECT NULLIF(a.email,'') FROM mitarbeiter a
                             WHERE a.zusammengefuehrt_in_id = m.id
                               AND NULLIF(a.email,'') IS NOT NULL LIMIT 1),
                            '') AS email,
                   COALESCE(m.nie_aktivieren, 0) AS nie_aktivieren,
                   COALESCE(m.webcal_token,
                            (SELECT a.webcal_token FROM mitarbeiter a
                             WHERE a.zusammengefuehrt_in_id = m.id
                               AND a.webcal_token IS NOT NULL LIMIT 1)
                   ) AS webcal_token,
                   COALESCE(m.webcal_mail_modus, 'ics') AS webcal_mail_modus
            FROM mitarbeiter m
            WHERE m.zusammengefuehrt_in_id IS NULL
            ORDER BY m.nachname, m.vorname, m.kuerzel
        """, (ym,)).fetchall()
        return [dict(r) for r in rows]

    # Ohne Monatsangabe: globalen aktiv-Flag verwenden, zusammengeführte ausblenden
    rows = conn.execute("""
        SELECT m.kuerzel,
               COALESCE(m.vorname,'') AS vorname,
               COALESCE(m.nachname,'') AS nachname,
               m.pensum_pct,
               m.aktiv,
               COALESCE(NULLIF(m.email,''),
                        (SELECT NULLIF(a.email,'') FROM mitarbeiter a
                         WHERE a.zusammengefuehrt_in_id = m.id
                           AND NULLIF(a.email,'') IS NOT NULL LIMIT 1),
                        '') AS email,
               COALESCE(m.nie_aktivieren, 0) AS nie_aktivieren,
               COALESCE(m.webcal_token,
                        (SELECT a.webcal_token FROM mitarbeiter a
                         WHERE a.zusammengefuehrt_in_id = m.id
                           AND a.webcal_token IS NOT NULL LIMIT 1)
               ) AS webcal_token,
               COALESCE(m.webcal_mail_modus, 'ics') AS webcal_mail_modus
        FROM mitarbeiter m
        WHERE m.zusammengefuehrt_in_id IS NULL
        ORDER BY m.nachname, m.vorname, m.kuerzel
    """).fetchall()
    return [dict(r) for r in rows]


def save_emails(conn, data: dict) -> int:
    """Speichert E-Mail-Adressen aus {kuerzel: email} Dict. Gibt Anzahl Updates zurück."""
    ensure_email_column(conn)
    updated = 0
    for kuerzel, email in data.items():
        email = email.strip()
        conn.execute(
            "UPDATE mitarbeiter SET email = ? WHERE kuerzel = ?",
            (email or None, kuerzel)
        )
        updated += 1
    conn.commit()
    return updated


# ══════════════════════════════════════════════════════════════════════════════
# HTML GENERIEREN
# ══════════════════════════════════════════════════════════════════════════════

def build_html(ma_list: list[dict]) -> str:
    aktive   = [m for m in ma_list if m["aktiv"]]
    inaktive = [m for m in ma_list if not m["aktiv"]]

    def ma_row(m: dict, idx: int) -> str:
        name = f"{m['vorname']} {m['nachname']}".strip() or m["kuerzel"]
        pensum = m["pensum_pct"]
        email  = m["email"] or ""
        aktiv_badge = "" if m["aktiv"] else '<span class="badge-inaktiv">inaktiv</span>'
        return f"""
        <tr class="{'row-inaktiv' if not m['aktiv'] else ''}">
            <td class="td-num">{idx}</td>
            <td class="td-kuerzel"><code>{m['kuerzel']}</code></td>
            <td class="td-name">{name} {aktiv_badge}</td>
            <td class="td-pensum">{pensum}%</td>
            <td class="td-email">
                <input type="email"
                       class="email-input {'filled' if email else ''}"
                       data-kuerzel="{m['kuerzel']}"
                       value="{email}"
                       placeholder="email@firma.ch"
                       oninput="markChanged(this)"
                       autocomplete="off"
                />
                {'<span class="status-ok">✅</span>' if email else '<span class="status-leer">–</span>'}
            </td>
        </tr>"""

    rows_aktiv   = "\n".join(ma_row(m, i+1)   for i, m in enumerate(aktive))
    rows_inaktiv = "\n".join(ma_row(m, i+1) for i, m in enumerate(inaktive))

    n_mit_email  = sum(1 for m in aktive if m["email"])
    n_aktiv      = len(aktive)

    return f"""<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<title>Dienstplan – E-Mail-Adressen</title>
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         background: #f5f7fa; color: #1a1a2e; padding: 24px; }}
  h1   {{ font-size: 1.5rem; font-weight: 700; margin-bottom: 4px; }}
  .subtitle {{ color: #666; font-size: 0.9rem; margin-bottom: 24px; }}
  .card {{ background: #fff; border-radius: 10px; box-shadow: 0 2px 8px #0001;
           padding: 20px; margin-bottom: 20px; }}
  .card h2 {{ font-size: 1rem; font-weight: 600; margin-bottom: 14px;
              color: #333; border-bottom: 1px solid #eee; padding-bottom: 8px; }}
  table {{ width: 100%; border-collapse: collapse; }}
  th   {{ text-align: left; font-size: 0.8rem; font-weight: 600; color: #888;
          text-transform: uppercase; letter-spacing: .04em;
          padding: 6px 10px; border-bottom: 2px solid #eee; }}
  td   {{ padding: 7px 10px; border-bottom: 1px solid #f0f0f0; vertical-align: middle; }}
  tr:last-child td {{ border-bottom: none; }}
  .td-num     {{ width: 40px; color: #aaa; font-size: 0.85rem; }}
  .td-kuerzel {{ width: 160px; }}
  .td-name    {{ }}
  .td-pensum  {{ width: 70px; text-align: right; color: #666; font-size: 0.9rem; }}
  .td-email   {{ width: 340px; }}
  code {{ background: #f0f4ff; padding: 2px 6px; border-radius: 4px;
          font-size: 0.85rem; color: #3a5bcc; }}
  .email-input {{
    width: 100%; padding: 6px 10px; border: 1.5px solid #ddd;
    border-radius: 6px; font-size: 0.9rem; transition: border-color .15s;
    background: #fafafa;
  }}
  .email-input:focus {{ outline: none; border-color: #3a5bcc; background: #fff; box-shadow: 0 0 0 3px rgba(58,91,204,.15); }}
  .email-input.filled {{ background: #f0fff4; border-color: #52c41a; }}
  .email-input.changed {{ border-color: #f5a623 !important; background: #fffbf0; }}
  .status-ok   {{ color: #52c41a; font-size: 0.85rem; margin-left: 6px; }}
  .status-leer {{ color: #ccc;    font-size: 0.85rem; margin-left: 6px; }}
  .badge-inaktiv {{ background: #f5f5f5; color: #999; font-size: 0.7rem;
                   padding: 1px 6px; border-radius: 10px; margin-left: 6px; }}
  .row-inaktiv td {{ color: #bbb; }}
  .row-inaktiv .email-input {{ opacity: 0.5; }}
  .toolbar {{ display: flex; gap: 10px; align-items: center; margin-bottom: 20px; flex-wrap: wrap; }}
  .btn {{ padding: 9px 20px; border-radius: 7px; border: none; cursor: pointer;
          font-size: 0.9rem; font-weight: 600; transition: all .15s; font-family: inherit; }}
  .btn-save {{ background: #3a5bcc; color: #fff; }}
  .btn-save:hover {{ background: #2d4aaa; }}
  .btn-save:disabled {{ background: #aaa; cursor: not-allowed; }}
  .btn-clear {{ background: #fff; color: #e53935; border: 1.5px solid #e53935; }}
  .btn-clear:hover {{ background: #fff5f5; }}
  .counter {{ color: #666; font-size: 0.9rem; }}
  .counter span {{ font-weight: 700; color: #3a5bcc; }}
  .toast {{ display: none; position: fixed; bottom: 24px; right: 24px;
            background: #52c41a; color: #fff; padding: 12px 24px;
            border-radius: 8px; font-weight: 600; box-shadow: 0 4px 12px #0003;
            z-index: 999; }}
  .toast.error {{ background: #e53935; }}
  details {{ margin-top: 12px; }}
  summary {{ cursor: pointer; color: #666; font-size: 0.9rem; padding: 6px 0; }}
  .hint-box {{ background: #f0f4ff; border-left: 3px solid #3a5bcc;
               padding: 12px 16px; border-radius: 0 6px 6px 0;
               margin-bottom: 16px; font-size: 0.9rem; line-height: 1.6; }}
  .hint-box code {{ background: #dde8ff; }}
</style>
</head>
<body>

<h1>📧 E-Mail-Adressen Dienstplan</h1>
<p class="subtitle">Wer eine E-Mail-Adresse eingetragen hat, erhält den Dienstplan automatisch per Mail.</p>

<div class="hint-box">
  <strong>So funktioniert es:</strong><br>
  Trage die E-Mail-Adresse für jeden MA ein der den Dienstplan per Mail erhalten möchte.
  Felder die leer bleiben werden beim Versand übersprungen — jeder MA entscheidet selbst.
  Nach dem Speichern werden die Adressen in der Datenbank gespeichert und beim nächsten
  <code>mail_send.py</code> automatisch verwendet.
</div>

<div class="toolbar">
  <button class="btn btn-save" id="btn-save" onclick="saveAll()">💾 Speichern</button>
  <button class="btn btn-clear" onclick="clearAll()">✕ Alle löschen</button>
  <span class="counter">
    Aktive MA mit E-Mail: <span id="counter">{n_mit_email}</span> / {n_aktiv}
  </span>
</div>

<div class="card">
  <h2>Aktive Mitarbeiter ({n_aktiv})</h2>
  <table>
    <thead>
      <tr>
        <th>#</th><th>Kürzel</th><th>Name</th><th>Pensum</th><th>E-Mail-Adresse</th>
      </tr>
    </thead>
    <tbody id="tbody-aktiv">
      {rows_aktiv}
    </tbody>
  </table>
</div>

{'<details><summary>Inaktive Mitarbeiter (' + str(len(inaktive)) + ')</summary><div class="card" style="margin-top:8px"><table><thead><tr><th>#</th><th>Kürzel</th><th>Name</th><th>Pensum</th><th>E-Mail-Adresse</th></tr></thead><tbody>' + rows_inaktiv + '</tbody></table></div></details>' if inaktive else ''}

<div class="toast" id="toast">✅ Gespeichert!</div>

<script>
const API = '/save';

function markChanged(inp) {{
  inp.classList.add('changed');
  inp.classList.remove('filled');
  document.getElementById('btn-save').disabled = false;
}}

function updateCounter() {{
  const n = document.querySelectorAll('.email-input.filled').length
          + document.querySelectorAll('.email-input.changed').length;
  // zähle nur filled + non-empty changed
  let count = 0;
  document.querySelectorAll('.email-input').forEach(inp => {{
    if (inp.value.trim()) count++;
  }});
  document.getElementById('counter').textContent = count;
}}

async function saveAll() {{
  const btn = document.getElementById('btn-save');
  btn.disabled = true;
  btn.textContent = '⏳ Speichere...';

  const data = {{}};
  document.querySelectorAll('.email-input').forEach(inp => {{
    data[inp.dataset.kuerzel] = inp.value.trim();
  }});

  try {{
    const resp = await fetch(API, {{
      method: 'POST',
      headers: {{'Content-Type': 'application/json'}},
      body: JSON.stringify(data)
    }});
    const result = await resp.json();
    if (result.ok) {{
      // Styling aktualisieren
      document.querySelectorAll('.email-input').forEach(inp => {{
        inp.classList.remove('changed');
        if (inp.value.trim()) {{
          inp.classList.add('filled');
          inp.nextElementSibling.className = 'status-ok';
          inp.nextElementSibling.textContent = '✅';
        }} else {{
          inp.classList.remove('filled');
          inp.nextElementSibling.className = 'status-leer';
          inp.nextElementSibling.textContent = '–';
        }}
      }});
      updateCounter();
      showToast('✅ ' + result.updated + ' Einträge gespeichert', false);
    }} else {{
      showToast('❌ Fehler: ' + result.error, true);
    }}
  }} catch(e) {{
    showToast('❌ Server nicht erreichbar: ' + e, true);
  }}
  btn.textContent = '💾 Speichern';
}}

function clearAll() {{
  if (!confirm('Alle E-Mail-Adressen löschen?')) return;
  document.querySelectorAll('.email-input').forEach(inp => {{
    inp.value = '';
    inp.classList.add('changed');
    inp.classList.remove('filled');
  }});
  updateCounter();
  document.getElementById('btn-save').disabled = false;
}}

function showToast(msg, isError) {{
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast' + (isError ? ' error' : '');
  t.style.display = 'block';
  setTimeout(() => t.style.display = 'none', 3000);
}}

updateCounter();
</script>
</body>
</html>"""


# ══════════════════════════════════════════════════════════════════════════════
# MINI-WEBSERVER
# ══════════════════════════════════════════════════════════════════════════════

class Handler(BaseHTTPRequestHandler):
    db_path: Path = None

    def log_message(self, fmt, *args):
        pass  # HTTP-Logs unterdrücken

    def do_GET(self):
        if self.path == "/" or self.path == "/index.html":
            conn = get_connection(self.db_path)
            ma   = get_ma_list(conn)
            conn.close()
            html = build_html(ma).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", len(html))
            self.end_headers()
            self.wfile.write(html)
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == "/save":
            length = int(self.headers.get("Content-Length", 0))
            body   = self.rfile.read(length)
            try:
                data = json.loads(body)
                conn = get_connection(self.db_path)
                updated = save_emails(conn, data)
                conn.close()
                resp = json.dumps({"ok": True, "updated": updated}).encode()
            except Exception as e:
                log.error("Speicherfehler: %s", e)
                resp = json.dumps({"ok": False, "error": str(e)}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", len(resp))
            self.end_headers()
            self.wfile.write(resp)
        else:
            self.send_response(404)
            self.end_headers()


# ══════════════════════════════════════════════════════════════════════════════
# HAUPTPROGRAMM
# ══════════════════════════════════════════════════════════════════════════════

def main() -> None:
    parser = argparse.ArgumentParser(description="E-Mail-Adressen der MA verwalten")
    parser.add_argument("--db",   default=str(DB_PATH))
    parser.add_argument("--port", default=8766, type=int)
    parser.add_argument("--list", action="store_true", help="Adressen in Konsole anzeigen")
    args = parser.parse_args()

    db_path = Path(args.db)
    conn    = get_connection(db_path)

    if args.list:
        ensure_email_column(conn)
        rows = conn.execute("""
            SELECT kuerzel,
                   COALESCE(vorname||' '||nachname, kuerzel) AS name,
                   COALESCE(email,'—') AS email,
                   aktiv
            FROM mitarbeiter ORDER BY kuerzel
        """).fetchall()
        conn.close()
        print(f"\n{'Kürzel':<20} {'Name':<25} {'E-Mail':<35} Aktiv")
        print("─" * 85)
        for r in rows:
            print(f"{r['kuerzel']:<20} {r['name']:<25} {r['email']:<35} {'✅' if r['aktiv'] else '–'}")
        mit = sum(1 for r in rows if r['email'] != '—' and r['aktiv'])
        print(f"\n{mit} aktive MA mit E-Mail-Adresse")
        return

    conn.close()

    # Webserver starten
    Handler.db_path = db_path
    server = HTTPServer(("127.0.0.1", args.port), Handler)
    url    = f"http://127.0.0.1:{args.port}"

    log.info("🌐 Starte Server auf %s", url)
    t = Thread(target=server.serve_forever, daemon=True)
    t.start()
    webbrowser.open(url)

    print(f"""
┌─────────────────────────────────────────────────────────┐
│  E-MAIL-ADRESSEN VERWALTEN                              │
├─────────────────────────────────────────────────────────┤
│  Browser öffnet sich automatisch.                       │
│  URL: {url:<49}│
│                                                         │
│  1. E-Mail-Adressen eintragen (leer = kein Versand)     │
│  2. 'Speichern' klicken → direkt in DB gespeichert      │
│  3. Dieses Fenster mit Ctrl+C beenden                   │
└─────────────────────────────────────────────────────────┘
""")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n✅ Server beendet.")


if __name__ == "__main__":
    main()
