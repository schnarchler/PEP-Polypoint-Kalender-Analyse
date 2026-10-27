// Main App — top-level state, tab routing, tweaks panel
const CTX = window.SERVER_CONTEXT || {};

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "layout": "sidebar",
  "density": "compact",
  "accentColor": "#1e3a8a"
}/*EDITMODE-END*/;

// SVG icon components for sidebar nav
const Icon = {
  Dashboard:     () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.6"/><rect x="3" y="14" width="7" height="7" rx="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.6"/></svg>,
  Monatslauf:    () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4.5l13 7.5-13 7.5z"/></svg>,
  Mail:          () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 7l8.5 6 8.5-6"/></svg>,
  Mitarbeiter:   () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.3"/><path d="M3.3 19.2c.6-3.1 3-4.7 5.7-4.7s5.1 1.6 5.7 4.7"/><path d="M16 5.3a3.3 3.3 0 010 5.9"/><path d="M17.2 14.7c2 .5 3.4 2 3.8 4.5"/></svg>,
  Analysen:      () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 20h18"/><path d="M6 20v-7"/><path d="M12 20V5"/><path d="M18 20v-10"/></svg>,
  Einstellungen: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 21v-6M4 11V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 15h6M9 8h6M17 16h6"/></svg>,
};

function App() {
  // Initialer Tab aus URL-Hash (#mail, #monatslauf, …) — erlaubt Deep-Links
  const [tab, setTab] = React.useState(function() {
    const h = (window.location.hash || '').replace('#', '');
    const valid = ['dashboard', 'monatslauf', 'mail', 'mitarbeiter', 'analysen', 'einstellungen'];
    return valid.indexOf(h) >= 0 ? h : 'dashboard';
  });
  const [monat, setMonat] = React.useState(CTX.aktueller_monat || (CTX.monate && CTX.monate[0]) || 'Januar');
  const [jahr, setJahr] = React.useState(CTX.aktuelles_jahr || new Date().getFullYear());
  const [showVerlauf, setShowVerlauf] = React.useState(false);
  const [sheetOffen, setSheetOffen] = React.useState(false);
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  React.useEffect(function() {
    function onNavigateMa(e) {
      window._pendingOpenMa = e.detail;
      setTab('mitarbeiter');
    }
    function onNavigateTab(e) {
      if (typeof e.detail === 'string') setTab(e.detail);
    }
    window.addEventListener('navigate-to-ma', onNavigateMa);
    window.addEventListener('navigate-tab', onNavigateTab);
    return function() {
      window.removeEventListener('navigate-to-ma', onNavigateMa);
      window.removeEventListener('navigate-tab', onNavigateTab);
    };
  }, []);

  // Apply tweaks live
  React.useEffect(function() {
    document.documentElement.style.setProperty('--blue-500', tweaks.accentColor);
    document.documentElement.style.setProperty('--blue-600', shade(tweaks.accentColor, -0.18));
    document.documentElement.style.setProperty('--blue-100', shade(tweaks.accentColor, 0.92));
    document.documentElement.style.setProperty('--blue-150', shade(tweaks.accentColor, 0.85));
    document.body.classList.toggle('density-compact', tweaks.density === 'compact');
  }, [tweaks]);

  const tabs = [
    { id: 'dashboard',     icon: Icon.Dashboard,     label: 'Dashboard' },
    { id: 'monatslauf',    icon: Icon.Monatslauf,    label: 'Import' },
    { id: 'mail',          icon: Icon.Mail,          label: 'Versand' },
    { id: 'mitarbeiter',   icon: Icon.Mitarbeiter,   label: 'Mitarbeitende' },
    { id: 'analysen',      icon: Icon.Analysen,      label: 'Analysen' },
    { id: 'einstellungen', icon: Icon.Einstellungen, label: 'Einstellungen' },
  ];

  const monate = CTX.monate || [];
  const lastImport = CTX.letzter_import || '–';

  const TAB_INFO = {
    dashboard:     { title: 'Dashboard',      sub: 'Übersicht & Status' },
    monatslauf:    { title: 'Import',          sub: monat + ' · ' + jahr },
    mail:          { title: 'Versand',         sub: monat + ' · ' + jahr },
    mitarbeiter:   { title: 'Team',            sub: 'Mitarbeitende' },
    analysen:      { title: 'Analysen',        sub: 'Auswertungen' },
    einstellungen: { title: 'Einstellungen',   sub: 'Konfiguration' },
  };
  var currentInfo = TAB_INFO[tab] || { title: 'Dienstplanung', sub: null };

  return (
    <div className={'app ' + (tweaks.layout === 'sidebar' ? 'layout-sidebar' : '')}>
      <AppHeader
        monat={monat} jahr={jahr}
        onMonat={setMonat} onJahr={setJahr}
        lastImport={lastImport}
        monate={monate}
        onVerlauf={function() { setShowVerlauf(true); }}
        onMehr={function() { setSheetOffen(true); }}
        mobileTitle={currentInfo.title}
        mobileSub={currentInfo.sub}
        onBrand={function() { setTab('dashboard'); }}
      />
      {tweaks.layout === 'sidebar' ? (
        <aside className="sidebar">
          <div className="sidebar-label">Bereiche</div>
          <TabBar tabs={tabs} active={tab} onChange={setTab} />
          <SidebarFooter />
        </aside>
      ) : (
        <TabBar tabs={tabs} active={tab} onChange={setTab} />
      )}
      <main className="app-main">
        {tab === 'dashboard'     && <TabDashboard     monat={monat} jahr={jahr} onMonat={setMonat} onTab={setTab} />}
        {/* Streaming-Tabs bleiben immer gemountet, damit laufende Tasks und Logs erhalten bleiben */}
        <div style={{ display: tab === 'monatslauf'    ? '' : 'none' }}><TabMonatslauf    monat={monat} jahr={jahr} onMonat={setMonat} onJahr={setJahr} /></div>
        <div style={{ display: tab === 'mail'          ? '' : 'none' }}><TabMail          monat={monat} jahr={jahr} /></div>
        {tab === 'mitarbeiter'   && <TabMitarbeiter monat={monat} jahr={jahr} />}
        {tab === 'analysen'      && <TabAnalysen      monat={monat} jahr={jahr} />}
        {tab === 'einstellungen' && <TabEinstellungen />}
      </main>

      <MobileNav active={tab} onChange={setTab} />
      {sheetOffen && (
        <MobileSheet
          active={tab}
          onNavigate={setTab}
          onClose={function() { setSheetOffen(false); }}
          monat={monat} jahr={jahr}
          monate={monate}
          onMonat={setMonat} onJahr={setJahr}
        />
      )}

      <TweaksPanel>
        <TweakSection label="Layout">
          <TweakRadio
            label="Navigation"
            value={tweaks.layout}
            options={[
              { value: 'topbar', label: 'Oben' },
              { value: 'sidebar', label: 'Seite' },
            ]}
            onChange={function(v) { setTweak('layout', v); }}
          />
          <TweakRadio
            label="Dichte"
            value={tweaks.density}
            options={[
              { value: 'comfortable', label: 'Normal' },
              { value: 'compact', label: 'Kompakt' },
            ]}
            onChange={function(v) { setTweak('density', v); }}
          />
        </TweakSection>
        <TweakSection label="Akzentfarbe">
          <TweakColor
            label="Primär"
            value={tweaks.accentColor}
            options={['#1e3a8a', '#3a5bcc', '#2c3e50', '#16a34a', '#e67e22', '#c2185b']}
            onChange={function(v) { setTweak('accentColor', v); }}
          />
        </TweakSection>
      </TweaksPanel>

      {showVerlauf && (
        <Drawer glyph="🕘" title="Verlauf" onClose={function() { setShowVerlauf(false); }}>
          <ActivityList />
        </Drawer>
      )}

    </div>
  );
}

// helper: tint/shade a hex color (factor -1..1, negative = darker)
function shade(hex, factor) {
  const c = (hex || '#000000').replace('#', '');
  const r = parseInt(c.slice(0, 2), 16) || 0;
  const g = parseInt(c.slice(2, 4), 16) || 0;
  const b = parseInt(c.slice(4, 6), 16) || 0;
  const mix = function(v) { return Math.round(factor < 0 ? v * (1 + factor) : v + (255 - v) * factor); };
  const hh = function(v) { return Math.max(0, Math.min(255, mix(v))).toString(16).padStart(2, '0'); };
  return '#' + hh(r) + hh(g) + hh(b);
}


function MobileNav({ active, onChange }) {
  var TABS = [
    { id: 'dashboard',   icon: Icon.Dashboard,   label: 'Start' },
    { id: 'monatslauf',  icon: Icon.Monatslauf,  label: 'Import' },
    { id: 'mail',        icon: Icon.Mail,         label: 'Versand' },
    { id: 'mitarbeiter', icon: Icon.Mitarbeiter,  label: 'Team' },
    { id: 'analysen',    icon: Icon.Analysen,     label: 'Analysen' },
  ];
  return (
    <nav className="mobile-nav">
      {TABS.map(function(t) {
        return (
          <button
            key={t.id}
            className={'mobile-nav-btn' + (active === t.id ? ' active' : '')}
            onClick={function() { onChange(t.id); }}
          >
            {React.createElement(t.icon)}
            <span className="mobile-nav-label">{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function MobileSheet({ active, onNavigate, onClose, monat, jahr, monate, onMonat, onJahr }) {
  var TILES = [
    { id: 'einstellungen', label: 'Einstellungen',  color: 'blue',  icon: Icon.Einstellungen },
  ];
  function handleBeenden() {
    onClose();
    if (!window.confirm('Programm wirklich beenden?\nDie Dienstplanung-Anwendung wird geschlossen.')) return;
    fetch('/api/shutdown', { method: 'POST' }).catch(function() {});
    document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#6b7280;flex-direction:column;gap:12px"><div style="font-size:32px">⏻</div><div>Programm wurde beendet. Dieses Fenster kann geschlossen werden.</div></div>';
  }
  return (
    <React.Fragment>
      <div className="mobile-sheet-overlay" onClick={onClose} />
      <div className="mobile-sheet" onClick={function(e) { e.stopPropagation(); }}>
        <div className="mobile-sheet-handle" />
        {/* Monat/Jahr-Auswahl für Mobile */}
        <div className="mobile-sheet-period">
          <select className="select" value={monat} onChange={function(e) { onMonat(e.target.value); }}>
            {(monate || []).map(function(m) { return <option key={m}>{m}</option>; })}
          </select>
          <select className="select" value={jahr} onChange={function(e) { onJahr(+e.target.value); }}>
            {[new Date().getFullYear()+1, new Date().getFullYear(), new Date().getFullYear()-1, new Date().getFullYear()-2].map(function(y) { return <option key={y} value={y}>{y}</option>; })}
          </select>
        </div>
        <div className="mobile-sheet-tiles">
          {TILES.map(function(tile) {
            return (
              <button
                key={tile.id}
                className={'mobile-sheet-tile ' + tile.color + (active === tile.id ? ' active' : '')}
                onClick={function() { onNavigate(tile.id); onClose(); }}
              >
                <span className="mobile-sheet-tile-icon">{React.createElement(tile.icon)}</span>
                {tile.label}
              </button>
            );
          })}
          <button className="mobile-sheet-tile red" onClick={handleBeenden}>
            <span className="mobile-sheet-tile-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v9"/><path d="M6.6 6.6a8 8 0 1010.8 0"/>
              </svg>
            </span>
            Beenden
          </button>
        </div>
        <div className="mobile-sheet-section-label">Verlauf</div>
        <div className="mobile-sheet-verlauf">
          <ActivityList />
        </div>
      </div>
    </React.Fragment>
  );
}

function SidebarFooter() {
  return (
    <div className="sidebar-footer">
      <div className="sf-status">
        <span className="dot" />
        Datenbank verbunden
      </div>
    </div>
  );
}

// "Bereiche" section label above the sidebar nav
function SidebarLabel({ children }) {
  return <div className="sidebar-label">{children}</div>;
}

// ── Activity list (in Drawer) ───────────────────────────────────────────
function ActivityList() {
  const [verlauf, setVerlauf] = React.useState([]);
  const ICONS = {
    monatslauf: '▶',
    backup:     '💾',
    analyse:    '📊',
    mail:       '📧',
    merge:      '🔗',
    icons:      '🎨',
    import:     '📥',
    export:     '📤',
  };

  React.useEffect(function() {
    fetch('/api/verlauf')
      .then(function(r) { return r.json(); })
      .then(function(data) { if (Array.isArray(data)) setVerlauf(data); })
      .catch(function() {});
  }, []);

  if (verlauf.length === 0) {
    return (
      <div className="empty-state" style={{ padding: 32 }}>
        <span className="glyph">🕘</span>
        Kein Verlauf vorhanden.
      </div>
    );
  }

  return (
    <div>
      {verlauf.map(function(v, i) {
        return (
          <div className="verlauf-item" key={i}>
            <div className={'icon ' + (v.status === 'ok' ? 'ok' : v.status === 'warn' ? 'warn' : 'info')}>
              {ICONS[v.kind] || '•'}
            </div>
            <div>
              <div className="titel">{v.titel}</div>
              <div className="detail">{v.detail}</div>
              <div className="ts">{v.ts}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Bootstrap React ─────────────────────────────────────────────────────
const rootEl = document.getElementById('root');
const root = ReactDOM.createRoot(rootEl);
root.render(
  <ToastProvider>
    <App />
  </ToastProvider>
);

window.App = App;
