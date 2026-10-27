"""
db_dienste.py – Dienst-Typen verwalten
======================================
Zeigt alle bekannten Dienst-Codes an und ermöglicht das Setzen von Eigenschaften,
insbesondere ob ein Dienst als GANZTÄGIGES Event in den ICS-Kalender exportiert wird.

Aufruf:
  python db_dienste.py --list                          # Alle Dienste anzeigen
  python db_dienste.py --set EB --ganztaegig 1         # EB als ganztägig markieren
  python db_dienste.py --set EB --ganztaegig 0         # EB als Zeitdienst markieren
  python db_dienste.py --set EB --name "Ext. Kurs"     # Anzeigename setzen
  python db_dienste.py --set EB --kategorie Abwesenheit
  python db_dienste.py --ganztaegig-liste              # Nur ganztägige Dienste zeigen
"""

import argparse
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import DB_PATH

KATEGORIEN = ["Arbeit", "Frei", "Abwesenheit", "Sonstiges"]


def get_conn():
    if not DB_PATH.exists():
        print(f"❌ DB nicht gefunden: {DB_PATH}")
        sys.exit(1)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def list_dienste(conn, nur_ganztaegig: bool = False) -> None:
    where = "WHERE ist_ganztaegig = 1" if nur_ganztaegig else ""
    rows = conn.execute(f"""
        SELECT code, anzeigename, dienstbeginn, dienstende, ort,
               kategorie, ist_nachtdienst, ist_ganztaegig
        FROM dienst_typen
        {where}
        ORDER BY code
    """).fetchall()

    if not rows:
        print("Keine Dienste gefunden.")
        return

    print(f"\n{'Code':<10} {'Anzeigename':<20} {'Beginn':>6} {'Ende':>6} "
          f"{'Ort':<12} {'Kategorie':<14} {'Nacht':>5} {'Ganztag':>7}")
    print("-" * 90)
    for r in rows:
        nacht   = "✓" if r["ist_nachtdienst"] else ""
        ganztag = "✓" if r["ist_ganztaegig"]  else ""
        beginn  = r["dienstbeginn"] or "–"
        ende    = r["dienstende"]   or "–"
        ort     = r["ort"]          or "–"
        print(f"{r['code']:<10} {(r['anzeigename'] or ''):<20} {beginn:>6} {ende:>6} "
              f"{ort:<12} {(r['kategorie'] or ''):<14} {nacht:>5} {ganztag:>7}")
    print(f"\n{len(rows)} Dienst-Typ(en).")

    ganztag_count = sum(1 for r in rows if r["ist_ganztaegig"])
    if ganztag_count and not nur_ganztaegig:
        print(f"Davon ganztägig: {ganztag_count}")


def set_dienst(conn, code: str, args) -> None:
    existing = conn.execute(
        "SELECT * FROM dienst_typen WHERE code = ?", (code,)
    ).fetchone()

    if not existing:
        print(f"❌ Code '{code}' nicht gefunden. Bekannte Codes:")
        codes = [r[0] for r in conn.execute("SELECT code FROM dienst_typen ORDER BY code")]
        print("  " + ", ".join(codes))
        sys.exit(1)

    updates = []
    params  = []

    if args.ganztaegig is not None:
        val = int(args.ganztaegig)
        updates.append("ist_ganztaegig = ?")
        params.append(val)
        label = "ganztägig" if val else "Zeitdienst"
        print(f"  ist_ganztaegig → {val}  ({label})")

    if args.name is not None:
        updates.append("anzeigename = ?")
        params.append(args.name)
        print(f"  anzeigename → '{args.name}'")

    if args.kategorie is not None:
        if args.kategorie not in KATEGORIEN:
            print(f"❌ Ungültige Kategorie. Erlaubt: {', '.join(KATEGORIEN)}")
            sys.exit(1)
        updates.append("kategorie = ?")
        params.append(args.kategorie)
        print(f"  kategorie → '{args.kategorie}'")

    if args.nachtdienst is not None:
        updates.append("ist_nachtdienst = ?")
        params.append(int(args.nachtdienst))
        print(f"  ist_nachtdienst → {int(args.nachtdienst)}")

    if args.beginn is not None:
        updates.append("dienstbeginn = ?")
        params.append(args.beginn or None)
        print(f"  dienstbeginn → '{args.beginn}'")

    if args.ende is not None:
        updates.append("dienstende = ?")
        params.append(args.ende or None)
        print(f"  dienstende → '{args.ende}'")

    if not updates:
        print("Keine Änderungen angegeben. Verfügbare Optionen: --ganztaegig, --name, "
              "--kategorie, --nachtdienst, --beginn, --ende")
        return

    params.append(code)
    conn.execute(
        f"UPDATE dienst_typen SET {', '.join(updates)} WHERE code = ?",
        params
    )
    conn.commit()
    print(f"✅ Dienst '{code}' aktualisiert.")


def main():
    parser = argparse.ArgumentParser(description="Dienst-Typen verwalten")
    parser.add_argument("--list",            action="store_true", help="Alle Dienste anzeigen")
    parser.add_argument("--ganztaegig-liste",action="store_true", help="Nur ganztägige Dienste")
    parser.add_argument("--set",             metavar="CODE",      help="Dienst-Code zum Bearbeiten")
    parser.add_argument("--ganztaegig",      type=int, choices=[0, 1],
                        help="Als ganztägiges ICS-Event exportieren (1=ja, 0=nein)")
    parser.add_argument("--name",            help="Anzeigename setzen")
    parser.add_argument("--kategorie",       choices=KATEGORIEN, help="Kategorie setzen")
    parser.add_argument("--nachtdienst",     type=int, choices=[0, 1])
    parser.add_argument("--beginn",          help="Dienstbeginn (HH:MM)")
    parser.add_argument("--ende",            help="Dienstende (HH:MM)")
    args = parser.parse_args()

    conn = get_conn()

    if args.ganztaegig_liste:
        list_dienste(conn, nur_ganztaegig=True)
    elif args.set:
        print(f"Bearbeite Dienst '{args.set}':")
        set_dienst(conn, args.set, args)
    elif args.list or len(sys.argv) == 1:
        list_dienste(conn)
    else:
        parser.print_help()

    conn.close()


if __name__ == "__main__":
    main()
