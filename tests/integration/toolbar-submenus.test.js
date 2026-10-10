/*
 * Integration tests for the 5 standard toolbar subtool submenus:
 * select, shape, pen, fill, scissor — all powered by initSubtoolMenu().
 *
 * Each submenu has a 280 ms hold-to-reveal gesture. Tests cover:
 *   1. Quick tap  → onActivate fires, menu stays closed
 *   2. Hold       → menu gets .open class
 *   3. Direct click on sub-button → correct mode/tool set
 *   4. Drag-select (hold + pointerup over sub-item) → mode set, menu closes
 *   5. Outside pointerdown while open → menu closes
 *
 * Also includes a suite that verifies every top-menu-bar button ID exists
 * in the bootstrapped DOM (regression guard for HTML deletions).
 *
 * Pattern mirrors tests/integration/algo-draw-toolbar.test.js.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('toolbar subtool submenus', () => {
  let runtime, window, document, app;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    // JSDOM doesn't implement elementFromPoint; stub it so openMenu(e) doesn't
    // throw when the hold timer fires.
    if (typeof document.elementFromPoint !== 'function') {
      document.elementFromPoint = () => null;
    }
    window.app = new window.Vectura.App();
    app = window.app;
    await Promise.resolve();
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  // ── event helpers ────────────────────────────────────────────────────────

  // Fires a pointerdown(button=0) then waits ms for the hold timer to fire.
  const hold = (btn, ms = 310) => {
    btn.dispatchEvent(new window.MouseEvent('pointerdown', { button: 0, bubbles: true }));
    return new Promise((r) => setTimeout(r, ms));
  };

  // Fires pointerdown(button=0) then an immediate document-level pointerup so
  // the hold timer is cleared and onActivate() is called (quick tap path).
  const quickTap = (btn) => {
    btn.dispatchEvent(new window.MouseEvent('pointerdown', { button: 0, bubbles: true }));
    document.dispatchEvent(new window.Event('pointerup'));
  };

  // Hold, then mock elementFromPoint to return targetBtn, then dispatch pointerup.
  const dragSelect = async (triggerBtn, targetBtn) => {
    await hold(triggerBtn);
    const orig = document.elementFromPoint;
    document.elementFromPoint = () => targetBtn;
    document.dispatchEvent(new window.Event('pointerup'));
    document.elementFromPoint = orig;
  };

  // Reset activeTool and close any open submenus before each test.
  beforeEach(() => {
    app.ui.setActiveTool?.('select');
    document.body.dispatchEvent(new window.MouseEvent('pointerdown', { button: 0, bubbles: true }));
  });

  // ── scissor ──────────────────────────────────────────────────────────────

  describe('scissor subtool menu', () => {
    const getBtn  = () => document.querySelector('.tool-btn[data-tool="scissor"]');
    const getMenu = () => document.querySelector('.tool-submenu[aria-label="Scissor subtools"]');

    test('quick tap activates scissor without opening the menu', () => {
      quickTap(getBtn());
      expect(app.ui.activeTool).toBe('scissor');
      expect(getMenu().classList.contains('open')).toBe(false);
    });

    test('hold (>280ms) opens the scissor submenu', async () => {
      await hold(getBtn());
      expect(getMenu().classList.contains('open')).toBe(true);
    });

    test('direct click on sub-button sets scissorMode and activeTool', () => {
      document.querySelector('.tool-sub-btn[data-scissor="rect"]').click();
      expect(app.ui.activeTool).toBe('scissor');
      expect(app.ui.scissorMode).toBe('rect');
    });

    test('drag-select to circle sub-button sets mode and closes menu', async () => {
      const circleBtn = document.querySelector('.tool-sub-btn[data-scissor="circle"]');
      await dragSelect(getBtn(), circleBtn);
      expect(app.ui.scissorMode).toBe('circle');
      expect(app.ui.activeTool).toBe('scissor');
      expect(getMenu().classList.contains('open')).toBe(false);
    });

    test('pointerdown outside the open menu closes it', async () => {
      await hold(getBtn());
      expect(getMenu().classList.contains('open')).toBe(true);
      document.body.dispatchEvent(new window.MouseEvent('pointerdown', { button: 0, bubbles: true }));
      expect(getMenu().classList.contains('open')).toBe(false);
    });
  });

  // ── select / lasso (flat top-level tools, no submenu) ──────────────────────

  describe('select tool (flat, no submenu)', () => {
    const getBtn = () => document.querySelector('.tool-btn[data-tool="select"]');

    test('select button is flat — no submenu exists', () => {
      expect(getBtn()).not.toBeNull();
      expect(getBtn().hasAttribute('data-has-submenu')).toBe(false);
      expect(document.querySelector('.tool-submenu[data-menu="select"]')).toBeNull();
    });

    test('click activates select tool', () => {
      app.ui.setActiveTool?.('scissor');
      getBtn().click();
      expect(app.ui.activeTool).toBe('select');
    });
  });

  describe('lasso tool (flat top-level)', () => {
    const getBtn = () => document.querySelector('.tool-btn[data-tool="lasso"]');

    test('lasso button exists as a flat top-level tool', () => {
      expect(getBtn()).not.toBeNull();
      expect(getBtn().hasAttribute('data-has-submenu')).toBe(false);
    });

    test('click activates lasso tool', () => {
      app.ui.setActiveTool?.('select');
      getBtn().click();
      expect(app.ui.activeTool).toBe('lasso');
    });
  });

  // ── pen ──────────────────────────────────────────────────────────────────

  describe('pen subtool menu', () => {
    const getBtn  = () => document.querySelector('.tool-btn[data-tool="pen"]');
    const getMenu = () => document.querySelector('.tool-submenu[data-menu="pen"]');

    test('quick tap activates pen without opening the menu', () => {
      quickTap(getBtn());
      expect(app.ui.activeTool).toBe('pen');
      expect(getMenu().classList.contains('open')).toBe(false);
    });

    test('hold (>280ms) opens the pen submenu', async () => {
      await hold(getBtn());
      expect(getMenu().classList.contains('open')).toBe(true);
    });

    test('direct click on add sub-button sets penMode', () => {
      document.querySelector('.tool-sub-btn[data-pen="add"]').click();
      expect(app.ui.activeTool).toBe('pen');
      expect(app.ui.penMode).toBe('add');
    });

    test('drag-select to anchor sub-button sets mode and closes menu', async () => {
      const anchorBtn = document.querySelector('.tool-sub-btn[data-pen="anchor"]');
      await dragSelect(getBtn(), anchorBtn);
      expect(app.ui.penMode).toBe('anchor');
      expect(app.ui.activeTool).toBe('pen');
      expect(getMenu().classList.contains('open')).toBe(false);
    });
  });

  // ── fill ─────────────────────────────────────────────────────────────────

  describe('fill subtool menu', () => {
    const getBtn  = () => document.querySelector('.tool-btn[data-tool="fill"]');
    const getMenu = () => document.querySelector('.tool-submenu[aria-label="Fill subtools"]');

    test('quick tap activates fill without opening the menu', () => {
      quickTap(getBtn());
      expect(app.ui.activeTool).toBe('fill');
      expect(getMenu().classList.contains('open')).toBe(false);
    });

    test('hold (>280ms) opens the fill submenu', async () => {
      await hold(getBtn());
      expect(getMenu().classList.contains('open')).toBe(true);
    });

    test('direct click on pattern sub-button sets fill-pattern activeTool', () => {
      document.querySelector('.tool-sub-btn[data-fill="pattern"]').click();
      expect(app.ui.activeTool).toBe('fill-pattern');
    });

    test('drag-select to erase sub-button sets fill-erase activeTool and closes menu', async () => {
      const eraseBtn = document.querySelector('.tool-sub-btn[data-fill="erase"]');
      await dragSelect(getBtn(), eraseBtn);
      expect(app.ui.activeTool).toBe('fill-erase');
      expect(getMenu().classList.contains('open')).toBe(false);
    });
  });

  // ── fill parent-icon reflects the last-picked child (session-only) ─────────

  describe('fill parent icon mirrors the last-selected child tool', () => {
    const parentBtn = () => document.querySelector('.tool-btn[data-tool="fill"]');
    const parentIcon = () =>
      document.querySelector('.tool-btn[data-tool="fill"] .tool-icon');
    const childSvg = (fillMode) =>
      document.querySelector(`.tool-sub-btn[data-fill="${fillMode}"] svg`);

    test('selecting the Pattern child copies its icon onto the paint-bucket parent', () => {
      app.ui.setActiveTool('fill'); // solid — default icon
      const solidHtml = parentIcon().innerHTML;

      document.querySelector('.tool-sub-btn[data-fill="pattern"]').click();
      expect(app.ui.activeTool).toBe('fill-pattern');
      expect(parentIcon().innerHTML).toBe(childSvg('pattern').innerHTML);
      expect(parentIcon().innerHTML).not.toBe(solidHtml);
    });

    test('selecting a different child (Erase) swaps the parent icon again', () => {
      document.querySelector('.tool-sub-btn[data-fill="pattern"]').click();
      document.querySelector('.tool-sub-btn[data-fill="erase"]').click();
      expect(app.ui.activeTool).toBe('fill-erase');
      expect(parentIcon().innerHTML).toBe(childSvg('erase').innerHTML);
    });

    test('choosing solid fill restores the default paint-bucket icon', () => {
      app.ui.setActiveTool('fill'); // capture default
      const solidHtml = parentIcon().innerHTML;
      document.querySelector('.tool-sub-btn[data-fill="pattern"]').click();
      expect(parentIcon().innerHTML).not.toBe(solidHtml);
      app.ui.setActiveTool('fill'); // back to solid
      expect(parentIcon().innerHTML).toBe(solidHtml);
    });

    test('the swapped icon persists after switching to an unrelated tool (session state)', () => {
      document.querySelector('.tool-sub-btn[data-fill="pattern"]').click();
      const patternHtml = parentIcon().innerHTML;
      app.ui.setActiveTool('select'); // leave the fill tool entirely
      // Parent icon must stay on the last-picked fill child, not reset.
      expect(parentIcon().innerHTML).toBe(patternHtml);
    });

    test('short-clicking the parent re-invokes the last-picked child, not solid fill', () => {
      document.querySelector('.tool-sub-btn[data-fill="pattern"]').click();
      expect(app.ui.activeTool).toBe('fill-pattern');
      app.ui.setActiveTool('select'); // move away
      quickTap(parentBtn());             // short click the paint-bucket parent
      expect(app.ui.activeTool).toBe('fill-pattern');
    });

    test('a different last-picked child (erase) is what the short click re-invokes', () => {
      document.querySelector('.tool-sub-btn[data-fill="erase"]').click();
      app.ui.setActiveTool('select');
      quickTap(parentBtn());
      expect(app.ui.activeTool).toBe('fill-erase');
    });

    test('the F shortcut resets the sticky mode back to solid fill', () => {
      document.querySelector('.tool-sub-btn[data-fill="pattern"]').click();
      app.ui.setActiveTool('fill'); // what pressing F does — solid fill
      app.ui.setActiveTool('select');
      quickTap(parentBtn());
      expect(app.ui.activeTool).toBe('fill'); // sticky mode is solid again
    });
  });

  // ── shape ─────────────────────────────────────────────────────────────────

  describe('shape subtool menu', () => {
    const getBtn  = () => document.querySelector('.tool-btn[data-tool="shape"]');
    const getMenu = () => document.querySelector('.tool-submenu[data-menu="shape"]');

    test('quick tap activates current shape mode without opening the menu', () => {
      quickTap(getBtn());
      expect(app.ui.activeTool).toMatch(/^shape-/);
      expect(getMenu().classList.contains('open')).toBe(false);
    });

    test('hold (>280ms) opens the shape submenu', async () => {
      await hold(getBtn());
      expect(getMenu().classList.contains('open')).toBe(true);
    });

    test('direct click on line sub-button sets shape-line activeTool', () => {
      document.querySelector('.tool-sub-btn[data-shape="line"]').click();
      expect(app.ui.activeTool).toBe('shape-line');
    });

    test('drag-select to polygon sub-button sets shape-polygon and closes menu', async () => {
      const polygonBtn = document.querySelector('.tool-sub-btn[data-shape="polygon"]');
      await dragSelect(getBtn(), polygonBtn);
      expect(app.ui.activeTool).toBe('shape-polygon');
      expect(getMenu().classList.contains('open')).toBe(false);
    });
  });

  // ── top menu bar DOM completeness ─────────────────────────────────────────

  // ── TUX-014: touch path (pointerType recorded at pointerdown) ──────────────

  describe('touch path (TUX-014)', () => {
    const getBtn  = () => document.querySelector('.tool-btn[data-tool="shape"]');
    const getMenu = () => document.querySelector('.tool-submenu[data-menu="shape"]');
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    // JSDOM has no PointerEvent: a MouseEvent with pointerType / pointerId defined on it.
    const ptr = (type, target, { x = 0, y = 0, id = 7, pointerType = 'touch' } = {}) => {
      const ev = new window.MouseEvent(type, { button: 0, bubbles: true, cancelable: true, clientX: x, clientY: y });
      Object.defineProperty(ev, 'pointerType', { value: pointerType });
      Object.defineProperty(ev, 'pointerId', { value: id });
      target.dispatchEvent(ev);
      return ev;
    };
    beforeEach(async () => {
      app.ui.setActiveTool('select');
      // let any one-shot click swallower from a previous test expire
      await sleep(10);
    });

    test('hold then release in place keeps the menu open and does not change the tool', async () => {
      ptr('pointerdown', getBtn(), { x: 10, y: 10 });
      await sleep(310);
      expect(getMenu().classList.contains('open')).toBe(true);
      ptr('pointerup', getBtn(), { x: 10, y: 10 });
      expect(getMenu().classList.contains('open')).toBe(true);
      expect(app.ui.activeTool).toBe('select');
    });

    test('tap on an inactive group activates it and leaves the menu closed', () => {
      ptr('pointerdown', getBtn(), { x: 10, y: 10 });
      ptr('pointerup', getBtn(), { x: 10, y: 10 });
      expect(String(app.ui.activeTool).startsWith('shape')).toBe(true);
      expect(getMenu().classList.contains('open')).toBe(false);
    });

    test('tap on the active group opens the menu; a tap on the parent while open closes it', () => {
      ptr('pointerdown', getBtn(), { x: 10, y: 10 });
      ptr('pointerup', getBtn(), { x: 10, y: 10 });
      const tool = app.ui.activeTool;
      ptr('pointerdown', getBtn(), { x: 10, y: 10 });
      ptr('pointerup', getBtn(), { x: 10, y: 10 });
      expect(getMenu().classList.contains('open')).toBe(true);
      expect(app.ui.activeTool).toBe(tool);
      ptr('pointerdown', getBtn(), { x: 10, y: 10 });
      ptr('pointerup', getBtn(), { x: 10, y: 10 });
      expect(getMenu().classList.contains('open')).toBe(false);
      expect(app.ui.activeTool).toBe(tool);
    });

    test('moving 10 px or more before the timer cancels the hold: no menu, no activation', async () => {
      ptr('pointerdown', getBtn(), { x: 10, y: 10 });
      ptr('pointermove', getBtn(), { x: 10, y: 22 });
      await sleep(310);
      expect(getMenu().classList.contains('open')).toBe(false);
      ptr('pointerup', getBtn(), { x: 10, y: 22 });
      expect(getMenu().classList.contains('open')).toBe(false);
      expect(app.ui.activeTool).toBe('select');
    });

    test('pointercancel cancels the pending hold', async () => {
      ptr('pointerdown', getBtn(), { x: 10, y: 10 });
      ptr('pointercancel', getBtn(), { x: 10, y: 10 });
      await sleep(310);
      expect(getMenu().classList.contains('open')).toBe(false);
    });

    test('a touch tap on a row selects it and closes the menu', async () => {
      ptr('pointerdown', getBtn(), { x: 10, y: 10 });
      await sleep(310);
      ptr('pointerup', getBtn(), { x: 10, y: 10 });
      const row = document.querySelector('.tool-sub-btn[data-shape="polygon"]');
      const orig = document.elementFromPoint;
      document.elementFromPoint = () => row;
      ptr('pointerdown', row, { x: 50, y: 50, id: 8 });
      ptr('pointerup', row, { x: 50, y: 50, id: 8 });
      document.elementFromPoint = orig;
      expect(app.ui.activeTool).toBe('shape-polygon');
      expect(getMenu().classList.contains('open')).toBe(false);
    });

    test('an outside touch tap closes the menu and is consumed (does not reach the document)', async () => {
      ptr('pointerdown', getBtn(), { x: 10, y: 10 });
      await sleep(310);
      ptr('pointerup', getBtn(), { x: 10, y: 10 });
      expect(getMenu().classList.contains('open')).toBe(true);
      let reached = 0;
      const spy = () => { reached += 1; };
      document.body.addEventListener('pointerdown', spy);
      ptr('pointerdown', document.body, { x: 300, y: 300, id: 9 });
      document.body.removeEventListener('pointerdown', spy);
      expect(getMenu().classList.contains('open')).toBe(false);
      expect(reached).toBe(0);
    });

    test('mouse path is unchanged: hold then release in place closes the menu, tool unchanged', async () => {
      getBtn().dispatchEvent(new window.MouseEvent('pointerdown', { button: 0, bubbles: true }));
      await sleep(310);
      expect(getMenu().classList.contains('open')).toBe(true);
      document.dispatchEvent(new window.Event('pointerup'));
      expect(getMenu().classList.contains('open')).toBe(false);
      expect(app.ui.activeTool).toBe('select');
    });

    test('rows carry a text label and an aria-label', () => {
      document.querySelectorAll('.tool-submenu[data-menu="shape"] .tool-sub-btn').forEach((row) => {
        expect(row.querySelector('.tool-sub-label').textContent.trim().length).toBeGreaterThan(0);
        expect(row.getAttribute('aria-label')).toBeTruthy();
      });
    });
  });

  describe('top menu bar — all expected button IDs exist in the bootstrapped DOM', () => {
    const expected = [
      // File menu
      'btn-open-vectura', 'btn-save-vectura', 'btn-import-svg', 'btn-export', 'btn-settings',
      // Edit menu
      'btn-undo', 'btn-redo', 'btn-group-layers', 'btn-ungroup-layers',
      // View menu
      'btn-reset-view', 'btn-view-grid-toggle', 'btn-view-grid-settings',
      // Insert menu
      'btn-insert-mirror-modifier',
      // Help menu
      'btn-help', 'btn-tour',
    ];

    expected.forEach((id) => {
      test(`#${id} is present`, () => {
        expect(document.getElementById(id)).toBeTruthy();
      });
    });
  });
});
