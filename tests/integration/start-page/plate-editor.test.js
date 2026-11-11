/**
 * @vitest-environment jsdom
 *
 * Start Page plate editor (src/ui/start-page/plates/editor.js) + manual colors (plates/colors.js) + special fills
 * (src/core/start-page/plate-fills.js): fields and suggestions, the 16-way layout radiogroup, the grouped colorway
 * picker, manual colors with every special fill, contrast warnings (gradients stop by stop), Basic = Ink only,
 * keyboard framing, store patches through onChange, Undo, and the full keyboard path with focus return.
 */
const fs = require('fs');
const path = require('path');

const SRC = (p) => fs.readFileSync(path.resolve(__dirname, '../../../', p), 'utf8');
const fixture = (n) => fs.readFileSync(path.resolve(__dirname, '../../fixtures/start-page', n), 'utf8');

const FILES = [
  'src/config/palettes.js', 'src/config/papers.js', 'src/config/pen-models.js', 'src/config/defaults.js',
  'src/config/start-page-colorways.js', 'src/core/start-page/colorway.js',
  'src/config/start-page-plate-palette.js', 'src/core/start-page/plate-rhythm.js', 'src/core/start-page/plate-type.js',
  'src/core/start-page/art-geometry.js', 'src/core/start-page/plates-store.js', 'src/config/descriptions.js',
  'src/core/start-page/plate-fills.js', 'src/ui/start-page/plates/colors.js', 'src/ui/start-page/settings.js', 'src/ui/start-page/plates/editor.js',
];

const load = () => {
  vi.resetModules();
  delete window.Vectura;
  window.Vectura = {};
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 0);
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  FILES.forEach((f) => window.eval(SRC(f)));
  return window.Vectura;
};

const svg = fixture('lissajous-trefoil.svg');
const ART = { id: 'w1', name: 'riverbed-rorschach.vectura', algorithm: 'Flowfield · Mirror', collection: 'Studies', svg,
  ownColors: { paper: '#f4efe4', ink: '#1d3a8a', penName: 'Triplus Blue', paperName: 'Cotton rag' } };
const SPECS = [['Paper', 'A3 · 297 × 420 mm'], ['Pen', 'Triplus 0.3 Burnt Sienna'], ['Stock', 'Cotton rag · buff'],
  ['Line', '41.2 m'], ['Strokes', '1,204'], ['Plot time', '2 h 35 min']];
const blank = (over) => Object.assign({ id: 'w1', artId: 'w1', order: 0, hidden: false, layout: null, texts: null, pin: null,
  colors: null, basicColors: null, frame: null, motion: null, removed: false }, over || {});

describe('plate editor', () => {
  let V; let E; let S; let host; let plateEl; let opener; let toasts; let calls; let closed;

  const placedList = (mode) => V.StartPagePlateRhythm.place([{ id: 'a' }, { id: 'w1' }, { id: 'c' }], { mode: mode || 'curated', theme: 'dark' });

  const makePlate = () => {
    const el = document.createElement('article'); el.className = 'spl';
    const tools = document.createElement('div'); tools.setAttribute('data-slot', 'tools');
    opener = document.createElement('button'); opener.setAttribute('data-action', 'edit'); opener.textContent = 'Edit';
    tools.appendChild(opener); el.appendChild(tools);
    const pr = document.createElement('span'); pr.className = 'spl-print'; pr.tabIndex = -1; el.appendChild(pr);
    const parsed = V.StartPageArtGeometry.parseArtSvg(svg);
    const h = { colorway: { paper: '#fff', ink: '#000' }, fit: 'cover', frame: null, parsed, s: 2, win: [0, 0, 100, 100],
      setFrame: vi.fn((f, fit) => { h.frame = f; if (fit) h.fit = fit; }), setColorway: vi.fn((c) => { h.colorway = c; }) };
    pr._spInk = h;
    el._spl = { prints: [{ el: pr, main: true }], crops: [], ko: null, dead: false };
    el._h = h; el._pr = pr;
    host.appendChild(el);
    return el;
  };

  const open = (o) => {
    opener.focus();
    const mode = (o && o.mode) || 'curated';
    const placed = placedList(mode);
    return E.open(plateEl, Object.assign({
      record: blank(), art: ART, mode, index: 1, colorway: placed[1].colorway, placed, specs: SPECS,
      onChange: (p) => calls.push(p), onReset: (k) => calls.push({ reset: k }), onRemove: () => calls.push({ removed: true }),
      onClose: () => { closed += 1; },
    }, o || {}));
  };
  const panel = () => host.querySelector('[data-plate-editor]');
  const $ = (sel) => panel().querySelector(sel);
  const $$ = (sel) => Array.from(panel().querySelectorAll(sel));
  const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  const key = (el, k, o) => el.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, o || {})));
  const setVal = (el, v, type) => { el.value = v; el.dispatchEvent(new Event(type || 'change', { bubbles: true })); };
  const last = () => calls[calls.length - 1];
  const undo = () => { const t = toasts[toasts.length - 1]; t.action.onAction({ disableAction() {} }); };

  beforeEach(() => {
    V = load(); E = V.StartPagePlateEditor; S = V.StartPagePlatesStore;
    document.body.innerHTML = ''; host = document.createElement('div'); document.body.appendChild(host);
    toasts = []; calls = []; closed = 0;
    V.UI = { StartPageSettings: V.UI.StartPageSettings, overlays: { Toast: { show: (p) => { toasts.push(p); return { dismiss() {}, el: document.createElement('div') }; } } } };
    plateEl = makePlate();
  });

  /* ---------------------------------------------------------------- fields and suggestions */
  describe('fields and suggestions', () => {
    it('opens a labelled group next to the plate and returns a handle', () => {
      const h = open();
      expect(typeof h.close).toBe('function');
      expect(panel().getAttribute('role')).toBe('group');
      expect(panel().getAttribute('aria-label')).toMatch(/Edit plate 02/);
    });

    it('word, title and description patch texts on change', () => {
      open();
      setVal($('[data-spe-field="word"]'), 'Riverbed');
      expect(last()).toEqual({ texts: { word: 'Riverbed' } });
      setVal($('[data-spe-field="title"]'), 'Riverbed, A3');
      expect(last()).toEqual({ texts: { title: 'Riverbed, A3' } });
      setVal($('[data-spe-field="description"]'), 'Drift and checks.');
      expect(last()).toEqual({ texts: { description: 'Drift and checks.' } });
    });

    it('an emptied field goes back to Auto (null)', () => {
      open({ record: blank({ texts: { word: 'Hi', title: null, description: null } }) });
      expect($('[data-spe-field="word"]').value).toBe('Hi');
      setVal($('[data-spe-field="word"]'), '  ');
      expect(last()).toEqual({ texts: { word: null } });
    });

    it('word chips come from the algorithm, modifier, title, collection and paper', () => {
      open();
      const vals = $$('[data-spe-sug="word"]').map((b) => b.dataset.value);
      expect(vals).toContain('Flowfield');
      expect(vals).toContain('Mirror');
      expect(vals).toContain('Studies');
      expect(vals.some((v) => /Riverbed|Rorschach/.test(v))).toBe(true);
      expect(vals.length).toBeLessThanOrEqual(4);
    });

    it('clicking a chip fills the field and patches', () => {
      open();
      const chip = $('[data-spe-sug="word"][data-value="Mirror"]');
      click(chip);
      expect($('[data-spe-field="word"]').value).toBe('Mirror');
      expect(last()).toEqual({ texts: { word: 'Mirror' } });
    });

    it('title chips suggest names built from the file', () => {
      open();
      const vals = $$('[data-spe-sug="title"]').map((b) => b.dataset.value);
      expect(vals.length).toBeGreaterThan(0);
      expect(vals.join(' ')).toMatch(/Riverbed Rorschach/);
    });

    it('"Suggest a description" cycles descriptions drawn from the algorithm notes, stats, paper and pen', () => {
      open();
      const seen = new Set();
      const b = $('[data-spe-suggest-desc]');
      for (let i = 0; i < 4; i++) { click(b); seen.add($('[data-spe-field="description"]').value); }
      expect(seen.size).toBeGreaterThan(1);
      const all = Array.from(seen).join(' ');
      expect(all).toMatch(/Noise Rack/);                  // DESCRIPTIONS.flowfield
      expect(all).toMatch(/41\.2 m in 1,204 strokes/);    // doc stats
      expect(all).toMatch(/Burnt Sienna/);                // pen name
      expect(last().texts.description).toBeTruthy();
    });

    it('every text change offers Undo that patches the previous value back', () => {
      open({ record: blank({ texts: { word: 'Old', title: null, description: null } }) });
      setVal($('[data-spe-field="word"]'), 'New');
      expect(toasts[toasts.length - 1].action.label).toBe('Undo');
      undo();
      expect(last()).toEqual({ texts: { word: 'Old' } });
      expect($('[data-spe-field="word"]').value).toBe('Old');
    });
  });

  /* ---------------------------------------------------------------- layout */
  describe('layout radiogroup', () => {
    it('is a radiogroup of 16 radios with exactly one tab stop', () => {
      open();
      const g = $('[role="radiogroup"][aria-label="Layout"]');
      const radios = Array.from(g.querySelectorAll('[role="radio"]'));
      expect(radios).toHaveLength(16);
      expect(radios.filter((r) => r.tabIndex === 0)).toHaveLength(1);
    });

    it('marks the suggested layout from the rhythm and checks it while no layout is stored', () => {
      const placed = placedList('curated');
      const want = V.StartPagePlateRhythm.suggestLayouts(placed[1].colorway.class, 'landscape')[0];
      open({ orientation: 'landscape' });
      expect($$('[data-suggested]')).toHaveLength(1);
      expect($('[data-suggested]').dataset.layout).toBe(want);
      expect($('[data-layout][aria-checked="true"]').dataset.layout).toBe(want);
    });

    it('choosing a layout patches it; Undo restores the previous one', () => {
      open({ record: blank({ layout: 'diptych' }) });
      click($('[data-layout="spec-sheet"]'));
      expect(last()).toEqual({ layout: 'spec-sheet' });
      expect($('[data-layout="spec-sheet"]').getAttribute('aria-checked')).toBe('true');
      undo();
      expect(last()).toEqual({ layout: 'diptych' });
      expect($('[data-layout="diptych"]').getAttribute('aria-checked')).toBe('true');
    });

    it('arrow keys move through the layouts (roving focus) and choose', () => {
      open({ record: blank({ layout: 'vertical-word' }) });
      const first = $('[data-layout="vertical-word"]'); first.focus();
      key(first, 'ArrowRight');
      expect(last()).toEqual({ layout: 'spec-sheet' });
      expect(document.activeElement.dataset.layout).toBe('spec-sheet');
      key(document.activeElement, 'ArrowLeft'); key(document.activeElement, 'ArrowLeft');
      expect(last()).toEqual({ layout: 'pull-quote' });   // wraps
    });

    it('suggested layouts for the ground are one-click chips', () => {
      open();
      const chips = $$('[data-spe-sug-layout]');
      expect(chips.length).toBeGreaterThan(0);
      click(chips[0]);
      expect(last()).toEqual({ layout: chips[0].dataset.layout });
    });
  });

  /* ---------------------------------------------------------------- colorway picker */
  describe('colorway picker', () => {
    it('groups the palette as Light papers / Color grounds / Darks', () => {
      open();
      const heads = $$('[data-spe-pal-group] > .spe-pal-gl').map((n) => n.textContent.trim());
      expect(heads).toEqual(['Light papers', 'Color grounds', 'Darks']);
      const all = $$('[data-pin]:not([data-pin=""])').filter((b) => b.dataset.pin !== 'own');
      expect(all).toHaveLength(V.START_PAGE_PLATE_PALETTE.length);
      all.forEach((b) => expect(b.getAttribute('aria-label')).toMatch(/ on /));
    });

    it('Auto follows the rhythm: it is checked with no pin, and picking a swatch pins it', () => {
      open();
      expect($('[data-pin=""]').getAttribute('aria-checked')).toBe('true');
      click($('[data-pin="black-gold"]'));
      expect(last()).toEqual({ pin: 'black-gold' });
      expect($('[data-pin="black-gold"]').getAttribute('aria-checked')).toBe('true');
      expect($('[data-pin=""]').getAttribute('aria-checked')).toBe('false');
      click($('[data-pin=""]'));
      expect(last()).toEqual({ pin: null });
    });

    it('Undo of a pin patches the previous pin', () => {
      open({ record: blank({ pin: 'buff-sienna' }) });
      click($('[data-pin="black-gold"]'));
      undo();
      expect(last()).toEqual({ pin: 'buff-sienna' });
    });

    it('"the file\'s own colors" sets artwork and background from art.ownColors and clears the pin', () => {
      open({ record: blank({ pin: 'black-gold' }) });
      click($('[data-pin="own"]'));
      expect(last()).toEqual({ pin: null, colors: { art: '#1d3a8a', background: '#f4efe4' } });
      expect($('[data-pin="own"]').getAttribute('aria-checked')).toBe('true');
    });

    it('is hidden outside Curated', () => {
      open({ mode: 'basic' });
      expect($('[data-pin]')).toBeNull();
    });
  });

  /* ---------------------------------------------------------------- manual colors */
  describe('manual colors', () => {
    const FILL_IDS = ['iridescent', 'iridescent-animated', 'duotone', 'metallic-gold', 'metallic-silver', 'sunset'];

    it('offers Artwork / Text / Background, each with Auto, swatches, a custom input and six special fills', () => {
      open();
      ['art', 'text', 'background'].forEach((part) => {
        const g = $(`[data-mc-part="${part}"]`);
        expect(g.querySelector('[data-mc-auto]')).toBeTruthy();
        expect(g.querySelectorAll('[data-mc-swatch]').length).toBeGreaterThan(8);
        expect(g.querySelector('input[type="color"]')).toBeTruthy();
        expect(Array.from(g.querySelectorAll('[data-fill]')).map((b) => b.dataset.fill)).toEqual(FILL_IDS);
      });
    });

    it('a swatch stores a hex; Auto stores null', () => {
      open();
      const sw = $('[data-mc-part="art"] [data-mc-swatch]');
      click(sw);
      expect(last()).toEqual({ colors: { art: sw.dataset.value } });
      click($('[data-mc-part="art"] [data-mc-auto]'));
      expect(last()).toEqual({ colors: { art: null } });
    });

    it('custom color input commits on change', () => {
      open();
      setVal($('[data-mc-part="text"] input[type="color"]'), '#ff00aa');
      expect(last()).toEqual({ colors: { text: '#ff00aa' } });
    });

    FILL_IDS.forEach((id) => {
      ['art', 'text', 'background'].forEach((part) => {
        it(`special fill ${id} on ${part} stores { fill } and Undo restores the old value`, () => {
          open({ record: blank({ colors: { art: '#111111', text: null, background: null } }) });
          click($(`[data-mc-part="${part}"] [data-fill="${id}"]`));
          expect(last()).toEqual({ colors: { [part]: { fill: id } } });
          expect($(`[data-mc-part="${part}"] [data-fill="${id}"]`).getAttribute('aria-checked')).toBe('true');
          undo();
          expect(last()).toEqual({ colors: { [part]: part === 'art' ? '#111111' : null } });
        });
      });
    });

    it('paints the plate: art fill, text gradient, background gradient and the animated iridescent', () => {
      open();
      click($('[data-mc-part="art"] [data-fill="iridescent-animated"]'));
      click($('[data-mc-part="text"] [data-fill="sunset"]'));
      click($('[data-mc-part="background"] [data-fill="iridescent-animated"]'));
      expect(plateEl.dataset.artfill).toBe('iridescent-animated');
      expect(plateEl.dataset.txfill).toBe('sunset');
      expect(plateEl.dataset.bgfill).toBe('iridescent-animated');
      expect(plateEl.style.getPropertyValue('--spl-bg-fill')).toMatch(/conic-gradient\(from var\(--sp-a/);
      expect(plateEl.style.getPropertyValue('--spl-tx-fill')).toMatch(/linear-gradient/);
      const last1 = plateEl._h.setColorway.mock.calls.pop()[0];
      expect(last1.fill.anim).toBe(true);
      expect(last1.fill.type).toBe('conic');
      click($('[data-mc-part="art"] [data-mc-auto]'));
      expect(plateEl._h.setColorway.mock.calls.pop()[0].fill).toBeNull();
      expect(plateEl.dataset.artfill).toBeUndefined();
    });

    it('Reset colors patches colors to null and Undo restores them', () => {
      const rec = blank({ colors: { art: '#111111', text: null, background: { fill: 'sunset' } } });
      open({ record: rec });
      click($('[data-spe-reset-colors]'));
      expect(last()).toEqual({ colors: null });
      undo();
      expect(last()).toEqual({ colors: { art: '#111111', text: null, background: { fill: 'sunset' } } });
    });

    it('is hidden outside Curated; Basic shows Ink only and writes basicColors', () => {
      ['mono', 'wildcard', 'random'].forEach((m) => {
        const h = open({ mode: m });
        expect($('[data-mc-part]')).toBeNull();
        h.close();
      });
      open({ mode: 'basic' });
      expect($$('[data-mc-part]').map((n) => n.dataset.mcPart)).toEqual(['art']);
      expect(panel().textContent).toMatch(/Ink/);
      click($('[data-mc-part="art"] [data-fill="metallic-gold"]'));
      expect(last()).toEqual({ basicColors: { ink: { fill: 'metallic-gold' } } });
      click($('[data-mc-part="art"] [data-mc-swatch]'));
      expect(last().basicColors.ink).toMatch(/^#/);
      click($('[data-mc-part="art"] [data-mc-auto]'));
      expect(last()).toEqual({ basicColors: { ink: null } });
    });
  });

  /* ---------------------------------------------------------------- contrast */
  describe('contrast warnings', () => {
    const note = () => $('[data-spe-contrast]');

    it('reads fine for the plate\'s own colors', () => {
      open();
      expect(note().textContent).toMatch(/Contrast/);
      expect(note().querySelector('[data-warn]')).toBeNull();
    });

    it('warns when manual text is below 4.5:1 and art is below 3:1', () => {
      open({ record: blank({ colors: { art: null, text: null, background: '#808080' } }) });
      click($('[data-mc-part="text"] [data-mc-swatch]'));          // hand-pick below
      setVal($('[data-mc-part="text"] input[type="color"]'), '#888888');
      setVal($('[data-mc-part="art"] input[type="color"]'), '#8a8a8a');
      const t = note().textContent;
      expect(t).toMatch(/Text contrast [\d.]+:1 is below 4\.5:1/);
      expect(t).toMatch(/Art contrast [\d.]+:1 is below 3:1/);
      expect(note().getAttribute('role')).toBe('status');
    });

    it('checks a gradient stop by stop: one weak stop fails the whole fill', () => {
      const C = V.StartPagePlateColors;
      const placed = { ground: '#101014', ink: '#f8f8f4', accent: '#b6bac0', class: 'dark' };
      // iridescent on a dark ground uses pastel stops (all pass) ...
      const ok = C.resolve(placed, { art: { fill: 'iridescent' } });
      expect(ok.contrast.warnings.filter((w) => w.part === 'art')).toHaveLength(0);
      expect(ok.stops.art.length).toBe(7);
      // ... and the metallic silver fill has a dark stop (#6f747c) that fails against a mid-gray ground
      const bad = C.resolve(Object.assign({}, placed, { ground: '#6a6e76' }), { art: { fill: 'metallic-silver' } });
      expect(bad.stops.art).toHaveLength(5);
      expect(bad.contrast.art).toBeLessThan(3);
      expect(bad.contrast.warnings.map((w) => w.code)).toContain('art-contrast');
      // the minimum is the worst stop, not the average
      const per = bad.stops.art.map((s) => C.contrast(s, bad.ground.hex));
      expect(bad.contrast.art).toBeCloseTo(Math.min.apply(null, per), 5);
    });

    it('a gradient background is averaged for the ground', () => {
      const C = V.StartPagePlateColors;
      const placed = { ground: '#f6eac7', ink: '#9a3412', accent: '#0c4a6e', class: 'light' };
      const r = C.resolve(placed, { background: { fill: 'sunset' } });
      expect(r.ground.css).toMatch(/linear-gradient/);
      expect(r.ground.hex).toBe(V.StartPagePlateFills.average(V.StartPagePlateFills.stops('sunset', { onDark: false })));
    });
  });

  /* ---------------------------------------------------------------- advice */
  describe('color advice', () => {
    it('flags two dark plates in a row and offers the rhythm color', () => {
      const dark = V.START_PAGE_PLATE_PALETTE.filter((e) => e.class === 'dark');
      const placed = [{ id: 'a', colorway: dark[0] }, { id: 'w1', colorway: dark[1] }, { id: 'c', colorway: dark[2] }];
      open({ placed, colorway: dark[1], record: blank({ pin: dark[1].id }) });
      expect($('[data-spe-advice]').textContent).toMatch(/Two dark plates in a row/);
      click($('[data-spe-use-rhythm]'));
      expect(last()).toEqual({ pin: null });
    });

    it('counts a Curated manual background: a dark pick beside a dark plate is flagged', () => {
      const L = V.START_PAGE_PLATE_PALETTE;
      const dark = L.filter((e) => e.class === 'dark');
      const light = L.filter((e) => e.class === 'light');
      const placed = [{ id: 'a', colorway: dark[0] }, { id: 'w1', colorway: light[0] }, { id: 'c', colorway: light[1] }];
      open({ placed, colorway: light[0], record: blank({ colors: { background: '#101418' } }) });
      expect($('[data-spe-advice]').textContent).toMatch(/Two dark plates in a row/);
    });

    it('says the rhythm holds when there is nothing to flag', () => {
      const L = V.START_PAGE_PLATE_PALETTE;
      const placed = [{ id: 'a', colorway: L.find((e) => e.id === 'bristol-indigo') }, { id: 'w1', colorway: L.find((e) => e.id === 'sienna-butter') }, { id: 'c', colorway: L.find((e) => e.id === 'black-white') }];
      open({ placed, colorway: placed[1].colorway });
      expect($('[data-spe-advice]').textContent).toMatch(/Rhythm holds/);
      expect($('[data-spe-use-rhythm]')).toBeNull();
    });
  });

  /* ---------------------------------------------------------------- framing */
  describe('frame art', () => {
    const startFraming = () => { click($('[data-spe-frame-toggle]')); return plateEl._pr; };

    it('toggling frames the main print: dashed outline class, focus, keyboard hint', () => {
      open();
      const pr = startFraming();
      expect(pr.classList.contains('spe-framing')).toBe(true);
      expect(document.activeElement).toBe(pr);
      expect($('[data-spe-frame-toggle]').getAttribute('aria-pressed')).toBe('true');
      expect($('[data-spe-frame-controls]').hidden).toBe(false);
    });

    it('framing scrolls the print into view instantly under Still, smoothly otherwise', () => {
      const run = (still) => {
        V.StartPageInk = { isStill: () => still };
        const seen = [];
        plateEl._pr.scrollIntoView = (o) => seen.push(o);
        const h = open();
        startFraming();
        h.close();
        return seen[0];
      };
      expect(run(true).behavior).toBe('auto');
      expect(run(false).behavior).toBe('smooth');
    });

    it('arrow keys nudge (Shift bigger), every nudge patches the frame and previews it on the art', () => {
      open();
      const pr = startFraming();
      key(pr, 'ArrowRight');
      const a = last().frame;
      expect(typeof a.cx).toBe('number'); expect(a.fit).toBe('cover'); expect(a.z).toBe(1);
      key(pr, 'ArrowRight');
      const b = last().frame;
      expect(b.cx).toBeLessThan(a.cx);                        // art moves right: the window moves left
      key(pr, 'ArrowRight', { shiftKey: true });
      const c = last().frame;
      expect(a.cx - b.cx).toBeCloseTo(0.0, 0);
      expect(b.cx - c.cx).toBeGreaterThan(a.cx - b.cx);       // Shift steps are bigger
      key(pr, 'ArrowDown');
      expect(last().frame.cy).toBeLessThan(c.cy);
      expect(plateEl._h.setFrame).toHaveBeenCalled();
      const f = plateEl._h.setFrame.mock.calls.pop();
      expect(f[0].cx).toBeCloseTo(last().frame.cx, 6);
    });

    it('+ and - scale, clamped to 50–400 %', () => {
      open();
      const pr = startFraming();
      key(pr, '+'); expect(last().frame.z).toBeCloseTo(1.1, 3);
      key(pr, '-'); key(pr, '-'); expect(last().frame.z).toBeCloseTo(1 / 1.1, 3);
      for (let i = 0; i < 40; i++) key(pr, '+');
      expect(last().frame.z).toBe(4);
      for (let i = 0; i < 80; i++) key(pr, '-');
      expect(last().frame.z).toBe(0.5);
    });

    it('Enter and Esc leave framing without closing the editor and return focus to the toggle', () => {
      open();
      const pr = startFraming();
      key(pr, 'Enter');
      expect(pr.classList.contains('spe-framing')).toBe(false);
      expect(document.activeElement).toBe($('[data-spe-frame-toggle]'));
      expect(panel()).toBeTruthy(); expect(closed).toBe(0);
      startFraming();
      key(pr, 'Escape');
      expect(pr.classList.contains('spe-framing')).toBe(false);
      expect(document.activeElement).toBe($('[data-spe-frame-toggle]'));
      expect(closed).toBe(0);
    });

    it('Fit and Fill switch the fit and reset the crop', () => {
      open({ record: blank({ frame: { fit: 'cover', z: 2, cx: 0.4, cy: 0.4 } }) });
      expect($('[data-spe-fit="cover"]').getAttribute('aria-pressed')).toBe('true');
      click($('[data-spe-fit="contain"]'));
      expect(last()).toEqual({ frame: { fit: 'contain', z: 1, cx: null, cy: null } });
      expect($('[data-spe-fit="contain"]').getAttribute('aria-pressed')).toBe('true');
      expect(plateEl._h.setFrame).toHaveBeenCalledWith(expect.anything(), 'contain');
      click($('[data-spe-fit="cover"]'));
      expect(last().frame.fit).toBe('cover');
    });

    it('the slider spans 50–400 %, previews on input and commits on change', () => {
      open();
      const z = $('[data-spe-zoom]');
      expect(z.min).toBe('50'); expect(z.max).toBe('400');
      z.value = '200'; z.dispatchEvent(new Event('input', { bubbles: true }));
      expect(calls).toHaveLength(0);
      expect(plateEl._h.setFrame).toHaveBeenCalled();
      expect(plateEl._h.setFrame.mock.calls.pop()[0].z).toBeCloseTo(2, 5);
      z.dispatchEvent(new Event('change', { bubbles: true }));
      expect(last().frame.z).toBeCloseTo(2, 5);
      expect($('[data-spe-zoom-out]').textContent).toBe('200%');
    });

    it('Reset framing patches frame to null, restores the default crop, and Undo brings the frame back', () => {
      const fr = { fit: 'cover', z: 2, cx: 0.3, cy: 0.6 };
      open({ record: blank({ frame: fr }) });
      click($('[data-spe-frame-reset]'));
      expect(last()).toEqual({ frame: null });
      expect(plateEl._h.setFrame).toHaveBeenLastCalledWith(null, 'cover');
      undo();
      expect(last()).toEqual({ frame: fr });
    });

    it('pointer drag moves the art and commits once on release; the wheel scales', () => {
      open();
      const pr = startFraming();
      const ev = (t, x, y) => pr.dispatchEvent(Object.assign(new MouseEvent(t, { bubbles: true, cancelable: true, clientX: x, clientY: y }), { pointerId: 1 }));
      key(pr, 'ArrowLeft');
      const c0 = last().frame.cx; const n0 = calls.length;
      ev('pointerdown', 100, 100); ev('pointermove', 140, 100);
      expect(calls).toHaveLength(n0);
      ev('pointerup', 140, 100);
      expect(calls).toHaveLength(n0 + 1);
      expect(last().frame.cx).toBeLessThan(c0);
      const before = last().frame.z;
      pr.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -120 }));
      expect(last().frame.z).toBeGreaterThan(before);
    });

    it('is disabled for 3D pieces (framed whole automatically)', () => {
      open({ art: Object.assign({}, ART, { is3d: true }) });
      expect($('[data-spe-frame-toggle]').disabled).toBe(true);
    });
  });

  /* ---------------------------------------------------------------- motion, reset, remove */
  describe('motion, reset and remove', () => {
    it('animate-in and hover overrides patch the motion record (empty = page default)', () => {
      open();
      setVal($('select[data-spe-motion="animateIn"]'), 'sweep');
      expect(last()).toEqual({ motion: { animateIn: 'sweep' } });
      setVal($('select[data-spe-motion="hover"]'), 'glare');
      expect(last()).toEqual({ motion: { hover: 'glare' } });
      setVal($('select[data-spe-motion="hover"]'), '');
      expect(last()).toEqual({ motion: { hover: null } });
      expect($$('select[data-spe-motion="animateIn"] option').map((o) => o.value)).toEqual(['', 'plot', 'sweep', 'fade', 'bleed', 'cascade', 'scan', 'iris', 'none']);
    });

    it('the plate hover list is Settings\' list (same ids and labels, Re-trigger animation included) minus Default', () => {
      open();
      const opts = $$('select[data-spe-motion="hover"] option').map((o) => [o.value, o.textContent]);
      const settings = V.UI.StartPageSettings.HOVER.filter(([v]) => v !== 'default');
      expect(opts[0]).toEqual(['', 'Page default']);
      expect(opts.slice(1)).toEqual(settings);
      expect(opts.map((o) => o[0])).toContain('retrigger');
      expect(E.HOVER_STYLES).toEqual(settings);
    });

    it('Reset plate calls onReset with the editable keys and offers Undo of the whole record', () => {
      const rec = blank({ layout: 'diptych', pin: 'black-gold' });
      open({ record: rec });
      click($('[data-spe-reset]'));
      expect(last().reset).toEqual(expect.arrayContaining(['layout', 'texts', 'pin', 'colors', 'frame', 'motion']));
      expect(toasts[toasts.length - 1].action.label).toBe('Undo');
      undo();
      expect(last()).toEqual({ layout: 'diptych', texts: null, pin: 'black-gold', colors: null, basicColors: null, frame: null, motion: null });
    });

    it('Remove plate calls onRemove and closes the editor', () => {
      open();
      click($('[data-spe-remove]'));
      expect(last()).toEqual({ removed: true });
      expect(panel()).toBeNull();
      expect(closed).toBe(1);
    });
  });

  /* ---------------------------------------------------------------- keyboard + focus */
  describe('keyboard path', () => {
    it('focus moves into the editor on open; Done closes and returns focus to the opener', () => {
      open();
      expect(panel().contains(document.activeElement)).toBe(true);
      click($('[data-spe-done]'));
      expect(panel()).toBeNull();
      expect(closed).toBe(1);
      expect(document.activeElement).toBe(opener);
    });

    it('Esc closes the editor and returns focus to the opener', () => {
      open();
      key($('[data-spe-field="title"]'), 'Escape');
      expect(panel()).toBeNull();
      expect(closed).toBe(1);
      expect(document.activeElement).toBe(opener);
    });

    it('Esc flushes a pending text edit first', () => {
      open();
      const w = $('[data-spe-field="word"]');
      w.value = 'Pending'; w.dispatchEvent(new Event('input', { bubbles: true }));
      key(w, 'Escape');
      expect(last()).toEqual({ texts: { word: 'Pending' } });
    });

    it('every control is reachable: buttons, inputs and radios are focusable, sections are details', () => {
      open();
      const sections = $$('details.spe-sec');
      expect(sections.length).toBeGreaterThanOrEqual(5);
      sections.forEach((d) => { d.open = true; });
      $$('button, input, select, textarea').forEach((n) => expect(n.tabIndex).toBeGreaterThanOrEqual(-1));
      $$('[role="radiogroup"]').forEach((g) => expect(Array.from(g.querySelectorAll('[role="radio"]')).filter((r) => r.tabIndex === 0)).toHaveLength(1));
    });

    it('close() from the handle tears the editor down and calls onClose once', () => {
      const h = open();
      h.close(); h.close();
      expect(panel()).toBeNull();
      expect(closed).toBe(1);
    });

    it('opening a second editor on the same plate replaces the first', () => {
      open(); open();
      expect(host.querySelectorAll('[data-plate-editor]')).toHaveLength(1);
    });
  });

  /* ---------------------------------------------------------------- store round trip */
  describe('with the real store', () => {
    it('every patch the editor emits is accepted by the store and effectiveFor honors the mode', async () => {
      const store = S.create({ indexedDB: () => null });
      await store.load();
      let rec = await store.upsert('w1', { artId: 'w1' });
      open({ record: rec, onChange: async (p) => { rec = await store.upsert('w1', p); calls.push(p); } });
      click($('[data-layout="knockout"]'));
      click($('[data-mc-part="art"] [data-fill="duotone"]'));
      click($('[data-mc-part="text"] [data-mc-swatch]'));
      click($('[data-spe-fit="contain"]'));
      setVal($('select[data-spe-motion="animateIn"]'), 'iris');
      await new Promise((r) => setTimeout(r, 0));
      expect(rec.layout).toBe('knockout');
      expect(rec.colors.art).toEqual({ fill: 'duotone' });
      expect(rec.frame.fit).toBe('contain');
      expect(rec.motion.animateIn).toBe('iris');
      expect(S.effectiveFor(rec, 'curated').colors.art).toEqual({ fill: 'duotone' });
      expect(S.effectiveFor(rec, 'mono').colors).toBeNull();
      expect(S.effectiveFor(rec, 'mono').layout).toBe('knockout');
    });
  });
});
