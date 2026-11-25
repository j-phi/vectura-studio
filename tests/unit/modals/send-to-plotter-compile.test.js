/*
 * Compile gate for src/ui/modals/send-to-plotter.js (Send to Plotter panel).
 *
 * Verifies the module registers as window.Vectura.UI.Modals.SendToPlotter, exposes bind/installOn and the
 * prototype methods, refuses to run before bind(), tolerates a missing #btn-send-to-plotter, and that the
 * settings validator and the profile store behave (clamping, unknown-key dropping, built-ins never mutated,
 * invalid user profiles rejected).
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const loadInJSDOM = (scriptPaths) => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });
  const context = dom.getInternalVMContext();
  for (const rel of scriptPaths) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), context, { filename: rel });
  }
  return dom;
};

describe('send-to-plotter compile gate', () => {
  let dom;
  let STP;

  beforeAll(() => {
    dom = loadInJSDOM(['src/config/plotters.js', 'src/core/plotter/plot-safety.js', 'src/ui/modals/send-to-plotter.js']);
    STP = dom.window.Vectura.UI.Modals.SendToPlotter;
  });
  afterAll(() => dom?.window?.close?.());

  it('exposes the module with bind, installOn and the open/bind methods', () => {
    expect(STP).toBeTruthy();
    expect(typeof STP.bind).toBe('function');
    expect(typeof STP.installOn).toBe('function');
    expect(typeof STP.openSendToPlotter).toBe('function');
    expect(typeof STP.bindSendToPlotterButton).toBe('function');
    const proto = {};
    STP.installOn(proto);
    expect(typeof proto.openSendToPlotter).toBe('function');
    expect(typeof proto.bindSendToPlotterButton).toBe('function');
  });

  it('throws a clear error before bind()', () => {
    expect(() => STP.openSendToPlotter.call({})).toThrow(/SendToPlotter\.openSendToPlotter invoked before SendToPlotter\.bind/);
  });

  it('bindSendToPlotterButton is silent when the menu item is absent', () => {
    STP.bind({ getEl: () => null, SETTINGS: {} });
    expect(() => STP.bindSendToPlotterButton.call({})).not.toThrow();
  });

  it('sanitizeSettings fills defaults and clamps untrusted values', () => {
    const d = STP.sanitizeSettings({});
    expect(d.profileId).toBe('uunatek-3-a3');
    expect(d.placement).toEqual({ mode: 'document', offsetX: 0, offsetY: 0, scale: 1, rotate: 0 });
    expect(d.profileOverrides).toEqual({});
    const bad = STP.sanitizeSettings({
      profileId: 'x y; <script>',
      placement: { mode: 'sideways', offsetX: 1e12, scale: -3, rotate: 45 },
      optimize: { simplify: 'big', mergeTol: 99 },
      pens: { 'pen-1': { drawFeed: 1e9, down: -4, passes: 99, order: 'nope', enabled: false }, 'bad id!': {} },
      penChange: 'whenever',
      swatch: { rows: '<b>', pattern: 'sparkle', size: 1e6 },
      extraneous: 1,
    });
    expect(bad.profileId).toBe('uunatek-3-a3');
    expect(bad.placement.mode).toBe('document');
    expect(bad.placement.offsetX).toBe(5000);
    expect(bad.placement.scale).toBe(0.01);
    expect(bad.placement.rotate).toBe(0);
    expect(bad.optimize.simplify).toBe(0.02);
    expect(bad.optimize.mergeTol).toBe(5);
    expect(Object.keys(bad.pens)).toEqual(['pen-1']);
    expect(bad.pens['pen-1']).toMatchObject({ drawFeed: 20000, down: 0, passes: 10, order: 'optimized', enabled: false });
    expect(bad.penChange).toBe('pause');
    expect(bad.swatch.rows).toBe('1500, 3000, 6000');
    expect(bad.swatch.pattern).toBe('hatch');
    expect(bad.swatch.size).toBe(100);
    expect(bad.extraneous).toBeUndefined();
  });

  it('profile store: duplicate creates an editable user profile, built-ins stay frozen, invalid edits are rejected', () => {
    const { Store } = STP;
    const builtIns = dom.window.Vectura.PLOTTER_PROFILES;
    const dup = Store.duplicate('uunatek-3-a3');
    expect(dup).toBeTruthy();
    expect(dup.id).not.toBe('uunatek-3-a3');
    expect(Store.userProfiles().some((p) => p.id === dup.id)).toBe(true);
    expect(Store.isBuiltIn(dup.id)).toBe(false);
    // a valid edit saves
    const edited = { ...dup, name: 'My A3', workArea: { width: 400, height: 280 } };
    expect(Store.saveUserProfile(edited).ok).toBe(true);
    expect(Store.effectiveProfile(dup.id).workArea.width).toBe(400);
    // an invalid edit (zMax above firmware range) is refused and does not persist
    const r = Store.saveUserProfile({ ...edited, pen: { ...edited.pen, zMax: 99 } });
    expect(r.ok).toBe(false);
    expect(Store.effectiveProfile(dup.id).pen.zMax).toBe(10);
    // overrides validate too, and never touch the built-in
    expect(Store.setOverride('uunatek-3-a3', { calibration: { axisChecked: true } }).ok).toBe(true);
    expect(Store.setOverride('uunatek-3-a3', { workArea: { width: -5 } }).ok).toBe(false);
    expect(Store.effectiveProfile('uunatek-3-a3').calibration.axisChecked).toBe(true);
    expect(builtIns[0].workArea.width).toBe(420);
    expect(builtIns[0].calibration).toBeUndefined();
    Store.deleteUserProfile(dup.id);
    expect(Store.userProfiles().some((p) => p.id === dup.id)).toBe(false);
  });
});
