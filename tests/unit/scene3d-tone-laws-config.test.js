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
