const fs = require('fs');
const path = require('path');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
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

describe('Scene3D.SurfaceFill — T2-8b-3 BC-E endpoint-envelope band continuation (cone base wedges)', () => {
  const R = {};
  const KINDS = ['ship', 'off', 'cfat', 'nobisect', 'gap', 'rulingref', 'nohi', 'noapex', 'apexnorule', 'dense', 'skip1', 'rot', 'wide', 'noprobe'];
  const cone = (kind, rig) => R[kind][key(50, rig, 'cone', 'hatch')];

  beforeAll(async () => {
    await renderBcKinds(R, KINDS, { full: [], roster: [] });
  }, 1800000); // bounded runtime ownership; audit remains intentionally exhaustive

  describe('WL (BLOCKING) — the W_L remnant is closed: bare >= 0.5 mm <= 0.30 mm^2 in W_L (create cone/hatch d=50)', () => {
    // GATES the triangle at the base rim at 0.5 mm clearance (finer than A1) ONLY. Not W_R, tone, or the test rig
    // (test-rig W_L reads 2.66 at 0.5 mm: a different, pre-existing remnant).
    const wl = (kind) => bareArea(cone(kind, 'create').raster, 0.5, WIN_L);
    test('shipped', () => {
      // eslint-disable-next-line no-console
      console.log('WL create cone/hatch bare>=0.5:', wl('ship'));
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
        // eslint-disable-next-line no-console
        console.log('ENVELOPE', rig, JSON.stringify(e));
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
        // eslint-disable-next-line no-console
        console.log('ENVELOPE nobisect', rig, JSON.stringify(e));
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

  describe('FILL (BLOCKING create cone/hatch; other 11 REPORTED) — open space not needed for highlight is filled', () => {
    // GATES under-fill only: summed area of bare components (>= 0.5 mm from ink, interior, < 100 mm^2) whose nearest
    // regular main tick has I < 2/3 and that are deeper than the band\'s own spacing can make. Not over-ink (A4), tone, ends.
    test('create cone/hatch <= 0.50 mm^2', () => {
      // eslint-disable-next-line no-console
      console.log('FILL create cone/hatch', cone('ship', 'create').fill, 'off', cone('off', 'create').fill, 'cfat', cone('cfat', 'create').fill, 'rulingref', cone('rulingref', 'create').fill);
      expect(cone('ship', 'create').fill).toBeLessThanOrEqual(0.50);
    });
    test('REPORTED: the other 11 cells', () => {
      // eslint-disable-next-line no-console
      console.log('FILL reported', ALL12.map(([rig, p, m]) => `${rig}|${p}/${m} off ${R.off[key(50, rig, p, m)].fill.toFixed(2)} new ${R.ship[key(50, rig, p, m)].fill.toFixed(2)}`).join('; '));
      expect(ALL12.every(([rig, p, m]) => Number.isFinite(R.ship[key(50, rig, p, m)].fill))).toBe(true);
    });
    test('MUTATION off and cfat (fat clearances) exceed the bar on create cone/hatch', () => {
      expect(cone('off', 'create').fill).toBeGreaterThan(0.50);
      expect(cone('cfat', 'create').fill).toBeGreaterThan(0.50);
    });
    test('MUTATION rulingref: REPORTED', () => {
      // eslint-disable-next-line no-console
      console.log('FILL rulingref', cone('rulingref', 'create').fill);
      expect(Number.isFinite(cone('rulingref', 'create').fill)).toBe(true);
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

  describe('APEX (BLOCKING, T2-8b-3c; replaces the 3b APEX bar) — a CLOSING chain fills its wedge with ticks down to 1 pen; nothing else does', () => {
    // GATES three things: (a) the W_L apex gap is closed (create cone/hatch bare >= 0.5 mm in W_L <= 0.05 mm^2; measured 0,
    // 0.098 on both 2e59a16a and ac5c98b6); (b) create/test torus/hatch carry NO apex tick (Jay: the 3b run of five short
    // dashes read as strays); (c) apex ticks are 0.3-0.69 mm. Does NOT gate crumbs (CRUMBS) or the test rig's W_L (a
    // different, pre-existing remnant).
    const LPF_MM = 1.15 * 2 * BOUNDS.penWidth;
    const wl = (kind) => bareArea(cone(kind, 'create').raster, 0.5, WIN_L);
    test('(a) W_L bare >= 0.5 mm <= 0.05 mm^2 on create cone/hatch', () => {
      // eslint-disable-next-line no-console
      console.log('APEX W_L bare>=0.5', wl('ship'), 'noapex', wl('noapex'));
      expect(wl('ship')).toBeLessThanOrEqual(0.05);
    });
    // T2-8b-5b: the rim-strip extension now closes W_L on its own, so `noapex` no longer reopens it (measured
    // 0 vs 0): that mutation was VACUOUS and is RETIRED in favour of the two bars below, which measure what
    // the apex rule still changes on this tree (create cone/hatch whole-object bare >= 0.5 mm: ship 27.26,
    // noapex 27.44; T2-8b-5c re-derived: ship 26.38, noapex 26.555; and the apex ticks themselves).
    const WHOLE = (kind) => bareArea(cone(kind, 'create').raster, 0.5);
    test('(a2) create cone/hatch whole-object bare >= 0.5 mm <= 26.45 mm^2 (ship 26.38; was 27.30 / 27.26 before T2-8b-5c)', () => {
      // eslint-disable-next-line no-console
      console.log('APEX whole bare>=0.5 create cone/hatch ship', WHOLE('ship'), 'noapex', WHOLE('noapex'));
      expect(WHOLE('ship')).toBeLessThanOrEqual(26.45);
    });
    test('MUTATION noapex (apex rule removed) reopens it (26.555 > 26.45) and removes the apex ticks', () => {
      expect(WHOLE('noapex')).toBeGreaterThan(26.45);
      expect(R.noapex[key(50, 'create', 'cone', 'hatch')].apexLens).toHaveLength(0);
    });
    test('(b) torus/hatch has 0 apex ticks (create and test)', () => {
      ['create', 'test'].forEach((rig) => expect(R.ship[key(50, rig, 'torus', 'hatch')].apexLens).toHaveLength(0));
    });
    test('MUTATION apexnorule (no closing-wedge rule) puts apex ticks on torus/hatch', () => {
      const n = ['create', 'test'].reduce((a, rig) => a + R.apexnorule[key(50, rig, 'torus', 'hatch')].apexLens.length, 0);
      // eslint-disable-next-line no-console
      console.log('APEX apexnorule torus/hatch ticks', n);
      expect(n).toBeGreaterThan(0);
    });
    test('(c) apex ticks exist (>= 2 over the 12 cells, >= 1 on cone/hatch of each rig), all 0.3 mm <= length < the plot floor', () => {
      const lens = [];
      ALL12.forEach(([rig, p, m]) => R.ship[key(50, rig, p, m)].apexLens.forEach((l) => lens.push(l)));
      // eslint-disable-next-line no-console
      console.log('APEX ticks', lens.length, lens.map((l) => l.toFixed(3)).join(','));
      expect(lens.length).toBeGreaterThanOrEqual(2);
      ['test', 'create'].forEach((rig) => expect(R.ship[key(50, rig, 'cone', 'hatch')].apexLens.length).toBeGreaterThanOrEqual(1));
      lens.forEach((l) => { expect(l).toBeGreaterThanOrEqual(BOUNDS.penWidth - 1e-6); expect(l).toBeLessThan(LPF_MM); });
    });
  });

  describe('A4 — tone: ink coverage in each wedge window <= 1.20 x the abutting strip (create BLOCKING, test REPORTED)', () => {
    // GATES over-inking ONLY (under-inking is A1). Test rig REPORTED: its raster numerator includes the rim stroke inside W_R.
    const ratio = (r, win, strip) => inkCoverage(r, win) / inkCoverage(r, strip);
    test('create: both ratios <= 1.20', () => {
      const r = cone('ship', 'create').raster;
      const rl = ratio(r, WIN_L, STRIP_L); const rr = ratio(r, WIN_R, STRIP_R);
      // eslint-disable-next-line no-console
      console.log('A4 create', rl, rr);
      expect(rl).toBeLessThanOrEqual(1.20); expect(rr).toBeLessThanOrEqual(1.20);
    });
    test('test rig REPORTED (finite numbers)', () => {
      const r = cone('ship', 'test').raster;
      // eslint-disable-next-line no-console
      console.log('A4 test (reported)', ratio(r, WIN_L, STRIP_L), ratio(r, WIN_R, STRIP_R));
      expect(Number.isFinite(ratio(r, WIN_R, STRIP_R))).toBe(true);
    });
    test('MUTATION dense (lattice x2.5, admission and continuity off): create W_R ratio exceeds 1.20', () => {
      // eslint-disable-next-line no-console
      console.log('A4 dense create R', ratio(cone('dense', 'create').raster, WIN_R, STRIP_R));
      expect(ratio(cone('dense', 'create').raster, WIN_R, STRIP_R)).toBeGreaterThan(1.20);
    });
  });

  describe('SEAM (BLOCKING) — continue the existing ticks\' spacing: per chain j1 = 1 and s <= 1.35 (create + test cone/hatch)', () => {
    // GATES spacing at j1 ONLY — not direction (DIR), taper, or outline.
    ['create', 'test'].forEach((rig) => {
      test(`${rig} cone/hatch`, () => {
        const a = agg(cone('ship', rig).chains);
        // eslint-disable-next-line no-console
        console.log('SEAM', rig, JSON.stringify(a));
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
      // eslint-disable-next-line no-console
      console.log('DIR rot', d);
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
        // eslint-disable-next-line no-console
        console.log('OUTLINE', rig, a.minEdge);
        expect(a.minEdge).toBeGreaterThanOrEqual(0.30);
      });
    });
    test('MUTATION noprobe trips on both rigs', () => {
      ['create', 'test'].forEach((rig) => expect(agg(cone('noprobe', rig).chains).minEdge).toBeLessThan(0.30));
    });
  });
});
