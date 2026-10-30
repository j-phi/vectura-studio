/**
 * Start Page (P0 shell).
 *
 * An overlay (#start-page) above the running editor: header (wordmark, crumb, date, theme toggle, "Back to
 * canvas"), a rail (Start / Resume / Recent / launch preference) and a main column that currently holds an
 * honest empty state inside #sp-main (the next phase fills it). The editor underneath keeps running and is
 * made `inert` while the page is shown; focus moves in on show and back on hide.
 *
 * window.Vectura.UI.StartPage.create(app) -> { show, hide, isOpen, render, syncPrefs, el }
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  const PAGE_ID = 'start-page';
  // Body children that must stay interactive while the page is up.
  const KEEP_LIVE = new Set(['start-page', 'vectura-toast-host']);
  const PAPER_KEYS = () => (Vectura.START_PAGE?.ENUMS?.newPaper || ['A4', 'A3', 'Letter', '9x12']);

  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'dataset') Object.entries(v).forEach(([dk, dv]) => { el.dataset[dk] = dv; });
      else el.setAttribute(k, v === true ? '' : v);
    });
    kids.flat().forEach((kid) => { if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(kid)); });
    return el;
  };

  const ICONS = {
    plus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    open: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
    back: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
    moon: '<svg class="moon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>',
    sun: '<svg class="sun" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  };

  const create = (app) => {
    let root = null;
    let open = false;
    let returnFocus = null;
    let inerted = [];
    let renderToken = 0;
    const S = () => Vectura.SETTINGS;
    const prefs = () => S().startPage || (S().startPage = {});
    const isMac = () => /mac|iphone|ipad|ipod/.test(`${navigator.platform || ''} ${navigator.userAgent || ''}`.toLowerCase());
    const mod = () => (isMac() ? '⌘' : 'Ctrl+');
    const hasLiveCanvas = () => (app.engine?.layers || []).length > 0;

    const paperInfo = (key) => {
      const conf = Vectura.NEW_CANVAS_PAPERS?.[key] || {};
      const machine = Vectura.MACHINES?.[conf.machine];
      let w = machine?.width;
      let hgt = machine?.height;
      if (conf.widthIn) { w = conf.widthIn * 25.4; hgt = conf.heightIn * 25.4; }
      if (!w) return { label: key, text: key };
      const [a, b] = [Math.round(w), Math.round(hgt)];
      const long = Math.max(a, b);
      const short = Math.min(a, b);
      return { label: conf.label || key, text: `${conf.label || key} · ${long}×${short} mm · landscape` };
    };

    const build = () => {
      root = h('div', { id: PAGE_ID, class: 'sp', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Start Page', hidden: true });
      const header = h('header', { class: 'sp-hdr' },
        h('button', { class: 'sp-brand', type: 'button', 'data-act': 'top', 'aria-label': 'Vectura Studio, back to the top of the Start Page' },
          h('span', { class: 'sp-mark' }),
          h('span', { class: 'sp-wm', html: 'VECTURA<i>.STUDIO</i>' })),
        h('span', { class: 'sp-div', 'aria-hidden': 'true' }),
        h('span', { class: 'sp-crumb', text: 'Start Page' }),
        h('span', { class: 'sp-spacer' }),
        h('button', { class: 'sp-back', type: 'button', 'data-act': 'back', hidden: true, title: 'Back to canvas (Esc)' },
          h('span', { html: ICONS.back }), h('span', { text: 'Back to canvas' })),
        h('span', { class: 'sp-today', id: 'sp-today' }),
        // Reserved for the next phase: settings gear, animation toggle, rail collapse.
        h('span', { class: 'sp-hdr-tools', 'data-slot': 'tools' }),
        h('button', { class: 'sp-theme', type: 'button', 'data-act': 'theme', 'aria-label': 'Toggle theme', title: 'Toggle theme', html: ICONS.moon + ICONS.sun }));

      const main = h('main', { class: 'sp-scroll', id: 'sp-scroll' },
        h('div', { class: 'sp-main', id: 'sp-main' },
          h('section', { class: 'sp-empty', 'aria-labelledby': 'sp-empty-h' },
            h('div', { class: 'sp-eyebrow', text: 'Your studio' }),
            h('h2', { id: 'sp-empty-h', text: 'Your work will appear here' }),
            h('p', { text: 'Start a blank canvas or open a file from the panel. Projects you open or save are listed under Recent, and in File → Open Recent.' }))));

      const chips = h('div', { class: 'sp-chips', role: 'radiogroup', 'aria-label': 'Paper for new canvas' },
        PAPER_KEYS().map((k) => h('button', { type: 'button', role: 'radio', 'data-paper': k, text: paperInfo(k).label })));
      const rail = h('aside', { class: 'sp-rail', id: 'sp-rail', 'aria-label': 'Start and recent files' },
        h('section', { class: 'sp-sec' },
          h('div', { class: 'sp-h' }, h('span', { class: 'sp-lbl', text: 'Start' })),
          h('button', { class: 'sp-primary', type: 'button', 'data-act': 'new', title: `New blank canvas (${mod()}N)` },
            h('span', { html: ICONS.plus }), h('span', { text: 'New blank canvas' }), h('kbd', { text: `${mod()}N` })),
          h('div', { class: 'sp-paper' }, chips, h('div', { class: 'sp-cap', id: 'sp-paper-cap' })),
          h('button', { class: 'sp-line', type: 'button', 'data-act': 'open', title: `Open file (${mod()}O)` },
            h('span', { html: ICONS.open }), h('span', { text: 'Open file…' }), h('kbd', { text: `${mod()}O` }))),
        h('section', { class: 'sp-sec sp-recent' },
          h('div', { class: 'sp-h' }, h('span', { class: 'sp-lbl', text: 'Resume' })),
          h('div', { id: 'sp-resume' }),
          h('div', { class: 'sp-h sp-h2' }, h('span', { class: 'sp-lbl', text: 'Recent' }),
            h('span', { class: 'sp-aside' }, h('button', { type: 'button', 'data-act': 'clear-recent', hidden: true, text: 'Clear' }))),
          h('div', { class: 'sp-list', id: 'sp-list' })),
        h('footer', { class: 'sp-foot' },
          h('label', { class: 'sp-chk' },
            h('input', { type: 'checkbox', 'data-pref': 'showOnLaunch' }), h('span', { class: 'sp-box' }), h('span', { text: 'Show Start Page on launch' })),
          h('p', { text: `Re-enable any time in Document Setup (${mod()}K).` })));

      root.append(header, h('div', { class: 'sp-body' }, main, rail));
      root.addEventListener('click', onClick);
      root.addEventListener('change', onChange);
      root.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !e.defaultPrevented && hasLiveCanvas() && !document.querySelector('.vectura-modal-backdrop[style*="display: flex"]')) {
          e.preventDefault();
          ctl.hide();
        }
      });
      document.body.appendChild(root);
    };

    const onClick = (e) => {
      const t = e.target.closest && e.target.closest('[data-act],[data-paper],[data-recent-id],[data-resume]');
      if (!t || !root.contains(t)) return;
      if (t.dataset.paper) {
        prefs().newPaper = t.dataset.paper;
        app.persistPreferencesDebounced?.();
        syncPaper();
        return;
      }
      if (t.dataset.recentId) { app.recents?.open(t.dataset.recentId); return; }
      if (t.dataset.resume === 'current') { ctl.hide(); return; }
      switch (t.dataset.act) {
        case 'top': root.querySelector('#sp-scroll')?.scrollTo?.({ top: 0 }); break;
        case 'back': ctl.hide(); break;
        case 'theme': app.toggleTheme?.(); syncTheme(); break;
        case 'new': app.newCanvas({ paper: prefs().newPaper }).then((ok) => { if (ok) ctl.hide({ restoreFocus: false }); }); break;
        case 'open': app.ui?.pickVecturaFile?.({ host: root }); break;
        case 'clear-recent': app.recents?.clear(); break;
        default: break;
      }
    };

    const onChange = (e) => {
      const t = e.target;
      if (t && t.dataset && t.dataset.pref === 'showOnLaunch') app.setShowStartPageOnLaunch(t.checked, { source: 'start-page' });
    };

    const syncPaper = () => {
      if (!root) return;
      const cur = prefs().newPaper;
      root.querySelectorAll('[data-paper]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.paper === cur)));
      const cap = root.querySelector('#sp-paper-cap');
      if (cap) cap.textContent = paperInfo(cur).text;
    };

    const syncTheme = () => {
      if (!root) return;
      // The theme manifest says whether the chrome is dark ("lark" is dark chrome on a light sheet).
      const theme = Vectura.THEMES?.[S().uiTheme];
      const light = theme && theme.colorScheme ? theme.colorScheme !== 'dark' : !/dark/.test(`${S().uiTheme || 'dark'}`);
      root.dataset.light = String(light);
    };

    const syncPrefs = () => {
      if (!root) return;
      const box = root.querySelector('[data-pref="showOnLaunch"]');
      if (box) box.checked = prefs().showOnLaunch !== false;
      syncPaper();
    };

    const thumbEl = (entry) => {
      const src = app.recents?.thumbSrc(entry);
      const th = h('span', { class: 'sp-thumb' });
      if (src) th.append(h('img', { alt: '', src }));
      return th;
    };

    const rowFor = (entry, hint) => h('button', {
      class: 'sp-row', type: 'button', 'data-recent-id': entry.id, title: entry.name, 'aria-label': `Open ${entry.name}`,
    }, thumbEl(entry),
    h('span', { class: 'sp-tx' }, h('span', { class: 'sp-nm', text: entry.name }),
      h('span', { class: 'sp-mt', text: `${entry.algorithm} · ${app.recents.relativeTime(entry.lastOpened)}` })),
    hint && isMac() ? h('kbd', { text: `⌥⌘${hint}` }) : null);

    const render = async () => {
      if (!root) return;
      const token = (renderToken += 1);
      syncPrefs();
      syncTheme();
      root.querySelector('#sp-today').textContent = (() => {
        try { return new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }); } catch (_) { return ''; }
      })();
      const entries = app.recents ? app.recents.list() : [];
      if (token !== renderToken) return;
      const live = hasLiveCanvas();
      root.querySelector('[data-act="back"]').hidden = !live;
      const resume = root.querySelector('#sp-resume');
      const list = root.querySelector('#sp-list');
      resume.textContent = '';
      list.textContent = '';
      let rest = entries;
      let hintBase = 1;
      if (live) {
        const doc = (() => { try { return app.ui?.buildSvgDocument?.(); } catch (_) { return null; } })();
        const src = doc && doc.svg ? app.recents.thumbSrc({ thumb: { kind: 'svg', data: Vectura.UI.RecentsController.thumbSvg(doc.svg, S().paper?.color || S().bgColor) } }) : null;
        const first = (app.engine.layers.find((l) => l && !l.isGroup) || {}).type;
        const label = (first && Vectura.PresetNameHeuristics?.algoLabel?.(first)) || 'Canvas';
        resume.append(h('button', { class: 'sp-cont', type: 'button', 'data-resume': 'current' },
          h('span', { class: 'sp-cth' }, src ? h('img', { alt: '', src }) : null, h('span', { class: 'sp-go', text: 'Return' })),
          h('span', { class: 'sp-nm', text: 'Continue current canvas' }),
          h('span', { class: 'sp-mt', text: `${label} · ${app.engine.layers.length} layer${app.engine.layers.length === 1 ? '' : 's'}` })));
      } else if (entries.length) {
        const e = entries[0];
        resume.append(h('button', { class: 'sp-cont', type: 'button', 'data-recent-id': e.id, 'aria-label': `Open ${e.name}` },
          h('span', { class: 'sp-cth' }, ...(app.recents.thumbSrc(e) ? [h('img', { alt: '', src: app.recents.thumbSrc(e) })] : []),
            isMac() ? h('kbd', { text: '⌥⌘1' }) : null),
          h('span', { class: 'sp-nm', text: e.name }),
          h('span', { class: 'sp-mt', text: `${e.algorithm} · ${app.recents.relativeTime(e.lastOpened)}` })));
        rest = entries.slice(1);
        hintBase = 2;
      } else {
        resume.append(h('div', { class: 'sp-none' }, h('b', { text: 'Nothing to resume yet' }), 'The file you last worked on waits here.'));
      }
      if (rest.length) {
        rest.slice(0, 8).forEach((e, i) => list.append(rowFor(e, hintBase + i)));
      } else {
        list.append(h('div', { class: 'sp-none' }, 'Files you open or save show up here and in File → Open Recent.'));
      }
      root.querySelector('[data-act="clear-recent"]').hidden = !entries.length;
    };

    const setEditorInert = (on) => {
      if (on) {
        inerted = [...document.body.children].filter((el) => el.tagName !== 'SCRIPT' && !KEEP_LIVE.has(el.id)
          && !(el.classList && el.classList.contains('vectura-modal-backdrop')) && !el.hasAttribute('inert'));
        inerted.forEach((el) => { el.setAttribute('inert', ''); });
      } else {
        inerted.forEach((el) => el.removeAttribute('inert'));
        inerted = [];
      }
    };

    const ctl = {
      get el() { return root; },
      isOpen: () => open,
      render,
      syncPrefs,
      syncTheme,
      show() {
        if (!root) build();
        if (open) { render(); return; }
        open = true;
        returnFocus = document.activeElement;
        app.ui?.setTopMenuOpen?.(null, false);
        setEditorInert(true);
        root.hidden = false;
        document.documentElement.dataset.startPage = 'open';
        render();
        app.recents?.refresh();
        root.querySelector('[data-act="new"]')?.focus?.({ preventScroll: true });
      },
      hide({ restoreFocus = true } = {}) {
        if (!open) return;
        open = false;
        renderToken += 1;
        root.hidden = true;
        setEditorInert(false);
        delete document.documentElement.dataset.startPage;
        if (restoreFocus && returnFocus && document.contains(returnFocus) && typeof returnFocus.focus === 'function') {
          try { returnFocus.focus({ preventScroll: true }); } catch (_) { /* noop */ }
        }
        returnFocus = null;
        try { G.dispatchEvent(new G.CustomEvent('vectura:start-page-hidden')); } catch (_) { /* noop */ }
      },
      toggle() { return open ? ctl.hide() : ctl.show(); },
    };

    if (app.recents) app.recents.subscribe(() => { if (open) render(); });
    return ctl;
  };

  UI.StartPage = { create };
})();
