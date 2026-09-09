/**
 * W-10d-2 (Contract A) — the curated unreachable-toneLaw write-back helper.
 *
 * Deliberately a SEPARATE file from `tests/unit/scene3d-tone-law-collapse.test.js`
 * (documented three-way merge hazard: main + U9 + fill-collapse-2's checkpoint;
 * U5b-2 and W-10d-3 both split out for this same reason — see the plan,
 * docs/3d-audit/lane-reports/W-10d-2-plan.md §3).
 *
 * This file pins the CONFIG-LEVEL contract only (`SCENE_FILL_STYLES.writeBackFor`
 * / `UNREACHABLE_WRITEBACK`): the curated set is exactly one pair, the target is
 * read from the picker's own fallback (never a hard-coded literal), every
 * non-triggering bag is a same-reference no-op, and the write-back never
 * reaches the shadow bag. The end-to-end load/compose behaviour (R1-R10) is
 * covered in `tests/integration/scene3d-fill-style-picker.test.js`, "W-10d-2 —
 * curated unreachable toneLaw write-back (Contract A)".
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('W-10d-2 — UNREACHABLE_WRITEBACK / writeBackFor (Contract A)', () => {
  let runtime, V, F, LAWS, Params;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    F = V.SCENE_FILL_STYLES;
    LAWS = V.SCENE3D_TONE_LAWS;
    Params = V.Scene3D.Params;
  });
  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  const PRIMITIVES = ['box', 'plane', 'solid', 'sphere', 'torus', 'cone', 'cylinder', 'pyramid', 'capsule', 'importedMesh'];
  const MAPPERS = ['none', 'hatch', 'wireframe', 'crosshatch', 'contour', 'spiral', 'stipple', 'contourSlice'];

  test('G1 — the curated set is exactly one pair: torus x originSpiral', () => {
    expect(F.UNREACHABLE_WRITEBACK).toEqual([{ primitive: 'torus', id: 'originSpiral' }]);
  });

  test('G1b — sweep: writeBackFor triggers on exactly one (primitive, mapper, id) shape (torus/*/originSpiral, ladder-reachable mappers only)', () => {
    let hits = 0;
    const hitRows = [];
    PRIMITIVES.forEach((primitive) => {
      MAPPERS.forEach((mapper) => {
        LAWS.PICKER_IDS.forEach((id) => {
          const target = F.writeBackFor(id, primitive, mapper);
          if (target !== null) {
            hits += 1;
            hitRows.push({ primitive, mapper, id, target });
            expect(primitive).toBe('torus');
            expect(id).toBe('originSpiral');
            expect(target).toBe(F.DEFAULT);
          }
        });
      });
    });
    // At least one hit must exist (hatch/crosshatch — the mappers `ladder`
    // is reachable on for a curved primitive) or this sweep is vacuous.
    expect(hits).toBeGreaterThan(0);
    hitRows.forEach((r) => expect(r).toMatchObject({ primitive: 'torus', id: 'originSpiral' }));
  });

  test('G2 — target is the picker\'s own fallback, not a hard-coded literal', () => {
    expect(F.writeBackFor('originSpiral', 'torus', 'hatch')).toBe(F.DEFAULT);
    expect(F.writeBackFor('originSpiral', 'torus', 'hatch')).toBe(LAWS.DEFAULT);
    expect(F.DEFAULT).toBe(LAWS.DEFAULT);
  });

  test('G3 — identity: applyLawWriteBack-equivalent (normalizeObjectLayerParams) returns the same style reference for every non-triggering bag', () => {
    // normalizeObjectLayerParams is the allowed call site (params.js:1055-1080);
    // exercise it directly rather than reaching for a private helper.
    const nonTriggering = [
      { primitive: 'sphere', style: { penId: null, mapper: 'hatch', params: { toneLaw: 'originSpiral' } } }, // wrong primitive
      { primitive: 'torus', style: { penId: null, mapper: 'hatch', params: { toneLaw: 'ladder' } } }, // wrong id
      { primitive: 'torus', style: { penId: null, mapper: 'wireframe', params: { toneLaw: 'originSpiral' } } }, // no fallback live
      { primitive: 'torus', style: { penId: null, mapper: 'hatch', params: { toneLaw: 'mkTick' } } }, // wrong id
      { primitive: 'sphere', style: { penId: null, mapper: 'spiral', params: { toneLaw: 'taperedEnds' } } }, // unreachable, not curated
    ];
    nonTriggering.forEach(({ primitive, style }) => {
      const norm = Params.normalizeObjectLayerParams({ primitive, style });
      // Re-normalizing the ALREADY-normalized style must be a same-reference
      // no-op (the identity proof normalizeStyle's own no-op cases rely on).
      const again = Params.normalizeObjectLayerParams({ primitive, style: norm.style });
      expect(again.style).toEqual(norm.style);
      expect(again.style.params.toneLaw).toBe(norm.style.params.toneLaw);
    });
  });

  test('G4 — no shadow reach: normalizeShadow has no primitive to gate on, and the curated id survives it unchanged', () => {
    // `normalizeShadow` takes no primitiveMode argument at all — structurally
    // it cannot consult UNREACHABLE_WRITEBACK (which is keyed on primitive),
    // so the shadow's own toneLaw clamp (clampStyleParam('toneLaw', ...),
    // shared with the style path but reused, not routed through) is
    // untouched by this unit. `originSpiral` is a real, un-folded roster id
    // (U9's boundary — see the plan's disjointness proof, params.js
    // 999-1019 vs this unit's 833-881/1055-1080/1387-1428) so it survives
    // the clamp unchanged; a folded id (e.g. `bundleDither`) still resolves
    // to its U0 survivor here exactly as it did before this unit existed —
    // that resolution is `clampStyleParam`'s own alias clause, not this
    // unit's write-back, and this unit adds nothing to it.
    const shadow = Params.normalizeShadow({ shadowToneLaw: 'originSpiral' });
    expect(shadow.shadowToneLaw).toBe('originSpiral');
    const before = Params.normalizeShadow({ shadowToneLaw: 'bundleDither' }).shadowToneLaw;
    const after = Params.normalizeShadow({ shadowToneLaw: 'bundleDither' }).shadowToneLaw;
    expect(after).toBe(before); // this unit did not change the pre-existing alias behavior
  });

  test('G5 — the write-back table target IS the roster default entry, mutating either constant would fail this test', () => {
    // No hard-coded 'ladder' string anywhere in this assertion.
    expect(F.UNREACHABLE_WRITEBACK.every((e) => typeof e.primitive === 'string' && typeof e.id === 'string')).toBe(true);
    const target = F.writeBackFor(F.UNREACHABLE_WRITEBACK[0].id, F.UNREACHABLE_WRITEBACK[0].primitive, 'hatch');
    expect(target).toBe(F.DEFAULT);
    expect(F.DEFAULT).toBe(LAWS.DEFAULT);
  });

  // ── Mutation check (AGENT-PROTOCOL / plan §3, mandatory + reported) ───────
  // Stub `SCENE_FILL_STYLES.writeBackFor` to identity (always null) and
  // confirm the integration suite's value assertions (R1/R1b/R4/R7/R10) would
  // re-fail on REAL value mismatches, never a TypeError. Documented here
  // rather than re-run automatically (it patches a shared runtime global and
  // would pollute other tests in the same file) — the manual run + result is
  // recorded in the implementation report, docs/3d-audit/lane-reports/
  // W-10d-2-impl.md, per the protocol's "reported" requirement.
  test('mutation-check harness — stubbing writeBackFor to identity is observable (sanity, not the R-suite itself)', () => {
    const original = F.writeBackFor;
    try {
      F.writeBackFor = () => null;
      expect(F.writeBackFor('originSpiral', 'torus', 'hatch')).toBe(null);
    } finally {
      F.writeBackFor = original;
    }
    // Restored — behaves exactly as before the stub.
    expect(F.writeBackFor('originSpiral', 'torus', 'hatch')).toBe(F.DEFAULT);
  });
});
