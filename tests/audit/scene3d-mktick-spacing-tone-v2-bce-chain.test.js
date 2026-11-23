const fs = require('fs');
const path = require('path');
const { loadScene3dAuditRuntime } = require('../helpers/scene3d-audit-runtime');
const crypto = require('crypto');
const {
  contact, thirdsSplit, covByIBins, siteCoverage, pathLen, over2RP, subMinCount,
  buildBareRaster, bareArea, inkCoverage, chainMetrics, envelopeRanges, holeComponents,
} = require('../helpers/scene3d-mktick-spacing-tone');
const {
  REL_PATH, ROOT_DIR, BOUNDS, SUN, clone, CELLS, CRUMB_MARK_LAWS, B7_CELLS, buildSceneParams, loadHeadSource, patchOne, HOOK_NEEDLE, HOOK_REPL, buildHookedSource, renderCellHooked, buildBcSource, buildScene3dSource, SCENE3D_REL, md5, plain, pathsMd5, siteKey, WIN_L, WIN_R, STRIP_L, STRIP_R,
} = require('../helpers/scene3d-mktick-spacing-tone-shared');
const {
  key, RIM_KINDS, RIM_CELLS, FULL, ALL12, agg, renderBcKinds,
} = require('../helpers/scene3d-mktick-spacing-tone-bce-render');
const { u8log } = require('../helpers/scene3d-mktick-v2-tone');

/*
 * T2-8b-3 — mechanism BC-E, "band continuation with an endpoint envelope"
 * (`T2-8b-3-plan.md`), which REPLACES T2-8b-2's `bcSide`. Jay: "fill open spaces
 * where highlight isn't needed and form a consistent set of endpoints evenly
 * offset from the perimeter or closest band." The lattice is CONTINUED past each
 * span end with the boundary site's own P/phase/segs/tone; each tick is walked
 * in its own local frame and each end is BISECTED to a constant clearance from
 * the outline (cE) or another row's ink (cB). Deferred, non-site. Sphere G5 is
 * out of scope (the rule happens to reach it on the create rig: noted, not claimed).
 *
 * MUTANTS (needle-patched copies of the CURRENT disk source; every needle is
 * asserted count === 1; nothing is written to disk):
 *   off       the deferred flush removed (== base).
 *   inline    the closures run at queue time instead of deferred.
 *   thin      admission removed AND cB = 0.2 w AND cE = 0.5 w (contact probe).
 *   dense     lattice at 0.4 x P, admission + continuity guard removed.
 *   skip1     the chain starts at j = 2.
 *   rot       each tick rotated 0.2 rad (admission and continuity guard removed so it can show).
 *   wide      band extent widened by 1 mm each side, taper cap off.
 *   noprobe   outline clearance cE = 0.
 *   nogate    `law.shape === 'tick'` dropped from the queue gate AND the segs backstop.
 *   nobisect  end bisection iterations = 0 (ends quantised to the walk step).
 *   gap       tick j=2 skipped, and nocont (an orphan-producing chain).
 *   cfat      cE = cB = 4 w (fat clearances).
 *   rulingref j=1 continuity reference = the ruling frame, not the drawn boundary tick.
 *   nohi      highlight gate MK_TICK_BC_HI_I = 1.01 (never gates).
 *   noapex    apex ticks never admitted (== T2-8b-3, `2e59a16a`, for the W_L gap).
 *   apexnorule the closing-wedge rule removed: any tick >= 1 pen is an apex tick (== the 3b behaviour, stray dashes).
 *   noflag    (scene3d.js) the apex flag check removed: EVERY run may be down to 0.3 mm (crumb probe).
 * Test-side RECORD needles (not mutations) tag every placed run so chains are
 * grouped by exact span identity and every end carries its stop reason.
 */

describe('[tone model v2] Scene3D.SurfaceFill — T2-8b-3 BC-E endpoint-envelope band continuation (cone base wedges)', () => {
  const R = {};
  const KINDS = ['ship', 'off', 'cfat', 'nobisect', 'gap', 'nohi', 'noapex', 'apexnorule', 'dense', 'skip1', 'rot', 'wide', 'noprobe'];
  // These mutants are only read on cone/hatch (R-29): render nothing else.
  const CONE_CREATE = [['create', 'cone', 'hatch']];
  const CONE_BOTH = [['create', 'cone', 'hatch'], ['test', 'cone', 'hatch']];
  const CELLS_READ = {
    off: CONE_CREATE, nobisect: CONE_BOTH, skip1: CONE_BOTH, rot: CONE_BOTH, noprobe: CONE_BOTH,
    noapex: [['create', 'cone', 'hatch'], ['test', 'torus', 'hatch']], // v2: the apex ticks live on test torus/hatch, so that is where noapex must be read
  };
  const cone = (kind, rig) => R[kind][key(50, rig, 'cone', 'hatch')];

  beforeAll(async () => {
    await renderBcKinds(R, KINDS, { toneModel: 'v2', full: [], roster: [], cells: CELLS_READ });
  }, 1800000); // bounded runtime ownership; audit remains intentionally exhaustive

  describe('WL (BLOCKING) — the W_L remnant is closed: bare >= 0.5 mm <= 0.30 mm^2 in W_L (create cone/hatch d=50)', () => {
    // GATES the triangle at the base rim at 0.5 mm clearance (finer than A1) ONLY. Not W_R, tone, or the test rig
    // (test-rig W_L reads 2.66 at 0.5 mm: a different, pre-existing remnant).
    const wl = (kind) => bareArea(cone(kind, 'create').raster, 0.5, WIN_L);
    test('shipped', () => {
            u8log('WL create cone/hatch bare>=0.5:', wl('ship'));
      expect(wl('ship')).toBeLessThanOrEqual(0.30);
    });
    test('MUTATION cfat (cE = cB = 4 w) reopens it', () => { expect(wl('cfat')).toBeGreaterThan(0.30); });
    test('MUTATION off (no continuation) reopens it', () => { expect(wl('off')).toBeGreaterThan(0.30); });
  });

  describe('ENVELOPE (BLOCKING, create + test cone/hatch) — a consistent set of endpoints evenly offset from the perimeter (E) and from the closest band (B)', () => {
    // E gates outline-class ends only (range of end-to-drawn-outline distance <= 0.10 mm, min >= 0.30). B gates
    // band-stopped ends only (range of end-to-other-row-ink distance <= 0.10 mm, min >= 0.48). Neither gates
    // unstopped (band-extent) ends, the sphere/torus silhouette ends (drawn silhouette sits 0.1-0.38 mm inside the
    // analytic limb: REPORTED), or fill (FILL).
    ['create', 'test'].forEach((rig) => {
      test(`${rig} cone/hatch`, () => {
        const e = envelopeRanges(cone('ship', rig).chains);
                u8log('ENVELOPE', rig, JSON.stringify(e));
        expect(e.E.n).toBeGreaterThan(0);
        expect(e.E.range).toBeLessThanOrEqual(0.10);
        expect(e.E.min).toBeGreaterThanOrEqual(0.30);
        expect(e.B.n).toBeGreaterThan(0);
        expect(e.B.range).toBeLessThanOrEqual(0.10);
        expect(e.B.min).toBeGreaterThanOrEqual(0.48);
      });
    });
    test('MUTATION nobisect (ends quantised to the walk step) trips E or B on both rigs', () => {
      ['create', 'test'].forEach((rig) => {
        const e = envelopeRanges(cone('nobisect', rig).chains);
                u8log('ENVELOPE nobisect', rig, JSON.stringify(e));
        expect(e.E.range > 0.10 || e.B.range > 0.10).toBe(true);
      });
    });
  });

  describe('NO-ORPHAN (BLOCKING, all 12 cells) — every continuation tick is contiguous with its predecessor (j from 1, perpendicular spacing <= 1.35 P_B)', () => {
    // GATES chain contiguity only (no isolated orphan, no mid-chain hole). Not tone, not where ends stop.
    // Disclosure: MK_TICK_BC_SEAM equals this bar's 1.35; the skipped-tick mutant proves continuity is load-bearing.
    test('0 orphans on 12/12', () => {
      ALL12.forEach(([rig, p, m]) => expect(agg(R.ship[key(50, rig, p, m)].chains).orphans).toBe(0));
    });
    test('MUTATION gap (+nocont: tick j=2 skipped) trips on create cone/hatch', () => {
      expect(agg(cone('gap', 'create').chains).orphans).toBeGreaterThan(0);
    });
  });

  describe('FILL (BLOCKING create cone/hatch) — open space not needed for highlight is filled', () => {
    // GATES under-fill only: summed area of bare components (>= 0.5 mm from ink, interior, < 100 mm^2) whose nearest
    // regular main tick has I < 2/3 and that are deeper than the band\'s own spacing can make. Not over-ink (A4), tone, ends.
    test('create cone/hatch <= 0.50 mm^2', () => {
            u8log('FILL create cone/hatch', cone('ship', 'create').fill, 'off', cone('off', 'create').fill, 'cfat', cone('cfat', 'create').fill);
      expect(cone('ship', 'create').fill).toBeLessThanOrEqual(0.50);
    });
    test('MUTATION off and cfat (fat clearances) exceed the bar on create cone/hatch', () => {
      expect(cone('off', 'create').fill).toBeGreaterThan(0.50);
      expect(cone('cfat', 'create').fill).toBeGreaterThan(0.50);
    });
  });

  describe('HIGHLIGHT (BLOCKING, 12 cells) — no continuation chain starts from a site with I >= 2/3', () => {
    // GATES "do not fill the lit highlight" only. Not bandC (which the gate also protects; see the constant).
    test('0 chains with I >= 2/3', () => {
      ALL12.forEach(([rig, p, m]) => R.ship[key(50, rig, p, m)].chains.forEach((c) => expect(c.chainI).toBeLessThan(2 / 3)));
    });
    test('MUTATION nohi (gate never fires) yields chains with I >= 2/3', () => {
      const n = ALL12.reduce((a, [rig, p, m]) => a + R.nohi[key(50, rig, p, m)].chains.filter((c) => c.chainI >= 2 / 3).length, 0);
      expect(n).toBeGreaterThanOrEqual(1);
    });
  });

  describe('APEXv2 (BLOCKING, U8) — a CLOSING chain fills its wedge with ticks down to 1 pen; apex ticks are only ever the tail of such a chain', () => {
    // LEGACY (T2-8b-3c): (a2) create cone/hatch whole-object bare >= 0.5 mm <= 26.45 mm^2; (b) torus/hatch carries 0 apex ticks;
    // (c) >= 2 apex ticks over the 12 cells and >= 1 on cone/hatch of each rig; apex ticks 0.3 mm <= length < the plot floor.
    // v2 DEFINITION. (a2v2) bare >= 0.5 mm counted ONLY where the target is inked: a bare pixel counts when its nearest ruling sample
    // (within 2 mm) has v2 density >= 0.12 (the engine's own paper gate: below it the sample is bare paper by contract A16/A22, the
    // lightest ~10 % of I and the glint). (b) is a statement about STRAYS ("the 3b run of five short dashes read as strays"), which
    // is structural, not a statement about the primitive: apexStray = apex ticks that are NOT the tail of a contiguous continuation
    // chain (j = 1..m, m >= 2, tapering). Under v2 the test-rig torus/hatch base grows a genuine closing wedge (3 apex ticks 0.59,
    // 0.49, 0.38 mm after 3 full ticks; measured crop reviewed, no strays), so "torus has 0 apex ticks" is a v1 geometry fact, not a
    // contract. (c) keeps the length window and now requires >= 1 apex tick over the 12 cells (v2: 3, all on test torus/hatch; the cone
    // wedges close without one).
    const LPF_MM = 1.15 * 2 * BOUNDS.penWidth;
    const BARE_BAR = 44; // measured ship 42.06 (create) / 41.47 (test): 4.6 % margin; off 64.90 and cfat 48.81 exceed it
    const inked = (kind, rig) => cone(kind, rig).v2.bareInked;
    test('(a) W_L bare >= 0.5 mm <= 0.05 mm^2 on create cone/hatch', () => {
      const wl = bareArea(cone('ship', 'create').raster, 0.5, WIN_L);
            u8log('APEXv2 W_L bare>=0.5', wl);
      expect(wl).toBeLessThanOrEqual(0.05);
    });
    test('(a2v2) create cone/hatch inked-domain bare >= 0.5 mm <= BARE_BAR mm^2', () => {
            u8log('APEXv2 inked bare create/test', inked('ship', 'create'), inked('ship', 'test'), 'off', inked('off', 'create'), 'cfat', inked('cfat', 'create'), 'noapex', inked('noapex', 'create'), 'raw', bareArea(cone('ship', 'create').raster, 0.5));
      expect(inked('ship', 'create')).toBeLessThanOrEqual(BARE_BAR);
    });
    test('MUTATION off (no continuation) and cfat (fat clearances) exceed the inked-bare bar on create cone/hatch (64.90, 48.81 > 44)', () => {
      expect(inked('off', 'create')).toBeGreaterThan(BARE_BAR);
      expect(inked('cfat', 'create')).toBeGreaterThan(BARE_BAR);
    });
    test('(b2) every apex tick is the tail of a contiguous tapering continuation chain (apexStray === 0 on 12 cells)', () => {
      ALL12.forEach(([rig, p, m]) => expect(R.ship[key(50, rig, p, m)].apexStray).toBe(0));
    });
    test('MUTATION apexnorule (any tick >= 1 pen is an apex tick) produces stray apex ticks on torus/hatch', () => {
      const n = ['create', 'test'].reduce((a, rig) => a + R.apexnorule[key(50, rig, 'torus', 'hatch')].apexStray, 0);
            u8log('APEXv2 apexnorule torus/hatch strays', n);
      expect(n).toBeGreaterThan(0);
    });
    test('MUTATION noapex (apex rule removed) removes the apex ticks (3 -> 0 on test torus/hatch); it does not change the inked bare area (42.06 both)', () => {
      expect(R.ship[key(50, 'test', 'torus', 'hatch')].apexLens.length).toBeGreaterThan(0);
      expect(R.noapex[key(50, 'test', 'torus', 'hatch')].apexLens).toHaveLength(0);
    });
    test('(c) apex ticks exist (>= 1 over the 12 cells), all 0.3 mm <= length < the plot floor', () => {
      const lens = [];
      ALL12.forEach(([rig, p, m]) => R.ship[key(50, rig, p, m)].apexLens.forEach((l) => lens.push(l)));
            u8log('APEXv2 ticks', lens.length, lens.map((l) => l.toFixed(3)).join(','));
      expect(lens.length).toBeGreaterThanOrEqual(1);
      lens.forEach((l) => { expect(l).toBeGreaterThanOrEqual(BOUNDS.penWidth - 1e-6); expect(l).toBeLessThan(LPF_MM); });
    });
  });

  describe('A4v2 — tone: ink coverage in each wedge window <= 1.10 x the abutting strip x (the v2 target-tone ratio window/strip) (create BLOCKING, test REPORTED)', () => {
    // LEGACY: inkCoverage(wedge) / inkCoverage(strip) <= 1.20 -- right for the legacy model where wedge and strip carry the SAME tone.
    // v2: the wedge and its strip do NOT share a tone (the strip sits nearer the glint): the mean v2 density of the ruling samples is
    // 0.62 (W_R) vs 0.49 (S_R) on create cone/hatch, 1.0 vs 1.0 on the left. Measured raw ink ratio 1.28 = 1.27 target ratio x 1.01.
    // v2 bar: inkRatio / densRatio <= 1.10 (tightened from 1.20: the dense mutant measures 1.175 normalised, so 1.20 would not catch it), i.e. over-inking relative to what the v2 tone asks for. GATES over-inking only (as A4).
    const norm = (r, win, strip, dW, dS) => (inkCoverage(r, win) / inkCoverage(r, strip)) / (dW / dS);
    test('create: both normalised ratios <= 1.10', () => {
      const c = cone('ship', 'create'); const r = c.raster; const v = c.v2;
      const rl = norm(r, WIN_L, STRIP_L, v.densWL, v.densSL); const rr = norm(r, WIN_R, STRIP_R, v.densWR, v.densSR);
            u8log('A4v2 create', rl, rr, 'raw', inkCoverage(r, WIN_L) / inkCoverage(r, STRIP_L), inkCoverage(r, WIN_R) / inkCoverage(r, STRIP_R), 'dens', JSON.stringify(v));
      expect(rl).toBeLessThanOrEqual(1.10); expect(rr).toBeLessThanOrEqual(1.10);
    });
    test('MUTATION dense (lattice x2.5, admission and continuity off): create W_R normalised ratio exceeds 1.10', () => {
      const c = cone('dense', 'create');
      const v = norm(c.raster, WIN_R, STRIP_R, c.v2.densWR, c.v2.densSR);
            u8log('A4v2 dense create R', v);
      expect(v).toBeGreaterThan(1.10);
    });
  });

  describe('SEAM (BLOCKING) — continue the existing ticks\' spacing: per chain j1 = 1 and s <= 1.35 (create + test cone/hatch)', () => {
    // GATES spacing at j1 ONLY — not direction (DIR), taper, or outline.
    ['create', 'test'].forEach((rig) => {
      test(`${rig} cone/hatch`, () => {
        const a = agg(cone('ship', rig).chains);
                u8log('SEAM', rig, JSON.stringify(a));
        expect(a.n).toBeGreaterThan(0);
        expect(a.allJ1).toBe(true);
        expect(a.maxS).toBeLessThanOrEqual(1.35);
      });
    });
    test('MUTATION skip1 (start at j=2) trips on both rigs', () => {
      ['create', 'test'].forEach((rig) => {
        const a = agg(cone('skip1', rig).chains);
        expect(!a.allJ1 || a.maxS > 1.35).toBe(true);
      });
    });
  });

  describe('DIR (BLOCKING, sub-clause of SEAM) — direction continues: angle(boundary, first)/j1 - angle(inner, boundary) <= 8 deg', () => {
    ['create', 'test'].forEach((rig) => {
      test(`${rig} cone/hatch`, () => { expect(agg(cone('ship', rig).chains).maxDir).toBeLessThanOrEqual(8); });
    });
    test('MUTATION rot (0.2 rad, continuity guard off) trips on >= 1 rig', () => {
      const d = ['create', 'test'].map((rig) => agg(cone('rot', rig).chains).maxDir);
            u8log('DIR rot', d);
      expect(d.some((x) => x > 8)).toBe(true);
    });
  });

  describe('TAPER (BLOCKING, all 12 cells) — main-piece drawn length is non-increasing along each chain (tol 0.05 mm) from the boundary tick', () => {
    // GATES "shorten gradually toward the rim" (lengths only, not positions).
    test('0 violations on 12/12', () => {
      ALL12.forEach(([rig, p, m]) => expect(agg(R.ship[key(50, rig, p, m)].chains).viol).toBe(0));
    });
    test('MUTATION wide (band extent +1 mm, cap off) trips on >= 1 cell', () => {
      const bad = (kind) => ALL12.filter(([rig, p, m]) => agg(R[kind][key(50, rig, p, m)].chains).viol > 0);
      expect(bad('wide').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('OUTLINE (BLOCKING) — continuation ticks stay off the outline: min centreline distance to any sceneEdge >= 0.30 mm (create + test cone/hatch)', () => {
    // GATES continuation ticks ONLY (the band\'s own ticks reach 0.000 on every cell; disclosed, not gated).
    ['create', 'test'].forEach((rig) => {
      test(`${rig} cone/hatch`, () => {
        const a = agg(cone('ship', rig).chains);
                u8log('OUTLINE', rig, a.minEdge);
        expect(a.minEdge).toBeGreaterThanOrEqual(0.30);
      });
    });
    test('MUTATION noprobe trips on both rigs', () => {
      ['create', 'test'].forEach((rig) => expect(agg(cone('noprobe', rig).chains).minEdge).toBeLessThan(0.30));
    });
  });
});
