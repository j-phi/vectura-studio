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
    let plates = null;
    let picks = null;
    let community = null;
    let settings = null;
    let railUI = null;
    let provider = null;
    let coverSig = '';
    let sizeObs = null;
    let themeObs = null;
    let unsubArt = null;
    let previewSeed = null;
    let recolorTimer = 0;
    let settleTimer = 0;

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
    const colorwayForPick = (art, index) => {
      const C = Vectura.StartPageColorway;
      if (!C) return FALLBACK_CW;
      const mode = pageMode();
      try { return C.colorwayFor({ mode, seed: mode === 'random' ? prefs().seed : undefined, theme: themeKey(), workId: art.id, index: index || 0 }); } catch (_) { return FALLBACK_CW; }
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
      if (plates) plates.recolor();
      if (picks) picks.recolor();
      if (community) community.recolor(communityColorway());
      renderRail();
    };

    /* ------------------------------------------------------------------ motion (Still) */
    // ONE source of truth: StartPageInk.isStill() (the Still toggle OR prefers-reduced-motion); setMotion announces
    // `vectura:start-page-motion` so draw styles, hover effects, lift cards and the 3D models all stop (or resume) together.
    const applyMotion = () => { try { Vectura.StartPageInk?.setMotion?.({ still: prefs().motionStill === true }); } catch (_) { /* noop */ } };
    // The page defaults for "Art animates in" and "Hover effect" changed: every bound art element re-evaluates its plan.
    const motionPrefsChanged = () => { try { Vectura.StartPageMotion?.changed?.(); } catch (_) { /* noop */ } };
    const setMotionPref = (key, value) => {
      const clean = cleanPref(key, value);
      if (prefs()[key] === clean) return;
      prefs()[key] = clean;
      persist();
      motionPrefsChanged();
    };
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
      // Narrow: only the header stays pinned; the New / Open / Resume strip and the colophon scroll away with the page
      // (and sit first in the Tab flow, right after the header).
      const scroller = root.querySelector('#sp-scroll');
      if (colo && scroller) {
        if (narrow) { if (colo.parentElement !== scroller) scroller.prepend(colo); }
        else if (colo.parentElement !== root) root.insertBefore(colo, root.querySelector('.sp-body'));
      }
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

    // Community: the lead card is the user's first plate, else the first studio pick (never a made-up piece).
    let communityLead = null;
    const communityColorway = () => (communityLead ? colorwayForPick(communityLead, 0) : null);
    const setCommunityNotify = (on) => {
      const p = prefs();
      const prev = p.communityNotify === true;
      if (prev === !!on) return;
      p.communityNotify = !!on;
      if (on) {
        app.ensurePreferencePersistence({
          message: `We will note it here when Community opens. Save preferences in cookie was turned on so this is remembered. Re-enable it in Document Setup (${mod()}K), History & Preferences.`,
          undo: () => { p.communityNotify = prev; persist(); community?.render?.(); },
        });
      } else persist();
    };
    const renderSections = async ({ picksToo = true } = {}) => {
      let arts = [];
      try { arts = await provider.list({ recentFirst: false }); } catch (_) { arts = []; }
      communityLead = arts.find((a) => a.kind === 'work') || arts.find((a) => a.kind === 'pick') || null;
      if (picksToo && picks) await picks.render();
      if (community) await community.render();
    };

    const build = () => {
      root = h('div', { id: PAGE_ID, class: 'sp', role: 'dialog', 'aria-label': 'Start Page', hidden: true, 'data-rail': 'open' });
      // The page is a full page, not a modal: no aria-modal, so the toast host (a sibling kept live) is announced.
      const skip = h('button', { class: 'sp-skip', type: 'button', 'data-act': 'skip', text: 'Skip to start actions' });
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
        h('button', { class: 'sp-theme', type: 'button', 'data-act': 'theme', 'data-mode': 'dark', 'aria-label': 'Toggle theme', title: 'Toggle theme', html: ICONS.moon + ICONS.sun + (Icons().sunMoon || '') }));

      const coverSec = h('section', { class: 'sp-cover', id: 'sp-cover', 'aria-label': 'Studio cover' });
      const main = h('main', { class: 'sp-scroll', id: 'sp-scroll' },
        h('div', { class: 'sp-main', id: 'sp-main' }, coverSec));

      railUI = UI.StartPageRail.create();
      const { rail, colo } = railUI.build({ paperKeys: PAPER_KEYS(), paperLabel: (k) => paperInfo(k).label });

      root.append(skip, header, colo, h('div', { class: 'sp-body' }, main, rail));

      cover = UI.StartPageCover.create({
        host: coverSec,
        prefs,
        arts: () => provider.list({ recentFirst: true }),
        colorwaysFor,
        still: () => prefs().motionStill === true,
        onOpen: (art, cw) => ctl.openArt(art, cw),
        // "Use as cover" persists the piece id (colors follow the page mode), its framing and fill kind.
        onCover: (o) => {
          const p = prefs();
          const clean = Vectura.START_PAGE.sanitize({ ...p, coverArtId: o ? o.art.id : '', coverFrame: o ? o.frame : null, coverFill: o && o.fill ? (o.fill.kind || o.fill) : '' });
          p.coverArtId = clean.coverArtId; p.coverFrame = clean.coverFrame; p.coverFill = clean.coverFill;
          persist();
        },
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
        examples: () => (plates && plates.isExamples ? plates.isExamples() : null),
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

      plates = UI.StartPagePlatesSection.create({
        host: main.querySelector('#sp-main'),
        app,
        prefs,
        setPref: (key, value) => { prefs()[key] = cleanPref(key, value); persist(); },
        arts: () => provider.list({ recentFirst: false }),
        mode: pageMode,
        seed: () => prefs().seed || undefined,
        theme: themeKey,
        still: () => prefs().motionStill === true,
        scroller: () => root.querySelector('#sp-scroll'),
        onOpen: (art, cw, opts) => ctl.openArt(art, cw, opts),
        onHeader: () => { if (controls) controls.sync(); }, // examples <-> own plates changes the colorway note
      });
      plates.setCoverApi(cover);
      ctl.plates = plates;

      // Studio picks and Community sit under the plates, in the page colorways.
      const mainEl = main.querySelector('#sp-main');
      const picksEl = h('section', { id: 'sp-picks', class: 'sp-picks' });
      const communityEl = h('section', { id: 'sp-community', class: 'sp-community' });
      mainEl.append(picksEl, communityEl);
      picks = Vectura.StartPagePicksSection.create(picksEl, {
        artSource: { list: () => provider.list({ recentFirst: false }) },
        colorwayFor: colorwayForPick,
        openArt: (art, cw, opts) => ctl.openArt(art, cw, opts),
        animateIn: () => Vectura.StartPageMotion?.styleId(prefs().animateIn) || 'plot',
        hover: () => prefs().hover,
      });
      community = Vectura.StartPageCommunity.create(communityEl, {
        leadArt: () => communityLead,
        colorway: communityColorway,
        hover: () => prefs().hover,
        openArt: (art, cw) => ctl.openArt(art, cw),
        notify: {
          get: () => prefs().communityNotify === true,
          set: (on) => setCommunityNotify(on),
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
        onPref: (key, value) => { if (key === 'animateIn' || key === 'hover') setMotionPref(key, value); },
        // Preview: play the cover's draw-in again with the chosen style (Still shows it finished)
        onPreview: () => { settings.close(false); cover.render({ animate: true }); },
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
        // Every other region is inert, so Tab wraps inside the page instead of dropping onto <body>.
        if (e.key === 'Tab' && !e.defaultPrevented && !e.target.closest('[aria-modal="true"],[data-plate-editor]')) {
          const tabs = [...root.querySelectorAll('button,a[href],input,select,textarea,[tabindex="0"]')]
            .filter((n) => !n.disabled && n.tabIndex >= 0 && n.getClientRects().length && !n.closest('[inert],[hidden],[aria-hidden="true"]'));
          const edge = e.shiftKey ? tabs[0] : tabs[tabs.length - 1];
          if (tabs.length && e.target === edge) { e.preventDefault(); (e.shiftKey ? tabs[tabs.length - 1] : tabs[0]).focus(); return; }
        }
        // An open popover owns Escape even when focus sits on the button that opened it: close it, keep the page.
        if (e.key === 'Escape' && !e.defaultPrevented) {
          if (settings && settings.isOpen()) { e.preventDefault(); settings.close(true); return; }
          if (cover && cover.words.isOpen()) { e.preventDefault(); cover.words.close(true); return; }
        }
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
      if (t.dataset.recentId) { ctl.openRecent(t.dataset.recentId, ctl.resolvedColorway(t)); return; }
      if (t.dataset.resume === 'current') { ctl.hide(); return; }
      switch (t.dataset.act) {
        case 'skip': root.querySelector(narrow || prefs().railCollapsed === true ? '#sp-colo-wrap [data-act="new"]' : '#sp-rail [data-act="new"]')?.focus?.(); break;
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
      // The same rotation state (and label) as the editor header button: Dark, Lark, Light or System.
      const btn = root.querySelector('.sp-theme');
      const state = app.getThemeState?.();
      if (btn && state) {
        btn.dataset.mode = state.mode;
        btn.setAttribute('aria-label', state.description);
        btn.title = state.description;
      }
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
    // Building the live canvas export is a full plotter export. It is cached against a cheap fingerprint of the
    // document (undo history length + newest entry, layer count), so a recolor, a mode click or a theme flip does
    // not pay for it again; show() always starts fresh.
    let liveCache = null;
    const liveFingerprint = () => {
      const hist = Array.isArray(app.history) ? app.history : [];
      return { len: hist.length, last: hist[hist.length - 1], layers: (app.engine?.layers || []).length };
    };
    const liveCanvasSvg = () => {
      const fp = liveFingerprint();
      if (liveCache && liveCache.len === fp.len && liveCache.last === fp.last && liveCache.layers === fp.layers) return liveCache.svg;
      let svg = null;
      try {
        const doc = app.ui?.buildSvgDocument?.();
        svg = doc && doc.svg ? Vectura.StartPageArtProvider.strokeSvg(doc.svg) : null;
      } catch (_) { svg = null; }
      liveCache = { ...fp, svg };
      return svg;
    };
    // Recents (Resume, rail, colophon, File > Open Recent) show and open the file in ITS OWN colors: no page-mode tint, and
    // the click reopens the original file. The own colors come from the art source (thumbnail ground + first pen).
    const ownCache = new Map();
    const ownColorwayOf = (id) => ownCache.get(id) || null;
    const refreshOwn = async () => {
      let arts = [];
      try { arts = await provider.list({ recentFirst: true }); } catch (_) { arts = []; }
      ownCache.clear();
      arts.forEach((a) => { if (a && a.kind === 'work' && a.ownColors && a.ownColors.paper && a.ownColors.ink) ownCache.set(a.recentId || a.workId, { key: 'own', paper: a.ownColors.paper, ink: a.ownColors.ink, ink2: null }); });
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
        resumeColorway = ownColorwayOf(entries[0].id);
      }
      syncPaper();
      railUI.render({ app, root, live, entries, liveSvg, liveColorway, resumeSvg, resumeColorway, colorwayFor: (e) => ownColorwayOf(e.id) });
      // Every recent opens in the colors its thumbnail shows (read back from these attributes on click).
      root.querySelectorAll('[data-recent-id]').forEach((b) => {
        const cw = ownColorwayOf(b.dataset.recentId);
        if (!cw) { delete b.dataset.spPaper; delete b.dataset.spInk; delete b.dataset.spInk2; return; }
        b.dataset.spPaper = cw.paper; b.dataset.spInk = cw.ink; delete b.dataset.spInk2;
      });
    };

    const artSignature = async () => {
      let arts = [];
      try { arts = await provider.list({ recentFirst: true }); } catch (_) { arts = []; }
      return arts.map((a) => a.id).join('|');
    };

    // A saved "Use as cover" piece returns on load (its colors follow the page mode).
    const restoreCover = async () => {
      const id = prefs().coverArtId;
      if (!id || cover.coverOverride()) return;
      let arts = [];
      try { arts = await provider.list({ recentFirst: true }); } catch (_) { arts = []; }
      const art = arts.find((a) => a.id === id);
      if (!art) return;
      // the fill kind is kept; the cover rebuilds its spec from the colorway it shows
      const fill = prefs().coverFill || null;
      cover.setOverride({ art, frame: prefs().coverFrame, fill });
    };

    // First render after show(): the page body is held blank until everything is laid out (two frames so the cover's
    // outlines are painted), then the boot cover (if any) is lifted in the same step.
    const settle = () => new Promise((res) => {
      const done = () => {
        clearTimeout(settleTimer);
        if (root) delete root.dataset.settling;
        document.documentElement.removeAttribute('data-sp-boot');
        res();
      };
      if (!root || root.dataset.settling == null) { done(); return; }
      const raf = G.requestAnimationFrame || ((f) => setTimeout(f, 16));
      raf(() => raf(done));
    });
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
      await refreshOwn();
      if (token !== renderToken) return;
      renderRail();
      coverSig = await artSignature();
      if (token !== renderToken) return;
      await restoreCover();
      if (token !== renderToken) return;
      // The cover keeps filling as its pieces arrive (letters are outlines first, then the art plots in); the page does
      // not wait for that, only for the letters / word to be laid out. The rest of the page renders alongside, so the
      // first painted page is the final layout.
      let mounted; const mountedP = new Promise((res) => { mounted = res; });
      const coverP = cover.render({ animate, onMounted: () => mounted() });
      await Promise.race([mountedP, coverP, new Promise((res) => setTimeout(res, 2500))]);
      if (token !== renderToken) return;
      controls.sync();
      await plates.render();
      if (token !== renderToken) return;
      await renderSections();
      if (token !== renderToken) return;
      await settle();
      await coverP;
      if (token !== renderToken) return;
      controls.sync();
    };

    // The works changed (an open or save while the page is up): refresh the rail; the cover only when its art did.
    const onWorksChanged = async () => {
      if (!open) return;
      await refreshOwn();
      if (!open) return;
      renderRail();
      const sig = await artSignature();
      if (!open || sig === coverSig) return;
      coverSig = sig;
      await cover.render({ animate: false });
      controls.sync();
      plates.refresh();
      renderSections({ picksToo: false });
    };

    /* ------------------------------------------------------------------ open art */
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
      themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-ui-skin', 'data-ui-theme-mode'] });
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
       * Open a piece in the editor in EXACTLY the colors it is showing (cover letters, word and band, plates, fan
       * cards, recents). Goes through StartPageOpenArt, which freezes the resolved colorway into the document.
       * art = an Art ({ kind: 'work', recentId } | { kind: 'pick', presetId }); cw = { paper, ink, ink2?, paperType?, fill? }.
       */
      async openArt(art, cw, { asTemplate = false } = {}) {
        if (!art) return false;
        const name = String(art.name || '').replace(/\.vectura$/i, '');
        const spec = art.kind === 'pick' ? { kind: 'pick', presetId: art.presetId, name } : { kind: 'work', recentId: art.recentId || art.workId, name };
        const O = Vectura.StartPageOpenArt;
        const rid = art.recentId || art.workId;
        // A piece shown in its own colors opens the ORIGINAL file (no "(colorway)" fork); any other colors make the copy.
        if (art.kind !== 'pick' && rid && app.recents && !asTemplate && cw && !cw.fill && O && O.sameAsOwn && O.sameAsOwn(cw, art.ownColors || ownColorwayOf(rid))) return app.recents.open(rid);
        if (!O || typeof O.open !== 'function') return rid && app.recents ? app.recents.open(rid) : false;
        return O.open(spec, cw || null, { asTemplate, app });
      },
      /** A rail / colophon / Resume recent: always reopens the original file (it is shown in its own colors). */
      async openRecent(id) {
        return app.recents ? app.recents.open(id) : false;
      },
      show() {
        if (!root) build();
        if (open) { render(); return; }
        open = true;
        liveCache = null;
        returnFocus = document.activeElement;
        app.ui?.setTopMenuOpen?.(null, false);
        setEditorInert(true);
        root.dataset.settling = 'true';
        // A launch behind the boot cover: the page is already revealed in one step, no fade-in on top of it.
        if (document.documentElement.hasAttribute('data-sp-boot')) root.dataset.noFx = 'true'; else delete root.dataset.noFx;
        clearTimeout(settleTimer);
        settleTimer = setTimeout(() => { if (root) delete root.dataset.settling; document.documentElement.removeAttribute('data-sp-boot'); }, 4000); // never leave the page blank
        root.hidden = false;
        document.documentElement.dataset.startPage = 'open';
        applyMotion();
        if (!unsubArt && provider) unsubArt = provider.subscribe(onWorksChanged);
        watchTheme(true);
        render({ animate: true });
        app.recents?.refresh();
        // Initial focus is the first control at the top of the page (the skip link leads the order, then header, actions,
        // cover, plates, picks, rail), so Tab walks the page top to bottom instead of starting in the last region.
        root.querySelector('.sp-hdr button:not([hidden]):not([disabled])')?.focus?.({ preventScroll: true });
      },
      hide({ restoreFocus = true } = {}) {
        if (!open) return;
        open = false;
        renderToken += 1;
        settings?.close(false);
        cover?.words.close(false);
        plates?.closeTransient();
        watchTheme(false);
        try { Vectura.StartPageInk?.finish?.(); } catch (_) { /* noop */ }
        clearTimeout(settleTimer);
        delete root.dataset.settling;
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
