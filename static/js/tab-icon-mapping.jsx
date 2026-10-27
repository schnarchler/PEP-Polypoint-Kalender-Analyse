var _MONAT_NUM_IM = {Januar:1,Februar:2,März:3,Maerz:3,April:4,Mai:5,Juni:6,Juli:7,August:8,September:9,Oktober:10,November:11,Dezember:12};
function _sortPdfsDescIM(arr) {
  return [...arr].sort(function(a, b) {
    return (b.jahr || 0) - (a.jahr || 0) || (_MONAT_NUM_IM[b.monat] || 0) - (_MONAT_NUM_IM[a.monat] || 0);
  });
}

// Icon-Zuordnung — PDF auswählen, Icons benennen, Gesamtübersicht.
// Wird als Sektion im Import-Tab eingebettet (kein eigener Tab mehr).
function IconMappingSection({ monat, jahr }) {
  const toast = useToast();
  const [pdfs, setPdfs] = React.useState(_sortPdfsDescIM((window.SERVER_CONTEXT || {}).pdfs || []));
  const [selectedPdfId, setSelectedPdfId] = React.useState('');
  const [iconLoading, setIconLoading] = React.useState(false);
  const [frameSrc, setFrameSrc] = React.useState('');
  const [frameLabel, setFrameLabel] = React.useState('');
  const [pdfDragOver, setPdfDragOver] = React.useState(false);

  // Auto-select PDF matching current month/year
  React.useEffect(function() {
    const match = pdfs.find(function(p) { return p.monat === monat && p.jahr === jahr; }) || pdfs[0] || null;
    if (match) setSelectedPdfId(match.id);
  }, [monat, jahr]);

  const selectedPdf = pdfs.find(function(p) { return p.id === selectedPdfId; }) || null;

  React.useEffect(function() {
    function onPdfsUpdated(e) {
      if (Array.isArray(e.detail)) setPdfs(_sortPdfsDescIM(e.detail));
    }
    window.addEventListener('pdfs-updated', onPdfsUpdated);
    return function() { window.removeEventListener('pdfs-updated', onPdfsUpdated); };
  }, []);

  // Listen for save-confirmation from iframe
  React.useEffect(function() {
    const handler = function(e) {
      if (e.data === 'icon-saved') toast.show('Icon-Mapping gespeichert');
    };
    window.addEventListener('message', handler);
    return function() { window.removeEventListener('message', handler); };
  }, []);


  const uploadPdfs = async function(fileList) {
    const files = Array.from(fileList || []).filter(function(f) {
      return f && f.name.toLowerCase().endsWith('.pdf');
    });
    if (files.length === 0) { toast.show('Keine PDF-Dateien ausgewählt', 'error'); return; }
    const ok = [];
    const failed = [];
    let lastId = null;
    for (const file of files) {
      const fd = new FormData();
      fd.set('pdf', file);
      try {
        const resp = await fetch('/api/pdf/upload', { method: 'POST', body: fd });
        const json = await resp.json();
        if (json.error) { failed.push(file.name + ' (' + json.error + ')'); continue; }
        ok.push(json.name);
        lastId = json.id;
        const newPdf = { id: json.id, name: json.name, monat: json.monat, jahr: json.jahr };
        setPdfs(function(cur) {
          if (cur.some(function(p) { return p.id === json.id; })) return cur;
          return _sortPdfsDescIM([newPdf].concat(cur));
        });
      } catch(e) {
        failed.push(file.name);
      }
    }
    if (ok.length > 0) {
      toast.show(ok.length === 1 ? 'PDF hochgeladen: ' + ok[0] : ok.length + ' PDFs hochgeladen');
      if (lastId) setSelectedPdfId(lastId);
    }
    if (failed.length > 0) {
      toast.show('Fehlgeschlagen: ' + failed.join(', '), 'error');
    }
  };

  const loadIconTool = async function() {
    if (!selectedPdf) { toast.show('Bitte PDF wählen', 'error'); return; }
    if (iconLoading) return;
    setIconLoading(true);
    const fd = new FormData();
    fd.set('pdf', selectedPdf.name);
    try {
      const resp = await fetch('/api/icon/generate', { method: 'POST', body: fd });
      const json = await resp.json();
      if (json.error) { toast.show(json.error, 'error'); return; }
      setFrameSrc('/icon-tool?' + Date.now());
      setFrameLabel(selectedPdf.name);
    } catch(e) {
      toast.show('Verbindungsfehler', 'error');
    } finally {
      setIconLoading(false);
    }
  };

  const loadAllIcons = async function() {
    if (iconLoading) return;
    setIconLoading(true);
    try {
      const resp = await fetch('/api/icon/generate-all', { method: 'POST' });
      const json = await resp.json();
      if (json.error) { toast.show(json.error, 'error'); return; }
      setFrameSrc('/icon-tool-alle?' + Date.now());
      setFrameLabel('Alle bekannten Icons');
    } catch(e) {
      toast.show('Verbindungsfehler', 'error');
    } finally {
      setIconLoading(false);
    }
  };

  const remapHashes = async function() {
    if (iconLoading) return;
    setIconLoading(true);
    try {
      const resp = await fetch('/api/icon/remap-hashes', { method: 'POST' });
      const json = await resp.json();
      if (json.error) { toast.show('Fehler: ' + json.error, 'error'); return; }
      toast.show('Hashes aktualisiert: ' + json.remapped + ' neu, ' + json.kept + ' unverändert');
    } catch(e) {
      toast.show('Verbindungsfehler', 'error');
    } finally {
      setIconLoading(false);
    }
  };

  return (
    <div>
      <div className="split-side" style={{ gap: 16 }}>

        {/* ── Linke Spalte: PDF-Auswahl ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Upload-Zone */}
          <div
            onDragEnter={function(e) { e.preventDefault(); setPdfDragOver(true); }}
            onDragOver={function(e) { e.preventDefault(); }}
            onDragLeave={function() { setPdfDragOver(false); }}
            onDrop={function(e) {
              e.preventDefault(); setPdfDragOver(false);
              if (e.dataTransfer.files.length > 0) uploadPdfs(e.dataTransfer.files);
            }}
            onClick={function() {
              const inp = document.createElement('input');
              inp.type = 'file'; inp.accept = '.pdf'; inp.multiple = true;
              inp.onchange = function() { if (inp.files.length > 0) uploadPdfs(inp.files); };
              inp.click();
            }}
            style={{
              border: '1.5px dashed ' + (pdfDragOver ? 'var(--blue-500)' : 'var(--hairline-strong)'),
              background: pdfDragOver ? 'var(--blue-100)' : '#fafbfd',
              borderRadius: 11,
              padding: '14px 10px',
              textAlign: 'center',
              fontSize: 12.5,
              color: pdfDragOver ? 'var(--blue-500)' : 'var(--ink-muted)',
              cursor: 'pointer',
              transition: 'var(--transition-all)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              fontWeight: 500,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 17v2a1.5 1.5 0 001.5 1.5h13A1.5 1.5 0 0020 19v-2"/></svg>
            PDFs ablegen oder klicken
          </div>

          {/* PDF-Liste */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="card-head" style={{ padding: '8px 14px' }}>
              <h3 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 600 }}>PDFs</h3>
              <span className="muted small" style={{ marginLeft: 'auto' }}>{pdfs.length}</span>
            </div>
            <div className="pdf-list" style={{ maxHeight: 340, overflowY: 'auto' }}>
              {pdfs.length === 0 ? (
                <div className="empty-state" style={{ padding: '20px 12px' }}>
                  <span className="glyph">📄</span>
                  <span className="muted small">Noch keine PDFs</span>
                </div>
              ) : pdfs.map(function(p) {
                const active = selectedPdfId === p.id;
                return (
                  <div key={p.id} className={'pdf-item ' + (active ? 'selected' : '')}
                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    onClick={function() { setSelectedPdfId(p.id); }}
                  >
                    <span className="radio" />
                    <span className="glyph">📄</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="name" style={{ fontWeight: active ? 600 : undefined }}>{p.name}</div>
                      <div className="meta">{p.monat && p.jahr ? p.monat + ' ' + p.jahr : ''}</div>
                    </div>
                    <button
                      title="PDF löschen"
                      onClick={async function(e) {
                        e.stopPropagation();
                        if (!window.confirm('PDF "' + p.name + '" löschen?')) return;
                        try {
                          const resp = await fetch('/api/pdf/delete', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: p.name }),
                          });
                          const json = await resp.json();
                          if (json.error) { toast.show(json.error, 'error'); return; }
                          toast.show('PDF gelöscht: ' + p.name);
                          window.location.reload();
                        } catch(e) {
                          toast.show('Löschen fehlgeschlagen: ' + (e.message || 'Netzwerkfehler'), 'error');
                        }
                      }}
                      style={{
                        marginLeft: 6, background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--ink-muted)', padding: '2px 4px', borderRadius: 4,
                        fontSize: 13, opacity: 0.5, flexShrink: 0,
                      }}
                      onMouseEnter={function(e) { e.currentTarget.style.opacity = 1; e.currentTarget.style.color = '#dc2626'; }}
                      onMouseLeave={function(e) { e.currentTarget.style.opacity = 0.5; e.currentTarget.style.color = 'var(--ink-muted)'; }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Aktions-Buttons */}
          <button
            className="btn btn-primary btn-sm"
            onClick={loadIconTool}
            disabled={iconLoading || !selectedPdf}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4.5l13 7.5-13 7.5z"/></svg>
            {iconLoading ? 'Lädt…' : 'PDF öffnen'}
          </button>

          <div style={{ borderTop: '1px solid var(--hairline)', margin: '4px 0' }} />

          <button
            className="btn btn-outline btn-sm"
            onClick={loadAllIcons}
            disabled={iconLoading}
            style={{ width: '100%', justifyContent: 'center' }}
            title="Alle bisher gesehenen Icons aus dem Cache anzeigen — kein PDF-Scan nötig"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
            {iconLoading ? 'Lädt…' : 'Alle Icons anzeigen'}
          </button>


          {frameSrc && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 4px', fontSize: 11.5, color: 'var(--ink-muted)' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              {frameLabel}
            </div>
          )}
        </div>

        {/* ── Rechte Spalte: Tool-iframe ── */}
        <div className="card tool-frame-card" style={{ padding: 0, overflow: 'hidden', position: 'relative' }}>
          {frameSrc ? (
            <iframe
              key={frameSrc}
              src={frameSrc}
              className="tool-frame"
              style={{ border: 'none', borderRadius: 0, display: 'block' }}
              title="Icon-Mapping Tool"
            />
          ) : (
            <div className="empty-state tool-frame-empty">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3, marginBottom: 6 }}><path d="M11.5 3.2L20.8 12.5l-8.3 8.3-9.3-9.3 .8-7.5z"/><circle cx="8" cy="8" r="1.6"/></svg>
              <span>PDF öffnen oder alle Icons anzeigen</span>
              <span className="muted small" style={{ marginTop: 4 }}>
                Wähle links ein PDF und klicke «PDF öffnen»,<br/>
                oder klicke «Alle Icons anzeigen» für eine Gesamtübersicht.
              </span>
            </div>
          )}
          {iconLoading && (
            <div style={{
              position: 'absolute', inset: 0,
              background: 'rgba(255,255,255,0.82)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: 10,
              fontSize: '0.9rem', color: 'var(--ink-muted)',
              backdropFilter: 'blur(3px)',
              zIndex: 10,
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'dp-pulse 1.2s ease-in-out infinite' }}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              Wird geladen…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

window.IconMappingSection = IconMappingSection;
