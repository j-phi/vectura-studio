const fs = require('fs');
const path = require('path');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

// TUX-012 (D6 desktop parity + touch template contract), jsdom.
// Coarse pointer = false: renderLayers output must be what it was before TUX-012
// (no .lvl-grip, no .lvl-more, same inline .lvl-ab titles per row).
// Coarse pointer = true: grip + ⋯ on every row, secondary actions only in the ⋯ menu.
const FIXTURE = path.join(__dirname, '..', 'fixtures', 'touch', 'layers-mixed.vectura');
const waitForUi = () => new Promise((resolve) => setTimeout(resolve, 80));

// Inline .lvl-ab titles the desktop template rendered BEFORE TUX-012 (snapshotted from
// the pre-change build against the same fixture).
const DESKTOP_TITLES = {
  'Spiral': ['Expand into group', 'Duplicate (⌘D)', 'Delete'],
  'Flowfield': ['Expand into group', 'Duplicate (⌘D)', 'Delete'],
  'Text': ['Expand into group', 'Duplicate (⌘D)', 'Delete'],
  'Petalis Designer': ['Make clipping mask — clips layer below', 'Expand into group', 'Duplicate (⌘D)', 'Delete'],
  'A very long layer name 12345678901234567': ['Expand into group', 'Duplicate (⌘D)', 'Delete'],
  'Locked Spiral': ['Expand into group', 'Duplicate (⌘D)', 'Delete'],
  'Layer Group': ['Ungroup (⌘⇧G)', 'Duplicate group', 'Delete group'],
  'Group Child': ['Expand into group', 'Duplicate (⌘D)', 'Delete'],
  'Mirror Modifier': ['Expand to folder', 'Ungroup (⌘⇧G)', 'Duplicate group', 'Delete group'],
  'Mirror Child': ['Expand into group', 'Duplicate (⌘D)', 'Delete'],
  '3D Scene': ['Add box (right-click for more shapes)', 'Add light', 'Add ground', 'Ungroup (⌘⇧G)', 'Duplicate group', 'Delete group'],
  'Box': ['Expand into group', 'Duplicate (⌘D)', 'Delete'],
  'Sphere': ['Expand into group', 'Duplicate (⌘D)', 'Delete'],
  'Boolean': ['Ungroup (⌘⇧G)', 'Duplicate group', 'Delete group'],
  'Cone': ['Expand into group', 'Duplicate (⌘D)', 'Delete'],
  'Mask Source': ['Remove clipping mask (click to deactivate)', 'Hide mask layer outline', 'Duplicate (⌘D)', 'Delete'],
  'Masked Spiral': ['Expand into group', 'Duplicate (⌘D)', 'Delete'],
  'Filled Shape': ['Make clipping mask — clips layer below', 'Expand 1 fill into a group', 'Duplicate (⌘D)', 'Delete'],
  'Baked Fill': ['Make clipping mask — clips layer below', 'Explode fill into 1 path', 'Duplicate (⌘D)', 'Delete'],
};

// Menu keys every row must expose on touch (superset check against the desktop strip).
const KEYS_FOR_TITLE = [
  [/clipping mask/i, 'mask-toggle'],
  [/mask layer outline/i, 'mask-outline'],
  [/^Expand into group/, 'expand-into-group'],
  [/^Expand \d+ fill/, 'expand-fill'],
  [/^Explode fill/, 'explode-fill'],
  [/^Duplicate/, 'duplicate'],
  [/^Delete/, 'delete'],
  [/^Ungroup/, 'ungroup'],
  [/^Expand to folder/, 'expand-modifier'],
  [/^Add box/, 'scene-add-object'],
  [/^Add light/, 'scene-add-light'],
  [/^Add ground/, 'scene-add-ground'],
];

describe('TUX-012 layer rows: desktop parity + touch template', () => {
  let runtime;
  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  const boot = async (coarse) => {
    runtime = await loadVecturaRuntime({ includeRenderer: true, includeUi: true, includeApp: true, useIndexHtml: true });
    const { window } = runtime;
    window.matchMedia = (q) => ({
      matches: coarse && /pointer:\s*coarse/.test(String(q)),
      media: String(q),
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    });
    window.app = new window.Vectura.App();
    await waitForUi();
    const doc = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    window.app.applyState(doc.state);
    const locked = window.app.engine.layers.find((l) => l.name === 'Locked Spiral');
    window.app.ui.layerLockedIds.add(locked.id);
    window.app.ui.renderLayers();
    await waitForUi();
    return window;
  };

  const rows = (window) => [...window.document.querySelectorAll('#layer-list [data-lvl-id]')];
  const nameOf = (row) => row.querySelector('.lvl-name, .lvl-grp-name')?.textContent;

  test('desktop (coarse=false): no grip, no more button, inline titles unchanged', async () => {
    const window = await boot(false);
    const list = rows(window);
    expect(list.length).toBeGreaterThanOrEqual(19);
    expect(window.document.querySelector('#layer-list .lvl-grip')).toBeNull();
    expect(window.document.querySelector('#layer-list .lvl-more')).toBeNull();
    const got = {};
    list.forEach((row) => { got[nameOf(row)] = [...row.querySelectorAll('.lvl-ab')].map((b) => b.title); });
    expect(got).toEqual(DESKTOP_TITLES);
  });

  test('touch (coarse=true): grip and more on every row, secondary actions only in the menu', async () => {
    const window = await boot(true);
    const list = rows(window);
    expect(list.length).toBeGreaterThanOrEqual(19);
    const LayerContext = window.Vectura.UI.Menus.LayerContext;
    list.forEach((row) => {
      const name = nameOf(row);
      expect(row.querySelector('.lvl-grip'), `${name} grip`).toBeTruthy();
      expect(row.querySelector('.lvl-more'), `${name} more`).toBeTruthy();
      // Only the ⋯ may remain in the .lvl-ab family on touch.
      const inline = [...row.querySelectorAll('.lvl-ab')].filter((b) => !b.classList.contains('lvl-more'));
      expect(inline.map((b) => b.title), `${name} inline secondary actions`).toEqual([]);
      const layer = window.app.engine.getLayerById(row.dataset.layerId);
      const keys = LayerContext._itemsFor(window.app.ui, layer).map((i) => i.key).filter(Boolean);
      (DESKTOP_TITLES[name] || []).forEach((title) => {
        const hit = KEYS_FOR_TITLE.find(([re]) => re.test(title));
        expect(hit, `${name}: no key for "${title}"`).toBeTruthy();
        expect(keys, `${name}: menu has ${hit[1]}`).toContain(hit[1]);
      });
    });
    // Masked card and group header both carry grip + ⋯ (named explicitly).
    const masked = rows(window).find((r) => nameOf(r) === 'Masked Spiral');
    expect(masked.classList.contains('masked-v2')).toBe(true);
    expect(masked.querySelector('.lvl-grip')).toBeTruthy();
    const hdr = rows(window).find((r) => nameOf(r) === '3D Scene');
    expect(hdr.classList.contains('lvl-grp-hdr')).toBe(true);
    expect(hdr.querySelector('.lvl-more').getAttribute('aria-label')).toMatch(/More actions for 3D Scene/);
    // Locked row still shows ⋯.
    expect(rows(window).find((r) => nameOf(r) === 'Locked Spiral').querySelector('.lvl-more')).toBeTruthy();
  });

  test('menu: light/ground leaves never offer Expand into group', async () => {
    const window = await boot(true);
    const { engine } = window.app;
    const scene = engine.layers.find((l) => l.groupType === 'scene');
    const lid = engine.addLightToScene(scene.id, 'directional');
    const gid = engine.addGroundToScene(scene.id);
    const LC = window.Vectura.UI.Menus.LayerContext;
    [lid, gid].forEach((id) => {
      const keys = LC._itemsFor(window.app.ui, engine.getLayerById(id)).map((i) => i.key);
      expect(keys).not.toContain('expand-into-group');
    });
  });
});
