/**
 * @vitest-environment jsdom
 *
 * Plate manual colors: Title (display word) and Band (secondary ground) rows in the plate editor, applied to a real
 * rendered plate (layouts.js + colors.js), persisted through the store, with Auto = old behaviour; and a colorway
 * pick clears every manual override (Artwork, Text, Background, Title, Band) with Undo.
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
  'src/core/start-page/plate-fills.js', 'src/ui/start-page/plates/layouts.js', 'src/ui/start-page/plates/colors.js',
  'src/ui/start-page/settings.js', 'src/ui/start-page/plates/editor.js',
];
const load = () => {
  vi.resetModules(); delete window.Vectura; window.Vectura = {};
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 0);
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  HTMLCanvasElement.prototype.getContext = () => null;
  FILES.forEach((f) => window.eval(SRC(f)));
  return window.Vectura;
};
const svg = fixture('lissajous-trefoil.svg');
const ART = { id: 'w1', name: 'rolling-hills.vectura', algorithm: 'Wavetable', collection: 'Studies', svg,
  ownColors: { paper: '#f4efe4', ink: '#1d3a8a' } };
const blank = (over) => Object.assign({ id: 'w1', artId: 'w1', order: 0, hidden: false, layout: null, texts: null, pin: null,
  colors: null, basicColors: null, frame: null, motion: null, removed: false }, over || {});
const ALL = { art: { fill: 'iridescent-animated' }, text: '#aabbcc', background: '#101418', title: '#ff3366', band: '#224466' };

describe('plate manual colors: Title and Band', () => {
  let V; let E; let host; let plateEl; let toasts; let calls;
  const $ = (s) => host.querySelector(`[data-plate-editor] ${s}`);
  const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  const last = () => calls[calls.length - 1];
  const undo = () => toasts[toasts.length - 1].action.onAction({ disableAction() {} });
  const makePlate = (layout) => {
    const el = V.StartPagePlateLayouts.render(layout, { plate: { id: 'p', orientation: 'landscape' }, art: { id: 'w1', svg }, autoMount: false,
      colorway: { id: 'x', ground: '#101418', ink: '#7fe0c0', accent: '#d08040', class: 'dark' },
      texts: { word: 'Wavetable', title: 'Rolling Hills', description: 'Soft waves.', algorithm: 'Wavetable', specs: [['Paper', 'A3']] } });
    host.appendChild(el); return el;
  };
  const placedList = () => V.StartPagePlateRhythm.place([{ id: 'a' }, { id: 'w1' }, { id: 'c' }], { mode: 'curated', theme: 'dark' });
  const open = (layout, record) => {
    plateEl = makePlate(layout);
    const placed = placedList();
    return E.open(plateEl, { record: blank(Object.assign({ layout }, record || {})), art: ART, mode: 'curated', index: 1, colorway: placed[1].colorway, placed,
      specs: [], onChange: (p) => calls.push(p), onReset() {}, onRemove() {}, onClose() {} });
  };

  beforeEach(() => {
    V = load(); E = V.StartPagePlateEditor;
    document.body.innerHTML = ''; host = document.createElement('div'); document.body.appendChild(host);
    toasts = []; calls = [];
    V.UI = { StartPageSettings: V.UI.StartPageSettings, overlays: { Toast: { show: (p) => { toasts.push(p); return { dismiss() {}, el: document.createElement('div') }; } } } };
  });

  const visible = (part) => { const b = $(`[data-mc-part="${part}"]`); return !!b && !b.hidden; };

  it('shows Title and Band only for layouts that draw them', () => {
    const exp = { 'full-bleed-band': [true, true], 'knockout-title': [true, true], diptych: [true, false], knockout: [false, true], 'text-wrap': [false, false], 'pull-quote': [false, false] };
    Object.keys(exp).forEach((layout) => {
      host.innerHTML = '';
      const h = open(layout);
      expect([visible('title'), visible('band')], layout).toEqual(exp[layout]);
      ['art', 'text', 'background'].forEach((p) => expect(visible(p)).toBe(true));
      h.close();
    });
  });

  it('labels: Title and Band rows, with hints that keep Text = captions', () => {
    open('full-bleed-band');
    expect($('[data-mc-part="title"] .spe-mc-h b').textContent).toBe('Title');
    expect($('[data-mc-part="band"] .spe-mc-h b').textContent).toBe('Band');
    expect($('[data-mc-part="text"] .spe-mc-h b').textContent).toBe('Text');
    expect($('[data-mc-part="text"] .spe-mc-hint').textContent).toMatch(/caption/i);
    expect($('[data-mc-part="title"] .spe-mc-hint').textContent).toMatch(/display word/i);
    expect($('[data-mc-part="band"] .spe-mc-hint').textContent).toMatch(/bar|ground/i);
  });

  it('the new rows reuse the same Auto, swatches, custom input and six fills', () => {
    open('full-bleed-band');
    ['title', 'band'].forEach((p) => {
      const g = $(`[data-mc-part="${p}"]`);
      expect(g.querySelector('[data-mc-auto]')).toBeTruthy();
      expect(g.querySelectorAll('[data-mc-swatch]').length).toBeGreaterThan(8);
      expect(g.querySelector('input[type="color"]')).toBeTruthy();
      expect(g.querySelectorAll('[data-fill]').length).toBe(6);
    });
  });

  it('a swatch stores colors.title / colors.band; Auto stores null', () => {
    open('full-bleed-band');
    const sw = $('[data-mc-part="band"] [data-mc-swatch]');
    click(sw); expect(last()).toEqual({ colors: { band: sw.dataset.value } });
    click($('[data-mc-part="title"] [data-fill="sunset"]')); expect(last()).toEqual({ colors: { title: { fill: 'sunset' } } });
    click($('[data-mc-part="title"] [data-mc-auto]')); expect(last()).toEqual({ colors: { title: null } });
  });

  it('applies Band and Title to the rendered plate independently of the art fill', () => {
    open('full-bleed-band');
    click($('[data-mc-part="art"] [data-fill="iridescent-animated"]'));
    click($('[data-mc-part="band"] [data-mc-swatch]'));
    click($('[data-mc-part="title"] [data-mc-swatch]:last-of-type'));
    const band = $('[data-mc-part="band"] [data-mc-swatch]').dataset.value;
    expect(plateEl.dataset.artfill).toBe('iridescent-animated');
    expect(plateEl.dataset.band).toBe('solid');
    expect(plateEl.style.getPropertyValue('--spl-band')).toBe(band);
    expect(plateEl.style.getPropertyValue('--spl-band-on')).toMatch(/^#[0-9a-f]{6}$/);
    expect(plateEl.dataset.title).toBe('solid');
    expect(plateEl.style.getPropertyValue('--spl-title')).toMatch(/^#[0-9a-f]{6}$/);
    click($('[data-mc-part="title"] [data-fill="sunset"]'));
    expect(plateEl.dataset.title).toBe('sunset');
    expect(plateEl.style.getPropertyValue('--spl-title')).toMatch(/^url\(#spe-w/);
    expect(document.querySelector('#spe-defs linearGradient')).toBeTruthy();
    click($('[data-mc-part="band"] [data-fill="metallic-gold"]'));
    expect(plateEl.dataset.band).toBe('metallic-gold');
    expect(plateEl.style.getPropertyValue('--spl-band')).toMatch(/linear-gradient/);
  });

  it('Auto leaves the plate exactly as it was before the roles existed', () => {
    open('full-bleed-band');
    click($('[data-mc-part="art"] [data-fill="iridescent"]'));
    const before = { style: plateEl.getAttribute('style'), ds: JSON.stringify(plateEl.dataset) };
    click($('[data-mc-part="band"] [data-mc-swatch]'));
    click($('[data-mc-part="band"] [data-mc-auto]'));
    click($('[data-mc-part="title"] [data-fill="sunset"]'));
    click($('[data-mc-part="title"] [data-mc-auto]'));
    expect(plateEl.dataset.band).toBeUndefined(); expect(plateEl.dataset.title).toBeUndefined();
    expect(plateEl.style.getPropertyValue('--spl-band')).toBe(''); expect(plateEl.style.getPropertyValue('--spl-title')).toBe('');
    expect(plateEl.getAttribute('style')).toBe(before.style);
    expect(JSON.stringify(plateEl.dataset)).toBe(before.ds);
  });

  it('a layout without the role ignores a stored value (and keeps it stored)', () => {
    const res = V.StartPagePlateColors.resolve({ ground: '#101418', ink: '#7fe0c0', class: 'dark' }, { band: '#224466', title: '#ff3366' }, { layout: 'text-wrap' });
    const el = makePlate('text-wrap');
    V.StartPagePlateColors.apply(el, res);
    expect(el.dataset.band).toBeUndefined(); expect(el.dataset.title).toBeUndefined();
    expect(el.style.getPropertyValue('--spl-band')).toBe('');
  });

  it('persists through the store; old records without the fields still resolve as Auto', async () => {
    const S = V.StartPagePlatesStore;
    const store = S.create({ indexedDB: () => null });
    await store.upsert('w1', { colors: { band: '#224466' } });
    await store.upsert('w1', { colors: { title: { fill: 'sunset' } } });
    const rec = (await store.load()).plates[0];
    expect(rec.colors).toEqual({ art: null, text: null, background: null, band: '#224466', title: { fill: 'sunset' } });
    expect(S.effectiveFor(rec, 'curated').colors.band).toBe('#224466');
    const old = blank({ colors: { art: '#111111', text: null, background: null } });
    const r = V.StartPagePlateColors.resolve({ ground: '#101418', ink: '#7fe0c0', class: 'dark' }, S.effectiveFor(old, 'curated').colors, { layout: 'full-bleed-band' });
    expect(r.title.kind).toBeNull(); expect(r.band.kind).toBeNull();
  });

  it('the stylesheet consumes the new variables for the band layouts and display words', () => {
    const css = SRC('src/ui/skin/components.css');
    expect(css).toMatch(/\.spl\[data-band\][^{]*\.spl-cband[^{]*\{[^}]*var\(--spl-band\)/);
    expect(css).toMatch(/\.spl\[data-band\][^{]*\.spl-ko-band/);
    expect(css).toMatch(/\.spl\[data-band\][^{]*\.spl-kt-band/);
    expect(css).toMatch(/\.spl\[data-title\][^{]*\.spl-hword[^{]*\{[^}]*fill:\s*var\(--spl-title\)/);
    expect(css).toMatch(/\.spl\[data-title\][^{]*\.spl-vword/);
    expect(css).toMatch(/var\(--spl-band-on/);
  });

  /* ---------------------------------------------------------------- colorway pick clears the custom palette */
  describe('picking a colorway', () => {
    const named = () => $$named()[0];
    const $$named = () => Array.from(host.querySelectorAll('[data-plate-editor] [data-pin]')).filter((b) => b.dataset.pin && b.dataset.pin !== 'own');
    const mc = (p) => ($(`[data-mc-part="${p}"] [data-mc-auto]`) || {}).getAttribute && $(`[data-mc-part="${p}"] [data-mc-auto]`).getAttribute('aria-checked');

    it('clears Artwork, Text, Background, Title and Band, and the rendered plate shows the colorway', () => {
      open('full-bleed-band', { colors: ALL });
      expect(plateEl.dataset.band).toBe('solid');
      const pick = named();
      click(pick);
      expect(last().pin).toBe(pick.dataset.pin);
      expect(last().colors).toBeNull();
      ['art', 'text', 'background', 'title', 'band'].forEach((p) => expect(mc(p), p).toBe('true'));
      ['artfill', 'band', 'title', 'txfill', 'bgfill'].forEach((k) => expect(plateEl.dataset[k], k).toBeUndefined());
      const e = V.START_PAGE_PLATE_PALETTE.find((x) => x.id === pick.dataset.pin);
      expect(plateEl.style.getPropertyValue('--spl-paper')).toBe(V.StartPagePlateType.plateVars(e)['--spl-paper']);
    });

    it('Auto / rhythm and "Use the rhythm" also clear every override', () => {
      open('full-bleed-band', { pin: 'black-gold', colors: ALL });
      click($('[data-pin=""]'));
      expect(last()).toEqual({ pin: null, colors: null });
    });

    it('re-clicking the already pinned colorway still clears leftover overrides', () => {
      open('full-bleed-band', { pin: 'black-gold', colors: { band: '#224466' } });
      click($('[data-pin="black-gold"]'));
      expect(last()).toEqual({ pin: 'black-gold', colors: null });
    });

    it('with no overrides the patch is just the pin', () => {
      open('full-bleed-band');
      click($('[data-pin="black-gold"]'));
      expect(last()).toEqual({ pin: 'black-gold' });
    });

    it('the file\'s own colors replaces the custom set (Text, Title and Band cleared)', () => {
      open('full-bleed-band', { colors: ALL });
      click($('[data-pin="own"]'));
      expect(last()).toEqual({ pin: null, colors: { art: '#1d3a8a', background: '#f4efe4', text: null, title: null, band: null } });
    });

    it('Undo brings back the pin and the whole custom palette', () => {
      open('full-bleed-band', { colors: ALL });
      click(named());
      undo();
      expect(last().pin).toBeNull();
      expect(last().colors).toEqual(ALL);
      expect(mc('band')).toBe('false');
      expect(plateEl.dataset.band).toBe('solid');
    });
  });
});
