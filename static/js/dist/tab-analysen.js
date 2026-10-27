// ── Leseanleitung (wiederverwendbar) ─────────────────────────────────────────

function AnalyseHilfe({
  children
}) {
  const [open, setOpen] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: function () {
      setOpen(function (v) {
        return !v;
      });
    },
    style: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      padding: 0,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      fontSize: 11.5,
      color: 'var(--ink-muted)',
      fontFamily: 'inherit'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "13",
    height: "13",
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
  })), "Leseanleitung", /*#__PURE__*/React.createElement("svg", {
    width: "10",
    height: "10",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.5",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: {
      transform: open ? 'rotate(180deg)' : 'none',
      transition: 'transform .15s'
    }
  }, /*#__PURE__*/React.createElement("polyline", {
    points: "6 9 12 15 18 9"
  }))), open && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8,
      padding: '10px 13px',
      background: 'var(--bg-page)',
      border: '1px solid var(--hairline)',
      borderRadius: 7,
      fontSize: 12,
      color: 'var(--ink-muted)',
      lineHeight: 1.65
    }
  }, children));
}

// ── Jahresübersicht ─────────────────────────────────────────────────────────

var MONAT_KURZ = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
var MONAT_NUMS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
function SubJahresuebersicht({
  jahr
}) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [mode, setMode] = React.useState('arbeit'); // 'arbeit' | 'nacht' | 'stunden'
  const [sortKey, setSortKey] = React.useState(null); // 'name' | 'gesamt'
  const [sortDir, setSortDir] = React.useState(1);
  React.useEffect(function () {
    if (!jahr) return;
    setLoading(true);
    setError('');
    setData(null);
    fetch('/api/analyse/jahresuebersicht?year=' + jahr).then(function (r) {
      return r.json();
    }).then(function (d) {
      if (d && d.error) {
        setError(d.error);
      } else {
        setData(d);
      }
      setLoading(false);
    }).catch(function () {
      setError('Verbindungsfehler');
      setLoading(false);
    });
  }, [jahr]);
  const filtered = React.useMemo(function () {
    if (!data) return [];
    const q = search.toLowerCase();
    if (!q) return data;
    return data.filter(function (ma) {
      return ma.name.toLowerCase().includes(q) || ma.kuerzel.toLowerCase().includes(q);
    });
  }, [data, search]);
  function handleSortJahr(key) {
    if (sortKey === key) {
      setSortDir(function (d) {
        return d * -1;
      });
    } else {
      setSortKey(key);
      setSortDir(1);
    }
  }
  const sortedFiltered = React.useMemo(function () {
    if (!sortKey) return filtered;
    return [...filtered].sort(function (a, b) {
      if (sortKey === 'name') return a.name.localeCompare(b.name, 'de') * sortDir;
      var av = mode === 'stunden' ? a.gesamt.total_h : mode === 'nacht' ? a.gesamt.nachtdienste + a.gesamt.we_dienste : a.gesamt.arbeitstage;
      var bv = mode === 'stunden' ? b.gesamt.total_h : mode === 'nacht' ? b.gesamt.nachtdienste + b.gesamt.we_dienste : b.gesamt.arbeitstage;
      return (av - bv) * sortDir;
    });
  }, [filtered, sortKey, sortDir, mode]);
  const teamGesamt = React.useMemo(function () {
    if (!data) return null;
    const g = {
      arbeitstage: 0,
      nachtdienste: 0,
      we_dienste: 0,
      total_h: 0,
      freitage: 0,
      abwesenheitstage: 0
    };
    const monate = {};
    MONAT_NUMS.forEach(function (m) {
      monate[m] = {
        arbeitstage: 0,
        nachtdienste: 0,
        we_dienste: 0,
        total_h: 0
      };
    });
    data.forEach(function (ma) {
      Object.keys(g).forEach(function (k) {
        g[k] = Math.round((g[k] + (ma.gesamt[k] || 0)) * 10) / 10;
      });
      MONAT_NUMS.forEach(function (m) {
        const mm = ma.monate[m];
        if (!mm) return;
        monate[m].arbeitstage += mm.arbeitstage || 0;
        monate[m].nachtdienste += mm.nachtdienste || 0;
        monate[m].we_dienste += mm.we_dienste || 0;
        monate[m].total_h = Math.round((monate[m].total_h + (mm.total_h || 0)) * 10) / 10;
      });
    });
    return {
      gesamt: g,
      monate
    };
  }, [data]);
  function cellVal(ma, mnum) {
    const mm = ma.monate[mnum];
    if (!mm) return null;
    if (mode === 'stunden') return mm.total_h > 0 ? mm.total_h : null;
    if (mode === 'nacht') return mm.nachtdienste + mm.we_dienste > 0 ? {
      n: mm.nachtdienste,
      w: mm.we_dienste
    } : null;
    return mm.arbeitstage > 0 ? {
      a: mm.arbeitstage,
      n: mm.nachtdienste,
      w: mm.we_dienste
    } : null;
  }
  function cellBg(ma, mnum) {
    const mm = ma.monate[mnum];
    if (!mm || mm.arbeitstage === 0) return 'transparent';
    if (mode === 'nacht' || mode === 'arbeit') {
      const burden = (mm.nachtdienste + mm.we_dienste) / Math.max(mm.arbeitstage, 1);
      if (burden > 0.35) return 'var(--amber-bg-card)';
    }
    return 'var(--blue-50,#eff6ff)';
  }
  function teamCellVal(mnum) {
    if (!teamGesamt) return null;
    const mm = teamGesamt.monate[mnum];
    if (mode === 'stunden') return mm.total_h > 0 ? mm.total_h : null;
    if (mode === 'nacht') return mm.nachtdienste + mm.we_dienste > 0 ? {
      n: mm.nachtdienste,
      w: mm.we_dienste
    } : null;
    return mm.arbeitstage > 0 ? {
      a: mm.arbeitstage
    } : null;
  }
  function renderCell(val) {
    if (val === null || val === undefined) return React.createElement('span', {
      style: {
        color: 'var(--ink-faint)'
      }
    }, '–');
    if (mode === 'stunden') return React.createElement('span', {
      style: {
        fontWeight: 600
      }
    }, val + ' h');
    if (mode === 'nacht') return React.createElement('span', {
      style: {
        color: 'var(--amber-600)',
        fontWeight: 600,
        fontSize: 11
      }
    }, [val.n > 0 ? val.n + 'N' : null, val.w > 0 ? val.w + 'W' : null].filter(Boolean).join(' '));
    return React.createElement('div', null, React.createElement('div', {
      style: {
        fontWeight: 600,
        fontSize: 13,
        lineHeight: 1.2
      }
    }, val.a), (val.n > 0 || val.w > 0) && React.createElement('div', {
      style: {
        fontSize: 9,
        color: 'var(--amber-600)',
        lineHeight: 1.3,
        marginTop: 1
      }
    }, [val.n > 0 ? val.n + 'N' : null, val.w > 0 ? val.w + 'W' : null].filter(Boolean).join(' ')));
  }
  return /*#__PURE__*/React.createElement(AnalyseShell, {
    loading: loading,
    error: error
  }, data && /*#__PURE__*/React.createElement(SectionCard, {
    title: 'Jahresübersicht — ' + jahr
  }, /*#__PURE__*/React.createElement(AnalyseHilfe, null, /*#__PURE__*/React.createElement("strong", null, "Was zeigt diese Tabelle?"), " Alle 12 Monate auf einen Blick \u2014 pro Mitarbeitende und Monat.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("strong", null, "Ansichten:"), " ", /*#__PURE__*/React.createElement("em", null, "Arbeitstage"), " = Dienste der Kategorie \u201EArbeit\". Kleinere Zahlen darunter: ", /*#__PURE__*/React.createElement("em", null, "N"), " = Nachtdienste, ", /*#__PURE__*/React.createElement("em", null, "W"), " = Wochenenddienste.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("em", null, "Nacht / WE"), " zeigt nur diese Zahlen. ", /*#__PURE__*/React.createElement("em", null, "Stunden"), " zeigt die berechnete Arbeitszeit in Stunden.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("strong", null, "Farbe:"), " Gelb = mehr als 35 % der Arbeitstage dieses Monats sind Nacht- oder Wochenenddienste \u2014 Hinweis auf hohe Belastung."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      flexWrap: 'wrap',
      alignItems: 'center',
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'inline-flex',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: {
      position: 'absolute',
      left: 9,
      pointerEvents: 'none',
      color: 'var(--ink-faint)'
    }
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "11",
    r: "8"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "21",
    y1: "21",
    x2: "16.65",
    y2: "16.65"
  })), /*#__PURE__*/React.createElement("input", {
    type: "search",
    className: "input analyse-search-input",
    value: search,
    onChange: function (e) {
      setSearch(e.target.value);
    },
    placeholder: "Name / K\xFCrzel\u2026",
    style: {
      paddingLeft: 30,
      fontSize: '0.85rem',
      width: 200
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "chip-row"
  }, [['arbeit', 'Arbeitstage'], ['nacht', 'Nacht / WE'], ['stunden', 'Stunden']].map(function (p) {
    return /*#__PURE__*/React.createElement("button", {
      key: p[0],
      className: 'chip' + (mode === p[0] ? ' active' : ''),
      onClick: function () {
        setMode(p[0]);
      }
    }, p[1]);
  })), search && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: 'var(--ink-muted)'
    }
  }, filtered.length, " von ", data.length)), /*#__PURE__*/React.createElement("div", {
    className: "analyse-table-wrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "analyse-table",
    style: {
      minWidth: 900
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    className: 'col-sticky sortable' + (sortKey === 'name' ? ' sort-active' : ''),
    onClick: function () {
      handleSortJahr('name');
    }
  }, "Name ", /*#__PURE__*/React.createElement(SortArrow, {
    active: sortKey === 'name',
    dir: sortDir
  })), MONAT_KURZ.map(function (m) {
    return /*#__PURE__*/React.createElement("th", {
      key: m,
      className: "num",
      style: {
        minWidth: 42,
        padding: '6px 4px'
      }
    }, m);
  }), /*#__PURE__*/React.createElement("th", {
    className: 'num sortable' + (sortKey === 'gesamt' ? ' sort-active' : ''),
    style: {
      minWidth: 60
    },
    onClick: function () {
      handleSortJahr('gesamt');
    }
  }, "Gesamt ", /*#__PURE__*/React.createElement(SortArrow, {
    active: sortKey === 'gesamt',
    dir: sortDir
  })))), /*#__PURE__*/React.createElement("tbody", null, sortedFiltered.map(function (ma) {
    const g = ma.gesamt;
    return /*#__PURE__*/React.createElement("tr", {
      key: ma.kuerzel
    }, /*#__PURE__*/React.createElement("td", {
      className: "col-sticky"
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 500
      }
    }, ma.name), /*#__PURE__*/React.createElement("span", {
      className: "muted small",
      style: {
        marginLeft: 6
      }
    }, ma.pensum, "%")), MONAT_NUMS.map(function (mnum) {
      const val = cellVal(ma, mnum);
      return /*#__PURE__*/React.createElement("td", {
        key: mnum,
        className: "num",
        style: {
          background: cellBg(ma, mnum),
          padding: '4px 3px',
          verticalAlign: 'middle',
          lineHeight: 1
        }
      }, renderCell(val));
    }), /*#__PURE__*/React.createElement("td", {
      className: "num",
      style: {
        fontWeight: 700,
        background: 'var(--surface-subtle,#f8f9fa)',
        borderLeft: '1px solid var(--border)'
      }
    }, mode === 'stunden' ? g.total_h + ' h' : mode === 'nacht' ? React.createElement('span', {
      style: {
        color: 'var(--amber-600)'
      }
    }, [g.nachtdienste > 0 ? g.nachtdienste + 'N' : null, g.we_dienste > 0 ? g.we_dienste + 'W' : null].filter(Boolean).join(' ') || '–') : g.arbeitstage));
  }), sortedFiltered.length === 0 && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: 14,
    style: {
      textAlign: 'center',
      color: 'var(--ink-muted)',
      padding: 24
    }
  }, "Keine Ergebnisse."))), teamGesamt && /*#__PURE__*/React.createElement("tfoot", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    className: "col-sticky",
    style: {
      fontWeight: 700,
      color: 'var(--ink-muted)',
      fontSize: 11
    }
  }, "Team-Total"), MONAT_NUMS.map(function (mnum) {
    const val = teamCellVal(mnum);
    const mm = teamGesamt.monate[mnum];
    return /*#__PURE__*/React.createElement("td", {
      key: mnum,
      className: "num",
      style: {
        fontSize: 11,
        background: 'var(--surface-subtle,#f8f9fa)'
      }
    }, val === null ? React.createElement('span', {
      style: {
        color: 'var(--ink-faint)'
      }
    }, '–') : mode === 'stunden' ? val + ' h' : mode === 'nacht' ? [val.n > 0 ? val.n + 'N' : null, val.w > 0 ? val.w + 'W' : null].filter(Boolean).join(' ') : mm.arbeitstage);
  }), /*#__PURE__*/React.createElement("td", {
    className: "num",
    style: {
      fontWeight: 700,
      background: 'var(--surface-subtle,#f8f9fa)',
      borderLeft: '1px solid var(--border)'
    }
  }, mode === 'stunden' ? teamGesamt.gesamt.total_h + ' h' : mode === 'nacht' ? [teamGesamt.gesamt.nachtdienste + 'N', teamGesamt.gesamt.we_dienste + 'W'].join(' ') : teamGesamt.gesamt.arbeitstage)))))));
}

// ── Nacht/WE-Zähler ─────────────────────────────────────────────────────────

function SubNachtWEZaehler({
  monat,
  jahr
}) {
  const [mode, setMode] = React.useState('jahr'); // 'monat' | 'jahr'

  const qs = mode === 'monat' ? 'month=' + encodeURIComponent(monat) + '&year=' + jahr : 'year=' + jahr;
  const {
    data,
    loading,
    error
  } = useAnalyse('/api/analyse/statistiken?' + qs, [qs]);
  const [sortKeyN, setSortKeyN] = React.useState('gesamt');
  const [sortDirN, setSortDirN] = React.useState(-1);
  function handleSortN(key) {
    if (sortKeyN === key) {
      setSortDirN(function (d) {
        return d * -1;
      });
    } else {
      setSortKeyN(key);
      setSortDirN(key === 'name' ? 1 : -1);
    }
  }
  const sorted = React.useMemo(function () {
    if (!data) return [];
    return [...data].sort(function (a, b) {
      if (sortKeyN === 'name') return a.name.localeCompare(b.name, 'de') * sortDirN;
      if (sortKeyN === 'nacht') return (a.nachtdienste - b.nachtdienste) * sortDirN;
      if (sortKeyN === 'we') return (a.we_dienste - b.we_dienste) * sortDirN;
      if (sortKeyN === 'dienste') return (a.arbeitstage - b.arbeitstage) * sortDirN;
      return (a.nachtdienste + a.we_dienste - (b.nachtdienste + b.we_dienste)) * sortDirN;
    });
  }, [data, sortKeyN, sortDirN]);
  const maxN = sorted.length ? Math.max(...sorted.map(function (r) {
    return r.nachtdienste || 0;
  })) : 1;
  const maxW = sorted.length ? Math.max(...sorted.map(function (r) {
    return r.we_dienste || 0;
  })) : 1;
  const teamN = sorted.reduce(function (s, r) {
    return s + (r.nachtdienste || 0);
  }, 0);
  const teamW = sorted.reduce(function (s, r) {
    return s + (r.we_dienste || 0);
  }, 0);
  const label = mode === 'monat' ? monat + ' ' + jahr : 'Gesamt ' + jahr;
  return /*#__PURE__*/React.createElement(AnalyseShell, {
    loading: loading,
    error: error
  }, data && /*#__PURE__*/React.createElement(SectionCard, {
    title: 'Nacht & WE-Zähler — ' + label
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      flexWrap: 'wrap',
      margin: '6px 0 14px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "chip-row"
  }, /*#__PURE__*/React.createElement("button", {
    className: 'chip' + (mode === 'monat' ? ' active' : ''),
    onClick: function () {
      setMode('monat');
    }
  }, monat, " ", jahr), /*#__PURE__*/React.createElement("button", {
    className: 'chip' + (mode === 'jahr' ? ' active' : ''),
    onClick: function () {
      setMode('jahr');
    }
  }, "Gesamt ", jahr)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: 'var(--ink-muted)'
    }
  }, "Team: ", /*#__PURE__*/React.createElement("strong", null, teamN), " Nacht \xB7 ", /*#__PURE__*/React.createElement("strong", null, teamW), " WE"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 12,
      marginLeft: 'auto'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ink-faint)'
    }
  }, "Anteil:"), /*#__PURE__*/React.createElement("span", {
    className: "badge-info",
    style: {
      fontSize: 11
    }
  }, "> 35 %"), /*#__PURE__*/React.createElement("span", {
    className: "badge-warn",
    style: {
      fontSize: 11
    }
  }, "> 50 %"))), /*#__PURE__*/React.createElement(AnalyseHilfe, null, /*#__PURE__*/React.createElement("strong", null, "Was zeigt diese Tabelle?"), " Nacht- und Wochenenddienste werden ", /*#__PURE__*/React.createElement("em", null, "getrennt"), " ausgewertet \u2014 ein Nachtdienst am Samstag z\xE4hlt nur in seiner eigenen Kategorie, nicht doppelt.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("strong", null, "Balken:"), " Breite relativ zum Spitzenreiter im Team. Dahinter der Anteil an allen Arbeitsdiensten (\xF7 Dienste-Spalte).", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("strong", null, "Farbe des Anteils:"), " ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--blue-600)'
    }
  }, "Blau"), " > 35 %, ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--amber-600)'
    }
  }, "Gelb"), " > 50 % \u2014 jeweils unabh\xE4ngig f\xFCr Nacht und WE.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("strong", null, "Nachtdienst:"), " Dienst, dessen Ende vor dem Beginn liegt (Mitternacht \xFCberschritten, z. B. 18:15\u201306:15).", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("strong", null, "Wochenende:"), " Samstag und Sonntag \u2014 unabh\xE4ngig vom Dienst-Typ."), sorted.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "empty-state",
    style: {
      padding: 32,
      gap: 8
    }
  }, IcoChart, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--ink-muted)'
    }
  }, "Keine Daten f\xFCr diesen Zeitraum.")) : /*#__PURE__*/React.createElement("div", {
    className: "analyse-table-wrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "analyse-table",
    style: {
      minWidth: 480
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: {
      width: 30,
      textAlign: 'right'
    }
  }, "#"), /*#__PURE__*/React.createElement("th", {
    className: 'sortable' + (sortKeyN === 'name' ? ' sort-active' : ''),
    onClick: function () {
      handleSortN('name');
    }
  }, "Name ", /*#__PURE__*/React.createElement(SortArrow, {
    active: sortKeyN === 'name',
    dir: sortDirN
  })), /*#__PURE__*/React.createElement("th", {
    className: 'sortable nw-col' + (sortKeyN === 'nacht' ? ' sort-active' : ''),
    style: {
      minWidth: 200
    },
    onClick: function () {
      handleSortN('nacht');
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-block',
      width: 10,
      height: 10,
      borderRadius: 2,
      background: 'var(--blue-500)',
      verticalAlign: 'middle',
      marginRight: 5
    }
  }), "Nacht ", /*#__PURE__*/React.createElement(SortArrow, {
    active: sortKeyN === 'nacht',
    dir: sortDirN
  })), /*#__PURE__*/React.createElement("th", {
    className: 'sortable nw-col' + (sortKeyN === 'we' ? ' sort-active' : ''),
    style: {
      minWidth: 200
    },
    onClick: function () {
      handleSortN('we');
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-block',
      width: 10,
      height: 10,
      borderRadius: 2,
      background: 'var(--amber-500)',
      verticalAlign: 'middle',
      marginRight: 5
    }
  }), "Wochenende ", /*#__PURE__*/React.createElement(SortArrow, {
    active: sortKeyN === 'we',
    dir: sortDirN
  })), /*#__PURE__*/React.createElement("th", {
    className: 'num sortable' + (sortKeyN === 'dienste' ? ' sort-active' : ''),
    title: "Gesamtanzahl Arbeitsdienste im Zeitraum",
    onClick: function () {
      handleSortN('dienste');
    }
  }, "Dienste ", /*#__PURE__*/React.createElement(SortArrow, {
    active: sortKeyN === 'dienste',
    dir: sortDirN
  })))), /*#__PURE__*/React.createElement("tbody", null, sorted.map(function (ma, i) {
    const BAR = 100;
    const nW = maxN > 0 ? Math.round((ma.nachtdienste || 0) / maxN * BAR) : 0;
    const wW = maxW > 0 ? Math.round((ma.we_dienste || 0) / maxW * BAR) : 0;
    const nPct = ma.arbeitstage > 0 ? Math.round((ma.nachtdienste || 0) / ma.arbeitstage * 100) : 0;
    const wPct = ma.arbeitstage > 0 ? Math.round((ma.we_dienste || 0) / ma.arbeitstage * 100) : 0;
    const nCls = nPct > 50 ? 'badge-warn' : nPct > 35 ? 'badge-info' : '';
    const wCls = wPct > 50 ? 'badge-warn' : wPct > 35 ? 'badge-info' : '';
    return /*#__PURE__*/React.createElement("tr", {
      key: ma.kuerzel
    }, /*#__PURE__*/React.createElement("td", {
      style: {
        textAlign: 'right',
        color: 'var(--ink-faint)',
        fontSize: 11
      }
    }, i + 1), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 500
      }
    }, ma.name), ma.pensum !== 100 && /*#__PURE__*/React.createElement("span", {
      className: "muted small",
      style: {
        marginLeft: 6
      }
    }, ma.pensum, "%")), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 7
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 22,
        textAlign: 'right',
        fontWeight: 700,
        fontVariantNumeric: 'tabular-nums',
        color: ma.nachtdienste > 0 ? 'var(--blue-600)' : 'var(--ink-faint)'
      }
    }, ma.nachtdienste || 0), /*#__PURE__*/React.createElement("div", {
      className: "analyse-bar-track",
      style: {
        flex: 1,
        maxWidth: BAR,
        height: 7,
        borderRadius: 4,
        background: 'var(--hairline-strong)'
      }
    }, nW > 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        width: nW + '%',
        height: 7,
        borderRadius: 4,
        background: 'var(--blue-500)'
      }
    })), /*#__PURE__*/React.createElement("span", {
      className: nCls,
      style: {
        fontSize: 11,
        minWidth: 36,
        textAlign: 'right'
      }
    }, nPct > 0 ? nPct + ' %' : ''))), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 7
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 22,
        textAlign: 'right',
        fontWeight: 700,
        fontVariantNumeric: 'tabular-nums',
        color: ma.we_dienste > 0 ? 'var(--amber-600)' : 'var(--ink-faint)'
      }
    }, ma.we_dienste || 0), /*#__PURE__*/React.createElement("div", {
      className: "analyse-bar-track",
      style: {
        flex: 1,
        maxWidth: BAR,
        height: 7,
        borderRadius: 4,
        background: 'var(--hairline-strong)'
      }
    }, wW > 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        width: wW + '%',
        height: 7,
        borderRadius: 4,
        background: 'var(--amber-500)'
      }
    })), /*#__PURE__*/React.createElement("span", {
      className: wCls,
      style: {
        fontSize: 11,
        minWidth: 36,
        textAlign: 'right'
      }
    }, wPct > 0 ? wPct + ' %' : ''))), /*#__PURE__*/React.createElement("td", {
      className: "num",
      style: {
        color: 'var(--ink-muted)'
      }
    }, ma.arbeitstage || 0));
  })), /*#__PURE__*/React.createElement("tfoot", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", null), /*#__PURE__*/React.createElement("td", {
    style: {
      color: 'var(--ink-muted)',
      fontSize: 11,
      fontWeight: 600
    }
  }, "Team-Total"), /*#__PURE__*/React.createElement("td", {
    style: {
      fontWeight: 700,
      color: 'var(--blue-600)',
      paddingLeft: 29
    }
  }, teamN), /*#__PURE__*/React.createElement("td", {
    style: {
      fontWeight: 700,
      color: 'var(--amber-600)',
      paddingLeft: 29
    }
  }, teamW), /*#__PURE__*/React.createElement("td", {
    className: "num",
    style: {
      color: 'var(--ink-muted)'
    }
  }, sorted.reduce(function (s, r) {
    return s + (r.arbeitstage || 0);
  }, 0))))))));
}

// ── Zeitraum-Selektor ───────────────────────────────────────────────────────

const QUARTALE = [{
  id: 'Q1',
  label: 'Q1',
  monate: ['01', '02', '03'],
  bis_tag: '03-31',
  von_m: '01',
  bis_m: '03',
  name: 'Jan–Mär'
}, {
  id: 'Q2',
  label: 'Q2',
  monate: ['04', '05', '06'],
  bis_tag: '06-30',
  von_m: '04',
  bis_m: '06',
  name: 'Apr–Jun'
}, {
  id: 'Q3',
  label: 'Q3',
  monate: ['07', '08', '09'],
  bis_tag: '09-30',
  von_m: '07',
  bis_m: '09',
  name: 'Jul–Sep'
}, {
  id: 'Q4',
  label: 'Q4',
  monate: ['10', '11', '12'],
  bis_tag: '12-31',
  von_m: '10',
  bis_m: '12',
  name: 'Okt–Dez'
}];
const HALBJAHRE = [{
  id: 'H1',
  label: 'H1',
  von_m: '01',
  bis_tag: '06-30',
  bis_m: '06',
  name: 'Jan–Jun'
}, {
  id: 'H2',
  label: 'H2',
  von_m: '07',
  bis_tag: '12-31',
  bis_m: '12',
  name: 'Jul–Dez'
}];
function buildPeriod(mode, sub, monat, jahr) {
  const y = String(jahr);
  switch (mode) {
    case 'monat':
      return {
        qs: 'month=' + encodeURIComponent(monat) + '&year=' + y,
        label: monat + ' ' + y
      };
    case 'quartal':
      {
        const q = QUARTALE.find(function (x) {
          return x.id === sub;
        }) || QUARTALE[0];
        return {
          qs: 'von=' + y + '-' + q.von_m + '-01&bis=' + y + '-' + q.bis_tag,
          label: q.label + ' ' + y + ' (' + q.name + ')'
        };
      }
    case 'halbjahr':
      {
        const h = HALBJAHRE.find(function (x) {
          return x.id === sub;
        }) || HALBJAHRE[0];
        return {
          qs: 'von=' + y + '-' + h.von_m + '-01&bis=' + y + '-' + h.bis_tag,
          label: h.label + ' ' + y + ' (' + h.name + ')'
        };
      }
    case 'jahr':
      return {
        qs: 'year=' + y,
        label: y
      };
    case 'alles':
      return {
        qs: '',
        label: 'Gesamtzeitraum'
      };
    default:
      return {
        qs: 'year=' + y,
        label: y
      };
  }
}
function ZeitraumSelektor({
  monat,
  jahr,
  onChange
}) {
  const [mode, setMode] = React.useState('monat');
  const [subSel, setSubSel] = React.useState('Q1');
  React.useEffect(function () {
    onChange(buildPeriod(mode, subSel, monat, jahr));
  }, [mode, subSel, monat, jahr]);
  const MODES = [{
    id: 'monat',
    label: 'Monat'
  }, {
    id: 'quartal',
    label: 'Quartal'
  }, {
    id: 'halbjahr',
    label: 'Halbjahr'
  }, {
    id: 'jahr',
    label: 'Jahr'
  }, {
    id: 'alles',
    label: 'Alles'
  }];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "chip-row"
  }, MODES.map(function (m) {
    return /*#__PURE__*/React.createElement("button", {
      key: m.id,
      className: 'chip' + (mode === m.id ? ' active' : ''),
      onClick: function () {
        setMode(m.id);
      }
    }, m.label);
  })), mode === 'quartal' && /*#__PURE__*/React.createElement("div", {
    className: "chip-row"
  }, QUARTALE.map(function (q) {
    return /*#__PURE__*/React.createElement("button", {
      key: q.id,
      className: 'chip' + (subSel === q.id ? ' active' : ''),
      onClick: function () {
        setSubSel(q.id);
      }
    }, q.label, " ", /*#__PURE__*/React.createElement("span", {
      style: {
        opacity: 0.6,
        fontSize: '0.8em'
      }
    }, "(", q.name, ")"));
  })), mode === 'halbjahr' && /*#__PURE__*/React.createElement("div", {
    className: "chip-row"
  }, HALBJAHRE.map(function (h) {
    return /*#__PURE__*/React.createElement("button", {
      key: h.id,
      className: 'chip' + (subSel === h.id ? ' active' : ''),
      onClick: function () {
        setSubSel(h.id);
      }
    }, h.label, " ", /*#__PURE__*/React.createElement("span", {
      style: {
        opacity: 0.6,
        fontSize: '0.8em'
      }
    }, "(", h.name, ")"));
  })));
}

// ── Tab: Analysen ────────────────────────────────────────────────────────────

function TabAnalysen({
  monat,
  jahr
}) {
  const [sub, setSub] = React.useState('statistiken');
  const [period, setPeriod] = React.useState({
    qs: 'month=' + encodeURIComponent(monat) + '&year=' + jahr,
    label: monat + ' ' + jahr
  });
  const SUBS = [{
    id: 'jahresuebersicht',
    label: 'Jahresübersicht'
  }, {
    id: 'zaehler',
    label: 'N/WE-Zähler'
  }, {
    id: 'statistiken',
    label: 'Statistiken'
  }, {
    id: 'besetzung',
    label: 'Besetzung'
  }, {
    id: 'dienst_haeufig',
    label: 'Dienst-Häufig.'
  }, {
    id: 'teamkombi',
    label: 'Team-Kombi'
  }, {
    id: 'kollegen',
    label: 'Kollegen'
  }, {
    id: 'vergleich',
    label: 'Vergleich'
  }, {
    id: 'tausch',
    label: 'Tausch'
  }, {
    id: 'exporte',
    label: 'Excel-Export'
  }];
  return /*#__PURE__*/React.createElement("div", {
    className: "fade-in",
    "data-screen-label": "Analysen"
  }, /*#__PURE__*/React.createElement("div", {
    className: "analyse-header-row"
  }, /*#__PURE__*/React.createElement(PageHead, {
    label: "Statistik",
    title: "Analysen",
    subtitle: 'Auswertungen — ' + period.label
  }), /*#__PURE__*/React.createElement("div", {
    className: "card analyse-zeitraum-card",
    style: {
      padding: '10px 14px'
    }
  }, /*#__PURE__*/React.createElement(ZeitraumSelektor, {
    monat: monat,
    jahr: jahr,
    onChange: setPeriod
  }))), /*#__PURE__*/React.createElement("div", {
    className: "subtabs analyse-subtabs",
    style: {
      marginBottom: 16
    }
  }, SUBS.map(function (s) {
    return /*#__PURE__*/React.createElement("button", {
      key: s.id,
      className: 'subtab' + (sub === s.id ? ' active' : ''),
      onClick: function () {
        setSub(s.id);
      }
    }, s.label);
  })), sub === 'jahresuebersicht' && /*#__PURE__*/React.createElement(SubJahresuebersicht, {
    jahr: jahr
  }), sub === 'zaehler' && /*#__PURE__*/React.createElement(SubNachtWEZaehler, {
    monat: monat,
    jahr: jahr
  }), sub === 'statistiken' && /*#__PURE__*/React.createElement(SubStatistiken, {
    qs: period.qs,
    label: period.label
  }), sub === 'besetzung' && /*#__PURE__*/React.createElement(SubBesetzung, {
    qs: period.qs,
    label: period.label
  }), sub === 'dienst_haeufig' && /*#__PURE__*/React.createElement(SubDienstHaeu, {
    qs: period.qs,
    label: period.label
  }), sub === 'teamkombi' && /*#__PURE__*/React.createElement(SubTeamKombi, {
    qs: period.qs,
    label: period.label
  }), sub === 'kollegen' && /*#__PURE__*/React.createElement(SubKollegen, {
    qs: period.qs,
    label: period.label,
    monat: monat,
    jahr: jahr
  }), sub === 'vergleich' && /*#__PURE__*/React.createElement(SubVergleich, {
    qs: period.qs,
    label: period.label
  }), sub === 'tausch' && /*#__PURE__*/React.createElement(SubTausch, {
    qs: period.qs,
    label: period.label
  }), sub === 'exporte' && /*#__PURE__*/React.createElement(SubExporte, {
    monat: monat,
    jahr: jahr
  }));
}

// ── Excel-Export: Analyse-Report erstellen + erzeugte Dateien herunterladen ──
function SubExporte({
  monat,
  jahr
}) {
  const toast = useToast();
  const {
    lines,
    running,
    start
  } = useStreamingLog();
  const [excelFiles, setExcelFiles] = React.useState([]);
  const [excelSearch, setExcelSearch] = React.useState('');
  const [excelType, setExcelType] = React.useState('alle');
  const loadExcelFiles = function () {
    fetch('/api/files/excel').then(function (r) {
      return r.json();
    }).then(function (data) {
      if (Array.isArray(data)) setExcelFiles(data);
    }).catch(function () {});
  };
  React.useEffect(function () {
    loadExcelFiles();
  }, []);
  const runAnalyse = async function () {
    if (running) return;
    const data = new FormData();
    if (monat) data.set('month', monat);
    data.set('year', String(jahr));
    try {
      const resp = await fetch('/api/analyse', {
        method: 'POST',
        body: data
      });
      const json = await resp.json();
      if (json.error) {
        toast.show(json.error, 'error');
        return;
      }
      start(json.task_id, function () {
        toast.show('Analyse-Report erstellt');
        loadExcelFiles();
      });
    } catch (e) {
      toast.show('Verbindungsfehler', 'error');
    }
  };
  const formatSize = function (bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };
  const formatMtime = function (ts) {
    if (!ts) return '';
    return new Date(ts * 1000).toLocaleDateString('de-CH');
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "fade-in"
  }, /*#__PURE__*/React.createElement(SectionCard, {
    title: 'Analyse-Report erstellen — ' + monat + ' ' + jahr
  }, /*#__PURE__*/React.createElement("p", {
    className: "muted small",
    style: {
      margin: '0 0 12px'
    }
  }, "Statistiken, Nachtdienste und Besetzung als Excel-Tabelle exportieren. Der Report wird auch automatisch beim Import erstellt, wenn die Option aktiviert ist."), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary btn-sm",
    onClick: runAnalyse,
    disabled: running
  }, running ? 'Läuft…' : 'Report erstellen'), lines.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12
    }
  }, /*#__PURE__*/React.createElement(Log, {
    lines: lines,
    running: running,
    title: "Protokoll"
  }))), /*#__PURE__*/React.createElement(SectionCard, {
    title: 'Erzeugte Excel-Dateien (' + excelFiles.length + ')'
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'center',
      margin: '0 0 8px',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "search",
    className: "input",
    placeholder: "Dateiname suchen\u2026",
    value: excelSearch,
    onChange: function (e) {
      setExcelSearch(e.target.value);
    },
    style: {
      flex: 1,
      minWidth: 180,
      padding: '6px 12px',
      fontSize: '0.85rem'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "chip-row",
    style: {
      flexShrink: 0
    }
  }, ['alle', 'uebersicht', 'analyse'].map(function (t) {
    const labels = {
      alle: 'Alle',
      uebersicht: 'Übersicht',
      analyse: 'Analyse'
    };
    return /*#__PURE__*/React.createElement("button", {
      key: t,
      className: 'chip ' + (excelType === t ? 'active' : ''),
      onClick: function () {
        setExcelType(t);
      }
    }, labels[t]);
  }))), /*#__PURE__*/React.createElement("div", {
    className: "file-list"
  }, function () {
    const filtered = excelFiles.filter(function (f) {
      const n = f.name.toLowerCase();
      if (excelSearch && !n.includes(excelSearch.toLowerCase())) return false;
      if (excelType === 'uebersicht' && !n.includes('uebersicht')) return false;
      if (excelType === 'analyse' && !n.includes('analyse')) return false;
      return true;
    });
    if (excelFiles.length === 0) return /*#__PURE__*/React.createElement("div", {
      className: "empty-state"
    }, /*#__PURE__*/React.createElement("svg", {
      width: "24",
      height: "24",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.5",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      style: {
        opacity: 0.35
      }
    }, /*#__PURE__*/React.createElement("path", {
      d: "M3 20h18"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M6 20v-7"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M12 20V5"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M18 20v-10"
    })), "Keine Excel-Dateien vorhanden.");
    if (filtered.length === 0) return /*#__PURE__*/React.createElement("div", {
      className: "empty-state"
    }, "Keine Treffer.");
    return filtered.map(function (f) {
      return /*#__PURE__*/React.createElement("div", {
        className: "file-row",
        key: f.name
      }, /*#__PURE__*/React.createElement("svg", {
        width: "15",
        height: "15",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "1.8",
        strokeLinecap: "round",
        strokeLinejoin: "round",
        style: {
          color: 'var(--ink-faint)',
          flexShrink: 0
        }
      }, /*#__PURE__*/React.createElement("path", {
        d: "M3 20h18"
      }), /*#__PURE__*/React.createElement("path", {
        d: "M6 20v-7"
      }), /*#__PURE__*/React.createElement("path", {
        d: "M12 20V5"
      }), /*#__PURE__*/React.createElement("path", {
        d: "M18 20v-10"
      })), /*#__PURE__*/React.createElement("span", {
        className: "name"
      }, f.name), /*#__PURE__*/React.createElement("span", {
        className: "meta"
      }, formatSize(f.size), f.mtime ? ' · ' + formatMtime(f.mtime) : ''), /*#__PURE__*/React.createElement("a", {
        className: "btn btn-outline btn-sm",
        href: '/download/excel/' + encodeURIComponent(f.name)
      }, /*#__PURE__*/React.createElement("svg", {
        width: "13",
        height: "13",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "2",
        strokeLinecap: "round",
        strokeLinejoin: "round"
      }, /*#__PURE__*/React.createElement("path", {
        d: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"
      }), /*#__PURE__*/React.createElement("polyline", {
        points: "7 10 12 15 17 10"
      }), /*#__PURE__*/React.createElement("line", {
        x1: "12",
        y1: "15",
        x2: "12",
        y2: "3"
      })), "Download"));
    });
  }())));
}

// ── Shared helpers ──────────────────────────────────────────────────────────

function useAnalyse(url, deps) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  React.useEffect(function () {
    setLoading(true);
    setError('');
    setData(null);
    fetch(url).then(function (r) {
      return r.json();
    }).then(function (d) {
      if (d && d.error) {
        setError(d.error);
      } else {
        setData(d);
      }
      setLoading(false);
    }).catch(function () {
      setError('Verbindungsfehler');
      setLoading(false);
    });
  }, deps);
  return {
    data,
    loading,
    error
  };
}
var IcoSpinner = /*#__PURE__*/React.createElement("svg", {
  width: "22",
  height: "22",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  style: {
    animation: 'dp-pulse 1.2s ease-in-out infinite'
  }
}, /*#__PURE__*/React.createElement("circle", {
  cx: "12",
  cy: "12",
  r: "10"
}), /*#__PURE__*/React.createElement("path", {
  d: "M12 6v6l4 2"
}));
var IcoWarn = /*#__PURE__*/React.createElement("svg", {
  width: "22",
  height: "22",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "1.8",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, /*#__PURE__*/React.createElement("path", {
  d: "M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
}), /*#__PURE__*/React.createElement("line", {
  x1: "12",
  y1: "9",
  x2: "12",
  y2: "13"
}), /*#__PURE__*/React.createElement("line", {
  x1: "12",
  y1: "17",
  x2: "12.01",
  y2: "17"
}));
var IcoChart = /*#__PURE__*/React.createElement("svg", {
  width: "28",
  height: "28",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "1.5",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  style: {
    opacity: 0.35
  }
}, /*#__PURE__*/React.createElement("line", {
  x1: "18",
  y1: "20",
  x2: "18",
  y2: "10"
}), /*#__PURE__*/React.createElement("line", {
  x1: "12",
  y1: "20",
  x2: "12",
  y2: "4"
}), /*#__PURE__*/React.createElement("line", {
  x1: "6",
  y1: "20",
  x2: "6",
  y2: "14"
}), /*#__PURE__*/React.createElement("line", {
  x1: "2",
  y1: "20",
  x2: "22",
  y2: "20"
}));
var IcoPin = /*#__PURE__*/React.createElement("svg", {
  width: "13",
  height: "13",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, /*#__PURE__*/React.createElement("path", {
  d: "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"
}), /*#__PURE__*/React.createElement("circle", {
  cx: "12",
  cy: "10",
  r: "3"
}));
function AnalyseShell({
  loading,
  error,
  children
}) {
  if (loading) return /*#__PURE__*/React.createElement("div", {
    className: "empty-state",
    style: {
      padding: 48,
      color: 'var(--ink-muted)',
      gap: 10
    }
  }, IcoSpinner, /*#__PURE__*/React.createElement("span", null, "Wird geladen\u2026"));
  if (error) return /*#__PURE__*/React.createElement("div", {
    className: "empty-state",
    style: {
      padding: 48,
      color: 'var(--red-500)',
      gap: 10
    }
  }, IcoWarn, /*#__PURE__*/React.createElement("span", null, error));
  if (!children) return null;
  return React.createElement(React.Fragment, null, children);
}
function SortArrow({
  active,
  dir
}) {
  if (!active) return /*#__PURE__*/React.createElement("svg", {
    width: "10",
    height: "10",
    viewBox: "0 0 10 10",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.5",
    strokeLinecap: "round",
    style: {
      opacity: 0.35,
      marginLeft: 3,
      verticalAlign: 'middle'
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M5 2 L5 8 M2.5 4.5 L5 2 L7.5 4.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M2.5 5.5 L5 8 L7.5 5.5"
  }));
  if (dir === 1) return /*#__PURE__*/React.createElement("svg", {
    width: "10",
    height: "10",
    viewBox: "0 0 10 10",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    style: {
      marginLeft: 3,
      verticalAlign: 'middle'
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M5 8 L5 2 M2.5 4.5 L5 2 L7.5 4.5"
  }));
  return /*#__PURE__*/React.createElement("svg", {
    width: "10",
    height: "10",
    viewBox: "0 0 10 10",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    style: {
      marginLeft: 3,
      verticalAlign: 'middle'
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M5 2 L5 8 M2.5 5.5 L5 8 L7.5 5.5"
  }));
}
function DataTable({
  cols,
  rows,
  foot,
  wrapClass
}) {
  const [sortKey, setSortKey] = React.useState(null);
  const [sortDir, setSortDir] = React.useState(1);
  function handleSort(key) {
    if (sortKey === key) {
      setSortDir(function (d) {
        return d * -1;
      });
    } else {
      setSortKey(key);
      setSortDir(1);
    }
  }
  const sorted = React.useMemo(function () {
    if (!rows) return [];
    if (!sortKey) return rows;
    return [...rows].sort(function (a, b) {
      const av = a[sortKey],
        bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sortDir;
      return String(av).localeCompare(String(bv), 'de') * sortDir;
    });
  }, [rows, sortKey, sortDir]);
  if (!rows || rows.length === 0) {
    return /*#__PURE__*/React.createElement("div", {
      className: "empty-state",
      style: {
        padding: 32,
        gap: 8
      }
    }, IcoChart, /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink-muted)'
      }
    }, "Keine Daten vorhanden."));
  }
  return /*#__PURE__*/React.createElement("div", {
    className: 'analyse-table-wrap' + (wrapClass ? ' ' + wrapClass : '')
  }, /*#__PURE__*/React.createElement("table", {
    className: "analyse-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, cols.map(function (c) {
    const active = sortKey === c.key;
    const cls = (c.sticky ? 'col-sticky ' : '') + (c.align === 'right' ? 'num ' : '') + 'sortable' + (active ? ' sort-active' : '');
    return /*#__PURE__*/React.createElement("th", {
      key: c.key,
      className: cls,
      onClick: function () {
        handleSort(c.key);
      }
    }, c.label, /*#__PURE__*/React.createElement(SortArrow, {
      active: active,
      dir: sortDir
    }));
  }))), /*#__PURE__*/React.createElement("tbody", null, sorted.map(function (row, i) {
    return /*#__PURE__*/React.createElement("tr", {
      key: i,
      className: row.__rowClass || ''
    }, cols.map(function (c) {
      const val = row[c.key];
      const fmt = c.fmt ? c.fmt(val, row) : val == null ? '–' : val;
      const cls = (c.sticky ? 'col-sticky ' : '') + (c.align === 'right' ? 'num' : '');
      return /*#__PURE__*/React.createElement("td", {
        key: c.key,
        className: cls
      }, fmt);
    }));
  })), foot && /*#__PURE__*/React.createElement("tfoot", null, /*#__PURE__*/React.createElement("tr", null, cols.map(function (c) {
    const cls = (c.sticky ? 'col-sticky ' : '') + (c.align === 'right' ? 'num' : '');
    return /*#__PURE__*/React.createElement("td", {
      key: c.key,
      className: cls
    }, foot[c.key] != null ? foot[c.key] : '');
  })))));
}
function SectionCard({
  title,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "card",
    style: {
      marginBottom: 12,
      paddingTop: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "card-sticky-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "section-label"
  }, title)), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 4px 4px'
    }
  }, children));
}

// ── Statistiken ─────────────────────────────────────────────────────────────

function SubStatistiken({
  qs,
  label
}) {
  const url = '/api/analyse/statistiken?' + qs;
  const {
    data,
    loading,
    error
  } = useAnalyse(url, [qs]);
  const cols = [{
    key: 'name',
    label: 'Name'
  }, {
    key: 'pensum',
    label: 'Pensum %',
    align: 'right'
  }, {
    key: 'arbeitstage',
    label: 'Arbeitstage',
    align: 'right'
  }, {
    key: 'total_h',
    label: 'Total h',
    align: 'right'
  }, {
    key: 'nachtdienste',
    label: 'Nacht',
    align: 'right'
  }, {
    key: 'we_dienste',
    label: 'WE',
    align: 'right'
  }, {
    key: 'nacht_100',
    label: 'Nacht/100%',
    align: 'right',
    fmt: function (v) {
      return React.createElement('span', {
        className: v > 30 ? 'badge-warn' : ''
      }, v);
    }
  }, {
    key: 'we_100',
    label: 'WE/100%',
    align: 'right',
    fmt: function (v) {
      return React.createElement('span', {
        className: v > 30 ? 'badge-warn' : ''
      }, v);
    }
  }, {
    key: 'gesamt_100',
    label: 'Gesamt/100%',
    align: 'right',
    fmt: function (v) {
      return React.createElement('span', {
        className: v > 60 ? 'badge-warn' : v > 40 ? 'badge-info' : ''
      }, v);
    }
  }];
  return /*#__PURE__*/React.createElement(AnalyseShell, {
    loading: loading,
    error: error
  }, data && /*#__PURE__*/React.createElement(SectionCard, {
    title: 'Kennzahlen pro Mitarbeitende — ' + label
  }, /*#__PURE__*/React.createElement(AnalyseHilfe, null, /*#__PURE__*/React.createElement("strong", null, "Was zeigt diese Tabelle?"), " Kennzahlen pro Person f\xFCr den gew\xE4hlten Zeitraum, sortiert nach Belastung (Nacht+WE / Pensum).", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("strong", null, "Arbeitstage:"), " Dienste der Kategorie \u201EArbeit\". ", /*#__PURE__*/React.createElement("strong", null, "Total h:"), " berechnete Arbeitszeit in Stunden.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("strong", null, "Nacht / WE:"), " Absolute Anzahl Nacht- und Wochenenddienste.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("strong", null, "Nacht/100% / WE/100% / Gesamt/100%:"), " Wert geteilt durch Pensum \xD7 100 \u2014 erm\xF6glicht fairen Vergleich zwischen Voll- und Teilzeit.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--amber-600)'
    }
  }, "Gelb"), " bei Gesamt/100% > 40, ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--red-500)'
    }
  }, "Orange"), " > 60 \u2014 beides Hinweise auf \xFCberdurchschnittliche Belastung."), /*#__PURE__*/React.createElement(DataTable, {
    cols: cols,
    rows: data
  })));
}

// ── Nacht & WE ──────────────────────────────────────────────────────────────

function SubNachtdienste({
  qs,
  label
}) {
  const [showDetail, setShowDetail] = React.useState(false);
  const url = '/api/analyse/nachtdienste?' + qs;
  const {
    data,
    loading,
    error
  } = useAnalyse(url, [qs]);
  const fairCols = [{
    key: 'name',
    label: 'Name'
  }, {
    key: 'pensum',
    label: 'Pensum %',
    align: 'right'
  }, {
    key: 'nachtdienste',
    label: 'Nacht',
    align: 'right'
  }, {
    key: 'we_dienste',
    label: 'WE',
    align: 'right'
  }, {
    key: 'gesamt',
    label: 'Gesamt',
    align: 'right'
  }, {
    key: 'nacht_100',
    label: 'Nacht/100%',
    align: 'right'
  }, {
    key: 'we_100',
    label: 'WE/100%',
    align: 'right'
  }, {
    key: 'gesamt_100',
    label: 'Gesamt/100%',
    align: 'right',
    fmt: function (v) {
      return React.createElement('span', {
        className: v > 60 ? 'badge-warn' : v > 40 ? 'badge-info' : ''
      }, v);
    }
  }];
  const detailCols = [{
    key: 'datum',
    label: 'Datum',
    fmt: function (v) {
      return fmtDatum(v);
    }
  }, {
    key: 'wochentag',
    label: 'Tag'
  }, {
    key: 'nacht',
    label: 'Nacht'
  }, {
    key: 'we',
    label: 'WE'
  }, {
    key: 'name',
    label: 'Name'
  }, {
    key: 'dienst',
    label: 'Dienst'
  }, {
    key: 'beginn',
    label: 'Beginn'
  }, {
    key: 'ende',
    label: 'Ende'
  }, {
    key: 'ort',
    label: 'Ort'
  }, {
    key: 'kollegen',
    label: 'Kollegen'
  }];
  return /*#__PURE__*/React.createElement(AnalyseShell, {
    loading: loading,
    error: error
  }, data && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(SectionCard, {
    title: 'Fairness-Rangliste — ' + label
  }, /*#__PURE__*/React.createElement(AnalyseHilfe, null, /*#__PURE__*/React.createElement("strong", null, "Was zeigt diese Tabelle?"), " Rangliste aller MA nach Nacht- und Wochenenddiensten \u2014 mit Pensum-Normierung f\xFCr fairen Vergleich.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("strong", null, "Nachtdienst:"), " Ein Dienst gilt als Nachtdienst, wenn Dienstende vor Dienstbeginn liegt (Mitternacht wird \xFCberschritten), z. B. 18:15\u201306:15.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("strong", null, "Wochenende (WE):"), " Alle Dienste an Samstag oder Sonntag \u2014 unabh\xE4ngig vom Dienst-Typ.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("strong", null, "Gesamt/100%:"), " (Nacht+WE) \xF7 Pensum \xD7 100. ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--amber-600)'
    }
  }, "Gelb"), " > 40, ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--red-500)'
    }
  }, "Orange"), " > 60.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("strong", null, "Detail-Ansicht:"), " \xDCber die Schaltfl\xE4che unten lassen sich alle einzelnen Nacht-/WE-Dienste mit Datum, Kolleg:innen und Ort einblenden."), /*#__PURE__*/React.createElement(DataTable, {
    cols: fairCols,
    rows: data.fairness
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost btn-sm",
    onClick: function () {
      setShowDetail(!showDetail);
    },
    style: {
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
    strokeLinejoin: "round",
    style: {
      transform: showDetail ? 'rotate(180deg)' : 'none',
      transition: 'transform 0.18s'
    }
  }, /*#__PURE__*/React.createElement("polyline", {
    points: "6 9 12 15 18 9"
  })), showDetail ? 'Detail ausblenden' : 'Detail einblenden', data.detail && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      opacity: 0.6
    }
  }, "(", data.detail.length, " Eintr\xE4ge)"))), showDetail && /*#__PURE__*/React.createElement(SectionCard, {
    title: "Nacht- & WE-Dienste Detail"
  }, /*#__PURE__*/React.createElement(DataTable, {
    cols: detailCols,
    rows: data.detail
  }))));
}

// ── Besetzung ───────────────────────────────────────────────────────────────

function SubBesetzung({
  qs,
  label
}) {
  const url = '/api/analyse/besetzung?' + qs;
  const {
    data,
    loading,
    error
  } = useAnalyse(url, [qs]);
  const [search, setSearch] = React.useState('');
  const cols = [{
    key: 'datum',
    label: 'Datum',
    fmt: function (v) {
      return fmtDatum(v);
    }
  }, {
    key: 'wochentag',
    label: 'Tag'
  }, {
    key: 'we',
    label: 'WE',
    fmt: function (v) {
      if (!v) return '';
      return React.createElement('span', {
        style: {
          display: 'inline-block',
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: 'var(--amber-500)',
          verticalAlign: 'middle'
        }
      });
    }
  }, {
    key: 'ort',
    label: 'Ort'
  }, {
    key: 'dienst',
    label: 'Dienst'
  }, {
    key: 'beginn',
    label: 'Beginn'
  }, {
    key: 'ende',
    label: 'Ende'
  }, {
    key: 'anzahl_ma',
    label: 'MA',
    align: 'right'
  }, {
    key: 'personal',
    label: 'Personal'
  }];
  const filtered = React.useMemo(function () {
    if (!data) return [];
    const q = search.toLowerCase();
    if (!q) return data;
    return data.filter(function (r) {
      return (r.datum || '').includes(q) || (r.ort || '').toLowerCase().includes(q) || (r.dienst || '').toLowerCase().includes(q) || (r.personal || '').toLowerCase().includes(q);
    });
  }, [data, search]);
  return /*#__PURE__*/React.createElement(AnalyseShell, {
    loading: loading,
    error: error
  }, data && /*#__PURE__*/React.createElement(SectionCard, {
    title: 'Besetzungsplan — ' + label
  }, /*#__PURE__*/React.createElement(AnalyseHilfe, null, /*#__PURE__*/React.createElement("strong", null, "Was zeigt diese Tabelle?"), " Jeder geplante Dienst mit Datum, Wochentag, Ort, Dienst-Code, Zeiten und den eingesetzten Personen.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("strong", null, "MA-Spalte:"), " Anzahl der eingesetzten Mitarbeitenden pro Dienst-Slot.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("strong", null, "Personal:"), " Kommagetrennte K\xFCrzel aller MA im selben Slot (selber Tag, selber Ort, selber Dienst-Code).", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("strong", null, "WE-Punkt:"), " Bernsteinfarbener Punkt markiert Samstag und Sonntag.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("strong", null, "Suche:"), " Filtert nach Datum (z. B. \u201E06\"), Ort, Dienst-Code oder Namen."), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '8px 0 10px',
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'inline-flex',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: {
      position: 'absolute',
      left: 9,
      pointerEvents: 'none',
      color: 'var(--ink-faint)'
    }
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "11",
    r: "8"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "21",
    y1: "21",
    x2: "16.65",
    y2: "16.65"
  })), /*#__PURE__*/React.createElement("input", {
    type: "search",
    className: "input analyse-search-input",
    placeholder: "Datum, Ort, Dienst, Personal\u2026",
    value: search,
    onChange: function (e) {
      setSearch(e.target.value);
    },
    style: {
      paddingLeft: 30,
      fontSize: '0.85rem',
      width: 280
    }
  })), search && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: 'var(--ink-muted)'
    }
  }, filtered.length, " von ", data.length)), /*#__PURE__*/React.createElement(DataTable, {
    cols: cols,
    rows: filtered
  })));
}

// ── Dienst-Häufigkeit ───────────────────────────────────────────────────────

function SubDienstHaeu({
  qs,
  label
}) {
  const url = '/api/analyse/dienst_haeufigkeit?' + qs;
  const {
    data,
    loading,
    error
  } = useAnalyse(url, [qs]);
  const [nurKlein, setNurKlein] = React.useState(false);
  const [showOrt, setShowOrt] = React.useState(null);
  if (loading) return /*#__PURE__*/React.createElement("div", {
    className: "empty-state",
    style: {
      padding: 48,
      color: 'var(--ink-muted)',
      gap: 10
    }
  }, IcoSpinner, /*#__PURE__*/React.createElement("span", null, "Wird geladen\u2026"));
  if (error) return /*#__PURE__*/React.createElement("div", {
    className: "empty-state",
    style: {
      padding: 48,
      color: 'var(--red-500)',
      gap: 10
    }
  }, IcoWarn, /*#__PURE__*/React.createElement("span", null, error));
  if (!data) return null;
  const {
    dienste,
    pivot,
    totals,
    ausrueck_dienste,
    nach_ort
  } = data;
  if (!dienste || dienste.length === 0) {
    return /*#__PURE__*/React.createElement("div", {
      className: "empty-state",
      style: {
        padding: 32,
        gap: 8
      }
    }, IcoChart, /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink-muted)'
      }
    }, "Keine Daten vorhanden."));
  }
  const ausrueckSet = new Set(ausrueck_dienste || []);
  const ausrueckCount = dienste.filter(function (d) {
    return ausrueckSet.has(d);
  }).length;
  const visibleDienste = nurKlein ? dienste.filter(function (d) {
    return ausrueckSet.has(d);
  }) : dienste;
  const cols = [{
    key: 'name',
    label: 'Name',
    sticky: true
  }, ...visibleDienste.map(function (d) {
    return {
      key: d,
      label: d,
      align: 'right',
      fmt: function (v) {
        return v === 0 ? React.createElement('span', {
          style: {
            color: 'var(--ink-faint)'
          }
        }, '–') : v;
      }
    };
  }), {
    key: '__total',
    label: 'Total',
    align: 'right',
    fmt: function (v) {
      return React.createElement('strong', null, v);
    }
  }];
  const footRow = {
    name: 'Team-Total'
  };
  visibleDienste.forEach(function (d) {
    footRow[d] = totals[d] || 0;
  });
  footRow.__total = visibleDienste.reduce(function (s, d) {
    return s + (totals[d] || 0);
  }, 0);
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(SectionCard, {
    title: 'Dienst-Häufigkeit pro Mitarbeitende — ' + label
  }, /*#__PURE__*/React.createElement(AnalyseHilfe, null, /*#__PURE__*/React.createElement("strong", null, "Was zeigt diese Tabelle?"), " Pivot-Tabelle: jede Zeile ist eine Person, jede Spalte ein Dienst-Typ-Code.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("strong", null, "Zellenwert:"), " Wie oft hat diese Person diesen Dienst im gew\xE4hlten Zeitraum absolviert. \u201E\u2013\" bedeutet 0.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("strong", null, "Total-Spalte:"), " Gesamtanzahl aller Dienste der Person \u2014 Sortierkriterium.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("strong", null, "Team-Total-Zeile:"), " Spaltensumme \xFCber alle MA \u2014 zeigt welche Dienste team-weit am h\xE4ufigsten besetzt werden.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("strong", null, "Ausr\xFCckdienst-Filter:"), " Zeigt nur Dienste, die in den Einstellungen als Ausr\xFCckdienst markiert sind."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      margin: '8px 0 10px',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: 'btn btn-sm' + (nurKlein ? ' btn-primary' : ' btn-outline'),
    onClick: function () {
      setNurKlein(function (v) {
        return !v;
      });
    },
    disabled: ausrueckCount === 0,
    title: ausrueckCount === 0 ? 'Keine Ausrückdienste in Einstellungen markiert' : 'Nur als Ausrückdienst markierte Dienste anzeigen',
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "13",
    height: "13",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "9",
    cy: "7",
    r: "4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M23 21v-2a4 4 0 00-3-3.87"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M16 3.13a4 4 0 010 7.75"
  })), "Nur Ausr\xFCckdienste", /*#__PURE__*/React.createElement("span", {
    style: {
      opacity: 0.65,
      fontSize: 11
    }
  }, "(", ausrueckCount, ")")), nurKlein && ausrueckCount > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: 'var(--ink-muted)'
    }
  }, visibleDienste.length, " von ", dienste.length, " Diensten"), ausrueckCount === 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: 'var(--ink-muted)'
    }
  }, "Keine Ausr\xFCckdienste definiert \u2014 in ", /*#__PURE__*/React.createElement("strong", null, "Einstellungen \u2192 Dienstzeiten"), " die Spalte \u201EAusr\xFCck\" setzen.")), /*#__PURE__*/React.createElement(DataTable, {
    cols: cols,
    rows: pivot,
    foot: footRow,
    wrapClass: "paar-matrix-wrap"
  })), nach_ort && Object.keys(nach_ort).length > 1 && /*#__PURE__*/React.createElement(SectionCard, {
    title: 'Häufigkeit nach Standort — ' + label
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 8,
      padding: '4px 0 12px'
    }
  }, Object.keys(nach_ort).sort().map(function (ort) {
    return /*#__PURE__*/React.createElement("button", {
      key: ort,
      className: 'chip' + (showOrt === ort ? ' active' : ''),
      onClick: function () {
        setShowOrt(showOrt === ort ? null : ort);
      },
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5
      }
    }, IcoPin, " ", ort);
  })), showOrt && nach_ort[showOrt] ? function () {
    const od = nach_ort[showOrt];
    const visDienste = nurKlein ? od.dienste.filter(function (d) {
      return ausrueckSet.has(d);
    }) : od.dienste;
    const oCols = [{
      key: 'name',
      label: 'Name',
      sticky: true
    }, ...visDienste.map(function (d) {
      return {
        key: d,
        label: d,
        align: 'right',
        fmt: function (v) {
          return v === 0 ? React.createElement('span', {
            style: {
              color: 'var(--ink-faint)'
            }
          }, '–') : v;
        }
      };
    }), {
      key: '__total',
      label: 'Total',
      align: 'right',
      fmt: function (v) {
        return React.createElement('strong', null, v);
      }
    }];
    const oFoot = {
      name: 'Team-Total'
    };
    visDienste.forEach(function (d) {
      oFoot[d] = od.totals[d] || 0;
    });
    oFoot.__total = visDienste.reduce(function (s, d) {
      return s + (od.totals[d] || 0);
    }, 0);
    const oRows = od.pivot.map(function (row) {
      if (!nurKlein) return row;
      var r = {
        kuerzel: row.kuerzel,
        name: row.name
      };
      var tot = 0;
      visDienste.forEach(function (d) {
        r[d] = row[d] || 0;
        tot += r[d];
      });
      r.__total = tot;
      return r;
    }).filter(function (r) {
      return r.__total > 0;
    });
    return /*#__PURE__*/React.createElement("div", {
      className: "fade-in"
    }, /*#__PURE__*/React.createElement(DataTable, {
      cols: oCols,
      rows: oRows,
      foot: oFoot,
      wrapClass: "paar-matrix-wrap"
    }));
  }() : /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: 'var(--ink-muted)',
      margin: 0
    }
  }, "Standort ausw\xE4hlen um die H\xE4ufigkeiten anzuzeigen.")));
}

// ── Team-Kombinationen ──────────────────────────────────────────────────────

function PaarMatrix({
  alle,
  paare,
  maxAnzahl
}) {
  const [popup, setPopup] = React.useState(null);
  React.useEffect(function () {
    if (!popup) return;
    function onOutside(e) {
      if (!e.target.closest('.paar-popup')) setPopup(null);
    }
    document.addEventListener('mousedown', onOutside);
    return function () {
      document.removeEventListener('mousedown', onOutside);
    };
  }, [popup]);
  if (!alle || alle.length === 0) {
    return /*#__PURE__*/React.createElement("div", {
      className: "empty-state",
      style: {
        padding: 32,
        gap: 8
      }
    }, IcoChart, /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink-muted)'
      }
    }, "Keine Daten vorhanden."));
  }
  const lookup = {};
  const diensteLookup = {};
  paare.forEach(function (p) {
    lookup[p.a + '|' + p.b] = p.anzahl;
    lookup[p.b + '|' + p.a] = p.anzahl;
    diensteLookup[p.a + '|' + p.b] = p.dienste;
    diensteLookup[p.b + '|' + p.a] = p.dienste;
  });
  function cellColor(n) {
    if (!n) return 'transparent';
    const intensity = Math.max(0.08, Math.min(0.85, n / maxAnzahl));
    return 'rgba(30, 58, 138, ' + intensity + ')';
  }
  function openPopup(e, rowMA, colMA, n) {
    if (!n) return;
    const dienste = diensteLookup[rowMA.kuerzel + '|' + colMA.kuerzel] || [];
    const rect = e.currentTarget.getBoundingClientRect();
    setPopup({
      a: rowMA,
      b: colMA,
      dienste,
      x: rect.left + rect.width / 2,
      y: rect.bottom + 6
    });
  }
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "analyse-table-wrap paar-matrix-wrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "analyse-table paar-matrix"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: {
      minWidth: 160
    },
    className: "col-sticky"
  }), alle.map(function (m) {
    return /*#__PURE__*/React.createElement("th", {
      key: m.kuerzel,
      className: "num",
      style: {
        minWidth: 44
      },
      title: m.name
    }, m.kuerzel);
  }))), /*#__PURE__*/React.createElement("tbody", null, alle.map(function (rowMA) {
    return /*#__PURE__*/React.createElement("tr", {
      key: rowMA.kuerzel
    }, /*#__PURE__*/React.createElement("td", {
      className: "col-sticky",
      style: {
        fontWeight: 500,
        whiteSpace: 'nowrap'
      }
    }, rowMA.name), alle.map(function (colMA) {
      if (rowMA.kuerzel === colMA.kuerzel) {
        return /*#__PURE__*/React.createElement("td", {
          key: colMA.kuerzel,
          className: "num paar-diag"
        }, "\u2014");
      }
      const n = lookup[rowMA.kuerzel + '|' + colMA.kuerzel] || 0;
      return /*#__PURE__*/React.createElement("td", {
        key: colMA.kuerzel,
        className: 'num paar-cell' + (n ? ' paar-cell--klickbar' : ''),
        style: {
          background: cellColor(n),
          color: n > maxAnzahl * 0.5 ? '#fff' : 'var(--ink)'
        },
        title: n ? rowMA.name + ' + ' + colMA.name + ': ' + n + '×' : rowMA.name + ' + ' + colMA.name + ': 0',
        onClick: n ? function (e) {
          openPopup(e, rowMA, colMA, n);
        } : undefined
      }, n || '');
    }));
  })))), popup && /*#__PURE__*/React.createElement(PaarPopup, {
    popup: popup,
    onClose: function () {
      setPopup(null);
    }
  }));
}
function PaarPopup({
  popup,
  onClose
}) {
  const ref = React.useRef(null);
  const [style, setStyle] = React.useState({
    visibility: 'hidden',
    position: 'fixed',
    top: 0,
    left: 0
  });
  React.useLayoutEffect(function () {
    if (!ref.current) return;
    const el = ref.current;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = popup.x - w / 2;
    let top = popup.y;
    if (left + w > vw - 8) left = vw - w - 8;
    if (left < 8) left = 8;
    if (top + h > vh - 8) top = popup.y - h - 12;
    setStyle({
      visibility: 'visible',
      position: 'fixed',
      top: top,
      left: left,
      zIndex: 9999
    });
  }, [popup]);
  return /*#__PURE__*/React.createElement("div", {
    ref: ref,
    className: "paar-popup",
    style: style
  }, /*#__PURE__*/React.createElement("div", {
    className: "paar-popup__head"
  }, /*#__PURE__*/React.createElement("span", null, popup.a.name, " + ", popup.b.name), /*#__PURE__*/React.createElement("button", {
    className: "paar-popup__close",
    onClick: onClose
  }, "\u2715")), /*#__PURE__*/React.createElement("ul", {
    className: "paar-popup__list"
  }, popup.dienste.map(function (d) {
    return /*#__PURE__*/React.createElement("li", {
      key: d.name
    }, /*#__PURE__*/React.createElement("span", {
      className: "paar-popup__count"
    }, d.anzahl, "\xD7"), /*#__PURE__*/React.createElement("span", null, d.name || '(unbekannt)'));
  }), popup.dienste.length === 0 && /*#__PURE__*/React.createElement("li", {
    style: {
      color: 'var(--ink-muted)',
      fontStyle: 'italic'
    }
  }, "keine Details")));
}
function SubTeamKombi({
  qs,
  label
}) {
  const url = '/api/analyse/teamkombinationen?' + qs;
  const {
    data,
    loading,
    error
  } = useAnalyse(url, [qs]);
  const [showOrt, setShowOrt] = React.useState(null);
  return /*#__PURE__*/React.createElement(AnalyseShell, {
    loading: loading,
    error: error
  }, data && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(SectionCard, {
    title: 'Wie oft haben je zwei Mitarbeitende zusammen gearbeitet? — ' + label
  }, /*#__PURE__*/React.createElement(AnalyseHilfe, null, /*#__PURE__*/React.createElement("strong", null, "Was zeigt diese Tabelle?"), " Matrix: Zeile \xD7 Spalte = Anzahl Dienste, bei denen beide MA gleichzeitig am selben Ort eingeteilt waren.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("strong", null, "Farbtiefe:"), " Je dunkler das Blau, desto h\xE4ufiger wurden diese beiden Personen zusammen eingesetzt \u2014 relativ zum Maximum im Team.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("strong", null, "Rangliste:"), " Die Top-15-Paare nach gemeinsamen Diensten stehen darunter.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("strong", null, "Nach Ort:"), " Falls mehrere Standorte vorhanden sind, kann jeder einzeln aufgerufen werden \u2014 n\xFCtzlich f\xFCr ortsspezifische Fairness-Pr\xFCfungen."), /*#__PURE__*/React.createElement(PaarMatrix, {
    alle: data.alle,
    paare: data.paare,
    maxAnzahl: data.max_anzahl
  })), /*#__PURE__*/React.createElement(SectionCard, {
    title: "Top-Paare (Rangliste)"
  }, /*#__PURE__*/React.createElement(DataTable, {
    cols: [{
      key: '_rang',
      label: 'Rang',
      align: 'right'
    }, {
      key: 'a',
      label: 'MA 1'
    }, {
      key: 'b',
      label: 'MA 2'
    }, {
      key: 'anzahl',
      label: 'Gemeinsame Dienste',
      align: 'right',
      fmt: function (v) {
        return React.createElement('strong', null, v + '×');
      }
    }],
    rows: data.paare.slice(0, 15).map(function (p, i) {
      return Object.assign({}, p, {
        _rang: i + 1
      });
    })
  })), Object.keys(data.nach_ort).length > 1 && /*#__PURE__*/React.createElement(SectionCard, {
    title: "Nach Ort aufgeschl\xFCsselt"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 12,
      padding: '4px 0'
    }
  }, Object.keys(data.nach_ort).map(function (ort) {
    return /*#__PURE__*/React.createElement("button", {
      key: ort,
      className: 'chip' + (showOrt === ort ? ' active' : ''),
      onClick: function () {
        setShowOrt(showOrt === ort ? null : ort);
      },
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5
      }
    }, IcoPin, " ", ort);
  })), showOrt && data.nach_ort[showOrt] && /*#__PURE__*/React.createElement("div", {
    className: "fade-in"
  }, /*#__PURE__*/React.createElement(DataTable, {
    cols: [{
      key: 'a',
      label: 'MA 1'
    }, {
      key: 'b',
      label: 'MA 2'
    }, {
      key: 'anzahl',
      label: 'Gemeinsame Dienste',
      align: 'right',
      fmt: function (v) {
        return React.createElement('strong', null, v + '×');
      }
    }],
    rows: data.nach_ort[showOrt]
  })), !showOrt && /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: 'var(--ink-muted)',
      margin: 0
    }
  }, "Ort ausw\xE4hlen f\xFCr ortsspezifische Paare."))));
}

// ── Kollegen-Ranking ────────────────────────────────────────────────────────

function SubKollegen({
  qs,
  label
}) {
  const [kuerzel, setKuerzel] = React.useState('');
  const [alleMA, setAlleMA] = React.useState([]);
  const [result, setResult] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [showOrt, setShowOrt] = React.useState(null);
  const [showDienst, setShowDienst] = React.useState(null);
  const [search, setSearch] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const comboRef = React.useRef(null);
  React.useEffect(function () {
    function handler(e) {
      if (comboRef.current && !comboRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return function () {
      document.removeEventListener('mousedown', handler);
    };
  }, []);
  const filtered = React.useMemo(function () {
    const q = search.toLowerCase();
    if (!q) return alleMA;
    return alleMA.filter(function (m) {
      return m.kuerzel.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
    });
  }, [alleMA, search]);
  const selectedMA = alleMA.find(function (m) {
    return m.kuerzel === kuerzel;
  });
  React.useEffect(function () {
    fetch('/api/analyse/kollegen_ranking').then(function (r) {
      return r.json();
    }).then(function (d) {
      if (d.alle_ma) setAlleMA(d.alle_ma);
    }).catch(function () {});
  }, []);
  React.useEffect(function () {
    if (kuerzel) load(kuerzel);
  }, [qs]);
  function load(k) {
    if (!k) return;
    setLoading(true);
    setError('');
    setResult(null);
    setShowOrt(null);
    setShowDienst(null);
    const url = '/api/analyse/kollegen_ranking?kuerzel=' + encodeURIComponent(k) + (qs ? '&' + qs : '');
    fetch(url).then(function (r) {
      return r.json();
    }).then(function (d) {
      if (d.error) {
        setError(d.error);
      } else {
        setResult(d);
      }
      setLoading(false);
    }).catch(function () {
      setError('Verbindungsfehler');
      setLoading(false);
    });
  }
  const rankCols = [{
    key: '_rang',
    label: 'Rang',
    align: 'right'
  }, {
    key: 'name',
    label: 'Name'
  }, {
    key: 'bevorstehend',
    label: 'Bevorstehend',
    align: 'right',
    fmt: function (v, row) {
      if (v === 0 || v === undefined) return React.createElement('span', {
        style: {
          color: 'var(--ink-faint)'
        }
      }, '–');
      return React.createElement('span', {
        style: {
          color: 'var(--blue-600)',
          fontWeight: 600
        }
      }, v + '×');
    }
  }, {
    key: 'anzahl',
    label: 'Einsätze zusammen',
    align: 'right',
    fmt: function (v) {
      return React.createElement('strong', null, v + '×');
    }
  }];
  const rankRows = result ? result.rangliste.map(function (r, i) {
    return Object.assign({}, r, {
      _rang: i + 1
    });
  }) : [];
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(SectionCard, {
    title: "Mitarbeitende w\xE4hlen"
  }, /*#__PURE__*/React.createElement(AnalyseHilfe, null, /*#__PURE__*/React.createElement("strong", null, "Was zeigt diese Analyse?"), " F\xFCr eine gew\xE4hlte Person: Wer hat am h\xE4ufigsten zusammen mit ihr Dienst gemacht?", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("strong", null, "Filterregel:"), " Nur Eins\xE4tze mit \u2264 3 MA insgesamt und gesetztem Ort flie\xDFen ein \u2014 so werden Allein-Dienste und gro\xDFe Teamtage herausgefiltert und echte Zusammenarbeit gez\xE4hlt.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("strong", null, "Rangliste:"), " Kolleg:innen absteigend nach gemeinsamen Eins\xE4tzen, aufgeschl\xFCsselt nach Gesamtperiode und einzelnen Standorten.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("strong", null, "Zeitraum-Filter:"), " Gilt f\xFCr die gesamte App \u2014 Monat/Jahr oben rechts \xE4ndert auch diese Auswertung."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      alignItems: 'center',
      flexWrap: 'wrap',
      padding: '4px 0'
    }
  }, /*#__PURE__*/React.createElement("div", {
    ref: comboRef,
    style: {
      position: 'relative',
      minWidth: 280
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'flex',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: {
      position: 'absolute',
      left: 9,
      pointerEvents: 'none',
      color: 'var(--ink-faint)',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "11",
    r: "8"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "21",
    y1: "21",
    x2: "16.65",
    y2: "16.65"
  })), /*#__PURE__*/React.createElement("input", {
    type: "text",
    className: "input",
    placeholder: "Mitarbeitende suchen\u2026",
    value: open ? search : selectedMA ? selectedMA.kuerzel + ' — ' + selectedMA.name : '',
    onChange: function (e) {
      setSearch(e.target.value);
      setOpen(true);
    },
    onFocus: function () {
      setSearch('');
      setOpen(true);
    },
    style: {
      paddingLeft: 30,
      width: '100%',
      cursor: open ? 'text' : 'pointer'
    },
    readOnly: !open,
    onClick: function () {
      if (!open) {
        setSearch('');
        setOpen(true);
      }
    }
  }), kuerzel && !open && /*#__PURE__*/React.createElement("button", {
    onClick: function () {
      setKuerzel('');
      setResult(null);
      setSearch('');
    },
    style: {
      position: 'absolute',
      right: 8,
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      color: 'var(--ink-faint)',
      padding: 2,
      lineHeight: 1
    },
    title: "Auswahl aufheben"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.5",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("line", {
    x1: "18",
    y1: "6",
    x2: "6",
    y2: "18"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "6",
    y1: "6",
    x2: "18",
    y2: "18"
  })))), open && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 'calc(100% + 2px)',
      left: 0,
      right: 0,
      zIndex: 50,
      background: 'var(--bg-surface)',
      border: '1px solid var(--hairline)',
      borderRadius: 6,
      boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
      maxHeight: 220,
      overflowY: 'auto'
    }
  }, filtered.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '10px 12px',
      color: 'var(--ink-muted)',
      fontSize: 12
    }
  }, "Keine Treffer") : filtered.map(function (m) {
    return /*#__PURE__*/React.createElement("div", {
      key: m.kuerzel,
      onMouseDown: function () {
        setKuerzel(m.kuerzel);
        setSearch('');
        setOpen(false);
        load(m.kuerzel);
      },
      style: {
        padding: '8px 12px',
        cursor: 'pointer',
        background: m.kuerzel === kuerzel ? 'var(--blue-50, #eff6ff)' : 'transparent',
        display: 'flex',
        gap: 8,
        alignItems: 'baseline'
      },
      onMouseEnter: function (e) {
        if (m.kuerzel !== kuerzel) e.currentTarget.style.background = 'var(--bg-hover, #f5f5f5)';
      },
      onMouseLeave: function (e) {
        e.currentTarget.style.background = m.kuerzel === kuerzel ? 'var(--blue-50, #eff6ff)' : 'transparent';
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 600,
        minWidth: 36,
        color: 'var(--ink)'
      }
    }, m.kuerzel), /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink-muted)',
        fontSize: 13
      }
    }, m.name));
  }))), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: 'var(--ink-muted)'
    }
  }, "Zeigt Eins\xE4tze mit \u2264 3 MA, bei denen ein Ort gesetzt ist."))), loading && /*#__PURE__*/React.createElement("div", {
    className: "empty-state",
    style: {
      padding: 48,
      color: 'var(--ink-muted)',
      gap: 10
    }
  }, IcoSpinner, /*#__PURE__*/React.createElement("span", null, "Wird geladen\u2026")), error && /*#__PURE__*/React.createElement("div", {
    className: "empty-state",
    style: {
      padding: 48,
      color: 'var(--red-500)',
      gap: 10
    }
  }, IcoWarn, /*#__PURE__*/React.createElement("span", null, error)), result && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(SectionCard, {
    title: 'Kollegen-Ranking — ' + result.name + ' (' + result.kuerzel + ')'
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: 'var(--ink-muted)',
      margin: '8px 0 10px'
    }
  }, result.einsaetze, " Eins\xE4tze analysiert \u2014 ", label, ".", result.rangliste.length === 0 && ' Keine Kollegen gefunden (alle Einsätze Einzeldienst oder > 3 MA).'), result.rangliste.length > 0 && /*#__PURE__*/React.createElement(DataTable, {
    cols: rankCols,
    rows: rankRows
  })), Object.keys(result.nach_ort).length > 1 && /*#__PURE__*/React.createElement(SectionCard, {
    title: "Aufschl\xFCsselung nach Ort"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 10,
      padding: '4px 0'
    }
  }, Object.keys(result.nach_ort).map(function (ort) {
    return /*#__PURE__*/React.createElement("button", {
      key: ort,
      className: 'chip' + (showOrt === ort ? ' active' : ''),
      onClick: function () {
        setShowOrt(showOrt === ort ? null : ort);
      },
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5
      }
    }, IcoPin, " ", ort);
  })), showOrt && /*#__PURE__*/React.createElement("div", {
    className: "fade-in"
  }, /*#__PURE__*/React.createElement(DataTable, {
    cols: [{
      key: 'name',
      label: 'Name'
    }, {
      key: 'bevorstehend',
      label: 'Bevorstehend',
      align: 'right',
      fmt: function (v) {
        if (v === 0 || v === undefined) return React.createElement('span', {
          style: {
            color: 'var(--ink-faint)'
          }
        }, '–');
        return React.createElement('span', {
          style: {
            color: 'var(--blue-600)',
            fontWeight: 600
          }
        }, v + '×');
      }
    }, {
      key: 'anzahl',
      label: 'Einsätze',
      align: 'right',
      fmt: function (v) {
        return React.createElement('strong', null, v + '×');
      }
    }],
    rows: result.nach_ort[showOrt]
  }))), result.nach_dienst && Object.keys(result.nach_dienst).length > 0 && /*#__PURE__*/React.createElement(SectionCard, {
    title: "Aufschl\xFCsselung nach Dienst"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 10,
      padding: '4px 0'
    }
  }, Object.keys(result.nach_dienst).map(function (d) {
    return /*#__PURE__*/React.createElement("button", {
      key: d,
      className: 'chip' + (showDienst === d ? ' active' : ''),
      onClick: function () {
        setShowDienst(showDienst === d ? null : d);
      }
    }, d);
  })), showDienst && /*#__PURE__*/React.createElement("div", {
    className: "fade-in"
  }, /*#__PURE__*/React.createElement(DataTable, {
    cols: [{
      key: 'name',
      label: 'Name'
    }, {
      key: 'bevorstehend',
      label: 'Bevorstehend',
      align: 'right',
      fmt: function (v) {
        if (v === 0 || v === undefined) return React.createElement('span', {
          style: {
            color: 'var(--ink-faint)'
          }
        }, '–');
        return React.createElement('span', {
          style: {
            color: 'var(--blue-600)',
            fontWeight: 600
          }
        }, v + '×');
      }
    }, {
      key: 'anzahl',
      label: 'Einsätze',
      align: 'right',
      fmt: function (v) {
        return React.createElement('strong', null, v + '×');
      }
    }],
    rows: result.nach_dienst[showDienst]
  })), !showDienst && /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      color: 'var(--ink-muted)',
      margin: 0
    }
  }, "Dienst ausw\xE4hlen f\xFCr dienstspezifische Aufschl\xFCsselung."))));
}

// ── MA-Vergleich ────────────────────────────────────────────────────────────

function MaCombo({
  alleMA,
  value,
  onChange,
  placeholder
}) {
  var [search, setSearch] = React.useState('');
  var [open, setOpen] = React.useState(false);
  var ref = React.useRef(null);
  React.useEffect(function () {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return function () {
      document.removeEventListener('mousedown', handler);
    };
  }, []);
  var filtered = React.useMemo(function () {
    var q = search.toLowerCase();
    if (!q) return alleMA;
    return alleMA.filter(function (m) {
      return m.kuerzel.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
    });
  }, [alleMA, search]);
  var selected = alleMA.find(function (m) {
    return m.kuerzel === value;
  });
  return /*#__PURE__*/React.createElement("div", {
    ref: ref,
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'flex',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: {
      position: 'absolute',
      left: 9,
      pointerEvents: 'none',
      color: 'var(--ink-faint)',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "11",
    r: "8"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "21",
    y1: "21",
    x2: "16.65",
    y2: "16.65"
  })), /*#__PURE__*/React.createElement("input", {
    type: "text",
    className: "input",
    placeholder: placeholder || 'Mitarbeitende suchen…',
    value: open ? search : selected ? selected.kuerzel + ' — ' + selected.name : '',
    onChange: function (e) {
      setSearch(e.target.value);
      setOpen(true);
    },
    onFocus: function () {
      setSearch('');
      setOpen(true);
    },
    onClick: function () {
      if (!open) {
        setSearch('');
        setOpen(true);
      }
    },
    readOnly: !open,
    style: {
      paddingLeft: 30,
      width: '100%',
      cursor: open ? 'text' : 'pointer'
    }
  }), value && !open && /*#__PURE__*/React.createElement("button", {
    onClick: function () {
      onChange('');
      setSearch('');
    },
    style: {
      position: 'absolute',
      right: 8,
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      color: 'var(--ink-faint)',
      padding: 2,
      lineHeight: 1
    },
    title: "Auswahl aufheben"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.5",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("line", {
    x1: "18",
    y1: "6",
    x2: "6",
    y2: "18"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "6",
    y1: "6",
    x2: "18",
    y2: "18"
  })))), open && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 'calc(100% + 2px)',
      left: 0,
      right: 0,
      zIndex: 50,
      background: 'var(--bg-surface)',
      border: '1px solid var(--hairline)',
      borderRadius: 6,
      boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
      maxHeight: 220,
      overflowY: 'auto'
    }
  }, filtered.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '10px 12px',
      color: 'var(--ink-muted)',
      fontSize: 12
    }
  }, "Keine Treffer") : filtered.map(function (m) {
    return /*#__PURE__*/React.createElement("div", {
      key: m.kuerzel,
      onMouseDown: function () {
        onChange(m.kuerzel);
        setSearch('');
        setOpen(false);
      },
      style: {
        padding: '8px 12px',
        cursor: 'pointer',
        fontSize: 13,
        background: m.kuerzel === value ? 'var(--blue-100)' : 'transparent',
        display: 'flex',
        gap: 8,
        alignItems: 'baseline'
      },
      onMouseEnter: function (e) {
        if (m.kuerzel !== value) e.currentTarget.style.background = '#f5f5f5';
      },
      onMouseLeave: function (e) {
        e.currentTarget.style.background = m.kuerzel === value ? 'var(--blue-100)' : 'transparent';
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 600,
        minWidth: 36,
        color: 'var(--ink)'
      }
    }, m.kuerzel), /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink-muted)'
      }
    }, m.name), m.aktiv === 0 && /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink-faint)',
        fontSize: 11
      }
    }, "(inaktiv)"));
  })));
}
function SubVergleich({
  qs,
  label
}) {
  var [alleMA, setAlleMA] = React.useState([]);
  var [ma1, setMa1] = React.useState('');
  var [ma2, setMa2] = React.useState('');
  var [nurGemeinsam, setNurGemeinsam] = React.useState(true);
  var [result, setResult] = React.useState(null);
  var [loading, setLoading] = React.useState(false);
  var [error, setError] = React.useState('');
  React.useEffect(function () {
    fetch('/api/analyse/vergleich').then(function (r) {
      return r.json();
    }).then(function (d) {
      if (d.alle_ma) setAlleMA(d.alle_ma);
    }).catch(function () {});
  }, []);
  React.useEffect(function () {
    if (!ma1 || !ma2 || ma1 === ma2) {
      setResult(null);
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    fetch('/api/analyse/vergleich?ma1=' + encodeURIComponent(ma1) + '&ma2=' + encodeURIComponent(ma2) + '&' + qs).then(function (r) {
      return r.json();
    }).then(function (d) {
      if (d.error) setError(d.error);else setResult(d);
      setLoading(false);
    }).catch(function () {
      setError('Verbindungsfehler');
      setLoading(false);
    });
  }, [ma1, ma2, qs]);
  var tage = React.useMemo(function () {
    if (!result) return [];
    if (!nurGemeinsam) return result.tage;
    return result.tage.filter(function (t) {
      return t.beide_arbeit;
    });
  }, [result, nurGemeinsam]);
  var gemeinsamCount = result ? result.tage.filter(function (t) {
    return t.beide_arbeit;
  }).length : 0;
  var gleicherOrtCount = result ? result.tage.filter(function (t) {
    return t.beide_arbeit && t.ma1 && t.ma2 && t.ma1.ort && t.ma2.ort && t.ma1.ort === t.ma2.ort;
  }).length : 0;
  function dienstLabel(s, showOrt) {
    if (!s) return /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink-faint)'
      }
    }, "\u2014");
    var kat = s.kategorie;
    var textColor = kat === 'Frei' ? 'var(--ink-faint)' : kat === 'Abwesenheit' ? 'var(--amber-600)' : undefined;
    return /*#__PURE__*/React.createElement("span", {
      style: {
        color: textColor
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 600
      }
    }, s.anzeigename || s.code), s.beginn && s.ende && /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink-muted)',
        marginLeft: 6,
        fontSize: 11.5
      }
    }, s.beginn, "\u2013", s.ende), showOrt && s.ort && /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink-faint)',
        marginLeft: 5,
        fontSize: 11
      }
    }, "(", s.ort, ")"));
  }
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(SectionCard, {
    title: "Personen w\xE4hlen"
  }, /*#__PURE__*/React.createElement(AnalyseHilfe, null, /*#__PURE__*/React.createElement("strong", null, "Was zeigt diese Analyse?"), " An welchen Tagen haben zwei gew\xE4hlte Personen gleichzeitig Dienst \u2014 n\xFCtzlich f\xFCr die Planung von Sitzungen, \xDCbergaben oder gemeinsamen Projekten.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--green-bright-h)'
    }
  }, "\u25A0 Gr\xFCn"), " = beide arbeiten am selben Ort \u2014 ein gemeinsamer Termin ist m\xF6glich.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--amber-600)'
    }
  }, "\u25A0 Gelb"), " = beide arbeiten, aber an unterschiedlichen Orten \u2014 pers\xF6nliches Treffen schwieriger.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("strong", null, "Zeitraum-Filter:"), " Wird \xFCber den Zeitraum-Selector oben rechts gesteuert (Monat, Quartal, Jahr oder freier Bereich).", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("strong", null, "Filter \xABNur gemeinsame Dienste\xBB:"), " Blendet Tage aus, an denen mindestens eine Person frei oder abwesend ist."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      flexWrap: 'wrap',
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 220
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "field-label"
  }, "Person 1"), /*#__PURE__*/React.createElement(MaCombo, {
    alleMA: alleMA,
    value: ma1,
    onChange: setMa1,
    placeholder: "Person 1 suchen\u2026"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 220
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "field-label"
  }, "Person 2"), /*#__PURE__*/React.createElement(MaCombo, {
    alleMA: alleMA,
    value: ma2,
    onChange: setMa2,
    placeholder: "Person 2 suchen\u2026"
  }))), ma1 && ma2 && ma1 === ma2 && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10,
      color: 'var(--amber-600)',
      fontSize: 12.5
    }
  }, "Bitte zwei verschiedene Personen w\xE4hlen.")), loading && /*#__PURE__*/React.createElement("div", {
    className: "empty-state",
    style: {
      padding: 48
    }
  }, IcoSpinner, /*#__PURE__*/React.createElement("span", null, "Lade\u2026")), error && /*#__PURE__*/React.createElement("div", {
    className: "hint-box amber",
    style: {
      marginTop: 14
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "glyph"
  }, "\u26A0\uFE0F"), error), result && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      margin: '14px 0 10px',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'var(--ink-muted)'
    }
  }, /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--ink)'
    }
  }, gemeinsamCount), " gemeinsame Arbeitstage", gleicherOrtCount > 0 && /*#__PURE__*/React.createElement("span", null, ", davon ", /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--green-bright-h)'
    }
  }, gleicherOrtCount), " am selben Ort"), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 4
    }
  }, "in ", label)), /*#__PURE__*/React.createElement("div", {
    style: {
      marginLeft: 'auto',
      display: 'flex',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: 'chip' + (nurGemeinsam ? ' active' : ''),
    onClick: function () {
      setNurGemeinsam(true);
    }
  }, "Nur gemeinsame Dienste"), /*#__PURE__*/React.createElement("button", {
    className: 'chip' + (!nurGemeinsam ? ' active' : ''),
    onClick: function () {
      setNurGemeinsam(false);
    }
  }, "Alle Tage"))), tage.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "empty-state"
  }, /*#__PURE__*/React.createElement("span", {
    className: "glyph"
  }, "\uD83D\uDCC5"), "Keine gemeinsamen Arbeitstage im gew\xE4hlten Zeitraum.") : /*#__PURE__*/React.createElement("div", {
    className: "card",
    style: {
      padding: 0,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      overflowX: 'auto'
    }
  }, /*#__PURE__*/React.createElement("table", {
    className: "tbl"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Datum"), /*#__PURE__*/React.createElement("th", null, "Tag"), /*#__PURE__*/React.createElement("th", null, result.ma1.kuerzel, " \u2014 ", result.ma1.name), /*#__PURE__*/React.createElement("th", null, result.ma2.kuerzel, " \u2014 ", result.ma2.name))), /*#__PURE__*/React.createElement("tbody", null, tage.map(function (t) {
    var isWE = t.wochentag === 'Sa' || t.wochentag === 'So';
    var gleicherOrt = t.beide_arbeit && t.ma1 && t.ma2 && t.ma1.ort && t.ma2.ort && t.ma1.ort === t.ma2.ort;
    var verschOrt = t.beide_arbeit && !gleicherOrt;
    var rowBg = gleicherOrt ? 'var(--green-bg-soft)' : verschOrt ? 'var(--amber-bg-soft)' : undefined;
    var showOrt = t.beide_arbeit && !gleicherOrt;
    var parts = t.datum.split('-');
    var datumFmt = parts[2] + '.' + parts[1] + '.' + parts[0];
    return /*#__PURE__*/React.createElement("tr", {
      key: t.datum,
      style: {
        background: rowBg
      }
    }, /*#__PURE__*/React.createElement("td", {
      style: {
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap'
      }
    }, datumFmt), /*#__PURE__*/React.createElement("td", {
      style: {
        fontWeight: isWE ? 600 : 400,
        color: isWE ? 'var(--amber-600)' : 'var(--ink-muted)',
        whiteSpace: 'nowrap'
      }
    }, t.wochentag), /*#__PURE__*/React.createElement("td", null, dienstLabel(t.ma1, showOrt)), /*#__PURE__*/React.createElement("td", null, dienstLabel(t.ma2, showOrt)));
  })))))), !loading && !result && ma1 && ma2 && ma1 !== ma2 && !error && /*#__PURE__*/React.createElement("div", {
    className: "empty-state"
  }, /*#__PURE__*/React.createElement("span", {
    className: "glyph"
  }, "\uD83D\uDCC5"), "Keine Daten f\xFCr diesen Zeitraum."), !loading && !result && (!ma1 || !ma2 || ma1 === ma2) && !error && /*#__PURE__*/React.createElement("div", {
    className: "empty-state"
  }, /*#__PURE__*/React.createElement("span", {
    className: "glyph"
  }, "\uD83D\uDC65"), "Zwei Personen w\xE4hlen um gemeinsame Dienste zu sehen."));
}

// ── Tausch ──────────────────────────────────────────────────────────────────

function SubTausch({
  qs,
  label
}) {
  var [alleMA, setAlleMA] = React.useState([]);
  var [ma1, setMa1] = React.useState('');
  var [ma2, setMa2] = React.useState('');
  var [nurChancen, setNurChancen] = React.useState(false);
  var [result, setResult] = React.useState(null);
  var [loading, setLoading] = React.useState(false);
  var [error, setError] = React.useState('');
  React.useEffect(function () {
    fetch('/api/analyse/vergleich').then(function (r) {
      return r.json();
    }).then(function (d) {
      if (d.alle_ma) setAlleMA(d.alle_ma);
    }).catch(function () {});
  }, []);
  React.useEffect(function () {
    if (!ma1 || !ma2 || ma1 === ma2) {
      setResult(null);
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    fetch('/api/analyse/vergleich?ma1=' + encodeURIComponent(ma1) + '&ma2=' + encodeURIComponent(ma2) + '&' + qs).then(function (r) {
      return r.json();
    }).then(function (d) {
      if (d.error) setError(d.error);else setResult(d);
      setLoading(false);
    }).catch(function () {
      setError('Verbindungsfehler');
      setLoading(false);
    });
  }, [ma1, ma2, qs]);
  function tauschInfo(t) {
    var s1 = t.ma1,
      s2 = t.ma2;
    var a1 = !!(s1 && s1.kategorie === 'Arbeit');
    var a2 = !!(s2 && s2.kategorie === 'Arbeit');
    var abw1 = !!(s1 && s1.kategorie === 'Abwesenheit');
    var abw2 = !!(s2 && s2.kategorie === 'Abwesenheit');
    if (a1 && a2) {
      if (s1.code !== s2.code) return {
        type: 'tausch'
      };
      return {
        type: 'gleich'
      };
    }
    if (a1 && !a2 && !abw2) return {
      type: 'abgabe',
      richtung: 1
    };
    if (a2 && !a1 && !abw1) return {
      type: 'abgabe',
      richtung: 2
    };
    return {
      type: 'neutral'
    };
  }
  var tage = React.useMemo(function () {
    if (!result) return [];
    return result.tage.map(function (t) {
      return Object.assign({}, t, {
        __tausch: tauschInfo(t)
      });
    });
  }, [result]);
  var sichtbar = React.useMemo(function () {
    if (!nurChancen) return tage;
    return tage.filter(function (t) {
      return t.__tausch.type === 'tausch' || t.__tausch.type === 'abgabe';
    });
  }, [tage, nurChancen]);
  var tauschCount = tage.filter(function (t) {
    return t.__tausch.type === 'tausch';
  }).length;
  var abgabeCount = tage.filter(function (t) {
    return t.__tausch.type === 'abgabe';
  }).length;
  function dienstLabel(s) {
    if (!s) return /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink-faint)'
      }
    }, "\u2014");
    var kat = s.kategorie;
    var textColor = kat === 'Frei' ? 'var(--ink-faint)' : kat === 'Abwesenheit' ? 'var(--amber-600)' : undefined;
    return /*#__PURE__*/React.createElement("span", {
      style: {
        color: textColor
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 600
      }
    }, s.anzeigename || s.code), s.beginn && s.ende && /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink-muted)',
        marginLeft: 6,
        fontSize: 11.5
      }
    }, s.beginn, "\u2013", s.ende), s.ort && /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink-faint)',
        marginLeft: 5,
        fontSize: 11
      }
    }, "(", s.ort, ")"));
  }
  function statusBadge(info) {
    if (info.type === 'tausch') return /*#__PURE__*/React.createElement("span", {
      className: "badge-info",
      style: {
        fontSize: 11
      }
    }, "\u21C4 Tausch m\xF6glich");
    if (info.type === 'abgabe') {
      var pfeil = info.richtung === 1 ? result.ma1.kuerzel + ' → ' + result.ma2.kuerzel : result.ma2.kuerzel + ' → ' + result.ma1.kuerzel;
      return /*#__PURE__*/React.createElement("span", {
        className: "badge-warn",
        style: {
          fontSize: 11
        }
      }, pfeil);
    }
    return null;
  }
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(SectionCard, {
    title: "Personen w\xE4hlen"
  }, /*#__PURE__*/React.createElement(AnalyseHilfe, null, /*#__PURE__*/React.createElement("strong", null, "Was zeigt diese Analyse?"), " Die Dienstpl\xE4ne zweier gew\xE4hlter Personen nebeneinander \u2014 um zu pr\xFCfen, ob und wie sich Dienste tauschen lassen.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--blue-600)'
    }
  }, "\u21C4 Tausch m\xF6glich"), " = beide arbeiten am selben Tag, aber mit unterschiedlichem Dienst \u2014 ein direkter Tausch der Dienste ist denkbar.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--amber-600)'
    }
  }, "Pfeil (z. B. AB \u2192 CD)"), " = eine Person arbeitet, die andere ist frei \u2014 der Dienst k\xF6nnte abgegeben bzw. \xFCbernommen werden.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("strong", null, "Nicht markiert:"), " beide frei, beide abwesend, gleicher Dienst, oder die freie Person ist an dem Tag abwesend (Urlaub o. \xE4.) und kann daher nicht \xFCbernehmen.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("strong", null, "Zeitraum-Filter:"), " Wird \xFCber den Zeitraum-Selector oben rechts gesteuert (Monat, Quartal, Jahr oder freier Bereich)."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      flexWrap: 'wrap',
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 220
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "field-label"
  }, "Person 1"), /*#__PURE__*/React.createElement(MaCombo, {
    alleMA: alleMA,
    value: ma1,
    onChange: setMa1,
    placeholder: "Person 1 suchen\u2026"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 220
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "field-label"
  }, "Person 2"), /*#__PURE__*/React.createElement(MaCombo, {
    alleMA: alleMA,
    value: ma2,
    onChange: setMa2,
    placeholder: "Person 2 suchen\u2026"
  }))), ma1 && ma2 && ma1 === ma2 && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10,
      color: 'var(--amber-600)',
      fontSize: 12.5
    }
  }, "Bitte zwei verschiedene Personen w\xE4hlen.")), loading && /*#__PURE__*/React.createElement("div", {
    className: "empty-state",
    style: {
      padding: 48
    }
  }, IcoSpinner, /*#__PURE__*/React.createElement("span", null, "Lade\u2026")), error && /*#__PURE__*/React.createElement("div", {
    className: "hint-box amber",
    style: {
      marginTop: 14
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "glyph"
  }, "\u26A0\uFE0F"), error), result && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      margin: '14px 0 10px',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'var(--ink-muted)'
    }
  }, /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--blue-600)'
    }
  }, tauschCount), " direkte Tauschm\xF6glichkeiten,", ' ', /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--amber-600)'
    }
  }, abgabeCount), " Abgabe-/\xDCbernahmem\xF6glichkeiten", /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 4
    }
  }, "in ", label)), /*#__PURE__*/React.createElement("div", {
    style: {
      marginLeft: 'auto',
      display: 'flex',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: 'chip' + (nurChancen ? ' active' : ''),
    onClick: function () {
      setNurChancen(true);
    }
  }, "Nur Tauschm\xF6glichkeiten"), /*#__PURE__*/React.createElement("button", {
    className: 'chip' + (!nurChancen ? ' active' : ''),
    onClick: function () {
      setNurChancen(false);
    }
  }, "Alle Tage"))), sichtbar.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "empty-state"
  }, /*#__PURE__*/React.createElement("span", {
    className: "glyph"
  }, "\uD83D\uDD01"), "Keine Tauschm\xF6glichkeiten im gew\xE4hlten Zeitraum gefunden.") : /*#__PURE__*/React.createElement("div", {
    className: "card",
    style: {
      padding: 0,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      overflowX: 'auto'
    }
  }, /*#__PURE__*/React.createElement("table", {
    className: "tbl"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Datum"), /*#__PURE__*/React.createElement("th", null, "Tag"), /*#__PURE__*/React.createElement("th", null, result.ma1.kuerzel, " \u2014 ", result.ma1.name), /*#__PURE__*/React.createElement("th", null, result.ma2.kuerzel, " \u2014 ", result.ma2.name), /*#__PURE__*/React.createElement("th", null, "Status"))), /*#__PURE__*/React.createElement("tbody", null, sichtbar.map(function (t) {
    var isWE = t.wochentag === 'Sa' || t.wochentag === 'So';
    var info = t.__tausch;
    var rowBg = info.type === 'tausch' ? 'var(--blue-50,#eff6ff)' : info.type === 'abgabe' ? 'var(--amber-bg-soft)' : undefined;
    var parts = t.datum.split('-');
    var datumFmt = parts[2] + '.' + parts[1] + '.' + parts[0];
    return /*#__PURE__*/React.createElement("tr", {
      key: t.datum,
      style: {
        background: rowBg
      }
    }, /*#__PURE__*/React.createElement("td", {
      style: {
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap'
      }
    }, datumFmt), /*#__PURE__*/React.createElement("td", {
      style: {
        fontWeight: isWE ? 600 : 400,
        color: isWE ? 'var(--amber-600)' : 'var(--ink-muted)',
        whiteSpace: 'nowrap'
      }
    }, t.wochentag), /*#__PURE__*/React.createElement("td", null, dienstLabel(t.ma1)), /*#__PURE__*/React.createElement("td", null, dienstLabel(t.ma2)), /*#__PURE__*/React.createElement("td", null, statusBadge(info)));
  })))))), !loading && !result && ma1 && ma2 && ma1 !== ma2 && !error && /*#__PURE__*/React.createElement("div", {
    className: "empty-state"
  }, /*#__PURE__*/React.createElement("span", {
    className: "glyph"
  }, "\uD83D\uDD01"), "Keine Daten f\xFCr diesen Zeitraum."), !loading && !result && (!ma1 || !ma2 || ma1 === ma2) && !error && /*#__PURE__*/React.createElement("div", {
    className: "empty-state"
  }, /*#__PURE__*/React.createElement("span", {
    className: "glyph"
  }, "\uD83D\uDC65"), "Zwei Personen w\xE4hlen um Tauschm\xF6glichkeiten zu sehen."));
}
window.TabAnalysen = TabAnalysen;