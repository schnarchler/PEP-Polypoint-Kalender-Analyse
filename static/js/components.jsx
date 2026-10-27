// Shared components for Dienstplanung

function fmtDatum(s) {
  if (!s) return '–';
  var p = s.split('-');
  if (p.length !== 3) return s;
  return p[2] + '.' + p[1] + '.' + p[0];
}

// ── Toast / Snackbar ────────────────────────────────────────────────────
const ToastContext = React.createContext({ show: () => {} });

function ToastProvider({ children }) {
  const [t, setT] = React.useState(null);
  const tid = React.useRef(0);
  const show = React.useCallback((msg, kind = 'success') => {
    tid.current += 1;
    const id = tid.current;
    setT({ msg, kind, id });
    setTimeout(() => setT((cur) => (cur && cur.id === id ? null : cur)), 3000);
  }, []);
  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {t && (
        <div className={`toast ${t.kind === 'error' ? 'error' : t.kind === 'info' ? 'info' : ''}`}>
          <span>{t.kind === 'error' ? '❌' : t.kind === 'info' ? 'ℹ️' : '✅'}</span>
          <span>{t.msg}</span>
        </div>
      )}
    </ToastContext.Provider>
  );
}

const useToast = () => React.useContext(ToastContext);

// ── Hint box ────────────────────────────────────────────────────────────
function Hint({ glyph = '💡', tone = '', children }) {
  return (
    <div className={`hint-box ${tone}`}>
      <span className="glyph">{glyph}</span>
      <div>{children}</div>
    </div>
  );
}

// ── Help tip (? button with tooltip) ────────────────────────────────────
function HelpTip({ text }) {
  const [open, setOpen] = React.useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-block', verticalAlign: 'middle', marginLeft: 5 }}>
      <button
        className="help-tip-btn"
        onClick={function(e) { e.stopPropagation(); setOpen(function(v) { return !v; }); }}
        title={text}
      >?</button>
      {open && (
        <React.Fragment>
          <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={function() { setOpen(false); }} />
          <div className="help-tip-pop">{text}</div>
        </React.Fragment>
      )}
    </span>
  );
}

// ── Card ────────────────────────────────────────────────────────────────
function Card({ step, title, subtitle, right, children }) {
  return (
    <section className="card">
      {(title || step) && (
        <header className="card-head">
          {step != null && <span className="step-num">{step}</span>}
          {title && <h2>{title}</h2>}
          {right && <div className="card-sub">{right}</div>}
        </header>
      )}
      {subtitle && <p className="muted small" style={{ marginTop: -8, marginBottom: 14 }}>{subtitle}</p>}
      {children}
    </section>
  );
}

// ── Log viewer (terminal) ───────────────────────────────────────────────
function classify(line) {
  if (/✅|ABGESCHLOSSEN/.test(line)) return 'l-ok';
  if (/❌|FEHLER|Error/.test(line))   return 'l-err';
  if (/^▶|═══/.test(line))           return 'l-step';
  if (/^\s{2}/.test(line))            return 'l-dim';
  return 'l-info';
}

function Log({ lines, running, title = 'Ausgabe' }) {
  const ref = React.useRef(null);
  const [showFull, setShowFull] = React.useState(true);
  React.useEffect(function() { if (running) setShowFull(true); }, [running]);
  React.useEffect(() => {
    if (ref.current && showFull) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines, showFull]);
  const status = running ? 'running' : (lines && lines.length ? 'done' : '');
  const isDone = !running && lines && lines.length > 0;
  const keyLines = lines ? lines.filter(function(l) { return /✅|❌|ABGESCHLOSSEN|FEHLER/.test(l); }) : [];
  return (
    <div>
      <div className="log-head">
        <span className="section-label">{title}</span>
        <span className="spacer" />
        {isDone && (
          <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.78rem' }}
            onClick={function() { setShowFull(function(v) { return !v; }); }}>
            {showFull ? 'Einfache Ansicht' : 'Details anzeigen'}
          </button>
        )}
        <span className={`status ${status}`}>
          <span className="dot" />
          {running ? 'Läuft…' : (lines && lines.length ? 'Fertig' : 'Bereit')}
        </span>
      </div>
      {isDone && !showFull ? (
        <div className="log-simple">
          {keyLines.length === 0
            ? <div className="log-simple-row l-dim">Keine Ergebnismeldungen vorhanden.</div>
            : keyLines.map(function(l, i) { return <div key={i} className={'log-simple-row ' + classify(l)}>{l}</div>; })}
        </div>
      ) : (
        <pre ref={ref} className="log" aria-live="polite">
          {!lines || lines.length === 0
            ? <span className="l-dim">$ Bereit. Klicke einen Button, um zu starten.</span>
            : lines.map((l, i) => <div key={i} className={classify(l)}>{l || ' '}</div>)}
          {running && <span className="cursor" />}
        </pre>
      )}
    </div>
  );
}

// Hook: echte SSE-Verbindung zu /stream/<task_id>
function useStreamingLog() {
  const [lines, setLines] = React.useState([]);
  const [running, setRunning] = React.useState(false);
  const esRef = React.useRef(null);
  const start = (taskId, onDone) => {
    const collected = [];
    setLines([]); setRunning(true);
    const es = new EventSource('/stream/' + taskId);
    esRef.current = es;
    es.onmessage = (e) => { if (e.data) { collected.push(e.data); setLines(cur => [...cur, e.data]); } };
    es.addEventListener('done', () => { es.close(); setRunning(false); if (onDone) onDone(collected); });
    es.onerror = () => { es.close(); setRunning(false); };
  };
  const reset = () => setLines([]);
  React.useEffect(() => () => { esRef.current && esRef.current.close(); }, []);
  return { lines, running, start, reset };
}

// ── Header / brand + global context bar ────────────────────────────────
function AppHeader({ monat, jahr, onMonat, onJahr, lastImport, onVerlauf, onMehr, monate, mobileTitle, mobileSub, onBrand }) {
  const jahre = [];
  for (let y = new Date().getFullYear() + 1; y >= 2020; y--) jahre.push(y);
  const brandSub = (window.SERVER_CONTEXT || {}).brand_untertitel || ''; // konfigurierbar unter Einstellungen → Allgemein
  return (
    <header className="app-header">
      <div className="brand" style={onBrand ? { cursor: 'pointer' } : {}} onClick={onBrand} role={onBrand ? 'button' : undefined} tabIndex={onBrand ? 0 : undefined}>
        <span className="brand-mark">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/>
            <path d="M3 9h18M8 2.5v4M16 2.5v4"/>
          </svg>
        </span>
        <span className="brand-name">Dienstplanung</span>
        {brandSub && <span className="brand-sub">{brandSub}</span>}
      </div>
      {/* Mobile: Seitentitel statt Period-Selector */}
      <div className="mobile-page-title">
        <span className="mobile-page-name">{mobileTitle}</span>
        {mobileSub && <span className="mobile-page-sub">{mobileSub}</span>}
      </div>
      <div className="header-period">
        <select className="select select-monat" value={monat} onChange={function(e) { onMonat(e.target.value); }}>
          {monate.map(function(m) { return <option key={m}>{m}</option>; })}
        </select>
        <select className="select" value={jahr} onChange={function(e) { onJahr(+e.target.value); }}>
          {jahre.map(function(y) { return <option key={y} value={y}>{y}</option>; })}
        </select>
      </div>
      <span className="header-spacer" />
      <div className="header-meta" title="Letzter erfolgreicher Import">
        <span className="dot" />
        Letzter Import <strong>{lastImport}</strong>
      </div>
      {onVerlauf && (
        <button className="btn btn-ghost btn-sm header-btn-desktop" onClick={onVerlauf} title="Verlauf öffnen">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 1.8"/>
          </svg>
          Verlauf
        </button>
      )}
      <button className="btn btn-ghost btn-sm header-btn-desktop" title="Programm beenden" onClick={function() {
        if (!window.confirm('Programm wirklich beenden?\nDie Dienstplanung-Anwendung wird geschlossen.')) return;
        fetch('/api/shutdown', { method: 'POST' }).catch(function() {});
        document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#6b7280;flex-direction:column;gap:12px"><div style="font-size:32px">⏻</div><div>Programm wurde beendet. Dieses Fenster kann geschlossen werden.</div></div>';
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v9"/><path d="M6.6 6.6a8 8 0 1010.8 0"/>
        </svg>
        Beenden
      </button>
      {onMehr && (
        <button className="btn btn-ghost btn-sm header-btn-mobile" onClick={onMehr} title="Mehr">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="5" r="1.3" fill="currentColor" stroke="none"/>
            <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/>
            <circle cx="12" cy="19" r="1.3" fill="currentColor" stroke="none"/>
          </svg>
        </button>
      )}
    </header>
  );
}

// ── Tab bar ─────────────────────────────────────────────────────────────
function TabBar({ tabs, active, onChange }) {
  return (
    <nav className="tab-bar">
      {tabs.map((t) => (
        <button
          key={t.id}
          className={`tab ${active === t.id ? 'active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          <span className="tab-glyph">
            {t.icon ? React.createElement(t.icon) : t.glyph}
          </span>
          {t.label}
          {t.badge ? <span className="tab-badge">{t.badge}</span> : null}
        </button>
      ))}
    </nav>
  );
}

// ── Page head ──────────────────────────────────────────────────────────
function PageHead({ label, glyph, title, subtitle, actions }) {
  return (
    <div className="page-head">
      <div>
        {label && <div className="page-label">{label}</div>}
        <h1>{title}</h1>
        {subtitle && <p className="subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-head-actions">{actions}</div>}
    </div>
  );
}

// ── Modal / Drawer primitives ──────────────────────────────────────────
function Modal({ title, glyph = '', onClose, children, footer }) {
  React.useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          {glyph && <span style={{ fontSize: '1.1rem' }}>{glyph}</span>}
          <h3>{title}</h3>
          <button className="close" onClick={onClose} aria-label="Schliessen">✕</button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

function Drawer({ title, glyph = '', onClose, children }) {
  React.useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <React.Fragment>
      <div className="drawer-overlay" onClick={onClose} />
      <aside className="drawer">
        <header className="drawer-head">
          {glyph && <span style={{ fontSize: '1.1rem' }}>{glyph}</span>}
          <h3>{title}</h3>
          <button className="close" onClick={onClose} aria-label="Schliessen">✕</button>
        </header>
        <div className="drawer-body">{children}</div>
      </aside>
    </React.Fragment>
  );
}

// ── Sparkline (6-month shift count) ────────────────────────────────────
function Sparkline({ values, height = 16 }) {
  if (!values || values.length === 0) return <span className="spark" style={{ height }} />;
  const max = Math.max(1, ...values);
  return (
    <span className="spark" style={{ height }}>
      {values.map((v, i) => {
        const isLast = i === values.length - 1;
        const isZero = v === 0;
        const h = isZero ? 2 : Math.max(2, (v / max) * height);
        return (
          <span
            key={i}
            className={`bar ${isLast ? 'last' : ''} ${isZero ? 'zero' : ''}`}
            style={{ height: h + 'px' }}
            title={`${v} Schichten`}
          />
        );
      })}
    </span>
  );
}

// ── Year heatmap (12 months) ───────────────────────────────────────────
function YearHeatmap({ data, currentMonatKurz, onPick, jahr }) {
  if (!data || Object.keys(data).length === 0) {
    return <div className="muted small" style={{ padding: '20px 0' }}>Keine Daten vorhanden.</div>;
  }
  const MONATE_KURZ = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonthIdx = today.getMonth();
  const displayedYear = parseInt(jahr, 10) || currentYear;
  const items = MONATE_KURZ.map((kurz, idx) => {
    const entry = data[kurz] || {};
    const isPast = displayedYear < currentYear || (displayedYear === currentYear && idx < currentMonthIdx);
    return { monat: kurz, status: entry.status || 'leer', ma: entry.ma || 0, schichten: entry.schichten || 0, isPast };
  });
  return (
    <React.Fragment>
      <div className="heatmap">
        {items.map((m) => (
          <button
            key={m.monat}
            className={`hm-cell ${m.status} ${m.monat === currentMonatKurz ? 'current' : ''} ${m.isPast ? 'past' : ''}`}
            onClick={() => onPick && onPick(m)}
            title={
              m.status === 'voll' ? `${m.monat}: importiert + versendet` :
              m.status === 'teilweise' ? `${m.monat}: importiert — noch nicht versendet` :
              m.status === 'pending' ? `${m.monat}: Änderungen seit letztem Versand` :
              `${m.monat}: noch nicht importiert`
            }
          >
            <span className="ms">{m.monat}</span>
            <span className="sn">{m.schichten > 0 ? `${m.schichten}` : '—'}</span>
            {m.status === 'pending' && <span className="badge-dot" />}
          </button>
        ))}
      </div>
      <div className="hm-legend">
        <span><span className="sw voll" /> Versendet</span>
        <span><span className="sw teilweise" /> Importiert</span>
        <span><span className="sw pending" /> Änderungen offen</span>
        <span><span className="sw leer" /> Leer</span>
      </div>
    </React.Fragment>
  );
}

// ── Diff Calendar Strip (für „nur geänderte Pläne") ────────────────────
// monat: 'März', jahr: 2026, diffs: [{tag, alt, neu}]
function DiffCalendar({ monat, jahr, diffs }) {
  const CTX = window.SERVER_CONTEXT || {};
  const monate = CTX.monate || [];
  const monatIdx = monate.indexOf(monat);
  if (monatIdx < 0) return null;
  const firstDay = new Date(jahr, monatIdx, 1).getDay();
  const daysInMonth = new Date(jahr, monatIdx + 1, 0).getDate();
  const offsetMon = (firstDay + 6) % 7;
  const diffByTag = Object.fromEntries((diffs || []).map((d) => [d.tag, d]));
  const cells = [];
  const dowLabels = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  for (let i = 0; i < 7; i++) cells.push({ dow: dowLabels[i] });
  for (let i = 0; i < offsetMon; i++) cells.push({ blank: true });
  for (let day = 1; day <= daysInMonth; day++) {
    const d = diffByTag[day];
    cells.push({ day, diff: d });
  }
  return (
    <React.Fragment>
      <div className="cal-strip">
        {cells.map((c, i) => {
          if (c.dow) return <div key={'h' + i} className="cal-cell dow-label">{c.dow}</div>;
          if (c.blank) return <div key={'b' + i} className="cal-cell" style={{ background: 'transparent', border: 'none' }} />;
          const d = c.diff;
          let cls = '', lbl = '·';
          if (d) {
            if (d.alt == null)              { cls = 'added';   lbl = d.neu; }
            else if (d.neu === 'frei' || d.neu == null) { cls = 'removed'; lbl = d.alt; }
            else                            { cls = 'changed'; lbl = `${d.alt}→${d.neu}`; }
          }
          return (
            <div key={c.day} className={`cal-cell ${cls}`}>
              <div className="day">{c.day}</div>
              <div className="lbl">{lbl}</div>
            </div>
          );
        })}
      </div>
      <div className="diff-legend">
        <span><span className="sw added" /> hinzugefügt</span>
        <span><span className="sw removed" /> entfernt</span>
        <span><span className="sw changed" /> geändert</span>
      </div>
    </React.Fragment>
  );
}

// Export to window for cross-file use
Object.assign(window, {
  ToastContext, ToastProvider, useToast,
  Hint, HelpTip, Card, Log, useStreamingLog,
  AppHeader, TabBar, PageHead,
  Modal, Drawer, Sparkline, YearHeatmap, DiffCalendar,
  classify,
});
