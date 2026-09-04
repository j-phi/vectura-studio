const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * fs-z1-boxangle — owner-reported live defect: "changing the Density of the
 * fill style resets the angle (by appearance, not by number)."
 *
 * NO SOURCE FIX SHIPS WITH THIS FILE. It is a MEASUREMENT, pinned so the next
 * reader starts from evidence instead of from a hypothesis — the third attempt
 * on this bug, and the second time the obvious fix has been built, measured and
 * put back. What it pins is (a) the two mechanisms that were found, (b) the
 * invariants that ARE true today and must stay true, and (c) a byte-identity
 * fingerprint over the whole faceted fill path.
 *
 * ── HOW IT WAS MEASURED ────────────────────────────────────────────────────
 * On the primitive the owner reported (a BOX), through the app's own entry
 * point — `engine.addLayer('scene3d')` + `computeAllDisplayGeometry()`, NOT
 * `generate(params)` (CLAUDE.md: a direct call supplies the value under test
 * and misses three of the four origins of a default). fillAngle 20, factory
 * camera / light / ground / tone. Ink is length-weighted per (face, rendered
 * bearing), which is what the eye reads.
 *
 *   family        d=5   d=10  d=20  d=30  d=50  d=70  d=90  d=100 d=150
 *   face:+X @78    86     86    86    86    86    86   141    329   508
 *   face:+Y @3    106    106   106   106   106   106   106    155   242
 *   face:+Z @169  139    145   162   184   249   381   812   1868  2874
 *   face:+Z @95     0      0     0    36    37    74   148    371   570
 *   aggregate   178.9  178.9 178.5 175.3 173.4 170.3 167.9  166.6 166.6
 *
 * NO FAMILY EVER ROTATES. 78 / 3 / 169 / 95 deg are constant at every Density
 * — pinned below. The apparent angle moves because the MIX moves, by two
 * separate mechanisms, both of them "ink that does not track Density":
 *
 * (1) A DISCRETE FAMILY SWITCH, below Density ~24. `face:+Z @95` is the dark
 *     facet's automatic +65 deg tone-zone cross family. `faceHatchLines`'s
 *     per-family plan (src/core/algorithms/scene3d.js:1481, `if (i > 0)
 *     return;`) grants its "one ruling instead of none" relief to the CARRIER
 *     ONLY, so a non-carrier family's only gate is `f.fits` — `screenPitch / k
 *     <= ext` (:1449) — which IS a function of Density. Below the threshold the
 *     family is set to `DRAW_NOTHING` (:1531) and draws nothing at all; above
 *     it, it draws in full. The dark face flips from single-direction hatch to
 *     crosshatch with no control touched.
 *
 * (2) A SMOOTH RATIO SHIFT, across the whole range. The carrier's own
 *     `FACET_MIN_RULINGS` grant (:1488-1497) clamps a facet's carrier pitch to
 *     `ext / (want + 0.5)` — a pure function of the facet's extent, with no
 *     Density term — so a floored facet's ink is FLAT while an unfloored one's
 *     scales with 1/spacing. On this box face:+X is byte-identical for Density
 *     5..70 and face:+Y for 5..90 (pinned below), while face:+Z scales the
 *     whole way. PROVEN BY ABLATION: with that grant disabled the same sweep
 *     reads 168.8 deg (d=5) -> 166.6 deg (d=150) — 2.4 deg of total drift
 *     instead of 12.3 deg — and face:+Y draws NOTHING at Density 50, which is
 *     the bare-paper defect the grant exists to prevent.
 *
 * ── WHY NO FIX SHIPS ───────────────────────────────────────────────────────
 * (2) is a trilemma, not a bug: above the knee the grant is inert, so any fix
 * that keeps high Density byte-identical must be a pure `max()`, which is
 * exactly what makes low Density flat. Restoring proportionality therefore
 * costs either bare paper at low Density or a Density plateau — a product
 * decision about the tone ladder, not a bug fix.
 *
 * (1) IS fixable in principle — give non-carrier families the same one-ruling
 * grant — and it was built and measured here twice:
 *   - grant alone: `scene3d-projected-pitch.test.js` O20 goes red. The cube's
 *     `face:+X` rises 0.170 -> 0.177 and ties `face:+Z` at 0.177, breaking the
 *     "better-lit face carries the lighter ink" ordering. This is the same
 *     0.0072 excursion the withdrawn Sec 5.3 experiment recorded in the source
 *     comment at :1533-1548.
 *   - grant paid for by widening the carrier (so landed coverage is conserved):
 *     O20 goes green again, but `scene3d-faceted-highlight-dispatch.test.js` O9
 *     goes red — cube ink 1230.4094 -> 1230.3796, a 0.0024 % nudge that flips a
 *     monotonicity already sitting on a numerical tie.
 * Two independently pinned tone laws reject it. Relitigating either is a tone
 * decision, and silencing either is forbidden by CLAUDE.md.
 */

const HASH = (s) => { let h = 0; for (let i = 0; i < s.length; i += 1) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; return (h >>> 0).toString(16); };

describe('Scene3D — how a BOX\'s rendered fill bearing responds to Density', () => {
  let runtime; let V;

  beforeAll(async () => { runtime = await loadVecturaRuntime(); V = runtime.window.Vectura; });
  afterAll(() => runtime.cleanup());

  // The app-default scene with the primitive swapped exactly as the shape
  // flyout swaps it. Camera, light, ground and tone are all factory.
  const scene = (density, primitive) => {
    const engine = new V.VectorEngine();
    const gid = engine.addLayer('scene3d');
    const group = engine.getLayerById(gid);
    const obj = engine.getLayerDescendants(gid).filter((l) => l.type === 'object3d')[0];
    const prev = obj.params.primitive;
    const prim = primitive || 'box';
    if (prim !== prev) {
      obj.params.primitive = prim;
      obj.params.params = V.Scene3D.Params.buildPrimitiveParams(prim, prev, null) || {};
    }
    obj.params.style.params.fillAngle = 20;
    obj.params.style.params.fillDensity = density;
    engine.computeAllDisplayGeometry();
    return { obj, paths: group.scenePaths || [] };
  };

  // Length-weighted ink per (face, rendered bearing) — the rendered families.
  const families = (density) => {
    const { obj, paths } = scene(density);
    const by = new Map();
    paths.forEach((pp) => {
      const m = pp.meta || {}; const t = m.sceneTarget || {};
      if (m.kind !== 'sceneFill' || t.objectId !== obj.id || t.occluded) return;
      for (let i = 1; i < pp.length; i += 1) {
        const dx = pp[i].x - pp[i - 1].x; const dy = pp[i].y - pp[i - 1].y;
        const L = Math.hypot(dx, dy);
        if (L < 1e-6) continue;
        let b = (Math.atan2(dy, dx) * 180) / Math.PI;
        if (b < 0) b += 180;
        const k = `${t.faceId || '?'}@${Math.round(b)}`;
        by.set(k, (by.get(k) || 0) + L);
      }
    });
    return by;
  };

  const fingerprint = (density, primitive) => {
    const { paths } = scene(density, primitive);
    const s = paths.map((pp) => pp.map((pt) => `${pt.x.toFixed(4)},${pt.y.toFixed(4)}`).join(';')).join('|');
    return `${HASH(s)}:${s.length}`;
  };

  // ── WHAT IS TRUE AND MUST STAY TRUE ─────────────────────────────────────
  // The claim the two earlier attempts were sent to test — "the direction
  // field rotates with Density" — is FALSE on a box, and this is the guard
  // that keeps it false. Every family a face emits keeps its own rendered
  // bearing to the degree across the whole Density range.
  test('no rendered fill family ever rotates with Density', () => {
    const bearingsOf = (d) => [...families(d).keys()].sort().join(',');
    const ref = 'face:+X@78,face:+Y@3,face:+Z@169,face:+Z@95';
    [30, 50, 75, 100, 150, 200, 300].forEach((d) => {
      expect(`d=${d} ${bearingsOf(d)}`).toBe(`d=${d} ${ref}`);
    });
  });

  // ── ACCEPTED BEHAVIOUR — mechanism (1), pinned by owner decision ─────────
  // Jay ruled 2026-08-22: keep the minimum-rulings guarantee and accept the
  // apparent drift. No line ever rotates; only the ink balance between facets
  // moves. Removing the guarantee would cut drift 12.3deg -> 2.4deg but make a
  // facet render as BARE PAPER at Density 50, which is the defect the grant
  // exists to prevent. These tests pin the accepted trade so a future change
  // is detected — they are NOT a to-do.
  // INVERT THIS TEST when the family set is made Density-independent: the
  // dark facet's automatic cross family should be present at Density 10 too.
  test('ACCEPTED: the dark facet gains a second direction between Density 20 and 30', () => {
    expect([...families(20).keys()].sort()).toEqual(['face:+X@78', 'face:+Y@3', 'face:+Z@169']);
    expect([...families(30).keys()].sort()).toEqual(['face:+X@78', 'face:+Y@3', 'face:+Z@169', 'face:+Z@95']);
  });

  // ── ACCEPTED BEHAVIOUR — mechanism (2), pinned by owner decision ─────────
  // INVERT THIS TEST when the carrier floor is made proportional: the lit
  // facets' ink should respond to Density instead of being flat across it.
  test('ACCEPTED: Density is inert on the lit facets over most of its range', () => {
    const ink = (d, fam) => Math.round(families(d).get(fam) || 0);
    // face:+X — identical from Density 5 to Density 70.
    expect([ink(5, 'face:+X@78'), ink(50, 'face:+X@78'), ink(70, 'face:+X@78')]).toEqual([86, 86, 86]);
    // face:+Y — identical from Density 5 to Density 90.
    expect([ink(5, 'face:+Y@3'), ink(50, 'face:+Y@3'), ink(90, 'face:+Y@3')]).toEqual([106, 106, 106]);
    // The dark facet, over the same span, scales with 1/spacing as it should.
    expect(ink(90, 'face:+Z@169')).toBeGreaterThan(ink(5, 'face:+Z@169') * 5);
  });

  // ── BYTE-IDENTITY GUARD ─────────────────────────────────────────────────
  // RE-PINNED 2026-08-22 (fs-z2-shadowfrag). `fingerprint()` hashes EVERY
  // scenePaths entry, not just this object's fill (unlike `families()`,
  // which filters to `sceneTarget.objectId === obj.id`) — so it also covers
  // the ground's cast-shadow rulings (`sceneTarget.regionClass ===
  // 'castShadow'`, `objectId: 'ground'`). Commit 443b4800 re-expressed those
  // rulings from fixed-length ("6mm") chunking to varied ruling spacing, and
  // the current working tree extends that to the `cross`/`wave` mark classes
  // plus a parallel-to-throw pitch clamp and a NaN guard — none of which
  // touches this object's own faceted fill. Chunking produced many short
  // path fragments per shadow region; spacing-variation produces far fewer,
  // longer ones for the same region, so the digits below moved even though
  // this file never mentions "shadow".
  //
  // Verified, not assumed, on clean extracts of 421d4ac3 (pre-shadow-work,
  // where the previous digits reproduce byte-for-byte) vs this working tree:
  //   - box, Density 10/24/50: the sceneFill paths owned by this object
  //     (`objectId === obj.id`, unoccluded — exactly what `families()` reads)
  //     and the sceneEdge paths are BYTE-IDENTICAL between the two trees.
  //     Only the ground's castShadow path COUNT changed: 281/281/281 ->
  //     119/119/119 fragments for the same three densities (fewer, longer
  //     rulings, same coverage).
  //   - solid (D50/150), plane (D50), sphere (D50/150): same result — each
  //     primitive's own sceneFill+sceneEdge fingerprint is byte-identical
  //     across trees; only the ground castShadow fragment count drops
  //     (e.g. sphere: 209 -> 77 fragments; plane: 364 -> 96).
  // That is (a) the three behaviour tests above still pass unchanged, and
  // (b) is the geometric proof: nothing about this box's (or any tested
  // primitive's) faceted fill moved — only the ground shadow's fragmentation
  // did. The guarded bearing/Density behaviour this file exists to pin is
  // intact; this guard's job is only to catch the NEXT unrelated drift, so
  // it is re-pinned to the current (legitimate) numbers.
  test('BYTE-IDENTITY GUARD: box / solid / plane / sphere fingerprints across Density', () => {
    expect(fingerprint(10)).toBe('4db89b89:4955');
    expect(fingerprint(24)).toBe('1168154a:5023');
    expect(fingerprint(50)).toBe('ccccaf18:5128');
    expect(fingerprint(100)).toBe('60fff363:8006');
    expect(fingerprint(150)).toBe('4cbf9fd8:9878');
    expect(fingerprint(50, 'solid')).toBe('5d8296ce:4060');
    expect(fingerprint(150, 'solid')).toBe('650b0061:11134');
    expect(fingerprint(50, 'plane')).toBe('44270f5b:3738');
    expect(fingerprint(50, 'sphere')).toBe('2f4dae00:15919');
    expect(fingerprint(150, 'sphere')).toBe('bd627a15:35285');
  });
});
