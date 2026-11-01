/*
 * Pen Studio evaluator findings, against the REAL modules (no stubs):
 * M1 lab Export text, M2 shared pens across boxes, M6 focus trap + afterRender,
 * m2 import size check, m3 distinct save-as-new errors, m7 box naming,
 * m8 replace-target "Use in document".
 */
const fs = require('fs');
const path = require('path');
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const FULL_STACK = { includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true };

describe('Pen Studio review fixes (real modules)', () => {
  let runtime, window, document, app, V, UI, SETTINGS, handle;

  const q = (sel, root) => (root || document).querySelector(sel);
  const qa = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  const type = (el, v) => { el.value = v; el.dispatchEvent(new window.Event('input', { bubbles: true })); };
  const tab = (el, shiftKey) => {
    const e = new window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: !!shiftKey, bubbles: true, cancelable: true });
    el.dispatchEvent(e);
    return e;
  };
  const stored = () => JSON.parse(window.localStorage.getItem(V.PEN_STUDIO.STORAGE_KEY) || 'null');
  const S = () => V.UI_CONSTANTS.PEN_STUDIO;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    V = window.Vectura; UI = V.UI;
    app = new V.App();
    window.app = app;
    SETTINGS = V.SETTINGS;
  });
  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  const reopen = (opts) => {
    try { handle && handle.close(); } catch (_e) { /* closed */ }
    handle = UI.PenStudio.open(Object.assign({ app }, opts || {}));
  };
  beforeEach(() => {
    window.localStorage.removeItem(V.PEN_STUDIO.STORAGE_KEY);
    UI.PenStudio._reset();
    SETTINGS.pens = [{ id: 'pen-1', name: 'Pen 1', color: '#ffffff', width: 0.3 }, { id: 'pen-2', name: 'Pen 2', color: '#dbeafe', width: 0.5 }];
    app.ui.renderPens();
    reopen();
  });
  afterEach(() => { try { handle && handle.close(); } catch (_e) { /* closed */ } });

  const closeDialog = () => click(q('.pen-studio-dialog-cancel'));

  test('M1: Lab Export opens a v2 vectura-pens file for the selected pen and tested size', () => {
    const name = q('.pen-studio-name').textContent;
    const sizeBtn = qa('.pen-studio-size.is-testing')[0];
    click(q('.pen-studio-btn.is-export'));
    const ta = q('.pen-studio-dialog textarea');
    expect(ta).toBeTruthy();
    const file = JSON.parse(ta.value);
    expect(file.schema).toBe('vectura-pens');
    expect(file.version).toBe(2);
    expect(file.pens).toHaveLength(1);
    expect(file.pens[0].name).toContain(name);
    expect(file.pens[0].size).toBe(sizeBtn.dataset.key);
    expect(!!q('.pen-studio-dialog .pen-studio-error')).toBe(false);
  });

  test('M1: Lab Export includes an unsaved draft tuning', () => {
    const slider = q('.pen-studio-slider[data-key="wetness"] input');
    slider.value = '0.65';
    slider.dispatchEvent(new window.Event('input', { bubbles: true }));
    click(q('.pen-studio-btn.is-export'));
    const file = JSON.parse(q('.pen-studio-dialog textarea').value);
    expect(file.pens[0].ink.wetness).toBe(0.65);
  });

  test('M2: a pen shared by two boxes is selected and edited in the box that was clicked', () => {
    const srcBox = qa('.pen-studio-box').find((b) => q('.pen-studio-box-name', b).textContent === 'Micron set');
    click(q('.pen-studio-box-export', srcBox));
    const text = q('.pen-studio-dialog textarea').value;
    closeDialog();
    click(q('.pen-studio-import-box'));
    type(q('.pen-studio-dialog textarea'), text);
    click(q('.pen-studio-import-go'));
    const before = stored();
    const impBox = before.boxes[before.boxes.length - 1];
    const srcId = before.boxes.find((b) => b.name === 'Micron set').id;
    expect(impBox.name).toMatch(/imported/i);
    // pens are shared between the two boxes
    expect(impBox.items[1].penId).toBe(before.boxes.find((b) => b.id === srcId).items[1].penId);

    const impEl = () => q(`.pen-studio-box[data-box-id="${impBox.id}"]`);
    const row = qa('.pen-studio-row', impEl()).find((r) => r.dataset.penId === impBox.items[1].penId);
    click(q('.pen-studio-row-main', row));
    // only that one row (in the imported box) is selected
    expect(qa('.pen-studio-row.is-selected').length).toBe(1);
    expect(!!impEl().querySelector('.pen-studio-row.is-selected')).toBe(true);
    expect(!!q(`.pen-studio-box[data-box-id="${srcId}"] .pen-studio-row.is-selected`)).toBe(false);

    const off = qa('.pen-studio-size').find((b) => b.getAttribute('aria-pressed') !== 'true');
    click(off);
    const after = stored();
    const srcItem = after.boxes.find((b) => b.id === srcId).items[1];
    const impItem = after.boxes.find((b) => b.id === impBox.id).items[1];
    expect(srcItem.sizes).toEqual(before.boxes.find((b) => b.id === srcId).items[1].sizes);
    expect(impItem.sizes).toContain(off.dataset.key);
    expect(impItem.sizes.length).toBe(before.boxes.find((b) => b.id === impBox.id).items[1].sizes.length + 1);
  });

  test('M6: Tab and Shift+Tab stay inside an open dialog', () => {
    click(q('.pen-studio-box-add'));
    const dlg = q('.pen-studio-dialog');
    const items = qa('button, input, select, textarea, [tabindex]', dlg).filter((e) => !e.disabled && e.tabIndex >= 0);
    expect(items.length).toBeGreaterThan(2);
    const first = items[0]; const last = items[items.length - 1];
    last.focus();
    const e1 = tab(last, false);
    expect(e1.defaultPrevented).toBe(true);
    expect(document.activeElement === first).toBe(true);
    const e2 = tab(first, true);
    expect(e2.defaultPrevented).toBe(true);
    expect(document.activeElement === last).toBe(true);
  });

  test('M6: renaming a selected row focuses its input without a timer', () => {
    const row = q('.pen-studio-row.is-selected .pen-studio-row-main');
    click(row);
    const input = q('.pen-studio-row-edit');
    expect(input).toBeTruthy();
    expect(document.activeElement === input).toBe(true);
  });

  test('M6: the color swatch is on the 44px touch-target list', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../../src/ui/skin/components.css'), 'utf8');
    const line = css.split('\n').find((l) => l.includes('body.touch-ui .pen-studio :is(.pen-studio-btn,'));
    expect(line).toContain('.pen-studio-color');
  });

  test('m2: an oversized import file is refused before it is read', () => {
    click(q('.pen-studio-import-box'));
    const input = q('.pen-studio-file');
    const limit = V.PEN_MODELS.FILE_LIMITS.maxBytes;
    const read = vi.fn();
    const Orig = window.FileReader;
    window.FileReader = function FakeReader() { this.readAsText = read; };
    try {
      Object.defineProperty(input, 'files', { value: [{ size: limit + 1, name: 'big.json' }], configurable: true });
      input.dispatchEvent(new window.Event('change', { bubbles: true }));
    } finally { window.FileReader = Orig; }
    expect(read).not.toHaveBeenCalled();
    expect(q('.pen-studio-msg').textContent).toBe(S().IMPORT_ERR_TOO_LARGE);
  });

  test('m3: save-as-new failures other than a bad name get their own message', () => {
    click(q('.pen-studio-btn.is-save-new'));
    const real = V.PenStudioStore.saveAsNew;
    try {
      V.PenStudioStore.saveAsNew = () => ({ ok: false, reason: 'full' });
      click(q('.pen-studio-savenew-go'));
      expect(q('.pen-studio-dialog .pen-studio-error').textContent).toBe(S().ERR_PEN_LIMIT);
      V.PenStudioStore.saveAsNew = () => ({ ok: false, reason: 'missing' });
      click(q('.pen-studio-savenew-go'));
      expect(q('.pen-studio-dialog .pen-studio-error').textContent).toBe(S().ERR_PEN_MISSING);
    } finally { V.PenStudioStore.saveAsNew = real; }
  });

  test('m7: New box takes the first free "My box N" after a deletion', () => {
    click(q('.pen-studio-new-box'));
    click(q('.pen-studio-new-box'));
    const names = () => qa('.pen-studio-box-name').map((e) => e.textContent);
    expect(names().filter((n) => /^My box/.test(n))).toEqual(['My box 1', 'My box 2']);
    const first = qa('.pen-studio-box').find((b) => q('.pen-studio-box-name', b).textContent === 'My box 1');
    click(q('.pen-studio-box-delete', first));
    click(q('.pen-studio-box-delete', qa('.pen-studio-box').find((b) => q('.pen-studio-box-name', b).textContent === 'My box 1')));
    expect(names()).not.toContain('My box 1');
    click(q('.pen-studio-new-box'));
    expect(names().filter((n) => /^My box/.test(n)).sort()).toEqual(['My box 1', 'My box 2']);
  });

  test('m8: Use in document on a target pen replaces it with one history entry and no paper writes', () => {
    reopen({ penId: 'pen-1' });
    const setPaper = vi.fn(); const sync = vi.fn();
    const sp = app.setProjectPaper; const sy = app.syncPen1ToPaper;
    app.setProjectPaper = setPaper; app.syncPen1ToPaper = sync;
    const paperBefore = JSON.stringify(SETTINGS.paper);
    const histBefore = app.history.length;
    let pushes = 0;
    const push = app.pushHistory;
    app.pushHistory = function counted(...a) { pushes += 1; return push.apply(this, a); };
    const count = SETTINGS.pens.length;
    const btn = q('.pen-studio-use');
    expect(btn.textContent).toBe(S().USE_REPLACE.replace('{pen}', 'Pen 1'));
    try { click(btn); } finally { app.pushHistory = push; app.setProjectPaper = sp; app.syncPen1ToPaper = sy; }
    expect(pushes).toBe(1);
    expect(app.history.length).toBe(histBefore + 1);
    expect(SETTINGS.pens).toHaveLength(count);
    expect(SETTINGS.pens[0].id).toBe('pen-1');
    expect(SETTINGS.pens[0].model).toBeTruthy();
    expect(setPaper).not.toHaveBeenCalled();
    expect(sync).not.toHaveBeenCalled();
    expect(JSON.stringify(SETTINGS.paper)).toBe(paperBefore);
  });

  test('m1: a newer stored document is kept untouched and the Studio says why', () => {
    try { handle.close(); } catch (_e) { /* closed */ }
    const newer = JSON.stringify({ schema: 'vectura-pen-studio', version: 99, pens: [], boxes: [] });
    window.localStorage.setItem(V.PEN_STUDIO.STORAGE_KEY, newer);
    reopen();
    expect(q('.pen-studio-note').textContent).toBe(S().ERR_NEWER);
    click(q('.pen-studio-new-box'));
    expect(window.localStorage.getItem(V.PEN_STUDIO.STORAGE_KEY)).toBe(newer);
  });
});
