/**
 * TB-1…8 — Contextual Task Bar framework (Illustrator Tools Parity, Phase 2
 * Lane G). The floating pill morphs per selection context with drag/pin/reset/
 * hide management, an overflow menu, and an ARIA toolbar that never steals
 * focus. Sub-modes (Lane H) are feature-detected — the bar works without them.
 *
 * RGR: every assertion here references `Vectura.UI.ContextBar`, the `.ctxbar`
 * markup, `Vectura.CONTEXT_BAR` config, and the Document Setup "Contextual task
 * bar" toggle — none of which exist on the base branch, so this whole file
 * fails before Lane G and passes after.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

const nextFrames = (ms = 80) => new Promise((r) => setTimeout(r, ms));

describe('Contextual Task Bar (Lane G — TB-1…8)', () => {
  let runtime, window, document, app, CB, SETTINGS;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
    SETTINGS = window.Vectura.SETTINGS;
    CB = window.Vectura.UI.ContextBar;
    await nextFrames();
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  const bar = () => document.querySelector('#viewport-container .ctxbar');
  const host = () => CB.getContentHost();
  const btnTitles = () => Array.from(host().querySelectorAll('.ctxbar-btn')).map((b) => b.title);
  const addLayer = (type = 'wavetable') => {
    const id = app.engine.addLayer(type);
    return app.engine.layers.find((l) => l.id === id);
  };
  const select = (ids) => { app.renderer.setSelection(ids, ids[0] || null); };
  const deselect = () => { app.renderer.setSelection([], null); };
  const openOverflow = () => { document.querySelector('.ctxbar-overflow').click(); };

  const reset = async (tool = 'select') => {
    SETTINGS.contextBarEnabled = true;
    const p = SETTINGS.contextBar || (SETTINGS.contextBar = {});
    p.pinned = false; p.x = null; p.y = null;
    app.renderer.setTool(tool);
    deselect();
    await nextFrames();
  };

  // ── config ──────────────────────────────────────────────────────────
  describe('config lives in src/config/context-bar.js', () => {
    test('CONTEXT_BAR exposes copy/icons/timings (no inline strings in the module)', () => {
      const C = window.Vectura.CONTEXT_BAR;
      expect(C).toBeTruthy();
      expect(C.overflow.items.showPanel).toBe('Show Properties panel');
      expect(C.buttons.draw.label).toBeTruthy();
      expect(C.icons.grip).toContain('<svg');
      expect(C.timing.showHideMs).toBeLessThanOrEqual(120);
    });
  });

  // ── TB-1 anchoring math (pure; no layout) ───────────────────────────
  describe('TB-1 — anchoring math', () => {
    const size = { barW: 240, barH: 34, viewW: 800, viewH: 600, offset: 12, pad: 8 };
    test('anchors below the bbox, horizontally centered, offset by ~12px', () => {
      const a = CB._computeAnchor({ bounds: { minX: 300, minY: 200, maxX: 400, maxY: 260, centerX: 350 }, ...size });
      expect(a.flipped).toBe(false);
      expect(a.top).toBe(260 + 12);
      expect(a.left).toBe(350 - 120);
    });
    test('flips above when there is insufficient room below', () => {
      const a = CB._computeAnchor({ bounds: { minX: 300, minY: 540, maxX: 400, maxY: 590, centerX: 350 }, ...size });
      expect(a.flipped).toBe(true);
      expect(a.top).toBe(540 - 12 - 34);
    });
    test('idle (no bounds) centers near the lower-center of the viewport', () => {
      const a = CB._computeAnchor({ bounds: null, ...size });
      expect(a.left).toBe((800 - 240) / 2);
      expect(a.top).toBeGreaterThan(600 * 0.6);
    });
    test('clamps fully inside the viewport', () => {
      const a = CB._computeAnchor({ bounds: { minX: -50, minY: 10, maxX: 10, maxY: 40, centerX: -20 }, ...size });
      expect(a.left).toBeGreaterThanOrEqual(8);
    });
    test('yields horizontally to the floating tool rail', () => {
      const a = CB._computeAnchor({
        bounds: { minX: 0, minY: 100, maxX: 40, maxY: 140, centerX: 20 }, ...size,
        railRect: { left: 0, right: 60, top: 0, bottom: 600 },
      });
      expect(a.left).toBeGreaterThanOrEqual(60);
    });
  });

  // ── TB-3 idle ───────────────────────────────────────────────────────
  describe('TB-3 — idle state', () => {
    test('deselect + Select tool shows the idle bar with Draw + a second item', async () => {
      await reset('select');
      expect(CB.getContext().kind).toBe('idle');
      expect(bar().classList.contains('is-visible')).toBe(true);
      const titles = btnTitles();
      expect(titles.length).toBe(2);
      expect(titles[0]).toBe(window.Vectura.CONTEXT_BAR.buttons.draw.tooltip);
    });
    test('Draw switches to the pencil tool', async () => {
      await reset('select');
      host().querySelector('.ctxbar-btn').click();
      await nextFrames();
      expect(app.renderer.activeTool).toBe('pen');
    });
    test('Document Setup button actually clicks the real settings trigger (#btn-settings)', async () => {
      await reset('select');
      // The real File ▸ Document Setup trigger is #btn-settings — assert the
      // idle button routes to it (regression for the dead-no-op defect).
      const trigger = document.querySelector('#btn-settings');
      expect(trigger).toBeTruthy();
      let clicked = 0;
      trigger.addEventListener('click', () => { clicked += 1; });
      const docSetupBtn = Array.from(host().querySelectorAll('.ctxbar-btn'))
        .find((b) => b.title === window.Vectura.CONTEXT_BAR.buttons.documentSetup.tooltip);
      expect(docSetupBtn).toBeTruthy();
      docSetupBtn.click();
      expect(clicked).toBe(1);
    });
    test('Add Layer dropdown renders left of the labeled Draw button', async () => {
      await reset('select');
      const addField = host().querySelector('.ctxbar-add-layer-field');
      expect(addField).toBeTruthy();
      // Draw keeps its text label alongside the pen icon.
      const drawBtn = host().querySelector('.ctxbar-btn');
      expect(drawBtn.title).toBe(window.Vectura.CONTEXT_BAR.buttons.draw.tooltip);
      expect(drawBtn.querySelector('.ctxbar-label')?.textContent).toBe(window.Vectura.CONTEXT_BAR.buttons.draw.label);
      // Add Layer precedes Draw in DOM order.
      const all = Array.from(host().children);
      expect(all.indexOf(addField.closest('.ctxbar-align-wrap'))).toBeLessThan(all.indexOf(drawBtn));
    });
    test('Add Layer menu matches the sidebar Add Layer menu\'s options', async () => {
      await reset('select');
      const field = host().querySelector('.ctxbar-add-layer-field');
      field.click(); // open the root menu
      await nextFrames();
      const rowLabels = Array.from(host().querySelectorAll('.ctxbar-add-layer-flyout .ctxbar-add-layer-item'))
        .map((n) => n.textContent);
      expect(rowLabels.some((t) => t.includes('Algorithm Layer'))).toBe(true);
      expect(rowLabels).toContain('Mirror Modifier Group');
      expect(rowLabels).toContain('Morph Modifier Group');
      expect(rowLabels).toContain('Empty Layer');
      expect(rowLabels).toContain('Empty Group');
    });
    test('drilling into Algorithm Layer and picking one adds a new layer of that type', async () => {
      await reset('select');
      const before = app.engine.layers.length;
      const field = host().querySelector('.ctxbar-add-layer-field');
      field.click();
      await nextFrames();
      const algoRow = Array.from(host().querySelectorAll('.ctxbar-add-layer-flyout .ctxbar-add-layer-item'))
        .find((n) => n.textContent.includes('Algorithm Layer'));
      algoRow.click(); // drill down
      await nextFrames();
      const item = Array.from(host().querySelectorAll('.ctxbar-add-layer-flyout .lvl-algo-sub-item'))
        .find((n) => n.getAttribute('data-algo-type') === 'spiral');
      expect(item).toBeTruthy();
      item.click();
      await nextFrames();
      expect(app.engine.layers.length).toBe(before + 1);
      const added = app.engine.layers[app.engine.layers.length - 1];
      expect(added.type).toBe('spiral');
      expect([...app.renderer.selectedLayerIds]).toEqual([added.id]);
    });
    test('Empty Layer / Empty Group / Mirror Modifier Group rows add the matching layer', async () => {
      const clickRow = async (label) => {
        await reset('select');
        const before = app.engine.layers.length;
        const field = host().querySelector('.ctxbar-add-layer-field');
        field.click();
        await nextFrames();
        const row = Array.from(host().querySelectorAll('.ctxbar-add-layer-flyout .ctxbar-add-layer-item'))
          .find((n) => n.textContent === label);
        expect(row).toBeTruthy();
        row.click();
        await nextFrames();
        expect(app.engine.layers.length).toBe(before + 1);
        return app.engine.layers[app.engine.layers.length - 1];
      };
      expect((await clickRow('Empty Layer')).groupType).toBe('layer');
      expect((await clickRow('Empty Group')).groupType).toBe('group');
      const mirrorLayer = await clickRow('Mirror Modifier Group');
      expect(mirrorLayer.groupType).toBe('modifier');
      expect(mirrorLayer.modifier?.type).toBe('mirror');
    });
    // Each case below explicitly closes the flyout it opens — the click
    // handler toggles open/closed, and since consecutive idle-state tests
    // reuse the same DOM (no kind change to force a fresh re-render), a
    // flyout left open would flip the NEXT test's click into a close instead.
    const closeAddLayerFlyout = (field) => {
      if (field.getAttribute('aria-expanded') === 'true') field.click();
    };
    test('Add Layer flyout opens downward (caret unrotated) when there is more room below the bar', async () => {
      await reset('select');
      const origH = window.innerHeight;
      const field = host().querySelector('.ctxbar-add-layer-field');
      closeAddLayerFlyout(field);
      const wrap = field.closest('.ctxbar-align-wrap');
      // Bar near the TOP of a 600px viewport — more room below than above.
      wrap.getBoundingClientRect = () => ({ top: 20, bottom: 46, left: 100, right: 260, width: 160, height: 26 });
      Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true });
      field.click();
      await nextFrames();
      const fly = host().querySelector('.ctxbar-add-layer-flyout');
      const caret = field.querySelector('.ctxbar-text-caret');
      expect(fly.classList.contains('ctxbar-flyout-up')).toBe(false);
      expect(caret.classList.contains('ctxbar-caret-up')).toBe(false);
      closeAddLayerFlyout(field);
      Object.defineProperty(window, 'innerHeight', { value: origH, configurable: true });
    });
    test('Add Layer flyout opens upward (caret rotated) when there is more room above the bar', async () => {
      await reset('select');
      const origH = window.innerHeight;
      const field = host().querySelector('.ctxbar-add-layer-field');
      closeAddLayerFlyout(field);
      const wrap = field.closest('.ctxbar-align-wrap');
      // Bar near the BOTTOM of a 600px viewport — more room above than below.
      wrap.getBoundingClientRect = () => ({ top: 560, bottom: 586, left: 100, right: 260, width: 160, height: 26 });
      Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true });
      field.click();
      await nextFrames();
      const fly = host().querySelector('.ctxbar-add-layer-flyout');
      const caret = field.querySelector('.ctxbar-text-caret');
      expect(fly.classList.contains('ctxbar-flyout-up')).toBe(true);
      expect(caret.classList.contains('ctxbar-caret-up')).toBe(true);
      closeAddLayerFlyout(field);
      Object.defineProperty(window, 'innerHeight', { value: origH, configurable: true });
    });
    test('the caret points the right direction before ever opening the dropdown (regression: hard refresh with the bar near the bottom left it pointing down)', async () => {
      await reset('select');
      const origH = window.innerHeight;
      const field = host().querySelector('.ctxbar-add-layer-field');
      closeAddLayerFlyout(field); // known-closed baseline
      const wrap = field.closest('.ctxbar-align-wrap');
      const caret = field.querySelector('.ctxbar-text-caret');
      // Bar sits near the BOTTOM of a 600px viewport — but the dropdown is
      // never clicked/opened, mirroring a fresh page load with a pinned
      // low position: nothing should need to be opened first.
      wrap.getBoundingClientRect = () => ({ top: 560, bottom: 586, left: 100, right: 260, width: 160, height: 26 });
      Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true });
      await nextFrames(); // let the RAF-driven reanchor() tick run — no click
      expect(field.getAttribute('aria-expanded')).toBe('false'); // still closed
      expect(caret.classList.contains('ctxbar-caret-up')).toBe(true);
      Object.defineProperty(window, 'innerHeight', { value: origH, configurable: true });
    });
    test('Add Layer flyout direction updates live while the bar is dragged by its handle', async () => {
      await reset('select');
      const origH = window.innerHeight;
      Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true });
      const field = host().querySelector('.ctxbar-add-layer-field');
      closeAddLayerFlyout(field);
      const wrap = field.closest('.ctxbar-align-wrap');
      let mockRect = { top: 20, bottom: 46, left: 100, right: 260, width: 160, height: 26 };
      wrap.getBoundingClientRect = () => mockRect;
      field.click(); // opens downward — near the top
      await nextFrames();
      const fly = host().querySelector('.ctxbar-add-layer-flyout');
      const caret = field.querySelector('.ctxbar-text-caret');
      expect(fly.classList.contains('ctxbar-flyout-up')).toBe(false);

      // Grabbing the drag handle must NOT dismiss the open flyout (regression
      // for treating the handle like any other "outside click"), and the
      // pointermove handler that moves the bar must re-flip the still-open
      // flyout live as the bar crosses toward the bottom of the viewport.
      const handle = document.querySelector('.ctxbar-handle');
      handle.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 30, button: 0 }));
      expect(fly.classList.contains('is-open')).toBe(true); // handle grab alone doesn't close it

      mockRect = { top: 560, bottom: 586, left: 100, right: 260, width: 160, height: 26 };
      window.dispatchEvent(new window.MouseEvent('pointermove', { bubbles: true, clientX: 100, clientY: 570 }));

      expect(fly.classList.contains('is-open')).toBe(true); // still open, never closed
      expect(fly.classList.contains('ctxbar-flyout-up')).toBe(true);
      expect(caret.classList.contains('ctxbar-caret-up')).toBe(true);

      window.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true }));
      closeAddLayerFlyout(field);
      Object.defineProperty(window, 'innerHeight', { value: origH, configurable: true });
    });
  });

  // ── TB-4 single path/shape ──────────────────────────────────────────
  describe('TB-4 — single path/shape', () => {
    test('single path/shape layer shows Edit Path + lock, NO stroke entry (weight is per-pen now)', async () => {
      await reset('select');
      // A genuine manual path (type 'shape') keeps the single-path state;
      // drawable generator layers route to single-algo (see TB-4b below).
      const layer = addLayer('wavetable');
      layer.type = 'shape';
      select([layer.id]);
      await nextFrames();
      expect(['single-path', 'single-shape']).toContain(CB.getContext().kind);
      const titles = btnTitles();
      expect(titles).toContain(window.Vectura.CONTEXT_BAR.buttons.editPath.tooltip);
      expect(titles).toContain(window.Vectura.CONTEXT_BAR.buttons.lock.tooltip);
      // Per-pen stroke weight replaced the standalone stroke-weight sub-mode.
      expect(titles).not.toContain(window.Vectura.CONTEXT_BAR.buttons.stroke.tooltip);
      if (window.Vectura.UI.PenPicker) {
        expect(host().querySelector('.pen-chip')).toBeTruthy();
      }
    });
    test('Edit Path switches to the Direct Selection tool (flips to TB-6)', async () => {
      await reset('select');
      const layer = addLayer('wavetable');
      layer.type = 'shape'; // single-path state hosts Edit Path
      select([layer.id]);
      await nextFrames();
      const edit = Array.from(host().querySelectorAll('.ctxbar-btn'))
        .find((b) => b.title === window.Vectura.CONTEXT_BAR.buttons.editPath.tooltip);
      edit.click();
      await nextFrames();
      expect(app.renderer.activeTool).toBe('direct');
      expect(CB.getContext().kind).toBe('direct');
    });
    test('lock toggle flips the layer lock and the icon', async () => {
      await reset('select');
      const layer = addLayer('wavetable');
      select([layer.id]);
      await nextFrames();
      const lockBtn = Array.from(host().querySelectorAll('.ctxbar-btn'))
        .find((b) => b.title === window.Vectura.CONTEXT_BAR.buttons.lock.tooltip);
      lockBtn.click();
      await nextFrames();
      expect(app.renderer.isLayerLocked(layer.id)).toBe(true);
    });
  });

  // ── TB-4b single drawable-algorithm layer ───────────────────────────
  describe('TB-4b — single algorithm layer', () => {
    test('a generator layer routes to single-algo with Expand (not Edit Path)', async () => {
      await reset('select');
      const layer = addLayer('wavetable');
      select([layer.id]);
      await nextFrames();
      expect(CB.getContext().kind).toBe('single-algo');
      const titles = btnTitles();
      expect(titles).toContain(window.Vectura.CONTEXT_BAR.buttons.expand.tooltip);
      expect(titles).toContain(window.Vectura.CONTEXT_BAR.buttons.randomize.tooltip);
      expect(titles).toContain(window.Vectura.CONTEXT_BAR.buttons.lock.tooltip);
      // Edit Path is intentionally absent — a generator emits many paths.
      expect(titles).not.toContain(window.Vectura.CONTEXT_BAR.buttons.editPath.tooltip);
      // The algorithm switcher pill is present and reflects the current algo.
      expect(host().querySelector('.ctxbar-algo-field')).toBeTruthy();
    });
    test('Expand converts the generator into an editable group', async () => {
      await reset('select');
      const layer = addLayer('wavetable');
      select([layer.id]);
      await nextFrames();
      const expandBtn = Array.from(host().querySelectorAll('.ctxbar-btn'))
        .find((b) => b.title === window.Vectura.CONTEXT_BAR.buttons.expand.tooltip);
      expect(expandBtn).toBeTruthy();
      expandBtn.click();
      await nextFrames();
      const expanded = app.engine.layers.find((l) => l.id === layer.id);
      expect(expanded.isGroup).toBe(true);
    });
    test('switching the algorithm pill changes the layer type', async () => {
      await reset('select');
      const layer = addLayer('wavetable');
      select([layer.id]);
      await nextFrames();
      const field = host().querySelector('.ctxbar-algo-field');
      field.click(); // open the switcher flyout
      await nextFrames();
      const item = Array.from(host().querySelectorAll('.ctxbar-algo-flyout .lvl-algo-sub-item'))
        .find((n) => n.textContent && n.textContent.toLowerCase().includes('spiral'));
      if (item) {
        item.click();
        await nextFrames();
        expect(app.engine.layers.find((l) => l.id === layer.id).type).not.toBe('wavetable');
      }
    });
    test('the algorithm switcher renders the same icon-labeled rows as the Add Layer submenu and module dropdown', async () => {
      await reset('select');
      const layer = addLayer('wavetable');
      select([layer.id]);
      await nextFrames();
      // The closed pill shows the current algorithm's icon (matches gm-current-icon).
      const field = host().querySelector('.ctxbar-algo-field');
      expect(field.querySelector('.lvl-algo-sub-ico svg')).toBeTruthy();
      field.click(); // open the switcher flyout
      await nextFrames();
      const rows = Array.from(host().querySelectorAll('.ctxbar-algo-flyout .lvl-algo-sub-item'));
      expect(rows.length).toBeGreaterThan(1);
      // Every row carries the same icon/color markup as Icons.layer + getAlgoMenuColor.
      rows.forEach((row) => expect(row.querySelector('.lvl-algo-sub-ico svg')).toBeTruthy());
      // Grouped under the same section headers (algo-group-div) as the other pickers.
      expect(host().querySelectorAll('.ctxbar-algo-flyout .algo-group-div').length).toBeGreaterThan(0);
    });
    test('the die button rerolls the full param set (same as Algorithm Configuration Randomize), not just the seed', async () => {
      await reset('select');
      const layer = addLayer('wavetable'); // seed: 0 — a "seeded" layer, the case the old bug mis-routed
      select([layer.id]);
      await nextFrames();
      const seedBtn = document.getElementById('btn-rand-seed');
      const paramsBtn = document.getElementById('btn-randomize-params');
      expect(paramsBtn).toBeTruthy();
      let seedCalled = false;
      let paramsCalled = false;
      const origSeedOnclick = seedBtn && seedBtn.onclick;
      const origParamsOnclick = paramsBtn.onclick;
      if (seedBtn) {
        seedBtn.onclick = function (...args) { seedCalled = true; return origSeedOnclick.apply(this, args); };
      }
      paramsBtn.onclick = function (...args) { paramsCalled = true; return origParamsOnclick.apply(this, args); };
      try {
        const randBtn = Array.from(host().querySelectorAll('.ctxbar-btn'))
          .find((b) => b.title === window.Vectura.CONTEXT_BAR.buttons.randomize.tooltip);
        expect(randBtn).toBeTruthy();
        randBtn.click();
        await nextFrames();
      } finally {
        if (seedBtn) seedBtn.onclick = origSeedOnclick;
        paramsBtn.onclick = origParamsOnclick;
      }
      expect(paramsCalled).toBe(true);
      expect(seedCalled).toBe(false);
    });
  });

  // ── TB-5 multi / group ──────────────────────────────────────────────
  describe('TB-5 — multi-selection & group', () => {
    test('multi-selection shows Group + Align (no standalone stroke entry)', async () => {
      await reset('select');
      const a = addLayer('wavetable');
      const b = addLayer('wavetable');
      select([a.id, b.id]);
      await nextFrames();
      expect(CB.getContext().kind).toBe('multi');
      const titles = btnTitles();
      expect(titles).toContain(window.Vectura.CONTEXT_BAR.buttons.group.tooltip);
      expect(host().querySelector('.ctxbar-align-wrap')).toBeTruthy();
      expect(titles).not.toContain(window.Vectura.CONTEXT_BAR.buttons.stroke.tooltip);
    });
    test('Align flyout opens and lists the align/distribute actions', async () => {
      await reset('select');
      const a = addLayer('wavetable');
      const b = addLayer('wavetable');
      select([a.id, b.id]);
      await nextFrames();
      const alignBtn = host().querySelector('.ctxbar-align-wrap .ctxbar-btn');
      alignBtn.click();
      const fly = host().querySelector('.ctxbar-align-flyout');
      expect(fly.classList.contains('is-open')).toBe(true);
      // 6 align + MSC-2 alignCenterBoth (Phase 3) + 2 distribute = 9 actions.
      expect(fly.querySelectorAll('.ctxbar-align-btn').length).toBe(9);
    });
    test('grouping swaps the bar to the group state (Ungroup + Isolate)', async () => {
      await reset('select');
      const a = addLayer('wavetable');
      const b = addLayer('wavetable');
      select([a.id, b.id]);
      await nextFrames();
      app.ui.groupSelection();
      await nextFrames();
      expect(CB.getContext().kind).toBe('group');
      const titles = btnTitles();
      expect(titles).toContain(window.Vectura.CONTEXT_BAR.buttons.ungroup.tooltip);
      expect(titles).toContain(window.Vectura.CONTEXT_BAR.buttons.isolate.tooltip);
    });
  });

  // ── TB-6 direct / anchor ────────────────────────────────────────────
  describe('TB-6 — Direct Selection state', () => {
    test('direct tool shows Simplify + Smooth + 6 anchor verbs (visible but disabled)', async () => {
      await reset('select');
      const layer = addLayer('wavetable');
      select([layer.id]);
      app.renderer.setTool('direct');
      await nextFrames();
      expect(CB.getContext().kind).toBe('direct');
      const titles = btnTitles();
      expect(titles).toContain(window.Vectura.CONTEXT_BAR.buttons.simplify.tooltip);
      expect(titles).toContain(window.Vectura.CONTEXT_BAR.buttons.smooth.tooltip);
      const verbs = host().querySelectorAll('.ctxbar-anchor-verb');
      expect(verbs.length).toBe(6);
      // No anchors selected → all disabled with reason tooltips.
      verbs.forEach((v) => expect(v.disabled).toBe(true));
    });
  });

  // ── TB-7 text ───────────────────────────────────────────────────────
  describe('TB-7 — text layer state', () => {
    const makeText = () => {
      const layer = addLayer('wavetable');
      layer.type = 'text';
      layer.params = { ...(layer.params || {}), fontFamily: 'Inter', fontStyle: 'Regular', fontSize: 24 };
      return layer;
    };
    test('single text layer shows family/style/size controls + Outline', async () => {
      await reset('select');
      const layer = makeText();
      select([layer.id]);
      await nextFrames();
      expect(CB.getContext().kind).toBe('single-text');
      expect(host().querySelector('.ctxbar-text-family')).toBeTruthy();
      expect(host().querySelector('.ctxbar-text-size')).toBeTruthy();
      const titles = btnTitles();
      expect(titles).toContain(window.Vectura.CONTEXT_BAR.buttons.outlineText.tooltip);
    });
    test('editing the size field propagates to the layer param', async () => {
      await reset('select');
      const layer = makeText();
      select([layer.id]);
      await nextFrames();
      const size = host().querySelector('.ctxbar-text-size');
      size.value = '48';
      size.dispatchEvent(new window.Event('change', { bubbles: true }));
      await nextFrames();
      expect(Number(layer.params.fontSize)).toBe(48);
    });
    test('family/style chips route wayfinding to the real Text panel (active layer + pulse), no phantom methods', async () => {
      await reset('select');
      const layer = makeText();
      select([layer.id]);
      await nextFrames();
      app.engine.activeLayerId = null;
      const family = host().querySelector('.ctxbar-text-family');
      family.click();
      // Makes the text layer active so its controls render in the Text panel…
      expect(app.engine.activeLayerId).toBe(layer.id);
      // …and pulses that docked panel (config-owned selector).
      const sel = window.Vectura.CONTEXT_BAR.textPanel.selector;
      expect(document.querySelector(sel).classList.contains('ctxbar-pulse')).toBe(true);
    });
    test('bar hides while a text caret editing session is active', async () => {
      await reset('select');
      const layer = makeText();
      select([layer.id]);
      await nextFrames();
      const orig = app.textEdit && app.textEdit.isActive;
      if (app.textEdit) app.textEdit.isActive = () => true;
      await nextFrames();
      expect(bar().classList.contains('is-visible')).toBe(false);
      if (app.textEdit) app.textEdit.isActive = orig;
      await nextFrames();
    });
  });

  // ── TB-1 lifecycle ──────────────────────────────────────────────────
  describe('TB-1 — lifecycle (hide during drag)', () => {
    test('bar hides during a canvas drag and reappears on release', async () => {
      await reset('select');
      const layer = addLayer('wavetable');
      select([layer.id]);
      await nextFrames();
      expect(bar().classList.contains('is-visible')).toBe(true);
      const canvas = document.getElementById('main-canvas');
      canvas.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 100, button: 0 }));
      canvas.dispatchEvent(new window.MouseEvent('pointermove', { bubbles: true, clientX: 140, clientY: 140, button: 0 }));
      await nextFrames();
      expect(bar().classList.contains('is-visible')).toBe(false);
      window.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true, clientX: 140, clientY: 140 }));
      await nextFrames();
      expect(bar().classList.contains('is-visible')).toBe(true);
    });
  });

  // ── TB-2 overflow & management ──────────────────────────────────────
  describe('TB-2 — overflow menu & management', () => {
    test('overflow menu has exactly the five spec items in order (panel collapsed)', async () => {
      await reset('select');
      // Show Properties panel only appears while the docked panel needs
      // restoring — collapse it so the full five-item menu renders.
      document.getElementById('right-pane').classList.add('pane-collapsed');
      openOverflow();
      const items = Array.from(document.querySelectorAll('.ctxbar-menu-item')).map((n) => n.textContent);
      expect(items).toEqual([
        'Show Properties panel', 'Hide bar', 'Reset bar position', 'Pin bar position', 'Quick help',
      ]);
      openOverflow(); // close
      document.getElementById('right-pane').classList.remove('pane-collapsed');
    });
    test('Pin freezes the bar and persists; Reset restores auto-anchor', async () => {
      await reset('select');
      const layer = addLayer('wavetable');
      select([layer.id]);
      await nextFrames();
      openOverflow();
      Array.from(document.querySelectorAll('.ctxbar-menu-item')).find((n) => n.textContent === 'Pin bar position').click();
      expect(SETTINGS.contextBar.pinned).toBe(true);
      const saved = JSON.parse(window.localStorage.getItem('vectura-context-bar'));
      expect(saved.pinned).toBe(true);
      openOverflow();
      Array.from(document.querySelectorAll('.ctxbar-menu-item')).find((n) => n.textContent === 'Reset bar position').click();
      expect(SETTINGS.contextBar.pinned).toBe(false);
    });
    test('Hide bar turns off the visibility preference', async () => {
      await reset('select');
      const layer = addLayer('wavetable');
      select([layer.id]);
      await nextFrames();
      openOverflow();
      Array.from(document.querySelectorAll('.ctxbar-menu-item')).find((n) => n.textContent === 'Hide bar').click();
      await nextFrames();
      expect(SETTINGS.contextBarEnabled).toBe(false);
      expect(bar().classList.contains('is-visible')).toBe(false);
    });
    test('Show panel adds the attention pulse to the docked panel', async () => {
      await reset('select');
      document.getElementById('right-pane').classList.add('pane-collapsed');
      openOverflow();
      Array.from(document.querySelectorAll('.ctxbar-menu-item')).find((n) => n.textContent === 'Show Properties panel').click();
      expect(document.querySelector('#right-pane').classList.contains('ctxbar-pulse')).toBe(true);
    });
  });

  // ── TB-2b — Show Properties panel gating (collapsed/shrunk only) ─────
  describe('TB-2b — Show Properties panel only offered while the panel needs restoring', () => {
    const rightPane = () => document.getElementById('right-pane');
    const menuLabels = () => Array.from(document.querySelectorAll('.ctxbar-menu-item')).map((n) => n.textContent);
    const findItem = () => Array.from(document.querySelectorAll('.ctxbar-menu-item'))
      .find((n) => n.textContent === 'Show Properties panel');

    const cleanPaneState = () => {
      // Close a still-open menu and undo any pane collapse/shrink a test made.
      if (document.querySelector('.ctxbar-menu.is-open')) openOverflow();
      rightPane().classList.remove('pane-collapsed', 'pane-force-open');
      document.documentElement.style.removeProperty('--pane-right-width');
      document.body.classList.remove('auto-collapsed');
    };
    beforeEach(cleanPaneState);
    afterEach(cleanPaneState);

    test('item is hidden while the properties panel is at full size', async () => {
      await reset('select');
      openOverflow();
      expect(menuLabels()).not.toContain('Show Properties panel');
      // The rest of the management menu is still there.
      expect(menuLabels()).toContain('Hide bar');
    });

    test('collapsed panel → item shows; clicking restores (un-collapses) and pulses', async () => {
      await reset('select');
      rightPane().classList.add('pane-collapsed');
      SETTINGS.rightPaneCollapsed = true;
      openOverflow();
      const item = findItem();
      expect(item).toBeTruthy();
      item.click();
      expect(rightPane().classList.contains('pane-collapsed')).toBe(false);
      expect(SETTINGS.rightPaneCollapsed).toBe(false);
      expect(rightPane().classList.contains('ctxbar-pulse')).toBe(true);
    });

    test('shrunk panel → item shows; clicking restores the skin-default width and pulses', async () => {
      await reset('select');
      // Simulate a resizer drag that narrowed the pane below the skin default.
      document.documentElement.style.setProperty('--pane-right-width', '200px');
      SETTINGS.paneRightWidth = 200;
      openOverflow();
      const item = findItem();
      expect(item).toBeTruthy();
      item.click();
      const w = parseFloat(document.documentElement.style.getPropertyValue('--pane-right-width'));
      expect(w).toBeGreaterThan(200); // back to the skin/default width
      expect(SETTINGS.paneRightWidth).toBe(w);
      expect(rightPane().classList.contains('ctxbar-pulse')).toBe(true);
    });

    test('restoring a collapsed panel does not clobber a user-widened width', async () => {
      await reset('select');
      // Wider than default, then collapsed: restore should only un-collapse.
      document.documentElement.style.setProperty('--pane-right-width', '480px');
      SETTINGS.paneRightWidth = 480;
      rightPane().classList.add('pane-collapsed');
      openOverflow();
      findItem().click();
      expect(rightPane().classList.contains('pane-collapsed')).toBe(false);
      expect(parseFloat(document.documentElement.style.getPropertyValue('--pane-right-width'))).toBe(480);
      expect(SETTINGS.paneRightWidth).toBe(480);
    });
  });

  // ── TB-8 preference, ARIA, focus ────────────────────────────────────
  describe('TB-8 — preference, ARIA, focus', () => {
    test('Document Setup "Contextual task bar" toggle gates rendering', async () => {
      await reset('select');
      expect(bar().classList.contains('is-visible')).toBe(true);
      CB.setEnabled(false);
      await nextFrames();
      expect(bar().classList.contains('is-visible')).toBe(false);
      CB.setEnabled(true);
      await nextFrames();
      expect(bar().classList.contains('is-visible')).toBe(true);
    });
    test('bar is an ARIA toolbar with roving tabindex', async () => {
      await reset('select');
      expect(bar().getAttribute('role')).toBe('toolbar');
      const roving = Array.from(bar().querySelectorAll('[data-ctxbar-roving]')).filter((n) => !n.disabled);
      const zero = roving.filter((n) => n.getAttribute('tabindex') === '0');
      expect(zero.length).toBe(1);
      expect(roving.slice(1).every((n) => n.getAttribute('tabindex') === '-1')).toBe(true);
    });
    test('appearance never steals focus', async () => {
      await reset('select');
      CB.setEnabled(false);
      await nextFrames();
      const probe = document.getElementById('main-canvas');
      probe.focus?.();
      const before = document.activeElement;
      CB.setEnabled(true);
      await nextFrames();
      expect(document.activeElement).toBe(before);
    });
  });

  // ── contract surface (for Lane H) ───────────────────────────────────
  describe('contract surface', () => {
    test('exposes getContentHost/restoreState/getContext/anchorRectForBar/setBusy', () => {
      ['getContentHost', 'restoreState', 'getContext', 'anchorRectForBar', 'setBusy'].forEach((m) => {
        expect(typeof CB[m]).toBe('function');
      });
    });
    test('setBusy(true) suspends G content re-render; restoreState re-renders', async () => {
      await reset('select');
      const layer = addLayer('wavetable');
      select([layer.id]);
      await nextFrames();
      CB.setBusy(true);
      host().innerHTML = '<button class="submode-marker">sub</button>';
      // A context tick must NOT clobber the sub-mode content while busy.
      select([layer.id]);
      await nextFrames();
      expect(host().querySelector('.submode-marker')).toBeTruthy();
      CB.setBusy(false);
      await nextFrames();
      expect(host().querySelector('.submode-marker')).toBeFalsy();
      expect(host().querySelector('.ctxbar-btn')).toBeTruthy();
    });
    test('dispatches vectura:contextbar-state on state change', async () => {
      await reset('select');
      let got = null;
      document.addEventListener('vectura:contextbar-state', (e) => { got = e.detail; });
      const layer = addLayer('wavetable');
      select([layer.id]);
      await nextFrames();
      expect(got).toBeTruthy();
      expect(['single-path', 'single-shape', 'single-algo']).toContain(got.kind);
    });
  });
});
