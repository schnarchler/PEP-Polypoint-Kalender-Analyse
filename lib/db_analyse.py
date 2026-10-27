"""
db_analyse.py – Auswertungen & Reports
=======================================
Reports:
  --statistiken        Kennzahlen pro MA (Arbeitstage, Stunden, Nacht-/WE-Dienste)
  --nachtdienste       Nacht- und Wochenenddienste mit Kollegen + Belastungsrangliste
  --besetzung          Tages-Besetzung pro Ort
  --dienst-haeufigkeit Wer macht welchen Dienst wie oft (Pivot-Tabelle)
  --teamkombinationen  Welche Team-Kombinationen kommen wie oft vor
  --kollegen-ranking   Mit wem rückt ein bestimmter MA am häufigsten aus?
  --export-excel       Alle Reports als Excel-Datei

Aufruf:
  python db_analyse.py --statistiken        --month Januar --year 2026
  python db_analyse.py --nachtdienste       --month Januar --year 2026
  python db_analyse.py --nachtdienste       --year 2026          # ganzes Jahr
  python db_analyse.py --besetzung          --month Januar --year 2026
  python db_analyse.py --dienst-haeufigkeit --month Januar --year 2026
  python db_analyse.py --dienst-haeufigkeit --year 2026
  python db_analyse.py --teamkombinationen  --month Januar --year 2026
  python db_analyse.py --teamkombinationen  --year 2026 --top 20
  python db_analyse.py --kollegen-ranking   --name "mustma"
  python db_analyse.py --kollegen-ranking   --name "mustma" --year 2026
  python db_analyse.py --kollegen-ranking   --name "mustma" --month März --year 2026
  python db_analyse.py --export-excel       --month Januar --year 2026
"""

import argparse
import logging
import sys
from pathlib import Path

import pandas as pd
from datetime import date

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import BASE_DIR, MONATE_DE
from db_setup import DB_PATH, get_connection


def build_datum_filter(monat: str | None, jahr: int | None,
                       von: str | None, bis: str | None) -> tuple[str, list]:
    """Gibt (WHERE-Bedingung, params) für einen Datumsbereich zurück.
    Priorität: --von/--bis > --month/--year > alles
    """
    if von and bis:
        return "AND datum BETWEEN ? AND ?", [von, bis]
    if von:
        return "AND datum >= ?", [von]
    if bis:
        return "AND datum <= ?", [bis]
    if monat and jahr:
        monat_num = MONATE_DE.get(monat, 0)
        return f"AND datum LIKE ?", [f"{jahr}-{monat_num:02d}%"]
    if jahr:
        return "AND datum LIKE ?", [f"{jahr}%"]
    return "", []


def intervall_label(monat, jahr, von, bis) -> str:
    if von and bis:
        return f"{von} bis {bis}"
    if von:
        return f"ab {von}"
    if bis:
        return f"bis {bis}"
    if monat and jahr:
        return f"{monat} {jahr}"
    return str(jahr or "alle")

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════════════════
# REPORTS
# ══════════════════════════════════════════════════════════════════════════════

def report_statistiken_ma(conn, monat: str | None, jahr: int | None) -> pd.DataFrame:
    """Kennzahlen pro MA: Arbeitstage, Stunden, Nacht-/WE-Dienste."""
    if monat and jahr:
        monat_num  = MONATE_DE[monat]
        where, params = "WHERE jahr_monat = ?", [f"{jahr}-{monat_num:02d}"]
    elif jahr:
        where, params = "WHERE jahr_monat LIKE ?", [f"{jahr}%"]
    else:
        where, params = "", []

    df = pd.read_sql_query(f"""
        SELECT
            ma_kuerzel              AS Kürzel,
            ma_name                 AS Name,
            jahr_monat              AS Monat,
            arbeitstage             AS Arbeitstage,
            total_stunden           AS "Total h",
            avg_stunden_pro_dienst  AS "Ø h/Dienst",
            nachtdienste            AS Nachtdienste,
            wochenenddienste        AS "WE-Dienste"
        FROM v_statistiken_ma
        {where}
        ORDER BY ma_kuerzel, jahr_monat
    """, conn, params=params)

    monat_str = f"{monat} {jahr}" if monat and jahr else str(jahr or "alle")
    print(f"\n{'='*80}")
    print(f"  DIENST-STATISTIKEN PRO MITARBEITER  –  {monat_str}")
    print(f"{'='*80}")
    print(df.to_string(index=False))

    if not df.empty:
        print(f"\n  ── Teamtotal ─────────────────────────────────────────")
        print(f"  Arbeitstage gesamt:   {df['Arbeitstage'].sum():>5}")
        print(f"  Nachtdienste gesamt:  {df['Nachtdienste'].sum():>5}")
        print(f"  WE-Dienste gesamt:    {df['WE-Dienste'].sum():>5}")
        print(f"  Ø Stunden/MA:         {df['Total h'].mean():>5.1f}h")
    return df


def report_nachtdienste(conn, monat: str | None, jahr: int | None,
                        von: str | None = None, bis: str | None = None) -> pd.DataFrame:
    """Nacht- und Wochenenddienste mit freiem Datumsintervall + Fairness-Rangliste."""
    datum_cond, params = build_datum_filter(monat, jahr, von, bis)
    label = intervall_label(monat, jahr, von, bis)

    df = pd.read_sql_query(f"""
        SELECT
            k.datum,
            k.wochentag,
            CASE WHEN k.ist_wochenende  = 1 THEN 'WE'    ELSE '' END AS WE,
            CASE WHEN k.ist_nachtdienst = 1 THEN 'Nacht' ELSE '' END AS Nacht,
            k.ma_kuerzel        AS Kürzel,
            k.ma_name           AS Name,
            k.pensum_pct        AS Pensum,
            k.anzeigename       AS Dienst,
            k.dienstbeginn      AS Beginn,
            k.dienstende        AS Ende,
            k.ort               AS Ort,
            COALESCE(k.kollegen_namen, '–') AS Kollegen
        FROM v_kollegen k
        WHERE (k.ist_nachtdienst = 1 OR k.ist_wochenende = 1)
          AND k.kategorie = 'Arbeit'
          {datum_cond}
        ORDER BY k.datum, k.ma_kuerzel
    """, conn, params=params)

    print(f"\n{'='*100}")
    print(f"  NACHT- & WOCHENENDDIENSTE  –  {label}")
    print(f"{'='*100}")
    print(df.to_string(index=False))

    if not df.empty:
        summary = df.groupby(["Kürzel", "Name", "Pensum"]).agg(
            Nachtdienste=('Nacht', lambda x: (x == 'Nacht').sum()),
            WE_Dienste  =('WE',    lambda x: (x == 'WE').sum()),
            Total       =('Dienst','count'),
        ).reset_index()
        summary["Gesamt"]       = summary["Nachtdienste"] + summary["WE_Dienste"]
        # Bereinigt auf 100% Pensum (Fairness-Vergleich)
        summary["Nacht/100%"]   = (summary["Nachtdienste"] / summary["Pensum"] * 100).round(1)
        summary["WE/100%"]      = (summary["WE_Dienste"]   / summary["Pensum"] * 100).round(1)
        summary["Gesamt/100%"]  = (summary["Gesamt"]       / summary["Pensum"] * 100).round(1)
        summary = summary.sort_values("Gesamt/100%", ascending=False)

        print(f"\n  ── Fairness-Rangliste (normiert auf 100% Pensum) ───────────────────────")
        cols = ["Kürzel","Name","Pensum","Nachtdienste","WE_Dienste","Gesamt",
                "Nacht/100%","WE/100%","Gesamt/100%"]
        print(summary[cols].to_string(index=False))
        print(f"\n  ── Top 5 Belastung (normiert) ──────────────────────────────────────────")
        print(summary[cols].head(5).to_string(index=False))

    return df


def report_besetzung(conn, monat: str, jahr: int) -> pd.DataFrame:
    """Tages-Besetzung: Wer arbeitet wann auf welchem Ort?"""
    monat_num = MONATE_DE[monat]
    df = pd.read_sql_query("""
        SELECT
            datum, wochentag,
            CASE WHEN ist_wochenende = 1 THEN '🔶' ELSE '' END AS WE,
            ort, dienst, dienstbeginn, dienstende,
            anzahl_ma AS "Anz. MA", ma_namen_liste AS Personal
        FROM v_besetzung
        WHERE datum LIKE ?
        ORDER BY datum, ort, dienstbeginn
    """, conn, params=[f"{jahr}-{monat_num:02d}%"])

    print(f"\n{'='*90}")
    print(f"  BESETZUNGSPLAN  {monat} {jahr}")
    print(f"{'='*90}")
    print(df.to_string(index=False))
    print(f"\nTotal: {len(df)} Schicht-Kombinationen")
    return df


# ══════════════════════════════════════════════════════════════════════════════
# NEUE REPORTS
# ══════════════════════════════════════════════════════════════════════════════

def report_dienst_haeufigkeit(conn, monat: str | None, jahr: int | None,
                               von: str | None = None, bis: str | None = None) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Wer macht welchen Dienst wie oft – als Kreuztabelle (Pivot) und als Detailliste."""
    datum_cond, params = build_datum_filter(monat, jahr, von, bis)
    label = intervall_label(monat, jahr, von, bis)

    # Detailliste: MA × Dienst → Anzahl
    df = pd.read_sql_query(f"""
        SELECT
            ma_kuerzel          AS Kürzel,
            ma_name             AS Name,
            anzeigename         AS Dienst,
            dienst_code         AS Code,
            COUNT(*)            AS Anzahl
        FROM v_schichten
        WHERE kategorie = 'Arbeit'
          {datum_cond}
        GROUP BY ma_kuerzel, anzeigename, dienst_code
        ORDER BY ma_kuerzel, Anzahl DESC
    """, conn, params=params)

    print(f"\n{'='*90}")
    print(f"  DIENST-HÄUFIGKEIT PRO MITARBEITER  –  {label}")
    print(f"{'='*90}")
    print(df.to_string(index=False))

    # Pivot-Tabelle: Zeilen = MA, Spalten = Dienst
    pivot = pd.DataFrame()
    if not df.empty:
        pivot = df.pivot_table(
            index=["Kürzel", "Name"],
            columns="Dienst",
            values="Anzahl",
            aggfunc="sum",
            fill_value=0,
        )
        pivot["TOTAL"] = pivot.sum(axis=1)
        pivot = pivot.sort_values("TOTAL", ascending=False)
        pivot.columns.name = None
        pivot = pivot.reset_index()

        print(f"\n  ── Pivot-Tabelle (MA × Dienst) ─────────────────────────────────────────────")
        print(pivot.to_string(index=False))

        # Totalspalte pro Dienst
        totals = pivot.select_dtypes(include="number").sum()
        print(f"\n  ── Dienst-Total (Team) ──────────────────────────────────────────────────────")
        for dienst, n in totals.items():
            print(f"  {dienst:<35} {int(n):>5}×")

    return df, pivot


def report_teamkombinationen(conn, monat: str | None, jahr: int | None,
                              von: str | None = None, bis: str | None = None,
                              top: int = 20) -> pd.DataFrame:
    """Welche Team-Kombinationen (pro Tag & Ort) kommen wie oft vor?"""
    datum_cond, params = build_datum_filter(monat, jahr, von, bis)
    label = intervall_label(monat, jahr, von, bis)

    # Alle Arbeitstage mit sortierter MA-Liste pro Datum+Ort
    df_raw = pd.read_sql_query(f"""
        SELECT
            datum,
            ort,
            GROUP_CONCAT(ma_kuerzel, ', ') AS team_roh
        FROM (
            SELECT datum, ort, ma_kuerzel
            FROM v_schichten
            WHERE kategorie = 'Arbeit'
              {datum_cond}
            ORDER BY datum, ort, ma_kuerzel
        )
        GROUP BY datum, ort
    """, conn, params=params)

    print(f"\n{'='*90}")
    print(f"  TEAM-KOMBINATIONEN  –  {label}")
    print(f"{'='*90}")

    if df_raw.empty:
        print("  Keine Daten gefunden.")
        return pd.DataFrame()

    # Kürzel sortieren → kanonische Kombination
    def normalize(raw: str) -> str:
        parts = [k.strip() for k in raw.split(",")]
        return " | ".join(sorted(set(parts)))

    df_raw["Team"] = df_raw["team_roh"].apply(normalize)
    df_raw["Anzahl_MA"] = df_raw["team_roh"].apply(lambda x: len(set(k.strip() for k in x.split(","))))

    # Häufigkeit je Kombination (ort-übergreifend)
    kombi_gesamt = (
        df_raw.groupby("Team")
        .agg(Anzahl=("datum", "count"), Anz_MA=("Anzahl_MA", "first"))
        .reset_index()
        .sort_values("Anzahl", ascending=False)
        .head(top)
    )
    kombi_gesamt.columns = ["Team-Kombination", "Häufigkeit", "Anz. MA"]

    print(f"\n  ── Top {top} Kombinationen (alle Orte zusammen) ─────────────────────────────")
    print(kombi_gesamt.to_string(index=False))

    # Häufigkeit je Kombination UND Ort
    kombi_ort = (
        df_raw.groupby(["ort", "Team"])
        .agg(Anzahl=("datum", "count"))
        .reset_index()
        .sort_values(["ort", "Anzahl"], ascending=[True, False])
    )
    kombi_ort.columns = ["Ort", "Team-Kombination", "Häufigkeit"]

    print(f"\n  ── Top-Kombinationen pro Ort ────────────────────────────────────────────────")
    for ort, grp in kombi_ort.groupby("Ort"):
        print(f"\n  {ort}:")
        print(grp.head(10).to_string(index=False))

    return kombi_gesamt, kombi_ort


def report_kollegen_ranking(conn, ma_kuerzel: str,
                             monat: str | None = None, jahr: int | None = None,
                             von: str | None = None, bis: str | None = None) -> pd.DataFrame:
    """Mit wem rückt ein MA am häufigsten zusammen aus?

    Basis: v_besetzung — jede Zeile ist ein konkreter Einsatz (datum + ort + dienst).
    Nur Einsätze mit max. 3 MA werden berücksichtigt.
    """
    datum_cond, params = build_datum_filter(monat, jahr, von, bis)
    label = intervall_label(monat, jahr, von, bis)

    # MA-Kürzel tolerant suchen (Gross/Klein, Teilstring)
    row = conn.execute("""
        SELECT kuerzel, COALESCE(vorname || ' ' || nachname, kuerzel) AS name
        FROM mitarbeiter
        WHERE lower(kuerzel) = lower(?)
           OR lower(kuerzel) LIKE lower(?)
        ORDER BY aktiv DESC LIMIT 1
    """, (ma_kuerzel, f"%{ma_kuerzel}%")).fetchone()

    if not row:
        print(f"\n  ❌ MA '{ma_kuerzel}' nicht gefunden.")
        print("     Verfügbare Kürzel:")
        alle = conn.execute("SELECT kuerzel FROM mitarbeiter WHERE aktiv=1 ORDER BY kuerzel").fetchall()
        for r in alle:
            print(f"     {r['kuerzel']}")
        return pd.DataFrame()

    kuerzel  = row["kuerzel"]
    ma_name  = row["name"]

    # Alle Einsätze mit ≤ 3 MA und gesetztem Ort laden (kein Ort = Schulung etc. → ausschliessen)
    alle_einsaetze = conn.execute(f"""
        SELECT datum, ort, dienst, dienstbeginn, dienstende,
               anzahl_ma, ma_kuerzel_liste
        FROM v_besetzung
        WHERE anzahl_ma <= 3
          AND ort IS NOT NULL AND ort != ''
          {datum_cond}
        ORDER BY datum
    """, params).fetchall()

    # Nur Einsätze behalten wo dieser MA in der Kürzel-Liste vorkommt
    einsaetze = []
    for e in alle_einsaetze:
        kuerzel_in_einsatz = [k.strip() for k in e["ma_kuerzel_liste"].split(",")]
        if kuerzel in kuerzel_in_einsatz:
            einsaetze.append(e)

    # ── Ausgabe ───────────────────────────────────────────────────────────────
    print(f"\n{'═'*70}")
    print(f"  KOLLEGEN-RANKING  –  {ma_name} ({kuerzel})")
    print(f"  Zeitraum: {label}  |  nur Einsätze mit ≤ 3 MA und gesetztem Ort")
    print(f"{'═'*70}")

    if not einsaetze:
        # Diagnose: wie viele Einsätze total (ohne ≤3 Filter)?
        n_total = conn.execute(f"""
            SELECT COUNT(*) FROM v_besetzung
            {('WHERE ' + datum_cond.lstrip('AND ')) if datum_cond else ''}
        """, params).fetchone()[0]
        n_mit_ma = sum(
            1 for e in conn.execute(f"""
                SELECT ma_kuerzel_liste FROM v_besetzung
                {('WHERE ' + datum_cond.lstrip('AND ')) if datum_cond else ''}
            """, params).fetchall()
            if kuerzel in [k.strip() for k in e["ma_kuerzel_liste"].split(",")]
        )
        print(f"  Keine Einsätze mit ≤ 3 MA gefunden.")
        print(f"  Diagnose: {n_mit_ma} Einsätze total für diesen MA, {len(alle_einsaetze)} davon mit ≤ 3 MA im Team.")
        if n_mit_ma > 0 and len(alle_einsaetze) == 0:
            print(f"  → Alle Einsätze dieses MA haben mehr als 3 MA.")
        elif n_mit_ma == 0:
            print(f"  → Keine Arbeitsdienste in der DB für diesen MA/Zeitraum.")
        return pd.DataFrame()

    # Kollegen aus ma_kuerzel_liste extrahieren und zählen
    kollegen_count: dict[str, int] = {}
    for e in einsaetze:
        kuerzel_liste = [k.strip() for k in e["ma_kuerzel_liste"].split(",")]
        for k in kuerzel_liste:
            if k and k != kuerzel:
                kollegen_count[k] = kollegen_count.get(k, 0) + 1

    if not kollegen_count:
        print(f"  {len(einsaetze)} Einsätze gefunden, aber alle Einzeleinsätze (kein Kollege).")
        return pd.DataFrame()

    # Namen der Kollegen aus DB holen
    kollegen_namen: dict[str, str] = {}
    for k in kollegen_count:
        r = conn.execute("""
            SELECT COALESCE(vorname || ' ' || nachname, kuerzel) AS name
            FROM mitarbeiter WHERE kuerzel = ?
        """, (k,)).fetchone()
        kollegen_namen[k] = r["name"] if r else k

    # Rangliste aufbauen
    rangliste = sorted(kollegen_count.items(), key=lambda x: x[1], reverse=True)

    # Aufschlüsselung nach Ort
    ort_kollegen: dict[str, dict[str, int]] = {}
    for e in einsaetze:
        ort = e["ort"] or "(kein Ort)"
        kuerzel_liste = [k.strip() for k in e["ma_kuerzel_liste"].split(",")]
        for k in kuerzel_liste:
            if k and k != kuerzel:
                ort_kollegen.setdefault(ort, {})
                ort_kollegen[ort][k] = ort_kollegen[ort].get(k, 0) + 1

    # ── Ausgabe Rangliste ─────────────────────────────────────────────────────
    print(f"\n  {'Rang':<5} {'Name':<28} {'Anzahl':>7}")
    print(f"  {'─'*4} {'─'*27} {'─'*7}")
    for rang, (k, anzahl) in enumerate(rangliste, 1):
        name = kollegen_namen.get(k, k)
        print(f"  {rang:<5} {name:<28} {anzahl:>6}×")

    # ── Aufschlüsselung nach Ort ──────────────────────────────────────────────
    if len(ort_kollegen) > 1:
        print(f"\n  {'─'*70}")
        print(f"  AUFSCHLÜSSELUNG NACH ORT")
        for ort in sorted(ort_kollegen):
            print(f"\n  📍 {ort}:")
            print(f"  {'Name':<28} {'Anzahl':>7}")
            print(f"  {'─'*27} {'─'*7}")
            ort_rang = sorted(ort_kollegen[ort].items(), key=lambda x: x[1], reverse=True)
            for k, anzahl in ort_rang:
                name = kollegen_namen.get(k, k)
                print(f"  {name:<28} {anzahl:>6}×")

    print(f"\n{'═'*70}")
    print(f"  {len(einsaetze)} Einsätze analysiert  |  "
          f"{len(kollegen_count)} verschiedene Kollegen")
    print(f"{'═'*70}\n")

    # DataFrame für allfälligen Weitergebrauch zurückgeben
    df = pd.DataFrame([
        {"Kürzel": k, "Name": kollegen_namen.get(k, k), "Anzahl": n}
        for k, n in rangliste
    ])
    return df


# ══════════════════════════════════════════════════════════════════════════════
# EXCEL-EXPORT (3 Sheets)
# ══════════════════════════════════════════════════════════════════════════════

def export_excel(conn, monat: str | None, jahr: int | None,
                 output_path: Path,
                 von: str | None = None, bis: str | None = None) -> None:
    """Exportiert alle Reports als Excel-Datei — mit freiem Datumsintervall."""
    datum_cond, params = build_datum_filter(monat, jahr, von, bis)
    label = intervall_label(monat, jahr, von, bis)

    def _safe_sheet(writer, name: str, df: pd.DataFrame) -> None:
        """Schreibt einen DataFrame als Sheet — bei leerem df immer eine Header-Zeile."""
        if df is None or (hasattr(df, "empty") and df.empty):
            pd.DataFrame(columns=["(keine Daten)"]).to_excel(writer, sheet_name=name, index=False)
        else:
            df.to_excel(writer, sheet_name=name, index=False)

    with pd.ExcelWriter(str(output_path), engine="openpyxl") as writer:

        # ── Sheet 1: Statistiken pro MA ───────────────────────────────────────
        try:
            df_stat = pd.read_sql_query(f"""
                SELECT vs.ma_kuerzel AS Kürzel,
                       vs.ma_name    AS Name,
                       m.pensum_pct  AS "Pensum %",
                       SUM(vs.arbeitstage)           AS Arbeitstage,
                       ROUND(SUM(vs.total_stunden),1) AS "Total h",
                       SUM(vs.nachtdienste)           AS Nachtdienste,
                       SUM(vs.wochenenddienste)       AS "WE-Dienste"
                FROM v_statistiken_ma vs
                JOIN mitarbeiter m ON vs.ma_kuerzel = m.kuerzel
                WHERE EXISTS (
                    SELECT 1 FROM schichten s
                    JOIN mitarbeiter mx ON s.mitarbeiter_id = mx.id
                    WHERE mx.kuerzel = vs.ma_kuerzel {datum_cond}
                )
                GROUP BY vs.ma_kuerzel, vs.ma_name, m.pensum_pct
                ORDER BY vs.ma_kuerzel
            """, conn, params=params)
            if not df_stat.empty:
                df_stat["Nacht/100%"]  = (df_stat["Nachtdienste"] / df_stat["Pensum %"] * 100).round(1)
                df_stat["WE/100%"]     = (df_stat["WE-Dienste"]   / df_stat["Pensum %"] * 100).round(1)
                df_stat["Gesamt/100%"] = (df_stat["Nacht/100%"] + df_stat["WE/100%"]).round(1)
                df_stat = df_stat.sort_values("Gesamt/100%", ascending=False)
        except Exception as e:
            log.warning("Sheet 'Statistiken' fehlgeschlagen: %s", e)
            df_stat = pd.DataFrame()
        _safe_sheet(writer, "Statistiken", df_stat)

        # ── Sheet 2: Nacht- & WE-Dienste Detail ──────────────────────────────
        try:
            df_nacht = pd.read_sql_query(f"""
                SELECT k.datum, k.wochentag,
                       CASE WHEN k.ist_wochenende  = 1 THEN 'WE'    ELSE '' END AS Typ,
                       CASE WHEN k.ist_nachtdienst = 1 THEN 'Nacht' ELSE '' END AS Nacht,
                       k.ma_kuerzel AS Kürzel, k.ma_name AS Name,
                       m.pensum_pct AS "Pensum %",
                       k.anzeigename AS Dienst,
                       k.dienstbeginn AS Beginn, k.dienstende AS Ende, k.ort AS Ort,
                       COALESCE(k.kollegen_namen, '–') AS Kollegen
                FROM v_kollegen k
                JOIN mitarbeiter m ON k.ma_kuerzel = m.kuerzel
                WHERE (k.ist_nachtdienst = 1 OR k.ist_wochenende = 1)
                  AND k.kategorie = 'Arbeit'
                  {datum_cond}
                ORDER BY k.datum, k.ma_kuerzel
            """, conn, params=params)
        except Exception as e:
            log.warning("Sheet 'Nacht & WE Detail' fehlgeschlagen: %s", e)
            df_nacht = pd.DataFrame()
        _safe_sheet(writer, "Nacht & WE Detail", df_nacht)

        # ── Sheet 3: Fairness-Rangliste ───────────────────────────────────────
        try:
            if not df_nacht.empty:
                fair = df_nacht.groupby(["Kürzel", "Name", "Pensum %"]).agg(
                    Nachtdienste=("Nacht", lambda x: (x == "Nacht").sum()),
                    WE_Dienste  =("Typ",   lambda x: (x == "WE").sum()),
                ).reset_index()
                fair["Gesamt"]      = fair["Nachtdienste"] + fair["WE_Dienste"]
                fair["Nacht/100%"]  = (fair["Nachtdienste"] / fair["Pensum %"] * 100).round(1)
                fair["WE/100%"]     = (fair["WE_Dienste"]   / fair["Pensum %"] * 100).round(1)
                fair["Gesamt/100%"] = (fair["Gesamt"]       / fair["Pensum %"] * 100).round(1)
                df_fair = fair.sort_values("Gesamt/100%", ascending=False)
            else:
                df_fair = pd.DataFrame()
        except Exception as e:
            log.warning("Sheet 'Fairness-Rangliste' fehlgeschlagen: %s", e)
            df_fair = pd.DataFrame()
        _safe_sheet(writer, "Fairness-Rangliste", df_fair)

        # ── Sheet 4: Besetzungsplan ───────────────────────────────────────────
        try:
            df_besetzung = pd.read_sql_query(f"""
                SELECT datum, wochentag,
                       CASE WHEN ist_wochenende = 1 THEN 'WE' ELSE '' END AS WE,
                       ort, dienst, dienstbeginn, dienstende,
                       anzahl_ma AS "Anz. MA", ma_namen_liste AS Personal
                FROM v_besetzung
                WHERE 1=1 {datum_cond}
                ORDER BY datum, ort, dienstbeginn
            """, conn, params=params)
        except Exception as e:
            log.warning("Sheet 'Besetzung' fehlgeschlagen: %s", e)
            df_besetzung = pd.DataFrame()
        _safe_sheet(writer, "Besetzung", df_besetzung)

        # ── Sheet 5: Dienst-Häufigkeit Detail ────────────────────────────────
        try:
            df_dh = pd.read_sql_query(f"""
                SELECT
                    ma_kuerzel  AS Kürzel,
                    ma_name     AS Name,
                    anzeigename AS Dienst,
                    dienst_code AS Code,
                    COUNT(*)    AS Anzahl
                FROM v_schichten
                WHERE kategorie = 'Arbeit'
                  {datum_cond}
                GROUP BY ma_kuerzel, anzeigename, dienst_code
                ORDER BY ma_kuerzel, Anzahl DESC
            """, conn, params=params)
        except Exception as e:
            log.warning("Sheet 'Dienst-Häufigkeit' fehlgeschlagen: %s", e)
            df_dh = pd.DataFrame()
        _safe_sheet(writer, "Dienst-Häufigkeit", df_dh)

        # ── Sheet 6: Dienst-Häufigkeit Pivot ─────────────────────────────────
        try:
            if not df_dh.empty:
                pivot = df_dh.pivot_table(
                    index=["Kürzel", "Name"],
                    columns="Dienst",
                    values="Anzahl",
                    aggfunc="sum",
                    fill_value=0,
                )
                pivot["TOTAL"] = pivot.sum(axis=1)
                pivot = pivot.sort_values("TOTAL", ascending=False)
                pivot.columns.name = None
                df_pivot = pivot.reset_index()
            else:
                df_pivot = pd.DataFrame()
        except Exception as e:
            log.warning("Sheet 'Dienst-Pivot' fehlgeschlagen: %s", e)
            df_pivot = pd.DataFrame()
        _safe_sheet(writer, "Dienst-Pivot", df_pivot)

        # ── Sheet 7 & 8: Team-Kombinationen ──────────────────────────────────
        try:
            df_tk_raw = pd.read_sql_query(f"""
                SELECT datum, ort,
                       GROUP_CONCAT(ma_kuerzel, ', ') AS team_roh
                FROM (
                    SELECT datum, ort, ma_kuerzel
                    FROM v_schichten
                    WHERE kategorie = 'Arbeit'
                      {datum_cond}
                    ORDER BY datum, ort, ma_kuerzel
                )
                GROUP BY datum, ort
            """, conn, params=params)

            if not df_tk_raw.empty:
                def _normalize(raw: str) -> str:
                    return " | ".join(sorted(set(k.strip() for k in raw.split(","))))
                df_tk_raw["Team"]   = df_tk_raw["team_roh"].apply(_normalize)
                df_tk_raw["Anz_MA"] = df_tk_raw["team_roh"].apply(
                    lambda x: len(set(k.strip() for k in x.split(","))))
                kombi_gesamt = (
                    df_tk_raw.groupby("Team")
                    .agg(Häufigkeit=("datum", "count"), Anz_MA=("Anz_MA", "first"))
                    .reset_index()
                    .sort_values("Häufigkeit", ascending=False)
                )
                kombi_gesamt.columns = ["Team-Kombination", "Häufigkeit", "Anz. MA"]
                kombi_ort = (
                    df_tk_raw.groupby(["ort", "Team"])
                    .agg(Häufigkeit=("datum", "count"))
                    .reset_index()
                    .sort_values(["ort", "Häufigkeit"], ascending=[True, False])
                )
                kombi_ort.columns = ["Ort", "Team-Kombination", "Häufigkeit"]
            else:
                kombi_gesamt = pd.DataFrame()
                kombi_ort    = pd.DataFrame()
        except Exception as e:
            log.warning("Sheet 'Team-Kombi' fehlgeschlagen: %s", e)
            kombi_gesamt = pd.DataFrame()
            kombi_ort    = pd.DataFrame()
        _safe_sheet(writer, "Team-Kombi gesamt", kombi_gesamt)
        _safe_sheet(writer, "Team-Kombi pro Ort", kombi_ort)

    log.info("✅ Excel-Report gespeichert: %s  (Intervall: %s)", output_path, label)


# ══════════════════════════════════════════════════════════════════════════════
# HAUPTPROGRAMM
# ══════════════════════════════════════════════════════════════════════════════

def main() -> None:
    parser = argparse.ArgumentParser(description="Dienstplan-Auswertungen")
    parser.add_argument("--db",                 default=str(DB_PATH))
    parser.add_argument("--month",              help="Monat (z.B. Januar)")
    parser.add_argument("--year",               type=int, help="Jahr")
    parser.add_argument("--statistiken",        action="store_true", help="Statistiken pro MA")
    parser.add_argument("--nachtdienste",       action="store_true", help="Nacht- & WE-Dienste")
    parser.add_argument("--besetzung",          action="store_true", help="Besetzungsplan")
    parser.add_argument("--dienst-haeufigkeit", action="store_true", help="Wer macht welchen Dienst wie oft")
    parser.add_argument("--teamkombinationen",  action="store_true", help="Welche Team-Kombinationen wie oft")
    parser.add_argument("--top",                type=int, default=20, help="Top-N Kombinationen (default: 20)")
    parser.add_argument("--kollegen-ranking",   action="store_true",
                        help="Mit wem rückt ein MA am häufigsten aus? (benötigt --name)")
    parser.add_argument("--name",               help="MA-Kürzel für --kollegen-ranking")
    parser.add_argument("--export-excel",       action="store_true", help="Alle Reports als Excel")
    parser.add_argument("--output",             help="Ausgabedatei für Excel")
    parser.add_argument("--von",  help="Startdatum YYYY-MM-DD (überschreibt --month/--year)")
    parser.add_argument("--bis",  help="Enddatum   YYYY-MM-DD (überschreibt --month/--year)")
    args = parser.parse_args()

    conn = get_connection(Path(args.db))

    try:
        if args.statistiken:
            report_statistiken_ma(conn, args.month, args.year)
        if args.nachtdienste:
            report_nachtdienste(conn, args.month, args.year, args.von, args.bis)
        if args.besetzung:
            report_besetzung(conn, args.month, args.year)
        if args.dienst_haeufigkeit:
            report_dienst_haeufigkeit(conn, args.month, args.year, args.von, args.bis)
        if args.teamkombinationen:
            report_teamkombinationen(conn, args.month, args.year, args.von, args.bis, top=args.top)
        if args.kollegen_ranking:
            if not args.name:
                print("  ❌ --kollegen-ranking benötigt --name <Kürzel>")
                print("     Beispiel: python db_analyse.py --kollegen-ranking --name mustma")
            else:
                report_kollegen_ranking(conn, args.name, args.month, args.year, args.von, args.bis)
        if args.export_excel:
            label = (f"{args.von}_bis_{args.bis}" if args.von and args.bis
                     else f"{args.month}_{args.year}" if args.month and args.year
                     else str(args.year or "alle"))
            out = Path(args.output) if args.output else \
                  BASE_DIR / "excel_export" / f"Analyse_{label}.xlsx"
            (out.parent).mkdir(parents=True, exist_ok=True)
            export_excel(conn, args.month, args.year, out, args.von, args.bis)
            from db_setup import log_aktivitaet
            log_aktivitaet("analyse", f"Analyse-Report {label}", out.name)
        if not any([args.statistiken, args.nachtdienste, args.besetzung,
                    args.dienst_haeufigkeit, args.teamkombinationen,
                    args.kollegen_ranking, args.export_excel]):
            parser.print_help()
    finally:
        conn.close()


if __name__ == "__main__":
    main()
