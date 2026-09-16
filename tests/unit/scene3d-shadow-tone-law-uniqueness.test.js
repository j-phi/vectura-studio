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
 *
 * U9b re-pin (LEDGER.md row 18b item 1) — widened from "one build per
 * OFFERED law id" to "offered set x each survivor's collapse options": once
 * U9 (handoff-c2) made the shadow bag a raw pass-through, a folded id never
 * offered by the picker (e.g. `fineLadder`) became reachable anyway through
 * an old saved document, and shadows.js draws it its OWN distinct recipe —
 * a second axis of possible collision the original "offered only" sweep
 * could never see. See `collapseOptionIds`/`sweepIds` below. `onePenDown` is
 * the one ALIASES member excluded from both axes (no shadow recipe of its
 * own — see params.js's `clampShadowToneLaw`) and is pinned instead as a
 * deliberate, byte-identical duplicate of its survivor in its own test.
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
  // old saved document — never shrinks) from `PICKER_IDS` (the collapsed
  // list a picker actually offers today; folded ids like `fineLadder`/
  // `phaseFineLadder`/`perceptualRamp` now live only as `ALIASES` resolving
  // to a canonical id + a sub-param).
  const offeredLawIds = () => {
    const roster = V.SCENE3D_TONE_LAWS;
    const pickerIds = roster ? (roster.PICKER_IDS || roster.IDS) : [];
    const ids = ['ladder'].concat(pickerIds);
    return ids.filter((id) => Shadows.toneLawApplies(id));
  };

  // U9b re-pin (LEDGER.md row 18b item 1) — the sweep used to be "one build
  // per OFFERED law id" only, which was honest exactly as far as it went
  // ("no two options a picker actually SHOWS collide") but stopped short of
  // what U9 (handoff-c2, fc8b0fba) then made true: the shadow bag is a RAW
  // PASS-THROUGH (`params.js clampShadowToneLaw`), so a raw folded id from
  // an old saved document — never offered as its own picker row, but very
  // reachable through a `.vectura` file — draws its OWN real shadows.js
  // recipe, not the survivor's. If two of THOSE collided nobody would ever
  // catch it: the old sweep never built them at all. This is exactly the
  // shape U9-2 already used for `shadowPathCount` (a hand-run script proof,
  // not a committed bar) — the sibling gap here is a COVERAGE gap, not a
  // numeric one, and this closes it with a real sweep.
  //
  // For every offered survivor, gather the folded ids whose `ALIASES.into`
  // names it AND which shadows.js itself judges capable of drawing its own,
  // genuinely distinguishable geometry there (`Shadows.toneLawApplies`) —
  // i.e. every real per-id entry in shadows.js's `*_LAW_RECIPES` tables.
  // `onePenDown` is the sole ALIASES member `toneLawApplies` excludes (it is
  // also a member of shadows.js's own `TONE_LAW_NOT_DISTINGUISHABLE` set,
  // for an unrelated, independent reason — no chart to bridge rulings on a
  // flat footprint) — it is deliberately NOT in this sweep, exactly as it
  // was already deliberately excluded from `offeredLawIds()` above. Its
  // byte-identity with its survivor `interlockWeave` is pinned as an
  // EXPECTED, documented duplicate in its own test below, not folded into
  // this "must all be distinct" sweep.
  const collapseOptionIds = (survivors) => {
    const roster = V.SCENE3D_TONE_LAWS;
    const ALIASES = (roster && roster.ALIASES) || {};
    const out = [];
    survivors.forEach((survivorId) => {
      Object.keys(ALIASES).forEach((foldedId) => {
        if (ALIASES[foldedId].into === survivorId && Shadows.toneLawApplies(foldedId)) out.push(foldedId);
      });
    });
    return out;
  };

  const sweepIds = () => {
    const offered = offeredLawIds();
    return offered.concat(collapseOptionIds(offered));
  };

  test('sanity — the roster and the toneLawApplies predicate are wired up', () => {
    const offered = offeredLawIds();
    // U9b re-pin, measured against the roster shipped at this unit (30
    // PICKER_IDS / 18 ALIASES, post U1-U9/U6-U8): 23 offered survivors
    // (was a stale "currently 27" comment here, itself already stale by the
    // time this file was re-measured — further folds since then narrowed
    // it further; pinned exactly now instead of re-describing a moving
    // target in prose). Not a widened tolerance: the roster itself shrank
    // by design, same as every prior re-pin in this chain.
    expect(offered.length).toBe(23);
    expect(offered).toContain('ladder');
    expect(offered).toContain('none');
    expect(offered).not.toContain('etfKang'); // flow, excluded by mark class
    expect(offered).not.toContain('mazeFill'); // web, excluded by mark class
    expect(offered).not.toContain('isophoteWidth'); // hatch, excluded per-id (fs-n2 Stage 1)
    expect(offered).not.toContain('onePenDown'); // wave, excluded per-id (fs-t1/U9b) — chart-space-verified bridge, nothing to walk on a flat footprint; ALSO has no recipe of its own (see clampShadowToneLaw's forward-resolve)
  });

  // U9b — the sweep's own shape: every ALIASES member either (a) has its own
  // shadows.js recipe and joins the sweep, or (b) is `onePenDown`, the one
  // exception. Pinned explicitly so a future fold silently landing without a
  // shadow recipe (U6's own "known-bad" failure mode, caught and fixed for
  // `penStipple`) fails HERE, at the roster-shape level, not just by chance
  // in the collision sweep below.
  test('sanity — collapse-option sweep: every ALIASES member is IN the sweep except onePenDown, exactly', () => {
    const offered = offeredLawIds();
    const extra = collapseOptionIds(offered);
    const roster = V.SCENE3D_TONE_LAWS;
    const allAliases = Object.keys(roster.ALIASES);
    expect(allAliases.length).toBe(18);
    expect(extra.length).toBe(17);
    expect(extra.sort()).toEqual(allAliases.filter((id) => id !== 'onePenDown').sort());
    expect(extra).not.toContain('onePenDown');
    expect(sweepIds().length).toBe(40);
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

  // U9b — the re-pinned HEADLINE: "offered set x each survivor's collapse
  // options" (LEDGER.md row 18b item 1), extending the OFFERED-only check
  // above to also cover every raw folded id a saved document can carry and
  // shadows.js can actually draw distinctly. No-collision bar KEPT (still
  // `expect(collisions).toEqual([])`) — only the universe swept grew.
  test('HEADLINE (U9b) — no two ids in the FULL sweep (offered survivors + each one\'s collapse options) render byte-identical shadow geometry', () => {
    const sweep = sweepIds();
    expect(sweep.length).toBe(40); // 23 offered + 17 collapse options
    const seen = new Map();
    sweep.forEach((id) => {
      const paths = buildShadows(id);
      expect(sPaths(paths).length, id).toBeGreaterThan(0);
      const fp = fingerprint(paths);
      if (!seen.has(fp)) seen.set(fp, []);
      seen.get(fp).push(id);
    });
    const collisions = [...seen.values()].filter((ids) => ids.length > 1);
    expect(collisions).toEqual([]); // 0 collisions across the full 40-id sweep
    expect(seen.size).toBe(sweep.length);
  });

  // U9b (b) — the documented EXCEPTION to the "no collision" bar: onePenDown
  // is not IN the sweep above (excluded, same as it is excluded from
  // `offeredLawIds()`), but a raw `shadowToneLaw:'onePenDown'` is still
  // reachable through an old saved document (U9's own raw-pass-through
  // contract), and params.js's `clampShadowToneLaw` now resolves it FORWARD
  // to its survivor `interlockWeave` (U9b's own fix — see params.js) rather
  // than letting it fall through shadows.js's own markClass override to the
  // undifferentiated 'ladder' fallback. This is a DELIBERATE, byte-identical
  // duplicate — U8's own finding that interlockWeave/onePenDown are already
  // an indistinguishable PICTURE — never a defect the HEADLINE sweeps
  // should catch.
  test('onePenDown (U9b) — a raw legacy shadowToneLaw resolves through Params.normalizeParams to interlockWeave and draws BYTE-IDENTICAL to it, never the plain-hatch fallback', () => {
    const onePenDown = buildShadows('onePenDown');
    const interlockWeave = buildShadows('interlockWeave');
    const ladder = buildShadows('ladder');
    expect(fingerprint(onePenDown)).toBe(fingerprint(interlockWeave));
    expect(fingerprint(onePenDown)).not.toBe(fingerprint(ladder));
    expect(sPaths(onePenDown).length).toBeGreaterThan(0);
  });

  test('determinism survives per-law-id variation — same id, same output, twice', () => {
    const offered = offeredLawIds();
    offered.forEach((id) => {
      const a = buildShadows(id);
      const b = buildShadows(id);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
  });

  // U9b — determinism must also hold across the WIDER sweep (collapse
  // options included), not just the offered survivors above.
  test('determinism (U9b) — the full sweep is deterministic too, same id twice', () => {
    sweepIds().forEach((id) => {
      const a = buildShadows(id);
      const b = buildShadows(id);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
  });
});
