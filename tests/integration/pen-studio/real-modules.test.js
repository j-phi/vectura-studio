/*
 * Pen Studio against the REAL modules (index.html stack): store, draft, lab,
 * complement, pen-library, pen-model and the five views. No stubs.
 * Covers: open studio, select pen, toggle size, tune + save, save as new,
 * export box -> import box round trip, Use in document, plus data checks
 * that glue the units together (sizesSource, string keys, Kraft vs black).
 */
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const FULL_STACK = { includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true };

describe('Pen Studio with real modules', () => {
  let runtime, window, document, app, V, UI, SETTINGS;

  const q = (sel, root) => (root || document).querySelector(sel);
  const qa = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  const type = (el, v) => { el.value = v; el.dispatchEvent(new window.Event('input', { bubbles: true })); };
  const key = (el, k) => el.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  const stored = () => JSON.parse(window.localStorage.getItem(V.PEN_STUDIO.STORAGE_KEY) || 'null');

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    V = window.Vectura; UI = V.UI;
    app = new V.App();
    window.app = app;
    SETTINGS = V.SETTINGS;
  });
  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  let handle;
  beforeEach(() => {
    window.localStorage.removeItem(V.PEN_STUDIO.STORAGE_KEY);
    SETTINGS.pens = [{ id: 'pen-1', name: 'Pen 1', color: '#ffffff', width: 0.3 }, { id: 'pen-2', name: 'Pen 2', color: '#dbeafe', width: 0.5 }];
    app.ui.renderPens();
    handle = UI.PenStudio.open({ app });
  });
  afterEach(() => { try { handle && handle.close(); } catch (_e) { /* already closed */ } });

  test('open mounts the three real columns with the seeded boxes and a selected pen', () => {
    expect(UI.PenStudio.isOpen()).toBe(true);
    expect(q('.vectura-modal.pen-studio')).toBeTruthy();
    expect(qa('.pen-studio-box').length).toBeGreaterThan(0);
    expect(qa('.pen-studio-row').length).toBeGreaterThan(0);
    expect(q('.pen-studio-lab')).toBeTruthy();
    expect(q('.pen-studio-pair')).toBeTruthy();
    expect(qa('.pen-studio-slider')).toHaveLength(6);
    expect(qa('.pen-studio-paper').length).toBeGreaterThanOrEqual(10);
    handle.close();
    expect(UI.PenStudio.isOpen()).toBe(false);
    expect(q('.pen-studio')).toBeNull();
  });

  test('select pen: clicking another row changes the header name', () => {
    const rows = qa('.pen-studio-row:not(.is-selected) .pen-studio-row-main');
    expect(rows.length).toBeGreaterThan(0);
    const name = q('.pen-studio-row-name', rows[0].parentNode).textContent;
    click(rows[0]);
    expect(q('.pen-studio-name').textContent).toBe(name);
  });

  test('toggle size: owned sizes toggle, never empty, "testing" outline follows', () => {
    const sizes = () => qa('.pen-studio-size');
    expect(sizes().length).toBeGreaterThan(1);
    const owned = () => sizes().filter((b) => b.getAttribute('aria-pressed') === 'true');
    const before = owned().length;
    const off = sizes().find((b) => b.getAttribute('aria-pressed') !== 'true');
    click(off);
    expect(owned().length).toBe(before + 1);
    owned().forEach((b) => click(b));
    expect(owned().length).toBeGreaterThanOrEqual(1);
    expect(sizes().filter((b) => b.classList.contains('is-testing'))).toHaveLength(1);
  });

  test('tune + save persists the ink key to storage; exactly one unsaved indicator while dirty', () => {
    const slider = q('.pen-studio-slider[data-key="wetness"] input');
    slider.value = '0.8';
    slider.dispatchEvent(new window.Event('input', { bubbles: true }));
    expect(qa('.pen-studio-unsaved, .pen-studio-note').length).toBe(1);
    expect(q('.pen-studio-unsaved')).toBeTruthy();
    const saveBtn = q('.pen-studio-btn.is-save');
    expect(saveBtn.disabled).toBe(false);
    click(saveBtn);
    const selName = q('.pen-studio-name').textContent;
    const doc = stored();
    const pen = doc.pens.find((p) => p.name === selName);
    expect(pen.ink.wetness).toBe(0.8);
    expect(q('.pen-studio-unsaved')).toBeNull();
    expect(qa('.pen-studio-note')).toHaveLength(1); // "Saved ... ✓"
  });

  test('save as new creates a second pen next to the source and keeps the source unchanged', () => {
    const srcName = q('.pen-studio-name').textContent;
    const slider = q('.pen-studio-slider[data-key="skips"] input');
    slider.value = '0.1';
    slider.dispatchEvent(new window.Event('input', { bubbles: true }));
    click(q('.pen-studio-btn.is-save-new'));
    const name = q('.pen-studio-savenew-name');
    expect(name.value).toBe(`${srcName} (custom)`);
    key(name, 'Enter');
    expect(q('.pen-studio-dialog')).toBeNull();
    const doc = stored();
    const created = doc.pens.find((p) => p.name === `${srcName} (custom)`);
    const src = doc.pens.find((p) => p.name === srcName);
    expect(created.ink.skips).toBe(0.1);
    expect(src.ink && src.ink.skips).toBeUndefined();
    expect(q('.pen-studio-name').textContent).toBe(`${srcName} (custom)`);
  });

  test('export box -> import box round-trips sizes and ink into a new "(imported)" box', () => {
    const boxCount = qa('.pen-studio-box').length;
    click(q('.pen-studio-box-export'));
    const text = q('.pen-studio-dialog textarea').value;
    const file = JSON.parse(text);
    expect(file.schema).toBe('vectura-pens');
    expect(file.version).toBe(2);
    click(q('.pen-studio-dialog-cancel, .pen-studio-dialog-close'));
    expect(q('.pen-studio-dialog')).toBeNull();
    click(q('.pen-studio-import-box'));
    type(q('.pen-studio-dialog textarea'), text);
    click(q('.pen-studio-import-go'));
    expect(qa('.pen-studio-box')).toHaveLength(boxCount + 1);
    const doc = stored();
    const imported = doc.boxes[doc.boxes.length - 1];
    expect(imported.name).toMatch(/imported/i);
    // the file lists one record per owned size; import regroups them per pen
    expect(imported.items.reduce((n, i) => n + i.sizes.length, 0)).toBe(file.pens.length);
  });

  test('Use in document adds the pen with the tuned ink, themeManaged false, one history entry', () => {
    const before = app.history.length;
    const pensBefore = SETTINGS.pens.length;
    const slider = q('.pen-studio-slider[data-key="wetness"] input');
    slider.value = '0.7';
    slider.dispatchEvent(new window.Event('input', { bubbles: true }));
    let pushes = 0;
    const push = app.pushHistory;
    app.pushHistory = function counted(...a) { pushes += 1; return push.apply(this, a); };
    try { click(q('.pen-studio-use')); } finally { app.pushHistory = push; }
    expect(pushes).toBe(1);
    expect(SETTINGS.pens.length).toBe(pensBefore + 1);
    const added = SETTINGS.pens[SETTINGS.pens.length - 1];
    expect(added.themeManaged).toBe(false);
    expect(added.ink && added.ink.wetness).toBe(0.7);
    expect(app.history.length).toBeGreaterThanOrEqual(Math.min(before + 1, app.history.length));
  });

  test('curated models carry sizesSource and the lab shows it', () => {
    Object.values(V.PEN_MODELS.MODELS).forEach((m) => expect(typeof m.sizesSource).toBe('string'));
    const src = q('.pen-studio-sizes-src');
    expect(src).toBeTruthy();
    expect(src.textContent).toMatch(/Nib sizes: .+ · evidence \d+%/);
  });

  test('Kraft is not dark stock; black is. Micron Black fits Kraft, dye pens are hidden on black', () => {
    const Lab = V.PenStudioLab; const C = V.PenStudioComplement;
    const dark = (t) => Lab.papers().find((p) => p.type === t).dark;
    expect(dark('kraft')).toBe(false);
    expect(dark('black')).toBe(true);
    const micron = { id: 'm', name: 'Micron Black', color: '#1b1b1d', model: 'sakura-pigma-micron' };
    const red = { id: 'main', color: '#b3392b', width: 0.3 };
    expect(C.candidates({ pen: red, penId: 'main', paperType: 'kraft', boxPens: [micron] }).map((c) => c.id)).toContain('p:m');
    const dye = { id: 'd', name: 'Stabilo', color: '#3a8fd0', model: 'stabilo-point-88' };
    const white = { id: 'main', color: '#ffffff', width: 0.3 };
    expect(C.candidates({ pen: white, penId: 'main', paperType: 'black', boxPens: [dye] }).map((c) => c.id)).not.toContain('p:d');
    expect(C.hidden(C.allCandidates({ pen: white, penId: 'main', paperType: 'black', boxPens: [dye] }), white, 'black')).toEqual(['Stabilo']);
  });
});
