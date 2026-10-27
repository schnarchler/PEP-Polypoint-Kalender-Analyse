// Tab: Dashboard — Jahresübersicht + KPI-Strip + Aktivitäten
function TabDashboard({
  monat,
  jahr,
  onMonat,
  onTab
}) {
  const CTX = window.SERVER_CONTEXT || {};
  const [jahrData, setJahrData] = React.useState({});
  const [kpi, setKpi] = React.useState({});
  const [verlauf, setVerlauf] = React.useState(null);
  const [tagDatum, setTagDatum] = React.useState(function () {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  });
  const [dienstTag, setDienstTag] = React.useState(null);
  const MONATE_KURZ = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  const CTXMonate = CTX.monate || [];
  React.useEffect(function () {
    fetch('/api/jahr/' + jahr).then(function (r) {
      return r.json();
    }).then(function (data) {
      setJahrData(data);
    }).catch(function () {
      setJahrData({});
    });
  }, [jahr]);
  React.useEffect(function () {
    fetch('/api/kpi?year=' + jahr + '&month=' + encodeURIComponent(monat)).then(function (r) {
      return r.json();
    }).then(function (data) {
      setKpi(data);
    }).catch(function () {
      setKpi({});
    });
  }, [monat, jahr]);
  React.useEffect(function () {
    fetch('/api/verlauf').then(function (r) {
      return r.json();
    }).then(function (data) {
      setVerlauf(data);
    }).catch(function () {
      setVerlauf([]);
    });
  }, []);
  React.useEffect(function () {
    if (!tagDatum) return;
    setDienstTag(null);
    fetch('/api/dienst_tag?date=' + tagDatum).then(function (r) {
      return r.json();
    }).then(function (data) {
      setDienstTag(data);
    }).catch(function () {
      setDienstTag({
        date: tagDatum,
        standorte: []
      });
    });
  }, [tagDatum]);

  // Offene Aufgaben aus Jahresdaten ableiten
  const offeneAufgaben = React.useMemo(function () {
    var aufgaben = [];
    var monatKurz = (monat || '').slice(0, 3);
    var entry = jahrData[monatKurz];
    if (entry && entry.status === 'pending') {
      aufgaben.push({
        text: monatKurz + ' ' + jahr + ': Geänderte Pläne noch nicht versendet',
        tab: 'mail',
        color: 'var(--amber-500)'
      });
    }
    if (entry && entry.status === 'leer') {
      aufgaben.push({
        text: monatKurz + ' ' + jahr + ': Noch kein Plan importiert',
        tab: 'monatslauf',
        color: 'var(--blue-500)'
      });
    }
    // Prüfe alle Monate auf pending
    MONATE_KURZ.forEach(function (m) {
      if (m === monatKurz) return;
      var e = jahrData[m];
      if (e && e.status === 'pending') {
        aufgaben.push({
          text: m + ' ' + jahr + ': Geänderte Pläne noch nicht versendet',
          tab: 'mail',
          color: 'var(--amber-500)'
        });
      }
    });
    return aufgaben.slice(0, 5);
  }, [jahrData, monat, jahr]);

  // Verlauf: kinds → Farbe + Icon
  function kindStyle(kind) {
    switch (kind) {
      case 'import':
        return {
          bg: 'var(--blue-100)',
          fg: 'var(--blue-500)'
        };
      case 'mail':
        return {
          bg: 'var(--green-bg-soft)',
          fg: 'var(--green-bright-h)'
        };
      case 'merge':
        return {
          bg: 'var(--amber-bg-card)',
          fg: 'var(--amber-600)'
        };
      case 'unmerge':
        return {
          bg: 'var(--amber-bg-card)',
          fg: 'var(--amber-600)'
        };
      default:
        return {
          bg: '#eef1f4',
          fg: 'var(--ink-muted)'
        };
    }
  }
  function KindIcon({
    kind
  }) {
    if (kind === 'import') return /*#__PURE__*/React.createElement("svg", {
      width: "14",
      height: "14",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }, /*#__PURE__*/React.createElement("rect", {
      x: "3",
      y: "4.5",
      width: "18",
      height: "16.5",
      rx: "2.5"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M3 9h18M8 2.5v4M16 2.5v4"
    }));
    if (kind === 'mail') return /*#__PURE__*/React.createElement("svg", {
      width: "14",
      height: "14",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"
    }), /*#__PURE__*/React.createElement("polyline", {
      points: "22,6 12,13 2,6"
    }));
    if (kind === 'merge' || kind === 'unmerge') return /*#__PURE__*/React.createElement("svg", {
      width: "14",
      height: "14",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }, /*#__PURE__*/React.createElement("circle", {
      cx: "18",
      cy: "18",
      r: "3"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "6",
      cy: "6",
      r: "3"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "6",
      cy: "18",
      r: "3"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M6 9v6M15.5 6.5L8.5 12l7 5.5"
    }));
    return /*#__PURE__*/React.createElement("svg", {
      width: "14",
      height: "14",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }, /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "12",
      r: "10"
    }), /*#__PURE__*/React.createElement("line", {
      x1: "12",
      y1: "8",
      x2: "12",
      y2: "12"
    }), /*#__PURE__*/React.createElement("line", {
      x1: "12",
      y1: "16",
      x2: "12.01",
      y2: "16"
    }));
  }
  function fmtTs(ts) {
    if (!ts) return '';
    try {
      var d = new Date(ts);
      return d.toLocaleDateString('de-CH', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return ts.slice(0, 16);
    }
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "fade-in",
    "data-screen-label": "Dashboard"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 20,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(PageHead, {
    label: "\xDCbersicht",
    title: "Dashboard",
    subtitle: 'Jahresübersicht und aktuelle Kennzahlen für ' + monat + ' ' + jahr
  }), onTab && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary btn-sm",
    onClick: function () {
      onTab('monatslauf');
    },
    style: {
      flexShrink: 0,
      alignSelf: 'center',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("polyline", {
    points: "1 4 1 10 7 10"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M3.51 15a9 9 0 1 0 .49-4.5"
  })), "Neuen Plan einlesen")), /*#__PURE__*/React.createElement("div", {
    className: "kpi-strip"
  }, /*#__PURE__*/React.createElement("div", {
    className: "kpi"
  }, /*#__PURE__*/React.createElement("div", {
    className: "label"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "15",
    height: "15",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.9",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "9",
    cy: "8",
    r: "3"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M3.5 19c.5-3 2.8-4.3 5.5-4.3S14 16 14.5 19"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M16 14.5c2 .4 3.3 1.8 3.7 4.2"
  })), "Aktive Mitarbeitende"), /*#__PURE__*/React.createElement("div", {
    className: "value tabular"
  }, kpi.ma_aktiv != null ? kpi.ma_aktiv : '–'), /*#__PURE__*/React.createElement("div", {
    className: "delta"
  }, "von ", kpi.ma_aktiv_jahr ?? '–', " total \xB7 ", monat, " ", jahr)), /*#__PURE__*/React.createElement("div", {
    className: "kpi"
  }, /*#__PURE__*/React.createElement("div", {
    className: "label"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "15",
    height: "15",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.9",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "3",
    y: "4.5",
    width: "18",
    height: "16.5",
    rx: "2.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M3 9h18M8 2.5v4M16 2.5v4"
  })), "Schichten geplant"), /*#__PURE__*/React.createElement("div", {
    className: "value tabular"
  }, kpi.schichten != null ? kpi.schichten : '–'), /*#__PURE__*/React.createElement("div", {
    className: "delta"
  }, "Gesamt ", jahr, ": ", kpi.schichten_jahr ?? '–')), /*#__PURE__*/React.createElement("div", {
    className: "kpi accent"
  }, /*#__PURE__*/React.createElement("div", {
    className: "label"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "15",
    height: "15",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.9",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12 8v4l3 2"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "9"
  })), "Letzter Import"), /*#__PURE__*/React.createElement("div", {
    className: "value"
  }, CTX.letzter_import || '–'), /*#__PURE__*/React.createElement("div", {
    className: "delta"
  }, monat, " ", jahr)), /*#__PURE__*/React.createElement("div", {
    className: "kpi"
  }, /*#__PURE__*/React.createElement("div", {
    className: "label"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "15",
    height: "15",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.9",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M13 2v6h6"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M19 8.5V20a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 015 20V4a1.5 1.5 0 011.5-1.5H13z"
  })), "PDFs verf\xFCgbar"), /*#__PURE__*/React.createElement("div", {
    className: "value tabular"
  }, (CTX.pdfs || []).length), /*#__PURE__*/React.createElement("div", {
    className: "delta"
  }, "im Dienstplan-Ordner"))), /*#__PURE__*/React.createElement(Card, {
    title: 'Jahresübersicht ' + jahr,
    right: /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11.5,
        color: 'var(--ink-faint)'
      }
    }, "Klick auf einen Monat, um ihn auszuw\xE4hlen")
  }, /*#__PURE__*/React.createElement(YearHeatmap, {
    data: jahrData,
    currentMonatKurz: (monat || '').slice(0, 3),
    jahr: jahr,
    onPick: function (m) {
      var idx = MONATE_KURZ.indexOf(m.monat);
      if (idx >= 0 && CTXMonate[idx] && onMonat) onMonat(CTXMonate[idx]);
    }
  })), /*#__PURE__*/React.createElement(DienstTagWidget, {
    dienstTag: dienstTag,
    tagDatum: tagDatum,
    onDatum: setTagDatum
  }), /*#__PURE__*/React.createElement("div", {
    className: 'dash-split' + (offeneAufgaben.length > 0 ? '' : ' single')
  }, /*#__PURE__*/React.createElement("div", {
    className: "card",
    style: {
      padding: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "card-head",
    style: {
      padding: '10px 16px'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: '0.88rem',
      fontWeight: 650
    }
  }, "Letzte Aktivit\xE4t")), verlauf === null ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '20px 16px',
      color: 'var(--ink-faint)',
      fontSize: 13
    }
  }, "Wird geladen\u2026") : verlauf.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '20px 16px',
      color: 'var(--ink-faint)',
      fontSize: 13
    }
  }, "Noch keine Aktivit\xE4t erfasst.") : /*#__PURE__*/React.createElement("div", null, verlauf.slice(0, 12).map(function (item, i) {
    var st = kindStyle(item.kind);
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '9px 16px',
        borderTop: i > 0 ? '1px solid var(--hairline)' : 'none'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 30,
        height: 30,
        borderRadius: 8,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: st.bg,
        color: st.fg
      }
    }, /*#__PURE__*/React.createElement(KindIcon, {
      kind: item.kind
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: '0.85rem',
        fontWeight: 550,
        color: 'var(--ink)',
        lineHeight: 1.3
      }
    }, item.titel), item.detail && /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: 'var(--ink-muted)',
        marginTop: 1
      }
    }, item.detail)), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        color: 'var(--ink-faint)',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        marginTop: 2
      }
    }, fmtTs(item.ts)));
  }))), offeneAufgaben.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "card dash-tasks",
    style: {
      padding: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "card-head",
    style: {
      padding: '10px 16px'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: '0.88rem',
      fontWeight: 650
    }
  }, "Offene Aufgaben"), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 6,
      fontSize: 12,
      background: 'var(--amber-bg-card)',
      color: 'var(--amber-600)',
      padding: '1px 7px',
      borderRadius: 20,
      fontWeight: 600
    }
  }, offeneAufgaben.length)), /*#__PURE__*/React.createElement("div", null, offeneAufgaben.map(function (a, i) {
    return /*#__PURE__*/React.createElement("button", {
      key: i,
      onClick: function () {
        if (onTab && a.tab) onTab(a.tab);
      },
      style: {
        width: '100%',
        textAlign: 'left',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 16px',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        borderTop: i > 0 ? '1px solid var(--hairline)' : 'none'
      },
      onMouseEnter: function (e) {
        e.currentTarget.style.background = 'var(--bg-page)';
      },
      onMouseLeave: function (e) {
        e.currentTarget.style.background = 'none';
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: a.color,
        flexShrink: 0,
        display: 'inline-block'
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: '0.82rem',
        color: 'var(--ink)',
        lineHeight: 1.35,
        flex: 1
      }
    }, a.text), /*#__PURE__*/React.createElement("svg", {
      width: "12",
      height: "12",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      style: {
        color: 'var(--ink-faint)',
        flexShrink: 0
      }
    }, /*#__PURE__*/React.createElement("polyline", {
      points: "9 18 15 12 9 6"
    })));
  })))));
}

// ── Dienst-Tag-Widget ────────────────────────────────────────────────────────

var DIENST_CODE_FARBEN = {
  T: {
    bg: 'var(--blue-100)',
    fg: 'var(--blue-500)'
  },
  S: {
    bg: 'var(--amber-bg-card)',
    fg: 'var(--amber-600)'
  },
  N: {
    bg: '#e8e4f8',
    fg: '#6d5fb0'
  },
  W: {
    bg: 'var(--green-bg-soft)',
    fg: 'var(--green-bright-h)'
  }
};
function dienstCodeFarbe(code) {
  return DIENST_CODE_FARBEN[code ? code[0] : ''] || {
    bg: '#eef1f4',
    fg: 'var(--ink-muted)'
  };
}
function DienstTagWidget({
  dienstTag,
  tagDatum,
  onDatum
}) {
  function datumVonHeute(offset) {
    var d = new Date();
    d.setDate(d.getDate() + offset);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  var LABELS = [{
    datum: datumVonHeute(-1),
    label: 'Gestern'
  }, {
    datum: datumVonHeute(0),
    label: 'Heute'
  }, {
    datum: datumVonHeute(1),
    label: 'Morgen'
  }];
  var ORT_REIHENFOLGE = (window.SERVER_CONTEXT || {}).ort_reihenfolge || []; // konfigurierbar unter Einstellungen → Allgemein

  function sortedStandorte(standorte) {
    if (!standorte) return [];
    return standorte.slice().sort(function (a, b) {
      var ia = ORT_REIHENFOLGE.indexOf(a.ort);
      var ib = ORT_REIHENFOLGE.indexOf(b.ort);
      if (ia === -1) ia = 99;
      if (ib === -1) ib = 99;
      return ia - ib || a.ort.localeCompare(b.ort);
    });
  }

  // Einträge eines Standorts nach Dienst-Code gruppieren, sortiert nach Code
  function gruppiereNachCode(eintraege) {
    var gruppen = {};
    eintraege.forEach(function (e) {
      if (!gruppen[e.code]) gruppen[e.code] = {
        code: e.code,
        von: e.von,
        bis: e.bis,
        namen: []
      };
      gruppen[e.code].namen.push(e.name);
    });
    return Object.values(gruppen).sort(function (a, b) {
      var ta = a.von || '99:99';
      var tb = b.von || '99:99';
      return ta < tb ? -1 : ta > tb ? 1 : a.code.localeCompare(b.code);
    });
  }
  var loading = dienstTag === null;
  var standorte = loading ? [] : sortedStandorte(dienstTag.standorte);
  var total = standorte.reduce(function (s, st) {
    return s + st.eintraege.length;
  }, 0);
  return /*#__PURE__*/React.createElement("div", {
    className: "card",
    style: {
      padding: 0,
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "card-head",
    style: {
      padding: '10px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: '0.88rem',
      fontWeight: 650,
      display: 'flex',
      alignItems: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "9",
    cy: "7",
    r: "4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M23 21v-2a4 4 0 0 0-3-3.87"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M16 3.13a4 4 0 0 1 0 7.75"
  })), "Ausr\xFCckdienste"), !loading && total > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11.5,
      background: 'var(--blue-100)',
      color: 'var(--blue-500)',
      padding: '1px 7px',
      borderRadius: 20,
      fontWeight: 600
    }
  }, total), /*#__PURE__*/React.createElement("div", {
    style: {
      marginLeft: 'auto',
      display: 'flex',
      gap: 4,
      alignItems: 'center',
      flexWrap: 'wrap'
    }
  }, LABELS.map(function (l) {
    var active = tagDatum === l.datum;
    return /*#__PURE__*/React.createElement("button", {
      key: l.datum,
      onClick: function () {
        onDatum(l.datum);
      },
      style: {
        padding: '3px 11px',
        borderRadius: 6,
        fontSize: 12,
        fontWeight: active ? 650 : 450,
        border: active ? '1px solid var(--blue-500)' : '1px solid var(--hairline)',
        background: active ? 'var(--blue-100)' : 'transparent',
        color: active ? 'var(--blue-500)' : 'var(--ink-muted)',
        cursor: 'pointer'
      }
    }, l.label);
  }), /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: tagDatum,
    onChange: function (e) {
      if (e.target.value) onDatum(e.target.value);
    },
    style: {
      padding: '3px 7px',
      borderRadius: 6,
      fontSize: 12,
      border: '1px solid var(--hairline)',
      background: 'transparent',
      color: 'var(--ink-muted)',
      cursor: 'pointer',
      outline: 'none'
    }
  }))), loading ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '16px 16px',
      color: 'var(--ink-faint)',
      fontSize: 13
    }
  }, "Wird geladen\u2026") : total === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '16px 16px',
      color: 'var(--ink-faint)',
      fontSize: 13
    }
  }, "Keine Ausr\xFCckdienste f\xFCr diesen Tag geplant.") : /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
      borderTop: '1px solid var(--hairline)'
    }
  }, standorte.map(function (st, si) {
    var gruppen = gruppiereNachCode(st.eintraege);
    return /*#__PURE__*/React.createElement("div", {
      key: st.ort,
      style: {
        padding: '12px 16px',
        borderRight: si < standorte.length - 1 ? '1px solid var(--hairline)' : 'none'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginBottom: 10
      }
    }, /*#__PURE__*/React.createElement("svg", {
      width: "12",
      height: "12",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      style: {
        color: 'var(--ink-muted)',
        flexShrink: 0
      }
    }, /*#__PURE__*/React.createElement("path", {
      d: "M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "12",
      cy: "10",
      r: "3"
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: '0.8rem',
        fontWeight: 700,
        color: 'var(--ink-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.04em'
      }
    }, st.ort), /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: 'auto',
        fontSize: 11,
        color: 'var(--ink-faint)'
      }
    }, st.eintraege.length)), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 7
      }
    }, gruppen.map(function (g) {
      var cl = dienstCodeFarbe(g.code);
      return /*#__PURE__*/React.createElement("div", {
        key: g.code,
        style: {
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          flexShrink: 0,
          paddingTop: 1
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 34,
          height: 19,
          borderRadius: 4,
          background: cl.bg,
          color: cl.fg,
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: '0.02em'
        }
      }, g.code), g.von && /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 10,
          color: 'var(--ink-faint)',
          textAlign: 'center',
          marginTop: 1
        }
      }, g.von)), /*#__PURE__*/React.createElement("div", {
        style: {
          flex: 1,
          minWidth: 0
        }
      }, g.namen.map(function (name, ni) {
        return /*#__PURE__*/React.createElement("div", {
          key: ni,
          style: {
            fontSize: '0.82rem',
            color: 'var(--ink)',
            lineHeight: 1.45,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }
        }, name);
      })));
    })));
  })));
}
window.TabDashboard = TabDashboard;