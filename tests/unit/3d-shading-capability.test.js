/*
 * Capability-driven 3D "Shading & Lines" factory (R-CC / WU1+WU2) + the
 * label-dedup wave (WU3) + artworkSize schema removal (WU5).
 *
 * The four 3D algorithms (spiralizer, polyhedron, topoform, rasterPlane)
 * used to share one FLAT `SHADING_LINE_CONTROLS` array spread into every algo.
 * A flat array cannot show a control on one algo and hide it on another, so
 * inapplicable controls (e.g. Lambert hatching on line-only spiralizer) were
 * always visible even though the generator never wired them.
 *
 * WU1/WU2 retype that block into `buildShadingControls(caps)` which injects
 * per-algo / per-mode capability `showIf` predicates ANDed with each control's
 * own self-toggle. This suite asserts the capability matrix:
 *
 *   - spiralizer: HIDE showCreases, creaseAngle, hatchEnable, lightAzimuth,
 *     lightElevation, hatchAngle, hatchSpacing, crossHatch, depthBias.
 *     KEEP depthCue, depthCueStrength, emphasizeOutline, outlineWeight,
 *     hiddenLineMode.
 *   - polyhedron / topoform: full block (all capability gates true).
 *   - rasterPlane: HIDE creases + emphasizeOutline/outlineWeight entirely; also
 *     HIDE hiddenLineMode (dead — raster-plane.js never reads p.hiddenLineMode;
 *     the real toggle is the existing seeThrough control) and depthBias (which
 *     self-toggles on that dead hiddenLineMode → unreachable) in every mode. Only
 *     depthCue + hatch are wired, so only hatch is gated (to mesh & bars).
 *
 * WU3 dedups the colliding display labels; WU5 removes topoform's dead
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

// The 9 face-only shading controls hidden on spiralizer (line/dot geometry).
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

// Controls that must remain visible/usable on spiralizer.
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

  // (a) spiralizer: the 9 face-only controls hidden under spiralizer defaults.
  it('spiralizer hides the 9 face-only shading controls under defaults', () => {
    const defs = CONTROL_DEFS.spiralizer;
    const params = ALGO_DEFAULTS.spiralizer;
    for (const id of SPIRAL3D_HIDDEN_IDS) {
      const def = findDef(defs, id);
      expect(def, `spiralizer should still declare ${id}`).toBeTruthy();
      expect(typeof def.showIf, `${id} must have a showIf gate`).toBe('function');
      expect(def.showIf(params), `${id} should be hidden on spiralizer defaults`).toBe(false);
    }
  });

  it('spiralizer keeps depthCue, outline, and hiddenLineMode usable', () => {
    const defs = CONTROL_DEFS.spiralizer;
    // depthCue + emphasizeOutline + hiddenLineMode: visible regardless of toggle state.
    expect(findDef(defs, 'depthCue')).toBeTruthy();
    const outline = findDef(defs, 'emphasizeOutline');
    expect(outline.showIf ? outline.showIf(ALGO_DEFAULTS.spiralizer) : true).toBe(true);
    const hidden = findDef(defs, 'hiddenLineMode');
    expect(hidden.showIf ? hidden.showIf(ALGO_DEFAULTS.spiralizer) : true).toBe(true);
    // Dependent controls show once their parent toggle is on.
    const cueStrength = findDef(defs, 'depthCueStrength');
    expect(cueStrength.showIf({ ...ALGO_DEFAULTS.spiralizer, depthCue: 'dash' })).toBe(true);
    const outlineWeight = findDef(defs, 'outlineWeight');
    expect(outlineWeight.showIf({ ...ALGO_DEFAULTS.spiralizer, emphasizeOutline: true })).toBe(true);
    for (const id of SPIRAL3D_KEPT_IDS) {
      expect(findDef(defs, id), `spiralizer should keep ${id}`).toBeTruthy();
    }
  });

  // (b) polyhedron + topoform: capability gate true (full block).
  it('polyhedron + topoform keep the full shading block enabled', () => {
    for (const algo of ['polyhedron', 'topoform']) {
      const defs = CONTROL_DEFS[algo];
      // Geometry/visibility controls have no lighting parent → visible under
      // defaults for both algos.
      for (const id of ['showCreases', 'hiddenLineMode', 'emphasizeOutline']) {
        const def = findDef(defs, id);
        expect(def, `${algo} should declare ${id}`).toBeTruthy();
        const visible = def.showIf ? def.showIf(ALGO_DEFAULTS[algo]) : true;
        expect(visible, `${algo}.${id} should be visible (capability true)`).toBe(true);
      }
      const depthBias = findDef(defs, 'depthBias');
      expect(depthBias.showIf({ ...ALGO_DEFAULTS[algo], hiddenLineMode: 'remove' })).toBe(true);
    }

    // topoform: lighting group (hatch + depth cue) gated behind the master
    // Scene Lighting toggle (off by default — the Topoform lighting rework).
    const mtDefs = CONTROL_DEFS.topoform;
    const mtHatch = findDef(mtDefs, 'hatchEnable');
    const mtLightAz = findDef(mtDefs, 'lightAzimuth');
    expect(mtHatch.showIf({ ...ALGO_DEFAULTS.topoform })).toBe(false);
    expect(mtLightAz.showIf({ ...ALGO_DEFAULTS.topoform, hatchEnable: true })).toBe(false);
    expect(mtHatch.showIf({ ...ALGO_DEFAULTS.topoform, sceneLighting: true })).toBe(true);
    expect(mtLightAz.showIf({ ...ALGO_DEFAULTS.topoform, sceneLighting: true, hatchEnable: true })).toBe(true);
    expect(mtLightAz.showIf({ ...ALGO_DEFAULTS.topoform, sceneLighting: true, hatchEnable: false })).toBe(false);

    // polyhedron: lighting group has no master gate (unchanged behavior).
    const phDefs = CONTROL_DEFS.polyhedron;
    const phHatch = findDef(phDefs, 'hatchEnable');
    const phLightAz = findDef(phDefs, 'lightAzimuth');
    expect(phHatch.showIf ? phHatch.showIf(ALGO_DEFAULTS.polyhedron) : true).toBe(true);
    expect(phLightAz.showIf({ ...ALGO_DEFAULTS.polyhedron, hatchEnable: true })).toBe(true);
    expect(phLightAz.showIf({ ...ALGO_DEFAULTS.polyhedron, hatchEnable: false })).toBe(false);
  });

  // (c) rasterPlane: per-mode gating + crease/outline hidden entirely.
  it('rasterPlane gates hatch to mesh & bars modes only', () => {
    const defs = CONTROL_DEFS.rasterPlane;
    const hatchEnable = findDef(defs, 'hatchEnable');
    expect(hatchEnable).toBeTruthy();
    expect(hatchEnable.showIf({ ...ALGO_DEFAULTS.rasterPlane, mode: 'mesh' })).toBe(true);
    expect(hatchEnable.showIf({ ...ALGO_DEFAULTS.rasterPlane, mode: 'bars' })).toBe(true);
    expect(hatchEnable.showIf({ ...ALGO_DEFAULTS.rasterPlane, mode: 'topography' })).toBe(false);
    expect(hatchEnable.showIf({ ...ALGO_DEFAULTS.rasterPlane, mode: 'lines' })).toBe(false);

    // The hatch sub-controls inherit the same per-mode gate even when toggled on.
    for (const id of ['lightAzimuth', 'lightElevation', 'hatchAngle', 'hatchSpacing', 'crossHatch']) {
      const def = findDef(defs, id);
      expect(def.showIf({ mode: 'topography', hatchEnable: true }), `${id} hidden in topography`).toBe(false);
      expect(def.showIf({ mode: 'mesh', hatchEnable: true }), `${id} visible in mesh`).toBe(true);
    }
  });

  it('rasterPlane hides hiddenLineMode entirely; exposes Occlusion Bias for Lines + See-Through OFF', () => {
    // hiddenLineMode is dead: raster-plane.js never reads p.hiddenLineMode (the
    // real visibility toggle is the existing seeThrough control), so that duplicate
    // control stays hidden in EVERY mode. depthBias ("Occlusion Bias") IS wired for
    // Lines now: when See-Through is OFF, buildLines runs depth-spread painter
    // occlusion and reads p.depthBias. It is gated via the depthBiasSelf capability
    // (seeThrough===false) rather than the dead hiddenLineMode.
    const defs = CONTROL_DEFS.rasterPlane;
    const hidden = findDef(defs, 'hiddenLineMode');
    expect(hidden, 'rasterPlane should still declare hiddenLineMode').toBeTruthy();
    expect(typeof hidden.showIf, 'hiddenLineMode must have a showIf gate').toBe('function');
    const depthBias = findDef(defs, 'depthBias');
    expect(depthBias, 'rasterPlane should still declare depthBias').toBeTruthy();
    expect(typeof depthBias.showIf, 'depthBias must have a showIf gate').toBe('function');
    for (const mode of ['lines', 'mesh', 'topography', 'bars']) {
      expect(hidden.showIf({ mode }), `hiddenLineMode hidden in ${mode}`).toBe(false);
    }
    // Occlusion Bias: visible ONLY in Lines mode with See-Through OFF.
    expect(depthBias.showIf({ mode: 'lines', seeThrough: false }), 'depthBias shown for lines + see-through OFF').toBe(true);
    expect(depthBias.showIf({ mode: 'lines', seeThrough: true }), 'depthBias hidden for lines + see-through ON').toBe(false);
    expect(depthBias.showIf({ mode: 'lines' }), 'depthBias hidden for lines + see-through default (ON)').toBe(false);
    for (const mode of ['mesh', 'topography', 'bars']) {
      expect(depthBias.showIf({ mode, seeThrough: false }), `depthBias hidden in ${mode}`).toBe(false);
    }
  });

  it('the shared depthBiasSelf default is unchanged for face-derived 3D algos', () => {
    // The new depthBiasSelf capability defaults to the old inlined predicate
    // (a non-backface Hidden Lines mode is selected). polyhedron/topoform must keep
    // byte-identical Occlusion Bias visibility: hidden on backface, shown otherwise.
    for (const algo of ['polyhedron', 'topoform']) {
      const depthBias = findDef(CONTROL_DEFS[algo], 'depthBias');
      expect(depthBias, `${algo} declares depthBias`).toBeTruthy();
      expect(depthBias.showIf({ hiddenLineMode: 'backface' }), `${algo} depthBias hidden on backface`).toBe(false);
      expect(depthBias.showIf({ hiddenLineMode: 'remove' }), `${algo} depthBias shown on remove`).toBe(true);
      expect(depthBias.showIf({ hiddenLineMode: 'dash' }), `${algo} depthBias shown on dash`).toBe(true);
    }
  });

  it('rasterPlane hides creases and outline entirely (not wired)', () => {
    const defs = CONTROL_DEFS.rasterPlane;
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

  // (d) Label dedup across all four 3D panels (WU3 + UX9p2).
  //
  // UX9p2 de-prefixes the spiralizer per-shape dimension labels ("Cone Radius" →
  // "Radius" etc.). Those bare labels collide by TEXT but are mutually exclusive
  // by `showIf` (each gated to a single `shape`), so they are never co-visible.
  // The honest contract is therefore "no two CO-VISIBLE controls share a label"
  // — evaluate showIf across representative configurations and only flag dupes
  // among the controls that are actually visible together.
  const SPIRAL3D_SHAPES = ['sphere', 'cone', 'cylinder', 'ellipsoid', 'torus', 'capsule', 'helix'];

  it('no two CO-VISIBLE controls within any single 3D panel share an identical label', () => {
    // Built inside the test so ALGO_DEFAULTS (assigned in beforeAll) is ready.
    const REPRESENTATIVE_STATES = {
      spiralizer: SPIRAL3D_SHAPES.map((shape) => ({ ...ALGO_DEFAULTS.spiralizer, shape })),
      polyhedron: [ALGO_DEFAULTS.polyhedron],
      topoform: [ALGO_DEFAULTS.topoform],
      rasterPlane: ['lines', 'mesh', 'topography', 'bars'].map((mode) => ({ ...ALGO_DEFAULTS.rasterPlane, mode })),
    };
    for (const algo of ['spiralizer', 'polyhedron', 'topoform', 'rasterPlane']) {
      for (const params of REPRESENTATIVE_STATES[algo]) {
        const labels = CONTROL_DEFS[algo]
          .filter((d) => typeof d.id === 'string' && typeof d.label === 'string')
          .filter((d) => (d.showIf ? !!d.showIf(params) : true))
          .map((d) => d.label);
        const seen = new Set();
        const dupes = [];
        for (const label of labels) {
          if (seen.has(label)) dupes.push(label);
          seen.add(label);
        }
        const ctx = `${algo} (shape/mode=${params.shape || params.mode || 'default'})`;
        expect(dupes, `${ctx} has duplicate visible labels: ${dupes.join(', ')}`).toEqual([]);
      }
    }
  });

  it('applies the WU3 relabels (no Depth Strength collisions, Hidden Faces)', () => {
    for (const algo of ['spiralizer', 'polyhedron', 'topoform', 'rasterPlane']) {
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

  // (e) WU5: artworkSize removed from topoform (kept on rasterPlane).
  it('topoform has no artworkSize control; rasterPlane keeps it', () => {
    expect(findDef(CONTROL_DEFS.topoform, 'artworkSize')).toBeUndefined();
    expect(findDef(CONTROL_DEFS.rasterPlane, 'artworkSize')).toBeTruthy();
  });

  // Single source of truth: exactly one "Shading & Lines" section per 3D algo,
  // and the shared shading ids appear in the same relative order across all four.
  it('emits exactly one Shading & Lines section per 3D algo in a stable order', () => {
    const order = {};
    for (const algo of ['spiralizer', 'polyhedron', 'topoform', 'rasterPlane']) {
      const defs = CONTROL_DEFS[algo];
      const sections = defs.filter((d) => d.type === 'section' && d.label === 'Shading & Lines');
      expect(sections.length, `${algo} should have exactly one Shading & Lines section`).toBe(1);
      order[algo] = defs
        .filter((d) => SPIRAL3D_HIDDEN_IDS.includes(d.id) || SPIRAL3D_KEPT_IDS.includes(d.id))
        .map((d) => d.id);
    }
    expect(order.polyhedron).toEqual(order.topoform);
    expect(order.polyhedron).toEqual(order.rasterPlane);
    // spiralizer is a subset (some hidden) but its present ids keep the same order.
    const spiralFiltered = order.polyhedron.filter((id) => order.spiralizer.includes(id));
    expect(order.spiralizer).toEqual(spiralFiltered);
  });

  // (e) terrain: the "Hidden Lines" select is exposed only in Free 3D with the
  // master Hidden-Line Removal toggle on, and trimmed to Remove/Dash ("back-face
  // only" is meaningless on an open heightfield). Occlusion Bias tracks it.
  it('terrain exposes a Remove/Dash Hidden Lines select gated on free-3d + occlusion', () => {
    const defs = CONTROL_DEFS.terrain;
    const hl = findDef(defs, 'hiddenLineMode');
    const bias = findDef(defs, 'depthBias');
    expect(hl, 'terrain should declare hiddenLineMode').toBeTruthy();
    expect(hl.options.map((o) => o.value)).toEqual(['remove', 'dash']);
    const free = { perspectiveMode: 'free-3d', occlusion: true, hiddenLineMode: 'remove' };
    expect(hl.showIf(free)).toBe(true);
    expect(hl.showIf({ ...free, occlusion: false })).toBe(false);
    expect(hl.showIf({ ...free, perspectiveMode: 'orthographic' })).toBe(false);
    expect(bias.showIf(free)).toBe(true);
    expect(bias.showIf({ ...free, occlusion: false })).toBe(false);
  });

  it('terrain exposes a Top Width fan gated on free-3d', () => {
    const tw = findDef(CONTROL_DEFS.terrain, 'topWidth');
    expect(tw, 'terrain should declare topWidth').toBeTruthy();
    expect(tw.min).toBe(1);
    expect(tw.max).toBe(10);
    expect(tw.showIf({ perspectiveMode: 'free-3d' })).toBe(true);
    expect(tw.showIf({ perspectiveMode: 'orthographic' })).toBe(false);
  });

  it('Camera Distance + Perspective Strength reach down to 1 on every 3D algo', () => {
    for (const algo of ['terrain', 'polyhedron', 'topoform', 'spiralizer']) {
      const defs = CONTROL_DEFS[algo];
      const cam = findDef(defs, 'cameraDistance');
      const focal = findDef(defs, 'focalLength');
      if (cam) expect(cam.min, `${algo} cameraDistance min`).toBe(1);
      if (focal) expect(focal.min, `${algo} focalLength min`).toBe(1);
    }
  });
});
