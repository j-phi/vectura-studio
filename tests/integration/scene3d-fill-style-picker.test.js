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

  test('every one of the 47 roster laws has a mark class, and no stray ids', () => {
    expect(R.IDS.length).toBe(47);
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
    expect(opts.length).toBe(R.IDS.length + 1);
    expect(opts.map((o) => o.value)).toContain('ladder');
    // Every one of the 11 previously-demoted laws is present, unconditionally.
    R.LIBRARY.forEach((id) => expect(opts.map((o) => o.value)).toContain(id));
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
      ['sphere', 'pyramid', 'torus', 'cylinder'].forEach((mode) => {
        expect(F.isFaceted(mode)).toBe(false);
        R.IDS.concat(['ladder', 'none']).forEach((id) => {
          expect(F.isReachableOn(id, mode)).toBe(true);
        });
      });
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
      // The measured count from the U12 audit: 37 of 48 do nothing on box
      // (none/ladder/the 9 mono laws are the 11 that remain reachable).
      expect(alive.length).toBe(11);
      expect(dead.length).toBe(37);
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
  // hatch/crosshatch — scene3d.js:1533). And on a CURVED primitive, nine mono
  // laws are byte-identical to Ladder under Type=Spiral/Stipple.
  describe('mapper-aware reachability (fs-e1 gating: item 1 / item 5)', () => {
    const ALL_IDS = () => R.IDS.concat(['ladder']);
    const CURVED_SPIRAL_STIPPLE_INERT = [
      'etfKang', 'defectSplit', 'mezzoRegion', 'originSpiral', 'dutyConst',
      'endShorten', 'turingStripe', 'voronoiWeb', 'mazeFill',
    ];

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

    // ── Item 5 — curved primitive + spiral/stipple: exactly 9 mono laws ─────
    test('curved (sphere) + spiral disables exactly the 9 measured mono laws, and nothing else', () => {
      R.IDS.forEach((id) => {
        const expected = CURVED_SPIRAL_STIPPLE_INERT.indexOf(id) === -1;
        expect(F.isReachableOn(id, 'sphere', undefined, 'spiral')).toBe(expected);
      });
      expect(F.isReachableOn('ladder', 'sphere', undefined, 'spiral')).toBe(true);
      expect(F.isReachableOn('none', 'sphere', undefined, 'spiral')).toBe(true);
    });

    test('curved (sphere) + stipple disables the SAME 9 laws as spiral', () => {
      R.IDS.forEach((id) => {
        const expected = CURVED_SPIRAL_STIPPLE_INERT.indexOf(id) === -1;
        expect(F.isReachableOn(id, 'sphere', undefined, 'stipple')).toBe(expected);
      });
    });

    // ── Paired negative — a curved primitive under hatch/crosshatch is
    // untouched by the new spiral/stipple rule (over-gating guard).
    test('curved (sphere) + hatch/crosshatch is unaffected by the spiral/stipple gate', () => {
      ['hatch', 'crosshatch'].forEach((mapper) => {
        CURVED_SPIRAL_STIPPLE_INERT.forEach((id) => {
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
  const pillByLabel = (t) => pills().find((f) => (f.querySelector('.ctxbar-text-fieldlabel') || {}).textContent === t);
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
    window.Vectura.SCENE3D_TONE_LAWS.LIBRARY.forEach((id) => expect(values).toContain(id));
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

  test('item 5 — a sphere selection with Type=Spiral disables exactly the 9 curved mono laws', () => {
    const SPHERE = { id: 'obj-1', name: 'Sphere', primitive: 'sphere', params: { sx: 40, sy: 40, sz: 40, detail: 16 }, transform: { x: 0, y: 20, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' };
    const { fly } = openStyle({ objects: [SPHERE], styleTable: styleTable({ 'obj-1': { penId: null, mapper: 'spiral', params: {} } }) });
    const CURVED_SPIRAL_STIPPLE_INERT = [
      'etfKang', 'defectSplit', 'mezzoRegion', 'originSpiral', 'dutyConst',
      'endShorten', 'turingStripe', 'voronoiWeb', 'mazeFill',
    ];
    const options = Array.from(rowCtl(fly, 'Fill Style').querySelector('select').querySelectorAll('option'));
    const dead = options.filter((o) => o.disabled).map((o) => o.value);
    expect(dead.sort()).toEqual([...CURVED_SPIRAL_STIPPLE_INERT].sort());
    const laddOpt = options.find((o) => o.value === 'ladder');
    expect(laddOpt.disabled).toBe(false);
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

    const lib = openStyle(hatchOn({ toneLaw: 'bundleDither' }));
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

    test('the caveat stays OUTSIDE the popover — reachable without opening the (i)', () => {
      const { container } = openStyle(hatchOn({ toneLaw: 'bundleDither' }));
      const page = stylePage(container);
      const caveat = page.querySelector('.vs3-lawnote.is-caveat');
      expect(caveat).toBeTruthy();
      const pop = page.querySelector('.vs3-lawinfo-pop');
      expect(pop.contains(caveat)).toBe(false);
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
    window.Vectura.SCENE3D_TONE_LAWS.LIBRARY.forEach((id) => expect(values).toContain(id));
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

  test('the offered count is the full roster + default, minus exactly the 7 flow/web ids', () => {
    const full = F.groups(null, null, null).reduce((a, g) => a + g.options.length, 0);
    expect(full).toBe(48); // default (ladder) + 47 roster laws
    expect(offeredIds().length).toBe(full - 7);
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
  const pillByLabel = (t) => pills().find((f) => (f.querySelector('.ctxbar-text-fieldlabel') || {}).textContent === t);
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
