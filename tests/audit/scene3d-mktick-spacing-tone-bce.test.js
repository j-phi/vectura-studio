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
  const KINDS = ['ship', 'off', 'inline', 'thin'];
  const cone = (kind, rig) => R[kind][key(50, rig, 'cone', 'hatch')];

  beforeAll(async () => {
    await renderBcKinds(R, KINDS, { roster: [] });
  }, 1800000); // bounded runtime ownership; audit remains intentionally exhaustive

  test('BC-E differs from off on the chain cells only', () => {
    const changed = ALL12.filter(([rig, p, m]) => R.ship[key(50, rig, p, m)].md5 !== R.off[key(50, rig, p, m)].md5);
    // eslint-disable-next-line no-console
    console.log('BC-E changes', changed.length, 'of 12:', changed.map((c) => c.join('|')).join(', '));
    ['create|cone/contour', 'test|sphere/hatch', 'test|torus/hatch', 'test|cone/contour'].forEach((k) => {
      const [rig, cell] = k.split('|'); const [p, m] = cell.split('/');
      expect(R.ship[key(50, rig, p, m)].md5).toBe(R.off[key(50, rig, p, m)].md5);
    });
  });

  describe('A1 (BLOCKING) — the cone base wedges are filled: bare >= 0.75 mm <= 0.50 mm^2 in each of W_L and W_R (create cone/hatch d=50, cam a, ground DISABLED)', () => {
    // GATES "fill the cone base wedges" ONLY — not tone (A4), seam (SEAM), contact (A3), envelope.
    test('shipped', () => {
      const r = cone('ship', 'create').raster;
      const wl = bareArea(r, 0.75, WIN_L); const wr = bareArea(r, 0.75, WIN_R);
      // eslint-disable-next-line no-console
      console.log('A1 create cone/hatch BC-E bare>=0.75:', JSON.stringify({ wl, wr }));
      expect(wl).toBeLessThanOrEqual(0.50);
      expect(wr).toBeLessThanOrEqual(0.50);
    });
    test('MUTATION off (flush removed) reopens the wedges (~8.3 / ~7.5)', () => {
      const r = cone('off', 'create').raster;
      expect(bareArea(r, 0.75, WIN_L)).toBeGreaterThan(5);
      expect(bareArea(r, 0.75, WIN_R)).toBeGreaterThan(5);
    });
    test('A1t (REPORTED, RGR rig) test cone/hatch W_R <= 1.5', () => {
      expect(bareArea(cone('ship', 'test').raster, 0.75, WIN_R)).toBeLessThanOrEqual(1.5);
      expect(bareArea(cone('off', 'test').raster, 0.75, WIN_R)).toBeGreaterThan(1.5);
    });
  });

  describe('A2 (BLOCKING) — master grid untouched: tickSites + [I,R,P,L,drawn] deep-equal BC-E-off', () => {
    // GATES the site records ONLY (what SP5/B5/B7 read), not where ink lands.
    const cells = [];
    ['test', 'create'].forEach((rig) => {
      CELLS.forEach(([p, m]) => cells.push([50, rig, p, m]));
      B7_CELLS.forEach(([p, m]) => cells.push([220, rig, p, m]));
    });
    test('12 at d=50 + 8 at d=220 identical', () => {
      expect(cells).toHaveLength(20);
      cells.forEach(([d, rig, p, m]) => expect(R.ship[key(d, rig, p, m)].sites).toBe(R.off[key(d, rig, p, m)].sites));
    });
    test('B5 nonMono identical on 12', () => {
      ALL12.forEach(([rig, p, m]) => expect(R.ship[key(50, rig, p, m)].bins.nonMono).toBe(R.off[key(50, rig, p, m)].bins.nonMono));
    });
    test('MUTATION inline (closures run at queue time) moves the records on >= 1 of 20', () => {
      const moved = cells.filter(([d, rig, p, m]) => R.inline[key(d, rig, p, m)].sites !== R.off[key(d, rig, p, m)].sites);
      // eslint-disable-next-line no-console
      console.log('A2 inline moved', moved.map((c) => c.join('|')).join(', '));
      expect(moved.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('A3 (BLOCKING) — tipContact <= off + 0.005 and markContact <= off + 0.01 on all 12 d=50 cells INCLUDING contour', () => {
    // GATES the contact the continuation ADDS. T2/T3 absolute ceilings and named sets stay in the tests above.
    test('12 cells', () => {
      ALL12.forEach(([rig, p, m]) => {
        const s = R.ship[key(50, rig, p, m)]; const o = R.off[key(50, rig, p, m)];
        expect(s.tip).toBeLessThanOrEqual(o.tip + 0.005);
        expect(s.mark).toBeLessThanOrEqual(o.mark + 0.01);
      });
    });
    test('MUTATION thin (admission off, cB = 0.2 w, cE = 0.5 w) rises past off + 0.005 on >= 1 cell', () => {
      const trips = (kind) => ALL12.filter(([rig, p, m]) => R[kind][key(50, rig, p, m)].tip > R.off[key(50, rig, p, m)].tip + 0.005);
      expect(trips('thin').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('A5 — a tick is not a line + plot floor: over2RP = 0 and subMin = 0 (d=50, 12); d=220 over2RP <= off, subMin = 0', () => {
    test('d=50', () => { ALL12.forEach(([rig, p, m]) => { expect(R.ship[key(50, rig, p, m)].o2).toBe(0); expect(R.ship[key(50, rig, p, m)].sub).toBe(0); }); });
    test('d=220', () => {
      ['test', 'create'].forEach((rig) => B7_CELLS.forEach(([p, m]) => {
        expect(R.ship[key(220, rig, p, m)].sub).toBe(0);
        expect(R.ship[key(220, rig, p, m)].o2).toBeLessThanOrEqual(R.off[key(220, rig, p, m)].o2);
      }));
    });
  });
});

describe('I1 (BLOCKING) — representative non-mkTick isolation and gate witness', () => {
  // Keep mkDashRamp across mapper routes: hatch alone does not expose the
  // nogate defect. One ordinary-law control retains a separate isolation path.
  const signatures = async (override) => {
    const runtime = await loadScene3dAuditRuntime({ scriptOverrides: { [REL_PATH]: buildBcSource(override) } });
    try {
      const V = runtime.window.Vectura;
      const cells = V.Scene3D.Params.MAPPERS.map((mapper) => [mapper, 'mkDashRamp']);
      cells.push(['hatch', 'ladder']);
      const rows = cells.map(([mapper, law]) => {
        const params = buildSceneParams(V.Scene3D.Params, V.ALGO_DEFAULTS.scene3d, { mapper, fillDensity: 50, primitive: 'cone', rig: 'create', law });
        return [mapper, law, pathsMd5(V.AlgorithmRegistry.scene3d.generate(params, null, null, BOUNDS))];
      });
      return rows;
    } finally { await runtime.cleanup(); }
  };
  test('representative laws remain identical shipped vs off; removing the gate changes mkDashRamp', async () => {
    const off = await signatures('off');
    const ship = await signatures(null);
    const nogate = await signatures('nogate');
    expect(ship).toEqual(off);
    const shipByCell = new Map(ship.map(([mapper, law, digest]) => [`${mapper}|${law}`, digest]));
    const changed = nogate.filter(([mapper, law, digest]) => law === 'mkDashRamp'
      && digest !== shipByCell.get(`${mapper}|${law}`));
    expect(changed.length).toBeGreaterThan(0);
  }, 900000);
});
