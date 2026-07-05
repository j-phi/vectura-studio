/*
 * Integration tests for the All Tools drawer (Phase 3 Lane L — TLD-1/2).
 *
 *   TLD-1  overflow "…" affordance opens a non-modal "All Tools" drawer listing
 *          every tool (incl. sub-tool variants) grouped by category, with a
 *          grid/list view toggle persisted in SETTINGS; clicking an entry
 *          activates the tool (rail slot updates) and the drawer STAYS open;
 *          clicking the canvas closes it; every registered tool appears once.
 *   TLD-2  hovering an entry rings the rail slot its tool lives in.
 *
 * The drawer's config + module <script> tags are added to index.html by the
 * phase integrator at merge (Lane L does not own index.html), so the runtime
 * loader won't pick them up — inject them into the same jsdom window (mirrors
 * tests/integration/isolation-breadcrumb.test.js), then call attach() the way
 * initToolBar would once the tags exist.
 */
const fs = require('fs');
const path = require('path');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const CONFIG_PATH = path.resolve(__dirname, '../../src/config/tool-drawer.js');
const MODULE_PATH = path.resolve(__dirname, '../../src/ui/shell/tool-drawer.js');

const injectScript = (window, filePath) => {
  const code = fs.readFileSync(filePath, 'utf8');
  const runner = new Function(
    'window', 'document', 'globalThis',
    'requestAnimationFrame', 'cancelAnimationFrame',
    'setTimeout', 'clearTimeout', 'performance',
    code
  );
  runner(
    window,
    window.document,
    window,
    window.requestAnimationFrame,
    window.cancelAnimationFrame,
    window.setTimeout.bind(window),
    window.clearTimeout.bind(window),
    window.performance || { now: () => Date.now() }
  );
};

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('All Tools drawer (TLD-1 / TLD-2)', () => {
  let runtime, window, document, app, ToolDrawer;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    if (typeof document.elementFromPoint !== 'function') {
      document.elementFromPoint = () => null;
    }
    // Boot the app first (initToolBar runs here; ToolDrawer not yet defined, so
    // its optional-chained attach() no-ops — proving late-load tolerance).
    window.app = new window.Vectura.App();
    app = window.app;
    // Now the integrator's script tags become available:
    injectScript(window, CONFIG_PATH);
    injectScript(window, MODULE_PATH);
    ToolDrawer = window.Vectura.UI.ToolDrawer;
    ToolDrawer.attach(app.ui);
    await Promise.resolve();
  });

  afterAll(() => {
    try { window?.Vectura?.UI?.ToolDrawer?.destroy?.(); } catch (_) {}
    runtime?.cleanup?.();
    runtime = null;
  });

  beforeEach(() => {
    ToolDrawer.close();
    app.ui.setActiveTool?.('select');
  });

  const overflowBtn = () => document.getElementById('tool-overflow-btn');
  const drawer = () => document.getElementById('tool-drawer');
  const items = () => Array.from(document.querySelectorAll('.tool-drawer-item'));
  const itemFor = (id) => document.querySelector(`.tool-drawer-item[data-tool-id="${id}"]`);

  // ── module late-load tolerance ─────────────────────────────────────────────
  test('initToolBar tolerated the drawer module being undefined at boot', () => {
    // App booted before the module was injected; no throw, drawer wired on
    // explicit attach afterward.
    expect(typeof ToolDrawer.attach).toBe('function');
    expect(overflowBtn()).not.toBeNull();
  });

  // ── TLD-1: overflow affordance + open/close ────────────────────────────────
  describe('overflow affordance', () => {
    test('injects a "…" overflow button into the tool rail, above the footer', () => {
      const btn = overflowBtn();
      expect(btn).not.toBeNull();
      expect(btn.closest('#tool-bar')).not.toBeNull();
      const footer = document.querySelector('#tool-bar .toolbar-footer');
      if (footer) {
        // overflow precedes footer in DOM order
        expect(btn.compareDocumentPosition(footer) & window.Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      }
    });

    test('clicking the overflow button toggles the drawer open then closed', () => {
      expect(ToolDrawer.isOpen()).toBe(false);
      overflowBtn().click();
      expect(ToolDrawer.isOpen()).toBe(true);
      expect(drawer().classList.contains('hidden')).toBe(false);
      overflowBtn().click();
      expect(ToolDrawer.isOpen()).toBe(false);
      expect(drawer().classList.contains('hidden')).toBe(true);
    });

    test('drawer is titled "All Tools"', () => {
      ToolDrawer.open(app.ui);
      expect(document.querySelector('.tool-drawer-title').textContent).toBe('All Tools');
      expect(drawer().getAttribute('aria-label')).toBe('All Tools');
    });
  });

  // ── TLD-1: category headers + full inventory ───────────────────────────────
  describe('inventory', () => {
    test('renders the six category headers in order', () => {
      const labels = Array.from(document.querySelectorAll('.tool-drawer-category-label'))
        .map((el) => el.textContent);
      expect(labels).toEqual(['Select', 'Draw', 'Shapes', 'Type', 'Modify', 'Navigate']);
    });

    test('every registered tool appears exactly once (derived from the rail registry)', () => {
      const defs = app.ui.getSharedToolbarDefinitions();
      // The bare shape/pen/scissor keys are rail-slot placeholder buttons; the
      // drawer lists their selectable sub-tool variants instead. Everything else
      // (incl. `fill`, which is itself a real tool) must appear exactly once.
      const PLACEHOLDERS = ['shape', 'pen', 'scissor'];
      const expected = Object.keys(defs).filter((k) => !PLACEHOLDERS.includes(k)).sort();
      const drawerIds = items().map((el) => el.dataset.toolId).sort();
      // no duplicates
      expect(new Set(drawerIds).size).toBe(drawerIds.length);
      expect(drawerIds).toEqual(expected);
    });

    test('entry tooltip + aria-label come from the rail registry label (name + shortcut)', () => {
      const defs = app.ui.getSharedToolbarDefinitions();
      const selectItem = itemFor('select');
      expect(selectItem.title).toBe(defs.select.label); // "Selection (V)"
      expect(selectItem.getAttribute('aria-label')).toBe(defs.select.label);
      expect(itemFor('shape-rect').title).toBe(defs['shape-rect'].label); // "Rectangle (M)"
    });
  });

  // ── TLD-1: activation semantics ────────────────────────────────────────────
  describe('activation', () => {
    test('clicking a flat tool entry activates it and keeps the drawer open', () => {
      ToolDrawer.open(app.ui);
      itemFor('lasso').click();
      expect(app.ui.activeTool).toBe('lasso');
      expect(ToolDrawer.isOpen()).toBe(true);
    });

    test('clicking a shape kind activates the shape sub-tool', () => {
      itemFor('shape-line').click();
      expect(app.ui.activeTool).toBe('shape-line');
    });

    test('clicking a pen mode sets pen tool + pen mode (flyout semantics)', () => {
      itemFor('pen-add').click();
      expect(app.ui.activeTool).toBe('pen');
      expect(app.ui.penMode).toBe('add');
    });

    test('clicking a scissor mode sets scissor tool + scissor mode', () => {
      itemFor('scissor-rect').click();
      expect(app.ui.activeTool).toBe('scissor');
      expect(app.ui.scissorMode).toBe('rect');
    });

    test('clicking a fill mode sets the fill sub-tool', () => {
      itemFor('fill-erase').click();
      expect(app.ui.activeTool).toBe('fill-erase');
    });

    test('the active entry is marked to match the current tool', () => {
      app.ui.setActiveTool('direct');
      ToolDrawer.open(app.ui);
      expect(itemFor('direct').classList.contains('active')).toBe(true);
      expect(itemFor('select').classList.contains('active')).toBe(false);
    });
  });

  // ── TLD-1: canvas click closes ─────────────────────────────────────────────
  test('clicking the canvas closes the drawer', () => {
    ToolDrawer.open(app.ui);
    expect(ToolDrawer.isOpen()).toBe(true);
    document.getElementById('main-canvas')
      .dispatchEvent(new window.MouseEvent('pointerdown', { button: 0, bubbles: true }));
    expect(ToolDrawer.isOpen()).toBe(false);
  });

  // ── TLD-1: grid/list view toggle persisted in SETTINGS ─────────────────────
  describe('grid/list view toggle', () => {
    test('defaults to grid view', () => {
      expect(ToolDrawer.getView()).toBe('grid');
      ToolDrawer.open(app.ui);
      expect(drawer().dataset.view).toBe('grid');
    });

    test('switching to list persists SETTINGS.toolDrawerView and updates the DOM', () => {
      ToolDrawer.setView('list');
      expect(window.Vectura.SETTINGS.toolDrawerView).toBe('list');
      expect(drawer().dataset.view).toBe('list');
      const listBtn = drawer().querySelector('.tool-drawer-view-btn[data-view="list"]');
      expect(listBtn.classList.contains('active')).toBe(true);
      // restore
      ToolDrawer.setView('grid');
      expect(window.Vectura.SETTINGS.toolDrawerView).toBe('grid');
    });
  });

  // ── TLD-2: docked-slot cross-highlight ─────────────────────────────────────
  describe('rail cross-highlight', () => {
    const railSlot = (sel) => document.querySelector(sel);

    test('hovering a flat-tool entry rings its rail slot; leaving clears it', () => {
      ToolDrawer.open(app.ui);
      const slot = railSlot('.tool-btn[data-tool="select"]');
      itemFor('select').dispatchEvent(new window.MouseEvent('mouseenter', { bubbles: true }));
      expect(slot.classList.contains('tool-drawer-rail-highlight')).toBe(true);
      itemFor('select').dispatchEvent(new window.MouseEvent('mouseleave', { bubbles: true }));
      expect(slot.classList.contains('tool-drawer-rail-highlight')).toBe(false);
    });

    test('a sub-tool entry rings the group rail slot it lives in', () => {
      ToolDrawer.open(app.ui);
      const penSlot = railSlot('.tool-btn[data-tool="pen"]');
      itemFor('pen-add').dispatchEvent(new window.MouseEvent('mouseenter', { bubbles: true }));
      expect(penSlot.classList.contains('tool-drawer-rail-highlight')).toBe(true);
      itemFor('pen-add').dispatchEvent(new window.MouseEvent('mouseleave', { bubbles: true }));

      const fillSlot = railSlot('.tool-btn[data-tool="fill"]');
      itemFor('fill-erase').dispatchEvent(new window.MouseEvent('mouseenter', { bubbles: true }));
      expect(fillSlot.classList.contains('tool-drawer-rail-highlight')).toBe(true);
    });

    test('the light-source entry targets the #btn-light-source rail slot', () => {
      expect(itemFor('light-source').dataset.railSelector).toBe('#btn-light-source');
    });
  });
});
