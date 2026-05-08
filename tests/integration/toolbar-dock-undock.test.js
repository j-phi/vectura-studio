/*
 * Regression test: when the user click-drags the grab bar of a docked
 * toolbar, the grab bar must stay under the cursor — not snap to a default
 * position, not jump because the toolbar's float-mode dimensions differ
 * from its docked dimensions, and not get clamped away from the cursor
 * (which used to happen when undocking from the bottom near the viewport
 * edge).
 *
 * The float-mode toolbar is a 46-px-wide vertical column whose drag handle
 * spans the top 14 px of width. So the cursor — which is over the handle
 * at pointerdown — should sit at:
 *   toolbar.style.left + 46 / 2  ≈ cursor.clientX
 *   toolbar.style.top  + 14 / 2  ≈ cursor.clientY
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

const VIEW_W = 1280;
const VIEW_H = 800;
const TB_W = 46;
const TB_H_DOCKED_HORIZ = 46; // top/bottom-docked toolbar height
const HANDLE_H = 14;          // CSS-fixed handle height in floating mode

describe('toolbar grab handle stays under cursor on undock', () => {
  let runtime, window, document, app;
  let toolbar, handle, shell;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    if (typeof document.elementFromPoint !== 'function') {
      document.elementFromPoint = () => null;
    }
    window.app = new window.Vectura.App();
    app = window.app;
    await Promise.resolve();

    toolbar = document.getElementById('tool-bar');
    handle = toolbar.querySelector('.toolbar-drag-handle');
    shell = toolbar.closest('.workspace-shell') || toolbar.parentElement;

    shell.getBoundingClientRect = () => ({
      left: 0, top: 0, right: VIEW_W, bottom: VIEW_H,
      width: VIEW_W, height: VIEW_H, x: 0, y: 0,
    });
    handle.setPointerCapture = () => {};
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  // Each scenario: position the toolbar in a docked orientation by stubbing
  // its bounding rect and class, fire pointerdown on the handle at a cursor
  // location that lies within the docked handle area, then assert the
  // floating toolbar's inline left/top put the handle directly under the
  // cursor.
  const scenarios = [
    {
      name: 'left dock',
      dockClass: 'toolbar-docked-left',
      tbRect: { left: 0, top: 0, width: TB_W, height: VIEW_H },
      cursor: { clientX: 12, clientY: 6 },
    },
    {
      name: 'right dock',
      dockClass: 'toolbar-docked-right',
      tbRect: { left: VIEW_W - TB_W, top: 0, width: TB_W, height: VIEW_H },
      cursor: { clientX: VIEW_W - TB_W + 12, clientY: 6 },
    },
    {
      name: 'top dock',
      dockClass: 'toolbar-docked-top',
      tbRect: { left: 0, top: 0, width: VIEW_W, height: TB_H_DOCKED_HORIZ },
      cursor: { clientX: 200, clientY: 18 },
    },
    {
      name: 'bottom dock',
      dockClass: 'toolbar-docked-bottom',
      tbRect: { left: 0, top: VIEW_H - TB_H_DOCKED_HORIZ, width: VIEW_W, height: TB_H_DOCKED_HORIZ },
      cursor: { clientX: 300, clientY: VIEW_H - 28 },
    },
  ];

  for (const sc of scenarios) {
    test(`${sc.name}: pointerdown on handle places toolbar so handle is under cursor`, () => {
      // Place the toolbar in the simulated docked position.
      toolbar.classList.remove(
        'toolbar-docked-left', 'toolbar-docked-right',
        'toolbar-docked-top', 'toolbar-docked-bottom',
      );
      toolbar.classList.add(sc.dockClass);
      toolbar.removeAttribute('style');
      const r = sc.tbRect;
      toolbar.getBoundingClientRect = () => ({
        left: r.left, top: r.top, right: r.left + r.width, bottom: r.top + r.height,
        width: r.width, height: r.height, x: r.left, y: r.top,
      });

      handle.dispatchEvent(new window.MouseEvent('pointerdown', {
        button: 0, bubbles: true,
        clientX: sc.cursor.clientX, clientY: sc.cursor.clientY,
      }));

      // After undock, the toolbar should no longer carry any dock class.
      expect(toolbar.classList.contains(sc.dockClass)).toBe(false);

      // In float mode the toolbar is a vertical column ~46 wide with a
      // 14-px handle at the top. The handle's center must coincide with
      // the cursor's clientX/clientY so the user keeps grip while dragging.
      const left = parseFloat(toolbar.style.left);
      const top = parseFloat(toolbar.style.top);
      expect(Number.isFinite(left)).toBe(true);
      expect(Number.isFinite(top)).toBe(true);
      expect(left + TB_W / 2).toBeCloseTo(sc.cursor.clientX, 0);
      expect(top + HANDLE_H / 2).toBeCloseTo(sc.cursor.clientY, 0);

      // Release pointer to reset internal drag state for the next case.
      document.dispatchEvent(new window.Event('pointerup'));
    });
  }
});
