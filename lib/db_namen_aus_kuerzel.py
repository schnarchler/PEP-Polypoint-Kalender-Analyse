"""
db_namen_aus_kuerzel.py – Vorname/Nachname aus Kürzel extrahieren
=================================================================
Das Kürzel ist nach dem Muster "Nachname Vorname" aufgebaut.
Alles nach einem "_" (z.B. "_RD", "_medi") wird ignoriert.

Beispiele:
  "von allmen mara"      → Nachname: "von Allmen"  Vorname: "Mara"
  "muster hans_RD"       → Nachname: "Muster"      Vorname: "Hans"
  "schmidt anna_medi"    → Nachname: "Schmidt"      Vorname: "Anna"
  "meier-stocker beat"   → Nachname: "Meier-Stocker" Vorname: "Beat"

Ablauf:
  1. Vorschau aller extrahierten Namen anzeigen
  2. Manuelle Korrekturen möglich (--set)
  3. Nach Bestätigung in DB schreiben (nur MA ohne bestehenden Namen)

Aufruf:
  python db_namen_aus_kuerzel.py              # Vorschau + Bestätigung
  python db_namen_aus_kuerzel.py --alle       # auch MA mit bestehenden Namen überschreiben
  python db_namen_aus_kuerzel.py --dry-run    # nur Vorschau, nichts schreiben
"""

import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from db_setup import DB_PATH, get_connection

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)


def titel(s: str) -> str:
    """Macht aus 'von allmen' → 'von Allmen', 'meier-stocker' → 'Meier-Stocker'."""
    # Wörter die klein bleiben sollen (Partikel)
    partikel = {"von", "van", "de", "di", "del", "der", "den", "zu", "zum", "zur"}
    teile = s.split()
    result = []
    for i, wort in enumerate(teile):
        # Bindestrich-Namen: jedes Teil gross
        if "-" in wort:
            wort = "-".join(t.capitalize() for t in wort.split("-"))
            result.append(wort)
        elif wort.lower() in partikel and i < len(teile) - 1:
            result.append(wort.lower())
        else:
            result.append(wort.capitalize())
    return " ".join(result)


def parse_name(kuerzel: str) -> tuple[str, str]:
    """Extrahiert (vorname, nachname) aus dem Kürzel.

    Format: "Nachname Vorname" — letztes Wort = Vorname, Rest = Nachname.
    Alles ab dem ersten '_' wird ignoriert.
    """
    # Suffix nach _ abschneiden (z.B. "_RD", "_medi", "_Stud")
    basis = kuerzel.split("_")[0].strip()

    teile = basis.split()
    if len(teile) == 0:
        return "", ""
    if len(teile) == 1:
        # Nur ein Wort → als Nachname behandeln
        return "", titel(teile[0])

    # Letztes Wort = Vorname, Rest = Nachname
    vorname_roh  = teile[-1]
    nachname_roh = " ".join(teile[:-1])
    return titel(vorname_roh), titel(nachname_roh)


def vorschau_und_schreiben(conn, alle: bool = False, dry_run: bool = False) -> None:
    """Zeigt Vorschau der extrahierten Namen und schreibt sie nach Bestätigung."""

    # Alle MA laden
    where = "" if alle else "WHERE (vorname IS NULL OR vorname = '') AND (nachname IS NULL OR nachname = '')"
    rows = conn.execute(f"""
        SELECT kuerzel, vorname, nachname
        FROM mitarbeiter
        {where}
        ORDER BY kuerzel
    """).fetchall()

    if not rows:
        print("\n✅ Alle Mitarbeiter haben bereits Vor- und Nachnamen eingetragen.")
        return

    # Namen extrahieren
    updates = []
    for r in rows:
        vorname, nachname = parse_name(r["kuerzel"])
        updates.append({
            "kuerzel":       r["kuerzel"],
            "vorname_alt":   r["vorname"] or "",
            "nachname_alt":  r["nachname"] or "",
            "vorname_neu":   vorname,
            "nachname_neu":  nachname,
        })

    # Vorschau
    print(f"\n{'═'*80}")
    modus = "VORSCHAU" if dry_run else ("ALLE (inkl. bestehende)" if alle else "NUR LEERE FELDER")
    print(f"  NAMEN AUS KÜRZEL EXTRAHIEREN  [{modus}]")
    print(f"{'═'*80}")
    print(f"  {'Kürzel':<22} {'→ Vorname':<18} {'Nachname':<25} {'(war)'}")
    print(f"  {'─'*21} {'─'*17} {'─'*24} {'─'*20}")

    for u in updates:
        war = ""
        if u["vorname_alt"] or u["nachname_alt"]:
            war = f"← {u['vorname_alt']} {u['nachname_alt']}".strip()
        print(f"  {u['kuerzel']:<22} {u['vorname_neu']:<18} {u['nachname_neu']:<25} {war}")

    print(f"{'═'*80}")
    print(f"  {len(updates)} Mitarbeiter werden aktualisiert.")

    if dry_run:
        print("\nℹ️  DRY-RUN: Nichts geschrieben. --dry-run entfernen für echten Import.")
        return

    # Bestätigung
    antwort = input(f"\n  Namen jetzt in DB schreiben? [j/N] ").strip().lower()
    if antwort not in ("j", "ja", "y", "yes"):
        print("  Abgebrochen.")
        return

    # Schreiben
    geschrieben = 0
    uebersprungen = 0
    for u in updates:
        if not u["vorname_neu"] and not u["nachname_neu"]:
            log.warning("  %s: konnte keinen Namen extrahieren → übersprungen", u["kuerzel"])
            uebersprungen += 1
            continue
        conn.execute("""
            UPDATE mitarbeiter
            SET vorname = ?, nachname = ?, geaendert_am = datetime('now')
            WHERE kuerzel = ?
        """, (u["vorname_neu"] or None, u["nachname_neu"] or None, u["kuerzel"]))
        geschrieben += 1

    conn.commit()
    print(f"\n✅ {geschrieben} Mitarbeiter aktualisiert.")
    if uebersprungen:
        print(f"⚠️  {uebersprungen} übersprungen (kein Name erkennbar).")
    print("\n  Einzelne Korrekturen nachträglich möglich:")
    print("  python db_mitarbeiter.py --set \"kuerzel\" --vorname Max --nachname Muster")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Vorname/Nachname aus Kürzel extrahieren und in DB schreiben",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Beispiele:
  python db_namen_aus_kuerzel.py              # Vorschau → Bestätigung → schreiben
  python db_namen_aus_kuerzel.py --dry-run    # nur Vorschau, nichts schreiben
  python db_namen_aus_kuerzel.py --alle       # auch MA mit bestehenden Namen
""",
    )
    parser.add_argument("--db",      default=str(DB_PATH))
    parser.add_argument("--dry-run", action="store_true",
                        help="Nur Vorschau, nichts in DB schreiben")
    parser.add_argument("--alle",    action="store_true",
                        help="Auch MA mit bestehenden Namen überschreiben")
    args = parser.parse_args()

    conn = get_connection(Path(args.db))
    try:
        vorschau_und_schreiben(conn, alle=args.alle, dry_run=args.dry_run)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
