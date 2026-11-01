/*
 * Pen Studio shell (unit E): open / close, Esc layering, focus restore,
 * three-column mount, ctx contract and the header's click-to-edit fields.
 * Runs against the in-memory fakes in tests/helpers/pen-studio-stubs.js.
 */
const { setupStudio } = require('../../helpers/pen-studio-stubs');

describe('Pen Studio shell', () => {
  let t;
  beforeEach(() => { t = setupStudio(); });
  afterEach(() => { t.studio._reset(); t.cleanup(); });

  test('open mounts a pen-studio modal with boxes, lab and pair; close tears down', () => {
    const trigger = t.document.createElement('button');
    t.document.body.appendChild(trigger);
    trigger.focus();
    const handle = t.studio.open({ app: t.app, anchorEl: trigger });
    expect(t.studio.isOpen()).toBe(true);
    expect(t.q('.vectura-modal.pen-studio')).toBeTruthy();
    expect(t.q('.pen-studio-boxes .pen-studio-box')).toBeTruthy();
    expect(t.calls.lab).toHaveLength(1);
    expect(t.calls.pair).toHaveLength(1);
    handle.close();
    expect(t.studio.isOpen()).toBe(false);
    expect(t.q('.pen-studio')).toBeNull();
    expect(t.calls.lab[0].destroyed).toBe(true);
    expect(t.calls.pair[0].destroyed).toBe(true);
    expect(t.document.activeElement).toBe(trigger);
  });

  test('Esc closes the Studio; with a dialog open it closes only the dialog', () => {
    t.studio.open({ app: t.app });
    t.calls.lab[0].ctx.set({ overlay: { kind: 'saveNew' } });
    expect(t.q('.pen-studio-dialog')).toBeTruthy();
    t.key(t.q('.pen-studio-savenew-name'), 'Escape');
    expect(t.q('.pen-studio-dialog')).toBeNull();
    expect(t.studio.isOpen()).toBe(true);
    t.key(t.document.body, 'Escape');
    expect(t.studio.isOpen()).toBe(false);
  });

  test('selects the first pen of the first (pinned) box and exposes the ctx contract', () => {
    t.studio.open({ app: t.app });
    const ctx = t.calls.lab[0].ctx;
    expect(ctx.getState().selPenId).toBe('sp-white'); // Night papers is pinned
    expect(ctx.getState().paperType).toBe('bristol-smooth');
    expect(typeof ctx.getDoc().schema).toBe('string');
    ['setDoc', 'set', 'getState', 'L', 'cfg'].forEach((k) => expect(typeof ctx[k]).toBe('function'));
    const updatesBefore = t.calls.lab[0].updates;
    ctx.set({ view: 'all' });
    expect(ctx.getState().view).toBe('all');
    expect(t.calls.lab[0].updates).toBe(updatesBefore + 1);
    expect(t.calls.pair[0].updates).toBeGreaterThan(0);
  });

  test('setDoc persists through the store and re-renders', () => {
    t.studio.open({ app: t.app });
    const ctx = t.calls.lab[0].ctx;
    const next = t.Store.setPinned(ctx.getDoc(), 'box-a', true);
    ctx.setDoc(next);
    expect(t.storage.saved.boxes.find((b) => b.id === 'box-a').pinned).toBe(true);
    expect(t.qa('.pen-studio-box')[0].getAttribute('data-box-id')).toBe('box-a');
  });

  test('a failed save keeps the edit in memory and shows a note', () => {
    t.studio.open({ app: t.app });
    t.storage.failSave = 'quota';
    const ctx = t.calls.lab[0].ctx;
    ctx.setDoc(t.Store.setPinned(ctx.getDoc(), 'box-a', true));
    expect(t.q('.pen-studio-note').textContent).toMatch(/storage/i);
    expect(ctx.getDoc().boxes.find((b) => b.id === 'box-a').pinned).toBe(true);
  });

  test('name: click to edit, Enter commits a draft name, Esc reverts', () => {
    t.studio.open({ app: t.app });
    const ctx = t.calls.lab[0].ctx;
    t.click(t.q('.pen-studio-name'));
    let input = t.q('input.pen-studio-name');
    expect(input.value).toBe('Gelly White');
    t.type(input, 'Snow');
    t.key(input, 'Enter');
    expect(ctx.getState().drafts['sp-white'].name).toBe('Snow');
    expect(t.q('.pen-studio-name').textContent).toBe('Snow');
    expect(t.q('.pen-studio-unsaved')).toBeTruthy();
    t.click(t.q('.pen-studio-name'));
    input = t.q('input.pen-studio-name');
    t.type(input, 'Zzz');
    t.key(input, 'Escape');
    expect(t.q('input.pen-studio-name')).toBeNull();
    expect(ctx.getState().drafts['sp-white'].name).toBe('Snow');
    expect(t.studio.isOpen()).toBe(true);
  });

  test('description: Enter commits, an empty value falls back to the model description', () => {
    t.studio.open({ app: t.app });
    const ctx = t.calls.lab[0].ctx;
    t.click(t.q('.pen-studio-desc'));
    const input = t.q('input.pen-studio-desc');
    t.type(input, 'Opaque white for black stock');
    t.key(input, 'Enter');
    expect(ctx.getState().drafts['sp-white'].desc).toBe('Opaque white for black stock');
    t.click(t.q('.pen-studio-desc'));
    const again = t.q('input.pen-studio-desc');
    t.type(again, 'Gelly Roll · opaque gel');
    t.key(again, 'Enter');
    expect(ctx.getState().drafts['sp-white'].desc).toBeUndefined();
  });

  test('move to box keeps the pen selected in its new box', () => {
    t.studio.open({ app: t.app });
    const ctx = t.calls.lab[0].ctx;
    const sel = t.q('.pen-studio-move');
    sel.value = 'box-a';
    sel.dispatchEvent(new t.window.Event('change', { bubbles: true }));
    expect(t.Store.boxOf(ctx.getDoc(), 'sp-white').id).toBe('box-a');
    expect(ctx.getState().selBoxId).toBe('box-a');
  });

  test('works without lab / pair views loaded', () => {
    t.studio._reset();
    t.cleanup();
    t = setupStudio({ noSubviews: true });
    expect(() => t.studio.open({ app: t.app })).not.toThrow();
    expect(t.q('.pen-studio-boxes .pen-studio-box')).toBeTruthy();
  });
});
