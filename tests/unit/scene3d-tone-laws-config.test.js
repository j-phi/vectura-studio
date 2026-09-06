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
  // PICKER_IDS/ALIASES/STYLE_PARAMS shrink one cluster at a time, U1…U8 —
  // each unit bumps this test's expected counts (§5 of the plan: U1 45, U2
  // 43, U3 42, U4 39, U5 35, U6 32, U7 31, U8 30) and pastes the before/after
  // in its commit body. `IDS`/`PRODUCTION`/`LIBRARY` above stay untouched
  // forever — this is a picker-tier cut, not an engine-vocabulary change.
  test('PICKER_IDS/ALIASES: U1 (C-01, ladder/rungMode) — 45 survivors, 3 aliases, every alias resolvable', () => {
    expect(Array.isArray(LAWS.PICKER_IDS)).toBe(true);
    expect(LAWS.PICKER_IDS.length).toBe(45);
    expect(new Set(LAWS.PICKER_IDS).size).toBe(45);
    // 'ladder' (the survivor) is the shipped DEFAULT, deliberately not a
    // roster id — it can never appear in PICKER_IDS (derived from IDS).
    expect(LAWS.PICKER_IDS.indexOf('ladder')).toBe(-1);
    expect(LAWS.PICKER_IDS.every((id) => LAWS.IDS.indexOf(id) !== -1)).toBe(true);

    const aliasIds = Object.keys(LAWS.ALIASES);
    expect(aliasIds.length).toBe(3);
    expect(new Set(aliasIds)).toEqual(new Set(['fineLadder', 'phaseFineLadder', 'perceptualRamp']));
    aliasIds.forEach((id) => {
      // Every alias key is a real (still-measured) roster id, resolvable to
      // a survivor + the collapse param(s) that reproduce it exactly.
      expect(LAWS.IDS.indexOf(id)).not.toBe(-1);
      const a = LAWS.ALIASES[id];
      expect(a.into).toBe('ladder');
      expect(typeof a.params).toBe('object');
      const descriptor = LAWS.STYLE_PARAMS[a.into][0];
      const opt = descriptor.options.find((o) => o.law === id);
      expect(opt).toBeTruthy();
      expect(a.params[descriptor.key]).toBe(opt.value);
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
