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
  const KINDS = ['ship', 'off', 'noflag'];
  const cone = (kind, rig) => R[kind][key(50, rig, 'cone', 'hatch')];

  beforeAll(async () => {
    await renderBcKinds(R, KINDS, { full: [] });
  }, 1800000); // bounded runtime ownership; audit remains intentionally exhaustive

  describe('CRUMBS (BLOCKING, T2-8b-3c) — only apex runs may be under 0.6 mm: non-apex runs under 2 pens stay at base (0) on 12 cells + 72 roster cells', () => {
    // GATES the scene3d.js MIN_RUN_MM exemption scope ONLY (no other stroke bypasses the crumb filter). The full 864
    // non-mkTick cells are md5-identical to base (out-of-tree; see report). Not apex length or placement (APEX).
    // A5 subMin population change: `sub` now EXEMPTS apex runs (subRaw counts them); disclosed under ## Bars changed.
    const MARK = ['mkScribble', 'mkDashRamp', 'mkDotScreen'];
    test('12 mkTick cells: 0 non-apex crumbs, subMin (apex exempted) 0; apex exemption is exercised (subRaw > 0 on create cone/hatch)', () => {
      ALL12.forEach(([rig, p, m]) => { expect(R.ship[key(50, rig, p, m)].crumbs).toBe(0); expect(R.ship[key(50, rig, p, m)].sub).toBe(0); });
      expect(R.ship[key(50, 'create', 'cone', 'hatch')].subRaw).toBeGreaterThan(0);
    });
    test('MUTATION noflag (scene3d.js: every run may be 0.3 mm) yields crumbs on the 72-cell roster', () => {
      expect(R.ship.crumbsRoster).toBe(R.off.crumbsRoster);
      expect(R.noflag.crumbsRoster).toBeGreaterThan(R.ship.crumbsRoster);
    });
  });
});
