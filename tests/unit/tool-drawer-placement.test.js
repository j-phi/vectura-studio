/*
 * TUX-015: pure placement for the All Tools drawer. Single home TUX-014's popover primitive absorbs.
 * The module is an IIFE on window.Vectura; the placement function touches no DOM.
 */
const fs = require('fs');
const path = require('path');

const load = () => {
  const code = fs.readFileSync(path.resolve(__dirname, '../../src/ui/shell/tool-drawer.js'), 'utf8');
  const win = {};
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'globalThis', code)(win, undefined, win);
  return win.Vectura.UI.ToolDrawer.computeDrawerPlacement;
};

const R = (left, top, w, h) => ({ left, top, right: left + w, bottom: top + h });

describe('computeDrawerPlacement (TUX-015)', () => {
  const place = load();

  it('puts the drawer beside a vertical rail and keeps the rail top', () => {
    const p = place({ rail: R(20, 100, 52, 477), btn: R(24, 500, 44, 44), drawerW: 264, drawerH: 400, vp: { width: 1600, height: 1000 } });
    expect(p.left).toBe(80);
    expect(p.top).toBe(100);
    expect(p.width).toBeNull();
    expect(p.maxHeight).toBe(400);
  });

  it('clamps a low vertical rail into the viewport', () => {
    const p = place({ rail: R(20, 800, 52, 150), drawerW: 264, drawerH: 400, vp: { width: 1600, height: 1000 } });
    expect(p.top).toBe(1000 - 400 - 8);
  });

  it('puts the drawer below a horizontal rail, aligned to the overflow button', () => {
    const p = place({ rail: R(0, 44, 402, 52), btn: R(340, 48, 44, 44), drawerW: 264, drawerH: 900, vp: { width: 402, height: 874 } });
    expect(p.top).toBe(96 + 8);
    expect(p.left).toBe(402 - 264 - 8); // clamped from the button's left edge
    expect(p.maxHeight).toBe(874 - 8 - 104);
  });

  it('overlays from the rail top when there is no room under the rail, clear of the overflow button', () => {
    const p = place({ rail: R(0, 38, 874, 52), btn: R(800, 42, 44, 44), drawerW: 264, drawerH: 400, vp: { width: 874, height: 330 } });
    expect(p.top).toBe(38); // below the app header
    expect(p.maxHeight).toBe(330 - 8 - 38);
    expect(p.left + 264).toBeLessThanOrEqual(800 - 8);
  });

  it('clamps to the visual viewport when innerWidth is inflated (402 vs 544)', () => {
    const p = place({ rail: R(0, 44, 402, 52), btn: R(340, 48, 44, 44), drawerW: 264, drawerH: 300, vp: { width: 402, height: 874 } });
    expect(p.left + 264).toBeLessThanOrEqual(402 - 8);
  });

  it('shrinks the width when the viewport is narrower than the drawer plus padding', () => {
    const p = place({ rail: R(0, 44, 300, 52), btn: R(240, 48, 44, 44), drawerW: 264, drawerH: 300, vp: { width: 270, height: 800 } });
    expect(p.width).toBe(270 - 16);
    expect(p.left).toBe(8);
  });

  it('respects safe-area insets and visual viewport offsets', () => {
    const p = place({ rail: R(0, 44, 402, 52), btn: R(340, 48, 44, 44), drawerW: 264, drawerH: 900,
      vp: { width: 402, height: 800, offsetLeft: 0, offsetTop: 50, inset: { top: 0, right: 0, bottom: 34, left: 0 } } });
    expect(p.top + p.maxHeight).toBeLessThanOrEqual(50 + 800 - 34 - 8);
  });
  it('opens above a horizontal rail docked near the viewport bottom (desktop bottom dock)', () => {
    const p = place({ rail: R(296, 885, 1040, 46), btn: R(1280, 888, 34, 34), drawerW: 264, drawerH: 525, vp: { width: 1600, height: 1000 } });
    expect(p.maxHeight).toBeGreaterThanOrEqual(400);
    expect(p.top + p.maxHeight).toBeLessThanOrEqual(885); // sits above the rail
    expect(p.top).toBeGreaterThanOrEqual(8);
  });

  it('still overlays from the rail top as a last resort when neither side has room', () => {
    const p = place({ rail: R(0, 200, 874, 52), btn: R(800, 204, 44, 44), drawerW: 264, drawerH: 400, vp: { width: 874, height: 330 } });
    expect(p.maxHeight).toBeGreaterThan(0);
    expect(p.top).toBeGreaterThanOrEqual(8);
    expect(p.top + p.maxHeight).toBeLessThanOrEqual(330 - 8);
  });
});
