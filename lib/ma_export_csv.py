"""
ma_export_csv.py – Exportiert einen einzelnen Mitarbeiter als CSV zur Überprüfung
===================================================================================
Spalte A: Mitarbeitername
Dann pro Tag eine Spalte mit dem Dienst-Code (oder leer wenn kein Eintrag)

Aufruf:
  python ma_export_csv.py --name "Meier Max" --month März --year 2026
  python ma_export_csv.py --name "Meier Max"          # alle Monate in der DB
  python ma_export_csv.py --list                       # alle MA in der DB anzeigen
"""

import argparse
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import DB_PATH, MONATE_DE

MONATE_NUM_TO_NAME = {v: k for k, v in MONATE_DE.items()}


def list_mitarbeiter(conn: sqlite3.Connection) -> None:
    rows = conn.execute("""
        SELECT m.kuerzel, m.vorname, m.nachname, m.pensum_pct,
               COUNT(s.id) as schichten
        FROM mitarbeiter m
        LEFT JOIN schichten s ON s.mitarbeiter_id = m.id
        WHERE m.aktiv = 1
        GROUP BY m.id
        ORDER BY m.nachname, m.vorname
    """).fetchall()

    print(f"\n{'Kürzel':<12} {'Name':<25} {'Pensum':>7}  {'Schichten':>10}")
    print("─" * 60)
    for row in rows:
        name = f"{row['vorname'] or ''} {row['nachname'] or ''}".strip() or row['kuerzel']
        print(f"{row['kuerzel']:<12} {name:<25} {row['pensum_pct']:>6}%  {row['schichten']:>10}")
    print(f"\n{len(rows)} Mitarbeiter")


def export_ma_csv(
    conn: sqlite3.Connection,
    name: str,
    month: str | None,
    year: int | None,
    output_path: Path,
) -> None:
    # MA suchen — nach Kürzel ODER nach "Vorname Nachname" / "Nachname Vorname"
    ma = conn.execute("""
        SELECT id, kuerzel, vorname, nachname FROM mitarbeiter
        WHERE aktiv = 1
          AND (
            kuerzel = ?
            OR (vorname || ' ' || nachname) = ?
            OR (nachname || ' ' || vorname) = ?
          )
    """, (name, name, name)).fetchone()

    if not ma:
        # Fuzzy: Nachname enthält den Suchbegriff
        candidates = conn.execute("""
            SELECT id, kuerzel, vorname, nachname FROM mitarbeiter
            WHERE aktiv = 1 AND (nachname LIKE ? OR vorname LIKE ? OR kuerzel LIKE ?)
        """, (f"%{name}%", f"%{name}%", f"%{name}%")).fetchall()
        if not candidates:
            print(f"❌ Kein Mitarbeiter gefunden für: '{name}'")
            print("   Tipp: --list zeigt alle verfügbaren Namen")
            sys.exit(1)
        if len(candidates) > 1:
            print(f"⚠️  Mehrere Treffer für '{name}':")
            for c in candidates:
                print(f"   {c['kuerzel']}  {c['vorname']} {c['nachname']}")
            print("   Bitte genaueren Namen angeben.")
            sys.exit(1)
        ma = candidates[0]

    ma_id    = ma["id"]
    anzeige  = f"{ma['vorname'] or ''} {ma['nachname'] or ''}".strip() or ma["kuerzel"]

    # Schichten laden
    query = """
        SELECT s.datum, s.anzeigename, s.dienst_code, s.dienstbeginn, s.dienstende, s.ort,
               strftime('%m', s.datum) as monat_num,
               strftime('%Y', s.datum) as jahr
        FROM schichten s
        WHERE s.mitarbeiter_id = ?
    """
    params = [ma_id]
    if month and year:
        monat_num = MONATE_DE.get(month)
        if not monat_num:
            print(f"❌ Unbekannter Monat: '{month}'")
            sys.exit(1)
        query  += " AND strftime('%m', s.datum) = ? AND strftime('%Y', s.datum) = ?"
        params += [f"{monat_num:02d}", str(year)]
    elif year:
        query  += " AND strftime('%Y', s.datum) = ?"
        params += [str(year)]

    query += " ORDER BY s.datum"

    rows = conn.execute(query, params).fetchall()

    if not rows:
        print(f"⚠️  Keine Schichten gefunden für '{anzeige}'"
              + (f" ({month} {year})" if month or year else ""))
        sys.exit(0)

    # CSV aufbauen: Spalte A = Name, dann je eine Spalte pro Tag (01..31)
    # Gruppiert nach Monat/Jahr → eine Zeile pro Monat
    from collections import defaultdict
    monthly: dict[tuple, dict[int, str]] = defaultdict(dict)
    for r in rows:
        key = (r["jahr"], r["monat_num"])
        day = int(r["datum"].split("-")[2])
        code = r["anzeigename"] or r["dienst_code"] or ""
        monthly[key][day] = code

    # Alle vorhandenen Tage ermitteln (max. 31)
    all_days = sorted({day for day_map in monthly.values() for day in day_map})

    lines = []
    # Header
    header = ["Mitarbeiter", "Jahr", "Monat"] + [f"{d:02d}" for d in range(1, 32)]
    lines.append(",".join(header))

    for (jahr_str, monat_num_str), day_map in sorted(monthly.items()):
        monat_name = MONATE_NUM_TO_NAME.get(int(monat_num_str), monat_num_str)
        row = [anzeige, jahr_str, monat_name]
        for d in range(1, 32):
            row.append(day_map.get(d, ""))
        lines.append(",".join(f'"{v}"' if "," in str(v) else str(v) for v in row))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(lines), encoding="utf-8-sig")

    total = sum(len(v) for v in monthly.values())
    print(f"✅ {anzeige}: {total} Schichten in {len(monthly)} Monat(en)")
    print(f"   → {output_path}")

    # Vorschau im Terminal
    print(f"\n{'─'*70}")
    print(f"Vorschau (erste 2 Monate):")
    for i, ((jahr_str, monat_num_str), day_map) in enumerate(sorted(monthly.items())):
        if i >= 2:
            print("   ...")
            break
        monat_name = MONATE_NUM_TO_NAME.get(int(monat_num_str), monat_num_str)
        print(f"\n  {monat_name} {jahr_str}:")
        entries = sorted(day_map.items())
        # Kompakt: je 7 Tage pro Zeile
        for chunk_start in range(0, len(entries), 7):
            chunk = entries[chunk_start:chunk_start+7]
            print("  " + "  ".join(f"Tag {d:02d}:{v or '—':>6}" for d, v in chunk))


def main() -> None:
    parser = argparse.ArgumentParser(description="MA-Export CSV zur DB-Überprüfung")
    parser.add_argument("--name",   help="Mitarbeitername, Kürzel oder Teil des Namens")
    parser.add_argument("--month",  help="Monat (z.B. März)")
    parser.add_argument("--year",   type=int, help="Jahr (z.B. 2026)")
    parser.add_argument("--list",   action="store_true", help="Alle MA auflisten")
    parser.add_argument("--out",    help="Ausgabepfad (Standard: calc/<name>_<monat>.csv)")
    args = parser.parse_args()

    if not DB_PATH.exists():
        print(f"❌ Datenbank nicht gefunden: {DB_PATH}")
        print("   Zuerst: python db_setup.py && python db_import.py --pdf ...")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    if args.list:
        list_mitarbeiter(conn)
        return

    if not args.name:
        parser.print_help()
        sys.exit(1)

    safe_name = args.name.replace(" ", "_")
    suffix    = f"_{args.month}_{args.year}" if args.month and args.year else ""
    out_path  = Path(args.out) if args.out else \
                Path(__file__).parent / "excel_export" / f"export_{safe_name}{suffix}.csv"

    export_ma_csv(conn, args.name, args.month, args.year, out_path)
    conn.close()


if __name__ == "__main__":
    main()
