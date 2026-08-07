/* ============================================================================
 * Vectura Studio — 3D Scene panel (Phase 1)
 * ----------------------------------------------------------------------------
 * Bespoke tabbed Scene / Style / Output panel for `scene3d` layers. Replaces
 * the generic control list via the early-return hook in
 * src/ui/panels/algo-config-panel.js (same escape hatch as the Text panel).
 *
 * ── INTEGRATION CONTRACT ───────────────────────────────────────────────────
 *   window.Vectura.UI.Scene3DPanel = { build(ui, layer, container) }
 *   Param-write commit pattern (one undo step per gesture):
 *     ui.app.pushHistory(); mutate layer.params; ui.storeLayerParams(layer);
 *     ui.app.regen(); — fired ONCE per gesture (slider onCommit / click).
 *
 * Selection (CONTRACT D): tree clicks call renderer.setSceneSelection() when
 * the API exists and listen for the window 'vectura:scene-selection' event;
 * absent the API the panel keeps a panel-local selection.
 *
 * Style editing (CONTRACT C): the Style tab resolves the effective style for
 * the current scope via Vectura.Scene3D.StyleCascade and commits via
 * setStyle/clearStyle on layer.params.styleTable.
 *
 * The More… shelf flyout follows the toolbar sub-tool pattern (session-only
 * last-pick memory + icon swap; Decision 3) — the memory lives at module
 * scope so it survives panel rebuilds but never a reload.
 *
 * Every bespoke class is prefixed `vs3-` and styled by the components.css
 * "VECTURA SCENE PANEL" block.
 * ========================================================================== */
(function () {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  Vectura.UI = Vectura.UI || {};

  // ── Primitive catalog ─────────────────────────────────────────────────────
  // Curated shelf + More… flyout entries. Defaults are the CONTRACT A
  // per-primitive params bags (box/sphere fixed by contract; the rest are the
  // panel's Phase 1 curation — 1A's builders read the same keys).
  const svg = (inner) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

  const PRIMITIVES = {
    box: {
      label: 'Box',
      icon: svg('<path d="M12 3 4 7v10l8 4 8-4V7z"/><path d="M4 7l8 4 8-4M12 11v10"/>'),
      defaults: () => ({ sx: 40, sy: 40, sz: 40 }),
    },
    // Curved primitives author the keys 1A's buildPrimitiveMesh actually reads
    // (sphere: radius + detail; the rest: sx/sy/sz + detail). `detail` is the
    // tessellation resolution — high enough that a fresh shape reads as itself,
    // and adjustable per-object via the inspector Fidelity slider.
    sphere: {
      label: 'Sphere',
      icon: svg('<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="9" ry="3.5"/>'),
      defaults: () => ({ radius: 25, detail: 28 }),
    },
    cylinder: {
      label: 'Cylinder',
      icon: svg('<ellipse cx="12" cy="5" rx="7" ry="2.6"/><path d="M5 5v14M19 5v14"/><ellipse cx="12" cy="19" rx="7" ry="2.6"/>'),
      defaults: () => ({ sx: 20, sy: 22, sz: 20, detail: 24 }),
    },
    torus: {
      label: 'Torus',
      icon: svg('<ellipse cx="12" cy="12" rx="9" ry="5.5"/><ellipse cx="12" cy="12" rx="3.6" ry="1.8"/>'),
      defaults: () => ({ sx: 34, sy: 9, sz: 9, detail: 24 }),
    },
    cone: {
      label: 'Cone',
      icon: svg('<path d="M12 3 5 19M12 3l7 16"/><ellipse cx="12" cy="19" rx="7" ry="2.6"/>'),
      defaults: () => ({ sx: 20, sy: 22, sz: 20, detail: 24 }),
    },
    plane: {
      label: 'Plane',
      icon: svg('<path d="M7 6h14l-4 12H3z"/>'),
      defaults: () => ({ sx: 60, sy: 60 }),
    },
    superellipsoid: {
      label: 'Superellipsoid',
      icon: svg('<rect x="4" y="4" width="16" height="16" rx="6"/>'),
      defaults: () => ({ sx: 26, sy: 26, sz: 26, detail: 24 }),
    },
    torusKnot: {
      label: 'Torus Knot',
      icon: svg('<path d="M8.5 5.5c5-2.5 10 1.5 10 6 0 5.5-6.5 8.5-11 6.5-4-1.8-4.5-7.5-1-9.5 3.7-2.1 8 .5 8 4 0 3-3 5-6 4"/>'),
      defaults: () => ({ sx: 30, sy: 6, sz: 6, detail: 28 }),
    },
    capsule: {
      label: 'Capsule',
      icon: svg('<path d="M8 4h8a0 0 0 0 1 0 0v16a0 0 0 0 1 0 0H8a0 0 0 0 1 0 0V4a0 0 0 0 1 0 0z" opacity="0"/><path d="M16 4a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4z" transform="rotate(90 12 12)"/>'),
      defaults: () => ({ sx: 14, sy: 16, sz: 14, detail: 22 }),
    },
    // Convert-to-Scene (I3) — a parametric polyhedron object addable straight
    // from the shelf. Defaults MIRROR engine OBJECT3D_PRIMITIVE_DEFAULTS.solid
    // (scene-consistent radius 20 + INERT deformers), so a freshly added solid
    // renders byte-identically until a deformer / solidType is dialed in. Its
    // solidType + LIVE deformers surface in the object inspector below.
    solid: {
      label: 'Polyhedron',
      icon: svg('<path d="M12 3 4 8v8l8 5 8-5V8z"/><path d="M12 3v18M4 8l8 5 8-5"/>'),
      defaults: () => ({
        solidType: 'buckyball', radius: 20, sideCount: 5, depth: 24, frequency: 2, taper: 55, starRatio: 45,
        expand: 100, twist: 0, explode: 0, extrude: 0, shard: 0,
      }),
    },
  };
  // Primitives whose surface tessellation the Fidelity slider controls (box and
  // plane are flat-faced — subdivision would only add coplanar interior edges).
  const FIDELITY_PRIMS = new Set(['sphere', 'cylinder', 'torus', 'cone', 'superellipsoid', 'torusKnot', 'capsule']);

  // Per-primitive dimension controls, mapped to the param keys 1A's builder
  // reads (sphere: radius; others: sx/sy/sz). `set` allows one control to drive
  // linked keys (e.g. a torus's tube radius is sy AND sz). Labels are the terms
  // a user expects, not the raw axis names.
  const DIM = (label, key, min, max, step, extraKeys) => ({ label, key, min, max, step, extraKeys });
  const DIMENSIONS = {
    box: [DIM('Width', 'sx', 2, 200, 1), DIM('Height', 'sy', 2, 200, 1), DIM('Depth', 'sz', 2, 200, 1)],
    plane: [DIM('Width', 'sx', 2, 300, 1), DIM('Depth', 'sy', 2, 300, 1)],
    sphere: [DIM('Radius', 'radius', 2, 150, 1)],
    cylinder: [DIM('Radius', 'sx', 2, 150, 1, ['sz']), DIM('Height', 'sy', 2, 150, 1)],
    cone: [DIM('Base radius', 'sx', 2, 150, 1, ['sz']), DIM('Height', 'sy', 2, 150, 1)],
    torus: [DIM('Diameter', 'sx', 4, 200, 1), DIM('Thickness', 'sy', 1, 60, 0.5, ['sz'])],
    superellipsoid: [DIM('X', 'sx', 2, 150, 1), DIM('Y', 'sy', 2, 150, 1), DIM('Z', 'sz', 2, 150, 1)],
    torusKnot: [DIM('Radius', 'sx', 6, 150, 1), DIM('Thickness', 'sy', 1, 40, 0.5, ['sz'])],
    capsule: [DIM('Radius', 'sx', 2, 100, 1, ['sz']), DIM('Length', 'sy', 2, 150, 1)],
    // Solid (I3) — one Radius handle; the standalone polyhedron radius range.
    solid: [DIM('Radius', 'radius', 20, 130, 1)],
  };
  const SHELF_PRIMS = ['box', 'sphere', 'cylinder', 'torus', 'cone', 'plane'];
  const MORE_PRIMS = ['superellipsoid', 'torusKnot', 'capsule', 'solid'];

  // Convert-to-Scene (I3) — solidType families + LIVE deformers surfaced in the
  // object inspector for a `solid`. Option values mirror Scene3D.Params solid
  // types and the standalone polyhedron control ranges/labels (controls-registry
  // .js) so the scene inspector matches the standalone UX. `importedMesh` is
  // intentionally omitted (the scene panel has no STL import affordance yet; a
  // converted importedMesh solid keeps its baked mesh regardless). bulge /
  // faceBands are line-art-only (I2) and are NOT exposed — they do nothing to
  // the solid mesh.
  const SOLID_TYPE_OPTIONS = [
    { value: 'flatPolygon', label: 'Flat Polygon' },
    { value: 'prism', label: 'Prism' },
    { value: 'antiprism', label: 'Antiprism' },
    { value: 'bipyramid', label: 'Bipyramid' },
    { value: 'cone', label: 'Cone' },
    { value: 'frustum', label: 'Frustum' },
    { value: 'cupola', label: 'Cupola' },
    { value: 'starPrism', label: 'Star Prism' },
    { value: 'tetrahedron', label: 'Tetrahedron' },
    { value: 'cube', label: 'Cube' },
    { value: 'octahedron', label: 'Octahedron' },
    { value: 'dodecahedron', label: 'Dodecahedron' },
    { value: 'icosahedron', label: 'Icosahedron' },
    { value: 'geodesic', label: 'Geodesic' },
    { value: 'goldberg', label: 'Goldberg' },
    { value: 'buckyball', label: 'Buckyball' },
  ];
  const SOLID_TYPE_VALUES = new Set(SOLID_TYPE_OPTIONS.map((o) => o.value));
  const SOLID_DEFORMERS = [
    { key: 'expand', label: 'Expand', min: 50, max: 180, step: 1, default: 100 },
    { key: 'twist', label: 'Twist', min: -180, max: 180, step: 1, default: 0 },
    { key: 'explode', label: 'Explode', min: 0, max: 46, step: 0.5, default: 0 },
    { key: 'extrude', label: 'Extrude', min: 0, max: 40, step: 0.5, default: 0 },
    { key: 'shard', label: 'Shard', min: 0, max: 100, step: 1, default: 0 },
  ];

  const ICON_IMPORT = svg('<path d="M12 3v10M8.5 9.5 12 13l3.5-3.5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>');
  const ICON_LIGHT = svg('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 1 3.6 10.8c-.7.6-1.1 1.3-1.1 2.2h-5c0-.9-.4-1.6-1.1-2.2A6 6 0 0 1 12 3z"/>');
  const ICON_MORE = svg('<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>');

  const MAPPERS = [
    { value: 'none', label: 'None' },
    { value: 'wireframe', label: 'Wireframe' },
    { value: 'hatch', label: 'Hatch' },
    { value: 'crosshatch', label: 'Crosshatch' },
    { value: 'contour', label: 'Contour' },
    { value: 'spiral', label: 'Spiral' },
    { value: 'stipple', label: 'Stipple' },
    { value: 'contourSlice', label: 'Slices' },
  ];
  const HATCH_DEFAULTS = { fillAngle: 45, fillDensity: 50 };
  const SLICE_VIS_OPTS = [
    { value: 'visibleOnly', label: 'Visible' },
    { value: 'fullContour', label: 'Full' },
  ];
  // Mappers that expose a Density; the rest (wireframe) publish only their own
  // controls. FILL_MAPPERS additionally get the shared Line block + stroke tuning.
  const FILL_MAPPERS = new Set(['hatch', 'crosshatch', 'contour', 'spiral', 'stipple']);
  const LINE_TYPE_OPTIONS = [
    { value: 'solid', label: 'Solid' },
    { value: 'dashed', label: 'Dashed' },
    { value: 'dotted', label: 'Dotted' },
    { value: 'dashdot', label: 'Dash-dot' },
  ];
  const STROKE_DEFAULTS = { lineType: 'solid', dashScale: 1, wobble: 0, wobbleScale: 6, overstroke: false };
  // Phase 4 — highlight (specular band) treatment options.
  const HIGHLIGHT_TREATMENT_OPTIONS = [
    { value: 'blank', label: 'Blank' },
    { value: 'keep', label: 'Keep' },
    { value: 'dashed', label: 'Dashed' },
    { value: 'dotted', label: 'Dotted' },
    { value: 'sparse', label: 'Sparse' },
    { value: 'altFill', label: 'Alt fill' },
    { value: 'burst', label: 'Burst' },
    { value: 'stippleOut', label: 'Stipple' },
  ];
  const ALT_FILL_MAPPER_OPTIONS = [
    { value: 'stipple', label: 'Stipple' }, { value: 'hatch', label: 'Hatch' },
    { value: 'crosshatch', label: 'Crosshatch' }, { value: 'contour', label: 'Contour' },
    { value: 'spiral', label: 'Spiral' },
  ];

  // ── MAPPER_CONTROLS (Phase 2) ───────────────────────────────────────────────
  // The single source of truth for each mapper's OWN parameter controls. A
  // descriptor is { key, kind, label, ariaLabel?, min, max, step, default,
  // options?, seed? }. `kind` ∈ slider | dial | seg | select | toggle | multi.
  // renderStyle iterates the current mapper's descriptors and renders the right
  // control (wired to the one-undo-per-gesture commit path); mapperDefaults seeds
  // every descriptor default (except `seed:false` keys, whose ABSENCE is
  // meaningful — auto-fit eccentricity, derived dot size, density-derived contour
  // step). This replaces the old per-mapper if-tree. The shared Line block +
  // x-ray block stay separate (they apply across mappers / object visibility).
  const ANGLE_REF_OPTS = [
    { value: 'face', label: 'Face' },
    { value: 'screen', label: 'Screen' },
    { value: 'worldUp', label: 'Up' },
  ];
  const DOT_SHAPE_OPTS = [
    { value: 'dot', label: 'Dot' }, { value: 'ring', label: 'Ring' },
    { value: 'cross', label: 'Cross' }, { value: 'plus', label: 'Plus' }, { value: 'tick', label: 'Tick' },
  ];
  const EDGE_CLASS_OPTS = [
    { value: 'silhouette', label: 'Sil' }, { value: 'boundary', label: 'Bound' },
    { value: 'crease', label: 'Crease' }, { value: 'interior', label: 'Interior' },
  ];
  const D_ANGLE = { key: 'fillAngle', kind: 'dial', label: 'Angle', ariaLabel: 'Hatch angle', min: 0, max: 360, step: 1, default: 45 };
  const D_DENSITY = { key: 'fillDensity', kind: 'slider', label: 'Density', ariaLabel: 'Fill density', min: 1, max: 100, step: 1, default: 50 };
  const D_ANGLEREF = { key: 'angleRef', kind: 'seg', label: 'Angle ref', ariaLabel: 'Hatch angle reference', default: 'face', options: ANGLE_REF_OPTS };
  const D_LINKFILL = { key: 'linkFill', kind: 'toggle', label: 'Link fill', ariaLabel: 'Connect scanlines (boustrophedon)', default: false };
  const MAPPER_CONTROLS = {
    hatch: [D_ANGLE, D_DENSITY, D_ANGLEREF, D_LINKFILL],
    crosshatch: [
      D_ANGLE, D_DENSITY, D_ANGLEREF, D_LINKFILL,
      { key: 'crossAngleDelta', kind: 'dial', label: 'Cross angle', ariaLabel: 'Crosshatch angle delta', min: 10, max: 170, step: 1, default: 90 },
      { key: 'crossDensityRatio', kind: 'slider', label: 'Cross density', ariaLabel: 'Second family density ratio', min: 0.25, max: 2, step: 0.05, default: 1 },
      { key: 'tripleHatch', kind: 'toggle', label: 'Triple hatch', ariaLabel: 'Triple hatch in darkest band', default: false },
    ],
    contour: [
      D_DENSITY,
      { key: 'contourStyle', kind: 'seg', label: 'Style', ariaLabel: 'Contour style', default: 'surface', options: [{ value: 'surface', label: 'Surface' }, { value: 'region', label: 'Region' }] },
    ],
    spiral: [
      D_DENSITY,
      { key: 'spiralAngleOffset', kind: 'dial', label: 'Angle offset', ariaLabel: 'Spiral start angle', min: 0, max: 360, step: 1, default: 0 },
      { key: 'spiralEccentricity', kind: 'slider', label: 'Eccentricity', ariaLabel: 'Spiral eccentricity', min: 0.3, max: 3, step: 0.05, default: 1, seed: false },
      { key: 'spiralCenter', kind: 'seg', label: 'Centre', ariaLabel: 'Spiral centre', default: 'centroid', options: [{ value: 'centroid', label: 'Centroid' }, { value: 'bboxCenter', label: 'Bounds' }] },
      { key: 'axisSnap', kind: 'toggle', label: 'Axis snap', ariaLabel: 'Squared spiral', default: false },
      { key: 'spiralMode', kind: 'seg', label: 'Mode', ariaLabel: 'Spiral mode', default: 'surfaceHelix', options: [{ value: 'surfaceHelix', label: 'Surface' }, { value: 'flatClip', label: 'Flat' }] },
    ],
    stipple: [
      D_DENSITY,
      { key: 'dotShape', kind: 'select', label: 'Dot', ariaLabel: 'Dot shape', default: 'dot', options: DOT_SHAPE_OPTS },
      { key: 'dotSize', kind: 'slider', label: 'Dot size', ariaLabel: 'Dot size', min: 0.1, max: 3, step: 0.05, default: 0.7, seed: false },
      { key: 'stippleJitter', kind: 'slider', label: 'Jitter', ariaLabel: 'Stipple jitter', min: 0, max: 100, step: 1, default: 40 },
      { key: 'dotAngle', kind: 'dial', label: 'Dot angle', ariaLabel: 'Dot mark angle', min: 0, max: 360, step: 1, default: 0 },
    ],
    wireframe: [
      { key: 'edgeClasses', kind: 'multi', label: 'Edges', ariaLabel: 'Wireframe edge classes', options: EDGE_CLASS_OPTS, default: { silhouette: true, boundary: true, crease: true, interior: true } },
      { key: 'showHidden', kind: 'toggle', label: 'Show hidden', ariaLabel: 'Dashed occluded edges', default: false },
    ],
    // CtS I5 — depth-slice ('contourSlice') controls: how many cross-section
    // planes, their orientation, and whether back-facing rings are dropped.
    contourSlice: [
      { key: 'sliceCount', kind: 'slider', label: 'Slices', ariaLabel: 'Slice plane count', min: 2, max: 120, step: 1, default: 26 },
      { key: 'sliceVisibility', kind: 'seg', label: 'Show', ariaLabel: 'Slice visibility', default: 'visibleOnly', options: SLICE_VIS_OPTS },
      { key: 'sliceRotate', kind: 'dial', label: 'Rotate', ariaLabel: 'Slice plane rotate', min: -360, max: 360, step: 1, default: 0 },
      { key: 'sliceTilt', kind: 'dial', label: 'Tilt', ariaLabel: 'Slice plane tilt', min: -180, max: 180, step: 1, default: 0 },
    ],
  };
  const carry = (cur, key, dflt) => (cur[key] !== undefined && cur[key] !== null ? cur[key] : dflt);
  const cloneDefault = (d) => (d && typeof d === 'object' ? JSON.parse(JSON.stringify(d)) : d);
  // Params a mapper is seeded with when selected. Every descriptor default is
  // seeded (carrying the user's current value where present) so switching
  // hatch→contour→stipple keeps the shared Density/Angle/line tuning; `seed:false`
  // keys are intentionally left ABSENT (auto/derived). FILL_MAPPERS also carry the
  // shared stroke treatment. This is driven entirely by MAPPER_CONTROLS.
  const mapperDefaults = (mapper, current) => {
    const cur = current || {};
    const descs = MAPPER_CONTROLS[mapper];
    if (!descs) return {};
    const out = {};
    descs.forEach((d) => { if (d.seed !== false) out[d.key] = carry(cur, d.key, cloneDefault(d.default)); });
    if (FILL_MAPPERS.has(mapper)) {
      Object.keys(STROKE_DEFAULTS).forEach((k) => { out[k] = carry(cur, k, STROKE_DEFAULTS[k]); });
    }
    return out;
  };

  // Session-only last-pick memory for the More… flyout (Decision 3). Module
  // scope: survives panel rebuilds/layer switches, resets on reload.
  let moreLastPick = null;

  let CURRENT = null;
  // Set per build; tears the active panel down if its root has been detached
  // (host rebuilt the pane for a non-scene layer without calling destroy).
  let teardownIfDetached = null;

  // Canonical deep clone (Redundancy-1 PR 4). Resolved lazily so the panel
  // survives any script-order shuffle around src/core/utils.js.
  const clone = (obj) => Vectura.Utils.clone(obj);
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  // ════════════════════════════════════════════════════════════════════════
  // Scene-tree Increment D — focused per-LAYER panels.
  // The layers-panel owns the scene TREE now, so a selected object3d /
  // booleanGroup3d CHILD routes here to a compact editor keyed to THAT layer's
  // OWN params (not params.objects[i]). The shared module catalogs (PRIMITIVES /
  // DIMENSIONS / FIDELITY_PRIMS / MAPPERS) drive the controls, and the same
  // one-undo-per-gesture commit pattern the main panel uses.
  // ════════════════════════════════════════════════════════════════════════

  // The one-undo-per-gesture commit + live-slider pattern, bound to a layer.
  const mkCommitKit = (ui, layer) => {
    const pushHist = () => { try { ui.app && ui.app.pushHistory && ui.app.pushHistory(); } catch (_) { /* */ } };
    const store = () => { try { ui.storeLayerParams && ui.storeLayerParams(layer); } catch (_) { /* */ } };
    const regen = () => { try { ui.app && ui.app.regen && ui.app.regen(); } catch (_) { /* */ } };
    const regenDraft = () => { try { ui.app && ui.app.regen && ui.app.regen({ preview: true }); } catch (_) { /* */ } };
    const commit = (mutate) => { pushHist(); mutate(); store(); regen(); };
    const liveSlider = (apply) => {
      const g = { active: false, raf: 0 };
      const hasRaf = typeof requestAnimationFrame === 'function';
      const flushDraft = () => {
        if (g.raf) return;
        g.raf = hasRaf
          ? requestAnimationFrame(() => { g.raf = 0; store(); regenDraft(); })
          : setTimeout(() => { g.raf = 0; store(); regenDraft(); }, 16);
      };
      return {
        onChange: (v) => { if (!g.active) { pushHist(); g.active = true; } apply(v); flushDraft(); },
        onCommit: (v) => {
          if (g.raf) { if (hasRaf) cancelAnimationFrame(g.raf); else clearTimeout(g.raf); g.raf = 0; }
          if (!g.active) pushHist();
          apply(v); store(); regen(); g.active = false;
        },
      };
    };
    return { commit, liveSlider };
  };

  // Walk up to the owning scene GROUP (type 'scene3d' + isGroup) of a child.
  const sceneGroupOf = (ui, layer) => {
    const engine = ui.app && ui.app.engine;
    if (!engine || !engine.getLayerById) return null;
    const seen = new Set();
    let p = layer;
    while (p && p.parentId && !seen.has(p.id)) {
      seen.add(p.id);
      p = engine.getLayerById(p.parentId);
      if (p && p.type === 'scene3d' && p.isGroup) return p;
    }
    return null;
  };

  // Mirror the selected child object to the renderer's scene selection so the
  // on-canvas transform gizmo + selection overlay follow the panel (panel→canvas
  // sync). Object3d picks target the object; a booleanGroup3d selects nothing on
  // canvas (its fused result has no single object id).
  const mirrorChildToCanvas = (ui, layer, objectId) => {
    const r = ui.app && ui.app.renderer;
    const group = sceneGroupOf(ui, layer);
    if (!r || !group || typeof r.setSceneSelection !== 'function') return;
    try {
      if (objectId) r.setSceneSelection({ layerId: group.id, mode: 'object', objectIds: [objectId], faceKeys: [], edgeKeys: [] }, { silent: true });
      else r.setSceneSelection(null, { silent: true });
    } catch (_) { /* non-DOM */ }
  };

  const labeledRow = (host, label) => {
    const row = document.createElement('div');
    row.className = 'vs3-row';
    const lbl = document.createElement('label');
    lbl.className = 'vs3-lbl';
    lbl.textContent = label;
    row.appendChild(lbl);
    const ctl = document.createElement('div');
    ctl.className = 'vs3-ctl';
    row.appendChild(ctl);
    host.appendChild(row);
    return ctl;
  };

  // Compact panel for one object3d LEAF layer — Inspector (dims / transform /
  // fidelity / visibility / role) + Style, re-keyed to layer.params.
  const buildObjectPanel = (ui, layer, container) => {
    const UI = Vectura.UI;
    const params = layer.params || (layer.params = {});
    if (!params.transform || typeof params.transform !== 'object') {
      params.transform = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 };
    }
    if (!params.params || typeof params.params !== 'object') params.params = {};
    if (!params.style || typeof params.style !== 'object') params.style = { penId: null, mapper: 'wireframe', params: {} };
    const { commit, liveSlider } = mkCommitKit(ui, layer);
    const engine = ui.app && ui.app.engine;
    const parent = layer.parentId && engine && engine.getLayerById ? engine.getLayerById(layer.parentId) : null;
    const inBoolean = !!(parent && parent.type === 'booleanGroup3d');

    const comps = [];
    const destroyComps = () => { comps.forEach((c) => { try { c.destroy && c.destroy(); } catch (_) { /* */ } }); comps.length = 0; };

    const root = document.createElement('div');
    root.className = 'vs3-panel';
    container.appendChild(root);
    const pages = {};
    const makePage = (name) => { const el = document.createElement('div'); el.className = 'vs3-page'; el.dataset.page = name; pages[name] = el; return el; };
    const tabs = UI.Tabs(root, {
      tabs: [{ value: 'object', label: 'Object' }, { value: 'style', label: 'Style' }],
      active: 'object',
      ariaLabel: '3D Object panel tabs',
      onChange: (v) => {
        Object.keys(pages).forEach((k) => pages[k].classList.toggle('active', k === v));
        if (v === 'style') renderStyle(); else renderObject();
      },
    });
    root.appendChild(makePage('object'));
    root.appendChild(makePage('style'));
    pages.object.classList.add('active');

    const t = params.transform;
    const prim = params.primitive || 'box';
    const primDefaults = (PRIMITIVES[prim] && PRIMITIVES[prim].defaults()) || {};

    const slider = (host, label, props) => { comps.push(UI.Slider(labeledRow(host, label), props)); };

    let renderObject = () => {};
    renderObject = () => {
      destroyComps();
      pages.object.textContent = '';
      const host = pages.object;

      // Name → layer.name (the tree label).
      const nameCtl = labeledRow(host, 'Name');
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'vs3-name-input';
      nameInput.value = layer.name || '';
      nameInput.setAttribute('aria-label', 'Object name');
      nameInput.addEventListener('change', () => {
        const next = nameInput.value.trim();
        if (next && next !== layer.name) { commit(() => { layer.name = next; }); try { ui.renderLayers && ui.renderLayers(); } catch (_) { /* */ } }
        else nameInput.value = layer.name || '';
      });
      nameCtl.appendChild(nameInput);

      // Role — only meaningful inside a boolean group (solid / hole).
      if (inBoolean) {
        comps.push(UI.SegCtrl(labeledRow(host, 'Role'), {
          options: [{ value: 'solid', label: 'Solid' }, { value: 'hole', label: 'Hole' }],
          value: params.role === 'hole' ? 'hole' : 'solid',
          ariaLabel: 'CSG role (solid or hole)',
          onChange: (v) => { commit(() => { params.role = v; }); },
        }));
      }

      // Position
      ['x', 'y', 'z'].forEach((ax) => {
        slider(host, `${ax.toUpperCase()} (mm)`, {
          value: Number.isFinite(t[ax]) ? t[ax] : 0, min: -200, max: 200, step: 0.5, defaultValue: 0,
          ariaLabel: `Position ${ax.toUpperCase()} (mm)`,
          ...liveSlider((v) => { params.transform[ax] = v; }),
        });
      });
      // Rotation
      [['yaw', 'Yaw'], ['pitch', 'Pitch'], ['roll', 'Roll']].forEach(([ax, lbl]) => {
        slider(host, lbl, {
          value: Number.isFinite(t[ax]) ? t[ax] : 0, min: -180, max: 180, step: 1, defaultValue: 0,
          ariaLabel: `${lbl} (degrees)`,
          ...liveSlider((v) => { params.transform[ax] = v; }),
        });
      });
      // Uniform scale
      slider(host, 'Scale', {
        value: Number.isFinite(t.scale) ? t.scale : 1, min: 0.1, max: 5, step: 0.05, defaultValue: 1,
        ariaLabel: 'Uniform scale',
        ...liveSlider((v) => { params.transform.scale = v; delete params.transform.sx; delete params.transform.sy; delete params.transform.sz; }),
      });

      // Dimensions (per-primitive)
      const dims = DIMENSIONS[prim];
      if (dims && dims.length) {
        const fallbackFor = (key) => (key === 'radius' ? 25 : 30);
        dims.forEach((d) => {
          slider(host, d.label, {
            value: Number.isFinite(params.params[d.key]) ? params.params[d.key] : fallbackFor(d.key),
            min: d.min, max: d.max, step: d.step,
            defaultValue: Number.isFinite(primDefaults[d.key]) ? primDefaults[d.key] : fallbackFor(d.key),
            ariaLabel: `${prim} ${d.label.toLowerCase()}`,
            ...liveSlider((v) => { params.params[d.key] = v; if (Array.isArray(d.extraKeys)) d.extraKeys.forEach((k) => { params.params[k] = v; }); }),
          });
        });
      }
      // Fidelity
      if (FIDELITY_PRIMS.has(prim)) {
        slider(host, 'Fidelity', {
          value: Number.isFinite(params.params.detail) ? params.params.detail : 24, min: 6, max: 48, step: 1,
          defaultValue: Number.isFinite(primDefaults.detail) ? primDefaults.detail : 24,
          ariaLabel: 'Surface fidelity (tessellation detail)',
          ...liveSlider((v) => { params.params.detail = Math.round(v); }),
        });
      }

      // Solid (parametric polyhedron) — solidType family + the 5 LIVE deformers
      // (I3). Gated to `solid` objects only. Edits ride the same commit /
      // liveSlider recompute path as every other object3d param (pushHistory →
      // mutate → store → regen), so createSolidMesh re-evaluates the mesh live.
      // bulge / faceBands are line-art-only (I2) and are intentionally absent.
      if (prim === 'solid') {
        comps.push(UI.Select(labeledRow(host, 'Solid type'), {
          options: SOLID_TYPE_OPTIONS,
          value: SOLID_TYPE_VALUES.has(params.params.solidType) ? params.params.solidType : 'buckyball',
          ariaLabel: 'Solid type',
          onChange: (v) => { commit(() => { params.params.solidType = v; }); },
        }));
        SOLID_DEFORMERS.forEach((d) => {
          slider(host, d.label, {
            value: Number.isFinite(params.params[d.key]) ? params.params[d.key] : d.default,
            min: d.min, max: d.max, step: d.step, defaultValue: d.default,
            ariaLabel: `solid ${d.key}`,
            ...liveSlider((v) => { params.params[d.key] = v; }),
          });
        });
      }

      // Visibility
      comps.push(UI.SegCtrl(labeledRow(host, 'Visibility'), {
        options: [{ value: 'solid', label: 'Solid' }, { value: 'xray', label: 'X-ray' }],
        value: params.visibility === 'xray' ? 'xray' : 'solid',
        ariaLabel: 'Object visibility',
        onChange: (v) => { commit(() => { params.visibility = v; }); },
      }));

      // Cast shadow (Auto / On / Off)
      const castVal = params.shadow && params.shadow.enabled === false ? 'off'
        : (params.shadow && params.shadow.enabled === true ? 'on' : 'inherit');
      comps.push(UI.SegCtrl(labeledRow(host, 'Cast shadow'), {
        options: [{ value: 'inherit', label: 'Auto' }, { value: 'on', label: 'On' }, { value: 'off', label: 'Off' }],
        value: castVal,
        ariaLabel: 'Object casts shadow',
        onChange: (v) => {
          commit(() => {
            if (!params.shadow || typeof params.shadow !== 'object') params.shadow = { enabled: null };
            params.shadow.enabled = v === 'on' ? true : (v === 'off' ? false : null);
          });
        },
      }));
    };

    let renderStyle = () => {};
    renderStyle = () => {
      destroyComps();
      pages.style.textContent = '';
      const host = pages.style;
      const style = params.style;
      const pens = (Vectura.SETTINGS && Array.isArray(Vectura.SETTINGS.pens)) ? Vectura.SETTINGS.pens : [];
      comps.push(UI.Select(labeledRow(host, 'Pen'), {
        options: [{ value: '', label: 'Layer pen' }].concat(pens.map((p) => ({ value: p.id, label: p.name || p.id }))),
        value: style.penId || '',
        ariaLabel: 'Style pen',
        onChange: (v) => { commit(() => { style.penId = v || null; }); },
      }));
      comps.push(UI.Select(labeledRow(host, 'Mapper'), {
        options: MAPPERS,
        value: style.mapper || 'wireframe',
        ariaLabel: 'Style mapper',
        onChange: (v) => { commit(() => { style.mapper = v; if (!style.params || typeof style.params !== 'object') style.params = {}; }); renderStyle(); },
      }));
      if (FILL_MAPPERS.has(style.mapper)) {
        if (!style.params || typeof style.params !== 'object') style.params = {};
        slider(host, 'Density', {
          value: Number.isFinite(style.params.fillDensity) ? style.params.fillDensity : 50, min: 5, max: 100, step: 1, defaultValue: 50,
          ariaLabel: 'Fill density',
          ...liveSlider((v) => { style.params.fillDensity = Math.round(v); }),
        });
        slider(host, 'Angle', {
          value: Number.isFinite(style.params.fillAngle) ? style.params.fillAngle : 45, min: 0, max: 180, step: 1, defaultValue: 45,
          ariaLabel: 'Fill angle',
          ...liveSlider((v) => { style.params.fillAngle = Math.round(v); }),
        });
      }
      // CtS I5 — depth-slice ('contourSlice') controls on a converted/native
      // topoform-contours object: slice count, visibility, and plane orientation.
      if (style.mapper === 'contourSlice') {
        if (!style.params || typeof style.params !== 'object') style.params = {};
        slider(host, 'Slices', {
          value: Number.isFinite(style.params.sliceCount) ? style.params.sliceCount : 26,
          min: 2, max: 120, step: 1, defaultValue: 26, ariaLabel: 'Slice plane count',
          ...liveSlider((v) => { style.params.sliceCount = Math.round(v); }),
        });
        comps.push(UI.SegCtrl(labeledRow(host, 'Show'), {
          options: SLICE_VIS_OPTS,
          value: style.params.sliceVisibility === 'fullContour' ? 'fullContour' : 'visibleOnly',
          ariaLabel: 'Slice visibility',
          onChange: (v) => { commit(() => { style.params.sliceVisibility = v; }); },
        }));
        slider(host, 'Rotate', {
          value: Number.isFinite(style.params.sliceRotate) ? style.params.sliceRotate : 0,
          min: -360, max: 360, step: 1, defaultValue: 0, ariaLabel: 'Slice plane rotate',
          ...liveSlider((v) => { style.params.sliceRotate = Math.round(v); }),
        });
        slider(host, 'Tilt', {
          value: Number.isFinite(style.params.sliceTilt) ? style.params.sliceTilt : 0,
          min: -180, max: 180, step: 1, defaultValue: 0, ariaLabel: 'Slice plane tilt',
          ...liveSlider((v) => { style.params.sliceTilt = Math.round(v); }),
        });
      }

      // ── Edge Styles override (Polish P-B) — this object's OWN edge classes.
      // Each row defaults to "Inherit (scene)"; switching a class to Override
      // writes params.edgeStyles[cls] (a per-object map, same shape as the scene
      // table) so the compositor resolves objectOverride[cls] ?? scene[cls]. An
      // object with no overrides keeps NO edgeStyles key ⇒ byte-identical render.
      renderObjectEdgeStyles(host);
    };

    // Per-object EdgeStyle override editor. Kept as its own function so renderStyle
    // stays legible; mounts onto the Style tab host beneath the mapper controls.
    const OBJ_EDGE_CLASSES = [
      { key: 'silhouette', label: 'Silhouette' },
      { key: 'crease', label: 'Crease' },
      { key: 'boundary', label: 'Boundary' },
      { key: 'interior', label: 'Interior' },
      { key: 'hidden', label: 'Hidden' },
    ];
    const OBJ_DASH_OPTS = [
      { value: 'none', label: 'Solid' },
      { value: 'dashed', label: 'Dashed' },
      { value: 'dotted', label: 'Dotted' },
    ];
    const OBJ_DASH_PATTERNS = { dashed: [3, 2], dotted: [0.6, 1.6] };
    const objDashName = (arr) => {
      if (!Array.isArray(arr) || !arr.length) return 'none';
      return (arr.length === 2 && arr[0] <= 1) ? 'dotted' : 'dashed';
    };
    const renderObjectEdgeStyles = (host) => {
      const pens = (Vectura.SETTINGS && Array.isArray(Vectura.SETTINGS.pens)) ? Vectura.SETTINGS.pens : [];
      // A present class = an override; ABSENT = inherit the scene default.
      const table = () => (params.edgeStyles && typeof params.edgeStyles === 'object') ? params.edgeStyles : null;
      const has = (cls) => { const t = table(); return !!(t && t[cls] && typeof t[cls] === 'object'); };
      const readEdge = (cls) => {
        const t = table();
        const es = (t && t[cls] && typeof t[cls] === 'object') ? t[cls] : {};
        return {
          pen: typeof es.pen === 'string' ? es.pen : null,
          weightMm: es.weightMm == null ? null : es.weightMm,
          dash: Array.isArray(es.dash) ? es.dash : null,
          hiddenTreatment: es.hiddenTreatment === 'dash' ? 'dash' : 'drop',
        };
      };
      const setOverride = (cls, on) => {
        commit(() => {
          if (on) {
            if (!params.edgeStyles || typeof params.edgeStyles !== 'object') params.edgeStyles = {};
            const seed = { pen: null, weightMm: null, dash: null };
            if (cls === 'hidden') seed.hiddenTreatment = 'drop';
            params.edgeStyles[cls] = seed;
          } else if (params.edgeStyles && typeof params.edgeStyles === 'object') {
            delete params.edgeStyles[cls];
            if (!Object.keys(params.edgeStyles).length) delete params.edgeStyles;
          }
        });
        renderStyle();
      };
      const writeEdge = (cls, patch) => {
        commit(() => {
          if (!params.edgeStyles || typeof params.edgeStyles !== 'object') params.edgeStyles = {};
          const cur = (params.edgeStyles[cls] && typeof params.edgeStyles[cls] === 'object') ? params.edgeStyles[cls] : {};
          params.edgeStyles[cls] = { ...cur, ...patch };
        });
        renderStyle();
      };

      const esHdr = document.createElement('div');
      esHdr.className = 'vs3-hl-hdr';
      esHdr.textContent = 'Edge Styles';
      host.appendChild(esHdr);

      OBJ_EDGE_CLASSES.forEach(({ key, label }) => {
        const overridden = has(key);
        comps.push(UI.SegCtrl(labeledRow(host, label), {
          options: [{ value: 'inherit', label: 'Inherit (scene)' }, { value: 'override', label: 'Override' }],
          value: overridden ? 'override' : 'inherit',
          ariaLabel: `${label} edge style source`,
          onChange: (v) => setOverride(key, v === 'override'),
        }));
        if (!overridden) return;
        const cur = readEdge(key);
        comps.push(UI.Select(labeledRow(host, 'Pen'), {
          options: [{ value: '', label: 'Inherit' }].concat(pens.map((pn) => ({ value: pn.id, label: pn.name || pn.id }))),
          value: cur.pen || '',
          ariaLabel: `${label} edge pen`,
          onChange: (val) => writeEdge(key, { pen: val || null }),
        }));
        slider(host, 'Weight', {
          value: cur.weightMm == null ? 0 : cur.weightMm,
          min: 0, max: 2, step: 0.05, defaultValue: 0,
          ariaLabel: `${label} edge weight (0 = inherit)`,
          ...liveSlider((val) => {
            if (!params.edgeStyles || typeof params.edgeStyles !== 'object') params.edgeStyles = {};
            const c = (params.edgeStyles[key] && typeof params.edgeStyles[key] === 'object') ? params.edgeStyles[key] : {};
            params.edgeStyles[key] = { ...c, weightMm: val > 0 ? val : null };
          }),
        });
        comps.push(UI.Select(labeledRow(host, 'Dash'), {
          options: OBJ_DASH_OPTS,
          value: objDashName(cur.dash),
          ariaLabel: `${label} edge dash`,
          onChange: (val) => writeEdge(key, { dash: OBJ_DASH_PATTERNS[val] ? OBJ_DASH_PATTERNS[val].slice() : null }),
        }));
        if (key === 'hidden') {
          comps.push(UI.SegCtrl(labeledRow(host, 'Occluded'), {
            options: [{ value: 'drop', label: 'Drop' }, { value: 'dash', label: 'Dash' }],
            value: cur.hiddenTreatment,
            ariaLabel: 'Hidden edge treatment',
            onChange: (val) => writeEdge('hidden', { hiddenTreatment: val === 'dash' ? 'dash' : 'drop' }),
          }));
        }
      });
    };

    // Render the initial (Object) tab; tab switches render the entered tab.
    renderObject();

    mirrorChildToCanvas(ui, layer, layer.id);

    let destroyed = false;
    const teardown = () => {
      if (destroyed) return; destroyed = true;
      destroyComps();
      try { tabs.destroy(); } catch (_) { /* */ }
      if (root.parentNode) root.parentNode.removeChild(root);
      if (CURRENT === self) CURRENT = null;
    };
    teardownIfDetached = () => { if (!destroyed && root && !root.isConnected) { teardown(); return true; } return destroyed; };
    const self = { layerId: layer.id, destroy: teardown };
    CURRENT = self;
  };

  // Compact panel for one booleanGroup3d GROUP — op selector + fused Style +
  // child-role summary, re-keyed to layer.params.
  const buildBooleanPanel = (ui, layer, container) => {
    const UI = Vectura.UI;
    const params = layer.params || (layer.params = {});
    if (!params.style || typeof params.style !== 'object') params.style = { penId: null, mapper: 'wireframe', params: {} };
    const { commit, liveSlider } = mkCommitKit(ui, layer);
    const engine = ui.app && ui.app.engine;
    const comps = [];
    const destroyComps = () => { comps.forEach((c) => { try { c.destroy && c.destroy(); } catch (_) { /* */ } }); comps.length = 0; };
    const slider = (host, label, props) => { comps.push(UI.Slider(labeledRow(host, label), props)); };

    const root = document.createElement('div');
    root.className = 'vs3-panel';
    container.appendChild(root);
    const pages = {};
    const makePage = (name) => { const el = document.createElement('div'); el.className = 'vs3-page'; el.dataset.page = name; pages[name] = el; return el; };
    const tabs = UI.Tabs(root, {
      tabs: [{ value: 'boolean', label: 'Boolean' }, { value: 'style', label: 'Style' }],
      active: 'boolean',
      ariaLabel: '3D Boolean group panel tabs',
      onChange: (v) => { Object.keys(pages).forEach((k) => pages[k].classList.toggle('active', k === v)); },
    });
    root.appendChild(makePage('boolean'));
    root.appendChild(makePage('style'));
    pages.boolean.classList.add('active');

    // Boolean tab: op + child roles.
    const bHost = pages.boolean;
    comps.push(UI.SegCtrl(labeledRow(bHost, 'Operation'), {
      options: [{ value: 'union', label: 'Union' }, { value: 'subtract', label: 'Subtract' }, { value: 'intersect', label: 'Intersect' }],
      value: ['union', 'subtract', 'intersect'].includes(params.op) ? params.op : 'subtract',
      ariaLabel: 'Boolean operation',
      onChange: (v) => { commit(() => { params.op = v; }); },
    }));
    comps.push(UI.SegCtrl(labeledRow(bHost, 'Visibility'), {
      options: [{ value: 'solid', label: 'Solid' }, { value: 'xray', label: 'X-ray' }],
      value: params.visibility === 'xray' ? 'xray' : 'solid',
      ariaLabel: 'Fused visibility',
      onChange: (v) => { commit(() => { params.visibility = v; }); },
    }));
    const children = (engine && engine.getLayerChildren) ? engine.getLayerChildren(layer.id).filter((c) => c && c.type === 'object3d') : [];
    const note = document.createElement('p');
    note.className = 'vs3-empty';
    note.textContent = children.length
      ? `${children.length} operand${children.length === 1 ? '' : 's'} — edit each in its own row (roles: first Solid, rest Hole).`
      : 'Drag object layers into this group in the Layers panel to add operands.';
    bHost.appendChild(note);

    // Style tab.
    const sHost = pages.style;
    const style = params.style;
    const pens = (Vectura.SETTINGS && Array.isArray(Vectura.SETTINGS.pens)) ? Vectura.SETTINGS.pens : [];
    comps.push(UI.Select(labeledRow(sHost, 'Pen'), {
      options: [{ value: '', label: 'Layer pen' }].concat(pens.map((p) => ({ value: p.id, label: p.name || p.id }))),
      value: style.penId || '',
      ariaLabel: 'Fused style pen',
      onChange: (v) => { commit(() => { style.penId = v || null; }); },
    }));
    comps.push(UI.Select(labeledRow(sHost, 'Mapper'), {
      options: MAPPERS,
      value: style.mapper || 'wireframe',
      ariaLabel: 'Fused style mapper',
      onChange: (v) => { commit(() => { style.mapper = v; if (!style.params || typeof style.params !== 'object') style.params = {}; }); },
    }));

    mirrorChildToCanvas(ui, layer, null);

    let destroyed = false;
    const teardown = () => {
      if (destroyed) return; destroyed = true;
      destroyComps();
      try { tabs.destroy(); } catch (_) { /* */ }
      if (root.parentNode) root.parentNode.removeChild(root);
      if (CURRENT === self) CURRENT = null;
    };
    teardownIfDetached = () => { if (!destroyed && root && !root.isConnected) { teardown(); return true; } return destroyed; };
    const self = { layerId: layer.id, destroy: teardown };
    CURRENT = self;
  };

  // Scene-tree Increment E — compact panel for one sceneLight3d LEAF layer. The
  // child's params ARE one lights[] entry, so this re-keys the EXISTING light
  // controls (azimuth/elevation OR position, range, cone, intensity, cast) to
  // layer.params. The on-canvas 3-axis gizmo arms automatically (the renderer's
  // _sceneLightLayer resolves the selected light child → its scene group).
  const buildLightPanel = (ui, layer, container) => {
    const UI = Vectura.UI;
    const p = layer.params || (layer.params = {});
    const type = typeof p.type === 'string' && p.type ? p.type : 'directional';
    const isAmbient = type === 'ambient';
    const isPoint = type === 'point';
    const isSpot = type === 'spot';
    const isArea = type === 'area';
    const isDir = !isAmbient && !isPoint && !isSpot && !isArea;
    const { commit, liveSlider } = mkCommitKit(ui, layer);
    const comps = [];
    const destroyComps = () => { comps.forEach((c) => { try { c.destroy && c.destroy(); } catch (_) { /* */ } }); comps.length = 0; };
    const root = document.createElement('div');
    root.className = 'vs3-panel';
    container.appendChild(root);
    const host = document.createElement('div');
    host.className = 'vs3-page active';
    root.appendChild(host);

    const slider = (label, props) => { comps.push(UI.Slider(labeledRow(host, label), props)); };
    const vec3 = (field, label, def) => {
      ['x', 'y', 'z'].forEach((axis) => {
        const cur = (p[field] && Number.isFinite(p[field][axis])) ? p[field][axis] : def[axis];
        slider(`${label} ${axis.toUpperCase()}`, {
          value: cur, min: -600, max: 600, step: 1, defaultValue: def[axis],
          ariaLabel: `${label} ${axis.toUpperCase()}`,
          ...liveSlider((v) => {
            if (!p[field] || typeof p[field] !== 'object') p[field] = { ...def };
            p[field][axis] = Math.round(v);
          }),
        });
      });
    };

    const note = document.createElement('p');
    note.className = 'vs3-empty';
    note.textContent = isAmbient
      ? 'Ambient — a constant fill that lifts the shadowed side. Does not cast shadows.'
      : (isDir
        ? 'Sun — drag the on-canvas gizmo to aim it, or use the controls below.'
        : (isArea
          ? 'Area — a soft light: bigger size + more samples = softer shading and shadows. Drag the on-canvas gizmo to move it.'
          : 'Positional light — drag the on-canvas 3-axis gizmo to move it, or use the controls below.'));
    host.appendChild(note);

    if (isDir) {
      slider('Azimuth', { value: Number.isFinite(p.azimuth) ? p.azimuth : 135, min: 0, max: 360, step: 1, defaultValue: 135,
        ariaLabel: 'Light azimuth (degrees)', ...liveSlider((v) => { p.azimuth = Math.round(v); }) });
      slider('Elevation', { value: Number.isFinite(p.elevation) ? p.elevation : 45, min: 0, max: 90, step: 1, defaultValue: 45,
        ariaLabel: 'Light elevation (degrees)', ...liveSlider((v) => { p.elevation = Math.round(v); }) });
    }
    if (isPoint || isSpot || isArea) vec3('position', 'Position', { x: 120, y: 200, z: 120 });
    if (isPoint || isSpot) {
      slider('Range', { value: Number.isFinite(p.range) ? p.range : 400, min: 0, max: 1000, step: 5, defaultValue: 400,
        ariaLabel: 'Light range (0 = infinite)', ...liveSlider((v) => { p.range = Math.round(v); }) });
    }
    if (isArea) {
      slider('Size', { value: Number.isFinite(p.size) ? p.size : 120, min: 10, max: 600, step: 5, defaultValue: 120,
        ariaLabel: 'Area light size', ...liveSlider((v) => { p.size = Math.round(v); }) });
      slider('Samples', { value: Number.isFinite(p.samples) ? p.samples : 6, min: 2, max: 16, step: 1, defaultValue: 6,
        ariaLabel: 'Area light samples', ...liveSlider((v) => { p.samples = Math.round(v); }) });
    }
    if (isSpot) {
      slider('Cone angle', { value: Number.isFinite(p.coneAngle) ? p.coneAngle : 30, min: 1, max: 89, step: 1, defaultValue: 30,
        ariaLabel: 'Spot cone angle (degrees)', ...liveSlider((v) => { p.coneAngle = Math.round(v); }) });
      slider('Penumbra', { value: Number.isFinite(p.penumbra) ? p.penumbra : 8, min: 0, max: 45, step: 1, defaultValue: 8,
        ariaLabel: 'Spot penumbra (degrees)', ...liveSlider((v) => { p.penumbra = Math.round(v); }) });
      vec3('target', 'Target', { x: 0, y: 0, z: 0 });
    }
    slider('Intensity', { value: Number.isFinite(p.intensity) ? p.intensity : (isAmbient ? 0.3 : 1),
      min: 0, max: isAmbient ? 1 : 2, step: 0.05, defaultValue: isAmbient ? 0.3 : 1,
      ariaLabel: 'Light intensity', ...liveSlider((v) => { p.intensity = Math.round(v * 100) / 100; }) });
    if (!isAmbient) {
      comps.push(UI.SegCtrl(labeledRow(host, 'Cast shadows'), {
        options: [{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }],
        value: p.castShadows === false ? 'off' : 'on',
        ariaLabel: 'Cast shadows',
        onChange: (v) => { commit(() => { p.castShadows = v === 'on'; }); },
      }));
    }

    // Arm the on-canvas light gizmo for this child; clear any stale object
    // scene-selection so the object gizmo/overlay don't linger.
    mirrorChildToCanvas(ui, layer, null);

    let destroyed = false;
    const teardown = () => {
      if (destroyed) return; destroyed = true;
      destroyComps();
      if (root.parentNode) root.parentNode.removeChild(root);
      if (CURRENT === self) CURRENT = null;
    };
    teardownIfDetached = () => { if (!destroyed && root && !root.isConnected) { teardown(); return true; } return destroyed; };
    const self = { layerId: layer.id, destroy: teardown };
    CURRENT = self;
  };

  // Scene-tree Increment E — compact panel for one sceneGround3d LEAF layer. The
  // ground currently carries only `enabled`; the row's eye toggle in the Layers
  // panel already hides/shows it, so the panel is a short explainer + an enable
  // toggle for parity with the legacy in-panel ground row.
  const buildGroundPanel = (ui, layer, container) => {
    const UI = Vectura.UI;
    const p = layer.params || (layer.params = {});
    const { commit } = mkCommitKit(ui, layer);
    const comps = [];
    const root = document.createElement('div');
    root.className = 'vs3-panel';
    container.appendChild(root);
    const host = document.createElement('div');
    host.className = 'vs3-page active';
    root.appendChild(host);
    const note = document.createElement('p');
    note.className = 'vs3-empty';
    note.textContent = 'Ground — the floor plane the scene casts shadows onto. Delete this layer (or hide it) to render the scene without a ground.';
    host.appendChild(note);
    comps.push(UI.SegCtrl(labeledRow(host, 'Ground'), {
      options: [{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }],
      value: p.enabled === false ? 'off' : 'on',
      ariaLabel: 'Ground enabled',
      onChange: (v) => { commit(() => { p.enabled = v === 'on'; }); },
    }));

    mirrorChildToCanvas(ui, layer, null);

    let destroyed = false;
    const teardown = () => {
      if (destroyed) return; destroyed = true;
      comps.forEach((c) => { try { c.destroy && c.destroy(); } catch (_) { /* */ } });
      if (root.parentNode) root.parentNode.removeChild(root);
      if (CURRENT === self) CURRENT = null;
    };
    teardownIfDetached = () => { if (!destroyed && root && !root.isConnected) { teardown(); return true; } return destroyed; };
    const self = { layerId: layer.id, destroy: teardown };
    CURRENT = self;
  };

  // ── build ─────────────────────────────────────────────────────────────────
  const build = (ui, layer, container) => {
    if (CURRENT) { try { CURRENT.destroy(); } catch (_) { /* */ } CURRENT = null; }
    // Scene-tree Increment D — route child layers to their focused editors; the
    // scene3d group / monolith continues through the full builder below.
    if (layer.type === 'object3d') { buildObjectPanel(ui, layer, container); return; }
    if (layer.type === 'booleanGroup3d') { buildBooleanPanel(ui, layer, container); return; }
    // Scene-tree Increment E — light / ground child leaves route to their editors.
    if (layer.type === 'sceneLight3d') { buildLightPanel(ui, layer, container); return; }
    if (layer.type === 'sceneGround3d') { buildGroundPanel(ui, layer, container); return; }
    const isSceneGroup = Boolean(layer.isGroup && layer.containerRole === 'scene');

    const UI = Vectura.UI;
    const SC = Vectura.Scene3D && Vectura.Scene3D.StyleCascade;
    const params = layer.params || (layer.params = {});
    // Structural normalization only (idempotent, no history): the panel reads
    // the LAYER's params, never ALGO_DEFAULTS — 1A's defaults may be absent.
    if (!Array.isArray(params.objects)) params.objects = [];

    const ensureStyleTable = () => {
      if (!params.styleTable || typeof params.styleTable !== 'object') {
        params.styleTable = { scene: { penId: null, mapper: 'none', params: {} }, byObject: {}, byFace: {} };
      }
      return params.styleTable;
    };

    // CONTRACT L1 — the single directional sun. Structural normalization only;
    // 2A's normalizeParams also guarantees lights[0], so this is a no-op once
    // the engine has run.
    const ensureLight = () => {
      if (!Array.isArray(params.lights) || !params.lights.length) {
        params.lights = [{ id: 'sun', type: 'directional', azimuth: 135, elevation: 45, castShadows: true }];
      }
      const l = params.lights[0];
      if (!Number.isFinite(l.azimuth)) l.azimuth = 135;
      if (!Number.isFinite(l.elevation)) l.elevation = 45;
      if (typeof l.castShadows !== 'boolean') l.castShadows = true;
      return l;
    };

    // ── Multi-light helpers (G): the scene shades from EVERY light — directional
    // suns (aim + cast shadows) plus ambient fills (a flat lift on the shadowed
    // side, no shadow). Add / select / delete from the scene tree. ─────────────
    const getLights = () => (Array.isArray(params.lights) ? params.lights : (params.lights = []));
    const lightById = (id) => getLights().find((l) => l && l.id === id) || null;
    const lightDisplayName = (light, index) => {
      if (!light) return 'Light';
      if (light.type === 'ambient') return 'Ambient';
      if (light.type === 'point') return `Point ${index + 1}`;
      if (light.type === 'spot') return `Spot ${index + 1}`;
      if (light.type === 'area') return `Area ${index + 1}`;
      if (light.id === 'sun' || index === 0) return 'Sun';
      return `Light ${index + 1}`;
    };
    const nextLightId = () => {
      const used = new Set(getLights().map((l) => l && l.id));
      let n = getLights().length + 1;
      let id = `light-${n}`;
      while (used.has(id)) { n += 1; id = `light-${n}`; }
      return id;
    };
    // Engine (params.js) positional-light defaults, mirrored here so a freshly
    // added light matches normalizeLight before the engine re-runs.
    const seedLight = (type, id) => {
      if (type === 'ambient') return { id, type: 'ambient', intensity: 0.3, castShadows: false };
      if (type === 'point') {
        return { id, type: 'point', position: { x: 120, y: 200, z: 120 }, range: 400, intensity: 1, castShadows: true };
      }
      if (type === 'spot') {
        return {
          id, type: 'spot', position: { x: 120, y: 200, z: 120 }, target: { x: 0, y: 0, z: 0 },
          range: 400, coneAngle: 30, penumbra: 8, intensity: 1, castShadows: true,
        };
      }
      if (type === 'area') {
        return { id, type: 'area', position: { x: 120, y: 200, z: 120 }, size: 120, samples: 6, intensity: 1, castShadows: true };
      }
      return { id, type: 'directional', azimuth: 135, elevation: 45, intensity: 1, castShadows: true };
    };
    const addLight = (type) => {
      let newId = null;
      commit(() => {
        const arr = getLights();
        newId = (type === 'ambient' && !arr.some((l) => l && l.type === 'ambient')) ? 'ambient' : nextLightId();
        arr.push(seedLight(type, newId));
      });
      renderTree();
      if (newId) selectLight(newId);
    };
    const deleteLight = (id) => {
      // I4: a scene may have ZERO lights (remove the sun) — it then shades flat
      // and casts no shadows. Deleting the last light is allowed; the Add-light
      // strip below re-introduces one.
      commit(() => {
        const arr = getLights();
        const idx = arr.findIndex((l) => l && l.id === id);
        if (idx >= 0) arr.splice(idx, 1);
      });
      if (sel.objectId === `light:${id}`) {
        const next = getLights()[0];
        if (next) selectLight(next.id);
        else clearSelection();
      }
      renderTree();
      renderInspector();
    };

    // CONTRACT L3 — light-driven tone bands. 2A owns the schema/normalize in
    // params.js; 2B's editor writes it. Only synthesized when absent so a
    // normalized tone from the engine is never clobbered.
    // Default is internally consistent with the L3 prose (thresholds length =
    // bands-1, ladder length = bands). When 2A's normalizeParams has already
    // populated params.tone, ensureTone leaves it untouched.
    const toneDefault = () => ({
      enabled: true,
      bands: 3,
      thresholds: [0.33, 0.66],
      ladder: [0.2, 0.5, 0.85],
      specular: { enabled: true, size: 1 },
    });
    const toneThresholdsFor = (n) => {
      const out = [];
      for (let i = 1; i < n; i++) out.push(Math.round((i / n) * 100) / 100);
      return out;
    };
    const toneLadderFor = (n) => {
      const out = [];
      for (let i = 0; i < n; i++) out.push(Math.round(((i + 0.5) / n) * 100) / 100);
      return out;
    };
    const ensureTone = () => {
      if (!params.tone || typeof params.tone !== 'object') params.tone = toneDefault();
      const t = params.tone;
      if (typeof t.enabled !== 'boolean') t.enabled = true;
      if (![1, 2, 3, 4].includes(t.bands)) t.bands = 3;
      if (!Array.isArray(t.thresholds)) t.thresholds = toneThresholdsFor(t.bands);
      if (!Array.isArray(t.ladder)) t.ladder = toneLadderFor(t.bands);
      if (!t.specular || typeof t.specular !== 'object') t.specular = { enabled: true, size: 1 };
      if (typeof t.specular.enabled !== 'boolean') t.specular.enabled = true;
      if (!Number.isFinite(t.specular.size)) t.specular.size = 1;
      return t;
    };

    // Phase 5 — scene-level cast-shadow controls. ensureShadow back-fills the bag
    // on the LAYER params (never ALGO_DEFAULTS) so a 1A scene without a shadow
    // block still edits cleanly. Values mirror params.js DEFAULT_SHADOW.
    const shadowDefault = () => ({
      shadowMode: 'additive',
      shadowAngle: 45, shadowDensity: 50, shadowPenId: null, shadowLineType: 'solid',
      shadowLayers: false, shadowLayerCount: 3, shadowFalloff: 0.5, shadowAngleFollowsLight: false,
    });
    const ensureShadow = () => {
      if (!params.shadow || typeof params.shadow !== 'object') params.shadow = shadowDefault();
      const s = params.shadow;
      const d = shadowDefault();
      if (s.shadowMode !== 'inverse') s.shadowMode = 'additive';
      if (!Number.isFinite(s.shadowAngle)) s.shadowAngle = d.shadowAngle;
      if (!Number.isFinite(s.shadowDensity)) s.shadowDensity = d.shadowDensity;
      if (typeof s.shadowPenId !== 'string' || !s.shadowPenId) s.shadowPenId = null;
      if (!['solid', 'dashed', 'dotted', 'dashdot'].includes(s.shadowLineType)) s.shadowLineType = 'solid';
      if (typeof s.shadowLayers !== 'boolean') s.shadowLayers = false;
      if (![2, 3, 4].includes(s.shadowLayerCount)) s.shadowLayerCount = 3;
      if (!Number.isFinite(s.shadowFalloff)) s.shadowFalloff = d.shadowFalloff;
      if (typeof s.shadowAngleFollowsLight !== 'boolean') s.shadowAngleFollowsLight = false;
      return s;
    };

    // Host commit pattern — ONE undo step per gesture.
    const pushHist = () => { try { ui.app && ui.app.pushHistory && ui.app.pushHistory(); } catch (_) { /* */ } };
    const store = () => { try { ui.storeLayerParams && ui.storeLayerParams(layer); } catch (_) { /* */ } };
    const regen = () => { try { ui.app && ui.app.regen && ui.app.regen(); } catch (_) { /* */ } };
    // Draft-quality regen for live drags: sets bounds.fastPreview so scene3d
    // skips cast shadows + tone banding + the plane-projected surface hatch,
    // matching the on-canvas handle-drag path (renderer._scheduleSceneDragRegen).
    // Full quality returns on release (the onCommit regen()).
    const regenDraft = () => { try { ui.app && ui.app.regen && ui.app.regen({ preview: true }); } catch (_) { /* */ } };
    const commit = (mutate) => { pushHist(); mutate(); store(); regen(); };

    // Live-drag slider gesture (Jay feedback #3): preview on every input event,
    // coalesced onto rAF, with exactly ONE undo entry per gesture and a full
    // regen on release. `apply(v)` performs the mutation only — history/store/
    // regen are owned here. Double-click reset (Jay feedback #4) rides the same
    // path: UI.Slider fires onChange+onCommit with the slider's defaultValue.
    const liveSlider = (apply, opts) => {
      const g = { active: false, raf: 0 };
      const hasRaf = typeof requestAnimationFrame === 'function';
      // Tone/shading/highlight edits do NOT move geometry, so their live-drag
      // flush routes through a FULL regen (the real toned surface wrap) instead
      // of the draft/fastPreview regen — the draft path forces scene3d draft=true,
      // which disables tone + nulls chartParams and falls back to flat diagonal
      // hatchSegments (the "static diagonal lines" bug). Geometry sliders keep
      // regenDraft() so a transform drag stays cheap/responsive.
      const flushRegen = (opts && opts.full) ? regen : regenDraft;
      const flushDraft = () => {
        if (g.raf) return;
        g.raf = hasRaf
          ? requestAnimationFrame(() => { g.raf = 0; store(); flushRegen(); })
          : setTimeout(() => { g.raf = 0; store(); flushRegen(); }, 16);
      };
      return {
        onChange: (v) => {
          if (!g.active) { pushHist(); g.active = true; }
          apply(v);
          flushDraft();
        },
        onCommit: (v) => {
          if (g.raf) { if (hasRaf) cancelAnimationFrame(g.raf); else clearTimeout(g.raf); g.raf = 0; }
          if (!g.active) pushHist(); // keyboard/click without a drag still gets one entry
          apply(v);
          store();
          regen();
          g.active = false;
        },
      };
    };

    // Live-drag variant for TONE / shading edits: full-regen each rAF so the
    // toned surface wrap updates live under the pointer (item 3 fix-map).
    const liveSliderFull = (apply) => liveSlider(apply, { full: true });

    // Panel-local selection (mirrors renderer.sceneSelection when CONTRACT D
    // exists; standalone otherwise).
    let sel = { mode: 'none', objectId: null, faceKey: null };
    const renderer = ui.app && ui.app.renderer;
    const rendererSel = renderer && typeof renderer.getSceneSelection === 'function'
      ? renderer.getSceneSelection() : null;
    if (rendererSel && rendererSel.layerId === layer.id) {
      if (rendererSel.mode === 'face' && rendererSel.faceKeys && rendererSel.faceKeys.length) {
        const fk = rendererSel.faceKeys[0];
        sel = { mode: 'face', objectId: fk.split('/')[0], faceKey: fk };
      } else if (rendererSel.objectIds && rendererSel.objectIds.length) {
        sel = { mode: 'object', objectId: rendererSel.objectIds[0], faceKey: null };
      }
    }

    const getObject = (id) => params.objects.find((o) => o && o.id === id) || null;

    // ── CSG groups (Increment 1 minimal): role (solid/hole) + subtract pairing.
    // The full grouping tree (union/intersect, group rows, nested groups,
    // multi-hole management) is deferred to Increment 3; here a hole is pointed
    // at a solid and a subtract group carves it. Engine-side normalizeGroups owns
    // canonicalization; the panel only writes intent.
    const getGroups = () => (Array.isArray(params.groups) ? params.groups : (params.groups = []));
    const nextGroupId = () => {
      const used = new Set(getGroups().map((g) => g && g.id));
      let n = getGroups().length + 1;
      let id = `grp-${n}`;
      while (used.has(id)) { n += 1; id = `grp-${n}`; }
      return id;
    };
    // The solid a hole currently subtracts into (children[0] of its subtract
    // group), or '' when the hole is ungrouped (inert → renders solid).
    const holeTargetOf = (holeId) => {
      const g = getGroups().find((gr) => gr && gr.op === 'subtract'
        && Array.isArray(gr.children) && gr.children.includes(holeId));
      return (g && g.children[0]) || '';
    };
    const removeObjFromGroups = (id) => {
      getGroups().forEach((g) => {
        if (g && Array.isArray(g.children)) g.children = g.children.filter((c) => c !== id);
      });
      params.groups = getGroups().filter((g) => g && Array.isArray(g.children) && g.children.length >= 2);
    };
    // Point a hole at a solid (or detach it when solidId is falsy). Reuses the
    // solid's existing subtract group (appending the hole) or creates a new one.
    const subtractInto = (holeId, solidId) => {
      commit(() => {
        removeObjFromGroups(holeId);
        if (!solidId || solidId === holeId) return;
        let g = getGroups().find((gr) => gr && gr.op === 'subtract'
          && Array.isArray(gr.children) && gr.children[0] === solidId);
        if (!g) { g = { id: nextGroupId(), name: 'Subtract', op: 'subtract', children: [solidId] }; getGroups().push(g); }
        if (!g.children.includes(holeId)) g.children.push(holeId);
      });
      renderTree();
      renderInspector();
    };

    // ── CSG grouping (Increment 3): full boolean-group management. A group holds
    // an ORDERED child list of object ids and/or nested group ids, an op, and
    // per-object roles (solid/hole). These helpers are the panel-side authoring
    // surface; params.js normalizeGroups owns canonicalization + cycle safety.
    const GROUP_OP_GLYPH = { none: '·', union: '⋃', subtract: '−', intersect: '⋂' };
    const GROUP_OP_LABEL = { none: 'None', union: 'Union', subtract: 'Subtract', intersect: 'Intersect' };
    const groupById = (id) => getGroups().find((g) => g && g.id === id) || null;
    const objInGroup = (objId) => getGroups().find((g) => g && Array.isArray(g.children)
      && g.op && g.op !== 'none' && g.children.includes(objId)) || null;
    // Does group `g` (transitively) contain `targetId`? Guards against cycles when
    // offering a group as another group's child.
    const groupContains = (g, targetId, seen = new Set()) => {
      if (!g || seen.has(g.id)) return false;
      seen.add(g.id);
      return (g.children || []).some((cid) => cid === targetId
        || groupContains(groupById(cid), targetId, seen));
    };
    const childDisplayName = (cid) => {
      const o = getObject(cid);
      if (o) return o.name || cid;
      const g = groupById(cid);
      return g ? `⊞ ${g.name || cid}` : cid;
    };
    const addGroup = () => {
      let id = null;
      commit(() => {
        id = nextGroupId();
        getGroups().push({ id, name: `Group ${getGroups().length + 1}`, op: 'union', children: [] });
      });
      renderGroups();
    };

    // Component instances per re-renderable area, destroyed on re-render.
    let inspectorComps = [];
    let styleComps = [];
    let toneComps = [];
    let groupComps = [];
    const destroyComps = (list) => { list.forEach((c) => { try { c.destroy && c.destroy(); } catch (_) { /* */ } }); list.length = 0; };

    // ── DOM skeleton ────────────────────────────────────────────────────────
    const root = document.createElement('div');
    root.className = 'vs3-panel';
    container.appendChild(root);

    const pages = {};
    const makePage = (name) => {
      const el = document.createElement('div');
      el.className = 'vs3-page';
      el.dataset.page = name;
      pages[name] = el;
      return el;
    };

    const tabs = UI.Tabs(root, {
      tabs: [
        { value: 'scene', label: 'Scene' },
        { value: 'style', label: 'Style' },
        { value: 'output', label: 'Output' },
      ],
      active: 'scene',
      ariaLabel: '3D Scene panel tabs',
      onChange: (value) => {
        Object.keys(pages).forEach((k) => pages[k].classList.toggle('active', k === value));
        if (value === 'style') renderStyle();
      },
    });

    root.appendChild(makePage('scene'));
    root.appendChild(makePage('style'));
    root.appendChild(makePage('output'));
    pages.scene.classList.add('active');

    // ── Scene tab · Shelf ───────────────────────────────────────────────────
    let treeHost = null;
    let groupsHost = null;
    let inspectorHost = null;
    let styleHost = null;
    let toneHost = null;
    let moreMenuOpen = false;
    let moreBtn = null;
    let moreMenu = null;
    let moreWrapEl = null;

    const nextOrdinal = () => {
      let max = 0;
      params.objects.forEach((o) => {
        const m = /^obj-(\d+)$/.exec(o && o.id ? o.id : '');
        if (m) max = Math.max(max, parseInt(m[1], 10));
      });
      return max + 1;
    };

    const addPrimitive = (prim) => {
      const def = PRIMITIVES[prim];
      if (!def) return;
      const n = nextOrdinal();
      const obj = {
        id: `obj-${n}`,
        name: `${def.label} ${n}`,
        primitive: prim,
        params: def.defaults(),
        transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 },
        visibility: 'solid',
      };
      commit(() => { params.objects.push(obj); });
      selectObject(obj.id);
      renderTree();
      renderInspector();
    };

    // The flyout is portaled to <body> and positioned with position:fixed, so
    // it escapes the Add Objects Section body's overflow:hidden clip (which
    // otherwise hides it behind the Scene Tree section). It flips above the
    // button when there is no room below.
    const positionMoreMenu = () => {
      if (!moreMenu || !moreBtn || !moreMenuOpen) return;
      const rect = moreBtn.getBoundingClientRect();
      moreMenu.style.visibility = 'hidden';
      moreMenu.style.display = 'block';
      const mh = moreMenu.offsetHeight || 0;
      const mw = moreMenu.offsetWidth || 0;
      const belowRoom = window.innerHeight - rect.bottom;
      const up = belowRoom < mh + 8 && rect.top > belowRoom;
      const top = up ? Math.max(4, rect.top - mh - 4) : rect.bottom + 4;
      let left = rect.left;
      if (left + mw > window.innerWidth - 4) left = Math.max(4, window.innerWidth - mw - 4);
      moreMenu.style.top = `${Math.round(top)}px`;
      moreMenu.style.left = `${Math.round(left)}px`;
      moreMenu.style.visibility = 'visible';
    };

    const setMoreMenuOpen = (open) => {
      moreMenuOpen = !!open;
      if (moreMenu) {
        if (moreMenuOpen) {
          if (moreMenu.parentNode !== document.body) document.body.appendChild(moreMenu);
          moreMenu.classList.add('open');
          positionMoreMenu();
        } else {
          moreMenu.classList.remove('open');
          moreMenu.style.display = '';
        }
      }
      if (moreBtn) moreBtn.setAttribute('aria-expanded', String(moreMenuOpen));
    };

    const syncMoreButton = () => {
      if (!moreBtn) return;
      const iconEl = moreBtn.querySelector('.vs3-shelf-icon');
      const labelEl = moreBtn.querySelector('.vs3-shelf-label');
      const def = moreLastPick ? PRIMITIVES[moreLastPick] : null;
      if (iconEl) iconEl.innerHTML = def ? def.icon : ICON_MORE;
      if (labelEl) labelEl.textContent = def ? def.label : 'More…';
      moreBtn.dataset.lastPick = moreLastPick || '';
      moreBtn.title = def ? `Add ${def.label} (long list: use the arrow)` : 'More primitives';
    };

    const onDocPointerDown = (e) => {
      if (teardownIfDetached && teardownIfDetached()) return;
      if (!moreMenuOpen) return;
      // The menu is portaled to <body>; the button/caret live in moreWrap.
      if (moreMenu && moreMenu.contains(e.target)) return;
      if (moreWrapEl && moreWrapEl.contains(e.target)) return;
      setMoreMenuOpen(false);
    };
    document.addEventListener('pointerdown', onDocPointerDown);
    const onWindowChange = () => {
      if (teardownIfDetached && teardownIfDetached()) return;
      if (moreMenuOpen) positionMoreMenu();
    };
    window.addEventListener('resize', onWindowChange);
    window.addEventListener('scroll', onWindowChange, true);

    const buildShelfButton = (host, { icon, label, className, title, disabled, onClick, dataset }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `vs3-shelf-btn${className ? ` ${className}` : ''}`;
      if (title) btn.title = title;
      if (disabled) { btn.disabled = true; btn.setAttribute('aria-disabled', 'true'); }
      const iconEl = document.createElement('span');
      iconEl.className = 'vs3-shelf-icon';
      iconEl.innerHTML = icon;
      const labelEl = document.createElement('span');
      labelEl.className = 'vs3-shelf-label';
      labelEl.textContent = label;
      btn.appendChild(iconEl);
      btn.appendChild(labelEl);
      if (dataset) Object.keys(dataset).forEach((k) => { btn.dataset[k] = dataset[k]; });
      if (onClick) btn.addEventListener('click', onClick);
      host.appendChild(btn);
      return btn;
    };

    const buildShelf = (body) => {
      const shelf = document.createElement('div');
      shelf.className = 'vs3-shelf';
      body.appendChild(shelf);

      SHELF_PRIMS.forEach((prim) => {
        buildShelfButton(shelf, {
          icon: PRIMITIVES[prim].icon,
          label: PRIMITIVES[prim].label,
          title: `Add ${PRIMITIVES[prim].label.toLowerCase()}`,
          dataset: { prim },
          onClick: () => addPrimitive(prim),
        });
      });

      buildShelfButton(shelf, {
        icon: ICON_IMPORT, label: 'Import', className: 'is-stub', disabled: true,
        title: 'STL import arrives in Phase 4', dataset: { stub: 'import' },
      });
      buildShelfButton(shelf, {
        icon: ICON_LIGHT, label: 'Light',
        title: 'Add a directional (sun) light', dataset: { light: 'add' },
        onClick: () => addLight('directional'),
      });

      // More… flyout (toolbar sub-tool pattern: session last-pick + icon swap).
      const moreWrap = document.createElement('div');
      moreWrap.className = 'vs3-more';
      moreWrapEl = moreWrap;
      shelf.appendChild(moreWrap);

      moreBtn = buildShelfButton(moreWrap, {
        icon: ICON_MORE, label: 'More…', className: 'vs3-more-btn',
        onClick: () => {
          if (moreLastPick) addPrimitive(moreLastPick);
          else setMoreMenuOpen(!moreMenuOpen);
        },
      });
      moreBtn.setAttribute('aria-haspopup', 'menu');
      moreBtn.setAttribute('aria-expanded', 'false');

      const caret = document.createElement('button');
      caret.type = 'button';
      caret.className = 'vs3-more-caret';
      caret.setAttribute('aria-label', 'More primitives');
      caret.textContent = '▾';
      caret.addEventListener('click', () => setMoreMenuOpen(!moreMenuOpen));
      moreWrap.appendChild(caret);

      moreMenu = document.createElement('div');
      moreMenu.className = 'vs3-more-menu';
      moreMenu.setAttribute('role', 'menu');
      MORE_PRIMS.forEach((prim) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'vs3-more-item';
        item.setAttribute('role', 'menuitem');
        item.dataset.prim = prim;
        item.innerHTML = `<span class="vs3-shelf-icon">${PRIMITIVES[prim].icon}</span><span>${PRIMITIVES[prim].label}</span>`;
        item.addEventListener('click', () => {
          moreLastPick = prim;
          syncMoreButton();
          setMoreMenuOpen(false);
          addPrimitive(prim);
        });
        moreMenu.appendChild(item);
      });
      moreWrap.appendChild(moreMenu);
      syncMoreButton();
    };

    // ── Scene tab · Tree ────────────────────────────────────────────────────
    const cycleVisibility = (obj) => {
      const next = obj.visibility === 'xray' ? 'solid' : 'xray';
      commit(() => { obj.visibility = next; });
      renderTree();
      renderInspector();
    };

    const deleteObject = (obj) => {
      commit(() => {
        const idx = params.objects.indexOf(obj);
        if (idx >= 0) params.objects.splice(idx, 1);
        removeObjFromGroups(obj.id); // drop from any boolean group (may empty it)
        const table = params.styleTable;
        if (table) {
          if (table.byObject) delete table.byObject[obj.id];
          if (table.byFace) {
            Object.keys(table.byFace).forEach((k) => {
              if (k.indexOf(`${obj.id}/`) === 0) delete table.byFace[k];
            });
          }
        }
      });
      if (sel.objectId === obj.id) clearSelection();
      renderTree();
      renderInspector();
    };

    const startRename = (nameEl, obj) => {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'vs3-rename';
      input.value = obj.name || '';
      input.setAttribute('aria-label', 'Object name');
      nameEl.textContent = '';
      nameEl.appendChild(input);
      input.focus();
      if (input.select) input.select();
      let done = false;
      const finish = (apply) => {
        if (done) return;
        done = true;
        const next = input.value.trim();
        if (apply && next && next !== obj.name) {
          commit(() => { obj.name = next; });
        }
        renderTree();
        renderInspector();
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        e.stopPropagation();
      });
      input.addEventListener('blur', () => finish(true));
      input.addEventListener('click', (e) => e.stopPropagation());
    };

    const renderTree = () => {
      if (!treeHost) return;
      treeHost.textContent = '';
      if (!params.objects.length) {
        const empty = document.createElement('p');
        empty.className = 'vs3-empty';
        empty.textContent = 'No objects yet — add one from the shelf above.';
        treeHost.appendChild(empty);
      }
      params.objects.forEach((obj) => {
        const row = document.createElement('div');
        row.className = 'vs3-tree-row';
        row.dataset.objectId = obj.id;
        if (sel.objectId === obj.id) row.classList.add('selected');

        const name = document.createElement('span');
        name.className = 'vs3-tree-name';
        name.textContent = obj.name || obj.id;
        name.title = 'Double-click to rename';
        name.addEventListener('dblclick', (e) => { e.stopPropagation(); startRename(name, obj); });
        row.appendChild(name);

        // Hole badge: 'Hole' when subtracting into a solid, 'Hole?' when the
        // hole is ungrouped (inert — renders solid until pointed at a solid).
        if (obj.role === 'hole') {
          const badge = document.createElement('span');
          badge.className = 'vs3-tree-role';
          const wired = !!objInGroup(obj.id);
          badge.textContent = wired ? 'hole' : 'hole?';
          badge.title = wired ? 'Subtracts inside a boolean group' : 'Inert hole — add it to a boolean group';
          badge.classList.toggle('vs3-tree-role-inert', !wired);
          row.appendChild(badge);
        }
        // Group-membership badge: the op glyph of the boolean group this object
        // belongs to (⋃ union · − subtract · ⋂ intersect).
        const memberGroup = objInGroup(obj.id);
        if (memberGroup) {
          const gb = document.createElement('span');
          gb.className = 'vs3-tree-grp';
          gb.textContent = GROUP_OP_GLYPH[memberGroup.op] || '·';
          gb.title = `In ${memberGroup.name || memberGroup.id} (${GROUP_OP_LABEL[memberGroup.op] || memberGroup.op})`;
          row.appendChild(gb);
        }

        const vis = document.createElement('button');
        vis.type = 'button';
        vis.className = 'vs3-tree-vis';
        vis.dataset.visibility = obj.visibility || 'solid';
        vis.title = obj.visibility === 'xray' ? 'X-ray (click for solid)' : 'Solid (click for x-ray)';
        vis.setAttribute('aria-label', `Visibility: ${obj.visibility || 'solid'}`);
        vis.textContent = obj.visibility === 'xray' ? '◌' : '●';
        vis.addEventListener('click', (e) => { e.stopPropagation(); cycleVisibility(obj); });
        row.appendChild(vis);

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'vs3-tree-del';
        del.title = 'Delete object';
        del.setAttribute('aria-label', `Delete ${obj.name || obj.id}`);
        del.textContent = '✕';
        del.addEventListener('click', (e) => { e.stopPropagation(); deleteObject(obj); });
        row.appendChild(del);

        row.addEventListener('click', () => selectObject(obj.id));
        treeHost.appendChild(row);
      });

      // Ground — a scene fixture (not in params.objects), listed so it can be
      // shown/hidden and styled like any object.
      if (!params.ground || typeof params.ground !== 'object') params.ground = { enabled: true };
      const gRow = document.createElement('div');
      gRow.className = 'vs3-tree-row vs3-tree-ground';
      gRow.dataset.objectId = 'ground';
      if (sel.objectId === 'ground') gRow.classList.add('selected');
      const gName = document.createElement('span');
      gName.className = 'vs3-tree-name';
      gName.textContent = 'Ground';
      gRow.appendChild(gName);
      const gVis = document.createElement('button');
      gVis.type = 'button';
      gVis.className = 'vs3-tree-vis';
      const gOn = params.ground.enabled !== false;
      gVis.title = gOn ? 'Visible (click to hide)' : 'Hidden (click to show)';
      gVis.setAttribute('aria-label', `Ground ${gOn ? 'visible' : 'hidden'}`);
      gVis.textContent = gOn ? '●' : '◌';
      gVis.addEventListener('click', (e) => {
        e.stopPropagation();
        commit(() => { params.ground.enabled = !gOn; });
        renderTree();
      });
      gRow.appendChild(gVis);
      gRow.addEventListener('click', () => selectObject('ground'));
      treeHost.appendChild(gRow);

      // Lights — every light in the scene (directional suns + ambient fills).
      // Each row selects the light (the Inspector edits it); the dot toggles cast
      // shadows (directional only); ✕ deletes it — including the last one (I4:
      // a lightless scene is allowed; it shades flat and casts no shadows).
      const lights = getLights();
      lights.forEach((light, index) => {
        const rowId = `light:${light.id}`;
        const isAmbient = light.type === 'ambient';
        const castOn = light.castShadows !== false;
        const lRow = document.createElement('div');
        lRow.className = 'vs3-tree-row vs3-tree-light';
        lRow.dataset.objectId = rowId;
        if (sel.objectId === rowId) lRow.classList.add('selected');
        const lName = document.createElement('span');
        lName.className = 'vs3-tree-name';
        lName.textContent = lightDisplayName(light, index);
        lRow.appendChild(lName);
        if (!isAmbient) {
          const lVis = document.createElement('button');
          lVis.type = 'button';
          lVis.className = 'vs3-tree-vis';
          lVis.title = castOn ? 'Casts shadows (click to disable)' : 'No shadows (click to enable)';
          lVis.setAttribute('aria-label', `Cast shadows ${castOn ? 'on' : 'off'}`);
          lVis.textContent = castOn ? '●' : '◌';
          lVis.addEventListener('click', (e) => {
            e.stopPropagation();
            commit(() => { const lt = lightById(light.id); if (lt) lt.castShadows = !castOn; });
            renderTree();
            if (sel.objectId === rowId) renderInspector();
          });
          lRow.appendChild(lVis);
        }
        {
          // I4: every light is deletable, including the last one (a lightless
          // scene shades flat / casts no shadows). Re-add via the Add strip below.
          const del = document.createElement('button');
          del.type = 'button';
          del.className = 'vs3-tree-del';
          del.title = 'Delete light';
          del.setAttribute('aria-label', `Delete ${lightDisplayName(light, index)}`);
          del.textContent = '✕';
          del.addEventListener('click', (e) => { e.stopPropagation(); deleteLight(light.id); });
          lRow.appendChild(del);
        }
        lRow.addEventListener('click', () => selectLight(light.id));
        treeHost.appendChild(lRow);
      });
      // Add-light affordances (a directional sun; one ambient fill). NOT a
      // vs3-tree-row — it's an action strip, not a selectable fixture.
      const addRow = document.createElement('div');
      addRow.className = 'vs3-tree-addlight';
      const addDir = document.createElement('button');
      addDir.type = 'button';
      addDir.className = 'vs3-tree-addbtn';
      addDir.textContent = '+ Sun';
      addDir.title = 'Add a directional (sun) light';
      addDir.addEventListener('click', (e) => { e.stopPropagation(); addLight('directional'); });
      addRow.appendChild(addDir);
      const addPoint = document.createElement('button');
      addPoint.type = 'button';
      addPoint.className = 'vs3-tree-addbtn';
      addPoint.textContent = '+ Point';
      addPoint.title = 'Add a positional point light';
      addPoint.dataset.light = 'point';
      addPoint.addEventListener('click', (e) => { e.stopPropagation(); addLight('point'); });
      addRow.appendChild(addPoint);
      const addSpot = document.createElement('button');
      addSpot.type = 'button';
      addSpot.className = 'vs3-tree-addbtn';
      addSpot.textContent = '+ Spot';
      addSpot.title = 'Add a spotlight (position + cone)';
      addSpot.dataset.light = 'spot';
      addSpot.addEventListener('click', (e) => { e.stopPropagation(); addLight('spot'); });
      addRow.appendChild(addSpot);
      const addArea = document.createElement('button');
      addArea.type = 'button';
      addArea.className = 'vs3-tree-addbtn';
      addArea.textContent = '+ Area';
      addArea.title = 'Add a soft area light (softer shading + shadows)';
      addArea.dataset.light = 'area';
      addArea.addEventListener('click', (e) => { e.stopPropagation(); addLight('area'); });
      addRow.appendChild(addArea);
      if (!lights.some((l) => l && l.type === 'ambient')) {
        const addAmb = document.createElement('button');
        addAmb.type = 'button';
        addAmb.className = 'vs3-tree-addbtn';
        addAmb.textContent = '+ Ambient';
        addAmb.title = 'Add an ambient fill light';
        addAmb.addEventListener('click', (e) => { e.stopPropagation(); addLight('ambient'); });
        addRow.appendChild(addAmb);
      }
      treeHost.appendChild(addRow);
      if (groupsHost) renderGroups();
    };

    // ── Scene tab · Boolean Groups ───────────────────────────────────────────
    // The full grouping surface (Increment 3): create a group, pick its op, add /
    // remove / reorder children (objects OR nested groups), and toggle each
    // object child's role. Complements the per-object Role / Cut-into shortcut in
    // the Inspector — both write params.groups; normalize canonicalizes.
    const removeChildFromGroup = (group, cid) => {
      commit(() => { group.children = (group.children || []).filter((c) => c !== cid); });
      renderTree();
      renderInspector();
    };
    const moveChild = (group, cid, dir) => {
      const arr = group.children || [];
      const i = arr.indexOf(cid);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= arr.length) return;
      commit(() => { const t = arr[i]; arr[i] = arr[j]; arr[j] = t; });
      renderGroups();
    };
    const addChildToGroup = (group, cid) => {
      if (!cid) return;
      commit(() => {
        // Each id lives in ≤1 group — detach from any current parent first.
        getGroups().forEach((g) => { if (g !== group && Array.isArray(g.children)) g.children = g.children.filter((c) => c !== cid); });
        if (!group.children.includes(cid)) group.children.push(cid);
      });
      renderTree();
      renderInspector();
    };
    const deleteGroup = (group) => {
      commit(() => { params.groups = getGroups().filter((g) => g !== group); });
      renderTree();
      renderInspector();
    };

    const renderGroupCard = (group) => {
      const card = document.createElement('div');
      card.className = 'vs3-grp-card';
      card.dataset.groupId = group.id;

      // Header: name · op · delete.
      const head = document.createElement('div');
      head.className = 'vs3-grp-head';
      const nameIn = document.createElement('input');
      nameIn.type = 'text';
      nameIn.className = 'vs3-grp-name';
      nameIn.value = group.name || group.id;
      nameIn.setAttribute('aria-label', 'Group name');
      nameIn.addEventListener('change', () => {
        const next = nameIn.value.trim();
        if (next && next !== group.name) { commit(() => { group.name = next; }); renderTree(); }
        else nameIn.value = group.name || group.id;
      });
      head.appendChild(nameIn);
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'vs3-grp-del';
      del.title = 'Delete group (children become independent)';
      del.setAttribute('aria-label', `Delete ${group.name || group.id}`);
      del.textContent = '✕';
      del.addEventListener('click', () => deleteGroup(group));
      head.appendChild(del);
      card.appendChild(head);

      // Op selector.
      const opRow = document.createElement('div');
      opRow.className = 'vs3-grp-op';
      const opLbl = document.createElement('span');
      opLbl.className = 'vs3-grp-op-lbl';
      opLbl.textContent = 'Op';
      opRow.appendChild(opLbl);
      const opHost = document.createElement('div');
      opHost.className = 'vs3-ctl';
      opRow.appendChild(opHost);
      card.appendChild(opRow);
      groupComps.push(UI.SegCtrl(opHost, {
        options: [
          { value: 'none', label: 'None' },
          { value: 'union', label: '⋃' },
          { value: 'subtract', label: '−' },
          { value: 'intersect', label: '⋂' },
        ],
        value: GROUP_OP_LABEL[group.op] ? group.op : 'none',
        ariaLabel: 'Boolean operation',
        onChange: (v) => { commit(() => { group.op = v; }); renderTree(); renderInspector(); },
      }));

      // Children (ordered).
      const kids = document.createElement('div');
      kids.className = 'vs3-grp-kids';
      (group.children || []).forEach((cid, idx) => {
        const krow = document.createElement('div');
        krow.className = 'vs3-grp-kid';
        krow.dataset.childId = cid;
        const kname = document.createElement('span');
        kname.className = 'vs3-grp-kid-name';
        kname.textContent = childDisplayName(cid);
        krow.appendChild(kname);

        // Role toggle for OBJECT children (nested groups have no role).
        const kobj = getObject(cid);
        if (kobj) {
          const roleHost = document.createElement('div');
          roleHost.className = 'vs3-grp-kid-role';
          krow.appendChild(roleHost);
          groupComps.push(UI.SegCtrl(roleHost, {
            options: [{ value: 'solid', label: 'Solid' }, { value: 'hole', label: 'Hole' }],
            value: kobj.role === 'hole' ? 'hole' : 'solid',
            ariaLabel: `Role of ${kobj.name || cid}`,
            onChange: (v) => { commit(() => { kobj.role = v; }); renderTree(); renderInspector(); },
          }));
        }

        const up = document.createElement('button');
        up.type = 'button';
        up.className = 'vs3-grp-kid-btn';
        up.title = 'Move up';
        up.textContent = '↑';
        up.disabled = idx === 0;
        up.addEventListener('click', () => moveChild(group, cid, -1));
        krow.appendChild(up);
        const down = document.createElement('button');
        down.type = 'button';
        down.className = 'vs3-grp-kid-btn';
        down.title = 'Move down';
        down.textContent = '↓';
        down.disabled = idx === (group.children.length - 1);
        down.addEventListener('click', () => moveChild(group, cid, 1));
        krow.appendChild(down);
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'vs3-grp-kid-btn vs3-grp-kid-rm';
        rm.title = 'Remove from group';
        rm.textContent = '−';
        rm.addEventListener('click', () => removeChildFromGroup(group, cid));
        krow.appendChild(rm);

        kids.appendChild(krow);
      });
      if (!(group.children || []).length) {
        const empty = document.createElement('p');
        empty.className = 'vs3-grp-empty';
        empty.textContent = 'No children — add objects below.';
        kids.appendChild(empty);
      }
      card.appendChild(kids);

      // Add-child picker: objects + other groups not already claimed and not
      // creating a cycle (a group that already contains this one is excluded).
      const claimed = new Set();
      getGroups().forEach((g) => (g.children || []).forEach((c) => claimed.add(c)));
      const objectOpts = params.objects
        .filter((o) => o && !claimed.has(o.id)) // unclaimed objects only (each in ≤1 group)
        .map((o) => ({ value: o.id, label: o.name || o.id }));
      const groupOpts = getGroups()
        .filter((g) => g !== group && !claimed.has(g.id) && !groupContains(g, group.id))
        .map((g) => ({ value: g.id, label: `⊞ ${g.name || g.id}` }));
      const addOpts = [{ value: '', label: '+ Add child…' }].concat(objectOpts).concat(groupOpts);
      if (addOpts.length > 1) {
        const addHost = document.createElement('div');
        addHost.className = 'vs3-grp-add';
        card.appendChild(addHost);
        groupComps.push(UI.Select(addHost, {
          options: addOpts,
          value: '',
          ariaLabel: 'Add a child to this group',
          onChange: (v) => addChildToGroup(group, v),
        }));
      }
      return card;
    };

    const renderGroups = () => {
      if (!groupsHost) return;
      destroyComps(groupComps);
      groupsHost.textContent = '';
      const groups = getGroups();
      // Nested groups render inside their parent card's child list, so the
      // top-level list shows only groups that are nobody's child.
      const nested = new Set();
      groups.forEach((g) => (g.children || []).forEach((cid) => { if (groupById(cid)) nested.add(cid); }));
      const tops = groups.filter((g) => g && !nested.has(g.id));
      if (!tops.length) {
        const empty = document.createElement('p');
        empty.className = 'vs3-empty';
        empty.textContent = 'No boolean groups. Create one to union / subtract / intersect objects.';
        groupsHost.appendChild(empty);
      }
      tops.forEach((g) => groupsHost.appendChild(renderGroupCard(g)));
      // Nested-group cards are shown beneath, indented, so their children/op stay
      // editable (they resolve depth-first inside the parent).
      groups.filter((g) => g && nested.has(g.id)).forEach((g) => {
        const wrap = renderGroupCard(g);
        wrap.classList.add('vs3-grp-nested');
        groupsHost.appendChild(wrap);
      });
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'vs3-grp-new';
      addBtn.textContent = '+ New Group';
      addBtn.title = 'Create a boolean group';
      addBtn.addEventListener('click', addGroup);
      groupsHost.appendChild(addBtn);
    };

    // ── Selection (CONTRACT D consumer; guarded) ────────────────────────────
    const syncSelectionUI = () => {
      if (treeHost) {
        Array.from(treeHost.querySelectorAll('.vs3-tree-row')).forEach((row) => {
          row.classList.toggle('selected', row.dataset.objectId === sel.objectId);
        });
      }
      renderInspector();
      if (tabs.getActive() === 'style') renderStyle();
    };

    const pushSelectionToRenderer = (selection, opts) => {
      const r = ui.app && ui.app.renderer;
      if (r && typeof r.setSceneSelection === 'function') {
        try { r.setSceneSelection(selection, opts || {}); return true; } catch (_) { /* */ }
      }
      return false;
    };

    // Mirror the selected light to the renderer so its 3-axis translate gizmo
    // arms (null clears it → the legacy sun disc returns).
    const mirrorSelectedLight = (lightId) => {
      const r = ui.app && ui.app.renderer;
      if (r && typeof r.setSelectedSceneLight === 'function') {
        try { r.setSelectedSceneLight(layer.id, lightId || null); } catch (_) { /* */ }
      }
    };

    const selectObject = (id) => {
      sel = { mode: 'object', objectId: id, faceKey: null };
      mirrorSelectedLight(null);
      pushSelectionToRenderer({ layerId: layer.id, mode: 'object', objectIds: [id], faceKeys: [], edgeKeys: [] });
      syncSelectionUI();
    };

    const selectLight = (id) => {
      const lightId = id || (getLights()[0] || {}).id || 'sun';
      sel = { mode: 'light', objectId: `light:${lightId}`, faceKey: null };
      // Lights are not renderer objects; clear any object/face selection so the
      // on-canvas light gizmo is the sole light affordance. Do it SILENTLY — a
      // null scene-selection echo would re-enter onSceneSelection and reset our
      // just-set 'light' mode back to 'none', so the light Inspector never opens.
      pushSelectionToRenderer(null, { silent: true });
      mirrorSelectedLight(lightId);
      syncSelectionUI();
    };

    const clearSelection = () => {
      sel = { mode: 'none', objectId: null, faceKey: null };
      mirrorSelectedLight(null);
      pushSelectionToRenderer(null);
      syncSelectionUI();
    };

    const onSceneSelection = (e) => {
      if (teardownIfDetached && teardownIfDetached()) return;
      const d = e && e.detail;
      if (!d || d.layerId !== layer.id) {
        if (sel.mode !== 'none') { sel = { mode: 'none', objectId: null, faceKey: null }; mirrorSelectedLight(null); syncSelectionUI(); }
        return;
      }
      // A real object/face echo means a light is no longer in focus.
      if ((d.objectIds && d.objectIds.length) || (d.faceKeys && d.faceKeys.length)) mirrorSelectedLight(null);
      if (d.mode === 'face' && d.faceKeys && d.faceKeys.length) {
        const fk = d.faceKeys[0];
        sel = { mode: 'face', objectId: fk.split('/')[0], faceKey: fk };
      } else if (d.objectIds && d.objectIds.length) {
        sel = { mode: 'object', objectId: d.objectIds[0], faceKey: null };
      } else {
        sel = { mode: 'none', objectId: null, faceKey: null };
      }
      syncSelectionUI();
    };
    window.addEventListener('vectura:scene-selection', onSceneSelection);

    // ── Scene tab · Inspector ───────────────────────────────────────────────
    const sliderRow = (host, comps, label, props) => {
      const row = document.createElement('div');
      row.className = 'vs3-row';
      const lbl = document.createElement('label');
      lbl.className = 'vs3-lbl';
      lbl.textContent = label;
      row.appendChild(lbl);
      const ctlHost = document.createElement('div');
      ctlHost.className = 'vs3-ctl';
      row.appendChild(ctlHost);
      host.appendChild(row);
      comps.push(UI.Slider(ctlHost, props));
      return row;
    };

    // Reset a light to its factory default (mirrors renderer.restoreSceneLight so
    // the panel button and the on-canvas restore handle agree). Panel-local so it
    // works with or without a renderer bridge.
    const resetLight = (lid) => {
      commit(() => {
        const lt = lightById(lid);
        if (!lt) return;
        if (lt.type === 'directional') { lt.azimuth = 135; lt.elevation = 45; }
        else if (lt.type === 'area') {
          lt.position = { x: 120, y: 200, z: 120 };
          lt.size = 120;
          lt.samples = 6;
        } else if (lt.type === 'point' || lt.type === 'spot') {
          lt.position = { x: 120, y: 200, z: 120 };
          lt.range = 400;
          if (lt.type === 'spot') { lt.target = { x: 0, y: 0, z: 0 }; lt.coneAngle = 30; lt.penumbra = 8; }
        }
      });
      renderInspector();
    };

    // A world-vector (position/target) X/Y/Z row triplet. `field` names the light
    // sub-object; live callbacks re-fetch the light + guarantee the sub-object.
    const vec3Rows = (lid, field, label, def) => {
      ['x', 'y', 'z'].forEach((axis) => {
        const light = lightById(lid);
        const cur = (light && light[field] && Number.isFinite(light[field][axis])) ? light[field][axis] : def[axis];
        sliderRow(inspectorHost, inspectorComps, `${label} ${axis.toUpperCase()}`, {
          value: cur, min: -600, max: 600, step: 1, defaultValue: def[axis],
          ariaLabel: `${label} ${axis.toUpperCase()}`,
          ...liveSlider((v) => {
            const lt = lightById(lid);
            if (!lt) return;
            if (!lt[field] || typeof lt[field] !== 'object') lt[field] = { ...def };
            lt[field][axis] = Math.round(v);
          }),
        });
      });
    };

    // Phase 5 — scene-level cast-shadow controls. Rendered inside the light
    // inspector beneath the Cast-shadows toggle (the natural home for shadow
    // tuning), but the values write the SCENE-level params.shadow bag shared by
    // every caster/light. Sliders ride liveSlider (one undo/gesture); selects and
    // seg toggles route through commit (a whole-value write + regen).
    const renderShadowControls = (host) => {
      const s = ensureShadow();
      const pens = (Vectura.SETTINGS && Array.isArray(Vectura.SETTINGS.pens)) ? Vectura.SETTINGS.pens : [];

      const sub = document.createElement('div');
      sub.className = 'vs3-subhead';
      sub.textContent = 'Shadow';
      host.appendChild(sub);

      // Mode — Additive (add hatch in the footprint) vs Inverse (thin the
      // ground's OWN fill inside the footprint so more dark paper shows → the
      // physically-correct look for white ink on black paper). Inverse is a no-op
      // unless the ground carries its own fill/pattern.
      const modeRow = document.createElement('div');
      modeRow.className = 'vs3-row';
      const modeLbl = document.createElement('label');
      modeLbl.className = 'vs3-lbl';
      modeLbl.textContent = 'Mode';
      modeRow.appendChild(modeLbl);
      const modeHost = document.createElement('div');
      modeHost.className = 'vs3-ctl';
      modeRow.appendChild(modeHost);
      host.appendChild(modeRow);
      inspectorComps.push(UI.SegCtrl(modeHost, {
        options: [{ value: 'additive', label: 'Additive' }, { value: 'inverse', label: 'Inverse' }],
        value: s.shadowMode === 'inverse' ? 'inverse' : 'additive',
        ariaLabel: 'Shadow mode (additive hatch or inverse ground-fill thinning)',
        onChange: (v) => { commit(() => { ensureShadow().shadowMode = v === 'inverse' ? 'inverse' : 'additive'; }); },
      }));

      // Angle (grayed by Follow-light, but kept live so a user can pre-set it).
      sliderRow(host, inspectorComps, 'Angle', {
        value: Number.isFinite(s.shadowAngle) ? s.shadowAngle : 45,
        min: 0, max: 360, step: 1, defaultValue: 45,
        ariaLabel: 'Shadow hatch angle (degrees)',
        ...liveSlider((v) => { ensureShadow().shadowAngle = Math.round(v); }),
      });

      // Follow light — orient the hatch perpendicular to the light bearing.
      const followRow = document.createElement('div');
      followRow.className = 'vs3-row';
      const followLbl = document.createElement('label');
      followLbl.className = 'vs3-lbl';
      followLbl.textContent = 'Follow light';
      followRow.appendChild(followLbl);
      const followHost = document.createElement('div');
      followHost.className = 'vs3-ctl';
      followRow.appendChild(followHost);
      host.appendChild(followRow);
      inspectorComps.push(UI.SegCtrl(followHost, {
        options: [{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }],
        value: s.shadowAngleFollowsLight ? 'on' : 'off',
        ariaLabel: 'Shadow angle follows the light bearing',
        onChange: (v) => { commit(() => { ensureShadow().shadowAngleFollowsLight = v === 'on'; }); },
      }));

      // Density (1..100 → hatch spacing; 50 == the legacy coverage 0.5).
      sliderRow(host, inspectorComps, 'Density', {
        value: Number.isFinite(s.shadowDensity) ? s.shadowDensity : 50,
        min: 1, max: 100, step: 1, defaultValue: 50,
        ariaLabel: 'Shadow density',
        ...liveSlider((v) => { ensureShadow().shadowDensity = Math.round(v); }),
      });

      // Pen (Inherit = the caster's pen).
      const penRow = document.createElement('div');
      penRow.className = 'vs3-row';
      const penLbl = document.createElement('label');
      penLbl.className = 'vs3-lbl';
      penLbl.textContent = 'Pen';
      penRow.appendChild(penLbl);
      const penHost = document.createElement('div');
      penHost.className = 'vs3-ctl';
      penRow.appendChild(penHost);
      host.appendChild(penRow);
      inspectorComps.push(UI.Select(penHost, {
        options: [{ value: '', label: 'Inherit' }].concat(pens.map((pn) => ({ value: pn.id, label: pn.name || pn.id }))),
        value: s.shadowPenId || '',
        ariaLabel: 'Shadow pen (Inherit = caster pen)',
        onChange: (v) => { commit(() => { ensureShadow().shadowPenId = v || null; }); },
      }));

      // Line type (solid / dashed / dotted / dash-dot).
      const ltRow = document.createElement('div');
      ltRow.className = 'vs3-row';
      const ltLbl = document.createElement('label');
      ltLbl.className = 'vs3-lbl';
      ltLbl.textContent = 'Line';
      ltRow.appendChild(ltLbl);
      const ltHost = document.createElement('div');
      ltHost.className = 'vs3-ctl';
      ltRow.appendChild(ltHost);
      host.appendChild(ltRow);
      inspectorComps.push(UI.Select(ltHost, {
        options: LINE_TYPE_OPTIONS,
        value: s.shadowLineType || 'solid',
        ariaLabel: 'Shadow line type',
        onChange: (v) => { commit(() => { ensureShadow().shadowLineType = v; }); },
      }));

      // Layers — penumbra build-up (nested inset rings, densest core).
      const layRow = document.createElement('div');
      layRow.className = 'vs3-row';
      const layLbl = document.createElement('label');
      layLbl.className = 'vs3-lbl';
      layLbl.textContent = 'Layers';
      layRow.appendChild(layLbl);
      const layHost = document.createElement('div');
      layHost.className = 'vs3-ctl';
      layRow.appendChild(layHost);
      host.appendChild(layRow);
      inspectorComps.push(UI.SegCtrl(layHost, {
        options: [{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }],
        value: s.shadowLayers ? 'on' : 'off',
        ariaLabel: 'Layered penumbra shadow',
        onChange: (v) => { commit(() => { ensureShadow().shadowLayers = v === 'on'; }); renderInspector(); },
      }));

      // Layer count + falloff only bite when layered — shown then to keep the
      // inspector focused.
      if (s.shadowLayers) {
        const lcRow = document.createElement('div');
        lcRow.className = 'vs3-row';
        const lcLbl = document.createElement('label');
        lcLbl.className = 'vs3-lbl';
        lcLbl.textContent = 'Count';
        lcRow.appendChild(lcLbl);
        const lcHost = document.createElement('div');
        lcHost.className = 'vs3-ctl';
        lcRow.appendChild(lcHost);
        host.appendChild(lcRow);
        inspectorComps.push(UI.SegCtrl(lcHost, {
          options: [{ value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' }],
          value: String([2, 3, 4].includes(s.shadowLayerCount) ? s.shadowLayerCount : 3),
          ariaLabel: 'Shadow layer count',
          onChange: (v) => { commit(() => { ensureShadow().shadowLayerCount = parseInt(v, 10) || 3; }); },
        }));
        sliderRow(host, inspectorComps, 'Falloff', {
          value: Number.isFinite(s.shadowFalloff) ? s.shadowFalloff : 0.5,
          min: 0.2, max: 1, step: 0.05, defaultValue: 0.5,
          ariaLabel: 'Shadow layer density falloff',
          ...liveSlider((v) => { ensureShadow().shadowFalloff = Math.round(v * 100) / 100; }),
        });
      }
    };

    // Light inspector — type-aware. Directional: azimuth / elevation. Point/spot:
    // world position (+ range, + spot cone/target). Ambient: intensity only.
    // Every type also gets intensity, cast-shadows (non-ambient), and Reset. Live
    // callbacks re-fetch the light by id so they stay bound across regens.
    const renderLightInspector = (light) => {
      if (!light) {
        const empty = document.createElement('p');
        empty.className = 'vs3-empty';
        empty.textContent = 'Select a light in the scene tree.';
        inspectorHost.appendChild(empty);
        return;
      }
      const lid = light.id;
      const isAmbient = light.type === 'ambient';
      const isPoint = light.type === 'point';
      const isSpot = light.type === 'spot';
      const isArea = light.type === 'area';
      const isDir = !isAmbient && !isPoint && !isSpot && !isArea;
      const note = document.createElement('p');
      note.className = 'vs3-empty';
      note.textContent = isAmbient
        ? 'Ambient — a constant fill that lifts the shadowed side. Does not cast shadows.'
        : (isDir
          ? 'Sun — drag the on-canvas gizmo (or a shadow) to aim it, or use the controls below.'
          : (isArea
            ? 'Area — a soft light: bigger size + more samples = softer shading and shadows. Drag the on-canvas gizmo to move it.'
            : 'Positional light — drag the on-canvas 3-axis gizmo to move it, or use the controls below.'));
      inspectorHost.appendChild(note);
      if (isDir) {
        sliderRow(inspectorHost, inspectorComps, 'Azimuth', {
          value: Number.isFinite(light.azimuth) ? light.azimuth : 135,
          min: 0, max: 360, step: 1, defaultValue: 135,
          ariaLabel: 'Light azimuth (degrees)',
          ...liveSlider((v) => { const lt = lightById(lid); if (lt) lt.azimuth = Math.round(v); }),
        });
        sliderRow(inspectorHost, inspectorComps, 'Elevation', {
          value: Number.isFinite(light.elevation) ? light.elevation : 45,
          min: 0, max: 90, step: 1, defaultValue: 45,
          ariaLabel: 'Light elevation (degrees)',
          ...liveSlider((v) => { const lt = lightById(lid); if (lt) lt.elevation = Math.round(v); }),
        });
      }
      if (isPoint || isSpot || isArea) {
        vec3Rows(lid, 'position', 'Position', { x: 120, y: 200, z: 120 });
      }
      if (isPoint || isSpot) {
        sliderRow(inspectorHost, inspectorComps, 'Range', {
          value: Number.isFinite(light.range) ? light.range : 400,
          min: 0, max: 1000, step: 5, defaultValue: 400,
          ariaLabel: 'Light range (0 = infinite)',
          ...liveSlider((v) => { const lt = lightById(lid); if (lt) lt.range = Math.round(v); }),
        });
      }
      if (isArea) {
        sliderRow(inspectorHost, inspectorComps, 'Size', {
          value: Number.isFinite(light.size) ? light.size : 120,
          min: 10, max: 600, step: 5, defaultValue: 120,
          ariaLabel: 'Area light size',
          ...liveSlider((v) => { const lt = lightById(lid); if (lt) lt.size = Math.round(v); }),
        });
        sliderRow(inspectorHost, inspectorComps, 'Samples', {
          value: Number.isFinite(light.samples) ? light.samples : 6,
          min: 2, max: 16, step: 1, defaultValue: 6,
          ariaLabel: 'Area light samples',
          ...liveSlider((v) => { const lt = lightById(lid); if (lt) lt.samples = Math.round(v); }),
        });
      }
      if (isSpot) {
        sliderRow(inspectorHost, inspectorComps, 'Cone angle', {
          value: Number.isFinite(light.coneAngle) ? light.coneAngle : 30,
          min: 1, max: 89, step: 1, defaultValue: 30,
          ariaLabel: 'Spot cone angle (degrees)',
          ...liveSlider((v) => { const lt = lightById(lid); if (lt) lt.coneAngle = Math.round(v); }),
        });
        sliderRow(inspectorHost, inspectorComps, 'Penumbra', {
          value: Number.isFinite(light.penumbra) ? light.penumbra : 8,
          min: 0, max: 45, step: 1, defaultValue: 8,
          ariaLabel: 'Spot penumbra (degrees)',
          ...liveSlider((v) => { const lt = lightById(lid); if (lt) lt.penumbra = Math.round(v); }),
        });
        vec3Rows(lid, 'target', 'Target', { x: 0, y: 0, z: 0 });
      }
      sliderRow(inspectorHost, inspectorComps, 'Intensity', {
        value: Number.isFinite(light.intensity) ? light.intensity : (isAmbient ? 0.3 : 1),
        min: 0, max: isAmbient ? 1 : 2, step: 0.05,
        defaultValue: isAmbient ? 0.3 : 1,
        ariaLabel: 'Light intensity',
        ...liveSlider((v) => { const lt = lightById(lid); if (lt) lt.intensity = Math.round(v * 100) / 100; }),
      });
      if (!isAmbient) {
        const row = document.createElement('div');
        row.className = 'vs3-row';
        const lbl = document.createElement('label');
        lbl.className = 'vs3-lbl';
        lbl.textContent = 'Cast shadows';
        row.appendChild(lbl);
        const ctlHost = document.createElement('div');
        ctlHost.className = 'vs3-ctl';
        row.appendChild(ctlHost);
        inspectorHost.appendChild(row);
        inspectorComps.push(UI.SegCtrl(ctlHost, {
          options: [{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }],
          value: light.castShadows === false ? 'off' : 'on',
          ariaLabel: 'Cast shadows',
          onChange: (v) => {
            commit(() => { const lt = lightById(lid); if (lt) lt.castShadows = v === 'on'; });
            renderTree();
            renderInspector();
          },
        }));
        // Scene-level shadow tuning — only meaningful while this light casts.
        if (light.castShadows !== false) renderShadowControls(inspectorHost);
      }
      // Reset to factory default (not for ambient — it has no positional/aim
      // default worth a button).
      if (!isAmbient) {
        const resetRow = document.createElement('div');
        resetRow.className = 'vs3-row vs3-light-reset-row';
        const resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'vs3-light-reset';
        resetBtn.textContent = 'Reset light';
        resetBtn.title = isDir ? 'Restore azimuth 135° / elevation 45°' : 'Restore default position';
        resetBtn.addEventListener('click', () => resetLight(lid));
        resetRow.appendChild(resetBtn);
        inspectorHost.appendChild(resetRow);
      }
    };

    const renderInspector = () => {
      if (!inspectorHost) return;
      destroyComps(inspectorComps);
      inspectorHost.textContent = '';
      if (sel.objectId && sel.objectId.indexOf('light:') === 0) {
        renderLightInspector(lightById(sel.objectId.slice('light:'.length)));
        return;
      }
      if (sel.objectId === 'light') { // legacy selection → first light
        renderLightInspector(getLights()[0] || null);
        return;
      }
      if (sel.objectId === 'ground') {
        const note = document.createElement('p');
        note.className = 'vs3-empty';
        note.textContent = 'Ground plane — style it from the Style tab (pen, hatch, wireframe).';
        inspectorHost.appendChild(note);
        return;
      }
      const obj = sel.objectId ? getObject(sel.objectId) : null;
      if (!obj) {
        const empty = document.createElement('p');
        empty.className = 'vs3-empty';
        empty.textContent = 'Select an object in the scene tree to edit it.';
        inspectorHost.appendChild(empty);
        return;
      }
      if (!obj.transform || typeof obj.transform !== 'object') {
        obj.transform = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 };
      }
      const t = obj.transform;

      // Name
      const nameRow = document.createElement('div');
      nameRow.className = 'vs3-row';
      const nameLbl = document.createElement('label');
      nameLbl.className = 'vs3-lbl';
      nameLbl.textContent = 'Name';
      nameRow.appendChild(nameLbl);
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'vs3-name-input';
      nameInput.value = obj.name || '';
      nameInput.setAttribute('aria-label', 'Object name');
      nameInput.addEventListener('change', () => {
        const next = nameInput.value.trim();
        if (next && next !== obj.name) {
          commit(() => { obj.name = next; });
          renderTree();
        } else {
          nameInput.value = obj.name || '';
        }
      });
      nameRow.appendChild(nameInput);
      inspectorHost.appendChild(nameRow);

      // Role (CSG): Solid or Hole. A hole subtracts inside a boolean group; an
      // ungrouped hole is inert (renders solid). When set to Hole a "Cut into"
      // picker points it at a solid, creating/reusing a subtract group.
      const roleRow = document.createElement('div');
      roleRow.className = 'vs3-row';
      const roleLbl = document.createElement('label');
      roleLbl.className = 'vs3-lbl';
      roleLbl.textContent = 'Role';
      roleRow.appendChild(roleLbl);
      const roleHost = document.createElement('div');
      roleHost.className = 'vs3-ctl';
      roleRow.appendChild(roleHost);
      inspectorHost.appendChild(roleRow);
      inspectorComps.push(UI.SegCtrl(roleHost, {
        options: [{ value: 'solid', label: 'Solid' }, { value: 'hole', label: 'Hole' }],
        value: obj.role === 'hole' ? 'hole' : 'solid',
        ariaLabel: 'CSG role (solid or hole)',
        onChange: (v) => {
          commit(() => {
            obj.role = v;
            if (v !== 'hole') removeObjFromGroups(obj.id); // solids never subtract
          });
          renderTree();
          renderInspector();
        },
      }));

      if (obj.role === 'hole') {
        const solids = params.objects.filter((o) => o && o.id !== obj.id && (o.role || 'solid') !== 'hole');
        const cutRow = document.createElement('div');
        cutRow.className = 'vs3-row';
        const cutLbl = document.createElement('label');
        cutLbl.className = 'vs3-lbl';
        cutLbl.textContent = 'Cut into';
        cutRow.appendChild(cutLbl);
        const cutHost = document.createElement('div');
        cutHost.className = 'vs3-ctl';
        cutRow.appendChild(cutHost);
        inspectorHost.appendChild(cutRow);
        inspectorComps.push(UI.Select(cutHost, {
          options: [{ value: '', label: '— None (inert) —' }]
            .concat(solids.map((o) => ({ value: o.id, label: o.name || o.id }))),
          value: holeTargetOf(obj.id),
          ariaLabel: 'Subtract this hole into a solid',
          onChange: (v) => subtractInto(obj.id, v),
        }));
      }

      // Canonical per-primitive defaults (what a fresh object gets) — the reset
      // target for double-click on a dimension/fidelity handle (feedback #4).
      const primDefaults = (PRIMITIVES[obj.primitive] && PRIMITIVES[obj.primitive].defaults())
        || {};

      const posProps = (axis) => ({
        value: Number.isFinite(t[axis]) ? t[axis] : 0,
        min: -200, max: 200, step: 0.5,
        defaultValue: 0,
        ariaLabel: `Position ${axis.toUpperCase()} (mm)`,
        ...liveSlider((v) => { obj.transform[axis] = v; }),
      });
      sliderRow(inspectorHost, inspectorComps, 'X (mm)', posProps('x'));
      sliderRow(inspectorHost, inspectorComps, 'Y (mm)', posProps('y'));
      sliderRow(inspectorHost, inspectorComps, 'Z (mm)', posProps('z'));

      const rotProps = (axis, label) => ({
        value: Number.isFinite(t[axis]) ? t[axis] : 0,
        min: -180, max: 180, step: 1,
        defaultValue: 0,
        ariaLabel: `${label} (degrees)`,
        ...liveSlider((v) => { obj.transform[axis] = v; }),
      });
      sliderRow(inspectorHost, inspectorComps, 'Yaw', rotProps('yaw', 'Yaw'));
      sliderRow(inspectorHost, inspectorComps, 'Pitch', rotProps('pitch', 'Pitch'));
      sliderRow(inspectorHost, inspectorComps, 'Roll', rotProps('roll', 'Roll'));

      // Uniform scale — writes the base `scale` and clears any per-axis (I23)
      // divergence, so the object snaps back to uniform.
      sliderRow(inspectorHost, inspectorComps, 'Scale', {
        value: Number.isFinite(t.scale) ? t.scale : 1,
        min: 0.1, max: 5, step: 0.05,
        defaultValue: 1,
        ariaLabel: 'Uniform scale',
        ...liveSlider((v) => {
          obj.transform.scale = v;
          delete obj.transform.sx;
          delete obj.transform.sy;
          delete obj.transform.sz;
        }),
      });
      // Per-axis (non-uniform) scale — I23. Each row shows the effective factor
      // for its local axis (falls back to the uniform `scale`). Editing one axis
      // seeds the others from the uniform base so the object becomes non-uniform
      // without silently resetting the untouched axes.
      const axisScaleProps = (axis) => {
        const key = `s${axis}`; // sx / sy / sz
        const base = Number.isFinite(t.scale) ? t.scale : 1;
        return {
          value: Number.isFinite(t[key]) ? t[key] : base,
          min: 0.1, max: 5, step: 0.05,
          defaultValue: 1,
          ariaLabel: `Scale ${axis.toUpperCase()}`,
          ...liveSlider((v) => {
            const b = Number.isFinite(obj.transform.scale) ? obj.transform.scale : 1;
            if (!Number.isFinite(obj.transform.sx)) obj.transform.sx = b;
            if (!Number.isFinite(obj.transform.sy)) obj.transform.sy = b;
            if (!Number.isFinite(obj.transform.sz)) obj.transform.sz = b;
            obj.transform[key] = v;
          }),
        };
      };
      sliderRow(inspectorHost, inspectorComps, 'Scale X', axisScaleProps('x'));
      sliderRow(inspectorHost, inspectorComps, 'Scale Y', axisScaleProps('y'));
      sliderRow(inspectorHost, inspectorComps, 'Scale Z', axisScaleProps('z'));

      // Dimensions — per-primitive shape params, in the terms a user expects.
      const dims = DIMENSIONS[obj.primitive];
      if (dims && dims.length) {
        if (!obj.params || typeof obj.params !== 'object') obj.params = {};
        const fallbackFor = (key) => (key === 'radius' ? 25 : 30);
        dims.forEach((d) => {
          const cur = Number.isFinite(obj.params[d.key]) ? obj.params[d.key] : fallbackFor(d.key);
          const dflt = Number.isFinite(primDefaults[d.key]) ? primDefaults[d.key] : fallbackFor(d.key);
          sliderRow(inspectorHost, inspectorComps, d.label, {
            value: cur,
            min: d.min, max: d.max, step: d.step,
            defaultValue: dflt,
            ariaLabel: `${obj.primitive} ${d.label.toLowerCase()}`,
            ...liveSlider((v) => {
              obj.params[d.key] = v;
              if (Array.isArray(d.extraKeys)) d.extraKeys.forEach((k) => { obj.params[k] = v; });
            }),
          });
        });
      }

      // Fidelity — surface tessellation for curved primitives. Higher = smoother
      // silhouette and more surface detail, at the cost of more plotted lines.
      if (FIDELITY_PRIMS.has(obj.primitive)) {
        if (!obj.params || typeof obj.params !== 'object') obj.params = {};
        const curDetail = Number.isFinite(obj.params.detail) ? obj.params.detail : 24;
        const dfltDetail = Number.isFinite(primDefaults.detail) ? primDefaults.detail : 24;
        sliderRow(inspectorHost, inspectorComps, 'Fidelity', {
          value: curDetail,
          min: 6, max: 48, step: 1,
          defaultValue: dfltDetail,
          ariaLabel: 'Surface fidelity (tessellation detail)',
          ...liveSlider((v) => { obj.params.detail = Math.round(v); }),
        });
      }

      // Visibility
      const visRow = document.createElement('div');
      visRow.className = 'vs3-row';
      const visLbl = document.createElement('label');
      visLbl.className = 'vs3-lbl';
      visLbl.textContent = 'Visibility';
      visRow.appendChild(visLbl);
      const visHost = document.createElement('div');
      visHost.className = 'vs3-ctl';
      visRow.appendChild(visHost);
      inspectorHost.appendChild(visRow);
      inspectorComps.push(UI.SegCtrl(visHost, {
        options: [{ value: 'solid', label: 'Solid' }, { value: 'xray', label: 'X-ray' }],
        value: obj.visibility === 'xray' ? 'xray' : 'solid',
        ariaLabel: 'Object visibility',
        onChange: (v) => {
          commit(() => { obj.visibility = v; });
          renderTree();
        },
      }));

      // Per-object cast-shadow toggle (Phase 5). Inherit = follow the scene
      // (cast); Off = this object drops no shadow; On = force cast. Stored on
      // obj.shadow.enabled (null | true | false).
      const shadowRow = document.createElement('div');
      shadowRow.className = 'vs3-row';
      const shadowLbl = document.createElement('label');
      shadowLbl.className = 'vs3-lbl';
      shadowLbl.textContent = 'Cast shadow';
      shadowRow.appendChild(shadowLbl);
      const shadowHost = document.createElement('div');
      shadowHost.className = 'vs3-ctl';
      shadowRow.appendChild(shadowHost);
      inspectorHost.appendChild(shadowRow);
      const castVal = obj.shadow && obj.shadow.enabled === false ? 'off'
        : (obj.shadow && obj.shadow.enabled === true ? 'on' : 'inherit');
      inspectorComps.push(UI.SegCtrl(shadowHost, {
        options: [{ value: 'inherit', label: 'Auto' }, { value: 'on', label: 'On' }, { value: 'off', label: 'Off' }],
        value: castVal,
        ariaLabel: 'Object casts shadow',
        onChange: (v) => {
          commit(() => {
            if (!obj.shadow || typeof obj.shadow !== 'object') obj.shadow = { enabled: null };
            obj.shadow.enabled = v === 'on' ? true : (v === 'off' ? false : null);
          });
        },
      }));

      // ── Emissive (Phase 7 — the sixth light type). An emissive object glows
      // (radial burst / concentric halo rings, with a blank/bright core) AND acts
      // as a co-located point light on every OTHER object. Default OFF ⇒ no ink,
      // no contribution. Live-slider intensity (one undo/gesture); the enable /
      // halo / core toggles + pen route through commit (whole-value write + regen).
      const ensureEmissive = () => {
        if (!obj.emissive || typeof obj.emissive !== 'object') {
          obj.emissive = { enabled: false, intensity: 1, penId: null, halo: 'burst', haloCount: 16, haloRings: 3, coreBlank: true };
        }
        return obj.emissive;
      };
      const em = ensureEmissive();
      const emRow = document.createElement('div');
      emRow.className = 'vs3-row';
      const emLbl = document.createElement('label');
      emLbl.className = 'vs3-lbl';
      emLbl.textContent = 'Emissive';
      emRow.appendChild(emLbl);
      const emHost = document.createElement('div');
      emHost.className = 'vs3-ctl';
      emRow.appendChild(emHost);
      inspectorHost.appendChild(emRow);
      inspectorComps.push(UI.SegCtrl(emHost, {
        options: [{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }],
        value: em.enabled ? 'on' : 'off',
        ariaLabel: 'Emissive (object emits light)',
        onChange: (v) => {
          commit(() => { ensureEmissive().enabled = v === 'on'; });
          renderInspector();
        },
      }));
      if (em.enabled) {
        const emSub = document.createElement('div');
        emSub.className = 'vs3-emissive-controls';
        inspectorHost.appendChild(emSub);

        sliderRow(emSub, inspectorComps, 'Glow strength', {
          value: Number.isFinite(em.intensity) ? em.intensity : 1,
          min: 0, max: 4, step: 0.05, defaultValue: 1,
          ariaLabel: 'Emissive intensity',
          ...liveSlider((v) => { ensureEmissive().intensity = Math.round(v * 100) / 100; }),
        });

        const haloRow = document.createElement('div');
        haloRow.className = 'vs3-row';
        const haloLbl = document.createElement('label');
        haloLbl.className = 'vs3-lbl';
        haloLbl.textContent = 'Halo';
        haloRow.appendChild(haloLbl);
        const haloHost = document.createElement('div');
        haloHost.className = 'vs3-ctl';
        haloRow.appendChild(haloHost);
        emSub.appendChild(haloRow);
        inspectorComps.push(UI.SegCtrl(haloHost, {
          options: [{ value: 'burst', label: 'Burst' }, { value: 'ring', label: 'Rings' }, { value: 'none', label: 'None' }],
          value: ['burst', 'ring', 'none'].includes(em.halo) ? em.halo : 'burst',
          ariaLabel: 'Emissive halo style',
          onChange: (v) => { commit(() => { ensureEmissive().halo = v; }); renderInspector(); },
        }));

        if (em.halo === 'burst') {
          sliderRow(emSub, inspectorComps, 'Rays', {
            value: Number.isFinite(em.haloCount) ? em.haloCount : 16,
            min: 4, max: 48, step: 1, defaultValue: 16,
            ariaLabel: 'Emissive burst ray count',
            ...liveSlider((v) => { ensureEmissive().haloCount = Math.round(v); }),
          });
        } else if (em.halo === 'ring') {
          sliderRow(emSub, inspectorComps, 'Rings', {
            value: Number.isFinite(em.haloRings) ? em.haloRings : 3,
            min: 1, max: 6, step: 1, defaultValue: 3,
            ariaLabel: 'Emissive halo ring count',
            ...liveSlider((v) => { ensureEmissive().haloRings = Math.round(v); }),
          });
        }

        const coreRow = document.createElement('div');
        coreRow.className = 'vs3-row';
        const coreLbl = document.createElement('label');
        coreLbl.className = 'vs3-lbl';
        coreLbl.textContent = 'Blank core';
        coreRow.appendChild(coreLbl);
        const coreHost = document.createElement('div');
        coreHost.className = 'vs3-ctl';
        coreRow.appendChild(coreHost);
        emSub.appendChild(coreRow);
        inspectorComps.push(UI.SegCtrl(coreHost, {
          options: [{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }],
          value: em.coreBlank === false ? 'off' : 'on',
          ariaLabel: 'Leave the emissive core blank (bright)',
          onChange: (v) => { commit(() => { ensureEmissive().coreBlank = v === 'on'; }); },
        }));

        const emPens = (Vectura.SETTINGS && Array.isArray(Vectura.SETTINGS.pens)) ? Vectura.SETTINGS.pens : [];
        const emPenRow = document.createElement('div');
        emPenRow.className = 'vs3-row';
        const emPenLbl = document.createElement('label');
        emPenLbl.className = 'vs3-lbl';
        emPenLbl.textContent = 'Glow pen';
        emPenRow.appendChild(emPenLbl);
        const emPenHost = document.createElement('div');
        emPenHost.className = 'vs3-ctl';
        emPenRow.appendChild(emPenHost);
        emSub.appendChild(emPenRow);
        inspectorComps.push(UI.Select(emPenHost, {
          options: [{ value: '', label: 'Inherit' }].concat(emPens.map((pn) => ({ value: pn.id, label: pn.name || pn.id }))),
          value: em.penId || '',
          ariaLabel: 'Emissive glow pen (Inherit = object pen)',
          onChange: (v) => { commit(() => { ensureEmissive().penId = v || null; }); },
        }));
      }
    };

    // ── Style tab (CONTRACT C editor) ───────────────────────────────────────
    const currentStyleScope = () => {
      if (sel.mode === 'face' && sel.faceKey) {
        const slash = sel.faceKey.indexOf('/');
        return {
          scope: 'face',
          key: sel.faceKey,
          target: { objectId: sel.faceKey.slice(0, slash), faceId: sel.faceKey.slice(slash + 1) },
        };
      }
      if (sel.objectId) {
        return { scope: 'object', key: sel.objectId, target: { objectId: sel.objectId } };
      }
      return { scope: 'scene', key: null, target: {} };
    };

    const scopeDisplayName = (scope) => {
      if (scope.scope === 'scene') return 'Scene';
      const obj = getObject(scope.target.objectId);
      const objName = obj ? (obj.name || obj.id) : scope.target.objectId;
      if (scope.scope === 'face') return `${objName} · ${scope.target.faceId}`;
      return objName;
    };

    const renderStyle = () => {
      if (!styleHost) return;
      destroyComps(styleComps);
      styleHost.textContent = '';

      if (!SC) {
        const warn = document.createElement('p');
        warn.className = 'vs3-empty';
        warn.textContent = 'Style cascade module not loaded.';
        styleHost.appendChild(warn);
        return;
      }

      const scope = currentStyleScope();
      const table = ensureStyleTable();
      const resolved = SC.resolve(table, scope.target);
      const setHere = resolved.provenance.scope === scope.scope;

      // Scope line
      const scopeLine = document.createElement('div');
      scopeLine.className = 'vs3-style-scope';
      scopeLine.textContent = `Editing: ${scopeDisplayName(scope)}`;
      styleHost.appendChild(scopeLine);

      // Provenance chip
      const chip = document.createElement('div');
      chip.className = 'vs3-prov-chip';
      chip.classList.toggle('is-inherited', !setHere);
      const chipText = document.createElement('span');
      chipText.className = 'vs3-prov-text';
      chipText.textContent = `Styled by: ${cap(resolved.provenance.scope)}`;
      chip.appendChild(chipText);
      if (setHere && scope.scope !== 'scene') {
        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'vs3-prov-clear';
        clearBtn.title = 'Clear this override (inherit from broader scope)';
        clearBtn.setAttribute('aria-label', 'Clear style override');
        clearBtn.textContent = '✕';
        clearBtn.addEventListener('click', () => {
          commit(() => { SC.clearStyle(ensureStyleTable(), scope.scope, scope.key); });
          renderStyle();
        });
        chip.appendChild(clearBtn);
      }
      styleHost.appendChild(chip);

      // Whole-style commit at the CURRENT scope (CONTRACT C: no field merge —
      // every edit writes the full resolved style with the edited field).
      const commitStyle = (patch) => {
        const style = {
          penId: resolved.penId,
          mapper: resolved.mapper,
          params: clone(resolved.params || {}),
        };
        Object.keys(patch).forEach((k) => { style[k] = patch[k]; });
        commit(() => { SC.setStyle(ensureStyleTable(), scope.scope, scope.key, style); });
        renderStyle();
      };

      // Pen
      const penRow = document.createElement('div');
      penRow.className = 'vs3-row';
      const penLbl = document.createElement('label');
      penLbl.className = 'vs3-lbl';
      penLbl.textContent = 'Pen';
      penRow.appendChild(penLbl);
      const penHost = document.createElement('div');
      penHost.className = 'vs3-ctl';
      penRow.appendChild(penHost);
      styleHost.appendChild(penRow);
      const pens = (Vectura.SETTINGS && Array.isArray(Vectura.SETTINGS.pens)) ? Vectura.SETTINGS.pens : [];
      styleComps.push(UI.Select(penHost, {
        options: [{ value: '', label: 'Layer pen' }].concat(
          pens.map((p) => ({ value: p.id, label: p.name || p.id })),
        ),
        value: resolved.penId || '',
        ariaLabel: 'Style pen',
        onChange: (v) => commitStyle({ penId: v || null }),
      }));

      // Mapper
      const mapRow = document.createElement('div');
      mapRow.className = 'vs3-row';
      const mapLbl = document.createElement('label');
      mapLbl.className = 'vs3-lbl';
      mapLbl.textContent = 'Mapper';
      mapRow.appendChild(mapLbl);
      const mapHost = document.createElement('div');
      mapHost.className = 'vs3-ctl';
      mapRow.appendChild(mapHost);
      styleHost.appendChild(mapRow);
      styleComps.push(UI.Select(mapHost, {
        options: MAPPERS,
        value: resolved.mapper || 'none',
        ariaLabel: 'Style mapper',
        onChange: (v) => commitStyle({ mapper: v, params: mapperDefaults(v, resolved.params) }),
      }));

      // ── Mapper-specific controls (Phase 2) — driven by the MAPPER_CONTROLS
      // descriptor table, one control per descriptor, wired to the whole-style
      // commit path (CONTRACT C, one undo per gesture). This is the single home
      // for every mapper's OWN params (density/angle/family/spiral/stipple/edge
      // classes); the shared Line block + x-ray block follow.
      const labeledHost = (label) => {
        const row = document.createElement('div');
        row.className = 'vs3-row';
        const lbl = document.createElement('label');
        lbl.className = 'vs3-lbl';
        lbl.textContent = label;
        row.appendChild(lbl);
        const host = document.createElement('div');
        host.className = 'vs3-ctl';
        row.appendChild(host);
        styleHost.appendChild(row);
        return host;
      };
      const renderControl = (d) => {
        const rp = resolved.params || {};
        const has = rp[d.key] !== undefined && rp[d.key] !== null;
        const raw = has ? rp[d.key] : d.default;
        const write = (val) => commitStyle({ params: { ...clone(resolved.params || {}), [d.key]: val } });
        const aria = d.ariaLabel || d.label;
        if (d.kind === 'slider') {
          sliderRow(styleHost, styleComps, d.label, {
            value: Number.isFinite(raw) ? raw : d.default,
            min: d.min, max: d.max, step: d.step, defaultValue: d.default, ariaLabel: aria,
            onCommit: (v) => write(v),
          });
        } else if (d.kind === 'dial') {
          const host = labeledHost(d.label);
          const dv = Number.isFinite(raw) ? raw : d.default;
          const clampV = (v) => Math.min(d.max, Math.max(d.min, v));
          if (UI.AngleDial) {
            styleComps.push(UI.AngleDial(host, { value: dv, ariaLabel: aria, defaultValue: d.default, onCommit: (v) => write(clampV(v)) }));
          } else {
            styleComps.push(UI.Slider(host, { value: dv, min: d.min, max: d.max, step: d.step, defaultValue: d.default, ariaLabel: aria, onCommit: (v) => write(v) }));
          }
        } else if (d.kind === 'select') {
          styleComps.push(UI.Select(labeledHost(d.label), { options: d.options, value: typeof raw === 'string' ? raw : d.default, ariaLabel: aria, onChange: (v) => write(v) }));
        } else if (d.kind === 'seg') {
          styleComps.push(UI.SegCtrl(labeledHost(d.label), { options: d.options, value: typeof raw === 'string' ? raw : d.default, ariaLabel: aria, onChange: (v) => write(v) }));
        } else if (d.kind === 'toggle') {
          styleComps.push(UI.SegCtrl(labeledHost(d.label), {
            options: [{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }],
            value: raw === true ? 'on' : 'off', ariaLabel: aria, onChange: (v) => write(v === 'on'),
          }));
        } else if (d.kind === 'multi') {
          const cur = raw && typeof raw === 'object' ? raw : d.default;
          const selected = d.options.filter((o) => cur[o.value] !== false).map((o) => o.value);
          styleComps.push(UI.TogGrp(labeledHost(d.label), {
            options: d.options, multiple: true, value: selected, ariaLabel: aria,
            onChange: (arr) => {
              const next = {};
              d.options.forEach((o) => { next[o.value] = arr.indexOf(o.value) !== -1; });
              write(next);
            },
          }));
        }
      };
      (MAPPER_CONTROLS[resolved.mapper] || []).forEach(renderControl);

      // ── Shared line treatment (Phase 1.1) — every fill mapper. Writes the
      // stroke params honored at the scene3d emit chokepoint (line type / dash
      // scale / hand wobble). One-undo-per-gesture via liveSlider on the sliders.
      if (FILL_MAPPERS.has(resolved.mapper)) {
        const sp = () => clone(resolved.params || {});
        const rp = resolved.params || {};

        const lineTypeRow = document.createElement('div');
        lineTypeRow.className = 'vs3-row';
        const ltLbl = document.createElement('label');
        ltLbl.className = 'vs3-lbl';
        ltLbl.textContent = 'Line';
        lineTypeRow.appendChild(ltLbl);
        const ltHost = document.createElement('div');
        ltHost.className = 'vs3-ctl';
        lineTypeRow.appendChild(ltHost);
        styleHost.appendChild(lineTypeRow);
        styleComps.push(UI.Select(ltHost, {
          options: LINE_TYPE_OPTIONS,
          value: typeof rp.lineType === 'string' ? rp.lineType : 'solid',
          ariaLabel: 'Line type',
          onChange: (v) => commitStyle({ params: { ...sp(), lineType: v } }),
        }));

        // Dash length (I15) — scales the dash pattern length. Only meaningful
        // when the line dashes, so it's hidden for a solid line and shown for
        // dashed / dash-dot / dotted. The lineType Select re-renders via
        // commitStyle, so the row appears/disappears on the toggle. Style writes
        // route through commitStyle (CONTRACT C whole-style write) = one
        // undo/gesture, preview on release — same pattern as Density / Angle.
        const lt = typeof rp.lineType === 'string' ? rp.lineType : 'solid';
        if (lt === 'dashed' || lt === 'dashdot' || lt === 'dotted') {
          sliderRow(styleHost, styleComps, 'Dash length', {
            value: Number.isFinite(rp.dashScale) ? rp.dashScale : STROKE_DEFAULTS.dashScale,
            min: 0.25, max: 4, step: 0.05,
            defaultValue: STROKE_DEFAULTS.dashScale,
            ariaLabel: 'Dash length',
            onCommit: (v) => commitStyle({ params: { ...sp(), dashScale: v } }),
          });
        }

        sliderRow(styleHost, styleComps, 'Wobble', {
          value: Number.isFinite(rp.wobble) ? rp.wobble : STROKE_DEFAULTS.wobble,
          min: 0, max: 100, step: 1,
          defaultValue: STROKE_DEFAULTS.wobble,
          ariaLabel: 'Hand wobble',
          onCommit: (v) => commitStyle({ params: { ...sp(), wobble: v } }),
        });
      }

      // ── Border (I6) — per-object silhouette outline. Object scope only.
      // Writes obj.border.* directly (a per-object field, not style.params),
      // mirroring the ctxbar Style flyout. Enable reveals Weight + Pen. Lives in
      // the main Style controls (moved here from the Highlight surface).
      if (scope.scope === 'object' && getObject(scope.target.objectId)) {
        const border = (getObject(scope.target.objectId) || {}).border || {};
        const writeBorder = (key, value) => {
          commit(() => {
            const o = getObject(scope.target.objectId);
            if (!o.border || typeof o.border !== 'object') o.border = {};
            o.border[key] = value;
          });
        };

        const bHdr = document.createElement('div');
        bHdr.className = 'vs3-hl-hdr';
        bHdr.textContent = 'Border';
        styleHost.appendChild(bHdr);

        styleComps.push(UI.SegCtrl(labeledHost('Border'), {
          options: [{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }],
          value: border.enabled ? 'on' : 'off',
          ariaLabel: 'Silhouette border',
          onChange: (v) => { writeBorder('enabled', v === 'on'); renderStyle(); },
        }));

        if (border.enabled) {
          sliderRow(styleHost, styleComps, 'Weight', {
            value: Number.isFinite(border.strength) ? border.strength : 1,
            min: 0.25, max: 4, step: 0.05,
            defaultValue: 1,
            ariaLabel: 'Border strength',
            onCommit: (v) => writeBorder('strength', v),
          });
          styleComps.push(UI.Select(labeledHost('Pen'), {
            options: [{ value: '', label: 'Edge pen' }].concat(
              pens.map((pn) => ({ value: pn.id, label: pn.name || pn.id })),
            ),
            value: border.penId || '',
            ariaLabel: 'Border pen',
            onChange: (v) => writeBorder('penId', v || null),
          }));
        }
      }

      // ── Highlight treatment (Phase 4) — every fill mapper. Selects what the
      // top tone band(s) render as instead of always dropping to bare paper
      // (blank = the legacy look). Sub-controls (band count / density / alt-fill
      // mapper / burst) appear per treatment. Writes style.params; scene3d reads
      // them. Reads-with-default (like the x-ray block) — no forced seeding, so a
      // 'blank' scene stays byte-identical.
      if (FILL_MAPPERS.has(resolved.mapper)) {
        const sp = () => clone(resolved.params || {});
        const rp = resolved.params || {};
        const treatment = HIGHLIGHT_TREATMENT_OPTIONS.some((o) => o.value === rp.highlightTreatment)
          ? rp.highlightTreatment : 'blank';

        const hlHdr = document.createElement('div');
        hlHdr.className = 'vs3-hl-hdr';
        hlHdr.textContent = 'Highlight';
        styleHost.appendChild(hlHdr);

        styleComps.push(UI.Select(labeledHost('Treatment'), {
          options: HIGHLIGHT_TREATMENT_OPTIONS,
          value: treatment,
          ariaLabel: 'Highlight treatment',
          onChange: (v) => commitStyle({ params: { ...sp(), highlightTreatment: v } }),
        }));

        // I8 — highlight MODE: 'perFace' (the legacy per-face/per-band highlight)
        // vs 'lightDriven' (the highlight is placed by the ACTUAL per-sample
        // specular — a localized glint that spans the faces a nearby point light
        // lights). lightDriven adds a Sensitivity slider (1 = binary difference,
        // N = a graded gradient). Shadow grade mirrors it on the dark end.
        const hlMode = rp.highlightMode === 'lightDriven' ? 'lightDriven' : 'perFace';
        styleComps.push(UI.SegCtrl(labeledHost('Highlight mode'), {
          options: [{ value: 'perFace', label: 'Per-face' }, { value: 'lightDriven', label: 'Light' }],
          value: hlMode,
          ariaLabel: 'Highlight mode',
          onChange: (v) => commitStyle({ params: { ...sp(), highlightMode: v } }),
        }));
        const stageOf = (val) => Math.min(6, Math.max(1, Math.round(Number.isFinite(val) ? val : 1)));
        if (hlMode === 'lightDriven') {
          sliderRow(styleHost, styleComps, 'Sensitivity', {
            value: stageOf(rp.highlightSensitivity),
            min: 1, max: 6, step: 1, defaultValue: 1, ariaLabel: 'Highlight sensitivity',
            onCommit: (v) => commitStyle({ params: { ...sp(), highlightSensitivity: Math.round(v) } }),
          });
        }
        // Shadow grade (dark-side sensitivity) applies in BOTH modes — default 1
        // is the byte-identical no-op.
        sliderRow(styleHost, styleComps, 'Shadow grade', {
          value: stageOf(rp.shadowSensitivity),
          min: 1, max: 6, step: 1, defaultValue: 1, ariaLabel: 'Shadow sensitivity',
          onCommit: (v) => commitStyle({ params: { ...sp(), shadowSensitivity: Math.round(v) } }),
        });

        if (treatment !== 'blank') {
          const bands = Math.min(2, Math.max(1, Math.round(Number.isFinite(rp.highlightBands) ? rp.highlightBands : 1)));
          styleComps.push(UI.SegCtrl(labeledHost('Bands'), {
            options: [{ value: '1', label: '1' }, { value: '2', label: '2' }],
            value: String(bands),
            ariaLabel: 'Highlight band count',
            onChange: (v) => commitStyle({ params: { ...sp(), highlightBands: parseInt(v, 10) } }),
          }));

          if (treatment === 'sparse' || treatment === 'altFill' || treatment === 'stippleOut') {
            sliderRow(styleHost, styleComps, 'HL density', {
              value: Number.isFinite(rp.highlightDensity) ? rp.highlightDensity : 25,
              min: 1, max: 100, step: 1, defaultValue: 25, ariaLabel: 'Highlight density',
              onCommit: (v) => commitStyle({ params: { ...sp(), highlightDensity: v } }),
            });
          }
          if (treatment === 'altFill') {
            styleComps.push(UI.Select(labeledHost('Alt fill'), {
              options: ALT_FILL_MAPPER_OPTIONS,
              value: ALT_FILL_MAPPER_OPTIONS.some((o) => o.value === rp.altFillMapper) ? rp.altFillMapper : 'stipple',
              ariaLabel: 'Alternate fill mapper',
              onChange: (v) => commitStyle({ params: { ...sp(), altFillMapper: v } }),
            }));
          }
          if (treatment === 'burst') {
            sliderRow(styleHost, styleComps, 'Burst count', {
              value: Number.isFinite(rp.burstCount) ? rp.burstCount : 16,
              min: 6, max: 48, step: 1, defaultValue: 16, ariaLabel: 'Burst ray count',
              onCommit: (v) => commitStyle({ params: { ...sp(), burstCount: v } }),
            });
            styleComps.push(UI.SegCtrl(labeledHost('Burst centre'), {
              options: [{ value: 'specular', label: 'Glint' }, { value: 'centroid', label: 'Centre' }],
              value: rp.burstCenter === 'centroid' ? 'centroid' : 'specular',
              ariaLabel: 'Burst centre',
              onChange: (v) => commitStyle({ params: { ...sp(), burstCenter: v } }),
            }));
          }
          // Highlight pen (inherit unless overridden).
          styleComps.push(UI.Select(labeledHost('HL pen'), {
            options: [{ value: '', label: 'Inherit' }].concat(pens.map((pn) => ({ value: pn.id, label: pn.name || pn.id }))),
            value: rp.highlightPenId || '',
            ariaLabel: 'Highlight pen',
            onChange: (v) => commitStyle({ params: { ...sp(), highlightPenId: v || null } }),
          }));
        }
      }

      // ── X-ray controls (Phase 6) — shown only when the selected OBJECT is set
      // to visibility:'xray' (the tree eye toggle is the on/off). These shape how
      // the far surface shows through: back-face fills (THE FIX), their density /
      // line / pen, the dashed hidden edges, and the near-surface fade.
      const xrayObj = getObject(scope.target.objectId);
      if (xrayObj && xrayObj.visibility === 'xray') {
        const sp = () => clone(resolved.params || {});
        const rp = resolved.params || {};

        const hdr = document.createElement('div');
        hdr.className = 'vs3-xray-hdr';
        hdr.textContent = 'X-ray';
        styleHost.appendChild(hdr);

        const toggleRow = (label, aria, on, onChange) => {
          const row = document.createElement('div');
          row.className = 'vs3-row';
          const lbl = document.createElement('label');
          lbl.className = 'vs3-lbl';
          lbl.textContent = label;
          row.appendChild(lbl);
          const host = document.createElement('div');
          host.className = 'vs3-ctl';
          row.appendChild(host);
          styleHost.appendChild(row);
          styleComps.push(UI.SegCtrl(host, {
            options: [{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }],
            value: on ? 'on' : 'off',
            ariaLabel: aria,
            onChange: (v) => onChange(v === 'on'),
          }));
        };
        const selectRow = (label, aria, options, value, onChange) => {
          const row = document.createElement('div');
          row.className = 'vs3-row';
          const lbl = document.createElement('label');
          lbl.className = 'vs3-lbl';
          lbl.textContent = label;
          row.appendChild(lbl);
          const host = document.createElement('div');
          host.className = 'vs3-ctl';
          row.appendChild(host);
          styleHost.appendChild(row);
          styleComps.push(UI.Select(host, { options, value, ariaLabel: aria, onChange }));
        };

        // Back-face fills (the fix) — default ON.
        toggleRow('Back faces', 'X-ray back-face fills', rp.xrayBackFaces !== false,
          (on) => commitStyle({ params: { ...sp(), xrayBackFaces: on } }));

        // Back density (0.2–1) — far surface sparser than the near one.
        sliderRow(styleHost, styleComps, 'Back density', {
          value: Number.isFinite(rp.xrayBackDensity) ? rp.xrayBackDensity : 0.4,
          min: 0.2, max: 1, step: 0.05,
          defaultValue: 0.4,
          ariaLabel: 'X-ray back-face density',
          onCommit: (v) => commitStyle({ params: { ...sp(), xrayBackDensity: v } }),
        });

        // Back line type — default dashed (the see-through read).
        selectRow('Back line', 'X-ray back-face line type', LINE_TYPE_OPTIONS,
          typeof rp.xrayBackLineType === 'string' ? rp.xrayBackLineType : 'dashed',
          (v) => commitStyle({ params: { ...sp(), xrayBackLineType: v } }));

        // Back pen — inherit the object pen unless overridden.
        selectRow('Back pen', 'X-ray back-face pen',
          [{ value: '', label: 'Inherit' }].concat(pens.map((pn) => ({ value: pn.id, label: pn.name || pn.id }))),
          rp.xrayBackPenId || '',
          (v) => commitStyle({ params: { ...sp(), xrayBackPenId: v || null } }));

        // X-RAY FOLD: hidden EDGES are no longer an x-ray control — the per-object
        // Edge Styles → Hidden → Drop|Dash owns them. The X-ray group is fills-only
        // now (Back faces / density / line / pen / Front). The xrayHiddenEdges param
        // stays inert (still serialized for back/forward-compat, just unread).

        // Near surface: solid or faded (dotted).
        const frontRow = document.createElement('div');
        frontRow.className = 'vs3-row';
        const frontLbl = document.createElement('label');
        frontLbl.className = 'vs3-lbl';
        frontLbl.textContent = 'Front';
        frontRow.appendChild(frontLbl);
        const frontHost = document.createElement('div');
        frontHost.className = 'vs3-ctl';
        frontRow.appendChild(frontHost);
        styleHost.appendChild(frontRow);
        styleComps.push(UI.SegCtrl(frontHost, {
          options: [{ value: 'solid', label: 'Solid' }, { value: 'faded', label: 'Faded' }],
          value: rp.xrayFront === 'faded' ? 'faded' : 'solid',
          ariaLabel: 'X-ray near surface',
          onChange: (v) => commitStyle({ params: { ...sp(), xrayFront: v } }),
        }));
      }

      // ── Edge Styles (C-06) — SCENE-WIDE per-edge-class styling. Mounts on the
      // scene group (scope 'scene'). Each class carries its own pen / weight /
      // dash; `hidden` adds an occluded-edge Drop|Dash selector (Drop = today's
      // solid look, Dash = the x-ray see-through look, now available scene-wide
      // WITHOUT per-object x-ray). Writes params.edgeStyles directly (a scene
      // field, not a cascade style). Every default is a no-op ⇒ byte-identical.
      if (scope.scope === 'scene') {
        const EDGE_CLASSES = [
          { key: 'silhouette', label: 'Silhouette' },
          { key: 'crease', label: 'Crease' },
          { key: 'boundary', label: 'Boundary' },
          { key: 'interior', label: 'Interior' },
          { key: 'hidden', label: 'Hidden' },
        ];
        const DASH_OPTS = [
          { value: 'none', label: 'Solid' },
          { value: 'dashed', label: 'Dashed' },
          { value: 'dotted', label: 'Dotted' },
        ];
        const DASH_PATTERNS = { dashed: [3, 2], dotted: [0.6, 1.6] };
        const dashName = (arr) => {
          if (!Array.isArray(arr) || !arr.length) return 'none';
          return (arr.length === 2 && arr[0] <= 1) ? 'dotted' : 'dashed';
        };
        const readEdge = (cls) => {
          const table = (params.edgeStyles && typeof params.edgeStyles === 'object') ? params.edgeStyles : {};
          const es = (table[cls] && typeof table[cls] === 'object') ? table[cls] : {};
          return {
            pen: typeof es.pen === 'string' ? es.pen : null,
            weightMm: es.weightMm == null ? null : es.weightMm,
            dash: Array.isArray(es.dash) ? es.dash : null,
            hiddenTreatment: es.hiddenTreatment === 'dash' ? 'dash' : 'drop',
          };
        };
        const writeEdge = (cls, patch) => {
          commit(() => {
            if (!params.edgeStyles || typeof params.edgeStyles !== 'object') params.edgeStyles = {};
            const cur = (params.edgeStyles[cls] && typeof params.edgeStyles[cls] === 'object') ? params.edgeStyles[cls] : {};
            params.edgeStyles[cls] = { ...cur, ...patch };
          });
          renderStyle();
        };

        const esHdr = document.createElement('div');
        esHdr.className = 'vs3-hl-hdr';
        esHdr.textContent = 'Edge Styles';
        styleHost.appendChild(esHdr);

        EDGE_CLASSES.forEach(({ key, label }) => {
          const cur = readEdge(key);
          const clsHdr = document.createElement('div');
          clsHdr.className = 'vs3-edge-cls';
          clsHdr.textContent = label;
          styleHost.appendChild(clsHdr);

          styleComps.push(UI.Select(labeledHost('Pen'), {
            options: [{ value: '', label: 'Inherit' }].concat(pens.map((pn) => ({ value: pn.id, label: pn.name || pn.id }))),
            value: cur.pen || '',
            ariaLabel: `${label} edge pen`,
            onChange: (v) => writeEdge(key, { pen: v || null }),
          }));

          sliderRow(styleHost, styleComps, 'Weight', {
            value: cur.weightMm == null ? 0 : cur.weightMm,
            min: 0, max: 2, step: 0.05, defaultValue: 0,
            ariaLabel: `${label} edge weight (0 = inherit)`,
            onCommit: (v) => writeEdge(key, { weightMm: v > 0 ? v : null }),
          });

          styleComps.push(UI.Select(labeledHost('Dash'), {
            options: DASH_OPTS,
            value: dashName(cur.dash),
            ariaLabel: `${label} edge dash`,
            onChange: (v) => writeEdge(key, { dash: DASH_PATTERNS[v] ? DASH_PATTERNS[v].slice() : null }),
          }));

          if (key === 'hidden') {
            styleComps.push(UI.SegCtrl(labeledHost('Occluded'), {
              options: [{ value: 'drop', label: 'Drop' }, { value: 'dash', label: 'Dash' }],
              value: cur.hiddenTreatment,
              ariaLabel: 'Hidden edge treatment',
              onChange: (v) => writeEdge('hidden', { hiddenTreatment: v === 'dash' ? 'dash' : 'drop' }),
            }));
          }
        });
      }
    };

    // ── Tone-band editor (CONTRACT L3) ──────────────────────────────────────
    // Light-driven tone quantization: band count → thresholds → coverage
    // ladder, plus the specular hotspot. Writes params.tone; regions.js (2A)
    // reads it. Flat disables tone entirely (Phase-1 look).
    const BAND_OPTIONS = [
      { value: 'flat', label: 'Flat' },
      { value: '2', label: '2' },
      { value: '3', label: '3' },
      { value: '4', label: '4' },
    ];
    const renderTone = () => {
      if (!toneHost) return;
      destroyComps(toneComps);
      toneHost.textContent = '';
      const tone = ensureTone();

      const bandRow = document.createElement('div');
      bandRow.className = 'vs3-row';
      const bandLbl = document.createElement('label');
      bandLbl.className = 'vs3-lbl';
      bandLbl.textContent = 'Bands';
      bandRow.appendChild(bandLbl);
      const bandCtl = document.createElement('div');
      bandCtl.className = 'vs3-ctl';
      bandRow.appendChild(bandCtl);
      toneHost.appendChild(bandRow);
      toneComps.push(UI.SegCtrl(bandCtl, {
        options: BAND_OPTIONS,
        value: tone.enabled === false ? 'flat' : String(tone.bands),
        ariaLabel: 'Tone bands',
        onChange: (v) => {
          commit(() => {
            const t = ensureTone();
            if (v === 'flat') {
              t.enabled = false;
              t.bands = 1;
            } else {
              const n = parseInt(v, 10);
              t.enabled = true;
              t.bands = n;
              t.thresholds = toneThresholdsFor(n);
              t.ladder = toneLadderFor(n);
            }
          });
          renderTone();
        },
      }));

      if (tone.enabled === false || tone.bands < 2) {
        const note = document.createElement('p');
        note.className = 'vs3-empty';
        note.textContent = 'Flat shading — the sun tints nothing. Pick 2–4 bands for light-driven tone.';
        toneHost.appendChild(note);
        return;
      }

      // Threshold ladder — ascending intensity cut points (length bands-1).
      const thr = tone.thresholds;
      const defThresholds = toneThresholdsFor(tone.bands);
      thr.forEach((_, i) => {
        // Live preview clamps to neighbors every frame; the neighbor re-render
        // (renderTone) only runs on release so it can't tear down an active drag.
        const live = liveSliderFull((v) => {
          const t = ensureTone();
          const lo = i > 0 ? t.thresholds[i - 1] + 0.01 : 0.01;
          const hi = i < t.thresholds.length - 1 ? t.thresholds[i + 1] - 0.01 : 0.99;
          t.thresholds[i] = Math.min(Math.max(v, lo), hi);
        });
        sliderRow(toneHost, toneComps, `Threshold ${i + 1}`, {
          value: Number.isFinite(thr[i]) ? thr[i] : (i + 1) / tone.bands,
          min: 0.01, max: 0.99, step: 0.01,
          defaultValue: Number.isFinite(defThresholds[i]) ? defThresholds[i] : (i + 1) / tone.bands,
          ariaLabel: `Tone threshold ${i + 1}`,
          onChange: live.onChange,
          onCommit: (v) => { live.onCommit(v); renderTone(); },
        });
      });

      // Coverage ladder — plotted ink coverage per band, dark→light (length bands).
      const defLadder = toneLadderFor(tone.bands);
      tone.ladder.forEach((_, i) => {
        sliderRow(toneHost, toneComps, `Coverage ${i + 1}`, {
          value: Number.isFinite(tone.ladder[i]) ? tone.ladder[i] : (i + 0.5) / tone.bands,
          min: 0, max: 1, step: 0.01,
          defaultValue: Number.isFinite(defLadder[i]) ? defLadder[i] : (i + 0.5) / tone.bands,
          ariaLabel: `Tone coverage ${i + 1}`,
          ...liveSliderFull((v) => { ensureTone().ladder[i] = Math.min(Math.max(v, 0), 1); }),
        });
      });

      // Specular hotspot.
      const specRow = document.createElement('div');
      specRow.className = 'vs3-row';
      const specLbl = document.createElement('label');
      specLbl.className = 'vs3-lbl';
      specLbl.textContent = 'Specular';
      specRow.appendChild(specLbl);
      const specCtl = document.createElement('div');
      specCtl.className = 'vs3-ctl';
      specRow.appendChild(specCtl);
      toneHost.appendChild(specRow);
      toneComps.push(UI.SegCtrl(specCtl, {
        options: [{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }],
        value: tone.specular.enabled === false ? 'off' : 'on',
        ariaLabel: 'Specular highlight',
        onChange: (v) => {
          commit(() => { ensureTone().specular.enabled = v === 'on'; });
          renderTone();
        },
      }));
      if (tone.specular.enabled !== false) {
        sliderRow(toneHost, toneComps, 'Highlight size', {
          value: Number.isFinite(tone.specular.size) ? tone.specular.size : 1,
          min: 0.2, max: 3, step: 0.1,
          defaultValue: 1,
          ariaLabel: 'Specular size',
          ...liveSliderFull((v) => { ensureTone().specular.size = v; }),
        });
      }
    };

    // ── Sections ────────────────────────────────────────────────────────────
    const sections = [];
    // Scene-tree Increment D — a scene GROUP creates objects via the layers-panel
    // tree (which owns the tree now), so its in-panel "Add Objects" shelf is
    // retired. A legacy monolith keeps the shelf (no layers-panel tree for it).
    if (!isSceneGroup) {
      sections.push(UI.Section(pages.scene, {
        title: 'Add Objects',
        children: (body) => buildShelf(body),
      }));
    }
    sections.push(UI.Section(pages.scene, {
      title: 'Scene Tree',
      children: (body) => {
        treeHost = document.createElement('div');
        treeHost.className = 'vs3-tree';
        body.appendChild(treeHost);
      },
    }));
    sections.push(UI.Section(pages.scene, {
      title: 'Boolean Groups',
      children: (body) => {
        groupsHost = document.createElement('div');
        groupsHost.className = 'vs3-groups';
        body.appendChild(groupsHost);
      },
    }));
    sections.push(UI.Section(pages.scene, {
      title: 'Inspector',
      children: (body) => {
        inspectorHost = document.createElement('div');
        inspectorHost.className = 'vs3-inspector';
        body.appendChild(inspectorHost);
      },
    }));
    sections.push(UI.Section(pages.scene, {
      title: 'Tone',
      children: (body) => {
        toneHost = document.createElement('div');
        toneHost.className = 'vs3-tone';
        body.appendChild(toneHost);
      },
    }));

    styleHost = document.createElement('div');
    styleHost.className = 'vs3-style';
    pages.style.appendChild(styleHost);

    const outMsg = document.createElement('p');
    outMsg.className = 'vs3-placeholder';
    outMsg.textContent = 'Plot stats arrive in a later phase';
    pages.output.appendChild(outMsg);

    const foot = document.createElement('div');
    foot.className = 'vs3-foot';
    foot.textContent = 'VECTURA STUDIO · SCENE';
    root.appendChild(foot);

    renderTree();
    renderInspector();
    renderStyle();
    renderTone();

    let destroyed = false;
    const teardown = () => {
      if (destroyed) return;
      destroyed = true;
      window.removeEventListener('vectura:scene-selection', onSceneSelection);
      document.removeEventListener('pointerdown', onDocPointerDown);
      window.removeEventListener('resize', onWindowChange);
      window.removeEventListener('scroll', onWindowChange, true);
      // The flyout is portaled to <body> — remove it explicitly.
      if (moreMenu && moreMenu.parentNode) moreMenu.parentNode.removeChild(moreMenu);
      destroyComps(inspectorComps);
      destroyComps(styleComps);
      destroyComps(toneComps);
      destroyComps(groupComps);
      sections.forEach((s) => { try { s.destroy(); } catch (_) { /* */ } });
      try { tabs.destroy(); } catch (_) { /* */ }
      if (root.parentNode) root.parentNode.removeChild(root);
      if (CURRENT === CURRENT_SELF) CURRENT = null;
    };
    // Self-heal: when the left pane is rebuilt for a NON-scene layer, the host
    // empties the container without calling our destroy — so the global
    // listeners (and the portaled flyout) would leak. Any subsequent global
    // event tears us down once the panel root is detached from the document.
    teardownIfDetached = () => {
      if (!destroyed && root && !root.isConnected) { teardown(); return true; }
      return destroyed;
    };
    const CURRENT_SELF = { layerId: layer.id, destroy: teardown };
    CURRENT = CURRENT_SELF;
  };

  Vectura.UI.Scene3DPanel = { build };
})();
