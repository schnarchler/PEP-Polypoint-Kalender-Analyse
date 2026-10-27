// tab-einstellungen.jsx – SMTP, E-Mail-Inhalt, Dienstzeiten, Backup, Info

var KATEGORIEN = ['Arbeit', 'Frei', 'Abwesenheit', 'Sonstiges'];

// ── Dienstzeiten-Editor ──────────────────────────────────────────────────────
function DienstzeitenEditor() {
  var toast = useToast();
  var [rows, setRows] = React.useState(null);
  var [saving, setSaving] = React.useState(false);
  var [dirty, setDirty] = React.useState(false);
  var dbCodesRef = React.useRef([]);
  function load() {
    fetch('/api/config/dienstzeiten').then(function (r) {
      return r.json();
    }).then(function (data) {
      if (Array.isArray(data)) {
        setRows(data);
        dbCodesRef.current = data.map(function (r) {
          return r.code;
        });
        setDirty(false);
      } else {
        setRows([]);
        dbCodesRef.current = [];
      }
    }).catch(function () {
      setRows([]);
    });
  }
  React.useEffect(function () {
    load();
  }, []);
  function update(idx, field, value) {
    setRows(function (prev) {
      return prev.map(function (r, i) {
        if (i !== idx) return r;
        var next = Object.assign({}, r, {
          [field]: value
        });
        if (!next._new) next._modified = true;
        return next;
      });
    });
    setDirty(true);
  }
  function addRow() {
    setRows(function (prev) {
      return prev.concat([{
        code: '',
        anzeigename: '',
        dienstbeginn: '',
        dienstende: '',
        ort: '',
        kategorie: 'Arbeit',
        ist_nachtdienst: 0,
        ist_ausrueckdienst: 0,
        _new: true
      }]);
    });
    setDirty(true);
  }
  function removeRow(idx) {
    setRows(function (prev) {
      return prev.filter(function (_, i) {
        return i !== idx;
      });
    });
    setDirty(true);
  }
  function save() {
    var currentCodes = rows.map(function (r) {
      return r.code;
    }).filter(Boolean);
    var deleted = dbCodesRef.current.filter(function (c) {
      return currentCodes.indexOf(c) === -1;
    });
    setSaving(true);
    fetch('/api/config/dienstzeiten', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        rows: rows,
        deleted: deleted
      })
    }).then(function (r) {
      return r.json();
    }).then(function (data) {
      setSaving(false);
      if (data.error) {
        toast.show(data.error, 'error');
        return;
      }
      toast.show('Dienstzeiten gespeichert');
      load();
    }).catch(function () {
      setSaving(false);
      toast.show('Verbindungsfehler', 'error');
    });
  }
  if (rows === null) return /*#__PURE__*/React.createElement("div", {
    className: "muted small",
    style: {
      padding: 8
    }
  }, "Lade\u2026");
  var newCount = rows.filter(function (r) {
    return r._new;
  }).length;
  var modCount = rows.filter(function (r) {
    return r._modified;
  }).length;
  var curCodes = rows.map(function (r) {
    return r.code;
  }).filter(Boolean);
  var delCount = dbCodesRef.current.filter(function (c) {
    return curCodes.indexOf(c) === -1;
  }).length;
  var summary = [newCount && newCount + ' neu', modCount && modCount + ' geändert', delCount && delCount + ' gelöscht'].filter(Boolean).join(', ');
  var cell = {
    padding: '3px 2px',
    verticalAlign: 'middle'
  };
  var inp = {
    padding: '4px 6px',
    fontSize: 12,
    border: '1.5px solid var(--hairline-strong)',
    borderRadius: 6,
    background: 'var(--bg-surface)',
    color: 'var(--ink)',
    fontFamily: 'inherit'
  };
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      overflowX: 'auto'
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: 12
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: 'var(--bg-page)',
      borderBottom: '2px solid var(--hairline)'
    }
  }, /*#__PURE__*/React.createElement("th", {
    style: {
      width: 8,
      padding: '6px 4px'
    }
  }), ['Code', 'Anzeigename', 'Beginn', 'Ende', 'Ort', 'Kategorie'].map(function (h) {
    return /*#__PURE__*/React.createElement("th", {
      key: h,
      style: {
        padding: '6px 6px',
        textAlign: 'left',
        fontWeight: 700,
        fontSize: 10.5,
        textTransform: 'uppercase',
        letterSpacing: '.04em',
        color: 'var(--ink-faint)',
        whiteSpace: 'nowrap'
      }
    }, h);
  }), /*#__PURE__*/React.createElement("th", {
    style: {
      padding: '6px 6px',
      textAlign: 'center',
      fontWeight: 700,
      fontSize: 10.5,
      textTransform: 'uppercase',
      letterSpacing: '.04em',
      color: 'var(--ink-faint)',
      whiteSpace: 'nowrap'
    }
  }, "Nacht / Ausr\xFCck"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 28,
      padding: '6px 4px'
    }
  }))), /*#__PURE__*/React.createElement("tbody", null, rows.map(function (row, idx) {
    var bg = row._new ? 'rgba(59,130,246,0.06)' : row._modified ? 'rgba(234,179,8,0.06)' : undefined;
    var dot = row._new ? 'var(--blue-500)' : row._modified ? 'var(--amber-500)' : 'transparent';
    return /*#__PURE__*/React.createElement("tr", {
      key: idx,
      style: {
        borderBottom: '1px solid var(--hairline)',
        background: bg
      }
    }, /*#__PURE__*/React.createElement("td", {
      style: {
        padding: '0 4px',
        verticalAlign: 'middle'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: dot,
        margin: '0 auto'
      }
    })), /*#__PURE__*/React.createElement("td", {
      style: cell
    }, /*#__PURE__*/React.createElement("input", {
      value: row.code,
      onChange: function (e) {
        update(idx, 'code', e.target.value);
      },
      style: Object.assign({}, inp, {
        width: 65,
        fontFamily: 'var(--font-mono)',
        fontWeight: 600
      })
    })), /*#__PURE__*/React.createElement("td", {
      style: cell
    }, /*#__PURE__*/React.createElement("input", {
      value: row.anzeigename,
      onChange: function (e) {
        update(idx, 'anzeigename', e.target.value);
      },
      style: Object.assign({}, inp, {
        width: 130
      })
    })), /*#__PURE__*/React.createElement("td", {
      style: cell
    }, /*#__PURE__*/React.createElement("input", {
      value: row.dienstbeginn,
      onChange: function (e) {
        update(idx, 'dienstbeginn', e.target.value);
      },
      placeholder: "HH:MM",
      style: Object.assign({}, inp, {
        width: 58,
        textAlign: 'center',
        fontFamily: 'var(--font-mono)'
      })
    })), /*#__PURE__*/React.createElement("td", {
      style: cell
    }, /*#__PURE__*/React.createElement("input", {
      value: row.dienstende,
      onChange: function (e) {
        update(idx, 'dienstende', e.target.value);
      },
      placeholder: "HH:MM",
      style: Object.assign({}, inp, {
        width: 58,
        textAlign: 'center',
        fontFamily: 'var(--font-mono)'
      })
    })), /*#__PURE__*/React.createElement("td", {
      style: cell
    }, /*#__PURE__*/React.createElement("input", {
      value: row.ort,
      onChange: function (e) {
        update(idx, 'ort', e.target.value);
      },
      style: Object.assign({}, inp, {
        width: 75
      })
    })), /*#__PURE__*/React.createElement("td", {
      style: cell
    }, /*#__PURE__*/React.createElement("select", {
      value: row.kategorie,
      onChange: function (e) {
        update(idx, 'kategorie', e.target.value);
      },
      style: Object.assign({}, inp, {
        width: 95
      })
    }, KATEGORIEN.map(function (k) {
      return /*#__PURE__*/React.createElement("option", {
        key: k,
        value: k
      }, k);
    }))), /*#__PURE__*/React.createElement("td", {
      style: Object.assign({}, cell, {
        textAlign: 'center'
      })
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 10,
        justifyContent: 'center',
        alignItems: 'center'
      }
    }, /*#__PURE__*/React.createElement("label", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        fontSize: 9,
        color: 'var(--ink-faint)',
        cursor: 'pointer'
      }
    }, /*#__PURE__*/React.createElement("input", {
      type: "checkbox",
      checked: !!row.ist_nachtdienst,
      onChange: function (e) {
        update(idx, 'ist_nachtdienst', e.target.checked ? 1 : 0);
      },
      style: {
        accentColor: 'var(--blue-500)'
      }
    }), "N"), /*#__PURE__*/React.createElement("label", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        fontSize: 9,
        color: 'var(--ink-faint)',
        cursor: 'pointer'
      }
    }, /*#__PURE__*/React.createElement("input", {
      type: "checkbox",
      checked: !!row.ist_ausrueckdienst,
      onChange: function (e) {
        update(idx, 'ist_ausrueckdienst', e.target.checked ? 1 : 0);
      },
      style: {
        accentColor: 'var(--blue-500)'
      }
    }), "A"))), /*#__PURE__*/React.createElement("td", {
      style: Object.assign({}, cell, {
        textAlign: 'center'
      })
    }, /*#__PURE__*/React.createElement("button", {
      onClick: function () {
        removeRow(idx);
      },
      style: {
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--red-500)',
        fontSize: 16,
        lineHeight: 1,
        padding: '0 4px'
      },
      title: "Zeile l\xF6schen"
    }, "\xD7")));
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'center',
      marginTop: 12,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost btn-sm",
    onClick: addRow
  }, "+ Zeile hinzuf\xFCgen"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary btn-sm",
    onClick: save,
    disabled: saving || !dirty
  }, saving ? 'Speichern…' : 'Speichern'), dirty && !saving && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost btn-sm",
    onClick: load
  }, "Verwerfen"), dirty && summary && /*#__PURE__*/React.createElement("span", {
    className: "muted small"
  }, summary), !dirty && /*#__PURE__*/React.createElement("span", {
    className: "muted small"
  }, "Keine \xC4nderungen")), /*#__PURE__*/React.createElement("div", {
    className: "field-hint",
    style: {
      marginTop: 6
    }
  }, "\xC4nderungen erst nach ", /*#__PURE__*/React.createElement("strong", null, "Speichern"), " wirksam. ", /*#__PURE__*/React.createElement("strong", null, "Code"), " muss exakt dem Wert aus dem PDF-Import entsprechen."));
}

// ── Webcal-Übersicht ─────────────────────────────────────────────────────────
function WebcalUebersicht() {
  var [ma, setMa] = React.useState(null);
  var [alleZeigen, setAlleZeigen] = React.useState(false);
  function load() {
    fetch('/api/ma/webcal-uebersicht').then(function (r) {
      return r.json();
    }).then(function (data) {
      setMa(Array.isArray(data) ? data : []);
    }).catch(function () {
      setMa([]);
    });
  }
  React.useEffect(load, []);
  if (ma === null) return /*#__PURE__*/React.createElement("div", {
    className: "muted small",
    style: {
      padding: 8
    }
  }, "Lade\u2026");
  var mitAbo = ma.filter(function (m) {
    return m.webcal_aktiv;
  });
  var angezeigt = alleZeigen ? ma : mitAbo;
  var MODUS = {
    ics: {
      label: 'ICS-Anhang',
      color: 'var(--ink-muted)'
    },
    webcal: {
      label: 'Nur Abo',
      color: 'var(--green-500)'
    },
    beide: {
      label: 'ICS + Abo',
      color: 'var(--blue-500)'
    }
  };
  var th = {
    padding: '5px 8px',
    textAlign: 'left',
    fontWeight: 700,
    fontSize: 10.5,
    textTransform: 'uppercase',
    letterSpacing: '.04em',
    color: 'var(--ink-faint)',
    whiteSpace: 'nowrap',
    borderBottom: '2px solid var(--hairline)'
  };
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      alignItems: 'center',
      marginBottom: 12,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement("strong", null, mitAbo.length), /*#__PURE__*/React.createElement("span", {
    className: "muted"
  }, " von ", ma.length, " MA nutzen das Kalender-Abo")), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost btn-sm",
    onClick: function () {
      setAlleZeigen(!alleZeigen);
    }
  }, alleZeigen ? 'Nur mit Abo' : 'Alle MA anzeigen'), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost btn-sm",
    onClick: load,
    title: "Aktualisieren"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("polyline", {
    points: "23 4 23 10 17 10"
  }), /*#__PURE__*/React.createElement("polyline", {
    points: "1 20 1 14 7 14"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"
  })))), angezeigt.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "muted small"
  }, "Noch kein MA hat ein Kalender-Abo aktiviert.") : /*#__PURE__*/React.createElement("div", {
    style: {
      overflowX: 'auto'
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: 12.5
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: th
  }, "Name"), /*#__PURE__*/React.createElement("th", {
    style: th
  }, "K\xFCrzel"), /*#__PURE__*/React.createElement("th", {
    style: th
  }, "E-Mail"), /*#__PURE__*/React.createElement("th", {
    style: th
  }, "Versandmodus"), /*#__PURE__*/React.createElement("th", {
    style: th
  }, "Status"))), /*#__PURE__*/React.createElement("tbody", null, angezeigt.map(function (m) {
    var name = [m.vorname, m.nachname].filter(Boolean).join(' ') || m.kuerzel;
    var modus = MODUS[m.webcal_mail_modus] || {
      label: m.webcal_mail_modus,
      color: 'var(--ink-muted)'
    };
    return /*#__PURE__*/React.createElement("tr", {
      key: m.kuerzel,
      style: {
        borderBottom: '1px solid var(--hairline)',
        opacity: m.aktiv ? 1 : 0.5
      }
    }, /*#__PURE__*/React.createElement("td", {
      style: {
        padding: '6px 8px'
      }
    }, /*#__PURE__*/React.createElement("button", {
      style: {
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        color: 'var(--blue-500)',
        fontWeight: 500,
        fontSize: 'inherit',
        fontFamily: 'inherit'
      },
      title: 'MA ' + m.kuerzel + ' in Mitarbeitende öffnen',
      onClick: function () {
        window._pendingOpenMa = m.kuerzel;
        window.dispatchEvent(new CustomEvent('navigate-to-ma', {
          detail: m.kuerzel
        }));
      }
    }, name), !m.aktiv && /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: 6,
        fontSize: 10,
        color: 'var(--ink-faint)',
        background: 'var(--bg-page)',
        padding: '1px 5px',
        borderRadius: 4,
        border: '1px solid var(--hairline)'
      }
    }, "inaktiv")), /*#__PURE__*/React.createElement("td", {
      style: {
        padding: '6px 8px',
        fontFamily: 'var(--font-mono)',
        fontWeight: 600,
        color: 'var(--ink-muted)',
        fontSize: 11.5
      }
    }, m.kuerzel), /*#__PURE__*/React.createElement("td", {
      style: {
        padding: '6px 8px',
        color: 'var(--ink-muted)'
      }
    }, m.email || /*#__PURE__*/React.createElement("span", {
      className: "muted"
    }, "\u2014")), /*#__PURE__*/React.createElement("td", {
      style: {
        padding: '6px 8px'
      }
    }, m.webcal_aktiv ? /*#__PURE__*/React.createElement("span", {
      style: {
        color: modus.color,
        fontWeight: 500
      }
    }, modus.label) : /*#__PURE__*/React.createElement("span", {
      className: "muted"
    }, "\u2014")), /*#__PURE__*/React.createElement("td", {
      style: {
        padding: '6px 8px'
      }
    }, m.webcal_aktiv ? /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--green-500)',
        fontWeight: 600,
        fontSize: 11
      }
    }, "aktiv") : /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink-faint)',
        fontSize: 11
      }
    }, "kein Abo")));
  })))), /*#__PURE__*/React.createElement("div", {
    className: "field-hint",
    style: {
      marginTop: 8
    }
  }, "Abo aktivieren/deaktivieren: Tab ", /*#__PURE__*/React.createElement("strong", null, "Mitarbeiter"), ", Zeile aufklappen."));
}

// ── Backup-Sektion ───────────────────────────────────────────────────────────
function BackupSection() {
  const toast = useToast();
  const {
    lines,
    running,
    start
  } = useStreamingLog();
  const [backups, setBackups] = React.useState(null);
  const [backupAnzahl, setBackupAnzahl] = React.useState('30');
  const [savedAnzahl, setSavedAnzahl] = React.useState('30');
  const [savingAnzahl, setSavingAnzahl] = React.useState(false);
  const [confirmRestore, setConfirmRestore] = React.useState(null); // {filename, date}
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState('');
  const [dragOver, setDragOver] = React.useState(false);
  const fileInputRef = React.useRef(null);
  React.useEffect(function () {
    loadBackups();
    fetch('/api/settings').then(function (r) {
      return r.json();
    }).then(function (data) {
      var v = String(data.backup_anzahl != null ? data.backup_anzahl : 30);
      setBackupAnzahl(v);
      setSavedAnzahl(v);
    }).catch(function () {});
  }, []);
  function loadBackups() {
    fetch('/api/backup/list').then(function (r) {
      return r.json();
    }).then(function (data) {
      setBackups(Array.isArray(data) ? data : []);
    }).catch(function () {
      setBackups([]);
    });
  }
  async function saveAnzahl() {
    setSavingAnzahl(true);
    try {
      const resp = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          backup_anzahl: parseInt(backupAnzahl) || 30
        })
      });
      const json = await resp.json();
      if (json.error) {
        toast.show(json.error, 'error');
        return;
      }
      setSavedAnzahl(backupAnzahl);
      toast.show('Anzahl Backups gespeichert');
    } catch (e) {
      toast.show('Verbindungsfehler', 'error');
    } finally {
      setSavingAnzahl(false);
    }
  }
  async function runBackup() {
    if (running) return;
    try {
      const resp = await fetch('/api/tool/backup', {
        method: 'POST'
      });
      const json = await resp.json();
      if (json.error) {
        toast.show(json.error, 'error');
        return;
      }
      start(json.task_id, function () {
        toast.show('Backup abgeschlossen');
        loadBackups();
      });
    } catch (e) {
      toast.show('Verbindungsfehler', 'error');
    }
  }
  async function uploadFile(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.db')) {
      setUploadError('Nur .db-Dateien erlaubt.');
      return;
    }
    setUploading(true);
    setUploadError('');
    try {
      const fd = new FormData();
      fd.append('db', file);
      const resp = await fetch('/api/backup/upload', {
        method: 'POST',
        body: fd
      });
      const json = await resp.json();
      if (json.error) {
        setUploadError(json.error);
        return;
      }
      toast.show('Backup hochgeladen — ' + json.db_size);
      loadBackups();
    } catch (e) {
      setUploadError('Verbindungsfehler beim Upload.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }
  function doRestore(filename) {
    setConfirmRestore(null);
    start(null, null); // reset log
    fetch('/api/backup/restore', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        filename
      })
    }).then(function (r) {
      return r.json();
    }).then(function (json) {
      if (json.error) {
        toast.show(json.error, 'error');
        return;
      }
      start(json.task_id, function () {
        toast.show('Wiederherstellung abgeschlossen');
        loadBackups();
      });
    }).catch(function () {
      toast.show('Verbindungsfehler', 'error');
    });
  }
  const anzahlUnchanged = backupAnzahl === savedAnzahl;
  return /*#__PURE__*/React.createElement(Card, {
    title: "Datensicherung"
  }, /*#__PURE__*/React.createElement("p", {
    className: "muted small",
    style: {
      marginTop: 0,
      marginBottom: 14
    }
  }, "Sichert Datenbank, Icon-Mapping und Konfiguration. \xC4ltere Backups werden automatisch gel\xF6scht, sobald die eingestellte Anzahl \xFCberschritten wird."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      gap: 8,
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Aufzubewahrende Backups"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    min: "1",
    max: "999",
    value: backupAnzahl,
    onChange: function (e) {
      setBackupAnzahl(e.target.value);
    },
    className: "input",
    style: {
      width: 80,
      fontFamily: 'var(--font-mono)'
    }
  })), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-outline btn-sm",
    onClick: saveAnzahl,
    disabled: savingAnzahl || anzahlUnchanged
  }, savingAnzahl ? 'Speichern…' : 'Speichern'), anzahlUnchanged && /*#__PURE__*/React.createElement("span", {
    className: "muted small"
  }, "Keine \xC4nderungen")), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-outline btn-sm",
    onClick: runBackup,
    disabled: running
  }, /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.9",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M20 14.66V20a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2h5.34"
  }), /*#__PURE__*/React.createElement("polygon", {
    points: "18 2 22 6 12 16 8 16 8 12 18 2"
  })), running ? 'Läuft…' : 'Backup erstellen'), lines.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12
    }
  }, /*#__PURE__*/React.createElement(Log, {
    lines: lines,
    running: running,
    title: "Protokoll"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 18,
      paddingTop: 14,
      borderTop: '1px solid var(--hairline)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "section-label",
    style: {
      marginBottom: 8
    }
  }, "Backup hochladen"), /*#__PURE__*/React.createElement("p", {
    className: "muted small",
    style: {
      margin: '0 0 10px'
    }
  }, "Lade eine fr\xFChere .db-Datei hoch, um sie in die Backup-Liste aufzunehmen und wiederherstellen zu k\xF6nnen."), /*#__PURE__*/React.createElement("div", {
    style: {
      border: '2px dashed ' + (dragOver ? 'var(--blue-400)' : 'var(--hairline-strong)'),
      borderRadius: 8,
      padding: '16px 20px',
      textAlign: 'center',
      background: dragOver ? 'var(--blue-50,#eff6ff)' : 'var(--bg-page)',
      cursor: 'pointer',
      transition: 'border-color .15s, background .15s'
    },
    onClick: function () {
      if (!uploading) fileInputRef.current && fileInputRef.current.click();
    },
    onDragOver: function (e) {
      e.preventDefault();
      setDragOver(true);
    },
    onDragLeave: function () {
      setDragOver(false);
    },
    onDrop: function (e) {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) uploadFile(file);
    }
  }, /*#__PURE__*/React.createElement("input", {
    ref: fileInputRef,
    type: "file",
    accept: ".db",
    style: {
      display: 'none'
    },
    onChange: function (e) {
      uploadFile(e.target.files[0]);
    }
  }), uploading ? /*#__PURE__*/React.createElement("span", {
    className: "muted small"
  }, "Wird hochgeladen\u2026") : /*#__PURE__*/React.createElement("span", {
    className: "muted small"
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
      verticalAlign: 'middle',
      marginRight: 5
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"
  }), /*#__PURE__*/React.createElement("polyline", {
    points: "17 8 12 3 7 8"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "12",
    y1: "3",
    x2: "12",
    y2: "15"
  })), ".db-Datei ausw\xE4hlen oder hier ablegen")), uploadError && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8,
      color: 'var(--red-500)',
      fontSize: 12
    }
  }, uploadError)), backups !== null && backups.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "section-label",
    style: {
      marginBottom: 8
    }
  }, "Vorhandene Backups (", backups.length, ")"), /*#__PURE__*/React.createElement("div", {
    className: "file-list"
  }, backups.map(function (b) {
    return /*#__PURE__*/React.createElement("div", {
      className: "file-row",
      key: b.timestamp
    }, /*#__PURE__*/React.createElement("svg", {
      width: "14",
      height: "14",
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
    }, /*#__PURE__*/React.createElement("ellipse", {
      cx: "12",
      cy: "5",
      rx: "9",
      ry: "3"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "name"
    }, b.date), /*#__PURE__*/React.createElement("div", {
      className: "meta"
    }, b.db_size)), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 4,
        flexShrink: 0
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn btn-outline btn-sm",
      title: 'Datenbank auf Stand vom ' + b.date + ' zurücksetzen',
      onClick: function () {
        setConfirmRestore({
          filename: b.db,
          date: b.date
        });
      },
      disabled: running
    }, /*#__PURE__*/React.createElement("svg", {
      width: "12",
      height: "12",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2.2",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }, /*#__PURE__*/React.createElement("polyline", {
      points: "1 4 1 10 7 10"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M3.51 15a9 9 0 1 0 .49-3.54"
    })), "Wiederherstellen"), /*#__PURE__*/React.createElement("a", {
      className: "btn btn-ghost btn-sm",
      href: '/download/backup/' + b.db,
      title: "Datenbank herunterladen"
    }, /*#__PURE__*/React.createElement("svg", {
      width: "12",
      height: "12",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2.2",
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
    }))), b.icon_mapping && /*#__PURE__*/React.createElement("a", {
      className: "btn btn-ghost btn-sm",
      href: '/download/backup/' + b.icon_mapping,
      title: "Icon-Mapping"
    }, "Icons"), b.config && /*#__PURE__*/React.createElement("a", {
      className: "btn btn-ghost btn-sm",
      href: '/download/backup/' + b.config,
      title: "Konfiguration"
    }, "Config")));
  }))), confirmRestore && /*#__PURE__*/React.createElement(Modal, {
    label: "Achtung",
    title: "Backup wiederherstellen?",
    onClose: function () {
      setConfirmRestore(null);
    },
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost",
      onClick: function () {
        setConfirmRestore(null);
      }
    }, "Abbrechen"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-primary",
      style: {
        background: 'var(--red-500)',
        borderColor: 'var(--red-500)'
      },
      onClick: function () {
        doRestore(confirmRestore.filename);
      }
    }, "Jetzt wiederherstellen"))
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 12px',
      lineHeight: 1.6
    }
  }, "Die aktuelle Datenbank wird durch den Stand vom ", /*#__PURE__*/React.createElement("strong", null, confirmRestore.date), " ersetzt."), /*#__PURE__*/React.createElement(Hint, {
    glyph: "\uD83D\uDEE1\uFE0F",
    tone: ""
  }, "Die aktuelle Datenbank wird ", /*#__PURE__*/React.createElement("strong", null, "vorher automatisch gesichert"), " \u2014 bei einem Problem kann der aktuelle Stand wiederhergestellt werden."), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '12px 0 0',
      color: 'var(--ink-muted)',
      fontSize: 12
    }
  }, "Die App muss danach neu gestartet werden, damit alle Daten korrekt geladen werden.")));
}

// ── PDF-Archiv ───────────────────────────────────────────────────────────────
function PdfArchivSection() {
  const toast = useToast();
  const [archiv, setArchiv] = React.useState(null);
  function load() {
    fetch('/api/pdf/archiv').then(function (r) {
      return r.json();
    }).then(setArchiv).catch(function () {
      setArchiv([]);
    });
  }
  React.useEffect(load, []);
  function del(filename) {
    fetch('/api/pdf/archiv/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: filename
      })
    }).then(function (r) {
      return r.json();
    }).then(function (d) {
      if (d.error) {
        toast.show(d.error, 'error');
        return;
      }
      toast.show('Gelöscht');
      load();
    }).catch(function () {
      toast.show('Löschen fehlgeschlagen', 'error');
    });
  }
  const title = 'PDF-Archiv' + (archiv && archiv.length > 0 ? ' (' + archiv.length + ')' : '');
  if (archiv === null) return /*#__PURE__*/React.createElement(Card, {
    title: title
  }, /*#__PURE__*/React.createElement("div", {
    className: "muted small",
    style: {
      padding: 4
    }
  }, "Lade\u2026"));
  return /*#__PURE__*/React.createElement(Card, {
    title: title
  }, archiv.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "muted small"
  }, "Noch keine archivierten PDFs. Wenn beim Hochladen eines neuen Plans ein \xE4lterer Plan f\xFCr denselben Monat ersetzt wird, landet der alte Plan hier.") : /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column'
    }
  }, archiv.map(function (a, i) {
    return /*#__PURE__*/React.createElement("div", {
      key: a.filename,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 0',
        borderBottom: i < archiv.length - 1 ? '1px solid var(--hairline)' : 'none'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 500,
        fontSize: 13,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      }
    }, a.original_name), a.archived_at && /*#__PURE__*/React.createElement("div", {
      className: "muted small"
    }, "Archiviert: ", a.archived_at)), /*#__PURE__*/React.createElement("a", {
      className: "btn btn-ghost btn-sm",
      href: '/pdf/archiv/' + encodeURIComponent(a.filename),
      target: "_blank",
      rel: "noreferrer"
    }, "Anzeigen"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost btn-sm",
      style: {
        color: 'var(--red-500)'
      },
      onClick: function () {
        del(a.filename);
      }
    }, "L\xF6schen"));
  })));
}

// ── Haupt-Tab ────────────────────────────────────────────────────────────────
function TabEinstellungen() {
  const [sub, setSub] = React.useState('email');
  const [settings, setSettings] = React.useState(null);
  const [smtpHost, setSmtpHost] = React.useState('');
  const [smtpPort, setSmtpPort] = React.useState('');
  const [smtpUser, setSmtpUser] = React.useState('');
  const [savingSmtp, setSavingSmtp] = React.useState(false);
  const [smtpTestPw, setSmtpTestPw] = React.useState('');
  const [smtpTestResult, setSmtpTestResult] = React.useState(null);
  const [testingSmtp, setTestingSmtp] = React.useState(false);
  const [timezone, setTimezone] = React.useState('');
  const [pdfTemplate, setPdfTemplate] = React.useState('');
  const [ortReihenfolge, setOrtReihenfolge] = React.useState('');
  const [brandUntertitel, setBrandUntertitel] = React.useState('');
  const [webcalBaseUrl, setWebcalBaseUrl] = React.useState('');
  const [webcalTageVergangenheit, setWebcalTageVergangenheit] = React.useState('30');
  const [savingGeneral, setSavingGeneral] = React.useState(false);
  const [savingWebcal, setSavingWebcal] = React.useState(false);
  const [pdfSyncOrdner, setPdfSyncOrdner] = React.useState('');
  const [pdfSyncUhrzeit, setPdfSyncUhrzeit] = React.useState('03:00');
  const [pdfSyncAktiv, setPdfSyncAktiv] = React.useState(false);
  const [savingSync, setSavingSync] = React.useState(false);
  const [syncStatus, setSyncStatus] = React.useState(null);
  const [syncing, setSyncing] = React.useState(false);
  const [absender, setAbsender] = React.useState('');
  const [betreff, setBetreff] = React.useState('');
  const [text, setText] = React.useState('');
  const [webcalEmailBetreff, setWebcalEmailBetreff] = React.useState('');
  const [webcalEmailText, setWebcalEmailText] = React.useState('');
  const [savingMail, setSavingMail] = React.useState(false);
  const toast = useToast();
  React.useEffect(function () {
    fetch('/api/settings').then(function (r) {
      return r.json();
    }).then(function (data) {
      setSettings(data);
      setSmtpHost(data.smtp_host || '');
      setSmtpPort(data.smtp_port != null ? String(data.smtp_port) : '');
      setSmtpUser(data.smtp_user || '');
      setTimezone(data.timezone || '');
      setPdfTemplate(data.pdf_template || '');
      setOrtReihenfolge(data.ort_reihenfolge || '');
      setBrandUntertitel(data.brand_untertitel || '');
      setWebcalBaseUrl(data.webcal_base_url || '');
      setWebcalTageVergangenheit(data.webcal_tage_vergangenheit != null ? String(data.webcal_tage_vergangenheit) : '30');
      setAbsender(data.email_absender || '');
      setBetreff(data.email_betreff || '');
      setText(data.email_text || '');
      setWebcalEmailBetreff(data.webcal_email_betreff || '');
      setWebcalEmailText(data.webcal_email_text || '');
      setPdfSyncOrdner(data.pdf_sync_ordner || '');
      setPdfSyncUhrzeit(data.pdf_sync_uhrzeit || '03:00');
      setPdfSyncAktiv(!!data.pdf_sync_aktiv);
    }).catch(function () {});
    fetch('/api/pdf/sync/status').then(function (r) {
      return r.json();
    }).then(function (d) {
      setSyncStatus(d);
    }).catch(function () {});
  }, []);
  function testSmtp() {
    setTestingSmtp(true);
    setSmtpTestResult(null);
    fetch('/api/settings/smtp-test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        smtp_pw: smtpTestPw,
        smtp_host: smtpHost.trim() || null,
        smtp_port: smtpPort.trim() ? parseInt(smtpPort) : null,
        smtp_user: smtpUser.trim() || null
      })
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) {
        throw new Error('HTTP ' + r.status + (t ? ': ' + t.slice(0, 120) : ''));
      });
      return r.json();
    }).then(function (d) {
      setTestingSmtp(false);
      setSmtpTestResult(d);
      if (d.ok) {
        // Einstellungen wurden serverseitig gespeichert — State synchronisieren
        fetch('/api/settings').then(function (r) {
          return r.json();
        }).then(function (fresh) {
          setSettings(fresh);
          setSmtpHost(fresh.smtp_host || '');
          setSmtpPort(fresh.smtp_port != null ? String(fresh.smtp_port) : '');
          setSmtpUser(fresh.smtp_user || '');
        }).catch(function () {});
      }
    }).catch(function (err) {
      setTestingSmtp(false);
      setSmtpTestResult({
        error: err.message || 'Netzwerkfehler – App neu starten?'
      });
    });
  }
  function saveSection(payload, setSaving, successMsg, onSaved) {
    setSaving(true);
    fetch('/api/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) {
        throw new Error('HTTP ' + r.status);
      });
      return r.json();
    }).then(function (data) {
      setSaving(false);
      if (data.error) {
        toast.show(data.error, 'error');
        return;
      }
      toast.show(successMsg);
      fetch('/api/settings').then(function (r) {
        return r.json();
      }).then(function (fresh) {
        setSettings(fresh);
        if (onSaved) onSaved(fresh);
      }).catch(function () {});
    }).catch(function (err) {
      setSaving(false);
      toast.show('Speichern fehlgeschlagen: ' + (err.message || 'Netzwerkfehler'), 'error');
    });
  }
  if (!settings) {
    return /*#__PURE__*/React.createElement("div", {
      className: "card"
    }, /*#__PURE__*/React.createElement("div", {
      className: "muted small",
      style: {
        padding: 8
      }
    }, "Lade\u2026"));
  }
  const smtpUnchanged = smtpHost.trim() === (settings.smtp_host || '') && smtpPort.trim() === (settings.smtp_port != null ? String(settings.smtp_port) : '') && smtpUser.trim() === (settings.smtp_user || '');
  const generalUnchanged = timezone.trim() === (settings.timezone || '') && pdfTemplate.trim() === (settings.pdf_template || '') && ortReihenfolge.trim() === (settings.ort_reihenfolge || '') && brandUntertitel.trim() === (settings.brand_untertitel || '');
  const webcalUnchanged = webcalBaseUrl.trim() === (settings.webcal_base_url || '') && webcalTageVergangenheit.trim() === (settings.webcal_tage_vergangenheit != null ? String(settings.webcal_tage_vergangenheit) : '30') && webcalEmailBetreff.trim() === (settings.webcal_email_betreff || '').trim() && webcalEmailText.trim() === (settings.webcal_email_text || '').trim();
  const mailUnchanged = absender.trim() === (settings.email_absender || '').trim() && betreff.trim() === (settings.email_betreff || '').trim() && text.trim() === (settings.email_text || '').trim();
  const syncUnchanged = pdfSyncOrdner.trim() === (settings.pdf_sync_ordner || '') && pdfSyncUhrzeit.trim() === (settings.pdf_sync_uhrzeit || '03:00') && pdfSyncAktiv === !!settings.pdf_sync_aktiv;
  function syncNow() {
    setSyncing(true);
    fetch('/api/pdf/sync/jetzt', {
      method: 'POST'
    }).then(function (r) {
      return r.json();
    }).then(function (d) {
      setSyncing(false);
      if (d.error) {
        toast.show(d.error, 'error');
        return;
      }
      const kopiert = (d.kopiert || []).length;
      const importiert = (d.importiert || []).length;
      if (kopiert === 0) {
        toast.show('Keine neuen PDFs gefunden');
      } else {
        toast.show(kopiert + ' PDF(s) kopiert' + (importiert > 0 ? ', Import gestartet' : ''));
      }
      fetch('/api/pdf/sync/status').then(function (r) {
        return r.json();
      }).then(setSyncStatus).catch(function () {});
      if (kopiert > 0) {
        fetch('/api/pdf/list').then(function (r) {
          return r.json();
        }).then(function (pdfs) {
          if (Array.isArray(pdfs)) {
            window.SERVER_CONTEXT = Object.assign({}, window.SERVER_CONTEXT, {
              pdfs: pdfs
            });
            window.dispatchEvent(new CustomEvent('pdfs-updated', {
              detail: pdfs
            }));
          }
        }).catch(function () {});
      }
    }).catch(function () {
      setSyncing(false);
      toast.show('Sync fehlgeschlagen', 'error');
    });
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "fade-in",
    "data-screen-label": "Einstellungen"
  }, /*#__PURE__*/React.createElement(PageHead, {
    label: "Einstellungen",
    title: "Einstellungen"
  }), /*#__PURE__*/React.createElement("div", {
    className: "subtabs"
  }, /*#__PURE__*/React.createElement("button", {
    className: 'subtab ' + (sub === 'email' ? 'active' : ''),
    onClick: function () {
      setSub('email');
    }
  }, "E-Mail"), /*#__PURE__*/React.createElement("button", {
    className: 'subtab ' + (sub === 'dienstzeiten' ? 'active' : ''),
    onClick: function () {
      setSub('dienstzeiten');
    }
  }, "Dienstzeiten"), /*#__PURE__*/React.createElement("button", {
    className: 'subtab ' + (sub === 'datensicherung' ? 'active' : ''),
    onClick: function () {
      setSub('datensicherung');
    }
  }, "Datensicherung"), /*#__PURE__*/React.createElement("button", {
    className: 'subtab ' + (sub === 'allgemein' ? 'active' : ''),
    onClick: function () {
      setSub('allgemein');
    }
  }, "Allgemein"), /*#__PURE__*/React.createElement("button", {
    className: 'subtab ' + (sub === 'webcal' ? 'active' : ''),
    onClick: function () {
      setSub('webcal');
    }
  }, "Webcal")), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 760,
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      marginTop: 16
    }
  }, sub === 'email' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Card, {
    title: "SMTP-Versand"
  }, !settings.smtp_host && /*#__PURE__*/React.createElement(Hint, {
    glyph: "\u26A0\uFE0F",
    tone: "amber"
  }, /*#__PURE__*/React.createElement("strong", null, "SMTP nicht konfiguriert."), " Bitte SMTP-Host, Port und Benutzer ausf\xFCllen und speichern \u2014 ohne diese Felder kann kein Mail versendet werden."), /*#__PURE__*/React.createElement("div", {
    className: "field-row",
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "SMTP-Host"), /*#__PURE__*/React.createElement("input", {
    type: "text",
    className: "input",
    value: smtpHost,
    onChange: function (e) {
      setSmtpHost(e.target.value);
    },
    placeholder: settings.smtp_host_default || 'smtp.example.com'
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 100
    }
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Port"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    className: "input",
    value: smtpPort,
    onChange: function (e) {
      setSmtpPort(e.target.value);
    },
    placeholder: String(settings.smtp_port_default || 587),
    style: {
      fontFamily: 'var(--font-mono)'
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "field",
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Benutzer / Login (SMTP)"), /*#__PURE__*/React.createElement("input", {
    type: "email",
    className: "input",
    value: smtpUser,
    onChange: function (e) {
      setSmtpUser(e.target.value);
    },
    placeholder: settings.smtp_user_default || 'mail@firma.ch'
  }), /*#__PURE__*/React.createElement("div", {
    className: "field-hint"
  }, "SMTP-Login f\xFCr die Serververbindung \u2014 nicht der Anzeigename, sondern die technische Absenderadresse.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'center',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary btn-sm",
    onClick: function () {
      saveSection({
        smtp_host: smtpHost,
        smtp_port: smtpPort ? parseInt(smtpPort) : null,
        smtp_user: smtpUser
      }, setSavingSmtp, 'SMTP-Einstellungen gespeichert', function (fresh) {
        setSmtpHost(fresh.smtp_host || '');
        setSmtpPort(fresh.smtp_port != null ? String(fresh.smtp_port) : '');
        setSmtpUser(fresh.smtp_user || '');
      });
    },
    disabled: savingSmtp || smtpUnchanged
  }, savingSmtp ? 'Speichern…' : 'Speichern'), smtpUnchanged && /*#__PURE__*/React.createElement("span", {
    className: "muted small"
  }, "Keine \xC4nderungen")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16,
      paddingTop: 12,
      borderTop: '1px solid var(--border)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "field-label",
    style: {
      marginBottom: 6
    }
  }, "Verbindung testen"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'center',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "password",
    className: "input",
    style: {
      maxWidth: 220
    },
    value: smtpTestPw,
    onChange: function (e) {
      setSmtpTestPw(e.target.value);
    },
    placeholder: "SMTP-Passwort / Token"
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-outline btn-sm",
    onClick: testSmtp,
    disabled: testingSmtp || !smtpTestPw.trim()
  }, testingSmtp ? 'Teste…' : 'Verbindung testen')), smtpTestResult && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8,
      padding: '8px 10px',
      borderRadius: 6,
      background: smtpTestResult.ok ? 'var(--green-bg-soft)' : 'var(--red-bg-soft)',
      color: smtpTestResult.ok ? 'var(--green-500)' : 'var(--red-500)',
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      marginBottom: 4,
      opacity: 0.7
    }
  }, smtpTestResult.smtp_host, ":", smtpTestResult.smtp_port, " \xB7 Benutzer: ", smtpTestResult.smtp_user), smtpTestResult.ok ? '✅ SMTP-Verbindung erfolgreich – Einstellungen gespeichert' : '❌ ' + smtpTestResult.error))), /*#__PURE__*/React.createElement(Card, {
    title: "E-Mail-Inhalt"
  }, /*#__PURE__*/React.createElement(Hint, {
    tone: ""
  }, "Platzhalter \u2014 Betreff & Text: ", /*#__PURE__*/React.createElement("code", null, '{monat}'), " ", /*#__PURE__*/React.createElement("code", null, '{jahr}'), " ", /*#__PURE__*/React.createElement("code", null, '{kuerzel}'), ' · ', "Text: ", /*#__PURE__*/React.createElement("code", null, '{vorname}')), /*#__PURE__*/React.createElement("div", {
    className: "field",
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Absender (Anzeigename)"), /*#__PURE__*/React.createElement("input", {
    type: "text",
    className: "input",
    value: absender,
    onChange: function (e) {
      setAbsender(e.target.value);
    },
    placeholder: settings.email_absender_default || ''
  }), /*#__PURE__*/React.createElement("div", {
    className: "field-hint"
  }, "Leer = Standard: ", /*#__PURE__*/React.createElement("code", null, settings.email_absender_default))), /*#__PURE__*/React.createElement("div", {
    className: "field",
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Betreff"), /*#__PURE__*/React.createElement("input", {
    type: "text",
    className: "input",
    value: betreff,
    onChange: function (e) {
      setBetreff(e.target.value);
    },
    placeholder: settings.email_betreff_default || ''
  }), /*#__PURE__*/React.createElement("div", {
    className: "field-hint"
  }, "Leer = Standard: ", /*#__PURE__*/React.createElement("code", null, settings.email_betreff_default))), /*#__PURE__*/React.createElement("div", {
    className: "field",
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "E-Mail-Text"), /*#__PURE__*/React.createElement("textarea", {
    className: "input",
    value: text,
    onChange: function (e) {
      setText(e.target.value);
    },
    placeholder: settings.email_text_default || '',
    rows: 10,
    style: {
      fontFamily: 'var(--font-mono)',
      resize: 'vertical',
      lineHeight: 1.5
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "field-hint"
  }, "Leer = Standard-Text")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'center',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary btn-sm",
    onClick: function () {
      saveSection({
        email_absender: absender,
        email_betreff: betreff,
        email_text: text
      }, setSavingMail, 'E-Mail-Einstellungen gespeichert', function (fresh) {
        setAbsender(fresh.email_absender || '');
        setBetreff(fresh.email_betreff || '');
        setText(fresh.email_text || '');
      });
    },
    disabled: savingMail || mailUnchanged
  }, savingMail ? 'Speichern…' : 'Speichern'), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost btn-sm",
    onClick: function () {
      setAbsender('');
      setBetreff('');
      setText('');
    }
  }, "Auf Standardwerte zur\xFCcksetzen"), mailUnchanged && /*#__PURE__*/React.createElement("span", {
    className: "muted small"
  }, "Keine \xC4nderungen")), /*#__PURE__*/React.createElement("div", {
    className: "field-hint",
    style: {
      marginTop: 10
    }
  }, "Mailtexte f\xFCr den Webcal-Link: Unterbereich ", /*#__PURE__*/React.createElement("strong", null, "Webcal"), "."))), sub === 'dienstzeiten' && /*#__PURE__*/React.createElement(Card, {
    title: "Dienstzeiten"
  }, /*#__PURE__*/React.createElement(DienstzeitenEditor, null)), sub === 'datensicherung' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(BackupSection, null), /*#__PURE__*/React.createElement(PdfArchivSection, null)), sub === 'allgemein' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Card, {
    title: "Allgemein"
  }, /*#__PURE__*/React.createElement("div", {
    className: "field",
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Zeitzone (ICS-Export)"), /*#__PURE__*/React.createElement("input", {
    type: "text",
    className: "input",
    value: timezone,
    onChange: function (e) {
      setTimezone(e.target.value);
    },
    placeholder: settings.timezone_default || 'Europe/Zurich',
    style: {
      fontFamily: 'var(--font-mono)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "field-hint"
  }, "Leer = ", /*#__PURE__*/React.createElement("code", null, settings.timezone_default || 'Europe/Zurich'), ". G\xFCltige IANA-Zeitzone.")), /*#__PURE__*/React.createElement("div", {
    className: "field",
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "PDF-Dateinamensmuster"), /*#__PURE__*/React.createElement("input", {
    type: "text",
    className: "input",
    value: pdfTemplate,
    onChange: function (e) {
      setPdfTemplate(e.target.value);
    },
    placeholder: settings.pdf_template_default || 'Plan - {month} {year}.pdf',
    style: {
      fontFamily: 'var(--font-mono)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "field-hint"
  }, "Leer = ", /*#__PURE__*/React.createElement("code", null, settings.pdf_template_default), ". Platzhalter: ", /*#__PURE__*/React.createElement("code", null, '{month}'), " ", /*#__PURE__*/React.createElement("code", null, '{year}'))), /*#__PURE__*/React.createElement("div", {
    className: "field",
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Standort-Sortierreihenfolge"), /*#__PURE__*/React.createElement("input", {
    type: "text",
    className: "input",
    value: ortReihenfolge,
    onChange: function (e) {
      setOrtReihenfolge(e.target.value);
    },
    placeholder: "Standort A, Standort B, Standort C"
  }), /*#__PURE__*/React.createElement("div", {
    className: "field-hint"
  }, "Kommagetrennt. Bestimmt die Reihenfolge der Standort-Karten im Dashboard. Leer = alphabetisch.")), /*#__PURE__*/React.createElement("div", {
    className: "field",
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Untertitel im Kopfbereich"), /*#__PURE__*/React.createElement("input", {
    type: "text",
    className: "input",
    value: brandUntertitel,
    onChange: function (e) {
      setBrandUntertitel(e.target.value);
    },
    placeholder: "z.B. Betrieb \xB7 Plan 1"
  }), /*#__PURE__*/React.createElement("div", {
    className: "field-hint"
  }, "Erscheint neben \xABDienstplanung\xBB im Kopfbereich. Leer = ausgeblendet.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'center',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary btn-sm",
    onClick: function () {
      saveSection({
        timezone: timezone,
        pdf_template: pdfTemplate,
        ort_reihenfolge: ortReihenfolge,
        brand_untertitel: brandUntertitel
      }, setSavingGeneral, 'Einstellungen gespeichert');
    },
    disabled: savingGeneral || generalUnchanged
  }, savingGeneral ? 'Speichern…' : 'Speichern'), generalUnchanged && /*#__PURE__*/React.createElement("span", {
    className: "muted small"
  }, "Keine \xC4nderungen"))), /*#__PURE__*/React.createElement(Card, {
    title: "PDF-Synchronisation"
  }, /*#__PURE__*/React.createElement("div", {
    className: "field",
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: pdfSyncAktiv,
    onChange: function (e) {
      setPdfSyncAktiv(e.target.checked);
    }
  }), /*#__PURE__*/React.createElement("span", null, "Automatisch 1\xD7 t\xE4glich synchronisieren"))), /*#__PURE__*/React.createElement("div", {
    className: "field",
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Quell-Ordner (lokaler Pfad)"), /*#__PURE__*/React.createElement("input", {
    type: "text",
    className: "input",
    value: pdfSyncOrdner,
    onChange: function (e) {
      setPdfSyncOrdner(e.target.value);
    },
    placeholder: "/home/user/Dienstpl\xE4ne",
    style: {
      fontFamily: 'var(--font-mono)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "field-hint"
  }, "Ordner, in dem du die PDFs ablegt. Neue oder ge\xE4nderte Dateien werden nach PEP_pdf/ kopiert und importiert.")), /*#__PURE__*/React.createElement("div", {
    className: "field",
    style: {
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "T\xE4gliche Sync-Uhrzeit"), /*#__PURE__*/React.createElement("input", {
    type: "time",
    className: "input",
    value: pdfSyncUhrzeit,
    onChange: function (e) {
      setPdfSyncUhrzeit(e.target.value);
    },
    style: {
      width: 120
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'center',
      marginBottom: 14,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary btn-sm",
    onClick: function () {
      saveSection({
        pdf_sync_ordner: pdfSyncOrdner,
        pdf_sync_uhrzeit: pdfSyncUhrzeit,
        pdf_sync_aktiv: pdfSyncAktiv
      }, setSavingSync, 'PDF-Sync gespeichert', function (fresh) {
        setPdfSyncOrdner(fresh.pdf_sync_ordner || '');
        setPdfSyncUhrzeit(fresh.pdf_sync_uhrzeit || '03:00');
        setPdfSyncAktiv(!!fresh.pdf_sync_aktiv);
        fetch('/api/pdf/sync/status').then(function (r) {
          return r.json();
        }).then(setSyncStatus).catch(function () {});
      });
    },
    disabled: savingSync || syncUnchanged
  }, savingSync ? 'Speichern…' : 'Speichern'), syncUnchanged && /*#__PURE__*/React.createElement("span", {
    className: "muted small"
  }, "Keine \xC4nderungen")), /*#__PURE__*/React.createElement("hr", {
    style: {
      margin: '12px 0',
      borderColor: 'var(--hairline)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'center',
      marginBottom: 10,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-sm",
    onClick: syncNow,
    disabled: syncing || !pdfSyncOrdner.trim()
  }, syncing ? 'Läuft…' : 'Jetzt synchronisieren'), !pdfSyncOrdner.trim() && /*#__PURE__*/React.createElement("span", {
    className: "muted small"
  }, "Ordner konfigurieren")), syncStatus && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--ink-muted)',
      display: 'flex',
      flexDirection: 'column',
      gap: 4
    }
  }, syncStatus.letzter_sync && /*#__PURE__*/React.createElement("div", null, "Letzter Sync: ", /*#__PURE__*/React.createElement("strong", null, syncStatus.letzter_sync), syncStatus.letztes_ergebnis && syncStatus.letztes_ergebnis.ok && /*#__PURE__*/React.createElement("span", null, ' — ', (syncStatus.letztes_ergebnis.kopiert || []).length === 0 ? 'keine Änderungen' : (syncStatus.letztes_ergebnis.kopiert || []).length + ' Datei(en) kopiert', (syncStatus.letztes_ergebnis.importiert || []).length > 0 && ', Import gestartet: ' + syncStatus.letztes_ergebnis.importiert.join(', ')), syncStatus.letztes_ergebnis && !syncStatus.letztes_ergebnis.ok && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--red-500)'
    }
  }, " \u2014 ", syncStatus.letztes_ergebnis.error)), syncStatus.naechster_sync && /*#__PURE__*/React.createElement("div", null, "N\xE4chster Sync: ", /*#__PURE__*/React.createElement("strong", null, syncStatus.naechster_sync)))), /*#__PURE__*/React.createElement(Card, {
    title: "Info"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "muted small"
  }, "Skript-Ordner"), /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("code", {
    style: {
      fontSize: 11
    }
  }, settings.script_dir)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "muted small"
  }, "Einstellungsdatei"), /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("code", {
    style: {
      fontSize: 11
    }
  }, settings.settings_file)), /*#__PURE__*/React.createElement("div", {
    className: "field-hint",
    style: {
      marginTop: 4
    }
  }, "Die Einstellungsdatei liegt ausserhalb des Projektordners und wird von Cloud-Sync nicht \xFCberschrieben.")))), sub === 'webcal' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Card, {
    title: "Webcal-Konfiguration"
  }, /*#__PURE__*/React.createElement("div", {
    className: "field",
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Webcal Basis-URL"), /*#__PURE__*/React.createElement("input", {
    type: "text",
    className: "input",
    value: webcalBaseUrl,
    onChange: function (e) {
      setWebcalBaseUrl(e.target.value);
    },
    placeholder: 'https://meine-domain.ch',
    style: {
      fontFamily: 'var(--font-mono)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "field-hint"
  }, "Externe Basis-URL f\xFCr Kalender-Abo-Links (z. B. via Cloudflare Tunnel). Leer = automatisch aus dem Browser-Zugriff ermittelt (", /*#__PURE__*/React.createElement("code", null, "window.location.origin"), ").")), /*#__PURE__*/React.createElement("div", {
    className: "field",
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Webcal Vergangenheit (Tage)"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    className: "input",
    min: "0",
    max: "3650",
    value: webcalTageVergangenheit,
    onChange: function (e) {
      setWebcalTageVergangenheit(e.target.value);
    },
    style: {
      width: 100
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "field-hint"
  }, "Wie viele Tage in die Vergangenheit der Kalender-Feed synchronisiert. Standard: 30. ", /*#__PURE__*/React.createElement("strong", null, "0 = alle Daten ohne Einschr\xE4nkung."))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4,
      paddingTop: 14,
      borderTop: '1px solid var(--hairline)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "field-label",
    style: {
      marginBottom: 6,
      fontWeight: 600
    }
  }, "Webcal-Link per Mail"), /*#__PURE__*/React.createElement(Hint, {
    tone: ""
  }, "Wird versendet wenn bei einem MA der Versandmodus \xABWebcal-Link\xBB oder \xABICS + Webcal\xBB gew\xE4hlt ist. Platzhalter: ", /*#__PURE__*/React.createElement("code", null, '{vorname}'), " ", /*#__PURE__*/React.createElement("code", null, '{ma_name}'), " ", /*#__PURE__*/React.createElement("code", null, '{webcal_link}')), /*#__PURE__*/React.createElement("div", {
    className: "field",
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Betreff (Webcal)"), /*#__PURE__*/React.createElement("input", {
    type: "text",
    className: "input",
    value: webcalEmailBetreff,
    onChange: function (e) {
      setWebcalEmailBetreff(e.target.value);
    },
    placeholder: settings.webcal_email_betreff_default || ''
  }), /*#__PURE__*/React.createElement("div", {
    className: "field-hint"
  }, "Leer = Standard: ", /*#__PURE__*/React.createElement("code", null, settings.webcal_email_betreff_default))), /*#__PURE__*/React.createElement("div", {
    className: "field",
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "E-Mail-Text (Webcal)"), /*#__PURE__*/React.createElement("textarea", {
    className: "input",
    value: webcalEmailText,
    onChange: function (e) {
      setWebcalEmailText(e.target.value);
    },
    placeholder: settings.webcal_email_text_default || '',
    rows: 10,
    style: {
      fontFamily: 'var(--font-mono)',
      resize: 'vertical',
      lineHeight: 1.5
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "field-hint"
  }, "Leer = Standard-Text. ", /*#__PURE__*/React.createElement("code", null, '{webcal_link}'), " wird durch den Webcal-Link ersetzt."))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'center',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary btn-sm",
    onClick: function () {
      saveSection({
        webcal_base_url: webcalBaseUrl,
        webcal_tage_vergangenheit: webcalTageVergangenheit,
        webcal_email_betreff: webcalEmailBetreff,
        webcal_email_text: webcalEmailText
      }, setSavingWebcal, 'Webcal-Einstellungen gespeichert', function (fresh) {
        setWebcalBaseUrl(fresh.webcal_base_url || '');
        setWebcalTageVergangenheit(fresh.webcal_tage_vergangenheit != null ? String(fresh.webcal_tage_vergangenheit) : '30');
        setWebcalEmailBetreff(fresh.webcal_email_betreff || '');
        setWebcalEmailText(fresh.webcal_email_text || '');
      });
    },
    disabled: savingWebcal || webcalUnchanged
  }, savingWebcal ? 'Speichern…' : 'Speichern'), webcalUnchanged && /*#__PURE__*/React.createElement("span", {
    className: "muted small"
  }, "Keine \xC4nderungen"))), /*#__PURE__*/React.createElement(Card, {
    title: "Kalender-Abonnements (Webcal)"
  }, /*#__PURE__*/React.createElement(WebcalUebersicht, null)))));
}
window.TabEinstellungen = TabEinstellungen;