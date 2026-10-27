"""
mail_send.py – Manueller ICS-Versand per E-Mail
================================================
Sendet die ICS-Kalender-Dateien an Mitarbeiter.
Zeigt vor dem Senden eine Vorschau und wartet auf Bestätigung.
Jeder Versand wird in der DB (mail_versand_log) protokolliert.

Voraussetzung:
  1. E-Mail-Konfiguration in config.py ausfüllen (SMTP, Adressen)
  2. ICS-Dateien bereits exportiert (db_export_ics.py oder main_month.py)

Passwort-Sicherheit:
  Das SMTP-Passwort wird NIE in config.py oder sonst irgendwo gespeichert.
  Optionen (in Reihenfolge der Empfehlung):
  1. Windows Credential Manager (einmalig einrichten):
       python mail_send.py --passwort-speichern
     → Passwort liegt verschlüsselt im Windows-Keystore, nicht als Klartext
  2. Interaktive Eingabe bei jedem Aufruf (Eingabe unsichtbar, kein Echo)

Aufruf:
  python mail_send.py --month März --year 2026             # alle MA mit E-Mail
  python mail_send.py --month März --year 2026 --name "mustma"
  python mail_send.py --month März --year 2026 --dry-run   # Vorschau, kein Versand
  python mail_send.py --month März --year 2026 --test-an "ich@firma.ch"
  python mail_send.py --month März --year 2026 --nur-aenderungen  # nur geänderte MA
  python mail_send.py --log --month März --year 2026              # Versandhistorie anzeigen
  python mail_send.py --log                                       # komplette Historie
  python mail_send.py --passwort-speichern                 # einmalig einrichten
  python mail_send.py --passwort-loeschen                  # aus Keystore entfernen

--nur-aenderungen:
  Vergleicht den SHA256-Hash der aktuellen ICS-Datei mit dem letzten Versand.
  Nur MA deren Dienstplan sich geändert hat (oder die noch nie eine Mail
  erhalten haben) bekommen eine neue Mail. Ideal für Nachversand nach Korrekturen.
"""

import argparse
import getpass
import hashlib
import logging
import smtplib
import ssl
import sys
from email.mime.base      import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text      import MIMEText
from email import encoders
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import (
    BASE_DIR, MONATE_DE,
    EMAIL_SMTP_HOST, EMAIL_SMTP_PORT, EMAIL_SMTP_USER,
    EMAIL_ABSENDER, EMAIL_BETREFF_TPL, EMAIL_TEXT_TPL, EMAIL_MA_ADRESSEN,
    WEBCAL_BETREFF_TPL, WEBCAL_TEXT_TPL,
)

def get_smtp_token() -> str:
    """Holt den SMTP-Token/Passwort zur Laufzeit (wird nie gespeichert).
    Reihenfolge: Umgebungsvariable (GUI) → interaktive Eingabe im Terminal.
    """
    import os

    # Option A: Umgebungsvariable (gesetzt vom Web-Interface, nie persistent)
    pw = os.environ.get("DIENSTPLAN_SMTP_TOKEN", "").strip()
    if pw:
        log.info("  🔑 Token aus Umgebungsvariable geladen")
        return pw

    # Option B: Interaktive Eingabe (Passwort erscheint nicht auf dem Bildschirm)
    print(f"\n  SMTP-Login: {EMAIL_SMTP_USER} @ {EMAIL_SMTP_HOST}")
    print("  (Proton Mail: SMTP-Token aus Einstellungen → IMAP/SMTP → SMTP-Tokens)")
    pw = getpass.getpass("  Token/Passwort (wird nicht angezeigt): ").strip()
    if not pw:
        raise ValueError("Kein Token/Passwort eingegeben — Abbruch.")
    return pw

def save_smtp_token() -> None:
    """Speichert den SMTP-Token im Windows Credential Manager (einmalig einrichten).
    Aufruf: python mail_send.py --passwort-speichern
    """
    try:
        import keyring
    except ImportError:
        print("  ❌ 'keyring' nicht installiert.")
        print("     Installation: pip install keyring")
        return
    pw = getpass.getpass(
        f"  SMTP-Token für {EMAIL_SMTP_USER} eingeben (wird im Credential Manager gespeichert): "
    ).strip()
    if not pw:
        print("  Abgebrochen.")
        return
    keyring.set_password("Dienstplan Mail", EMAIL_SMTP_USER, pw)
    print(f"  ✅ Token im Credential Manager gespeichert.")
    print(f"     Eintrag: DienstplanSMTP / {EMAIL_SMTP_USER}")
    print(f"     Löschen:  python mail_send.py --passwort-loeschen")

def delete_smtp_token() -> None:
    """Löscht den gespeicherten SMTP-Token aus dem Credential Manager."""
    try:
        import keyring
        keyring.delete_password("Dienstplan Mail", EMAIL_SMTP_USER)
        print("  ✅ Passwort aus Credential Manager gelöscht.")
    except ImportError:
        print("  ❌ 'keyring' nicht installiert.")
    except Exception as e:
        print(f"  ❌ Fehler: {e}")
from db_setup import DB_PATH, get_connection

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

ICS_DIR = BASE_DIR / "ics_export"


# ══════════════════════════════════════════════════════════════════════════════
# MAIL-VERSAND-LOG
# ══════════════════════════════════════════════════════════════════════════════

def ics_hash(ics_path: Path) -> str:
    """SHA256-Hash des ICS-Inhalts ohne DTSTAMP/LAST-MODIFIED (ändern sich bei jedem Export)."""
    stable = [
        line for line in ics_path.read_bytes().splitlines()
        if not line.startswith((b"DTSTAMP:", b"LAST-MODIFIED:"))
    ]
    return hashlib.sha256(b"\n".join(stable)).hexdigest()


def log_versand(conn, kuerzel: str, monat: str, jahr: int,
                empfaenger: str, ics_path: Path, modus: str = "alle") -> None:
    """Schreibt einen Versand-Eintrag in mail_versand_log."""
    # Tabelle anlegen falls noch nicht vorhanden (idempotent)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS mail_versand_log (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            kuerzel     TEXT    NOT NULL,
            monat       TEXT    NOT NULL,
            jahr        INTEGER NOT NULL,
            empfaenger  TEXT    NOT NULL,
            gesendet_am DATETIME DEFAULT (datetime('now')),
            ics_hash    TEXT,
            modus       TEXT    DEFAULT 'alle'
        )""")
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_mail_log_ma_monat
        ON mail_versand_log(kuerzel, monat, jahr)""")
    h = ics_hash(ics_path)
    conn.execute(
        "INSERT INTO mail_versand_log (kuerzel, monat, jahr, empfaenger, ics_hash, modus) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (kuerzel, monat, jahr, empfaenger, h, modus),
    )
    conn.commit()


def letzter_versand(conn, kuerzel: str, monat: str, jahr: int) -> dict | None:
    """Gibt den letzten Versand-Eintrag für MA/Monat zurück oder None."""
    try:
        row = conn.execute("""
            SELECT ics_hash, gesendet_am
            FROM mail_versand_log
            WHERE kuerzel = ? AND monat = ? AND jahr = ?
            ORDER BY gesendet_am DESC LIMIT 1
        """, (kuerzel, monat, jahr)).fetchone()
        return dict(row) if row else None
    except Exception:
        return None


def hat_aenderung(conn, kuerzel: str, monat: str, jahr: int, ics_path: Path) -> bool:
    """True wenn ICS-Inhalt sich seit dem letzten Versand geändert hat (oder noch nie gesendet)."""
    letzter = letzter_versand(conn, kuerzel, monat, jahr)
    if not letzter:
        return True
    return letzter["ics_hash"] != ics_hash(ics_path)


def hat_aenderung_db(conn, kuerzel: str, monat: str, jahr: int) -> bool:
    """DB-basierte Änderungsprüfung für webcal-Modus (kein ICS-File nötig)."""
    letzter = letzter_versand(conn, kuerzel, monat, jahr)
    if not letzter:
        return True
    monat_num = MONATE_DE.get(monat)
    if not monat_num:
        return True
    prefix = f"{jahr}-{monat_num:02d}-%"
    row = conn.execute("""
        SELECT 1 FROM schichten s
        JOIN mitarbeiter m ON m.id = s.mitarbeiter_id
        JOIN import_log il ON il.id = s.import_id
        WHERE m.kuerzel = ? AND s.datum LIKE ?
          AND il.importiert_am > ?
        LIMIT 1
    """, (kuerzel, prefix, letzter["gesendet_am"])).fetchone()
    return row is not None


def show_log(conn, monat: str | None = None, jahr: int | None = None) -> None:
    """Zeigt die Versandhistorie aus mail_versand_log."""
    try:
        where = []
        params = []
        if monat:
            where.append("monat = ?"); params.append(monat)
        if jahr:
            where.append("jahr = ?"); params.append(jahr)
        where_sql = ("WHERE " + " AND ".join(where)) if where else ""

        rows = conn.execute(f"""
            SELECT kuerzel, monat, jahr, empfaenger, gesendet_am, modus
            FROM mail_versand_log
            {where_sql}
            ORDER BY gesendet_am DESC
            LIMIT 200
        """, params).fetchall()
    except Exception:
        print("  ⚠️  Tabelle mail_versand_log nicht gefunden.")
        print("     Zuerst ausführen: python db_migrate_mail_log.py")
        return

    titel = "VERSANDHISTORIE"
    if monat and jahr:
        titel += f"  –  {monat} {jahr}"
    elif monat:
        titel += f"  –  {monat}"
    elif jahr:
        titel += f"  –  {jahr}"

    print(f"\n{'═'*72}")
    print(f"  {titel}  ({len(rows)} Einträge)")
    print(f"{'═'*72}")
    if not rows:
        print("  (keine Einträge)")
    else:
        # Nach Monat/Jahr gruppiert ausgeben
        aktuell_gruppe = None
        for r in rows:
            gruppe = f"{r['monat']} {r['jahr']}"
            if gruppe != aktuell_gruppe:
                print(f"\n  ── {gruppe} {'─'*50}")
                aktuell_gruppe = gruppe
            zeitstempel = str(r["gesendet_am"])[:16]
            modus_flag  = " [nur Änd.]" if r["modus"] == "aenderungen" else ""
            # ICS-Änderungsstatus für diesen Eintrag
            ics_path = find_ics(r["kuerzel"], r["monat"], r["jahr"])
            if ics_path:
                aktueller_hash = ics_hash(ics_path)
                letzter = letzter_versand(conn, r["kuerzel"], r["monat"], r["jahr"])
                if letzter and letzter["ics_hash"] != aktueller_hash:
                    status = "  ⚠️  GEÄNDERT seit Versand"
                else:
                    status = "  ✅ aktuell"
            else:
                status = "  — keine ICS"
            print(f"  {zeitstempel}  {r['kuerzel']:<14} → {r['empfaenger']:<35}{modus_flag}{status}")
    print(f"{'═'*72}\n")



def find_ics(ma_kuerzel: str, monat: str, jahr: int) -> Path | None:
    """Sucht die ICS-Datei für einen MA.
    Sucht zuerst im Unterordner ics_export/Monat_Jahr/, dann im Hauptordner (Fallback).
    """
    safe = ma_kuerzel.replace(" ", "_")
    monat_dir = ICS_DIR / f"{monat}_{jahr}"
    candidates = [
        # Unterordner (neu)
        monat_dir / f"Dienstplan_{safe}_{monat}_{jahr}.ics",
        monat_dir / f"Dienstplan_{ma_kuerzel}_{monat}_{jahr}.ics",
        # Hauptordner (Fallback für ältere Exporte)
        ICS_DIR / f"Dienstplan_{safe}_{monat}_{jahr}.ics",
        ICS_DIR / f"Dienstplan_{ma_kuerzel}_{monat}_{jahr}.ics",
    ]
    for p in candidates:
        if p.exists():
            return p
    # Fuzzy-Suche im Unterordner, dann Hauptordner
    for suchdir in (monat_dir, ICS_DIR):
        for p in suchdir.glob(f"*{safe}*{jahr}*.ics"):
            return p
    return None


def make_attachment_filename(vorname: str, nachname: str, kuerzel: str,
                              monat: str, jahr: int) -> str:
    """Erstellt einen lesbaren Dateinamen für den Mail-Anhang.
    Beispiel: Dienstplan_Mara_von_Allmen_Maerz_2026.ics
    Umlaute werden ersetzt damit der Dateiname in allen Mail-Clients sauber angezeigt wird.
    """
    _umlaut_map = str.maketrans("äöüÄÖÜß", "aouAOUs")

    def _clean(s: str) -> str:
        return s.translate(_umlaut_map).replace(" ", "_")

    name  = f"{vorname}_{nachname}".strip("_") if (vorname or nachname) else kuerzel
    return f"Dienstplan_{_clean(name)}_{_clean(monat)}_{jahr}.ics"


# ══════════════════════════════════════════════════════════════════════════════
# SMTP-VERBINDUNG
# ══════════════════════════════════════════════════════════════════════════════

def smtp_connect():
    """Öffnet SMTP-Verbindung mit STARTTLS.
    Passwort wird zur Laufzeit abgefragt — nie aus config.py gelesen.
    """
    password = get_smtp_token()   # aus Credential Manager oder interaktiv
    log.info("Verbinde mit SMTP-Server %s:%d ...", EMAIL_SMTP_HOST, EMAIL_SMTP_PORT)
    ctx    = ssl.create_default_context()
    server = smtplib.SMTP(EMAIL_SMTP_HOST, EMAIL_SMTP_PORT, timeout=15)
    server.ehlo()
    server.starttls(context=ctx)
    server.ehlo()
    server.login(EMAIL_SMTP_USER, password)
    del password   # sofort aus Arbeitsspeicher entfernen
    log.info("  ✅ SMTP-Login OK")
    return server


# ══════════════════════════════════════════════════════════════════════════════
# MAIL AUFBAUEN
# ══════════════════════════════════════════════════════════════════════════════

def _webcal_url_fuer_token(token: str, kuerzel: str) -> str:
    """Baut die externe Webcal-URL aus Settings + Token."""
    try:
        from settings import load as _ls
        base = (_ls().get("webcal_base_url") or "").rstrip("/")
    except Exception:
        base = ""
    safe = kuerzel.replace(" ", "_")
    path = f"/ics/webcal/{token}/Dienstplan_{safe}.ics"
    if base:
        return base.replace("https://", "webcal://").replace("http://", "webcal://") + path
    return f"webcal://BITTE_BASIS_URL_IN_EINSTELLUNGEN_EINTRAGEN{path}"


def build_webcal_mail(empfaenger: str, ma_kuerzel: str, vorname: str,
                      monat: str, jahr: int, webcal_token: str,
                      nachname: str = "") -> MIMEMultipart:
    """Erstellt eine E-Mail mit dem persönlichen Webcal-Link (kein ICS-Anhang)."""
    webcal_url = _webcal_url_fuer_token(webcal_token, ma_kuerzel)
    betreff = WEBCAL_BETREFF_TPL.format(
        monat=monat, jahr=jahr,
        ma_name=vorname or ma_kuerzel,
        kuerzel=ma_kuerzel,
    )
    text = WEBCAL_TEXT_TPL.format(
        vorname=vorname or ma_kuerzel,
        monat=monat, jahr=jahr,
        kuerzel=ma_kuerzel,
        webcal_link=webcal_url,
    )
    import html as _html
    text_esc  = _html.escape(text)
    url_esc   = _html.escape(webcal_url)
    html_link = f'<a href="{url_esc}" style="word-break:break-all">{url_esc}</a>'
    html_body = (
        '<html><body style="font-family:sans-serif;line-height:1.7;color:#222">'
        '<pre style="font-family:inherit;white-space:pre-wrap;margin:0">'
        + text_esc.replace(url_esc, html_link)
        + '</pre></body></html>'
    )

    msg = MIMEMultipart("alternative")
    msg["From"]    = EMAIL_ABSENDER
    msg["To"]      = empfaenger
    msg["Subject"] = betreff
    msg.attach(MIMEText(text,      "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html",  "utf-8"))
    return msg


def build_mail(empfaenger: str, ma_kuerzel: str, vorname: str,
               monat: str, jahr: int, ics_path: Path,
               nachname: str = "", webcal_token: str | None = None) -> MIMEMultipart:
    """Erstellt die E-Mail mit ICS-Anhang. Optional: Webcal-Link im Text (Modus 'beide')."""
    betreff = EMAIL_BETREFF_TPL.format(
        monat=monat, jahr=jahr,
        ma_name=vorname or ma_kuerzel,
        kuerzel=ma_kuerzel,
    )
    text = EMAIL_TEXT_TPL.format(
        vorname=vorname or ma_kuerzel,
        monat=monat, jahr=jahr,
        kuerzel=ma_kuerzel,
    )
    if webcal_token:
        webcal_url = _webcal_url_fuer_token(webcal_token, ma_kuerzel)
        text += f"\n\nKalender-Abonnement (immer aktuell):\n{webcal_url}\n"

    msg = MIMEMultipart()
    msg["From"]    = EMAIL_ABSENDER
    msg["To"]      = empfaenger
    msg["Subject"] = betreff
    msg.attach(MIMEText(text, "plain", "utf-8"))

    # ICS-Anhang
    ics_data = ics_path.read_bytes()
    part = MIMEBase("text", "calendar", method="PUBLISH")
    part.set_payload(ics_data)
    encoders.encode_base64(part)
    safe_filename = make_attachment_filename(vorname, nachname, ma_kuerzel, monat, jahr)
    part.add_header("Content-Disposition", "attachment", filename=safe_filename)
    part.add_header("Content-Type", "text/calendar", name=safe_filename)
    msg.attach(part)
    return msg


# ══════════════════════════════════════════════════════════════════════════════
# VERSAND-LOGIK
# ══════════════════════════════════════════════════════════════════════════════

def collect_versand_liste(conn, monat: str, jahr: int,
                          nur_kuerzel: str | list[str] | None = None,
                          test_an: str | None = None,
                          nur_aenderungen: bool = False) -> list[dict]:
    """Erstellt die Liste der zu sendenden Mails.
    E-Mail-Adresse: zuerst aus DB (mitarbeiter.email), Fallback auf config.py EMAIL_MA_ADRESSEN.
    """
    # email-Spalte sicherstellen (falls Migration noch nicht gelaufen)
    cols = [r[1] for r in conn.execute("PRAGMA table_info(mitarbeiter)").fetchall()]
    # E-Mail/Token/Modus: eigener Wert oder der eines zusammengeführten Alias-MA
    email_col  = ("COALESCE(NULLIF(m.email,''),"
                  " (SELECT NULLIF(a.email,'') FROM mitarbeiter a"
                  "  WHERE a.zusammengefuehrt_in_id = m.id"
                  "    AND NULLIF(a.email,'') IS NOT NULL LIMIT 1), '')"
                  if "email" in cols else "''")
    token_col  = ("COALESCE(m.webcal_token,"
                  " (SELECT a.webcal_token FROM mitarbeiter a"
                  "  WHERE a.zusammengefuehrt_in_id = m.id"
                  "    AND a.webcal_token IS NOT NULL LIMIT 1)) AS webcal_token"
                  if "webcal_token" in cols else "NULL AS webcal_token")
    modus_col  = "COALESCE(m.webcal_mail_modus,'ics') AS webcal_mail_modus" if "webcal_mail_modus" in cols else "'ics' AS webcal_mail_modus"

    rows = conn.execute(f"""
        SELECT m.kuerzel,
               COALESCE(m.vorname,'')  AS vorname,
               COALESCE(m.nachname,'') AS nachname,
               {email_col} AS db_email,
               {token_col},
               {modus_col}
        FROM mitarbeiter m
        WHERE m.aktiv = 1
        ORDER BY m.kuerzel
    """).fetchall()

    liste = []
    for row in rows:
        kuerzel = row["kuerzel"]
        if nur_kuerzel:
            if isinstance(nur_kuerzel, list):
                if kuerzel.lower() not in [k.lower() for k in nur_kuerzel]:
                    continue
            elif kuerzel.lower() != nur_kuerzel.lower():
                continue

        vorname = row["vorname"]

        # Immer zuerst prüfen ob MA eine Adresse hat — auch im Testmodus
        db_email = (row["db_email"] or "").strip()
        config_email = EMAIL_MA_ADRESSEN.get(kuerzel, "")
        hat_email = bool(db_email or config_email)

        if not hat_email:
            log.debug("  %s: keine E-Mail-Adresse hinterlegt → übersprungen", kuerzel)
            continue

        # Empfänger bestimmen: Testmodus überschreibt Zieladresse, aber nur für MA MIT Adresse
        if test_an:
            empfaenger = test_an
        else:
            empfaenger = db_email or config_email

        modus        = (row["webcal_mail_modus"] or "ics")
        webcal_token = row["webcal_token"]

        # Webcal-only MA erhalten keinen monatlichen Versand — Link wird manuell gesendet
        if modus == "webcal":
            log.debug("  %s: Webcal-Modus → kein monatlicher Versand", kuerzel)
            continue

        # ICS-Datei immer erforderlich für monatlichen Versand
        ics_path = find_ics(kuerzel, monat, jahr)
        if not ics_path:
            log.warning("  %s: ICS-Datei nicht gefunden → übersprungen", kuerzel)
            continue

        # Änderungsprüfung
        aenderung = hat_aenderung(conn, kuerzel, monat, jahr, ics_path)
        if nur_aenderungen and not aenderung:
            log.info("  %s: kein neuer Dienstplan seit letztem Versand → übersprungen", kuerzel)
            continue

        liste.append({
            "kuerzel":      kuerzel,
            "vorname":      row["vorname"],
            "nachname":     row["nachname"],
            "empfaenger":   empfaenger,
            "ics_path":     ics_path,
            "webcal_token": webcal_token if modus == "beide" else None,
            "modus":        modus,
            "aenderung":    aenderung,
        })
    return liste


def vorschau(liste: list[dict], monat: str, jahr: int, dry_run: bool,
             test_an: str | None, nur_aenderungen: bool = False,
             conn=None) -> None:
    """Zeigt Vorschau der geplanten Mails."""
    modus_label = []
    if dry_run:
        modus_label.append("DRY-RUN (kein Versand)")
    if test_an:
        modus_label.append("TEST-MODUS → " + test_an)
    if nur_aenderungen:
        modus_label.append("NUR ÄNDERUNGEN")
    if not modus_label:
        modus_label.append("ECHTER VERSAND")
    modus = " | ".join(modus_label)

    print(f"\n{'═'*65}")
    print(f"  E-MAIL-VERSAND  –  {monat} {jahr}  [{modus}]")
    print(f"{'═'*65}")
    print(f"  SMTP:    {EMAIL_SMTP_HOST}:{EMAIL_SMTP_PORT}")
    print(f"  Von:     {EMAIL_ABSENDER}")
    print(f"  Anzahl:  {len(liste)} Mail(s)")
    print(f"{'─'*65}")
    for e in liste:
        betreff = EMAIL_BETREFF_TPL.format(
            monat=monat, jahr=jahr,
            ma_name=e["vorname"] or e["kuerzel"],
            kuerzel=e["kuerzel"],
        )
        aend_flag = "🆕 NEU/GEÄNDERT" if e.get("aenderung", True) else "♻️  unverändert"
        # Letzter Versand anzeigen
        letzter = letzter_versand(conn, e["kuerzel"], monat, jahr) if conn else None
        letzter_str = f"  (zuletzt: {letzter['gesendet_am'][:16]})" if letzter else "  (noch nie gesendet)"
        print(f"  → {e['empfaenger']:<35}  {aend_flag}{letzter_str}")
        print(f"    Betreff: {betreff}")
    print(f"{'═'*65}\n")


# ══════════════════════════════════════════════════════════════════════════════
# HAUPTPROGRAMM
# ══════════════════════════════════════════════════════════════════════════════

def main() -> None:
    parser = argparse.ArgumentParser(
        description="ICS-Kalender per E-Mail versenden (manuell ausgelöst)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Beispiele:
  python mail_send.py --month März --year 2026 --dry-run
  python mail_send.py --month März --year 2026 --test-an "ich@firma.ch"
  python mail_send.py --month März --year 2026
  python mail_send.py --month März --year 2026 --name "mustma"
  python mail_send.py --month März --year 2026 --nur-aenderungen
""",
    )
    parser.add_argument("--month",    default=None,   help="Monat (z.B. März)")
    parser.add_argument("--year",     default=None,   type=int, help="Jahr")
    parser.add_argument("--log",      action="store_true",
                        help="Versandhistorie anzeigen (ohne --month/--year = alle)")
    parser.add_argument("--name",     action="append", metavar="KÜRZEL",
                        help="Nur diese MA senden (mehrfach verwendbar, z.B. --name mustma --name schmad)")
    parser.add_argument("--dry-run",  action="store_true",
                        help="Vorschau ohne Versand")
    parser.add_argument("--nur-aenderungen", action="store_true",
                        help="Nur MA senden, deren Dienstplan sich seit dem letzten Versand geändert hat")
    parser.add_argument("--test-an",  metavar="EMAIL",
                        help="Alle Mails an diese Adresse senden (Testmodus)")
    parser.add_argument("--db",       default=str(DB_PATH))
    parser.add_argument("--ja",       action="store_true",
                        help="Bestätigung überspringen (für Skript-Automation)")
    parser.add_argument("--passwort-speichern", action="store_true",
                        help="SMTP-Token einmalig im Windows Credential Manager speichern")
    parser.add_argument("--passwort-loeschen",  action="store_true",
                        help="Gespeicherten SMTP-Token aus Credential Manager löschen")
    args = parser.parse_args()

    # Passwort-Verwaltung (kein Versand)
    if args.passwort_speichern:
        save_smtp_token(); sys.exit(0)
    if args.passwort_loeschen:
        delete_smtp_token(); sys.exit(0)

    # --log: Versandhistorie anzeigen, kein Versand
    if args.log:
        conn = get_connection(Path(args.db))
        show_log(conn, monat=args.month, jahr=args.year)
        conn.close()
        sys.exit(0)

    # Für Versand sind Monat und Jahr Pflicht
    if not args.month or not args.year:
        log.error("--month und --year sind erforderlich (ausser bei --log)")
        sys.exit(1)

    if args.month not in MONATE_DE:
        log.error("Unbekannter Monat: %s", args.month)
        sys.exit(1)

    nur_aenderungen = args.nur_aenderungen
    modus_str = "aenderungen" if nur_aenderungen else "alle"

    conn  = get_connection(Path(args.db))
    liste = collect_versand_liste(
        conn, args.month, args.year,
        nur_kuerzel=args.name if args.name else None,
        test_an=args.test_an,
        nur_aenderungen=nur_aenderungen,
    )

    if not liste:
        print("\n⚠️  Keine Mails zu senden.")
        if nur_aenderungen:
            print("   → Kein MA hat einen geänderten Dienstplan seit dem letzten Versand.")
        else:
            print("   Mögliche Ursachen:")
            print("   1. Keine E-Mail-Adressen in config.py eingetragen (EMAIL_MA_ADRESSEN)")
            print("   2. ICS-Dateien noch nicht exportiert (main_month.py ausführen)")
            print("   3. --name stimmt nicht mit einem Kürzel überein")
        conn.close()
        sys.exit(0)

    # Vorschau anzeigen
    vorschau(liste, args.month, args.year, args.dry_run, args.test_an,
             nur_aenderungen=nur_aenderungen, conn=conn)

    if args.dry_run:
        print("ℹ️  DRY-RUN: Kein Versand. Parameter entfernen für echten Versand.")
        conn.close()
        sys.exit(0)

    # Bestätigung einholen
    if not args.ja:
        antwort = input(f"  → {len(liste)} Mail(s) jetzt senden? [j/N] ").strip().lower()
        if antwort not in ("j", "ja", "y", "yes"):
            print("  Abgebrochen.")
            conn.close()
            sys.exit(0)

    # Versand
    print()
    try:
        server = smtp_connect()
    except Exception as e:
        log.error("SMTP-Verbindung fehlgeschlagen: %s", e)
        log.error("Bitte SMTP-Einstellungen in config.py prüfen.")
        conn.close()
        sys.exit(1)

    gesendet = fehler = 0
    try:
        for e in liste:
            try:
                msg = build_mail(
                    e["empfaenger"], e["kuerzel"], e["vorname"],
                    args.month, args.year, e["ics_path"],
                    nachname=e.get("nachname", ""),
                    webcal_token=e.get("webcal_token"),
                )
                server.sendmail(EMAIL_SMTP_USER, [e["empfaenger"]], msg.as_string())
                log.info("  ✅ %s → %s", e["kuerzel"], e["empfaenger"])
                log_versand(conn, e["kuerzel"], args.month, args.year,
                            e["empfaenger"], e["ics_path"], modus=modus_str)
                gesendet += 1
            except Exception as exc:
                log.error("  ❌ %s: %s", e["kuerzel"], exc)
                fehler += 1
    finally:
        server.quit()

    conn.close()
    print(f"\n{'═'*65}")
    print(f"  VERSAND ABGESCHLOSSEN")
    print(f"  ✅ Gesendet: {gesendet}   ❌ Fehler: {fehler}")
    print(f"{'═'*65}\n")
    from db_setup import log_aktivitaet
    log_aktivitaet(
        "mail",
        f"Mail-Versand {args.month} {args.year}",
        f"{gesendet} gesendet, {fehler} Fehler",
        status="ok" if fehler == 0 else "warn",
    )
    if fehler:
        sys.exit(1)


if __name__ == "__main__":
    main()
