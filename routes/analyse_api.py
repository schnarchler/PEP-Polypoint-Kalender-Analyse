from flask import Blueprint, jsonify, request

from config import MONATE_DE

bp = Blueprint("analyse_api", __name__)


def _args():
    """Extract all period params from the current request."""
    return (
        request.args.get("month", "").strip(),
        request.args.get("year",  "").strip(),
        request.args.get("von",   "").strip(),
        request.args.get("bis",   "").strip(),
    )


def _date_filter(monat, jahr, von="", bis=""):
    """Returns (AND-fragment, params) for SQL using a `datum` column."""
    if von and bis:
        return "AND datum BETWEEN ? AND ?", [von, bis]
    if von:
        return "AND datum >= ?", [von]
    if bis:
        return "AND datum <= ?", [bis]
    if monat in MONATE_DE and jahr:
        return "AND datum LIKE ?", [f"{jahr}-{MONATE_DE[monat]:02d}%"]
    if jahr:
        return "AND datum LIKE ?", [f"{jahr}%"]
    return "", []


def _ym_filter(monat, jahr, von="", bis=""):
    """Returns (AND-fragment, params) for SQL using a `jahr_monat` column."""
    if von and bis:
        return "AND jahr_monat BETWEEN ? AND ?", [von[:7], bis[:7]]
    if von:
        return "AND jahr_monat >= ?", [von[:7]]
    if bis:
        return "AND jahr_monat <= ?", [bis[:7]]
    if monat in MONATE_DE and jahr:
        return "AND jahr_monat = ?", [f"{jahr}-{MONATE_DE[monat]:02d}"]
    if jahr:
        return "AND jahr_monat LIKE ?", [f"{jahr}%"]
    return "", []


@bp.route("/api/analyse/statistiken")
def api_analyse_statistiken():
    monat, jahr, von, bis = _args()
    ym_cond, params = _ym_filter(monat, jahr, von, bis)
    try:
        from db_setup import get_connection
        conn = get_connection()
        rows = conn.execute(f"""
            SELECT vs.ma_kuerzel AS kuerzel,
                   vs.ma_name    AS name,
                   m.pensum_pct  AS pensum,
                   SUM(vs.arbeitstage)             AS arbeitstage,
                   ROUND(SUM(vs.total_stunden), 1) AS total_h,
                   SUM(vs.nachtdienste)             AS nachtdienste,
                   SUM(vs.wochenenddienste)         AS we_dienste
            FROM v_statistiken_ma vs
            JOIN mitarbeiter m ON vs.ma_kuerzel = m.kuerzel
            WHERE vs.arbeitstage > 0 {ym_cond}
            GROUP BY vs.ma_kuerzel, vs.ma_name, m.pensum_pct
            ORDER BY vs.ma_kuerzel
        """, params).fetchall()
        conn.close()
        result = []
        for r in rows:
            p  = r["pensum"] or 100
            nd = r["nachtdienste"] or 0
            we = r["we_dienste"]   or 0
            result.append({
                "kuerzel":      r["kuerzel"],
                "name":         r["name"],
                "pensum":       p,
                "arbeitstage":  r["arbeitstage"],
                "total_h":      r["total_h"],
                "nachtdienste": nd,
                "we_dienste":   we,
                "nacht_100":    round(nd / p * 100, 1) if p else 0,
                "we_100":       round(we / p * 100, 1) if p else 0,
                "gesamt_100":   round((nd + we) / p * 100, 1) if p else 0,
            })
        result.sort(key=lambda x: x["gesamt_100"], reverse=True)
        return jsonify(result)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@bp.route("/api/analyse/nachtdienste")
def api_analyse_nachtdienste():
    monat, jahr, von, bis = _args()
    date_cond, params = _date_filter(monat, jahr, von, bis)
    try:
        from db_setup import get_connection
        conn = get_connection()
        rows = conn.execute(f"""
            SELECT k.datum, k.wochentag,
                   CASE WHEN k.ist_nachtdienst = 1 THEN 'Nacht' ELSE '' END AS nacht,
                   CASE WHEN k.ist_wochenende  = 1 THEN 'WE'   ELSE '' END AS we,
                   k.ma_kuerzel AS kuerzel, k.ma_name AS name,
                   m.pensum_pct AS pensum,
                   k.anzeigename AS dienst,
                   k.dienstbeginn AS beginn, k.dienstende AS ende,
                   k.ort AS ort, COALESCE(k.kollegen_namen, '–') AS kollegen
            FROM v_kollegen k
            JOIN mitarbeiter m ON k.ma_kuerzel = m.kuerzel
            WHERE (k.ist_nachtdienst = 1 OR k.ist_wochenende = 1)
              AND k.kategorie = 'Arbeit'
              {date_cond}
            ORDER BY k.datum, k.ma_kuerzel
        """, params).fetchall()
        conn.close()

        detail = [dict(r) for r in rows]

        summary = {}
        for r in detail:
            k = r["kuerzel"]
            if k not in summary:
                summary[k] = {"kuerzel": k, "name": r["name"],
                               "pensum": r["pensum"] or 100,
                               "nachtdienste": 0, "we_dienste": 0}
            if r["nacht"] == "Nacht":
                summary[k]["nachtdienste"] += 1
            if r["we"] == "WE":
                summary[k]["we_dienste"] += 1

        fairness = []
        for v in summary.values():
            p  = v["pensum"] or 100
            nd = v["nachtdienste"]
            we = v["we_dienste"]
            fairness.append({
                **v,
                "gesamt":     nd + we,
                "nacht_100":  round(nd / p * 100, 1),
                "we_100":     round(we / p * 100, 1),
                "gesamt_100": round((nd + we) / p * 100, 1),
            })
        fairness.sort(key=lambda x: x["gesamt_100"], reverse=True)

        return jsonify({"fairness": fairness, "detail": detail})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@bp.route("/api/analyse/besetzung")
def api_analyse_besetzung():
    monat, jahr, von, bis = _args()
    date_cond, params = _date_filter(monat, jahr, von, bis)
    if not date_cond:
        return jsonify({"error": "Zeitraum erforderlich (Monat, Quartal oder Halbjahr empfohlen)"}), 400
    try:
        from db_setup import get_connection
        conn = get_connection()
        rows = conn.execute(f"""
            SELECT datum, wochentag,
                   CASE WHEN ist_wochenende = 1 THEN 1 ELSE 0 END AS we,
                   ort, dienst, dienstbeginn, dienstende,
                   anzahl_ma, ma_namen_liste AS personal
            FROM v_besetzung
            WHERE 1=1 {date_cond}
            ORDER BY datum, ort, dienstbeginn
        """, params).fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows])
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@bp.route("/api/analyse/dienst_haeufigkeit")
def api_analyse_dienst_haeufigkeit():
    monat, jahr, von, bis = _args()
    date_cond, params = _date_filter(monat, jahr, von, bis)
    try:
        from db_setup import get_connection
        conn = get_connection()
        rows = conn.execute(f"""
            SELECT ma_kuerzel AS kuerzel, ma_name AS name,
                   anzeigename AS dienst, COUNT(*) AS anzahl
            FROM v_schichten_expanded
            WHERE kategorie = 'Arbeit'
              {date_cond}
            GROUP BY ma_kuerzel, anzeigename
            ORDER BY ma_kuerzel, anzahl DESC
        """, params).fetchall()
        ort_rows = conn.execute(f"""
            SELECT ma_kuerzel AS kuerzel, ma_name AS name,
                   ort, anzeigename AS dienst, COUNT(*) AS anzahl
            FROM v_schichten_expanded
            WHERE kategorie = 'Arbeit'
              AND ort IS NOT NULL AND ort != ''
              {date_cond}
            GROUP BY ma_kuerzel, ort, anzeigename
            ORDER BY ort, ma_kuerzel, anzahl DESC
        """, params).fetchall()
        max_ma_rows = conn.execute(f"""
            SELECT dienst, MAX(anzahl_ma) AS max_ma
            FROM v_besetzung
            WHERE 1=1 {date_cond}
            GROUP BY dienst
        """, params).fetchall()
        ausrueck_rows = conn.execute(
            "SELECT anzeigename FROM dienst_typen"
            " WHERE COALESCE(ist_ausrueckdienst,0) = 1"
        ).fetchall()
        conn.close()

        dienst_max_ma    = {r["dienst"]: r["max_ma"] for r in max_ma_rows}
        ausrueck_dienste = [r["anzeigename"] for r in ausrueck_rows]

        pivot_map = {}
        dienst_set = set()
        for r in rows:
            k = r["kuerzel"]
            if k not in pivot_map:
                pivot_map[k] = {"kuerzel": k, "name": r["name"]}
            pivot_map[k][r["dienst"]] = r["anzahl"]
            dienst_set.add(r["dienst"])

        dienste = sorted(dienst_set)
        pivot = []
        for v in pivot_map.values():
            row = {"kuerzel": v["kuerzel"], "name": v["name"]}
            total = 0
            for d in dienste:
                n = v.get(d, 0)
                row[d] = n
                total += n
            row["__total"] = total
            pivot.append(row)
        pivot.sort(key=lambda x: x["__total"], reverse=True)

        totals = {d: sum(r.get(d, 0) for r in pivot) for d in dienste}

        # Nach Standort aufschlüsseln
        ort_buckets: dict = {}
        for r in ort_rows:
            ort = r["ort"]
            k   = r["kuerzel"]
            if ort not in ort_buckets:
                ort_buckets[ort] = {"pm": {}, "ds": set()}
            if k not in ort_buckets[ort]["pm"]:
                ort_buckets[ort]["pm"][k] = {"kuerzel": k, "name": r["name"]}
            ort_buckets[ort]["pm"][k][r["dienst"]] = r["anzahl"]
            ort_buckets[ort]["ds"].add(r["dienst"])

        nach_ort_pivot = {}
        for ort, b in ort_buckets.items():
            ds = sorted(b["ds"])
            pv = []
            for v in b["pm"].values():
                row = {"kuerzel": v["kuerzel"], "name": v["name"]}
                tot = 0
                for d in ds:
                    n = v.get(d, 0); row[d] = n; tot += n
                row["__total"] = tot
                pv.append(row)
            pv.sort(key=lambda x: x["__total"], reverse=True)
            nach_ort_pivot[ort] = {
                "dienste": ds,
                "pivot":   pv,
                "totals":  {d: sum(r.get(d, 0) for r in pv) for d in ds},
            }

        return jsonify({"dienste": dienste, "pivot": pivot, "totals": totals,
                        "dienst_max_ma": dienst_max_ma,
                        "ausrueck_dienste": ausrueck_dienste,
                        "nach_ort": nach_ort_pivot})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@bp.route("/api/analyse/teamkombinationen")
def api_analyse_teamkombinationen():
    monat, jahr, von, bis = _args()
    date_cond, params = _date_filter(monat, jahr, von, bis)
    try:
        from db_setup import get_connection
        conn = get_connection()
        rows = conn.execute(f"""
            SELECT datum, ort, ma_kuerzel, anzeigename
            FROM v_schichten
            WHERE kategorie = 'Arbeit'
              {date_cond}
            ORDER BY datum, ort, ma_kuerzel
        """, params).fetchall()

        # Group by datum+ort, tracking first anzeigename per MA
        from collections import defaultdict
        day_groups = defaultdict(dict)  # (datum, ort) -> {kuerzel: anzeigename}
        for r in rows:
            key = (r["datum"], r["ort"] or "(kein Ort)")
            kuerzel = r["ma_kuerzel"].strip()
            if kuerzel not in day_groups[key]:
                day_groups[key][kuerzel] = r["anzeigename"] or ""

        # Pairwise counts (gesamt and per Ort) + dienst breakdown
        paar_count     = {}
        paar_count_ort = {}
        paar_dienste   = {}  # (a, b) -> {dienst_name: count}

        for (datum, ort), ma_dict in day_groups.items():
            liste = sorted(ma_dict.keys())
            for i, a in enumerate(liste):
                for b in liste[i + 1:]:
                    key = (a, b)
                    paar_count[key] = paar_count.get(key, 0) + 1
                    paar_count_ort.setdefault(ort, {})
                    paar_count_ort[ort][key] = paar_count_ort[ort].get(key, 0) + 1
                    dienst = ma_dict.get(a) or ma_dict.get(b) or "(unbekannt)"
                    paar_dienste.setdefault(key, {})
                    paar_dienste[key][dienst] = paar_dienste[key].get(dienst, 0) + 1

        # All MA appearing in any pair — resolve names
        alle_kuerzel = sorted(set(k for pair in paar_count for k in pair))
        namen = {}
        for k in alle_kuerzel:
            r = conn.execute(
                "SELECT COALESCE(vorname || ' ' || nachname, kuerzel) AS name"
                " FROM mitarbeiter WHERE kuerzel = ?", (k,)
            ).fetchone()
            namen[k] = r["name"] if r else k
        alle = [{"kuerzel": k, "name": namen[k]} for k in alle_kuerzel]
        conn.close()

        # Matrix: list of {a, b, anzahl, dienste} sorted by frequency
        paare = sorted(
            [{
                "a": a, "b": b, "anzahl": n,
                "dienste": sorted(
                    [{"name": d, "anzahl": c} for d, c in paar_dienste.get((a, b), {}).items()],
                    key=lambda x: -x["anzahl"],
                ),
            } for (a, b), n in paar_count.items()],
            key=lambda x: x["anzahl"], reverse=True,
        )

        # Per-Ort pairwise list
        nach_ort = {
            ort: sorted(
                [{"a": a, "b": b, "anzahl": n} for (a, b), n in pt.items()],
                key=lambda x: x["anzahl"], reverse=True,
            )
            for ort, pt in sorted(paar_count_ort.items())
        }

        max_anzahl = max((p["anzahl"] for p in paare), default=1)

        return jsonify({
            "alle":       alle,
            "paare":      paare,
            "nach_ort":   nach_ort,
            "max_anzahl": max_anzahl,
        })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@bp.route("/api/analyse/jahresuebersicht")
def api_analyse_jahresuebersicht():
    jahr = request.args.get("year", "").strip()
    if not jahr.isdigit():
        return jsonify({"error": "Jahr erforderlich"}), 400
    try:
        from db_setup import get_connection
        conn = get_connection()
        rows = conn.execute("""
            SELECT vs.ma_kuerzel AS kuerzel,
                   vs.ma_name    AS name,
                   m.pensum_pct  AS pensum,
                   vs.jahr_monat,
                   vs.arbeitstage,
                   vs.nachtdienste,
                   vs.wochenenddienste  AS we_dienste,
                   ROUND(vs.total_stunden, 1) AS total_h,
                   vs.freitage,
                   vs.abwesenheitstage
            FROM v_statistiken_ma vs
            JOIN mitarbeiter m ON vs.ma_kuerzel = m.kuerzel
            WHERE vs.jahr_monat LIKE ?
            ORDER BY vs.ma_kuerzel, vs.jahr_monat
        """, (f"{jahr}-%",)).fetchall()
        conn.close()

        ma_map: dict = {}
        for r in rows:
            k = r["kuerzel"]
            if k not in ma_map:
                ma_map[k] = {
                    "kuerzel": k, "name": r["name"], "pensum": r["pensum"] or 100,
                    "monate":  {},
                    "gesamt":  {"arbeitstage": 0, "nachtdienste": 0, "we_dienste": 0,
                                "total_h": 0.0, "freitage": 0, "abwesenheitstage": 0},
                }
            m_key = r["jahr_monat"][5:7]  # "01"–"12"
            entry = {
                "arbeitstage":      r["arbeitstage"]      or 0,
                "nachtdienste":     r["nachtdienste"]     or 0,
                "we_dienste":       r["we_dienste"]       or 0,
                "total_h":          r["total_h"]          or 0.0,
                "freitage":         r["freitage"]         or 0,
                "abwesenheitstage": r["abwesenheitstage"] or 0,
            }
            ma_map[k]["monate"][m_key] = entry
            for key in ("arbeitstage", "nachtdienste", "we_dienste", "freitage", "abwesenheitstage"):
                ma_map[k]["gesamt"][key] += entry[key]
            ma_map[k]["gesamt"]["total_h"] = round(
                ma_map[k]["gesamt"]["total_h"] + entry["total_h"], 1
            )

        return jsonify(sorted(ma_map.values(), key=lambda x: x["kuerzel"]))
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@bp.route("/api/analyse/kollegen_ranking")
def api_analyse_kollegen_ranking():
    kuerzel = request.args.get("kuerzel", "").strip()
    monat, jahr, von, bis = _args()
    date_cond, params = _date_filter(monat, jahr, von, bis)
    try:
        from db_setup import get_connection
        conn = get_connection()

        if not kuerzel:
            alle = conn.execute(
                "SELECT kuerzel,"
                " COALESCE(vorname || ' ' || nachname, kuerzel)"
                " || CASE WHEN aktiv = 0 THEN ' (inaktiv)' ELSE '' END AS name"
                " FROM mitarbeiter WHERE zusammengefuehrt_in_id IS NULL ORDER BY aktiv DESC, kuerzel"
            ).fetchall()
            conn.close()
            return jsonify({"alle_ma": [dict(r) for r in alle]})

        ma = conn.execute(
            "SELECT id, kuerzel, COALESCE(vorname || ' ' || nachname, kuerzel) AS name"
            " FROM mitarbeiter WHERE lower(kuerzel) = lower(?)",
            (kuerzel,),
        ).fetchone()
        if not ma:
            conn.close()
            return jsonify({"error": f"MA '{kuerzel}' nicht gefunden"}), 404

        # Alle Kürzel die in diesen MA gemergt wurden (alte Namen/Kürzel = Aliases)
        alias_rows = conn.execute(
            "SELECT kuerzel FROM mitarbeiter WHERE zusammengefuehrt_in_id = ?",
            (ma["id"],),
        ).fetchall()
        eigene_kuerzel = {ma["kuerzel"]} | {r["kuerzel"] for r in alias_rows}

        rows = conn.execute(f"""
            SELECT datum, ort, dienst, anzahl_ma, ma_kuerzel_liste
            FROM v_besetzung
            WHERE anzahl_ma <= 3
              AND ort IS NOT NULL AND ort != ''
              {date_cond}
            ORDER BY datum
        """, params).fetchall()

        from datetime import date as date_cls
        today = str(date_cls.today())

        einsaetze = []
        for r in rows:
            liste = [k.strip() for k in r["ma_kuerzel_liste"].split(",")]
            if any(k in eigene_kuerzel for k in liste):
                einsaetze.append({"datum": r["datum"], "ort": r["ort"], "dienst": r["dienst"], "liste": liste})

        kollegen_count = {}
        kollegen_bevorstehend = {}
        ort_count      = {}
        ort_bevorstehend = {}
        dienst_count   = {}
        dienst_bevorstehend = {}
        for e in einsaetze:
            is_future = e["datum"] >= today
            for k in e["liste"]:
                if k and k not in eigene_kuerzel:
                    kollegen_count[k] = kollegen_count.get(k, 0) + 1
                    if is_future:
                        kollegen_bevorstehend[k] = kollegen_bevorstehend.get(k, 0) + 1
                    ort = e["ort"] or "(kein Ort)"
                    ort_count.setdefault(ort, {})
                    ort_count[ort][k] = ort_count[ort].get(k, 0) + 1
                    if is_future:
                        ort_bevorstehend.setdefault(ort, {})
                        ort_bevorstehend[ort][k] = ort_bevorstehend[ort].get(k, 0) + 1
                    dienst = e["dienst"] or "(kein Dienst)"
                    dienst_count.setdefault(dienst, {})
                    dienst_count[dienst][k] = dienst_count[dienst].get(k, 0) + 1
                    if is_future:
                        dienst_bevorstehend.setdefault(dienst, {})
                        dienst_bevorstehend[dienst][k] = dienst_bevorstehend[dienst].get(k, 0) + 1

        namen = {}
        for k in kollegen_count:
            r = conn.execute(
                "SELECT COALESCE(vorname || ' ' || nachname, kuerzel) AS name"
                " FROM mitarbeiter WHERE kuerzel = ?", (k,)
            ).fetchone()
            namen[k] = r["name"] if r else k
        conn.close()

        rangliste = sorted(
            [{"kuerzel": k, "name": namen.get(k, k), "anzahl": n, "bevorstehend": kollegen_bevorstehend.get(k, 0)}
             for k, n in kollegen_count.items()],
            key=lambda x: x["anzahl"], reverse=True,
        )
        nach_ort = {
            ort: sorted(
                [{"kuerzel": k, "name": namen.get(k, k), "anzahl": n, "bevorstehend": ort_bevorstehend.get(ort, {}).get(k, 0)}
                 for k, n in kt.items()],
                key=lambda x: x["anzahl"], reverse=True,
            )
            for ort, kt in sorted(ort_count.items())
        }
        nach_dienst = {
            dienst: sorted(
                [{"kuerzel": k, "name": namen.get(k, k), "anzahl": n, "bevorstehend": dienst_bevorstehend.get(dienst, {}).get(k, 0)}
                 for k, n in kt.items()],
                key=lambda x: x["anzahl"], reverse=True,
            )
            for dienst, kt in sorted(dienst_count.items())
        }

        return jsonify({
            "kuerzel":     ma["kuerzel"],
            "name":        ma["name"],
            "einsaetze":   len(einsaetze),
            "rangliste":   rangliste,
            "nach_ort":    nach_ort,
            "nach_dienst": nach_dienst,
        })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@bp.route("/api/analyse/vergleich")
def api_analyse_vergleich():
    """Vergleich zweier MA: an welchen Tagen haben beide gleichzeitig Dienst."""
    ma1_kuerzel = request.args.get("ma1", "").strip()
    ma2_kuerzel = request.args.get("ma2", "").strip()
    monat, jahr, von, bis = _args()
    date_cond, params = _date_filter(monat, jahr, von, bis)
    try:
        from db_setup import get_connection
        conn = get_connection()

        if not ma1_kuerzel or not ma2_kuerzel:
            alle = conn.execute(
                "SELECT kuerzel,"
                " COALESCE(vorname || ' ' || nachname, kuerzel) AS name,"
                " aktiv"
                " FROM mitarbeiter WHERE zusammengefuehrt_in_id IS NULL"
                " ORDER BY aktiv DESC, nachname, vorname, kuerzel"
            ).fetchall()
            conn.close()
            return jsonify({"alle_ma": [dict(r) for r in alle]})

        def get_ma(kuerzel):
            row = conn.execute(
                "SELECT id, kuerzel,"
                " COALESCE(vorname || ' ' || nachname, kuerzel) AS name"
                " FROM mitarbeiter WHERE lower(kuerzel) = lower(?)",
                (kuerzel,),
            ).fetchone()
            if not row:
                return None
            alias_ids = [r["id"] for r in conn.execute(
                "SELECT id FROM mitarbeiter WHERE zusammengefuehrt_in_id = ?",
                (row["id"],),
            ).fetchall()]
            return {"id": row["id"], "kuerzel": row["kuerzel"], "name": row["name"],
                    "ids": [row["id"]] + alias_ids}

        m1 = get_ma(ma1_kuerzel)
        m2 = get_ma(ma2_kuerzel)
        if not m1 or not m2:
            conn.close()
            return jsonify({"error": "Mindestens ein MA nicht gefunden"}), 404

        def fetch_shifts(ma_info):
            in_ph = ",".join(["?"] * len(ma_info["ids"]))
            rows = conn.execute(f"""
                SELECT s.datum,
                       s.dienst_code                                          AS code,
                       COALESCE(s.anzeigename, dt.anzeigename, s.dienst_code) AS anzeigename,
                       COALESCE(s.dienstbeginn, dt.dienstbeginn, '')          AS beginn,
                       COALESCE(s.dienstende,   dt.dienstende,   '')          AS ende,
                       COALESCE(s.ort, dt.ort, '')                            AS ort,
                       COALESCE(dt.kategorie, 'Sonstiges')                    AS kategorie
                FROM schichten s
                LEFT JOIN dienst_typen dt ON dt.code = s.dienst_code
                WHERE s.mitarbeiter_id IN ({in_ph})
                  {date_cond}
                ORDER BY s.datum
            """, ma_info["ids"] + params).fetchall()
            return {r["datum"]: dict(r) for r in rows}

        from datetime import date as _date
        WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]

        shifts1 = fetch_shifts(m1)
        shifts2 = fetch_shifts(m2)
        conn.close()

        alle_daten = sorted(set(shifts1) | set(shifts2))
        tage = []
        for datum in alle_daten:
            s1 = shifts1.get(datum)
            s2 = shifts2.get(datum)
            beide_arbeit = bool(
                s1 and s1["kategorie"] == "Arbeit"
                and s2 and s2["kategorie"] == "Arbeit"
            )
            tage.append({
                "datum":        datum,
                "wochentag":    WOCHENTAGE[_date.fromisoformat(datum).weekday()],
                "beide_arbeit": beide_arbeit,
                "ma1":          s1,
                "ma2":          s2,
            })

        return jsonify({
            "ma1":  {"kuerzel": m1["kuerzel"], "name": m1["name"]},
            "ma2":  {"kuerzel": m2["kuerzel"], "name": m2["name"]},
            "tage": tage,
        })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
