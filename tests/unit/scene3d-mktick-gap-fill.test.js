const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { oracles, combNeutrality } = require('../helpers/scene3d-mktick-gap-fill');
const { pathSignature } = require('../helpers/path-signature');

/*
 * T2-6 — Jay's USER RULE clause (a), verbatim (`T2-6-plan.md`): "Instead of
 * tick fragments on the right, use gradually shortening ticks to fill the
 * black gaps at the bottom of the vertical waves."
 *
 * THREE ORACLES, defined in `T2-6-plan.md` §2 and implemented in
 * `tests/helpers/scene3d-mktick-gap-fill.js`:
 *   A1  — graded-gap share (BLOCKING). Of the non-highlight band-gap area,
 *         how much sits inside a run of >=2 sub-ticks that STRICTLY
 *         shortens (not merely non-increasing — a flat comb is not
 *         "gradually shortening", see the helper's own comment) with every
 *         consecutive step ratio >= 0.5 ("no tick under half its neighbour").
 *   A1b — the black-gap run itself (BLOCKING). The longest single
 *         uninterrupted bare interval inside a non-highlight site's own
 *         band, in row pitches — the literal size of "the black gap at the
 *         bottom of the wave".
 *   A2  — fragments (REPORTED, not gated — A2n as literally specified is
 *         INVERTED for this mechanism: filling a gap with shorter ticks
 *         necessarily creates more short ticks. A2loc, "shorter than half
 *         its own local neighbours", is the honest form).
 *   A3  — within-band length-vs-tone R^2, per row (REPORTED alongside O5,
 *         never gated alone — see the plan's own caveat, §2).
 *
 * WHICH CLAUSE: A1/A1b/neutrality gate clause (a) ONLY. They say nothing
 * about clause (b) ("don't increase overlap at the seams" — `ovMax`, held
 * exactly invariant by construction, T2-5's own file) or clause (c) ("remove
 * lines not part of a tick band" — `over2RP`, T2-5's own
 * `scene3d-mktick-band-purity.test.js`).
 *
 * THE HOOK. Same mechanism as `scene3d-mktick-band-purity.test.js` (T2-5's
 * own file): a `scriptOverrides`-patched copy of the CURRENT disk source,
 * one record per `layMark` tick site, fired via
 * `typeof globalThis.__T26_HOOK__ === 'function'` — a no-op (and provably
 * absent from every real render) whenever unwired, proven by the neutrality
 * test below. `subs[].v0/v1` are read directly off the FINAL `polys` array
 * handed to `place()` — the geometry actually placed, pre-walk/pre-truncate
 * (the same "attempted" caveat `T2-5-review.md` §3 already disclosed for
 * this class of hook); the site's own `drawn` flag comes from `place()`'s
 * real return value, and every oracle gates on it.
 *
 * PRE_TICK_BLOCK is a hand-maintained STRING CONSTANT reconstruction of the
 * T2-5-only state (`75777240`, this unit's own base sha) — not `git show
 * HEAD`. The static code-identity leg below still verifies it against a
 * `git archive 75777240` scratch export (`/private/tmp/claude-501/scratch-T26-red`).
 *
 * R4-fix (round-4 merge, 2026-09-19): the ORIGINAL "SEMANTIC PRE
 * reconstruction proof" leg rendered PRE_TICK_BLOCK spliced onto the CURRENT
 * `surface-fill.js` and compared it, byte-for-byte, against rendering a
 * `git archive 75777240` export of the WHOLE TREE directly. That premise only
 * holds while `scene3d.js` (loaded from disk in both runtimes, never
 * overridden) is unchanged between the compared trees. Once W-32 Rank 4
 * (`3d-scene/border-4`) refined the silhouette/boundary edge pass in
 * `scene3d.js`, the CURRENT-tree side picked up the refined edge geometry
 * while the archived-75777240 side did not — a small floating-point
 * coordinate divergence in the reconstructed edge path, unrelated to mkTick,
 * broke a self-test that was never mkTick's to gate (`R4-fix-impl.md`,
 * `MERGE-review-r4.md` §2 item 6: bisected independently to a genuine
 * cross-lane interaction, not a T2-5/T2-6 regression). This is the same
 * vacuous/environment-dependent leg class W-38b already fixed once in
 * `scene3d-facet-min-rulings.test.js` (comparing against a live `git show
 * HEAD:` can never disagree with itself once the fix is committed forever;
 * comparing against a live `git archive <sha>:` breaks the instant ANY
 * OTHER file moves between the compared trees — same defect, different sha).
 * Replaced with a PINNED GOLDEN fingerprint of PRE_TICK_BLOCK's own rendering
 * ON THE TREE UNDER TEST (`EXPECTED_PRE_SIGNATURE` below, `pathSignature`
 * precision 4, the same convention `scene3d-facet-min-rulings.test.js`/
 * `scene3d-mktick-wedge.test.js` already use), proven non-vacuous by a
 * CONTRAST MUTATION: the SHIPPED tree (T2-6's comb wired, no override) must
 * diverge from every one of these twelve golden fingerprints — if it didn't,
 * the golden would not be sensitive to the very mechanism it exists to
 * freeze. RE-PIN ONLY WITH PROOF (RED/GREEN numbers in the commit body).
 *
 *   npx vitest run tests/unit/scene3d-mktick-gap-fill.test.js
 */

const REL_PATH = 'src/core/scene3d/surface-fill.js';
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const BOUNDS = {
  width: 1200, height: 1000, m: 20, dW: 1160, dH: 960, penWidth: 0.3,
};
const SUN = {
  id: 'sun', type: 'directional', azimuth: 135, elevation: 45, intensity: 1, castShadows: false,
};
const clone = (v) => JSON.parse(JSON.stringify(v));
const CELLS = [
  ['sphere', 'hatch'], ['sphere', 'contour'],
  ['torus', 'hatch'], ['torus', 'contour'],
  ['cone', 'hatch'], ['cone', 'contour'],
];

const buildSceneParams = (Params, defaults, {
  mapper, fillDensity, primitive, rig,
}) => {
  const p = clone(defaults);
  const bag = rig === 'create'
    ? { ...clone(Params.PRIMITIVE_PARAM_DEFAULTS[primitive] || {}), ...clone(Params.PRIMITIVE_CREATE_DEFAULTS[primitive] || {}) }
    : clone(Params.PRIMITIVE_PARAM_DEFAULTS[primitive] || {});
  p.objects = [{
    id: 'obj', name: 'Obj', primitive, params: bag,
    transform: {
      x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1,
    },
    visibility: 'solid',
  }];
  p.ground = { enabled: false };
  p.backdrop = { enabled: false };
  p.camera = clone(Params.DEFAULT_CAMERA);
  p.tone = { ...clone(defaults).tone, enabled: true };
  p.lights = [SUN];
  p.styleTable = {
    scene: {
      penId: null, mapper, params: { fillAngle: 45, fillDensity, toneLaw: 'mkTick' },
    },
    byObject: {},
    byFace: {},
  };
  return p;
};

const renderCellWithSites = (runtime, {
  mapper, primitive, rig = 'test', fillDensity = 50,
}) => {
  const V = runtime.window.Vectura;
  const algo = V.AlgorithmRegistry.scene3d;
  const defaults = V.ALGO_DEFAULTS.scene3d;
  const Params = V.Scene3D.Params;
  const params = buildSceneParams(Params, defaults, {
    mapper, fillDensity, primitive, rig,
  });
  const records = [];
  runtime.window.__T26_HOOK__ = (rec) => { records.push(rec); };
  const paths = algo.generate(params, null, null, BOUNDS);
  delete runtime.window.__T26_HOOK__;
  const stat = V.Scene3D.SurfaceFill.lastMarkStats;
  return {
    paths, stat, records, RP: stat.tickField.rowPitch,
  };
};

let headSourceCache = null;
const loadHeadSource = () => {
  if (!headSourceCache) headSourceCache = fs.readFileSync(path.join(ROOT_DIR, REL_PATH), 'utf8');
  return headSourceCache;
};

const T26_BLOCK_START_NEEDLE = '        } else {\n          polys = mkShape(shapeFor(), sv.L, sv.R, w);';
const T26_BLOCK_END_NEEDLE = "        if (law.shape === 'tick') mkStat.tickSites.push(sv.I, sv.R, sv.P, drawnLen ? 1 : 0);";

const spliceTickBlock = (src, replacementBlock) => {
  const startIdx = src.indexOf(T26_BLOCK_START_NEEDLE);
  if (startIdx < 0) throw new Error('spliceTickBlock: T2-6 block start not found (source drifted?)');
  const endIdx = src.indexOf(T26_BLOCK_END_NEEDLE, startIdx);
  if (endIdx < 0) throw new Error('spliceTickBlock: T2-6 block end not found (source drifted?)');
  const endPos = endIdx + T26_BLOCK_END_NEEDLE.length;
  return src.slice(0, startIdx) + replacementBlock + src.slice(endPos);
};

const HOOK_CALL = `
        if (typeof globalThis.__T26_HOOK__ === 'function' && law.shape === 'tick') {
          globalThis.__T26_HOOK__({
            I: sv.I, R: sv.R, P: sv.P, L: sv.L, a, k, lineIndex,
            drawn: !!drawnLen, comb: t26Comb, dir: t26Dir,
            subs: polys.map((pl) => ({ v0: Math.min(pl[0][1], pl[1][1]), v1: Math.max(pl[0][1], pl[1][1]) })),
          });
        }`;

// ── POST-fix (T2-6's own shipped code), instrumented — wholesale replacement
// of the shipped block (byte-identical geometry, two hoisted flags + one
// hook call added), same technique `scene3d-mktick-band-purity.test.js`
// uses for T2-5. Proven neutral below.
const POST_TICK_BLOCK_INSTRUMENTED = `        } else {
          polys = mkShape(shapeFor(), sv.L, sv.R, w);
          var t26Comb = false;
          var t26Dir = 0;
          if (law.shape === 'tick') {
            const nominalRP = masterPitch / MK_ROW_COV;
            const nOver = clamp(Math.ceil((law.L0 * sv.R) / Math.max(1e-6, 2 * nominalRP)), 1, 6);
            const probeI = (dv) => {
              const pp = fr.toParam(0, dv);
              if (!(pp.a >= 0 && pp.a <= 1)) return null;
              let bb = pp.b;
              if (bb < 0 || bb > 1) {
                if (bb < -0.25 || bb > 1.25) return null;
                bb = ((bb % 1) + 1) % 1;
              }
              const sm = sampleAt(pp.a, bb);
              return (sm && sm.front === wantFront && Number.isFinite(sm.I)) ? sm.I : null;
            };
            const iP = probeI(0.5 * sv.R);
            const iM = probeI(-0.5 * sv.R);
            let sgnDark = 0;
            if (iP != null && iM != null) sgnDark = (iP < iM) ? 1 : ((iP > iM) ? -1 : 0);
            else if (iP != null) sgnDark = -1;
            else if (iM != null) sgnDark = 1;
            t26Dir = sgnDark;
            const bandOn = (iP != null && iM != null);
            const minKeep = penWidth;
            let nComb = 1;
            let e0 = 0;
            if (bandOn && sv.L >= MK_TICK_COMB_MIN_R * sv.R && sv.L < 0.98 * sv.R) {
              for (let n = MK_TICK_COMB_MAX; n >= 2; n -= 1) {
                const den = (1 - MK_TICK_COMB_RHO ** n) / (1 - MK_TICK_COMB_RHO);
                const a0 = sv.L / den;
                if (a0 <= (MK_TICK_COMB_ENV * sv.R) / n && a0 * MK_TICK_COMB_RHO ** (n - 1) >= minKeep) {
                  nComb = n; e0 = a0; break;
                }
              }
            }
            const nSub = Math.max(nOver, nComb);
            const uniformSplit = (nComb < 2 || nSub !== nComb || sv.L >= sv.R);
            t26Comb = (nSub > 1 && !uniformSplit);
            if (nSub > 1) {
              const sub = (uniformSplit ? sv.R : MK_TICK_COMB_ENV * sv.R) / nSub;
              const dir = sgnDark >= 0 ? 1 : -1;
              const tiled = [];
              for (let j = 0; j < nSub; j++) {
                const each = uniformSplit ? (sv.L / nSub) : (e0 * MK_TICK_COMB_RHO ** j);
                const slot = dir > 0 ? (nSub - 1 - j) : j;
                const vCenter = (slot - (nSub - 1) / 2) * sub;
                tiled.push([[0, vCenter - each / 2], [0, vCenter + each / 2]]);
              }
              polys = tiled;
            } else {
              const room = 0.5 * Math.max(0, sv.R - sv.L);
              if (room > 1e-6) {
                const idx = a / Math.max(1e-6, sv.P);
                const uu = ((idx * 0.6180339887498949) % 1 + 1) % 1;
                const cOff = room * (2 * uu - 1);
                polys = polys.map((pl) => pl.map((pt) => [pt[0], pt[1] + cOff]));
              }
            }
          }
        }
        const drawnLen = place(fr, polys, a - arcMM[k], thetaAt(k, fr));
        if (law.shape === 'tick') mkStat.tickSites.push(sv.I, sv.R, sv.P, drawnLen ? 1 : 0);${HOOK_CALL}`;

const buildPostSource = () => spliceTickBlock(loadHeadSource(), POST_TICK_BLOCK_INSTRUMENTED);

// ── PRE-fix reconstruction — the T2-5-only state (this unit's OWN base sha,
// `75777240`), byte-verified against `git archive 75777240` in
// `/private/tmp/claude-501/scratch-T26-red`. No comb, no direction probe.
const PRE_TICK_BLOCK = `        } else {
          polys = mkShape(shapeFor(), sv.L, sv.R, w);
          if (law.shape === 'tick') {
            const nominalRP = masterPitch / MK_ROW_COV;
            const nSub = clamp(Math.ceil((law.L0 * sv.R) / Math.max(1e-6, 2 * nominalRP)), 1, 6);
            if (nSub > 1) {
              const sub = sv.R / nSub;
              const each = sv.L / nSub;
              const tiled = [];
              for (let j = 0; j < nSub; j++) {
                const vCenter = (j - (nSub - 1) / 2) * sub;
                const room = 0.5 * Math.max(0, sub - each);
                let cOff = 0;
                if (room > 1e-6) {
                  const idx = (a / Math.max(1e-6, sv.P)) + j * 0.6180339887498949;
                  const uu = ((idx * 0.6180339887498949) % 1 + 1) % 1;
                  cOff = room * (2 * uu - 1);
                }
                tiled.push([[0, vCenter - each / 2 + cOff], [0, vCenter + each / 2 + cOff]]);
              }
              polys = tiled;
            } else {
              const room = 0.5 * Math.max(0, sv.R - sv.L);
              if (room > 1e-6) {
                const idx = a / Math.max(1e-6, sv.P);
                const uu = ((idx * 0.6180339887498949) % 1 + 1) % 1;
                const cOff = room * (2 * uu - 1);
                polys = polys.map((pl) => pl.map((pt) => [pt[0], pt[1] + cOff]));
              }
            }
          }
        }
        const drawnLen = place(fr, polys, a - arcMM[k], thetaAt(k, fr));
        if (law.shape === 'tick') mkStat.tickSites.push(sv.I, sv.R, sv.P, drawnLen ? 1 : 0);
        if (typeof globalThis.__T26_HOOK__ === 'function' && law.shape === 'tick') {
          globalThis.__T26_HOOK__({
            I: sv.I, R: sv.R, P: sv.P, L: sv.L, a, k, lineIndex,
            drawn: !!drawnLen, comb: false, dir: 0,
            subs: polys.map((pl) => ({ v0: Math.min(pl[0][1], pl[1][1]), v1: Math.max(pl[0][1], pl[1][1]) })),
          });
        }`;

const buildPreSource = () => spliceTickBlock(loadHeadSource(), PRE_TICK_BLOCK);

// Verify PRE_TICK_BLOCK is a faithful reconstruction of this unit's OWN base
// sha (`75777240`), not a re-typed guess — the class of error
// `T2-3-review.md`/`T2-3b-plan.md` §5.1 found `git show HEAD` is prone to.
//
// CI-5, 2026-09-19: this leg used to require a hand-materialized scratch
// export at a hardcoded `/private/tmp/claude-501/scratch-T26-red/...` path
// (`git archive 75777240 | tar -x -C ...`, run by hand before committing) —
// that path never exists on a fresh CI runner, so the test threw
// unconditionally there (ci.log: "base-sha scratch export missing"). Reads
// the same historical blob directly via `git show <sha>:<path>` instead (the
// idiom every other `getPreFixXSource`/`getPreT3cSource` helper in this
// suite already uses, e.g. `scene3d-shadow-footprint-wiring.test.js`), with
// no scratch directory and no hardcoded path. `75777240` is an ancestor of
// `main` (`git merge-base --is-ancestor 75777240 <main HEAD>` — verified),
// so this only needs the checkout to carry full history: the `unit`/
// `coverage` jobs in `.github/workflows/test.yml` now pass
// `fetch-depth: 0`.
const BASE_SHA = '75777240';
let baseShaSrcCache = null;
const getBaseShaSrc = () => {
  if (baseShaSrcCache) return baseShaSrcCache;
  const rootDir = path.resolve(__dirname, '..', '..');
  try {
    baseShaSrcCache = execFileSync(
      'git',
      ['show', `${BASE_SHA}:${REL_PATH}`],
      { cwd: rootDir, maxBuffer: 1024 * 1024 * 64 },
    ).toString('utf8');
  } catch (e) {
    throw new Error(`git show ${BASE_SHA}:${REL_PATH} failed — needs full git history `
      + `(this checkout may be shallow; CI passes fetch-depth: 0 for this reason). `
      + `Original error: ${e && e.message}`);
  }
  return baseShaSrcCache;
};

// PINNED GOLDEN (R4-fix, replaces the live `git archive 75777240` comparison
// — see the file header comment for why). `pathSignature` (precision 4,
// `tests/helpers/path-signature.js`) of PRE_TICK_BLOCK's own rendering
// (`buildPreSource()`, i.e. CURRENT scene3d.js + CURRENT surface-fill.js with
// its tick block reverted to the T2-5-only shape), one entry per
// `${rig}|${primitive}/${mapper}`, all twelve `CELLS` x both rigs. Recorded
// once, directly from this file's own harness (`renderCellWithSites` +
// `buildPreSource()`), on the round-4 merged tree (`cf6b3c2f`) — not
// hand-typed or copied from another file's fixture (this file's `CELLS`/rig/
// camera/density setup is its own, not necessarily identical to
// `scene3d-mktick-wedge.test.js`'s, so its `EXPECTED_SIGNATURE` values are a
// different measurement and are not expected to match key-for-key; six of
// twelve happen to coincide, four do not — coincidence is not claimed either
// way here). Correctness rests on: (1) the static code-identity leg above,
// which independently proves `PRE_TICK_BLOCK` is a faithful, byte-for-byte
// reconstruction of the real `75777240` tick block; (2) the CONTRAST
// MUTATION test below, which proves these twelve values are sensitive to the
// T2-6 mechanism they exist to freeze, not a vacuous tautology. RE-PIN ONLY
// WITH PROOF: a fingerprint change here must be accompanied in the commit
// body by the RED/GREEN numbers showing the product change that legitimately
// moved it — never re-pinned to silence a failure.
const EXPECTED_PRE_SIGNATURE = {
  'test|sphere/hatch': 'fec6f83a509d0667c3154a10ab298b69ca1dbe18f542af79985d9430220dd487',
  'test|sphere/contour': 'b1b3def087399e229903728f3f21374d7a3f58bc658412dcb6040178267685e5',
  'test|torus/hatch': '7c12b6b4b17a54461852c3384dc3808f4adfb87eb14860c3c4a7b18b4923f4ca',
  'test|torus/contour': '9badc0813901afdc6245addb43c13e69c521c2819f7507dca9ae1a78ab67300b',
  'test|cone/hatch': '8e006cbf3d8904c54af18d781edab83692f2c50dece4ab1a7fe0b2580acf4e90',
  'test|cone/contour': '3760b050052766836a1f31fa760a9418734b4d328de74f904d028618d6b12d59',
  'create|sphere/hatch': '1ea2030933057ddb6c7c44f92d24f3212b7124284eb37e7c3eb8c06966a4c595',
  'create|sphere/contour': '6b6edd1e68c2cf4e3e4bd11bf32a21104989dbe90a126c21f8cf585991ddce15',
  'create|torus/hatch': '467252415a17e9d9e5d1b02e701e618ed3dd10db96057a313ffdf8fb85822916',
  'create|torus/contour': '69370635bff442cdde5c8f1804622dc9f6e136e67a5107fe9326fd81a472c960',
  'create|cone/hatch': 'dc12abcc02debcd409f4a1e52dd26142f4730fdbdddb41030a453d3edf981c53',
  'create|cone/contour': 'd9a36e63a15f0f260d5f32317645de75a2425d933366e679715eb3028f23dd83',
};

// GATE — the RED bar (`T2-6-plan.md` §6.3 item 1). Two of twelve fixtures
// (`create|torus/hatch`, `create|torus/contour`) do not clear it — the
// `bandOn` gate disables the comb on the torus's own foreshortened bands
// (§4.2 spike gate / §4.3 table). Their own measured post-fix values are
// used as their bar instead, per the plan's own instruction.
const A1B_BAR = 0.42; // row pitches
const A1B_BAR_EXCEPT = {
  'create|torus/hatch': 0.51,
  'create|torus/contour': 0.46,
};
// GATE — A1 graded-gap share, per `T2-6-plan.md` §6.3 item 2. Restricted to
// the cells the plan itself names (cone/*, sphere/*, test|torus/*) — the
// create-rig torus cells are excluded for the SAME `bandOn` reason as A1b.
const A1_BAR = 0.35;
const A1_CELLS = [
  ['create', 'sphere/hatch'], ['create', 'sphere/contour'],
  ['create', 'cone/hatch'], ['create', 'cone/contour'],
  ['test', 'sphere/hatch'], ['test', 'sphere/contour'],
  ['test', 'cone/hatch'], ['test', 'cone/contour'],
  ['test', 'torus/hatch'], ['test', 'torus/contour'],
];

describe("Scene3D.SurfaceFill — mkTick graded band comb (T2-6, Jay's USER RULE clause a)", () => {
  test('PRE_TICK_BLOCK CODE (comments stripped) is identical to the real base sha (75777240) tick block', () => {
    const baseSrc = getBaseShaSrc();
    const startIdx = baseSrc.indexOf(T26_BLOCK_START_NEEDLE);
    const endIdx = baseSrc.indexOf(T26_BLOCK_END_NEEDLE, startIdx);
    expect(startIdx).toBeGreaterThan(-1);
    expect(endIdx).toBeGreaterThan(-1);
    const realBlock = baseSrc.slice(startIdx, endIdx + T26_BLOCK_END_NEEDLE.length);
    // Strip `//`-comment lines and blank lines from BOTH sides — the real
    // block carries T2-5's own prose comments, PRE_TICK_BLOCK (this file)
    // does not; the CODE must still match exactly, line for line.
    const stripComments = (s) => s.split('\n')
      .map((l) => l.replace(/\s+$/, ''))
      .filter((l) => l.trim() !== '' && !l.trim().startsWith('//'))
      .join('\n');
    const preSansHook = PRE_TICK_BLOCK.split(`
        if (typeof globalThis.__T26_HOOK__`)[0];
    expect(stripComments(preSansHook)).toBe(stripComments(realBlock));
  });

  test('PINNED GOLDEN: PRE_TICK_BLOCK rendering on THIS tree matches the fingerprint recorded at '
    + 'R4-fix, per cell, both rigs (replaces the live git-archive-base-sha comparison — see the file '
    + 'header comment)', async () => {
    const preRt = await loadVecturaRuntime({ scriptOverrides: { [REL_PATH]: buildPreSource() } });
    try {
      for (const rig of ['test', 'create']) {
        for (const [primitive, mapper] of CELLS) {
          const key = `${rig}|${primitive}/${mapper}`;
          const r = renderCellWithSites(preRt, { primitive, mapper, rig });
          const sig = pathSignature(r.paths);
          const expected = EXPECTED_PRE_SIGNATURE[key];
          if (!expected) {
            throw new Error(`EXPECTED_PRE_SIGNATURE missing entry — paste this in:\n  '${key}': '${sig}',`);
          }
          expect(sig).toBe(expected);
        }
      }
    } finally {
      await preRt.cleanup();
    }
  }, 180000);

  test('CONTRAST MUTATION (non-vacuity, W-38b pattern): the SHIPPED tree (T2-6\'s comb wired, no '
    + 'override) diverges from the PRE_TICK_BLOCK golden on every named cell — proves the golden is '
    + 'sensitive to the mechanism it freezes, not a tautology that would pass no matter what rendered',
  async () => {
    const plain = await loadVecturaRuntime();
    try {
      const divergent = [];
      for (const rig of ['test', 'create']) {
        for (const [primitive, mapper] of CELLS) {
          const key = `${rig}|${primitive}/${mapper}`;
          const r = renderCellWithSites(plain, { primitive, mapper, rig });
          const sig = pathSignature(r.paths);
          if (sig !== EXPECTED_PRE_SIGNATURE[key]) divergent.push(key);
        }
      }
      // Every one of the twelve cells must move: T2-6-impl.md's own roster
      // sweep found 12/1184 cells changed and every single one was mkTick —
      // these twelve ARE that set (mkTick x {sphere,torus,cone} x
      // {hatch,contour} x both rigs), so a non-mutated golden here would be
      // a real vacuous-pass defect, not a partial-coverage nuance.
      expect(divergent.length).toBe(12);
    } finally {
      await plain.cleanup();
    }
  }, 180000);

  describe('instrumentation neutrality — the hook changes NOTHING when unwired', () => {
    test('POST source with hook wired vs UNMODIFIED disk source: byte-identical paths on every cell, both rigs', async () => {
      const plain = await loadVecturaRuntime();
      const instrumented = await loadVecturaRuntime({ scriptOverrides: { [REL_PATH]: buildPostSource() } });
      try {
        for (const rig of ['test', 'create']) {
          for (const [primitive, mapper] of CELLS) {
            const p = renderCellWithSites(plain, { primitive, mapper, rig });
            const i = renderCellWithSites(instrumented, { primitive, mapper, rig });
            expect(JSON.stringify(i.paths)).toBe(JSON.stringify(p.paths));
          }
        }
      } finally {
        await plain.cleanup();
        await instrumented.cleanup();
      }
    }, 180000);
  });

  describe('RED at the PRE-fix (T2-5 only, base sha 75777240) — re-derived on THIS tree', () => {
    let runtime;
    const results = {};

    beforeAll(async () => {
      runtime = await loadVecturaRuntime({ scriptOverrides: { [REL_PATH]: buildPreSource() } });
      for (const rig of ['test', 'create']) {
        results[rig] = {};
        for (const [primitive, mapper] of CELLS) {
          results[rig][`${primitive}/${mapper}`] = renderCellWithSites(runtime, { primitive, mapper, rig });
        }
      }
    }, 180000);

    afterAll(async () => { if (runtime) await runtime.cleanup(); });

    test('A1b BLOCKING bar (<=0.42 RP): FAILS on at least ten of twelve fixtures pre-fix', () => {
      let over = 0;
      ['test', 'create'].forEach((rig) => {
        CELLS.forEach(([primitive, mapper]) => {
          const r = results[rig][`${primitive}/${mapper}`];
          const A = oracles(r.records, r.RP);
          if (A.A1b_bareRunP95 > A1B_BAR) over += 1;
        });
      });
      expect(over).toBeGreaterThanOrEqual(10);
    });

    test('A1 BLOCKING bar (>=0.35): FAILS on every one of the ten named cells pre-fix', () => {
      A1_CELLS.forEach(([rig, key]) => {
        const r = results[rig][key];
        const A = oracles(r.records, r.RP);
        expect(A.A1_gradedGapShare == null ? 0 : A.A1_gradedGapShare).toBeLessThan(A1_BAR);
      });
    });

    test('no GRADED comb exists pre-fix (A1_combGraded === 0 on every fixture — T2-5\'s own '
      + 'over-wide-band retiling can still produce multi-sub-tick sites via clause (c), but they '
      + 'are UNIFORM (equal-length) and so never satisfy the strict-monotone graded criterion)', () => {
      ['test', 'create'].forEach((rig) => {
        CELLS.forEach(([primitive, mapper]) => {
          const r = results[rig][`${primitive}/${mapper}`];
          const A = oracles(r.records, r.RP);
          expect(A.A1_combGraded).toBe(0);
        });
      });
    });
  });

  describe('GREEN at the shipped tree (T2-6) — the current disk source, instrumented only', () => {
    let runtime;
    const results = {};

    beforeAll(async () => {
      runtime = await loadVecturaRuntime({ scriptOverrides: { [REL_PATH]: buildPostSource() } });
      for (const rig of ['test', 'create']) {
        results[rig] = {};
        for (const [primitive, mapper] of CELLS) {
          results[rig][`${primitive}/${mapper}`] = renderCellWithSites(runtime, { primitive, mapper, rig });
        }
      }
    }, 180000);

    afterAll(async () => { if (runtime) await runtime.cleanup(); });

    describe('A1b — black-gap run, BLOCKING', () => {
      ['test', 'create'].forEach((rig) => {
        CELLS.forEach(([primitive, mapper]) => {
          const key = `${primitive}/${mapper}`;
          const bar = A1B_BAR_EXCEPT[`${rig}|${key}`] != null ? A1B_BAR_EXCEPT[`${rig}|${key}`] : A1B_BAR;
          test(`${rig}|${key}: bareRunP95 <= ${bar} RP`, () => {
            const r = results[rig][key];
            const A = oracles(r.records, r.RP);
            expect(A.A1b_bareRunP95).toBeLessThanOrEqual(bar);
          });
        });
      });
    });

    describe('A1 — graded-gap share, BLOCKING on the named cells', () => {
      A1_CELLS.forEach(([rig, key]) => {
        test(`${rig}|${key}: gradedGapShare >= ${A1_BAR}`, () => {
          const r = results[rig][key];
          const A = oracles(r.records, r.RP);
          expect(A.A1_gradedGapShare).toBeGreaterThanOrEqual(A1_BAR);
        });
      });
    });

    test('MUTATION-KILL: forcing a FLAT comb (RHO=1.0, all sub-ticks equal) makes A1 fall on cone/hatch, both rigs', async () => {
      // This is the mutation the plan's own item 2 requires — it proves the
      // oracle reads "gradually SHORTENING", not merely "split into >=2
      // sub-ticks" (`T2-6-plan.md` §4.5 Rank 4, rejected as oracle-gaming).
      const flatSrc = loadHeadSource().replace(
        'const MK_TICK_COMB_RHO = 0.62;',
        'const MK_TICK_COMB_RHO = 1.0;',
      );
      expect(flatSrc).not.toBe(loadHeadSource());
      const flatSrcPatched = spliceTickBlock(flatSrc, POST_TICK_BLOCK_INSTRUMENTED);
      const rt = await loadVecturaRuntime({ scriptOverrides: { [REL_PATH]: flatSrcPatched } });
      try {
        for (const rig of ['test', 'create']) {
          const r = renderCellWithSites(rt, { primitive: 'cone', mapper: 'hatch', rig });
          const flatA = oracles(r.records, r.RP);
          const shippedA = oracles(results[rig]['cone/hatch'].records, results[rig]['cone/hatch'].RP);
          expect(flatA.A1_combSites).toBeGreaterThan(0); // combs still fire — only their shape changed
          expect(flatA.A1_gradedGapShare == null ? 0 : flatA.A1_gradedGapShare)
            .toBeLessThan(shippedA.A1_gradedGapShare);
        }
      } finally { await rt.cleanup(); }
    }, 180000);

    test('MUTATION-KILL: forcing nComb=1 (no comb ever fires) returns A1b to >= 0.48 RP on cone/hatch, both rigs', async () => {
      const noCombSrc = loadHeadSource().replace(
        'const MK_TICK_COMB_MAX = 2;',
        'const MK_TICK_COMB_MAX = 1;',
      );
      expect(noCombSrc).not.toBe(loadHeadSource());
      const noCombPatched = spliceTickBlock(noCombSrc, POST_TICK_BLOCK_INSTRUMENTED);
      const rt = await loadVecturaRuntime({ scriptOverrides: { [REL_PATH]: noCombPatched } });
      try {
        for (const rig of ['test', 'create']) {
          const r = renderCellWithSites(rt, { primitive: 'cone', mapper: 'hatch', rig });
          const A = oracles(r.records, r.RP);
          expect(A.A1_combGraded).toBe(0);
          expect(A.A1b_bareRunP95).toBeGreaterThanOrEqual(0.48);
        }
      } finally { await rt.cleanup(); }
    }, 180000);

    describe('Neutrality, BLOCKING — every emitted comb sums EXACTLY to sv.L', () => {
      ['test', 'create'].forEach((rig) => {
        CELLS.forEach(([primitive, mapper]) => {
          const key = `${primitive}/${mapper}`;
          test(`${rig}|${key}: max |sum(each_j) - L| < 1e-9`, () => {
            const r = results[rig][key];
            expect(combNeutrality(r.records)).toBeLessThan(1e-9);
          });
        });
      });
    });

    describe('A3 — within-band R^2, REPORTED alongside O5 (not gated alone)', () => {
      test('cone/hatch (both rigs): A3 exists and is a finite number in [0,1]', () => {
        ['test', 'create'].forEach((rig) => {
          const r = results[rig]['cone/hatch'];
          const A = oracles(r.records, r.RP);
          expect(Number.isFinite(A.A3_withinBandR2)).toBe(true);
          expect(A.A3_withinBandR2).toBeGreaterThanOrEqual(0);
          expect(A.A3_withinBandR2).toBeLessThanOrEqual(1);
        });
      });
    });

    describe('A2 — fragments, REPORTED. A2n is EXPECTED to rise (inverted for this mechanism); A2loc must not blow up', () => {
      test('cone/hatch, create: A2loc does not exceed 1.5x its pre-fix count (sanity, not a Jay-ruled bar)', async () => {
        const preRt = await loadVecturaRuntime({ scriptOverrides: { [REL_PATH]: buildPreSource() } });
        try {
          const pre = renderCellWithSites(preRt, { primitive: 'cone', mapper: 'hatch', rig: 'create' });
          const preA = oracles(pre.records, pre.RP);
          const post = results.create['cone/hatch'];
          const postA = oracles(post.records, post.RP);
          expect(postA.A2loc_fragLtHalfNbr).toBeLessThanOrEqual(preA.A2loc_fragLtHalfNbr * 1.5 + 5);
        } finally { await preRt.cleanup(); }
      }, 180000);
    });
  });
});
