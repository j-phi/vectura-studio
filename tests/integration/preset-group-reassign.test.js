const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

/*
 * Developer-mode inline group reassignment: when SETTINGS.devMode is on, every
 * preset option in the gallery popover gains a compact group <select> (before the
 * delete X) that moves the preset to another category. Changing it writes a
 * localStorage entry carrying the new group (a mutation for a user/override
 * preset, a fresh shadow entry for a built-in), bumps savedAt for last-write-wins,
 * and re-renders so the option relocates under its new header. A "+ New group…"
 * sentinel prompts for a brand-new category. Gated entirely on devMode — non-dev
 * galleries render no group select.
 */
describe('Preset gallery — dev-mode inline group reassignment', () => {
  let runtime, window, document, app;

  const selects = () => Array.from(document.querySelectorAll('.hg-preset-group-select'));
  const selectFor = (id) =>
    document.querySelector(`.hg-preset-option[data-preset-id="${id}"] .hg-preset-group-select`);
  const option = (id) => document.querySelector(`.hg-preset-option[data-preset-id="${id}"]`);
  const userPresets = (sys) =>
    JSON.parse(window.localStorage.getItem(`vectura.user_presets.${sys}`) || '[]');
  const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));
  const groupTitles = () =>
    Array.from(document.querySelectorAll('.hg-preset-group-title')).map((e) => e.textContent.trim());
  // The group section header text that owns a given option (post-relocation check).
  const sectionGroupOf = (id) => {
    const sec = option(id) && option(id).closest('.hg-preset-group');
    const title = sec && sec.querySelector('.hg-preset-group-title');
    return title ? title.textContent.trim() : null;
  };

  const mount = async (layerType, { devMode = true } = {}) => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.localStorage.clear();
    window.Vectura.SETTINGS.devMode = devMode;
    window.app = new window.Vectura.App();
    app = window.app;
    app.engine.addLayer(layerType);
    app.ui.renderLayers();
    app.ui.buildControls();
  };

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  test('non-dev mode renders NO group select on any option', async () => {
    await mount('flowfield', { devMode: false });
    expect(selects().length).toBe(0);
  });

  test('dev mode renders a group select on each preset option, current group selected, with a + New group sentinel', async () => {
    await mount('flowfield');
    const opts = Array.from(
      document.querySelectorAll('.hg-preset-option[data-preset-id]:not([data-preset-id="custom"])')
    );
    expect(opts.length).toBeGreaterThanOrEqual(4);
    opts.forEach((o) => expect(o.querySelector('.hg-preset-group-select')).toBeTruthy());

    const sel = selectFor('flowfield-storm-cell');
    expect(sel).toBeTruthy();
    // The select's value equals the preset's actual group, and the option lives
    // under that same header.
    expect(sel.value).toBe(sectionGroupOf('flowfield-storm-cell'));
    // A "+ New group…" sentinel is always the last option.
    const vals = Array.from(sel.options).map((o) => o.value);
    expect(vals[vals.length - 1]).toBe('__new__');
  });

  test('reassigning a built-in writes a shadow entry under its id with the new group and relocates the row', async () => {
    await mount('flowfield');
    const sel = selectFor('flowfield-storm-cell');
    const fromGroup = sel.value;
    // Pick any canonical group different from the current one.
    const target = ['Classic', 'Geometric', 'Organic', 'Complex', 'Evolving', 'User']
      .find((g) => g !== fromGroup);
    expect(target).toBeTruthy();

    sel.value = target;
    fire(sel, 'change');

    // A localStorage shadow now carries the new group under the built-in's id.
    const shadow = userPresets('flowfield').find((p) => p.id === 'flowfield-storm-cell');
    expect(shadow).toBeTruthy();
    expect(shadow.group).toBe(target);
    expect(shadow.savedAt).toBeGreaterThan(0);
    // Exactly one option for that id (override shadows the built-in, not duplicated)…
    expect(document.querySelectorAll('.hg-preset-option[data-preset-id="flowfield-storm-cell"]').length).toBe(1);
    // …and it now sits under the target group header.
    expect(sectionGroupOf('flowfield-storm-cell')).toBe(target);
  });

  test('reassigning twice mutates the same entry in place (no duplicate) and bumps savedAt', async () => {
    await mount('flowfield');
    selectFor('flowfield-storm-cell').value = 'Geometric';
    fire(selectFor('flowfield-storm-cell'), 'change');
    const first = userPresets('flowfield').filter((p) => p.id === 'flowfield-storm-cell');
    expect(first.length).toBe(1);

    selectFor('flowfield-storm-cell').value = 'Organic';
    fire(selectFor('flowfield-storm-cell'), 'change');
    const second = userPresets('flowfield').filter((p) => p.id === 'flowfield-storm-cell');
    expect(second.length).toBe(1);
    expect(second[0].group).toBe('Organic');
    expect(second[0].savedAt).toBeGreaterThanOrEqual(first[0].savedAt);
  });

  // The "+ New group…" sentinel now opens the skinned UI.overlays.Prompt dialog
  // (async) instead of the native window.prompt. Helpers to drive it:
  const promptBackdrop = () => document.querySelector('.vectura-modal-backdrop');
  const promptInput = () => promptBackdrop()?.querySelector('input[type="text"]');
  const promptButtons = () => promptBackdrop()?.querySelectorAll('.vectura-dialog-footer button') || [];
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  test('+ New group… opens a prompt dialog; confirming a name relocates the preset into a brand-new section', async () => {
    await mount('flowfield');

    const sel = selectFor('flowfield-storm-cell');
    sel.value = '__new__';
    fire(sel, 'change');

    // Skinned prompt dialog is open — no native window.prompt involved.
    expect(promptBackdrop()).toBeTruthy();
    promptInput().value = 'My Lab';
    promptButtons()[1].click(); // OK
    await flush(); // let the promise resolution path run

    expect(userPresets('flowfield').find((p) => p.id === 'flowfield-storm-cell').group).toBe('My Lab');
    expect(groupTitles()).toContain('My Lab');
    expect(sectionGroupOf('flowfield-storm-cell')).toBe('My Lab');
  });

  test('+ New group… cancelled via the dialog is a no-op (select reverts, group unchanged)', async () => {
    await mount('flowfield');

    const sel = selectFor('flowfield-storm-cell');
    const before = sel.value;
    sel.value = '__new__';
    fire(sel, 'change');

    expect(promptBackdrop()).toBeTruthy();
    promptButtons()[0].click(); // Cancel
    await flush();

    // No shadow written, select snapped back to the original group.
    expect(userPresets('flowfield').find((p) => p.id === 'flowfield-storm-cell')).toBeFalsy();
    expect(selectFor('flowfield-storm-cell').value).toBe(before);
  });

  test('+ New group… confirmed with an empty name is a no-op (select reverts)', async () => {
    await mount('flowfield');

    const sel = selectFor('flowfield-storm-cell');
    const before = sel.value;
    sel.value = '__new__';
    fire(sel, 'change');

    promptInput().value = '   ';
    promptButtons()[1].click(); // OK with whitespace-only name
    await flush();

    expect(userPresets('flowfield').find((p) => p.id === 'flowfield-storm-cell')).toBeFalsy();
    expect(selectFor('flowfield-storm-cell').value).toBe(before);
  });
});
