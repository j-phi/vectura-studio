/**
 * Vectura Studio — Scene 3D surface-locked fills: shared constants.
 *
 * One table for the numbers every surface-lock module reads (contract:
 * docs/surface-lock-contract.md). The modules under src/core/scene3d/surface-lock*.js
 * never carry their own literal for any key below.
 *
 * Nothing here changes a pose-mode render: a style without `markSpace: 'surface'`
 * never reaches a surface-lock module.
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});

  Vectura.SCENE3D_SURFACE_LOCK = Object.freeze({
    // Bumped whenever a baker's output for the same bake key changes. Part of every bake key.
    BAKE_VERSION: 2,
    // Contract §6 — a vertex whose facing cosine c = n·view is below this is culled (crossing interpolated).
    NZ_CULL: 0.08,
    // Contract §5 — the tone look-up table has TONE_LUT_SIZE + 1 entries for I = k / TONE_LUT_SIZE.
    TONE_LUT_SIZE: 256,
    // Contract §2 — octahedral normal quantisation (signed 16-bit per component).
    OCT_SCALE: 32767,
    // Contract §4 — levels per MarkSet: level 0 (lit maximum pitch) plus up to MAX_LEVELS - 1 halvings.
    MAX_LEVELS: 6,
    // Contract §4 — finest baked level reaches the darkest pitch at this multiple of the bake scale
    // (zoom headroom before a re-bake is needed to stay dense).
    ZOOM_HEADROOM: 1.5,
    // Contract §5 (A1) — the plot-floor cap admits a whole density level once its screen pitch is at least this
    // fraction of the floor pitch (the §14.6 bar: no two drawn runs closer than 0.8 x floor).
    PLOT_FLOOR_SLACK: 0.8,
    // Contract §8 — module-level bake cache, least-recently-used by bytes.
    CACHE_MB: 64,
    CACHE_MB_MOBILE: 24,
    // Contract §11 — frame budgets (ms). Perf tests assert counters; these are the generous clocks.
    FRAME_BUDGET_MS: 8,
    BAKE_BUDGET_MS: 400,
    // Contract §4 — a perspective vertex with denom <= NEAR_PLANE_FRAC * focal is behind the near plane (culled);
    // the value Geometry3D.projectPoint clamps at.
    NEAR_PLANE_FRAC: 0.05,
    // Contract §5, §13 — memo sizes for tone LUTs and for the Level S mesh / ground-hatch bakes.
    TONE_LUT_MEMO_ENTRIES: 32,
    AUX_CACHE_ENTRIES: 16,
    // ---- per-module tuning (behaviour-neutral: each value is the literal the module carried before). Each module keeps
    // the same numbers as a safe fallback for when this table is not loaded.
    // surface-lock-ladder.js (hatch, crosshatch, contour, spiral, stipple). Also reads ZOOM_HEADROOM / PLOT_FLOOR_SLACK above.
    LADDER: Object.freeze({
      STEP_MM: 0.5,  // arc length between baked vertices (contract §5: sagitta < 0.004 mm for R >= 10)
      GRID: 25,  // metric survey grid (GRID x GRID cell centres)
      TONE_SUBDIV: 5,  // surface-fill TONE_SUBDIV: the master grid is the user spacing / 5
      GLINT_KEEP: 0.6,  // surface-fill GLINT_KEEP (the glint cap never removes more than 40 %)
      LIT_FLOOR: 0.12,  // surface-fill LIT_FLOOR (lit band never below this coverage)
      THIN_RATIO: 0.95,  // a level is relabelled finer where its local pitch would fall under this x its target
      V_EXTRA: 4,  // extra halvings of coarse rulings kept through a converging region
      MAX_VERTS: 150000,  // vertex budget guard (contract §2: 200k per object per fill group)
      MAX_CELLS: 4096,  // ruling cells per family
      JL_SEED_FRAC: 0.9,  // Jobard-Lefer: a seed must be >= this x dsep from every placed line
      JL_STOP_FRAC: 0.85,  // ... and a line stops when it comes closer than this x dsep
      JL_HASH_DIV: 2.5,  // occupancy points every dsep / 2.5
      JL_MAX_STEPS: 2600,
      FD_EPS: 1 / 65536,  // forward-difference step of the fast sampler
      FD_EDGE: 2e-3,  // within this of a pole / edge the exact metric is used
      GOLDEN: 0.6180339887498949,
      DOT_SEGS: 8,
      DOT_COL_FILL: 0.85,  // dots: finest column spacing is in [0.85, 1.7) x the finest pitch
      DOT_CLEAR: 2.4,  // dots: finest pitch >= 2.4 x the glyph radius (no overlap at the finest level)
    }),
    // surface-lock-mezzo.js (mezzotint). Also reads ZOOM_HEADROOM / PLOT_FLOOR_SLACK above.
    MEZZO: Object.freeze({
      STEP_SCREEN: 0.34,  // surface-fill-mono streamFamily STEP (screen mm); object step = / scaleRef
      STEP_TOL: 2.5,  // stepTo verification tolerance
      STEP_HALVINGS: 5,
      STOP_FACTOR: 0.80,  // a line stops this close (x d_l) to another line
      SEED_FACTOR: 0.95,  // a new line starts at least this far (x d_l) from the others
      MAX_STEPS: 2600,  // per direction
      OWN_SKIP: 1.5,  // same-line points within this arc (x d_l) are not "other lines"
      FIELD_MIN: 0.05,  // |projected direction| below this: the field vanishes, the line ends
      REGION_MIN_MM: 3.0,  // REG = max(REGION_MIN_MM, R * REGION_R_FRAC) / scaleRef
      REGION_R_FRAC: 0.20,
      REGION_MAX: 200,
      REGION_TRIES: 4000,
      REGION_ANGLES: 6,
      REGION_ANGLE_STEP: 30,
      NEIGHBOURS: 14,
      GAIN: 2,
      SEED_ARC_STEPS: 2,  // new seeds along an accepted line every max(d_l, this x STEP)
      MIN_MARK_PEN: 4,  // surface-fill uses 2; 4 drops the 0.6-1.5 mm specks (H5)
      SEP_MARGIN: 0.97,  // declared minSepFrac = STOP_FACTOR x this
      P0_SCALE: 1.2,  // p0 = PMAX x this (O4)
      MAX_LEVELS_LAW: 4,  // cap on the law-floor level count
      INK_SPREAD: 0.12,  // surface-fill INK_SPREAD (private there)
      A_DARK: 0.90,  // makeCtx dark end of the tone map
      CROSS_OBJ_DEG: 65,  // Regions.CROSS_OBJ_DEG fallback
      PLOT_FLOOR_PEN: 2.2,  // Regions.PLOT_FLOOR_PEN fallback
      LIT_MAX_PITCH_PEN: 12,  // Regions.LIT_MAX_PITCH_PEN fallback
      MAX_VERTICES: 200000,  // contract §2 budget per object per fill group
      FALLBACK_PER_AREA: 2,  // fallback candidates per d_l^2 of surface (0.5 left level 1 under-filled once occupancy was dense)
      FALLBACK_MIN: 200,
      FALLBACK_MAX: 5000,
      RANK_FPO_MAX: 6000,  // farthest-point ranking above this many lines falls back to bit reversal
    }),
    // surface-lock-shadow.js (locked ground shadow).
    SHADOW: Object.freeze({
      MIN_ELEVATION_DEG: 2,  // mirror of shadows.js MIN_ELEVATION_DEG (grazing light stretches the footprint to infinity)
      MIN_RUN_MM: 0.6,  // mirror of shadows.js MIN_RUN_MM; applied in WORLD mm so it never flickers under an orbit
      LUT_N: 512,  // tone-gating look-up resolution over t = distContact / L
      SEARCH_ITERS: 26,  // iterations of the ternary / bisection search for the tone-gated sub-interval of one line
      ELLIPSE_SAMPLES: 96,  // ellipse samples used for the throw length L of a sphere footprint
      MAX_LINES: 40000,  // hard cap on baked lines (a 256x ground at a fine pen would otherwise bake millions)
      MIN_PITCH_MM: 0.05,  // the ground hatch never bakes finer than this world pitch (mm)
      MEMO_MAX: 8,  // LRU size of the bake memo (entries are ~tens of kB)
    }),
    // surface-lock-visibility.js (mesh visibility, per-frame outline).
    VISIBILITY: Object.freeze({
      DEPTH_BIAS_MM: 0.05,  // cross-object depth margin (the HLR clipper's HLR_BIAS)
      SELF_BIAS_MM: 6,  // non-convex own-object margin for marks (hlr.js SELF_OCCLUDE_BIAS)
      MAX_CELLS: 512,  // occluder grid, cells per side
      CELL_TRIANGLES: 1,  // grid cell edge in mean triangle extents
      RUN_STEP_MM: 1,  // sample pitch along a run to find visibility changes
      RUN_RESOLUTION_MM: 0.05,  // visibility changes are bisected to this length
      CREASE_ANGLE_DEG: 28,  // Edges.DEFAULT_CREASE_ANGLE
      NEAR_FRACTION: 0.05,  // geometry3d projectPoint near plane: denom <= 0.05 * focal is invalid
      LIMB_SAGITTA_MM: 0.002,  // chord error of the analytic limb polyline
      LIMB_MIN_POINTS: 72,
      LIMB_MAX_POINTS: 1440,
      MIN_TRI_AREA2: 1e-6,  // hlr.js: a footprint below this occludes nothing
      TORUS_ANALYTIC: true,  // Torus self-occlusion through TorusOcclusion (contract §7); false = triangle buffer
      TORUS_GAP_MM: 8,  // algorithms/scene3d.js TORUS_SELF_OCCLUDE_GAP_MM
      TORUS_MARGIN_MM: 1,  // algorithms/scene3d.js TORUS_SELF_OCCLUDE_MARGIN_MM
    }),
  });
})();
