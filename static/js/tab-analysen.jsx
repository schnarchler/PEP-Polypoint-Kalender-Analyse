// ── Leseanleitung (wiederverwendbar) ─────────────────────────────────────────

function AnalyseHilfe({ children }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div style={{ marginBottom: 10 }}>
      <button
        onClick={function() { setOpen(function(v) { return !v; }); }}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 11.5, color: 'var(--ink-muted)', fontFamily: 'inherit',
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        Leseanleitung
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div style={{
          marginTop: 8, padding: '10px 13px',
          background: 'var(--bg-page)', border: '1px solid var(--hairline)',
          borderRadius: 7, fontSize: 12, color: 'var(--ink-muted)', lineHeight: 1.65,
        }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── Jahresübersicht ─────────────────────────────────────────────────────────

var MONAT_KURZ = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
var MONAT_NUMS = ['01','02','03','04','05','06','07','08','09','10','11','12'];

function SubJahresuebersicht({ jahr }) {
  const [data,    setData]    = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error,   setError]   = React.useState('');
  const [search,  setSearch]  = React.useState('');
  const [mode,    setMode]    = React.useState('arbeit'); // 'arbeit' | 'nacht' | 'stunden'
  const [sortKey, setSortKey] = React.useState(null);   // 'name' | 'gesamt'
  const [sortDir, setSortDir] = React.useState(1);

  React.useEffect(function() {
    if (!jahr) return;
    setLoading(true); setError(''); setData(null);
    fetch('/api/analyse/jahresuebersicht?year=' + jahr)
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d && d.error) { setError(d.error); } else { setData(d); }
        setLoading(false);
      })
      .catch(function() { setError('Verbindungsfehler'); setLoading(false); });
  }, [jahr]);

  const filtered = React.useMemo(function() {
    if (!data) return [];
    const q = search.toLowerCase();
    if (!q) return data;
    return data.filter(function(ma) {
      return ma.name.toLowerCase().includes(q) || ma.kuerzel.toLowerCase().includes(q);
    });
  }, [data, search]);

  function handleSortJahr(key) {
    if (sortKey === key) {
      setSortDir(function(d) { return d * -1; });
    } else {
      setSortKey(key);
      setSortDir(1);
    }
  }

  const sortedFiltered = React.useMemo(function() {
    if (!sortKey) return filtered;
    return [...filtered].sort(function(a, b) {
      if (sortKey === 'name') return a.name.localeCompare(b.name, 'de') * sortDir;
      var av = mode === 'stunden' ? a.gesamt.total_h
             : mode === 'nacht'   ? a.gesamt.nachtdienste + a.gesamt.we_dienste
             : a.gesamt.arbeitstage;
      var bv = mode === 'stunden' ? b.gesamt.total_h
             : mode === 'nacht'   ? b.gesamt.nachtdienste + b.gesamt.we_dienste
             : b.gesamt.arbeitstage;
      return (av - bv) * sortDir;
    });
  }, [filtered, sortKey, sortDir, mode]);

  const teamGesamt = React.useMemo(function() {
    if (!data) return null;
    const g = { arbeitstage: 0, nachtdienste: 0, we_dienste: 0, total_h: 0, freitage: 0, abwesenheitstage: 0 };
    const monate = {};
    MONAT_NUMS.forEach(function(m) { monate[m] = { arbeitstage: 0, nachtdienste: 0, we_dienste: 0, total_h: 0 }; });
    data.forEach(function(ma) {
      Object.keys(g).forEach(function(k) { g[k] = Math.round((g[k] + (ma.gesamt[k] || 0)) * 10) / 10; });
      MONAT_NUMS.forEach(function(m) {
        const mm = ma.monate[m];
        if (!mm) return;
        monate[m].arbeitstage  += mm.arbeitstage  || 0;
        monate[m].nachtdienste += mm.nachtdienste || 0;
        monate[m].we_dienste   += mm.we_dienste   || 0;
        monate[m].total_h = Math.round((monate[m].total_h + (mm.total_h || 0)) * 10) / 10;
      });
    });
    return { gesamt: g, monate };
  }, [data]);

  function cellVal(ma, mnum) {
    const mm = ma.monate[mnum];
    if (!mm) return null;
    if (mode === 'stunden') return mm.total_h > 0 ? mm.total_h : null;
    if (mode === 'nacht')   return mm.nachtdienste + mm.we_dienste > 0 ? { n: mm.nachtdienste, w: mm.we_dienste } : null;
    return mm.arbeitstage > 0 ? { a: mm.arbeitstage, n: mm.nachtdienste, w: mm.we_dienste } : null;
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
    if (mode === 'nacht')   return mm.nachtdienste + mm.we_dienste > 0 ? { n: mm.nachtdienste, w: mm.we_dienste } : null;
    return mm.arbeitstage > 0 ? { a: mm.arbeitstage } : null;
  }

  function renderCell(val) {
    if (val === null || val === undefined) return React.createElement('span', { style: { color: 'var(--ink-faint)' } }, '–');
    if (mode === 'stunden') return React.createElement('span', { style: { fontWeight: 600 } }, val + ' h');
    if (mode === 'nacht') return React.createElement('span', { style: { color: 'var(--amber-600)', fontWeight: 600, fontSize: 11 } },
      [val.n > 0 ? val.n + 'N' : null, val.w > 0 ? val.w + 'W' : null].filter(Boolean).join(' '));
    return React.createElement('div', null,
      React.createElement('div', { style: { fontWeight: 600, fontSize: 13, lineHeight: 1.2 } }, val.a),
      (val.n > 0 || val.w > 0) && React.createElement('div', {
        style: { fontSize: 9, color: 'var(--amber-600)', lineHeight: 1.3, marginTop: 1 }
      }, [val.n > 0 ? val.n + 'N' : null, val.w > 0 ? val.w + 'W' : null].filter(Boolean).join(' '))
    );
  }

  return (
    <AnalyseShell loading={loading} error={error}>
      {data && (
        <SectionCard title={'Jahresübersicht — ' + jahr}>
          <AnalyseHilfe>
            <strong>Was zeigt diese Tabelle?</strong> Alle 12 Monate auf einen Blick — pro Mitarbeitende und Monat.<br/>
            <strong>Ansichten:</strong> <em>Arbeitstage</em> = Dienste der Kategorie „Arbeit". Kleinere Zahlen darunter: <em>N</em> = Nachtdienste, <em>W</em> = Wochenenddienste.<br/>
            <em>Nacht / WE</em> zeigt nur diese Zahlen. <em>Stunden</em> zeigt die berechnete Arbeitszeit in Stunden.<br/>
            <strong>Farbe:</strong> Gelb = mehr als 35 % der Arbeitstage dieses Monats sind Nacht- oder Wochenenddienste — Hinweis auf hohe Belastung.
          </AnalyseHilfe>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ position: 'absolute', left: 9, pointerEvents: 'none', color: 'var(--ink-faint)' }}>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input type="search" className="input analyse-search-input" value={search}
                onChange={function(e) { setSearch(e.target.value); }}
                placeholder="Name / Kürzel…"
                style={{ paddingLeft: 30, fontSize: '0.85rem', width: 200 }}
              />
            </div>
            <div className="chip-row">
              {[['arbeit','Arbeitstage'],['nacht','Nacht / WE'],['stunden','Stunden']].map(function(p) {
                return (
                  <button key={p[0]} className={'chip' + (mode === p[0] ? ' active' : '')}
                    onClick={function() { setMode(p[0]); }}>
                    {p[1]}
                  </button>
                );
              })}
            </div>
            {search && (
              <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                {filtered.length} von {data.length}
              </span>
            )}
          </div>

          <div className="analyse-table-wrap">
            <table className="analyse-table" style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <th className={'col-sticky sortable' + (sortKey === 'name' ? ' sort-active' : '')}
                    onClick={function() { handleSortJahr('name'); }}>
                    Name <SortArrow active={sortKey === 'name'} dir={sortDir} />
                  </th>
                  {MONAT_KURZ.map(function(m) {
                    return <th key={m} className="num" style={{ minWidth: 42, padding: '6px 4px' }}>{m}</th>;
                  })}
                  <th className={'num sortable' + (sortKey === 'gesamt' ? ' sort-active' : '')}
                    style={{ minWidth: 60 }}
                    onClick={function() { handleSortJahr('gesamt'); }}>
                    Gesamt <SortArrow active={sortKey === 'gesamt'} dir={sortDir} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedFiltered.map(function(ma) {
                  const g = ma.gesamt;
                  return (
                    <tr key={ma.kuerzel}>
                      <td className="col-sticky">
                        <span style={{ fontWeight: 500 }}>{ma.name}</span>
                        <span className="muted small" style={{ marginLeft: 6 }}>{ma.pensum}%</span>
                      </td>
                      {MONAT_NUMS.map(function(mnum) {
                        const val = cellVal(ma, mnum);
                        return (
                          <td key={mnum} className="num"
                            style={{ background: cellBg(ma, mnum), padding: '4px 3px', verticalAlign: 'middle', lineHeight: 1 }}
                          >
                            {renderCell(val)}
                          </td>
                        );
                      })}
                      <td className="num" style={{ fontWeight: 700, background: 'var(--surface-subtle,#f8f9fa)', borderLeft: '1px solid var(--border)' }}>
                        {mode === 'stunden' ? g.total_h + ' h'
                          : mode === 'nacht'
                            ? React.createElement('span', { style: { color: 'var(--amber-600)' } },
                                [g.nachtdienste > 0 ? g.nachtdienste + 'N' : null,
                                 g.we_dienste   > 0 ? g.we_dienste   + 'W' : null].filter(Boolean).join(' ') || '–')
                            : g.arbeitstage}
                      </td>
                    </tr>
                  );
                })}
                {sortedFiltered.length === 0 && (
                  <tr>
                    <td colSpan={14} style={{ textAlign: 'center', color: 'var(--ink-muted)', padding: 24 }}>
                      Keine Ergebnisse.
                    </td>
                  </tr>
                )}
              </tbody>
              {teamGesamt && (
                <tfoot>
                  <tr>
                    <td className="col-sticky" style={{ fontWeight: 700, color: 'var(--ink-muted)', fontSize: 11 }}>Team-Total</td>
                    {MONAT_NUMS.map(function(mnum) {
                      const val = teamCellVal(mnum);
                      const mm  = teamGesamt.monate[mnum];
                      return (
                        <td key={mnum} className="num" style={{ fontSize: 11, background: 'var(--surface-subtle,#f8f9fa)' }}>
                          {val === null
                            ? React.createElement('span', { style: { color: 'var(--ink-faint)' } }, '–')
                            : mode === 'stunden' ? val + ' h'
                            : mode === 'nacht'   ? [val.n > 0 ? val.n + 'N' : null, val.w > 0 ? val.w + 'W' : null].filter(Boolean).join(' ')
                            : mm.arbeitstage}
                        </td>
                      );
                    })}
                    <td className="num" style={{ fontWeight: 700, background: 'var(--surface-subtle,#f8f9fa)', borderLeft: '1px solid var(--border)' }}>
                      {mode === 'stunden' ? teamGesamt.gesamt.total_h + ' h'
                        : mode === 'nacht'
                          ? [teamGesamt.gesamt.nachtdienste + 'N', teamGesamt.gesamt.we_dienste + 'W'].join(' ')
                          : teamGesamt.gesamt.arbeitstage}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </SectionCard>
      )}
    </AnalyseShell>
  );
}

// ── Nacht/WE-Zähler ─────────────────────────────────────────────────────────

function SubNachtWEZaehler({ monat, jahr }) {
  const [mode, setMode] = React.useState('jahr'); // 'monat' | 'jahr'

  const qs = mode === 'monat'
    ? 'month=' + encodeURIComponent(monat) + '&year=' + jahr
    : 'year=' + jahr;

  const { data, loading, error } = useAnalyse('/api/analyse/statistiken?' + qs, [qs]);

  const [sortKeyN, setSortKeyN] = React.useState('gesamt');
  const [sortDirN, setSortDirN] = React.useState(-1);

  function handleSortN(key) {
    if (sortKeyN === key) {
      setSortDirN(function(d) { return d * -1; });
    } else {
      setSortKeyN(key);
      setSortDirN(key === 'name' ? 1 : -1);
    }
  }

  const sorted = React.useMemo(function() {
    if (!data) return [];
    return [...data].sort(function(a, b) {
      if (sortKeyN === 'name')  return a.name.localeCompare(b.name, 'de') * sortDirN;
      if (sortKeyN === 'nacht') return (a.nachtdienste - b.nachtdienste) * sortDirN;
      if (sortKeyN === 'we')    return (a.we_dienste   - b.we_dienste)   * sortDirN;
      if (sortKeyN === 'dienste') return (a.arbeitstage - b.arbeitstage) * sortDirN;
      return ((a.nachtdienste + a.we_dienste) - (b.nachtdienste + b.we_dienste)) * sortDirN;
    });
  }, [data, sortKeyN, sortDirN]);

  const maxN    = sorted.length ? Math.max(...sorted.map(function(r) { return r.nachtdienste || 0; })) : 1;
  const maxW    = sorted.length ? Math.max(...sorted.map(function(r) { return r.we_dienste   || 0; })) : 1;
  const teamN   = sorted.reduce(function(s, r) { return s + (r.nachtdienste || 0); }, 0);
  const teamW   = sorted.reduce(function(s, r) { return s + (r.we_dienste   || 0); }, 0);

  const label = mode === 'monat' ? monat + ' ' + jahr : 'Gesamt ' + jahr;

  return (
    <AnalyseShell loading={loading} error={error}>
      {data && (
        <SectionCard title={'Nacht & WE-Zähler — ' + label}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '6px 0 14px' }}>
            <div className="chip-row">
              <button className={'chip' + (mode === 'monat' ? ' active' : '')}
                onClick={function() { setMode('monat'); }}>
                {monat} {jahr}
              </button>
              <button className={'chip' + (mode === 'jahr' ? ' active' : '')}
                onClick={function() { setMode('jahr'); }}>
                Gesamt {jahr}
              </button>
            </div>
            <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
              Team: <strong>{teamN}</strong> Nacht · <strong>{teamW}</strong> WE
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginLeft: 'auto' }}>
              <span style={{ color: 'var(--ink-faint)' }}>Anteil:</span>
              <span className="badge-info" style={{ fontSize: 11 }}>&gt; 35 %</span>
              <span className="badge-warn" style={{ fontSize: 11 }}>&gt; 50 %</span>
            </span>
          </div>

          <AnalyseHilfe>
            <strong>Was zeigt diese Tabelle?</strong> Nacht- und Wochenenddienste werden <em>getrennt</em> ausgewertet — ein Nachtdienst am Samstag zählt nur in seiner eigenen Kategorie, nicht doppelt.<br/>
            <strong>Balken:</strong> Breite relativ zum Spitzenreiter im Team. Dahinter der Anteil an allen Arbeitsdiensten (÷ Dienste-Spalte).<br/>
            <strong>Farbe des Anteils:</strong> <span style={{ color: 'var(--blue-600)' }}>Blau</span> &gt; 35 %, <span style={{ color: 'var(--amber-600)' }}>Gelb</span> &gt; 50 % — jeweils unabhängig für Nacht und WE.<br/>
            <strong>Nachtdienst:</strong> Dienst, dessen Ende vor dem Beginn liegt (Mitternacht überschritten, z. B. 18:15–06:15).<br/>
            <strong>Wochenende:</strong> Samstag und Sonntag — unabhängig vom Dienst-Typ.
          </AnalyseHilfe>

          {sorted.length === 0 ? (
            <div className="empty-state" style={{ padding: 32, gap: 8 }}>
              {IcoChart}
              <span style={{ color: 'var(--ink-muted)' }}>Keine Daten für diesen Zeitraum.</span>
            </div>
          ) : (
            <div className="analyse-table-wrap">
              <table className="analyse-table" style={{ minWidth: 480 }}>
                <thead>
                  <tr>
                    <th style={{ width: 30, textAlign: 'right' }}>#</th>
                    <th className={'sortable' + (sortKeyN === 'name' ? ' sort-active' : '')}
                      onClick={function() { handleSortN('name'); }}>
                      Name <SortArrow active={sortKeyN === 'name'} dir={sortDirN} />
                    </th>
                    <th className={'sortable nw-col' + (sortKeyN === 'nacht' ? ' sort-active' : '')}
                      style={{ minWidth: 200 }} onClick={function() { handleSortN('nacht'); }}>
                      <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'var(--blue-500)', verticalAlign: 'middle', marginRight: 5 }} />
                      Nacht <SortArrow active={sortKeyN === 'nacht'} dir={sortDirN} />
                    </th>
                    <th className={'sortable nw-col' + (sortKeyN === 'we' ? ' sort-active' : '')}
                      style={{ minWidth: 200 }} onClick={function() { handleSortN('we'); }}>
                      <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'var(--amber-500)', verticalAlign: 'middle', marginRight: 5 }} />
                      Wochenende <SortArrow active={sortKeyN === 'we'} dir={sortDirN} />
                    </th>
                    <th className={'num sortable' + (sortKeyN === 'dienste' ? ' sort-active' : '')}
                      title="Gesamtanzahl Arbeitsdienste im Zeitraum"
                      onClick={function() { handleSortN('dienste'); }}>
                      Dienste <SortArrow active={sortKeyN === 'dienste'} dir={sortDirN} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(function(ma, i) {
                    const BAR = 100;
                    const nW  = maxN > 0 ? Math.round((ma.nachtdienste || 0) / maxN * BAR) : 0;
                    const wW  = maxW > 0 ? Math.round((ma.we_dienste   || 0) / maxW * BAR) : 0;
                    const nPct = ma.arbeitstage > 0 ? Math.round((ma.nachtdienste || 0) / ma.arbeitstage * 100) : 0;
                    const wPct = ma.arbeitstage > 0 ? Math.round((ma.we_dienste   || 0) / ma.arbeitstage * 100) : 0;
                    const nCls = nPct > 50 ? 'badge-warn' : nPct > 35 ? 'badge-info' : '';
                    const wCls = wPct > 50 ? 'badge-warn' : wPct > 35 ? 'badge-info' : '';
                    return (
                      <tr key={ma.kuerzel}>
                        <td style={{ textAlign: 'right', color: 'var(--ink-faint)', fontSize: 11 }}>{i + 1}</td>
                        <td>
                          <span style={{ fontWeight: 500 }}>{ma.name}</span>
                          {ma.pensum !== 100 && (
                            <span className="muted small" style={{ marginLeft: 6 }}>{ma.pensum}%</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <span style={{ width: 22, textAlign: 'right', fontWeight: 700,
                                           fontVariantNumeric: 'tabular-nums',
                                           color: ma.nachtdienste > 0 ? 'var(--blue-600)' : 'var(--ink-faint)' }}>
                              {ma.nachtdienste || 0}
                            </span>
                            <div className="analyse-bar-track" style={{ flex: 1, maxWidth: BAR, height: 7, borderRadius: 4, background: 'var(--hairline-strong)' }}>
                              {nW > 0 && <div style={{ width: nW + '%', height: 7, borderRadius: 4, background: 'var(--blue-500)' }} />}
                            </div>
                            <span className={nCls} style={{ fontSize: 11, minWidth: 36, textAlign: 'right' }}>
                              {nPct > 0 ? nPct + ' %' : ''}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <span style={{ width: 22, textAlign: 'right', fontWeight: 700,
                                           fontVariantNumeric: 'tabular-nums',
                                           color: ma.we_dienste > 0 ? 'var(--amber-600)' : 'var(--ink-faint)' }}>
                              {ma.we_dienste || 0}
                            </span>
                            <div className="analyse-bar-track" style={{ flex: 1, maxWidth: BAR, height: 7, borderRadius: 4, background: 'var(--hairline-strong)' }}>
                              {wW > 0 && <div style={{ width: wW + '%', height: 7, borderRadius: 4, background: 'var(--amber-500)' }} />}
                            </div>
                            <span className={wCls} style={{ fontSize: 11, minWidth: 36, textAlign: 'right' }}>
                              {wPct > 0 ? wPct + ' %' : ''}
                            </span>
                          </div>
                        </td>
                        <td className="num" style={{ color: 'var(--ink-muted)' }}>{ma.arbeitstage || 0}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td />
                    <td style={{ color: 'var(--ink-muted)', fontSize: 11, fontWeight: 600 }}>Team-Total</td>
                    <td style={{ fontWeight: 700, color: 'var(--blue-600)', paddingLeft: 29 }}>{teamN}</td>
                    <td style={{ fontWeight: 700, color: 'var(--amber-600)', paddingLeft: 29 }}>{teamW}</td>
                    <td className="num" style={{ color: 'var(--ink-muted)' }}>
                      {sorted.reduce(function(s, r) { return s + (r.arbeitstage || 0); }, 0)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </SectionCard>
      )}
    </AnalyseShell>
  );
}

// ── Zeitraum-Selektor ───────────────────────────────────────────────────────

const QUARTALE = [
  { id: 'Q1', label: 'Q1', monate: ['01','02','03'], bis_tag: '03-31', von_m: '01', bis_m: '03', name: 'Jan–Mär' },
  { id: 'Q2', label: 'Q2', monate: ['04','05','06'], bis_tag: '06-30', von_m: '04', bis_m: '06', name: 'Apr–Jun' },
  { id: 'Q3', label: 'Q3', monate: ['07','08','09'], bis_tag: '09-30', von_m: '07', bis_m: '09', name: 'Jul–Sep' },
  { id: 'Q4', label: 'Q4', monate: ['10','11','12'], bis_tag: '12-31', von_m: '10', bis_m: '12', name: 'Okt–Dez' },
];
const HALBJAHRE = [
  { id: 'H1', label: 'H1', von_m: '01', bis_tag: '06-30', bis_m: '06', name: 'Jan–Jun' },
  { id: 'H2', label: 'H2', von_m: '07', bis_tag: '12-31', bis_m: '12', name: 'Jul–Dez' },
];

function buildPeriod(mode, sub, monat, jahr) {
  const y = String(jahr);
  switch (mode) {
    case 'monat':
      return { qs: 'month=' + encodeURIComponent(monat) + '&year=' + y, label: monat + ' ' + y };
    case 'quartal': {
      const q = QUARTALE.find(function(x) { return x.id === sub; }) || QUARTALE[0];
      return { qs: 'von=' + y + '-' + q.von_m + '-01&bis=' + y + '-' + q.bis_tag,
               label: q.label + ' ' + y + ' (' + q.name + ')' };
    }
    case 'halbjahr': {
      const h = HALBJAHRE.find(function(x) { return x.id === sub; }) || HALBJAHRE[0];
      return { qs: 'von=' + y + '-' + h.von_m + '-01&bis=' + y + '-' + h.bis_tag,
               label: h.label + ' ' + y + ' (' + h.name + ')' };
    }
    case 'jahr':
      return { qs: 'year=' + y, label: y };
    case 'alles':
      return { qs: '', label: 'Gesamtzeitraum' };
    default:
      return { qs: 'year=' + y, label: y };
  }
}

function ZeitraumSelektor({ monat, jahr, onChange }) {
  const [mode, setMode]   = React.useState('monat');
  const [subSel, setSubSel] = React.useState('Q1');

  React.useEffect(function() {
    onChange(buildPeriod(mode, subSel, monat, jahr));
  }, [mode, subSel, monat, jahr]);

  const MODES = [
    { id: 'monat',    label: 'Monat' },
    { id: 'quartal',  label: 'Quartal' },
    { id: 'halbjahr', label: 'Halbjahr' },
    { id: 'jahr',     label: 'Jahr' },
    { id: 'alles',    label: 'Alles' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="chip-row">
        {MODES.map(function(m) {
          return (
            <button key={m.id} className={'chip' + (mode === m.id ? ' active' : '')}
              onClick={function() { setMode(m.id); }}>
              {m.label}
            </button>
          );
        })}
      </div>
      {mode === 'quartal' && (
        <div className="chip-row">
          {QUARTALE.map(function(q) {
            return (
              <button key={q.id} className={'chip' + (subSel === q.id ? ' active' : '')}
                onClick={function() { setSubSel(q.id); }}>
                {q.label} <span style={{ opacity: 0.6, fontSize: '0.8em' }}>({q.name})</span>
              </button>
            );
          })}
        </div>
      )}
      {mode === 'halbjahr' && (
        <div className="chip-row">
          {HALBJAHRE.map(function(h) {
            return (
              <button key={h.id} className={'chip' + (subSel === h.id ? ' active' : '')}
                onClick={function() { setSubSel(h.id); }}>
                {h.label} <span style={{ opacity: 0.6, fontSize: '0.8em' }}>({h.name})</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Tab: Analysen ────────────────────────────────────────────────────────────

function TabAnalysen({ monat, jahr }) {
  const [sub, setSub]       = React.useState('statistiken');
  const [period, setPeriod] = React.useState({ qs: 'month=' + encodeURIComponent(monat) + '&year=' + jahr, label: monat + ' ' + jahr });

  const SUBS = [
    { id: 'jahresuebersicht', label: 'Jahresübersicht' },
    { id: 'zaehler',          label: 'N/WE-Zähler' },
    { id: 'statistiken',      label: 'Statistiken' },
    { id: 'besetzung',        label: 'Besetzung' },
    { id: 'dienst_haeufig',   label: 'Dienst-Häufig.' },
    { id: 'teamkombi',        label: 'Team-Kombi' },
    { id: 'kollegen',         label: 'Kollegen' },
    { id: 'vergleich',        label: 'Vergleich' },
    { id: 'tausch',           label: 'Tausch' },
    { id: 'exporte',          label: 'Excel-Export' },
  ];

  return (
    <div className="fade-in" data-screen-label="Analysen">
      <div className="analyse-header-row">
        <PageHead label="Statistik" title="Analysen" subtitle={'Auswertungen — ' + period.label} />
        <div className="card analyse-zeitraum-card" style={{ padding: '10px 14px' }}>
          <ZeitraumSelektor monat={monat} jahr={jahr} onChange={setPeriod} />
        </div>
      </div>

      <div className="subtabs analyse-subtabs" style={{ marginBottom: 16 }}>
        {SUBS.map(function(s) {
          return (
            <button key={s.id} className={'subtab' + (sub === s.id ? ' active' : '')}
              onClick={function() { setSub(s.id); }}>
              {s.label}
            </button>
          );
        })}
      </div>

      {sub === 'jahresuebersicht' && <SubJahresuebersicht jahr={jahr} />}
      {sub === 'zaehler'          && <SubNachtWEZaehler monat={monat} jahr={jahr} />}
      {sub === 'statistiken'    && <SubStatistiken  qs={period.qs} label={period.label} />}
      {sub === 'besetzung'      && <SubBesetzung    qs={period.qs} label={period.label} />}
      {sub === 'dienst_haeufig' && <SubDienstHaeu   qs={period.qs} label={period.label} />}
      {sub === 'teamkombi'      && <SubTeamKombi    qs={period.qs} label={period.label} />}
      {sub === 'kollegen'       && <SubKollegen     qs={period.qs} label={period.label} monat={monat} jahr={jahr} />}
      {sub === 'vergleich'      && <SubVergleich    qs={period.qs} label={period.label} />}
      {sub === 'tausch'         && <SubTausch       qs={period.qs} label={period.label} />}
      {sub === 'exporte'        && <SubExporte      monat={monat} jahr={jahr} />}
    </div>
  );
}

// ── Excel-Export: Analyse-Report erstellen + erzeugte Dateien herunterladen ──
function SubExporte({ monat, jahr }) {
  const toast = useToast();
  const { lines, running, start } = useStreamingLog();
  const [excelFiles, setExcelFiles] = React.useState([]);
  const [excelSearch, setExcelSearch] = React.useState('');
  const [excelType, setExcelType] = React.useState('alle');

  const loadExcelFiles = function() {
    fetch('/api/files/excel')
      .then(function(r) { return r.json(); })
      .then(function(data) { if (Array.isArray(data)) setExcelFiles(data); })
      .catch(function() {});
  };

  React.useEffect(function() { loadExcelFiles(); }, []);

  const runAnalyse = async function() {
    if (running) return;
    const data = new FormData();
    if (monat) data.set('month', monat);
    data.set('year', String(jahr));
    try {
      const resp = await fetch('/api/analyse', { method: 'POST', body: data });
      const json = await resp.json();
      if (json.error) { toast.show(json.error, 'error'); return; }
      start(json.task_id, function() { toast.show('Analyse-Report erstellt'); loadExcelFiles(); });
    } catch(e) {
      toast.show('Verbindungsfehler', 'error');
    }
  };

  const formatSize = function(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatMtime = function(ts) {
    if (!ts) return '';
    return new Date(ts * 1000).toLocaleDateString('de-CH');
  };

  return (
    <div className="fade-in">
      <SectionCard title={'Analyse-Report erstellen — ' + monat + ' ' + jahr}>
        <p className="muted small" style={{ margin: '0 0 12px' }}>
          Statistiken, Nachtdienste und Besetzung als Excel-Tabelle exportieren.
          Der Report wird auch automatisch beim Import erstellt, wenn die Option aktiviert ist.
        </p>
        <button className="btn btn-primary btn-sm" onClick={runAnalyse} disabled={running}>
          {running ? 'Läuft…' : 'Report erstellen'}
        </button>
        {lines.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <Log lines={lines} running={running} title="Protokoll" />
          </div>
        )}
      </SectionCard>

      <SectionCard title={'Erzeugte Excel-Dateien (' + excelFiles.length + ')'}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '0 0 8px', flexWrap: 'wrap' }}>
          <input
            type="search" className="input"
            placeholder="Dateiname suchen…"
            value={excelSearch} onChange={function(e) { setExcelSearch(e.target.value); }}
            style={{ flex: 1, minWidth: 180, padding: '6px 12px', fontSize: '0.85rem' }}
          />
          <div className="chip-row" style={{ flexShrink: 0 }}>
            {['alle', 'uebersicht', 'analyse'].map(function(t) {
              const labels = { alle: 'Alle', uebersicht: 'Übersicht', analyse: 'Analyse' };
              return (
                <button key={t} className={'chip ' + (excelType === t ? 'active' : '')}
                  onClick={function() { setExcelType(t); }}>
                  {labels[t]}
                </button>
              );
            })}
          </div>
        </div>
        <div className="file-list">
          {(function() {
            const filtered = excelFiles.filter(function(f) {
              const n = f.name.toLowerCase();
              if (excelSearch && !n.includes(excelSearch.toLowerCase())) return false;
              if (excelType === 'uebersicht' && !n.includes('uebersicht')) return false;
              if (excelType === 'analyse'    && !n.includes('analyse'))    return false;
              return true;
            });
            if (excelFiles.length === 0) return (
              <div className="empty-state">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.35 }}><path d="M3 20h18"/><path d="M6 20v-7"/><path d="M12 20V5"/><path d="M18 20v-10"/></svg>
                Keine Excel-Dateien vorhanden.
              </div>
            );
            if (filtered.length === 0) return (
              <div className="empty-state">Keine Treffer.</div>
            );
            return filtered.map(function(f) {
              return (
                <div className="file-row" key={f.name}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--ink-faint)', flexShrink: 0 }}><path d="M3 20h18"/><path d="M6 20v-7"/><path d="M12 20V5"/><path d="M18 20v-10"/></svg>
                  <span className="name">{f.name}</span>
                  <span className="meta">{formatSize(f.size)}{f.mtime ? ' · ' + formatMtime(f.mtime) : ''}</span>
                  <a className="btn btn-outline btn-sm" href={'/download/excel/' + encodeURIComponent(f.name)}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Download
                  </a>
                </div>
              );
            });
          })()}
        </div>
      </SectionCard>
    </div>
  );
}

// ── Shared helpers ──────────────────────────────────────────────────────────

function useAnalyse(url, deps) {
  const [data, setData]       = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError]     = React.useState('');

  React.useEffect(function() {
    setLoading(true); setError(''); setData(null);
    fetch(url)
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d && d.error) { setError(d.error); } else { setData(d); }
        setLoading(false);
      })
      .catch(function() { setError('Verbindungsfehler'); setLoading(false); });
  }, deps);

  return { data, loading, error };
}

var IcoSpinner = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'dp-pulse 1.2s ease-in-out infinite' }}>
    <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
  </svg>
);

var IcoWarn = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);

var IcoChart = (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.35 }}>
    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
  </svg>
);

var IcoPin = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
  </svg>
);

function AnalyseShell({ loading, error, children }) {
  if (loading) return (
    <div className="empty-state" style={{ padding: 48, color: 'var(--ink-muted)', gap: 10 }}>
      {IcoSpinner}
      <span>Wird geladen…</span>
    </div>
  );
  if (error) return (
    <div className="empty-state" style={{ padding: 48, color: 'var(--red-500)', gap: 10 }}>
      {IcoWarn}
      <span>{error}</span>
    </div>
  );
  if (!children) return null;
  return React.createElement(React.Fragment, null, children);
}

function SortArrow({ active, dir }) {
  if (!active) return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
      style={{ opacity: 0.35, marginLeft: 3, verticalAlign: 'middle' }}>
      <path d="M5 2 L5 8 M2.5 4.5 L5 2 L7.5 4.5"/><path d="M2.5 5.5 L5 8 L7.5 5.5"/>
    </svg>
  );
  if (dir === 1) return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
      style={{ marginLeft: 3, verticalAlign: 'middle' }}>
      <path d="M5 8 L5 2 M2.5 4.5 L5 2 L7.5 4.5"/>
    </svg>
  );
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
      style={{ marginLeft: 3, verticalAlign: 'middle' }}>
      <path d="M5 2 L5 8 M2.5 5.5 L5 8 L7.5 5.5"/>
    </svg>
  );
}

function DataTable({ cols, rows, foot, wrapClass }) {
  const [sortKey, setSortKey] = React.useState(null);
  const [sortDir, setSortDir] = React.useState(1);

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir(function(d) { return d * -1; });
    } else {
      setSortKey(key);
      setSortDir(1);
    }
  }

  const sorted = React.useMemo(function() {
    if (!rows) return [];
    if (!sortKey) return rows;
    return [...rows].sort(function(a, b) {
      const av = a[sortKey], bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sortDir;
      return String(av).localeCompare(String(bv), 'de') * sortDir;
    });
  }, [rows, sortKey, sortDir]);

  if (!rows || rows.length === 0) {
    return (
      <div className="empty-state" style={{ padding: 32, gap: 8 }}>
        {IcoChart}
        <span style={{ color: 'var(--ink-muted)' }}>Keine Daten vorhanden.</span>
      </div>
    );
  }
  return (
    <div className={'analyse-table-wrap' + (wrapClass ? ' ' + wrapClass : '')}>
      <table className="analyse-table">
        <thead>
          <tr>
            {cols.map(function(c) {
              const active = sortKey === c.key;
              const cls = (c.sticky ? 'col-sticky ' : '') + (c.align === 'right' ? 'num ' : '') + 'sortable' + (active ? ' sort-active' : '');
              return (
                <th key={c.key} className={cls} onClick={function() { handleSort(c.key); }}>
                  {c.label}
                  <SortArrow active={active} dir={sortDir} />
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map(function(row, i) {
            return (
              <tr key={i} className={row.__rowClass || ''}>
                {cols.map(function(c) {
                  const val = row[c.key];
                  const fmt = c.fmt ? c.fmt(val, row) : (val == null ? '–' : val);
                  const cls = (c.sticky ? 'col-sticky ' : '') + (c.align === 'right' ? 'num' : '');
                  return <td key={c.key} className={cls}>{fmt}</td>;
                })}
              </tr>
            );
          })}
        </tbody>
        {foot && (
          <tfoot>
            <tr>
              {cols.map(function(c) {
                const cls = (c.sticky ? 'col-sticky ' : '') + (c.align === 'right' ? 'num' : '');
                return <td key={c.key} className={cls}>{foot[c.key] != null ? foot[c.key] : ''}</td>;
              })}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function SectionCard({ title, children }) {
  return (
    <div className="card" style={{ marginBottom: 12, paddingTop: 0 }}>
      <div className="card-sticky-head">
        <div className="section-label">{title}</div>
      </div>
      <div style={{ padding: '0 4px 4px' }}>
        {children}
      </div>
    </div>
  );
}

// ── Statistiken ─────────────────────────────────────────────────────────────

function SubStatistiken({ qs, label }) {
  const url = '/api/analyse/statistiken?' + qs;
  const { data, loading, error } = useAnalyse(url, [qs]);

  const cols = [
    { key: 'name',         label: 'Name' },
    { key: 'pensum',       label: 'Pensum %', align: 'right' },
    { key: 'arbeitstage',  label: 'Arbeitstage', align: 'right' },
    { key: 'total_h',      label: 'Total h', align: 'right' },
    { key: 'nachtdienste', label: 'Nacht', align: 'right' },
    { key: 'we_dienste',   label: 'WE', align: 'right' },
    { key: 'nacht_100',    label: 'Nacht/100%', align: 'right',
      fmt: function(v) { return React.createElement('span', { className: v > 30 ? 'badge-warn' : '' }, v); } },
    { key: 'we_100',       label: 'WE/100%', align: 'right',
      fmt: function(v) { return React.createElement('span', { className: v > 30 ? 'badge-warn' : '' }, v); } },
    { key: 'gesamt_100',   label: 'Gesamt/100%', align: 'right',
      fmt: function(v) { return React.createElement('span', { className: v > 60 ? 'badge-warn' : v > 40 ? 'badge-info' : '' }, v); } },
  ];

  return (
    <AnalyseShell loading={loading} error={error}>
      {data && (
        <SectionCard title={'Kennzahlen pro Mitarbeitende — ' + label}>
          <AnalyseHilfe>
            <strong>Was zeigt diese Tabelle?</strong> Kennzahlen pro Person für den gewählten Zeitraum, sortiert nach Belastung (Nacht+WE / Pensum).<br/>
            <strong>Arbeitstage:</strong> Dienste der Kategorie „Arbeit". <strong>Total h:</strong> berechnete Arbeitszeit in Stunden.<br/>
            <strong>Nacht / WE:</strong> Absolute Anzahl Nacht- und Wochenenddienste.<br/>
            <strong>Nacht/100% / WE/100% / Gesamt/100%:</strong> Wert geteilt durch Pensum × 100 — ermöglicht fairen Vergleich zwischen Voll- und Teilzeit.<br/>
            <span style={{ color: 'var(--amber-600)' }}>Gelb</span> bei Gesamt/100% &gt; 40, <span style={{ color: 'var(--red-500)' }}>Orange</span> &gt; 60 — beides Hinweise auf überdurchschnittliche Belastung.
          </AnalyseHilfe>
          <DataTable cols={cols} rows={data} />
        </SectionCard>
      )}
    </AnalyseShell>
  );
}

// ── Nacht & WE ──────────────────────────────────────────────────────────────

function SubNachtdienste({ qs, label }) {
  const [showDetail, setShowDetail] = React.useState(false);
  const url = '/api/analyse/nachtdienste?' + qs;
  const { data, loading, error } = useAnalyse(url, [qs]);

  const fairCols = [
    { key: 'name',         label: 'Name' },
    { key: 'pensum',       label: 'Pensum %', align: 'right' },
    { key: 'nachtdienste', label: 'Nacht', align: 'right' },
    { key: 'we_dienste',   label: 'WE', align: 'right' },
    { key: 'gesamt',       label: 'Gesamt', align: 'right' },
    { key: 'nacht_100',    label: 'Nacht/100%', align: 'right' },
    { key: 'we_100',       label: 'WE/100%', align: 'right' },
    { key: 'gesamt_100',   label: 'Gesamt/100%', align: 'right',
      fmt: function(v) { return React.createElement('span', { className: v > 60 ? 'badge-warn' : v > 40 ? 'badge-info' : '' }, v); } },
  ];

  const detailCols = [
    { key: 'datum',    label: 'Datum', fmt: function(v) { return fmtDatum(v); } },
    { key: 'wochentag',label: 'Tag' },
    { key: 'nacht',    label: 'Nacht' },
    { key: 'we',       label: 'WE' },
    { key: 'name',     label: 'Name' },
    { key: 'dienst',   label: 'Dienst' },
    { key: 'beginn',   label: 'Beginn' },
    { key: 'ende',     label: 'Ende' },
    { key: 'ort',      label: 'Ort' },
    { key: 'kollegen', label: 'Kollegen' },
  ];

  return (
    <AnalyseShell loading={loading} error={error}>
      {data && (
        <React.Fragment>
          <SectionCard title={'Fairness-Rangliste — ' + label}>
            <AnalyseHilfe>
              <strong>Was zeigt diese Tabelle?</strong> Rangliste aller MA nach Nacht- und Wochenenddiensten — mit Pensum-Normierung für fairen Vergleich.<br/>
              <strong>Nachtdienst:</strong> Ein Dienst gilt als Nachtdienst, wenn Dienstende vor Dienstbeginn liegt (Mitternacht wird überschritten), z. B. 18:15–06:15.<br/>
              <strong>Wochenende (WE):</strong> Alle Dienste an Samstag oder Sonntag — unabhängig vom Dienst-Typ.<br/>
              <strong>Gesamt/100%:</strong> (Nacht+WE) ÷ Pensum × 100. <span style={{ color: 'var(--amber-600)' }}>Gelb</span> &gt; 40, <span style={{ color: 'var(--red-500)' }}>Orange</span> &gt; 60.<br/>
              <strong>Detail-Ansicht:</strong> Über die Schaltfläche unten lassen sich alle einzelnen Nacht-/WE-Dienste mit Datum, Kolleg:innen und Ort einblenden.
            </AnalyseHilfe>
            <DataTable cols={fairCols} rows={data.fairness} />
          </SectionCard>
          <div style={{ marginBottom: 12 }}>
            <button className="btn btn-ghost btn-sm" onClick={function() { setShowDetail(!showDetail); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: showDetail ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s' }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
              {showDetail ? 'Detail ausblenden' : 'Detail einblenden'}
              {data.detail && (
                <span style={{ fontSize: 11, opacity: 0.6 }}>({data.detail.length} Einträge)</span>
              )}
            </button>
          </div>
          {showDetail && (
            <SectionCard title="Nacht- & WE-Dienste Detail">
              <DataTable cols={detailCols} rows={data.detail} />
            </SectionCard>
          )}
        </React.Fragment>
      )}
    </AnalyseShell>
  );
}

// ── Besetzung ───────────────────────────────────────────────────────────────

function SubBesetzung({ qs, label }) {
  const url = '/api/analyse/besetzung?' + qs;
  const { data, loading, error } = useAnalyse(url, [qs]);
  const [search, setSearch] = React.useState('');

  const cols = [
    { key: 'datum',      label: 'Datum', fmt: function(v) { return fmtDatum(v); } },
    { key: 'wochentag',  label: 'Tag' },
    { key: 'we',         label: 'WE',
      fmt: function(v) {
        if (!v) return '';
        return React.createElement('span', {
          style: {
            display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
            background: 'var(--amber-500)', verticalAlign: 'middle',
          }
        });
      }
    },
    { key: 'ort',        label: 'Ort' },
    { key: 'dienst',     label: 'Dienst' },
    { key: 'beginn',     label: 'Beginn' },
    { key: 'ende',       label: 'Ende' },
    { key: 'anzahl_ma',  label: 'MA', align: 'right' },
    { key: 'personal',   label: 'Personal' },
  ];

  const filtered = React.useMemo(function() {
    if (!data) return [];
    const q = search.toLowerCase();
    if (!q) return data;
    return data.filter(function(r) {
      return (r.datum || '').includes(q)
          || (r.ort   || '').toLowerCase().includes(q)
          || (r.dienst|| '').toLowerCase().includes(q)
          || (r.personal || '').toLowerCase().includes(q);
    });
  }, [data, search]);

  return (
    <AnalyseShell loading={loading} error={error}>
      {data && (
        <SectionCard title={'Besetzungsplan — ' + label}>
          <AnalyseHilfe>
            <strong>Was zeigt diese Tabelle?</strong> Jeder geplante Dienst mit Datum, Wochentag, Ort, Dienst-Code, Zeiten und den eingesetzten Personen.<br/>
            <strong>MA-Spalte:</strong> Anzahl der eingesetzten Mitarbeitenden pro Dienst-Slot.<br/>
            <strong>Personal:</strong> Kommagetrennte Kürzel aller MA im selben Slot (selber Tag, selber Ort, selber Dienst-Code).<br/>
            <strong>WE-Punkt:</strong> Bernsteinfarbener Punkt markiert Samstag und Sonntag.<br/>
            <strong>Suche:</strong> Filtert nach Datum (z. B. „06"), Ort, Dienst-Code oder Namen.
          </AnalyseHilfe>
          <div style={{ padding: '8px 0 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ position: 'absolute', left: 9, pointerEvents: 'none', color: 'var(--ink-faint)' }}>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="search" className="input analyse-search-input"
                placeholder="Datum, Ort, Dienst, Personal…"
                value={search} onChange={function(e) { setSearch(e.target.value); }}
                style={{ paddingLeft: 30, fontSize: '0.85rem', width: 280 }}
              />
            </div>
            {search && (
              <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                {filtered.length} von {data.length}
              </span>
            )}
          </div>
          <DataTable cols={cols} rows={filtered} />
        </SectionCard>
      )}
    </AnalyseShell>
  );
}

// ── Dienst-Häufigkeit ───────────────────────────────────────────────────────

function SubDienstHaeu({ qs, label }) {
  const url = '/api/analyse/dienst_haeufigkeit?' + qs;
  const { data, loading, error } = useAnalyse(url, [qs]);
  const [nurKlein,  setNurKlein]  = React.useState(false);
  const [showOrt,   setShowOrt]   = React.useState(null);

  if (loading) return (
    <div className="empty-state" style={{ padding: 48, color: 'var(--ink-muted)', gap: 10 }}>
      {IcoSpinner}
      <span>Wird geladen…</span>
    </div>
  );
  if (error) return (
    <div className="empty-state" style={{ padding: 48, color: 'var(--red-500)', gap: 10 }}>
      {IcoWarn}
      <span>{error}</span>
    </div>
  );
  if (!data) return null;

  const { dienste, pivot, totals, ausrueck_dienste, nach_ort } = data;
  if (!dienste || dienste.length === 0) {
    return (
      <div className="empty-state" style={{ padding: 32, gap: 8 }}>
        {IcoChart}
        <span style={{ color: 'var(--ink-muted)' }}>Keine Daten vorhanden.</span>
      </div>
    );
  }

  const ausrueckSet = new Set(ausrueck_dienste || []);
  const ausrueckCount = dienste.filter(function(d) { return ausrueckSet.has(d); }).length;

  const visibleDienste = nurKlein
    ? dienste.filter(function(d) { return ausrueckSet.has(d); })
    : dienste;

  const cols = [
    { key: 'name', label: 'Name', sticky: true },
    ...visibleDienste.map(function(d) {
      return { key: d, label: d, align: 'right',
               fmt: function(v) {
                 return v === 0
                   ? React.createElement('span', { style: { color: 'var(--ink-faint)' } }, '–')
                   : v;
               }
      };
    }),
    { key: '__total', label: 'Total', align: 'right',
      fmt: function(v) { return React.createElement('strong', null, v); } },
  ];

  const footRow = { name: 'Team-Total' };
  visibleDienste.forEach(function(d) { footRow[d] = totals[d] || 0; });
  footRow.__total = visibleDienste.reduce(function(s, d) { return s + (totals[d] || 0); }, 0);

  return (
  <React.Fragment>
    <SectionCard title={'Dienst-Häufigkeit pro Mitarbeitende — ' + label}>
      <AnalyseHilfe>
        <strong>Was zeigt diese Tabelle?</strong> Pivot-Tabelle: jede Zeile ist eine Person, jede Spalte ein Dienst-Typ-Code.<br/>
        <strong>Zellenwert:</strong> Wie oft hat diese Person diesen Dienst im gewählten Zeitraum absolviert. „–" bedeutet 0.<br/>
        <strong>Total-Spalte:</strong> Gesamtanzahl aller Dienste der Person — Sortierkriterium.<br/>
        <strong>Team-Total-Zeile:</strong> Spaltensumme über alle MA — zeigt welche Dienste team-weit am häufigsten besetzt werden.<br/>
        <strong>Ausrückdienst-Filter:</strong> Zeigt nur Dienste, die in den Einstellungen als Ausrückdienst markiert sind.
      </AnalyseHilfe>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0 10px', flexWrap: 'wrap' }}>
        <button
          className={'btn btn-sm' + (nurKlein ? ' btn-primary' : ' btn-outline')}
          onClick={function() { setNurKlein(function(v) { return !v; }); }}
          disabled={ausrueckCount === 0}
          title={ausrueckCount === 0 ? 'Keine Ausrückdienste in Einstellungen markiert' : 'Nur als Ausrückdienst markierte Dienste anzeigen'}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
          </svg>
          Nur Ausrückdienste
          <span style={{ opacity: 0.65, fontSize: 11 }}>({ausrueckCount})</span>
        </button>
        {nurKlein && ausrueckCount > 0 && (
          <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
            {visibleDienste.length} von {dienste.length} Diensten
          </span>
        )}
        {ausrueckCount === 0 && (
          <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
            Keine Ausrückdienste definiert — in <strong>Einstellungen → Dienstzeiten</strong> die Spalte „Ausrück" setzen.
          </span>
        )}
      </div>
      <DataTable cols={cols} rows={pivot} foot={footRow} wrapClass="paar-matrix-wrap" />
    </SectionCard>

    {nach_ort && Object.keys(nach_ort).length > 1 && (
      <SectionCard title={'Häufigkeit nach Standort — ' + label}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '4px 0 12px' }}>
          {Object.keys(nach_ort).sort().map(function(ort) {
            return (
              <button
                key={ort}
                className={'chip' + (showOrt === ort ? ' active' : '')}
                onClick={function() { setShowOrt(showOrt === ort ? null : ort); }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                {IcoPin} {ort}
              </button>
            );
          })}
        </div>
        {showOrt && nach_ort[showOrt] ? (function() {
          const od = nach_ort[showOrt];
          const visDienste = nurKlein
            ? od.dienste.filter(function(d) { return ausrueckSet.has(d); })
            : od.dienste;
          const oCols = [
            { key: 'name', label: 'Name', sticky: true },
            ...visDienste.map(function(d) {
              return { key: d, label: d, align: 'right',
                fmt: function(v) { return v === 0
                  ? React.createElement('span', { style: { color: 'var(--ink-faint)' } }, '–')
                  : v; }};
            }),
            { key: '__total', label: 'Total', align: 'right',
              fmt: function(v) { return React.createElement('strong', null, v); } },
          ];
          const oFoot = { name: 'Team-Total' };
          visDienste.forEach(function(d) { oFoot[d] = od.totals[d] || 0; });
          oFoot.__total = visDienste.reduce(function(s, d) { return s + (od.totals[d] || 0); }, 0);
          const oRows = od.pivot.map(function(row) {
            if (!nurKlein) return row;
            var r = { kuerzel: row.kuerzel, name: row.name };
            var tot = 0;
            visDienste.forEach(function(d) { r[d] = row[d] || 0; tot += r[d]; });
            r.__total = tot;
            return r;
          }).filter(function(r) { return r.__total > 0; });
          return (
            <div className="fade-in">
              <DataTable cols={oCols} rows={oRows} foot={oFoot} wrapClass="paar-matrix-wrap" />
            </div>
          );
        })() : (
          <p style={{ fontSize: 12, color: 'var(--ink-muted)', margin: 0 }}>
            Standort auswählen um die Häufigkeiten anzuzeigen.
          </p>
        )}
      </SectionCard>
    )}
  </React.Fragment>
  );
}

// ── Team-Kombinationen ──────────────────────────────────────────────────────

function PaarMatrix({ alle, paare, maxAnzahl }) {
  const [popup, setPopup] = React.useState(null);

  React.useEffect(function() {
    if (!popup) return;
    function onOutside(e) {
      if (!e.target.closest('.paar-popup')) setPopup(null);
    }
    document.addEventListener('mousedown', onOutside);
    return function() { document.removeEventListener('mousedown', onOutside); };
  }, [popup]);

  if (!alle || alle.length === 0) {
    return (
      <div className="empty-state" style={{ padding: 32, gap: 8 }}>
        {IcoChart}
        <span style={{ color: 'var(--ink-muted)' }}>Keine Daten vorhanden.</span>
      </div>
    );
  }

  const lookup = {};
  const diensteLookup = {};
  paare.forEach(function(p) {
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
    setPopup({ a: rowMA, b: colMA, dienste, x: rect.left + rect.width / 2, y: rect.bottom + 6 });
  }

  return (
    <div style={{ position: 'relative' }}>
      <div className="analyse-table-wrap paar-matrix-wrap">
        <table className="analyse-table paar-matrix">
          <thead>
            <tr>
              <th style={{ minWidth: 160 }} className="col-sticky"></th>
              {alle.map(function(m) {
                return (
                  <th key={m.kuerzel} className="num" style={{ minWidth: 44 }} title={m.name}>
                    {m.kuerzel}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {alle.map(function(rowMA) {
              return (
                <tr key={rowMA.kuerzel}>
                  <td className="col-sticky" style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{rowMA.name}</td>
                  {alle.map(function(colMA) {
                    if (rowMA.kuerzel === colMA.kuerzel) {
                      return <td key={colMA.kuerzel} className="num paar-diag">—</td>;
                    }
                    const n = lookup[rowMA.kuerzel + '|' + colMA.kuerzel] || 0;
                    return (
                      <td key={colMA.kuerzel} className={'num paar-cell' + (n ? ' paar-cell--klickbar' : '')}
                        style={{ background: cellColor(n), color: n > maxAnzahl * 0.5 ? '#fff' : 'var(--ink)' }}
                        title={n ? rowMA.name + ' + ' + colMA.name + ': ' + n + '×' : rowMA.name + ' + ' + colMA.name + ': 0'}
                        onClick={n ? function(e) { openPopup(e, rowMA, colMA, n); } : undefined}
                      >
                        {n || ''}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {popup && (
        <PaarPopup popup={popup} onClose={function() { setPopup(null); }} />
      )}
    </div>
  );
}

function PaarPopup({ popup, onClose }) {
  const ref = React.useRef(null);
  const [style, setStyle] = React.useState({ visibility: 'hidden', position: 'fixed', top: 0, left: 0 });

  React.useLayoutEffect(function() {
    if (!ref.current) return;
    const el = ref.current;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = popup.x - w / 2;
    let top  = popup.y;
    if (left + w > vw - 8) left = vw - w - 8;
    if (left < 8) left = 8;
    if (top + h > vh - 8) top = popup.y - h - 12;
    setStyle({ visibility: 'visible', position: 'fixed', top: top, left: left, zIndex: 9999 });
  }, [popup]);

  return (
    <div ref={ref} className="paar-popup" style={style}>
      <div className="paar-popup__head">
        <span>{popup.a.name} + {popup.b.name}</span>
        <button className="paar-popup__close" onClick={onClose}>✕</button>
      </div>
      <ul className="paar-popup__list">
        {popup.dienste.map(function(d) {
          return (
            <li key={d.name}>
              <span className="paar-popup__count">{d.anzahl}×</span>
              <span>{d.name || '(unbekannt)'}</span>
            </li>
          );
        })}
        {popup.dienste.length === 0 && (
          <li style={{ color: 'var(--ink-muted)', fontStyle: 'italic' }}>keine Details</li>
        )}
      </ul>
    </div>
  );
}

function SubTeamKombi({ qs, label }) {
  const url = '/api/analyse/teamkombinationen?' + qs;
  const { data, loading, error } = useAnalyse(url, [qs]);
  const [showOrt, setShowOrt] = React.useState(null);

  return (
    <AnalyseShell loading={loading} error={error}>
      {data && (
        <React.Fragment>
          <SectionCard title={'Wie oft haben je zwei Mitarbeitende zusammen gearbeitet? — ' + label}>
            <AnalyseHilfe>
              <strong>Was zeigt diese Tabelle?</strong> Matrix: Zeile × Spalte = Anzahl Dienste, bei denen beide MA gleichzeitig am selben Ort eingeteilt waren.<br/>
              <strong>Farbtiefe:</strong> Je dunkler das Blau, desto häufiger wurden diese beiden Personen zusammen eingesetzt — relativ zum Maximum im Team.<br/>
              <strong>Rangliste:</strong> Die Top-15-Paare nach gemeinsamen Diensten stehen darunter.<br/>
              <strong>Nach Ort:</strong> Falls mehrere Standorte vorhanden sind, kann jeder einzeln aufgerufen werden — nützlich für ortsspezifische Fairness-Prüfungen.
            </AnalyseHilfe>
            <PaarMatrix alle={data.alle} paare={data.paare} maxAnzahl={data.max_anzahl} />
          </SectionCard>

          <SectionCard title="Top-Paare (Rangliste)">
            <DataTable
              cols={[
                { key: '_rang',  label: 'Rang', align: 'right' },
                { key: 'a',      label: 'MA 1' },
                { key: 'b',      label: 'MA 2' },
                { key: 'anzahl', label: 'Gemeinsame Dienste', align: 'right',
                  fmt: function(v) { return React.createElement('strong', null, v + '×'); } },
              ]}
              rows={data.paare.slice(0, 15).map(function(p, i) { return Object.assign({}, p, { _rang: i + 1 }); })}
            />
          </SectionCard>

          {Object.keys(data.nach_ort).length > 1 && (
            <SectionCard title="Nach Ort aufgeschlüsselt">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, padding: '4px 0' }}>
                {Object.keys(data.nach_ort).map(function(ort) {
                  return (
                    <button key={ort}
                      className={'chip' + (showOrt === ort ? ' active' : '')}
                      onClick={function() { setShowOrt(showOrt === ort ? null : ort); }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      {IcoPin} {ort}
                    </button>
                  );
                })}
              </div>
              {showOrt && data.nach_ort[showOrt] && (
                <div className="fade-in">
                  <DataTable
                    cols={[
                      { key: 'a',      label: 'MA 1' },
                      { key: 'b',      label: 'MA 2' },
                      { key: 'anzahl', label: 'Gemeinsame Dienste', align: 'right',
                        fmt: function(v) { return React.createElement('strong', null, v + '×'); } },
                    ]}
                    rows={data.nach_ort[showOrt]}
                  />
                </div>
              )}
              {!showOrt && (
                <p style={{ fontSize: 12, color: 'var(--ink-muted)', margin: 0 }}>Ort auswählen für ortsspezifische Paare.</p>
              )}
            </SectionCard>
          )}
        </React.Fragment>
      )}
    </AnalyseShell>
  );
}

// ── Kollegen-Ranking ────────────────────────────────────────────────────────

function SubKollegen({ qs, label }) {
  const [kuerzel,    setKuerzel]    = React.useState('');
  const [alleMA,     setAlleMA]     = React.useState([]);
  const [result,     setResult]     = React.useState(null);
  const [loading,    setLoading]    = React.useState(false);
  const [error,      setError]      = React.useState('');
  const [showOrt,    setShowOrt]    = React.useState(null);
  const [showDienst, setShowDienst] = React.useState(null);
  const [search,  setSearch]  = React.useState('');
  const [open,    setOpen]    = React.useState(false);
  const comboRef = React.useRef(null);

  React.useEffect(function() {
    function handler(e) {
      if (comboRef.current && !comboRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return function() { document.removeEventListener('mousedown', handler); };
  }, []);

  const filtered = React.useMemo(function() {
    const q = search.toLowerCase();
    if (!q) return alleMA;
    return alleMA.filter(function(m) {
      return m.kuerzel.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
    });
  }, [alleMA, search]);

  const selectedMA = alleMA.find(function(m) { return m.kuerzel === kuerzel; });

  React.useEffect(function() {
    fetch('/api/analyse/kollegen_ranking')
      .then(function(r) { return r.json(); })
      .then(function(d) { if (d.alle_ma) setAlleMA(d.alle_ma); })
      .catch(function() {});
  }, []);

  React.useEffect(function() {
    if (kuerzel) load(kuerzel);
  }, [qs]);

  function load(k) {
    if (!k) return;
    setLoading(true); setError(''); setResult(null); setShowOrt(null); setShowDienst(null);
    const url = '/api/analyse/kollegen_ranking?kuerzel=' + encodeURIComponent(k)
              + (qs ? '&' + qs : '');
    fetch(url)
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.error) { setError(d.error); } else { setResult(d); }
        setLoading(false);
      })
      .catch(function() { setError('Verbindungsfehler'); setLoading(false); });
  }

  const rankCols = [
    { key: '_rang',   label: 'Rang', align: 'right' },
    { key: 'name',    label: 'Name' },
    { key: 'bevorstehend', label: 'Bevorstehend', align: 'right',
      fmt: function(v, row) {
        if (v === 0 || v === undefined) return React.createElement('span', { style: { color: 'var(--ink-faint)' } }, '–');
        return React.createElement('span', { style: { color: 'var(--blue-600)', fontWeight: 600 } }, v + '×');
      } },
    { key: 'anzahl',  label: 'Einsätze zusammen', align: 'right',
      fmt: function(v) { return React.createElement('strong', null, v + '×'); } },
  ];

  const rankRows = result
    ? result.rangliste.map(function(r, i) { return Object.assign({}, r, { _rang: i + 1 }); })
    : [];

  return (
    <div>
      <SectionCard title="Mitarbeitende wählen">
        <AnalyseHilfe>
          <strong>Was zeigt diese Analyse?</strong> Für eine gewählte Person: Wer hat am häufigsten zusammen mit ihr Dienst gemacht?<br/>
          <strong>Filterregel:</strong> Nur Einsätze mit ≤ 3 MA insgesamt und gesetztem Ort fließen ein — so werden Allein-Dienste und große Teamtage herausgefiltert und echte Zusammenarbeit gezählt.<br/>
          <strong>Rangliste:</strong> Kolleg:innen absteigend nach gemeinsamen Einsätzen, aufgeschlüsselt nach Gesamtperiode und einzelnen Standorten.<br/>
          <strong>Zeitraum-Filter:</strong> Gilt für die gesamte App — Monat/Jahr oben rechts ändert auch diese Auswertung.
        </AnalyseHilfe>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '4px 0' }}>
          <div ref={comboRef} style={{ position: 'relative', minWidth: 280 }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ position: 'absolute', left: 9, pointerEvents: 'none', color: 'var(--ink-faint)', flexShrink: 0 }}>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text"
                className="input"
                placeholder="Mitarbeitende suchen…"
                value={open ? search : (selectedMA ? selectedMA.kuerzel + ' — ' + selectedMA.name : '')}
                onChange={function(e) { setSearch(e.target.value); setOpen(true); }}
                onFocus={function() { setSearch(''); setOpen(true); }}
                style={{ paddingLeft: 30, width: '100%', cursor: open ? 'text' : 'pointer' }}
                readOnly={!open}
                onClick={function() { if (!open) { setSearch(''); setOpen(true); } }}
              />
              {kuerzel && !open && (
                <button
                  onClick={function() { setKuerzel(''); setResult(null); setSearch(''); }}
                  style={{ position: 'absolute', right: 8, background: 'none', border: 'none',
                           cursor: 'pointer', color: 'var(--ink-faint)', padding: 2, lineHeight: 1 }}
                  title="Auswahl aufheben"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              )}
            </div>
            {open && (
              <div style={{ position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, zIndex: 50,
                            background: 'var(--bg-surface)', border: '1px solid var(--hairline)',
                            borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                            maxHeight: 220, overflowY: 'auto' }}>
                {filtered.length === 0 ? (
                  <div style={{ padding: '10px 12px', color: 'var(--ink-muted)', fontSize: 12 }}>Keine Treffer</div>
                ) : filtered.map(function(m) {
                  return (
                    <div key={m.kuerzel}
                      onMouseDown={function() { setKuerzel(m.kuerzel); setSearch(''); setOpen(false); load(m.kuerzel); }}
                      style={{ padding: '8px 12px', cursor: 'pointer',
                               background: m.kuerzel === kuerzel ? 'var(--blue-50, #eff6ff)' : 'transparent',
                               display: 'flex', gap: 8, alignItems: 'baseline' }}
                      onMouseEnter={function(e) { if (m.kuerzel !== kuerzel) e.currentTarget.style.background = 'var(--bg-hover, #f5f5f5)'; }}
                      onMouseLeave={function(e) { e.currentTarget.style.background = m.kuerzel === kuerzel ? 'var(--blue-50, #eff6ff)' : 'transparent'; }}
                    >
                      <span style={{ fontWeight: 600, minWidth: 36, color: 'var(--ink)' }}>{m.kuerzel}</span>
                      <span style={{ color: 'var(--ink-muted)', fontSize: 13 }}>{m.name}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
            Zeigt Einsätze mit ≤ 3 MA, bei denen ein Ort gesetzt ist.
          </span>
        </div>
      </SectionCard>

      {loading && (
        <div className="empty-state" style={{ padding: 48, color: 'var(--ink-muted)', gap: 10 }}>
          {IcoSpinner}
          <span>Wird geladen…</span>
        </div>
      )}
      {error && (
        <div className="empty-state" style={{ padding: 48, color: 'var(--red-500)', gap: 10 }}>
          {IcoWarn}
          <span>{error}</span>
        </div>
      )}

      {result && (
        <React.Fragment>
          <SectionCard title={'Kollegen-Ranking — ' + result.name + ' (' + result.kuerzel + ')'}>
            <p style={{ fontSize: 12, color: 'var(--ink-muted)', margin: '8px 0 10px' }}>
              {result.einsaetze} Einsätze analysiert — {label}.
              {result.rangliste.length === 0 && ' Keine Kollegen gefunden (alle Einsätze Einzeldienst oder > 3 MA).'}
            </p>
            {result.rangliste.length > 0 && <DataTable cols={rankCols} rows={rankRows} />}
          </SectionCard>

          {Object.keys(result.nach_ort).length > 1 && (
            <SectionCard title="Aufschlüsselung nach Ort">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10, padding: '4px 0' }}>
                {Object.keys(result.nach_ort).map(function(ort) {
                  return (
                    <button
                      key={ort}
                      className={'chip' + (showOrt === ort ? ' active' : '')}
                      onClick={function() { setShowOrt(showOrt === ort ? null : ort); }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      {IcoPin} {ort}
                    </button>
                  );
                })}
              </div>
              {showOrt && (
                <div className="fade-in">
                  <DataTable
                    cols={[
                      { key: 'name',   label: 'Name' },
                      { key: 'bevorstehend', label: 'Bevorstehend', align: 'right',
                        fmt: function(v) {
                          if (v === 0 || v === undefined) return React.createElement('span', { style: { color: 'var(--ink-faint)' } }, '–');
                          return React.createElement('span', { style: { color: 'var(--blue-600)', fontWeight: 600 } }, v + '×');
                        } },
                      { key: 'anzahl', label: 'Einsätze', align: 'right',
                        fmt: function(v) { return React.createElement('strong', null, v + '×'); } },
                    ]}
                    rows={result.nach_ort[showOrt]}
                  />
                </div>
              )}
            </SectionCard>
          )}

          {result.nach_dienst && Object.keys(result.nach_dienst).length > 0 && (
            <SectionCard title="Aufschlüsselung nach Dienst">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10, padding: '4px 0' }}>
                {Object.keys(result.nach_dienst).map(function(d) {
                  return (
                    <button
                      key={d}
                      className={'chip' + (showDienst === d ? ' active' : '')}
                      onClick={function() { setShowDienst(showDienst === d ? null : d); }}>
                      {d}
                    </button>
                  );
                })}
              </div>
              {showDienst && (
                <div className="fade-in">
                  <DataTable
                    cols={[
                      { key: 'name',   label: 'Name' },
                      { key: 'bevorstehend', label: 'Bevorstehend', align: 'right',
                        fmt: function(v) {
                          if (v === 0 || v === undefined) return React.createElement('span', { style: { color: 'var(--ink-faint)' } }, '–');
                          return React.createElement('span', { style: { color: 'var(--blue-600)', fontWeight: 600 } }, v + '×');
                        } },
                      { key: 'anzahl', label: 'Einsätze', align: 'right',
                        fmt: function(v) { return React.createElement('strong', null, v + '×'); } },
                    ]}
                    rows={result.nach_dienst[showDienst]}
                  />
                </div>
              )}
              {!showDienst && (
                <p style={{ fontSize: 12, color: 'var(--ink-muted)', margin: 0 }}>Dienst auswählen für dienstspezifische Aufschlüsselung.</p>
              )}
            </SectionCard>
          )}
        </React.Fragment>
      )}
    </div>
  );
}

// ── MA-Vergleich ────────────────────────────────────────────────────────────

function MaCombo({ alleMA, value, onChange, placeholder }) {
  var [search, setSearch] = React.useState('');
  var [open,   setOpen]   = React.useState(false);
  var ref = React.useRef(null);

  React.useEffect(function() {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return function() { document.removeEventListener('mousedown', handler); };
  }, []);

  var filtered = React.useMemo(function() {
    var q = search.toLowerCase();
    if (!q) return alleMA;
    return alleMA.filter(function(m) {
      return m.kuerzel.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
    });
  }, [alleMA, search]);

  var selected = alleMA.find(function(m) { return m.kuerzel === value; });

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          style={{ position: 'absolute', left: 9, pointerEvents: 'none', color: 'var(--ink-faint)', flexShrink: 0 }}>
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          type="text"
          className="input"
          placeholder={placeholder || 'Mitarbeitende suchen…'}
          value={open ? search : (selected ? selected.kuerzel + ' — ' + selected.name : '')}
          onChange={function(e) { setSearch(e.target.value); setOpen(true); }}
          onFocus={function() { setSearch(''); setOpen(true); }}
          onClick={function() { if (!open) { setSearch(''); setOpen(true); } }}
          readOnly={!open}
          style={{ paddingLeft: 30, width: '100%', cursor: open ? 'text' : 'pointer' }}
        />
        {value && !open && (
          <button
            onClick={function() { onChange(''); setSearch(''); }}
            style={{ position: 'absolute', right: 8, background: 'none', border: 'none',
                     cursor: 'pointer', color: 'var(--ink-faint)', padding: 2, lineHeight: 1 }}
            title="Auswahl aufheben"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}
      </div>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, zIndex: 50,
                      background: 'var(--bg-surface)', border: '1px solid var(--hairline)',
                      borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                      maxHeight: 220, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '10px 12px', color: 'var(--ink-muted)', fontSize: 12 }}>Keine Treffer</div>
          ) : filtered.map(function(m) {
            return (
              <div key={m.kuerzel}
                onMouseDown={function() { onChange(m.kuerzel); setSearch(''); setOpen(false); }}
                style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13,
                         background: m.kuerzel === value ? 'var(--blue-100)' : 'transparent',
                         display: 'flex', gap: 8, alignItems: 'baseline' }}
                onMouseEnter={function(e) { if (m.kuerzel !== value) e.currentTarget.style.background = '#f5f5f5'; }}
                onMouseLeave={function(e) { e.currentTarget.style.background = m.kuerzel === value ? 'var(--blue-100)' : 'transparent'; }}
              >
                <span style={{ fontWeight: 600, minWidth: 36, color: 'var(--ink)' }}>{m.kuerzel}</span>
                <span style={{ color: 'var(--ink-muted)' }}>{m.name}</span>
                {m.aktiv === 0 && <span style={{ color: 'var(--ink-faint)', fontSize: 11 }}>(inaktiv)</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SubVergleich({ qs, label }) {
  var [alleMA,       setAlleMA]       = React.useState([]);
  var [ma1,          setMa1]          = React.useState('');
  var [ma2,          setMa2]          = React.useState('');
  var [nurGemeinsam, setNurGemeinsam] = React.useState(true);
  var [result,       setResult]       = React.useState(null);
  var [loading,      setLoading]      = React.useState(false);
  var [error,        setError]        = React.useState('');

  React.useEffect(function() {
    fetch('/api/analyse/vergleich')
      .then(function(r) { return r.json(); })
      .then(function(d) { if (d.alle_ma) setAlleMA(d.alle_ma); })
      .catch(function() {});
  }, []);

  React.useEffect(function() {
    if (!ma1 || !ma2 || ma1 === ma2) { setResult(null); return; }
    setLoading(true); setError(''); setResult(null);
    fetch('/api/analyse/vergleich?ma1=' + encodeURIComponent(ma1) + '&ma2=' + encodeURIComponent(ma2) + '&' + qs)
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.error) setError(d.error);
        else setResult(d);
        setLoading(false);
      })
      .catch(function() { setError('Verbindungsfehler'); setLoading(false); });
  }, [ma1, ma2, qs]);

  var tage = React.useMemo(function() {
    if (!result) return [];
    if (!nurGemeinsam) return result.tage;
    return result.tage.filter(function(t) { return t.beide_arbeit; });
  }, [result, nurGemeinsam]);

  var gemeinsamCount  = result ? result.tage.filter(function(t) { return t.beide_arbeit; }).length : 0;
  var gleicherOrtCount = result ? result.tage.filter(function(t) {
    return t.beide_arbeit && t.ma1 && t.ma2 && t.ma1.ort && t.ma2.ort && t.ma1.ort === t.ma2.ort;
  }).length : 0;

  function dienstLabel(s, showOrt) {
    if (!s) return <span style={{ color: 'var(--ink-faint)' }}>—</span>;
    var kat = s.kategorie;
    var textColor = kat === 'Frei' ? 'var(--ink-faint)' : kat === 'Abwesenheit' ? 'var(--amber-600)' : undefined;
    return (
      <span style={{ color: textColor }}>
        <span style={{ fontWeight: 600 }}>{s.anzeigename || s.code}</span>
        {s.beginn && s.ende && (
          <span style={{ color: 'var(--ink-muted)', marginLeft: 6, fontSize: 11.5 }}>
            {s.beginn}–{s.ende}
          </span>
        )}
        {showOrt && s.ort && (
          <span style={{ color: 'var(--ink-faint)', marginLeft: 5, fontSize: 11 }}>
            ({s.ort})
          </span>
        )}
      </span>
    );
  }

  return (
    <div>
      <SectionCard title="Personen wählen">
        <AnalyseHilfe>
          <strong>Was zeigt diese Analyse?</strong> An welchen Tagen haben zwei gewählte Personen gleichzeitig Dienst — nützlich für die Planung von Sitzungen, Übergaben oder gemeinsamen Projekten.<br/>
          <strong style={{ color: 'var(--green-bright-h)' }}>■ Grün</strong> = beide arbeiten am selben Ort — ein gemeinsamer Termin ist möglich.<br/>
          <strong style={{ color: 'var(--amber-600)' }}>■ Gelb</strong> = beide arbeiten, aber an unterschiedlichen Orten — persönliches Treffen schwieriger.<br/>
          <strong>Zeitraum-Filter:</strong> Wird über den Zeitraum-Selector oben rechts gesteuert (Monat, Quartal, Jahr oder freier Bereich).<br/>
          <strong>Filter «Nur gemeinsame Dienste»:</strong> Blendet Tage aus, an denen mindestens eine Person frei oder abwesend ist.
        </AnalyseHilfe>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="field-label">Person 1</div>
            <MaCombo alleMA={alleMA} value={ma1} onChange={setMa1} placeholder="Person 1 suchen…" />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="field-label">Person 2</div>
            <MaCombo alleMA={alleMA} value={ma2} onChange={setMa2} placeholder="Person 2 suchen…" />
          </div>
        </div>
        {ma1 && ma2 && ma1 === ma2 && (
          <div style={{ marginTop: 10, color: 'var(--amber-600)', fontSize: 12.5 }}>
            Bitte zwei verschiedene Personen wählen.
          </div>
        )}
      </SectionCard>

      {loading && (
        <div className="empty-state" style={{ padding: 48 }}>{IcoSpinner}<span>Lade…</span></div>
      )}
      {error && (
        <div className="hint-box amber" style={{ marginTop: 14 }}><span className="glyph">⚠️</span>{error}</div>
      )}

      {result && (
        <React.Fragment>
          {/* Zusammenfassung + Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0 10px', flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>
              <strong style={{ color: 'var(--ink)' }}>{gemeinsamCount}</strong> gemeinsame Arbeitstage
              {gleicherOrtCount > 0 && (
                <span>, davon <strong style={{ color: 'var(--green-bright-h)' }}>{gleicherOrtCount}</strong> am selben Ort</span>
              )}
              <span style={{ marginLeft: 4 }}>in {label}</span>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button className={'chip' + (nurGemeinsam ? ' active' : '')}
                onClick={function() { setNurGemeinsam(true); }}>Nur gemeinsame Dienste</button>
              <button className={'chip' + (!nurGemeinsam ? ' active' : '')}
                onClick={function() { setNurGemeinsam(false); }}>Alle Tage</button>
            </div>
          </div>

          {tage.length === 0 ? (
            <div className="empty-state">
              <span className="glyph">📅</span>
              Keine gemeinsamen Arbeitstage im gewählten Zeitraum.
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Datum</th>
                      <th>Tag</th>
                      <th>{result.ma1.kuerzel} — {result.ma1.name}</th>
                      <th>{result.ma2.kuerzel} — {result.ma2.name}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tage.map(function(t) {
                      var isWE        = t.wochentag === 'Sa' || t.wochentag === 'So';
                      var gleicherOrt = t.beide_arbeit && t.ma1 && t.ma2
                                        && t.ma1.ort && t.ma2.ort && t.ma1.ort === t.ma2.ort;
                      var verschOrt   = t.beide_arbeit && !gleicherOrt;
                      var rowBg       = gleicherOrt ? 'var(--green-bg-soft)'
                                      : verschOrt   ? 'var(--amber-bg-soft)'
                                      : undefined;
                      var showOrt     = t.beide_arbeit && !gleicherOrt;
                      var parts = t.datum.split('-');
                      var datumFmt = parts[2] + '.' + parts[1] + '.' + parts[0];
                      return (
                        <tr key={t.datum} style={{ background: rowBg }}>
                          <td style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                            {datumFmt}
                          </td>
                          <td style={{ fontWeight: isWE ? 600 : 400,
                                       color: isWE ? 'var(--amber-600)' : 'var(--ink-muted)',
                                       whiteSpace: 'nowrap' }}>
                            {t.wochentag}
                          </td>
                          <td>{dienstLabel(t.ma1, showOrt)}</td>
                          <td>{dienstLabel(t.ma2, showOrt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </React.Fragment>
      )}

      {!loading && !result && ma1 && ma2 && ma1 !== ma2 && !error && (
        <div className="empty-state">
          <span className="glyph">📅</span>
          Keine Daten für diesen Zeitraum.
        </div>
      )}
      {!loading && !result && (!ma1 || !ma2 || ma1 === ma2) && !error && (
        <div className="empty-state">
          <span className="glyph">👥</span>
          Zwei Personen wählen um gemeinsame Dienste zu sehen.
        </div>
      )}
    </div>
  );
}

// ── Tausch ──────────────────────────────────────────────────────────────────

function SubTausch({ qs, label }) {
  var [alleMA,     setAlleMA]     = React.useState([]);
  var [ma1,        setMa1]        = React.useState('');
  var [ma2,        setMa2]        = React.useState('');
  var [nurChancen, setNurChancen] = React.useState(false);
  var [result,     setResult]     = React.useState(null);
  var [loading,    setLoading]    = React.useState(false);
  var [error,      setError]      = React.useState('');

  React.useEffect(function() {
    fetch('/api/analyse/vergleich')
      .then(function(r) { return r.json(); })
      .then(function(d) { if (d.alle_ma) setAlleMA(d.alle_ma); })
      .catch(function() {});
  }, []);

  React.useEffect(function() {
    if (!ma1 || !ma2 || ma1 === ma2) { setResult(null); return; }
    setLoading(true); setError(''); setResult(null);
    fetch('/api/analyse/vergleich?ma1=' + encodeURIComponent(ma1) + '&ma2=' + encodeURIComponent(ma2) + '&' + qs)
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.error) setError(d.error);
        else setResult(d);
        setLoading(false);
      })
      .catch(function() { setError('Verbindungsfehler'); setLoading(false); });
  }, [ma1, ma2, qs]);

  function tauschInfo(t) {
    var s1 = t.ma1, s2 = t.ma2;
    var a1 = !!(s1 && s1.kategorie === 'Arbeit');
    var a2 = !!(s2 && s2.kategorie === 'Arbeit');
    var abw1 = !!(s1 && s1.kategorie === 'Abwesenheit');
    var abw2 = !!(s2 && s2.kategorie === 'Abwesenheit');
    if (a1 && a2) {
      if (s1.code !== s2.code) return { type: 'tausch' };
      return { type: 'gleich' };
    }
    if (a1 && !a2 && !abw2) return { type: 'abgabe', richtung: 1 };
    if (a2 && !a1 && !abw1) return { type: 'abgabe', richtung: 2 };
    return { type: 'neutral' };
  }

  var tage = React.useMemo(function() {
    if (!result) return [];
    return result.tage.map(function(t) {
      return Object.assign({}, t, { __tausch: tauschInfo(t) });
    });
  }, [result]);

  var sichtbar = React.useMemo(function() {
    if (!nurChancen) return tage;
    return tage.filter(function(t) { return t.__tausch.type === 'tausch' || t.__tausch.type === 'abgabe'; });
  }, [tage, nurChancen]);

  var tauschCount  = tage.filter(function(t) { return t.__tausch.type === 'tausch'; }).length;
  var abgabeCount  = tage.filter(function(t) { return t.__tausch.type === 'abgabe'; }).length;

  function dienstLabel(s) {
    if (!s) return <span style={{ color: 'var(--ink-faint)' }}>—</span>;
    var kat = s.kategorie;
    var textColor = kat === 'Frei' ? 'var(--ink-faint)' : kat === 'Abwesenheit' ? 'var(--amber-600)' : undefined;
    return (
      <span style={{ color: textColor }}>
        <span style={{ fontWeight: 600 }}>{s.anzeigename || s.code}</span>
        {s.beginn && s.ende && (
          <span style={{ color: 'var(--ink-muted)', marginLeft: 6, fontSize: 11.5 }}>
            {s.beginn}–{s.ende}
          </span>
        )}
        {s.ort && (
          <span style={{ color: 'var(--ink-faint)', marginLeft: 5, fontSize: 11 }}>
            ({s.ort})
          </span>
        )}
      </span>
    );
  }

  function statusBadge(info) {
    if (info.type === 'tausch') return <span className="badge-info" style={{ fontSize: 11 }}>⇄ Tausch möglich</span>;
    if (info.type === 'abgabe') {
      var pfeil = info.richtung === 1 ? (result.ma1.kuerzel + ' → ' + result.ma2.kuerzel) : (result.ma2.kuerzel + ' → ' + result.ma1.kuerzel);
      return <span className="badge-warn" style={{ fontSize: 11 }}>{pfeil}</span>;
    }
    return null;
  }

  return (
    <div>
      <SectionCard title="Personen wählen">
        <AnalyseHilfe>
          <strong>Was zeigt diese Analyse?</strong> Die Dienstpläne zweier gewählter Personen nebeneinander — um zu prüfen, ob und wie sich Dienste tauschen lassen.<br/>
          <strong style={{ color: 'var(--blue-600)' }}>⇄ Tausch möglich</strong> = beide arbeiten am selben Tag, aber mit unterschiedlichem Dienst — ein direkter Tausch der Dienste ist denkbar.<br/>
          <strong style={{ color: 'var(--amber-600)' }}>Pfeil (z. B. AB → CD)</strong> = eine Person arbeitet, die andere ist frei — der Dienst könnte abgegeben bzw. übernommen werden.<br/>
          <strong>Nicht markiert:</strong> beide frei, beide abwesend, gleicher Dienst, oder die freie Person ist an dem Tag abwesend (Urlaub o. ä.) und kann daher nicht übernehmen.<br/>
          <strong>Zeitraum-Filter:</strong> Wird über den Zeitraum-Selector oben rechts gesteuert (Monat, Quartal, Jahr oder freier Bereich).
        </AnalyseHilfe>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="field-label">Person 1</div>
            <MaCombo alleMA={alleMA} value={ma1} onChange={setMa1} placeholder="Person 1 suchen…" />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="field-label">Person 2</div>
            <MaCombo alleMA={alleMA} value={ma2} onChange={setMa2} placeholder="Person 2 suchen…" />
          </div>
        </div>
        {ma1 && ma2 && ma1 === ma2 && (
          <div style={{ marginTop: 10, color: 'var(--amber-600)', fontSize: 12.5 }}>
            Bitte zwei verschiedene Personen wählen.
          </div>
        )}
      </SectionCard>

      {loading && (
        <div className="empty-state" style={{ padding: 48 }}>{IcoSpinner}<span>Lade…</span></div>
      )}
      {error && (
        <div className="hint-box amber" style={{ marginTop: 14 }}><span className="glyph">⚠️</span>{error}</div>
      )}

      {result && (
        <React.Fragment>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0 10px', flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>
              <strong style={{ color: 'var(--blue-600)' }}>{tauschCount}</strong> direkte Tauschmöglichkeiten,{' '}
              <strong style={{ color: 'var(--amber-600)' }}>{abgabeCount}</strong> Abgabe-/Übernahmemöglichkeiten
              <span style={{ marginLeft: 4 }}>in {label}</span>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button className={'chip' + (nurChancen ? ' active' : '')}
                onClick={function() { setNurChancen(true); }}>Nur Tauschmöglichkeiten</button>
              <button className={'chip' + (!nurChancen ? ' active' : '')}
                onClick={function() { setNurChancen(false); }}>Alle Tage</button>
            </div>
          </div>

          {sichtbar.length === 0 ? (
            <div className="empty-state">
              <span className="glyph">🔁</span>
              Keine Tauschmöglichkeiten im gewählten Zeitraum gefunden.
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Datum</th>
                      <th>Tag</th>
                      <th>{result.ma1.kuerzel} — {result.ma1.name}</th>
                      <th>{result.ma2.kuerzel} — {result.ma2.name}</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sichtbar.map(function(t) {
                      var isWE   = t.wochentag === 'Sa' || t.wochentag === 'So';
                      var info   = t.__tausch;
                      var rowBg  = info.type === 'tausch' ? 'var(--blue-50,#eff6ff)'
                                 : info.type === 'abgabe' ? 'var(--amber-bg-soft)'
                                 : undefined;
                      var parts = t.datum.split('-');
                      var datumFmt = parts[2] + '.' + parts[1] + '.' + parts[0];
                      return (
                        <tr key={t.datum} style={{ background: rowBg }}>
                          <td style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                            {datumFmt}
                          </td>
                          <td style={{ fontWeight: isWE ? 600 : 400,
                                       color: isWE ? 'var(--amber-600)' : 'var(--ink-muted)',
                                       whiteSpace: 'nowrap' }}>
                            {t.wochentag}
                          </td>
                          <td>{dienstLabel(t.ma1)}</td>
                          <td>{dienstLabel(t.ma2)}</td>
                          <td>{statusBadge(info)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </React.Fragment>
      )}

      {!loading && !result && ma1 && ma2 && ma1 !== ma2 && !error && (
        <div className="empty-state">
          <span className="glyph">🔁</span>
          Keine Daten für diesen Zeitraum.
        </div>
      )}
      {!loading && !result && (!ma1 || !ma2 || ma1 === ma2) && !error && (
        <div className="empty-state">
          <span className="glyph">👥</span>
          Zwei Personen wählen um Tauschmöglichkeiten zu sehen.
        </div>
      )}
    </div>
  );
}

window.TabAnalysen = TabAnalysen;
