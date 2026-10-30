/*
 * Start Page P1 review fixes (second pass): SVG allowlist sanitizer + margin coercion (XSS), the cached live-canvas
 * SVG for the rail, renderer isolation (pristine defaults in, in-place restore out), the idle queue, the thumbs
 * cache key, and the Settings Escape contract. Real App through the runtime loader; ink canvases are stubbed
 * (jsdom has no 2D canvas) except where the sanitizer itself is under test.
 */
const fs = require('fs');
const path = require('path');
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const FULL_STACK = { includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true };
const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));
const clone = (v) => JSON.parse(JSON.stringify(v));
const ATTACKS_DIR = path.resolve(__dirname, '../../fixtures/svg-attacks');

// The review payloads (each used to survive the regex blocklist).
const REVIEW_PAYLOADS = [
  '<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><path d="M0 0L10 10"/><img src="x"onerror="window.__x.push(1)"/></svg>',
  '<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><path d="M0 0L10 10"/><a href="javascript:window.__x.push(2)"><path id="lnk2" d="M0 0L5 5"/></a></svg>',
  '<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><path d="M0 0L10 10"/><svg onload="window.__x.push(3)"/></svg>',
  '<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><path d="M0 0L10 10"/><animate attributeName="x"/><a id="lnk4"><set attributeName="href" to="javascript:window.__x.push(4)"/><path d="M0 0L5 5"/></a></svg>',
  '<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><path d="M0 0L10 10" onclick="window.__x.push(5)" style="fill:url(javascript:1)"/><foreignObject><iframe xmlns="http://www.w3.org/1999/xhtml" srcdoc="x"/></foreignObject></svg>',
  // not well-formed XML: must yield nothing, never leak through a tolerant HTML parse
  '<svg viewBox="0 0 10 10"><path d="M0 0L10 10"/><img src="x"onerror=window.__x.push(6)></svg>',
  '<svg viewBox="0 0 10 10"><path d="M0 0L10 10"/></svg><details open ontoggle=window.__x.push(7)>',
  '<svg viewBox="0 0 10 10"><path d="M0 0L10 10"/><style/><img src=x onerror=window.__x.push(8)>-->',
];

const ALLOWED_TAGS = new Set(['svg', 'g', 'path', 'polyline', 'polygon', 'line', 'circle', 'ellipse', 'rect', 'defs', 'clippath', 'title', 'lineargradient', 'stop']);

describe('Start Page P1 review fixes', () => {
  let runtime; let window; let document; let V; let app;

  const boot = async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    V = window.Vectura;
    window.__x = [];
    app = window.app = new V.App();
    await tick();
  };
  afterEach(() => {
    try { app?.startPage?.hide?.({ restoreFocus: false }); } catch (_) { /* noop */ }
    runtime?.cleanup?.();
    runtime = null;
  });

  describe('1. SVG allowlist sanitizer', () => {
    const scan = (root) => {
      const bad = [];
      root.querySelectorAll('*').forEach((el) => {
        if (!ALLOWED_TAGS.has(el.localName.toLowerCase())) bad.push(`<${el.localName}>`);
        [...el.attributes].forEach((a) => {
          const n = a.name.toLowerCase();
          if (n.startsWith('on') || n === 'href' || n === 'xlink:href') bad.push(`${el.localName}@${n}`);
          if (/javascript:|<|&#/i.test(a.value)) bad.push(`${el.localName}@${n}=${a.value}`);
          if (n === 'style' && !/^(--sp-w:[\d.]+|stop-color:var\(--sp-ink2?(,var\(--sp-ink\))?\));?$/.test(a.value.trim())) bad.push(`style=${a.value}`);
        });
      });
      return bad;
    };

    test('the review payloads and the whole svg-attacks corpus leave nothing executable in the DOM', async () => {
      await boot();
      expect(typeof V.StartPageInk.safeSvg).toBe('function');
      const corpus = fs.readdirSync(ATTACKS_DIR).filter((f) => f.endsWith('.svg')).map((f) => fs.readFileSync(path.join(ATTACKS_DIR, f), 'utf8'));
      const host = document.createElement('div');
      document.body.appendChild(host);
      [...REVIEW_PAYLOADS, ...corpus].forEach((src, i) => {
        const node = V.StartPageInk.safeSvg(src, `g${i}`);
        if (node) host.appendChild(node);
      });
      expect(scan(host)).toEqual([]);
      expect(host.querySelector('img,script,iframe,foreignObject,a,animate,set,use,image,style')).toBeNull();
      expect(window.__x).toEqual([]);
      expect(host.innerHTML).not.toMatch(/javascript:|onerror|onload|onclick/i);
    });

    test('a real export keeps its strokes, widths and colors; the root is restyled for the page', async () => {
      await boot();
      const src = '<?xml version="1.0" standalone="no"?><svg width="297mm" height="210mm" viewBox="0 0 297 210" xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="c"><rect x="1" y="1" width="5" height="5"/></clipPath></defs><g id="pen_1" stroke="#111" fill="none"><g id="L-1" stroke-width="0.600" stroke-linecap="round" clip-path="url(#c)"><path d="M 1 1 L 5 5"/><polyline points="1,1 2,2"/><circle cx="3" cy="3" r="1"/></g></g></svg>';
      const svg = V.StartPageInk.safeSvg(src, 'gid1');
      expect(svg.localName).toBe('svg');
      expect(svg.getAttribute('class')).toBe('sp-ink-svg');
      expect(svg.getAttribute('viewBox')).toBe('0 0 297 210');
      expect(svg.hasAttribute('width')).toBe(false);
      expect(svg.querySelectorAll('path,polyline,circle').length).toBe(3);
      const inner = svg.querySelector('#L-1');
      expect(inner.getAttribute('stroke-linecap')).toBe('round');
      expect(inner.getAttribute('clip-path')).toBe('url(#c)');
      expect(inner.style.getPropertyValue('--sp-w')).toBe('2.000');
      expect(svg.querySelector('linearGradient#gid1')).not.toBeNull();
    });

    test('clip-path may only point at a local fragment', async () => {
      await boot();
      const node = V.StartPageInk.safeSvg('<svg viewBox="0 0 1 1" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(http://evil.test/x.svg#a)"><path d="M0 0L1 1"/></g><g clip-path="url(#ok)"><path d="M0 0L1 1"/></g></svg>', 'g');
      const clips = [...node.querySelectorAll('g')].map((g) => g.getAttribute('clip-path'));
      expect(clips).toEqual([null, 'url(#ok)']);
    });
  });

  describe('1b. margin is a number everywhere it reaches the export string', () => {
    const PAYLOAD = '1"/><img src=x onerror="window.__x.push(9)"><rect x="';

    test('ExportSvgBuilder never interpolates a non-numeric margin', async () => {
      await boot();
      const { SETTINGS, ExportSvgBuilder: B } = V;
      app.engine.layers.length = 0;
      app.engine.addShapeLayer('Zig', [[{ x: 20, y: 20 }, { x: 60, y: 60 }, { x: 100, y: 20 }]]);
      Object.assign(SETTINGS, { cropExports: false, removeHiddenGeometry: false, truncate: true, margin: PAYLOAD });
      const svg = B.buildSvgDocument(B.buildExportSnapshot(app.engine, { computeDisplayGeometry: () => app.computeDisplayGeometry() }));
      expect(svg).toContain('id="margin-clip"');
      expect(svg).not.toMatch(/<img|onerror/);
      const doc = new window.DOMParser().parseFromString(svg, 'image/svg+xml');
      expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
      expect(doc.querySelector('clipPath rect').getAttribute('x')).toMatch(/^-?\d+(\.\d+)?$/);
    });

    test('app.applyState coerces settings.margin', async () => {
      await boot();
      const state = clone(app.captureState());
      state.settings.margin = PAYLOAD;
      app.applyState(state);
      expect(typeof V.SETTINGS.margin).toBe('number');
      expect(Number.isFinite(V.SETTINGS.margin)).toBe(true);
      state.settings.margin = '12';
      app.applyState(state);
      expect(V.SETTINGS.margin).toBe(12);
    });

    test('the Start Page renderer coerces a crafted document margin and its SVG stays inert', async () => {
      await boot();
      const e = new V.VectorEngine();
      e.addShapeLayer('Zig', [[{ x: 20, y: 20 }, { x: 60, y: 60 }, { x: 100, y: 20 }]]);
      const doc = { type: 'vectura', state: { engine: e.exportState(), settings: { paperSize: 'a5', margin: PAYLOAD, truncate: true, cropExports: false, removeHiddenGeometry: false, pens: [{ id: 'pen-1', name: 'P', color: '#336699', width: 0.4 }] } }, images: {} };
      const out = await V.StartPageArtRenderer.renderDocument(doc);
      expect(out.svg).not.toMatch(/<img|onerror/);
      const node = V.StartPageInk.safeSvg(out.svg, 'gx');
      expect(node).not.toBeNull();
      expect(node.querySelector('img')).toBeNull();
    });
  });

  describe('3. the rail does not rebuild the live canvas export on every recolor', () => {
    test('show + several mode switches / randomize / theme flips build the SVG at most once; a document change rebuilds', async () => {
      await boot();
      V.StartPageArtSource = { list: async () => [], listRecentFirst: async () => [], subscribe: () => () => {} };
      app.engine.addLayer('wavetable');
      app.pushHistory();
      const real = app.ui.buildSvgDocument.bind(app.ui);
      let builds = 0;
      app.ui.buildSvgDocument = (...a) => { builds += 1; return real(...a); };
      app.startPage.show();
      await tick(80);
      const afterShow = builds;
      expect(afterShow).toBeGreaterThanOrEqual(1);
      const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
      const sp = document.getElementById('start-page');
      ['mono', 'basic', 'wildcard', 'curated', 'mono'].forEach((m) => click(sp.querySelector(`[data-sp-mode="${m}"]`)));
      click(sp.querySelector('#sp-dice'));
      click(sp.querySelector('[data-act="theme"]'));
      await tick(120);
      expect(builds).toBe(afterShow);
      expect(builds).toBeLessThanOrEqual(1);
      // the document changes while the page is up (history grows): the next refresh rebuilds
      app.engine.addLayer('rings');
      app.pushHistory();
      click(sp.querySelector('[data-sp-mode="basic"]'));
      await tick(60);
      expect(builds).toBe(afterShow + 1);
    });
  });

  describe('4. idle queue + thumbs cache key', () => {
    test('the renderer queue schedules on requestIdleCallback without a forcing timeout and yields between jobs', async () => {
      await boot();
      const calls = [];
      window.requestIdleCallback = (fn, opts) => { calls.push(opts); return setTimeout(() => fn({ didTimeout: false, timeRemaining: () => 50 }), 0); };
      const preset = V.PRESETS.find((p) => p.id === 'lissajous-star');
      await V.StartPageArtRenderer.renderPreset(preset);
      expect(calls.length).toBeGreaterThan(0);
      calls.forEach((o) => expect(o && o.timeout).toBeUndefined());
    });

    test('the thumbs cache is keyed by the content of the piece, not by the app version', async () => {
      await boot();
      const store = new Map();
      const cache = (version) => V.StartPageArtSource.createCache
        ? V.StartPageArtSource.createCache(() => null, version) : null;
      expect(cache).toBeTruthy();
      const preset = V.PRESETS.find((p) => p.id === 'lissajous-star');
      let renders = 0;
      const renderer = { renderPreset: async () => { renders += 1; return { svg: '<svg viewBox="0 0 1 1"><path d="M0 0L1 1"/></svg>', ownColors: null, algorithm: 'lissajous', bytes: 10 }; }, renderDocument: async () => ({}) };
      const mk = (version, preset2) => V.StartPageArtSource.create({
        store: { listWorks: async () => [] }, renderer, version, presets: [preset2 || preset],
        picks: { STUDIO_PICKS: [(preset2 || preset).id], PICK_NAMES: {}, collectionFor: () => 'Studies' }, cache: shared,
      });
      const shared = V.StartPageArtSource.createCache(() => null, 'cache-owner');
      const a = await mk('1.0.1').list();
      await a[0].getSvg();
      expect(renders).toBe(1);
      const b = await mk('1.0.2').list();
      await b[0].getSvg();
      expect(renders).toBe(1); // a patch release does not re-render
      const changed = { ...preset, params: { ...preset.params, __touched: 1 } };
      const c = await mk('1.0.2', changed).list();
      await c[0].getSvg();
      expect(renders).toBe(2); // different content does
      void store;
    });
  });

  describe('5. renderer isolation', () => {
    const makeDoc = (settings = {}) => {
      const e = new V.VectorEngine();
      e.addShapeLayer('Zig', [[{ x: 20, y: 20 }, { x: 60, y: 60 }, { x: 100, y: 20 }]]);
      return { type: 'vectura', state: { engine: e.exportState(), settings: { paperSize: 'a5', margin: 5, truncate: true, cropExports: true, removeHiddenGeometry: true, ...settings } }, images: {} };
    };

    test('a document without lightSource / pens / optimizationDefaults renders with pristine defaults, not the live values', async () => {
      await boot();
      const S = V.SETTINGS;
      const pristine = app.defaultSettingsSnapshot;
      S.lightSource = { ...S.lightSource, azimuth: 123.4, __live: true };
      S.pens = [{ id: 'live-pen', name: 'Live', color: '#ff00aa', width: 0.9 }];
      S.optimizationDefaults = { ...(S.optimizationDefaults || {}), __live: true };
      const seen = {};
      const B = V.ExportSvgBuilder;
      const orig = B.buildExportSnapshot;
      B.buildExportSnapshot = (...a) => { seen.light = clone(S.lightSource); seen.pens = clone(S.pens); seen.opt = clone(S.optimizationDefaults); return orig(...a); };
      try {
        const out = await V.StartPageArtRenderer.renderDocument(makeDoc());
        expect(seen.light).toEqual(pristine.lightSource);
        expect(seen.pens).toEqual(pristine.pens);
        expect(seen.opt).toEqual(pristine.optimizationDefaults);
        expect(out.svg).not.toContain('#ff00aa');
      } finally { B.buildExportSnapshot = orig; }
    });

    test('presets also start from pristine defaults', async () => {
      await boot();
      const S = V.SETTINGS;
      S.lightSource = { ...S.lightSource, azimuth: 77.7 };
      const seen = {};
      const B = V.ExportSvgBuilder;
      const orig = B.buildExportSnapshot;
      B.buildExportSnapshot = (...a) => { seen.light = clone(S.lightSource); return orig(...a); };
      try {
        await V.StartPageArtRenderer.renderPreset(V.PRESETS.find((p) => p.id === 'lissajous-star'));
        expect(seen.light).toEqual(app.defaultSettingsSnapshot.lightSource);
      } finally { B.buildExportSnapshot = orig; }
    });

    test('the live SETTINGS is restored in place: same object identities, same content', async () => {
      await boot();
      const S = V.SETTINGS;
      // build the document first: addShapeLayer on a throwaway engine bumps the live globalLayerCount
      const doc = makeDoc({
        lightSource: { azimuth: 200 }, pens: [{ id: 'doc-pen', name: 'Doc', color: '#00aa55', width: 0.5 }], optimizationDefaults: { x: 1 },
      });
      S.lightSource = { ...S.lightSource, azimuth: 33 };
      const refs = { S, pens: S.pens, pen0: S.pens[0], light: S.lightSource, opt: S.optimizationDefaults, paper: S.paper };
      const before = JSON.stringify(S);
      const keys = Object.keys(S).join();
      await V.StartPageArtRenderer.renderDocument(doc);
      await V.StartPageArtRenderer.renderPreset(V.PRESETS.find((p) => p.id === 'lissajous-star'));
      expect(V.SETTINGS).toBe(refs.S);
      expect(S.pens).toBe(refs.pens);
      expect(S.pens[0]).toBe(refs.pen0);
      expect(S.lightSource).toBe(refs.light);
      expect(S.optimizationDefaults).toBe(refs.opt);
      if (refs.paper) expect(S.paper).toBe(refs.paper);
      expect(JSON.parse(JSON.stringify(S))).toEqual(JSON.parse(before));
      expect(Object.keys(S).join()).toBe(keys);
    });

    test('the live SETTINGS is restored in place even when the render throws', async () => {
      await boot();
      const S = V.SETTINGS;
      const doc = makeDoc({ pens: [{ id: 'd', name: 'D', color: '#123456', width: 0.5 }] });
      const refs = { pens: S.pens, light: S.lightSource };
      const before = JSON.stringify(S);
      const keys = Object.keys(S).join();
      const B = V.ExportSvgBuilder;
      const orig = B.buildExportSnapshot;
      B.buildExportSnapshot = () => { throw new Error('boom'); };
      try {
        await expect(V.StartPageArtRenderer.renderDocument(doc)).rejects.toThrow('boom');
      } finally { B.buildExportSnapshot = orig; }
      expect(S.pens).toBe(refs.pens);
      expect(S.lightSource).toBe(refs.light);
      expect(JSON.parse(JSON.stringify(S))).toEqual(JSON.parse(before));
      expect(Object.keys(S).join()).toBe(keys);
    });
  });

  describe('9. Escape on the Settings gear closes only the popover', () => {
    test('Esc with focus on the gear (popover open) closes the popover and keeps the page; a second Esc leaves it', async () => {
      await boot();
      V.StartPageArtSource = { list: async () => [], listRecentFirst: async () => [], subscribe: () => () => {} };
      app.engine.addLayer('wavetable');
      app.startPage.show();
      await tick(60);
      const sp = document.getElementById('start-page');
      const gear = sp.querySelector('#sp-settings-btn');
      gear.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await tick();
      expect(sp.querySelector('#sp-settings').hidden).toBe(false);
      gear.focus();
      const esc = () => gear.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      esc();
      expect(sp.querySelector('#sp-settings').hidden).toBe(true);
      expect(app.startPage.isOpen()).toBe(true);
      expect(document.activeElement).toBe(gear);
      esc();
      expect(app.startPage.isOpen()).toBe(false);
    });
  });
});
