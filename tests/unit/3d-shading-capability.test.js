/*
 * Capability-driven 3D "Shading & Lines" factory (R-CC / WU1+WU2) + the
 * label-dedup wave (WU3) + artworkSize schema removal (WU5).
 *
 * The four 3D algorithms (spiral3d, polyhedron, meshTopography, imageSurface)
 * used to share one FLAT `SHADING_LINE_CONTROLS` array spread into every algo.
 * A flat array cannot show a control on one algo and hide it on another, so
 * inapplicable controls (e.g. Lambert hatching on line-only spiral3d) were
 * always visible even though the generator never wired them.
 *
 * WU1/WU2 retype that block into `buildShadingControls(caps)` which injects
 * per-algo / per-mode capability `showIf` predicates ANDed with each control's
 * own self-toggle. This suite asserts the capability matrix:
 *
 *   - spiral3d: HIDE showCreases, creaseAngle, hatchEnable, lightAzimuth,
 *     lightElevation, hatchAngle, hatchSpacing, crossHatch, depthBias.
 *     KEEP depthCue, depthCueStrength, emphasizeOutline, outlineWeight,
 *     hiddenLineMode.
 *   - polyhedron / meshTopography: full block (all capability gates true).
 *   - imageSurface: HIDE creases + emphasizeOutline/outlineWeight entirely; also
 *     HIDE hiddenLineMode (dead — image-surface.js never reads p.hiddenLineMode;
 *     the real toggle is the existing seeThrough control) and depthBias (which
 *     self-toggles on that dead hiddenLineMode → unreachable) in every mode. Only
 *     depthCue + hatch are wired, so only hatch is gated (to mesh & bars).
 *
 * WU3 dedups the colliding display labels; WU5 removes meshTopography's dead
 * artworkSize schema entry. Loaded via the same JSDOM harness as
 * controls-registry-showif-predicates.test.js.
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

// The 9 face-only shading controls hidden on spiral3d (line/dot geometry).
const SPIRAL3D_HIDDEN_IDS = [
  'showCreases',
  'creaseAngle',
  'hatchEnable',
  'lightAzimuth',
  'lightElevation',
  'hatchAngle',
  'hatchSpacing',
  'crossHatch',
  'depthBias',
];

// Controls that must remain visible/usable on spiral3d.
const SPIRAL3D_KEPT_IDS = [
  'depthCue',
  'depthCueStrength',
  'emphasizeOutline',
  'outlineWeight',
  'hiddenLineMode',
];

const findDef = (defs, id) => defs.find((d) => d.id === id);

describe('3D shading capability factory', () => {
  let dom;
  let CONTROL_DEFS;
  let ALGO_DEFAULTS;

  beforeAll(() => {
    dom = loadInJSDOM([
      'src/config/defaults.js',
      'src/ui/ui-fill-panel.js',
      'src/ui/controls-registry.js',
    ]);
    const w = dom.window;
    expect(w.Vectura?.UI?.CONTROL_DEFS).toBeTruthy();
    CONTROL_DEFS = w.Vectura.UI.CONTROL_DEFS;
    ALGO_DEFAULTS = w.Vectura.ALGO_DEFAULTS;
  });

  afterAll(() => dom?.window?.close?.());

  // (a) spiral3d: the 9 face-only controls hidden under spiral3d defaults.
  it('spiral3d hides the 9 face-only shading controls under defaults', () => {
    const defs = CONTROL_DEFS.spiral3d;
    const params = ALGO_DEFAULTS.spiral3d;
    for (const id of SPIRAL3D_HIDDEN_IDS) {
      const def = findDef(defs, id);
      expect(def, `spiral3d should still declare ${id}`).toBeTruthy();
      expect(typeof def.showIf, `${id} must have a showIf gate`).toBe('function');
      expect(def.showIf(params), `${id} should be hidden on spiral3d defaults`).toBe(false);
    }
  });

  it('spiral3d keeps depthCue, outline, and hiddenLineMode usable', () => {
    const defs = CONTROL_DEFS.spiral3d;
    // depthCue + emphasizeOutline + hiddenLineMode: visible regardless of toggle state.
    expect(findDef(defs, 'depthCue')).toBeTruthy();
    const outline = findDef(defs, 'emphasizeOutline');
    expect(outline.showIf ? outline.showIf(ALGO_DEFAULTS.spiral3d) : true).toBe(true);
    const hidden = findDef(defs, 'hiddenLineMode');
    expect(hidden.showIf ? hidden.showIf(ALGO_DEFAULTS.spiral3d) : true).toBe(true);
    // Dependent controls show once their parent toggle is on.
    const cueStrength = findDef(defs, 'depthCueStrength');
    expect(cueStrength.showIf({ ...ALGO_DEFAULTS.spiral3d, depthCue: 'dash' })).toBe(true);
    const outlineWeight = findDef(defs, 'outlineWeight');
    expect(outlineWeight.showIf({ ...ALGO_DEFAULTS.spiral3d, emphasizeOutline: true })).toBe(true);
    for (const id of SPIRAL3D_KEPT_IDS) {
      expect(findDef(defs, id), `spiral3d should keep ${id}`).toBeTruthy();
    }
  });

  // (b) polyhedron + meshTopography: capability gate true (full block).
  it('polyhedron + meshTopography keep the full shading block enabled', () => {
    for (const algo of ['polyhedron', 'meshTopography']) {
      const defs = CONTROL_DEFS[algo];
      // hatchEnable / showCreases / hiddenLineMode have no parent toggle → must
      // be visible (showIf absent OR returns true) under defaults.
      for (const id of ['hatchEnable', 'showCreases', 'hiddenLineMode', 'emphasizeOutline']) {
        const def = findDef(defs, id);
        expect(def, `${algo} should declare ${id}`).toBeTruthy();
        const visible = def.showIf ? def.showIf(ALGO_DEFAULTS[algo]) : true;
        expect(visible, `${algo}.${id} should be visible (capability true)`).toBe(true);
      }
      // Dependent controls show once toggled (capability AND self-toggle).
      const lightAz = findDef(defs, 'lightAzimuth');
      expect(lightAz.showIf({ ...ALGO_DEFAULTS[algo], hatchEnable: true })).toBe(true);
      expect(lightAz.showIf({ ...ALGO_DEFAULTS[algo], hatchEnable: false })).toBe(false);
      const depthBias = findDef(defs, 'depthBias');
      expect(depthBias.showIf({ ...ALGO_DEFAULTS[algo], hiddenLineMode: 'remove' })).toBe(true);
    }
  });

  // (c) imageSurface: per-mode gating + crease/outline hidden entirely.
  it('imageSurface gates hatch to mesh & bars modes only', () => {
    const defs = CONTROL_DEFS.imageSurface;
    const hatchEnable = findDef(defs, 'hatchEnable');
    expect(hatchEnable).toBeTruthy();
    expect(hatchEnable.showIf({ ...ALGO_DEFAULTS.imageSurface, mode: 'mesh' })).toBe(true);
    expect(hatchEnable.showIf({ ...ALGO_DEFAULTS.imageSurface, mode: 'bars' })).toBe(true);
    expect(hatchEnable.showIf({ ...ALGO_DEFAULTS.imageSurface, mode: 'topography' })).toBe(false);
    expect(hatchEnable.showIf({ ...ALGO_DEFAULTS.imageSurface, mode: 'lines' })).toBe(false);

    // The hatch sub-controls inherit the same per-mode gate even when toggled on.
    for (const id of ['lightAzimuth', 'lightElevation', 'hatchAngle', 'hatchSpacing', 'crossHatch']) {
      const def = findDef(defs, id);
      expect(def.showIf({ mode: 'topography', hatchEnable: true }), `${id} hidden in topography`).toBe(false);
      expect(def.showIf({ mode: 'mesh', hatchEnable: true }), `${id} visible in mesh`).toBe(true);
    }
  });

  it('imageSurface hides hiddenLineMode + depthBias entirely (dead/unreachable)', () => {
    // hiddenLineMode is dead: image-surface.js never reads p.hiddenLineMode (the
    // real visibility toggle is the existing seeThrough control), so the duplicate
    // control must be hidden in EVERY mode. depthBias self-toggles on that dead
    // hiddenLineMode, so it can never be reached through a working control path →
    // hidden everywhere too. (Bar-occlusion bias keyed on seeThrough is deferred
    // to the generator-wiring wave.)
    const defs = CONTROL_DEFS.imageSurface;
    const hidden = findDef(defs, 'hiddenLineMode');
    expect(hidden, 'imageSurface should still declare hiddenLineMode').toBeTruthy();
    expect(typeof hidden.showIf, 'hiddenLineMode must have a showIf gate').toBe('function');
    const depthBias = findDef(defs, 'depthBias');
    expect(depthBias, 'imageSurface should still declare depthBias').toBeTruthy();
    expect(typeof depthBias.showIf, 'depthBias must have a showIf gate').toBe('function');
    for (const mode of ['lines', 'mesh', 'topography', 'bars']) {
      expect(hidden.showIf({ mode }), `hiddenLineMode hidden in ${mode}`).toBe(false);
      // Hidden even if the (dead) hiddenLineMode were forced to a non-backface value.
      expect(
        depthBias.showIf({ mode, hiddenLineMode: 'remove' }),
        `depthBias hidden in ${mode}`
      ).toBe(false);
    }
  });

  it('imageSurface hides creases and outline entirely (not wired)', () => {
    const defs = CONTROL_DEFS.imageSurface;
    for (const id of ['showCreases', 'creaseAngle']) {
      const def = findDef(defs, id);
      // The id may still be declared (single source of truth) but must never show.
      if (def) {
        for (const mode of ['lines', 'mesh', 'topography', 'bars']) {
          expect(def.showIf({ mode }), `${id} hidden in ${mode}`).toBe(false);
        }
      }
    }
    for (const id of ['emphasizeOutline', 'outlineWeight']) {
      const def = findDef(defs, id);
      if (def) {
        for (const mode of ['lines', 'mesh', 'topography', 'bars']) {
          expect(def.showIf({ mode, emphasizeOutline: true }), `${id} hidden in ${mode}`).toBe(false);
        }
      }
    }
  });

  // (d) Label dedup across all four 3D panels (WU3).
  it('no two controls within any single 3D panel share an identical label', () => {
    for (const algo of ['spiral3d', 'polyhedron', 'meshTopography', 'imageSurface']) {
      const labels = CONTROL_DEFS[algo]
        .filter((d) => typeof d.id === 'string' && typeof d.label === 'string')
        .map((d) => d.label);
      const seen = new Set();
      const dupes = [];
      for (const label of labels) {
        if (seen.has(label)) dupes.push(label);
        seen.add(label);
      }
      expect(dupes, `${algo} has duplicate control labels: ${dupes.join(', ')}`).toEqual([]);
    }
  });

  it('applies the WU3 relabels (no Depth Strength collisions, Hidden Faces)', () => {
    for (const algo of ['spiral3d', 'polyhedron', 'meshTopography', 'imageSurface']) {
      const defs = CONTROL_DEFS[algo];
      const focal = findDef(defs, 'focalLength');
      if (focal) expect(focal.label).toBe('Perspective Strength');
      const cueStrength = findDef(defs, 'depthCueStrength');
      expect(cueStrength.label).toBe('Depth Cue Strength');
      const depthBias = findDef(defs, 'depthBias');
      expect(depthBias.label).toBe('Occlusion Bias');
      // No two labels start with "Depth " in any one panel.
      const depthLabels = defs.filter((d) => typeof d.label === 'string' && d.label.startsWith('Depth ')).map((d) => d.label);
      expect(new Set(depthLabels).size).toBe(depthLabels.length);
    }
    const faceOpacity = findDef(CONTROL_DEFS.polyhedron, 'faceOpacityMode');
    expect(faceOpacity.label).toBe('Hidden Faces');
  });

  // (e) WU5: artworkSize removed from meshTopography (kept on imageSurface).
  it('meshTopography has no artworkSize control; imageSurface keeps it', () => {
    expect(findDef(CONTROL_DEFS.meshTopography, 'artworkSize')).toBeUndefined();
    expect(findDef(CONTROL_DEFS.imageSurface, 'artworkSize')).toBeTruthy();
  });

  // Single source of truth: exactly one "Shading & Lines" section per 3D algo,
  // and the shared shading ids appear in the same relative order across all four.
  it('emits exactly one Shading & Lines section per 3D algo in a stable order', () => {
    const order = {};
    for (const algo of ['spiral3d', 'polyhedron', 'meshTopography', 'imageSurface']) {
      const defs = CONTROL_DEFS[algo];
      const sections = defs.filter((d) => d.type === 'section' && d.label === 'Shading & Lines');
      expect(sections.length, `${algo} should have exactly one Shading & Lines section`).toBe(1);
      order[algo] = defs
        .filter((d) => SPIRAL3D_HIDDEN_IDS.includes(d.id) || SPIRAL3D_KEPT_IDS.includes(d.id))
        .map((d) => d.id);
    }
    expect(order.polyhedron).toEqual(order.meshTopography);
    expect(order.polyhedron).toEqual(order.imageSurface);
    // spiral3d is a subset (some hidden) but its present ids keep the same order.
    const spiralFiltered = order.polyhedron.filter((id) => order.spiral3d.includes(id));
    expect(order.spiral3d).toEqual(spiralFiltered);
  });
});
