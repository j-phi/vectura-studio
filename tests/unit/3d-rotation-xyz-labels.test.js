/*
 * 3D rotation controls speak industry-standard X/Y/Z.
 *
 * The yaw/pitch/roll (and rotate/tilt) terminology was replaced with the
 * Rotate X / Rotate Y / Rotate Z convention used by Photoshop, After Effects,
 * and Blender. The mapping follows Geometry3D.rotatePoint's axes:
 *   pitch / tilt  → rotation about the X axis (tip toward/away)
 *   yaw / rotate  → rotation about the Y axis (turn left/right)
 *   roll          → rotation about the Z axis (spin in the canvas plane)
 * Param ids are untouched — presets and .vectura files keep deserializing —
 * only labels, ordering, tooltips, and help copy changed.
 *
 * Loads controls-registry.js into a JSDOM context, mirroring the harness in
 * 3d-wave2-controls.test.js. Gizmo drag-tooltip coverage lives in
 * 3d-rotation-gizmo-tooltips.test.js (loadVecturaRuntime is CJS-harness only).
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const loadInJSDOM = (scriptPaths) => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });
  const context = dom.getInternalVMContext();
  for (const rel of scriptPaths) {
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    vm.runInContext(code, context, { filename: rel });
  }
  return dom;
};

const findControl = (defs, id) => defs.find((c) => c && c.id === id);

describe('3D rotation controls use X/Y/Z labels', () => {
  let dom;
  let CONTROL_DEFS;
  let INFO;

  beforeAll(() => {
    dom = loadInJSDOM([
      'src/config/defaults.js',
      'src/ui/ui-fill-panel.js',
      'src/ui/controls-registry.js',
      'src/ui/modals/info-modals.js',
    ]);
    const w = dom.window;
    expect(w.Vectura?.UI?.CONTROL_DEFS).toBeTruthy();
    CONTROL_DEFS = w.Vectura.UI.CONTROL_DEFS;
    INFO = w.Vectura?.UI?.Modals?.InfoModals?.INFO;
    expect(INFO).toBeTruthy();
  });

  afterAll(() => dom?.window?.close?.());

  // param id → expected label per algorithm; ranges must survive the relabel.
  const EULER_ALGOS = [
    { type: 'spiralizer', pitchRange: [-90, 90] },
    { type: 'topoform', pitchRange: [-180, 180] },
    { type: 'terrain', pitchRange: [-180, 180] },
  ];
  const ROTATE_TILT_ALGOS = ['polyhedron', 'rasterPlane'];

  it.each(EULER_ALGOS)('$type: pitch/yaw/roll are labeled Rotate X/Y/Z in X→Y→Z order', ({ type, pitchRange }) => {
    const defs = CONTROL_DEFS[type];
    const pitch = findControl(defs, 'pitch');
    const yaw = findControl(defs, 'yaw');
    const roll = findControl(defs, 'roll');
    expect(pitch?.label).toBe('Rotate X');
    expect(yaw?.label).toBe('Rotate Y');
    expect(roll?.label).toBe('Rotate Z');
    // X before Y before Z, matching every mainstream 3D tool
    const order = ['pitch', 'yaw', 'roll'].map((id) => defs.findIndex((c) => c && c.id === id));
    expect(order[0]).toBeLessThan(order[1]);
    expect(order[1]).toBeLessThan(order[2]);
    // Ranges and behavior preserved (no functionality change)
    expect([pitch.min, pitch.max]).toEqual(pitchRange);
    expect([yaw.min, yaw.max]).toEqual([-180, 180]);
    expect([roll.min, roll.max]).toEqual([-180, 180]);
    for (const ctrl of [pitch, yaw, roll]) {
      expect(ctrl.type).toBe('range');
      expect(ctrl.livePreview).toBe(true);
      expect(ctrl.displayUnit).toBe('°');
      expect(typeof ctrl.infoKey).toBe('string');
      expect(INFO[ctrl.infoKey]).toBeTruthy();
    }
  });

  it.each(ROTATE_TILT_ALGOS.map((type) => ({ type })))('$type: tilt/rotate are labeled Rotate X/Rotate Y in X→Y order', ({ type }) => {
    const defs = CONTROL_DEFS[type];
    const tilt = findControl(defs, 'tilt');
    const rotate = findControl(defs, 'rotate');
    expect(tilt?.label).toBe('Rotate X');
    expect(rotate?.label).toBe('Rotate Y');
    expect(defs.indexOf(tilt)).toBeLessThan(defs.indexOf(rotate));
    // Ranges preserved
    expect([tilt.min, tilt.max]).toEqual([0, 89]);
    expect([rotate.min, rotate.max]).toEqual([-180, 180]);
    for (const ctrl of [tilt, rotate]) {
      expect(typeof ctrl.infoKey).toBe('string');
      expect(INFO[ctrl.infoKey]).toBeTruthy();
    }
  });

  it('terrain Free 3D mode option no longer says yaw/pitch/roll', () => {
    const mode = findControl(CONTROL_DEFS.terrain, 'perspectiveMode');
    const free = mode.options.find((o) => o.value === 'free-3d');
    expect(free.label).toMatch(/X\/Y\/Z/i);
    expect(free.label).not.toMatch(/yaw/i);
  });

  it('terrain rotation help entries lead with the axis name', () => {
    expect(INFO['terrain.pitch'].title).toMatch(/^Rotate X/);
    expect(INFO['terrain.yaw'].title).toMatch(/^Rotate Y/);
    expect(INFO['terrain.roll'].title).toMatch(/^Rotate Z/);
  });
});
