/*
 * "Use in document" (unit E): replace the target document pen or add a new
 * one, always as exactly one undo step, never touching the project paper.
 */
const { setupStudio } = require('../../helpers/pen-studio-stubs');

describe('Pen Studio apply to document', () => {
  let t;
  let ctx;
  const open = (opts) => { t.studio.open({ app: t.app, ...opts }); ctx = t.calls.lab[0].ctx; };
  beforeEach(() => {
    t = setupStudio();
    t.app.engine.layers.push({ id: 'l2', penId: 'pen-other', color: '#123456', strokeWidth: 1 });
    t.app.setProjectPaper = vi.fn();
    t.app.syncPen1ToPaper = vi.fn();
  });
  afterEach(() => { t.studio._reset(); t.cleanup(); });

  test('with a target pen: one history entry, layers cascade, themeManaged cleared', () => {
    open({ penId: 'pen-1' });
    ctx.set({ selPenId: 'sp-sepia', selBoxId: 'box-a' });
    const btn = t.q('.pen-studio-use');
    expect(btn.textContent).toBe('Apply to Pen 1');
    t.click(btn);
    expect(t.app.history).toHaveLength(1);
    const pen = t.V.SETTINGS.pens[0];
    expect(pen).toMatchObject({ id: 'pen-1', name: 'Pen 1', color: '#5a3d2b', model: 'sakura-pigma-micron', size: '05' });
    expect(pen.width).toBe(0.46);
    expect(pen.ink).toEqual({ wetness: 0.5 });
    const layer = t.app.engine.layers[0];
    expect(layer.color).toBe('#5a3d2b');
    expect(layer.strokeWidth).toBe(0.46);
    expect(t.app.engine.layers[1].color).toBe('#123456');
    expect(t.app.setProjectPaper).not.toHaveBeenCalled();
    expect(t.app.syncPen1ToPaper).not.toHaveBeenCalled();
  });

  test('the tested size and unsaved draft ink are what gets applied', () => {
    open({ penId: 'pen-1' });
    ctx.set({ selPenId: 'sp-black', selBoxId: 'box-a', testSize: '005', drafts: { 'sp-black': { ink: { blobs: 1.5 } } } });
    t.click(t.q('.pen-studio-use'));
    const pen = t.V.SETTINGS.pens[0];
    expect(pen.size).toBe('005');
    expect(pen.width).toBe(0.22);
    expect(pen.ink).toEqual({ blobs: 1.5 });
  });

  test('without a target pen it adds a new, non-theme-managed pen in one history entry', () => {
    open();
    expect(t.q('.pen-studio-use').textContent).toBe('Add to document');
    t.click(t.q('.pen-studio-use'));
    expect(t.app.history).toHaveLength(1);
    const pens = t.V.SETTINGS.pens;
    expect(pens).toHaveLength(2);
    expect(pens[1]).toMatchObject({ name: 'Gelly White', color: '#f8f8f4', themeManaged: false });
    expect(pens[1].id).not.toBe('pen-1');
    // a second click now updates that pen instead of adding another
    expect(t.q('.pen-studio-use').textContent).toBe('Apply to Gelly White');
  });

  test('applying an identical pen again adds no history entry', () => {
    open();
    t.click(t.q('.pen-studio-use'));
    t.click(t.q('.pen-studio-use'));
    expect(t.app.history).toHaveLength(1);
    expect(t.V.SETTINGS.pens).toHaveLength(2);
  });

  test('open + tune + preview without apply leaves the document byte-identical', () => {
    const snap = () => JSON.stringify({ s: t.V.SETTINGS, l: t.app.engine.layers, h: t.app.history });
    const before = snap();
    open({ penId: 'pen-1' });
    ctx.set({ selPenId: 'sp-sepia', paperType: 'black-stock', view: 'all', drafts: { 'sp-sepia': { ink: { wetness: 1 } } } });
    ctx.set({ overlay: { kind: 'saveNew' } });
    t.click(t.q('.pen-studio-savenew-go'));
    t.studio.close();
    expect(snap()).toBe(before);
    expect(t.V.SETTINGS.paper.type).toBe('bristol-smooth');
  });
});
