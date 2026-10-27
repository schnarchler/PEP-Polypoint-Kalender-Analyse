"""Namen aus dem PDF den bisherigen MA zuordnen – auch ohne Zusatz («Muster Hans» → «Muster Hans_RD»).

Der PDF-Leser wird durch einen künstlichen Plan ersetzt: {Name: {Tag: Dienst-Code}}.
"""
import itertools
import unittest
from pathlib import Path
from unittest import mock

from tests import DATEN

import db_import
from db_setup import get_connection

_nummer = itertools.count(1)


class _Pdf:
    pages = [object()]

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def importiere(conn, zeilen: dict, monat: str = "September", jahr: int = 2026) -> dict:
    """Künstlichen Plan importieren; Icon-Name = Dienst-Code."""
    zellen = {name: {tag: {"icons": [code], "halfs": [], "bars": [], "halfs_h": []}
                     for tag, code in tage.items()} for name, tage in zeilen.items()}
    with mock.patch.multiple(
            db_import,
            pdfplumber=mock.Mock(open=lambda _p: _Pdf()),
            build_icon_registry=lambda _p: {},
            build_fingerprint_to_code_map=lambda _r: ({}, set()),
            extract_day_columns=lambda _p: {t: 100.0 + t * 14 for t in range(1, 31)},
            extract_ma_rows=lambda _p: {name: 100.0 + i for i, name in enumerate(zeilen)},
            extract_ma_pensum=lambda _p: {name: 100 for name in zeilen},
            assign_icons_to_days=lambda _p, _r, _d: zellen,
            resolve_icon_to_dienst=lambda n, *_a: n):
        return db_import.import_pdf_to_db(Path(f"Plan - {monat} {jahr}.pdf"), monat, jahr, conn)


def neue_db():
    conn = get_connection(DATEN / f"namen_{next(_nummer)}.db")
    conn.executemany("INSERT INTO dienst_typen (code, anzeigename, kategorie) VALUES (?,?,?)",
                     [("T1", "T1", "Arbeit"), ("N1", "N1", "Arbeit"), ("S2", "S2", "Arbeit")])
    conn.commit()
    return conn


def alle_ma(conn):
    return [r[0] for r in conn.execute("SELECT kuerzel FROM mitarbeiter ORDER BY kuerzel")]


def schichten(conn) -> dict:
    return {(r[0], r[1]): r[2] for r in conn.execute(
        "SELECT m.kuerzel, s.datum, s.dienst_code FROM schichten s"
        " JOIN mitarbeiter m ON m.id = s.mitarbeiter_id")}


class NamenTest(unittest.TestCase):
    def setUp(self):
        self.conn = neue_db()

    def tearDown(self):
        self.conn.close()

    def test_name_ohne_zusatz_findet_bisherige_ma(self):
        importiere(self.conn, {"Muster Hans_RD": {1: "T1"}, "Probe Paul Abt-P": {1: "T1"}})
        importiere(self.conn, {"Muster Hans": {1: "T1", 2: "N1"}, "Probe Paul": {1: "S2"}})
        self.assertEqual(alle_ma(self.conn), ["Muster Hans_RD", "Probe Paul Abt-P"])
        self.assertEqual(schichten(self.conn), {
            ("Muster Hans_RD", "2026-09-01"): "T1", ("Muster Hans_RD", "2026-09-02"): "N1",
            ("Probe Paul Abt-P", "2026-09-01"): "S2"})
        self.assertEqual([r[0] for r in self.conn.execute("SELECT aktiv FROM mitarbeiter")], [1, 1])

    def test_name_ohne_zusatz_nur_wenn_eindeutig(self):
        importiere(self.conn, {"Demo Xenia_A": {1: "T1"}, "Demo Xenia_B": {2: "T1"}, "Praktikant 10": {3: "T1"}})
        importiere(self.conn, {"Demo Xenia": {1: "T1"}, "Praktikant 1": {3: "T1"},
                               "Demo Xenia_A": {1: "T1"}, "Demo Xenia_B": {2: "T1"}, "Praktikant 10": {3: "T1"}})
        # zwei verschiedene MA bzw. «10» ist kein Zusatz zu «1» → neu anlegen
        self.assertEqual(alle_ma(self.conn), ["Demo Xenia", "Demo Xenia_A", "Demo Xenia_B",
                                              "Praktikant 1", "Praktikant 10"])

    def test_name_ohne_zusatz_bevorzugt_aktive_ma(self):
        # früherer Eintrag ohne Zusatz ist inaktiv, aktuell geführt wird «…_RD»
        importiere(self.conn, {"Beispiel Vera": {1: "T1"}})
        self.conn.execute("UPDATE mitarbeiter SET aktiv = 0")
        importiere(self.conn, {"Beispiel Vera_RD": {1: "T1"}})
        importiere(self.conn, {"Beispiel Vera": {2: "N1"}})
        s = schichten(self.conn)
        self.assertEqual(s[("Beispiel Vera_RD", "2026-09-02")], "N1")
        self.assertNotIn(("Beispiel Vera", "2026-09-02"), s)

    def test_name_ohne_zusatz_nicht_wenn_beide_im_plan(self):
        importiere(self.conn, {"Muster Anna": {1: "T1"}, "Muster Anna_RD": {1: "T1"}})
        self.conn.execute("UPDATE mitarbeiter SET aktiv = 0 WHERE kuerzel = 'Muster Anna'")
        importiere(self.conn, {"Muster Anna": {2: "N1"}, "Muster Anna_RD": {2: "S2"}})
        s = schichten(self.conn)
        self.assertEqual((s[("Muster Anna", "2026-09-02")], s[("Muster Anna_RD", "2026-09-02")]),
                         ("N1", "S2"))

    def test_name_ohne_zusatz_zusammengefuehrte_ma(self):
        importiere(self.conn, {"Demo Xenia_A": {1: "T1"}, "Demo Xenia_B": {1: "T1"}})
        self.conn.execute("DELETE FROM schichten WHERE mitarbeiter_id ="
                          " (SELECT id FROM mitarbeiter WHERE kuerzel = 'Demo Xenia_B')")
        self.conn.execute("UPDATE mitarbeiter SET aktiv = 0, zusammengefuehrt_in_id ="
                          " (SELECT id FROM mitarbeiter WHERE kuerzel = 'Demo Xenia_A')"
                          " WHERE kuerzel = 'Demo Xenia_B'")
        importiere(self.conn, {"Demo Xenia": {1: "T1", 2: "N1"}})
        # beide Treffer gehören zur selben MA
        self.assertEqual(alle_ma(self.conn), ["Demo Xenia_A", "Demo Xenia_B"])
        self.assertEqual(sorted(schichten(self.conn)), [
            ("Demo Xenia_A", "2026-09-01"), ("Demo Xenia_A", "2026-09-02")])

    def test_nie_aktivieren_gilt_auch_ohne_zusatz(self):
        importiere(self.conn, {"Fiktiv Leo_RD": {1: "T1"}})
        self.conn.execute("UPDATE mitarbeiter SET nie_aktivieren = 1")
        self.conn.execute("DELETE FROM schichten")
        importiere(self.conn, {"Fiktiv Leo": {2: "T1"}})
        self.assertEqual(schichten(self.conn), {})
        self.assertEqual(alle_ma(self.conn), ["Fiktiv Leo_RD"])


if __name__ == "__main__":
    unittest.main()
