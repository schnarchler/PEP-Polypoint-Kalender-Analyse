"""
db_export_ics.py – ICS-Export mit Kollegen-Info aus der DB
===========================================================
ICS-Event pro Dienst:
  Title:       Anzeigename     (z.B. "T1", "BD", "Ferien")
  Location:    Ort             (z.B. "OrtNr1")
  Description: 📍 OrtNr1
               👥 Dienst mit: Hans Muster, Anna Schmidt

Stabile UIDs: jede Schicht hat eine unveränderliche UID (MA-Kürzel + Datum).
  → Beim erneuten Import wird ein bestehendes Kalender-Event automatisch
    überschrieben statt dupliziert.
  → Beim erneuten Import nach einer Dienständerung wird das Event aktualisiert
    (SEQUENCE wird hochgezählt).

Cancel-Modus (--cancel): exportiert VCALENDAR mit METHOD:CANCEL für alle
  Schichten eines Monats → löscht die Einträge aus unterstützten Kalender-Apps
  (Apple Kalender, Outlook, Thunderbird).

Keine externen Abhängigkeiten (kein ics, kein pytz) – reines Python stdlib.
Zeitzone Europe/Zurich wird korrekt mit VTIMEZONE-Block eingebettet.

Aufruf:
  python db_export_ics.py --name "von allmen mara" --month Januar --year 2026
  python db_export_ics.py --alle --month Januar --year 2026
  python db_export_ics.py --name "von allmen mara" --month Januar --year 2026 --mit-frei
  python db_export_ics.py --name "von allmen mara" --month Januar --year 2026 --cancel
"""

import argparse
import logging
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import BASE_DIR, MONATE_DE, TIMEZONE, ICON_MAPPING_DIR
from db_setup import DB_PATH, get_connection


def load_ics_zusatz_codes() -> tuple[set, dict]:
    """Lädt ICS-Export-Codes und Zeiten aus icon_fingerprint_map.json.
    Gibt (codes_set, zeiten_dict) zurück.
    zeiten_dict: {code: {ganztaegig: 0/1, von: "HH:MM", bis: "HH:MM"}}
    """
    mapping_file = ICON_MAPPING_DIR / "icon_fingerprint_map.json"
    if mapping_file.exists():
        import json as _json
        with open(mapping_file) as f:
            raw = _json.load(f)
        if isinstance(raw, dict):
            codes  = set(raw.get("ics_zusatz", []))
            zeiten = raw.get("ics_zeiten", {})
            if codes:
                log.info("ICS-Zusatz-Export: %d Codes: %s", len(codes), ", ".join(sorted(codes)))
            return codes, zeiten
    return set(), {}

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════════════════
# ICS-HILFSFUNKTIONEN (RFC 5545, kein externes Paket nötig)
# ══════════════════════════════════════════════════════════════════════════════

def ics_escape(text: str) -> str:
    """RFC 5545 Text-Escaping."""
    return (text
            .replace("\\", "\\\\")
            .replace(";",  "\\;")
            .replace(",",  "\\,")
            .replace("\n", "\\n"))


def fmt_dt(dt: datetime) -> str:
    return dt.strftime("%Y%m%dT%H%M%S")


def fmt_date(d: date) -> str:
    return d.strftime("%Y%m%d")


# Fester VTIMEZONE-Block für Europe/Zurich (CET/CEST)
VTIMEZONE_ZURICH = (
    "BEGIN:VTIMEZONE\r\n"
    "TZID:Europe/Zurich\r\n"
    "BEGIN:STANDARD\r\n"
    "DTSTART:19961027T030000\r\n"
    "RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10\r\n"
    "TZOFFSETFROM:+0200\r\n"
    "TZOFFSETTO:+0100\r\n"
    "TZNAME:CET\r\n"
    "END:STANDARD\r\n"
    "BEGIN:DAYLIGHT\r\n"
    "DTSTART:19960331T020000\r\n"
    "RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3\r\n"
    "TZOFFSETFROM:+0100\r\n"
    "TZOFFSETTO:+0200\r\n"
    "TZNAME:CEST\r\n"
    "END:DAYLIGHT\r\n"
    "END:VTIMEZONE\r\n"
)


def make_stable_uid(ma_kuerzel: str, datum: str, suffix: str = "") -> str:
    """Stabile, reproduzierbare UID aus MA-Kürzel + Datum.
    Gleiche Schicht → immer gleiche UID → Kalender aktualisiert statt dupliziert.
    """
    safe = ma_kuerzel.lower().replace(" ", "-")
    base = f"dienstplan-{safe}-{datum}"
    if suffix:
        base += f"-{suffix}"
    return base + "@dienstplan"


def build_vevent(summary, description, location, start, end, all_day,
                 uid, tz_str, sequence: int = 0):
    """Erstellt ein VEVENT mit stabiler UID und SEQUENCE für Updates."""
    now_str = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VEVENT",
        f"UID:{uid}",
        f"SEQUENCE:{sequence}",
        f"LAST-MODIFIED:{now_str}",
        f"DTSTAMP:{now_str}",
        f"SUMMARY:{ics_escape(summary)}",
    ]
    if all_day:
        start_date = start if isinstance(start, date) and not isinstance(start, datetime) else start.date()
        end_date   = start_date + timedelta(days=1)
        lines.append(f"DTSTART;VALUE=DATE:{fmt_date(start_date)}")
        lines.append(f"DTEND;VALUE=DATE:{fmt_date(end_date)}")
    else:
        lines.append(f"DTSTART;TZID={tz_str}:{fmt_dt(start)}")
        lines.append(f"DTEND;TZID={tz_str}:{fmt_dt(end)}")
    if location:
        lines.append(f"LOCATION:{ics_escape(location)}")
    if description:
        lines.append(f"DESCRIPTION:{ics_escape(description)}")
    lines.append("END:VEVENT")
    return "\r\n".join(lines) + "\r\n"


def build_vevent_cancel(uid: str, sequence: int, summary: str, datum: str) -> str:
    """Erstellt ein VEVENT mit STATUS:CANCELLED zum Löschen eines Kalender-Eintrags."""
    now_str = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    # SEQUENCE muss beim Cancel höher sein als beim letzten normalen Event
    cancel_seq = sequence + 1
    d = datetime.strptime(datum, "%Y-%m-%d").date()
    lines = [
        "BEGIN:VEVENT",
        f"UID:{uid}",
        f"SEQUENCE:{cancel_seq}",
        f"DTSTAMP:{now_str}",
        f"LAST-MODIFIED:{now_str}",
        f"STATUS:CANCELLED",
        f"SUMMARY:{ics_escape(summary)}",
        f"DTSTART;VALUE=DATE:{fmt_date(d)}",
        f"DTEND;VALUE=DATE:{fmt_date(d + timedelta(days=1))}",
        "END:VEVENT",
    ]
    return "\r\n".join(lines) + "\r\n"


# ══════════════════════════════════════════════════════════════════════════════
# DB-ABFRAGE
# ══════════════════════════════════════════════════════════════════════════════

def get_schichten_for_ma(conn, ma_kuerzel, monat, jahr):
    monat_num = MONATE_DE.get(monat)
    if monat_num is None:
        raise ValueError(f"Unbekannter Monat: {monat}")
    prefix = f"{jahr}-{monat_num:02d}"
    return conn.execute("""
        WITH besetzung AS (
            SELECT
                s2.datum,
                s2.anzeigename          AS dienst,
                COALESCE(s2.ort, '')    AS ort,
                GROUP_CONCAT(
                    COALESCE(m2.vorname || ' ' || m2.nachname, m2.kuerzel), ', '
                ) AS ma_namen_liste
            FROM schichten s2
            JOIN mitarbeiter  m2   ON m2.id      = s2.mitarbeiter_id
            JOIN dienst_typen dt_b ON dt_b.code  = s2.dienst_code
            WHERE dt_b.kategorie = 'Arbeit'
              AND s2.datum LIKE ?
            GROUP BY s2.datum, s2.anzeigename, COALESCE(s2.ort, '')
        )
        SELECT
            s.id AS schicht_id,
            s.datum, s.anzeigename, s.ort,
            s.dienstbeginn, s.dienstende,
            s.dienst_code2,
            dt.anzeigename              AS dienst1_anzeigename,
            dt2.anzeigename             AS dienst2_anzeigename,
            dt2.dienstbeginn            AS dienst2_beginn,
            dt2.dienstende              AS dienst2_ende,
            dt2.ort                     AS dienst2_ort,
            COALESCE(s.ics_sequence, 0)          AS ics_sequence,
            COALESCE(dt.kategorie,      'Arbeit') AS kategorie,
            COALESCE(dt.ist_ganztaegig, 0)        AS ist_ganztaegig,
            COALESCE(dt2.kategorie,     'Arbeit') AS kategorie2,
            COALESCE(dt2.ist_ganztaegig, 0)       AS ist_ganztaegig2,
            b.ma_namen_liste,
            b2.ma_namen_liste           AS dienst2_namen_liste
        FROM schichten s
        JOIN mitarbeiter m  ON s.mitarbeiter_id = m.id
        LEFT JOIN dienst_typen dt  ON s.dienst_code  = dt.code
        LEFT JOIN dienst_typen dt2 ON s.dienst_code2 = dt2.code
        LEFT JOIN besetzung b
            ON  b.datum  = s.datum
            AND b.dienst = s.anzeigename
            AND b.ort    = COALESCE(s.ort, '')
        LEFT JOIN besetzung b2
            ON  b2.datum  = s.datum
            AND b2.dienst = dt2.anzeigename
            AND b2.ort    = COALESCE(dt2.ort, '')
        WHERE m.kuerzel = ? AND s.datum LIKE ?
        ORDER BY s.datum
    """, (f"{prefix}%", ma_kuerzel, f"{prefix}%")).fetchall()


def get_zusatz_for_schicht(conn, schicht_id: int) -> list:
    """Gibt alle Zusatzfunktionen für eine Schicht zurück (nur ICS-markierte)."""
    return conn.execute("""
        SELECT
            sz.zusatz_code,
            zf.anzeigename  AS zusatz_anzeigename,
            COALESCE(zf.kalender_titel, zf.anzeigename) AS kalender_titel,
            COALESCE(sz.farbe_hex, zf.farbe_hex)        AS farbe_hex,
            zf.ics_export
        FROM schicht_zusatz sz
        JOIN zusatzfunktionen zf ON sz.zusatz_code = zf.code
        WHERE sz.schicht_id = ?
        ORDER BY zf.anzeigename
    """, (schicht_id,)).fetchall()


# ══════════════════════════════════════════════════════════════════════════════
# BESCHREIBUNG & ZEITBERECHNUNG
# ══════════════════════════════════════════════════════════════════════════════

def build_description(row, ma_kuerzel, ma_name: str = ""):
    parts = []
    if row["ort"]:
        parts.append(f"📍 {row['ort']}")
    alle_namen = row["ma_namen_liste"] or ""
    if alle_namen:
        # Eigenen Namen aus der Liste herausfiltern — Liste enthält Namen, nicht Kürzel
        eigene = {ma_name.strip(), ma_kuerzel.strip()}
        others = [n.strip() for n in alle_namen.split(",")
                  if n.strip() and n.strip() not in eigene]
        parts.append(f"👥 Dienst mit: {', '.join(others)}" if others else "👤 Einzeldienst")
    else:
        parts.append("👤 Einzeldienst")
    return "\n".join(parts)


def parse_hhmm(t):
    """'HH:MM' → (h, m) oder None."""
    if not t or str(t).strip() in ("", "None", "nan"):
        return None
    parts = str(t).strip().split(":")
    if len(parts) != 2:
        return None
    try:
        return int(parts[0]), int(parts[1])
    except ValueError:
        return None


def compute_start_end(datum, dienstbeginn, dienstende):
    """Gibt naive Lokalzeit-datetimes zurück (Europe/Zurich)."""
    base = datetime.strptime(datum, "%Y-%m-%d")
    sb = parse_hhmm(dienstbeginn)
    se = parse_hhmm(dienstende)

    if sb:
        h, m = sb
        start = (base + timedelta(days=1)).replace(hour=0, minute=m) if h >= 24 \
                else base.replace(hour=h, minute=m)
    else:
        start = base.replace(hour=8, minute=0)

    if se:
        h, m = se
        end = (base + timedelta(days=1)).replace(hour=0, minute=m) if h >= 24 \
              else base.replace(hour=h, minute=m)
    else:
        end = start + timedelta(hours=8)

    if end <= start:
        end += timedelta(days=1)
    return start, end


# ══════════════════════════════════════════════════════════════════════════════
# KALENDER ERSTELLEN & EXPORTIEREN
# ══════════════════════════════════════════════════════════════════════════════

def schichten_to_ics(rows, ma_name, ma_kuerzel, include_frei=False, conn=None,
                     ics_export_codes=None, ics_zeiten=None, cancel=False):
    """Gibt fertigen ICS-String und Anzahl Events zurück.

    cancel=True: exportiert METHOD:CANCEL für alle Einträge (zum Löschen aus dem Kalender).
    """
    method  = "CANCEL" if cancel else "PUBLISH"
    vevents = []

    # sqlite3.Row hat kein .get() — einmalig in dicts konvertieren
    rows = [dict(r) for r in rows]

    # Tage mit mehreren Schichten vorberechnen (½-Icon = 2 Schichten am selben Tag)
    from collections import Counter
    datum_counts = Counter(r["datum"] for r in rows)

    for row in rows:
        try:
            anzeigename = str(row["anzeigename"] or "").strip()
            if not anzeigename:
                continue
            if row["kategorie"] == "Frei" and not include_frei:
                continue

            is_half    = bool(row.get("dienst_code2"))
            ganztaegig = bool(row["ist_ganztaegig"])
            no_times   = not row["dienstbeginn"] and not row["dienstende"]
            sequence   = int(row["ics_sequence"] or 0)

            # Bei ½-Icon: einzelne Anzeigenamen aus dienst_typen statt kombiniertem
            summary1   = str(row.get("dienst1_anzeigename") or anzeigename).strip() if is_half else anzeigename

            uid_suffix = str(row["schicht_id"]) if datum_counts[row["datum"]] > 1 else ""
            uid = make_stable_uid(ma_kuerzel, row["datum"], uid_suffix)

            if cancel:
                vevents.append(build_vevent_cancel(uid, sequence, summary1, row["datum"]))
                if is_half:
                    summary2 = str(row.get("dienst2_anzeigename") or "").strip()
                    uid2 = make_stable_uid(ma_kuerzel, row["datum"], f"{row['schicht_id']}-2")
                    if summary2:
                        vevents.append(build_vevent_cancel(uid2, sequence, summary2, row["datum"]))
                continue

            description = build_description(row, ma_kuerzel, ma_name)
            location    = row["ort"] or ""

            # ── Event 1 (Hauptdienst) ─────────────────────────────────────────
            if ganztaegig or no_times:
                d = datetime.strptime(row["datum"], "%Y-%m-%d").date()
                vevents.append(build_vevent(
                    summary1, description, location,
                    d, d, True, uid, TIMEZONE, sequence,
                ))
            else:
                start, end = compute_start_end(
                    row["datum"], row["dienstbeginn"], row["dienstende"])
                vevents.append(build_vevent(
                    summary1, description, location,
                    start, end, False, uid, TIMEZONE, sequence,
                ))

            # ── Event 2 (nur bei ½-Icon) ─────────────────────────────────────
            if is_half:
                summary2  = str(row.get("dienst2_anzeigename") or "").strip()
                kat2      = str(row.get("kategorie2") or "Arbeit")
                ganztag2  = bool(row.get("ist_ganztaegig2"))
                beginn2   = row.get("dienst2_beginn")
                ende2     = row.get("dienst2_ende")
                no_times2 = not beginn2 and not ende2
                if summary2 and not (kat2 == "Frei" and not include_frei):
                    uid2  = make_stable_uid(ma_kuerzel, row["datum"], f"{row['schicht_id']}-2")
                    d     = datetime.strptime(row["datum"], "%Y-%m-%d").date()
                    loc2  = row.get("dienst2_ort") or ""
                    row2  = dict(row)
                    row2["ort"]           = row.get("dienst2_ort")
                    row2["ma_namen_liste"] = row.get("dienst2_namen_liste")
                    desc2 = build_description(row2, ma_kuerzel, ma_name)
                    if ganztag2 or no_times2:
                        vevents.append(build_vevent(
                            summary2, desc2, loc2,
                            d, d, True, uid2, TIMEZONE, sequence,
                        ))
                    else:
                        start2, end2 = compute_start_end(row["datum"], beginn2, ende2)
                        vevents.append(build_vevent(
                            summary2, desc2, loc2,
                            start2, end2, False, uid2, TIMEZONE, sequence,
                        ))

            # ── Zusatzfunktionen als separate ganztägige Events ───────────────
            if conn and row["schicht_id"]:
                zusatz_list = get_zusatz_for_schicht(conn, row["schicht_id"])
                d_base = datetime.strptime(row["datum"], "%Y-%m-%d").date()
                for zf in zusatz_list:
                    titel = str(zf["kalender_titel"] or zf["zusatz_anzeigename"] or "").strip()
                    if not titel:
                        continue
                    if zf["ics_export"] == 0:
                        if not ics_export_codes or zf["zusatz_code"] not in ics_export_codes:
                            continue
                    zf_uid  = make_stable_uid(ma_kuerzel, row["datum"], zf["zusatz_code"])
                    zf_desc = f"Zusatzfunktion am {summary1}-Dienst"
                    zcode   = zf["zusatz_code"]
                    z_info  = (ics_zeiten or {}).get(zcode, {})
                    ganztag = z_info.get("ganztaegig", 1) != 0
                    if ganztag:
                        vevents.append(build_vevent(
                            titel, zf_desc, "",
                            d_base, d_base, True, zf_uid, TIMEZONE, sequence,
                        ))
                    else:
                        z_start, z_end = compute_start_end(
                            row["datum"],
                            z_info.get("von", "08:00"),
                            z_info.get("bis", "17:00")
                        )
                        vevents.append(build_vevent(
                            titel, zf_desc, "",
                            z_start, z_end, False, zf_uid, TIMEZONE, sequence,
                        ))

        except Exception as exc:
            log.debug("Fehler %s – %s: %s", row["datum"], row["anzeigename"], exc)

    cal = (
        "BEGIN:VCALENDAR\r\n"
        "VERSION:2.0\r\n"
        "PRODID:-//Dienstplan ETL//DE\r\n"
        f"X-WR-CALNAME:Dienstplan {ma_name}\r\n"
        f"X-WR-TIMEZONE:{TIMEZONE}\r\n"
        "CALSCALE:GREGORIAN\r\n"
        f"METHOD:{method}\r\n"
        + VTIMEZONE_ZURICH
        + "".join(vevents)
        + "END:VCALENDAR\r\n"
    )
    return cal, len(vevents)


def export_ics(conn, ma_kuerzel, monat, jahr, output_dir, include_frei=False, cancel=False):
    row = conn.execute(
        "SELECT vorname, nachname FROM mitarbeiter WHERE kuerzel = ?", (ma_kuerzel,)
    ).fetchone()
    ma_name = ma_kuerzel
    if row and (row["vorname"] or row["nachname"]):
        ma_name = f"{row['vorname'] or ''} {row['nachname'] or ''}".strip()

    schichten = get_schichten_for_ma(conn, ma_kuerzel, monat, jahr)
    if not schichten:
        log.warning("Keine Schichten für %s im %s %d", ma_kuerzel, monat, jahr)
        return None

    ics_codes, ics_zeiten = load_ics_zusatz_codes()
    ics_str, added = schichten_to_ics(
        schichten, ma_name, ma_kuerzel, include_frei,
        conn=conn, ics_export_codes=ics_codes, ics_zeiten=ics_zeiten,
        cancel=cancel,
    )

    safe_name  = ma_kuerzel.replace(" ", "_")
    suffix     = "_CANCEL" if cancel else ""
    # Unterordner pro Monat: ics_export/März_2026/
    monat_dir  = output_dir / f"{monat}_{jahr}"
    monat_dir.mkdir(parents=True, exist_ok=True)
    ics_path   = monat_dir / f"Dienstplan_{safe_name}_{monat}_{jahr}{suffix}.ics"
    ics_path.write_text(ics_str, encoding="utf-8")

    aktion = "CANCEL" if cancel else "Export"
    log.info("📅 %s (%s) → %s  (%d Events, %s)", ma_kuerzel, ma_name, ics_path, added, aktion)
    return ics_path


# ══════════════════════════════════════════════════════════════════════════════
# HAUPTPROGRAMM
# ══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="ICS-Export mit Kollegen-Info")
    parser.add_argument("--name",       help="MA-Kürzel (z.B. 'von allmen mara')")
    parser.add_argument("--alle",       action="store_true")
    parser.add_argument("--month",      required=True)
    parser.add_argument("--year",       required=True, type=int)
    parser.add_argument("--output-dir", default=str(BASE_DIR / "ics_export"))
    parser.add_argument("--mit-frei",   action="store_true")
    parser.add_argument("--cancel",     action="store_true",
                        help="Exportiert METHOD:CANCEL-ICS zum Löschen der Einträge aus dem Kalender")
    parser.add_argument("--db",         default=str(DB_PATH))
    args = parser.parse_args()

    if not args.name and not args.alle:
        parser.error("Bitte --name oder --alle angeben.")

    conn       = get_connection(Path(args.db))
    output_dir = Path(args.output_dir)

    ma_list = (
        [r["kuerzel"] for r in conn.execute(
            "SELECT kuerzel FROM mitarbeiter WHERE aktiv = 1 ORDER BY kuerzel"
        ).fetchall()]
        if args.alle else [args.name]
    )

    if args.cancel:
        log.info("🗑️  Cancel-Modus: exportiere CANCEL-ICS zum Löschen der Kalendereinträge")

    exported = sum(
        1 for ma in ma_list
        if export_ics(conn, ma, args.month, args.year, output_dir,
                      args.mit_frei, cancel=args.cancel)
    )
    conn.close()
    monat_dir = output_dir / f"{args.month}_{args.year}"
    aktion = "CANCEL-ICS" if args.cancel else "ICS-Dateien"
    log.info("✅ %d %s exportiert → %s", exported, aktion, monat_dir)


if __name__ == "__main__":
    main()
