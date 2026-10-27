"""PDF-Layout lesen – mit nachgebauten Seiten (Wortpositionen wie im echten PDF), ohne PDF.

Hochformat: Namen ab x≈19, BG bei x≈136, Icons 12.7×13.4.
Querformat: Namen ab x≈96, BG bei x≈211, Icons 15.8×16.6.
"""
import unittest

from dienstplan_extract import assign_icons_to_days, extract_day_columns, extract_ma_pensum, extract_ma_rows

HOCH = {"name_x": 19.1, "bg_x": 135.8, "s_x": 151.0, "tag_x": 162.8, "spalte": 13.6,
        "zeile": 18.0, "icon": (12.7, 13.4), "icon_dy": -4.1}
QUER = {"name_x": 96.0, "bg_x": 211.2, "s_x": 227.9, "tag_x": 240.6, "spalte": 16.6,
        "zeile": 22.4, "icon": (15.8, 16.6), "icon_dy": -5.2}


class Seite:
    """Was dienstplan_extract von einer pdfplumber-Seite braucht."""
    def __init__(self, words, images):
        self._words, self.images, self.rects = words, images, []

    def extract_words(self):
        return self._words


def wort(text, x, y):
    return {"text": text, "x0": x, "x1": x + 5 * len(text), "top": y}


def seite(l: dict, zeilen: list) -> Seite:
    """zeilen: (Name, BG, S, {Tag: Icon-Höhe}) – S None = Überschrift/Fusszeile."""
    w = [wort("Plan", l["name_x"], 45), wort("BG", l["bg_x"], 45), wort("S", l["s_x"], 45)]
    w += [wort(f"{t:02d}", l["tag_x"] + (t - 1) * l["spalte"], 70) for t in range(1, 8)]
    bilder, y = [], 80.0
    for name, bg, s, icons in zeilen:
        x = l["name_x"]
        for teil in name.split():
            w.append(wort(teil, x, y))
            x += 5 * len(teil) + 3
        if bg is not None:
            w.append(wort(str(bg), l["bg_x"] - 1, y))
        if s is not None:
            w.append(wort(s, l["s_x"], y))
        for tag, h in icons.items():
            x0, top = l["tag_x"] + (tag - 1) * l["spalte"] - 2.5, y + l["icon_dy"]
            bilder.append({"name": f"Im{len(bilder)}", "srcsize": (24, 24), "x0": x0,
                           "x1": x0 + l["icon"][0], "top": top, "bottom": top + h})
        y += l["zeile"]
    return Seite(w, bilder)


def plan_seite(l: dict) -> Seite:
    voll, flach = l["icon"][1], l["icon"][1] * 0.75
    return seite(l, [
        ("Gruppe A", None, None, {}),
        ("Muster Anna", 100, "M", {1: voll, 2: flach}),
        ("Beispiel Ben Carl", 60, "M", {}),
        ("Gruppe B", None, None, {}),
        ("Test Zora", 30, "S", {3: voll}),
        ("Ohne Pensum, Zusatz", None, None, {4: voll}),   # MA ohne BG/S, aber mit Diensten
        ("Probe Ida", 0, "S", {}),
        ("Total:", None, None, {}),
        ("Gesamtbestand:", None, None, {}),
    ])


class LayoutTest(unittest.TestCase):
    def test_namen_und_pensum_hoch_und_quer(self):
        for l in (HOCH, QUER):
            with self.subTest(l=l["name_x"]):
                s = plan_seite(l)
                self.assertEqual(list(extract_ma_rows(s)), [
                    "Muster Anna", "Beispiel Ben Carl", "Test Zora", "Ohne Pensum, Zusatz", "Probe Ida"])
                self.assertEqual(extract_ma_pensum(s), {
                    "Muster Anna": 100, "Beispiel Ben Carl": 60, "Test Zora": 30,
                    "Ohne Pensum, Zusatz": 100, "Probe Ida": 100})
                self.assertEqual(sorted(extract_day_columns(s)), list(range(1, 8)))

    def test_icons_nach_icon_hoehe_nicht_nach_zeilenabstand(self):
        for l in (HOCH, QUER):
            with self.subTest(l=l["name_x"]):
                s = plan_seite(l)
                zellen = assign_icons_to_days(s, extract_ma_rows(s), extract_day_columns(s))
                anna = zellen["Muster Anna"]
                self.assertEqual((len(anna[1]["icons"]), len(anna[1]["halfs_h"])), (1, 0))
                self.assertEqual((len(anna[2]["icons"]), len(anna[2]["halfs_h"])), (0, 1))
                self.assertEqual(list(zellen["Test Zora"]), [3])
                self.assertEqual(list(zellen["Ohne Pensum, Zusatz"]), [4])


if __name__ == "__main__":
    unittest.main()
