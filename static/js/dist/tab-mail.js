// Tab: Versand — ICS pro Mitarbeiter versenden + erstellte Kalender-Dateien
function TabMail({
  monat,
  jahr
}) {
  const toast = useToast();
  const {
    lines,
    running,
    start
  } = useStreamingLog();
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
  React.useEffect(function () {
    fetch('/api/files/ics').then(function (r) {
      return r.json();
    }).then(function (data) {
      if (Array.isArray(data)) setIcsHistorie(data);
    }).catch(function () {});
  }, []);
  React.useEffect(function () {
    fetch('/api/settings').then(function (r) {
      return r.json();
    }).then(function (d) {
      setMailTpls({
        betreff: d.email_betreff || d.email_betreff_default || '',
        text: d.email_text || d.email_text_default || ''
      });
    }).catch(function () {});
  }, []);

  // MA-Liste laden
  React.useEffect(function () {
    fetch('/api/ma/list').then(function (r) {
      return r.json();
    }).then(function (data) {
      if (Array.isArray(data)) {
        setMaListe(data);
        setAuswahl(new Set(data.filter(function (m) {
          return m.email && m.aktiv && m.webcal_mail_modus !== 'webcal';
        }).map(function (m) {
          return m.kuerzel;
        })));
      }
    }).catch(function () {});
  }, []);
  const loadVersandLog = function () {
    fetch('/api/mail/versand-log?month=' + monat + '&year=' + jahr).then(function (r) {
      return r.json();
    }).then(function (data) {
      if (data && typeof data === 'object') setVersandLog(data);
    }).catch(function () {});
  };
  React.useEffect(function () {
    loadVersandLog();
  }, [monat, jahr]);

  // Änderungen laden wenn modus = nur_aenderungen oder bei Monat/Jahr-Wechsel
  React.useEffect(function () {
    fetch('/api/mail/vorschau?month=' + monat + '&year=' + jahr).then(function (r) {
      return r.json();
    }).then(function (data) {
      if (Array.isArray(data)) {
        setAenderungen(data.map(function (a) {
          return Object.assign({}, a, {
            diffs: []
          });
        }));
      }
    }).catch(function () {
      setAenderungen([]);
    });
  }, [monat, jahr]);
  function fmtSent(ts) {
    if (!ts) return null;
    const parts = ts.split(' ');
    const d = (parts[0] || '').split('-');
    if (d.length < 3) return ts.substring(0, 10);
    return d[2] + '.' + d[1] + '.' + d[0] + ' ' + (parts[1] || '').substring(0, 5);
  }
  const empfaengerListe = maListe.filter(function (m) {
    return m.email && m.aktiv && m.webcal_mail_modus !== 'webcal';
  });
  const aendKuerzel = new Set(aenderungen.map(function (a) {
    return a.kuerzel;
  }));
  const filteredAuswahl = auswahlNurAend ? empfaengerListe.filter(function (m) {
    return aendKuerzel.has(m.kuerzel);
  }) : empfaengerListe;
  const sendList = modus === 'alle' ? empfaengerListe : modus === 'nur_aenderungen' ? empfaengerListe.filter(function (m) {
    return aendKuerzel.has(m.kuerzel);
  }) : empfaengerListe.filter(function (m) {
    return auswahl.has(m.kuerzel);
  });
  const toggle = function (k) {
    setAuswahl(function (cur) {
      const n = new Set(cur);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  };
  const toggleExpand = function (kuerzel) {
    setExpanded(function (cur) {
      return cur === kuerzel ? null : kuerzel;
    });
  };
  function fmtTpl(tpl, vars) {
    return tpl.replace(/\{(\w+)\}/g, function (_, k) {
      return vars[k] != null ? vars[k] : '{' + k + '}';
    });
  }
  const openIcsPreview = function (kuerzel, name) {
    setIcsPreview({
      kuerzel,
      name,
      events: null,
      loading: true,
      error: ''
    });
    fetch('/api/ics/vorschau?kuerzel=' + encodeURIComponent(kuerzel) + '&month=' + encodeURIComponent(monat) + '&year=' + encodeURIComponent(jahr)).then(function (r) {
      return r.json();
    }).then(function (d) {
      if (d && d.error) {
        setIcsPreview(function (p) {
          return Object.assign({}, p, {
            loading: false,
            error: d.error
          });
        });
      } else {
        setIcsPreview(function (p) {
          return Object.assign({}, p, {
            loading: false,
            events: Array.isArray(d) ? d : []
          });
        });
      }
    }).catch(function () {
      setIcsPreview(function (p) {
        return Object.assign({}, p, {
          loading: false,
          error: 'Verbindungsfehler'
        });
      });
    });
  };
  const sendTest = async function () {
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
      const resp = await fetch('/api/mail', {
        method: 'POST',
        body: data
      });
      const json = await resp.json();
      if (json.error) {
        toast.show(json.error, 'error');
        return;
      }
      start(json.task_id, function () {
        toast.show('Testmail gesendet');
      });
    } catch (e) {
      toast.show('Verbindungsfehler', 'error');
    }
  };
  const openPreview = function (ma) {
    if (!ma) ma = sendList[0];
    if (!ma) return;
    const vars = {
      monat: monat,
      jahr: String(jahr),
      ma_name: (ma.vorname || '') + ' ' + (ma.nachname || ''),
      kuerzel: ma.kuerzel,
      vorname: ma.vorname || ma.kuerzel
    };
    setPreview({
      ma: ma,
      monat: monat,
      jahr: jahr,
      betreff: mailTpls ? fmtTpl(mailTpls.betreff, vars) : 'Dienstplan ' + monat + ' ' + jahr,
      body: mailTpls ? fmtTpl(mailTpls.text, vars) : '(Templates werden geladen…)',
      anhang: 'Dienstplan_' + (ma.nachname || ma.kuerzel) + '_' + monat + '_' + jahr + '.ics'
    });
  };
  const alsVersendetMarkieren = async function () {
    if (!window.confirm(monat + ' ' + jahr + ' als versendet markieren?\n\nDadurch wird für alle Mitarbeitenden ein manueller Versand-Eintrag gesetzt, ohne dass Mails verschickt werden.')) return;
    try {
      const resp = await fetch('/api/mail/als-versendet-markieren', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          month: monat,
          year: String(jahr)
        })
      });
      const json = await resp.json();
      if (json.error) {
        toast.show(json.error, 'error');
        return;
      }
      toast.show(monat + ' ' + jahr + ' als versendet markiert (' + json.count + ' MA)');
      loadVersandLog();
    } catch (e) {
      toast.show('Fehler: ' + (e.message || 'Netzwerkfehler'), 'error');
    }
  };
  const send = async function (dryRun) {
    if (running) return;
    if (!dryRun && !smtpPw) {
      toast.show('SMTP-Passwort erforderlich', 'error');
      return;
    }
    const data = new FormData();
    data.set('month', monat);
    data.set('year', String(jahr));
    data.set('dry_run', dryRun ? '1' : '0');
    data.set('empfaenger_modus', modus);
    data.set('smtp_pw', smtpPw);
    if (modus === 'auswahl') data.set('selected_ma', [...auswahl].join(','));
    if (testAn) data.set('test_an', testAn);
    try {
      const resp = await fetch('/api/mail', {
        method: 'POST',
        body: data
      });
      const json = await resp.json();
      if (json.error) {
        toast.show(json.error, 'error');
        return;
      }
      start(json.task_id, function () {
        toast.show(dryRun ? 'Vorschau fertig' : 'Versand abgeschlossen');
        if (!dryRun) loadVersandLog();
      });
    } catch (e) {
      toast.show('Verbindungsfehler', 'error');
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "fade-in",
    "data-screen-label": "Versand"
  }, /*#__PURE__*/React.createElement(PageHead, {
    label: "Workflow",
    title: "Versand",
    subtitle: "Pers\xF6nliche Kalender-Datei (.ics) an Mitarbeitende senden \u2014 alle, nur ge\xE4nderte oder eine eigene Auswahl."
  }), /*#__PURE__*/React.createElement("div", {
    className: "split-main-aside"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(Card, {
    title: "Empf\xE4nger",
    right: monat + ' ' + jahr
  }, /*#__PURE__*/React.createElement("div", {
    className: "chip-row",
    style: {
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: 'chip ' + (modus === 'alle' ? 'active' : ''),
    onClick: function () {
      setModus('alle');
      setExpanded(null);
    }
  }, "Alle mit E-Mail ", /*#__PURE__*/React.createElement("span", {
    className: "count"
  }, empfaengerListe.length)), /*#__PURE__*/React.createElement("button", {
    className: 'chip ' + (modus === 'nur_aenderungen' ? 'active' : ''),
    onClick: function () {
      setModus('nur_aenderungen');
      setExpanded(null);
    }
  }, "Nur ge\xE4nderte ", /*#__PURE__*/React.createElement("span", {
    className: "count"
  }, aenderungen.length)), /*#__PURE__*/React.createElement("button", {
    className: 'chip ' + (modus === 'auswahl' ? 'active' : ''),
    onClick: function () {
      setModus('auswahl');
      setExpanded(null);
    }
  }, "Eigene Auswahl ", /*#__PURE__*/React.createElement("span", {
    className: "count"
  }, auswahl.size))), modus === 'nur_aenderungen' && /*#__PURE__*/React.createElement("div", {
    className: "mini-list"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mini-list-head"
  }, /*#__PURE__*/React.createElement("strong", null, aenderungen.length, " Mitarbeitende mit ge\xE4nderten Pl\xE4nen"), /*#__PURE__*/React.createElement("span", {
    className: "spacer"
  }), /*#__PURE__*/React.createElement("span", {
    className: "muted"
  }, "seit letztem Versand")), aenderungen.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "empty-state"
  }, /*#__PURE__*/React.createElement("span", {
    className: "glyph"
  }, "\u2705"), "Keine \xC4nderungen seit letztem Versand.") : aenderungen.map(function (a) {
    const m = maListe.find(function (x) {
      return x.kuerzel === a.kuerzel;
    });
    const isOpen = expanded === a.kuerzel;
    const log = versandLog[a.kuerzel];
    return /*#__PURE__*/React.createElement(React.Fragment, {
      key: a.kuerzel
    }, /*#__PURE__*/React.createElement("div", {
      className: 'mini-row expand ' + (isOpen ? 'open' : ''),
      onClick: function () {
        toggleExpand(a.kuerzel);
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "caret"
    }, "\u25B8"), /*#__PURE__*/React.createElement("span", {
      className: "name"
    }, a.vorname, " ", a.nachname), /*#__PURE__*/React.createElement("span", {
      className: "muted small"
    }, "ge\xE4ndert"), log ? /*#__PURE__*/React.createElement("span", {
      className: "muted small",
      title: 'Zuletzt an ' + log.empfaenger
    }, "zuletzt ", fmtSent(log.gesendet_am)) : /*#__PURE__*/React.createElement("span", {
      className: "muted small"
    }, "noch nie gesendet"), /*#__PURE__*/React.createElement("span", {
      className: "email"
    }, a.empfaenger || m && m.email || '—')), isOpen && /*#__PURE__*/React.createElement("div", {
      className: "diff-row"
    }, /*#__PURE__*/React.createElement("strong", null, a.vorname, " ", a.nachname), " \u2014 ", monat, " ", jahr, /*#__PURE__*/React.createElement(MaMonthCalendar, {
      kuerzel: a.kuerzel,
      monat: monat,
      jahr: String(jahr)
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 10,
        display: 'flex',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn btn-outline btn-sm",
      onClick: function (e) {
        e.stopPropagation();
        openPreview(m || a);
      }
    }, "\uD83D\uDCE7 Mail-Vorschau"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-outline btn-sm",
      onClick: function (e) {
        e.stopPropagation();
        openIcsPreview(a.kuerzel, a.vorname + ' ' + a.nachname);
      }
    }, "\uD83D\uDCC5 ICS-Vorschau"))));
  })), modus === 'auswahl' && /*#__PURE__*/React.createElement("div", {
    className: "mini-list"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mini-list-head"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost btn-sm",
    onClick: function () {
      setAuswahl(new Set(filteredAuswahl.map(function (m) {
        return m.kuerzel;
      })));
    }
  }, "Alle"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost btn-sm",
    onClick: function () {
      setAuswahl(new Set());
    }
  }, "Keine"), /*#__PURE__*/React.createElement("span", {
    className: "spacer"
  }), /*#__PURE__*/React.createElement("label", {
    className: "opt",
    style: {
      padding: 0,
      fontSize: 'var(--text-meta)'
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: auswahlNurAend,
    onChange: function (e) {
      setAuswahlNurAend(e.target.checked);
    },
    style: {
      width: 14,
      height: 14
    }
  }), /*#__PURE__*/React.createElement("span", null, "Nur mit \xC4nderungen (", aendKuerzel.size, ")")), /*#__PURE__*/React.createElement("span", {
    className: "muted",
    style: {
      marginLeft: 12
    }
  }, auswahl.size, " / ", filteredAuswahl.length)), filteredAuswahl.map(function (m) {
    const checked = auswahl.has(m.kuerzel);
    const hatAend = aendKuerzel.has(m.kuerzel);
    const isOpen = expanded === m.kuerzel;
    const log = versandLog[m.kuerzel];
    return /*#__PURE__*/React.createElement(React.Fragment, {
      key: m.kuerzel
    }, /*#__PURE__*/React.createElement("div", {
      className: 'mini-row expand ' + (isOpen ? 'open' : ''),
      onClick: function () {
        toggleExpand(m.kuerzel);
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "caret"
    }, "\u25B8"), /*#__PURE__*/React.createElement("input", {
      type: "checkbox",
      checked: checked,
      onChange: function (e) {
        e.stopPropagation();
        toggle(m.kuerzel);
      },
      onClick: function (e) {
        e.stopPropagation();
      },
      style: {
        flexShrink: 0
      }
    }), /*#__PURE__*/React.createElement("span", {
      className: "kuerzel-pill"
    }, m.kuerzel), /*#__PURE__*/React.createElement("span", {
      className: "name"
    }, m.vorname, " ", m.nachname), hatAend && /*#__PURE__*/React.createElement("span", {
      style: {
        background: 'var(--amber-bg-card)',
        color: 'var(--amber-600)',
        padding: '1px 7px',
        borderRadius: 'var(--radius-pill)',
        fontSize: 'var(--text-tiny)',
        fontWeight: 600
      }
    }, "ge\xE4ndert"), log ? /*#__PURE__*/React.createElement("span", {
      className: "muted small",
      title: 'An ' + log.empfaenger
    }, fmtSent(log.gesendet_am)) : /*#__PURE__*/React.createElement("span", {
      className: "muted small"
    }, "nie gesendet"), /*#__PURE__*/React.createElement("span", {
      className: "email"
    }, m.email)), isOpen && /*#__PURE__*/React.createElement("div", {
      className: "diff-row"
    }, /*#__PURE__*/React.createElement("strong", null, m.vorname, " ", m.nachname), " \u2014 ", monat, " ", jahr, /*#__PURE__*/React.createElement(MaMonthCalendar, {
      kuerzel: m.kuerzel,
      monat: monat,
      jahr: String(jahr)
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 10,
        display: 'flex',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn btn-outline btn-sm",
      onClick: function (e) {
        e.stopPropagation();
        openIcsPreview(m.kuerzel, m.vorname + ' ' + m.nachname);
      }
    }, "\uD83D\uDCC5 ICS-Vorschau"))));
  }), filteredAuswahl.length === 0 && /*#__PURE__*/React.createElement("div", {
    className: "empty-state"
  }, /*#__PURE__*/React.createElement("span", {
    className: "glyph"
  }, "\uD83D\uDCED"), "Keine Mitarbeitenden mit \xC4nderungen seit letztem Versand.")), modus === 'alle' && /*#__PURE__*/React.createElement("div", {
    className: "mini-list"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mini-list-head"
  }, /*#__PURE__*/React.createElement("strong", null, empfaengerListe.length, " Mitarbeitende"), " erhalten ", monat, " ", jahr), empfaengerListe.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "empty-state"
  }, /*#__PURE__*/React.createElement("span", {
    className: "glyph"
  }, "\uD83D\uDCED"), "Keine Mitarbeitenden mit hinterlegter E-Mail-Adresse.") : empfaengerListe.map(function (m) {
    const isOpen = expanded === m.kuerzel;
    const log = versandLog[m.kuerzel];
    return /*#__PURE__*/React.createElement(React.Fragment, {
      key: m.kuerzel
    }, /*#__PURE__*/React.createElement("div", {
      className: 'mini-row expand ' + (isOpen ? 'open' : ''),
      onClick: function () {
        toggleExpand(m.kuerzel);
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "caret"
    }, "\u25B8"), /*#__PURE__*/React.createElement("span", {
      className: "kuerzel-pill"
    }, m.kuerzel), /*#__PURE__*/React.createElement("span", {
      className: "name"
    }, m.vorname, " ", m.nachname), log ? /*#__PURE__*/React.createElement("span", {
      className: "muted small",
      title: 'An ' + log.empfaenger
    }, fmtSent(log.gesendet_am)) : /*#__PURE__*/React.createElement("span", {
      className: "muted small"
    }, "nie gesendet"), /*#__PURE__*/React.createElement("span", {
      className: "email"
    }, m.email)), isOpen && /*#__PURE__*/React.createElement("div", {
      className: "diff-row"
    }, /*#__PURE__*/React.createElement("strong", null, m.vorname, " ", m.nachname), " \u2014 ", monat, " ", jahr, /*#__PURE__*/React.createElement(MaMonthCalendar, {
      kuerzel: m.kuerzel,
      monat: monat,
      jahr: String(jahr)
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 10,
        display: 'flex',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn btn-outline btn-sm",
      onClick: function (e) {
        e.stopPropagation();
        openIcsPreview(m.kuerzel, m.vorname + ' ' + m.nachname);
      }
    }, "\uD83D\uDCC5 ICS-Vorschau"))));
  }))), /*#__PURE__*/React.createElement(Card, {
    title: "Versenden"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      flexWrap: 'wrap',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-outline",
    onClick: function () {
      openPreview(sendList[0]);
    },
    disabled: sendList.length === 0
  }, /*#__PURE__*/React.createElement("svg", {
    width: "15",
    height: "15",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.9",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "3"
  })), "Mail-Vorschau"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-outline",
    onClick: function () {
      send(true);
    },
    disabled: running,
    title: "Simuliert den Versand, ohne Mails zu senden"
  }, "Testlauf"), testAn && sendList.length > 0 && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-outline",
    onClick: sendTest,
    disabled: running || !smtpPw,
    title: '1 Mail für ' + sendList[0].vorname + ' ' + sendList[0].nachname + ' an ' + testAn + ' senden'
  }, /*#__PURE__*/React.createElement("svg", {
    width: "15",
    height: "15",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.9",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M22 2L11 13M22 2l-7 20-4-9-9-4z"
  })), "1 Testmail senden"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    onClick: function () {
      send(false);
    },
    disabled: running || sendList.length === 0
  }, /*#__PURE__*/React.createElement("svg", {
    width: "15",
    height: "15",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.9",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M22 2L11 13M22 2l-7 20-4-9-9-4z"
  })), sendList.length, " ", sendList.length === 1 ? 'Mail' : 'Mails', " versenden"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost btn-sm",
    onClick: alsVersendetMarkieren,
    disabled: running,
    title: "Monat als versendet markieren, ohne Mails zu senden — nützlich wenn der Versand auf einem anderen System stattgefunden hat",
    style: {
      marginLeft: 'auto',
      color: 'var(--ink-muted)'
    }
  }, "Als versendet markieren"), testAn && /*#__PURE__*/React.createElement("span", {
    className: "muted small"
  }, "\u2192 alle an ", /*#__PURE__*/React.createElement("strong", null, testAn)))), /*#__PURE__*/React.createElement("div", {
    className: "card"
  }, /*#__PURE__*/React.createElement(Log, {
    lines: lines,
    running: running,
    title: "Versand-Protokoll"
  })), /*#__PURE__*/React.createElement(Card, {
    title: "Erstellte Kalender-Dateien (ICS)"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'center',
      margin: '0 0 8px'
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "search",
    className: "input",
    placeholder: "Monat oder Mitarbeitende suchen\u2026",
    value: icsSearch,
    onChange: function (e) {
      setIcsSearch(e.target.value);
      setIcsOpen(null);
    },
    style: {
      flex: 1,
      padding: '6px 12px',
      fontSize: '0.85rem'
    }
  }), icsSearch && /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost btn-sm",
    onClick: function () {
      setIcsSearch('');
    }
  }, "\u2715 Zur\xFCcksetzen")), /*#__PURE__*/React.createElement("div", {
    className: "file-list"
  }, icsHistorie.length === 0 ? /*#__PURE__*/React.createElement("div", {
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
  }, /*#__PURE__*/React.createElement("rect", {
    x: "3",
    y: "4",
    width: "18",
    height: "18",
    rx: "2"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "16",
    y1: "2",
    x2: "16",
    y2: "6"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "8",
    y1: "2",
    x2: "8",
    y2: "6"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "3",
    y1: "10",
    x2: "21",
    y2: "10"
  })), "Noch keine ICS-Dateien \u2014 zuerst einen Plan importieren.") : function () {
    const q = icsSearch.toLowerCase();
    const results = icsHistorie.reduce(function (acc, m, i) {
      if (!q) {
        acc.push({
          m: m,
          i: i,
          matchedFiles: null
        });
        return acc;
      }
      if (m.monat_jahr.toLowerCase().includes(q)) {
        acc.push({
          m: m,
          i: i,
          matchedFiles: null
        });
        return acc;
      }
      const hits = (m.files || []).filter(function (f) {
        return (typeof f === 'string' ? f : f.name).toLowerCase().includes(q);
      });
      if (hits.length > 0) acc.push({
        m: m,
        i: i,
        matchedFiles: hits
      });
      return acc;
    }, []);
    if (results.length === 0) return /*#__PURE__*/React.createElement("div", {
      className: "empty-state"
    }, "Keine Treffer.");
    return results.map(function (row) {
      const {
        m,
        i,
        matchedFiles
      } = row;
      const isOpen = icsOpen === i || matchedFiles !== null;
      const files = matchedFiles || m.files || [];
      return /*#__PURE__*/React.createElement("div", {
        key: m.monat_jahr
      }, /*#__PURE__*/React.createElement("div", {
        className: "file-row",
        style: {
          cursor: 'pointer'
        },
        onClick: function () {
          setIcsOpen(isOpen && matchedFiles === null ? null : i);
        }
      }, /*#__PURE__*/React.createElement("svg", {
        width: "14",
        height: "14",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "1.9",
        strokeLinecap: "round",
        strokeLinejoin: "round",
        style: {
          color: 'var(--ink-faint)',
          transform: isOpen ? 'rotate(90deg)' : 'none',
          transition: 'transform 0.15s',
          flexShrink: 0
        }
      }, /*#__PURE__*/React.createElement("polyline", {
        points: "9 18 15 12 9 6"
      })), /*#__PURE__*/React.createElement("svg", {
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
      }, /*#__PURE__*/React.createElement("rect", {
        x: "3",
        y: "4",
        width: "18",
        height: "18",
        rx: "2"
      }), /*#__PURE__*/React.createElement("line", {
        x1: "16",
        y1: "2",
        x2: "16",
        y2: "6"
      }), /*#__PURE__*/React.createElement("line", {
        x1: "8",
        y1: "2",
        x2: "8",
        y2: "6"
      }), /*#__PURE__*/React.createElement("line", {
        x1: "3",
        y1: "10",
        x2: "21",
        y2: "10"
      })), /*#__PURE__*/React.createElement("span", {
        className: "name"
      }, m.monat_jahr), /*#__PURE__*/React.createElement("span", {
        className: "meta"
      }, files.length, " ", matchedFiles ? 'Treffer' : 'Dateien')), isOpen && /*#__PURE__*/React.createElement("div", {
        style: {
          paddingLeft: 32
        }
      }, files.map(function (f) {
        const fname = typeof f === 'string' ? f : f.name;
        return /*#__PURE__*/React.createElement(IcsFileItem, {
          key: fname,
          monatJahr: m.monat_jahr,
          filename: fname
        });
      })));
    });
  }()))), /*#__PURE__*/React.createElement("div", {
    className: "aside-sticky"
  }, /*#__PURE__*/React.createElement(Card, {
    title: "E-Mail-Zugang"
  }, /*#__PURE__*/React.createElement("div", {
    className: "field",
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Passwort"), /*#__PURE__*/React.createElement("input", {
    type: "password",
    className: "input",
    value: smtpPw,
    onChange: function (e) {
      setSmtpPw(e.target.value);
    },
    placeholder: "Wird nicht gespeichert",
    autoComplete: "off"
  }), /*#__PURE__*/React.createElement("div", {
    className: "field-hint",
    style: {
      marginTop: 5,
      fontSize: 11.5,
      color: 'var(--ink-muted)',
      display: 'flex',
      gap: 5,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "3",
    y: "11",
    width: "18",
    height: "11",
    rx: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M7 11V7a5 5 0 0110 0v4"
  })), "Wird nicht gespeichert")), /*#__PURE__*/React.createElement("div", {
    className: "field"
  }, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Test-Empf\xE4nger", /*#__PURE__*/React.createElement("span", {
    className: "muted small",
    style: {
      fontWeight: 400,
      marginLeft: 6
    }
  }, "(optional)"), /*#__PURE__*/React.createElement(HelpTip, {
    text: "Wenn hier eine E-Mail-Adresse eingetragen ist, gehen alle Mails nur an diese Adresse \u2014 nicht an die echten Empf\xE4nger. Ideal zum Testen vor dem echten Versand."
  })), /*#__PURE__*/React.createElement("input", {
    type: "email",
    className: "input",
    value: testAn,
    onChange: function (e) {
      setTestAn(e.target.value);
    },
    placeholder: "test@example.com"
  }), testAn && /*#__PURE__*/React.createElement("div", {
    className: "field-hint",
    style: {
      marginTop: 5,
      fontSize: 11.5,
      color: 'var(--amber-600)'
    }
  }, "Alle Mails gehen nur an diese Adresse."))))), icsPreview && /*#__PURE__*/React.createElement(Modal, {
    label: "Kalender",
    title: 'ICS-Vorschau · ' + icsPreview.name + ' · ' + monat + ' ' + jahr,
    onClose: function () {
      setIcsPreview(null);
    },
    footer: /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost",
      onClick: function () {
        setIcsPreview(null);
      }
    }, "Schliessen")
  }, icsPreview.loading && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 32,
      textAlign: 'center',
      color: 'var(--ink-muted)'
    }
  }, "Lade\u2026"), icsPreview.error && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 16,
      color: 'var(--red-500)'
    }
  }, icsPreview.error), icsPreview.events && /*#__PURE__*/React.createElement(IcsEventList, {
    events: icsPreview.events
  })), preview && /*#__PURE__*/React.createElement(Modal, {
    label: "Versand",
    title: 'Mail-Vorschau · ' + preview.ma.vorname + ' ' + preview.ma.nachname,
    onClose: function () {
      setPreview(null);
    },
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
      className: "muted small",
      style: {
        marginRight: 'auto'
      }
    }, "So sieht die erste von ", sendList.length, " ", sendList.length === 1 ? 'Mail' : 'Mails', " aus."), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost",
      onClick: function () {
        setPreview(null);
      }
    }, "Schliessen"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-primary",
      onClick: function () {
        setPreview(null);
        send(false);
      },
      disabled: running || !smtpPw
    }, "Versenden"))
  }, /*#__PURE__*/React.createElement("div", {
    className: "mail-pane"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mail-meta-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "label"
  }, "An"), /*#__PURE__*/React.createElement("span", {
    className: "value"
  }, testAn || preview.ma.email || preview.ma.empfaenger || '—')), /*#__PURE__*/React.createElement("div", {
    className: "mail-meta-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "label"
  }, "Betreff"), /*#__PURE__*/React.createElement("span", {
    className: "value",
    style: {
      fontWeight: 600
    }
  }, preview.betreff)), /*#__PURE__*/React.createElement("div", {
    className: "mail-body"
  }, preview.body), /*#__PURE__*/React.createElement("div", {
    className: "mail-attach"
  }, /*#__PURE__*/React.createElement("span", {
    className: "muted small"
  }, "\uD83D\uDCCE Anhang:"), /*#__PURE__*/React.createElement("span", {
    className: "ics-pill"
  }, preview.anhang))), testAn && /*#__PURE__*/React.createElement(Hint, {
    glyph: "\uD83E\uDDEA",
    tone: "amber"
  }, /*#__PURE__*/React.createElement("strong", null, "Testmodus aktiv:"), " diese Mail (und alle weiteren) gehen an ", /*#__PURE__*/React.createElement("code", null, testAn), ", nicht an die echten Empf\xE4nger.")));
}

// ── ICS-Ereignisliste ────────────────────────────────────────────────────────
function IcsEventList({
  events
}) {
  const KAT_BG = {
    Arbeit: 'var(--blue-100)',
    Frei: '#dcfce7',
    Abwesenheit: '#fef3c7'
  };
  const KAT_FG = {
    Arbeit: 'var(--blue-600)',
    Frei: '#16a34a',
    Abwesenheit: '#d97706'
  };
  const arbeit = events.filter(function (e) {
    return e.kategorie === 'Arbeit';
  });
  const nacht = events.filter(function (e) {
    return e.ist_nachtdienst;
  });
  const abwes = events.filter(function (e) {
    return e.kategorie !== 'Arbeit';
  });
  function fmtTime(e) {
    if (e.ist_ganztaegig || !e.dienstbeginn && !e.dienstende) return 'Ganztägig';
    if (e.dienstbeginn && e.dienstende) return e.dienstbeginn + '–' + e.dienstende;
    return e.dienstbeginn || e.dienstende || '';
  }
  function fmtDate(datum) {
    const parts = datum.split('-');
    return parts[2] + '.' + parts[1] + '.';
  }
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 16,
      flexWrap: 'wrap',
      marginBottom: 14,
      fontSize: 12,
      color: 'var(--ink-muted)'
    }
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--ink)'
    }
  }, events.length), " Eintr\xE4ge"), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--blue-600)'
    }
  }, arbeit.length), " Arbeitstage"), nacht.length > 0 && /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("strong", {
    style: {
      color: 'var(--amber-600)'
    }
  }, nacht.length), " Nachtdienste"), abwes.length > 0 && /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("strong", {
    style: {
      color: '#16a34a'
    }
  }, abwes.length), " Abwesenheiten/Frei")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 2
    }
  }, events.map(function (e, i) {
    const bg = KAT_BG[e.kategorie] || 'var(--surface-subtle)';
    const fg = KAT_FG[e.kategorie] || 'var(--ink-muted)';
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        display: 'grid',
        gridTemplateColumns: '70px 18px 110px 1fr auto',
        gap: 8,
        alignItems: 'center',
        padding: '5px 8px',
        borderRadius: 5,
        background: bg,
        fontSize: 12
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink-muted)',
        fontVariantNumeric: 'tabular-nums'
      }
    }, e.wochentag, " ", fmtDate(e.datum)), /*#__PURE__*/React.createElement("span", {
      title: e.ist_nachtdienst ? 'Nachtdienst' : '',
      style: {
        textAlign: 'center'
      }
    }, e.ist_nachtdienst ? /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--amber-600)',
        fontWeight: 700,
        fontSize: 10
      }
    }, "N") : ''), /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink-muted)',
        fontSize: 11,
        fontVariantNumeric: 'tabular-nums'
      }
    }, fmtTime(e)), /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 600,
        color: fg
      }
    }, e.anzeigename), /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink-faint)',
        fontSize: 11
      }
    }, e.ort || ''));
  }), events.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 24,
      textAlign: 'center',
      color: 'var(--ink-muted)'
    }
  }, "Keine Eintr\xE4ge f\xFCr diesen Monat.")));
}

// ── Monatskalender für einen MA ──────────────────────────────────────────
function MaMonthCalendar({
  kuerzel,
  monat,
  jahr
}) {
  const [shifts, setShifts] = React.useState(null);
  const [changedDays, setChangedDays] = React.useState(new Set());
  const CTX = window.SERVER_CONTEXT || {};
  const monate = CTX.monate || [];
  React.useEffect(function () {
    setShifts(null);
    setChangedDays(new Set());
    const base = '?kuerzel=' + encodeURIComponent(kuerzel) + '&month=' + encodeURIComponent(monat) + '&year=' + encodeURIComponent(jahr);
    Promise.all([fetch('/api/ma/monat' + base).then(function (r) {
      return r.json();
    }), fetch('/api/mail/diffs' + base).then(function (r) {
      return r.json();
    })]).then(function (results) {
      setShifts(Array.isArray(results[0]) ? results[0] : []);
      setChangedDays(new Set(Array.isArray(results[1]) ? results[1] : []));
    }).catch(function () {
      setShifts([]);
    });
  }, [kuerzel, monat, jahr]);
  if (shifts === null) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '12px 0',
        color: 'var(--text-muted)',
        fontSize: 12
      }
    }, "Lade\u2026");
  }
  const monatIdx = monate.indexOf(monat);
  if (monatIdx < 0) return null;
  const year = parseInt(jahr);
  const firstDayRaw = new Date(year, monatIdx, 1).getDay(); // 0=So
  const startOffset = firstDayRaw === 0 ? 6 : firstDayRaw - 1; // Mon-start
  const daysInMonth = new Date(year, monatIdx + 1, 0).getDate();

  // datum → {code, kat}
  const shiftMap = {};
  shifts.forEach(function (s) {
    const d = parseInt(s.datum.split('-')[2]);
    shiftMap[d] = {
      code: s.dienstcode,
      kat: s.kategorie
    };
  });
  const KAT_BG = {
    'Arbeit': 'var(--blue-100)',
    'Frei': '#dcfce7',
    'Abwesenheit': '#fef3c7'
  };
  const KAT_FG = {
    'Arbeit': 'var(--blue-600)',
    'Frei': '#16a34a',
    'Abwesenheit': '#d97706'
  };
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(7, 1fr)',
      gap: 3,
      fontSize: 11
    }
  }, ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(function (d) {
    return /*#__PURE__*/React.createElement("div", {
      key: d,
      style: {
        textAlign: 'center',
        color: 'var(--text-muted)',
        fontWeight: 600,
        paddingBottom: 3,
        fontSize: 10
      }
    }, d);
  }), cells.map(function (d, i) {
    if (!d) return /*#__PURE__*/React.createElement("div", {
      key: 'e' + i
    });
    const s = shiftMap[d];
    const changed = changedDays.has(d);
    return /*#__PURE__*/React.createElement("div", {
      key: d,
      style: {
        textAlign: 'center',
        padding: '3px 1px',
        borderRadius: 3,
        background: changed ? '#fef3c7' : s ? KAT_BG[s.kat] || 'var(--blue-100)' : 'transparent',
        minHeight: 30,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        outline: changed ? '1.5px solid #f59e0b' : 'none',
        outlineOffset: '-1px'
      },
      title: changed ? 'Geändert seit letztem Versand' : undefined
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        color: changed ? '#92400e' : 'var(--text-muted)',
        fontSize: 9,
        lineHeight: 1,
        fontWeight: changed ? 700 : 400
      }
    }, d), s && /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 700,
        color: changed ? '#b45309' : KAT_FG[s.kat] || 'var(--text-primary)',
        fontSize: 9,
        lineHeight: 1.2,
        marginTop: 1
      }
    }, s.code), changed && /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 7,
        color: '#b45309',
        lineHeight: 1,
        marginTop: 1
      }
    }, "\u25CF"));
  })), shifts.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      color: 'var(--text-muted)',
      fontSize: 12,
      paddingTop: 6
    }
  }, "Keine Schichten in diesem Monat."), changedDays.size > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      marginTop: 6,
      fontSize: 10,
      color: '#92400e'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-block',
      width: 12,
      height: 12,
      background: '#fef3c7',
      border: '1.5px solid #f59e0b',
      borderRadius: 2
    }
  }), changedDays.size, " ", changedDays.size === 1 ? 'Tag' : 'Tage', " ge\xE4ndert seit letztem Versand"));
}

// ── Einzelne ICS-Datei mit Vorschau & Download (aus Import erzeugt) ──────────
function IcsFileItem({
  monatJahr,
  filename
}) {
  const [open, setOpen] = React.useState(false);
  const [events, setEvents] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (events !== null) return;
    setLoading(true);
    setError('');
    fetch('/api/ics/preview?monat_jahr=' + encodeURIComponent(monatJahr) + '&filename=' + encodeURIComponent(filename)).then(function (r) {
      return r.json();
    }).then(function (d) {
      if (d && d.error) {
        setError(d.error);
      } else {
        setEvents(Array.isArray(d) ? d : []);
      }
      setLoading(false);
    }).catch(function () {
      setError('Verbindungsfehler');
      setLoading(false);
    });
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
  return /*#__PURE__*/React.createElement("div", {
    style: {
      borderBottom: '1px solid var(--hairline-soft)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "file-row"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "13",
    height: "13",
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
    d: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"
  }), /*#__PURE__*/React.createElement("polyline", {
    points: "14 2 14 8 20 8"
  })), /*#__PURE__*/React.createElement("span", {
    className: "name small"
  }, filename), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost btn-sm",
    onClick: toggle,
    style: {
      padding: '3px 7px',
      fontSize: 11,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "11",
    height: "11",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "3"
  })), open ? 'Schließen' : 'Vorschau'), /*#__PURE__*/React.createElement("a", {
    className: "btn btn-ghost btn-sm",
    style: {
      padding: '3px 7px'
    },
    href: '/download/ics/' + encodeURIComponent(monatJahr) + '/' + encodeURIComponent(filename)
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
  })))), open && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '6px 4px 8px 28px'
    }
  }, loading && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-muted)'
    }
  }, "L\xE4dt\u2026"), error && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--red-500)'
    }
  }, error), events && events.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--ink-muted)'
    }
  }, "Keine Eintr\xE4ge in dieser Datei."), events && events.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "analyse-table-wrap",
    style: {
      maxHeight: 240,
      overflowY: 'auto',
      borderRadius: 6
    }
  }, /*#__PURE__*/React.createElement("table", {
    className: "analyse-table",
    style: {
      fontSize: 11
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Datum"), /*#__PURE__*/React.createElement("th", null, "Bezeichnung"), /*#__PURE__*/React.createElement("th", null, "Beginn"), /*#__PURE__*/React.createElement("th", null, "Ende"), /*#__PURE__*/React.createElement("th", null, "Ort"))), /*#__PURE__*/React.createElement("tbody", null, events.map(function (ev, i) {
    return /*#__PURE__*/React.createElement("tr", {
      key: i
    }, /*#__PURE__*/React.createElement("td", {
      style: {
        whiteSpace: 'nowrap'
      }
    }, fmtDt(ev['DTSTART'])), /*#__PURE__*/React.createElement("td", null, ev['SUMMARY'] || '–'), /*#__PURE__*/React.createElement("td", {
      style: {
        whiteSpace: 'nowrap',
        color: 'var(--ink-muted)'
      }
    }, fmtTime(ev['DTSTART'])), /*#__PURE__*/React.createElement("td", {
      style: {
        whiteSpace: 'nowrap',
        color: 'var(--ink-muted)'
      }
    }, fmtTime(ev['DTEND'])), /*#__PURE__*/React.createElement("td", {
      style: {
        color: 'var(--ink-muted)'
      }
    }, ev['LOCATION'] || '–'));
  }))))));
}
window.TabMail = TabMail;