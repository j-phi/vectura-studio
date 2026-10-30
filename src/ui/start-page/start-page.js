/**
 * Start Page (P0 shell + P1 cover).
 *
 * An overlay (#start-page) above the running editor. Header (wordmark, crumb, date, rail toggle, Settings gear,
 * animation toggle, theme toggle, "Back to canvas"), a main column (the cover, then the page-wide color controls)
 * and a rail (Start / Resume / Recent) that collapses into a colophon strip. The editor underneath keeps running
 * and is made `inert` while the page is shown; focus moves in on show and back on hide.
 *
 * Pieces: cover.js (three cover styles, word picker, identity), color-controls.js, settings.js, rail.js,
 * art-provider.js (works + studio picks, or recents thumbnails), ink.js (drawing), colorway.js (colors).
 *
 * window.Vectura.UI.StartPage.create(app) ->
 *   { show, hide, toggle, isOpen, render, syncPrefs, syncTheme, openArt, resolvedColorway, el }
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  const PAGE_ID = 'start-page';
  // Body children that must stay interactive while the page is up.
  const KEEP_LIVE = new Set(['start-page', 'vectura-toast-host']);
  const PAPER_KEYS = () => (Vectura.START_PAGE?.ENUMS?.newPaper || ['A4', 'A3', 'Letter', '9x12']);
  const NARROW_PX = 900;

  const ICONS = {
    back: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
    moon: '<svg class="moon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>',
    sun: '<svg class="sun" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  };

  const create = (app) => {
    const { h } = Vectura.StartPageDom;
    const Icons = () => Vectura.StartPageIcons;
    let root = null;
    let open = false;
    let returnFocus = null;
    let inerted = [];
    let renderToken = 0;
    let narrow = false;
    let cover = null;
    let controls = null;
    let settings = null;
    let railUI = null;
    let provider = null;
    let coverSig = '';
    let sizeObs = null;
    let themeObs = null;
    let unsubArt = null;
    let previewSeed = null;
    let recolorTimer = 0;

    const S = () => Vectura.SETTINGS;
    const prefs = () => S().startPage || (S().startPage = {});
    const isMac = () => /mac|iphone|ipad|ipod/.test(`${navigator.platform || ''} ${navigator.userAgent || ''}`.toLowerCase());
    const mod = () => (isMac() ? '⌘' : 'Ctrl+');
    const hasLiveCanvas = () => (app.engine?.layers || []).length > 0;
    const persist = () => app.persistPreferencesDebounced?.();
    const cleanPref = (key, value) => Vectura.START_PAGE.sanitize({ ...prefs(), [key]: value })[key];

    /* ------------------------------------------------------------------ colors */
    const themeKey = () => {
      const id = String(S().uiTheme || 'dark');
      return /lark/.test(id) ? 'lark' : (/light/.test(id) ? 'light' : 'dark');
    };
    const pageMode = () => (prefs().seed ? 'random' : (prefs().colorMode || 'curated'));
    const FALLBACK_CW = { key: 'fallback', paper: '#fbfaf6', ink: '#1a1a1a', ink2: null, textInk: '#1a1a1a', paperName: 'Paper', penName: 'Ink' };
    const colorwaysFor = (arts) => {
      const C = Vectura.StartPageColorway;
      if (!C || !arts.length) return arts.map(() => FALLBACK_CW);
      const mode = pageMode();
      try {
        return C.sequence(arts.map((a) => ({ id: a.id })), { mode, seed: mode === 'random' ? prefs().seed : undefined, theme: themeKey() });
      } catch (err) {
        if (G.console) G.console.warn('[StartPage] colorway failed', err);
        return arts.map(() => FALLBACK_CW);
      }
    };
    const colorwayForWork = (id) => {
      const C = Vectura.StartPageColorway;
      if (!C) return FALLBACK_CW;
      const mode = pageMode();
      try { return C.colorwayFor({ mode, seed: mode === 'random' ? prefs().seed : undefined, theme: themeKey(), workId: id, index: 0 }); } catch (_) { return FALLBACK_CW; }
    };
    const uniqueSwatches = () => {
      const seen = new Map();
      (cover ? cover.tiles() : []).forEach((t) => { if (t.cw && !seen.has(t.cw.key)) seen.set(t.cw.key, t.cw); });
      return [...seen.values()];
    };
    const recolor = () => {
      if (!root) return;
      if (cover) cover.recolor();
      if (controls) controls.sync();
      renderRail();
    };

    /* ------------------------------------------------------------------ motion (Still) */
    const applyMotion = () => { try { Vectura.StartPageInk?.setMotion?.({ still: prefs().motionStill === true }); } catch (_) { /* noop */ } };
    const syncMotionBtn = () => {
      const btn = root && root.querySelector('#sp-motion-btn');
      if (!btn) return;
      const still = prefs().motionStill === true;
      btn.setAttribute('aria-pressed', String(still));
      btn.innerHTML = still ? Icons().play : Icons().pause;
      btn.title = still ? 'Animations are paused. Click to play them' : 'Pause animations';
      btn.setAttribute('aria-label', still ? 'Animations paused. Play animations' : 'Animations playing. Pause animations');
    };
    const setStill = (on) => {
      const p = prefs();
      const prev = p.motionStill === true;
      if (prev === on) return;
      p.motionStill = on;
      applyMotion();
      syncMotionBtn();
      if (on) {
        app.ensurePreferencePersistence({
          message: `Animations are paused. Save preferences in cookie was turned on so this is remembered. Re-enable it in Document Setup (${mod()}K), History & Preferences.`,
          undo: () => { p.motionStill = prev; applyMotion(); syncMotionBtn(); persist(); },
        });
      } else {
        persist();
      }
    };

    /* ------------------------------------------------------------------ rail collapse */
    const applyRail = () => {
      if (!root) return;
      const collapsed = prefs().railCollapsed === true;
      root.dataset.rail = collapsed ? 'closed' : 'open';
      const btn = root.querySelector('#sp-rail-toggle');
      if (btn) {
        btn.innerHTML = collapsed ? Icons().railOpen : Icons().railClose;
        btn.setAttribute('aria-expanded', String(!collapsed));
        btn.setAttribute('aria-label', collapsed ? 'Expand the side panel' : 'Collapse the side panel into a strip');
        btn.title = collapsed ? 'Expand panel' : 'Collapse panel';
      }
      const strip = !!(collapsed || narrow);
      const rail = root.querySelector('#sp-rail');
      const colo = root.querySelector('#sp-colo-wrap');
      if (rail) { rail.inert = strip; rail.setAttribute('aria-hidden', String(strip)); }
      if (colo) { colo.inert = !strip; colo.setAttribute('aria-hidden', String(!strip)); }
      if (btn) btn.hidden = narrow; // at <= 900 px the strip is the only form
    };
    const setRail = (collapsed) => {
      prefs().railCollapsed = collapsed;
      applyRail();
      persist();
      if (cover) setTimeout(() => cover.refit(), 380);
    };

    /* ------------------------------------------------------------------ build */
    const paperInfo = (key) => {
      const conf = Vectura.NEW_CANVAS_PAPERS?.[key] || {};
      const machine = Vectura.MACHINES?.[conf.machine];
      let w = machine?.width;
      let hgt = machine?.height;
      if (conf.widthIn) { w = conf.widthIn * 25.4; hgt = conf.heightIn * 25.4; }
      if (!w) return { label: key, text: key };
      const [a, b] = [Math.round(w), Math.round(hgt)];
      return { label: conf.label || key, text: `${conf.label || key} · ${Math.max(a, b)}×${Math.min(a, b)} mm · landscape` };
    };

    const build = () => {
      root = h('div', { id: PAGE_ID, class: 'sp', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Start Page', hidden: true, 'data-rail': 'open' });
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
        h('span', { class: 'sp-hdr-tools', 'data-slot': 'tools' },
          h('button', { class: 'sp-hbtn', type: 'button', id: 'sp-rail-toggle', 'aria-controls': 'sp-rail' }),
          h('button', { class: 'sp-hbtn', type: 'button', id: 'sp-settings-btn', 'aria-label': 'Start Page settings', title: 'Start Page settings', html: Icons().gear }),
          h('button', { class: 'sp-hbtn', type: 'button', id: 'sp-motion-btn', 'aria-pressed': 'false' })),
        h('button', { class: 'sp-theme', type: 'button', 'data-act': 'theme', 'aria-label': 'Toggle theme', title: 'Toggle theme', html: ICONS.moon + ICONS.sun }));

      const coverSec = h('section', { class: 'sp-cover', id: 'sp-cover', 'aria-label': 'Studio cover' });
      const main = h('main', { class: 'sp-scroll', id: 'sp-scroll' },
        h('div', { class: 'sp-main', id: 'sp-main' }, coverSec));

      railUI = UI.StartPageRail.create();
      const { rail, colo } = railUI.build({ paperKeys: PAPER_KEYS(), paperLabel: (k) => paperInfo(k).label });

      root.append(header, colo, h('div', { class: 'sp-body' }, main, rail));

      cover = UI.StartPageCover.create({
        host: coverSec,
        prefs,
        arts: () => provider.list({ recentFirst: true }),
        colorwaysFor,
        still: () => prefs().motionStill === true,
        onOpen: (art, cw) => ctl.openArt(art, cw),
        onPref: (key, value) => {
          const clean = cleanPref(key, value);
          if (prefs()[key] === clean) return;
          prefs()[key] = clean;
          persist();
          if (key === 'name' && ['last-name', 'first-last'].includes(prefs().coverWord)) cover.render();
        },
        onWordPick: (id, custom) => {
          const p = prefs();
          if (id === 'custom') {
            const clean = cleanPref('customWord', custom);
            if (!clean) return;
            p.customWord = clean;
          }
          p.coverWord = Vectura.START_PAGE.ENUMS.coverWord.includes(id) ? id : 'vectura';
          persist();
          cover.render({ animate: true });
        },
      });

      controls = UI.StartPageColorControls.create({
        host: main.querySelector('#sp-main'),
        mode: pageMode,
        seed: () => prefs().seed,
        previewSeed: () => previewSeed || (previewSeed = Vectura.StartPageColorway?.newSeed?.() || 'K7PQ2'),
        swatches: uniqueSwatches,
        onMode: (m) => {
          const p = prefs();
          if (p.colorMode === m && !p.seed) return;
          p.colorMode = m;
          p.seed = null;
          persist();
          recolor();
        },
        onRandom: () => {
          prefs().seed = Vectura.StartPageColorway?.newSeed?.() || 'K7PQ2';
          persist();
          recolor();
        },
      });

      settings = UI.StartPageSettings.create({
        root,
        button: header.querySelector('#sp-settings-btn'),
        prefs,
        onStyle: (k) => {
          if (prefs().coverStyle === k) return;
          prefs().coverStyle = k;
          persist();
          cover.render({ animate: true });
        },
        onToggle: (key, on) => {
          if (key === 'showOnLaunch') { app.setShowStartPageOnLaunch(on); return; }
          if (key === 'showName' || key === 'showLine') {
            prefs()[key] = on;
            persist();
            cover.syncWho();
          }
        },
      });

      root.addEventListener('click', onClick);
      root.addEventListener('change', onChange);
      header.querySelector('#sp-rail-toggle').addEventListener('click', () => setRail(prefs().railCollapsed !== true));
      header.querySelector('#sp-motion-btn').addEventListener('click', () => setStill(prefs().motionStill !== true));
      root.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !e.defaultPrevented && hasLiveCanvas() && !document.querySelector('.vectura-modal-backdrop[style*="display: flex"]')) {
          e.preventDefault();
          ctl.hide();
        }
      });
      document.body.appendChild(root);
      if (typeof G.ResizeObserver === 'function') {
        sizeObs = new G.ResizeObserver(() => {
          const w = root.clientWidth;
          const next = w > 0 && w <= NARROW_PX;
          if (next !== narrow) { narrow = next; applyRail(); }
        });
        sizeObs.observe(root);
      }
      syncMotionBtn();
      applyRail();
    };

    const onClick = (e) => {
      const t = e.target.closest && e.target.closest('[data-act],[data-paper],[data-recent-id],[data-resume]');
      if (!t || !root.contains(t)) return;
      if (t.dataset.paper) {
        prefs().newPaper = t.dataset.paper;
        persist();
        syncPaper();
        return;
      }
      if (t.dataset.recentId) { app.recents?.open(t.dataset.recentId); return; }
      if (t.dataset.resume === 'current') { ctl.hide(); return; }
      switch (t.dataset.act) {
        case 'top': root.querySelector('#sp-scroll')?.scrollTo?.({ top: 0 }); break;
        case 'back': ctl.hide(); break;
        case 'theme': app.toggleTheme?.(); syncTheme(); recolor(); break;
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
      syncMotionBtn();
      applyRail();
      if (settings) settings.sync();
      if (controls) controls.sync();
    };

    /* ------------------------------------------------------------------ rail data */
    const liveCanvasSvg = () => {
      try {
        const doc = app.ui?.buildSvgDocument?.();
        return doc && doc.svg ? Vectura.StartPageArtProvider.strokeSvg(doc.svg) : null;
      } catch (_) { return null; }
    };
    const renderRail = () => {
      if (!root || !railUI) return;
      const entries = app.recents ? app.recents.list() : [];
      const live = hasLiveCanvas();
      let liveSvg = null; let liveColorway = null; let resumeSvg = null; let resumeColorway = null;
      if (live) {
        liveSvg = liveCanvasSvg();
        const pen = (S().pens || [])[0] || {};
        liveColorway = { key: 'live', paper: S().paper?.color || S().bgColor || '#ffffff', ink: pen.color || '#1a1a1a', ink2: null };
      } else if (entries[0]) {
        const t = entries[0].thumb;
        if (t && t.kind === 'svg') resumeSvg = Vectura.StartPageArtProvider.strokeSvg(t.data);
        resumeColorway = colorwayForWork(`work:${entries[0].id}`);
      }
      syncPaper();
      railUI.render({ app, root, live, entries, liveSvg, liveColorway, resumeSvg, resumeColorway, colorwayFor: (e) => colorwayForWork(`work:${e.id}`) });
    };

    const artSignature = async () => {
      let arts = [];
      try { arts = await provider.list({ recentFirst: true }); } catch (_) { arts = []; }
      return arts.map((a) => a.id).join('|');
    };

    const render = async ({ animate = false } = {}) => {
      if (!root) return;
      const token = (renderToken += 1);
      syncPrefs();
      syncTheme();
      root.querySelector('#sp-today').textContent = (() => {
        try { return new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }); } catch (_) { return ''; }
      })();
      if (token !== renderToken) return;
      root.querySelector('[data-act="back"]').hidden = !hasLiveCanvas();
      renderRail();
      coverSig = await artSignature();
      if (token !== renderToken) return;
      await cover.render({ animate });
      if (token !== renderToken) return;
      controls.sync();
    };

    // The works changed (an open or save while the page is up): refresh the rail; the cover only when its art did.
    const onWorksChanged = async () => {
      if (!open) return;
      renderRail();
      const sig = await artSignature();
      if (!open || sig === coverSig) return;
      coverSig = sig;
      await cover.render({ animate: false });
      controls.sync();
    };

    /* ------------------------------------------------------------------ open art (P2 hardens this) */
    const applyColorway = (cw) => {
      if (!cw) return;
      try {
        const s = S();
        const pen = (s.pens || [])[0];
        if (pen) pen.color = cw.ink;
        if (s.paper && typeof s.paper === 'object') s.paper = { ...s.paper, color: cw.paper };
        s.bgColor = cw.paper;
        app.ui?.renderPens?.();
        app.render?.();
      } catch (err) { if (G.console) G.console.warn('[StartPage] applying the colorway failed', err); }
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

    const watchTheme = (on) => {
      if (themeObs) { themeObs.disconnect(); themeObs = null; }
      if (!on || typeof G.MutationObserver !== 'function') return;
      themeObs = new G.MutationObserver(() => {
        clearTimeout(recolorTimer);
        recolorTimer = setTimeout(() => { syncTheme(); recolor(); }, 30);
      });
      themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-ui-skin'] });
    };

    const ctl = {
      get el() { return root; },
      isOpen: () => open,
      render,
      syncPrefs,
      syncTheme,
      colorwaysFor,
      /** The resolved colorway of a cover tile / letter (opening art uses exactly this). */
      resolvedColorway(el) {
        const t = el && el.closest ? el.closest('[data-sp-paper]') : null;
        if (!t) return null;
        return { key: t.dataset.spKey || null, paper: t.dataset.spPaper, ink: t.dataset.spInk, ink2: t.dataset.spInk2 || null };
      },
      /**
       * Open a cover piece in the editor in the colors it is showing: a work reopens through Recents, a studio
       * pick opens as a new canvas holding the preset; then the paper and pen 1 take the colorway.
       */
      async openArt(art, cw) {
        if (!art) return false;
        let ok = false;
        if (art.recentId && app.recents) {
          ok = await app.recents.open(art.recentId);
        } else if (art.presetId) {
          const preset = (Vectura.PRESETS || []).find((p) => p.id === art.presetId);
          if (preset && await app.newCanvas({ paper: prefs().newPaper })) {
            const id = app.engine.addLayer(preset.preset_system); // returns the new layer's id
            const layer = app.engine.layers.find((l) => l.id === id);
            if (layer) {
              layer.params = { ...layer.params, ...(preset.params || {}), preset: preset.id };
              app.engine.generate(layer.id);
              ok = true;
            }
            ctl.hide({ restoreFocus: false });
          }
        }
        if (ok) applyColorway(cw);
        return ok;
      },
      show() {
        if (!root) build();
        if (open) { render(); return; }
        open = true;
        returnFocus = document.activeElement;
        app.ui?.setTopMenuOpen?.(null, false);
        setEditorInert(true);
        root.hidden = false;
        document.documentElement.dataset.startPage = 'open';
        applyMotion();
        if (!unsubArt && provider) unsubArt = provider.subscribe(onWorksChanged);
        watchTheme(true);
        render({ animate: true });
        app.recents?.refresh();
        const strip = prefs().railCollapsed === true || narrow;
        root.querySelector(strip ? '#sp-colo-wrap [data-act="new"]' : '#sp-rail [data-act="new"]')?.focus?.({ preventScroll: true });
      },
      hide({ restoreFocus = true } = {}) {
        if (!open) return;
        open = false;
        renderToken += 1;
        settings?.close(false);
        cover?.words.close(false);
        watchTheme(false);
        try { Vectura.StartPageInk?.finish?.(); } catch (_) { /* noop */ }
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

    provider = Vectura.StartPageArtProvider.create(app);
    applyMotion();
    return ctl;
  };

  UI.StartPage = { create };
})();
