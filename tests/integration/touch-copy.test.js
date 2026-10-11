/*
 * TUX-052: touch status hints + the Help Touch page.
 * Input mode follows pointerType (touch/pen -> touch words; mouse -> mouse words).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

const BANNED = /Click|Shift\+|Option\+|Cmd\+|Ctrl\+|Alt\+|double-click|right-click/i;

describe('TUX-052 touch copy', () => {
  let runtime, window, document;

  const fire = (type) => {
    const e = new window.Event('pointerdown', { bubbles: true });
    Object.defineProperty(e, 'pointerType', { value: type });
    document.body.dispatchEvent(e);
  };
  const hint = () => document.getElementById('status-bar').textContent;
  const setTool = (tool, mode) => {
    const r = window.app.renderer;
    r.activeTool = tool;
    if (tool === 'pen') r.penMode = mode || 'draw';
    window.Vectura.UI.HintBar.refresh();
  };
  const TOOLS = [['select'], ['direct'], ['type'], ['shape-rect'], ['pen', 'draw'], ['fill']];

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  afterEach(() => {
    document.body.classList.remove('touch-ui');
    window.app.ui.closeModal?.();
    delete window.app.ui._helpPlatform;
    delete window.app.ui._lastHelpTab;
  });

  test.each(['touch', 'pen'])('T1/T2: %s input gives touch words on every tool', (type) => {
    fire(type);
    expect(document.body.dataset.lastInput).toBe('touch');
    for (const [tool, mode] of TOOLS) {
      setTool(tool, mode);
      expect(hint(), `tool ${tool}`).not.toMatch(BANNED);
    }
    setTool('select');
    expect(hint()).toMatch(/Tap/);
  });

  test('T3 (D6): mouse input restores the mouse table text', () => {
    fire('touch');
    fire('mouse');
    expect(document.body.dataset.lastInput).toBe('mouse');
    setTool('select');
    expect(hint()).toMatch(/Click/);
    const tools = window.Vectura.HINTS.tools.select.hint;
    expect(hint()).toBe(tools.map((s) => `${s.key} ${s.text}`).join('|'));
  });

  test('T4: touch-ui defaults Help to the Touch toggle and page', () => {
    document.body.classList.add('touch-ui');
    window.app.ui.openHelp(false);
    const wrap = document.querySelector('#modal-overlay .help-wrap');
    const btn = wrap.querySelector('[data-platform="touch"]');
    expect(btn).toBeTruthy();
    expect(btn.classList.contains('active')).toBe(true);
    const panel = wrap.querySelector('[data-panel="touch"]');
    expect(panel.hidden).toBe(false);
    for (const word of ['Tap', 'Drag', 'Pinch', 'Two-finger tap', 'Three-finger tap', 'Undo', 'Done',
      'Multi-select', 'Constrain', 'Duplicate', '⋯', 'grip']) {
      expect(panel.textContent, word).toContain(word);
    }
  });

  test('T5 (D6): without touch-ui Help defaults to mac or win', () => {
    window.app.ui.openHelp(false);
    const active = document.querySelector('#modal-overlay .help-platform-btn.active');
    expect(['mac', 'win']).toContain(active.dataset.platform);
  });

  test('T6: no forbidden claims in touch copy', () => {
    window.app.ui.openHelp(false);
    const panel = document.querySelector('#modal-overlay [data-panel="touch"]');
    expect(panel.textContent).not.toMatch(/hold (the )?canvas|tap outside|auto-scroll|double-tap (the )?canvas/i);
    const touchTools = window.Vectura.HINTS.touchTools;
    expect(touchTools).toBeTruthy();
    expect(Object.keys(touchTools).sort()).toEqual(Object.keys(window.Vectura.HINTS.tools).sort());
    for (const entry of Object.values(touchTools)) {
      for (const s of entry.hint || []) expect(`${s.key} ${s.text}`).not.toMatch(BANNED);
    }
    const all = document.querySelector('#modal-overlay .help-wrap').textContent;
    expect(all).not.toMatch(/tap\s*\(touch\)\s*any toolbar button|Tap a button marked/i);
  });

  test('T7: touch copy is accurate on every layout', () => {
    document.body.classList.add('touch-ui');
    window.app.ui.openHelp(false);
    const panel = document.querySelector('#modal-overlay [data-panel="touch"]');
    expect(panel.textContent).not.toMatch(/from the header/i);
    expect(panel.textContent).toMatch(/Reset to default/);
    expect(panel.textContent).not.toMatch(/slider label to reset it/);
    expect(panel.textContent).toMatch(/Pan/);
    const oval = window.Vectura.HINTS.touchTools['shape-oval'].hint.map((s) => `${s.key} ${s.text}`).join('|');
    expect(oval).toMatch(/draw an oval/);
    expect(oval).not.toMatch(/a oval/);
  });

  test('T8: Help does not leave focus on an inactive tab', async () => {
    document.body.classList.add('touch-ui');
    await new Promise((r) => setTimeout(r, 20)); // flush focus timers left by earlier tests
    window.app.ui.openHelp(false);
    await new Promise((r) => setTimeout(r, 20));
    const f = document.activeElement;
    if (f && f.classList.contains('help-tab-btn')) expect(f.classList.contains('active')).toBe(true);
  });
});
