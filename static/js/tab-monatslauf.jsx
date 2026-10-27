var _MONAT_NUM_ML = {Januar:1,Februar:2,März:3,Maerz:3,April:4,Mai:5,Juni:6,Juli:7,August:8,September:9,Oktober:10,November:11,Dezember:12};
function _sortPdfsDesc(arr) {
  return [...arr].sort(function(a, b) {
    return (b.jahr || 0) - (a.jahr || 0) || (_MONAT_NUM_ML[b.monat] || 0) - (_MONAT_NUM_ML[a.monat] || 0);
  });
}

// Tab: Import — PDFs hochladen → Icons zuordnen → importieren.
// Standardweg: automatischer Import (mehrere PDFs). Erweitert: einzelner Monat manuell.
// Versand ist bewusst getrennt und passiert im Tab «Versand».
function TabMonatslauf({ monat, jahr, onMonat, onJahr }) {
  const toast = useToast();
  const { lines, running, start } = useStreamingLog();

  const [pdfList, setPdfList] = React.useState((window.SERVER_CONTEXT || {}).pdfs || []);
  const pdfs = _sortPdfsDesc(pdfList);
  const [syncStatus, setSyncStatus] = React.useState(null);
  const [importFertig, setImportFertig] = React.useState(false);
  const [showManual, setShowManual] = React.useState(false);
  const [showIcons, setShowIcons] = React.useState(false);
  const [neueMa, setNeueMa] = React.useState([]);

  React.useEffect(function() {
    function onPdfsUpdated(e) { if (Array.isArray(e.detail)) setPdfList(e.detail); }
    window.addEventListener('pdfs-updated', onPdfsUpdated);
    return function() { window.removeEventListener('pdfs-updated', onPdfsUpdated); };
  }, []);

  React.useEffect(function() {
    fetch('/api/pdf/sync/status')
      .then(function(r) { return r.json(); })
      .then(function(d) { setSyncStatus(d); })
      .catch(function() {});
  }, []);

  const bestMatchName = function(m, j) {
    const match = pdfs.find(function(p) { return p.monat === m && p.jahr === j; });
    return (match || pdfs[0] || {}).name || '';
  };

  const bestMatch = function(m, j) {
    return pdfs.find(function(p) { return p.monat === m && p.jahr === j; }) || pdfs[0] || null;
  };

  const [pdf, setPdf] = React.useState(function() { return bestMatchName(monat, jahr); });
  const [pdfPreviewId, setPdfPreviewId] = React.useState(function() {
    const p = bestMatch(monat, jahr);
    return p ? p.id : '';
  });
  const [optAnalyse, setOptAnalyse] = React.useState(true);

  React.useEffect(function() {
    const match = pdfs.find(function(p) { return p.monat === monat && p.jahr === jahr; });
    const p = match || pdfs[0] || null;
    setPdf(p ? p.name : '');
    setPdfPreviewId(p ? p.id : '');
  }, [monat, jahr]);

  const nachImportFertig = async function() {
    setImportFertig(true);
    try {
      const r = await fetch('/api/ma/neu_nach_import');
      const neueMaData = await r.json();
      if (neueMaData.length > 0) setNeueMa(neueMaData);
    } catch(e) {}
  };

  // Manueller Import eines einzelnen Monats
  const run = async function() {
    if (running) return;
    setNeueMa([]);
    setImportFertig(false);
    const data = new FormData();
    data.set('month', monat);
    data.set('year', String(jahr));
    if (pdf) data.set('pdf', pdf);
    if (optAnalyse) data.set('analyse', '1');
    try {
      const resp = await fetch('/api/monatslauf', { method: 'POST', body: data });
      const json = await resp.json();
      if (json.error) { toast.show(json.error, 'error'); return; }
      start(json.task_id, function() {
        toast.show('Import abgeschlossen');
        nachImportFertig();
      });
    } catch(e) {
      toast.show('Verbindungsfehler', 'error');
    }
  };

  // Aktuell ausgewähltes PDF-Objekt
  const selectedPdfObj = pdfs.find(function(p) { return p.name === pdf; }) || null;
  const previewId = pdfPreviewId || (selectedPdfObj ? selectedPdfObj.id : '');

  const zumVersand = function() {
    window.dispatchEvent(new CustomEvent('navigate-tab', { detail: 'mail' }));
  };

  return (
    <div className="fade-in" data-screen-label="Import">
      <PageHead
        label="Workflow"
        title="Dienstpläne importieren"
        subtitle="PDF hochladen → Icons zuordnen → importieren. Der Versand der Kalender-Dateien passiert danach im Tab «Versand»."
      />

      {/* Hauptweg: automatischer Import */}
      <AutoImportCard
        running={running}
        start={start}
        onDone={nachImportFertig}
        onStart={function() { setImportFertig(false); setNeueMa([]); }}
      />

      {/* Hinweis auf automatische Ordner-Synchronisation */}
      {syncStatus && syncStatus.naechster_sync && (
        <div className="muted small" style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
          Automatischer Ordner-Sync aktiv — nächster Lauf: <strong>{syncStatus.naechster_sync}</strong>
          <span>·</span>
          <button className="btn btn-ghost btn-sm" style={{ padding: '1px 6px', fontSize: 11 }}
            onClick={function() { window.dispatchEvent(new CustomEvent('navigate-tab', { detail: 'einstellungen' })); }}>
            Konfigurieren
          </button>
        </div>
      )}

      {/* Nach dem Import: Weiterleitung zum Versand */}
      {importFertig && !running && (
        <div style={{ marginTop: 16 }}>
          <Hint glyph="✅" tone="">
            <strong>Import abgeschlossen.</strong>{' '}
            Geänderte Pläne sind noch nicht versendet — das passiert bewusst getrennt.
            <div style={{ marginTop: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={zumVersand}>
                Zum Versand →
              </button>
            </div>
          </Hint>
        </div>
      )}

      {neueMa.length > 0 && !running && (
        <div style={{ marginTop: 12 }}>
          <Hint glyph="👤" tone="amber">
            <strong>Neue Mitarbeitende erkannt:</strong>{' '}
            {neueMa.map(function(m) { return m.vorname + ' ' + m.nachname + ' [' + m.kuerzel + ']'; }).join(', ')}
            {' '}— beim Import neu angelegt.{' '}
            Falls dies eine Namensänderung ist (z.&nbsp;B. Heirat), bitte im Tab «Mitarbeitende» zusammenführen.
            <div style={{ marginTop: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={function() { setNeueMa([]); }}>Ausblenden</button>
            </div>
          </Hint>
        </div>
      )}

      <div className="spacer-20" />

      {/* Erweitert: einzelner Monat manuell */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <button
          onClick={function() { setShowManual(function(v) { return !v; }); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', textAlign: 'left',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: showManual ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', color: 'var(--ink-faint)' }}>
            <polyline points="9 18 15 12 9 6"/>
          </svg>
          Erweitert: Einzelnen Monat manuell importieren
          <span className="muted small" style={{ fontWeight: 400, marginLeft: 'auto' }}>
            {monat} {jahr}
          </span>
        </button>

        {showManual && (
          <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--hairline)' }}>
            <p className="muted small" style={{ margin: '12px 0' }}>
              Für den Normalfall genügt der automatische Import oben. Hier lässt sich gezielt
              ein einzelnes PDF mit Vorschau prüfen und importieren.
            </p>

            <div className="split-side">

              {/* Linke Spalte: Liste */}
              <div>
                <div className="pdf-list" style={{ maxHeight: 340, overflowY: 'auto' }}>
                  {pdfs.length === 0 ? (
                    <div className="empty-state">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
                      <span className="muted small">Noch kein PDF vorhanden — oben hochladen</span>
                    </div>
                  ) : pdfs.map(function(p) {
                    const isAktuell = p.monat === monat && p.jahr === jahr;
                    return (
                      <label key={p.name} className={'pdf-item ' + (pdf === p.name ? 'selected' : '')}
                        onClick={function() {
                          setPdf(p.name);
                          setPdfPreviewId(p.id);
                          if (p.monat && onMonat) onMonat(p.monat);
                          if (p.jahr && onJahr) onJahr(p.jahr);
                        }}>
                        <span className="radio" />
                        <span className="glyph">📄</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="name">{p.name}</div>
                          <div className="meta">{p.monat && p.jahr ? p.monat + ' ' + p.jahr + (p.size ? ' · ' + p.size : '') : p.size}</div>
                        </div>
                        {isAktuell && (
                          <span style={{
                            fontSize: 11, fontWeight: 600, padding: '2px 8px',
                            borderRadius: 10, background: 'var(--blue-100)', color: 'var(--blue-500)',
                            whiteSpace: 'nowrap', flexShrink: 0,
                          }}>Aktuell</span>
                        )}
                        <input type="radio" name="pdf" checked={pdf === p.name} onChange={function() {}} style={{ display: 'none' }} />
                      </label>
                    );
                  })}
                </div>

                <div style={{ marginTop: 12 }}>
                  <label className="opt" style={{ padding: 0 }}>
                    <input type="checkbox" checked={optAnalyse} onChange={function(e) { setOptAnalyse(e.target.checked); }} />
                    <span>
                      <strong>Analyse-Report erstellen</strong>
                      <span className="sub"> — Excel nach dem Import</span>
                    </span>
                    <HelpTip text="Erstellt nach dem Import automatisch einen Analyse-Report als Excel-Datei (Schichten, Nachtdienste, Besetzung). Zu finden unter Analysen." />
                  </label>
                </div>

                <div style={{ marginTop: 14 }}>
                  <button
                    className="btn btn-primary"
                    onClick={run} disabled={running || !pdf}
                  >
                    {running ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'dp-pulse 1.2s infinite' }}><circle cx="12" cy="12" r="9"/></svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4.5l13 7.5-13 7.5z"/></svg>
                    )}
                    {running ? 'Läuft…' : 'Import starten'}
                  </button>
                  <div className="muted small" style={{ marginTop: 8 }}>
                    Speichert Daten und erstellt Kalender-Dateien (.ics{optAnalyse ? ' · Analyse-Report' : ''}).
                    Kein Mail-Versand — dafür Tab «Versand».
                  </div>
                </div>
              </div>

              {/* Rechte Spalte: Vorschau */}
              <div>
                {previewId ? (
                  <React.Fragment>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                      <a className="btn btn-ghost btn-sm" href={'/pdf/' + previewId} target="_blank" rel="noopener noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                        Vollbild öffnen
                      </a>
                    </div>
                    <iframe
                      key={previewId}
                      src={'/pdf/' + previewId + '#toolbar=0&view=FitH'}
                      className="preview-frame"
                      title="PDF-Vorschau"
                    />
                  </React.Fragment>
                ) : (
                  <div className="empty-state preview-empty">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
                    <span className="muted small">PDF auswählen für Vorschau</span>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}
      </div>

      <div className="spacer-20" />

      {/* Icon-Zuordnung (Schicht-Codes) */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <button
          onClick={function() { setShowIcons(function(v) { return !v; }); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', textAlign: 'left',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: showIcons ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', color: 'var(--ink-faint)' }}>
            <polyline points="9 18 15 12 9 6"/>
          </svg>
          Icon-Zuordnung verwalten
          <span className="muted small" style={{ fontWeight: 400, marginLeft: 'auto' }}>
            Dienst-Symbole aus PDFs benennen
          </span>
        </button>
        {showIcons && (
          <div style={{ padding: '12px 16px 16px', borderTop: '1px solid var(--hairline)' }}>
            <p className="muted small" style={{ margin: '0 0 12px' }}>
              Beim automatischen Import werden unbekannte Icons direkt abgefragt.
              Hier lassen sich Zuordnungen unabhängig davon prüfen und pflegen.
            </p>
            <IconMappingSection monat={monat} jahr={jahr} />
          </div>
        )}
      </div>

      {/* Log */}
      <div className="card" style={{ marginTop: 16 }}>
        <Log lines={lines} running={running} title="Import-Protokoll" />
      </div>
    </div>
  );
}

// ── Auto-Import: Upload → Icon-Check → Icon-Zuordnung → Import ──────────────
function AutoImportCard({ running, start, onDone, onStart }) {
  const toast = useToast();
  const [phase, setPhase]       = React.useState('idle'); // idle|upload|check|icons|import|done
  const [items, setItems]       = React.useState([]);     // {name, monat, jahr, neue_icons, neue_balken, error}
  const [dragOver, setDragOver] = React.useState(false);
  const [iconPdf, setIconPdf]   = React.useState('');     // PDF, die gerade im Icon-Tool offen ist
  const [frameSrc, setFrameSrc] = React.useState('');
  const [statusMsg, setStatusMsg] = React.useState('');
  const [skipExcel, setSkipExcel] = React.useState(true);  // Excel standardmäßig deaktiviert
  const itemsRef = React.useRef(items);
  itemsRef.current = items;
  const iconPdfRef = React.useRef(iconPdf);
  iconPdfRef.current = iconPdf;
  const phaseRef = React.useRef(phase);
  phaseRef.current = phase;

  const hatNeueIcons = function(it) {
    return !it.error && ((it.neue_icons || 0) + (it.neue_balken || 0)) > 0;
  };

  // Prevent browser drag-navigate
  React.useEffect(function() {
    function stop(e) { e.preventDefault(); }
    document.addEventListener('dragover', stop);
    document.addEventListener('drop', stop);
    return function() {
      document.removeEventListener('dragover', stop);
      document.removeEventListener('drop', stop);
    };
  }, []);

  // Nach Speichern im Icon-Tool: betroffene PDF erneut prüfen
  React.useEffect(function() {
    const handler = async function(e) {
      if (e.data !== 'icon-saved') return;
      if (phaseRef.current !== 'icons' || !iconPdfRef.current) return;
      const name = iconPdfRef.current;
      setStatusMsg('Prüfe ' + name + ' erneut…');
      try {
        const resp = await fetch('/api/auto-import/check', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdfs: [name] }),
        });
        const arr = await resp.json();
        const neu = Array.isArray(arr) ? arr[0] : null;
        if (!neu) return;
        const updated = itemsRef.current.map(function(it) {
          return it.name === name ? Object.assign({}, it, neu) : it;
        });
        setItems(updated);
        setStatusMsg('');
        if (!hatNeueIcons(neu)) {
          weiterNachIcons(updated);
        } else {
          // Es fehlen noch Zuordnungen — Icon-Tool mit aktuellem Stand neu laden
          openIconTool(name);
        }
      } catch(err) {
        setStatusMsg('');
      }
    };
    window.addEventListener('message', handler);
    return function() { window.removeEventListener('message', handler); };
  }, []);

  const openIconTool = async function(name) {
    setIconPdf(name);
    setFrameSrc('');
    setStatusMsg('Icon-Übersicht für ' + name + ' wird erstellt…');
    const fd = new FormData();
    fd.set('pdf', name);
    try {
      const resp = await fetch('/api/icon/generate', { method: 'POST', body: fd });
      const json = await resp.json();
      if (json.error) { toast.show(json.error, 'error'); setStatusMsg(''); return; }
      setFrameSrc('/icon-tool?' + Date.now());
      setStatusMsg('');
    } catch(e) {
      toast.show('Verbindungsfehler', 'error');
      setStatusMsg('');
    }
  };

  const weiterNachIcons = function(aktuelleItems) {
    const offen = aktuelleItems.filter(hatNeueIcons);
    if (offen.length > 0) {
      setPhase('icons');
      openIconTool(offen[0].name);
    } else {
      startImport(aktuelleItems);
    }
  };

  const startImport = async function(aktuelleItems) {
    const importierbar = aktuelleItems.filter(function(it) { return !it.error; });
    if (importierbar.length === 0) {
      toast.show('Keine importierbaren PDFs', 'error');
      setPhase('done');
      return;
    }
    setPhase('import');
    setIconPdf(''); setFrameSrc('');
    try {
      const resp = await fetch('/api/auto-import/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pdfs: importierbar.map(function(it) { return it.name; }),
          skip_excel: skipExcel
        }),
      });
      const json = await resp.json();
      if (json.error) { toast.show(json.error, 'error'); setPhase('check'); return; }
      toast.show('Import gestartet: ' + json.plaene.join(', '));
      start(json.task_id, function() {
        toast.show('Import abgeschlossen');
        setPhase('done');
        if (onDone) onDone();
      });
    } catch(e) {
      toast.show('Verbindungsfehler', 'error');
      setPhase('check');
    }
  };

  const handleFiles = async function(fileList) {
    const files = Array.from(fileList || []).filter(function(f) {
      return f && f.name.toLowerCase().endsWith('.pdf');
    });
    if (files.length === 0) { toast.show('Keine PDF-Dateien ausgewählt', 'error'); return; }
    if (onStart) onStart();
    setPhase('upload');
    setItems(files.map(function(f) { return { name: f.name }; }));

    // 1) Hochladen
    const okNames = [];
    const uploadFehler = [];
    for (const file of files) {
      const fd = new FormData();
      fd.set('pdf', file);
      try {
        const resp = await fetch('/api/pdf/upload', { method: 'POST', body: fd });
        const json = await resp.json();
        if (json.error) { uploadFehler.push(file.name + ' (' + json.error + ')'); continue; }
        okNames.push(json.name);
      } catch(e) {
        uploadFehler.push(file.name);
      }
    }
    if (uploadFehler.length > 0) toast.show('Upload fehlgeschlagen: ' + uploadFehler.join(', '), 'error');
    if (okNames.length === 0) { setPhase('idle'); setItems([]); return; }

    // PDF-Liste global aktualisieren
    try {
      const listResp = await fetch('/api/pdf/list');
      const pdfs = await listResp.json();
      if (Array.isArray(pdfs)) {
        window.SERVER_CONTEXT = Object.assign({}, window.SERVER_CONTEXT, { pdfs: pdfs });
        window.dispatchEvent(new CustomEvent('pdfs-updated', { detail: pdfs }));
      }
    } catch(e) {}

    // 2) Icon-Check
    setPhase('check');
    setStatusMsg('Prüfe PDFs auf unbekannte Icons…');
    try {
      const resp = await fetch('/api/auto-import/check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfs: okNames }),
      });
      const arr = await resp.json();
      if (!Array.isArray(arr)) { toast.show(arr.error || 'Icon-Check fehlgeschlagen', 'error'); setPhase('idle'); return; }
      setItems(arr);
      setStatusMsg('');
      // 3) Weiter: Icons zuordnen oder direkt importieren
      weiterNachIcons(arr);
    } catch(e) {
      toast.show('Verbindungsfehler beim Icon-Check', 'error');
      setPhase('idle');
    }
  };

  const reset = function() {
    setPhase('idle'); setItems([]); setIconPdf(''); setFrameSrc(''); setStatusMsg('');
  };

  const statusZeile = function(it) {
    if (it.error) return <span className="badge-warn" style={{ fontSize: 11 }}>{it.error}</span>;
    if (it.neue_icons === undefined) return <span className="muted small">wird geprüft…</span>;
    if (hatNeueIcons(it)) {
      return (
        <span className="badge-warn" style={{ fontSize: 11 }}>
          {(it.neue_icons || 0) > 0 ? it.neue_icons + ' neue Icons' : ''}
          {(it.neue_icons || 0) > 0 && (it.neue_balken || 0) > 0 ? ', ' : ''}
          {(it.neue_balken || 0) > 0 ? it.neue_balken + ' neue Balken' : ''}
        </span>
      );
    }
    return <span style={{ color: 'var(--green-bright-h)', fontSize: 11, fontWeight: 600 }}>✓ Icons bekannt</span>;
  };

  return (
    <Card title="Dienstpläne importieren">
      <p className="muted small" style={{ margin: '4px 0 12px' }}>
        Ein oder mehrere Dienstplan-PDFs hochladen — der Assistent prüft auf unbekannte Icons,
        lässt diese bei Bedarf zuordnen und importiert danach alle Monate automatisch
        (inkl. Kalender-Dateien und Analyse).
      </p>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
          <input
            type="checkbox"
            checked={!skipExcel}
            onChange={function(e) { setSkipExcel(!e.target.checked); }}
            disabled={phase !== 'idle'}
          />
          <span>Excel-Übersicht während Import erstellen</span>
        </label>
        <div className="muted small" style={{ marginTop: 4, marginLeft: 24 }}>
          Excel ist normalerweise nicht erforderlich. Deaktiviert: schnellerer Import.
        </div>
      </div>

      {phase === 'idle' && (
        <div
          onDragEnter={function(e) { e.preventDefault(); setDragOver(true); }}
          onDragOver={function(e) { e.preventDefault(); }}
          onDragLeave={function() { setDragOver(false); }}
          onDrop={function(e) {
            e.preventDefault(); setDragOver(false);
            if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
          }}
          onClick={function() {
            const input = document.createElement('input');
            input.type = 'file'; input.accept = '.pdf'; input.multiple = true;
            input.onchange = function() { if (input.files.length > 0) handleFiles(input.files); };
            input.click();
          }}
          style={{
            border: '1.5px dashed ' + (dragOver ? 'var(--blue-500)' : 'var(--hairline-strong)'),
            background: dragOver ? 'var(--blue-100)' : 'transparent',
            borderRadius: 10, padding: '26px 16px', textAlign: 'center',
            fontSize: 13, color: dragOver ? 'var(--blue-500)' : 'var(--ink-muted)',
            cursor: 'pointer', transition: 'var(--transition-all)', fontWeight: 500,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: 8 }}><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 17v2a1.5 1.5 0 001.5 1.5h13A1.5 1.5 0 0020 19v-2"/></svg>
          PDFs hier ablegen oder klicken — der Rest läuft automatisch
        </div>
      )}

      {phase !== 'idle' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Fortschritts-Liste */}
          <div style={{ border: '1px solid var(--hairline)', borderRadius: 8, overflow: 'hidden' }}>
            {items.map(function(it, i) {
              return (
                <div key={it.name} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px',
                  borderBottom: i < items.length - 1 ? '1px solid var(--hairline-soft)' : 'none',
                  background: iconPdf === it.name && phase === 'icons' ? 'var(--blue-50,#eff6ff)' : 'transparent',
                  fontSize: 12.5,
                }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--ink-faint)', flexShrink: 0 }}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  <span style={{ flex: 1, fontWeight: 500 }}>{it.name}</span>
                  {it.monat && it.jahr ? <span className="muted small">{it.monat} {it.jahr}</span> : null}
                  {statusZeile(it)}
                </div>
              );
            })}
          </div>

          {statusMsg && <div className="muted small">{statusMsg}</div>}

          {/* Icon-Zuordnung */}
          {phase === 'icons' && (
            <React.Fragment>
              <div className="hint-box amber" style={{ margin: 0 }}>
                <span className="glyph">🏷️</span>
                Unbekannte Icons in <strong>&nbsp;{iconPdf}&nbsp;</strong> — bitte unten zuordnen und speichern.
                Danach geht es automatisch weiter.
              </div>
              {frameSrc && (
                <iframe src={frameSrc} title="Icon-Zuordnung" className="tool-frame" />
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-outline btn-sm"
                  onClick={function() { startImport(itemsRef.current); }}>
                  Ohne weitere Zuordnung importieren
                </button>
                <button className="btn btn-ghost btn-sm" onClick={reset}>Abbrechen</button>
              </div>
            </React.Fragment>
          )}

          {phase === 'import' && (
            <div className="hint-box" style={{ margin: 0 }}>
              <span className="glyph">⏳</span>
              Import läuft — Details im Import-Protokoll unten.
            </div>
          )}

          {phase === 'done' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="hint-box green" style={{ margin: 0, flex: 1 }}>
                <span className="glyph">✅</span>
                Import abgeschlossen — Details im Import-Protokoll unten.
              </div>
              <button className="btn btn-outline btn-sm" onClick={reset}>Neuer Durchlauf</button>
            </div>
          )}

          {(phase === 'upload' || phase === 'check') && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={reset}>Abbrechen</button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

window.TabMonatslauf = TabMonatslauf;
