/*
 * RGR — F1-amp: THE SECOND HALF OF F1. Back-port Round 6's amplitude FLOOR
 * to the four PRE-Round-6 flat-coverage wave laws (`interlockWeave`,
 * `trochoidLoop`, `amplitudeOnly`, `onePenDown` — `RIBBON_LAWS` ∩
 * `isWaveLaw()` ∩ `!isWv6()`, the same four F1-placement's `wvPlaceCov`
 * fallthrough scopes to, `src/core/scene3d/surface-fill.js:75`).
 *
 * `docs/3d-audit/lane-reports/F1-placement-plan.md` §6: F1-placement fixed
 * WHERE the rulings land, but not what they draw once they get there. For
 * these four laws `wvAmpAsk` (`:4076` in this tree) is `k * <a law-specific
 * max>` with `k = wvRamp(I)` — and `wvRamp` is EXACTLY zero for every
 * `I >= WV_I0` (0.62, `:3855`). Above the highlight threshold the "weave" is
 * therefore a perfectly straight, unwavering ruling, however evenly
 * F1-placement spaces it — the file's own header already calls this
 * "the defect Jay named, not a feature" for the WV6 laws Round 6 fixed.
 * These four predate Round 6 and never got the fix.
 *
 * THE ORACLE. `ampMeanLit` (the file's pre-existing "waviness throughout"
 * counter) gates at a looser `I >= 0.55`, so it is not a clean "above WV_I0"
 * read. This unit adds three new counters to the SAME `waveStat` object,
 * gated at exactly `I >= WV_I0` (`hiSamples`/`hiAmpSum`/`hiDrawnSum`/
 * `hiElongSum`, surface-fill.js's waveStat initializer + the per-sample loop
 * beside the existing `lit*` block), reported as `wave.hiShareMean`
 * (amplitude AS A SHARE OF THE DRAWN PITCH — the same unit `wvAmpAsk`
 * returns and `aFlo` is stated in) and `wave.hiElongMean` (mean elongation —
 * ink-per-unit-arc, since the file's own Round 5 header derives ink from arc
 * length: "the pen genuinely travels farther; this is an addition, not a
 * redistribution"). A law with no floor reports `hiShareMean ~ 0` and
 * `hiElongMean ~ 1.0` (a straight ruling has no extra arc length); a floored
 * law reports both durably above those values for every sample at or above
 * WV_I0, not just some.
 *
 * These `hi*` counters live inside `lastFloorStats.wave`, which the file
 * only ASSIGNS in `TONE_UNCAPPED` mode (a permanent, never-shipped debug
 * flag, `const TONE_UNCAPPED = false;`) — `TONE_UNCAPPED` mode is also ~10x
 * slower (`UNCAPPED_MAX_LINES` vs `MASTER_MAX_LINES`) and unusable for a
 * unit test budget. This file borrows `scene3d-tone-quant-flow-live.test.js`'s
 * own technique (patch the loaded source text, in THIS process's copy of the
 * module, never the committed file) but narrower: it flips only the ONE
 * ternary that gates the diagnostic object's ASSIGNMENT
 * (`lastFloorStats = TONE_UNCAPPED ? { ... } : null;` -> `... = true ? {`),
 * leaving every OTHER read of `TONE_UNCAPPED` untouched, so the render stays
 * at the committed CAPPED speed and only the (harmless, pre-existing,
 * already-computed-either-way) diagnostic object gets exposed.
 *
 * ANTI-VACUITY / MUTATION-KILL. This file loads TWO runtimes from the SAME
 * current-tree source (so both carry the `hi*` instrumentation identically —
 * a real `git show 6e1ed52f` baseline predates the instrumentation itself
 * and cannot report `wave.hiShareMean` at all, confirmed the hard way while
 * building this file): the fixed tree, and a WIRING-REVERTED mutation that
 * replaces `wvAmpAsk`'s five new-floor lines (`:4106-4110`) with their exact
 * pre-fix text (`return k * <const>;`, no floor) via a text patch on the
 * loaded copy, changing nothing else. This is a real mutation kill, not a
 * historical-sha diff: it isolates the ONE mechanism this unit ships.
 * `F1AMP_BASELINE_SHA` (`6e1ed52f`, F1-erode's landed sha, this unit's own
 * base commit) is used separately, by the impl report, for the whole-repo
 * guard-file re-derivation (those files need no `hi*` instrumentation).
 *
 *   npx vitest run tests/unit/scene3d-ribbon-f1-amp.test.js   # every RED/GREEN pair below is asserted directly, no env var needed
 */
const fs = require('fs');
const path = require('path');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const {
  captureClipGroups, captureSelfOcclusionFootprint,
} = require('../helpers/scene3d-ring-coverage');
const { captureRegionRings, buildBlankMap, findBlankClusters } = require('../helpers/scene3d-blank-map');

const REL_PATH = 'src/core/scene3d/surface-fill.js';
const ROOT_DIR = path.resolve(__dirname, '..', '..');
// NOTE: this unit's own base commit is `6e1ed52f` (F1-erode's landed sha) --
// used by the impl report for the whole-repo guard-file re-derivation, which
// needs no `hi*` instrumentation and so reads that sha directly with `git
// archive`. This file's own RED/GREEN pair uses the WIRING-REVERT mutation
// below instead (see the file header) because `6e1ed52f` predates the `hi*`
// counters themselves and cannot report `wave.hiShareMean` at all.

const WAVE_EXPOSE_NEEDLE = 'lastFloorStats = TONE_UNCAPPED ? {';
const WAVE_EXPOSE_REPL = 'lastFloorStats = true ? {';

const patchWaveExpose = (src) => {
  const escaped = WAVE_EXPOSE_NEEDLE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const count = (src.match(new RegExp(escaped, 'g')) || []).length;
  if (count !== 1) throw new Error(`WAVE_EXPOSE_NEEDLE count = ${count}, expected 1 (source drifted?)`);
  return src.replace(WAVE_EXPOSE_NEEDLE, WAVE_EXPOSE_REPL);
};

// The exact five lines `wvAmpAsk` ships this unit's floor on (surface-fill.js
// :4106-4110). Reverting them to their pre-fix text is a real mutation kill:
// it removes the ONE mechanism this unit adds while leaving the `hi*`
// instrumentation (added beside `waveStat`'s existing `lit*` counters, and in
// the `wave: {...}` report object) fully intact, so pre/post are measured by
// the identical yardstick.
const WIRING_NEEDLE = [
  "      if (TONE_ALGO === 'interlockWeave') return WV_AFLOOR_SHARE + (WV_AMAX - WV_AFLOOR_SHARE) * k;",
  "      if (TONE_ALGO === 'trochoidLoop') return WV_TROCH_AFLOOR_SHARE + (WV_TROCH_AMAX - WV_TROCH_AFLOOR_SHARE) * k;",
  "      if (TONE_ALGO === 'tourScribble') return k * WV_SCRIB_AMAX;",
  "      if (TONE_ALGO === 'amplitudeOnly') return WV_AFLOOR_SHARE + (0.46 - WV_AFLOOR_SHARE) * k;",
  "      if (TONE_ALGO === 'onePenDown') return WV_AFLOOR_SHARE + (WV_AMAX - WV_AFLOOR_SHARE) * k;",
].join('\n');
const WIRING_REPL = [
  "      if (TONE_ALGO === 'interlockWeave') return k * WV_AMAX;",
  "      if (TONE_ALGO === 'trochoidLoop') return k * WV_TROCH_AMAX;",
  "      if (TONE_ALGO === 'tourScribble') return k * WV_SCRIB_AMAX;",
  "      if (TONE_ALGO === 'amplitudeOnly') return k * 0.46;",
  "      if (TONE_ALGO === 'onePenDown') return k * WV_AMAX;",
].join('\n');

const patchWiringRevert = (src) => {
  const count = src.split(WIRING_NEEDLE).length - 1;
  if (count !== 1) throw new Error(`WIRING_NEEDLE count = ${count}, expected 1 (source drifted?)`);
  return src.split(WIRING_NEEDLE).join(WIRING_REPL);
};

let headSourceCache = null;
const loadHeadSource = () => {
  if (!headSourceCache) headSourceCache = fs.readFileSync(path.join(ROOT_DIR, REL_PATH), 'utf8');
  return headSourceCache;
};

// `mutate: true` -> the wiring-reverted mutation (pre-fix wvAmpAsk, same
// instrumentation). `mutate: false` -> the shipped fix, unmodified.
const runtimeOptionsFor = (mutate) => {
  let src = patchWaveExpose(loadHeadSource());
  if (mutate) src = patchWiringRevert(src);
  return { scriptOverrides: { [REL_PATH]: src } };
};

const polylineLenMm = (pts) => {
  let L = 0;
  for (let i = 1; i < pts.length; i += 1) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return L;
};
const totalInkMm = (paths) => (paths || []).reduce((s, p) => s + polylineLenMm(p), 0);

// The four subject laws (see header). `RIBBON_LAWS` ∩ `isWaveLaw()` ∩
// `!isWv6()` -- confirmed against `surface-fill.js:75`'s `RIBBON_LAWS` and
// `:4076`'s `WV_LAWS` roster.
const LAWS = ['interlockWeave', 'trochoidLoop', 'amplitudeOnly', 'onePenDown'];
// WV6 laws -- MUST stay byte-identical: `wvAmpAsk`'s `c6` branch short-
// circuits before any of this unit's edits are reached.
const CONTROL_WV6 = ['ampSpacing', 'weaveDepth'];
// The other six `isWaveLaw()` members (`nestedSerpentine`, `waveToRuling`,
// `nestedOctaves`, `hilbertDepth`, `sfcHalftone`, `tourScribble`) are NOT
// live controls here: none is in the current `SCENE3D_TONE_LAWS` roster
// (`src/config/scene3d-tone-laws.js` -- confirmed by grep and, the hard way,
// by `engine`'s own "unknown toneLaw ... falling back to ladder" warning
// when this file first tried `nestedSerpentine`). The trailing default
// (`return k * WV_AMAX;`) and the `tourScribble` branch in `wvAmpAsk` are
// therefore dead code through any reachable app path today -- there is no
// live law left to leak the fix to beyond the four subjects and the two WV6
// laws already controlled below.
// Not a wave law at all (`isWaveLaw()` false) -- the `wbFlatCov` sibling
// defect (F1-placement plan §9) is explicitly out of this unit's scope too.
const CONTROL_NON_WAVE = ['taperedEnds'];
const ALL_LAWS = [...LAWS, ...CONTROL_WV6, ...CONTROL_NON_WAVE];

const WV_AFLOOR_SHARE = 0.14; // mirrors the source constant -- asserted against, does not drive behaviour here.
// trochoidLoop's floor is deliberately much smaller (see surface-fill.js's
// own comment above `WV_TROCH_AFLOOR_SHARE`): a swept binary search on this
// exact fixture found a CLIFF in the F1-placement deep-blank oracle between
// share 0.045 (safe) and 0.05 (deepBlank 0.00 -> 5.23mm2, largest cluster
// 14.55 -> 43.66mm2) -- the rolling-circle displacement (both along- and
// across-ruling, unlike the other three laws' lateral-only sine) is far more
// disruptive to ribbon placement/erosion per unit of amplitude share.
const WV_TROCH_AFLOOR_SHARE = 0.04;
const AFLOOR_SHARE_BY_LAW = {
  interlockWeave: WV_AFLOOR_SHARE,
  trochoidLoop: WV_TROCH_AFLOOR_SHARE,
  amplitudeOnly: WV_AFLOOR_SHARE,
  onePenDown: WV_AFLOOR_SHARE,
};
// Re-derived on 6e1ed52f (this unit's own baseline), per the orchestrator's
// ruling -- not carried from F1-erode-plan.md's own (correct, but stale for
// THIS unit) ±8% figure.
const INK_BOUND_PCT = 8;

describe('SurfaceFill — F1-amp: back-port Round 6 amplitude floor to the four pre-Round-6 wave laws', () => {
  let postRuntime;
  let preRuntime;
  const post = {};
  const pre = {};

  const build = (Vectura, law) => {
    const engine = new Vectura.VectorEngine();
    const groupId = engine.addLayer('scene3d');
    const group = engine.layers.find((l) => l && l.id === groupId);
    const obj = engine.getLayerDescendants(groupId).filter((l) => l && l.type === 'object3d')[0];
    obj.params.primitive = 'torus';
    obj.params.style = obj.params.style || { penId: null, mapper: 'hatch', params: {} };
    obj.params.style.params = { ...(obj.params.style.params || {}), toneLaw: law };
    // Default camera (3/4 view), default density, pen 0.30 -- untouched,
    // matching every sibling file in this lane (f1b-streaks, wall-coverage,
    // flat-field-placement, erode-refusal).
    const cap = captureClipGroups(Vectura);
    const occCap = captureSelfOcclusionFootprint(Vectura);
    const regionCap = captureRegionRings(Vectura);
    engine.computeAllDisplayGeometry();
    cap.restore();
    occCap.restore();
    regionCap.restore();
    const wave = Vectura.Scene3D.SurfaceFill.lastFloorStats
      && Vectura.Scene3D.SurfaceFill.lastFloorStats.wave;
    const stats = { ...(Vectura.Scene3D.SurfaceFill.lastRibbonStats || {}) };
    const paths = group.scenePaths || [];
    const inkMm = totalInkMm(paths);
    const fingerprint = paths
      .map((p) => `${(p.meta && p.meta.kind) || ''}:${p.map((pt) => `${pt.x.toFixed(6)},${pt.y.toFixed(6)}`).join('|')}`)
      .join(';');
    // Belt-and-suspenders own copy of F1-placement's deep-blank oracle
    // (`scene3d-ribbon-flat-field-placement.test.js`, condition 1) --
    // trochoidLoop's own cliff (measured, see `WV_TROCH_AFLOOR_SHARE`'s
    // comment) makes this THIS unit's own responsibility to guard directly,
    // not just trust a sibling file.
    const region = regionCap.dominantRegion() || [];
    const fillInk = paths.filter((p) => p && p.meta && p.meta.kind === 'sceneFill');
    const blank = buildBlankMap(region, fillInk, 0.3, { cellSize: 0.1, thresholds: [0.8, 2.0] });
    const clusters = findBlankClusters(blank.blankByT[0.8].mask, blank.nx, blank.ny, blank.cs, blank.ox, blank.oy);
    const largestCluster = clusters.reduce((best, c) => (!best || c.areaMm2 > best.areaMm2 ? c : best), null)
      || { areaMm2: 0, lengthMm: 0 };
    return {
      wave,
      stats,
      inkMm,
      fingerprint,
      groupCount: cap.groups.length,
      deepBlankAreaMm2: blank.blankByT[2.0].areaMm2,
      largestCluster,
    };
  };

  beforeAll(async () => {
    postRuntime = await loadVecturaRuntime({ includeUi: true, ...runtimeOptionsFor(false) });
    preRuntime = await loadVecturaRuntime({ includeUi: true, ...runtimeOptionsFor(true) });
    const PV = postRuntime.window.Vectura;
    const QV = preRuntime.window.Vectura;
    ALL_LAWS.forEach((law) => {
      post[law] = build(PV, law);
      pre[law] = build(QV, law);
    });
  }, 600000);

  afterAll(async () => {
    if (postRuntime) await postRuntime.cleanup();
    if (preRuntime) await preRuntime.cleanup();
  });

  describe('RED (re-derived on 6e1ed52f) / MUTATION-KILL — pre-fix, the four subjects are a plain ruling above WV_I0', () => {
    test.each(LAWS)('%s — pre-fix hiShareMean is ~0 (no amplitude floor above WV_I0)', (law) => {
      const { wave } = pre[law];
      expect(wave, `${law}: wave stats missing`).toBeTruthy();
      expect(wave.hiSamples, `${law}: hiSamples=${wave.hiSamples}`).toBeGreaterThan(0);
      expect(wave.hiShareMean, `${law}: hiShareMean=${wave.hiShareMean}`).toBeLessThan(0.02);
    });

    test.each(LAWS)('%s — pre-fix hiElongMean is ~1.0 (no extra arc length spent on waviness)', (law) => {
      const { wave } = pre[law];
      expect(wave.hiElongMean, `${law}: hiElongMean=${wave.hiElongMean}`).toBeLessThan(1.01);
    });
  });

  describe('GREEN — the amplitude floor survives above WV_I0 post-fix', () => {
    test.each(LAWS)('%s — post-fix hiShareMean sits durably above the pre-fix (near-zero) reading', (law) => {
      const { wave } = post[law];
      const floor = AFLOOR_SHARE_BY_LAW[law];
      expect(wave.hiSamples, `${law}: hiSamples=${wave.hiSamples}`).toBeGreaterThan(0);
      // A working margin below the law's own nominal floor share: the
      // interlock clearance cap (`fMax`, interlockWeave only) and the WV_TAPER_MM
      // end-taper both legitimately pull SOME samples' share below the nominal
      // floor without defeating the mechanism -- the MEAN across every
      // highlight sample is the honest gate, not a per-sample minimum.
      // trochoidLoop's own floor (0.04) is deliberately much smaller than the
      // other three (0.14) -- see `WV_TROCH_AFLOOR_SHARE`'s comment above.
      expect(wave.hiShareMean, `${law}: hiShareMean=${wave.hiShareMean} (pre-fix was ${pre[law].wave.hiShareMean}, nominal floor ${floor})`)
        .toBeGreaterThanOrEqual(floor * 0.5);
    });

    test.each(LAWS)('%s — post-fix hiElongMean shows real extra arc length (the weave is actually drawn)', (law) => {
      const { wave } = post[law];
      expect(wave.hiElongMean, `${law}: hiElongMean=${wave.hiElongMean} (pre-fix was ${pre[law].wave.hiElongMean})`)
        .toBeGreaterThan(1.01);
    });

    test.each(LAWS)('%s — not a no-op: hiShareMean moved by a real margin, not sampling noise', (law) => {
      const floor = AFLOOR_SHARE_BY_LAW[law];
      expect(post[law].wave.hiShareMean - pre[law].wave.hiShareMean).toBeGreaterThan(floor * 0.5);
    });
  });

  describe('Guards — ribbon stats do not regress (F1-erode\'s fix must hold)', () => {
    test.each(LAWS)('%s — degenerate stays at 0', (law) => {
      expect(post[law].stats.degenerate, `${law}: degenerate=${post[law].stats.degenerate}`).toBe(0);
    });

    test('interlockWeave — erodeEmpty stays at 0', () => {
      expect(post.interlockWeave.stats.erodeEmpty).toBe(0);
    });

    test.each(LAWS)('%s — wide does not fall relative to pre-fix', (law) => {
      const before = pre[law].stats.wide;
      const after = post[law].stats.wide;
      expect(after, `${law}: wide ${before} -> ${after}`).toBeGreaterThanOrEqual(before);
    });

    test('interlockWeave — the anti-phase clearance floor is not weakened by the new highlight amplitude', () => {
      // `clearMin` is the minimum realised clearance ACROSS THE WHOLE FAMILY.
      // interlockWeave's own `fMax` clamp already enforces WV_CLEAR_FLOOR at
      // the dark end; if the new highlight floor ever dominated clearMin
      // downward, ink would be at explosion risk. It must not fall below the
      // pre-fix minimum (a small numeric epsilon covers float noise).
      expect(post.interlockWeave.wave.clearMin)
        .toBeGreaterThanOrEqual(pre.interlockWeave.wave.clearMin - 1e-6);
    });
  });

  describe('Stop condition — F1-placement\'s own deep-blank oracle must not regress (the trochoidLoop cliff)', () => {
    // Re-derived, own copy, of scene3d-ribbon-flat-field-placement.test.js's
    // condition-1/condition-2 bars (0.55mm2 deep-blank +-10%, 45mm2 largest
    // cluster) -- that file is a MUST-STAY-GREEN guard for this unit and was
    // independently re-run clean, but the cliff this unit found (trochoidLoop
    // regresses from 0.00 to 3.97mm2 deep-blank at share 0.05, a HARD
    // threshold, not a gradual slope, between share 0.045 and 0.05) is squarely
    // this unit's own mechanism to guard, not just a sibling file's.
    test.each(LAWS)('%s — post-fix deep-blank (>2mm) stays at/under the ruled bar (0.55mm2)', (law) => {
      const { deepBlankAreaMm2 } = post[law];
      expect(deepBlankAreaMm2, `${law}: deepBlank=${deepBlankAreaMm2.toFixed(4)}mm2`).toBeLessThanOrEqual(0.55);
    });

    test.each(LAWS)('%s — post-fix largest dist>0.8mm cluster stays at/under the ruled bar (45mm2)', (law) => {
      const { largestCluster } = post[law];
      expect(largestCluster.areaMm2, `${law}: largest cluster ${JSON.stringify(largestCluster)}`)
        .toBeLessThanOrEqual(45);
    });
  });

  describe('Stop condition — whole-object ink stays inside ±8% (re-derived on 6e1ed52f)', () => {
    test.each(LAWS)('%s — ink delta is within the bound', (law) => {
      const before = pre[law].inkMm;
      const after = post[law].inkMm;
      const deltaPct = ((after - before) / before) * 100;
      expect(Math.abs(deltaPct), `${law}: before=${before.toFixed(2)}mm after=${after.toFixed(2)}mm delta=${deltaPct.toFixed(2)}%`)
        .toBeLessThanOrEqual(INK_BOUND_PCT);
    });
  });

  describe('Scoping controls — byte-identical geometry for every law this fix must not touch', () => {
    test.each([...CONTROL_WV6, ...CONTROL_NON_WAVE])('%s — fingerprint unchanged', (law) => {
      expect(post[law].fingerprint.length, `${law}: fingerprint empty`).toBeGreaterThan(0);
      expect(post[law].fingerprint).toBe(pre[law].fingerprint);
    });

    test.each(CONTROL_WV6)('%s — hiShareMean also unchanged (belt and suspenders on the diagnostic itself)', (law) => {
      expect(post[law].wave.hiShareMean).toBeCloseTo(pre[law].wave.hiShareMean, 6);
    });
  });
});
