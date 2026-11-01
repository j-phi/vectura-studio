/*
 * Pen Studio dialogs (unit E): add pen, export, import, save as new.
 */
const { setupStudio } = require('../../helpers/pen-studio-stubs');

describe('Pen Studio dialogs', () => {
  let t;
  let ctx;
  beforeEach(() => {
    t = setupStudio();
    t.studio.open({ app: t.app });
    ctx = t.calls.lab[0].ctx;
  });
  afterEach(() => { t.studio._reset(); t.cleanup(); });

  describe('add pen', () => {
    const openAdd = () => { t.click(t.q('[data-box-id="box-a"] .pen-studio-box-add')); };

    test('defaults to the first model, its first color, name and default size', () => {
      openAdd();
      expect(t.q('.pen-studio-add-model').value).toBe('sakura-pigma-micron');
      expect(t.q('.pen-studio-add-name').value).toBe('Micron Black');
      const on = t.qa('.pen-studio-size.is-on').map((b) => b.getAttribute('data-size'));
      expect(on).toEqual(['05']);
      expect(t.qa('.pen-studio-color')).toHaveLength(2);
    });

    test('color pick updates the name until the user edits it', () => {
      openAdd();
      t.click(t.qa('.pen-studio-color')[1]);
      expect(t.q('.pen-studio-add-name').value).toBe('Micron Sepia');
      t.type(t.q('.pen-studio-add-name'), 'My brown');
      t.click(t.qa('.pen-studio-color')[0]);
      expect(t.q('.pen-studio-add-name').value).toBe('My brown');
    });

    test('model switch resets colors, name and sizes; plain pens use plain colors/sizes', () => {
      openAdd();
      const sel = t.q('.pen-studio-add-model');
      sel.value = '';
      sel.dispatchEvent(new t.window.Event('change', { bubbles: true }));
      expect(t.q('.pen-studio-add-name').value).toBe('Navy');
      expect(t.qa('.pen-studio-size').map((b) => b.getAttribute('data-size'))).toEqual(['0.3', '0.5']);
    });

    test('sizes toggle but never go empty', () => {
      openAdd();
      t.click(t.q('.pen-studio-size[data-size="05"]'));
      expect(t.qa('.pen-studio-size.is-on')).toHaveLength(1);
      t.click(t.q('.pen-studio-size[data-size="005"]'));
      t.click(t.q('.pen-studio-size[data-size="05"]'));
      expect(t.qa('.pen-studio-size.is-on').map((b) => b.getAttribute('data-size'))).toEqual(['005']);
    });

    test('custom color shows a paper fit warning when the ink barely shows', () => {
      openAdd();
      const c = t.q('.pen-studio-color-custom');
      c.value = '#f4f1ea';
      c.dispatchEvent(new t.window.Event('input', { bubbles: true }));
      expect(t.q('.pen-studio-fit-warn').textContent).toContain('Bristol smooth');
      c.value = '#000000';
      c.dispatchEvent(new t.window.Event('input', { bubbles: true }));
      expect(t.q('.pen-studio-fit-warn').hidden).toBe(true);
    });

    test('confirm adds the pen to the box, selects it and closes', () => {
      openAdd();
      t.click(t.q('.pen-studio-size[data-size="005"]'));
      t.type(t.q('.pen-studio-add-name'), 'Fine black');
      t.click(t.q('.pen-studio-add-confirm'));
      expect(t.q('.pen-studio-dialog')).toBeNull();
      const doc = ctx.getDoc();
      const pen = doc.pens.find((p) => p.name === 'Fine black');
      expect(pen.model).toBe('sakura-pigma-micron');
      expect(pen.color).toBe('#1b1b1d');
      expect(doc.boxes.find((b) => b.id === 'box-a').items.find((i) => i.penId === pen.id).sizes).toEqual(['005', '05']);
      expect(ctx.getState().selPenId).toBe(pen.id);
      expect(t.q('.pen-studio-note').textContent).toContain('Fine black');
      expect(t.storage.saved.pens.some((p) => p.name === 'Fine black')).toBe(true);
    });

    test('Esc cancels without adding', () => {
      openAdd();
      const before = ctx.getDoc().pens.length;
      t.key(t.q('.pen-studio-add-name'), 'Escape');
      expect(t.q('.pen-studio-dialog')).toBeNull();
      expect(ctx.getDoc().pens).toHaveLength(before);
    });
  });

  describe('export', () => {
    test('export pen shows the file and Download saves it as JSON', () => {
      t.click(t.q('.pen-studio-export-pen'));
      const text = t.q('.pen-studio-dialog textarea').value;
      expect(JSON.parse(text).pens[0].name).toBe('Gelly White');
      t.click(t.q('.pen-studio-download'));
      expect(t.downloads).toHaveLength(1);
      expect(t.downloads[0].filename).toBe('pen.vectura-pens.json');
    });

    test('exported pen includes unsaved draft ink', () => {
      ctx.set({ drafts: { 'sp-white': { ink: { wetness: 0.9 } } } });
      t.click(t.q('.pen-studio-export-pen'));
      expect(JSON.parse(t.q('.pen-studio-dialog textarea').value).pens[0].ink.wetness).toBe(0.9);
    });
  });

  describe('import', () => {
    const openImport = () => { t.click(t.q('.pen-studio-import-box')); };
    const go = (text) => { t.type(t.q('.pen-studio-dialog textarea'), text); t.click(t.q('.pen-studio-import-go')); };

    test('invalid JSON, wrong schema, newer version and empty files show errors', () => {
      openImport();
      go('nope');
      expect(t.q('.pen-studio-msg').textContent).toMatch(/JSON/);
      go(JSON.stringify({ schema: 'other', version: 1, pens: [] }));
      expect(t.q('.pen-studio-msg').textContent).toMatch(/not a Vectura/);
      go(JSON.stringify({ schema: 'vectura-pens', version: 3, pens: [{}] }));
      expect(t.q('.pen-studio-msg').textContent).toMatch(/newer/);
      go(JSON.stringify({ schema: 'vectura-pens', version: 2, pens: [] }));
      expect(t.q('.pen-studio-msg').textContent).toMatch(/no usable pens/);
      expect(ctx.getDoc().boxes).toHaveLength(3);
    });

    test('a valid file adds an "(imported)" box and reports the count', () => {
      openImport();
      go(JSON.stringify({ schema: 'vectura-pens', version: 2, box: { name: 'Friend' }, pens: [{ name: 'A', color: '#112233', size: '0.3' }, { name: 'B', color: '#445566', size: '0.3' }] }));
      expect(ctx.getDoc().boxes[3].name).toBe('Friend (imported)');
      expect(t.q('.pen-studio-msg').textContent).toContain('2 pens');
      expect(ctx.getState().selBoxId).toBe(ctx.getDoc().boxes[3].id);
      expect(ctx.getState().selPenId).toBe(ctx.getDoc().boxes[3].items[0].penId);
      expect(t.storage.saved.boxes).toHaveLength(4);
    });

    test('typing does not rebuild the dialog (textarea keeps focus and value)', () => {
      openImport();
      const ta = t.q('.pen-studio-dialog textarea');
      t.type(ta, 'abc');
      expect(t.q('.pen-studio-dialog textarea')).toBe(ta);
    });
  });

  describe('save as new', () => {
    const open = () => ctx.set({ overlay: { kind: 'saveNew' } });

    test('prefills "<name> (custom)" and the current box; Enter saves next to the source', () => {
      ctx.set({ selPenId: 'sp-black', selBoxId: 'box-a', drafts: { 'sp-black': { ink: { wetness: 0.8 } } } });
      open();
      const name = t.q('.pen-studio-savenew-name');
      expect(name.value).toBe('Micron Black (custom)');
      expect(t.q('.pen-studio-savenew-box').value).toBe('box-a');
      t.key(name, 'Enter');
      const doc = ctx.getDoc();
      const created = doc.pens.find((p) => p.name === 'Micron Black (custom)');
      expect(created.ink.wetness).toBe(0.8);
      expect(doc.boxes.find((b) => b.id === 'box-a').items.map((i) => i.penId)).toEqual(['sp-black', created.id, 'sp-sepia']);
      expect(ctx.getState().selPenId).toBe(created.id);
      expect(ctx.getState().drafts['sp-black']).toBeUndefined();
      expect(t.q('.pen-studio-dialog')).toBeNull();
    });

    test('empty name and duplicate name (case-insensitive) show errors and keep the dialog open', () => {
      ctx.set({ selPenId: 'sp-black', selBoxId: 'box-a' });
      open();
      t.type(t.q('.pen-studio-savenew-name'), '   ');
      t.click(t.q('.pen-studio-savenew-go'));
      expect(t.q('.pen-studio-error').textContent).toMatch(/name/i);
      t.type(t.q('.pen-studio-savenew-name'), 'micron SEPIA');
      t.click(t.q('.pen-studio-savenew-go'));
      expect(t.q('.pen-studio-error').textContent).toContain('micron SEPIA');
      expect(t.q('.pen-studio-error').textContent).toContain('Micron set');
      expect(t.q('.pen-studio-dialog')).toBeTruthy();
      expect(ctx.getDoc().pens).toHaveLength(4);
      t.type(t.q('.pen-studio-savenew-name'), 'x');
      expect(t.q('.pen-studio-error').hidden).toBe(true);
    });

    test('can target another box; Cancel and Esc leave the doc alone', () => {
      ctx.set({ selPenId: 'sp-black', selBoxId: 'box-a' });
      open();
      const box = t.q('.pen-studio-savenew-box');
      box.value = 'box-c';
      box.dispatchEvent(new t.window.Event('change', { bubbles: true }));
      t.type(t.q('.pen-studio-savenew-name'), 'Elsewhere');
      t.click(t.q('.pen-studio-savenew-go'));
      expect(ctx.getDoc().boxes.find((b) => b.id === 'box-c').items).toHaveLength(2);
      open();
      t.click(t.q('.pen-studio-dialog-cancel'));
      expect(t.q('.pen-studio-dialog')).toBeNull();
      open();
      t.key(t.q('.pen-studio-savenew-name'), 'Escape');
      expect(t.q('.pen-studio-dialog')).toBeNull();
      expect(ctx.getDoc().pens).toHaveLength(5);
    });
  });
});
