// Tab: Mitarbeiter — E-Mail-Adressen verwalten + Zusammenführen
function TabMitarbeiter({ monat, jahr }) {
  const toast = useToast();
  const [sub, setSub] = React.useState('emails');

  return (
    <div className="fade-in" data-screen-label="Mitarbeiter">
      <PageHead
        label="Personal"
        title="Mitarbeitende"
        subtitle="E-Mail-Adressen pflegen und Mitarbeitende bei Namensänderung zusammenführen."
      />

      <div className="subtabs">
        <button className={'subtab ' + (sub === 'emails' ? 'active' : '')} onClick={function() { setSub('emails'); }}>
          E-Mail-Adressen
        </button>
        <button className={'subtab ' + (sub === 'merge' ? 'active' : '')} onClick={function() { setSub('merge'); }}>
          Zusammenführen
        </button>
      </div>

      {sub === 'emails' ? <SubEmails toast={toast} monat={monat} jahr={jahr} /> : <SubMerge toast={toast} />}
    </div>
  );
}

// ── Sub: E-Mail-Adressen ───────────────────────────────────────────────
function SubEmails({ toast, monat, jahr }) {
  const [data, setData] = React.useState([]);
  const [trends, setTrends] = React.useState({});
  const [edits, setEdits] = React.useState({});
  const [filter, setFilter] = React.useState('alle');
  const [search, setSearch] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [expanded, setExpanded] = React.useState(null);

  React.useEffect(function() {
    var k = window._pendingOpenMa;
    if (k) {
      window._pendingOpenMa = null;
      setExpanded(k);
      setSearch(k);
    }
  }, []);

  React.useEffect(function() {
    fetch('/api/ma/trends')
      .then(function(r) { return r.json(); })
      .then(function(d) { if (d && !d.error) setTrends(d); })
      .catch(function() {});
  }, []);

  const reload = function() {
    setLoading(true);
    const params = new URLSearchParams();
    if (monat) params.set('month', monat);
    if (jahr)  params.set('year', String(jahr));
    fetch('/api/ma/list?' + params.toString())
      .then(function(r) { return r.json(); })
      .then(function(raw) {
        if (Array.isArray(raw)) {
          const normalized = raw.map(function(m) {
            return Object.assign({}, m, {
              pensum: m.pensum_pct != null ? m.pensum_pct : (m.pensum != null ? m.pensum : 100),
              hatPlan: true,
              neu: false,
            });
          });
          setData(normalized);
        }
        setLoading(false);
      })
      .catch(function() { setLoading(false); });
  };

  React.useEffect(function() { setEdits({}); reload(); }, [monat, jahr]);

  const setEmail = function(k, v) {
    setEdits(function(cur) {
      const orig = (data.find(function(m) { return m.kuerzel === k; }) || {}).email || '';
      const n = Object.assign({}, cur);
      if (v === orig) delete n[k];
      else n[k] = v;
      return n;
    });
  };

  const changedCount = Object.keys(edits).length;

  const save = async function() {
    try {
      const resp = await fetch('/api/ma/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(edits),
      });
      const json = await resp.json();
      if (json.ok) {
        toast.show(json.updated + ' ' + (json.updated === 1 ? 'Eintrag' : 'Einträge') + ' gespeichert');
        setEdits({});
        reload();
      } else {
        toast.show(json.error || 'Fehler beim Speichern', 'error');
      }
    } catch(e) {
      toast.show('Verbindungsfehler', 'error');
    }
  };

  const discard = function() { setEdits({}); };

  const toggleExpand = function(kuerzel) {
    setExpanded(function(cur) { return cur === kuerzel ? null : kuerzel; });
  };

  const generateWebcalToken = function(kuerzel, action) {
    fetch('/api/ma/webcal_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kuerzel, action }),
    })
      .then(function(r) { return r.json(); })
      .then(function(j) {
        if (j.ok) {
          toast.show(action === 'revoke' ? 'Webcal-Link widerrufen' : 'Neuer Webcal-Link generiert');
          reload();
        } else {
          toast.show(j.error || 'Fehler', 'error');
        }
      })
      .catch(function() { toast.show('Verbindungsfehler', 'error'); });
  };

  const copyToClipboard = function(text) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function() {
        toast.show('Link kopiert');
      }).catch(function() { toast.show('Kopieren fehlgeschlagen', 'error'); });
    } else {
      // Fallback für HTTP (kein Secure Context)
      var el = document.createElement('textarea');
      el.value = text;
      el.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.appendChild(el);
      el.focus();
      el.select();
      try {
        document.execCommand('copy');
        toast.show('Link kopiert');
      } catch(e) {
        toast.show('Kopieren fehlgeschlagen — Link bitte manuell markieren', 'error');
      }
      document.body.removeChild(el);
    }
  };

  const setWebcalModus = function(kuerzel, modus) {
    fetch('/api/ma/webcal_modus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kuerzel, modus }),
    })
      .then(function(r) { return r.json(); })
      .then(function(j) {
        if (j.ok) { reload(); }
        else { toast.show(j.error || 'Fehler', 'error'); }
      })
      .catch(function() { toast.show('Verbindungsfehler', 'error'); });
  };

  const sendWebcalLink = function(kuerzel, pw) {
    setWebcalMailState({ kuerzel, pw, sending: true, result: null });
    fetch('/api/mail/webcal-link-senden', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kuerzel, smtp_pw: pw }),
    })
      .then(function(r) { return r.json(); })
      .then(function(j) {
        if (j.ok) {
          setWebcalMailState({ kuerzel, pw: '', sending: false, result: { ok: true, empfaenger: j.empfaenger } });
        } else {
          setWebcalMailState({ kuerzel, pw, sending: false, result: { error: j.error || 'Fehler beim Senden' } });
        }
      })
      .catch(function() {
        setWebcalMailState({ kuerzel, pw, sending: false, result: { error: 'Verbindungsfehler' } });
      });
  };

  const toggleNieAktivieren = function(kuerzel, wert) {
    fetch('/api/ma/nie_aktivieren', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kuerzel, wert }),
    })
      .then(function(r) { return r.json(); })
      .then(function(j) {
        if (j.ok) {
          toast.show(wert ? kuerzel + ' wird beim Import ignoriert' : kuerzel + ' wird wieder importiert');
          reload();
        } else {
          toast.show(j.error || 'Fehler', 'error');
        }
      })
      .catch(function() { toast.show('Verbindungsfehler', 'error'); });
  };

  const [webcalMailState, setWebcalMailState] = React.useState(null);
  // null | { kuerzel, pw, sending, result }

  const [showIgnoriert, setShowIgnoriert] = React.useState(false);

  const ignoriert = data.filter(function(m) { return m.nie_aktivieren === 1; });
  const baseData  = showIgnoriert ? data : data.filter(function(m) { return m.nie_aktivieren !== 1; });

  const filtered = baseData.filter(function(m) {
    const curEmail = edits[m.kuerzel] !== undefined ? edits[m.kuerzel] : (m.email || '');
    if (filter === 'leer'    && curEmail) return false;
    if (filter === 'aktiv'   && !m.aktiv) return false;
    if (filter === 'inaktiv' && m.aktiv)  return false;
    if (search) {
      const hay = ((m.vorname || '') + ' ' + (m.nachname || '') + ' ' + (m.kuerzel || '')).toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const counts = {
    alle:    baseData.length,
    leer:    baseData.filter(function(m) { return !(edits[m.kuerzel] !== undefined ? edits[m.kuerzel] : (m.email || '')); }).length,
    aktiv:   baseData.filter(function(m) { return m.aktiv; }).length,
    inaktiv: baseData.filter(function(m) { return !m.aktiv; }).length,
  };

  return (
    <Card
      title={data.length + ' Mitarbeitende'}
      right={(
        <input
          type="search" className="input"
          placeholder="🔍 Name oder Kürzel suchen…"
          value={search} onChange={function(e) { setSearch(e.target.value); }}
          style={{ width: 220, padding: '6px 12px', fontSize: '0.85rem' }}
        />
      )}
    >
      {loading ? (
        <div className="empty-state">
          <span className="glyph">⏳</span>
          Lade Mitarbeitende…
        </div>
      ) : (
        <React.Fragment>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
            <div className="chip-row">
              <button className={'chip ' + (filter === 'alle'    ? 'active' : '')} onClick={function() { setFilter('alle'); }}>Alle <span className="count">{counts.alle}</span></button>
              <button className={'chip ' + (filter === 'leer'    ? 'active' : '')} onClick={function() { setFilter('leer'); }}>Ohne E-Mail <span className="count">{counts.leer}</span></button>
              <button className={'chip ' + (filter === 'aktiv'   ? 'active' : '')} onClick={function() { setFilter('aktiv'); }}>Aktive <span className="count">{counts.aktiv}</span></button>
              <button className={'chip ' + (filter === 'inaktiv' ? 'active' : '')} onClick={function() { setFilter('inaktiv'); }}>Inaktive <span className="count">{counts.inaktiv}</span></button>
              {ignoriert.length > 0 && (
                <button
                  className={'chip chip-ignoriert ' + (showIgnoriert ? 'active' : '')}
                  onClick={function() { setShowIgnoriert(function(v) { return !v; }); }}
                >
                  Ignorierte <span className="count">{ignoriert.length}</span>
                </button>
              )}
            </div>
          </div>

          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 26 }} />
                  <th style={{ width: 26 }} />
                  <th>Name</th>
                  <th style={{ width: 90 }}>Kürzel</th>
                  <th style={{ width: 110 }}>Pensum</th>
                  <th style={{ width: 100 }}>Trend 6&nbsp;Mt.</th>
                  <th>E-Mail-Adresse</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} className="empty-state">
                    <span className="glyph">🔍</span>
                    {search ? 'Keine Treffer für „' + search + '"' : 'Keine Einträge.'}
                  </td></tr>
                ) : filtered.map(function(m) {
                  const edit = edits[m.kuerzel];
                  const current = edit !== undefined ? edit : (m.email || '');
                  const isEmpty = !current;
                  const isChanged = edit !== undefined;
                  const pensum = m.pensum || 0;
                  const isExpanded = expanded === m.kuerzel;
                  return (
                    <React.Fragment key={m.kuerzel}>
                    <tr className={(!m.aktiv ? 'row-inaktiv' : '') + (m.neu ? ' row-neu' : '') + (isExpanded ? ' row-expanded' : '')}
                        style={{ cursor: 'pointer' }}
                        onClick={function(e) {
                          if (e.target.tagName === 'INPUT') return;
                          toggleExpand(m.kuerzel);
                        }}>
                      <td>
                        <span className={'status-dot ' + (isEmpty ? 'empty' : 'ok')} />
                      </td>
                      <td style={{ textAlign: 'center', color: 'var(--text-muted)', userSelect: 'none', fontSize: 11 }}>
                        {isExpanded ? '▾' : '▸'}
                      </td>
                      <td className="name-cell">
                        <span style={{ fontWeight: 600 }}>{m.vorname} {m.nachname}</span>
                        {m.neu && <span style={{ background: 'var(--red-bright)', color: '#fff', fontSize: 'var(--text-micro)', padding: '1px 6px', borderRadius: 'var(--radius-xs)', fontWeight: 700 }}>NEU</span>}
                        {!m.aktiv && <span className="badge-inactive">inaktiv</span>}
                        {m.nie_aktivieren === 1 && <span className="badge-ignoriert">ignoriert</span>}
                      </td>
                      <td><span className="kuerzel-pill">{m.kuerzel}</span></td>
                      <td>
                        <span className="pensum-bar">
                          <span className="track"><span className="fill" style={{ width: pensum + '%' }} /></span>
                          {pensum}%
                        </span>
                      </td>
                      <td>
                        <Sparkline values={trends[m.kuerzel] || []} />
                      </td>
                      <td className="email-cell" onClick={function(e) { e.stopPropagation(); }}>
                        <input
                          type="email"
                          className={'input ' + (isChanged ? 'changed' : (isEmpty ? 'empty' : 'filled'))}
                          value={current}
                          onChange={function(e) { setEmail(m.kuerzel, e.target.value); }}
                          placeholder="vorname.nachname@…"
                          disabled={!m.aktiv}
                        />
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="expand-row">
                        <td colSpan={7} style={{ padding: '0 16px 16px 52px', background: 'var(--bg-subtle, #f8f9fa)' }}>
                          <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-muted)', marginBottom: 6, paddingTop: 12 }}>
                            Monatsplan {monat} {jahr}
                          </div>
                          <MaMonthCalendar kuerzel={m.kuerzel} monat={monat} jahr={String(jahr)} />
                          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--hairline)' }}>
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', fontSize: 13 }}
                                   onClick={function(e) { e.stopPropagation(); }}>
                              <input
                                type="checkbox"
                                checked={m.nie_aktivieren === 1}
                                onChange={function(e) { e.stopPropagation(); toggleNieAktivieren(m.kuerzel, e.target.checked); }}
                              />
                              Beim Import ignorieren — wird nie aktiv geschaltet
                            </label>
                            {m.nie_aktivieren === 1 && (
                              <p style={{ margin: '4px 0 0 26px', fontSize: 12, color: 'var(--ink-muted)' }}>
                                Dieser Eintrag wird beim nächsten Import übersprungen. Bestehende Schichten bleiben erhalten.
                              </p>
                            )}
                          </div>

                          {/* ── Webcal-Abo ── */}
                          {m.nie_aktivieren !== 1 && (
                            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--hairline)' }}>
                              <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Kalender-Abo (Webcal)</div>
                              {m.webcal_token ? (function() {
                                var _CTX  = window.SERVER_CONTEXT || {};
                                var _base = (_CTX.webcal_base_url || '').replace(/\/$/, '') || window.location.origin;
                                var _path = '/ics/webcal/' + m.webcal_token + '/Dienstplan_' + m.kuerzel.replace(/ /g, '_') + '.ics';
                                var _webcalUrl = _base.replace(/^https?:/, 'webcal:') + _path;
                                var _httpsUrl  = _base + _path;
                                return (
                                <React.Fragment>
                                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <code style={{ fontSize: 11, background: 'var(--bg-page)', border: '1px solid var(--hairline)', borderRadius: 6, padding: '4px 8px', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink-muted)' }}>
                                      {_webcalUrl}
                                    </code>
                                    <button className="btn btn-outline btn-sm" onClick={function(e) {
                                      e.stopPropagation();
                                      copyToClipboard(_webcalUrl);
                                    }}>Kopieren</button>
                                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red-500)' }} onClick={function(e) {
                                      e.stopPropagation();
                                      if (window.confirm('Webcal-Link widerrufen? Der bisherige Link hört sofort auf zu funktionieren.')) {
                                        generateWebcalToken(m.kuerzel, 'revoke');
                                      }
                                    }}>Widerrufen</button>
                                  </div>
                                  <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--ink-muted)' }}>
                                    Diesen Link im Kalender-Programm als Abonnement hinzufügen (webcal://…). Wer die URL kennt, kann die Schichten dieses MA einsehen.
                                  </p>
                                  <button className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={function(e) {
                                    e.stopPropagation();
                                    if (window.confirm('Neues Token generieren? Der bisherige Link hört sofort auf zu funktionieren.')) {
                                      generateWebcalToken(m.kuerzel, 'generate');
                                    }
                                  }}>Neues Token generieren</button>
                                </React.Fragment>
                                );
                              })() : (
                                <React.Fragment>
                                  <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--ink-muted)' }}>
                                    Kein aktiver Link. Nach dem Erstellen kann dieser Link direkt im Kalender-Programm als Abonnement eingetragen werden.
                                  </p>
                                  <button className="btn btn-outline btn-sm" onClick={function(e) {
                                    e.stopPropagation();
                                    generateWebcalToken(m.kuerzel, 'generate');
                                  }}>Link erstellen</button>
                                </React.Fragment>
                              )}

                              {/* Versandmodus (nur wenn E-Mail vorhanden) */}
                              {(edits[m.kuerzel] !== undefined ? edits[m.kuerzel] : (m.email || '')) && (
                                <div style={{ marginTop: 12 }} onClick={function(e) { e.stopPropagation(); }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                                    <label className="field-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>Monatlicher Versand</label>
                                    <select
                                      className="input"
                                      style={{ maxWidth: 210 }}
                                      value={m.webcal_mail_modus || 'ics'}
                                      onChange={function(e) { setWebcalModus(m.kuerzel, e.target.value); }}
                                    >
                                      <option value="ics">ICS-Anhang</option>
                                      <option value="webcal">Kein Versand (nur Abo)</option>
                                      <option value="beide">ICS + Webcal-Link im Text</option>
                                    </select>
                                  </div>

                                  {/* Webcal-Link manuell versenden (nur wenn Token vorhanden) */}
                                  {m.webcal_token && (
                                    <div style={{ borderTop: '1px dashed var(--hairline)', paddingTop: 10 }}>
                                      {webcalMailState && webcalMailState.kuerzel === m.kuerzel && webcalMailState.result && webcalMailState.result.ok ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                          <span style={{ fontSize: 12, color: 'var(--green-500)' }}>
                                            ✓ Link gesendet an {webcalMailState.result.empfaenger}
                                          </span>
                                          <button className="btn btn-ghost btn-sm" onClick={function() { setWebcalMailState(null); }}>×</button>
                                        </div>
                                      ) : webcalMailState && webcalMailState.kuerzel === m.kuerzel ? (
                                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                          <input
                                            type="password"
                                            className="input"
                                            style={{ maxWidth: 180, fontSize: 12 }}
                                            placeholder="SMTP-Passwort / Token"
                                            value={webcalMailState.pw}
                                            autoFocus
                                            onChange={function(e) { setWebcalMailState(Object.assign({}, webcalMailState, { pw: e.target.value, result: null })); }}
                                            onKeyDown={function(e) {
                                              if (e.key === 'Enter' && webcalMailState.pw.trim()) sendWebcalLink(m.kuerzel, webcalMailState.pw.trim());
                                              if (e.key === 'Escape') setWebcalMailState(null);
                                            }}
                                          />
                                          <button className="btn btn-primary btn-sm" style={{ fontSize: 12 }}
                                            disabled={webcalMailState.sending || !webcalMailState.pw.trim()}
                                            onClick={function() { sendWebcalLink(m.kuerzel, webcalMailState.pw.trim()); }}>
                                            {webcalMailState.sending ? 'Sende…' : 'Senden'}
                                          </button>
                                          <button className="btn btn-ghost btn-sm" onClick={function() { setWebcalMailState(null); }}>Abbrechen</button>
                                          {webcalMailState.result && webcalMailState.result.error && (
                                            <span style={{ fontSize: 11, color: 'var(--red-500)', width: '100%' }}>
                                              ✗ {webcalMailState.result.error}
                                            </span>
                                          )}
                                        </div>
                                      ) : (
                                        <button className="btn btn-outline btn-sm" style={{ fontSize: 12 }}
                                          onClick={function() { setWebcalMailState({ kuerzel: m.kuerzel, pw: '', sending: false, result: null }); }}>
                                          Webcal-Link per Mail senden
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {changedCount > 0 && (
            <div className="save-bar fade-in">
              <span>✏️</span>
              <span>
                <strong>{changedCount}</strong> {changedCount === 1 ? 'Änderung' : 'Änderungen'} noch nicht gespeichert
              </span>
              <span className="spacer" />
              <button className="btn btn-ghost btn-sm" onClick={discard}>Verwerfen</button>
              <button className="btn btn-success btn-sm" onClick={save}>💾 Speichern</button>
            </div>
          )}
        </React.Fragment>
      )}
    </Card>
  );
}

// ── Durchsuchbares MA-Auswahlfeld ─────────────────────────────────────
function MaCombobox({ liste, value, onChange, placeholder }) {
  const [query, setQuery]   = React.useState('');
  const [open, setOpen]     = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const wrapRef = React.useRef(null);

  const selected = liste.find(function(m) { return m.kuerzel === value; });
  const display  = selected
    ? selected.nachname + ' ' + selected.vorname + ' [' + selected.kuerzel + ']'
    : '';

  const filtered = React.useMemo(function() {
    const q = query.toLowerCase();
    if (!q) return liste;
    return liste.filter(function(m) {
      return (m.nachname + ' ' + m.vorname + ' ' + m.kuerzel).toLowerCase().includes(q);
    });
  }, [liste, query]);

  function select(m) {
    onChange(m.kuerzel);
    setQuery('');
    setOpen(false);
    setActive(-1);
  }

  function clear() {
    onChange('');
    setQuery('');
    setOpen(false);
  }

  function onInputChange(e) {
    setQuery(e.target.value);
    setOpen(true);
    setActive(-1);
    if (!e.target.value) onChange('');
  }

  function onKeyDown(e) {
    if (!open) { if (e.key === 'ArrowDown' || e.key === 'Enter') setOpen(true); return; }
    if (e.key === 'ArrowDown')  { e.preventDefault(); setActive(function(a) { return Math.min(a + 1, filtered.length - 1); }); }
    if (e.key === 'ArrowUp')    { e.preventDefault(); setActive(function(a) { return Math.max(a - 1, 0); }); }
    if (e.key === 'Enter')      { if (active >= 0 && filtered[active]) { e.preventDefault(); select(filtered[active]); } }
    if (e.key === 'Escape')     { setOpen(false); setQuery(''); }
  }

  React.useEffect(function() {
    function onOutside(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onOutside);
    return function() { document.removeEventListener('mousedown', onOutside); };
  }, []);

  const inputVal = open ? query : display;

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          className="input"
          style={{ width: '100%', paddingRight: value ? 28 : 10 }}
          value={inputVal}
          placeholder={placeholder || '— Suchen oder wählen —'}
          onChange={onInputChange}
          onFocus={function() { setOpen(true); setQuery(''); }}
          onKeyDown={onKeyDown}
          autoComplete="off"
        />
        {value && (
          <button
            onClick={clear}
            style={{ position: 'absolute', right: 6, background: 'none', border: 'none',
                     cursor: 'pointer', color: 'var(--ink-muted)', fontSize: 14, padding: '0 2px' }}
            tabIndex={-1}
            title="Auswahl aufheben"
          >✕</button>
        )}
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: '#ffffff', border: '1.5px solid var(--blue-400)',
          borderRadius: 7, boxShadow: '0 4px 16px rgba(0,0,0,.12)',
          maxHeight: 220, overflowY: 'auto', marginTop: 2,
        }}>
          {filtered.length === 0 && (
            <div style={{ padding: '8px 12px', color: 'var(--ink-muted)', fontSize: 13 }}>Kein Treffer</div>
          )}
          {filtered.map(function(m, i) {
            return (
              <div
                key={m.kuerzel}
                onMouseDown={function() { select(m); }}
                style={{
                  padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                  background: i === active ? '#eff6ff' : '#ffffff',
                  borderBottom: '1px solid var(--hairline)',
                  color: m.aktiv ? 'var(--ink)' : 'var(--ink-muted)',
                }}
              >
                <strong>{m.nachname} {m.vorname}</strong>
                <span style={{ marginLeft: 6, fontFamily: 'monospace', fontSize: 11,
                               background: 'var(--surface-alt)', padding: '1px 5px', borderRadius: 4 }}>
                  {m.kuerzel}
                </span>
                {!m.aktiv && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--ink-muted)' }}>(inaktiv)</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Sub: Zusammenführen ────────────────────────────────────────────────
function SubMerge({ toast }) {
  const [quell, setQuell] = React.useState('');
  const [ziel, setZiel] = React.useState('');
  const [vorschau, setVorschau] = React.useState(null);
  const [liste, setListe] = React.useState([]);
  const [verlauf, setVerlauf] = React.useState([]);
  const [undoLaufend, setUndoLaufend] = React.useState(null);

  const reloadVerlauf = function() {
    fetch('/api/ma/merge/verlauf')
      .then(function(r) { return r.json(); })
      .then(function(data) { if (Array.isArray(data)) setVerlauf(data); })
      .catch(function() {});
  };

  React.useEffect(function() {
    fetch('/api/ma/alle')
      .then(function(r) { return r.json(); })
      .then(function(data) { if (Array.isArray(data)) setListe(data); })
      .catch(function() {});
    reloadVerlauf();
  }, []);

  const rueckgaengig = async function(quellKuerzel, quellName, zielName) {
    if (!window.confirm(
      `Zusammenführung rückgängig machen?\n\n"${quellName}" wird reaktiviert und erhält seine Schichten zurück.\nKonfliktschichten (die beim Merge gelöscht wurden) können nicht wiederhergestellt werden.`
    )) return;
    setUndoLaufend(quellKuerzel);
    try {
      const resp = await fetch('/api/ma/unmerge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quell: quellKuerzel }),
      });
      const json = await resp.json();
      if (json.error) { toast.show(json.error, 'error'); return; }
      toast.show(`Rückgängig: ${json.zurueckverschoben} Schicht${json.zurueckverschoben !== 1 ? 'en' : ''} zurückverschoben`);
      reloadVerlauf();
    } catch(e) {
      toast.show('Verbindungsfehler', 'error');
    } finally {
      setUndoLaufend(null);
    }
  };

  const pruefen = async function() {
    if (!quell || !ziel) { toast.show('Bitte beide Einträge wählen', 'error'); return; }
    if (quell === ziel)  { toast.show('Quell und Ziel sind identisch', 'error'); return; }
    const q = liste.find(function(m) { return m.kuerzel === quell; });
    const z = liste.find(function(m) { return m.kuerzel === ziel; });
    setVorschau({ q: q, z: z, schichten: '?', konflikte: 0 });
  };

  const ausfuehren = async function() {
    if (!window.confirm('Wirklich zusammenführen? Konflikte (gleicher Tag bei beiden MA) werden dabei gelöscht und können nicht wiederhergestellt werden.')) return;
    try {
      const resp = await fetch('/api/ma/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quell: quell, ziel: ziel }),
      });
      const json = await resp.json();
      if (json.error) { toast.show(json.error, 'error'); return; }
      toast.show('Zusammenführung abgeschlossen');
      setQuell(''); setZiel(''); setVorschau(null);
      reloadVerlauf();
    } catch(e) {
      toast.show('Verbindungsfehler', 'error');
    }
  };

  return (
    <React.Fragment>
    <Card
      title="Mitarbeitende zusammenführen"
      subtitle="Bei Namensänderung (z. B. Heirat) zwei Einträge zu einem zusammenführen. Alle Schichten werden übertragen, der alte Eintrag wird deaktiviert."
    >
      <div className="merge-row">
        <div>
          <label className="field-label">Alter Eintrag <span className="muted">— wird deaktiviert</span></label>
          <MaCombobox
            liste={liste}
            value={quell}
            onChange={function(v) { setQuell(v); setVorschau(null); }}
            placeholder="— Suchen oder wählen —"
          />
        </div>
        <div className="merge-arrow">→</div>
        <div>
          <label className="field-label">Neuer Eintrag <span className="muted">— erhält alle Schichten</span></label>
          <MaCombobox
            liste={liste}
            value={ziel}
            onChange={function(v) { setZiel(v); setVorschau(null); }}
            placeholder="— Suchen oder wählen —"
          />
        </div>
      </div>

      <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
        <button className="btn btn-outline" onClick={pruefen}>Prüfen</button>
        {vorschau && (
          <span className="muted small fade-in">
            Schichten gefunden ·{' '}
            <strong>{vorschau.konflikte}</strong> Konflikte
          </span>
        )}
      </div>

      {vorschau && (
        <div className="fade-in" style={{ marginTop: 16 }}>
          <Hint glyph="⚠️" tone="amber">
            <strong>Achtung — Konfliktschichten (gleicher Tag bei beiden MA) werden unwiederbringlich gelöscht.</strong><br />
            Alle anderen Schichten von <strong>{vorschau.q.nachname} {vorschau.q.vorname}</strong> [<code>{vorschau.q.kuerzel}</code>]
            werden zu <strong>{vorschau.z.nachname} {vorschau.z.vorname}</strong> [<code>{vorschau.z.kuerzel}</code>] verschoben.
            Der alte Eintrag wird deaktiviert und kann später rückgängig gemacht werden.
          </Hint>
          <button className="btn btn-danger" onClick={ausfuehren}>
            <span>🔗</span> Jetzt zusammenführen
          </button>
        </div>
      )}
    </Card>

    {verlauf.length > 0 && (
      <Card title="Verlauf" style={{ marginTop: 'var(--space-4)' }}>
        <div className="mini-list">
          <div className="mini-list-head">
            <strong>{verlauf.length} Zusammenführung{verlauf.length !== 1 ? 'en' : ''}</strong>
          </div>
          {verlauf.map(function(v, i) {
            const quellName = [v.vorname, v.nachname].filter(Boolean).join(' ') || v.kuerzel;
            const zielName  = [v.ziel_vorname, v.ziel_nachname].filter(Boolean).join(' ') || v.ziel_kuerzel;
            const laufend   = undoLaufend === v.kuerzel;
            return (
              <div key={i} className="mini-row" style={{ cursor: 'default' }}>
                <span style={{ fontSize: 16 }}>🔗</span>
                <span className="name">
                  <span className="kuerzel-pill">{v.kuerzel}</span>{' '}
                  {v.vorname} {v.nachname}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>→</span>
                <span className="name">
                  <span className="kuerzel-pill">{v.ziel_kuerzel}</span>{' '}
                  {v.ziel_vorname} {v.ziel_nachname}
                </span>
                <span className="muted small">{fmtDatum(v.datum)}</span>
                <button
                  className="btn btn-outline btn-sm"
                  disabled={laufend}
                  onClick={function() { rueckgaengig(v.kuerzel, quellName, zielName); }}
                  title="Zusammenführung rückgängig machen"
                  style={{ marginLeft: 'auto', fontSize: 12, padding: '2px 8px' }}
                >
                  {laufend ? '…' : '↩ Rückgängig'}
                </button>
              </div>
            );
          })}
        </div>
      </Card>
    )}
    </React.Fragment>
  );
}

window.TabMitarbeiter = TabMitarbeiter;
