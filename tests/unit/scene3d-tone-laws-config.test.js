const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Unit 1 of the tone-integration plan: `src/config/scene3d-tone-laws.js` is
 * the generated, committed catalog of all 48 measured Scene 3D tone laws.
 * Nothing consumes it yet (Wave 1 is foundations-only, no user-visible
 * change) — this file guards the CONTRACT the later waves are written
 * against: `window.Vectura.SCENE3D_TONE_LAWS` with IDS/PRODUCTION/LIBRARY/
 * FAMILIES/BY_ID/selectGroups() exactly as documented in the plan.
 *
 * `onePenDown` (fs-r1) was promoted from implemented-but-unreachable to the
 * 48th roster entry — production tier, `wave` family — so the counts below
 * moved 47→48 and PRODUCTION 36→37; LIBRARY (11) is untouched.
 */
describe('Vectura.SCENE3D_TONE_LAWS — the generated tone-law config module', () => {
  let runtime;
  let LAWS;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    LAWS = runtime.window.Vectura.SCENE3D_TONE_LAWS;
  });
  afterAll(() => runtime.cleanup());

  test('exists and has exactly 48 unique ids', () => {
    expect(LAWS).toBeTruthy();
    expect(Array.isArray(LAWS.IDS)).toBe(true);
    expect(LAWS.IDS.length).toBe(48);
    expect(new Set(LAWS.IDS).size).toBe(48);
  });

  test('PRODUCTION (37) and LIBRARY (11) are disjoint and union to IDS', () => {
    expect(LAWS.PRODUCTION.length).toBe(37);
    expect(LAWS.LIBRARY.length).toBe(11);

    const prod = new Set(LAWS.PRODUCTION);
    const lib = new Set(LAWS.LIBRARY);
    for (const id of prod) expect(lib.has(id)).toBe(false);

    const union = new Set([...LAWS.PRODUCTION, ...LAWS.LIBRARY]);
    expect(union.size).toBe(48);
    expect([...union].sort()).toEqual([...LAWS.IDS].sort());
  });

  test('every FAMILIES[*].laws id is in IDS, and every IDS id is in exactly one family', () => {
    expect(Array.isArray(LAWS.FAMILIES)).toBe(true);
    const idSet = new Set(LAWS.IDS);
    const seenIn = new Map();

    for (const fam of LAWS.FAMILIES) {
      expect(Array.isArray(fam.laws)).toBe(true);
      for (const id of fam.laws) {
        expect(idSet.has(id)).toBe(true);
        expect(seenIn.has(id)).toBe(false); // not already claimed by another family
        seenIn.set(id, fam.id);
      }
    }
    for (const id of LAWS.IDS) {
      expect(seenIn.has(id)).toBe(true);
    }
  });

  test('every BY_ID entry has a non-empty label, mechanism and chooseWhen', () => {
    for (const id of LAWS.IDS) {
      const entry = LAWS.BY_ID[id];
      expect(entry).toBeTruthy();
      expect(typeof entry.label).toBe('string');
      expect(entry.label.length).toBeGreaterThan(0);
      expect(typeof entry.mechanism).toBe('string');
      expect(entry.mechanism.length).toBeGreaterThan(0);
      expect(typeof entry.chooseWhen).toBe('string');
      expect(entry.chooseWhen.length).toBeGreaterThan(0);
    }
  });

  test('exactly 6 entries are simulated, and they are the six pen* ids', () => {
    const simulated = LAWS.IDS.filter((id) => LAWS.BY_ID[id].simulated === true);
    expect(simulated.length).toBe(6);
    expect(simulated.every((id) => id.startsWith('pen'))).toBe(true);
    expect(new Set(simulated)).toEqual(
      new Set(['penInterleave', 'penStipple', 'penReserve', 'penCross', 'penPitchMatch', 'penFacing'])
    );
  });

  test('selectGroups(false) yields 9 groups totalling 37 options; selectGroups(true) totals 48', () => {
    const production = LAWS.selectGroups(false);
    expect(production.length).toBe(9);
    const prodCount = production.reduce((n, g) => n + g.options.length, 0);
    expect(prodCount).toBe(37);

    const all = LAWS.selectGroups(true);
    expect(all.length).toBe(9);
    const allCount = all.reduce((n, g) => n + g.options.length, 0);
    expect(allCount).toBe(48);
  });

  // Fill-roster collapse (docs/3d-audit/lane-reports/W-22-24-W-18-plan.md).
  // PICKER_IDS/ALIASES/STYLE_PARAMS shrink one cluster at a time, U1…U8.
  // PICKER_IDS.length is a single CUMULATIVE fact (not a per-unit delta), so
  // this is ONE evolving test whose expected numbers each unit BUMPS in
  // place — exactly the plan's own §5 instruction ("each unit bumps this
  // test's expected counts": U1 45, U2 43, U3 42, U4 39, U5 35, U6 32, U7
  // 31, U8 30) — rather than one new test per unit stacked on the same
  // counter (which cannot all pass at once). `IDS`/`PRODUCTION`/`LIBRARY`
  // above stay untouched forever — this is a picker-tier cut, not an
  // engine-vocabulary change.
  test('PICKER_IDS/ALIASES: cumulative collapse state (bumped by every unit, U1 through U8) — every alias resolvable', () => {
    // Current state after U5 (C-05, contFieldSigmoid/fieldMetric+fieldFloor,
    // the one two-descriptor survivor): 35 survivors, 13 aliases (U1's 3 +
    // U2's 2 + U3's 1 + U4's 3 + U5's 4). This is the end of the U1-U5
    // chain (Phase 1 continues with U6-U8 in a later session). Bump this
    // pair (and the id list below) at U6-U8; paste the before/after in the
    // unit's commit body.
    const EXPECTED_PICKER_IDS_LENGTH = 35;
    const EXPECTED_ALIAS_IDS = [
      'fineLadder', 'phaseFineLadder', 'perceptualRamp', 'whiteBand', 'nibAngle', 'weightSmoothstep',
      'bundleEased', 'bundleDither', 'bundleHandoff', 'contFieldFore', 'contFieldSurface',
      'contFieldQuant', 'contFieldTouch',
    ];

    expect(Array.isArray(LAWS.PICKER_IDS)).toBe(true);
    expect(LAWS.PICKER_IDS.length).toBe(EXPECTED_PICKER_IDS_LENGTH);
    expect(new Set(LAWS.PICKER_IDS).size).toBe(EXPECTED_PICKER_IDS_LENGTH);
    // 'ladder' (U1's survivor) is the shipped DEFAULT, deliberately not a
    // roster id — it can never appear in PICKER_IDS (derived from IDS).
    expect(LAWS.PICKER_IDS.indexOf('ladder')).toBe(-1);
    expect(LAWS.PICKER_IDS.every((id) => LAWS.IDS.indexOf(id) !== -1)).toBe(true);

    const aliasIds = Object.keys(LAWS.ALIASES);
    expect(aliasIds.length).toBe(EXPECTED_ALIAS_IDS.length);
    expect(new Set(aliasIds)).toEqual(new Set(EXPECTED_ALIAS_IDS));
    aliasIds.forEach((id) => {
      // Every alias key is a real (still-measured) roster id, resolvable to
      // a survivor + the collapse param(s) that reproduce it exactly (any
      // one of that survivor's descriptors, not just its first — needed
      // from U5 on, the one multi-descriptor survivor).
      expect(LAWS.IDS.indexOf(id)).not.toBe(-1);
      const a = LAWS.ALIASES[id];
      const descriptors = LAWS.STYLE_PARAMS[a.into];
      expect(Array.isArray(descriptors)).toBe(true);
      const matched = descriptors.some((d) => {
        const opt = (d.options || []).find((o) => o.law === id);
        return opt && a.params[d.key] === opt.value;
      });
      expect(matched).toBe(true);
    });

    // PICKER_IDS ∪ keys(ALIASES) === IDS exactly (the same invariant the
    // build script's own throw enforces at generation time).
    const union = new Set(LAWS.PICKER_IDS.concat(aliasIds));
    expect(union.size).toBe(LAWS.IDS.length);
    LAWS.IDS.forEach((id) => expect(union.has(id)).toBe(true));
  });

  test('regenerating the module from docs/tone-laws/laws.json is a byte-identical no-op', () => {
    const repoRoot = path.resolve(__dirname, '../..');
    const committedPath = path.join(repoRoot, 'src/config/scene3d-tone-laws.js');
    const generatorPath = path.join(repoRoot, 'scripts/build-tone-laws.js');
    const tmpOut = path.join(repoRoot, 'tests/.tmp-scene3d-tone-laws-regen.js');

    // The generator writes to a fixed OUTPUT_PATH inside itself, so run it
    // against a scratch copy of the repo's script that redirects output to a
    // temp file, rather than editing the real generator's constants.
    const src = fs.readFileSync(generatorPath, 'utf8');
    const patched = src.replace(
      "const OUTPUT_PATH = path.join(REPO_ROOT, 'src/config/scene3d-tone-laws.js');",
      `const OUTPUT_PATH = ${JSON.stringify(tmpOut)};`
    );
    expect(patched).not.toBe(src); // sanity: the replace actually matched

    const tmpGenerator = path.join(repoRoot, 'tests/.tmp-build-tone-laws.js');
    fs.writeFileSync(tmpGenerator, patched, 'utf8');
    try {
      execFileSync(process.execPath, [tmpGenerator], { cwd: repoRoot });
      const committed = fs.readFileSync(committedPath, 'utf8');
      const regenerated = fs.readFileSync(tmpOut, 'utf8');
      expect(regenerated).toBe(committed);
    } finally {
      fs.rmSync(tmpGenerator, { force: true });
      fs.rmSync(tmpOut, { force: true });
    }
  });
});
