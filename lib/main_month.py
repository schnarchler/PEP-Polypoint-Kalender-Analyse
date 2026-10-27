"""
main_month.py – Monatlicher Workflow (alle Schritte in einem)
=============================================================
Führt den kompletten monatlichen Import- und Export-Prozess aus:

  0. Icon-Check: prüft ob neue Icons/Balken im PDF vorhanden sind
     → falls ja: icon_learn.py starten, warten bis Mapping gespeichert
  B. Backup der Datenbank erstellen (vor dem Import)
  1. PDF → Datenbank importieren
  2. Excel-Übersicht erstellen (farbig)
  3. ICS-Kalender für alle MA exportieren
  4. Analyse-Report als Excel erstellen
  5. (optional) ICS per E-Mail versenden  →  --mail

Aufruf:
  python main_month.py --month März --year 2026
  python main_month.py --month März --year 2026 --pdf "anderer_name.pdf"
  python main_month.py --month März --year 2026 --dry-run        (nur Import testen)
  python main_month.py --month März --year 2026 --skip-icon-check
  python main_month.py --month März --year 2026 --mail            (mit Mail-Versand)
  python main_month.py --month März --year 2026 --mail --nur-aenderungen
  python main_month.py --month März --year 2026 --no-backup       (kein Backup)
"""

import argparse
import subprocess
import sys
import webbrowser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import BASE_DIR, ICON_MAPPING_DIR, MONATE_DE, PDF_DIR, PDF_TEMPLATE

_LIB = Path(__file__).parent


def run(cmd: list[str], beschreibung: str) -> bool:
    """Führt einen Befehl aus, gibt True bei Erfolg zurück."""
    print(f"\n{'─' * 60}")
    print(f"▶  {beschreibung}")
    print(f"   {' '.join(cmd)}")
    print(f"{'─' * 60}")
    result = subprocess.run(cmd, cwd=BASE_DIR)
    if result.returncode != 0:
        print(f"\n❌  Fehler bei: {beschreibung}  (Exit-Code {result.returncode})")
        return False
    return True


def check_und_handle_neue_icons(python: str, pdf_path: Path) -> bool:
    """Prüft ob neue Icons/Balken im PDF vorhanden sind.
    Falls ja: icon_learn.py starten und auf Benutzer warten.
    Gibt True zurück wenn weitergefahren werden soll.
    """
    print(f"\n{'─' * 60}")
    print(f"▶  Schritt 0/4 – Icon-Check")
    print(f"{'─' * 60}")

    result = subprocess.run(
        [python, str(_LIB / "icon_learn.py"), "--pdf", str(pdf_path), "--check-only"],
        cwd=BASE_DIR, capture_output=True, text=True
    )
    output = result.stdout.strip()

    if result.returncode == 0:
        # Keine neuen Icons
        print(f"  ✅ Alle Icons bereits gemappt — kein Handlungsbedarf.")
        return True

    # Neue Icons vorhanden — Details parsen
    n_icons = n_balken = 0
    if output.startswith("NEUE_ICONS:"):
        teile = output.split(":")
        n_icons  = int(teile[1]) if len(teile) > 1 else 0
        n_balken = int(teile[2]) if len(teile) > 2 else 0

    print(f"\n  ⚠️  Neue unbekannte Elemente im PDF gefunden:")
    if n_icons:
        print(f"     {n_icons} neue Icon(s)")
    if n_balken:
        print(f"     {n_balken} neue Farbbalken")
    print(f"\n  → icon_learn.py wird gestartet.")
    print(f"  → Browser öffnet sich mit der Mapping-Tabelle.")
    print(f"  → Neue Icons zuweisen (oder leer lassen) und")
    print(f"    '💾 Speichern → JSON' klicken.")

    # icon_learn.py starten (öffnet Browser)
    subprocess.Popen(
        [python, str(_LIB / "icon_learn.py"), "--pdf", str(pdf_path)],
        cwd=BASE_DIR
    )

    # Auf Benutzer warten
    print(f"\n{'═' * 60}")
    print(f"  Wenn das JSON gespeichert ist → Enter drücken")
    print(f"  (oder 'q' + Enter zum Abbrechen)")
    print(f"{'═' * 60}")
    antwort = input("  Weiter? [Enter / q]: ").strip().lower()
    if antwort in ("q", "quit", "abbruch", "nein", "n"):
        print("\n  Abgebrochen.")
        return False

    # Nochmal prüfen ob jetzt alles gemappt ist
    result2 = subprocess.run(
        [python, str(_LIB / "icon_learn.py"), "--pdf", str(pdf_path), "--check-only"],
        cwd=BASE_DIR, capture_output=True, text=True
    )
    if result2.returncode == 0:
        print(f"  ✅ Alle Icons jetzt gemappt.")
    else:
        output2 = result2.stdout.strip()
        n2 = 0
        if output2.startswith("NEUE_ICONS:"):
            teile = output2.split(":")
            n2 = int(teile[1]) + int(teile[2]) if len(teile) > 2 else 0
        print(f"  ℹ️  Noch {n2} Element(e) nicht gemappt — werden beim Import übersprungen.")

    return True


def main():
    parser = argparse.ArgumentParser(
        description="Monatlicher Dienstplan-Workflow (Import + Exports)"
    )
    parser.add_argument("--month",   required=True,
                        help="Monat auf Deutsch, z.B. März")
    parser.add_argument("--year",    required=True, type=int,
                        help="Jahr, z.B. 2026")
    parser.add_argument("--pdf",     default=None,
                        help="PDF-Pfad (Standard: aus PDF_TEMPLATE in config.py)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Import nur simulieren, nichts speichern")
    parser.add_argument("--skip-icon-check", action="store_true",
                        help="Icon-Check überspringen (wenn Mapping bereits aktuell)")
    parser.add_argument("--no-backup", action="store_true",
                        help="Kein automatisches Backup vor dem Import")
    parser.add_argument("--mail", action="store_true",
                        help="Nach dem Export ICS per E-Mail versenden (Schritt 5)")
    parser.add_argument("--nur-aenderungen", action="store_true",
                        help="Beim Mail-Versand nur geänderte Pläne senden")
    parser.add_argument("--skip-excel", action="store_true",
                        help="Excel-Export überspringen")
    args = parser.parse_args()

    monat = args.month
    jahr  = args.year

    if monat not in MONATE_DE:
        print(f"❌  Unbekannter Monat: '{monat}'")
        print(f"   Gültig: {', '.join(MONATE_DE.keys())}")
        sys.exit(1)

    # PDF-Pfad bestimmen
    pdf_name = args.pdf or PDF_TEMPLATE.format(month=monat, year=jahr)
    pdf_path = (Path(pdf_name) if Path(pdf_name).is_absolute()
                else PDF_DIR / pdf_name)

    if not pdf_path.exists():
        print(f"\n❌  PDF nicht gefunden: {pdf_path}")
        print(f"   Bitte PDF in den Ordner PEP_pdf/ legen oder mit --pdf angeben.")
        sys.exit(1)

    python = sys.executable

    print(f"\n{'═' * 60}")
    print(f"  MONATSLAUF  {monat} {jahr}")
    print(f"  PDF:  {pdf_path.name}")
    if args.dry_run:
        print(f"  MODUS: DRY-RUN (keine Änderungen)")
    if args.skip_icon_check:
        print(f"  Icon-Check: übersprungen")
    if args.no_backup:
        print(f"  Backup: deaktiviert")
    if args.mail:
        print(f"  Mail-Versand: aktiv" + (" (nur Änderungen)" if args.nur_aenderungen else ""))
    print(f"{'═' * 60}")

    ICON_MAPPING_DIR.mkdir(parents=True, exist_ok=True)
    fehler = []

    # ── Schritt B: Backup ─────────────────────────────────────────────────────
    if not args.no_backup and not args.dry_run:
        ok = run([python, str(_LIB / "db_backup.py")], "Backup – Datenbank sichern")
        if not ok:
            fehler.append("Backup")
            print("\n⚠️   Backup fehlgeschlagen – trotzdem weiter? [Enter / q]")
            antwort = input("  Weiter? [Enter / q]: ").strip().lower()
            if antwort in ("q", "quit", "nein", "n"):
                sys.exit(1)

    # ── Schritt 0: Icon-Check ──────────────────────────────────────────────────
    if not args.skip_icon_check and not args.dry_run:
        weiter = check_und_handle_neue_icons(python, pdf_path)
        if not weiter:
            sys.exit(0)

    # ── Schritt 1: Import ──────────────────────────────────────────────────────
    import_cmd = [python, str(_LIB / "db_import.py"),
                  "--pdf",   str(pdf_path),
                  "--month", monat,
                  "--year",  str(jahr)]
    if args.dry_run:
        import_cmd.append("--dry-run")

    ok = run(import_cmd, f"Schritt 1/5 – PDF importieren")
    if not ok:
        fehler.append("Import")
        if not args.dry_run:
            print("\n⛔  Import fehlgeschlagen – weitere Schritte werden übersprungen.")
            _abschluss(fehler, monat, jahr)
            sys.exit(1)

    if args.dry_run:
        print("\n✅  Dry-Run abgeschlossen – keine weiteren Schritte.")
        sys.exit(0)

    # ── Schritt 2: Excel-Übersicht ─────────────────────────────────────────────
    if args.skip_excel:
        print(f"\n{'─' * 60}")
        print(f"⊘  Schritt 2/5 – Excel-Übersicht (übersprungen)")
        print(f"{'─' * 60}")
    else:
        ok = run(
            [python, str(_LIB / "db_export_excel.py"), "--month", monat, "--year", str(jahr)],
            f"Schritt 2/5 – Excel-Übersicht erstellen"
        )
        if not ok:
            fehler.append("Excel-Übersicht")

    # ── Schritt 3: ICS-Export ──────────────────────────────────────────────────
    ok = run(
        [python, str(_LIB / "db_export_ics.py"), "--alle", "--month", monat, "--year", str(jahr)],
        f"Schritt 3/5 – ICS-Kalender exportieren (alle MA)"
    )
    if not ok:
        fehler.append("ICS-Export")

    # ── Schritt 4: Analyse-Report ──────────────────────────────────────────────
    ok = run(
        [python, str(_LIB / "db_analyse.py"), "--export-excel", "--month", monat, "--year", str(jahr)],
        f"Schritt 4/5 – Analyse-Report erstellen"
    )
    if not ok:
        fehler.append("Analyse-Report")

    # ── Schritt 5: Mail-Versand (optional) ────────────────────────────────────
    if args.mail:
        mail_cmd = [python, str(_LIB / "mail_send.py"), "--month", monat, "--year", str(jahr)]
        if args.nur_aenderungen:
            mail_cmd.append("--nur-aenderungen")
        ok = run(mail_cmd, f"Schritt 5/5 – ICS per E-Mail versenden")
        if not ok:
            fehler.append("Mail-Versand")

    _abschluss(fehler, monat, jahr)


def _abschluss(fehler: list, monat: str, jahr: int):
    print(f"\n{'═' * 60}")
    if not fehler:
        print(f"  ✅  MONATSLAUF ABGESCHLOSSEN  –  {monat} {jahr}")
        print(f"\n  Ergebnisse in: {BASE_DIR / 'excel_export'}")
        print(f"    • Uebersicht_{monat}_{jahr}.xlsx")
        print(f"    • Analyse_{monat}_{jahr}.xlsx")
        print(f"  ICS-Kalender:  {BASE_DIR / 'ics_export' / f'{monat}_{jahr}'}")
    else:
        print(f"  ⚠️   MONATSLAUF MIT FEHLERN  –  {monat} {jahr}")
        print(f"  Fehlgeschlagen: {', '.join(fehler)}")
    print(f"{'═' * 60}\n")


if __name__ == "__main__":
    main()
