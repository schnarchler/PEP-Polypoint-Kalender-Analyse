// Shared components for Dienstplanung

function fmtDatum(s) {
  if (!s) return '–';
  var p = s.split('-');
  if (p.length !== 3) return s;
  return p[2] + '.' + p[1] + '.' + p[0];
}

// ── Toast / Snackbar ────────────────────────────────────────────────────
const ToastContext = React.createContext({
  show: () => {}
});
function ToastProvider({
  children
}) {
  const [t, setT] = React.useState(null);
  const tid = React.useRef(0);
  const show = React.useCallback((msg, kind = 'success') => {
    tid.current += 1;
    const id = tid.current;
    setT({
      msg,
      kind,
      id
    });
    setTimeout(() => setT(cur => cur && cur.id === id ? null : cur), 3000);
  }, []);
  return /*#__PURE__*/React.createElement(ToastContext.Provider, {
    value: {
      show
    }
  }, children, t && /*#__PURE__*/React.createElement("div", {
    className: `toast ${t.kind === 'error' ? 'error' : t.kind === 'info' ? 'info' : ''}`
  }, /*#__PURE__*/React.createElement("span", null, t.kind === 'error' ? '❌' : t.kind === 'info' ? 'ℹ️' : '✅'), /*#__PURE__*/React.createElement("span", null, t.msg)));
}
const useToast = () => React.useContext(ToastContext);

// ── Hint box ────────────────────────────────────────────────────────────
function Hint({
  glyph = '💡',
  tone = '',
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: `hint-box ${tone}`
  }, /*#__PURE__*/React.createElement("span", {
    className: "glyph"
  }, glyph), /*#__PURE__*/React.createElement("div", null, children));
}

// ── Help tip (? button with tooltip) ────────────────────────────────────
function HelpTip({
  text
}) {
  const [open, setOpen] = React.useState(false);
  return /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'relative',
      display: 'inline-block',
      verticalAlign: 'middle',
      marginLeft: 5
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "help-tip-btn",
    onClick: function (e) {
      e.stopPropagation();
      setOpen(function (v) {
        return !v;
      });
    },
    title: text
  }, "?"), open && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 199
    },
    onClick: function () {
      setOpen(false);
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "help-tip-pop"
  }, text)));
}

// ── Card ────────────────────────────────────────────────────────────────
function Card({
  step,
  title,
  subtitle,
  right,
  children
}) {
  return /*#__PURE__*/React.createElement("section", {
    className: "card"
  }, (title || step) && /*#__PURE__*/React.createElement("header", {
    className: "card-head"
  }, step != null && /*#__PURE__*/React.createElement("span", {
    className: "step-num"
  }, step), title && /*#__PURE__*/React.createElement("h2", null, title), right && /*#__PURE__*/React.createElement("div", {
    className: "card-sub"
  }, right)), subtitle && /*#__PURE__*/React.createElement("p", {
    className: "muted small",
    style: {
      marginTop: -8,
      marginBottom: 14
    }
  }, subtitle), children);
}

// ── Log viewer (terminal) ───────────────────────────────────────────────
function classify(line) {
  if (/✅|ABGESCHLOSSEN/.test(line)) return 'l-ok';
  if (/❌|FEHLER|Error/.test(line)) return 'l-err';
  if (/^▶|═══/.test(line)) return 'l-step';
  if (/^\s{2}/.test(line)) return 'l-dim';
  return 'l-info';
}
function Log({
  lines,
  running,
  title = 'Ausgabe'
}) {
  const ref = React.useRef(null);
  const [showFull, setShowFull] = React.useState(true);
  React.useEffect(function () {
    if (running) setShowFull(true);
  }, [running]);
  React.useEffect(() => {
    if (ref.current && showFull) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines, showFull]);
  const status = running ? 'running' : lines && lines.length ? 'done' : '';
  const isDone = !running && lines && lines.length > 0;
  const keyLines = lines ? lines.filter(function (l) {
    return /✅|❌|ABGESCHLOSSEN|FEHLER/.test(l);
  }) : [];
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "log-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "section-label"
  }, title), /*#__PURE__*/React.createElement("span", {
    className: "spacer"
  }), isDone && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost btn-sm",
    style: {
      fontSize: '0.78rem'
    },
    onClick: function () {
      setShowFull(function (v) {
        return !v;
      });
    }
  }, showFull ? 'Einfache Ansicht' : 'Details anzeigen'), /*#__PURE__*/React.createElement("span", {
    className: `status ${status}`
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), running ? 'Läuft…' : lines && lines.length ? 'Fertig' : 'Bereit')), isDone && !showFull ? /*#__PURE__*/React.createElement("div", {
    className: "log-simple"
  }, keyLines.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "log-simple-row l-dim"
  }, "Keine Ergebnismeldungen vorhanden.") : keyLines.map(function (l, i) {
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      className: 'log-simple-row ' + classify(l)
    }, l);
  })) : /*#__PURE__*/React.createElement("pre", {
    ref: ref,
    className: "log",
    "aria-live": "polite"
  }, !lines || lines.length === 0 ? /*#__PURE__*/React.createElement("span", {
    className: "l-dim"
  }, "$ Bereit. Klicke einen Button, um zu starten.") : lines.map((l, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: classify(l)
  }, l || ' ')), running && /*#__PURE__*/React.createElement("span", {
    className: "cursor"
  })));
}

// Hook: echte SSE-Verbindung zu /stream/<task_id>
function useStreamingLog() {
  const [lines, setLines] = React.useState([]);
  const [running, setRunning] = React.useState(false);
  const esRef = React.useRef(null);
  const start = (taskId, onDone) => {
    const collected = [];
    setLines([]);
    setRunning(true);
    const es = new EventSource('/stream/' + taskId);
    esRef.current = es;
    es.onmessage = e => {
      if (e.data) {
        collected.push(e.data);
        setLines(cur => [...cur, e.data]);
      }
    };
    es.addEventListener('done', () => {
      es.close();
      setRunning(false);
      if (onDone) onDone(collected);
    });
    es.onerror = () => {
      es.close();
      setRunning(false);
    };
  };
  const reset = () => setLines([]);
  React.useEffect(() => () => {
    esRef.current && esRef.current.close();
  }, []);
  return {
    lines,
    running,
    start,
    reset
  };
}

// ── Header / brand + global context bar ────────────────────────────────
function AppHeader({
  monat,
  jahr,
  onMonat,
  onJahr,
  lastImport,
  onVerlauf,
  onMehr,
  monate,
  mobileTitle,
  mobileSub,
  onBrand
}) {
  const jahre = [];
  for (let y = new Date().getFullYear() + 1; y >= 2020; y--) jahre.push(y);
  const brandSub = (window.SERVER_CONTEXT || {}).brand_untertitel || ''; // konfigurierbar unter Einstellungen → Allgemein
  return /*#__PURE__*/React.createElement("header", {
    className: "app-header"
  }, /*#__PURE__*/React.createElement("div", {
    className: "brand",
    style: onBrand ? {
      cursor: 'pointer'
    } : {},
    onClick: onBrand,
    role: onBrand ? 'button' : undefined,
    tabIndex: onBrand ? 0 : undefined
  }, /*#__PURE__*/React.createElement("span", {
    className: "brand-mark"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "17",
    height: "17",
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
  }))), /*#__PURE__*/React.createElement("span", {
    className: "brand-name"
  }, "Dienstplanung"), brandSub && /*#__PURE__*/React.createElement("span", {
    className: "brand-sub"
  }, brandSub)), /*#__PURE__*/React.createElement("div", {
    className: "mobile-page-title"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mobile-page-name"
  }, mobileTitle), mobileSub && /*#__PURE__*/React.createElement("span", {
    className: "mobile-page-sub"
  }, mobileSub)), /*#__PURE__*/React.createElement("div", {
    className: "header-period"
  }, /*#__PURE__*/React.createElement("select", {
    className: "select select-monat",
    value: monat,
    onChange: function (e) {
      onMonat(e.target.value);
    }
  }, monate.map(function (m) {
    return /*#__PURE__*/React.createElement("option", {
      key: m
    }, m);
  })), /*#__PURE__*/React.createElement("select", {
    className: "select",
    value: jahr,
    onChange: function (e) {
      onJahr(+e.target.value);
    }
  }, jahre.map(function (y) {
    return /*#__PURE__*/React.createElement("option", {
      key: y,
      value: y
    }, y);
  }))), /*#__PURE__*/React.createElement("span", {
    className: "header-spacer"
  }), /*#__PURE__*/React.createElement("div", {
    className: "header-meta",
    title: "Letzter erfolgreicher Import"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), "Letzter Import ", /*#__PURE__*/React.createElement("strong", null, lastImport)), onVerlauf && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost btn-sm header-btn-desktop",
    onClick: onVerlauf,
    title: "Verlauf \xF6ffnen"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.9",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "9"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 7.5V12l3 1.8"
  })), "Verlauf"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost btn-sm header-btn-desktop",
    title: "Programm beenden",
    onClick: function () {
      if (!window.confirm('Programm wirklich beenden?\nDie Dienstplanung-Anwendung wird geschlossen.')) return;
      fetch('/api/shutdown', {
        method: 'POST'
      }).catch(function () {});
      document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#6b7280;flex-direction:column;gap:12px"><div style="font-size:32px">⏻</div><div>Programm wurde beendet. Dieses Fenster kann geschlossen werden.</div></div>';
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.9",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12 3v9"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M6.6 6.6a8 8 0 1010.8 0"
  })), "Beenden"), onMehr && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost btn-sm header-btn-mobile",
    onClick: onMehr,
    title: "Mehr"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "20",
    height: "20",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.9",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "5",
    r: "1.3",
    fill: "currentColor",
    stroke: "none"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "1.3",
    fill: "currentColor",
    stroke: "none"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "19",
    r: "1.3",
    fill: "currentColor",
    stroke: "none"
  }))));
}

// ── Tab bar ─────────────────────────────────────────────────────────────
function TabBar({
  tabs,
  active,
  onChange
}) {
  return /*#__PURE__*/React.createElement("nav", {
    className: "tab-bar"
  }, tabs.map(t => /*#__PURE__*/React.createElement("button", {
    key: t.id,
    className: `tab ${active === t.id ? 'active' : ''}`,
    onClick: () => onChange(t.id)
  }, /*#__PURE__*/React.createElement("span", {
    className: "tab-glyph"
  }, t.icon ? React.createElement(t.icon) : t.glyph), t.label, t.badge ? /*#__PURE__*/React.createElement("span", {
    className: "tab-badge"
  }, t.badge) : null)));
}

// ── Page head ──────────────────────────────────────────────────────────
function PageHead({
  label,
  glyph,
  title,
  subtitle,
  actions
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "page-head"
  }, /*#__PURE__*/React.createElement("div", null, label && /*#__PURE__*/React.createElement("div", {
    className: "page-label"
  }, label), /*#__PURE__*/React.createElement("h1", null, title), subtitle && /*#__PURE__*/React.createElement("p", {
    className: "subtitle"
  }, subtitle)), actions && /*#__PURE__*/React.createElement("div", {
    className: "page-head-actions"
  }, actions));
}

// ── Modal / Drawer primitives ──────────────────────────────────────────
function Modal({
  title,
  glyph = '',
  onClose,
  children,
  footer
}) {
  React.useEffect(() => {
    const esc = e => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return /*#__PURE__*/React.createElement("div", {
    className: "modal-overlay",
    onClick: onClose
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal",
    onClick: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement("header", {
    className: "modal-head"
  }, glyph && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '1.1rem'
    }
  }, glyph), /*#__PURE__*/React.createElement("h3", null, title), /*#__PURE__*/React.createElement("button", {
    className: "close",
    onClick: onClose,
    "aria-label": "Schliessen"
  }, "\u2715")), /*#__PURE__*/React.createElement("div", {
    className: "modal-body"
  }, children), footer && /*#__PURE__*/React.createElement("footer", {
    className: "modal-foot"
  }, footer)));
}
function Drawer({
  title,
  glyph = '',
  onClose,
  children
}) {
  React.useEffect(() => {
    const esc = e => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "drawer-overlay",
    onClick: onClose
  }), /*#__PURE__*/React.createElement("aside", {
    className: "drawer"
  }, /*#__PURE__*/React.createElement("header", {
    className: "drawer-head"
  }, glyph && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '1.1rem'
    }
  }, glyph), /*#__PURE__*/React.createElement("h3", null, title), /*#__PURE__*/React.createElement("button", {
    className: "close",
    onClick: onClose,
    "aria-label": "Schliessen"
  }, "\u2715")), /*#__PURE__*/React.createElement("div", {
    className: "drawer-body"
  }, children)));
}

// ── Sparkline (6-month shift count) ────────────────────────────────────
function Sparkline({
  values,
  height = 16
}) {
  if (!values || values.length === 0) return /*#__PURE__*/React.createElement("span", {
    className: "spark",
    style: {
      height
    }
  });
  const max = Math.max(1, ...values);
  return /*#__PURE__*/React.createElement("span", {
    className: "spark",
    style: {
      height
    }
  }, values.map((v, i) => {
    const isLast = i === values.length - 1;
    const isZero = v === 0;
    const h = isZero ? 2 : Math.max(2, v / max * height);
    return /*#__PURE__*/React.createElement("span", {
      key: i,
      className: `bar ${isLast ? 'last' : ''} ${isZero ? 'zero' : ''}`,
      style: {
        height: h + 'px'
      },
      title: `${v} Schichten`
    });
  }));
}

// ── Year heatmap (12 months) ───────────────────────────────────────────
function YearHeatmap({
  data,
  currentMonatKurz,
  onPick,
  jahr
}) {
  if (!data || Object.keys(data).length === 0) {
    return /*#__PURE__*/React.createElement("div", {
      className: "muted small",
      style: {
        padding: '20px 0'
      }
    }, "Keine Daten vorhanden.");
  }
  const MONATE_KURZ = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonthIdx = today.getMonth();
  const displayedYear = parseInt(jahr, 10) || currentYear;
  const items = MONATE_KURZ.map((kurz, idx) => {
    const entry = data[kurz] || {};
    const isPast = displayedYear < currentYear || displayedYear === currentYear && idx < currentMonthIdx;
    return {
      monat: kurz,
      status: entry.status || 'leer',
      ma: entry.ma || 0,
      schichten: entry.schichten || 0,
      isPast
    };
  });
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "heatmap"
  }, items.map(m => /*#__PURE__*/React.createElement("button", {
    key: m.monat,
    className: `hm-cell ${m.status} ${m.monat === currentMonatKurz ? 'current' : ''} ${m.isPast ? 'past' : ''}`,
    onClick: () => onPick && onPick(m),
    title: m.status === 'voll' ? `${m.monat}: importiert + versendet` : m.status === 'teilweise' ? `${m.monat}: importiert — noch nicht versendet` : m.status === 'pending' ? `${m.monat}: Änderungen seit letztem Versand` : `${m.monat}: noch nicht importiert`
  }, /*#__PURE__*/React.createElement("span", {
    className: "ms"
  }, m.monat), /*#__PURE__*/React.createElement("span", {
    className: "sn"
  }, m.schichten > 0 ? `${m.schichten}` : '—'), m.status === 'pending' && /*#__PURE__*/React.createElement("span", {
    className: "badge-dot"
  })))), /*#__PURE__*/React.createElement("div", {
    className: "hm-legend"
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    className: "sw voll"
  }), " Versendet"), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    className: "sw teilweise"
  }), " Importiert"), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    className: "sw pending"
  }), " \xC4nderungen offen"), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    className: "sw leer"
  }), " Leer")));
}

// ── Diff Calendar Strip (für „nur geänderte Pläne") ────────────────────
// monat: 'März', jahr: 2026, diffs: [{tag, alt, neu}]
function DiffCalendar({
  monat,
  jahr,
  diffs
}) {
  const CTX = window.SERVER_CONTEXT || {};
  const monate = CTX.monate || [];
  const monatIdx = monate.indexOf(monat);
  if (monatIdx < 0) return null;
  const firstDay = new Date(jahr, monatIdx, 1).getDay();
  const daysInMonth = new Date(jahr, monatIdx + 1, 0).getDate();
  const offsetMon = (firstDay + 6) % 7;
  const diffByTag = Object.fromEntries((diffs || []).map(d => [d.tag, d]));
  const cells = [];
  const dowLabels = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  for (let i = 0; i < 7; i++) cells.push({
    dow: dowLabels[i]
  });
  for (let i = 0; i < offsetMon; i++) cells.push({
    blank: true
  });
  for (let day = 1; day <= daysInMonth; day++) {
    const d = diffByTag[day];
    cells.push({
      day,
      diff: d
    });
  }
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "cal-strip"
  }, cells.map((c, i) => {
    if (c.dow) return /*#__PURE__*/React.createElement("div", {
      key: 'h' + i,
      className: "cal-cell dow-label"
    }, c.dow);
    if (c.blank) return /*#__PURE__*/React.createElement("div", {
      key: 'b' + i,
      className: "cal-cell",
      style: {
        background: 'transparent',
        border: 'none'
      }
    });
    const d = c.diff;
    let cls = '',
      lbl = '·';
    if (d) {
      if (d.alt == null) {
        cls = 'added';
        lbl = d.neu;
      } else if (d.neu === 'frei' || d.neu == null) {
        cls = 'removed';
        lbl = d.alt;
      } else {
        cls = 'changed';
        lbl = `${d.alt}→${d.neu}`;
      }
    }
    return /*#__PURE__*/React.createElement("div", {
      key: c.day,
      className: `cal-cell ${cls}`
    }, /*#__PURE__*/React.createElement("div", {
      className: "day"
    }, c.day), /*#__PURE__*/React.createElement("div", {
      className: "lbl"
    }, lbl));
  })), /*#__PURE__*/React.createElement("div", {
    className: "diff-legend"
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    className: "sw added"
  }), " hinzugef\xFCgt"), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    className: "sw removed"
  }), " entfernt"), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    className: "sw changed"
  }), " ge\xE4ndert")));
}

// Export to window for cross-file use
Object.assign(window, {
  ToastContext,
  ToastProvider,
  useToast,
  Hint,
  HelpTip,
  Card,
  Log,
  useStreamingLog,
  AppHeader,
  TabBar,
  PageHead,
  Modal,
  Drawer,
  Sparkline,
  YearHeatmap,
  DiffCalendar,
  classify
});