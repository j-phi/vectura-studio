/*
 * Pen Studio box list (unit E): create, pin sort, collapse, add pen,
 * select / rename rows, remove pen, delete box, export.
 */
const { setupStudio } = require('../../helpers/pen-studio-stubs');

describe('Pen Studio boxes', () => {
  let t;
  let ctx;
  beforeEach(() => {
    t = setupStudio();
    t.studio.open({ app: t.app });
    ctx = t.calls.lab[0].ctx;
  });
  afterEach(() => { t.studio._reset(); t.cleanup(); });

  const names = () => t.qa('.pen-studio-box-name').map((e) => e.textContent);

  test('lists boxes pinned first and shows owned sizes, faint and tuned markers', () => {
    expect(names()).toEqual(['Night papers', 'Micron set', 'Studio inks']);
    const sepia = t.q('[data-pen-id="sp-sepia"] .pen-studio-row-note');
    expect(sepia.textContent).toBe('05 ✎');
    const black = t.q('[data-pen-id="sp-black"] .pen-studio-row-note');
    expect(black.textContent).toBe('005 05');
    // closed box renders no rows
    expect(t.q('[data-pen-id="sp-navy"]')).toBeNull();
  });


  test('faint pens are flagged against the current paper', () => {
    expect(t.q('[data-pen-id="sp-white"] .pen-studio-row-note').textContent).toBe('faint');
    ctx.set({ paperType: 'black-stock' });
    expect(t.q('[data-pen-id="sp-white"] .pen-studio-row-note').textContent).toBe('05');
  });

  test('pin moves a box to the top; unpin returns it', () => {
    t.click(t.q('[data-box-id="box-a"] .pen-studio-box-pin'));
    expect(names().slice(0, 2)).toEqual(['Micron set', 'Night papers']);
    t.click(t.q('[data-box-id="box-a"] .pen-studio-box-pin'));
    expect(names()[0]).toBe('Night papers');
    expect(t.q('[data-box-id="box-a"] .pen-studio-box-pin').getAttribute('aria-label')).toBe('Pin Micron set');
  });

  test('collapse and expand persist in the doc', () => {
    t.click(t.q('[data-box-id="box-a"] .pen-studio-box-toggle'));
    expect(t.q('[data-box-id="box-a"] .pen-studio-rows')).toBeNull();
    expect(t.storage.saved.boxes.find((b) => b.id === 'box-a').open).toBe(false);
    t.click(t.q('[data-box-id="box-c"] .pen-studio-box-toggle'));
    expect(t.q('[data-pen-id="sp-navy"]')).toBeTruthy();
  });

  test('new box appends "My box n" and is empty', () => {
    t.click(t.byText('.pen-studio-new-box', 'New box'));
    const box = ctx.getDoc().boxes[3];
    expect(box.name).toBe('My box 4');
    expect(t.q(`[data-box-id="${box.id}"] .pen-studio-box-empty`)).toBeTruthy();
  });

  test('clicking a row selects it and resets test size, comp and note', () => {
    ctx.set({ testSize: '08', comp: { id: 'x' }, note: { text: 'hi', tone: 'ok' } });
    t.click(t.q('[data-pen-id="sp-sepia"] .pen-studio-row-main'));
    const st = ctx.getState();
    expect(st.selPenId).toBe('sp-sepia');
    expect(st.selBoxId).toBe('box-a');
    expect(st.testSize).toBeNull();
    expect(st.comp).toBeNull();
    expect(st.note).toBeNull();
    expect(t.q('[data-pen-id="sp-sepia"]').classList.contains('is-selected')).toBe(true);
  });

  test('clicking the selected row renames it (draft name, Enter commits, Esc cancels)', () => {
    t.click(t.q('[data-pen-id="sp-sepia"] .pen-studio-row-main'));
    t.click(t.q('[data-pen-id="sp-sepia"] .pen-studio-row-main'));
    let input = t.q('.pen-studio-row-edit');
    expect(input.value).toBe('Micron Sepia');
    t.type(input, 'Umber');
    t.key(input, 'Enter');
    expect(ctx.getState().drafts['sp-sepia'].name).toBe('Umber');
    expect(t.q('[data-pen-id="sp-sepia"] .pen-studio-row-name').textContent).toBe('Umber');
    expect(t.q('[data-pen-id="sp-sepia"] .pen-studio-row-note').textContent).toContain('unsaved');
    t.click(t.q('[data-pen-id="sp-sepia"] .pen-studio-row-main'));
    input = t.q('.pen-studio-row-edit');
    t.type(input, 'Nope');
    t.key(input, 'Escape');
    expect(t.q('.pen-studio-row-edit')).toBeNull();
    expect(ctx.getState().drafts['sp-sepia'].name).toBe('Umber');
    expect(t.studio.isOpen()).toBe(true);
  });

  test('remove pen drops it, its draft, and moves selection', () => {
    t.click(t.q('[data-pen-id="sp-white"] .pen-studio-row-remove'));
    expect(ctx.getDoc().pens.find((p) => p.id === 'sp-white')).toBeUndefined();
    expect(ctx.getState().selPenId).not.toBe('sp-white');
    expect(ctx.getState().selPenId).toBeTruthy();
  });

  test('delete box needs a second click', () => {
    const del = () => t.q('[data-box-id="box-c"] .pen-studio-box-delete');
    t.click(del());
    expect(ctx.getDoc().boxes.some((b) => b.id === 'box-c')).toBe(true);
    expect(del().classList.contains('is-armed')).toBe(true);
    t.click(del());
    expect(ctx.getDoc().boxes.some((b) => b.id === 'box-c')).toBe(false);
  });

  test('deleting the last pen of the Studio shows the empty state and hides lab / pair', () => {
    ['box-a', 'box-b', 'box-c'].forEach((id) => {
      const del = () => t.q(`[data-box-id="${id}"] .pen-studio-box-delete`);
      t.click(del()); t.click(del());
    });
    expect(ctx.getState().selPenId).toBeNull();
    expect(t.q('.pen-studio-empty')).toBeTruthy();
    expect(t.q('.pen-studio-lab-host').hidden).toBe(true);
  });

  test('box export opens the export dialog with the file text', () => {
    t.click(t.q('[data-box-id="box-a"] .pen-studio-box-export'));
    expect(ctx.getState().overlay.kind).toBe('export');
    const parsed = JSON.parse(t.q('.pen-studio-dialog textarea').value);
    expect(parsed.box.name).toBe('Micron set');
    expect(parsed.pens).toHaveLength(3); // 005 + 05 black, 05 sepia
  });

  test('the + button opens the add-pen dialog for that box', () => {
    t.click(t.q('[data-box-id="box-a"] .pen-studio-box-add'));
    expect(ctx.getState().overlay).toMatchObject({ kind: 'add', boxId: 'box-a' });
    expect(t.q('.pen-studio-dialog-title').textContent).toContain('Micron set');
  });

  test('import opens the import dialog', () => {
    t.click(t.byText('.pen-studio-import-box', 'Import box'));
    expect(ctx.getState().overlay.kind).toBe('import');
  });
});
