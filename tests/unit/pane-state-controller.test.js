/**
 * TUX-008: pure per-layout pane state machine (src/ui/shell/pane-state.js).
 */
const path = require('path');

const PaneState = require(path.resolve(__dirname, '../../src/ui/shell/pane-state.js'));

const make = (layout, prefs = {}) => {
  const persisted = [];
  const c = PaneState.create({ layout, prefs, persist: (k, v) => persisted.push([k, v]) });
  return { c, persisted };
};

describe('pane-state controller (TUX-008)', () => {
  test('initial state: tablet and phone closed, touch-wide and desktop docked open from prefs', () => {
    ['tablet', 'phone'].forEach((layout) => {
      const { c } = make(layout, { leftPaneCollapsed: false, touchWideLeftPaneCollapsed: false });
      expect(c.isOpen('left')).toBe(false);
      expect(c.isOpen('right')).toBe(false);
    });
    ['touch-wide', 'desktop'].forEach((layout) => {
      const { c } = make(layout);
      expect(c.isOpen('left')).toBe(true);
      expect(c.isOpen('right')).toBe(true);
    });
    const d = make('desktop', { leftPaneCollapsed: true });
    expect(d.c.isOpen('left')).toBe(false);
    expect(d.c.isOpen('right')).toBe(true);
    const t = make('touch-wide', { touchWideRightPaneCollapsed: true, leftPaneCollapsed: true });
    expect(t.c.isOpen('left')).toBe(true);
    expect(t.c.isOpen('right')).toBe(false);
  });

  test('a transition into tablet or phone closes both drawers', () => {
    ['tablet', 'phone'].forEach((layout) => {
      const { c } = make('touch-wide');
      expect(c.setLayout(layout)).toBe(true);
      expect(c.isOpen('left')).toBe(false);
      expect(c.isOpen('right')).toBe(false);
    });
    const { c } = make('tablet');
    c.open('left');
    c.setLayout('phone');
    expect(c.isOpen('left')).toBe(false);
  });

  test('a burst of 10 same-class resize events does not close a drawer the user opened', () => {
    const { c } = make('tablet');
    c.open('left');
    let transitions = 0;
    for (let i = 0; i < 10; i += 1) if (c.setLayout('tablet')) transitions += 1;
    expect(transitions).toBe(0);
    expect(c.isOpen('left')).toBe(true);
  });

  test('a transition back into touch-wide restores the stored touch-wide state', () => {
    const { c } = make('touch-wide');
    c.close('right');
    c.setLayout('tablet');
    c.open('left');
    expect(c.isOpen('right')).toBe(false);
    c.setLayout('touch-wide');
    expect(c.isOpen('left')).toBe(true);
    expect(c.isOpen('right')).toBe(false);
    c.setLayout('tablet');
    expect(c.isOpen('left')).toBe(false);
    c.setLayout('touch-wide');
    expect(c.isOpen('left')).toBe(true);
    expect(c.isOpen('right')).toBe(false);
  });

  test('open(side) on tablet and phone closes the sibling', () => {
    ['tablet', 'phone'].forEach((layout) => {
      const { c } = make(layout);
      c.open('left');
      c.open('right');
      expect(c.isOpen('left')).toBe(false);
      expect(c.isOpen('right')).toBe(true);
      c.toggle('right');
      expect(c.isOpen('right')).toBe(false);
    });
  });

  test('docked layouts keep both panes open together, except for an overlay', () => {
    const { c } = make('desktop');
    c.close('left');
    c.open('left');
    expect(c.isOpen('left') && c.isOpen('right')).toBe(true);
    const o = PaneState.create({ layout: 'desktop', overlay: true });
    o.open('left');
    expect(o.isOpen('right')).toBe(false);
  });

  test('tablet and phone never call the persist callback', () => {
    ['tablet', 'phone'].forEach((layout) => {
      const { c, persisted } = make(layout);
      c.open('left');
      c.open('right');
      c.toggle('right');
      c.closeAll();
      c.resetForLayout();
      expect(persisted).toEqual([]);
    });
    const { c, persisted } = make('touch-wide');
    c.setLayout('tablet');
    c.open('left');
    c.setLayout('touch-wide');
    expect(persisted).toEqual([]);
  });

  test('touch-wide and desktop persist to separate keys', () => {
    const t = make('touch-wide');
    t.c.close('left');
    t.c.close('right');
    expect(t.persisted).toEqual([['touchWideLeftPaneCollapsed', true], ['touchWideRightPaneCollapsed', true]]);
    const d = make('desktop');
    d.c.close('left');
    d.c.toggle('right');
    d.c.toggle('right');
    expect(d.persisted).toEqual([['leftPaneCollapsed', true], ['rightPaneCollapsed', true], ['rightPaneCollapsed', false]]);
  });

  test('resetForLayout: drawers close, docked panes open and persist per layout', () => {
    const t = make('touch-wide');
    t.c.closeAll();
    t.persisted.length = 0;
    t.c.resetForLayout();
    expect(t.c.isOpen('left') && t.c.isOpen('right')).toBe(true);
    expect(t.persisted).toEqual([['touchWideLeftPaneCollapsed', false], ['touchWideRightPaneCollapsed', false]]);
    const p = make('phone');
    p.c.open('left');
    p.c.resetForLayout();
    expect(p.c.isOpen('left')).toBe(false);
  });

  test('onChange fires once per state change', () => {
    const calls = [];
    const c = PaneState.create({ layout: 'tablet', onChange: (s) => calls.push(s) });
    c.open('left');
    c.setLayout('tablet');
    c.close('left');
    expect(calls.length).toBe(2);
    expect(calls[0].left).toBe(true);
    expect(calls[1].left).toBe(false);
  });

  test('resetOverlay shows one pane without persisting a collapse; leaving the band restores both', () => {
    const persisted = [];
    const c = PaneState.create({ layout: 'desktop', overlay: true, persist: (k, v) => persisted.push([k, v]) });
    c.resetOverlay('left');
    expect(c.isOpen('left')).toBe(true);
    expect(c.isOpen('right')).toBe(false);
    expect(persisted.some(([, collapsed]) => collapsed === true)).toBe(false);
    c.setLayout('desktop', { overlay: false });
    expect(c.isOpen('left') && c.isOpen('right')).toBe(true);
  });
});
