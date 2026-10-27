// Tab: Versand — ICS pro Mitarbeiter versenden + erstellte Kalender-Dateien
function TabMail({ monat, jahr }) {
  const toast = useToast();
  const { lines, running, start } = useStreamingLog();

  const [modus, setModus] = React.useState('nur_aenderungen');
  const [maListe, setMaListe] = React.useState([]);
  const [aenderungen, setAenderungen] = React.useState([]);
  const [auswahl, setAuswahl] = React.useState(new Set());
  const [auswahlNurAend, setAuswahlNurAend] = React.useState(false);
  const [smtpPw, setSmtpPw] = React.useState('');
  const [testAn, setTestAn] = React.useState('');
  const [expanded, setExpanded] = React.useState(null);
  const [preview, setPreview] = React.useState(null);
  const [icsPreview, setIcsPreview] = React.useState(null); // {kuerzel, name, events}
  const [mailTpls, setMailTpls] = React.useState(null);
  const [versandLog, setVersandLog] = React.useState({});
  const [icsHistorie, setIcsHistorie] = React.useState([]);
  const [icsSearch, setIcsSearch] = React.useState('');
  const [icsOpen, setIcsOpen] = React.useState(null);

  React.useEffect(function() {
    fetch('/api/files/ics')
      .then(function(r) { return r.json(); })
      .then(function(data) { if (Array.isArray(data)) setIcsHistorie(data); })
      .catch(function() {});
  }, []);

  React.useEffect(function() {
    fetch('/api/settings')
      .then(function(r) { return r.json(); })
      .then(function(d) {
        setMailTpls({
          betreff: d.email_betreff || d.email_betreff_default || '',
          text:    d.email_text    || d.email_text_default    || '',
        });
      })
      .catch(function() {});
  }, []);

  // MA-Liste laden
  React.useEffect(function() {
    fetch('/api/ma/list')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (Array.isArray(data)) {
          setMaListe(data);
          setAuswahl(new Set(data.filter(function(m) { return m.email && m.aktiv && m.webcal_mail_modus !== 'webcal'; }).map(function(m) { return m.kuerzel; })));
        }
      })
      .catch(function() {});
  }, []);

  const loadVersandLog = function() {
    fetch('/api/mail/versand-log?month=' + monat + '&year=' + jahr)
      .then(function(r) { return r.json(); })
      .then(function(data) { if (data && typeof data === 'object') setVersandLog(data); })
      .catch(function() {});
  };

  React.useEffect(function() { loadVersandLog(); }, [monat, jahr]);

  // Änderungen laden wenn modus = nur_aenderungen oder bei Monat/Jahr-Wechsel
  React.useEffect(function() {
    fetch('/api/mail/vorschau?month=' + monat + '&year=' + jahr)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (Array.isArray(data)) {
          setAenderungen(data.map(function(a) {
            return Object.assign({}, a, { diffs: [] });
          }));
        }
      })
      .catch(function() { setAenderungen([]); });
  }, [monat, jahr]);

  function fmtSent(ts) {
    if (!ts) return null;
    const parts = ts.split(' ');
    const d = (parts[0] || '').split('-');
    if (d.length < 3) return ts.substring(0, 10);
    return d[2] + '.' + d[1] + '.' + d[0] + ' ' + (parts[1] || '').substring(0, 5);
  }

  const empfaengerListe = maListe.filter(function(m) { return m.email && m.aktiv && m.webcal_mail_modus !== 'webcal'; });
  const aendKuerzel = new Set(aenderungen.map(function(a) { return a.kuerzel; }));

  const filteredAuswahl = auswahlNurAend
    ? empfaengerListe.filter(function(m) { return aendKuerzel.has(m.kuerzel); })
    : empfaengerListe;

  const sendList =
    modus === 'alle' ? empfaengerListe :
    modus === 'nur_aenderungen'
      ? empfaengerListe.filter(function(m) { return aendKuerzel.has(m.kuerzel); })
      : empfaengerListe.filter(function(m) { return auswahl.has(m.kuerzel); });

  const toggle = function(k) {
    setAuswahl(function(cur) {
      const n = new Set(cur);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  };

  const toggleExpand = function(kuerzel) {
    setExpanded(function(cur) { return cur === kuerzel ? null : kuerzel; });
  };

  function fmtTpl(tpl, vars) {
    return tpl.replace(/\{(\w+)\}/g, function(_, k) { return vars[k] != null ? vars[k] : '{' + k + '}'; });
  }

  const openIcsPreview = function(kuerzel, name) {
    setIcsPreview({ kuerzel, name, events: null, loading: true, error: '' });
    fetch('/api/ics/vorschau?kuerzel=' + encodeURIComponent(kuerzel)
        + '&month=' + encodeURIComponent(monat) + '&year=' + encodeURIComponent(jahr))
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d && d.error) {
          setIcsPreview(function(p) { return Object.assign({}, p, { loading: false, error: d.error }); });
        } else {
          setIcsPreview(function(p) { return Object.assign({}, p, { loading: false, events: Array.isArray(d) ? d : [] }); });
        }
      })
      .catch(function() {
        setIcsPreview(function(p) { return Object.assign({}, p, { loading: false, error: 'Verbindungsfehler' }); });
      });
  };

  const sendTest = async function() {
    if (!testAn || !smtpPw || running || sendList.length === 0) return;
    const firstMa = sendList[0];
    const data = new FormData();
    data.set('month', monat);
    data.set('year', String(jahr));
    data.set('dry_run', '0');
    data.set('empfaenger_modus', 'auswahl');
    data.set('selected_ma', firstMa.kuerzel);
    data.set('smtp_pw', smtpPw);
    data.set('test_an', testAn);
    try {
      const resp = await fetch('/api/mail', { method: 'POST', body: data });
      const json = await resp.json();
      if (json.error) { toast.show(json.error, 'error'); return; }
      start(json.task_id, function() { toast.show('Testmail gesendet'); });
    } catch(e) {
      toast.show('Verbindungsfehler', 'error');
    }
  };

  const openPreview = function(ma) {
    if (!ma) ma = sendList[0];
    if (!ma) return;
    const vars = {
      monat: monat, jahr: String(jahr),
      ma_name: (ma.vorname || '') + ' ' + (ma.nachname || ''),
      kuerzel: ma.kuerzel,
      vorname: ma.vorname || ma.kuerzel,
    };
    setPreview({
      ma: ma,
      monat: monat,
      jahr: jahr,
      betreff: mailTpls ? fmtTpl(mailTpls.betreff, vars) : 'Dienstplan ' + monat + ' ' + jahr,
      body:    mailTpls ? fmtTpl(mailTpls.text,    vars) : '(Templates werden geladen…)',
      anhang:  'Dienstplan_' + (ma.nachname || ma.kuerzel) + '_' + monat + '_' + jahr + '.ics',
    });
  };

  const alsVersendetMarkieren = async function() {
    if (!window.confirm(monat + ' ' + jahr + ' als versendet markieren?\n\nDadurch wird für alle Mitarbeitenden ein manueller Versand-Eintrag gesetzt, ohne dass Mails verschickt werden.')) return;
    try {
      const resp = await fetch('/api/mail/als-versendet-markieren', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: monat, year: String(jahr) }),
      });
      const json = await resp.json();
      if (json.error) { toast.show(json.error, 'error'); return; }
      toast.show(monat + ' ' + jahr + ' als versendet markiert (' + json.count + ' MA)');
      loadVersandLog();
    } catch(e) {
      toast.show('Fehler: ' + (e.message || 'Netzwerkfehler'), 'error');
    }
  };

  const send = async function(dryRun) {
    if (running) return;
    if (!dryRun && !smtpPw) { toast.show('SMTP-Passwort erforderlich', 'error'); return; }
    const data = new FormData();
    data.set('month', monat);
    data.set('year', String(jahr));
    data.set('dry_run', dryRun ? '1' : '0');
    data.set('empfaenger_modus', modus);
    data.set('smtp_pw', smtpPw);
    if (modus === 'auswahl') data.set('selected_ma', [...auswahl].join(','));
    if (testAn) data.set('test_an', testAn);
    try {
      const resp = await fetch('/api/mail', { method: 'POST', body: data });
      const json = await resp.json();
      if (json.error) { toast.show(json.error, 'error'); return; }
      start(json.task_id, function() {
        toast.show(dryRun ? 'Vorschau fertig' : 'Versand abgeschlossen');
        if (!dryRun) loadVersandLog();
      });
    } catch(e) {
      toast.show('Verbindungsfehler', 'error');
    }
  };

  return (
    <div className="fade-in" data-screen-label="Versand">
      <PageHead
        label="Workflow"
        title="Versand"
        subtitle="Persönliche Kalender-Datei (.ics) an Mitarbeitende senden — alle, nur geänderte oder eine eigene Auswahl."
      />

      <div className="split-main-aside">
      {/* Linke Spalte */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      <Card title="Empfänger" right={monat + ' ' + jahr}>
        <div className="chip-row" style={{ marginBottom: 16 }}>
          <button
            className={'chip ' + (modus === 'alle' ? 'active' : '')}
            onClick={function() { setModus('alle'); setExpanded(null); }}
          >Alle mit E-Mail <span className="count">{empfaengerListe.length}</span></button>
          <button
            className={'chip ' + (modus === 'nur_aenderungen' ? 'active' : '')}
            onClick={function() { setModus('nur_aenderungen'); setExpanded(null); }}
          >Nur geänderte <span className="count">{aenderungen.length}</span></button>
          <button
            className={'chip ' + (modus === 'auswahl' ? 'active' : '')}
            onClick={function() { setModus('auswahl'); setExpanded(null); }}
          >Eigene Auswahl <span className="count">{auswahl.size}</span></button>
        </div>

        {/* Modus: Nur Änderungen */}
        {modus === 'nur_aenderungen' && (
          <div className="mini-list">
            <div className="mini-list-head">
              <strong>{aenderungen.length} Mitarbeitende mit geänderten Plänen</strong>
              <span className="spacer" />
              <span className="muted">seit letztem Versand</span>
            </div>
            {aenderungen.length === 0 ? (
              <div className="empty-state">
                <span className="glyph">✅</span>
                Keine Änderungen seit letztem Versand.
              </div>
            ) : aenderungen.map(function(a) {
              const m = maListe.find(function(x) { return x.kuerzel === a.kuerzel; });
              const isOpen = expanded === a.kuerzel;
              const log = versandLog[a.kuerzel];
              return (
                <React.Fragment key={a.kuerzel}>
                  <div
                    className={'mini-row expand ' + (isOpen ? 'open' : '')}
                    onClick={function() { toggleExpand(a.kuerzel); }}
                  >
                    <span className="caret">▸</span>
                    <span className="name">{a.vorname} {a.nachname}</span>
                    <span className="muted small">geändert</span>
                    {log
                      ? <span className="muted small" title={'Zuletzt an ' + log.empfaenger}>zuletzt {fmtSent(log.gesendet_am)}</span>
                      : <span className="muted small">noch nie gesendet</span>
                    }
                    <span className="email">{a.empfaenger || (m && m.email) || '—'}</span>
                  </div>
                  {isOpen && (
                    <div className="diff-row">
                      <strong>{a.vorname} {a.nachname}</strong> — {monat} {jahr}
                      <MaMonthCalendar kuerzel={a.kuerzel} monat={monat} jahr={String(jahr)} />
                      <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                        <button className="btn btn-outline btn-sm" onClick={function(e) { e.stopPropagation(); openPreview(m || a); }}>
                          📧 Mail-Vorschau
                        </button>
                        <button className="btn btn-outline btn-sm" onClick={function(e) { e.stopPropagation(); openIcsPreview(a.kuerzel, a.vorname + ' ' + a.nachname); }}>
                          📅 ICS-Vorschau
                        </button>
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        )}

        {/* Modus: Auswahl */}
        {modus === 'auswahl' && (
          <div className="mini-list">
            <div className="mini-list-head">
              <button className="btn btn-ghost btn-sm" onClick={function() { setAuswahl(new Set(filteredAuswahl.map(function(m) { return m.kuerzel; }))); }}>Alle</button>
              <button className="btn btn-ghost btn-sm" onClick={function() { setAuswahl(new Set()); }}>Keine</button>
              <span className="spacer" />
              <label className="opt" style={{ padding: 0, fontSize: 'var(--text-meta)' }}>
                <input
                  type="checkbox"
                  checked={auswahlNurAend}
                  onChange={function(e) { setAuswahlNurAend(e.target.checked); }}
                  style={{ width: 14, height: 14 }}
                />
                <span>Nur mit Änderungen ({aendKuerzel.size})</span>
              </label>
              <span className="muted" style={{ marginLeft: 12 }}>{auswahl.size} / {filteredAuswahl.length}</span>
            </div>
            {filteredAuswahl.map(function(m) {
              const checked = auswahl.has(m.kuerzel);
              const hatAend = aendKuerzel.has(m.kuerzel);
              const isOpen = expanded === m.kuerzel;
              const log = versandLog[m.kuerzel];
              return (
                <React.Fragment key={m.kuerzel}>
                  <div
                    className={'mini-row expand ' + (isOpen ? 'open' : '')}
                    onClick={function() { toggleExpand(m.kuerzel); }}
                  >
                    <span className="caret">▸</span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={function(e) { e.stopPropagation(); toggle(m.kuerzel); }}
                      onClick={function(e) { e.stopPropagation(); }}
                      style={{ flexShrink: 0 }}
                    />
                    <span className="kuerzel-pill">{m.kuerzel}</span>
                    <span className="name">{m.vorname} {m.nachname}</span>
                    {hatAend && (
                      <span style={{
                        background: 'var(--amber-bg-card)', color: 'var(--amber-600)',
                        padding: '1px 7px', borderRadius: 'var(--radius-pill)',
                        fontSize: 'var(--text-tiny)', fontWeight: 600,
                      }}>geändert</span>
                    )}
                    {log
                      ? <span className="muted small" title={'An ' + log.empfaenger}>{fmtSent(log.gesendet_am)}</span>
                      : <span className="muted small">nie gesendet</span>
                    }
                    <span className="email">{m.email}</span>
                  </div>
                  {isOpen && (
                    <div className="diff-row">
                      <strong>{m.vorname} {m.nachname}</strong> — {monat} {jahr}
                      <MaMonthCalendar kuerzel={m.kuerzel} monat={monat} jahr={String(jahr)} />
                      <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                        <button className="btn btn-outline btn-sm" onClick={function(e) { e.stopPropagation(); openIcsPreview(m.kuerzel, m.vorname + ' ' + m.nachname); }}>
                          📅 ICS-Vorschau
                        </button>
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
            {filteredAuswahl.length === 0 && (
              <div className="empty-state">
                <span className="glyph">📭</span>
                Keine Mitarbeitenden mit Änderungen seit letztem Versand.
              </div>
            )}
          </div>
        )}

        {/* Modus: Alle */}
        {modus === 'alle' && (
          <div className="mini-list">
            <div className="mini-list-head">
              <strong>{empfaengerListe.length} Mitarbeitende</strong> erhalten {monat} {jahr}
            </div>
            {empfaengerListe.length === 0 ? (
              <div className="empty-state">
                <span className="glyph">📭</span>
                Keine Mitarbeitenden mit hinterlegter E-Mail-Adresse.
              </div>
            ) : empfaengerListe.map(function(m) {
              const isOpen = expanded === m.kuerzel;
              const log = versandLog[m.kuerzel];
              return (
                <React.Fragment key={m.kuerzel}>
                  <div
                    className={'mini-row expand ' + (isOpen ? 'open' : '')}
                    onClick={function() { toggleExpand(m.kuerzel); }}
                  >
                    <span className="caret">▸</span>
                    <span className="kuerzel-pill">{m.kuerzel}</span>
                    <span className="name">{m.vorname} {m.nachname}</span>
                    {log
                      ? <span className="muted small" title={'An ' + log.empfaenger}>{fmtSent(log.gesendet_am)}</span>
                      : <span className="muted small">nie gesendet</span>
                    }
                    <span className="email">{m.email}</span>
                  </div>
                  {isOpen && (
                    <div className="diff-row">
                      <strong>{m.vorname} {m.nachname}</strong> — {monat} {jahr}
                      <MaMonthCalendar kuerzel={m.kuerzel} monat={monat} jahr={String(jahr)} />
                      <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                        <button className="btn btn-outline btn-sm" onClick={function(e) { e.stopPropagation(); openIcsPreview(m.kuerzel, m.vorname + ' ' + m.nachname); }}>
                          📅 ICS-Vorschau
                        </button>
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="Versenden">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-outline" onClick={function() { openPreview(sendList[0]); }} disabled={sendList.length === 0}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            Mail-Vorschau
          </button>
          <button className="btn btn-outline" onClick={function() { send(true); }} disabled={running} title="Simuliert den Versand, ohne Mails zu senden">
            Testlauf
          </button>
          {testAn && sendList.length > 0 && (
            <button className="btn btn-outline" onClick={sendTest}
              disabled={running || !smtpPw}
              title={'1 Mail für ' + sendList[0].vorname + ' ' + sendList[0].nachname + ' an ' + testAn + ' senden'}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg>
              1 Testmail senden
            </button>
          )}
          <button className="btn btn-primary" onClick={function() { send(false); }} disabled={running || sendList.length === 0}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg>
            {sendList.length} {sendList.length === 1 ? 'Mail' : 'Mails'} versenden
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={alsVersendetMarkieren}
            disabled={running}
            title={"Monat als versendet markieren, ohne Mails zu senden — nützlich wenn der Versand auf einem anderen System stattgefunden hat"}
            style={{ marginLeft: 'auto', color: 'var(--ink-muted)' }}
          >
            Als versendet markieren
          </button>
          {testAn && (
            <span className="muted small">→ alle an <strong>{testAn}</strong></span>
          )}
        </div>
      </Card>

      <div className="card">
        <Log lines={lines} running={running} title="Versand-Protokoll" />
      </div>

      {/* Erstellte Kalender-Dateien (beim Import erzeugt) */}
      <Card title="Erstellte Kalender-Dateien (ICS)">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '0 0 8px' }}>
          <input
            type="search" className="input"
            placeholder="Monat oder Mitarbeitende suchen…"
            value={icsSearch} onChange={function(e) { setIcsSearch(e.target.value); setIcsOpen(null); }}
            style={{ flex: 1, padding: '6px 12px', fontSize: '0.85rem' }}
          />
          {icsSearch && (
            <button className="btn btn-ghost btn-sm" onClick={function() { setIcsSearch(''); }}>✕ Zurücksetzen</button>
          )}
        </div>
        <div className="file-list">
          {icsHistorie.length === 0 ? (
            <div className="empty-state">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.35 }}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              Noch keine ICS-Dateien — zuerst einen Plan importieren.
            </div>
          ) : (function() {
            const q = icsSearch.toLowerCase();
            const results = icsHistorie.reduce(function(acc, m, i) {
              if (!q) { acc.push({ m: m, i: i, matchedFiles: null }); return acc; }
              if (m.monat_jahr.toLowerCase().includes(q)) { acc.push({ m: m, i: i, matchedFiles: null }); return acc; }
              const hits = (m.files || []).filter(function(f) {
                return (typeof f === 'string' ? f : f.name).toLowerCase().includes(q);
              });
              if (hits.length > 0) acc.push({ m: m, i: i, matchedFiles: hits });
              return acc;
            }, []);

            if (results.length === 0) return <div className="empty-state">Keine Treffer.</div>;

            return results.map(function(row) {
              const { m, i, matchedFiles } = row;
              const isOpen = icsOpen === i || matchedFiles !== null;
              const files = matchedFiles || m.files || [];
              return (
                <div key={m.monat_jahr}>
                  <div className="file-row" style={{ cursor: 'pointer' }}
                    onClick={function() { setIcsOpen(isOpen && matchedFiles === null ? null : i); }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--ink-faint)', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--ink-faint)', flexShrink: 0 }}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    <span className="name">{m.monat_jahr}</span>
                    <span className="meta">{files.length} {matchedFiles ? 'Treffer' : 'Dateien'}</span>
                  </div>
                  {isOpen && (
                    <div style={{ paddingLeft: 32 }}>
                      {files.map(function(f) {
                        const fname = typeof f === 'string' ? f : f.name;
                        return (
                          <IcsFileItem
                            key={fname}
                            monatJahr={m.monat_jahr}
                            filename={fname}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>
      </Card>

      </div>{/* end linke Spalte */}

      {/* Rechte Spalte — SMTP & Test; sticky auf Desktop, auf Mobile zuoberst */}
      <div className="aside-sticky">
        <Card title="E-Mail-Zugang">
          <div className="field" style={{ marginBottom: 14 }}>
            <label className="field-label">Passwort</label>
            <input
              type="password" className="input"
              value={smtpPw} onChange={function(e) { setSmtpPw(e.target.value); }}
              placeholder="Wird nicht gespeichert"
              autoComplete="off"
            />
            <div className="field-hint" style={{ marginTop: 5, fontSize: 11.5, color: 'var(--ink-muted)', display: 'flex', gap: 5, alignItems: 'center' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              Wird nicht gespeichert
            </div>
          </div>
          <div className="field">
            <label className="field-label">
              Test-Empfänger
              <span className="muted small" style={{ fontWeight: 400, marginLeft: 6 }}>(optional)</span>
              <HelpTip text="Wenn hier eine E-Mail-Adresse eingetragen ist, gehen alle Mails nur an diese Adresse — nicht an die echten Empfänger. Ideal zum Testen vor dem echten Versand." />
            </label>
            <input
              type="email" className="input"
              value={testAn} onChange={function(e) { setTestAn(e.target.value); }}
              placeholder="test@example.com"
            />
            {testAn && (
              <div className="field-hint" style={{ marginTop: 5, fontSize: 11.5, color: 'var(--amber-600)' }}>
                Alle Mails gehen nur an diese Adresse.
              </div>
            )}
          </div>
        </Card>
      </div>

      </div>{/* end 2-col grid */}

      {icsPreview && (
        <Modal
          label="Kalender"
          title={'ICS-Vorschau · ' + icsPreview.name + ' · ' + monat + ' ' + jahr}
          onClose={function() { setIcsPreview(null); }}
          footer={(
            <button className="btn btn-ghost" onClick={function() { setIcsPreview(null); }}>Schliessen</button>
          )}
        >
          {icsPreview.loading && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-muted)' }}>Lade…</div>
          )}
          {icsPreview.error && (
            <div style={{ padding: 16, color: 'var(--red-500)' }}>{icsPreview.error}</div>
          )}
          {icsPreview.events && (
            <IcsEventList events={icsPreview.events} />
          )}
        </Modal>
      )}

      {preview && (
        <Modal
          label="Versand"
          title={'Mail-Vorschau · ' + preview.ma.vorname + ' ' + preview.ma.nachname}
          onClose={function() { setPreview(null); }}
          footer={(
            <React.Fragment>
              <span className="muted small" style={{ marginRight: 'auto' }}>
                So sieht die erste von {sendList.length} {sendList.length === 1 ? 'Mail' : 'Mails'} aus.
              </span>
              <button className="btn btn-ghost" onClick={function() { setPreview(null); }}>Schliessen</button>
              <button className="btn btn-primary" onClick={function() { setPreview(null); send(false); }} disabled={running || !smtpPw}>
                Versenden
              </button>
            </React.Fragment>
          )}
        >
          <div className="mail-pane">
            <div className="mail-meta-row"><span className="label">An</span><span className="value">{testAn || preview.ma.email || preview.ma.empfaenger || '—'}</span></div>
            <div className="mail-meta-row"><span className="label">Betreff</span><span className="value" style={{ fontWeight: 600 }}>{preview.betreff}</span></div>
            <div className="mail-body">{preview.body}</div>
            <div className="mail-attach">
              <span className="muted small">📎 Anhang:</span>
              <span className="ics-pill">{preview.anhang}</span>
            </div>
          </div>
          {testAn && (
            <Hint glyph="🧪" tone="amber">
              <strong>Testmodus aktiv:</strong> diese Mail (und alle weiteren) gehen an <code>{testAn}</code>,
              nicht an die echten Empfänger.
            </Hint>
          )}
        </Modal>
      )}
    </div>
  );
}

// ── ICS-Ereignisliste ────────────────────────────────────────────────────────
function IcsEventList({ events }) {
  const KAT_BG  = { Arbeit: 'var(--blue-100)', Frei: '#dcfce7', Abwesenheit: '#fef3c7' };
  const KAT_FG  = { Arbeit: 'var(--blue-600)', Frei: '#16a34a', Abwesenheit: '#d97706' };

  const arbeit  = events.filter(function(e) { return e.kategorie === 'Arbeit'; });
  const nacht   = events.filter(function(e) { return e.ist_nachtdienst; });
  const abwes   = events.filter(function(e) { return e.kategorie !== 'Arbeit'; });

  function fmtTime(e) {
    if (e.ist_ganztaegig || (!e.dienstbeginn && !e.dienstende)) return 'Ganztägig';
    if (e.dienstbeginn && e.dienstende) return e.dienstbeginn + '–' + e.dienstende;
    return e.dienstbeginn || e.dienstende || '';
  }

  function fmtDate(datum) {
    const parts = datum.split('-');
    return parts[2] + '.' + parts[1] + '.';
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14, fontSize: 12, color: 'var(--ink-muted)' }}>
        <span><strong style={{ color: 'var(--ink)' }}>{events.length}</strong> Einträge</span>
        <span><strong style={{ color: 'var(--blue-600)' }}>{arbeit.length}</strong> Arbeitstage</span>
        {nacht.length > 0 && <span><strong style={{ color: 'var(--amber-600)' }}>{nacht.length}</strong> Nachtdienste</span>}
        {abwes.length > 0 && <span><strong style={{ color: '#16a34a' }}>{abwes.length}</strong> Abwesenheiten/Frei</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {events.map(function(e, i) {
          const bg = KAT_BG[e.kategorie] || 'var(--surface-subtle)';
          const fg = KAT_FG[e.kategorie] || 'var(--ink-muted)';
          return (
            <div key={i} style={{
              display: 'grid',
              gridTemplateColumns: '70px 18px 110px 1fr auto',
              gap: 8, alignItems: 'center',
              padding: '5px 8px', borderRadius: 5,
              background: bg, fontSize: 12,
            }}>
              <span style={{ color: 'var(--ink-muted)', fontVariantNumeric: 'tabular-nums' }}>
                {e.wochentag} {fmtDate(e.datum)}
              </span>
              <span title={e.ist_nachtdienst ? 'Nachtdienst' : ''} style={{ textAlign: 'center' }}>
                {e.ist_nachtdienst ? <span style={{ color: 'var(--amber-600)', fontWeight: 700, fontSize: 10 }}>N</span> : ''}
              </span>
              <span style={{ color: 'var(--ink-muted)', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
                {fmtTime(e)}
              </span>
              <span style={{ fontWeight: 600, color: fg }}>{e.anzeigename}</span>
              <span style={{ color: 'var(--ink-faint)', fontSize: 11 }}>{e.ort || ''}</span>
            </div>
          );
        })}
        {events.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-muted)' }}>
            Keine Einträge für diesen Monat.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Monatskalender für einen MA ──────────────────────────────────────────
function MaMonthCalendar({ kuerzel, monat, jahr }) {
  const [shifts,      setShifts]      = React.useState(null);
  const [changedDays, setChangedDays] = React.useState(new Set());
  const CTX = window.SERVER_CONTEXT || {};
  const monate = CTX.monate || [];

  React.useEffect(function() {
    setShifts(null);
    setChangedDays(new Set());
    const base = '?kuerzel=' + encodeURIComponent(kuerzel) + '&month=' + encodeURIComponent(monat) + '&year=' + encodeURIComponent(jahr);
    Promise.all([
      fetch('/api/ma/monat' + base).then(function(r) { return r.json(); }),
      fetch('/api/mail/diffs' + base).then(function(r) { return r.json(); }),
    ]).then(function(results) {
      setShifts(Array.isArray(results[0]) ? results[0] : []);
      setChangedDays(new Set(Array.isArray(results[1]) ? results[1] : []));
    }).catch(function() { setShifts([]); });
  }, [kuerzel, monat, jahr]);

  if (shifts === null) {
    return <div style={{ padding: '12px 0', color: 'var(--text-muted)', fontSize: 12 }}>Lade…</div>;
  }

  const monatIdx = monate.indexOf(monat);
  if (monatIdx < 0) return null;

  const year = parseInt(jahr);
  const firstDayRaw = new Date(year, monatIdx, 1).getDay(); // 0=So
  const startOffset = firstDayRaw === 0 ? 6 : firstDayRaw - 1; // Mon-start
  const daysInMonth = new Date(year, monatIdx + 1, 0).getDate();

  // datum → {code, kat}
  const shiftMap = {};
  shifts.forEach(function(s) {
    const d = parseInt(s.datum.split('-')[2]);
    shiftMap[d] = { code: s.dienstcode, kat: s.kategorie };
  });

  const KAT_BG = { 'Arbeit': 'var(--blue-100)', 'Frei': '#dcfce7', 'Abwesenheit': '#fef3c7' };
  const KAT_FG = { 'Arbeit': 'var(--blue-600)', 'Frei': '#16a34a', 'Abwesenheit': '#d97706' };

  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: 3,
        fontSize: 11,
      }}>
        {['Mo','Di','Mi','Do','Fr','Sa','So'].map(function(d) {
          return (
            <div key={d} style={{ textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600, paddingBottom: 3, fontSize: 10 }}>
              {d}
            </div>
          );
        })}
        {cells.map(function(d, i) {
          if (!d) return <div key={'e' + i} />;
          const s       = shiftMap[d];
          const changed = changedDays.has(d);
          return (
            <div key={d} style={{
              textAlign: 'center',
              padding: '3px 1px',
              borderRadius: 3,
              background: changed
                ? '#fef3c7'
                : s ? (KAT_BG[s.kat] || 'var(--blue-100)') : 'transparent',
              minHeight: 30,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              outline: changed ? '1.5px solid #f59e0b' : 'none',
              outlineOffset: '-1px',
            }}
            title={changed ? 'Geändert seit letztem Versand' : undefined}
            >
              <div style={{ color: changed ? '#92400e' : 'var(--text-muted)', fontSize: 9, lineHeight: 1, fontWeight: changed ? 700 : 400 }}>{d}</div>
              {s && (
                <div style={{
                  fontWeight: 700,
                  color: changed ? '#b45309' : (KAT_FG[s.kat] || 'var(--text-primary)'),
                  fontSize: 9,
                  lineHeight: 1.2,
                  marginTop: 1,
                }}>{s.code}</div>
              )}
              {changed && <div style={{ fontSize: 7, color: '#b45309', lineHeight: 1, marginTop: 1 }}>●</div>}
            </div>
          );
        })}
      </div>
      {shifts.length === 0 && (
        <div style={{ color: 'var(--text-muted)', fontSize: 12, paddingTop: 6 }}>
          Keine Schichten in diesem Monat.
        </div>
      )}
      {changedDays.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: 10, color: '#92400e' }}>
          <span style={{ display: 'inline-block', width: 12, height: 12, background: '#fef3c7', border: '1.5px solid #f59e0b', borderRadius: 2 }} />
          {changedDays.size} {changedDays.size === 1 ? 'Tag' : 'Tage'} geändert seit letztem Versand
        </div>
      )}
    </div>
  );
}

// ── Einzelne ICS-Datei mit Vorschau & Download (aus Import erzeugt) ──────────
function IcsFileItem({ monatJahr, filename }) {
  const [open,    setOpen]    = React.useState(false);
  const [events,  setEvents]  = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error,   setError]   = React.useState('');

  function toggle() {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (events !== null) return;
    setLoading(true); setError('');
    fetch('/api/ics/preview?monat_jahr=' + encodeURIComponent(monatJahr) + '&filename=' + encodeURIComponent(filename))
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d && d.error) { setError(d.error); } else { setEvents(Array.isArray(d) ? d : []); }
        setLoading(false);
      })
      .catch(function() { setError('Verbindungsfehler'); setLoading(false); });
  }

  function fmtDt(s) {
    if (!s) return '';
    const m = s.replace(/Z$/, '').match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/);
    if (!m) return s;
    const [, y, mo, d, h, min] = m;
    return d + '.' + mo + '.' + y + (h ? ' ' + h + ':' + min : '');
  }

  function fmtTime(s) {
    if (!s || !s.includes('T')) return '–';
    const m = s.replace(/Z$/, '').match(/T(\d{2})(\d{2})/);
    return m ? m[1] + ':' + m[2] : '–';
  }

  return (
    <div style={{ borderBottom: '1px solid var(--hairline-soft)' }}>
      <div className="file-row">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--ink-faint)', flexShrink: 0 }}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <span className="name small">{filename}</span>
        <button className="btn btn-ghost btn-sm" onClick={toggle}
          style={{ padding: '3px 7px', fontSize: 11, flexShrink: 0 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
          </svg>
          {open ? 'Schließen' : 'Vorschau'}
        </button>
        <a className="btn btn-ghost btn-sm" style={{ padding: '3px 7px' }}
          href={'/download/ics/' + encodeURIComponent(monatJahr) + '/' + encodeURIComponent(filename)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </a>
      </div>
      {open && (
        <div style={{ padding: '6px 4px 8px 28px' }}>
          {loading && <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>Lädt…</div>}
          {error   && <div style={{ fontSize: 11, color: 'var(--red-500)' }}>{error}</div>}
          {events && events.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>Keine Einträge in dieser Datei.</div>
          )}
          {events && events.length > 0 && (
            <div className="analyse-table-wrap" style={{ maxHeight: 240, overflowY: 'auto', borderRadius: 6 }}>
              <table className="analyse-table" style={{ fontSize: 11 }}>
                <thead>
                  <tr>
                    <th>Datum</th>
                    <th>Bezeichnung</th>
                    <th>Beginn</th>
                    <th>Ende</th>
                    <th>Ort</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map(function(ev, i) {
                    return (
                      <tr key={i}>
                        <td style={{ whiteSpace: 'nowrap' }}>{fmtDt(ev['DTSTART'])}</td>
                        <td>{ev['SUMMARY'] || '–'}</td>
                        <td style={{ whiteSpace: 'nowrap', color: 'var(--ink-muted)' }}>{fmtTime(ev['DTSTART'])}</td>
                        <td style={{ whiteSpace: 'nowrap', color: 'var(--ink-muted)' }}>{fmtTime(ev['DTEND'])}</td>
                        <td style={{ color: 'var(--ink-muted)' }}>{ev['LOCATION'] || '–'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

window.TabMail = TabMail;
