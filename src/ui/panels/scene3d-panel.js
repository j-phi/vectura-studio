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
  };
  const SHELF_PRIMS = ['box', 'sphere', 'cylinder', 'torus', 'cone', 'plane'];
  const MORE_PRIMS = ['superellipsoid', 'torusKnot', 'capsule'];

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
  ];
  const HATCH_DEFAULTS = { fillAngle: 45, fillDensity: 50 };
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

  // ── build ─────────────────────────────────────────────────────────────────
  const build = (ui, layer, container) => {
    if (CURRENT) { try { CURRENT.destroy(); } catch (_) { /* */ } CURRENT = null; }

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
      if (getLights().length <= 1) return; // a scene keeps at least one light
      commit(() => {
        const arr = getLights();
        const idx = arr.findIndex((l) => l && l.id === id);
        if (idx >= 0) arr.splice(idx, 1);
      });
      if (sel.objectId === `light:${id}`) selectLight((getLights()[0] || {}).id);
      else { renderTree(); renderInspector(); }
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
      shadowAngle: 45, shadowDensity: 50, shadowPenId: null, shadowLineType: 'solid',
      shadowLayers: false, shadowLayerCount: 3, shadowFalloff: 0.5, shadowAngleFollowsLight: false,
    });
    const ensureShadow = () => {
      if (!params.shadow || typeof params.shadow !== 'object') params.shadow = shadowDefault();
      const s = params.shadow;
      const d = shadowDefault();
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

    // Component instances per re-renderable area, destroyed on re-render.
    let inspectorComps = [];
    let styleComps = [];
    let toneComps = [];
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
          const wired = !!holeTargetOf(obj.id);
          badge.textContent = wired ? 'hole' : 'hole?';
          badge.title = wired ? 'Subtracts into a solid' : 'Inert hole — set “Cut into” in the inspector';
          badge.classList.toggle('vs3-tree-role-inert', !wired);
          row.appendChild(badge);
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
      // shadows (directional only); ✕ deletes it (never the last one).
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
        if (lights.length > 1) {
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
        else if (lt.type === 'point' || lt.type === 'spot') {
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
      const isDir = !isAmbient && !isPoint && !isSpot;
      const note = document.createElement('p');
      note.className = 'vs3-empty';
      note.textContent = isAmbient
        ? 'Ambient — a constant fill that lifts the shadowed side. Does not cast shadows.'
        : (isDir
          ? 'Sun — drag the on-canvas gizmo (or a shadow) to aim it, or use the controls below.'
          : 'Positional light — drag the on-canvas 3-axis gizmo to move it, or use the controls below.');
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
      if (isPoint || isSpot) {
        vec3Rows(lid, 'position', 'Position', { x: 120, y: 200, z: 120 });
        sliderRow(inspectorHost, inspectorComps, 'Range', {
          value: Number.isFinite(light.range) ? light.range : 400,
          min: 0, max: 1000, step: 5, defaultValue: 400,
          ariaLabel: 'Light range (0 = infinite)',
          ...liveSlider((v) => { const lt = lightById(lid); if (lt) lt.range = Math.round(v); }),
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

      sliderRow(inspectorHost, inspectorComps, 'Scale', {
        value: Number.isFinite(t.scale) ? t.scale : 1,
        min: 0.1, max: 5, step: 0.05,
        defaultValue: 1,
        ariaLabel: 'Uniform scale',
        ...liveSlider((v) => { obj.transform.scale = v; }),
      });

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

        // Dash scale only bites when the line dashes — but showing it always
        // keeps the layout stable and lets a user pre-set it. Style writes route
        // through commitStyle (CONTRACT C whole-style write) = one undo/gesture,
        // preview on release — same pattern as Density / Angle.
        sliderRow(styleHost, styleComps, 'Dash scale', {
          value: Number.isFinite(rp.dashScale) ? rp.dashScale : STROKE_DEFAULTS.dashScale,
          min: 0.25, max: 4, step: 0.05,
          defaultValue: STROKE_DEFAULTS.dashScale,
          ariaLabel: 'Dash scale',
          onCommit: (v) => commitStyle({ params: { ...sp(), dashScale: v } }),
        });

        sliderRow(styleHost, styleComps, 'Wobble', {
          value: Number.isFinite(rp.wobble) ? rp.wobble : STROKE_DEFAULTS.wobble,
          min: 0, max: 100, step: 1,
          defaultValue: STROKE_DEFAULTS.wobble,
          ariaLabel: 'Hand wobble',
          onCommit: (v) => commitStyle({ params: { ...sp(), wobble: v } }),
        });
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

        // Hidden edges dashed — default ON.
        toggleRow('Hidden edges', 'X-ray dashed hidden edges', rp.xrayHiddenEdges !== false,
          (on) => commitStyle({ params: { ...sp(), xrayHiddenEdges: on } }));

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
        const live = liveSlider((v) => {
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
          ...liveSlider((v) => { ensureTone().ladder[i] = Math.min(Math.max(v, 0), 1); }),
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
          ...liveSlider((v) => { ensureTone().specular.size = v; }),
        });
      }
    };

    // ── Sections ────────────────────────────────────────────────────────────
    const sections = [];
    sections.push(UI.Section(pages.scene, {
      title: 'Add Objects',
      children: (body) => buildShelf(body),
    }));
    sections.push(UI.Section(pages.scene, {
      title: 'Scene Tree',
      children: (body) => {
        treeHost = document.createElement('div');
        treeHost.className = 'vs3-tree';
        body.appendChild(treeHost);
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
