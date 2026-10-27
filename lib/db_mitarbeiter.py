"""
db_mitarbeiter.py – Mitarbeiter-Stammdaten verwalten
======================================================
Aufruf:
  python db_mitarbeiter.py --list
  python db_mitarbeiter.py --ohne-namen
  python db_mitarbeiter.py --set "MA 1" --vorname Hans --nachname Muster
  python db_mitarbeiter.py --set "MA 1" --pensum 80
  python db_mitarbeiter.py --import-csv stammdaten.csv
  python db_mitarbeiter.py --export-csv stammdaten.csv
"""

import argparse
import csv
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from db_setup import DB_PATH, get_connection

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)


def list_mitarbeiter(conn, nur_ohne_namen: bool = False) -> None:
    query = "SELECT kuerzel, vorname, nachname, pensum_pct, aktiv FROM mitarbeiter"
    if nur_ohne_namen:
        query += " WHERE vorname IS NULL"
    query += " ORDER BY kuerzel"
    rows = conn.execute(query).fetchall()
    if not rows:
        print("Keine Mitarbeiter gefunden.")
        return
    print(f"\n{'Kürzel':<10} {'Vorname':<15} {'Nachname':<20} {'Pensum':>7} {'Aktiv':>6}")
    print("─" * 62)
    for r in rows:
        print(f"{r['kuerzel']:<10} {r['vorname'] or '–':<15} {r['nachname'] or '–':<20} "
              f"{r['pensum_pct']:>6}% {'✓' if r['aktiv'] else '✗':>6}")
    print(f"\nTotal: {len(rows)}")


def set_mitarbeiter(conn, kuerzel: str, **kwargs) -> None:
    allowed = {"vorname", "nachname", "pensum_pct", "aktiv", "eintrittsdatum", "notizen"}
    updates = {k: v for k, v in kwargs.items() if k in allowed and v is not None}
    if not updates:
        log.warning("Keine gültigen Felder.")
        return
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    result = conn.execute(
        f"UPDATE mitarbeiter SET {set_clause}, geaendert_am = datetime('now') WHERE kuerzel = ?",
        list(updates.values()) + [kuerzel],
    )
    conn.commit()
    if result.rowcount == 0:
        log.warning("Kürzel '%s' nicht gefunden.", kuerzel)
    else:
        log.info("✓ %s aktualisiert: %s", kuerzel, updates)


def import_from_csv(conn, csv_path: Path) -> None:
    if not csv_path.exists():
        log.error("Datei nicht gefunden: %s", csv_path)
        return
    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        count = 0
        for row in csv.DictReader(f):
            kuerzel = row.get("kuerzel", "").strip()
            if not kuerzel:
                continue
            conn.execute("""
                INSERT INTO mitarbeiter (kuerzel, vorname, nachname, pensum_pct)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(kuerzel) DO UPDATE SET
                    vorname=excluded.vorname, nachname=excluded.nachname,
                    pensum_pct=excluded.pensum_pct, geaendert_am=datetime('now')
            """, (kuerzel, row.get("vorname","").strip() or None,
                  row.get("nachname","").strip() or None,
                  int(row.get("pensum_pct", 100))))
            count += 1
    conn.commit()
    log.info("✅ %d MA importiert/aktualisiert", count)


def export_to_csv(conn, csv_path: Path) -> None:
    rows = conn.execute(
        "SELECT kuerzel, vorname, nachname, pensum_pct, aktiv FROM mitarbeiter ORDER BY kuerzel"
    ).fetchall()
    with open(csv_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        writer.writerow(["kuerzel", "vorname", "nachname", "pensum_pct", "aktiv"])
        for r in rows:
            writer.writerow([r["kuerzel"], r["vorname"] or "", r["nachname"] or "",
                              r["pensum_pct"], r["aktiv"]])
    log.info("✅ %d MA exportiert nach %s", len(rows), csv_path)


def merge_mitarbeiter(conn, quell_kuerzel: str, ziel_kuerzel: str) -> dict:
    """Verschiebt alle Schichten von quell→ziel und deaktiviert den Quell-MA.
    Bei Datumskonflikt (beide MA haben Schicht am selben Tag) bleibt der Ziel-MA-Eintrag erhalten.
    """
    quell = conn.execute(
        "SELECT id, vorname, nachname FROM mitarbeiter WHERE kuerzel = ?", (quell_kuerzel,)
    ).fetchone()
    ziel = conn.execute(
        "SELECT id, vorname, nachname FROM mitarbeiter WHERE kuerzel = ?", (ziel_kuerzel,)
    ).fetchone()

    if not quell:
        return {"error": f"Quell-MA '{quell_kuerzel}' nicht gefunden"}
    if not ziel:
        return {"error": f"Ziel-MA '{ziel_kuerzel}' nicht gefunden"}
    if quell["id"] == ziel["id"]:
        return {"error": "Quell und Ziel sind identisch"}

    total = conn.execute(
        "SELECT COUNT(*) FROM schichten WHERE mitarbeiter_id = ?", (quell["id"],)
    ).fetchone()[0]

    konflikte = conn.execute("""
        SELECT COUNT(*) FROM schichten q
        WHERE q.mitarbeiter_id = ?
          AND q.datum IN (SELECT datum FROM schichten WHERE mitarbeiter_id = ?)
    """, (quell["id"], ziel["id"])).fetchone()[0]

    # Nicht-konfligierende Schichten verschieben; original_ma_id merken für Undo
    conn.execute("""
        UPDATE schichten SET mitarbeiter_id = ?, original_ma_id = ?
        WHERE mitarbeiter_id = ?
          AND datum NOT IN (SELECT datum FROM schichten WHERE mitarbeiter_id = ?)
    """, (ziel["id"], quell["id"], quell["id"], ziel["id"]))

    # Verbleibende Schichten des Quell-MA löschen (Ziel hatte dort bereits Einträge)
    conn.execute("DELETE FROM schichten WHERE mitarbeiter_id = ?", (quell["id"],))

    verschoben = total - konflikte

    # Versand-Modus übernehmen: hat das Ziel noch den Default ('ics') und die
    # Quelle eine abweichende Einstellung (z. B. 'webcal'), gilt diese weiter —
    # der MA ist dieselbe Person und soll den Wechsel nicht bemerken.
    cols = [r[1] for r in conn.execute("PRAGMA table_info(mitarbeiter)").fetchall()]
    if "webcal_mail_modus" in cols:
        conn.execute("""
            UPDATE mitarbeiter SET webcal_mail_modus =
                (SELECT webcal_mail_modus FROM mitarbeiter WHERE id = ?)
            WHERE id = ?
              AND COALESCE(webcal_mail_modus, 'ics') = 'ics'
              AND (SELECT COALESCE(webcal_mail_modus, 'ics') FROM mitarbeiter WHERE id = ?) != 'ics'
        """, (quell["id"], ziel["id"], quell["id"]))

    from datetime import date
    notiz_zusatz = f"Zusammengeführt in '{ziel_kuerzel}' am {date.today().isoformat()}"
    conn.execute("""
        UPDATE mitarbeiter SET
            aktiv = 0,
            zusammengefuehrt_in_id = ?,
            notizen = CASE WHEN notizen IS NULL OR notizen = ''
                           THEN ? ELSE notizen || ' | ' || ? END,
            geaendert_am = datetime('now')
        WHERE id = ?
    """, (ziel["id"], notiz_zusatz, notiz_zusatz, quell["id"]))

    conn.commit()

    quell_name = f"{quell['vorname'] or ''} {quell['nachname'] or ''}".strip() or quell_kuerzel
    ziel_name  = f"{ziel['vorname']  or ''} {ziel['nachname']  or ''}".strip() or ziel_kuerzel
    log.info("✅ MA zusammengeführt: %s → %s (%d Schichten, %d Konflikte übersprungen)",
             quell_name, ziel_name, verschoben, konflikte)
    return {
        "ok": True,
        "verschoben": verschoben,
        "konflikte_uebersprungen": konflikte,
        "quell_name": quell_name,
        "ziel_name": ziel_name,
    }


def unmerge_mitarbeiter(conn, quell_kuerzel: str) -> dict:
    """Macht eine Zusammenführung rückgängig.
    Verschiebt alle Schichten mit original_ma_id = quell zurück und reaktiviert den MA.
    Konflikte, die beim Merge gelöscht wurden, können nicht wiederhergestellt werden.
    """
    quell = conn.execute(
        "SELECT id, vorname, nachname, zusammengefuehrt_in_id FROM mitarbeiter WHERE kuerzel = ?",
        (quell_kuerzel,)
    ).fetchone()

    if not quell:
        return {"error": f"MA '{quell_kuerzel}' nicht gefunden"}
    if not quell["zusammengefuehrt_in_id"]:
        return {"error": f"MA '{quell_kuerzel}' wurde nicht zusammengeführt"}

    ziel_id = quell["zusammengefuehrt_in_id"]
    ziel = conn.execute(
        "SELECT kuerzel, vorname, nachname FROM mitarbeiter WHERE id = ?", (ziel_id,)
    ).fetchone()

    # Zurückverschieben: nur Schichten die beim Merge von quell→ziel verschoben wurden
    # Konflikt-Check: wenn ziel inzwischen eine andere Schicht auf dem gleichen Tag hat,
    # die NICHT vom Merge stammt → diese behalten, quell-Schicht kann nicht zurück
    rueckgaengig = conn.execute("""
        UPDATE schichten
        SET mitarbeiter_id = ?, original_ma_id = NULL
        WHERE original_ma_id = ?
          AND mitarbeiter_id = ?
          AND datum NOT IN (
              SELECT datum FROM schichten
              WHERE mitarbeiter_id = ?
                AND original_ma_id IS NULL
          )
    """, (quell["id"], quell["id"], ziel_id, quell["id"])).rowcount

    # Quell-MA reaktivieren und Merge-Verknüpfung lösen
    conn.execute("""
        UPDATE mitarbeiter SET
            aktiv = 1,
            zusammengefuehrt_in_id = NULL,
            geaendert_am = datetime('now')
        WHERE id = ?
    """, (quell["id"],))

    conn.commit()

    quell_name = f"{quell['vorname'] or ''} {quell['nachname'] or ''}".strip() or quell_kuerzel
    ziel_name  = f"{ziel['vorname'] or ''} {ziel['nachname'] or ''}".strip() or ziel["kuerzel"]
    log.info("✅ Merge rückgängig: %s ← %s (%d Schichten zurückverschoben)",
             quell_name, ziel_name, rueckgaengig)
    return {
        "ok": True,
        "zurueckverschoben": rueckgaengig,
        "quell_name": quell_name,
        "ziel_name": ziel_name,
        "ziel_kuerzel": ziel["kuerzel"],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Mitarbeiter-Stammdaten verwalten")
    parser.add_argument("--db",           default=str(DB_PATH))
    parser.add_argument("--list",         action="store_true")
    parser.add_argument("--ohne-namen",   action="store_true")
    parser.add_argument("--set",          metavar="KÜRZEL")
    parser.add_argument("--vorname")
    parser.add_argument("--nachname")
    parser.add_argument("--pensum",       type=int)
    parser.add_argument("--deaktivieren", metavar="KÜRZEL")
    parser.add_argument("--import-csv",   metavar="DATEI")
    parser.add_argument("--export-csv",   metavar="DATEI")
    args = parser.parse_args()

    conn = get_connection(Path(args.db))

    if args.list or args.ohne_namen:
        list_mitarbeiter(conn, nur_ohne_namen=args.ohne_namen)
    elif args.set:
        set_mitarbeiter(conn, args.set, vorname=args.vorname,
                        nachname=args.nachname, pensum_pct=args.pensum)
    elif args.deaktivieren:
        set_mitarbeiter(conn, args.deaktivieren, aktiv=0)
    elif args.import_csv:
        import_from_csv(conn, Path(args.import_csv))
    elif args.export_csv:
        export_to_csv(conn, Path(args.export_csv))
    else:
        parser.print_help()

    conn.close()


if __name__ == "__main__":
    main()
