/**
 * THE §0 SINGLE-SOURCE RULE, AS A TEST INSTEAD OF A PARAGRAPH.
 *
 * `docs/shadow-anatomy/criteria.md` §0 states it:
 *
 *   > A harness reads its fixture from `tests/fixtures/scene3d-shadow-anatomy.js`
 *   > and never restates one. Broken five times; each time it produced a silent
 *   > scoring corruption. [R4, R6, R7, R8, and the ladder test found in R9]
 *
 * Five recorded breaks, and a sixth found in Round 10: six unit harnesses were
 * restating the rig, five of them quoted in the review documents as the pin for
 * a protected item, and the workstream's NAMESAKE test had already drifted to
 * `pitch: 22 / elevation: 45` against the fixture's `32 / 28`. It was measuring a
 * camera and a sun that no rendered view uses, and it had been doing so, green,
 * for eight rounds.
 *
 * A rule written down six times and broken six times is not a rule, it is a
 * wish. This file is the rule.
 *
 * WHY IT IS SHAPED THE WAY IT IS
 * ------------------------------
 * The obvious guard — "no `tests/unit/scene3d-*.test.js` may contain a camera
 * literal" — is unusable: 34 of the 53 scene3d unit tests build a small camera of
 * their own, and almost none of them have anything to do with shadow anatomy.
 * `cameraDistance: 620` and `focalLength: 520` are `ALGO_DEFAULTS`' own values,
 * so they identify nothing. A guard that needs a 30-file allowlist is noise, and
 * noise gets suppressed rather than obeyed.
 *
 * So it is two narrow rules, each of which would have caught a real break:
 *
 *   A. THE RIG SIGNATURE IS NOT RESTATED. The shadow-anatomy rig's camera pitch
 *      (32) and sun elevation (28) are unique to it across the entire scene3d
 *      unit suite — no other test uses either number. A file that reproduces one
 *      is copying this rig, whatever it calls itself, and must import instead.
 *      This catches the five latent copies the Round 10 review found.
 *
 *   B. A CONSUMER RESTATES NOTHING. Any scene3d unit test that imports the
 *      fixture must take its whole scene from it — no inline camera, light, tone
 *      ladder, bounds or primitive. This catches the drift case, which rule A
 *      cannot: the namesake test's stale copy said `pitch: 22`, so a signature
 *      scan would have walked straight past it. The consumer set is discovered
 *      by reading the imports, never enumerated, so it cannot go stale.
 *
 * Both allowlists are empty. If one ever gains an entry it must carry its reason
 * on the same line.
 */
const fs = require('fs');
const path = require('path');

const UNIT_DIR = path.join(__dirname);
const FIXTURE_REQUIRE = 'fixtures/scene3d-shadow-anatomy';

// Comments are prose and may legitimately quote a number or a key — the Round 10
// notes in these very files do. Only CODE is scanned.
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/([^:])\/\/.*$/gm, '$1');

// This file is excluded from its own scan, and it is the ONLY exclusion: it
// deliberately contains known-bad camera, light, tone, bounds and primitive
// strings so the guard can be shown able to say NO (see the last describe).
const SELF = path.basename(__filename);

const scene3dTests = () => fs.readdirSync(UNIT_DIR)
  .filter((f) => /^scene3d-.*\.test\.js$/.test(f) && f !== SELF)
  .sort();

const read = (f) => stripComments(fs.readFileSync(path.join(UNIT_DIR, f), 'utf8'));

const hits = (src, re) => {
  const out = [];
  src.split('\n').forEach((line, i) => { if (re.test(line)) out.push(`L${i + 1}: ${line.trim()}`); });
  return out;
};

describe('§0 — the shadow-anatomy fixture is the single source, and it is enforced', () => {
  test('the fixture module exists and exports the rig this guard is stated in terms of', () => {
    // If the fixture is renamed or its exports are gutted, every rule below
    // would pass vacuously. Fail loudly instead.
    // eslint-disable-next-line global-require
    const FIX = require('../fixtures/scene3d-shadow-anatomy');
    expect(FIX.CAMERA.pitch).toBe(32);
    expect(FIX.SUN.elevation).toBe(28);
    expect(FIX.SUN.azimuth).toBe(135);
    expect(typeof FIX.toneBands).toBe('function');
    expect(typeof FIX.styleTable).toBe('function');
    ['BOUNDS', 'SEED', 'BALL', 'CUBE', 'LOWPOLY', 'CAPSULE', 'BIGBALL', 'BALL_LADDER']
      .forEach((k) => expect(FIX[k]).toBeDefined());
  });

  test('there are scene3d unit harnesses importing the fixture (the guard is not vacuous)', () => {
    const consumers = scene3dTests().filter((f) => read(f).includes(FIXTURE_REQUIRE));
    // Round 10 moved six more onto it, taking the set from 3 to 9+.
    expect(consumers.length).toBeGreaterThanOrEqual(9);
  });

  // ── RULE A ────────────────────────────────────────────────────────────────
  //
  // The rig's two identifying numbers. `yaw: -30`, `cameraDistance: 620`,
  // `focalLength: 520` and `azimuth: 135` are all ALGO_DEFAULTS values shared
  // with unrelated tests, so they cannot serve; `pitch: 32` and `elevation: 28`
  // are the fixture's own and appear nowhere else in the suite.
  describe('A — no scene3d unit test restates the shadow-anatomy rig', () => {
    const RIG_SIGNATURES = [
      { what: "the fixture camera's pitch", re: /\bpitch:\s*32\b/ },
      { what: "the fixture sun's elevation", re: /\belevation:\s*28\b/ },
    ];
    // Empty. An entry here needs its justification on the same line.
    const ALLOW = {};

    RIG_SIGNATURES.forEach(({ what, re }) => {
      test(`${what} appears in no test file — it is imported, not copied`, () => {
        const busts = [];
        scene3dTests().forEach((f) => {
          if (ALLOW[f]) return;
          hits(read(f), re).forEach((h) => busts.push(`${f} ${h}`));
        });
        expect(busts).toEqual([]);
      });
    });
  });

  // ── RULE B ────────────────────────────────────────────────────────────────
  describe('B — a file that imports the fixture takes its whole scene from it', () => {
    const RESTATEMENTS = [
      { what: 'an inline camera literal', re: /\bprojection:\s*['"]/ },
      { what: 'an inline camera object', re: /(\bcamera:\s*\{|\.camera\s*=\s*\{)(?![^}]*\.\.\.)/ },
      { what: 'an inline light literal', re: /\btype:\s*['"]directional['"]/ },
      { what: 'an inline tone ladder', re: /\bladder:\s*\[\s*[\d.]/ },
      { what: 'an inline bounds literal', re: /\bpenWidth:\s*0\.3\b/ },
      { what: 'an inline primitive object', re: /\bprimitive:\s*['"](sphere|box|capsule|solid)['"]/ },
      { what: 'an inline solid definition', re: /\bsolidType:\s*['"]/ },
    ];
    // Empty. An entry here needs its justification on the same line.
    const ALLOW = {};

    RESTATEMENTS.forEach(({ what, re }) => {
      test(`no fixture consumer contains ${what}`, () => {
        const busts = [];
        scene3dTests().forEach((f) => {
          const src = read(f);
          if (!src.includes(FIXTURE_REQUIRE)) return;   // not a shadow-anatomy harness
          if ((ALLOW[f] || []).includes(what)) return;
          hits(src, re).forEach((h) => busts.push(`${f} ${h}`));
        });
        expect(busts).toEqual([]);
      });
    });
  });

  // ── THE GUARD CAN SAY NO ──────────────────────────────────────────────────
  //
  // §0's other standing rule: "a probe's output may not be quoted until the
  // probe has been shown able to say NO". This guard is a probe, so it is fed a
  // known-bad file and must report it. Without this the two describes above
  // could be passing because the regexes match nothing at all — which is exactly
  // how `r7audit-protected.js` printed `cast 0.00mm/0p` for a whole round.
  describe('the guard reports a planted violation (it can say NO)', () => {
    const PLANTED = [
      ["const CAMERA = { projection: 'orthographic', yaw: -30, pitch: 32, roll: 0 };",
        [/\bpitch:\s*32\b/, /\bprojection:\s*['"]/]],
      ["const SUN = { id: 'sun', type: 'directional', azimuth: 135, elevation: 28 };",
        [/\belevation:\s*28\b/, /\btype:\s*['"]directional['"]/]],
      ['const TONE4 = { bands: 4, ladder: [0.15, 0.4, 0.65, 0.9] };', [/\bladder:\s*\[\s*[\d.]/]],
      ['p.camera = { yaw: -30, cameraDistance: 620 };', [/(\bcamera:\s*\{|\.camera\s*=\s*\{)(?![^}]*\.\.\.)/]],
      ["const BALL = { primitive: 'sphere', params: { radius: 46 } };",
        [/\bprimitive:\s*['"](sphere|box|capsule|solid)['"]/]],
      ['const BOUNDS = { width: 320, penWidth: 0.3, truncate: 4 };', [/\bpenWidth:\s*0\.3\b/]],
    ];

    PLANTED.forEach(([line, regexes]) => {
      test(`caught: ${line.slice(0, 46)}...`, () => {
        regexes.forEach((re) => expect(hits(stripComments(line), re).length).toBeGreaterThan(0));
      });
    });

    test('a comment quoting the rig is NOT a violation (prose is not code)', () => {
      // The Round 10 headers in these files quote `pitch: 22 -> 32` on purpose.
      // A guard that flagged its own explanation would be deleted within a round.
      const prose = ' * camera pitch      22   ->  32   (the fixture)\n// elevation: 28 is the rig\n';
      expect(hits(stripComments(prose), /\bpitch:\s*32\b/)).toEqual([]);
      expect(hits(stripComments(prose), /\belevation:\s*28\b/)).toEqual([]);
    });

    test('a fixture-derived override is NOT a violation (spreading is not restating)', () => {
      // `{ ...CAMERA, yaw }` is the sanctioned way to sweep one axis: the rig
      // still comes from the module and only the swept value is written down.
      const ok = 'p.camera = { ...clone(CAMERA), pitch };\n';
      expect(hits(stripComments(ok), /(\bcamera:\s*\{|\.camera\s*=\s*\{)(?![^}]*\.\.\.)/)).toEqual([]);
    });
  });
});
