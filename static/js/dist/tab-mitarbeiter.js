// Tab: Mitarbeiter — E-Mail-Adressen verwalten + Zusammenführen
function TabMitarbeiter({
  monat,
  jahr
}) {
  const toast = useToast();
  const [sub, setSub] = React.useState('emails');
  return /*#__PURE__*/React.createElement("div", {
    className: "fade-in",
    "data-screen-label": "Mitarbeiter"
  }, /*#__PURE__*/React.createElement(PageHead, {
    label: "Personal",
    title: "Mitarbeitende",
    subtitle: "E-Mail-Adressen pflegen und Mitarbeitende bei Namens\xE4nderung zusammenf\xFChren."
  }), /*#__PURE__*/React.createElement("div", {
    className: "subtabs"
  }, /*#__PURE__*/React.createElement("button", {
    className: 'subtab ' + (sub === 'emails' ? 'active' : ''),
    onClick: function () {
      setSub('emails');
    }
  }, "E-Mail-Adressen"), /*#__PURE__*/React.createElement("button", {
    className: 'subtab ' + (sub === 'merge' ? 'active' : ''),
    onClick: function () {
      setSub('merge');
    }
  }, "Zusammenf\xFChren")), sub === 'emails' ? /*#__PURE__*/React.createElement(SubEmails, {
    toast: toast,
    monat: monat,
    jahr: jahr
  }) : /*#__PURE__*/React.createElement(SubMerge, {
    toast: toast
  }));
}

// ── Sub: E-Mail-Adressen ───────────────────────────────────────────────
function SubEmails({
  toast,
  monat,
  jahr
}) {
  const [data, setData] = React.useState([]);
  const [trends, setTrends] = React.useState({});
  const [edits, setEdits] = React.useState({});
  const [filter, setFilter] = React.useState('alle');
  const [search, setSearch] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [expanded, setExpanded] = React.useState(null);
  React.useEffect(function () {
    var k = window._pendingOpenMa;
    if (k) {
      window._pendingOpenMa = null;
      setExpanded(k);
      setSearch(k);
    }
  }, []);
  React.useEffect(function () {
    fetch('/api/ma/trends').then(function (r) {
      return r.json();
    }).then(function (d) {
      if (d && !d.error) setTrends(d);
    }).catch(function () {});
  }, []);
  const reload = function () {
    setLoading(true);
    const params = new URLSearchParams();
    if (monat) params.set('month', monat);
    if (jahr) params.set('year', String(jahr));
    fetch('/api/ma/list?' + params.toString()).then(function (r) {
      return r.json();
    }).then(function (raw) {
      if (Array.isArray(raw)) {
        const normalized = raw.map(function (m) {
          return Object.assign({}, m, {
            pensum: m.pensum_pct != null ? m.pensum_pct : m.pensum != null ? m.pensum : 100,
            hatPlan: true,
            neu: false
          });
        });
        setData(normalized);
      }
      setLoading(false);
    }).catch(function () {
      setLoading(false);
    });
  };
  React.useEffect(function () {
    setEdits({});
    reload();
  }, [monat, jahr]);
  const setEmail = function (k, v) {
    setEdits(function (cur) {
      const orig = (data.find(function (m) {
        return m.kuerzel === k;
      }) || {}).email || '';
      const n = Object.assign({}, cur);
      if (v === orig) delete n[k];else n[k] = v;
      return n;
    });
  };
  const changedCount = Object.keys(edits).length;
  const save = async function () {
    try {
      const resp = await fetch('/api/ma/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(edits)
      });
      const json = await resp.json();
      if (json.ok) {
        toast.show(json.updated + ' ' + (json.updated === 1 ? 'Eintrag' : 'Einträge') + ' gespeichert');
        setEdits({});
        reload();
      } else {
        toast.show(json.error || 'Fehler beim Speichern', 'error');
      }
    } catch (e) {
      toast.show('Verbindungsfehler', 'error');
    }
  };
  const discard = function () {
    setEdits({});
  };
  const toggleExpand = function (kuerzel) {
    setExpanded(function (cur) {
      return cur === kuerzel ? null : kuerzel;
    });
  };
  const generateWebcalToken = function (kuerzel, action) {
    fetch('/api/ma/webcal_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        kuerzel,
        action
      })
    }).then(function (r) {
      return r.json();
    }).then(function (j) {
      if (j.ok) {
        toast.show(action === 'revoke' ? 'Webcal-Link widerrufen' : 'Neuer Webcal-Link generiert');
        reload();
      } else {
        toast.show(j.error || 'Fehler', 'error');
      }
    }).catch(function () {
      toast.show('Verbindungsfehler', 'error');
    });
  };
  const copyToClipboard = function (text) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () {
        toast.show('Link kopiert');
      }).catch(function () {
        toast.show('Kopieren fehlgeschlagen', 'error');
      });
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
      } catch (e) {
        toast.show('Kopieren fehlgeschlagen — Link bitte manuell markieren', 'error');
      }
      document.body.removeChild(el);
    }
  };
  const setWebcalModus = function (kuerzel, modus) {
    fetch('/api/ma/webcal_modus', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        kuerzel,
        modus
      })
    }).then(function (r) {
      return r.json();
    }).then(function (j) {
      if (j.ok) {
        reload();
      } else {
        toast.show(j.error || 'Fehler', 'error');
      }
    }).catch(function () {
      toast.show('Verbindungsfehler', 'error');
    });
  };
  const sendWebcalLink = function (kuerzel, pw) {
    setWebcalMailState({
      kuerzel,
      pw,
      sending: true,
      result: null
    });
    fetch('/api/mail/webcal-link-senden', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        kuerzel,
        smtp_pw: pw
      })
    }).then(function (r) {
      return r.json();
    }).then(function (j) {
      if (j.ok) {
        setWebcalMailState({
          kuerzel,
          pw: '',
          sending: false,
          result: {
            ok: true,
            empfaenger: j.empfaenger
          }
        });
      } else {
        setWebcalMailState({
          kuerzel,
          pw,
          sending: false,
          result: {
            error: j.error || 'Fehler beim Senden'
          }
        });
      }
    }).catch(function () {
      setWebcalMailState({
        kuerzel,
        pw,
        sending: false,
        result: {
          error: 'Verbindungsfehler'
        }
      });
    });
  };
  const toggleNieAktivieren = function (kuerzel, wert) {
    fetch('/api/ma/nie_aktivieren', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        kuerzel,
        wert
      })
    }).then(function (r) {
      return r.json();
    }).then(function (j) {
      if (j.ok) {
        toast.show(wert ? kuerzel + ' wird beim Import ignoriert' : kuerzel + ' wird wieder importiert');
        reload();
      } else {
        toast.show(j.error || 'Fehler', 'error');
      }
    }).catch(function () {
      toast.show('Verbindungsfehler', 'error');
    });
  };
  const [webcalMailState, setWebcalMailState] = React.useState(null);
  // null | { kuerzel, pw, sending, result }

  const [showIgnoriert, setShowIgnoriert] = React.useState(false);
  const ignoriert = data.filter(function (m) {
    return m.nie_aktivieren === 1;
  });
  const baseData = showIgnoriert ? data : data.filter(function (m) {
    return m.nie_aktivieren !== 1;
  });
  const filtered = baseData.filter(function (m) {
    const curEmail = edits[m.kuerzel] !== undefined ? edits[m.kuerzel] : m.email || '';
    if (filter === 'leer' && curEmail) return false;
    if (filter === 'aktiv' && !m.aktiv) return false;
    if (filter === 'inaktiv' && m.aktiv) return false;
    if (search) {
      const hay = ((m.vorname || '') + ' ' + (m.nachname || '') + ' ' + (m.kuerzel || '')).toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });
  const counts = {
    alle: baseData.length,
    leer: baseData.filter(function (m) {
      return !(edits[m.kuerzel] !== undefined ? edits[m.kuerzel] : m.email || '');
    }).length,
    aktiv: baseData.filter(function (m) {
      return m.aktiv;
    }).length,
    inaktiv: baseData.filter(function (m) {
      return !m.aktiv;
    }).length
  };
  return /*#__PURE__*/React.createElement(Card, {
    title: data.length + ' Mitarbeitende',
    right: /*#__PURE__*/React.createElement("input", {
      type: "search",
      className: "input",
      placeholder: "\uD83D\uDD0D Name oder K\xFCrzel suchen\u2026",
      value: search,
      onChange: function (e) {
        setSearch(e.target.value);
      },
      style: {
        width: 220,
        padding: '6px 12px',
        fontSize: '0.85rem'
      }
    })
  }, loading ? /*#__PURE__*/React.createElement("div", {
    className: "empty-state"
  }, /*#__PURE__*/React.createElement("span", {
    className: "glyph"
  }, "\u23F3"), "Lade Mitarbeitende\u2026") : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'center',
      marginBottom: 12,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "chip-row"
  }, /*#__PURE__*/React.createElement("button", {
    className: 'chip ' + (filter === 'alle' ? 'active' : ''),
    onClick: function () {
      setFilter('alle');
    }
  }, "Alle ", /*#__PURE__*/React.createElement("span", {
    className: "count"
  }, counts.alle)), /*#__PURE__*/React.createElement("button", {
    className: 'chip ' + (filter === 'leer' ? 'active' : ''),
    onClick: function () {
      setFilter('leer');
    }
  }, "Ohne E-Mail ", /*#__PURE__*/React.createElement("span", {
    className: "count"
  }, counts.leer)), /*#__PURE__*/React.createElement("button", {
    className: 'chip ' + (filter === 'aktiv' ? 'active' : ''),
    onClick: function () {
      setFilter('aktiv');
    }
  }, "Aktive ", /*#__PURE__*/React.createElement("span", {
    className: "count"
  }, counts.aktiv)), /*#__PURE__*/React.createElement("button", {
    className: 'chip ' + (filter === 'inaktiv' ? 'active' : ''),
    onClick: function () {
      setFilter('inaktiv');
    }
  }, "Inaktive ", /*#__PURE__*/React.createElement("span", {
    className: "count"
  }, counts.inaktiv)), ignoriert.length > 0 && /*#__PURE__*/React.createElement("button", {
    className: 'chip chip-ignoriert ' + (showIgnoriert ? 'active' : ''),
    onClick: function () {
      setShowIgnoriert(function (v) {
        return !v;
      });
    }
  }, "Ignorierte ", /*#__PURE__*/React.createElement("span", {
    className: "count"
  }, ignoriert.length)))), /*#__PURE__*/React.createElement("div", {
    className: "tbl-wrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "tbl"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: {
      width: 26
    }
  }), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 26
    }
  }), /*#__PURE__*/React.createElement("th", null, "Name"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 90
    }
  }, "K\xFCrzel"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 110
    }
  }, "Pensum"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 100
    }
  }, "Trend 6\xA0Mt."), /*#__PURE__*/React.createElement("th", null, "E-Mail-Adresse"))), /*#__PURE__*/React.createElement("tbody", null, filtered.length === 0 ? /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: 7,
    className: "empty-state"
  }, /*#__PURE__*/React.createElement("span", {
    className: "glyph"
  }, "\uD83D\uDD0D"), search ? 'Keine Treffer für „' + search + '"' : 'Keine Einträge.')) : filtered.map(function (m) {
    const edit = edits[m.kuerzel];
    const current = edit !== undefined ? edit : m.email || '';
    const isEmpty = !current;
    const isChanged = edit !== undefined;
    const pensum = m.pensum || 0;
    const isExpanded = expanded === m.kuerzel;
    return /*#__PURE__*/React.createElement(React.Fragment, {
      key: m.kuerzel
    }, /*#__PURE__*/React.createElement("tr", {
      className: (!m.aktiv ? 'row-inaktiv' : '') + (m.neu ? ' row-neu' : '') + (isExpanded ? ' row-expanded' : ''),
      style: {
        cursor: 'pointer'
      },
      onClick: function (e) {
        if (e.target.tagName === 'INPUT') return;
        toggleExpand(m.kuerzel);
      }
    }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
      className: 'status-dot ' + (isEmpty ? 'empty' : 'ok')
    })), /*#__PURE__*/React.createElement("td", {
      style: {
        textAlign: 'center',
        color: 'var(--text-muted)',
        userSelect: 'none',
        fontSize: 11
      }
    }, isExpanded ? '▾' : '▸'), /*#__PURE__*/React.createElement("td", {
      className: "name-cell"
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 600
      }
    }, m.vorname, " ", m.nachname), m.neu && /*#__PURE__*/React.createElement("span", {
      style: {
        background: 'var(--red-bright)',
        color: '#fff',
        fontSize: 'var(--text-micro)',
        padding: '1px 6px',
        borderRadius: 'var(--radius-xs)',
        fontWeight: 700
      }
    }, "NEU"), !m.aktiv && /*#__PURE__*/React.createElement("span", {
      className: "badge-inactive"
    }, "inaktiv"), m.nie_aktivieren === 1 && /*#__PURE__*/React.createElement("span", {
      className: "badge-ignoriert"
    }, "ignoriert")), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
      className: "kuerzel-pill"
    }, m.kuerzel)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
      className: "pensum-bar"
    }, /*#__PURE__*/React.createElement("span", {
      className: "track"
    }, /*#__PURE__*/React.createElement("span", {
      className: "fill",
      style: {
        width: pensum + '%'
      }
    })), pensum, "%")), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(Sparkline, {
      values: trends[m.kuerzel] || []
    })), /*#__PURE__*/React.createElement("td", {
      className: "email-cell",
      onClick: function (e) {
        e.stopPropagation();
      }
    }, /*#__PURE__*/React.createElement("input", {
      type: "email",
      className: 'input ' + (isChanged ? 'changed' : isEmpty ? 'empty' : 'filled'),
      value: current,
      onChange: function (e) {
        setEmail(m.kuerzel, e.target.value);
      },
      placeholder: "vorname.nachname@\u2026",
      disabled: !m.aktiv
    }))), isExpanded && /*#__PURE__*/React.createElement("tr", {
      className: "expand-row"
    }, /*#__PURE__*/React.createElement("td", {
      colSpan: 7,
      style: {
        padding: '0 16px 16px 52px',
        background: 'var(--bg-subtle, #f8f9fa)'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 600,
        fontSize: 12,
        color: 'var(--text-muted)',
        marginBottom: 6,
        paddingTop: 12
      }
    }, "Monatsplan ", monat, " ", jahr), /*#__PURE__*/React.createElement(MaMonthCalendar, {
      kuerzel: m.kuerzel,
      monat: monat,
      jahr: String(jahr)
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 14,
        paddingTop: 12,
        borderTop: '1px solid var(--hairline)'
      }
    }, /*#__PURE__*/React.createElement("label", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        cursor: 'pointer',
        userSelect: 'none',
        fontSize: 13
      },
      onClick: function (e) {
        e.stopPropagation();
      }
    }, /*#__PURE__*/React.createElement("input", {
      type: "checkbox",
      checked: m.nie_aktivieren === 1,
      onChange: function (e) {
        e.stopPropagation();
        toggleNieAktivieren(m.kuerzel, e.target.checked);
      }
    }), "Beim Import ignorieren \u2014 wird nie aktiv geschaltet"), m.nie_aktivieren === 1 && /*#__PURE__*/React.createElement("p", {
      style: {
        margin: '4px 0 0 26px',
        fontSize: 12,
        color: 'var(--ink-muted)'
      }
    }, "Dieser Eintrag wird beim n\xE4chsten Import \xFCbersprungen. Bestehende Schichten bleiben erhalten.")), m.nie_aktivieren !== 1 && /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 14,
        paddingTop: 12,
        borderTop: '1px solid var(--hairline)'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 600,
        fontSize: 12,
        color: 'var(--text-muted)',
        marginBottom: 8
      }
    }, "Kalender-Abo (Webcal)"), m.webcal_token ? function () {
      var _CTX = window.SERVER_CONTEXT || {};
      var _base = (_CTX.webcal_base_url || '').replace(/\/$/, '') || window.location.origin;
      var _path = '/ics/webcal/' + m.webcal_token + '/Dienstplan_' + m.kuerzel.replace(/ /g, '_') + '.ics';
      var _webcalUrl = _base.replace(/^https?:/, 'webcal:') + _path;
      var _httpsUrl = _base + _path;
      return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          gap: 6,
          alignItems: 'center',
          flexWrap: 'wrap'
        }
      }, /*#__PURE__*/React.createElement("code", {
        style: {
          fontSize: 11,
          background: 'var(--bg-page)',
          border: '1px solid var(--hairline)',
          borderRadius: 6,
          padding: '4px 8px',
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: 'var(--ink-muted)'
        }
      }, _webcalUrl), /*#__PURE__*/React.createElement("button", {
        className: "btn btn-outline btn-sm",
        onClick: function (e) {
          e.stopPropagation();
          copyToClipboard(_webcalUrl);
        }
      }, "Kopieren"), /*#__PURE__*/React.createElement("button", {
        className: "btn btn-ghost btn-sm",
        style: {
          color: 'var(--red-500)'
        },
        onClick: function (e) {
          e.stopPropagation();
          if (window.confirm('Webcal-Link widerrufen? Der bisherige Link hört sofort auf zu funktionieren.')) {
            generateWebcalToken(m.kuerzel, 'revoke');
          }
        }
      }, "Widerrufen")), /*#__PURE__*/React.createElement("p", {
        style: {
          margin: '6px 0 0',
          fontSize: 11,
          color: 'var(--ink-muted)'
        }
      }, "Diesen Link im Kalender-Programm als Abonnement hinzuf\xFCgen (webcal://\u2026). Wer die URL kennt, kann die Schichten dieses MA einsehen."), /*#__PURE__*/React.createElement("button", {
        className: "btn btn-ghost btn-sm",
        style: {
          marginTop: 6
        },
        onClick: function (e) {
          e.stopPropagation();
          if (window.confirm('Neues Token generieren? Der bisherige Link hört sofort auf zu funktionieren.')) {
            generateWebcalToken(m.kuerzel, 'generate');
          }
        }
      }, "Neues Token generieren"));
    }() : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("p", {
      style: {
        margin: '0 0 8px',
        fontSize: 12,
        color: 'var(--ink-muted)'
      }
    }, "Kein aktiver Link. Nach dem Erstellen kann dieser Link direkt im Kalender-Programm als Abonnement eingetragen werden."), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-outline btn-sm",
      onClick: function (e) {
        e.stopPropagation();
        generateWebcalToken(m.kuerzel, 'generate');
      }
    }, "Link erstellen")), (edits[m.kuerzel] !== undefined ? edits[m.kuerzel] : m.email || '') && /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 12
      },
      onClick: function (e) {
        e.stopPropagation();
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 10
      }
    }, /*#__PURE__*/React.createElement("label", {
      className: "field-label",
      style: {
        margin: 0,
        whiteSpace: 'nowrap'
      }
    }, "Monatlicher Versand"), /*#__PURE__*/React.createElement("select", {
      className: "input",
      style: {
        maxWidth: 210
      },
      value: m.webcal_mail_modus || 'ics',
      onChange: function (e) {
        setWebcalModus(m.kuerzel, e.target.value);
      }
    }, /*#__PURE__*/React.createElement("option", {
      value: "ics"
    }, "ICS-Anhang"), /*#__PURE__*/React.createElement("option", {
      value: "webcal"
    }, "Kein Versand (nur Abo)"), /*#__PURE__*/React.createElement("option", {
      value: "beide"
    }, "ICS + Webcal-Link im Text"))), m.webcal_token && /*#__PURE__*/React.createElement("div", {
      style: {
        borderTop: '1px dashed var(--hairline)',
        paddingTop: 10
      }
    }, webcalMailState && webcalMailState.kuerzel === m.kuerzel && webcalMailState.result && webcalMailState.result.ok ? /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 12,
        color: 'var(--green-500)'
      }
    }, "\u2713 Link gesendet an ", webcalMailState.result.empfaenger), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost btn-sm",
      onClick: function () {
        setWebcalMailState(null);
      }
    }, "\xD7")) : webcalMailState && webcalMailState.kuerzel === m.kuerzel ? /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        gap: 6,
        alignItems: 'center',
        flexWrap: 'wrap'
      }
    }, /*#__PURE__*/React.createElement("input", {
      type: "password",
      className: "input",
      style: {
        maxWidth: 180,
        fontSize: 12
      },
      placeholder: "SMTP-Passwort / Token",
      value: webcalMailState.pw,
      autoFocus: true,
      onChange: function (e) {
        setWebcalMailState(Object.assign({}, webcalMailState, {
          pw: e.target.value,
          result: null
        }));
      },
      onKeyDown: function (e) {
        if (e.key === 'Enter' && webcalMailState.pw.trim()) sendWebcalLink(m.kuerzel, webcalMailState.pw.trim());
        if (e.key === 'Escape') setWebcalMailState(null);
      }
    }), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-primary btn-sm",
      style: {
        fontSize: 12
      },
      disabled: webcalMailState.sending || !webcalMailState.pw.trim(),
      onClick: function () {
        sendWebcalLink(m.kuerzel, webcalMailState.pw.trim());
      }
    }, webcalMailState.sending ? 'Sende…' : 'Senden'), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost btn-sm",
      onClick: function () {
        setWebcalMailState(null);
      }
    }, "Abbrechen"), webcalMailState.result && webcalMailState.result.error && /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11,
        color: 'var(--red-500)',
        width: '100%'
      }
    }, "\u2717 ", webcalMailState.result.error)) : /*#__PURE__*/React.createElement("button", {
      className: "btn btn-outline btn-sm",
      style: {
        fontSize: 12
      },
      onClick: function () {
        setWebcalMailState({
          kuerzel: m.kuerzel,
          pw: '',
          sending: false,
          result: null
        });
      }
    }, "Webcal-Link per Mail senden")))))));
  })))), changedCount > 0 && /*#__PURE__*/React.createElement("div", {
    className: "save-bar fade-in"
  }, /*#__PURE__*/React.createElement("span", null, "\u270F\uFE0F"), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("strong", null, changedCount), " ", changedCount === 1 ? 'Änderung' : 'Änderungen', " noch nicht gespeichert"), /*#__PURE__*/React.createElement("span", {
    className: "spacer"
  }), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost btn-sm",
    onClick: discard
  }, "Verwerfen"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-success btn-sm",
    onClick: save
  }, "\uD83D\uDCBE Speichern"))));
}

// ── Durchsuchbares MA-Auswahlfeld ─────────────────────────────────────
function MaCombobox({
  liste,
  value,
  onChange,
  placeholder
}) {
  const [query, setQuery] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const wrapRef = React.useRef(null);
  const selected = liste.find(function (m) {
    return m.kuerzel === value;
  });
  const display = selected ? selected.nachname + ' ' + selected.vorname + ' [' + selected.kuerzel + ']' : '';
  const filtered = React.useMemo(function () {
    const q = query.toLowerCase();
    if (!q) return liste;
    return liste.filter(function (m) {
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
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(function (a) {
        return Math.min(a + 1, filtered.length - 1);
      });
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(function (a) {
        return Math.max(a - 1, 0);
      });
    }
    if (e.key === 'Enter') {
      if (active >= 0 && filtered[active]) {
        e.preventDefault();
        select(filtered[active]);
      }
    }
    if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  }
  React.useEffect(function () {
    function onOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return function () {
      document.removeEventListener('mousedown', onOutside);
    };
  }, []);
  const inputVal = open ? query : display;
  return /*#__PURE__*/React.createElement("div", {
    ref: wrapRef,
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'flex',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("input", {
    className: "input",
    style: {
      width: '100%',
      paddingRight: value ? 28 : 10
    },
    value: inputVal,
    placeholder: placeholder || '— Suchen oder wählen —',
    onChange: onInputChange,
    onFocus: function () {
      setOpen(true);
      setQuery('');
    },
    onKeyDown: onKeyDown,
    autoComplete: "off"
  }), value && /*#__PURE__*/React.createElement("button", {
    onClick: clear,
    style: {
      position: 'absolute',
      right: 6,
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      color: 'var(--ink-muted)',
      fontSize: 14,
      padding: '0 2px'
    },
    tabIndex: -1,
    title: "Auswahl aufheben"
  }, "\u2715")), open && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: '100%',
      left: 0,
      right: 0,
      zIndex: 200,
      background: '#ffffff',
      border: '1.5px solid var(--blue-400)',
      borderRadius: 7,
      boxShadow: '0 4px 16px rgba(0,0,0,.12)',
      maxHeight: 220,
      overflowY: 'auto',
      marginTop: 2
    }
  }, filtered.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '8px 12px',
      color: 'var(--ink-muted)',
      fontSize: 13
    }
  }, "Kein Treffer"), filtered.map(function (m, i) {
    return /*#__PURE__*/React.createElement("div", {
      key: m.kuerzel,
      onMouseDown: function () {
        select(m);
      },
      style: {
        padding: '7px 12px',
        cursor: 'pointer',
        fontSize: 13,
        background: i === active ? '#eff6ff' : '#ffffff',
        borderBottom: '1px solid var(--hairline)',
        color: m.aktiv ? 'var(--ink)' : 'var(--ink-muted)'
      }
    }, /*#__PURE__*/React.createElement("strong", null, m.nachname, " ", m.vorname), /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: 6,
        fontFamily: 'monospace',
        fontSize: 11,
        background: 'var(--surface-alt)',
        padding: '1px 5px',
        borderRadius: 4
      }
    }, m.kuerzel), !m.aktiv && /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: 6,
        fontSize: 11,
        color: 'var(--ink-muted)'
      }
    }, "(inaktiv)"));
  })));
}

// ── Sub: Zusammenführen ────────────────────────────────────────────────
function SubMerge({
  toast
}) {
  const [quell, setQuell] = React.useState('');
  const [ziel, setZiel] = React.useState('');
  const [vorschau, setVorschau] = React.useState(null);
  const [liste, setListe] = React.useState([]);
  const [verlauf, setVerlauf] = React.useState([]);
  const [undoLaufend, setUndoLaufend] = React.useState(null);
  const reloadVerlauf = function () {
    fetch('/api/ma/merge/verlauf').then(function (r) {
      return r.json();
    }).then(function (data) {
      if (Array.isArray(data)) setVerlauf(data);
    }).catch(function () {});
  };
  React.useEffect(function () {
    fetch('/api/ma/alle').then(function (r) {
      return r.json();
    }).then(function (data) {
      if (Array.isArray(data)) setListe(data);
    }).catch(function () {});
    reloadVerlauf();
  }, []);
  const rueckgaengig = async function (quellKuerzel, quellName, zielName) {
    if (!window.confirm(`Zusammenführung rückgängig machen?\n\n"${quellName}" wird reaktiviert und erhält seine Schichten zurück.\nKonfliktschichten (die beim Merge gelöscht wurden) können nicht wiederhergestellt werden.`)) return;
    setUndoLaufend(quellKuerzel);
    try {
      const resp = await fetch('/api/ma/unmerge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          quell: quellKuerzel
        })
      });
      const json = await resp.json();
      if (json.error) {
        toast.show(json.error, 'error');
        return;
      }
      toast.show(`Rückgängig: ${json.zurueckverschoben} Schicht${json.zurueckverschoben !== 1 ? 'en' : ''} zurückverschoben`);
      reloadVerlauf();
    } catch (e) {
      toast.show('Verbindungsfehler', 'error');
    } finally {
      setUndoLaufend(null);
    }
  };
  const pruefen = async function () {
    if (!quell || !ziel) {
      toast.show('Bitte beide Einträge wählen', 'error');
      return;
    }
    if (quell === ziel) {
      toast.show('Quell und Ziel sind identisch', 'error');
      return;
    }
    const q = liste.find(function (m) {
      return m.kuerzel === quell;
    });
    const z = liste.find(function (m) {
      return m.kuerzel === ziel;
    });
    setVorschau({
      q: q,
      z: z,
      schichten: '?',
      konflikte: 0
    });
  };
  const ausfuehren = async function () {
    if (!window.confirm('Wirklich zusammenführen? Konflikte (gleicher Tag bei beiden MA) werden dabei gelöscht und können nicht wiederhergestellt werden.')) return;
    try {
      const resp = await fetch('/api/ma/merge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          quell: quell,
          ziel: ziel
        })
      });
      const json = await resp.json();
      if (json.error) {
        toast.show(json.error, 'error');
        return;
      }
      toast.show('Zusammenführung abgeschlossen');
      setQuell('');
      setZiel('');
      setVorschau(null);
      reloadVerlauf();
    } catch (e) {
      toast.show('Verbindungsfehler', 'error');
    }
  };
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Card, {
    title: "Mitarbeitende zusammenf\xFChren",
    subtitle: "Bei Namens\xE4nderung (z. B. Heirat) zwei Eintr\xE4ge zu einem zusammenf\xFChren. Alle Schichten werden \xFCbertragen, der alte Eintrag wird deaktiviert."
  }, /*#__PURE__*/React.createElement("div", {
    className: "merge-row"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Alter Eintrag ", /*#__PURE__*/React.createElement("span", {
    className: "muted"
  }, "\u2014 wird deaktiviert")), /*#__PURE__*/React.createElement(MaCombobox, {
    liste: liste,
    value: quell,
    onChange: function (v) {
      setQuell(v);
      setVorschau(null);
    },
    placeholder: "\u2014 Suchen oder w\xE4hlen \u2014"
  })), /*#__PURE__*/React.createElement("div", {
    className: "merge-arrow"
  }, "\u2192"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "field-label"
  }, "Neuer Eintrag ", /*#__PURE__*/React.createElement("span", {
    className: "muted"
  }, "\u2014 erh\xE4lt alle Schichten")), /*#__PURE__*/React.createElement(MaCombobox, {
    liste: liste,
    value: ziel,
    onChange: function (v) {
      setZiel(v);
      setVorschau(null);
    },
    placeholder: "\u2014 Suchen oder w\xE4hlen \u2014"
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16,
      display: 'flex',
      gap: 10,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-outline",
    onClick: pruefen
  }, "Pr\xFCfen"), vorschau && /*#__PURE__*/React.createElement("span", {
    className: "muted small fade-in"
  }, "Schichten gefunden \xB7", ' ', /*#__PURE__*/React.createElement("strong", null, vorschau.konflikte), " Konflikte")), vorschau && /*#__PURE__*/React.createElement("div", {
    className: "fade-in",
    style: {
      marginTop: 16
    }
  }, /*#__PURE__*/React.createElement(Hint, {
    glyph: "\u26A0\uFE0F",
    tone: "amber"
  }, /*#__PURE__*/React.createElement("strong", null, "Achtung \u2014 Konfliktschichten (gleicher Tag bei beiden MA) werden unwiederbringlich gel\xF6scht."), /*#__PURE__*/React.createElement("br", null), "Alle anderen Schichten von ", /*#__PURE__*/React.createElement("strong", null, vorschau.q.nachname, " ", vorschau.q.vorname), " [", /*#__PURE__*/React.createElement("code", null, vorschau.q.kuerzel), "] werden zu ", /*#__PURE__*/React.createElement("strong", null, vorschau.z.nachname, " ", vorschau.z.vorname), " [", /*#__PURE__*/React.createElement("code", null, vorschau.z.kuerzel), "] verschoben. Der alte Eintrag wird deaktiviert und kann sp\xE4ter r\xFCckg\xE4ngig gemacht werden."), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-danger",
    onClick: ausfuehren
  }, /*#__PURE__*/React.createElement("span", null, "\uD83D\uDD17"), " Jetzt zusammenf\xFChren"))), verlauf.length > 0 && /*#__PURE__*/React.createElement(Card, {
    title: "Verlauf",
    style: {
      marginTop: 'var(--space-4)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "mini-list"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mini-list-head"
  }, /*#__PURE__*/React.createElement("strong", null, verlauf.length, " Zusammenf\xFChrung", verlauf.length !== 1 ? 'en' : '')), verlauf.map(function (v, i) {
    const quellName = [v.vorname, v.nachname].filter(Boolean).join(' ') || v.kuerzel;
    const zielName = [v.ziel_vorname, v.ziel_nachname].filter(Boolean).join(' ') || v.ziel_kuerzel;
    const laufend = undoLaufend === v.kuerzel;
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      className: "mini-row",
      style: {
        cursor: 'default'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 16
      }
    }, "\uD83D\uDD17"), /*#__PURE__*/React.createElement("span", {
      className: "name"
    }, /*#__PURE__*/React.createElement("span", {
      className: "kuerzel-pill"
    }, v.kuerzel), ' ', v.vorname, " ", v.nachname), /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--text-muted)',
        fontSize: 13
      }
    }, "\u2192"), /*#__PURE__*/React.createElement("span", {
      className: "name"
    }, /*#__PURE__*/React.createElement("span", {
      className: "kuerzel-pill"
    }, v.ziel_kuerzel), ' ', v.ziel_vorname, " ", v.ziel_nachname), /*#__PURE__*/React.createElement("span", {
      className: "muted small"
    }, fmtDatum(v.datum)), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-outline btn-sm",
      disabled: laufend,
      onClick: function () {
        rueckgaengig(v.kuerzel, quellName, zielName);
      },
      title: "Zusammenf\xFChrung r\xFCckg\xE4ngig machen",
      style: {
        marginLeft: 'auto',
        fontSize: 12,
        padding: '2px 8px'
      }
    }, laufend ? '…' : '↩ Rückgängig'));
  }))));
}
window.TabMitarbeiter = TabMitarbeiter;