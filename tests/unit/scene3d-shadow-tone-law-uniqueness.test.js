const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Scene3D.Shadows — Fill Style picker offers no duplicate pictures (fs-n2
 * Stage 1).
 *
 * Diagnosis (see /Users/jayphi/Documents/github/vectura-studio/.claude/
 * worktrees/fs-int/scratchpad/shadowstyle/ for the full evidence, and the
 * comment block above `clampToneLawId` in shadows.js): `shadowMarkLines`
 * used to dispatch on MARK CLASS ONLY, so every id sharing a class rendered
 * byte-identical geometry — measured at 41 offered ids collapsing to 5
 * distinct pictures (26 of them byte-identical to 'ladder' alone). The Fill
 * Style control therefore looked broken: picking any of ~35 of the 41
 * options visibly did nothing.
 *
 * This is the sweep the fix must satisfy: build the flat shadow (Shadow
 * Layers OFF — the default, and the only path this batch touches) once per
 * OFFERED law id (exactly the set `Shadows.toneLawApplies` says the UI
 * should show — both real UI surfaces filter through that same predicate,
 * so this sweep exercises precisely what a user can pick) and assert no two
 * fingerprints collide.
 *
 * This test FAILS against the pre-fs-n2 shadows.js (dozens of collisions).
 */

const clone = (value) => JSON.parse(JSON.stringify(value));
const BOUNDS = { width: 320, height: 220, penWidth: 0.3 };

const boxObj = (id, x, y, size = 40) => ({
  id, name: id, primitive: 'box', params: { sx: size, sy: size, sz: size },
  transform: { x, y, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
});

describe('Scene3D.Shadows — offered Fill Style options render distinct geometry (fs-n2 Stage 1)', () => {
  let runtime;
  let V;
  let Shadows;
  let HLR;
  let Lighting;
  let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    Shadows = V.Scene3D.Shadows;
    HLR = V.Scene3D.HLR;
    Lighting = V.Scene3D.Lighting;
    defaults = V.ALGO_DEFAULTS.scene3d;
  });

  afterAll(() => runtime.cleanup());

  const buildShadows = (shadowToneLaw) => {
    const p = V.Scene3D.Params.normalizeParams({
      ...clone(defaults),
      objects: [boxObj('obj-1', 0, 20, 40)],
      ground: { enabled: true },
      lights: [{ id: 'sun', type: 'directional', castShadows: true, azimuth: 160, elevation: 45 }],
      camera: { projection: 'orthographic', yaw: 0, pitch: 55, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
      shadow: { shadowToneLaw }, // Shadow Layers OFF (default) — the flat hatch path
    });
    const scene = V.Scene3D.Scene.assembleScene(p, BOUNDS);
    const clipper = HLR.createClipper([], { bias: 0.05 });
    const dir = Lighting.lightWorldDir(p.lights[0]);
    return Shadows.build(scene, p, BOUNDS, clipper, dir, { shadow: p.shadow });
  };

  const sPaths = (paths) => paths.filter((pp) => pp.meta && pp.meta.sceneTarget && pp.meta.sceneTarget.regionClass === 'castShadow');
  // Fingerprint sensitive to real point geometry, insensitive to incidental
  // key ordering — mirrors scene3d-shadow-tone-law.test.js's geomSignature.
  const fingerprint = (paths) => JSON.stringify(sPaths(paths).map((pp) => pp.map((pt) => [
    Math.round(pt.x * 1000) / 1000, Math.round(pt.y * 1000) / 1000,
  ])));

  // The exact set a Fill Style picker would show: the roster's PICKER ids
  // (context-bar.js's `SCENE_FILL_STYLES.groups` builds every real Fill
  // Style picker — including this shadow row, via `FS.groups(...)` — from
  // `R.PICKER_IDS || R.IDS`, never the raw 48-id `IDS` engine vocabulary)
  // plus the shipped default entry ('ladder' itself, which is NOT one of the
  // roster ids — see SCENE_FILL_STYLES.DEFAULT), filtered through the one
  // predicate both real UI surfaces (ctxbar + docked panel) gate on.
  //
  // MERGE NOTE (integration, 2026-09-06, fill-collapse U0-U5): the roster
  // split `IDS` (the full 48-id engine vocabulary, needed to load an
  // old saved document — never shrinks) from `PICKER_IDS` (the 35-id
  // collapsed list a picker actually offers today; folded ids like
  // `fineLadder`/`phaseFineLadder`/`perceptualRamp` now live only as
  // `ALIASES` resolving to a canonical id + a sub-param). Driving `IDS`
  // directly, as this test used to, bypasses that alias resolution and
  // asks e.g. `shadowToneLaw: 'fineLadder'` to render with no `rungMode`
  // override — which collides with plain `ladder`. That is a REAL, known
  // gap (SESSION-SUMMARY.md's open item U5b: a folded id driven directly by
  // its old name, rather than through the picker's law+param combo, loses
  // its distinguishing sub-param) but it is not reachable through either
  // real UI surface, which both build from `PICKER_IDS` and never offer a
  // folded id as a standalone option. This guard's job — "no two OFFERED
  // picker options render the same picture" — is honestly measured only
  // against what a picker offers.
  const offeredLawIds = () => {
    const roster = V.SCENE3D_TONE_LAWS;
    const pickerIds = roster ? (roster.PICKER_IDS || roster.IDS) : [];
    const ids = ['ladder'].concat(pickerIds);
    return ids.filter((id) => Shadows.toneLawApplies(id));
  };

  test('sanity — the roster and the toneLawApplies predicate are wired up', () => {
    const offered = offeredLawIds();
    // BAR CHANGE (integration merge, 2026-09-06): 30 -> 20. Was measured
    // against the raw 48-id `IDS` engine vocabulary (41 offered before this
    // file's own class/id narrowing); now measured against the real picker's
    // `PICKER_IDS` (35, after fill-collapse U0-U5 folded 13 variant ids into
    // 5 canonical ids + a sub-param), so the offered count is legitimately
    // lower (currently 27) — not a widened tolerance hiding a regression,
    // the underlying roster itself shrank by design. See the MERGE NOTE on
    // `offeredLawIds` above.
    expect(offered.length).toBeGreaterThan(20);
    expect(offered).toContain('ladder');
    expect(offered).toContain('none');
    expect(offered).not.toContain('etfKang'); // flow, excluded by mark class
    expect(offered).not.toContain('mazeFill'); // web, excluded by mark class
    expect(offered).not.toContain('isophoteWidth'); // hatch, excluded per-id (fs-n2 Stage 1)
    expect(offered).not.toContain('onePenDown'); // wave, excluded per-id (fs-t1) — chart-space-verified bridge, nothing to walk on a flat footprint
  });

  test('HEADLINE — no two offered Fill Style options render byte-identical shadow geometry', () => {
    const offered = offeredLawIds();
    const seen = new Map(); // fingerprint -> [ids that produced it]
    offered.forEach((id) => {
      const paths = buildShadows(id);
      expect(sPaths(paths).length).toBeGreaterThan(0); // every offered option must actually draw something
      const fp = fingerprint(paths);
      if (!seen.has(fp)) seen.set(fp, []);
      seen.get(fp).push(id);
    });
    const collisions = [...seen.values()].filter((ids) => ids.length > 1);
    expect(collisions).toEqual([]);
    expect(seen.size).toBe(offered.length);
  });

  test('determinism survives per-law-id variation — same id, same output, twice', () => {
    const offered = offeredLawIds();
    offered.forEach((id) => {
      const a = buildShadows(id);
      const b = buildShadows(id);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
  });
});
