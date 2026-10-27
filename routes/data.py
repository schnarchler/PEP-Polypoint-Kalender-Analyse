import datetime

from flask import Blueprint, jsonify, request

from config import BASE_DIR, MONATE_DE

bp = Blueprint("data", __name__)


@bp.route("/api/jahr/<int:year>")
def api_jahr(year: int):
    try:
        from db_setup import get_connection
        conn = get_connection()
        rows = conn.execute("""
            SELECT strftime('%m', datum) AS monat_num,
                   COUNT(DISTINCT mitarbeiter_id) AS ma,
                   COUNT(*) AS schichten
            FROM schichten
            WHERE strftime('%Y', datum) = ?
            GROUP BY monat_num
        """, (str(year),)).fetchall()

        versand_rows = conn.execute("""
            SELECT monat, MAX(gesendet_am) AS letzter_versand
            FROM mail_versand_log
            WHERE jahr = ?
            GROUP BY monat
        """, (year,)).fetchall()
        letzter_versand = {r["monat"]: r["letzter_versand"] for r in versand_rows}

        # Monate mit offenen Änderungen bei MA die eine E-Mail-Adresse haben.
        # Basis: Schichten deren import_id neuer ist als der letzte Versand für diesen MA.
        # import_id wird nur aktualisiert wenn sich die Schicht tatsächlich geändert hat.
        pending_rows = conn.execute("""
            SELECT DISTINCT CAST(strftime('%m', s.datum) AS INTEGER) AS monat_num
            FROM schichten s
            JOIN mitarbeiter m ON m.id = s.mitarbeiter_id
            JOIN import_log il ON il.id = s.import_id
            WHERE strftime('%Y', s.datum) = ?
              AND m.email IS NOT NULL AND trim(m.email) != ''
              AND il.importiert_am > COALESCE((
                  SELECT MAX(v.gesendet_am)
                  FROM mail_versand_log v
                  WHERE v.kuerzel = m.kuerzel
                    AND v.monat = il.monat
                    AND v.jahr = ?
              ), '1900-01-01')
        """, (str(year), year)).fetchall()
        pending_monat_nums = {r["monat_num"] for r in pending_rows}

        monate_num = {v: k for k, v in MONATE_DE.items() if k != "Maerz"}
        SHORT = {
            "Januar": "Jan", "Februar": "Feb", "März": "Mär", "April": "Apr",
            "Mai": "Mai", "Juni": "Jun", "Juli": "Jul", "August": "Aug",
            "September": "Sep", "Oktober": "Okt", "November": "Nov", "Dezember": "Dez",
        }
        result = {}
        for r in rows:
            mn    = int(r["monat_num"])
            mname = monate_num.get(mn, str(mn))
            if mn in pending_monat_nums:
                status = "pending"
            elif mname in letzter_versand:
                status = "voll"
            elif r["schichten"] > 0:
                status = "teilweise"
            else:
                status = "leer"
            result[SHORT.get(mname, mname[:3])] = {
                "status": status, "ma": r["ma"], "schichten": r["schichten"],
            }
        conn.close()
        return jsonify(result)
    except Exception:
        return jsonify({})


@bp.route("/api/verlauf")
def api_verlauf():
    try:
        from db_setup import get_connection
        conn = get_connection()
        imports = conn.execute("""
            SELECT monat, jahr, importiert_am AS ts, anzahl_eintraege, status
            FROM import_log ORDER BY id DESC LIMIT 30
        """).fetchall()
        aktivitaeten = conn.execute("""
            SELECT kind, titel, detail, status, erstellt_am AS ts
            FROM aktivitaeten_log ORDER BY id DESC LIMIT 30
        """).fetchall()
        conn.close()

        eintraege = [{
            "kind":   "import",
            "titel":  f"Import {r['monat']} {r['jahr']}",
            "detail": f"{r['anzahl_eintraege']} Einträge",
            "ts":     r["ts"],
            "status": r["status"],
        } for r in imports] + [{
            "kind":   r["kind"],
            "titel":  r["titel"],
            "detail": r["detail"] or "",
            "ts":     r["ts"],
            "status": r["status"],
        } for r in aktivitaeten]

        eintraege.sort(key=lambda x: x["ts"] or "", reverse=True)
        return jsonify(eintraege[:40])
    except Exception:
        return jsonify([])


@bp.route("/api/dienst_tag")
def api_dienst_tag():
    try:
        from db_setup import get_connection
        date_str = request.args.get("date", "")
        if not date_str:
            date_str = datetime.date.today().isoformat()
        datetime.date.fromisoformat(date_str)  # Validate
        conn = get_connection()
        rows = conn.execute("""
            SELECT e.vorname, e.nachname, e.dienst_code,
                   COALESCE(e.ort, dt.ort) AS ort,
                   e.dienstbeginn, e.dienstende
            FROM v_schichten_expanded e
            JOIN dienst_typen dt ON dt.code = e.dienst_code
            WHERE e.datum = ?
              AND COALESCE(dt.ist_ausrueckdienst, 0) = 1
            ORDER BY COALESCE(e.ort, dt.ort), e.dienstbeginn, e.nachname
        """, (date_str,)).fetchall()
        conn.close()
        standorte: dict = {}
        for r in rows:
            ort = r["ort"] or "–"
            if ort not in standorte:
                standorte[ort] = []
            standorte[ort].append({
                "name": f"{r['vorname']} {r['nachname']}",
                "code": r["dienst_code"],
                "von":  r["dienstbeginn"] or "",
                "bis":  r["dienstende"]   or "",
            })
        result = [{"ort": ort, "eintraege": eintraege} for ort, eintraege in standorte.items()]
        return jsonify({"date": date_str, "standorte": result})
    except Exception:
        return jsonify({"date": "", "standorte": []})


@bp.route("/api/kpi")
def api_kpi():
    try:
        from db_setup import get_connection
        year  = request.args.get("year",  "")
        month = request.args.get("month", "")
        conn  = get_connection()

        monat_num = f"{MONATE_DE[month]:02d}" if month in MONATE_DE else None

        # Monatsbezogen
        if year and monat_num:
            wm      = "WHERE strftime('%Y', datum) = ? AND strftime('%m', datum) = ?"
            params_m = [year, monat_num]
        elif year:
            wm      = "WHERE strftime('%Y', datum) = ?"
            params_m = [year]
        else:
            wm      = ""
            params_m = []

        # Jahresbezogen
        wy      = "WHERE strftime('%Y', datum) = ?" if year else ""
        params_y = [year] if year else []

        ma_monat    = conn.execute(f"SELECT COUNT(DISTINCT mitarbeiter_id) FROM schichten {wm}", params_m).fetchone()[0]
        schichten_m = conn.execute(
            f"SELECT SUM(CASE WHEN dienst_code2 IS NOT NULL THEN 2 ELSE 1 END) FROM schichten {wm}",
            params_m).fetchone()[0] or 0
        ma_jahr     = conn.execute(f"SELECT COUNT(DISTINCT mitarbeiter_id) FROM schichten {wy}", params_y).fetchone()[0]
        schichten_j = conn.execute(
            f"SELECT SUM(CASE WHEN dienst_code2 IS NOT NULL THEN 2 ELSE 1 END) FROM schichten {wy}",
            params_y).fetchone()[0] or 0
        conn.close()
        return jsonify({
            "ma_aktiv":       ma_monat,
            "schichten":      schichten_m,
            "ma_aktiv_jahr":  ma_jahr,
            "schichten_jahr": schichten_j,
        })
    except Exception:
        return jsonify({"ma_aktiv": 0, "schichten": 0, "ma_aktiv_jahr": 0, "schichten_jahr": 0})
