"""
db_import.py – PDF → Datenbank
================================
Liest einen Dienstplan-PDF ein und schreibt alle Schichten in die DB.

Aufruf:
  python db_import.py --pdf "Plan.pdf" --month Januar --year 2026
  python db_import.py --pdf "Plan.pdf" --month Januar --year 2026 --dry-run
"""

import argparse
import logging
import sys
from datetime import date
from pathlib import Path

import pdfplumber

sys.path.insert(0, str(Path(__file__).parent.parent))
import json as _json
from config import MONATE_DE, ICON_MAPPING_DIR
from db_namen_aus_kuerzel import parse_name
from db_setup import DB_PATH, create_database, get_connection
from dienstplan_extract import (
    assign_icons_to_days,
    build_fingerprint_to_code_map,
    build_icon_registry,
    extract_day_columns,
    extract_ma_rows,
    extract_ma_pensum,
    resolve_icon_to_dienst,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)


def _ziel(conn, row) -> int:
    ziel = row["zusammengefuehrt_in_id"]
    if ziel and conn.execute("SELECT 1 FROM mitarbeiter WHERE id = ?", (ziel,)).fetchone():
        return ziel
    return row["id"]


def ma_zeilen(conn, kuerzel: str, plan_namen=frozenset()) -> list:
    """MA-Einträge zu einem Namen aus dem PDF.

    Das Querformat-Layout führt die Namen ohne die Zusätze des Hochformat-Layouts.
    Darum zählen auch Einträge, deren Kürzel mit dem Namen und einem Zusatz beginnt
    («Muster Hans» → «Muster Hans_RD», «Probe Paul» → «Probe Paul Abt-P»):
      1. exakter Eintrag, wenn seine (Ziel-)MA aktiv ist oder nie_aktivieren hat
      2. sonst Einträge mit Zusatz, wenn sie zu genau einer aktiven MA gehören
         (früherer Eintrag ohne Zusatz ist oft inaktiv: «X» alt, «X_RD» aktuell)
      3. sonst der exakte Eintrag oder Einträge mit Zusatz, die alle zur selben MA gehören
    Mehrdeutige Namen werden neu angelegt (→ Zusammenführen). Kürzel, die selbst als
    Zeile im Plan stehen (plan_namen), sind nie Kandidat für einen anderen Namen."""
    def aktiv(ma_id: int) -> bool:
        return bool(conn.execute("SELECT aktiv FROM mitarbeiter WHERE id = ?", (ma_id,)).fetchone()[0])

    exakt = conn.execute(
        "SELECT id, zusammengefuehrt_in_id, nie_aktivieren FROM mitarbeiter WHERE kuerzel = ?",
        (kuerzel,)).fetchone()
    if exakt and (exakt["nie_aktivieren"] or aktiv(_ziel(conn, exakt))):
        return [exakt]
    treffer = [r for r in conn.execute(
        "SELECT id, kuerzel, zusammengefuehrt_in_id, nie_aktivieren FROM mitarbeiter"
        " WHERE substr(kuerzel, 1, ?) = ? AND length(kuerzel) > ?",
        (len(kuerzel), kuerzel, len(kuerzel)))
        if not r["kuerzel"][len(kuerzel)].isalnum() and r["kuerzel"] not in plan_namen]
    ziele = {}
    for r in treffer:
        ziele.setdefault(_ziel(conn, r), []).append(r)
    aktive = [z for z in ziele if aktiv(z)]
    if len(aktive) == 1:
        return ziele[aktive[0]]
    if exakt:
        return [exakt]
    return treffer if len(ziele) == 1 else []


def ma_ids_im_plan(conn, kuerzel: str, plan_namen=frozenset()) -> set:
    """MA-IDs, unter denen ein Name aus dem PDF geführt wird: der eigene Eintrag und –
    bei zusammengeführten MA – der Ziel-MA, unter dem die Schichten liegen."""
    return {i for r in ma_zeilen(conn, kuerzel, plan_namen)
            for i in (r["id"], r["zusammengefuehrt_in_id"])} - {None}


def ensure_mitarbeiter(conn, kuerzel: str, pensum: int = 100,
                       jahr: int = None, monat_num: int = None, import_id: int = None,
                       plan_namen=frozenset()) -> int:
    """MA anlegen oder aktualisieren, Pensum-Verlauf pro Monat speichern.
    Bei neuen MA werden Vorname/Nachname automatisch aus dem Kürzel extrahiert.
    Wenn der MA zusammengeführt wurde, wird automatisch auf den Ziel-MA umgeleitet.
    Namen ohne Zusatz landen bei der bisherigen MA, wenn das eindeutig ist (ma_zeilen).
    """
    zeilen = ma_zeilen(conn, kuerzel, plan_namen)
    if zeilen:
        bisher = conn.execute("SELECT kuerzel FROM mitarbeiter WHERE id = ?",
                              (_ziel(conn, zeilen[0]),)).fetchone()["kuerzel"]
        if bisher != kuerzel:
            log.info("  Name '%s' → bisherige MA '%s'", kuerzel, bisher)
            kuerzel = bisher
    row = conn.execute(
        "SELECT id, pensum_pct, zusammengefuehrt_in_id FROM mitarbeiter WHERE kuerzel = ?", (kuerzel,)
    ).fetchone()
    if row and row["zusammengefuehrt_in_id"]:
        ziel = conn.execute(
            "SELECT id, kuerzel, pensum_pct FROM mitarbeiter WHERE id = ?",
            (row["zusammengefuehrt_in_id"],)
        ).fetchone()
        if ziel:
            log.info("  Alter Name '%s' → umgeleitet auf '%s' (zusammengeführt)", kuerzel, ziel["kuerzel"])
            if ziel["pensum_pct"] != pensum:
                conn.execute("UPDATE mitarbeiter SET pensum_pct = ? WHERE id = ?", (pensum, ziel["id"]))
            return ziel["id"]
    if row:
        ma_id = row["id"]
        if row["pensum_pct"] != pensum:
            conn.execute("UPDATE mitarbeiter SET pensum_pct = ? WHERE kuerzel = ?", (pensum, kuerzel))
            log.info("  Pensum aktualisiert: %s → %d%%", kuerzel, pensum)
    else:
        vorname, nachname = parse_name(kuerzel)
        conn.execute(
            "INSERT INTO mitarbeiter (kuerzel, vorname, nachname, pensum_pct, aktiv) VALUES (?, ?, ?, ?, 1)",
            (kuerzel, vorname or None, nachname or None, pensum)
        )
        conn.commit()
        ma_id = conn.execute("SELECT id FROM mitarbeiter WHERE kuerzel = ?", (kuerzel,)).fetchone()["id"]
        log.info("  Neuer MA angelegt: %s → %s %s (%d%%)", kuerzel, vorname, nachname, pensum)
    # Pensum-Verlauf pro Monat erfassen (UPSERT)
    if jahr and monat_num:
        monat_str = f"{jahr}-{monat_num:02d}"
        try:
            conn.execute(
                "INSERT INTO ma_pensum_history (mitarbeiter_id, monat, pensum_pct, import_id) "
                "VALUES (?,?,?,?) ON CONFLICT(mitarbeiter_id, monat) DO UPDATE SET "
                "pensum_pct=excluded.pensum_pct, import_id=excluded.import_id",
                (ma_id, monat_str, pensum, import_id)
            )
        except Exception as e:
            log.debug("Pensum-Historie nicht gespeichert (Migration nötig?): %s", e)
    return ma_id


def import_pdf_to_db(pdf_path: Path, monat: str, jahr: int, conn, dry_run: bool = False) -> dict:
    monat_num = MONATE_DE.get(monat)
    if monat_num is None:
        raise ValueError(f"Unbekannter Monat: {monat}")

    log.info("📄 Lese PDF: %s", pdf_path.name)

    with pdfplumber.open(str(pdf_path)) as pdf:
        n_pages = len(pdf.pages)
        log.info("  %d Seiten", n_pages)

        # Icon-Registry seitenübergreifend aufbauen (alle Seiten mit echten Icons)
        icon_registry = {}
        for page in pdf.pages:
            for name, val in build_icon_registry(page).items():
                if name not in icon_registry:
                    icon_registry[name] = val

        fingerprint_map, ignoriert_fingerprints = build_fingerprint_to_code_map(icon_registry)

        # MA-Daten seitenweise sammeln, Seite 4+ (Legende) wird automatisch
        # von extract_ma_rows übersprungen (< 5 Zeilen → leeres Dict)
        ma_icon_map: dict = {}
        ma_pensum_map: dict = {}   # { kuerzel -> pensum_pct }
        total_days = 0
        for page_num, page in enumerate(pdf.pages, 1):
            day_columns = extract_day_columns(page)
            ma_rows     = extract_ma_rows(page)
            if not ma_rows:
                log.info("  Seite %d/%d übersprungen (Legende/Statistik)", page_num, n_pages)
                continue
            # Pensum parallel auslesen (gleiche Seite, nur einmalig pro MA übernehmen)
            pensum_this_page = extract_ma_pensum(page)
            for name, pensum in pensum_this_page.items():
                if name not in ma_pensum_map:
                    ma_pensum_map[name] = pensum
            assignments = assign_icons_to_days(page, ma_rows, day_columns)
            total_days  = max(total_days, len(day_columns))
            for ma_name, day_map in assignments.items():
                if ma_name not in ma_icon_map:
                    ma_icon_map[ma_name] = {}
                ma_icon_map[ma_name].update(day_map)
            log.info("  Seite %d/%d: %d MA, %d Tage",
                     page_num, n_pages, len(ma_rows), len(day_columns))

    n_ma    = len(ma_icon_map)
    n_total = sum(len(v) for v in ma_icon_map.values())
    log.info("  Gesamt: %d MA, %d Einträge, %d Tage", n_ma, n_total, total_days)

    # Ganztägige Dienste + Balken-Mapping aus icon_fingerprint_map.json synchronisieren
    zusatz_color_to_code: dict = {}   # Hex-Farbe (#RRGGBB) → Zusatzfunktion-Code
    mapping_file = ICON_MAPPING_DIR / 'icon_fingerprint_map.json'
    if mapping_file.exists():
        with open(mapping_file) as _f:
            _raw = _json.load(_f)
        # Balken-Mapping laden: Hex-Farbe (#RRGGBB) → Code
        if isinstance(_raw, dict):
            zusatz_color_to_code = {k.upper(): v for k, v in _raw.get('bar_mapping', {}).items()}
            if zusatz_color_to_code:
                log.info('Balken-Mapping geladen: %d Farben', len(zusatz_color_to_code))
        # Ganztägige Dienste synchronisieren
        if not dry_run and isinstance(_raw, dict) and 'ganztaegig' in _raw:
            ganztaegig_codes = _raw['ganztaegig']
            for _code in ganztaegig_codes:
                conn.execute('UPDATE dienst_typen SET ist_ganztaegig = 1 WHERE code = ?', (_code,))
            placeholders = ','.join('?' * len(ganztaegig_codes)) if ganztaegig_codes else "''"
            if ganztaegig_codes:
                conn.execute(
                    f'UPDATE dienst_typen SET ist_ganztaegig = 0 WHERE code NOT IN ({placeholders})',
                    ganztaegig_codes
                )
            else:
                conn.execute('UPDATE dienst_typen SET ist_ganztaegig = 0')
            conn.commit()
            log.info('Ganztägige Dienste aus JSON: %s', ', '.join(ganztaegig_codes) or 'keine')

        # ICS-Export-Flag für Zusatzfunktionen synchronisieren
        if isinstance(_raw, dict) and 'ics_zusatz' in _raw:
            ics_zusatz_export = _raw['ics_zusatz']
            if not dry_run:
                try:
                    conn.execute('UPDATE zusatzfunktionen SET ics_export = 0')
                    for _code in ics_zusatz_export:
                        conn.execute('UPDATE zusatzfunktionen SET ics_export = 1 WHERE code = ?', (_code,))
                    conn.commit()
                    log.info('ICS-Export Zusatzfunktionen: %s', ', '.join(ics_zusatz_export) or 'keine')
                except Exception as _e:
                    log.warning('ics_export Spalte fehlt – bitte db_migrate.py ausführen (%s)', _e)
                    conn.rollback()

    import_id = None
    if not dry_run:
        conn.execute(
            "INSERT INTO import_log (pdf_dateiname, monat, jahr, status) VALUES (?,?,?,'LAUFEND')",
            (pdf_path.name, monat, jahr),
        )
        conn.commit()
        import_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

    stats = {"total": 0, "eingefuegt": 0, "aktualisiert": 0, "uebersprungen": 0, "unbekannte_icons": set()}
    import_ym = f"{jahr}-{monat_num:02d}"

    plan_namen = set(ma_icon_map)
    for ma_kuerzel, day_map in sorted(ma_icon_map.items()):
        # MAs die beim Import generell ignoriert werden sollen
        if any(r["nie_aktivieren"] for r in ma_zeilen(conn, ma_kuerzel, plan_namen)):
            log.info("  ⏭️  %s übersprungen (nie_aktivieren)", ma_kuerzel)
            continue
        pensum = ma_pensum_map.get(ma_kuerzel, 100)
        ma_id  = ensure_mitarbeiter(conn, ma_kuerzel, pensum, jahr=jahr, monat_num=monat_num,
                     import_id=import_id, plan_namen=plan_namen) if not dry_run else 0

        for tag, cell in sorted(day_map.items()):
            stats["total"] += 1

            # Neues Format: cell ist dict mit icons/halfs/bars
            # Altes Format (Rückwärtskompatibilität): cell ist str
            if isinstance(cell, str):
                cell = {"icons": cell.split("|"), "halfs": [], "bars": [], "halfs_h": []}

            icons   = cell.get("icons",   [])
            halfs   = cell.get("halfs",   [])
            bars    = cell.get("bars",    [])
            # halfs_h: horizontal geteilt — Liste von (top_y, icon_name), sortiert oben→unten
            halfs_h = [name for (_y, name) in cell.get("halfs_h", [])]

            # Hauptdienst bestimmen (Priorität: icon > vertikal-halb > horizontal-halb)
            def first_known(names, img_type=""):
                for n in names:
                    code = resolve_icon_to_dienst(n, icon_registry, fingerprint_map, img_type)
                    if code:
                        return code
                return ""

            if icons:
                dienst_code  = first_known(icons)
                dienst_code2 = ""
            elif len(halfs) >= 2:
                # Vertikal geteilt (links|rechts): zwei halbe Icons nebeneinander
                dienst_code  = first_known([halfs[0]])
                dienst_code2 = first_known(halfs[1:])
            elif halfs:
                dienst_code  = first_known(halfs)
                dienst_code2 = ""
            elif len(halfs_h) >= 2:
                # Horizontal geteilt (oben|unten): zwei Dienste übereinander
                dienst_code  = first_known([halfs_h[0]], "half_h")
                dienst_code2 = first_known([halfs_h[1]], "half_h")
            elif halfs_h:
                dienst_code  = first_known(halfs_h, "half_h")
                dienst_code2 = ""
            else:
                stats["uebersprungen"] += 1
                continue

            # Balken: jede Hex-Farbe → Zusatzfunktion-Code (alle auflösen, nicht nur erste)
            zusatz_codes = []
            for _hex in bars:
                _zcode = zusatz_color_to_code.get(_hex.upper(), "")
                if _zcode and _zcode not in zusatz_codes:
                    zusatz_codes.append(_zcode)
            if bars and not zusatz_codes:
                log.debug("  Unbekannte Balkenfarben: %s → icon_learn.py ausführen", bars)

            if not dienst_code:
                for n in (icons + halfs + halfs_h):
                    _, phash = icon_registry.get(n, (None, ""))
                    if phash and (phash in ignoriert_fingerprints
                                  or f"half_h:{phash}" in ignoriert_fingerprints):
                        continue  # bewusst ignoriert → kein Warning
                    stats["unbekannte_icons"].add(n)
                stats["uebersprungen"] += 1
                continue

            def ensure_dienst_code(code: str) -> None:
                """Stellt sicher dass der Code in dienst_typen existiert."""
                if not code:
                    return
                exists = conn.execute(
                    "SELECT 1 FROM dienst_typen WHERE code = ?", (code,)
                ).fetchone()
                if not exists:
                    conn.execute(
                        "INSERT OR IGNORE INTO dienst_typen "
                        "(code, anzeigename, kategorie, ist_nachtdienst, ist_ganztaegig) "
                        "VALUES (?, ?, 'Sonstiges', 0, 0)",
                        (code, f"[{code}]"),
                    )
                    stats.setdefault("auto_eingetragen", set()).add(code)

            def ensure_zusatzfunktion(code: str, farbe_hex: str = None) -> None:
                """Stellt sicher dass der Code in zusatzfunktionen existiert."""
                if not code:
                    return
                exists = conn.execute(
                    "SELECT 1 FROM zusatzfunktionen WHERE code = ?", (code,)
                ).fetchone()
                if not exists:
                    conn.execute(
                        "INSERT OR IGNORE INTO zusatzfunktionen "
                        "(code, anzeigename, farbe_hex) VALUES (?, ?, ?)",
                        (code, code, farbe_hex),
                    )
                    log.info("  Neue Zusatzfunktion angelegt: %s (%s)", code, farbe_hex or "?")

            ensure_dienst_code(dienst_code)
            ensure_dienst_code(dienst_code2)
            # Zusatzfunktionen sicherstellen (mit ursprünglicher Farbe)
            for zcode, zfarbe in zip(zusatz_codes, bars):
                ensure_zusatzfunktion(zcode, zfarbe)

            # Leere Strings → None
            # bar_code bleibt NULL — FK zeigt auf dienst_typen, Zusatzfunktionen sind in schicht_zusatz
            dienst_code2 = dienst_code2 or None
            bar_code     = None

            try:
                datum = date(jahr, monat_num, tag).isoformat()
            except ValueError:
                stats["uebersprungen"] += 1
                continue

            if dry_run:
                stats["eingefuegt"] += 1
                continue

            dt_row   = conn.execute(
                "SELECT anzeigename, dienstbeginn, dienstende, ort FROM dienst_typen WHERE code = ?",
                (dienst_code,),
            ).fetchone()
            existing = conn.execute(
                "SELECT id, dienst_code, dienst_code2, anzeigename, dienstbeginn, dienstende, ort "
                "FROM schichten WHERE mitarbeiter_id = ? AND datum = ?",
                (ma_id, datum),
            ).fetchone()

            # Anzeigename: nur Dienst (kein Balken mehr — der kommt als eigener Kalendereintrag)
            anzeigename = dt_row["anzeigename"] or dienst_code
            if dienst_code2:
                dt2 = conn.execute(
                    "SELECT anzeigename FROM dienst_typen WHERE code = ?", (dienst_code2,)
                ).fetchone()
                anzeigename += f" / {dt2['anzeigename'] if dt2 else dienst_code2}"

            if existing:
                schicht_id = existing["id"]
                # ics_sequence nur hochzählen wenn sich kalenderwirksame Felder geändert haben
                kalender_geaendert = (
                    existing["dienst_code"]  != dienst_code
                    or existing["dienst_code2"] != dienst_code2
                    or existing["anzeigename"]  != anzeigename
                    or existing["dienstbeginn"] != dt_row["dienstbeginn"]
                    or existing["dienstende"]   != dt_row["dienstende"]
                    or existing["ort"]          != dt_row["ort"]
                )
                # Zusatzfunktionen-Änderungen prüfen (vor dem Löschen/Neu-Einsetzen)
                existing_zusatz = {r["zusatz_code"] for r in conn.execute(
                    "SELECT zusatz_code FROM schicht_zusatz WHERE schicht_id = ?",
                    (schicht_id,)
                ).fetchall()}
                zusatz_geaendert = existing_zusatz != set(zusatz_codes)
                irgendwas_geaendert = kalender_geaendert or zusatz_geaendert

                seq_sql = "ics_sequence=COALESCE(ics_sequence,0)+1," if irgendwas_geaendert else ""
                id_sql  = "import_id=?," if irgendwas_geaendert else ""
                id_param = [import_id] if irgendwas_geaendert else []
                conn.execute(
                    f"UPDATE schichten SET dienst_code=?,dienst_code2=?,bar_code=?,"
                    f"dienstbeginn=?,dienstende=?,ort=?,anzeigename=?,{id_sql}{seq_sql}"
                    f"erstellt_am=erstellt_am WHERE id=?",
                    (dienst_code, dienst_code2, bar_code,
                     dt_row["dienstbeginn"], dt_row["dienstende"],
                     dt_row["ort"], anzeigename, *id_param, schicht_id),
                )
                if kalender_geaendert:
                    stats.setdefault("kalender_updates", 0)
                    stats["kalender_updates"] += 1
                    # Änderung für Log festhalten
                    stats.setdefault("aenderungen", []).append({
                        "kuerzel":   ma_kuerzel,
                        "datum":     datum,
                        "alt":       existing["anzeigename"] or existing["dienst_code"],
                        "neu":       anzeigename,
                    })
                stats["aktualisiert"] += 1
            else:
                conn.execute(
                    "INSERT INTO schichten "
                    "(mitarbeiter_id,dienst_code,dienst_code2,bar_code,datum,import_id,"
                    "dienstbeginn,dienstende,ort,anzeigename) "
                    "VALUES (?,?,?,?,?,?,?,?,?,?)",
                    (ma_id, dienst_code, dienst_code2, bar_code, datum, import_id,
                     dt_row["dienstbeginn"], dt_row["dienstende"],
                     dt_row["ort"], anzeigename),
                )
                schicht_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
                stats["eingefuegt"] += 1

            # Zusatzfunktionen in schicht_zusatz eintragen (n:m, UPSERT)
            if zusatz_codes:
                # Alte Einträge für diese Schicht löschen und neu setzen
                conn.execute("DELETE FROM schicht_zusatz WHERE schicht_id = ?", (schicht_id,))
                for zcode, zfarbe in zip(zusatz_codes, bars):
                    conn.execute(
                        "INSERT OR IGNORE INTO schicht_zusatz (schicht_id, zusatz_code, farbe_hex) "
                        "VALUES (?, ?, ?)",
                        (schicht_id, zcode, zfarbe),
                    )
            elif existing:
                # Keine Balken mehr → bestehende Zusätze entfernen
                conn.execute("DELETE FROM schicht_zusatz WHERE schicht_id = ?", (schicht_id,))

        # MA ist noch im Plan, aber einzelne Tage wurden abgetauscht/gestrichen →
        # Schichten die im neuen PDF fehlen aus der DB entfernen.
        valid_dates = set()
        for t in day_map.keys():
            try:
                valid_dates.add(date(jahr, monat_num, t).isoformat())
            except ValueError:
                pass
        if valid_dates and not dry_run and ma_id:
            placeholders = ','.join('?' * len(valid_dates))
            deleted = conn.execute(
                f"DELETE FROM schichten WHERE mitarbeiter_id = ? AND datum LIKE ? "
                f"AND datum NOT IN ({placeholders})",
                (ma_id, f"{import_ym}-%", *valid_dates)
            ).rowcount
            if deleted:
                log.info("  🗑️  %d gestrichene Schicht(en) für %s entfernt", deleted, ma_kuerzel)
                stats.setdefault("geloescht", 0)
                stats["geloescht"] += deleted
        elif valid_dates and dry_run:
            ids = ma_ids_im_plan(conn, ma_kuerzel, plan_namen)
            existing_rows = conn.execute(f"""
                SELECT s.datum FROM schichten s
                WHERE s.mitarbeiter_id IN ({','.join('?' * len(ids))}) AND s.datum LIKE ?
            """, (*ids, f"{import_ym}-%")).fetchall()
            stale = {r["datum"] for r in existing_rows} - valid_dates
            if stale:
                log.info("  [DRY-RUN] Würde %d gestrichene Schicht(en) für %s entfernen: %s",
                         len(stale), ma_kuerzel, ', '.join(sorted(stale)))

    if not dry_run:
        conn.commit()

        # ── Kollegen-Updates: Wer teilt einen Tag+Ort mit einer geänderten Schicht?
        # Wenn MA A seinen Dienst tauscht, ändert sich die Kollegen-Info aller
        # anderen MA auf demselben Tag+Ort → deren ics_sequence ebenfalls hochzählen.
        kollegen_updates = conn.execute("""
            UPDATE schichten
            SET ics_sequence = COALESCE(ics_sequence, 0) + 1
            WHERE id IN (
                -- Alle Schichten auf Datum+Ort wo sich IRGENDETWAS geändert hat
                SELECT s2.id
                FROM schichten s1
                JOIN schichten s2
                    ON  s1.datum = s2.datum
                    AND COALESCE(s1.ort, '') = COALESCE(s2.ort, '')
                    AND s1.id != s2.id
                WHERE s1.import_id = ?          -- nur Schichten des aktuellen Imports
                  AND s1.ics_sequence > 0        -- die selbst bereits geändert wurden
                  AND s2.ics_sequence = (        -- Kollege hat noch alte sequence
                        SELECT COALESCE(ics_sequence, 0) - 1
                        FROM schichten WHERE id = s2.id
                  )
            )
        """, (import_id,)).rowcount

        # Einfachere und zuverlässigere Variante: alle Kollegen auf betroffenen Tagen
        # (der obige Query ist komplex — direkter Ansatz via Python):
        betroffene_tage = conn.execute("""
            SELECT DISTINCT s.datum, COALESCE(s.ort, '') AS ort
            FROM schichten s
            WHERE s.import_id = ?
              AND s.ics_sequence > 0
        """, (import_id,)).fetchall()

        kollegen_updates = 0
        for row in betroffene_tage:
            n = conn.execute("""
                UPDATE schichten
                SET ics_sequence = COALESCE(ics_sequence, 0) + 1
                WHERE datum = ?
                  AND COALESCE(ort, '') = ?
                  AND import_id != ?
            """, (row["datum"], row["ort"], import_id)).rowcount
            kollegen_updates += n

        if kollegen_updates:
            stats["kollegen_updates"] = kollegen_updates
            log.info("  📅 %d Kollegen-Schichten ebenfalls aktualisiert (Teamwechsel)", kollegen_updates)

        conn.commit()
        conn.execute(
            "UPDATE import_log SET status='OK', anzahl_eintraege=? WHERE id=?",
            (stats["eingefuegt"] + stats["aktualisiert"], import_id),
        )
        conn.commit()

    # ── Schichten löschen für MA die nicht mehr im Plan sind ────────────────────
    # Gilt für aktive UND inaktive MA — der aktiv-Flag spielt hier keine Rolle.
    # Schutz vor Re-Import alter Monate greift über die Deaktivierungslogik unten.
    # Abgleich über IDs: Namen ohne Zusatz und alte Namen zusammengeführter MA
    # gehören zur bisherigen MA, deren Kürzel nicht im PDF steht.
    pdf_ma_ids = {i for name in plan_namen for i in ma_ids_im_plan(conn, name, plan_namen)}

    ma_im_monat = conn.execute("""
        SELECT DISTINCT m.id, m.kuerzel
        FROM schichten s
        JOIN mitarbeiter m ON m.id = s.mitarbeiter_id
        WHERE s.datum LIKE ?
    """, (f"{import_ym}-%",)).fetchall()

    for ma_row in ma_im_monat:
        if ma_row["id"] in pdf_ma_ids:
            continue  # noch im Plan → Dienste behalten
        if not dry_run:
            deleted = conn.execute(
                "DELETE FROM schichten WHERE mitarbeiter_id = ? AND datum LIKE ?",
                (ma_row["id"], f"{import_ym}-%")
            ).rowcount
            if deleted:
                log.info("  🗑️  %d Schicht(en) für %s (%s) gelöscht (MA nicht mehr im Plan)",
                         deleted, ma_row["kuerzel"], import_ym)
        else:
            n = conn.execute(
                "SELECT COUNT(*) AS n FROM schichten WHERE mitarbeiter_id = ? AND datum LIKE ?",
                (ma_row["id"], f"{import_ym}-%")
            ).fetchone()["n"]
            if n:
                log.info("  [DRY-RUN] Würde %d Schicht(en) für %s (%s) löschen",
                         n, ma_row["kuerzel"], import_ym)

    if not dry_run:
        conn.commit()

    # ── Aktive MA deaktivieren wenn nicht mehr im Plan ───────────────────────────
    # Query läuft nach dem Löschen → letzter_dienst ist bereits aktuell.
    # Schutz: Re-Import eines alten Monats soll MA mit laufenden Plänen nicht deaktivieren.
    kandidaten = conn.execute("""
        SELECT m.id, m.kuerzel, MAX(s.datum) AS letzter_dienst
        FROM mitarbeiter m
        LEFT JOIN schichten s ON s.mitarbeiter_id = m.id
        WHERE m.aktiv = 1 AND COALESCE(m.nie_aktivieren, 0) = 0
        GROUP BY m.id, m.kuerzel
    """).fetchall()

    zu_deaktivieren = []
    for row in kandidaten:
        if row["id"] in pdf_ma_ids:
            continue
        letzter = row["letzter_dienst"]
        if not letzter:
            continue  # Keine Schichten → nicht deaktivieren
        if letzter[:7] > import_ym:
            continue  # Noch in zukünftigem Plan → nicht deaktivieren
        zu_deaktivieren.append(row)

    if zu_deaktivieren:
        stats["deaktiviert"] = [r["kuerzel"] for r in zu_deaktivieren]
        if not dry_run:
            for row in zu_deaktivieren:
                conn.execute(
                    "UPDATE mitarbeiter SET aktiv = 0, geaendert_am = datetime('now') WHERE id = ?",
                    (row["id"],)
                )
                log.info("  👋 MA deaktiviert (nicht mehr im Plan ab %s): %s",
                         import_ym, row["kuerzel"])
            conn.commit()
        else:
            for row in zu_deaktivieren:
                log.info("  [DRY-RUN] Würde deaktivieren: %s (letzter Dienst: %s)",
                         row["kuerzel"], row["letzter_dienst"][:7])

    return stats


def main() -> None:
    parser = argparse.ArgumentParser(description="PDF → Datenbank importieren")
    parser.add_argument("--pdf",     required=True)
    parser.add_argument("--month",   required=True)
    parser.add_argument("--year",    required=True, type=int)
    parser.add_argument("--db",      default=str(DB_PATH))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    pdf_path = Path(args.pdf)
    db_path  = Path(args.db)

    if not pdf_path.exists():
        log.error("PDF nicht gefunden: %s", pdf_path)
        sys.exit(1)

    conn = create_database(db_path) if not db_path.exists() else get_connection(db_path)

    if args.dry_run:
        log.info("⚠️  DRY-RUN – keine Änderungen werden gespeichert")

    try:
        stats = import_pdf_to_db(pdf_path, args.month, args.year, conn, dry_run=args.dry_run)
    finally:
        conn.close()

    print("\n" + "─" * 50)
    print(f"  Import: {pdf_path.name}")
    print(f"  Einträge gesamt:   {stats['total']}")
    print(f"  Neu eingefügt:     {stats['eingefuegt']}")
    print(f"  Aktualisiert:      {stats['aktualisiert']}")
    if stats.get("kalender_updates"):
        print(f"  davon eigene Dienst-Änderungen:  {stats['kalender_updates']}")
        # Detailliste der Änderungen
        aenderungen = stats.get("aenderungen", [])
        if aenderungen:
            print(f"\n  {'─'*48}")
            print(f"  GEÄNDERTE DIENSTE ({len(aenderungen)} Einträge):")
            print(f"  {'─'*48}")
            for a in sorted(aenderungen, key=lambda x: (x["kuerzel"], x["datum"])):
                print(f"  {a['kuerzel']:<14}  {a['datum']}  {a['alt']:<18} → {a['neu']}")
            print(f"  {'─'*48}")
            print(f"  → Mit --nur-aenderungen erhalten nur diese MA eine neue Mail.")
    if stats.get("kollegen_updates"):
        print(f"  davon Kollegen-Teamwechsel:       {stats['kollegen_updates']}")
    print(f"  Übersprungen:      {stats['uebersprungen']}")
    if stats.get("geloescht"):
        print(f"  Gestrichene Schichten gelöscht: {stats['geloescht']}")
    if stats.get("auto_eingetragen"):
        print(f"\n  ⚠️  {len(stats['auto_eingetragen'])} neue Codes als Platzhalter eingetragen:")
        for code in sorted(stats["auto_eingetragen"]):
            print(f"     '{code}'")
        print("     → Bitte in den Einstellungen → Dienstzeiten ergänzen (Zeiten, Ort, Anzeigename)")
    if stats.get("deaktiviert"):
        verb = "Würde deaktivieren" if args.dry_run else "Deaktiviert"
        print(f"\n  👋 {verb} ({len(stats['deaktiviert'])} MA nicht mehr im Plan):")
        for k in stats["deaktiviert"]:
            print(f"     {k}")
    if stats["unbekannte_icons"]:
        print(f"\n  ⚠️  Unbekannte Icons: {sorted(stats['unbekannte_icons'])}")
        print("     → python icon_learn.py --pdf ... ausführen")
    print("─" * 50)


if __name__ == "__main__":
    main()
