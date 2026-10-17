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
 * ONE RUNTIME (R-27). The shipped source plus the diagnostic exposure patch.
 * The bars are absolute (hiShareMean >= half the nominal floor share, real
 * extra arc length), so the old wiring-reverted runtime is not needed to make
 * them fail. Mutation proof (commit message): reverting `wvAmpAsk`'s floor
 * lines to `return k * <max>;` fails every GREEN bar below.
 */
const fs = require('fs');
const path = require('path');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const REL_PATH = 'src/core/scene3d/surface-fill.js';
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const WAVE_EXPOSE_NEEDLE = 'lastFloorStats = TONE_UNCAPPED ? {';
const WAVE_EXPOSE_REPL = 'lastFloorStats = true ? {';

const patchWaveExpose = (src) => {
  const escaped = WAVE_EXPOSE_NEEDLE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const count = (src.match(new RegExp(escaped, 'g')) || []).length;
  if (count !== 1) throw new Error(`WAVE_EXPOSE_NEEDLE count = ${count}, expected 1 (source drifted?)`);
  return src.replace(WAVE_EXPOSE_NEEDLE, WAVE_EXPOSE_REPL);
};

let headSourceCache = null;
const loadHeadSource = () => {
  if (!headSourceCache) headSourceCache = fs.readFileSync(path.join(ROOT_DIR, REL_PATH), 'utf8');
  return headSourceCache;
};

const runtimeOptions = () => ({ scriptOverrides: { [REL_PATH]: patchWaveExpose(loadHeadSource()) } });

// The four subject laws (see header). `RIBBON_LAWS` ∩ `isWaveLaw()` ∩
// `!isWv6()` -- confirmed against `surface-fill.js:75`'s `RIBBON_LAWS` and
// `:4076`'s `WV_LAWS` roster.
const LAWS = ['interlockWeave', 'trochoidLoop', 'amplitudeOnly', 'onePenDown'];
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
describe('SurfaceFill — F1-amp: back-port Round 6 amplitude floor to the four pre-Round-6 wave laws', () => {
  let runtime;
  const post = {};

  const build = (Vectura, law) => {
    const engine = new Vectura.VectorEngine();
    const groupId = engine.addLayer('scene3d');
    const obj = engine.getLayerDescendants(groupId).filter((l) => l && l.type === 'object3d')[0];
    obj.params.primitive = 'torus';
    obj.params.style = obj.params.style || { penId: null, mapper: 'hatch', params: {} };
    obj.params.style.params = { ...(obj.params.style.params || {}), toneLaw: law };
    // Default camera (3/4 view), default density, pen 0.30.
    engine.computeAllDisplayGeometry();
    const wave = Vectura.Scene3D.SurfaceFill.lastFloorStats
      && Vectura.Scene3D.SurfaceFill.lastFloorStats.wave;
    const stats = { ...(Vectura.Scene3D.SurfaceFill.lastRibbonStats || {}) };
    return { wave, stats };
  };

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeUi: true, ...runtimeOptions() });
    LAWS.forEach((law) => { post[law] = build(runtime.window.Vectura, law); });
  }, 300000);

  afterAll(async () => { if (runtime) await runtime.cleanup(); });

  describe('GREEN — the amplitude floor survives above WV_I0', () => {
    test.each(LAWS)('%s — hiShareMean sits at least half the nominal floor share', (law) => {
      const { wave } = post[law];
      const floor = AFLOOR_SHARE_BY_LAW[law];
      expect(wave, `${law}: wave stats missing`).toBeTruthy();
      expect(wave.hiSamples, `${law}: hiSamples=${wave.hiSamples}`).toBeGreaterThan(0);
      // A working margin below the law's own nominal floor share: the
      // interlock clearance cap (`fMax`, interlockWeave only) and the WV_TAPER_MM
      // end-taper both legitimately pull SOME samples' share below the nominal
      // floor without defeating the mechanism -- the MEAN across every
      // highlight sample is the honest gate, not a per-sample minimum.
      expect(wave.hiShareMean, `${law}: hiShareMean=${wave.hiShareMean} (nominal floor ${floor})`)
        .toBeGreaterThanOrEqual(floor * 0.5);
    });

    test.each(LAWS)('%s — hiElongMean shows real extra arc length (the weave is actually drawn)', (law) => {
      const { wave } = post[law];
      expect(wave.hiElongMean, `${law}: hiElongMean=${wave.hiElongMean}`).toBeGreaterThan(1.01);
    });

    test.each(LAWS)('%s — ribbon degenerate stays at 0', (law) => {
      expect(post[law].stats.degenerate, `${law}: degenerate=${post[law].stats.degenerate}`).toBe(0);
    });
  });
});
