"""
webcal.py — Geschützte ICS-Feeds für Kalender-Abonnements

URL-Schema:  /ics/<token>/Dienstplan_<kuerzel>.ics
- Token: 64-stelliger Hex-String, pro MA zufällig generiert
- Rate-Limit: max. 20 Abrufe pro Stunde pro Token (in-memory)
- Inhalt: alle Schichten ab 30 Tagen in der Vergangenheit, dynamisch aus DB
"""

import time
from collections import defaultdict

from flask import Blueprint, Response, abort

bp = Blueprint("webcal", __name__)

# ── Rate-Limiter (in-memory, reset bei App-Neustart) ─────────────────────────
_LIMIT_PER_HOUR = 20
_hits: dict[str, list[float]] = defaultdict(list)


def _rate_ok(token: str) -> bool:
    now    = time.time()
    cutoff = now - 3600
    recent = [t for t in _hits[token] if t > cutoff]
    _hits[token] = recent
    if len(recent) >= _LIMIT_PER_HOUR:
        return False
    _hits[token].append(now)
    return True


# ── ICS-Endpunkt ─────────────────────────────────────────────────────────────
@bp.route("/ics/webcal/<token>/<path:filename>")
def webcal_feed(token: str, filename: str):
    # 1. Rate-Limit
    if not _rate_ok(token):
        abort(429)

    # 2. Token gegen DB prüfen
    try:
        from db_setup import get_connection
        conn = get_connection()
        row = conn.execute(
            "SELECT id, kuerzel, vorname, nachname, zusammengefuehrt_in_id FROM mitarbeiter "
            "WHERE webcal_token = ? AND nie_aktivieren = 0",
            (token,),
        ).fetchone()
    except Exception:
        abort(500)

    if not row:
        conn.close()
        abort(404)

    # Wurde der MA zusammengeführt, der Kette zum Ziel-MA folgen —
    # der abonnierte Link liefert dann nahtlos den Plan des Ziel-Accounts.
    hops = 0
    while row["zusammengefuehrt_in_id"] and hops < 5:
        naechster = conn.execute(
            "SELECT id, kuerzel, vorname, nachname, zusammengefuehrt_in_id "
            "FROM mitarbeiter WHERE id = ?",
            (row["zusammengefuehrt_in_id"],),
        ).fetchone()
        if not naechster:
            break
        row = naechster
        hops += 1

    kuerzel = row["kuerzel"]
    ma_name = (f"{row['vorname'] or ''} {row['nachname'] or ''}").strip() or kuerzel

    # 3. Schichten laden (ab 30 Tagen zurück, keine Obergrenze)
    try:
        import logging
        _log = logging.getLogger(__name__)
        from datetime import date, timedelta
        try:
            from settings import load as _load_settings
            _raw = _load_settings().get("webcal_tage_vergangenheit")
            _days = int(_raw) if _raw is not None else 30
        except Exception:
            _days = 30
        since = (date.today() - timedelta(days=_days)).isoformat() if _days > 0 else "1900-01-01"
        _log.info("webcal %s: since=%s", kuerzel, since)

        schichten = conn.execute("""
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
                  AND s2.datum >= ?
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
            WHERE m.kuerzel = ? AND s.datum >= ?
            ORDER BY s.datum
        """, (since, kuerzel, since)).fetchall()

        _log.info("webcal %s: %d Schichten geladen", kuerzel, len(schichten))
        from db_export_ics import schichten_to_ics, load_ics_zusatz_codes
        ics_codes, ics_zeiten = load_ics_zusatz_codes()
        ics_str, count = schichten_to_ics(
            schichten, ma_name, kuerzel,
            conn=conn,
            ics_export_codes=ics_codes,
            ics_zeiten=ics_zeiten,
        )
        _log.info("webcal %s: %d Events im ICS", kuerzel, count)
    except Exception as exc:
        _log.exception("webcal %s: Fehler beim ICS-Aufbau: %s", kuerzel, exc)
        conn.close()
        abort(500)

    conn.close()

    return Response(
        ics_str,
        mimetype="text/calendar; charset=utf-8",
        headers={
            "Content-Disposition": f'inline; filename="Dienstplan_{kuerzel}.ics"',
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
        },
    )
