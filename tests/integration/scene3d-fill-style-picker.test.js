/**
 * 3D Scene Studio — the Fill Style picker (U9).
 *
 * WHAT THIS PINS
 * --------------
 * The Style surface names two different things and must keep them apart:
 *
 *   "Type"       → the MAPPER: hatch / crosshatch / contour / spiral /
 *                  stipple / wireframe / none. What KIND of fill is drawn.
 *   "Fill Style" → the TONE LAW (`style.params.toneLaw`). HOW that kind is
 *                  drawn — which of the 47 measured laws modulates the ink.
 *
 * The first dropdown used to be labelled "Fill", which left the second one
 * unnameable; renaming it to "Type" is a deliberate contract change and the
 * label assertions here are its regression test.
 *
 * MARK CLASS IS NOT COSMETIC
 * --------------------------
 * The picker groups by MARK CLASS (parallel hatching / crosshatch & multi-
 * angle / flow lines / wavy / dashes / dots / networks), NOT by the roster's
 * tone-MECHANISM families. Crosshatched and single-direction textures occupy
 * separate perceptual clusters (Sterzik, Vollmer & Vollmer, IEEE TVCG 2024),
 * so `penCross` and `penReserve` — which the roster files under the `threePen`
 * mechanism family — must land in the CROSSHATCH group, and a test says so.
 *
 * WHOLE-STYLE-WINS
 * ----------------
 * `src/core/scene3d/style-cascade.js` resolves byFace > byObject > scene with
 * NO per-field merge, and every write replaces the whole style. Two failure
 * modes follow, and both have a test below:
 *   1. a picker that drops a params key silently destroys that setting;
 *   2. a picker that writes the wrong SCOPE appears to do nothing on any
 *      object that declares its own style (the object's style wins over the
 *      scene's, so a scene-scope write never reaches it).
 */

const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true,
};
const nextFrames = (ms = 80) => new Promise((r) => setTimeout(r, ms));

const styleTable = (byObject = {}, byFace = {}, scene = { penId: null, mapper: 'none', params: {} }) =>
  ({ scene, byObject, byFace });

const fixtureParams = (overrides = {}) => ({
  sceneVersion: 1, seed: 0, posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0,
  objects: [
    {
      id: 'obj-1', name: 'Sphere 1', primitive: 'sphere', params: { sx: 40, sy: 40, sz: 40, detail: 16 },
      transform: { x: 0, y: 20, z: 0, yaw: 20, pitch: 12, roll: 0, scale: 1 }, visibility: 'solid',
    },
  ],
  lights: [{ id: 'sun', type: 'directional', azimuth: 135, elevation: 45, castShadows: true }],
  ground: { enabled: false }, backdrop: { enabled: false },
  camera: { projection: 'orthographic', yaw: -20, pitch: 15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
  groups: [], assets: {},
  styleTable: styleTable(),
  ...overrides,
});

// ══════════════════════════════════════════════════════════════════════════
// 1. The shared config — one taxonomy, read by both surfaces.
// ══════════════════════════════════════════════════════════════════════════

describe('Fill Style — the shared mark-class config', () => {
  let runtime, window, F, R;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window } = runtime);
    F = window.Vectura.SCENE_FILL_STYLES;
    R = window.Vectura.SCENE3D_TONE_LAWS;
  });
  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  test('SCENE_FILL_STYLES is declared beside SCENE_HIGHLIGHT, over the tone-law roster', () => {
    expect(F).toBeTruthy();
    expect(R).toBeTruthy();
    expect(F.DEFAULT).toBe('ladder');
  });

  test('every one of the 48 roster laws has a mark class, and no stray ids', () => {
    expect(R.IDS.length).toBe(48);
    expect(F.assertComplete()).toEqual({ missing: [], unknown: [], stray: [] });
  });

  test('penCross and penReserve are CROSSHATCH, not lumped in with single-direction hatching', () => {
    expect(F.markClass('penCross')).toBe('cross');
    expect(F.markClass('penReserve')).toBe('cross');
    expect(F.markClassLabel('cross')).toMatch(/Crosshatch/);
    // …and the roster still files them by MECHANISM, which is the whole point:
    // the two cuts genuinely disagree, so the picker cannot reuse the roster's
    // own grouping.
    expect(R.BY_ID.penCross.family).toBe('threePen');
    expect(F.markClass('nibAngle')).toBe('hatch');
  });

  // The owner's ruling (Fill Style picker, fs-j1) retired the Off/On
  // "Experimental" disclosure that used to gate 11 of the 47 roster laws
  // behind a toggle: every law is now permanently offered, with no per-option
  // tier suffix. `groups()` dropped its `includeLibrary` first argument
  // entirely rather than keeping a vestigial always-true parameter — see
  // every call site below and in src/ui/shell/context-bar.js +
  // src/ui/panels/scene3d-panel.js.
  test('groups() returns every roster law plus the shipped default, grouped by mark class — no tier gate', () => {
    const g = F.groups();
    const opts = g.reduce((a, x) => a.concat(x.options), []);
    // Fill-roster collapse (W-22-24-W-18-plan.md) — `groups()` offers
    // PICKER_IDS (the picker-tier cut), not the full engine vocabulary
    // `IDS` (unaffected by the collapse, still 48). `PICKER_IDS === IDS`
    // until U1 lands; from U1 on this is the count that actually shrinks.
    expect(opts.length).toBe(R.PICKER_IDS.length + 1);
    expect(opts.map((o) => o.value)).toContain('ladder');
    // Every one of the 11 previously-demoted laws is STILL PRESENT — unless
    // it has been folded into a survivor (U1-U8): a folded id is reachable
    // through its survivor's own sub-control, not as its own flat option, by
    // design (§0 "nothing is ever removed from the engine, only the
    // picker's flat option list shrinks"). None of C-01's three folded ids
    // (fineLadder/phaseFineLadder/perceptualRamp) is LIBRARY-tier, so this
    // loop is unaffected by U1 — it starts skipping entries once U4/U5 fold
    // a LIBRARY law (bundleDither/contFieldTouch).
    R.LIBRARY.forEach((id) => {
      if (R.ALIASES[id]) return;
      expect(opts.map((o) => o.value)).toContain(id);
    });
    // No headed-but-empty group is ever rendered.
    g.forEach((grp) => expect(grp.options.length).toBeGreaterThan(0));
    // Groups are mark classes, not tone-mechanism families.
    expect(g.map((x) => x.group)).not.toContain('Three-pen');
  });

  test('no option label carries a tier suffix ("library"/"experimental") — the disclosure is gone', () => {
    const opts = F.groups().reduce((a, x) => a.concat(x.options), []);
    opts.forEach((o) => {
      expect(o.label.toLowerCase()).not.toMatch(/library/);
      expect(o.label.toLowerCase()).not.toMatch(/experimental/);
    });
    expect(F.LIBRARY_SUFFIX).toBeUndefined();
    expect(F.LIBRARY_LABEL).toBeUndefined();
    expect(F.LIBRARY_ARIA).toBeUndefined();
    expect(F.LIBRARY_NOTE).toBeUndefined();
    // The crosshatch group previously required the disclosure to reach three
    // members (one production law + two pen crosshatches); it now always
    // holds all three.
    const crossOf = F.groups().find((x) => x.group === F.markClassLabel('cross'));
    expect(crossOf.options.map((o) => o.value)).toContain('penCross');
    expect(crossOf.options.length).toBeGreaterThanOrEqual(3);
  });

  test('the note leads with the mark class; simulated laws are prefixed; caveats survive', () => {
    const n = F.note('penStipple');
    expect(n.text).toMatch(/^Dots & stipple —/);
    expect(n.caveat.startsWith(F.SIMULATED_NOTE)).toBe(true);
    // A non-simulated library law still shows its measured caveat.
    expect(F.note('bundleDither').caveat.length).toBeGreaterThan(0);
    expect(F.note('bundleDither').caveat.startsWith(F.SIMULATED_NOTE)).toBe(false);
    // A production law shows a note and no caveat.
    expect(F.note('etfKang').text.length).toBeGreaterThan(0);
    expect(F.note('etfKang').caveat).toBe('');
  });

  test('an absent or unknown toneLaw resolves to the shipped default, which IS selectable', () => {
    expect(F.resolve(undefined)).toBe('ladder');
    expect(F.resolve('notALaw')).toBe('ladder');
    expect(F.resolve('etfKang')).toBe('etfKang');
    // The trap: 'ladder' is deliberately absent from the roster's 47, so
    // without a synthesized option the select would display a law the drawing
    // is not using.
    expect(R.IDS).not.toContain('ladder');
    const values = F.groups().reduce((a, x) => a.concat(x.options.map((o) => o.value)), []);
    expect(values).toContain('ladder');
  });

  // ── U12 D3 — turingStripe was mis-classed as "Flow lines" ─────────────────
  // Its own gallery mechanism text says the opposite of the flow blurb ("Lines
  // that follow a direction field"): "The stripes are not placed, they
  // emerge … no periodic lattice". It is the same KIND of mark as
  // mazeFill/voronoiWeb — a labyrinth — and belongs under Networks &
  // space-filling with them.
  test('turingStripe is classed as Networks & space-filling, not Flow lines (U12 D3)', () => {
    expect(F.markClass('turingStripe')).toBe('web');
    const groups = F.groups();
    const webGroup = groups.find((g) => g.group === F.markClassLabel('web'));
    const flowGroup = groups.find((g) => g.group === F.markClassLabel('flow'));
    expect(webGroup.options.map((o) => o.value)).toContain('turingStripe');
    expect((flowGroup ? flowGroup.options.map((o) => o.value) : [])).not.toContain('turingStripe');
    // mazeFill / voronoiWeb are its new groupmates, exactly as the audit named.
    expect(webGroup.options.map((o) => o.value)).toEqual(
      expect.arrayContaining(['mazeFill', 'voronoiWeb', 'originSpiral', 'deepFillTSP']),
    );
  });

  // ── U12 D1/D2 — faceted-primitive (box/plane/solid) reachability ──────────
  // box/plane/solid have no parametric chart and fall through to the faceted
  // planar fill, which only reaches SurfaceFillMono's laws (plus `none` and
  // the base `ladder` drawing). Every other offered law is a silent no-op
  // there. This section pins the DATA-DERIVED set the picker gates on, not a
  // restated literal list — see the "does not rot" test at the end, which
  // swaps out the two live sources and proves the verdict follows them.
  describe('faceted-primitive reachability (U12 D1/D2)', () => {
    let M;
    beforeAll(() => { M = window.Vectura.Scene3D.SurfaceFillMono; });

    test('a curved (chart-wrapped) primitive reaches every law — sphere and pyramid', () => {
      ['sphere', 'pyramid', 'cylinder'].forEach((mode) => {
        expect(F.isFaceted(mode)).toBe(false);
        R.IDS.concat(['ladder', 'none']).forEach((id) => {
          expect(F.isReachableOn(id, mode)).toBe(true);
        });
      });
    });

    // ── W-10d — STALE ASSERTION UPDATE, not a widened gate: the test above
    // used to include 'torus' and asserted every law reachable there too.
    // W-10c measured that `originSpiral` cannot be made plottable on the torus
    // (the lower-left radial fan renders as solid ink wedges — 87.8% of
    // interior pixels sit in a blank-paper run longer than two pen widths,
    // WORSE than the pre-W-10c 73.9% — STILL-OPEN.md W-10c/W-10d) and no
    // primitive id reaches `surface-fill-mono.js` to gate it there (FU-1,
    // its own follow-up, a different lane's file). The user-facing fix is
    // this picker gate: torus is curved exactly like sphere/cone/cylinder —
    // isFaceted stays false, every OTHER law stays reachable — but
    // `originSpiral` alone is hidden there, unconditionally of mapper (the
    // defect lives in the mono law itself, not in which Type dispatches it).
    test('torus is curved like any other chart-wrapped primitive, EXCEPT originSpiral is hidden there (W-10d)', () => {
      expect(F.isFaceted('torus')).toBe(false);
      R.IDS.concat(['ladder', 'none']).forEach((id) => {
        const expected = id !== 'originSpiral';
        expect(F.isReachableOn(id, 'torus')).toBe(expected);
      });
      // Unconditional of mapper — hatch/crosshatch/contour all reach the same
      // mono law, and the wedge defect is in the law, not the Type.
      ['hatch', 'crosshatch', 'contour'].forEach((mapper) => {
        expect(F.isReachableOn('originSpiral', 'torus', undefined, mapper)).toBe(false);
      });
      // cone and sphere are unaffected — the gate names 'torus' specifically.
      ['cone', 'sphere'].forEach((mode) => {
        expect(F.isReachableOn('originSpiral', mode)).toBe(true);
        ['hatch', 'crosshatch', 'contour'].forEach((mapper) => {
          expect(F.isReachableOn('originSpiral', mode, undefined, mapper)).toBe(true);
        });
      });
    });

    // ── W-10d picker surface — groups() disables + suffixes the row exactly
    // the way W-03's spiral/stipple gate does (this repo's "hide" convention:
    // the option stays in the <select>, greyed and suffixed, never removed —
    // see the "groups(mode) disables the dead options" test above and
    // fill-audit-handoff's W-02 note on the same convention).
    test('groups("torus") marks originSpiral disabled + suffixed; groups("cone"/"sphere") leaves it live (W-10d)', () => {
      const optionsFor = (mode) => F.groups(mode).reduce((a, g) => a.concat(g.options), []);
      const torusEntry = optionsFor('torus').find((o) => o.value === 'originSpiral');
      expect(torusEntry).toBeTruthy();
      expect(torusEntry.disabled).toBe(true);
      expect(torusEntry.label).toContain(F.NO_EFFECT_SUFFIX);

      ['cone', 'sphere'].forEach((mode) => {
        const entry = optionsFor(mode).find((o) => o.value === 'originSpiral');
        expect(entry).toBeTruthy();
        expect(entry.disabled).toBeFalsy();
        expect(entry.label).not.toContain(F.NO_EFFECT_SUFFIX);
      });
    });

    // ── W-10d deserialization — the gate is picker-presentation ONLY. A
    // document saved before this fix (or hand-edited) that names a torus
    // object with toneLaw 'originSpiral' must load without throwing and must
    // NOT be silently rewritten: `clampStyleParam`'s 'toneLaw' case (params.js)
    // only rejects ids the roster does not recognize at all — it has no
    // primitiveMode argument and cannot know the value is unreachable on THIS
    // shape. So the saved id survives normalization unchanged, `resolve()`
    // (which only checks roster membership, same reason) still returns it,
    // and the render keeps producing the known wedge defect — `isReachableOn`
    // is the only place that knows better, and it only shapes the dropdown.
    // This is the documented fallback (STILL-OPEN.md W-10d/FU-1): hidden in
    // the picker, not repaired, and not engine-gated.
    test('a torus layer saved with toneLaw "originSpiral" deserializes unchanged — no throw, no silent rewrite (W-10d)', () => {
      const P = window.Vectura.Scene3D.Params;
      const style = P.normalizeStyle({ mapper: 'hatch', params: { toneLaw: 'originSpiral' } });
      expect(style.params.toneLaw).toBe('originSpiral');
      expect(F.resolve('originSpiral')).toBe('originSpiral');
      expect(F.isReachableOn(F.resolve(style.params.toneLaw), 'torus')).toBe(false);
      // Round-trip through the full scene sanitizer too — a torus object
      // carrying this style in styleTable.byObject must not throw or mutate
      // the id either.
      const sanitized = P.sanitizeSceneParams({
        objects: [{ id: 'obj-1', primitive: 'torus', params: { sx: 30, sy: 22, sz: 22 } }],
        styleTable: {
          scene: { mapper: 'hatch', params: {} },
          byObject: { 'obj-1': { mapper: 'hatch', params: { toneLaw: 'originSpiral' } } },
          byFace: {},
        },
      });
      expect(sanitized.styleTable.byObject['obj-1'].params.toneLaw).toBe('originSpiral');
    });

    test('box/plane are faceted, and only none/ladder/mono laws reach them', () => {
      ['box', 'plane'].forEach((mode) => {
        expect(F.isFaceted(mode)).toBe(true);
        expect(F.isCapLimited(mode)).toBe(false);
        R.IDS.forEach((id) => {
          if (id === 'none') { expect(F.isReachableOn(id, mode)).toBe(true); return; }
          expect(F.isReachableOn(id, mode)).toBe(M.isMono(id));
        });
        expect(F.isReachableOn('ladder', mode)).toBe(true);
      });
    });

    // ── The `solid` correction ────────────────────────────────────────────
    // `solid` is ALSO faceted (no chart) like box/plane, but its default body
    // (a 32-face buckyball) ADDITIONALLY exceeds the faceted mono path's own
    // front-face budget, so even the 9 laws that reach box/plane fall back
    // there too — verified against the running engine, not asserted, in
    // scene3d-solid-cap-reachability.test.js. `none` is the one law that
    // survives regardless: Stage 0 is never routed through the capped
    // dispatch. A low-poly named solid (this repo's own
    // scene3d-faceted-tone-law.test.js measures a dodecahedron) sits under
    // the cap and behaves exactly like box/plane.
    test('solid: the DEFAULT body is cap-limited (only none/ladder reach it)', () => {
      expect(F.isFaceted('solid')).toBe(true);
      expect(F.isCapLimited('solid')).toBe(true);
      expect(F.isCapLimited('solid', 'buckyball')).toBe(true);
      expect(F.isCapLimited('solid', undefined)).toBe(true);
      R.IDS.forEach((id) => {
        const expected = id === 'none';
        expect(F.isReachableOn(id, 'solid')).toBe(expected);
      });
      expect(F.isReachableOn('ladder', 'solid')).toBe(true);
    });

    test('solid: a low-poly named solid is NOT cap-limited — behaves like box/plane', () => {
      ['dodecahedron', 'tetrahedron', 'octahedron', 'icosahedron'].forEach((solidType) => {
        expect(F.isCapLimited('solid', solidType)).toBe(false);
        R.IDS.forEach((id) => {
          if (id === 'none') { expect(F.isReachableOn(id, 'solid', solidType)).toBe(true); return; }
          expect(F.isReachableOn(id, 'solid', solidType)).toBe(M.isMono(id));
        });
      });
    });

    // ── W-28: imported meshes (Unit F sibling finding) ──────────────────────
    // `solidType: 'importedMesh'` carries no advance knowledge of the real
    // mesh's front-face count — that number only exists mid-render, off a
    // live camera-facing mesh record (`record.faces[i].front`, scene3d.js's
    // `faceMonoLines`) which this config has no channel to (see
    // `isCapLimited`'s own comment). Before this fix, an absent/unrecognised
    // `solidType` fell through to "not the default" and was treated as
    // reachable — so the picker offered mazeFill/voronoiWeb/turingStripe on
    // every real import, yet `MONO_MAX_FRONT_FACES = 12` (scene3d.js) makes
    // any real import (any mesh over 12 faces — virtually all of them)
    // silently fall back to Ladder the moment one is picked. See
    // `scene3d-solid-cap-reachability.test.js` for the running-engine proof
    // that an imported mesh over the cap really does fall back this way.
    test('solid: an imported mesh is UNCONDITIONALLY cap-limited — its real front-face count is unknown at picker time (W-28)', () => {
      expect(F.isCapLimited('solid', 'importedMesh')).toBe(true);
      R.IDS.forEach((id) => {
        const expected = id === 'none';
        expect(F.isReachableOn(id, 'solid', 'importedMesh')).toBe(expected);
      });
      expect(F.isReachableOn('ladder', 'solid', 'importedMesh')).toBe(true);
    });

    test('an absent/unknown primitiveMode fails OPEN — never disables a law it cannot verify', () => {
      expect(F.isFaceted(undefined)).toBe(false);
      expect(F.isFaceted(null)).toBe(false);
      expect(F.isFaceted('notAPrimitive')).toBe(false);
      R.IDS.forEach((id) => expect(F.isReachableOn(id, undefined)).toBe(true));
    });

    test('groups(mode) disables the dead options and suffixes their label', () => {
      const g = F.groups('box');
      const opts = g.reduce((a, x) => a.concat(x.options), []);
      const dead = opts.filter((o) => o.value !== 'ladder' && !M.isMono(o.value) && o.value !== 'none');
      const alive = opts.filter((o) => o.value === 'ladder' || o.value === 'none' || M.isMono(o.value));
      expect(dead.length).toBeGreaterThan(0);
      expect(alive.length).toBeGreaterThan(0);
      dead.forEach((o) => {
        expect(o.disabled).toBe(true);
        expect(o.label).toContain(F.NO_EFFECT_SUFFIX);
      });
      alive.forEach((o) => {
        expect(o.disabled).toBeFalsy();
        expect(o.label).not.toContain(F.NO_EFFECT_SUFFIX);
      });
      // The measured U12 audit baseline was 38 of 49 (onePenDown is a wave
      // law, dead on faceted); none/ladder/the 9 mono laws are the 11 that
      // remain reachable. ALIVE is unaffected by the fill-roster collapse
      // (none of C-01..C-05's 13 folded ids so far is a mono law). DEAD
      // moves as the picker's flat list shrinks (W-22-24-W-18-plan.md §5
      // "…:267-270" — re-measure and re-paste this number, do not assume,
      // at every unit that folds another id): U1 46 total - 11 alive = 35;
      // U2 44 total - 11 = 33; U3 43 total - 11 = 32; U4 40 total - 11 = 29;
      // U5 (C-05, contFieldSigmoid/fieldMetric+fieldFloor, 4 more folded)
      // 36 total - 11 = 25.
      expect(alive.length).toBe(11);
      expect(dead.length).toBe(25);
      // Group STRUCTURE (count, membership) is unaffected — only reachability.
      expect(g.length).toBe(F.groups('sphere').length);
    });

    test('facetedNote names the shape limitation, with a DIFFERENT reason for the cap-limited solid', () => {
      expect(F.facetedNote('box')).toBe(F.FACETED_NOTE);
      expect(F.facetedNote('plane')).toBe(F.FACETED_NOTE);
      // The default solid gets the CAP note (a different reason: not "no
      // planar support" but "body too complex for the budget"), never the
      // plain box/plane note — the two must not read as the same warning.
      expect(F.facetedNote('solid')).toBe(F.FACETED_CAP_NOTE);
      expect(F.facetedNote('solid')).not.toBe(F.FACETED_NOTE);
      // A low-poly named solid is NOT cap-limited, so it gets the ordinary
      // box/plane note instead.
      expect(F.facetedNote('solid', 'dodecahedron')).toBe(F.FACETED_NOTE);
      expect(F.facetedNote('sphere')).toBe('');
      expect(F.facetedNote(undefined)).toBe('');
    });

    // ── THE ANTI-ROT PROOF ────────────────────────────────────────────────
    // The brief explicitly warns against a hardcoded ten-name array that will
    // rot. Prove this is NOT that: swap the two live sources
    // (SurfaceFillMono.isMono and Scene3D.Params.CURVED_FILL_PRIMITIVES) for
    // fakes and confirm the verdict follows them, not a baked-in list.
    test('the reachable set is DERIVED — swapping the live sources changes the verdict', () => {
      const Scene3D = window.Vectura.Scene3D;
      const realMono = Scene3D.SurfaceFillMono;
      const realParams = Scene3D.Params;
      try {
        // Fake #1: isMono now recognises only a law nowhere in the real roster.
        Scene3D.SurfaceFillMono = { ...realMono, isMono: (id) => id === 'zzzNotARealLaw' };
        expect(F.isReachableOn('zzzNotARealLaw', 'box')).toBe(true);
        // A law the REAL substrate recognises is now reported unreachable —
        // proof this reads isMono live, not a copy taken at load time.
        expect(F.isReachableOn('mazeFill', 'box')).toBe(false);

        // Fake #2: 'box' is now reported as a CURVED (chart-wrapped) primitive.
        Scene3D.Params = { ...realParams, CURVED_FILL_PRIMITIVES: new Set(['box']) };
        expect(F.isFaceted('box')).toBe(false);
        expect(F.isReachableOn('mazeFill', 'box')).toBe(true);
        expect(F.isReachableOn('whiteBand', 'box')).toBe(true);
      } finally {
        Scene3D.SurfaceFillMono = realMono;
        Scene3D.Params = realParams;
      }
      // Restored: back to the real, measured verdict.
      expect(F.isReachableOn('mazeFill', 'box')).toBe(true);
      expect(F.isReachableOn('whiteBand', 'box')).toBe(false);
    });
  });

  // ── fs-e1 gating — `isReachableOn` gains a MAPPER argument ─────────────────
  // Judge's ruling, items 1/5/3/6: `isReachableOn` was mapper-blind, so a
  // faceted primitive under Type=Contour/Spiral/Stipple showed eleven "live"
  // options that are all provably inert (faceMonoLines only dispatches for
  // hatch/crosshatch — scene3d.js:1533). And on a CURVED primitive, W-03
  // (F-03, C-09..C-13) measured that 45 of 48 roster laws collapse to a
  // handful of rung-skipping pictures under Type=Spiral/Stipple — the
  // original 9 mono laws (true no-ops) PLUS 36 more that "run" but fall back
  // to bare centrelines or indistinguishable rung-skipping because the
  // spiral/stipple sinks never publish a width profile. Only `none` /
  // `ladder` / `fineLadder` / `phaseFineLadder` are the "honest" rung-
  // skipping options left reachable.
  describe('mapper-aware reachability (fs-e1 gating: item 1 / item 5; W-03 extends item 5)', () => {
    const ALL_IDS = () => R.IDS.concat(['ladder']);
    // The full W-03 inert-or-bare-centreline set — mirrors
    // src/config/context-bar.js's CURVED_SPIRAL_STIPPLE_INERT exactly.
    // Computed as "every roster law except the 3 honest rung-skippers"
    // rather than retyped by hand, so a roster change cannot silently
    // desync this test from the source it is pinning. A FUNCTION, not a
    // top-level const: `R` is populated by the outer `beforeAll`, which has
    // not run yet when this describe body itself executes at collection
    // time (same reason `ALL_IDS` above is a function, not a value).
    const CURVED_SPIRAL_STIPPLE_LIVE = new Set(['none', 'fineLadder', 'phaseFineLadder']);
    const curvedSpiralStippleInert = () => R.IDS.filter((id) => !CURVED_SPIRAL_STIPPLE_LIVE.has(id));

    // ── Item 1 — faceted + non-hatch/crosshatch disables EVERYTHING ─────────
    test('faceted (box) + Contour/Spiral/Stipple disables every option, including None and Ladder', () => {
      ['contour', 'spiral', 'stipple'].forEach((mapper) => {
        ALL_IDS().forEach((id) => {
          expect(F.isReachableOn(id, 'box', undefined, mapper)).toBe(false);
        });
      });
    });

    test('faceted (solid, default buckyball) + Contour/Spiral/Stipple ALSO disables None and Ladder (not just the mono set)', () => {
      // Regression trap: before this fix, `id === 'none' || id === FILL_STYLE_
      // DEFAULT` short-circuited to `true` before the faceted check ran, so a
      // capped solid under a non-hatch Type still showed None/Ladder as live.
      ['contour', 'spiral', 'stipple'].forEach((mapper) => {
        expect(F.isReachableOn('none', 'solid', 'buckyball', mapper)).toBe(false);
        expect(F.isReachableOn('ladder', 'solid', 'buckyball', mapper)).toBe(false);
      });
    });

    // ── Paired negative — regression guard: faceted + hatch/crosshatch is
    // UNCHANGED from the pre-fix behavior (over-gating is as much a defect).
    test('faceted (box/plane) + hatch/crosshatch is byte-identical to the un-mapper-aware call (regression guard)', () => {
      ['box', 'plane'].forEach((mode) => {
        ['hatch', 'crosshatch'].forEach((mapper) => {
          ALL_IDS().forEach((id) => {
            expect(F.isReachableOn(id, mode, undefined, mapper)).toBe(F.isReachableOn(id, mode));
          });
        });
      });
      // And the capped default solid keeps exactly none/ladder alive under
      // hatch/crosshatch — the cap note's own scenario is untouched.
      ['hatch', 'crosshatch'].forEach((mapper) => {
        expect(F.isReachableOn('none', 'solid', 'buckyball', mapper)).toBe(true);
        expect(F.isReachableOn('ladder', 'solid', 'buckyball', mapper)).toBe(true);
        expect(F.isReachableOn('mazeFill', 'solid', 'buckyball', mapper)).toBe(false);
      });
    });

    test('groups(mode, solidType, mapper) threads the mapper through to every option', () => {
      const g = F.groups('box', undefined, 'contour');
      const opts = g.reduce((a, x) => a.concat(x.options), []);
      expect(opts.length).toBeGreaterThan(0);
      opts.forEach((o) => {
        expect(o.disabled).toBe(true);
        expect(o.label).toContain(F.NO_EFFECT_SUFFIX);
      });
      // Regression: hatch on a box is unchanged from the pre-mapper call.
      expect(F.groups('box', undefined, 'hatch')).toEqual(F.groups('box'));
    });

    // ── Item 5, extended by W-03 — curved primitive + spiral/stipple: only
    // none/ladder/fineLadder/phaseFineLadder survive; everything else (the
    // original 9 true no-ops PLUS 36 bare-centreline/rung-skipping laws,
    // F-03 / C-09..C-13) is disabled — STALE ASSERTION UPDATE: this used to
    // pin exactly the 9 mono laws; W-03 deliberately widened the gate.
    test('curved (sphere) + spiral disables all but none/ladder/fineLadder/phaseFineLadder (W-03)', () => {
      const inert = curvedSpiralStippleInert();
      R.IDS.forEach((id) => {
        const expected = inert.indexOf(id) === -1;
        expect(F.isReachableOn(id, 'sphere', undefined, 'spiral')).toBe(expected);
      });
      expect(F.isReachableOn('ladder', 'sphere', undefined, 'spiral')).toBe(true);
      expect(F.isReachableOn('none', 'sphere', undefined, 'spiral')).toBe(true);
      expect(F.isReachableOn('fineLadder', 'sphere', undefined, 'spiral')).toBe(true);
      expect(F.isReachableOn('phaseFineLadder', 'sphere', undefined, 'spiral')).toBe(true);
      // The exact count W-03 measured: 45 of 48 roster laws gated (+ the 3
      // kept: none/fineLadder/phaseFineLadder = 48; 'ladder' is the 49th
      // total option and is not part of the roster's 48).
      expect(inert.length).toBe(45);
    });

    test('curved (sphere) + stipple disables the SAME set as spiral (W-03)', () => {
      const inert = curvedSpiralStippleInert();
      R.IDS.forEach((id) => {
        const expected = inert.indexOf(id) === -1;
        expect(F.isReachableOn(id, 'sphere', undefined, 'stipple')).toBe(expected);
      });
      expect(F.isReachableOn('fineLadder', 'sphere', undefined, 'stipple')).toBe(true);
      expect(F.isReachableOn('phaseFineLadder', 'sphere', undefined, 'stipple')).toBe(true);
    });

    // ── W-03 justification — the hide is not a guess. A sphere+spiral build
    // with a ribbon law (taperedEnds) that this list now gates measurably
    // ships ZERO ribbon rings: `ribbonLaw` is true (taperedEnds IS a
    // variable-width law) but `wallRings` is 0 (nothing analytically walled
    // either), proving every stretch fell back to its bare centreline — F-03's
    // root cause (the spiral sink never calls `noteW`). This is a
    // CHARACTERIZATION test, not a red→green proof of this commit's own
    // change (it does not touch surface-fill.js): it stays true today and is
    // EXPECTED to flip once W-13 (future work) wires a width profile into the
    // spiral sink — at which point taperedEnds moves back out of
    // CURVED_SPIRAL_STIPPLE_INERT and this assertion becomes W-13's own RED.
    test('W-03 justification — sphere+spiral+taperedEnds ships zero ribbons (proves the hide, becomes the W-13 RED)', () => {
      const V = window.Vectura;
      const engine = new V.VectorEngine();
      const groupId = engine.addLayer('scene3d');
      const obj = engine.getLayerDescendants(groupId).find((l) => l && l.type === 'object3d');
      obj.params.primitive = 'sphere';
      obj.params.style = obj.params.style || { penId: null, mapper: 'spiral', params: {} };
      obj.params.style.mapper = 'spiral';
      obj.params.style.params = { ...(obj.params.style.params || {}), toneLaw: 'taperedEnds' };
      engine.computeAllDisplayGeometry();
      const stats = V.Scene3D.SurfaceFill.lastRibbonStats;
      expect(stats).toBeTruthy();
      expect(stats.ribbonLaw).toBe(true);
      expect(stats.wallRings).toBe(0);
    });

    // ── Paired negative — a curved primitive under hatch/crosshatch is
    // untouched by the new spiral/stipple rule (over-gating guard).
    test('curved (sphere) + hatch/crosshatch is unaffected by the spiral/stipple gate', () => {
      ['hatch', 'crosshatch'].forEach((mapper) => {
        curvedSpiralStippleInert().forEach((id) => {
          expect(F.isReachableOn(id, 'sphere', undefined, mapper)).toBe(true);
        });
      });
    });

    // ── pyramid special cases ────────────────────────────────────────────────
    test('pyramid: fineLadder is inert on hatch only — live on crosshatch AND contour (do not over-gate)', () => {
      expect(F.isReachableOn('fineLadder', 'pyramid', undefined, 'hatch')).toBe(false);
      expect(F.isReachableOn('fineLadder', 'pyramid', undefined, 'crosshatch')).toBe(true);
      expect(F.isReachableOn('fineLadder', 'pyramid', undefined, 'contour')).toBe(true);
    });

    test('pyramid: None is ALSO gated on spiral/stipple (byte-identical to a large cluster there)', () => {
      expect(F.isReachableOn('none', 'pyramid', undefined, 'spiral')).toBe(false);
      expect(F.isReachableOn('none', 'pyramid', undefined, 'stipple')).toBe(false);
      // ...but not elsewhere — None still differs on pyramid hatch/crosshatch/contour.
      expect(F.isReachableOn('none', 'pyramid', undefined, 'hatch')).toBe(true);
      expect(F.isReachableOn('none', 'pyramid', undefined, 'crosshatch')).toBe(true);
      expect(F.isReachableOn('none', 'pyramid', undefined, 'contour')).toBe(true);
      // And None is untouched on a NON-pyramid curved primitive under spiral.
      expect(F.isReachableOn('none', 'sphere', undefined, 'spiral')).toBe(true);
    });

    // ── Item 3 — facetedNote is mapper-aware ─────────────────────────────────
    test('facetedNote says NOTHING differs (not even None) for faceted + contour/spiral/stipple', () => {
      ['contour', 'spiral', 'stipple'].forEach((mapper) => {
        const note = F.facetedNote('box', undefined, mapper);
        expect(note).toBeTruthy();
        expect(note).not.toBe(F.FACETED_NOTE);
        expect(note).not.toBe(F.FACETED_CAP_NOTE);
        // The old cap note's false claim ("Only NO TONE still differs") must
        // not survive into the new copy — nothing differs here, not even None.
        expect(note).not.toMatch(/Only NO TONE still differs/);
      });
    });

    test('facetedNote keeps the existing sentence for faceted + hatch/crosshatch (regression guard)', () => {
      expect(F.facetedNote('box', undefined, 'hatch')).toBe(F.FACETED_NOTE);
      expect(F.facetedNote('box', undefined, 'crosshatch')).toBe(F.FACETED_NOTE);
      expect(F.facetedNote('solid', 'buckyball', 'hatch')).toBe(F.FACETED_CAP_NOTE);
      expect(F.facetedNote('solid', 'buckyball', 'crosshatch')).toBe(F.FACETED_CAP_NOTE);
      // Omitting mapper altogether is still the pre-existing behavior.
      expect(F.facetedNote('box')).toBe(F.FACETED_NOTE);
      expect(F.facetedNote('solid', 'buckyball')).toBe(F.FACETED_CAP_NOTE);
    });

    test('facetedNote on the capped solid ALSO switches to the off-axis note under contour/spiral/stipple', () => {
      ['contour', 'spiral', 'stipple'].forEach((mapper) => {
        const note = F.facetedNote('solid', 'buckyball', mapper);
        expect(note).not.toBe(F.FACETED_CAP_NOTE);
        expect(note).not.toBe(F.FACETED_NOTE);
      });
    });

    test('facetedNote on a curved primitive is always empty, regardless of mapper (regression guard)', () => {
      ['hatch', 'crosshatch', 'contour', 'spiral', 'stipple'].forEach((mapper) => {
        expect(F.facetedNote('sphere', undefined, mapper)).toBe('');
        expect(F.facetedNote('pyramid', undefined, mapper)).toBe('');
      });
    });

    // ── W-02 / F-02 — none/wireframe/contourSlice never dispatch through the
    // tone-law machinery AT ALL (scene3d.js's SURFACE_FILL only covers hatch/
    // crosshatch/contour/spiral/stipple), so EVERY id — including None and
    // the shipped default — must be unreachable there, on EVERY primitive
    // shape (faceted or chart-wrapped). Before this fix `isReachableOn`
    // returned true for all 48 laws on a curved primitive (sphere/torus/cone)
    // under these three Types; the audit measured 1,152 wasted shots.
    describe('none/wireframe/contourSlice are inert everywhere (W-02, F-02)', () => {
      const NO_FILL_MAPPERS = ['none', 'wireframe', 'contourSlice'];

      test('curved primitives (sphere, torus, cone): every id, including none/ladder, is unreachable', () => {
        ['sphere', 'torus', 'cone'].forEach((mode) => {
          NO_FILL_MAPPERS.forEach((mapper) => {
            ALL_IDS().forEach((id) => {
              expect(F.isReachableOn(id, mode, undefined, mapper)).toBe(false);
            });
          });
        });
      });

      test('faceted primitives (box, solid): every id, including none/ladder, is unreachable', () => {
        ['box', 'solid'].forEach((mode) => {
          NO_FILL_MAPPERS.forEach((mapper) => {
            ALL_IDS().forEach((id) => {
              expect(F.isReachableOn(id, mode, undefined, mapper)).toBe(false);
            });
          });
        });
      });

      test('groups(mode, solidType, mapper) marks every option disabled, with the no-effect suffix, for a curved primitive', () => {
        NO_FILL_MAPPERS.forEach((mapper) => {
          const g = F.groups('sphere', null, mapper);
          const opts = g.reduce((a, x) => a.concat(x.options), []);
          expect(opts.length).toBeGreaterThan(0);
          opts.forEach((o) => {
            expect(o.disabled).toBe(true);
            expect(o.label).toContain(F.NO_EFFECT_SUFFIX);
          });
        });
      });

      // ── Regression guard — the fill mappers this fix must NOT touch ────────
      // The five surface-fill mappers are never caught by the new clause
      // (they ARE members of SURFACE_FILL_MAPPERS), so the new clause itself
      // never zeroes out a shape's reachable set under any of them. Curved
      // (chart-wrapped) primitives keep something reachable under all 5;
      // faceted primitives (box) already lose everything under contour/
      // spiral/stipple for an UNRELATED, pre-existing reason (the faceted
      // branch's own hatch/crosshatch-only rule — see "faceted (box) +
      // Contour/Spiral/Stipple disables every option" above), so that
      // combination is excluded here rather than misread as a new regression.
      // The per-mapper/per-shape special cases (pyramid+fineLadder+hatch,
      // spiral/stipple's 9-law inert list, the faceted mono set, …) are each
      // pinned by their own dedicated test elsewhere in this file, which
      // exercises this same (already-patched) isReachableOn and would go red
      // on its own if this change disturbed any of them.
      test('at least one law stays reachable on a curved shape under every fill mapper (no over-gating)', () => {
        ['sphere', 'torus', 'cone', 'pyramid'].forEach((mode) => {
          ['hatch', 'crosshatch', 'contour', 'spiral', 'stipple'].forEach((mapper) => {
            const reachable = ALL_IDS().some((id) => F.isReachableOn(id, mode, undefined, mapper));
            expect(reachable).toBe(true);
          });
        });
      });

      test('at least one law stays reachable on a faceted shape (box) under hatch/crosshatch (no over-gating)', () => {
        ['hatch', 'crosshatch'].forEach((mapper) => {
          const reachable = ALL_IDS().some((id) => F.isReachableOn(id, 'box', undefined, mapper));
          expect(reachable).toBe(true);
        });
      });

      test('an absent mapper is not gated by the new clause (fail-open, unchanged)', () => {
        ['sphere', 'box', 'solid'].forEach((mode) => {
          R.IDS.concat(['ladder']).forEach((id) => {
            // No 4th argument at all — omitted, not just falsy — matches every
            // pre-existing 3-arg call site in this file and in production code.
            expect(F.isReachableOn(id, mode)).toBe(F.isReachableOn(id, mode, undefined, undefined));
          });
        });
      });

      // ── The anti-rot proof — this must read a live source, not a baked list.
      test('the verdict is DERIVED from Vectura.Scene3D.Params.SURFACE_FILL_MAPPERS — swapping it flips the result', () => {
        const Scene3D = window.Vectura.Scene3D;
        const realParams = Scene3D.Params;
        try {
          // Fake: 'wireframe' is now (incorrectly) a surface-fill mapper.
          Scene3D.Params = { ...realParams, SURFACE_FILL_MAPPERS: new Set(['wireframe']) };
          expect(F.isReachableOn('ladder', 'sphere', undefined, 'wireframe')).toBe(true);
          // And 'hatch' — a REAL fill mapper — is now reported unreachable,
          // proof this reads the Set live rather than a literal string check.
          expect(F.isReachableOn('mkTick', 'sphere', undefined, 'hatch')).toBe(false);
        } finally {
          Scene3D.Params = realParams;
        }
        // Restored: back to the real, measured verdict.
        expect(F.isReachableOn('ladder', 'sphere', undefined, 'wireframe')).toBe(false);
        expect(F.isReachableOn('mkTick', 'sphere', undefined, 'hatch')).toBe(true);
      });

      // ── Drift guard (W-02 reviewer follow-up) — params.js's
      // SURFACE_FILL_MAPPERS (read by isReachableOn, proven live above) used to
      // be an independently hand-copied literal with nothing pinning it equal
      // to scene3d.js's own dispatch gate. scene3d.js now exposes that gate
      // read-only as `Vectura.Scene3D.SURFACE_FILL_MAPPERS` (built from its
      // single internal SURFACE_FILL const — the file's second, closure-local
      // copy was deleted in favor of reading this same Set). This test is what
      // actually catches a future drift: it fails the moment either list gains
      // or loses a mapper without the other following.
      test('scene3d.js\'s SURFACE_FILL_MAPPERS and params.js\'s SURFACE_FILL_MAPPERS name the same mappers', () => {
        const engineGate = window.Vectura.Scene3D.SURFACE_FILL_MAPPERS;
        const paramsGate = window.Vectura.Scene3D.Params.SURFACE_FILL_MAPPERS;
        // Duck-typed, not `toBeInstanceOf(Set)` — the runtime is loaded into a
        // jsdom window (a separate realm from this test file's own `Set`), so
        // a same-shape Set built inside that window fails a bare `instanceof`
        // check even though it is a genuine Set there.
        expect(typeof engineGate.has).toBe('function');
        expect(typeof paramsGate.has).toBe('function');
        expect(engineGate.size).toBeGreaterThan(0);
        expect([...engineGate].sort()).toEqual([...paramsGate].sort());
      });

      // ── W-21 reviewer follow-up — the export used to be the LIVE `SURFACE_FILL`
      // Set, "read-only by convention" only: `Object.freeze` on a Set does not
      // intercept `.add`/`.delete` (they mutate an internal slot, not an own
      // property), so an external `.add`/`.delete` on the export silently
      // corrupted the same Set every one of scene3d.js's five dispatch sites
      // reads via `SURFACE_FILL.has(...)`. The export is now a read-only VIEW —
      // `.add`/`.delete` do not exist on it at all, so calling either throws
      // instead of mutating dispatch, and a genuine mutation attempt cannot
      // silently change what `isReachableOn` (or any dispatch site) sees.
      test('the export cannot be mutated into corrupting dispatch (W-21 follow-up)', () => {
        const engineGate = window.Vectura.Scene3D.SURFACE_FILL_MAPPERS;
        const before = [...engineGate].sort();
        expect(typeof engineGate.add).not.toBe('function');
        expect(typeof engineGate.delete).not.toBe('function');
        expect(() => { engineGate.add('wireframe'); }).toThrow();
        expect(() => { engineGate.delete('hatch'); }).toThrow();
        expect([...engineGate].sort()).toEqual(before);
        expect(F.isReachableOn('mkTick', 'sphere', undefined, 'hatch')).toBe(true);
      });
    });
  });

  // ── The Fill Style picker no longer has a library/experimental tier gate ──
  // The owner's decision retired the Off/On "Experimental" disclosure
  // (LIBRARY_LABEL/LIBRARY_ARIA/LIBRARY_NOTE/LIBRARY_SUFFIX all removed from
  // src/config/context-bar.js — asserted undefined in the "no option label
  // carries a tier suffix" test above). `tier`/`LIBRARY`/`PRODUCTION` stay in
  // the generated roster as curatorial provenance even though no UI code
  // reads them for gating anymore — the per-law `caveat` display survives
  // and is what this block now pins.
  describe('per-law caveats survive the disclosure removal', () => {
    // Every previously-"library"-tier law still has a caveat, and `FS.note`
    // (kept — see CLAUDE.md scope) still renders it for the SELECTED law
    // regardless of whether the id is one of the 11 or one of the 36.
    test('every one of the 11 previously-demoted laws has a non-empty measured caveat', () => {
      expect(R.LIBRARY.length).toBe(11);
      R.LIBRARY.forEach((id) => {
        const caveat = R.BY_ID[id] && R.BY_ID[id].caveat;
        expect(typeof caveat).toBe('string');
        expect(caveat.length).toBeGreaterThan(0);
      });
    });

    test('a production law with a caveat (e.g. ampSpacing) still renders one — caveats are not library-exclusive', () => {
      const n = F.note('ampSpacing');
      expect(n.caveat.length).toBeGreaterThan(0);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 2. Surface A — the context-bar Style flyout.
// ══════════════════════════════════════════════════════════════════════════

describe('Fill Style — context-bar Style flyout', () => {
  let runtime, window, document, app, CB, F;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
    app.maxHistory = 100000;
    CB = window.Vectura.UI.ContextBar;
    F = window.Vectura.SCENE_FILL_STYLES;
    await nextFrames();
  });
  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  const host = () => CB.getContentHost();
  const addSelectScene = (overrides = {}) => {
    app.engine.layers = app.engine.layers.filter((l) => l.type !== 'scene3d');
    const scene = new window.Vectura.Layer(`scene-fs-${app.engine.layers.length}`, 'scene3d', 'Scene');
    scene.params = { ...scene.params, ...fixtureParams(overrides) };
    app.engine.layers.push(scene);
    app.engine.activeLayerId = scene.id;
    app.engine.generate(scene.id);
    app.renderer.setSelection([scene.id], scene.id);
    app.renderer.setSceneSelection({ layerId: scene.id, mode: 'object', objectIds: ['obj-1'], faceKeys: [], edgeKeys: [] });
    CB.restoreState();
    return scene;
  };
  const pills = () => Array.from(host().querySelectorAll('.ctxbar-scene-field'));
  const pillByLabel = (t) => pills().find((f) => f.getAttribute('aria-label') === t);
  const openFly = () => document.querySelector('.ctxbar-scene-flyout.is-open');
  const rowCtl = (fly, label) => {
    const row = Array.from(fly.querySelectorAll('.ctxbar-fly-row'))
      .find((r) => (r.querySelector('.ctxbar-fly-label') || {}).textContent === label);
    return row ? row.querySelector('.ctxbar-fly-ctl') : null;
  };
  const openStyle = (overrides) => {
    const scene = addSelectScene(overrides);
    pillByLabel('Style').click();
    return { scene, fly: openFly() };
  };
  const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));

  test('the first dropdown is labelled "Type", not "Fill"', () => {
    const { fly } = openStyle({ styleTable: styleTable({ 'obj-1': { penId: null, mapper: 'hatch', params: {} } }) });
    expect(rowCtl(fly, 'Type')).toBeTruthy();
    expect(rowCtl(fly, 'Fill')).toBeNull();
  });

  test('a Fill Style dropdown sits beneath Type, grouped by mark class', () => {
    const { fly } = openStyle({ styleTable: styleTable({ 'obj-1': { penId: null, mapper: 'hatch', params: {} } }) });
    const labels = Array.from(fly.querySelectorAll('.ctxbar-fly-label')).map((l) => l.textContent);
    expect(labels.indexOf('Fill Style')).toBe(labels.indexOf('Type') + 1);
    const sel = rowCtl(fly, 'Fill Style').querySelector('select');
    const groups = Array.from(sel.querySelectorAll('optgroup'));
    expect(groups.length).toBe(F.groups().length);
    expect(groups.map((g) => g.label)).toContain(F.markClassLabel('cross'));
    expect(sel.querySelectorAll('option').length).toBe(
      F.groups().reduce((a, x) => a + x.options.length, 0),
    );
  });

  test('an unset style shows the shipped default rather than lying about the first option', () => {
    const { fly } = openStyle({ styleTable: styleTable({ 'obj-1': { penId: null, mapper: 'hatch', params: {} } }) });
    expect(rowCtl(fly, 'Fill Style').querySelector('select').value).toBe('ladder');
  });

  test('the row is absent on wireframe and on none — a tone law is meaningless there', () => {
    ['wireframe', 'none'].forEach((mapper) => {
      const { fly } = openStyle({ styleTable: styleTable({ 'obj-1': { penId: null, mapper, params: {} } }) });
      expect(rowCtl(fly, 'Fill Style')).toBeNull();
    });
  });

  test('choosing a law writes the FULL params bag at OBJECT scope, plus one undo', () => {
    const before = { fillAngle: 30, fillDensity: 62, lineType: 'dashed', fillCurves: true };
    const { scene, fly } = openStyle({ styleTable: styleTable({ 'obj-1': { penId: null, mapper: 'hatch', params: { ...before } } }) });
    const hist = app.history.length;
    const sel = rowCtl(fly, 'Fill Style').querySelector('select');
    sel.value = 'etfKang';
    fire(sel, 'change');
    const written = scene.params.styleTable.byObject['obj-1'].params;
    expect(written.toneLaw).toBe('etfKang');
    // Whole-style-wins makes a dropped key a silent data loss — assert every one.
    Object.keys(before).forEach((k) => expect(written[k]).toEqual(before[k]));
    expect(app.history.length).toBe(hist + 1);
  });

  test('THE SCOPE TRAP — the write lands on an object that declares its own style', () => {
    // The object's own style wins over the scene's, so a scene-scope write
    // would never reach it and the picker would look broken on exactly the
    // objects a user is most likely to be editing.
    const { scene, fly } = openStyle({
      styleTable: styleTable(
        { 'obj-1': { penId: null, mapper: 'hatch', params: { fillDensity: 50 } } },
        {},
        { penId: null, mapper: 'hatch', params: { toneLaw: 'mkTick' } },
      ),
    });
    const sel = rowCtl(fly, 'Fill Style').querySelector('select');
    sel.value = 'voronoiWeb';
    fire(sel, 'change');
    const SC = window.Vectura.Scene3D.StyleCascade;
    const eff = SC.resolve(scene.params.styleTable, { objectId: 'obj-1' });
    expect(eff.provenance.scope).toBe('object');
    expect(eff.params.toneLaw).toBe('voronoiWeb');
    // …and the scene style is untouched.
    expect(scene.params.styleTable.scene.params.toneLaw).toBe('mkTick');
  });

  test('the note names the mark class, and a previously-demoted law renders its caveat', () => {
    const { fly } = openStyle({
      styleTable: styleTable({ 'obj-1': { penId: null, mapper: 'hatch', params: { toneLaw: 'etfKang' } } }),
    });
    const notes = () => Array.from(openFly().querySelectorAll('.ctxbar-fly-note')).map((n) => n.textContent);
    expect(notes().some((t) => t.startsWith('Flow lines —'))).toBe(true);
    expect(openFly().querySelector('.ctxbar-fly-note.is-caveat')).toBeNull();

    // The picker offers every law permanently now — no disclosure to open
    // before a previously-demoted (simulated pen) law is selectable.
    const sel = rowCtl(fly, 'Fill Style').querySelector('select');
    sel.value = 'penStipple';
    fire(sel, 'change');
    const caveat = openFly().querySelector('.ctxbar-fly-note.is-caveat');
    expect(caveat).toBeTruthy();
    expect(caveat.textContent.startsWith(window.Vectura.SCENE_FILL_STYLES.SIMULATED_NOTE)).toBe(true);
  });

  // fs-y1 Job 1 — the audit found NO (i) at all here, only an always-on
  // note. The docked panel already has a click-driven (i); this pins the
  // ctxbar Style flyout carrying the same affordance, degraded to an INLINE
  // block (not a floating popover) because the flyout is only 232px wide.
  describe('fs-y1 Job 1 — the ctxbar Style flyout Fill Style row carries a click-driven (i)', () => {
    const lawRowOf = (fly) => rowCtl(fly, 'Fill Style').parentNode;

    test('an (i) button exists beside the Fill Style row and is closed by default', () => {
      const { fly } = openStyle({
        styleTable: styleTable({ 'obj-1': { penId: null, mapper: 'hatch', params: { toneLaw: 'etfKang' } } }),
      });
      const btn = lawRowOf(fly).querySelector('.vs3-lawinfo-btn');
      expect(btn).toBeTruthy();
      expect(btn.tagName).toBe('BUTTON');
      expect(btn.getAttribute('aria-label')).toMatch(/\S/);
      const box = openFly().querySelector(`#${btn.getAttribute('aria-describedby')}`);
      expect(box).toBeTruthy();
      expect(box.classList.contains('is-open')).toBe(false);
      expect(box.textContent).toContain(window.Vectura.SCENE_FILL_STYLES.entry('etfKang').mechanism);
    });

    test('clicking the (i) opens the inline panel; a second click closes it', () => {
      const { fly } = openStyle({
        styleTable: styleTable({ 'obj-1': { penId: null, mapper: 'hatch', params: { toneLaw: 'etfKang' } } }),
      });
      const btn = lawRowOf(fly).querySelector('.vs3-lawinfo-btn');
      const box = openFly().querySelector(`#${btn.getAttribute('aria-describedby')}`);
      fire(btn, 'click');
      expect(box.classList.contains('is-open')).toBe(true);
      expect(btn.getAttribute('aria-expanded')).toBe('true');
      fire(btn, 'click');
      expect(box.classList.contains('is-open')).toBe(false);
    });

    test('the panel never widens past the 232px flyout — it renders inline, not as a floating popover', () => {
      const { fly } = openStyle({
        styleTable: styleTable({ 'obj-1': { penId: null, mapper: 'hatch', params: { toneLaw: 'etfKang' } } }),
      });
      const btn = lawRowOf(fly).querySelector('.vs3-lawinfo-btn');
      const box = openFly().querySelector(`#${btn.getAttribute('aria-describedby')}`);
      fire(btn, 'click');
      // Inline flow, not absolutely positioned — a direct child of the
      // flyout body, siblings with the row rather than floating off it.
      expect(box.parentNode).toBe(fly);
      expect(box.classList.contains('vs3-lawinfo-pop')).toBe(false);
    });

    // STALE FIXTURE UPDATE (U4, fill-roster collapse) — 'bundleDither' is now
    // an ALIAS folded into survivor 'bundleCount'. The docked/ctxbar caveat
    // line is rendered from the RESOLVED SURVIVOR id (fillStyleControls'
    // documented design: the (i) popover shows the survivor's own blurb),
    // and bundleCount itself has no caveat — so bundleDither's real,
    // measured caveat ("waving the pass-count boundary made long-wave moire
    // worse") is genuinely no longer reachable through this UI path once
    // folded. That gap is real, plan-anticipated (§2.4), and requires a
    // UI-file change (scene3d-panel.js/context-bar.js) to fix — out of scope
    // for this data-only unit; see the dedicated "U4 caveat-visibility gap"
    // describe block in scene3d-tone-law-collapse.test.js and this unit's
    // report for the honest record. This test's actual PURPOSE is to prove
    // the GENERAL mechanism (a library law's caveat renders without opening
    // the (i)), so it now uses 'bundleSubNib' — a LIBRARY-tier, caveat-
    // bearing law that no cluster in this plan ever folds (§1 explicitly
    // keeps it a distinct row forever) — instead of a law this very unit
    // just made unreachable via this exact UI path.
    test('the caveat and mark-class note stay reachable without opening the (i)', () => {
      const { fly } = openStyle({
        styleTable: styleTable({ 'obj-1': { penId: null, mapper: 'hatch', params: { toneLaw: 'bundleSubNib' } } }),
      });
      const notes = Array.from(openFly().querySelectorAll('.ctxbar-fly-note')).map((n) => n.textContent);
      expect(notes.some((t) => t.startsWith('Parallel hatching —') || t.startsWith('Crosshatch'))).toBe(true);
      expect(openFly().querySelector('.ctxbar-fly-note.is-caveat')).toBeTruthy();
    });
  });

  // The owner's decision retired the Off/On "Experimental" toggle: every law
  // is offered all the time, on both surfaces, with no per-option suffix and
  // no view-state to persist. This test used to prove the toggle grew the
  // list by exactly 11 and never wrote to params; it now proves the toggle
  // is simply gone and the 11 are unconditionally present.
  test('there is no Experimental/Library toggle — the select already offers all 11 previously-demoted laws', () => {
    const { scene, fly } = openStyle({ styleTable: styleTable({ 'obj-1': { penId: null, mapper: 'hatch', params: {} } }) });
    expect(rowCtl(fly, 'Experimental')).toBeNull();
    expect(rowCtl(fly, 'Library')).toBeNull();
    const values = Array.from(rowCtl(fly, 'Fill Style').querySelector('select').querySelectorAll('option')).map((o) => o.value);
    // Fill-collapse (W-22-24-W-18-plan.md) — a LIBRARY id folded into a
    // survivor (U1-U8) is reachable through that survivor's own sub-control,
    // not as its own flat <option>; see the identical note on "groups()
    // returns every roster law..." above.
    window.Vectura.SCENE3D_TONE_LAWS.LIBRARY.forEach((id) => {
      if (window.Vectura.SCENE3D_TONE_LAWS.ALIASES[id]) return;
      expect(values).toContain(id);
    });
    // Still never written to layer params — there is no toggle state to leak.
    const p = scene.params.styleTable.byObject['obj-1'].params;
    expect(Object.keys(p).some((k) => /library/i.test(k))).toBe(false);
  });

  test('a multi-selection that disagrees on the law shows Mixed', () => {
    const scene = addSelectScene({
      objects: [
        { id: 'obj-1', name: 'A', primitive: 'sphere', params: { sx: 40, sy: 40, sz: 40, detail: 12 }, transform: { x: -40, y: 20, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' },
        { id: 'obj-2', name: 'B', primitive: 'sphere', params: { sx: 40, sy: 40, sz: 40, detail: 12 }, transform: { x: 40, y: 20, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' },
      ],
      styleTable: styleTable({
        'obj-1': { penId: null, mapper: 'hatch', params: { toneLaw: 'etfKang' } },
        'obj-2': { penId: null, mapper: 'hatch', params: { toneLaw: 'mazeFill' } },
      }),
    });
    app.renderer.setSceneSelection({ layerId: scene.id, mode: 'object', objectIds: ['obj-1', 'obj-2'], faceKeys: [], edgeKeys: [] });
    CB.restoreState();
    pillByLabel('Style').click();
    const ctl = rowCtl(openFly(), 'Fill Style');
    expect(ctl.classList.contains('ctxbar-fly-mixed')).toBe(true);
    expect(Array.from(ctl.querySelectorAll('option')).map((o) => o.textContent)).toContain('Mixed');
  });

  // ── U12 D1/D2 — a box selection must disable the dead options ─────────────
  test('a box selection disables the dead options, suffixes their label, and shows the faceted note', () => {
    const BOX = { id: 'obj-1', name: 'Box', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 }, transform: { x: 0, y: 20, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' };
    const { fly } = openStyle({ objects: [BOX], styleTable: styleTable({ 'obj-1': { penId: null, mapper: 'hatch', params: {} } }) });
    const M = window.Vectura.Scene3D.SurfaceFillMono;
    const NO_EFFECT = window.Vectura.SCENE_FILL_STYLES.NO_EFFECT_SUFFIX;
    const options = Array.from(rowCtl(fly, 'Fill Style').querySelector('select').querySelectorAll('option'));
    const dead = options.filter((o) => o.value !== 'ladder' && o.value !== 'none' && !M.isMono(o.value));
    const alive = options.filter((o) => !dead.includes(o));
    expect(dead.length).toBeGreaterThan(0);
    expect(alive.length).toBeGreaterThan(0);
    dead.forEach((o) => { expect(o.disabled).toBe(true); expect(o.textContent).toContain(NO_EFFECT); });
    alive.forEach((o) => { expect(o.disabled).toBe(false); expect(o.textContent).not.toContain(NO_EFFECT); });
    const notes = Array.from(openFly().querySelectorAll('.ctxbar-fly-note')).map((n) => n.textContent);
    expect(notes).toContain(window.Vectura.SCENE_FILL_STYLES.FACETED_NOTE);
    expect(openFly().querySelector('.ctxbar-fly-note.is-faceted')).toBeTruthy();
  });

  // U12 correction — a DEFAULT solid (buckyball) is more restrictive than
  // box/plane: it additionally exceeds the faceted mono path's front-face
  // budget, so only `none` and `ladder` remain alive, and the note names the
  // face-budget reason, not the plain "no planar support" one.
  test('a default-solid selection is MORE restrictive than box (cap-limited): only none/ladder alive', () => {
    const SOLID = { id: 'obj-1', name: 'Solid', primitive: 'solid', params: { solidType: 'buckyball', radius: 30 }, transform: { x: 0, y: 20, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' };
    const { fly } = openStyle({ objects: [SOLID], styleTable: styleTable({ 'obj-1': { penId: null, mapper: 'hatch', params: {} } }) });
    const options = Array.from(rowCtl(fly, 'Fill Style').querySelector('select').querySelectorAll('option'));
    const alive = options.filter((o) => o.value === 'ladder' || o.value === 'none');
    const dead = options.filter((o) => o.value !== 'ladder' && o.value !== 'none');
    expect(dead.length).toBe(options.length - 2);
    dead.forEach((o) => expect(o.disabled).toBe(true));
    alive.forEach((o) => expect(o.disabled).toBe(false));
    const notes = Array.from(openFly().querySelectorAll('.ctxbar-fly-note')).map((n) => n.textContent);
    expect(notes).toContain(window.Vectura.SCENE_FILL_STYLES.FACETED_CAP_NOTE);
    expect(notes).not.toContain(window.Vectura.SCENE_FILL_STYLES.FACETED_NOTE);
  });

  test('a low-poly solid (dodecahedron) behaves like box, not like the capped default', () => {
    const SOLID = { id: 'obj-1', name: 'Solid', primitive: 'solid', params: { solidType: 'dodecahedron', radius: 30 }, transform: { x: 0, y: 20, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' };
    const { fly } = openStyle({ objects: [SOLID], styleTable: styleTable({ 'obj-1': { penId: null, mapper: 'hatch', params: {} } }) });
    const M = window.Vectura.Scene3D.SurfaceFillMono;
    const options = Array.from(rowCtl(fly, 'Fill Style').querySelector('select').querySelectorAll('option'));
    const dead = options.filter((o) => o.value !== 'ladder' && o.value !== 'none' && !M.isMono(o.value));
    const alive = options.filter((o) => !dead.includes(o));
    expect(dead.length).toBeGreaterThan(0);
    expect(alive.length).toBeGreaterThan(2); // more than just none/ladder — the mono laws are back
    const notes = Array.from(openFly().querySelectorAll('.ctxbar-fly-note')).map((n) => n.textContent);
    expect(notes).toContain(window.Vectura.SCENE_FILL_STYLES.FACETED_NOTE);
    expect(notes).not.toContain(window.Vectura.SCENE_FILL_STYLES.FACETED_CAP_NOTE);
  });

  test('a sphere selection has no disabled options and no faceted note (regression guard)', () => {
    const { fly } = openStyle({ styleTable: styleTable({ 'obj-1': { penId: null, mapper: 'hatch', params: {} } }) });
    const options = Array.from(rowCtl(fly, 'Fill Style').querySelector('select').querySelectorAll('option'));
    options.forEach((o) => expect(o.disabled).toBe(false));
    expect(openFly().querySelector('.ctxbar-fly-note.is-faceted')).toBeNull();
  });

  // ── fs-e1 gating — end to end through the ctxbar surface ──────────────────
  test('item 1 — a box selection with Type=Contour disables EVERY option, including None/Ladder, and shows the off-axis note', () => {
    const BOX = { id: 'obj-1', name: 'Box', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 }, transform: { x: 0, y: 20, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' };
    const { fly } = openStyle({ objects: [BOX], styleTable: styleTable({ 'obj-1': { penId: null, mapper: 'contour', params: {} } }) });
    const options = Array.from(rowCtl(fly, 'Fill Style').querySelector('select').querySelectorAll('option'));
    expect(options.length).toBeGreaterThan(0);
    options.forEach((o) => {
      expect(o.disabled).toBe(true);
      expect(o.textContent).toContain(F.NO_EFFECT_SUFFIX);
    });
    const notes = Array.from(openFly().querySelectorAll('.ctxbar-fly-note')).map((n) => n.textContent);
    expect(notes).not.toContain(F.FACETED_NOTE);
    expect(notes).not.toContain(F.FACETED_CAP_NOTE);
    expect(notes.some((t) => t && t.length > 0 && t !== F.LIBRARY_NOTE)).toBe(true);
  });

  // Paired negative — the SAME box, still on Type=Hatch, keeps its live laws
  // (over-gating guard: item 1's fix must not bleed into the hatch case).
  test('item 1 negative — the same box with Type=Hatch still offers its live laws (regression guard)', () => {
    const BOX = { id: 'obj-1', name: 'Box', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 }, transform: { x: 0, y: 20, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' };
    const { fly } = openStyle({ objects: [BOX], styleTable: styleTable({ 'obj-1': { penId: null, mapper: 'hatch', params: {} } }) });
    const options = Array.from(rowCtl(fly, 'Fill Style').querySelector('select').querySelectorAll('option'));
    const alive = options.filter((o) => !o.disabled);
    expect(alive.length).toBeGreaterThan(2);
  });

  // STALE ASSERTION UPDATE (W-03) — used to pin exactly the 9 mono laws;
  // W-03 widened the spiral/stipple gate to inert-OR-bare-centreline (F-03).
  // STALE ASSERTION UPDATE (U1) — fineLadder/phaseFineLadder are folded into
  // ladder's rungMode sub-control and no longer appear as their own row; see
  // the in-test comment below.
  test('item 5 — a sphere selection with Type=Spiral disables all but none/ladder (still reachable through ladder\'s own sub-control) (W-03)', () => {
    const SPHERE = { id: 'obj-1', name: 'Sphere', primitive: 'sphere', params: { sx: 40, sy: 40, sz: 40, detail: 16 }, transform: { x: 0, y: 20, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' };
    const { fly } = openStyle({ objects: [SPHERE], styleTable: styleTable({ 'obj-1': { penId: null, mapper: 'spiral', params: {} } }) });
    const R = window.Vectura.SCENE3D_TONE_LAWS;
    const roster = R.IDS;
    const CURVED_SPIRAL_STIPPLE_LIVE = new Set(['none', 'fineLadder', 'phaseFineLadder']);
    const CURVED_SPIRAL_STIPPLE_INERT = roster
      .filter((id) => !CURVED_SPIRAL_STIPPLE_LIVE.has(id))
      // Fill-roster collapse — a folded id (e.g. perceptualRamp, U1) is no
      // longer its OWN <option> at all (it is reachable only through its
      // survivor's sub-control), so it cannot appear in the rendered
      // select's disabled list either way. Filter the reference set down
      // to ids the picker still offers as their own row before comparing.
      .filter((id) => !R.ALIASES[id]);
    const options = Array.from(rowCtl(fly, 'Fill Style').querySelector('select').querySelectorAll('option'));
    const dead = options.filter((o) => o.disabled).map((o) => o.value);
    expect(dead.sort()).toEqual([...CURVED_SPIRAL_STIPPLE_INERT].sort());
    const laddOpt = options.find((o) => o.value === 'ladder');
    expect(laddOpt.disabled).toBe(false);
    // STALE ASSERTION UPDATE (U1, fill-roster collapse) — fineLadder and
    // phaseFineLadder are no longer their own flat <option>s (folded into
    // ladder's rungMode sub-control, ALIASES filter above already proves
    // it), so there is no <option value="fineLadder"> to assert disabled on
    // any more. They are still genuinely LIVE/distinguishable here — a user
    // reaches them via ladder + rungMode:'fine'/'finePhase', and
    // Params.resolveToneLaw still returns the exact legacy internal id for
    // that pair (proved byte-identical in
    // tests/unit/scene3d-tone-law-collapse.test.js's U1 describe block) —
    // this test only pins the FLAT PICKER row, which the fold correctly
    // shrank to one ('ladder'). The rungMode sub-control does not yet carry
    // its own per-option reachability annotation on spiral/stipple (it
    // would need a UI-file change, out of scope for this data-only unit —
    // flagged in docs/3d-audit/lane-reports/U1-U5-impl.md).
    expect(options.find((o) => o.value === 'fineLadder')).toBeUndefined();
    expect(options.find((o) => o.value === 'phaseFineLadder')).toBeUndefined();
  });

  // ── Item 4 — multi-select must not read only the FIRST object's primitive ─
  describe('item 4 — mixed multi-select fails open on reachability', () => {
    test('a box-first + sphere selection does NOT grey out laws that are live on the sphere', () => {
      const BOX = { id: 'obj-1', name: 'Box', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 }, transform: { x: -40, y: 20, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' };
      const SPHERE = { id: 'obj-2', name: 'Sphere', primitive: 'sphere', params: { sx: 40, sy: 40, sz: 40, detail: 12 }, transform: { x: 40, y: 20, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' };
      const scene = addSelectScene({
        objects: [BOX, SPHERE],
        styleTable: styleTable({
          'obj-1': { penId: null, mapper: 'hatch', params: {} },
          'obj-2': { penId: null, mapper: 'hatch', params: {} },
        }),
      });
      app.renderer.setSceneSelection({ layerId: scene.id, mode: 'object', objectIds: ['obj-1', 'obj-2'], faceKeys: [], edgeKeys: [] });
      CB.restoreState();
      pillByLabel('Style').click();
      const options = Array.from(rowCtl(openFly(), 'Fill Style').querySelector('select').querySelectorAll('option'))
        .filter((o) => o.value !== window.Vectura.CONTEXT_BAR.sceneFlyouts.mixed.sentinel);
      // Fails OPEN: with the primitives disagreeing, nothing is disabled —
      // matching the documented mixed-selection convention (absent primitive
      // context never disables a law it cannot verify).
      options.forEach((o) => expect(o.disabled).toBe(false));
      expect(openFly().querySelector('.ctxbar-fly-note.is-faceted')).toBeNull();
    });

    // Paired negative — TWO boxes (agreeing) must still gate normally; the
    // sceneAgree guard must only fail open on genuine DISAGREEMENT.
    test('a box + box selection (same primitive) still gates normally (agreement is not broken by the guard)', () => {
      const BOX1 = { id: 'obj-1', name: 'Box 1', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 }, transform: { x: -40, y: 20, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' };
      const BOX2 = { id: 'obj-2', name: 'Box 2', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 }, transform: { x: 40, y: 20, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' };
      const scene = addSelectScene({
        objects: [BOX1, BOX2],
        styleTable: styleTable({
          'obj-1': { penId: null, mapper: 'hatch', params: {} },
          'obj-2': { penId: null, mapper: 'hatch', params: {} },
        }),
      });
      app.renderer.setSceneSelection({ layerId: scene.id, mode: 'object', objectIds: ['obj-1', 'obj-2'], faceKeys: [], edgeKeys: [] });
      CB.restoreState();
      pillByLabel('Style').click();
      const options = Array.from(rowCtl(openFly(), 'Fill Style').querySelector('select').querySelectorAll('option'))
        .filter((o) => o.value !== window.Vectura.CONTEXT_BAR.sceneFlyouts.mixed.sentinel);
      const dead = options.filter((o) => o.disabled);
      expect(dead.length).toBeGreaterThan(0);
      expect(openFly().querySelector('.ctxbar-fly-note.is-faceted')).toBeTruthy();
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 3. Surface B — the docked 3D Scene panel's Style tab.
// ══════════════════════════════════════════════════════════════════════════

describe('Fill Style — docked 3D Scene panel', () => {
  let runtime, window, document, F;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    ({ window, document } = runtime);
    F = window.Vectura.SCENE_FILL_STYLES;
  });
  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));
  const mount = (overrides = {}) => {
    const { UI } = window.Vectura;
    const layer = { id: 's3d-fs', type: 'scene3d', name: 'Scene 1', visible: true, penId: 'pen-1', params: fixtureParams(overrides) };
    const ui = { app: { pushHistory: () => {}, regen: () => {} }, storeLayerParams: () => {} };
    const container = document.createElement('div');
    document.body.appendChild(container);
    UI.Scene3DPanel.build(ui, layer, container);
    return { ui, layer, container };
  };
  const clickTab = (c, v) => fire(c.querySelector(`.tab-btn[data-value="${v}"]`), 'click');
  const selectObject = (c, id) => fire(c.querySelector(`.vs3-tree-row[data-object-id="${id}"]`), 'click');
  const stylePage = (c) => c.querySelector('.vs3-page[data-page="style"]');
  const styleRow = (c, label) => Array.from(stylePage(c).querySelectorAll('.vs3-row'))
    .find((r) => r.querySelector('.vs3-lbl') && r.querySelector('.vs3-lbl').textContent === label);
  const openStyle = (overrides) => {
    const m = mount(overrides);
    selectObject(m.container, 'obj-1');
    clickTab(m.container, 'style');
    return m;
  };
  const hatchOn = (params = {}) => ({ styleTable: styleTable({ 'obj-1': { penId: null, mapper: 'hatch', params } }) });

  test('the mapper row is labelled "Type" and a "Fill Style" row follows it', () => {
    const { container } = openStyle(hatchOn());
    expect(styleRow(container, 'Type')).toBeTruthy();
    expect(styleRow(container, 'Mapper')).toBeUndefined();
    expect(styleRow(container, 'Fill Style')).toBeTruthy();
  });

  test('the Fill Style select is grouped by mark class and shows the shipped default', () => {
    const { container } = openStyle(hatchOn());
    const sel = styleRow(container, 'Fill Style').querySelector('select');
    expect(sel.value).toBe('ladder');
    const groups = Array.from(sel.querySelectorAll('optgroup')).map((g) => g.label);
    expect(groups).toEqual(F.groups().map((g) => g.group));
    expect(groups).toContain(F.markClassLabel('cross'));
  });

  test('no Fill Style row on wireframe', () => {
    const { container } = openStyle({ styleTable: styleTable({ 'obj-1': { penId: null, mapper: 'wireframe', params: {} } }) });
    expect(styleRow(container, 'Fill Style')).toBeUndefined();
  });

  test('picking a law writes the full params bag at the CURRENT scope', () => {
    const { container, layer } = openStyle(hatchOn({ fillAngle: 12, fillDensity: 71 }));
    const sel = styleRow(container, 'Fill Style').querySelector('select');
    sel.value = 'mkDotScreen';
    fire(sel, 'change');
    const p = layer.params.styleTable.byObject['obj-1'].params;
    expect(p.toneLaw).toBe('mkDotScreen');
    expect(p.fillAngle).toBe(12);
    expect(p.fillDensity).toBe(71);
  });

  test('THE SCOPE TRAP — a FACE override is edited at face scope, leaving the object alone', () => {
    const m = mount({
      styleTable: styleTable(
        { 'obj-1': { penId: null, mapper: 'hatch', params: { toneLaw: 'etfKang', fillDensity: 55 } } },
        { 'obj-1/f-3': { penId: null, mapper: 'hatch', params: { fillDensity: 40 } } },
      ),
    });
    window.dispatchEvent(new window.CustomEvent('vectura:scene-selection', {
      detail: { layerId: 's3d-fs', mode: 'face', objectIds: ['obj-1'], faceKeys: ['obj-1/f-3'], edgeKeys: [] },
    }));
    clickTab(m.container, 'style');
    expect(stylePage(m.container).querySelector('.vs3-style-scope').textContent).toContain('f-3');

    // The face override predates the control, so it has NO toneLaw. Whole-
    // style-wins means it must show the DEFAULT, not inherit the object's law.
    const sel = styleRow(m.container, 'Fill Style').querySelector('select');
    expect(sel.value).toBe('ladder');

    sel.value = 'mazeFill';
    fire(sel, 'change');
    const t = m.layer.params.styleTable;
    expect(t.byFace['obj-1/f-3'].params.toneLaw).toBe('mazeFill');
    expect(t.byFace['obj-1/f-3'].params.fillDensity).toBe(40);
    // The object's own law is untouched — the write did not leak up a scope.
    expect(t.byObject['obj-1'].params.toneLaw).toBe('etfKang');
    expect(F.resolve(undefined)).toBe('ladder');
  });

  test('CARRY-THROUGH — the law survives a mapper switch (hatch → crosshatch)', () => {
    const { container, layer } = openStyle(hatchOn({ toneLaw: 'etfKang', fillDensity: 55 }));
    const mapSel = styleRow(container, 'Type').querySelector('select');
    mapSel.value = 'crosshatch';
    fire(mapSel, 'change');
    expect(layer.params.styleTable.byObject['obj-1'].params.toneLaw).toBe('etfKang');
  });

  test('the description block prints the mechanism; a library law adds its caveat', () => {
    const { container } = openStyle(hatchOn({ toneLaw: 'voronoiWeb' }));
    const notes = Array.from(stylePage(container).querySelectorAll('.vs3-lawnote')).map((n) => n.textContent);
    expect(notes.join(' ')).toContain('Voronoi');
    expect(stylePage(container).querySelector('.vs3-lawnote.is-caveat')).toBeNull();

    // STALE FIXTURE UPDATE (U4) — 'bundleDither' folded into 'bundleCount';
    // see the identical note on the ctxbar-flyout version of this fixture
    // above. 'bundleSubNib' is LIBRARY-tier, has a real caveat, and is never
    // folded by any cluster in this plan.
    const lib = openStyle(hatchOn({ toneLaw: 'bundleSubNib' }));
    const caveat = stylePage(lib.container).querySelector('.vs3-lawnote.is-caveat');
    expect(caveat).toBeTruthy();
    expect(caveat.textContent.length).toBeGreaterThan(10);
  });

  // fs-m2 Job 2 — the mechanism/strengths/weaknesses paragraph dominated the
  // panel; it now lives behind a compact (i) info affordance revealed on
  // hover OR keyboard focus, while the caveat (a genuinely useful warning)
  // stays OUTSIDE the popover, always visible — relocated, not lost.
  describe('fs-m2 Job 2 — Fill Style description behind an (i) info popover', () => {
    test('an (i) button exists, aria-describedby-linked to a popover holding mechanism/strengths', () => {
      const { container } = openStyle(hatchOn({ toneLaw: 'voronoiWeb' }));
      const btn = stylePage(container).querySelector('.vs3-lawinfo-btn');
      expect(btn).toBeTruthy();
      expect(btn.tagName).toBe('BUTTON');
      expect(btn.getAttribute('aria-label')).toMatch(/\S/);
      const describedId = btn.getAttribute('aria-describedby');
      expect(describedId).toBeTruthy();
      const pop = stylePage(container).querySelector(`#${describedId}`);
      expect(pop).toBeTruthy();
      expect(pop.classList.contains('vs3-lawinfo-pop')).toBe(true);
      expect(pop.getAttribute('role')).toBe('tooltip');
      // The mechanism/strengths text lives INSIDE the popover now, not as a
      // bare top-level paragraph.
      expect(pop.textContent).toContain('Voronoi');
    });

    test('focusing the (i) button opens the popover (keyboard-reachable, not hover-only); blur closes it', () => {
      const { container } = openStyle(hatchOn({ toneLaw: 'voronoiWeb' }));
      const btn = stylePage(container).querySelector('.vs3-lawinfo-btn');
      const pop = stylePage(container).querySelector(`#${btn.getAttribute('aria-describedby')}`);
      expect(pop.classList.contains('is-open')).toBe(false);
      expect(btn.getAttribute('aria-expanded')).toBe('false');
      fire(btn, 'focus');
      expect(pop.classList.contains('is-open')).toBe(true);
      expect(btn.getAttribute('aria-expanded')).toBe('true');
      fire(btn, 'blur');
      expect(pop.classList.contains('is-open')).toBe(false);
      expect(btn.getAttribute('aria-expanded')).toBe('false');
    });

    // STALE FIXTURE UPDATE (U4) — 'bundleDither' folded into 'bundleCount';
    // see the identical note earlier in this file (ctxbar-flyout fixture).
    test('the caveat stays OUTSIDE the popover — reachable without opening the (i)', () => {
      const { container } = openStyle(hatchOn({ toneLaw: 'bundleSubNib' }));
      const page = stylePage(container);
      const caveat = page.querySelector('.vs3-lawnote.is-caveat');
      expect(caveat).toBeTruthy();
      const pop = page.querySelector('.vs3-lawinfo-pop');
      expect(pop.contains(caveat)).toBe(false);
    });
  });

  // fs-y1 Job 1 — the owner asked twice for CLICK to open the info panel; an
  // earlier pass only wired hover/focus. These pin the regression: a click
  // must open it, and — unlike hover — the popover must SURVIVE the pointer
  // leaving the button (a genuine "held open" panel, not a bigger tooltip).
  describe('fs-y1 Job 1 — the (i) is CLICK-driven, not hover-only', () => {
    test('clicking the (i) opens the popover even with no prior hover/focus', () => {
      const { container } = openStyle(hatchOn({ toneLaw: 'voronoiWeb' }));
      const btn = stylePage(container).querySelector('.vs3-lawinfo-btn');
      const pop = stylePage(container).querySelector(`#${btn.getAttribute('aria-describedby')}`);
      expect(pop.classList.contains('is-open')).toBe(false);
      fire(btn, 'click');
      expect(pop.classList.contains('is-open')).toBe(true);
      expect(btn.getAttribute('aria-expanded')).toBe('true');
    });

    test('a click-opened popover stays open after mouseleave/blur (pinned), then a second click closes it', () => {
      const { container } = openStyle(hatchOn({ toneLaw: 'voronoiWeb' }));
      const btn = stylePage(container).querySelector('.vs3-lawinfo-btn');
      const pop = stylePage(container).querySelector(`#${btn.getAttribute('aria-describedby')}`);
      fire(btn, 'click');
      expect(pop.classList.contains('is-open')).toBe(true);
      fire(btn, 'mouseleave');
      fire(btn, 'blur');
      expect(pop.classList.contains('is-open')).toBe(true);
      fire(btn, 'click');
      expect(pop.classList.contains('is-open')).toBe(false);
    });

    test('a click outside the popover closes a pinned-open one', () => {
      const { container } = openStyle(hatchOn({ toneLaw: 'voronoiWeb' }));
      const btn = stylePage(container).querySelector('.vs3-lawinfo-btn');
      const pop = stylePage(container).querySelector(`#${btn.getAttribute('aria-describedby')}`);
      fire(btn, 'click');
      expect(pop.classList.contains('is-open')).toBe(true);
      document.body.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
      expect(pop.classList.contains('is-open')).toBe(false);
    });

    test('Escape un-pins and closes a click-opened popover', () => {
      const { container } = openStyle(hatchOn({ toneLaw: 'voronoiWeb' }));
      const btn = stylePage(container).querySelector('.vs3-lawinfo-btn');
      const pop = stylePage(container).querySelector(`#${btn.getAttribute('aria-describedby')}`);
      fire(btn, 'click');
      expect(pop.classList.contains('is-open')).toBe(true);
      btn.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(pop.classList.contains('is-open')).toBe(false);
    });
  });

  // fs-y1 Job 1 — "for all fill styles": the Shadow tab's own tone-law row is
  // a Fill Style picker too, so it gets the same (i).
  describe('fs-y1 Job 1 — the Shadow tab Fill Style row also carries a click-driven (i)', () => {
    const shadowPage = (c) => c.querySelector('.vs3-page[data-page="scene"]');
    test('an (i) exists beside the shadow Fill Style row and opens its own popover on click', () => {
      const { container } = openStyle(hatchOn({ toneLaw: 'ladder' }));
      const page = shadowPage(container);
      const buttons = Array.from(page.querySelectorAll('.vs3-lawinfo-btn'));
      // At least one belongs to the shadow row (the Style-tab one lives on
      // a different tab page and is not mounted here).
      expect(buttons.length).toBeGreaterThan(0);
      const btn = buttons[buttons.length - 1];
      const pop = page.querySelector(`#${btn.getAttribute('aria-describedby')}`);
      expect(pop.classList.contains('is-open')).toBe(false);
      fire(btn, 'click');
      expect(pop.classList.contains('is-open')).toBe(true);
    });
  });

  // fs-m2 Job 1 — a dropdown pick used to commit through a full re-render
  // that destroyed and replaced the <select> the user just drove, dropping
  // focus to <body> so the next arrow key did nothing (the friction reported
  // when auditioning 48 Fill Style laws by arrowing through them). The FRESH
  // select carrying the same aria-label must end up focused after the
  // rebuild, both for Type and for Fill Style.
  describe('fs-m2 Job 1 — a Select keeps focus across its own rebuild (arrow-key auditioning)', () => {
    test('Type select: after picking a value, the NEW select (post-rebuild) holds focus', () => {
      const { container } = openStyle(hatchOn());
      const mapSel = styleRow(container, 'Type').querySelector('select');
      mapSel.focus();
      mapSel.value = 'crosshatch';
      fire(mapSel, 'change');
      const active = container.ownerDocument.activeElement;
      expect(active.tagName).toBe('SELECT');
      expect(active.getAttribute('aria-label')).toBe('Style mapper');
      // Proves it is genuinely the POST-rebuild element, not a stale
      // reference: the row was torn down and rebuilt, so the DOM node
      // identity changed even though the aria-label did not.
      expect(active).toBe(styleRow(container, 'Type').querySelector('select'));
      expect(active).not.toBe(mapSel);
    });

    test('Fill Style select: after picking a law, the NEW select holds focus', () => {
      const { container } = openStyle(hatchOn({ toneLaw: 'ladder' }));
      const lawSel = styleRow(container, 'Fill Style').querySelector('select');
      lawSel.focus();
      lawSel.value = 'etfKang';
      fire(lawSel, 'change');
      const active = container.ownerDocument.activeElement;
      expect(active.tagName).toBe('SELECT');
      expect(active.getAttribute('aria-label')).toBe(window.Vectura.SCENE_FILL_STYLES.ARIA);
      expect(active).toBe(styleRow(container, 'Fill Style').querySelector('select'));
      expect(active).not.toBe(lawSel);
    });

    test('a Select whose change did NOT come from a focused select is unaffected (no stray focus steal)', () => {
      const { container } = openStyle(hatchOn());
      container.ownerDocument.activeElement && container.ownerDocument.activeElement.blur
        && container.ownerDocument.activeElement.blur();
      const mapSel = styleRow(container, 'Type').querySelector('select');
      // Programmatic change without focusing first (e.g. driven by a test or
      // another surface) must not silently grab focus onto the rebuilt row.
      mapSel.value = 'contour';
      fire(mapSel, 'change');
      expect(container.ownerDocument.activeElement).not.toBe(styleRow(container, 'Type').querySelector('select'));
    });

    // fs-m2 Job 1 (judge correction) — on macOS, a focused CLOSED <select>
    // opens its native listbox on ArrowDown/ArrowUp instead of stepping the
    // value. ArrowDown/ArrowUp must be intercepted so the control steps to
    // the adjacent option and fires 'change' WITHOUT the browser ever
    // deciding to open a popup — jsdom doesn't simulate that native open
    // behavior, but the keydown handler must still preventDefault and step
    // selectedIndex itself so real Chrome/Safari on macOS gets the same
    // outcome as every other platform.
    test('ArrowDown on the Fill Style select steps to the next reachable option and fires change live', () => {
      const { container, layer } = openStyle(hatchOn({ toneLaw: 'ladder' }));
      const lawSel = styleRow(container, 'Fill Style').querySelector('select');
      const opts = Array.from(lawSel.options).filter((o) => !o.disabled).map((o) => o.value);
      const startIdx = opts.indexOf('ladder');
      expect(startIdx).toBeGreaterThanOrEqual(0);
      expect(lawSel.value).toBe('ladder');
      const ev = new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
      lawSel.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(true);
      expect(lawSel.value).toBe(opts[startIdx + 1]);
      expect(layer.params.styleTable.byObject['obj-1'].params.toneLaw).toBe(opts[startIdx + 1]);
    });

    test('ArrowUp steps backward; the keydown handler leaves every other key untouched', () => {
      const { container } = openStyle(hatchOn({ toneLaw: 'ladder' }));
      let lawSel = styleRow(container, 'Fill Style').querySelector('select');
      const opts = Array.from(lawSel.options).filter((o) => !o.disabled).map((o) => o.value);
      const startIdx = opts.indexOf('ladder');
      lawSel.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
      lawSel = styleRow(container, 'Fill Style').querySelector('select');
      const upEv = new window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true });
      lawSel.dispatchEvent(upEv);
      expect(upEv.defaultPrevented).toBe(true);
      expect(lawSel.value).toBe(opts[startIdx]);
      // A non-arrow key (e.g. Enter, used to close the native popup) is
      // never intercepted — type-ahead / open-on-Space stay fully native.
      const enterEv = new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      lawSel.dispatchEvent(enterEv);
      expect(enterEv.defaultPrevented).toBe(false);
    });
  });

  // ── The focused LEAF editors ─────────────────────────────────────────────
  // A scene-tree object3d / booleanGroup3d child routes to its OWN panel, not
  // to the scene editor above. This is what live verification caught: putting
  // the row in MAPPER_CONTROLS alone left the leaf panel — the panel a user
  // actually reaches by selecting a scene object — showing "Mapper" and no
  // Fill Style at all.
  const mountLeaf = (type, style, primitive = 'sphere') => {
    const { UI } = window.Vectura;
    const layer = {
      id: `leaf-${type}`, type, name: 'Leaf', visible: true, parentId: 'grp-1',
      params: {
        primitive, params: primitive === 'box' ? { sx: 40, sy: 40, sz: 40 } : { sx: 40, sy: 40, sz: 40, detail: 16 },
        transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 },
        visibility: 'solid', op: 'subtract', style,
      },
    };
    const ui = { app: { pushHistory: () => {}, regen: () => {} }, storeLayerParams: () => {} };
    const container = document.createElement('div');
    document.body.appendChild(container);
    UI.Scene3DPanel.build(ui, layer, container);
    // The leaf panels build their Style page on tab entry.
    const tab = Array.from(container.querySelectorAll('.tab-btn'))
      .find((b) => b.dataset && b.dataset.value === 'style');
    if (tab) fire(tab, 'click');
    return { layer, container };
  };
  const leafRow = (c, label) => Array.from(c.querySelectorAll('.vs3-row'))
    .find((r) => r.querySelector('.vs3-lbl') && r.querySelector('.vs3-lbl').textContent === label);

  test('the focused object3d LEAF panel says Type and carries a Fill Style row', () => {
    const { container } = mountLeaf('object3d', { penId: null, mapper: 'hatch', params: { fillCurves: true } });
    expect(leafRow(container, 'Type')).toBeTruthy();
    expect(leafRow(container, 'Mapper')).toBeUndefined();
    const sel = leafRow(container, 'Fill Style').querySelector('select');
    expect(sel.value).toBe('ladder');
    expect(Array.from(sel.querySelectorAll('optgroup')).map((g) => g.label))
      .toEqual(F.groups().map((g) => g.group));
  });

  test('the LEAF write lands on the leaf bag — the object-scope write, and the only one that reaches it', () => {
    const { container, layer } = mountLeaf('object3d', { penId: null, mapper: 'hatch', params: { fillCurves: true } });
    const sel = leafRow(container, 'Fill Style').querySelector('select');
    sel.value = 'trochoidLoop';
    fire(sel, 'change');
    expect(layer.params.style.params.toneLaw).toBe('trochoidLoop');
    expect(layer.params.style.params.fillCurves).toBe(true);
  });

  test('the LEAF panel hides the row on wireframe', () => {
    const { container } = mountLeaf('object3d', { penId: null, mapper: 'wireframe', params: {} });
    expect(leafRow(container, 'Fill Style')).toBeUndefined();
  });

  // fs-m2 Job 1 — same focus-retention contract as the scene/object/face
  // editor, on the LEAF surface (the panel a user actually reaches by
  // selecting a scene object).
  test('fs-m2 Job 1 · LEAF Fill Style select keeps focus (on the post-rebuild element) after a pick', () => {
    const { container } = mountLeaf('object3d', { penId: null, mapper: 'hatch', params: {} });
    const sel = leafRow(container, 'Fill Style').querySelector('select');
    sel.focus();
    sel.value = 'trochoidLoop';
    fire(sel, 'change');
    const active = container.ownerDocument.activeElement;
    expect(active.tagName).toBe('SELECT');
    expect(active.getAttribute('aria-label')).toBe(F.ARIA);
    expect(active).toBe(leafRow(container, 'Fill Style').querySelector('select'));
    expect(active).not.toBe(sel);
  });

  test('fs-m2 Job 1 · LEAF Type select keeps focus after a pick', () => {
    const { container } = mountLeaf('object3d', { penId: null, mapper: 'hatch', params: {} });
    const sel = leafRow(container, 'Type').querySelector('select');
    sel.focus();
    sel.value = 'wireframe';
    fire(sel, 'change');
    const active = container.ownerDocument.activeElement;
    expect(active.tagName).toBe('SELECT');
    expect(active.getAttribute('aria-label')).toBe('Fill type');
    expect(active).toBe(leafRow(container, 'Type').querySelector('select'));
  });

  test('the fused booleanGroup3d panel gets Type + Fill Style too', () => {
    const { container, layer } = mountLeaf('booleanGroup3d', { penId: null, mapper: 'hatch', params: {} });
    expect(leafRow(container, 'Type')).toBeTruthy();
    const sel = leafRow(container, 'Fill Style').querySelector('select');
    sel.value = 'mkTick';
    fire(sel, 'change');
    expect(layer.params.style.params.toneLaw).toBe('mkTick');
  });

  // The owner's decision retired the Off/On "Experimental" toggle on the
  // docked panel too (shared config with the ctxbar flyout): no row, no view
  // state, and the 11 previously-demoted laws are unconditionally present.
  test('there is no Experimental/Library row — the select already offers all 11 previously-demoted laws', () => {
    const { container, layer } = openStyle(hatchOn());
    expect(styleRow(container, 'Experimental')).toBeUndefined();
    expect(styleRow(container, 'Library')).toBeUndefined();
    const values = Array.from(styleRow(container, 'Fill Style').querySelector('select').querySelectorAll('option')).map((o) => o.value);
    // Fill-collapse (W-22-24-W-18-plan.md) — see the identical note above.
    window.Vectura.SCENE3D_TONE_LAWS.LIBRARY.forEach((id) => {
      if (window.Vectura.SCENE3D_TONE_LAWS.ALIASES[id]) return;
      expect(values).toContain(id);
    });
    expect(layer.params.styleTable.byObject['obj-1'].params.library).toBeUndefined();
  });

  // ── U12 D1/D2 — faceted reachability on every surface this file covers ────
  test('the scene Style tab disables dead options + shows the faceted note for a box, and not a sphere', () => {
    const BOX = { id: 'obj-1', name: 'Box', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 }, transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' };
    const M = window.Vectura.Scene3D.SurfaceFillMono;
    const boxRun = openStyle({ objects: [BOX], ...hatchOn() });
    const boxSel = styleRow(boxRun.container, 'Fill Style').querySelector('select');
    const boxOpts = Array.from(boxSel.querySelectorAll('option'));
    const dead = boxOpts.filter((o) => o.value !== 'ladder' && o.value !== 'none' && !M.isMono(o.value));
    expect(dead.length).toBeGreaterThan(0);
    dead.forEach((o) => { expect(o.disabled).toBe(true); expect(o.textContent).toContain(F.NO_EFFECT_SUFFIX); });
    expect(stylePage(boxRun.container).querySelector('.vs3-lawnote.is-faceted')).toBeTruthy();

    const sphereRun = openStyle(hatchOn());
    const sphereOpts = Array.from(styleRow(sphereRun.container, 'Fill Style').querySelector('select').querySelectorAll('option'));
    sphereOpts.forEach((o) => expect(o.disabled).toBe(false));
    expect(stylePage(sphereRun.container).querySelector('.vs3-lawnote.is-faceted')).toBeNull();
  });

  test('the focused object3d LEAF panel disables dead options for a box', () => {
    const { container } = mountLeaf('object3d', { penId: null, mapper: 'hatch', params: {} }, 'box');
    const M = window.Vectura.Scene3D.SurfaceFillMono;
    const opts = Array.from(leafRow(container, 'Fill Style').querySelector('select').querySelectorAll('option'));
    const dead = opts.filter((o) => o.value !== 'ladder' && o.value !== 'none' && !M.isMono(o.value));
    expect(dead.length).toBeGreaterThan(0);
    dead.forEach((o) => expect(o.disabled).toBe(true));
    // The note is a sibling of the row (appended to the page host), not a
    // child of the Fill Style row itself.
    expect(container.querySelector('.vs3-lawnote.is-faceted')).toBeTruthy();
  });

  test('the fused booleanGroup3d panel gates reachability by the PRIMARY (first, Solid-role) operand primitive', () => {
    const { UI } = window.Vectura;
    const layer = {
      id: 'leaf-boolreach', type: 'booleanGroup3d', name: 'Leaf', visible: true, parentId: 'grp-1',
      params: { op: 'subtract', visibility: 'solid', style: { penId: null, mapper: 'hatch', params: {} } },
    };
    const primaryChild = { id: 'child-solid', type: 'object3d', params: { primitive: 'box', params: { sx: 40, sy: 40, sz: 40 } } };
    const engine = { getLayerChildren: (id) => (id === layer.id ? [primaryChild] : []) };
    const ui = { app: { pushHistory: () => {}, regen: () => {}, engine }, storeLayerParams: () => {} };
    const container = document.createElement('div');
    document.body.appendChild(container);
    UI.Scene3DPanel.build(ui, layer, container);
    const tab = Array.from(container.querySelectorAll('.tab-btn')).find((b) => b.dataset && b.dataset.value === 'style');
    fire(tab, 'click');
    const M = window.Vectura.Scene3D.SurfaceFillMono;
    const opts = Array.from(leafRow(container, 'Fill Style').querySelector('select').querySelectorAll('option'));
    const dead = opts.filter((o) => o.value !== 'ladder' && o.value !== 'none' && !M.isMono(o.value));
    expect(dead.length).toBeGreaterThan(0);
    dead.forEach((o) => expect(o.disabled).toBe(true));
  });

  // ── fs-e1 gating, item 1 — the docked panel threads `mapper` too ──────────
  test('item 1 — the docked Style tab disables EVERY option (incl. None/Ladder) for a box on Type=Contour', () => {
    const BOX = { id: 'obj-1', name: 'Box', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 }, transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' };
    const run = openStyle({ objects: [BOX], styleTable: styleTable({ 'obj-1': { penId: null, mapper: 'contour', params: {} } }) });
    const opts = Array.from(styleRow(run.container, 'Fill Style').querySelector('select').querySelectorAll('option'));
    expect(opts.length).toBeGreaterThan(0);
    opts.forEach((o) => expect(o.disabled).toBe(true));
    const notes = Array.from(stylePage(run.container).querySelectorAll('.vs3-lawnote')).map((n) => n.textContent);
    expect(notes).not.toContain(F.FACETED_NOTE);
    expect(notes).not.toContain(F.FACETED_CAP_NOTE);
  });

  test('item 1 negative — the same box on Type=Hatch keeps its live laws (regression guard)', () => {
    const BOX = { id: 'obj-1', name: 'Box', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 }, transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' };
    const run = openStyle({ objects: [BOX], ...hatchOn() });
    const opts = Array.from(styleRow(run.container, 'Fill Style').querySelector('select').querySelectorAll('option'));
    const alive = opts.filter((o) => !o.disabled);
    expect(alive.length).toBeGreaterThan(2);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 4. fs-e3 — Fill Style on the shadow's flat hatch (shadow.shadowToneLaw).
//
// An engine agent already wired `shadow.shadowToneLaw` + Shadows.build to
// honor it (tests/unit/scene3d-shadow-tone-law.test.js pins the geometry).
// This batch is the UI: a picker in BOTH surfaces, filtered through
// Shadows.toneLawApplies so it never offers flow/web — the two mark classes
// that would silently redraw as plain hatch under a different name on a
// flat, ground-projected footprint.
//
// UNLIKE the object Style row above, shadow.* lives on the LAYER (the
// `shadow` bag), not per-object — every id in a same-layer selection reads
// the identical value, so there is no "Mixed" state to test here (asserting
// one would pin a UI affordance that can never actually fire, which is
// exactly the defect class this whole batch removes). What both suites below
// verify instead: a 2-object selection resolves to the SAME single value a
// 1-object selection does (no accidental per-object misread), mirroring how
// the Shadow flyout's other scene-wide rows (Mode/Pen/Density/Line/Layers)
// already behave.
// ══════════════════════════════════════════════════════════════════════════

describe('Shadow Fill Style — the shared toneLawApplies filter', () => {
  let runtime, window, F, Shadows;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window } = runtime);
    F = window.Vectura.SCENE_FILL_STYLES;
    Shadows = window.Vectura.Scene3D.Shadows;
  });
  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  // Programmatic sweep — not a spot check — over the FULL offered list (the
  // default entry heading its class + all 47 roster laws — there is no
  // library/experimental tier gate anymore), matching what both UI surfaces
  // actually pass through.
  const offeredIds = () => F.groups(null, null, null)
    .reduce((acc, g) => acc.concat(g.options.map((o) => o.value)), [])
    .filter((id) => Shadows.toneLawApplies(id));

  test('every id the shadow picker groups/filter produces satisfies Shadows.toneLawApplies', () => {
    const ids = offeredIds();
    expect(ids.length).toBeGreaterThan(0);
    ids.forEach((id) => expect(Shadows.toneLawApplies(id)).toBe(true));
  });

  test('no flow or web law is ever offered', () => {
    const ids = offeredIds();
    const FLOW_AND_WEB = ['etfKang', 'defectSplit', 'voronoiWeb', 'mazeFill', 'originSpiral', 'deepFillTSP', 'turingStripe'];
    FLOW_AND_WEB.forEach((id) => expect(ids).not.toContain(id));
  });

  // Self-describing (fs-t1): the old version hardcoded "- 7" for the
  // flow/web mark-class gate. That arithmetic went stale the moment
  // isophoteWidth was narrowed per-id on top of the mark-class gate (making
  // it 8, silently), and again when onePenDown followed (9) — a magic count
  // rots exactly where an exclusion set can grow without anyone touching this
  // assertion. This version derives the expected offered count from the live
  // predicate/mark-class sources instead of restating a number.
  test('the offered count is the full roster + default, minus the flow/web mark-class laws and any per-id narrowing', () => {
    const full = F.groups(null, null, null).reduce((a, g) => a + g.options.length, 0);
    // Fill-roster collapse (W-22-24-W-18-plan.md) — the picker's flat list is
    // PICKER_IDS + the shipped default, not the full 48-id engine vocabulary
    // (unaffected by the collapse). PICKER_IDS === IDS until U1; from U1 on
    // this derived count is the one that actually shrinks, so it is read
    // live rather than restated as "49" (the same self-describing rationale
    // this test's own comment above already applies to the flow/web count).
    const R = window.Vectura.SCENE3D_TONE_LAWS;
    expect(full).toBe(R.PICKER_IDS.length + 1);
    const allIds = F.groups(null, null, null).reduce((acc, g) => acc.concat(g.options.map((o) => o.value)), []);
    // Flow/web is a fact about the roster's own mark-class assignment
    // (independent of shadows.js) — fixed today at 7 ids, verified against
    // the live predicate rather than asserted by name.
    const markClassExcluded = allIds.filter((id) => ['flow', 'web'].includes(F.markClass(id)));
    expect(markClassExcluded.length).toBe(7);
    markClassExcluded.forEach((id) => expect(Shadows.toneLawApplies(id)).toBe(false));
    // Everything else the predicate excludes is per-id narrowing on top of an
    // otherwise-applicable class (isophoteWidth, onePenDown, and whatever
    // follows) — read off the live predicate, not restated as a literal
    // count, so this test does not need to change when that set changes.
    const perIdExcluded = allIds.filter((id) => !markClassExcluded.includes(id) && !Shadows.toneLawApplies(id));
    expect(offeredIds().length).toBe(full - markClassExcluded.length - perIdExcluded.length);
    offeredIds().forEach((id) => expect(Shadows.toneLawApplies(id)).toBe(true));
  });
});

describe('Shadow Fill Style — context-bar Shadow flyout', () => {
  let runtime, window, document, app, CB, F, Shadows;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
    app.maxHistory = 100000;
    CB = window.Vectura.UI.ContextBar;
    F = window.Vectura.SCENE_FILL_STYLES;
    Shadows = window.Vectura.Scene3D.Shadows;
    await nextFrames();
  });
  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  const host = () => CB.getContentHost();
  const addSelectScene = (objectIds, overrides = {}) => {
    app.engine.layers = app.engine.layers.filter((l) => l.type !== 'scene3d');
    const scene = new window.Vectura.Layer(`scene-shfs-${app.engine.layers.length}`, 'scene3d', 'Scene');
    scene.params = { ...scene.params, ...fixtureParams(overrides) };
    app.engine.layers.push(scene);
    app.engine.activeLayerId = scene.id;
    app.engine.generate(scene.id);
    app.renderer.setSelection([scene.id], scene.id);
    app.renderer.setSceneSelection({ layerId: scene.id, mode: 'object', objectIds, faceKeys: [], edgeKeys: [] });
    CB.restoreState();
    return scene;
  };
  const pills = () => Array.from(host().querySelectorAll('.ctxbar-scene-field'));
  const pillByLabel = (t) => pills().find((f) => f.getAttribute('aria-label') === t);
  const openFly = () => document.querySelector('.ctxbar-scene-flyout.is-open');
  const rowCtl = (fly, label) => {
    const row = Array.from(fly.querySelectorAll('.ctxbar-fly-row'))
      .find((r) => (r.querySelector('.ctxbar-fly-label') || {}).textContent === label);
    return row ? row.querySelector('.ctxbar-fly-ctl') : null;
  };
  const openShadow = (objectIds = ['obj-1'], overrides) => {
    const scene = addSelectScene(objectIds, overrides);
    pillByLabel('Shadow').click();
    return { scene, fly: openFly() };
  };
  const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));

  test('a Fill Style row exists beneath Mode, grouped by mark class', () => {
    const { fly } = openShadow();
    const labels = Array.from(fly.querySelectorAll('.ctxbar-fly-label')).map((l) => l.textContent);
    expect(labels.indexOf('Fill Style')).toBe(labels.indexOf('Mode') + 1);
    const sel = rowCtl(fly, 'Fill Style').querySelector('select');
    expect(sel).toBeTruthy();
    const groups = Array.from(sel.querySelectorAll('optgroup')).map((g) => g.label);
    expect(groups).not.toContain(F.markClassLabel('flow'));
    expect(groups).not.toContain(F.markClassLabel('web'));
  });

  test('every option in the rendered select satisfies Shadows.toneLawApplies', () => {
    const { fly } = openShadow();
    const options = Array.from(rowCtl(fly, 'Fill Style').querySelector('select').querySelectorAll('option'));
    expect(options.length).toBeGreaterThan(0);
    options.forEach((o) => expect(Shadows.toneLawApplies(o.value)).toBe(true));
  });

  test('defaults to the shipped default (ladder)', () => {
    const { fly } = openShadow();
    expect(rowCtl(fly, 'Fill Style').querySelector('select').value).toBe('ladder');
  });

  test('the explanatory note about flow/web renders', () => {
    const { fly } = openShadow();
    const notes = Array.from(fly.querySelectorAll('.ctxbar-fly-note')).map((n) => n.textContent);
    expect(notes).toContain(window.Vectura.CONTEXT_BAR.sceneFlyouts.shadow.toneLawNote);
    expect(window.Vectura.CONTEXT_BAR.sceneFlyouts.shadow.toneLawNote).toMatch(/flow/i);
    expect(window.Vectura.CONTEXT_BAR.sceneFlyouts.shadow.toneLawNote).toMatch(/web/i);
  });

  // fs-y1 Job 1 — "for all fill styles": the shadow Fill Style row is a Fill
  // Style picker too, and gets the same click-driven inline (i).
  test('fs-y1 Job 1 — the shadow Fill Style row also carries a click-driven inline (i)', () => {
    const { fly } = openShadow();
    const row = rowCtl(fly, 'Fill Style').parentNode;
    const btn = row.querySelector('.vs3-lawinfo-btn');
    expect(btn).toBeTruthy();
    const box = fly.querySelector(`#${btn.getAttribute('aria-describedby')}`);
    expect(box.classList.contains('is-open')).toBe(false);
    fire(btn, 'click');
    expect(box.classList.contains('is-open')).toBe(true);
    expect(box.parentNode).toBe(fly);
  });

  test('choosing a law writes shadow.shadowToneLaw on the scene layer', () => {
    const { scene, fly } = openShadow();
    const sel = rowCtl(fly, 'Fill Style').querySelector('select');
    sel.value = 'penCross';
    fire(sel, 'change');
    expect(scene.params.shadow.shadowToneLaw).toBe('penCross');
  });

  test('an unknown shadowToneLaw id resolves to the default (ladder), not a blank/invalid select', () => {
    const { fly } = openShadow(['obj-1'], { shadow: { shadowToneLaw: 'not-a-real-law' } });
    expect(rowCtl(fly, 'Fill Style').querySelector('select').value).toBe('ladder');
  });

  // Structural "fails open" proof: shadow.* is scene-wide (the layer's own
  // `shadow` bag), never per-object, so a 2-object selection on the SAME
  // layer must resolve to the identical single value a 1-object selection
  // does — never a false "Mixed" state (which would be an option that can
  // never fire, the exact defect this batch removes).
  test('mixed selection fails open: a 2-object selection shows the same single value, never a phantom Mixed state', () => {
    const single = openShadow(['obj-1'], { shadow: { shadowToneLaw: 'mkTick' } });
    expect(rowCtl(single.fly, 'Fill Style').querySelector('select').value).toBe('mkTick');
    expect(rowCtl(single.fly, 'Fill Style').classList.contains('ctxbar-fly-mixed')).toBe(false);

    const pair = openShadow(['obj-1', 'obj-2'], {
      objects: [
        { id: 'obj-1', name: 'A', primitive: 'sphere', params: { sx: 40, sy: 40, sz: 40, detail: 12 }, transform: { x: -40, y: 20, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' },
        { id: 'obj-2', name: 'B', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 }, transform: { x: 40, y: 20, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' },
      ],
      shadow: { shadowToneLaw: 'mkTick' },
    });
    const ctl = rowCtl(pair.fly, 'Fill Style');
    expect(ctl.querySelector('select').value).toBe('mkTick');
    expect(ctl.classList.contains('ctxbar-fly-mixed')).toBe(false);
    expect(Array.from(ctl.querySelectorAll('option')).map((o) => o.textContent)).not.toContain('Mixed');
  });
});

describe('Shadow Fill Style — docked 3D Scene panel', () => {
  let runtime, window, document, F, Shadows;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    ({ window, document } = runtime);
    F = window.Vectura.SCENE_FILL_STYLES;
    Shadows = window.Vectura.Scene3D.Shadows;
  });
  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));
  const mount = (overrides = {}) => {
    const { UI } = window.Vectura;
    const layer = { id: 's3d-shfs', type: 'scene3d', name: 'Scene 1', visible: true, penId: 'pen-1', params: fixtureParams(overrides) };
    const ui = { app: { pushHistory: () => {}, regen: () => {} }, storeLayerParams: () => {} };
    const container = document.createElement('div');
    document.body.appendChild(container);
    UI.Scene3DPanel.build(ui, layer, container);
    return { ui, layer, container };
  };
  const scenePage = (c) => c.querySelector('.vs3-page[data-page="scene"]');
  const sectionByTitle = (c, title) => Array.from(scenePage(c).querySelectorAll('.sect'))
    .find((s) => (s.querySelector('.sect-hdr-title') || {}).textContent === title) || null;
  const shadowHost = (c) => {
    const s = sectionByTitle(c, 'Shadow');
    return s ? s.querySelector('.vs3-shadow') : null;
  };
  const rowCtl = (host2, label) => {
    const row = Array.from(host2.querySelectorAll('.vs3-row'))
      .find((r) => (r.querySelector('.vs3-lbl') || {}).textContent === label);
    return row ? row.querySelector('.vs3-ctl') : null;
  };

  test('a Fill Style row exists beside the other shadow controls, beneath Mode', () => {
    const { container } = mount();
    const host2 = shadowHost(container);
    expect(host2).toBeTruthy();
    ['Mode', 'Fill Style', 'Follow light', 'Density', 'Pen', 'Line', 'Layers'].forEach((label) => {
      expect(rowCtl(host2, label)).toBeTruthy();
    });
    const labels = Array.from(host2.querySelectorAll('.vs3-lbl')).map((l) => l.textContent);
    expect(labels.indexOf('Fill Style')).toBe(labels.indexOf('Mode') + 1);
  });

  test('every option in the rendered select satisfies Shadows.toneLawApplies; no flow/web group', () => {
    const { container } = mount();
    const sel = rowCtl(shadowHost(container), 'Fill Style').querySelector('select');
    const options = Array.from(sel.querySelectorAll('option'));
    expect(options.length).toBeGreaterThan(0);
    options.forEach((o) => expect(Shadows.toneLawApplies(o.value)).toBe(true));
    const groups = Array.from(sel.querySelectorAll('optgroup')).map((g) => g.label);
    expect(groups).not.toContain(F.markClassLabel('flow'));
    expect(groups).not.toContain(F.markClassLabel('web'));
  });

  test('defaults to the shipped default (ladder)', () => {
    const { container } = mount();
    expect(rowCtl(shadowHost(container), 'Fill Style').querySelector('select').value).toBe('ladder');
  });

  test('the explanatory note about flow/web renders beneath the row', () => {
    const { container } = mount();
    const notes = Array.from(shadowHost(container).querySelectorAll('.vs3-empty')).map((n) => n.textContent);
    expect(notes).toContain(F.SHADOW_NOTE);
    expect(F.SHADOW_NOTE).toMatch(/flow/i);
    expect(F.SHADOW_NOTE).toMatch(/web/i);
  });

  test('choosing a law writes shadow.shadowToneLaw on the layer', () => {
    const { container, layer } = mount();
    const sel = rowCtl(shadowHost(container), 'Fill Style').querySelector('select');
    sel.value = 'mkDotScreen';
    fire(sel, 'change');
    expect(layer.params.shadow.shadowToneLaw).toBe('mkDotScreen');
  });

  test('an unknown shadowToneLaw id resolves to the default (ladder), not a blank/invalid select', () => {
    const { container } = mount({ shadow: { shadowToneLaw: 'not-a-real-law' } });
    expect(rowCtl(shadowHost(container), 'Fill Style').querySelector('select').value).toBe('ladder');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 5. fs-q1 — hide the WHOLE Fill Style row when it would do nothing.
//
// DIAGNOSIS (owner decision, deliberately out of scope to fix properly):
// `toneLaw` is read inside shadows.js's `flat()` closure, but Shadow Layers ON
// routes every caster to the separate zone-anatomy build, which never reads
// it — so with Layers on, EVERY law renders byte-identical geometry. Rather
// than fix that pipeline (large, risky, already-tuned), the control itself is
// hidden whenever it cannot change output, replaced by a short note.
//
// PREDICATE, established empirically (not assumed): `Shadows.
// shadowFillStyleApplies(shadowBag, lights)` — false when every shadow-
// casting light is on the zone-anatomy path, true if at least one is not.
// A light is on that path when `shadowBag.shadowLayers === true` OR the
// light's own `type === 'area'` (shadows.js forces the same soft build for
// an area light regardless of the Layers toggle — verified directly against
// Shadows.build below, not assumed from the toggle alone: an area light with
// the toggle OFF still renders every law byte-identical, and a non-area
// (point) light with the toggle off still renders each law distinctly).
// ══════════════════════════════════════════════════════════════════════════

describe('Shadow Fill Style — Shadows.shadowFillStyleApplies (the inertness predicate itself)', () => {
  let runtime, window, Shadows, HLR, Lighting, defaults;

  const boxObj = (id, x, y, size = 40) => ({
    id, name: id, primitive: 'box', params: { sx: size, sy: size, sz: size },
    transform: { x, y, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
  });
  const BOUNDS = { width: 320, height: 220, penWidth: 0.3 };
  const sPaths = (paths) => paths.filter((pp) => pp.meta && pp.meta.sceneTarget && pp.meta.sceneTarget.regionClass === 'castShadow');
  const geomSignature = (paths) => JSON.stringify(sPaths(paths).map((pp) => pp.map((pt) => [
    Math.round(pt.x * 1000) / 1000, Math.round(pt.y * 1000) / 1000,
  ])));

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    ({ window } = runtime);
    Shadows = window.Vectura.Scene3D.Shadows;
    HLR = window.Vectura.Scene3D.HLR;
    Lighting = window.Vectura.Scene3D.Lighting;
    defaults = window.Vectura.ALGO_DEFAULTS.scene3d;
  });
  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  const buildShadows = (lightRec, shadowBag) => {
    const p = window.Vectura.Scene3D.Params.normalizeParams({
      ...JSON.parse(JSON.stringify(defaults)),
      objects: [boxObj('obj-1', 0, 20, 40)],
      ground: { enabled: true },
      lights: [lightRec],
      camera: { projection: 'orthographic', yaw: 0, pitch: 55, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
      shadow: shadowBag,
    });
    const scene = window.Vectura.Scene3D.Scene.assembleScene(p, BOUNDS);
    const clipper = HLR.createClipper([], { bias: 0.05 });
    const light = p.lights[0];
    const positional = light.type === 'point' || light.type === 'spot' || light.type === 'area';
    const dir = positional ? null : Lighting.lightWorldDir(light);
    const opts = { shadow: p.shadow, light };
    if (positional) opts.lightPosition = light.position;
    return Shadows.build(scene, p, BOUNDS, clipper, dir, opts);
  };

  test('RED PROOF, ground truth — directional light + Layers ON renders every law byte-identical (the bug this batch hides, not fixes)', () => {
    const light = { id: 'sun', type: 'directional', castShadows: true, azimuth: 160, elevation: 45 };
    const a = buildShadows(light, { shadowLayers: true, shadowToneLaw: 'ladder' });
    const b = buildShadows(light, { shadowLayers: true, shadowToneLaw: 'penCross' });
    expect(geomSignature(a)).toBe(geomSignature(b));
    expect(Shadows.shadowFillStyleApplies({ shadowLayers: true }, [light])).toBe(false);
  });

  test('directional light + Layers OFF: the control genuinely works, and the predicate says so', () => {
    const light = { id: 'sun', type: 'directional', castShadows: true, azimuth: 160, elevation: 45 };
    const a = buildShadows(light, { shadowLayers: false, shadowToneLaw: 'ladder' });
    const b = buildShadows(light, { shadowLayers: false, shadowToneLaw: 'penCross' });
    expect(geomSignature(a)).not.toBe(geomSignature(b));
    expect(Shadows.shadowFillStyleApplies({ shadowLayers: false }, [light])).toBe(true);
  });

  test('AREA light forces the inert path even with the Layers TOGGLE off — the known subtlety this batch must not miss', () => {
    const light = { id: 'sun', type: 'area', castShadows: true, position: { x: 120, y: 200, z: 120 }, size: 120, samples: 6 };
    const a = buildShadows(light, { shadowLayers: false, shadowToneLaw: 'ladder' });
    const b = buildShadows(light, { shadowLayers: false, shadowToneLaw: 'penCross' });
    expect(geomSignature(a)).toBe(geomSignature(b));
    expect(Shadows.shadowFillStyleApplies({ shadowLayers: false }, [light])).toBe(false);
  });

  test('PAIRED NEGATIVE — a POINT light (positional, but not area) with Layers off is NOT forced inert: predicate must not over-hide', () => {
    const light = { id: 'p1', type: 'point', castShadows: true, position: { x: 120, y: 200, z: 120 }, range: 400 };
    const a = buildShadows(light, { shadowLayers: false, shadowToneLaw: 'ladder' });
    const b = buildShadows(light, { shadowLayers: false, shadowToneLaw: 'penCross' });
    expect(geomSignature(a)).not.toBe(geomSignature(b));
    expect(Shadows.shadowFillStyleApplies({ shadowLayers: false }, [light])).toBe(true);
  });

  test('no shadow-casting light at all: default to shown (nothing to prove inert)', () => {
    expect(Shadows.shadowFillStyleApplies({ shadowLayers: true }, [])).toBe(true);
    expect(Shadows.shadowFillStyleApplies({ shadowLayers: true }, [{ id: 'a1', type: 'ambient' }])).toBe(true);
  });

  test('a mixed light set is live if ANY caster is not on the zone-anatomy path', () => {
    const area = { id: 'sun', type: 'area' };
    const point = { id: 'p1', type: 'point' };
    expect(Shadows.shadowFillStyleApplies({ shadowLayers: false }, [area, point])).toBe(true);
    expect(Shadows.shadowFillStyleApplies({ shadowLayers: false }, [area])).toBe(false);
  });
});

describe('Shadow Fill Style — hidden whenever inert (context-bar Shadow flyout)', () => {
  let runtime, window, document, app, CB;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
    app.maxHistory = 100000;
    CB = window.Vectura.UI.ContextBar;
    await nextFrames();
  });
  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  const host = () => CB.getContentHost();
  const addSelectScene = (objectIds, overrides = {}) => {
    app.engine.layers = app.engine.layers.filter((l) => l.type !== 'scene3d');
    const scene = new window.Vectura.Layer(`scene-shfs-hide-${app.engine.layers.length}`, 'scene3d', 'Scene');
    scene.params = { ...scene.params, ...fixtureParams(overrides) };
    app.engine.layers.push(scene);
    app.engine.activeLayerId = scene.id;
    app.engine.generate(scene.id);
    app.renderer.setSelection([scene.id], scene.id);
    app.renderer.setSceneSelection({ layerId: scene.id, mode: 'object', objectIds, faceKeys: [], edgeKeys: [] });
    CB.restoreState();
    return scene;
  };
  const pills = () => Array.from(host().querySelectorAll('.ctxbar-scene-field'));
  const pillByLabel = (t) => pills().find((f) => f.getAttribute('aria-label') === t);
  const openFly = () => document.querySelector('.ctxbar-scene-flyout.is-open');
  const rowCtl = (fly, label) => {
    const row = Array.from(fly.querySelectorAll('.ctxbar-fly-row'))
      .find((r) => (r.querySelector('.ctxbar-fly-label') || {}).textContent === label);
    return row ? row.querySelector('.ctxbar-fly-ctl') : null;
  };
  const fillStyleLabelExists = (fly) => Array.from(fly.querySelectorAll('.ctxbar-fly-label')).some((l) => l.textContent === 'Fill Style');
  const notes = (fly) => Array.from(fly.querySelectorAll('.ctxbar-fly-note')).map((n) => n.textContent);
  const openShadow = (objectIds = ['obj-1'], overrides) => {
    const scene = addSelectScene(objectIds, overrides);
    pillByLabel('Shadow').click();
    return { scene, fly: openFly() };
  };
  const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));

  // Paired negative FIRST: confirm the row is present in the default (Layers
  // off, directional light) case, so the tests below prove a genuine hide,
  // not a row that was never rendering.
  test('PAIRED NEGATIVE — Layers off, directional light: row is present and writable (control genuinely works)', () => {
    const { scene, fly } = openShadow();
    expect(fillStyleLabelExists(fly)).toBe(true);
    const sel = rowCtl(fly, 'Fill Style').querySelector('select');
    sel.value = 'penCross';
    fire(sel, 'change');
    expect(scene.params.shadow.shadowToneLaw).toBe('penCross');
  });

  test('RED → GREEN — Layers ON: the Fill Style row is absent, replaced by the inert note', () => {
    const { fly } = openShadow(['obj-1'], { shadow: { shadowLayers: true, shadowToneLaw: 'penCross' } });
    expect(fillStyleLabelExists(fly)).toBe(false);
    expect(notes(fly)).toContain(window.Vectura.CONTEXT_BAR.sceneFlyouts.shadow.toneLawInertNote);
    expect(window.Vectura.CONTEXT_BAR.sceneFlyouts.shadow.toneLawInertNote).toMatch(/layer/i);
  });

  test('an AREA light hides the row even with the Layers TOGGLE left off', () => {
    const { fly } = openShadow(['obj-1'], {
      lights: [{ id: 'sun', type: 'area', position: { x: 120, y: 200, z: 120 }, size: 120, samples: 6, castShadows: true }],
      shadow: { shadowLayers: false },
    });
    expect(fillStyleLabelExists(fly)).toBe(false);
    expect(notes(fly)).toContain(window.Vectura.CONTEXT_BAR.sceneFlyouts.shadow.toneLawInertNote);
  });

  test('a POINT light (positional, non-area) with Layers off does NOT hide the row', () => {
    const { fly } = openShadow(['obj-1'], {
      lights: [{ id: 'p1', type: 'point', position: { x: 120, y: 200, z: 120 }, range: 400, castShadows: true }],
      shadow: { shadowLayers: false },
    });
    expect(fillStyleLabelExists(fly)).toBe(true);
  });

  test('ROUND TRIP — the stored shadowToneLaw survives Layers on → off, unreset', () => {
    const scene = addSelectScene(['obj-1'], { shadow: { shadowLayers: false, shadowToneLaw: 'mkTick' } });
    pillByLabel('Shadow').click();
    const fly = openFly();
    // Pick the law, then drive the REAL Layers seg-ctrl (not a param mutation
    // + restoreState, which closes the flyout) — this also proves the
    // onChange handler live-rebuilds the row rather than only catching up the
    // next time the flyout is reopened.
    const sel = rowCtl(fly, 'Fill Style').querySelector('select');
    expect(sel.value).toBe('mkTick');
    const layersCtl = rowCtl(fly, 'Layers');
    const seg3 = layersCtl.querySelector('.seg-opt[data-value="3"]');
    expect(seg3).toBeTruthy();
    seg3.click();
    expect(fillStyleLabelExists(fly)).toBe(false);
    expect(notes(fly)).toContain(window.Vectura.CONTEXT_BAR.sceneFlyouts.shadow.toneLawInertNote);
    expect(scene.params.shadow.shadowToneLaw).toBe('mkTick');

    const offSeg = rowCtl(fly, 'Layers').querySelector('.seg-opt[data-value="off"]');
    expect(offSeg).toBeTruthy();
    offSeg.click();
    expect(fillStyleLabelExists(fly)).toBe(true);
    expect(rowCtl(fly, 'Fill Style').querySelector('select').value).toBe('mkTick');
    expect(scene.params.shadow.shadowToneLaw).toBe('mkTick');
  });
});

describe('Shadow Fill Style — hidden whenever inert (docked 3D Scene panel)', () => {
  let runtime, window, document;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    ({ window, document } = runtime);
  });
  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  const mount = (overrides = {}) => {
    const { UI } = window.Vectura;
    const layer = { id: 's3d-shfs-hide', type: 'scene3d', name: 'Scene 1', visible: true, penId: 'pen-1', params: fixtureParams(overrides) };
    const ui = { app: { pushHistory: () => {}, regen: () => {} }, storeLayerParams: () => {} };
    const container = document.createElement('div');
    document.body.appendChild(container);
    UI.Scene3DPanel.build(ui, layer, container);
    return { ui, layer, container };
  };
  const scenePage = (c) => c.querySelector('.vs3-page[data-page="scene"]');
  const sectionByTitle = (c, title) => Array.from(scenePage(c).querySelectorAll('.sect'))
    .find((s) => (s.querySelector('.sect-hdr-title') || {}).textContent === title) || null;
  const shadowHost = (c) => {
    const s = sectionByTitle(c, 'Shadow');
    return s ? s.querySelector('.vs3-shadow') : null;
  };
  const rowCtl = (host2, label) => {
    const row = Array.from(host2.querySelectorAll('.vs3-row'))
      .find((r) => (r.querySelector('.vs3-lbl') || {}).textContent === label);
    return row ? row.querySelector('.vs3-ctl') : null;
  };
  const labelExists = (host2, label) => Array.from(host2.querySelectorAll('.vs3-lbl')).some((l) => l.textContent === label);
  const notes = (host2) => Array.from(host2.querySelectorAll('.vs3-empty')).map((n) => n.textContent);
  const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));

  test('PAIRED NEGATIVE — Layers off, directional light (default): row present and writable', () => {
    const { container, layer } = mount();
    const host2 = shadowHost(container);
    expect(labelExists(host2, 'Fill Style')).toBe(true);
    const sel = rowCtl(host2, 'Fill Style').querySelector('select');
    sel.value = 'mkDotScreen';
    fire(sel, 'change');
    expect(layer.params.shadow.shadowToneLaw).toBe('mkDotScreen');
  });

  test('RED → GREEN — Layers ON: row is absent, note explains why', () => {
    const { container } = mount({ shadow: { shadowLayers: true, shadowToneLaw: 'penCross' } });
    const host2 = shadowHost(container);
    expect(labelExists(host2, 'Fill Style')).toBe(false);
    expect(notes(host2)).toContain(window.Vectura.SCENE_FILL_STYLES.SHADOW_LAYERS_NOTE);
    expect(window.Vectura.SCENE_FILL_STYLES.SHADOW_LAYERS_NOTE).toMatch(/layer/i);
  });

  test('an AREA light hides the row with the Layers toggle left off', () => {
    const { container } = mount({
      lights: [{ id: 'sun', type: 'area', position: { x: 120, y: 200, z: 120 }, size: 120, samples: 6, castShadows: true }],
      shadow: { shadowLayers: false },
    });
    const host2 = shadowHost(container);
    expect(labelExists(host2, 'Fill Style')).toBe(false);
    expect(notes(host2)).toContain(window.Vectura.SCENE_FILL_STYLES.SHADOW_LAYERS_NOTE);
  });

  test('a POINT light (non-area) with Layers off does not hide the row', () => {
    const { container } = mount({
      lights: [{ id: 'p1', type: 'point', position: { x: 120, y: 200, z: 120 }, range: 400, castShadows: true }],
      shadow: { shadowLayers: false },
    });
    const host2 = shadowHost(container);
    expect(labelExists(host2, 'Fill Style')).toBe(true);
  });

  test('ROUND TRIP — the stored shadowToneLaw survives Layers on → off, unreset', () => {
    const { container, layer } = mount({ shadow: { shadowLayers: false, shadowToneLaw: 'mkScribble' } });
    let host2 = shadowHost(container);
    expect(rowCtl(host2, 'Fill Style').querySelector('select').value).toBe('mkScribble');

    const layersCtl = rowCtl(host2, 'Layers');
    const onBtn = Array.from(layersCtl.querySelectorAll('button')).find((b) => /^on$/i.test((b.textContent || '').trim()));
    expect(onBtn).toBeTruthy();
    fire(onBtn, 'click');
    host2 = shadowHost(container);
    expect(labelExists(host2, 'Fill Style')).toBe(false);
    expect(layer.params.shadow.shadowToneLaw).toBe('mkScribble');

    const offBtn = Array.from(rowCtl(host2, 'Layers').querySelectorAll('button')).find((b) => /^off$/i.test((b.textContent || '').trim()));
    expect(offBtn).toBeTruthy();
    fire(offBtn, 'click');
    host2 = shadowHost(container);
    expect(labelExists(host2, 'Fill Style')).toBe(true);
    expect(rowCtl(host2, 'Fill Style').querySelector('select').value).toBe('mkScribble');
    expect(layer.params.shadow.shadowToneLaw).toBe('mkScribble');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 5. Unit D (stroke-fill handoff item D) — "Shadows land on objects"
//    (shadow.shadowReceiveOnObjects). Same WHOLE-STYLE-WINS concern as the
//    Fill Style picker above, applied to the shadow bag: `shadow.*` is a
//    plain scene-wide params object (no cascade merge), but a hand-written
//    onChange handler can still silently clobber sibling keys if it ever
//    replaces the bag instead of mutating one field. These tests pin that it
//    does not, on BOTH surfaces, and that the write lands in the correct
//    scope (the scene layer's own `shadow` bag, not a per-object field).
// ══════════════════════════════════════════════════════════════════════════

describe('Shadow — "Shadows land on objects" (context-bar Shadow flyout)', () => {
  let runtime, window, document, app, CB;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
    app.maxHistory = 100000;
    CB = window.Vectura.UI.ContextBar;
    await nextFrames();
  });
  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  const host = () => CB.getContentHost();
  const addSelectScene = (objectIds, overrides = {}) => {
    app.engine.layers = app.engine.layers.filter((l) => l.type !== 'scene3d');
    const scene = new window.Vectura.Layer(`scene-shro-${app.engine.layers.length}`, 'scene3d', 'Scene');
    scene.params = { ...scene.params, ...fixtureParams(overrides) };
    app.engine.layers.push(scene);
    app.engine.activeLayerId = scene.id;
    app.engine.generate(scene.id);
    app.renderer.setSelection([scene.id], scene.id);
    app.renderer.setSceneSelection({ layerId: scene.id, mode: 'object', objectIds, faceKeys: [], edgeKeys: [] });
    CB.restoreState();
    return scene;
  };
  const pills = () => Array.from(host().querySelectorAll('.ctxbar-scene-field'));
  const pillByLabel = (t) => pills().find((f) => f.getAttribute('aria-label') === t);
  const openFly = () => document.querySelector('.ctxbar-scene-flyout.is-open');
  const rowCtl = (fly, label) => {
    const row = Array.from(fly.querySelectorAll('.ctxbar-fly-row'))
      .find((r) => (r.querySelector('.ctxbar-fly-label') || {}).textContent === label);
    return row ? row.querySelector('.ctxbar-fly-ctl') : null;
  };
  const openShadow = (objectIds = ['obj-1'], overrides) => {
    const scene = addSelectScene(objectIds, overrides);
    pillByLabel('Shadow').click();
    return { scene, fly: openFly() };
  };
  const onOffBtn = (ctl, word) => Array.from(ctl.querySelectorAll('button'))
    .find((b) => new RegExp(`^${word}$`, 'i').test((b.textContent || '').trim()));
  const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));

  test('row exists, labelled "Shadows land on objects", defaults Off', () => {
    const { fly } = openShadow();
    const ctl = rowCtl(fly, 'Shadows land on objects');
    expect(ctl).toBeTruthy();
    expect(onOffBtn(ctl, 'off')).toBeTruthy();
    expect(onOffBtn(ctl, 'on')).toBeTruthy();
  });

  test('carries the same click-driven inline (i) as the Fill Style row, with the render-cost blurb', () => {
    const { fly } = openShadow();
    const row = rowCtl(fly, 'Shadows land on objects').parentNode;
    const btn = row.querySelector('.vs3-lawinfo-btn');
    expect(btn).toBeTruthy();
    const box = fly.querySelector(`#${btn.getAttribute('aria-describedby')}`);
    expect(box.classList.contains('is-open')).toBe(false);
    fire(btn, 'click');
    expect(box.classList.contains('is-open')).toBe(true);
    expect(box.textContent).toMatch(/render cost/i);
  });

  test('WHOLE-STYLE-WINS — toggling On writes the correct scope and keeps every sibling shadow key', () => {
    const { scene, fly } = openShadow(['obj-1'], {
      shadow: {
        shadowToneLaw: 'penCross', shadowDensity: 77, shadowMode: 'inverse',
        shadowLineType: 'dashed', shadowAngle: 200,
      },
    });
    const ctl = rowCtl(fly, 'Shadows land on objects');
    fire(onOffBtn(ctl, 'on'), 'click');
    // Correct scope: the scene LAYER's shadow bag (scene-wide), not a
    // per-object field — this is a `shadow.*` write like every sibling row.
    expect(scene.params.shadow.shadowReceiveOnObjects).toBe(true);
    // Every sibling key set up above survives — a whole-bag replace would
    // have reset these to their defaults.
    expect(scene.params.shadow.shadowToneLaw).toBe('penCross');
    expect(scene.params.shadow.shadowDensity).toBe(77);
    expect(scene.params.shadow.shadowMode).toBe('inverse');
    expect(scene.params.shadow.shadowLineType).toBe('dashed');
    expect(scene.params.shadow.shadowAngle).toBe(200);
  });

  test('ROUND TRIP — toggling On then Off again leaves shadowToneLaw untouched throughout', () => {
    const { scene, fly } = openShadow(['obj-1'], { shadow: { shadowToneLaw: 'mkTick', shadowReceiveOnObjects: false } });
    let ctl = rowCtl(fly, 'Shadows land on objects');
    fire(onOffBtn(ctl, 'on'), 'click');
    expect(scene.params.shadow.shadowReceiveOnObjects).toBe(true);
    expect(scene.params.shadow.shadowToneLaw).toBe('mkTick');
    ctl = rowCtl(openFly(), 'Shadows land on objects');
    fire(onOffBtn(ctl, 'off'), 'click');
    expect(scene.params.shadow.shadowReceiveOnObjects).toBe(false);
    expect(scene.params.shadow.shadowToneLaw).toBe('mkTick');
  });
});

describe('Shadow — "Shadows land on objects" (docked 3D Scene panel)', () => {
  let runtime, window, document;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    ({ window, document } = runtime);
  });
  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  const mount = (overrides = {}) => {
    const { UI } = window.Vectura;
    const layer = { id: 's3d-shro', type: 'scene3d', name: 'Scene 1', visible: true, penId: 'pen-1', params: fixtureParams(overrides) };
    const ui = { app: { pushHistory: () => {}, regen: () => {} }, storeLayerParams: () => {} };
    const container = document.createElement('div');
    document.body.appendChild(container);
    UI.Scene3DPanel.build(ui, layer, container);
    return { ui, layer, container };
  };
  const scenePage = (c) => c.querySelector('.vs3-page[data-page="scene"]');
  const sectionByTitle = (c, title) => Array.from(scenePage(c).querySelectorAll('.sect'))
    .find((s) => (s.querySelector('.sect-hdr-title') || {}).textContent === title) || null;
  const shadowHost = (c) => {
    const s = sectionByTitle(c, 'Shadow');
    return s ? s.querySelector('.vs3-shadow') : null;
  };
  const rowCtl = (host2, label) => {
    const row = Array.from(host2.querySelectorAll('.vs3-row'))
      .find((r) => (r.querySelector('.vs3-lbl') || {}).textContent === label);
    return row ? row.querySelector('.vs3-ctl') : null;
  };
  const onOffBtn = (ctl, word) => Array.from(ctl.querySelectorAll('button'))
    .find((b) => new RegExp(`^${word}$`, 'i').test((b.textContent || '').trim()));
  const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));

  test('row exists, labelled "Shadows land on objects", defaults Off', () => {
    const { container } = mount();
    const host2 = shadowHost(container);
    const ctl = rowCtl(host2, 'Shadows land on objects');
    expect(ctl).toBeTruthy();
    expect(onOffBtn(ctl, 'off')).toBeTruthy();
    expect(onOffBtn(ctl, 'on')).toBeTruthy();
  });

  test('carries the same click-driven inline (i) as the Fill Style row, with the render-cost blurb', () => {
    const { container } = mount();
    const host2 = shadowHost(container);
    const row = rowCtl(host2, 'Shadows land on objects').parentNode;
    const btn = row.querySelector('.vs3-lawinfo-btn');
    expect(btn).toBeTruthy();
    fire(btn, 'click');
    const pop = row.querySelector('.vs3-lawinfo-pop.is-open');
    expect(pop).toBeTruthy();
    expect(pop.textContent).toMatch(/render cost/i);
  });

  test('WHOLE-STYLE-WINS — toggling On writes the correct scope (layer.params.shadow) and keeps every sibling key', () => {
    const { container, layer } = mount({
      shadow: {
        shadowToneLaw: 'mkDotScreen', shadowDensity: 63, shadowMode: 'inverse',
        shadowLineType: 'dotted', shadowAngle: 88,
      },
    });
    const host2 = shadowHost(container);
    const ctl = rowCtl(host2, 'Shadows land on objects');
    fire(onOffBtn(ctl, 'on'), 'click');
    expect(layer.params.shadow.shadowReceiveOnObjects).toBe(true);
    expect(layer.params.shadow.shadowToneLaw).toBe('mkDotScreen');
    expect(layer.params.shadow.shadowDensity).toBe(63);
    expect(layer.params.shadow.shadowMode).toBe('inverse');
    expect(layer.params.shadow.shadowLineType).toBe('dotted');
    expect(layer.params.shadow.shadowAngle).toBe(88);
  });

  test('ROUND TRIP — toggling On then Off again leaves shadowToneLaw untouched throughout', () => {
    const { container, layer } = mount({ shadow: { shadowToneLaw: 'mkScribble', shadowReceiveOnObjects: false } });
    let host2 = shadowHost(container);
    fire(onOffBtn(rowCtl(host2, 'Shadows land on objects'), 'on'), 'click');
    expect(layer.params.shadow.shadowReceiveOnObjects).toBe(true);
    expect(layer.params.shadow.shadowToneLaw).toBe('mkScribble');
    host2 = shadowHost(container);
    fire(onOffBtn(rowCtl(host2, 'Shadows land on objects'), 'off'), 'click');
    expect(layer.params.shadow.shadowReceiveOnObjects).toBe(false);
    expect(layer.params.shadow.shadowToneLaw).toBe('mkScribble');
  });
});
