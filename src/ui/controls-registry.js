/**
 * Vectura controls registry (Phase 2 extraction from src/ui/ui.js:2212-3759).
 *
 * Exposes window.Vectura.UI.CONTROL_DEFS — the per-algorithm control schema
 * dispatched by buildControls() (algo-config-panel in the Phase 2+ tree).
 *
 * Extraction is byte-identical to the original literal. The IIFE prelude
 * mirrors the option-array definitions from legacy ui.js (preset libraries
 * and PETAL_PROFILE_OPTIONS) so the registry stays self-contained — the
 * compile gate at tests/unit/controls-registry-compile.test.js asserts no
 * closure-captured helper escaped notice.
 *
 * Function calls inside CONTROL_DEFS go through window.Vectura.FillPanel
 * (already global) — no other captured helpers.
 */
(() => {
  const {
    petalis: PETALIS_PRESET_LIBRARY = [],
    terrain: TERRAIN_PRESET_LIBRARY = [],
    harmonograph: HARMONOGRAPH_PRESET_LIBRARY = [],
    pendula: PENDULA_PRESET_LIBRARY = [],
  } = (window.Vectura && window.Vectura.PresetLibraries) || {};

  const PETALIS_PRESET_OPTIONS = [
    { value: 'custom', label: 'Custom' },
    ...(Array.isArray(PETALIS_PRESET_LIBRARY)
      ? PETALIS_PRESET_LIBRARY.map((preset) => ({ value: preset.id, label: preset.name }))
      : []),
  ];

  const TERRAIN_PRESET_OPTIONS = [
    { value: 'custom', label: 'Custom' },
    ...(Array.isArray(TERRAIN_PRESET_LIBRARY)
      ? TERRAIN_PRESET_LIBRARY.map((preset) => ({ value: preset.id, label: preset.name }))
      : []),
  ];

  const HARMONOGRAPH_PRESET_OPTIONS = [
    { value: 'custom', label: 'Custom' },
    ...(Array.isArray(HARMONOGRAPH_PRESET_LIBRARY)
      ? HARMONOGRAPH_PRESET_LIBRARY.map((preset) => ({ value: preset.id, label: preset.name }))
      : []),
  ];

  const PENDULA_PRESET_OPTIONS = [
    { value: 'custom', label: 'Custom' },
    ...(Array.isArray(PENDULA_PRESET_LIBRARY)
      ? PENDULA_PRESET_LIBRARY.map((preset) => ({ value: preset.id, label: preset.name }))
      : []),
  ];

  const POLYHEDRON_SIDE_COUNT_SOLIDS = ['flatPolygon', 'prism', 'antiprism', 'bipyramid', 'cone', 'frustum', 'cupola', 'starPrism'];
  const POLYHEDRON_DEPTH_SOLIDS = ['prism', 'antiprism', 'bipyramid', 'cone', 'frustum', 'cupola', 'starPrism'];
  const POLYHEDRON_FREQUENCY_SOLIDS = ['geodesic', 'goldberg'];
  const POLYHEDRON_TAPER_SOLIDS = ['frustum', 'cupola'];
  const POLYHEDRON_STAR_RATIO_SOLIDS = ['starPrism'];
  const polyhedronUsesSideCount = (p = {}) => POLYHEDRON_SIDE_COUNT_SOLIDS.includes(p.solidType);
  const polyhedronUsesDepth = (p = {}) => POLYHEDRON_DEPTH_SOLIDS.includes(p.solidType);
  const polyhedronUsesFrequency = (p = {}) => POLYHEDRON_FREQUENCY_SOLIDS.includes(p.solidType);
  const polyhedronUsesTaper = (p = {}) => POLYHEDRON_TAPER_SOLIDS.includes(p.solidType);
  const polyhedronUsesStarRatio = (p = {}) => POLYHEDRON_STAR_RATIO_SOLIDS.includes(p.solidType);

  const PETAL_PROFILE_OPTIONS = [
    { value: 'oval', label: 'Oval' },
    { value: 'teardrop', label: 'Teardrop' },
    { value: 'lanceolate', label: 'Lanceolate' },
    { value: 'heart', label: 'Heart' },
    { value: 'spoon', label: 'Spoon' },
    { value: 'rounded', label: 'Rounded' },
    { value: 'notched', label: 'Notched' },
    { value: 'spatulate', label: 'Spatulate' },
    { value: 'marquise', label: 'Marquise' },
    { value: 'dagger', label: 'Dagger' },
  ];

  // Shared "Shading & Lines" block appended to every 3D-capable algorithm
  // (spiralizer, polyhedron, topoform, rasterPlane). Drives the four
  // cross-cutting geometry3d.js enhancements: depth-cue dash (#2), silhouette /
  // crease line-weight emphasis (#3), hidden-line removal (#4), Lambert hatching
  // (#5).
  //
  // Capability-driven factory (R-CC): a flat array cannot show a control on one
  // algo and hide it on another. `buildShadingControls(caps)` injects per-algo /
  // per-mode capability predicates ANDed with each control's own self-toggle so
  // that inapplicable controls are HIDDEN where the generator does not wire them.
  // Single source of truth preserved: one factory, four call sites.
  //
  // Each capability flag is a function of `p` (so per-mode algos like rasterPlane
  // can vary by `p.mode`). Defaults to `() => true` (full block, today's behavior).
  //   - allowOutline  → emphasizeOutline / outlineWeight
  //   - allowCrease   → showCreases / creaseAngle
  //   - hiddenLineModes → hiddenLineMode (face-derivable visibility)
  //   - allowDepthBias → depthBias (occlusion bias; defaults to hiddenLineModes
  //     but can be suppressed independently — e.g. spiralizer wires hidden-line
  //     dash/backface but has no occlusion-bias surface).
  //   - allowHatch    → hatchEnable + light/hatchAngle/hatchSpacing/crossHatch
  //   - depthCue / depthCueStrength are ALWAYS present (work on every algo).
  // The section header is ALWAYS emitted (R-CONSIST rule a).
  const TRUE = () => true;
  const buildShadingControls = (caps = {}, options = {}) => {
    const {
      allowOutline = TRUE,
      allowCrease = TRUE,
      hiddenLineModes = TRUE,
      allowHatch = TRUE,
      allowDepthBias = hiddenLineModes,
      // Self-activation predicate for Occlusion Bias. Defaults to "a non-backface
      // Hidden Lines mode is selected" (the face-derived algos). rasterPlane drives
      // its occlusion off the See-Through toggle, not hiddenLineMode, so it supplies
      // its own predicate here.
      depthBiasSelf = (p) => (p.hiddenLineMode || 'backface') !== 'backface',
    } = caps;
    // Topoform opt-in: a master "Scene Lighting" toggle (default OFF) that gates
    // the LIGHTING group (Lambert hatch + depth cue). When the flag is absent
    // (every other 3D algo) the block stays byte-equivalent — `litGate` returns
    // the original gate untouched and no Scene Lighting control is inserted.
    const { sceneLightingMaster = false } = options;
    const lit = (p) => p.sceneLighting === true;
    const litGate = (self) => {
      if (!sceneLightingMaster) return self;
      if (!self) return lit;
      return (p) => lit(p) && !!self(p);
    };
    // Light DIRECTION (azimuth/elevation) positions BOTH the Lambert hatching and
    // the specular highlight, so on Topoform it stays visible whenever Specular
    // Highlight is on — even with Scene Lighting (hatching) off.
    const litDirGate = (self) => {
      if (!sceneLightingMaster) return self;
      const base = litGate(self);
      return (p) => base(p) || p.specularHighlight === true;
    };
    // Compose a capability predicate with a control's own activation predicate
    // via logical AND. When the capability is the always-true default this
    // returns the original self-toggle (or omits showIf entirely), so the full
    // block stays byte-equivalent for polyhedron / topoform.
    const gate = (cap, self) => {
      if (cap === TRUE) return self; // unconditional capability → keep self-toggle as-is
      if (!self) return (p) => !!cap(p);
      return (p) => !!cap(p) && !!self(p);
    };
    return [
      { type: 'section', label: 'Shading & Lines', collapsed: true },
      ...(sceneLightingMaster ? [{ id: 'sceneLighting', label: 'Scene Lighting', type: 'checkbox' }] : []),
      {
        id: 'depthCue',
        label: 'Depth Cue',
        type: 'select',
        options: [
          { value: 'off', label: 'Off' },
          { value: 'dash', label: 'Dash by depth' },
        ],
        ...(sceneLightingMaster ? { showIf: lit } : {}),
      },
      { id: 'depthCueStrength', label: 'Depth Cue Strength', type: 'range', min: 0, max: 100, step: 1, showIf: litGate((p) => (p.depthCue || 'off') !== 'off'), livePreview: true },
      { id: 'emphasizeOutline', label: 'Emphasize Outline', type: 'checkbox', showIf: gate(allowOutline, null) },
      { id: 'outlineWeight', label: 'Outline Weight', type: 'range', min: 1, max: 4, step: 0.1, showIf: gate(allowOutline, (p) => p.emphasizeOutline === true), livePreview: true },
      { id: 'showCreases', label: 'Show Creases', type: 'checkbox', showIf: gate(allowCrease, null) },
      { id: 'creaseAngle', label: 'Crease Angle', type: 'range', min: 10, max: 80, step: 1, displayUnit: '°', showIf: gate(allowCrease, (p) => p.showCreases === true), livePreview: true },
      {
        id: 'hiddenLineMode',
        label: 'Hidden Lines',
        type: 'select',
        options: [
          { value: 'backface', label: 'Back-face only' },
          { value: 'remove', label: 'Remove hidden' },
          { value: 'dash', label: 'Dash hidden' },
        ],
        showIf: gate(hiddenLineModes, null),
      },
      { id: 'depthBias', label: 'Occlusion Bias', type: 'range', min: 0, max: 3, step: 0.1, showIf: gate(allowDepthBias, depthBiasSelf), livePreview: true },
      { id: 'hatchEnable', label: 'Lambert Hatching', type: 'checkbox', showIf: litGate(gate(allowHatch, null)) },
      // Specular Highlight (Topoform only): a light-positioned mirror dot. Its
      // light direction is shared with Lambert hatching, so the Light Position pad
      // + Azimuth/Elevation surface whenever EITHER hatching or the highlight is on.
      ...(sceneLightingMaster ? [
        { id: 'specularHighlight', label: 'Specular Highlight', type: 'checkbox' },
        { id: 'specularSize', label: 'Highlight Size', type: 'range', min: 0, max: 100, step: 1, showIf: (p) => p.specularHighlight === true, livePreview: true },
        { id: 'lightDirection', label: 'Light Position', type: 'lightPad', azParam: 'lightAzimuth', elParam: 'lightElevation', azDefault: 135, elDefault: 45, showIf: litDirGate(gate(allowHatch, (p) => p.hatchEnable === true)) },
      ] : []),
      // UX7: Light Azimuth is a compass heading (0–360 wrap), so the circular
      // angle dial matches the mental model better than a linear slider.
      { id: 'lightAzimuth', label: 'Light Azimuth', type: 'angle', min: 0, max: 360, step: 1, displayUnit: '°', showIf: litDirGate(gate(allowHatch, (p) => p.hatchEnable === true)), livePreview: true },
      { id: 'lightElevation', label: 'Light Elevation', type: 'range', min: 0, max: 90, step: 1, displayUnit: '°', showIf: litDirGate(gate(allowHatch, (p) => p.hatchEnable === true)), livePreview: true },
      { id: 'hatchAngle', label: 'Hatch Angle', type: 'angle', min: 0, max: 180, step: 1, displayUnit: '°', showIf: litGate(gate(allowHatch, (p) => p.hatchEnable === true)), livePreview: true },
      { id: 'hatchSpacing', label: 'Hatch Spacing', type: 'range', min: 2, max: 20, step: 0.5, showIf: litGate(gate(allowHatch, (p) => p.hatchEnable === true)), livePreview: true },
      { id: 'crossHatch', label: 'Cross-Hatch', type: 'checkbox', showIf: litGate(gate(allowHatch, (p) => p.hatchEnable === true)) },
    ];
  };

  // Per-algo capability predicates (WU2). Only SHOW a shading control where the
  // generator actually wires it (verified against the algorithm sources):
  //   - spiralizer: line/dot geometry, NO closed faces. Keeps depthCue + outline +
  //     hiddenLineMode (silhouette rings + backface/dash ARE wired); hides
  //     hatch / crease / depthBias (no surface).
  //   - rasterPlane: per-mode. Only depthCue + hatch are actually wired by the
  //     generator. hatch wired in mesh & bars (pushFaceHatch) → gated there.
  //     hiddenLineMode is DEAD (raster-plane.js never reads p.hiddenLineMode;
  //     the real toggle is the existing seeThrough control) → hidden in all modes.
  //     depthBias self-toggles on that dead hiddenLineMode → unreachable → hidden.
  //     crease never meaningful on a height grid; outline NOT yet wired → hidden.
  const IMG_FACE_MODES = ['mesh', 'bars'];
  const imgFaceCapable = (p = {}) => IMG_FACE_MODES.includes(p.mode || 'lines');
  const SHADING_CAPS = {
    polyhedron: {},
    topoform: {},
    terrain: {
      // Terrain's "Hidden-Line Removal" checkbox is the master occlusion toggle in
      // free-3d (drives the floating-horizon sweep); the "Hidden Lines" select then
      // chooses Remove vs Dash for the occluded spans (the terrain .map below trims
      // the shared select to those two — "backface" is meaningless on an open
      // heightfield). "Occlusion Bias" is the silhouette tolerance. depthCue /
      // outline / crease / hatch all apply to the heightfield surface quads.
      hiddenLineModes: (p = {}) => p.occlusion !== false,
      allowDepthBias: (p = {}) => p.occlusion !== false,
    },
    spiralizer: {
      // KEEP: depthCue, depthCueStrength, emphasizeOutline, outlineWeight,
      // hiddenLineMode. HIDE: showCreases, creaseAngle, hatchEnable, light*,
      // hatch*, crossHatch, depthBias (line/dot geometry, no closed faces; the
      // silhouette rings + hidden-line backface/dash are wired, occlusion bias is not).
      allowHatch: () => false,
      allowCrease: () => false,
      hiddenLineModes: () => true,
      allowDepthBias: () => false,
      allowOutline: () => true,
    },
    rasterPlane: {
      allowHatch: imgFaceCapable,
      allowCrease: () => false,
      // hiddenLineMode is dead on rasterPlane: raster-plane.js never reads
      // p.hiddenLineMode (the real visibility toggle is the existing seeThrough
      // control), so showing it is a dead, misleading, duplicative control.
      hiddenLineModes: () => false,
      // Occlusion Bias IS wired for Lines: when See-Through is OFF, buildLines runs
      // depth-spread painter occlusion and reads p.depthBias to scale how tightly
      // nearer ridges hide farther ones. Keyed on See-Through (not the dead
      // hiddenLineMode) per the deferred generator-wiring note.
      allowDepthBias: (p = {}) => (p.mode || 'lines') === 'lines',
      depthBiasSelf: (p = {}) => p.seeThrough === false,
      allowOutline: () => false,
    },
  };

  const CONTROL_DEFS = {
    expanded: [],
    svgDistort: [
      { type: 'svgImportButton' },
      {
        id: 'showOutlines',
        label: 'Show Outlines',
        type: 'checkbox',
      },
      ...(window.Vectura.FillPanel?.buildFillControlDefs({
        fillTypeOptions: window.Vectura.FillPanel.FILL_TYPE_OPTIONS,
        typeParam: 'fillMode',
        densityParam: 'fillDensity',
        angleParam: 'fillAngle',
        amplitudeParam: 'fillAmplitude',
        paddingParam: 'fillPadding',
        dotSizeParam: 'fillDotSize',
        shiftXParam: 'fillShiftX',
        shiftYParam: 'fillShiftY',
        showIfBase: (p) => (p.importedGroups || []).some((g) => g.isClosed),
        descKeyPrefix: 'fill',
      }) || []),
      {
        id: 'autoFit',
        label: 'Auto Fit to Canvas',
        type: 'checkbox',
      },
      {
        id: 'noiseTarget',
        label: 'Apply Noise To',
        type: 'select',
        options: [
          { value: 'all', label: 'All Paths' },
          { value: 'outlines', label: 'Outlines Only' },
          { value: 'fills', label: 'Fills Only' },
        ],
        showIf: (p) => (p.noises || []).some((n) => n.enabled !== false),
      },
      { type: 'noiseList' },
    ],
    pattern: [
      {
        id: 'patternFilter',
        label: 'Filter',
        type: 'select',
        options: [
          { value: 'all', label: 'All Patterns' },
          { value: 'lines', label: 'Lines Only' },
          { value: 'fills', label: 'Patterns with Fills' }
        ],
      },
      { type: 'patternSelect' },
      { type: 'patternDesignerInline' },
      { id: 'scale', label: 'Scale', type: 'range', min: 0.1, max: 10, step: 0.1 },
      { id: 'originX', label: 'X Origin Offset', type: 'range', min: -500, max: 500, step: 1 },
      { id: 'originY', label: 'Y Origin Offset', type: 'range', min: -500, max: 500, step: 1 },
      {
        id: 'tileMethod',
        label: 'Tile Method',
        type: 'select',
        options: [
          { value: 'off', label: 'Off (single tile)' },
          { value: 'grid', label: 'Grid' },
          { value: 'brick', label: 'Brick (Offset)' },
          { value: 'hexagonal', label: 'Hexagonal' }
        ]
      },
      { id: 'tileSpacingX', label: 'Tile Spacing X', type: 'range', min: -100, max: 500, step: 1 },
      { id: 'tileSpacingY', label: 'Tile Spacing Y', type: 'range', min: -100, max: 500, step: 1 },
      { id: 'removeSeams', label: 'Remove seams at join', type: 'checkbox' },
      { id: 'curves', label: 'Curves', type: 'checkbox' },
      { id: 'tileEdgeCurves', label: 'Curves at tile edges', type: 'checkbox', showIf: (p) => !!p.curves },
      { type: 'patternSubPens' },
    ],
    flowfield: [
      {
        id: 'flowMode',
        label: 'Flow Mode',
        type: 'select',
        options: [
          { value: 'angle', label: 'Angle' },
          { value: 'curl', label: 'Curl' },
        ],
        infoKey: 'flowfield.flowMode',
      },
      { type: 'noiseList' },
      {
        id: 'density',
        label: 'Density',
        type: 'range',
        min: 200,
        max: 12000,
        step: 100,
        confirmAbove: 6000,
        confirmMessage: 'High density can be slow. Continue?',
        randomMax: 4000,
        infoKey: 'flowfield.density',
      },
      { id: 'stepLen', label: 'Step Length', type: 'range', min: 0.5, max: 30, step: 0.5, infoKey: 'flowfield.stepLen' },
      {
        id: 'maxSteps',
        label: 'Max Steps',
        type: 'range',
        min: 20,
        max: 2000,
        step: 10,
        confirmAbove: 1000,
        confirmMessage: 'Large step counts can be slow. Continue?',
        randomMax: 600,
        infoKey: 'flowfield.maxSteps',
      },
      { id: 'force', label: 'Flow Force', type: 'range', min: 0.1, max: 6.0, step: 0.1, infoKey: 'flowfield.force' },
      {
        id: 'angleOffset',
        label: 'Angle Offset',
        type: 'angle',
        min: 0,
        max: 360,
        step: 1,
        displayUnit: '°',
        infoKey: 'flowfield.angleOffset',
      },
      { id: 'chaos', label: 'Chaos', type: 'range', min: 0, max: 3.0, step: 0.05, infoKey: 'flowfield.chaos' },
      { id: 'minSteps', label: 'Minimum Steps', type: 'range', min: 2, max: 200, step: 2, infoKey: 'flowfield.minSteps' },
      { id: 'minLength', label: 'Minimum Length', type: 'range', min: 0, max: 200, step: 2, infoKey: 'flowfield.minLength' },
    ],
    lissajous: [
      { id: 'freqX', label: 'Freq X', type: 'range', min: 0.5, max: 12, step: 0.1, infoKey: 'lissajous.freqX' },
      { id: 'freqY', label: 'Freq Y', type: 'range', min: 0.5, max: 12, step: 0.1, infoKey: 'lissajous.freqY' },
      { id: 'damping', label: 'Damping', type: 'range', min: 0, max: 0.01, step: 0.0001, infoKey: 'lissajous.damping' },
      { id: 'phase', label: 'Phase', type: 'range', min: 0, max: 6.28, step: 0.1, infoKey: 'lissajous.phase' },
      { id: 'resolution', label: 'Resolution', type: 'range', min: 50, max: 800, step: 10, infoKey: 'lissajous.resolution' },
      { id: 'scale', label: 'Scale', type: 'range', min: 0.2, max: 1.2, step: 0.05, infoKey: 'lissajous.scale' },
      { id: 'truncateStart', label: 'Truncate Start', type: 'range', min: 0, max: 100, step: 1, infoKey: 'lissajous.truncateStart' },
      { id: 'truncateEnd', label: 'Truncate End', type: 'range', min: 0, max: 100, step: 1, infoKey: 'lissajous.truncateEnd' },
      { id: 'closeLines', label: 'Close Lines', type: 'checkbox', infoKey: 'lissajous.closeLines' },
    ],
    harmonograph: [
      { type: 'section', label: 'Presets' },
      {
        id: 'preset',
        label: 'Preset',
        type: 'select',
        options: HARMONOGRAPH_PRESET_OPTIONS,
        infoKey: 'harmonograph.preset',
      },
      { type: 'section', label: 'Render' },
      {
        id: 'renderMode',
        label: 'Render Mode',
        type: 'select',
        options: [
          { value: 'line', label: 'Line' },
          { value: 'dashed', label: 'Dashed Line' },
          { value: 'points', label: 'Point Field' },
          { value: 'segments', label: 'Segments' },
        ],
        infoKey: 'harmonograph.renderMode',
      },
      { id: 'samples', label: 'Samples', type: 'range', min: 400, max: 12000, step: 100, infoKey: 'harmonograph.samples' },
      { id: 'duration', label: 'Duration (s)', type: 'range', min: 5, max: 600, step: 1, infoKey: 'harmonograph.duration' },
      { id: 'scale', label: 'Scale', type: 'range', min: 0.2, max: 1.5, step: 0.05, infoKey: 'harmonograph.scale' },
      {
        id: 'paperRotation',
        label: 'Paper Rotation (Hz)',
        type: 'range',
        min: -1,
        max: 1,
        step: 0.01,
        infoKey: 'harmonograph.paperRotation',
      },
      {
        id: 'widthMultiplier',
        label: 'Line Thickness',
        type: 'range',
        min: 1,
        max: 6,
        step: 1,
        infoKey: 'harmonograph.widthMultiplier',
      },
      {
        id: 'thickeningMode',
        label: 'Thickening Mode',
        type: 'select',
        options: [
          { value: 'parallel', label: 'Parallel' },
          { value: 'sinusoidal', label: 'Sinusoidal' },
        ],
        infoKey: 'harmonograph.thickeningMode',
      },
      {
        id: 'loopDrift',
        label: 'Anti-Loop Drift',
        type: 'range',
        min: 0,
        max: 0.08,
        step: 0.0005,
        infoKey: 'harmonograph.loopDrift',
      },
      {
        id: 'settleThreshold',
        label: 'Settle Cutoff',
        type: 'range',
        min: 0,
        max: 40,
        step: 0.5,
        displayUnit: 'mm',
        infoKey: 'harmonograph.settleThreshold',
      },
      {
        id: 'dashLength',
        label: 'Dash Length (mm)',
        type: 'range',
        min: 0.5,
        max: 20,
        step: 0.5,
        infoKey: 'harmonograph.dashLength',
        showIf: (p) => p.renderMode === 'dashed',
      },
      {
        id: 'dashGap',
        label: 'Dash Gap (mm)',
        type: 'range',
        min: 0,
        max: 20,
        step: 0.5,
        infoKey: 'harmonograph.dashGap',
        showIf: (p) => p.renderMode === 'dashed',
      },
      {
        id: 'pointStride',
        label: 'Point Stride',
        type: 'range',
        min: 1,
        max: 20,
        step: 1,
        infoKey: 'harmonograph.pointStride',
        showIf: (p) => p.renderMode === 'points',
      },
      {
        id: 'pointSize',
        label: 'Point Size (mm)',
        type: 'range',
        min: 0.1,
        max: 2,
        step: 0.1,
        infoKey: 'harmonograph.pointSize',
        showIf: (p) => p.renderMode === 'points',
      },
      {
        id: 'segmentStride',
        label: 'Segment Stride',
        type: 'range',
        min: 1,
        max: 20,
        step: 1,
        infoKey: 'harmonograph.segmentStride',
        showIf: (p) => p.renderMode === 'segments',
      },
      {
        id: 'segmentLength',
        label: 'Segment Length (mm)',
        type: 'range',
        min: 1,
        max: 20,
        step: 0.5,
        infoKey: 'harmonograph.segmentLength',
        showIf: (p) => p.renderMode === 'segments',
      },
      {
        id: 'gapSize',
        label: 'Gap Size',
        type: 'range',
        min: 0,
        max: 20,
        step: 0.5,
        displayUnit: 'mm',
        infoKey: 'harmonograph.gapSize',
        showIf: (p) => ['dashed', 'points', 'segments'].includes(p.renderMode),
      },
      {
        id: 'gapOffset',
        label: 'Gap Offset',
        type: 'range',
        min: 0,
        max: 20,
        step: 0.5,
        displayUnit: 'mm',
        infoKey: 'harmonograph.gapOffset',
        showIf: (p) => ['dashed', 'points', 'segments'].includes(p.renderMode),
      },
      {
        id: 'gapRandomness',
        label: 'Spacing Randomness',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        infoKey: 'harmonograph.gapRandomness',
        showIf: (p) => ['dashed', 'points', 'segments'].includes(p.renderMode),
      },
      { type: 'pendulumList' },
      { type: 'harmonographPlotter' },
      { type: 'section', label: 'Pendulum Guides' },
      {
        id: 'showPendulumGuides',
        label: 'Show Guides',
        type: 'checkbox',
        infoKey: 'harmonograph.showPendulumGuides',
      },
      {
        id: 'pendulumGuideColor',
        label: 'Guide Color',
        type: 'colorModal',
        infoKey: 'harmonograph.pendulumGuideColor',
        showIf: (p) => Boolean(p.showPendulumGuides),
      },
      {
        id: 'pendulumGuideWidth',
        label: 'Guide Thickness (mm)',
        type: 'range',
        min: 0.05,
        max: 2,
        step: 0.05,
        displayUnit: 'mm',
        infoKey: 'harmonograph.pendulumGuideWidth',
        showIf: (p) => Boolean(p.showPendulumGuides),
      },
    ],
    petalis: [
      { type: 'section', label: 'Presets' },
      {
        id: 'preset',
        label: 'Preset',
        type: 'select',
        options: PETALIS_PRESET_OPTIONS,
        infoKey: 'petalis.preset',
      },
      { type: 'section', label: 'Petal Geometry' },
      {
        id: 'petalProfile',
        label: 'Petal Profile',
        type: 'petalProfileGallery',
        options: PETAL_PROFILE_OPTIONS,
        infoKey: 'petalis.petalProfile',
      },
      { id: 'petalScale', label: 'Petal Scale (mm)', type: 'range', min: 1, max: 80, step: 1, infoKey: 'petalis.petalScale' },
      { id: 'bloom', label: 'Bloom', type: 'range', min: 0, max: 100, step: 1, infoKey: 'petalis.bloom' },
      { id: 'petalAsymmetry', label: 'Petal Asymmetry', type: 'range', min: 0, max: 100, step: 1, infoKey: 'petalis.petalAsymmetry' },
      { id: 'petalCupping', label: 'Petal Cupping', type: 'range', min: 0, max: 100, step: 1, infoKey: 'petalis.petalCupping' },
      {
        id: 'petalWidthRatio',
        label: 'Width/Length Ratio',
        type: 'range',
        min: 0.01,
        max: 2,
        step: 0.01,
        infoKey: 'petalis.petalWidthRatio',
      },
      { id: 'petalLengthRatio', label: 'Length Ratio', type: 'range', min: 0.1, max: 5, step: 0.05, infoKey: 'petalis.petalLengthRatio' },
      { id: 'petalSizeRatio', label: 'Size Ratio', type: 'range', min: 0.01, max: 5, step: 0.05, infoKey: 'petalis.petalSizeRatio' },
      { id: 'leafSidePos', label: 'Side Position', type: 'range', min: 0.1, max: 0.9, step: 0.01, infoKey: 'petalis.leafSidePos' },
      { id: 'leafSideWidth', label: 'Side Width', type: 'range', min: 0.2, max: 2, step: 0.01, infoKey: 'petalis.leafSideWidth' },
      { id: 'petalSteps', label: 'Petal Resolution', type: 'range', min: 12, max: 80, step: 2, infoKey: 'petalis.petalSteps' },
      { id: 'layering', label: 'Layering', type: 'checkbox', infoKey: 'petalis.layering' },
      {
        id: 'anchorToCenter',
        label: 'Anchor to Center Ring',
        type: 'select',
        options: [
          { value: 'off', label: 'Off' },
          { value: 'central', label: 'Central Petals Only' },
          { value: 'all', label: 'All Petals' },
        ],
        infoKey: 'petalis.anchorToCenter',
      },
      {
        id: 'anchorRadiusRatio',
        label: 'Anchor Radius Ratio',
        type: 'range',
        min: 0.2,
        max: 3,
        step: 0.05,
        showIf: (p) => p.anchorToCenter && p.anchorToCenter !== 'off',
        infoKey: 'petalis.anchorRadiusRatio',
      },
      { id: 'tipSharpness', label: 'Tip Sharpness', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'petalis.tipSharpness' },
      { id: 'tipTwist', label: 'Tip Rotate', type: 'range', min: 0, max: 100, step: 1, infoKey: 'petalis.tipTwist' },
      { id: 'centerCurlBoost', label: 'Center Tip Rotate Boost', type: 'range', min: 0, max: 100, step: 1, infoKey: 'petalis.centerCurlBoost' },
      { id: 'tipCurl', label: 'Tip Rounding', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'petalis.tipCurl' },
      { id: 'baseFlare', label: 'Base Flare', type: 'range', min: 0, max: 5, step: 0.05, infoKey: 'petalis.baseFlare' },
      { id: 'basePinch', label: 'Base Pinch', type: 'range', min: 0, max: 5, step: 0.05, infoKey: 'petalis.basePinch' },
      { id: 'edgeWaveAmp', label: 'Edge Wave Amp', type: 'range', min: 0, max: 0.6, step: 0.01, infoKey: 'petalis.edgeWaveAmp' },
      { id: 'edgeWaveFreq', label: 'Edge Wave Freq', type: 'range', min: 0, max: 14, step: 0.5, infoKey: 'petalis.edgeWaveFreq' },
      { id: 'centerWaveBoost', label: 'Center Wave Boost', type: 'range', min: 0, max: 2, step: 0.05, infoKey: 'petalis.centerWaveBoost' },
      { type: 'section', label: 'Petal Modifiers' },
      { type: 'petalModifierList', label: 'Petal Modifiers' },
      { type: 'section', label: 'Distribution & Spiral' },
      {
        id: 'layoutMode',
        label: 'Layout',
        type: 'select',
        options: [
          { value: 'whorl', label: 'Whorl (clean rings)' },
          { value: 'spiral', label: 'Spiral (phyllotaxis)' },
        ],
        infoKey: 'petalis.layoutMode',
      },
      { id: 'count', label: 'Petal Count', type: 'range', min: 5, max: 800, step: 1, showIf: (p) => p.ringMode !== 'dual', infoKey: 'petalis.count' },
      {
        id: 'ringMode',
        label: 'Ring Mode',
        type: 'select',
        options: [
          { value: 'single', label: 'Single' },
          { value: 'dual', label: 'Dual' },
        ],
        infoKey: 'petalis.ringMode',
      },
      {
        id: 'innerCount',
        label: 'Inner Petal Count',
        type: 'range',
        min: 0,
        max: 400,
        step: 1,
        showIf: (p) => p.ringMode === 'dual',
        infoKey: 'petalis.innerCount',
      },
      {
        id: 'outerCount',
        label: 'Outer Petal Count',
        type: 'range',
        min: 1,
        max: 600,
        step: 1,
        showIf: (p) => p.ringMode === 'dual',
        infoKey: 'petalis.outerCount',
      },
      {
        id: 'ringSplit',
        // Whorl: how far successive rings spread (layer spacing). Spiral: the
        // inner/outer band split.
        label: 'Ring Spacing',
        type: 'range',
        min: 0.15,
        max: 0.85,
        step: 0.01,
        showIf: (p) => p.ringMode === 'dual',
        infoKey: 'petalis.ringSplit',
      },
      {
        id: 'innerOuterLock',
        label: 'Inner = Outer',
        type: 'checkbox',
        infoKey: 'petalis.innerOuterLock',
      },
      {
        id: 'profileTransitionPosition',
        label: 'Profile Transition Position (%)',
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        displayUnit: '%',
        infoKey: 'petalis.profileTransitionPosition',
      },
      {
        id: 'profileTransitionFeather',
        label: 'Profile Transition Feather (%)',
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        displayUnit: '%',
        infoKey: 'petalis.profileTransitionFeather',
      },
      {
        id: 'ringOffset',
        label: 'Ring Offset',
        type: 'angle',
        min: 0,
        max: 360,
        step: 1,
        displayUnit: '°',
        showIf: (p) => p.ringMode === 'dual',
        infoKey: 'petalis.ringOffset',
      },
      {
        id: 'spiralMode',
        label: 'Phyllotaxis Mode',
        type: 'select',
        options: [
          { value: 'golden', label: 'Golden Angle' },
          { value: 'custom', label: 'Custom Angle' },
        ],
        showIf: (p) => (p.layoutMode || 'whorl') === 'spiral',
        infoKey: 'petalis.spiralMode',
      },
      {
        id: 'customAngle',
        label: 'Custom Angle',
        type: 'angle',
        min: 0,
        max: 360,
        step: 1,
        displayUnit: '°',
        showIf: (p) => (p.layoutMode || 'whorl') === 'spiral' && p.spiralMode === 'custom',
        infoKey: 'petalis.customAngle',
      },
      { id: 'spiralTightness', label: 'Spiral Tightness', type: 'range', min: 0.5, max: 50, step: 0.1, showIf: (p) => (p.layoutMode || 'whorl') === 'spiral', infoKey: 'petalis.spiralTightness' },
      { id: 'radialGrowth', label: 'Radial Growth', type: 'range', min: 0.05, max: 20, step: 0.05, showIf: (p) => (p.layoutMode || 'whorl') === 'spiral', infoKey: 'petalis.radialGrowth' },
      { id: 'spiralStart', label: 'Spiral Start', type: 'range', min: 0, max: 1, step: 0.01, showIf: (p) => (p.layoutMode || 'whorl') === 'spiral', infoKey: 'petalis.spiralStart' },
      { id: 'spiralEnd', label: 'Spiral End', type: 'range', min: 0, max: 1, step: 0.01, showIf: (p) => (p.layoutMode || 'whorl') === 'spiral', infoKey: 'petalis.spiralEnd' },
      { type: 'section', label: 'Center Morphing' },
      { id: 'centerSizeMorph', label: 'Size Morph', type: 'range', min: -100, max: 100, step: 1, infoKey: 'petalis.centerSizeMorph' },
      { id: 'centerSizeCurve', label: 'Size Morph Curve', type: 'range', min: 0.5, max: 2.5, step: 0.05, infoKey: 'petalis.centerSizeCurve' },
      { id: 'centerShapeMorph', label: 'Shape Morph', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'petalis.centerShapeMorph' },
      {
        id: 'centerProfile',
        label: 'Center Profile',
        type: 'select',
        options: PETAL_PROFILE_OPTIONS,
        infoKey: 'petalis.centerProfile',
      },
      { id: 'budMode', label: 'Bud Mode', type: 'checkbox', infoKey: 'petalis.budMode' },
      { id: 'budRadius', label: 'Bud Radius', type: 'range', min: 0.05, max: 2, step: 0.01, showIf: (p) => p.budMode, infoKey: 'petalis.budRadius' },
      { id: 'budTightness', label: 'Bud Tightness', type: 'range', min: 0, max: 10, step: 0.1, showIf: (p) => p.budMode, infoKey: 'petalis.budTightness' },
      { type: 'section', label: 'Central Elements' },
      {
        id: 'centerType',
        label: 'Center Type',
        type: 'select',
        options: [
          { value: 'disk', label: 'Disk' },
          { value: 'dome', label: 'Dome' },
          { value: 'starburst', label: 'Starburst' },
          { value: 'dot', label: 'Dot Field' },
          { value: 'filament', label: 'Filament Cluster' },
        ],
        infoKey: 'petalis.centerType',
      },
      { id: 'centerRadius', label: 'Center Radius (mm)', type: 'range', min: 2, max: 40, step: 1, infoKey: 'petalis.centerRadius' },
      { id: 'centerDensity', label: 'Center Density', type: 'range', min: 4, max: 120, step: 1, infoKey: 'petalis.centerDensity' },
      { id: 'centerFalloff', label: 'Center Falloff', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'petalis.centerFalloff' },
      { id: 'centerRing', label: 'Secondary Ring', type: 'checkbox', infoKey: 'petalis.centerRing' },
      { id: 'centerRingRadius', label: 'Ring Radius (mm)', type: 'range', min: 3, max: 60, step: 1, showIf: (p) => p.centerRing, infoKey: 'petalis.centerRingRadius' },
      { id: 'centerRingDensity', label: 'Ring Density', type: 'range', min: 6, max: 120, step: 1, showIf: (p) => p.centerRing, infoKey: 'petalis.centerRingDensity' },
      { id: 'centerConnectors', label: 'Connect to Petals', type: 'checkbox', infoKey: 'petalis.centerConnectors' },
      { id: 'connectorCount', label: 'Connector Count', type: 'range', min: 4, max: 120, step: 1, showIf: (p) => p.centerConnectors, infoKey: 'petalis.connectorCount' },
      { id: 'connectorLength', label: 'Connector Length (mm)', type: 'range', min: 2, max: 40, step: 1, showIf: (p) => p.centerConnectors, infoKey: 'petalis.connectorLength' },
      { id: 'connectorJitter', label: 'Connector Jitter', type: 'range', min: 0, max: 1, step: 0.05, showIf: (p) => p.centerConnectors, infoKey: 'petalis.connectorJitter' },
      { type: 'modifierList', label: 'Center Modifiers' },
      { type: 'section', label: 'Randomness & Seed' },
      { id: 'countJitter', label: 'Count Jitter', type: 'range', min: 0, max: 0.5, step: 0.01, infoKey: 'petalis.countJitter' },
      { id: 'sizeJitter', label: 'Size Jitter', type: 'range', min: 0, max: 0.5, step: 0.01, infoKey: 'petalis.sizeJitter' },
      {
        id: 'rotationJitter',
        label: 'Rotation Jitter',
        type: 'angle',
        min: 0,
        max: 45,
        step: 1,
        displayUnit: '°',
        infoKey: 'petalis.rotationJitter',
      },
      {
        id: 'angularDrift',
        label: 'Angular Drift',
        type: 'angle',
        min: 0,
        max: 45,
        step: 1,
        displayUnit: '°',
        infoKey: 'petalis.angularDrift',
      },
      { id: 'driftStrength', label: 'Drift Strength', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'petalis.driftStrength' },
      { type: 'noiseList', source: 'petalisDrift', label: 'Drift Noise Rack' },
      { id: 'radiusScale', label: 'Radius Scale', type: 'range', min: -1, max: 1, step: 0.05, infoKey: 'petalis.radiusScale' },
      { id: 'radiusScaleCurve', label: 'Radius Scale Curve', type: 'range', min: 0.5, max: 2.5, step: 0.05, infoKey: 'petalis.radiusScaleCurve' },
    ],
    wavetable: [
      {
        id: 'lineStructure',
        label: 'Line Structure',
        type: 'select',
        options: [
          { value: 'horizontal', label: 'Horizontal' },
          { value: 'vertical', label: 'Vertical' },
          { value: 'horizontal-vertical', label: 'Horizontal & Vertical' },
          { value: 'isometric', label: 'Isometric' },
          { value: 'lattice', label: 'Lattice' },
        ],
        infoKey: 'wavetable.lineStructure',
      },
      {
        id: 'lines',
        label: 'Lines',
        type: 'range',
        min: 5,
        max: 500,
        step: 1,
        infoKey: 'wavetable.lines',
      },
      { id: 'gap', label: 'Line Gap', type: 'range', min: 0.5, max: 3.0, step: 0.1, infoKey: 'wavetable.gap' },
      { id: 'tilt', label: 'Row Shift', type: 'range', min: -12, max: 12, step: 1, infoKey: 'wavetable.tilt' },
      {
        id: 'lineOffset',
        label: 'Line Offset Angle',
        type: 'angle',
        min: 0,
        max: 360,
        step: 1,
        displayUnit: '°',
        infoKey: 'wavetable.lineOffset',
      },
      {
        id: 'continuity',
        label: 'Continuity',
        type: 'select',
        options: [
          { value: 'none', label: 'None' },
          { value: 'single', label: 'Single' },
          { value: 'double', label: 'Double' },
        ],
        infoKey: 'wavetable.continuity',
      },
      { type: 'noiseList' },
      { type: 'section', label: 'Edge Noise Dampening' },
      {
        id: 'edgeFadeMode',
        label: 'Edge Noise Dampening Mode',
        type: 'select',
        options: [
          { value: 'none', label: 'None' },
          { value: 'left', label: 'Left' },
          { value: 'right', label: 'Right' },
          { value: 'both', label: 'Both' },
        ],
        infoKey: 'wavetable.edgeFadeMode',
      },
      {
        id: 'edgeFade',
        label: 'Edge Noise Dampening Amount',
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        infoKey: 'wavetable.edgeFade',
      },
      {
        id: 'edgeFadeThreshold',
        label: 'Edge Noise Dampening Threshold',
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        infoKey: 'wavetable.edgeFadeThreshold',
      },
      {
        id: 'edgeFadeFeather',
        label: 'Edge Noise Dampening Feather',
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        infoKey: 'wavetable.edgeFadeFeather',
      },
      { type: 'section', label: 'Vertical Noise Dampening' },
      {
        id: 'verticalFadeMode',
        label: 'Vertical Noise Dampening Mode',
        type: 'select',
        options: [
          { value: 'none', label: 'None' },
          { value: 'top', label: 'Top' },
          { value: 'bottom', label: 'Bottom' },
          { value: 'both', label: 'Both' },
        ],
        infoKey: 'wavetable.verticalFadeMode',
      },
      {
        id: 'verticalFade',
        label: 'Vertical Noise Dampening Amount',
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        infoKey: 'wavetable.verticalFade',
      },
      {
        id: 'verticalFadeThreshold',
        label: 'Vertical Noise Dampening Threshold',
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        infoKey: 'wavetable.verticalFadeThreshold',
      },
      {
        id: 'verticalFadeFeather',
        label: 'Vertical Noise Dampening Feather',
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        infoKey: 'wavetable.verticalFadeFeather',
      },
      { id: 'dampenExtremes', label: 'Dampen Extremes', type: 'checkbox', infoKey: 'wavetable.dampenExtremes' },
      {
        id: 'overlapPadding',
        label: 'Overlap Padding (mm)',
        type: 'range',
        min: 0,
        max: 5,
        step: 0.1,
        infoKey: 'wavetable.overlapPadding',
      },
      { id: 'flatCaps', label: 'Flat Top/Bottom', type: 'checkbox', infoKey: 'wavetable.flatCaps' },
    ],
    rings: [
      { type: 'noiseList' },
      { type: 'section', label: 'Ring Structure' },
      { id: 'rings', label: 'Rings', type: 'range', min: 1, max: 120, step: 1, infoKey: 'rings.rings' },
      { id: 'centerDiameter', label: 'Center Diameter', type: 'range', min: 0, max: 500, step: 1, infoKey: 'rings.centerDiameter' },
      { id: 'outerDiameter', label: 'Outer Diameter', type: 'range', min: 1, max: 500, step: 1, infoKey: 'rings.outerDiameter' },
      { type: 'section', label: 'Ring Spacing' },
      { id: 'gap', label: 'Ring Gap', type: 'range', min: 0.4, max: 3.0, step: 0.1, infoKey: 'rings.gap' },
      { id: 'gapCurveStart', label: 'Inner Gap', type: 'range', min: 0.3, max: 10, step: 0.05, infoKey: 'rings.gapCurveStart' },
      { id: 'gapCurveEnd', label: 'Outer Gap', type: 'range', min: 0.3, max: 3.0, step: 0.05, infoKey: 'rings.gapCurveEnd' },
      { id: 'spacingVariance', label: 'Spacing Variance', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'rings.spacingVariance' },
      { type: 'section', label: 'Growth Character' },
      { id: 'offsetX', label: 'Center Offset X', type: 'range', min: -200, max: 200, step: 1, infoKey: 'rings.offsetX' },
      { id: 'offsetY', label: 'Center Offset Y', type: 'range', min: -200, max: 200, step: 1, infoKey: 'rings.offsetY' },
      { id: 'centerDrift', label: 'Center Drift', type: 'range', min: 0, max: 5, step: 0.1, infoKey: 'rings.centerDrift' },
      { id: 'biasStrength', label: 'Bias Strength', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'rings.biasStrength' },
      { id: 'biasAngle', label: 'Bias Direction', type: 'angle', min: 0, max: 360, step: 1, displayUnit: '°', infoKey: 'rings.biasAngle', showIf: (p) => (p.biasStrength ?? 0) > 0 },
      { type: 'collapsibleGroup', label: 'Tree Ring Parameters' },
      { type: 'section', label: 'Bark Zone' },
      { id: 'barkRings', label: 'Bark Rings', type: 'range', min: 0, max: 24, step: 1, infoKey: 'rings.barkRings' },
      { id: 'barkType', label: 'Bark Style', type: 'select', options: [
          { value: 'smooth',     label: 'Smooth' },
          { value: 'rough',      label: 'Rough' },
          { value: 'furrowed',   label: 'Furrowed' },
          { value: 'plated',     label: 'Plated' },
          { value: 'papery',     label: 'Papery' },
          { value: 'fibrous',    label: 'Fibrous' },
          { value: 'scaly',      label: 'Scaly' },
          { value: 'cracked',    label: 'Cracked' },
          { value: 'lenticular', label: 'Lenticular' },
          { value: 'woven',      label: 'Woven' },
        ], infoKey: 'rings.barkType', showIf: (p) => (p.barkRings ?? 0) > 0 },
      { id: 'barkGap', label: 'Bark Gap', type: 'range', min: 0, max: 10, step: 0.1, infoKey: 'rings.barkGap', showIf: (p) => (p.barkRings ?? 0) > 0 },
      // rough
      { id: 'barkRoughness', label: 'Roughness', type: 'range', min: 0, max: 20, step: 0.5, infoKey: 'rings.barkRoughness', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'rough' },
      { id: 'barkRoughnessConfinement', label: 'Confinement', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'rings.barkRoughnessConfinement', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'rough' },
      { id: 'barkFreq', label: 'Frequency', type: 'range', min: 1, max: 20, step: 0.5, infoKey: 'rings.barkFreq', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'rough' },
      // furrowed
      { id: 'barkFurrowCount', label: 'Furrow Count', type: 'range', min: 3, max: 40, step: 1, infoKey: 'rings.barkFurrowCount', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'furrowed' },
      { id: 'barkFurrowDepth', label: 'Furrow Depth', type: 'range', min: 0.5, max: 15, step: 0.5, infoKey: 'rings.barkFurrowDepth', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'furrowed' },
      { id: 'barkFurrowWidth', label: 'Furrow Width', type: 'range', min: 0.02, max: 0.5, step: 0.02, infoKey: 'rings.barkFurrowWidth', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'furrowed' },
      // plated
      { id: 'barkPlateCount', label: 'Plate Count', type: 'range', min: 4, max: 32, step: 1, infoKey: 'rings.barkPlateCount', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'plated' },
      { id: 'barkPlateRelief', label: 'Plate Relief', type: 'range', min: 0.5, max: 12, step: 0.5, infoKey: 'rings.barkPlateRelief', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'plated' },
      { id: 'barkPlateVariance', label: 'Plate Variance', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'rings.barkPlateVariance', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'plated' },
      // papery
      { id: 'barkPaperStrips', label: 'Strip Count', type: 'range', min: 2, max: 20, step: 1, infoKey: 'rings.barkPaperStrips', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'papery' },
      { id: 'barkPaperPeel', label: 'Peel Lift', type: 'range', min: 0, max: 10, step: 0.5, infoKey: 'rings.barkPaperPeel', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'papery' },
      { id: 'barkPaperJitter', label: 'Strip Jitter', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'rings.barkPaperJitter', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'papery' },
      // fibrous
      { id: 'barkFiberCount', label: 'Fiber Count', type: 'range', min: 6, max: 80, step: 1, infoKey: 'rings.barkFiberCount', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'fibrous' },
      { id: 'barkFiberAmplitude', label: 'Fiber Amplitude', type: 'range', min: 0.5, max: 10, step: 0.5, infoKey: 'rings.barkFiberAmplitude', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'fibrous' },
      { id: 'barkFiberPhaseShift', label: 'Phase Shift', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'rings.barkFiberPhaseShift', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'fibrous' },
      // scaly
      { id: 'barkScaleColumns', label: 'Scale Count', type: 'range', min: 6, max: 40, step: 1, infoKey: 'rings.barkScaleColumns', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'scaly' },
      { id: 'barkScaleRelief', label: 'Scale Relief', type: 'range', min: 0.5, max: 10, step: 0.5, infoKey: 'rings.barkScaleRelief', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'scaly' },
      { id: 'barkScaleTaper', label: 'Scale Taper', type: 'range', min: 0.1, max: 1, step: 0.05, infoKey: 'rings.barkScaleTaper', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'scaly' },
      // cracked
      { id: 'barkCrackDensity', label: 'Crack Count', type: 'range', min: 2, max: 30, step: 1, infoKey: 'rings.barkCrackDensity', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'cracked' },
      { id: 'barkCrackDepth', label: 'Crack Depth', type: 'range', min: 0.5, max: 15, step: 0.5, infoKey: 'rings.barkCrackDepth', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'cracked' },
      { id: 'barkCrackWidth', label: 'Crack Width', type: 'range', min: 0.01, max: 0.3, step: 0.01, infoKey: 'rings.barkCrackWidth', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'cracked' },
      // lenticular
      { id: 'barkLenticleCount', label: 'Lenticle Count', type: 'range', min: 4, max: 40, step: 1, infoKey: 'rings.barkLenticleCount', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'lenticular' },
      { id: 'barkLenticleDepth', label: 'Lenticle Depth', type: 'range', min: 0.5, max: 10, step: 0.5, infoKey: 'rings.barkLenticleDepth', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'lenticular' },
      { id: 'barkLenticleWidth', label: 'Lenticle Width', type: 'range', min: 0.02, max: 0.4, step: 0.02, infoKey: 'rings.barkLenticleWidth', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'lenticular' },
      // woven
      { id: 'barkWeaveFreq', label: 'Weave Frequency', type: 'range', min: 2, max: 20, step: 0.5, infoKey: 'rings.barkWeaveFreq', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'woven' },
      { id: 'barkWeaveAmplitude', label: 'Weave Amplitude', type: 'range', min: 0.5, max: 8, step: 0.5, infoKey: 'rings.barkWeaveAmplitude', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'woven' },
      { id: 'barkWeaveAngle', label: 'Weave Angle', type: 'angle', min: 0, max: 180, step: 1, infoKey: 'rings.barkWeaveAngle', showIf: (p) => (p.barkRings ?? 0) > 0 && (p.barkType ?? 'smooth') === 'woven' },
      { type: 'section', label: 'Thick Rings' },
      { id: 'thickRingCount', label: 'Cluster Count', type: 'range', min: 0, max: 12, step: 1, infoKey: 'rings.thickRingCount' },
      { id: 'thickRingDensity', label: 'Compression', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'rings.thickRingDensity', showIf: (p) => (p.thickRingCount ?? 0) > 0 },
      { id: 'thickRingWidth', label: 'Cluster Width', type: 'range', min: 1, max: 12, step: 1, infoKey: 'rings.thickRingWidth', showIf: (p) => (p.thickRingCount ?? 0) > 0 },
      { id: 'thickRingSeed', label: 'Cluster Seed', type: 'range', min: 0, max: 9999, step: 1, infoKey: 'rings.thickRingSeed', showIf: (p) => (p.thickRingCount ?? 0) > 0 },
      { type: 'section', label: 'Medullary Rays' },
      { id: 'rayCount', label: 'Ray Count', type: 'range', min: 0, max: 120, step: 1, infoKey: 'rings.rayCount' },
      { id: 'rayLength', label: 'Ray Length', type: 'rangeDual', minKey: 'rayMinLength', maxKey: 'rayMaxLength', min: 0.1, max: 10, step: 0.1, infoKey: 'rings.rayLength', showIf: (p) => (p.rayCount ?? 0) > 0 },
      { id: 'rayLengthVariance', label: 'Length Variance', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'rings.rayLengthVariance', showIf: (p) => (p.rayCount ?? 0) > 0 },
      { id: 'rayInnerFraction', label: 'Ray Start', type: 'range', min: 0, max: 0.7, step: 0.05, infoKey: 'rings.rayInnerFraction', showIf: (p) => (p.rayCount ?? 0) > 0 },
      { id: 'raySeed', label: 'Ray Seed', type: 'range', min: 0, max: 9999, step: 1, infoKey: 'rings.raySeed', showIf: (p) => (p.rayCount ?? 0) > 0 },
      { type: 'section', label: 'Knots' },
      { id: 'knotCount', label: 'Knot Count', type: 'range', min: 0, max: 30, step: 1, infoKey: 'rings.knotCount' },
      { id: 'knotSeed', label: 'Knot Seed', type: 'range', min: 0, max: 9999, step: 1, infoKey: 'rings.knotSeed', showIf: (p) => (p.knotCount ?? 0) > 0 },
      { id: 'knotSize', label: 'Knot Ring Reach', type: 'rangeDual', minKey: 'knotMinSize', maxKey: 'knotMaxSize', min: 0.5, max: 20, step: 0.5, infoKey: 'rings.knotSize', showIf: (p) => (p.knotCount ?? 0) > 0 },
      { id: 'knotSizeVariance', label: 'Knot Size Variance', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'rings.knotSizeVariance', showIf: (p) => (p.knotCount ?? 0) > 0 },
      { id: 'knotIntensity', label: 'Knot Strength', type: 'range', min: 0, max: 2, step: 0.05, infoKey: 'rings.knotIntensity', showIf: (p) => (p.knotCount ?? 0) > 0 },
      { id: 'knotStrengthVariance', label: 'Knot Strength Variance', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'rings.knotStrengthVariance', showIf: (p) => (p.knotCount ?? 0) > 0 },
      { id: 'knotSpread', label: 'Knot Size', type: 'range', min: 5, max: 90, step: 1, infoKey: 'rings.knotSpread', showIf: (p) => (p.knotCount ?? 0) > 0 },
      { id: 'knotDirection', label: 'Knot Direction', type: 'select', options: [{ value: 'outer', label: 'Outer' }, { value: 'inner', label: 'Inner' }, { value: 'both', label: 'Both' }], infoKey: 'rings.knotDirection', showIf: (p) => (p.knotCount ?? 0) > 0 },
      { type: 'section', label: 'V-Markings' },
      { id: 'vMarkCount', label: 'V-Mark Count', type: 'range', min: 0, max: 10, step: 1, infoKey: 'rings.vMarkCount' },
      { id: 'vMarkDepth', label: 'V-Mark Depth', type: 'range', min: 0, max: 60, step: 1, infoKey: 'rings.vMarkDepth', showIf: (p) => (p.vMarkCount ?? 0) > 0 },
      { id: 'vMarkSpread', label: 'V-Mark Spread', type: 'range', min: 1, max: 60, step: 1, infoKey: 'rings.vMarkSpread', showIf: (p) => (p.vMarkCount ?? 0) > 0 },
      { id: 'vMarkSize', label: 'Ring Reach (%)', type: 'range', min: 0, max: 100, step: 1, infoKey: 'rings.vMarkSize', showIf: (p) => (p.vMarkCount ?? 0) > 0 },
      { id: 'vMarkSeed', label: 'V-Mark Seed', type: 'range', min: 0, max: 9999, step: 1, infoKey: 'rings.vMarkSeed', showIf: (p) => (p.vMarkCount ?? 0) > 0 },
      { type: 'section', label: 'Radial Breaks' },
      { id: 'breakCount', label: 'Break Count', type: 'range', min: 0, max: 20, step: 1, infoKey: 'rings.breakCount' },
      { id: 'breakRadius', label: 'Break Radius (%)', type: 'rangeDual', minKey: 'breakRadiusMin', maxKey: 'breakRadiusMax', min: 0, max: 100, step: 1, infoKey: 'rings.breakRadius', showIf: (p) => (p.breakCount ?? 0) > 0 },
      { id: 'breakLengthVariance', label: 'Radius Variance', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'rings.breakLengthVariance', showIf: (p) => (p.breakCount ?? 0) > 0 },
      { id: 'breakNoiseSeed', label: 'Break Seed', type: 'range', min: 0, max: 9999, step: 1, infoKey: 'rings.breakNoiseSeed', showIf: (p) => (p.breakCount ?? 0) > 0 },
      { id: 'breakWidth', label: 'Break Width (°)', type: 'rangeDual', minKey: 'breakWidthMin', maxKey: 'breakWidthMax', min: 0.5, max: 30, step: 0.5, infoKey: 'rings.breakWidth', showIf: (p) => (p.breakCount ?? 0) > 0 },
      { id: 'breakWidthVariance', label: 'Width Variance', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'rings.breakWidthVariance', showIf: (p) => (p.breakCount ?? 0) > 0 },
      { type: 'section', label: 'Cracks' },
      { id: 'crackCount', label: 'Crack Count', type: 'range', min: 0, max: 12, step: 1, infoKey: 'rings.crackCount' },
      { id: 'crackDepth', label: 'Crack Depth', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'rings.crackDepth', showIf: (p) => (p.crackCount ?? 0) > 0 },
      { id: 'crackSpread', label: 'Crack Width (°)', type: 'range', min: 0.5, max: 20, step: 0.5, infoKey: 'rings.crackSpread', showIf: (p) => (p.crackCount ?? 0) > 0 },
      { id: 'crackNoise', label: 'Crack Roughness', type: 'range', min: 0, max: 1, step: 0.05, infoKey: 'rings.crackNoise', showIf: (p) => (p.crackCount ?? 0) > 0 },
      { id: 'crackSeed', label: 'Crack Seed', type: 'range', min: 0, max: 9999, step: 1, infoKey: 'rings.crackSeed', showIf: (p) => (p.crackCount ?? 0) > 0 },
      { id: 'crackOutline', label: 'Crack Outline', type: 'checkbox', infoKey: 'rings.crackOutline', showIf: (p) => (p.crackCount ?? 0) > 0 },
      { type: 'section', label: 'Scars' },
      { id: 'scarCount', label: 'Scar Count', type: 'range', min: 0, max: 6, step: 1, infoKey: 'rings.scarCount' },
      { id: 'scarDepth', label: 'Scar Depth', type: 'range', min: 0, max: 80, step: 1, infoKey: 'rings.scarDepth', showIf: (p) => (p.scarCount ?? 0) > 0 },
      { id: 'scarWidth', label: 'Scar Width', type: 'range', min: 0.5, max: 180, step: 0.5, infoKey: 'rings.scarWidth', showIf: (p) => (p.scarCount ?? 0) > 0 },
      { id: 'scarSize', label: 'Healing Rate', type: 'range', min: 1, max: 30, step: 1, infoKey: 'rings.scarSize', showIf: (p) => (p.scarCount ?? 0) > 0 },
      { id: 'scarSeed', label: 'Scar Seed', type: 'range', min: 0, max: 9999, step: 1, infoKey: 'rings.scarSeed', showIf: (p) => (p.scarCount ?? 0) > 0 },
      { type: 'collapsibleGroupEnd' },
    ],
    topo: [
      { id: 'resolution', label: 'Resolution', type: 'range', min: 40, max: 240, step: 5, infoKey: 'topo.resolution' },
      { id: 'levels', label: 'Contour Levels', type: 'range', min: 4, max: 60, step: 1, infoKey: 'topo.levels' },
      { type: 'noiseList' },
      { id: 'sensitivity', label: 'Sensitivity', type: 'range', min: 0.3, max: 2.5, step: 0.05, infoKey: 'topo.sensitivity' },
      { id: 'thresholdOffset', label: 'Threshold Offset', type: 'range', min: -1, max: 1, step: 0.05, infoKey: 'topo.thresholdOffset' },
      {
        id: 'mappingMode',
        label: 'Mapping Mode',
        type: 'select',
        options: [
          { value: 'marching', label: 'Marching Squares' },
          { value: 'smooth', label: 'Smooth' },
          { value: 'bezier', label: 'Quadratic Bezier' },
          { value: 'gradient', label: 'Gradient Trace' },
        ],
        infoKey: 'topo.mappingMode',
      },
    ],
    rainfall: [
      { id: 'count', label: 'Drop Count', type: 'range', min: 20, max: 2000, step: 10, infoKey: 'rainfall.count' },
      { id: 'traceLength', label: 'Trace Length', type: 'range', min: 20, max: 400, step: 5, infoKey: 'rainfall.traceLength' },
      {
        id: 'lengthJitter',
        label: 'Length Jitter',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        infoKey: 'rainfall.lengthJitter',
      },
      { id: 'traceStep', label: 'Trace Step', type: 'range', min: 2, max: 20, step: 1, infoKey: 'rainfall.traceStep' },
      {
        id: 'stepJitter',
        label: 'Step Jitter',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        infoKey: 'rainfall.stepJitter',
      },
      { id: 'turbulence', label: 'Turbulence', type: 'range', min: 0, max: 1.5, step: 0.05, infoKey: 'rainfall.turbulence' },
      {
        id: 'gustStrength',
        label: 'Gust Strength',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        infoKey: 'rainfall.gustStrength',
      },
      {
        id: 'rainfallAngle',
        label: 'Rainfall Angle',
        type: 'angle',
        min: 0,
        max: 360,
        step: 1,
        displayUnit: '°',
        inlineGroup: 'rainfallAngles',
        infoKey: 'rainfall.rainfallAngle',
      },
      {
        id: 'angleJitter',
        label: 'Angle Jitter',
        type: 'range',
        min: 0,
        max: 45,
        step: 1,
        displayUnit: '°',
        infoKey: 'rainfall.angleJitter',
      },
      {
        id: 'windAngle',
        label: 'Wind Angle',
        type: 'angle',
        min: 0,
        max: 360,
        step: 1,
        displayUnit: '°',
        inlineGroup: 'rainfallAngles',
        infoKey: 'rainfall.windAngle',
      },
      {
        id: 'dropRotate',
        label: 'Drop Head Rotate',
        type: 'angle',
        min: 0,
        max: 360,
        step: 1,
        displayUnit: '°',
        inlineGroup: 'rainfallAngles',
        infoKey: 'rainfall.dropRotate',
        showIf: (p) => p.dropShape !== 'none',
      },
      { id: 'windStrength', label: 'Wind Strength', type: 'range', min: 0, max: 1.5, step: 0.05, infoKey: 'rainfall.windStrength' },
      { id: 'dropSize', label: 'Droplet Size', type: 'range', min: 0, max: 12, step: 0.5, infoKey: 'rainfall.dropSize' },
      {
        id: 'dropSizeJitter',
        label: 'Drop Size Jitter',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        infoKey: 'rainfall.dropSizeJitter',
        showIf: (p) => p.dropShape !== 'none',
      },
      {
        id: 'dropShape',
        label: 'Droplet Shape',
        type: 'select',
        options: [
          { value: 'none', label: 'None' },
          { value: 'circle', label: 'Circle' },
          { value: 'square', label: 'Square' },
          { value: 'teardrop', label: 'Teardrop' },
        ],
        infoKey: 'rainfall.dropShape',
      },
      ...(window.Vectura.FillPanel?.buildFillControlDefs({
        fillTypeOptions: window.Vectura.FillPanel.FILL_TYPE_OPTIONS_RAINFALL,
        typeParam: 'dropFill',
        densityParam: 'fillDensity',
        angleParam: 'fillAngle',
        amplitudeParam: 'fillAmplitude',
        paddingParam: 'fillPadding',
        dotSizeParam: 'fillDotSize',
        shiftXParam: 'fillShiftX',
        shiftYParam: 'fillShiftY',
        showIfBase: (p) => p.dropShape !== 'none',
        descKeyPrefix: 'fill',
      }) || []),
      {
        id: 'widthMultiplier',
        label: 'Rain Width',
        type: 'range',
        min: 1,
        max: 4,
        step: 1,
        infoKey: 'rainfall.widthMultiplier',
      },
      {
        id: 'thickeningMode',
        label: 'Thickening Mode',
        type: 'select',
        options: [
          { value: 'parallel', label: 'Parallel' },
          { value: 'snake', label: 'Snake' },
          { value: 'sinusoidal', label: 'Sinusoidal' },
        ],
        infoKey: 'rainfall.thickeningMode',
      },
      {
        id: 'trailBreaks',
        label: 'Trail Breaks',
        type: 'select',
        options: [
          { value: 'none', label: 'None' },
          { value: 'sparse', label: 'Sparse' },
          { value: 'regular', label: 'Regular' },
          { value: 'stutter', label: 'Stutter' },
          { value: 'dashes', label: 'Dashes' },
          { value: 'fade', label: 'Fade' },
          { value: 'burst', label: 'Burst' },
          { value: 'drop', label: 'Drop' },
          { value: 'drip', label: 'Drip' },
          { value: 'speckle', label: 'Speckle' },
        ],
        infoKey: 'rainfall.trailBreaks',
      },
      {
        id: 'breakRandomness',
        label: 'Break Randomness',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        infoKey: 'rainfall.breakRandomness',
        showIf: (p) => p.trailBreaks && p.trailBreaks !== 'none',
      },
      {
        id: 'breakSpacing',
        label: 'Break Spacing',
        type: 'range',
        min: 2,
        max: 40,
        step: 1,
        infoKey: 'rainfall.breakSpacing',
        showIf: (p) => p.trailBreaks && p.trailBreaks !== 'none',
      },
      {
        id: 'breakLengthJitter',
        label: 'Length Randomization',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        infoKey: 'rainfall.breakLengthJitter',
        showIf: (p) => p.trailBreaks && p.trailBreaks !== 'none',
      },
      {
        id: 'breakWidthJitter',
        label: 'Width Randomization',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        infoKey: 'rainfall.breakWidthJitter',
        showIf: (p) => p.trailBreaks && p.trailBreaks !== 'none',
      },
      {
        id: 'silhouetteId',
        label: 'Silhouette Image',
        type: 'image',
        accept: 'image/*',
        idKey: 'silhouetteId',
        nameKey: 'silhouetteName',
        infoKey: 'rainfall.silhouette',
        modalTitle: 'Select Silhouette Image',
        modalLabel: 'Silhouette Image',
        modalDescription: 'Drop a PNG/SVG with transparency; rain is generated inside opaque pixels.',
        dropLabel: 'Drop silhouette here',
      },
      {
        id: 'silhouetteWidth',
        label: 'Silhouette Width (mm)',
        type: 'range',
        min: 40,
        max: 400,
        step: 5,
        infoKey: 'rainfall.silhouetteWidth',
        showIf: (p) => Boolean(p.silhouetteId),
      },
      {
        id: 'silhouetteHeight',
        label: 'Silhouette Height (mm)',
        type: 'range',
        min: 40,
        max: 400,
        step: 5,
        infoKey: 'rainfall.silhouetteHeight',
        showIf: (p) => Boolean(p.silhouetteId),
      },
      {
        id: 'silhouetteTilesX',
        label: 'Tiling X',
        type: 'range',
        min: 1,
        max: 6,
        step: 1,
        infoKey: 'rainfall.silhouetteTilesX',
        showIf: (p) => Boolean(p.silhouetteId),
      },
      {
        id: 'silhouetteTilesY',
        label: 'Tiling Y',
        type: 'range',
        min: 1,
        max: 6,
        step: 1,
        infoKey: 'rainfall.silhouetteTilesY',
        showIf: (p) => Boolean(p.silhouetteId),
      },
      {
        id: 'silhouetteSpacing',
        label: 'Tile Spacing (mm)',
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        infoKey: 'rainfall.silhouetteSpacing',
        showIf: (p) => Boolean(p.silhouetteId),
      },
      {
        id: 'silhouetteOffsetX',
        label: 'Offset X (mm)',
        type: 'range',
        min: -200,
        max: 200,
        step: 1,
        infoKey: 'rainfall.silhouetteOffsetX',
        showIf: (p) => Boolean(p.silhouetteId),
      },
      {
        id: 'silhouetteOffsetY',
        label: 'Offset Y (mm)',
        type: 'range',
        min: -200,
        max: 200,
        step: 1,
        infoKey: 'rainfall.silhouetteOffsetY',
        showIf: (p) => Boolean(p.silhouetteId),
      },
      {
        id: 'silhouetteInvert',
        label: 'Invert Silhouette',
        type: 'checkbox',
        infoKey: 'rainfall.silhouetteInvert',
        showIf: (p) => Boolean(p.silhouetteId),
      },
      { type: 'section', label: 'Noise Stack' },
      {
        id: 'noiseApply',
        label: 'Noise Target',
        type: 'select',
        options: [
          { value: 'trails', label: 'Trails' },
          { value: 'droplets', label: 'Droplets' },
          { value: 'both', label: 'Both' },
        ],
        infoKey: 'rainfall.noiseApply',
      },
      { type: 'noiseList' },
    ],
    spiral: [
      { id: 'loops', label: 'Loops', type: 'range', min: 1, max: 150, step: 1, infoKey: 'spiral.loops' },
      { id: 'res', label: 'Points / Quadrant', type: 'range', min: 4, max: 120, step: 2, infoKey: 'spiral.res' },
      { id: 'startR', label: 'Inner Radius', type: 'range', min: 0, max: 60, step: 1, infoKey: 'spiral.startR' },
      { type: 'noiseList' },
      { id: 'pulseAmp', label: 'Pulse Amp', type: 'range', min: 0, max: 0.4, step: 0.01, infoKey: 'spiral.pulseAmp' },
      { id: 'pulseFreq', label: 'Pulse Freq', type: 'range', min: 0.5, max: 8, step: 0.1, infoKey: 'spiral.pulseFreq' },
      {
        id: 'angleOffset',
        label: 'Angle Offset',
        type: 'angle',
        min: 0,
        max: 360,
        step: 1,
        displayUnit: '°',
        infoKey: 'spiral.angleOffset',
      },
      { id: 'axisSnap', label: 'Axis Snap', type: 'checkbox', infoKey: 'spiral.axisSnap' },
      { id: 'close', label: 'Close Spiral', type: 'checkbox', infoKey: 'spiral.close' },
      {
        id: 'closeFeather',
        label: 'Close Feather',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        infoKey: 'spiral.closeFeather',
        showIf: (p) => Boolean(p.close),
      },
    ],
    halftone: [
      { type: 'section', label: 'Source' },
      { id: 'imageSrc', label: 'Picture', type: 'imageUpload' },
      { type: 'section', label: 'Screen' },
      { id: 'dotSpacing', label: 'Dot Spacing', type: 'range', min: 1, max: 16, step: 0.1, displayUnit: 'mm' },
      { id: 'maxDotSize', label: 'Max Dot', type: 'range', min: 0.5, max: 14, step: 0.1, displayUnit: 'mm' },
      { id: 'minDotSize', label: 'Min Dot', type: 'range', min: 0, max: 8, step: 0.1, displayUnit: 'mm' },
      { id: 'dotThreshold', label: 'White Cutoff', type: 'range', min: 0, max: 60, step: 1, displayUnit: '%' },
      { id: 'gridAngle', label: 'Screen Angle', type: 'angle', min: -90, max: 90, step: 1, displayUnit: '°' },
      {
        id: 'dotShape',
        label: 'Dot Shape',
        type: 'select',
        options: [
          { value: 'circle', label: 'Circle' },
          { value: 'polygon', label: 'Polygon' },
          { value: 'star', label: 'Star' },
          { value: 'gear', label: 'Gear' },
          { value: 'flower', label: 'Flower' },
          { value: 'cross', label: 'Cross' },
          { value: 'heart', label: 'Heart' },
        ],
      },
      {
        id: 'dotGrid',
        label: 'Tiling',
        type: 'select',
        options: [
          { value: 'square', label: 'Square' },
          { value: 'brick', label: 'Brick' },
          { value: 'hex', label: 'Honeycomb' },
        ],
      },
      // Per-shape count knobs — only the relevant one is shown.
      { id: 'dotSides', label: 'Sides', type: 'range', min: 3, max: 24, step: 1, showIf: (p) => p.dotShape === 'polygon' },
      { id: 'dotPoints', label: 'Points', type: 'range', min: 3, max: 24, step: 1, showIf: (p) => p.dotShape === 'star' },
      { id: 'dotTeeth', label: 'Cogs', type: 'range', min: 3, max: 36, step: 1, showIf: (p) => p.dotShape === 'gear' },
      { id: 'dotPetals', label: 'Petals', type: 'range', min: 2, max: 16, step: 1, showIf: (p) => p.dotShape === 'flower' },
      { id: 'dotAspect', label: 'Aspect', type: 'range', min: 0.25, max: 4, step: 0.05 },
      { id: 'dotJitter', label: 'Jitter', type: 'range', min: 0, max: 100, step: 1, displayUnit: '%' },
      { id: 'smartEdges', label: 'Merge Dots', type: 'checkbox' },
      { type: 'section', label: 'Rotation' },
      { id: 'dotSpin', label: 'Rotation', type: 'angle', min: -180, max: 180, step: 1, displayUnit: '°' },
      { id: 'dotSpinDir', label: 'Offset Direction', type: 'angle', min: 0, max: 360, step: 1, displayUnit: '°' },
      { id: 'dotSpinAmount', label: 'Offset Amount', type: 'range', min: -720, max: 720, step: 1, displayUnit: '°' },
      {
        id: 'dotSpinCurve',
        label: 'Offset Curve',
        type: 'select',
        showIf: (p) => Number(p.dotSpinAmount) !== 0,
        options: [
          { value: 'linear', label: 'Linear' },
          { value: 'ease-in', label: 'Ease In' },
          { value: 'ease-out', label: 'Ease Out' },
          { value: 'ease-in-out', label: 'Ease In-Out' },
          { value: 'exponential', label: 'Exponential' },
        ],
      },
      // Universal Fill dropdown — patterns the interior of each open-outline dot
      // with the shared fill library (hatch / crosshatch / spiral / radial / …).
      ...(window.Vectura.FillPanel?.buildFillControlDefs({
        fillTypeOptions: [
          { value: 'none', label: 'None' },
          { value: 'hatch', label: 'Hatch' },
          { value: 'crosshatch', label: 'Crosshatch' },
          { value: 'spiral', label: 'Spiral' },
          { value: 'radial', label: 'Radial' },
          { value: 'dots', label: 'Dots' },
          { value: 'wave', label: 'Wave' },
        ],
        typeParam: 'markerFill',
        showIfBase: () => true,
        descKeyPrefix: 'fill',
      }) || []),
      { type: 'section', label: 'Tone' },
      { id: 'brightness', label: 'Brightness', type: 'range', min: -100, max: 100, step: 1 },
      { id: 'contrast', label: 'Contrast', type: 'range', min: -50, max: 100, step: 1 },
      { id: 'gamma', label: 'Gamma', type: 'range', min: 0.2, max: 3, step: 0.05 },
      { id: 'invert', label: 'Invert', type: 'checkbox' },
    ],
    imageWeave: [
      { type: 'section', label: 'Source' },
      { id: 'imageSrc', label: 'Picture', type: 'imageUpload' },
      { type: 'section', label: 'Weave' },
      { id: 'lineCount', label: 'Lines', type: 'range', min: 10, max: 600, step: 1 },
      { id: 'lineAngle', label: 'Line Angle', type: 'angle', min: -90, max: 90, step: 1, displayUnit: '°' },
      { id: 'amplitude', label: 'Amplitude', type: 'range', min: 0, max: 12, step: 0.1, displayUnit: 'mm' },
      { id: 'frequency', label: 'Frequency', type: 'range', min: 50, max: 10000, step: 50 },
      { id: 'detail', label: 'Detail', type: 'range', min: 10, max: 100, step: 1, displayUnit: '%' },
      {
        id: 'continuity',
        label: 'Continuity',
        type: 'select',
        options: [
          { value: 'none', label: 'None' },
          { value: 'single', label: 'Single' },
          { value: 'double', label: 'Double' },
        ],
        infoKey: 'imageWeave.continuity',
      },
      { id: 'drawWhiteAreas', label: 'Draw White Areas', type: 'checkbox' },
      { type: 'section', label: 'Tone' },
      { id: 'brightness', label: 'Brightness', type: 'range', min: -100, max: 100, step: 1 },
      { id: 'contrast', label: 'Contrast', type: 'range', min: -50, max: 100, step: 1 },
      { id: 'blackPoint', label: 'Black Point', type: 'range', min: 0, max: 90, step: 1, displayUnit: '%' },
      { id: 'whitePoint', label: 'White Point', type: 'range', min: 20, max: 100, step: 1, displayUnit: '%' },
      { id: 'invert', label: 'Invert', type: 'checkbox' },
    ],
    text: [
      { id: 'text', label: 'Text', type: 'textarea', rows: 2, placeholder: 'Type your text…' },
      {
        id: 'font',
        label: 'Font',
        type: 'fontPicker',
        // Built-in single-stroke faces; the picker adds a Google Fonts tab that
        // traces any web family's glyph outlines into pen paths.
        builtins: [
          { value: 'sans', label: 'Vectura Sans' },
          { value: 'italic', label: 'Vectura Italic' },
          { value: 'condensed', label: 'Condensed' },
          { value: 'wide', label: 'Wide' },
          { value: 'oblique', label: 'Backslant' },
        ],
      },
      {
        id: 'align',
        label: 'Align',
        type: 'select',
        options: [
          { value: 'left', label: 'Left' },
          { value: 'center', label: 'Center' },
          { value: 'right', label: 'Right' },
        ],
      },
      { id: 'fitToFrame', label: 'Fit to Frame', type: 'checkbox' },
      { id: 'fillRatio', label: 'Frame Fill', type: 'range', min: 0.3, max: 1, step: 0.02, showIf: (p) => p.fitToFrame !== false },
      { id: 'fontSize', label: 'Size', type: 'range', min: 4, max: 160, step: 1, showIf: (p) => p.fitToFrame === false },
      { id: 'tracking', label: 'Letter Spacing', type: 'range', min: -4, max: 24, step: 0.5 },
      { id: 'lineHeight', label: 'Line Height', type: 'range', min: 0.8, max: 3, step: 0.05 },
      { id: 'offsetX', label: 'Offset X', type: 'range', min: -200, max: 200, step: 1 },
      { id: 'offsetY', label: 'Offset Y', type: 'range', min: -200, max: 200, step: 1 },
      { id: 'jitter', label: 'Hand Jitter', type: 'range', min: 0, max: 3, step: 0.05 },
      // ── Outline ──────────────────────────────────────────────────────────
      { type: 'section', label: 'Outline' },
      { id: 'outlineStroke', label: 'Stroke Outline', type: 'checkbox', infoKey: 'text.outlineStroke' },
      { id: 'outlineThickness', label: 'Outline Weight', type: 'range', min: 1, max: 6, step: 1, showIf: (p) => p.outlineStroke !== false, infoKey: 'text.outlineThickness' },
      {
        id: 'thickeningMode',
        label: 'Thickening Mode',
        type: 'select',
        options: [
          { value: 'parallel', label: 'Parallel' },
          { value: 'sinusoidal', label: 'Sinusoidal' },
          { value: 'snake', label: 'Snake' },
        ],
        showIf: (p) => p.outlineStroke !== false && (p.outlineThickness ?? 1) > 1,
        infoKey: 'text.thickeningMode',
      },
      // Ink Overlap drives the banded bold's pass spacing — penW·(1−overlap) —
      // so heavier built-in weights plot gapless with the physical pen. Only the
      // monoline face's parallel (clean-bold) engine reads it.
      {
        id: 'inkOverlap',
        label: 'Ink Overlap %',
        type: 'range',
        min: 0,
        max: 60,
        step: 5,
        showIf: (p) => p.outlineStroke !== false
          && !(window.Vectura.GoogleFonts && window.Vectura.GoogleFonts.isWebFontKey(p.font))
          && (p.thickeningMode ?? 'parallel') === 'parallel'
          && ((p.outlineThickness ?? 1) > 1 || (p.fontWeight ?? 'Regular') !== 'Regular'),
        infoKey: 'text.inkOverlap',
      },
      // Merge Overlaps welds kerned/overlapping glyph contours into clean
      // non-crossing outlines (web faces only — single-stroke faces have no
      // closed contours to union). It flattens to straight polygons, so it
      // supersedes the native-bezier outline; the Bezier/Smoothness controls
      // below only surface when merge is off.
      { id: 'mergeOverlaps', label: 'Merge Overlaps', type: 'checkbox', showIf: (p) => !!(window.Vectura.GoogleFonts && window.Vectura.GoogleFonts.isWebFontKey(p.font)), infoKey: 'text.mergeOverlaps' },
      // Native glyph beziers + smoothness only apply to traced web-font outlines,
      // and only when merge is off (a merged outline is straight polygons).
      { id: 'bezierOutline', label: 'Bezier Curves', type: 'checkbox', showIf: (p) => p.mergeOverlaps === false && !!(window.Vectura.GoogleFonts && window.Vectura.GoogleFonts.isWebFontKey(p.font)), infoKey: 'text.bezierOutline' },
      { id: 'smoothing', label: 'Smoothness', type: 'range', min: 0, max: 6, step: 0.5, showIf: (p) => p.mergeOverlaps === false && !!(window.Vectura.GoogleFonts && window.Vectura.GoogleFonts.isWebFontKey(p.font)), infoKey: 'text.smoothing' },
      {
        id: 'plotOrder',
        label: 'Plot Order',
        type: 'select',
        options: [
          { value: 'leftToRight', label: 'Left → Right' },
          { value: 'natural', label: 'Natural' },
        ],
        infoKey: 'text.plotOrder',
      },
      // ── Fill (web outline faces only — built-in stroke faces have no interior) ─
      { type: 'section', label: 'Fill' },
      { id: 'fillEnabled', label: 'Enable Fill', type: 'checkbox', showIf: (p) => !!(window.Vectura.GoogleFonts && window.Vectura.GoogleFonts.isWebFontKey(p.font)), infoKey: 'text.fillEnabled' },
      ...(window.Vectura.FillPanel?.buildFillControlDefs({
        typeParam: 'fillType',
        densityParam: 'fillDensity',
        angleParam: 'fillAngle',
        amplitudeParam: 'fillAmplitude',
        paddingParam: 'fillPadding',
        dotSizeParam: 'fillDotSize',
        shiftXParam: 'fillShiftX',
        shiftYParam: 'fillShiftY',
        showIfBase: (p) => p.fillEnabled === true && !!(window.Vectura.GoogleFonts && window.Vectura.GoogleFonts.isWebFontKey(p.font)),
        descKeyPrefix: 'fill',
      }) || []),
    ],
    grid: [
      { id: 'rows', label: 'Rows', type: 'range', min: 2, max: 60, step: 1, infoKey: 'grid.rows' },
      { id: 'cols', label: 'Cols', type: 'range', min: 2, max: 60, step: 1, infoKey: 'grid.cols' },
      { id: 'distortion', label: 'Distortion', type: 'range', min: 0, max: 40, step: 1, infoKey: 'grid.distortion' },
      { type: 'noiseList' },
      { id: 'chaos', label: 'Chaos', type: 'range', min: 0, max: 10, step: 0.1, infoKey: 'grid.chaos' },
      {
        id: 'type',
        label: 'Mode',
        type: 'select',
        options: [
          { value: 'warp', label: 'Warp' },
          { value: 'shift', label: 'Shift' },
        ],
        infoKey: 'grid.type',
      },
    ],
    phylla: [
      {
        id: 'shapeType',
        label: 'Shape',
        type: 'select',
        options: [
          { value: 'circle', label: 'Circle' },
          { value: 'polygon', label: 'Polygon' },
        ],
        infoKey: 'phylla.shapeType',
      },
      { id: 'count', label: 'Count', type: 'range', min: 100, max: 2000, step: 50, infoKey: 'phylla.count' },
      { id: 'spacing', label: 'Spacing', type: 'range', min: 1, max: 10, step: 0.1, infoKey: 'phylla.spacing' },
      {
        id: 'angleStr',
        label: 'Angle',
        type: 'angle',
        min: 0,
        max: 360,
        step: 0.01,
        displayUnit: '°',
        infoKey: 'phylla.angleStr',
      },
      { id: 'divergence', label: 'Divergence', type: 'range', min: 0.5, max: 2.5, step: 0.1, infoKey: 'phylla.divergence' },
      { id: 'noiseInf', label: 'Noise Infl.', type: 'range', min: 0, max: 20, step: 1, infoKey: 'phylla.noiseInf' },
      { type: 'noiseList' },
      { id: 'dotSize', label: 'Dot Size', type: 'range', min: 0.5, max: 3, step: 0.1, infoKey: 'phylla.dotSize' },
      {
        id: 'sides',
        label: 'Sides',
        type: 'range',
        min: 3,
        max: 100,
        step: 1,
        infoKey: 'phylla.sides',
        showIf: (params) => params.shapeType === 'polygon',
      },
      {
        id: 'sideJitter',
        label: 'Side Jitter',
        type: 'range',
        min: 0,
        max: 20,
        step: 1,
        infoKey: 'phylla.sideJitter',
        showIf: (params) => params.shapeType === 'polygon',
      },
    ],
    boids: [
      { id: 'count', label: 'Agents', type: 'range', min: 10, max: 300, step: 10, infoKey: 'boids.count' },
      { id: 'steps', label: 'Duration', type: 'range', min: 50, max: 400, step: 10, infoKey: 'boids.steps' },
      { id: 'speed', label: 'Speed', type: 'range', min: 0.5, max: 6, step: 0.1, infoKey: 'boids.speed' },
      { id: 'sepDist', label: 'Separation', type: 'range', min: 5, max: 60, step: 1, infoKey: 'boids.sepDist' },
      { id: 'alignDist', label: 'Alignment', type: 'range', min: 5, max: 80, step: 1, infoKey: 'boids.alignDist' },
      { id: 'cohDist', label: 'Cohesion', type: 'range', min: 5, max: 80, step: 1, infoKey: 'boids.cohDist' },
      { id: 'force', label: 'Steer Force', type: 'range', min: 0.01, max: 0.3, step: 0.01, infoKey: 'boids.force' },
      { id: 'sepWeight', label: 'Separation Weight', type: 'range', min: 0, max: 3, step: 0.1, infoKey: 'boids.sepWeight' },
      { id: 'alignWeight', label: 'Alignment Weight', type: 'range', min: 0, max: 3, step: 0.1, infoKey: 'boids.alignWeight' },
      { id: 'cohWeight', label: 'Cohesion Weight', type: 'range', min: 0, max: 3, step: 0.1, infoKey: 'boids.cohWeight' },
      {
        id: 'mode',
        label: 'Mode',
        type: 'select',
        options: [
          { value: 'birds', label: 'Birds' },
          { value: 'fish', label: 'Fish' },
        ],
        infoKey: 'boids.mode',
      },
    ],
    attractor: [
      {
        id: 'type',
        label: 'Type',
        type: 'select',
        options: [
          { value: 'lorenz', label: 'Lorenz' },
          { value: 'aizawa', label: 'Aizawa' },
        ],
        infoKey: 'attractor.type',
      },
      { id: 'scale', label: 'Scale', type: 'range', min: 1, max: 10, step: 0.1, infoKey: 'attractor.scale' },
      { id: 'iter', label: 'Iterations', type: 'range', min: 300, max: 5000, step: 100, infoKey: 'attractor.iter' },
      { id: 'sigma', label: 'Sigma', type: 'range', min: 1, max: 30, step: 0.1, infoKey: 'attractor.sigma' },
      { id: 'rho', label: 'Rho', type: 'range', min: 5, max: 50, step: 0.1, infoKey: 'attractor.rho' },
      { id: 'beta', label: 'Beta', type: 'range', min: 0.5, max: 5, step: 0.1, infoKey: 'attractor.beta' },
      { id: 'dt', label: 'Time Step', type: 'range', min: 0.002, max: 0.03, step: 0.001, infoKey: 'attractor.dt' },
    ],
    hyphae: [
      { id: 'sources', label: 'Sources', type: 'range', min: 1, max: 10, step: 1, infoKey: 'hyphae.sources' },
      { id: 'steps', label: 'Growth Steps', type: 'range', min: 20, max: 200, step: 10, infoKey: 'hyphae.steps' },
      { id: 'branchProb', label: 'Branch Prob', type: 'range', min: 0, max: 0.2, step: 0.01, infoKey: 'hyphae.branchProb' },
      { id: 'angleVar', label: 'Wiggle', type: 'range', min: 0, max: 2.0, step: 0.1, infoKey: 'hyphae.angleVar' },
      { id: 'segLen', label: 'Segment Len', type: 'range', min: 1, max: 8, step: 0.1, infoKey: 'hyphae.segLen' },
      { id: 'maxBranches', label: 'Max Branches', type: 'range', min: 100, max: 3000, step: 50, infoKey: 'hyphae.maxBranches' },
    ],
    shapePack: [
      {
        id: 'shape',
        label: 'Shape',
        type: 'select',
        options: [
          { value: 'circle', label: 'Circle' },
          { value: 'polygon', label: 'Polygon' },
        ],
        infoKey: 'shapePack.shape',
      },
      { id: 'count', label: 'Max Count', type: 'range', min: 20, max: 800, step: 20, infoKey: 'shapePack.count' },
      {
        id: 'radiusRange',
        label: 'Radius Range',
        type: 'rangeDual',
        min: 0.5,
        max: 200,
        step: 0.5,
        minKey: 'minR',
        maxKey: 'maxR',
        displayUnit: 'mm',
        infoKey: 'shapePack.radiusRange',
      },
      { id: 'padding', label: 'Padding', type: 'range', min: 0, max: 10, step: 0.5, infoKey: 'shapePack.padding' },
      { id: 'attempts', label: 'Attempts', type: 'range', min: 100, max: 5000, step: 100, infoKey: 'shapePack.attempts' },
      { id: 'segments', label: 'Segments', type: 'range', min: 3, max: 64, step: 1, infoKey: 'shapePack.segments' },
      { id: 'rotationStep', label: 'Rotation Step', type: 'range', min: -30, max: 30, step: 1, infoKey: 'shapePack.rotationStep' },
      {
        id: 'perspectiveType',
        label: 'Perspective',
        type: 'select',
        options: [
          { value: 'none', label: 'None' },
          { value: 'vertical', label: 'Vertical' },
          { value: 'horizontal', label: 'Horizontal' },
          { value: 'radial', label: 'Radial' },
        ],
        infoKey: 'shapePack.perspectiveType',
      },
      { id: 'perspective', label: 'Perspective Amt', type: 'range', min: -1, max: 1, step: 0.05, infoKey: 'shapePack.perspective' },
      { id: 'perspectiveX', label: 'Perspective X', type: 'range', min: -200, max: 200, step: 5, infoKey: 'shapePack.perspectiveX' },
      { id: 'perspectiveY', label: 'Perspective Y', type: 'range', min: -200, max: 200, step: 5, infoKey: 'shapePack.perspectiveY' },
    ],
    horizon: [
      { type: 'section', label: 'Perspective' },
      { id: 'horizonHeight', label: 'Horizon Height', type: 'range', min: 0, max: 100, step: 1 },
      { id: 'vanishingPointX', label: 'Vanishing Point X', type: 'range', min: 0, max: 100, step: 1 },
      { type: 'section', label: 'Plane Density' },
      { id: 'horizontalLines', label: 'Horizontal Lines', type: 'range', min: 1, max: 120, step: 1 },
      { id: 'convergenceLines', label: 'Convergence Lines', type: 'range', min: 0, max: 120, step: 1 },
      { id: 'linkDensities', label: 'Link Densities', type: 'checkbox' },
      { type: 'section', label: 'Plane Spacing' },
      {
        id: 'horizontalSpacingMode',
        label: 'Horizontal Spacing',
        type: 'select',
        options: [
          { value: 'even', label: 'Even' },
          { value: 'perspective', label: 'Perspective' },
          { value: 'bias', label: 'Bias' },
        ],
      },
      { id: 'horizontalSpacingBias', label: 'Horizontal Bias', type: 'range', min: -100, max: 100, step: 1 },
      {
        id: 'convergenceSpacingMode',
        label: 'Convergence Spacing',
        type: 'select',
        options: [
          { value: 'even', label: 'Even' },
          { value: 'perspective', label: 'Perspective' },
          { value: 'bias', label: 'Bias' },
        ],
      },
      { id: 'convergenceSpacingBias', label: 'Convergence Bias', type: 'range', min: -100, max: 100, step: 1 },
      { id: 'fanReach', label: 'Fan Reach', type: 'range', min: 0, max: 100, step: 1 },
      { type: 'section', label: 'Terrain Shape' },
      { id: 'terrainDepth', label: 'Terrain Depth', type: 'range', min: 0, max: 100, step: 1 },
      { id: 'terrainHeight', label: 'Terrain Height', type: 'range', min: 0, max: 100, step: 1 },
      { id: 'floorHeight', label: 'Floor Height', type: 'range', min: -100, max: 100, step: 1 },
      { id: 'skylineRelief', label: 'Skyline Relief', type: 'range', min: 0, max: 100, step: 1 },
      { type: 'section', label: 'Center Region' },
      { id: 'centerWidth', label: 'Width', type: 'range', min: 0, max: 100, step: 1 },
      { id: 'centerSoftness', label: 'Edge Softness', type: 'range', min: 0, max: 100, step: 1 },
      { id: 'centerCompress', label: 'Compress at Horizon', type: 'range', min: 0, max: 100, step: 1 },
      { id: 'centerDepth', label: 'Depth', type: 'range', min: 0, max: 100, step: 1 },
      { id: 'shoulderLift', label: 'Shoulder Lift', type: 'range', min: 0, max: 100, step: 1 },
      { id: 'ridgeSharpness', label: 'Ridge Sharpness', type: 'range', min: 0, max: 100, step: 1 },
      { id: 'centerNoiseDampening', label: 'Noise Dampening', type: 'range', min: 0, max: 100, step: 1 },
      { type: 'section', label: 'Terrain Noise' },
      { id: 'terrainNoiseEnabled', label: 'Enable Mountain Surface', type: 'checkbox' },
      { id: 'mountainAmplitude', label: 'Mountain Amplitude', type: 'range', min: 0, max: 100, step: 1 },
      { id: 'noiseMirror', label: 'Noise Mirror', type: 'range', min: 0, max: 100, step: 1 },
      { type: 'section', label: 'Additional Noises' },
      { type: 'noiseList' },
    ],
    terrain: [
      { type: 'section', label: 'Presets' },
      {
        id: 'preset',
        label: 'Style Preset',
        type: 'select',
        options: TERRAIN_PRESET_OPTIONS,
        infoKey: 'terrain.preset',
      },
      { type: 'section', label: 'Perspective' },
      {
        id: 'perspectiveMode',
        label: 'Perspective Mode',
        type: 'select',
        options: [
          { value: 'orthographic', label: 'Top-down (orthographic)' },
          { value: 'one-point', label: 'One-point' },
          { value: 'one-point-landscape', label: 'One-point with Landscape Horizon' },
          { value: 'two-point', label: 'Two-point' },
          { value: 'isometric', label: 'Isometric' },
          { value: 'free-3d', label: 'Free 3D (X/Y/Z rotation)' },
        ],
        infoKey: 'terrain.perspectiveMode',
      },
      {
        id: 'horizonHeight',
        label: 'Horizon Height',
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        infoKey: 'terrain.horizonHeight',
        showIf: (p) => p.perspectiveMode === 'one-point' || p.perspectiveMode === 'one-point-landscape' || p.perspectiveMode === 'two-point',
      },
      {
        id: 'vanishingPointX',
        label: 'Vanishing Point X',
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        infoKey: 'terrain.vanishingPointX',
        showIf: (p) => p.perspectiveMode === 'one-point' || p.perspectiveMode === 'one-point-landscape',
      },
      {
        id: 'vpLeftX',
        label: 'Left VP X',
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        infoKey: 'terrain.vpLeftX',
        showIf: (p) => p.perspectiveMode === 'two-point',
      },
      {
        id: 'vpRightX',
        label: 'Right VP X',
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        infoKey: 'terrain.vpRightX',
        showIf: (p) => p.perspectiveMode === 'two-point',
      },
      {
        id: 'isoAngle',
        label: 'Isometric Angle',
        type: 'range',
        min: 15,
        max: 60,
        step: 1,
        displayUnit: '°',
        infoKey: 'terrain.isoAngle',
        showIf: (p) => p.perspectiveMode === 'isometric',
      },
      {
        id: 'depthCompression',
        label: 'Depth Compression',
        type: 'range',
        min: 0,
        max: 100,
        step: 1,
        infoKey: 'terrain.depthCompression',
        showIf: (p) => p.perspectiveMode !== 'orthographic',
      },
      {
        id: 'depthScale',
        label: 'Depth Scale',
        type: 'range',
        min: 1,
        max: 200,
        step: 1,
        infoKey: 'terrain.depthScale',
        showIf: (p) => p.perspectiveMode === 'orthographic',
      },
      // Free 3D view — orbit the terrain through the shared Geometry3D engine.
      { type: 'section', label: '3D View', showIf: (p) => p.perspectiveMode === 'free-3d' },
      { id: 'projection', label: 'Projection', type: 'select', options: [{ value: 'orthographic', label: 'Orthographic' }, { value: 'perspective', label: 'Perspective' }], infoKey: 'terrain.projection', showIf: (p) => p.perspectiveMode === 'free-3d' },
      { id: 'cameraDistance', label: 'Camera Distance', type: 'range', min: 1, max: 2000, step: 10, infoKey: 'terrain.cameraDistance', showIf: (p) => p.perspectiveMode === 'free-3d' && p.projection === 'perspective', livePreview: true },
      { id: 'focalLength', label: 'Perspective Strength', type: 'range', min: 1, max: 1500, step: 10, infoKey: 'terrain.focalLength', showIf: (p) => p.perspectiveMode === 'free-3d' && p.projection === 'perspective', livePreview: true },
      // Industry-standard axis naming (Photoshop/After Effects/Blender):
      // Rotate X tips toward/away (pitch), Rotate Y turns left/right (yaw),
      // Rotate Z spins in the canvas plane (roll). Param ids are unchanged so
      // saved presets keep deserializing.
      { id: 'pitch', label: 'Rotate X', type: 'range', min: -180, max: 180, step: 1, displayUnit: '°', infoKey: 'terrain.pitch', showIf: (p) => p.perspectiveMode === 'free-3d', livePreview: true },
      { id: 'yaw', label: 'Rotate Y', type: 'range', min: -180, max: 180, step: 1, displayUnit: '°', infoKey: 'terrain.yaw', showIf: (p) => p.perspectiveMode === 'free-3d', livePreview: true },
      { id: 'roll', label: 'Rotate Z', type: 'range', min: -180, max: 180, step: 1, displayUnit: '°', infoKey: 'terrain.roll', showIf: (p) => p.perspectiveMode === 'free-3d', livePreview: true },
      { id: 'topWidth', label: 'Top Width', type: 'range', min: 1, max: 10, step: 0.1, displayUnit: '×', infoKey: 'terrain.topWidth', showIf: (p) => p.perspectiveMode === 'free-3d', livePreview: true },
      { type: 'section', label: 'Depth & Resolution' },
      { id: 'depthSlices', label: 'Depth Slices', type: 'range', min: 10, max: 300, step: 1, infoKey: 'terrain.depthSlices' },
      { id: 'xResolution', label: 'X Resolution', type: 'range', min: 40, max: 600, step: 5, infoKey: 'terrain.xResolution' },
      { id: 'occlusion', label: 'Hidden-Line Removal', type: 'checkbox', infoKey: 'terrain.occlusion' },
      { type: 'section', label: 'Mountains' },
      { id: 'mountainAmplitude', label: 'Mountain Amplitude', type: 'range', min: 0, max: 100, step: 1, infoKey: 'terrain.mountainAmplitude' },
      { id: 'mountainFrequency', label: 'Mountain Frequency', type: 'range', min: 0.001, max: 0.05, step: 0.001, infoKey: 'terrain.mountainFrequency' },
      { id: 'mountainOctaves', label: 'Octaves', type: 'range', min: 1, max: 8, step: 1, infoKey: 'terrain.mountainOctaves' },
      { id: 'mountainLacunarity', label: 'Lacunarity', type: 'range', min: 1.5, max: 3.0, step: 0.05, infoKey: 'terrain.mountainLacunarity' },
      { id: 'mountainGain', label: 'Gain', type: 'range', min: 0.3, max: 0.7, step: 0.01, infoKey: 'terrain.mountainGain' },
      { id: 'peakSharpness', label: 'Peak Sharpness', type: 'range', min: 1.0, max: 4.0, step: 0.05, infoKey: 'terrain.peakSharpness' },
      { type: 'section', label: 'Valleys' },
      { id: 'valleyCount', label: 'Valley Count', type: 'range', min: 0, max: 8, step: 1, infoKey: 'terrain.valleyCount' },
      { id: 'valleyDepth', label: 'Valley Depth', type: 'range', min: 0, max: 100, step: 1, infoKey: 'terrain.valleyDepth', showIf: (p) => (p.valleyCount ?? 0) > 0 },
      { id: 'valleyWidth', label: 'Valley Width', type: 'range', min: 5, max: 50, step: 1, infoKey: 'terrain.valleyWidth', showIf: (p) => (p.valleyCount ?? 0) > 0 },
      { id: 'valleyShape', label: 'V → U Profile', type: 'range', min: 0, max: 1, step: 0.01, infoKey: 'terrain.valleyShape', showIf: (p) => (p.valleyCount ?? 0) > 0 },
      { id: 'valleyMeander', label: 'Valley Meander', type: 'range', min: 0, max: 100, step: 1, infoKey: 'terrain.valleyMeander', showIf: (p) => (p.valleyCount ?? 0) > 0 },
      { type: 'section', label: 'Rivers' },
      { id: 'riversEnabled', label: 'Enable Rivers', type: 'checkbox', infoKey: 'terrain.riversEnabled' },
      { id: 'riverCount', label: 'River Count', type: 'range', min: 1, max: 6, step: 1, infoKey: 'terrain.riverCount', showIf: (p) => p.riversEnabled === true },
      { id: 'riverWidth', label: 'River Width', type: 'range', min: 1, max: 10, step: 0.5, infoKey: 'terrain.riverWidth', showIf: (p) => p.riversEnabled === true },
      { id: 'riverDepth', label: 'River Depth', type: 'range', min: 0, max: 30, step: 1, infoKey: 'terrain.riverDepth', showIf: (p) => p.riversEnabled === true },
      { id: 'riverMeander', label: 'River Meander', type: 'range', min: 0, max: 100, step: 1, infoKey: 'terrain.riverMeander', showIf: (p) => p.riversEnabled === true },
      { type: 'section', label: 'Oceans' },
      { id: 'oceansEnabled', label: 'Enable Oceans', type: 'checkbox', infoKey: 'terrain.oceansEnabled' },
      { id: 'waterLevel', label: 'Water Level', type: 'range', min: 0, max: 100, step: 1, infoKey: 'terrain.waterLevel', showIf: (p) => p.oceansEnabled === true },
      { id: 'drawCoastline', label: 'Draw Coastline', type: 'checkbox', infoKey: 'terrain.drawCoastline', showIf: (p) => p.oceansEnabled === true },
      { type: 'section', label: 'Additional Noises' },
      { type: 'noiseList' },
      // Shading & Lines — only meaningful for the engine-backed free-3d view, so
      // every control (incl. the section header) is gated on perspectiveMode. The
      // shared "Hidden Lines" select is trimmed to Remove/Dash here: on an open
      // heightfield "back-face only" has no meaning (the master Hidden-Line Removal
      // checkbox already governs on/off).
      ...buildShadingControls(SHADING_CAPS.terrain).map((ctrl) => {
        const self = ctrl.showIf;
        const trimmed = ctrl.id === 'hiddenLineMode'
          ? { ...ctrl, options: ctrl.options.filter((o) => o.value === 'remove' || o.value === 'dash') }
          : ctrl;
        return { ...trimmed, showIf: (p) => p.perspectiveMode === 'free-3d' && (self ? self(p) : true) };
      }),
    ],
  };

  CONTROL_DEFS.spirograph = [
    { type: 'section', label: 'Main Shape' },
    {
      id: 'mainShape',
      label: 'Shape',
      type: 'select',
      options: [
        { value: 'rectangle', label: 'Rectangle' },
        { value: 'roundedRectangle', label: 'Rounded Rectangle' },
        { value: 'pill', label: 'Pill' },
        { value: 'oval', label: 'Oval' },
        { value: 'polygon', label: 'Polygon' },
        { value: 'star', label: 'Star' },
      ],
    },
    { id: 'mainWidth', label: 'Width', type: 'range', min: 20, max: 220, step: 1, displayUnit: 'mm', livePreview: true },
    { id: 'mainHeight', label: 'Height', type: 'range', min: 20, max: 220, step: 1, displayUnit: 'mm', livePreview: true },
    { id: 'mainCornerRadius', label: 'Corner Radius', type: 'range', min: 0, max: 60, step: 0.5, displayUnit: 'mm', livePreview: true },
    { id: 'mainPoints', label: 'Points', type: 'range', min: 3, max: 18, step: 1, livePreview: true },
    { id: 'mainTeeth', label: 'Main Teeth', type: 'range', min: 4, max: 500, step: 1, livePreview: true },
    { type: 'section', label: 'Gear' },
    {
      id: 'gearShape',
      label: 'Shape',
      type: 'select',
      options: [
        { value: 'circle', label: 'Circle' },
        { value: 'oval', label: 'Oval' },
        { value: 'polygon', label: 'Polygon' },
      ],
    },
    { id: 'gearTeeth', label: 'Gear Teeth', type: 'range', min: 3, max: 499, step: 1, livePreview: true },
    { id: 'gearAspectX', label: 'Aspect X', type: 'range', min: 40, max: 180, step: 1, displayUnit: '%', livePreview: true },
    { id: 'gearAspectY', label: 'Aspect Y', type: 'range', min: 40, max: 180, step: 1, displayUnit: '%', livePreview: true },
    { id: 'gearCornerRadius', label: 'Gear Corner', type: 'range', min: 0, max: 45, step: 1, displayUnit: '%', livePreview: true },
    { id: 'gearPoints', label: 'Gear Points', type: 'range', min: 3, max: 16, step: 1, livePreview: true },
    { type: 'section', label: 'Pen' },
    { id: 'penAngle', label: 'Pen Angle', type: 'angle', min: -180, max: 180, step: 1, displayUnit: '°', livePreview: true },
    { id: 'penOffset', label: 'Pen Offset', type: 'range', min: 0, max: 140, step: 1, displayUnit: '%', livePreview: true },
    {
      id: 'rollMode',
      label: 'Roll Mode',
      type: 'select',
      options: [
        { value: 'inside', label: 'Inside' },
        { value: 'outside', label: 'Outside' },
        { value: 'both', label: 'Both' },
      ],
    },
    { id: 'curveResolution', label: 'Resolution', type: 'range', min: 120, max: 2400, step: 20, livePreview: true },
  ];

  CONTROL_DEFS.spiralizer = [
    { type: 'section', label: 'Surface' },
    {
      id: 'shape',
      label: 'Shape',
      type: 'select',
      options: [
        { value: 'sphere', label: 'Sphere' },
        { value: 'cone', label: 'Cone' },
        { value: 'cylinder', label: 'Cylinder' },
        { value: 'ellipsoid', label: 'Ellipsoid' },
        { value: 'torus', label: 'Torus' },
        { value: 'capsule', label: 'Capsule' },
        { value: 'helix', label: 'Helix' },
      ],
    },
    { id: 'sphereRadius', label: 'Radius', type: 'range', min: 10, max: 140, step: 1, displayUnit: 'mm', showIf: (p) => p.shape === 'sphere', livePreview: true },
    { id: 'baseRadius', label: 'Radius', type: 'range', min: 10, max: 140, step: 1, displayUnit: 'mm', showIf: (p) => p.shape === 'cone', livePreview: true },
    { id: 'coneHeight', label: 'Height', type: 'range', min: 20, max: 220, step: 1, displayUnit: 'mm', showIf: (p) => p.shape === 'cone', livePreview: true },
    { id: 'cylinderRadius', label: 'Radius', type: 'range', min: 10, max: 140, step: 1, displayUnit: 'mm', showIf: (p) => p.shape === 'cylinder', livePreview: true },
    { id: 'cylinderHeight', label: 'Height', type: 'range', min: 20, max: 240, step: 1, displayUnit: 'mm', showIf: (p) => p.shape === 'cylinder', livePreview: true },
    { id: 'ellipsoidEquatorRadius', label: 'Equator Radius', type: 'range', min: 10, max: 140, step: 1, displayUnit: 'mm', showIf: (p) => p.shape === 'ellipsoid', livePreview: true },
    { id: 'ellipsoidPolarRadius', label: 'Polar Radius', type: 'range', min: 10, max: 120, step: 1, displayUnit: 'mm', showIf: (p) => p.shape === 'ellipsoid', livePreview: true },
    { id: 'torusRingRadius', label: 'Ring Radius', type: 'range', min: 10, max: 140, step: 1, displayUnit: 'mm', showIf: (p) => p.shape === 'torus', livePreview: true },
    { id: 'torusTubeRadius', label: 'Tube Radius', type: 'range', min: 4, max: 80, step: 1, displayUnit: 'mm', showIf: (p) => p.shape === 'torus', livePreview: true },
    { id: 'capsuleRadius', label: 'Radius', type: 'range', min: 10, max: 120, step: 1, displayUnit: 'mm', showIf: (p) => p.shape === 'capsule', livePreview: true },
    { id: 'capsuleHeight', label: 'Height', type: 'range', min: 0, max: 220, step: 1, displayUnit: 'mm', showIf: (p) => p.shape === 'capsule', livePreview: true },
    { id: 'helixRadius', label: 'Radius', type: 'range', min: 8, max: 140, step: 1, displayUnit: 'mm', showIf: (p) => p.shape === 'helix', livePreview: true },
    { id: 'helixHeight', label: 'Height', type: 'range', min: 20, max: 260, step: 1, displayUnit: 'mm', showIf: (p) => p.shape === 'helix', livePreview: true },
    { id: 'helixCount', label: 'Twists', type: 'range', min: 1, max: 8, step: 1, showIf: (p) => p.shape === 'helix', livePreview: true },
    // Two or more twists read as a DNA double/multi-helix; the base-pair rungs
    // bridge the strands. Only meaningful once there is a second strand to bridge.
    { id: 'helixRungs', label: 'Base Pairs', type: 'checkbox', showIf: (p) => p.shape === 'helix' && (p.helixCount || 1) >= 2 },
    { id: 'helixRungSpacing', label: 'Rung Spacing', type: 'range', min: 2, max: 60, step: 0.5, displayUnit: 'mm', showIf: (p) => p.shape === 'helix' && (p.helixCount || 1) >= 2 && p.helixRungs !== false, livePreview: true },
    // Backbone phase offset for the DNA double helix (exactly 2 twists). 180° is a
    // symmetric barber-pole; ~160° opens the unequal major/minor grooves of DNA.
    { id: 'helixGrooveOffset', label: 'Groove', type: 'range', min: 120, max: 180, step: 1, displayUnit: '°', showIf: (p) => p.shape === 'helix' && (p.helixCount || 1) === 2, livePreview: true },
    {
      id: 'surfaceMode',
      label: 'Visibility',
      type: 'select',
      options: [
        { value: 'front', label: 'Front Only' },
        { value: 'seeThrough', label: 'See-Through' },
      ],
    },
    {
      id: 'outlineMode',
      label: 'Outline',
      type: 'select',
      options: [
        { value: 'outline', label: 'Show' },
        { value: 'none', label: 'Hide' },
      ],
    },
    { type: 'section', label: 'Wrap' },
    {
      id: 'wrapType',
      label: 'Wrap Type',
      type: 'select',
      // The helix shape always coils as a spiral (its strands ARE the wrap), so
      // the wrap-type toggle is hidden and forced to spiral for it.
      showIf: (p) => p.shape !== 'helix',
      options: [
        { value: 'spiral', label: 'Spiral' },
        { value: 'twistedLines', label: 'Twisted Lines' },
      ],
    },
    {
      id: 'renderStyle',
      label: 'Render Style',
      type: 'select',
      options: [
        { value: 'line', label: 'Lines' },
        { value: 'dots', label: 'Dots' },
        { value: 'points', label: 'Points' },
        { value: 'plusses', label: 'Plusses' },
        { value: 'crosses', label: 'Crosses' },
        { value: 'squares', label: 'Squares' },
        { value: 'triangles', label: 'Triangles' },
        { value: 'dashes', label: 'Dashes' },
      ],
    },
    {
      id: 'thickness',
      label: 'Thickness',
      type: 'select',
      options: [
        { value: '0.5', label: 'Thin' },
        { value: '1', label: 'Medium' },
        { value: '1.5', label: 'Bold' },
        { value: '2', label: 'Heavy' },
        { value: '3', label: 'Extra Heavy' },
      ],
    },
    { id: 'turns', label: 'Turns', type: 'range', min: 1, max: 48, step: 0.5, showIf: (p) => p.shape === 'helix' || p.wrapType !== 'twistedLines', livePreview: true },
    { id: 'twistTurns', label: 'Twist Turns', type: 'range', min: -24, max: 24, step: 0.1, showIf: (p) => p.shape !== 'helix' && p.wrapType === 'twistedLines', livePreview: true },
    { id: 'lineCount', label: 'Line Count', type: 'range', min: 1, max: 160, step: 1, showIf: (p) => p.shape !== 'helix' && p.wrapType === 'twistedLines', livePreview: true },
    { id: 'dotSpacing', label: 'Marker Spacing', type: 'range', min: 0.1, max: 30, step: 0.1, displayUnit: 'mm', showIf: (p) => p.renderStyle && p.renderStyle !== 'line', livePreview: true },
    { id: 'dotSizeStart', label: 'Start Size', type: 'range', min: 0.8, max: 12, step: 0.1, showIf: (p) => p.renderStyle && p.renderStyle !== 'line', livePreview: true },
    { id: 'dotSizeMiddle', label: 'Middle Size', type: 'range', min: 0.8, max: 12, step: 0.1, showIf: (p) => p.renderStyle && p.renderStyle !== 'line', livePreview: true },
    { id: 'dotSizeEnd', label: 'End Size', type: 'range', min: 0.8, max: 12, step: 0.1, showIf: (p) => p.renderStyle && p.renderStyle !== 'line', livePreview: true },
    // Universal Fill dropdown — patterns the interior of the hollow closed glyphs
    // (Dots / Squares / Triangles) with the standard fill library (spiral, hatch,
    // dots, …). Reuses the shared FillPanel control factory + pattern generator.
    ...(window.Vectura.FillPanel?.buildFillControlDefs({
      fillTypeOptions: [
        { value: 'none',       label: 'None' },
        { value: 'hatch',      label: 'Hatch' },
        { value: 'crosshatch', label: 'Crosshatch' },
        { value: 'spiral',     label: 'Spiral' },
        { value: 'radial',     label: 'Radial' },
        { value: 'dots',       label: 'Dots' },
        { value: 'wave',       label: 'Wave' },
      ],
      typeParam: 'markerFill',
      showIfBase: (p) => ['dots', 'squares', 'triangles'].includes(p.renderStyle),
      descKeyPrefix: 'fill',
    }) || []),
    { id: 'startLongitude', label: 'Start Longitude', type: 'angle', min: 0, max: 360, step: 1, displayUnit: '°' },
    { type: 'section', label: 'View' },
    { id: 'projection', label: 'Projection', type: 'select', options: [{ value: 'orthographic', label: 'Orthographic' }, { value: 'perspective', label: 'Perspective' }] },
    { id: 'cameraDistance', label: 'Camera Distance', type: 'range', min: 1, max: 2000, step: 10, showIf: (p) => p.projection === 'perspective', livePreview: true },
    { id: 'focalLength', label: 'Perspective Strength', type: 'range', min: 1, max: 1500, step: 10, showIf: (p) => p.projection === 'perspective', livePreview: true },
    { id: 'pitch', label: 'Rotate X', type: 'range', min: -90, max: 90, step: 1, displayUnit: '°', infoKey: 'view3d.rotateX', livePreview: true },
    { id: 'yaw', label: 'Rotate Y', type: 'range', min: -180, max: 180, step: 1, displayUnit: '°', infoKey: 'view3d.rotateY', livePreview: true },
    { id: 'roll', label: 'Rotate Z', type: 'range', min: -180, max: 180, step: 1, displayUnit: '°', infoKey: 'view3d.rotateZ', livePreview: true },
    { id: 'curveResolution', label: 'Resolution', type: 'range', min: 90, max: 1800, step: 10, livePreview: true },
    ...buildShadingControls(SHADING_CAPS.spiralizer),
  ];

  CONTROL_DEFS.polyhedron = [
    { type: 'section', label: 'Structure' },
    {
      id: 'solidType',
      label: 'Solid',
      type: 'select',
      options: [
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
        { value: 'importedMesh', label: 'STL Mesh…' },
      ],
    },
    { id: 'stlImport', type: 'stlImport', showIf: (p) => p.solidType === 'importedMesh' },
    { id: 'sideCount', label: 'Sides', type: 'range', min: 3, max: 180, step: 1, showIf: polyhedronUsesSideCount, livePreview: true },
    { id: 'frequency', label: 'Frequency', type: 'range', min: 1, max: 6, step: 1, showIf: polyhedronUsesFrequency, livePreview: true },
    { id: 'radius', label: 'Radius', type: 'range', min: 20, max: 130, step: 1, displayUnit: 'mm', livePreview: true },
    { id: 'depth', label: 'Depth', type: 'range', min: 0, max: 180, step: 1, displayUnit: 'mm', showIf: polyhedronUsesDepth, livePreview: true },
    { id: 'taper', label: 'Taper', type: 'range', min: 1, max: 100, step: 1, displayUnit: '%', showIf: polyhedronUsesTaper, livePreview: true },
    { id: 'starRatio', label: 'Star Inset', type: 'range', min: 5, max: 95, step: 1, displayUnit: '%', showIf: polyhedronUsesStarRatio, livePreview: true },
    { type: 'section', label: 'Visibility' },
    {
      id: 'surfaceMode',
      label: 'Faces',
      type: 'select',
      options: [
        { value: 'front', label: 'Front' },
        { value: 'all', label: 'All' },
      ],
    },
    {
      id: 'faceOpacityMode',
      label: 'Hidden Faces',
      type: 'select',
      options: [
        { value: 'seeThrough', label: 'Dashed' },
        { value: 'opaque', label: 'Pruned' },
      ],
    },
    { id: 'showFaces', label: 'Face Bands', type: 'checkbox' },
    { id: 'faceBands', label: 'Band Count', type: 'range', min: 0, max: 18, step: 1, showIf: (p) => p.showFaces !== false, livePreview: true },
    { id: 'showEdges', label: 'Edges', type: 'checkbox' },
    {
      id: 'edgeStyle',
      label: 'Edge Style',
      type: 'select',
      showIf: (p) => p.showEdges !== false,
      options: [
        { value: 'line', label: 'Line' },
        { value: 'dash', label: 'Dash' },
      ],
    },
    { id: 'edgeSpacing', label: 'Dash Spacing', type: 'range', min: 4, max: 28, step: 0.5, showIf: (p) => p.showEdges !== false && p.edgeStyle === 'dash', livePreview: true },
    { id: 'showVertices', label: 'Vertices', type: 'checkbox' },
    {
      id: 'vertexOcclusionMode',
      label: 'Point Fill',
      type: 'select',
      showIf: (p) => p.showVertices !== false,
      options: [
        { value: 'outline', label: 'Outline Only' },
        { value: 'occlude', label: 'Hide Interior' },
      ],
    },
    { id: 'vertexSize', label: 'Vertex Size', type: 'range', min: 0.8, max: 12, step: 0.2, showIf: (p) => p.showVertices !== false, livePreview: true },
    { id: 'vertexRings', label: 'Vertex Rings', type: 'range', min: 1, max: 4, step: 1, showIf: (p) => p.showVertices !== false, livePreview: true },
    { type: 'section', label: 'Effects' },
    { id: 'bulge', label: 'Bulge', type: 'range', min: -30, max: 30, step: 0.5, displayUnit: 'mm', livePreview: true },
    { id: 'extrude', label: 'Extrude', type: 'range', min: 0, max: 40, step: 0.5, displayUnit: 'mm', livePreview: true },
    { id: 'explode', label: 'Explode', type: 'range', min: 0, max: 46, step: 0.5, displayUnit: 'mm', livePreview: true },
    { id: 'expand', label: 'Expand', type: 'range', min: 50, max: 180, step: 1, displayUnit: '%', livePreview: true },
    { id: 'shard', label: 'Shard', type: 'range', min: 0, max: 100, step: 1, displayUnit: '%', livePreview: true },
    { id: 'twist', label: 'Twist', type: 'range', min: -180, max: 180, step: 1, displayUnit: '°', livePreview: true },
    { type: 'section', label: 'View' },
    { id: 'projection', label: 'Projection', type: 'select', options: [{ value: 'orthographic', label: 'Orthographic' }, { value: 'perspective', label: 'Perspective' }] },
    { id: 'cameraDistance', label: 'Camera Distance', type: 'range', min: 1, max: 2000, step: 10, showIf: (p) => p.projection === 'perspective', livePreview: true },
    { id: 'focalLength', label: 'Perspective Strength', type: 'range', min: 1, max: 1500, step: 10, showIf: (p) => p.projection === 'perspective', livePreview: true },
    { id: 'tilt', label: 'Rotate X', type: 'range', min: 0, max: 89, step: 1, displayUnit: '°', infoKey: 'view3d.rotateX', livePreview: true },
    { id: 'rotate', label: 'Rotate Y', type: 'range', min: -180, max: 180, step: 1, displayUnit: '°', infoKey: 'view3d.rotateY', livePreview: true },
    { id: 'roll', label: 'Rotate Z', type: 'range', min: -180, max: 180, step: 1, displayUnit: '°', infoKey: 'view3d.rotateZ', livePreview: true },
    ...buildShadingControls(SHADING_CAPS.polyhedron),
  ];

  CONTROL_DEFS.topoform = [
    { type: 'section', label: 'Source' },
    {
      id: 'sourceMode',
      label: 'Primitive',
      type: 'select',
      options: [
        { value: 'sphere', label: 'Sphere' },
        { value: 'torus', label: 'Torus' },
        { value: 'cube', label: 'Cube' },
        { value: 'cone', label: 'Cone' },
        { value: 'ellipsoid', label: 'Ellipsoid' },
        { value: 'cylinder', label: 'Cylinder' },
        { value: 'capsule', label: 'Capsule' },
        { value: 'pyramid', label: 'Pyramid' },
        { value: 'superellipsoid', label: 'Superellipsoid' },
        { value: 'torusKnot', label: 'Torus Knot' },
        { value: 'stlMesh', label: 'STL Mesh…' },
      ],
    },
    { id: 'stlImport', type: 'stlImport', showIf: (p) => p.sourceMode === 'stlMesh' },
    {
      id: 'renderMode',
      label: 'Render',
      type: 'select',
      options: [
        { value: 'contours', label: 'Contours' },
        { value: 'wireframe', label: 'Wireframe' },
        { value: 'triangleMesh', label: 'Triangle Mesh' },
      ],
    },
    { id: 'primitiveDetail', label: 'Primitive Detail', type: 'range', min: 4, max: 100, step: 1, livePreview: true },
    { id: 'primitiveScaleX', label: 'Scale X', type: 'range', min: 10, max: 130, step: 1, displayUnit: 'mm', livePreview: true },
    { id: 'primitiveScaleY', label: 'Scale Y', type: 'range', min: 10, max: 130, step: 1, displayUnit: 'mm', livePreview: true },
    { id: 'primitiveScaleZ', label: 'Scale Z', type: 'range', min: 10, max: 130, step: 1, displayUnit: 'mm', livePreview: true },
    { id: 'simplifyMesh', label: 'Simplify Mesh', type: 'range', min: 0, max: 1, step: 0.05, livePreview: true },
    { type: 'section', label: 'Contours' },
    { id: 'lineCount', label: 'Line Count', type: 'range', min: 2, max: 80, step: 1, showIf: (p) => p.renderMode !== 'wireframe' && p.renderMode !== 'triangleMesh', livePreview: true },
    // UX7: the cutting-plane rotation wraps around a full circle, so the angle
    // dial fits better than a linear slider. (The view Rotate X/Y/Z are
    // separate controls owned elsewhere and intentionally left as ranges.)
    { id: 'planeRotate', label: 'Plane Rotate', type: 'angle', min: -180, max: 180, step: 1, displayUnit: '°', livePreview: true },
    { id: 'planeTilt', label: 'Plane Tilt', type: 'range', min: -90, max: 90, step: 1, displayUnit: '°', livePreview: true },
    {
      id: 'contourVisibility',
      label: 'Visibility',
      type: 'select',
      options: [
        { value: 'visibleOnly', label: 'Visible Only' },
        { value: 'fullContour', label: 'See-Through (dashed)' },
      ],
    },
    { id: 'contourSmoothing', label: 'Contour Smoothing', type: 'range', min: 0, max: 100, step: 1, livePreview: true },
    { id: 'showOutline', label: 'Silhouette', type: 'checkbox' },
    { type: 'section', label: 'View' },
    { id: 'projection', label: 'Projection', type: 'select', options: [{ value: 'orthographic', label: 'Orthographic' }, { value: 'perspective', label: 'Perspective' }] },
    { id: 'cameraDistance', label: 'Camera Distance', type: 'range', min: 1, max: 2000, step: 10, showIf: (p) => p.projection === 'perspective', livePreview: true },
    { id: 'focalLength', label: 'Perspective Strength', type: 'range', min: 1, max: 1500, step: 10, showIf: (p) => p.projection === 'perspective', livePreview: true },
    { id: 'pitch', label: 'Rotate X', type: 'range', min: -180, max: 180, step: 1, displayUnit: '°', infoKey: 'view3d.rotateX', livePreview: true },
    { id: 'yaw', label: 'Rotate Y', type: 'range', min: -180, max: 180, step: 1, displayUnit: '°', infoKey: 'view3d.rotateY', livePreview: true },
    { id: 'roll', label: 'Rotate Z', type: 'range', min: -180, max: 180, step: 1, displayUnit: '°', infoKey: 'view3d.rotateZ', livePreview: true },
    ...buildShadingControls(SHADING_CAPS.topoform, { sceneLightingMaster: true }),
  ];

  CONTROL_DEFS.rasterPlane = [
    { type: 'section', label: 'Noise Preview' },
    { type: 'noisePreview' },
    { type: 'section', label: 'Noise Stack' },
    // The global Noise Mode + Noise Amount were removed: each noise layer's own
    // Blend Mode and Field Weight now fully drive how it embosses the surface
    // (see createNoiseField + the additive fold in raster-plane.js). The stack
    // itself is the only control needed here.
    { type: 'noiseList', source: 'rasterPlane', label: 'Noise Stack' },
    { type: 'section', label: 'Surface' },
    {
      id: 'mode',
      label: 'Mode',
      type: 'select',
      options: [
        { value: 'lines', label: 'Relief Lines' },
        { value: 'mesh', label: 'Deformed Mesh' },
        { value: 'topography', label: 'Topography' },
        { value: 'bars', label: 'Bars' },
      ],
    },
    {
      id: 'mapType',
      label: 'Map Type',
      type: 'select',
      options: [
        { value: 'height', label: 'Height' },
        { value: 'normal', label: 'Normal' },
      ],
    },
    { id: 'normalFlipY', label: 'Flip Normal Y', type: 'checkbox', showIf: (p) => p.mapType === 'normal' },
    { id: 'clipBlackAreas', label: 'Clip Black Areas', type: 'checkbox' },
    { id: 'artworkSize', label: 'Artwork Size', type: 'range', min: 30, max: 260, step: 1, displayUnit: 'mm', livePreview: true },
    { id: 'amplitude', label: 'Amplitude', type: 'range', min: 0, max: 160, step: 0.5, displayUnit: 'mm', livePreview: true },
    { id: 'sampleDetail', label: 'Sample Detail', type: 'range', min: 12, max: 220, step: 1, livePreview: true },
    // Map Blur smooths the sampled height source pre-tone for EVERY mode
    // (lines/mesh/topography/bars), so it is no longer gated to topography.
    { id: 'mapBlur', label: 'Map Blur', type: 'range', min: 0, max: 100, step: 1, livePreview: true },
    { id: 'invert', label: 'Invert', type: 'checkbox' },
    { id: 'gamma', label: 'Gamma', type: 'range', min: 0.2, max: 3, step: 0.05, livePreview: true },
    { id: 'contrast', label: 'Contrast', type: 'range', min: -50, max: 100, step: 1, livePreview: true },
    { type: 'section', label: 'Lines / Mesh' },
    { id: 'rows', label: 'Rows', type: 'range', min: 2, max: 120, step: 1, showIf: (p) => p.mode === 'lines' || p.mode === 'mesh', livePreview: true },
    { id: 'columns', label: 'Columns', type: 'range', min: 2, max: 120, step: 1, showIf: (p) => p.mode === 'mesh' || p.mode === 'topography', livePreview: true },
    { id: 'horizontalLineAngle', label: 'Line Angle', type: 'angle', min: -180, max: 180, step: 1, displayUnit: '°', showIf: (p) => p.mode === 'lines', livePreview: true },
    { id: 'horizontalLinesAsPlanes', label: 'Lines as Planes', type: 'checkbox', showIf: (p) => p.mode === 'lines' },
    { id: 'baseHeight', label: 'Base Height', type: 'range', min: 0, max: 10, step: 0.01, showIf: (p) => p.mode === 'lines' && p.horizontalLinesAsPlanes, livePreview: true },
    { id: 'planeWidth', label: 'Plane Width', type: 'range', min: 1, max: 100, step: 1, displayUnit: '%', showIf: (p) => p.mode === 'lines' && p.horizontalLinesAsPlanes, livePreview: true },
    { id: 'seeThrough', label: 'See-Through', type: 'checkbox', showIf: (p) => p.mode === 'mesh' || p.mode === 'topography' || p.mode === 'bars' || p.mode === 'lines' },
    { type: 'section', label: 'Topography / Bars' },
    { id: 'topographyAngle', label: 'Topo Angle', type: 'angle', min: -180, max: 180, step: 1, displayUnit: '°', showIf: (p) => p.mode === 'topography', livePreview: true },
    { id: 'contourSmoothing', label: 'Curve Smoothing', type: 'range', min: 0, max: 100, step: 1, showIf: (p) => p.mode === 'topography' || (p.curves === true && p.mode !== 'bars'), livePreview: true },
    { id: 'barRows', label: 'Bar Rows', type: 'range', min: 2, max: 120, step: 1, showIf: (p) => p.mode === 'bars', livePreview: true },
    { id: 'barColumns', label: 'Bar Columns', type: 'range', min: 2, max: 120, step: 1, showIf: (p) => p.mode === 'bars', livePreview: true },
    { id: 'barGap', label: 'Bar Gap', type: 'range', min: 0, max: 12, step: 0.1, displayUnit: 'mm', showIf: (p) => p.mode === 'bars', livePreview: true },
    { id: 'barHeightSteps', label: 'Height Steps', type: 'range', min: 0, max: 24, step: 1, showIf: (p) => p.mode === 'bars', livePreview: true },
    { id: 'showBarBase', label: 'Base Outline', type: 'checkbox', showIf: (p) => p.mode === 'bars' },
    { id: 'barSides', label: 'Bar Sides', type: 'range', min: 3, max: 8, step: 1, showIf: (p) => p.mode === 'bars', livePreview: true },
    { id: 'barRotate', label: 'Bar Rotate', type: 'angle', min: -180, max: 180, step: 1, displayUnit: '°', showIf: (p) => p.mode === 'bars', livePreview: true },
    { id: 'barCornerRadius', label: 'Corner Radius', type: 'range', min: 0, max: 100, step: 1, displayUnit: '%', showIf: (p) => p.mode === 'bars', livePreview: true },
    { type: 'section', label: 'View' },
    { id: 'projection', label: 'Projection', type: 'select', options: [{ value: 'orthographic', label: 'Orthographic' }, { value: 'perspective', label: 'Perspective' }] },
    { id: 'cameraDistance', label: 'Camera Distance', type: 'range', min: 1, max: 2000, step: 10, showIf: (p) => p.projection === 'perspective', livePreview: true },
    { id: 'focalLength', label: 'Perspective Strength', type: 'range', min: 1, max: 1500, step: 10, showIf: (p) => p.projection === 'perspective', livePreview: true },
    { id: 'tilt', label: 'Rotate X', type: 'range', min: 0, max: 89, step: 1, displayUnit: '°', infoKey: 'view3d.rotateX', livePreview: true },
    { id: 'rotate', label: 'Rotate Y', type: 'range', min: -180, max: 180, step: 1, displayUnit: '°', infoKey: 'view3d.rotateY', livePreview: true },
    { id: 'roll', label: 'Rotate Z', type: 'range', min: -180, max: 180, step: 1, displayUnit: '°', infoKey: 'view3d.rotateZ', livePreview: true },
    ...buildShadingControls(SHADING_CAPS.rasterPlane),
  ];

  const PETALIS_DESIGNER_REMOVED_CONTROL_IDS = new Set([
    'tipSharpness',
    'tipTwist',
    'centerCurlBoost',
    'tipCurl',
    'baseFlare',
    'basePinch',
    'count',
    'ringMode',
    'innerCount',
    'outerCount',
    'innerOuterLock',
    'profileTransitionPosition',
    'profileTransitionFeather',
    'petalLengthRatio',
    'petalSizeRatio',
    'leafSidePos',
    'leafSideWidth',
    'edgeWaveAmp',
    'edgeWaveFreq',
    'centerWaveBoost',
    'centerSizeMorph',
    'centerSizeCurve',
    'centerShapeMorph',
    'centerProfile',
    'countJitter',
    'sizeJitter',
    'rotationJitter',
    'angularDrift',
    'driftStrength',
    'driftNoise',
    'radiusScale',
    'radiusScaleCurve',
    // The named-profile picker and the per-petal shape params now live INSIDE the
    // Petal Designer (its profile gallery + per-ring Advanced sliders), so drop the
    // duplicate "Petal Geometry" panel controls. Resolution/layering/anchor-to-center
    // stay — they are not in the designer.
    'petalProfile',
    'petalScale',
    'bloom',
    'petalAsymmetry',
    'petalCupping',
    'petalWidthRatio',
  ]);
  const PETALIS_DESIGNER_REMOVED_SECTION_LABELS = new Set([
    'Petal Modifiers',
    'Center Morphing',
    'Randomness & Seed',
  ]);
  const PETALIS_DESIGNER_REMOVED_CONTROL_TYPES = new Set(['petalModifierList']);
  // Presets-first: a newcomer should pick a bloom from the gallery before the
  // inline designer. Hoist the Presets section/control above the designer, then
  // the rest of the (filtered) petalis controls below it.
  const petalisFiltered = (CONTROL_DEFS.petalis || [])
    .map((def) => (def && typeof def === 'object' ? { ...def } : def))
    .filter((def) => {
      if (!def || typeof def !== 'object') return true;
      if (def.id && PETALIS_DESIGNER_REMOVED_CONTROL_IDS.has(def.id)) return false;
      if (PETALIS_DESIGNER_REMOVED_CONTROL_TYPES.has(def.type)) return false;
      if (def.type === 'section' && PETALIS_DESIGNER_REMOVED_SECTION_LABELS.has(def.label)) return false;
      return true;
    });
  const isPresetDef = (def) =>
    def && typeof def === 'object' &&
    ((def.type === 'section' && def.label === 'Presets') || def.id === 'preset');
  const petalisPresetControls = petalisFiltered.filter(isPresetDef);
  const petalisRest = petalisFiltered.filter((def) => !isPresetDef(def));
  const petalisDesignerControls = [
    ...petalisPresetControls,
    { type: 'section', label: 'Petal Designer' },
    { type: 'petalDesignerInline' },
    ...petalisRest,
  ];
  CONTROL_DEFS.petalisDesigner = petalisDesignerControls;

  // Pendula = the kinetic-harmonograph studio. Its control panel is the
  // harmonograph panel (kept in lock-step by deriving from it here, not by
  // duplicating ~190 lines) with two changes: the Preset selector lists the
  // pendula library, and a Motion Rack (temporal LFOs) is grafted in right
  // after the virtual-plotter widget. Motion stays pendula-only — harmonograph
  // is intentionally left untouched.
  CONTROL_DEFS.pendula = (CONTROL_DEFS.harmonograph || []).reduce((acc, def) => {
    if (!def || typeof def !== 'object') { acc.push(def); return acc; }
    const copy = { ...def };
    if (copy.id === 'preset') copy.options = PENDULA_PRESET_OPTIONS;
    if (typeof copy.infoKey === 'string') copy.infoKey = copy.infoKey.replace(/^harmonograph\./, 'pendula.');
    if (copy.type === 'harmonographPlotter') {
      // The Motion Rack sits ABOVE the Virtual Plotter for pendula — you shape
      // the figure with LFOs, then the plotter below previews/plays it.
      acc.push({ type: 'section', label: 'Motion' });
      acc.push({ type: 'harmonographMotion' });
      acc.push(copy);
      return acc;
    }
    acc.push(copy);
    if (copy.id === 'preset') {
      // Machine type (pendula-only): Lateral = damped spiral-in; Pintograph =
      // constant-velocity disks, damping forced to 0 for perpetual loops.
      acc.push({ type: 'section', label: 'Machine' });
      acc.push({
        id: 'machineType',
        label: 'Machine',
        type: 'select',
        options: [
          { value: 'lateral', label: 'Lateral (damped)' },
          { value: 'pintograph', label: 'Pintograph (perpetual)' },
        ],
        infoKey: 'pendula.machineType',
      });
    }
    return acc;
  }, []);

  // ── Universal preset control ──────────────────────────────────────────────
  // Every remaining algorithm gets a "Presets" section + preset selector at the
  // top of its panel so the universal gallery (which intercepts any `preset`
  // control whose library is non-empty) can mount. Algorithms that already
  // declare a preset control (harmonograph, petalis, terrain, pendula) are left
  // untouched. Options are derived from the per-system library so the <select>
  // fallback (used only if the gallery component is missing) still lists them.
  const PRESET_CONTROL_SYSTEMS = [
    'rings', 'svgDistort', 'flowfield', 'boids', 'attractor', 'hyphae',
    'lissajous', 'wavetable', 'topo', 'grid', 'rainfall', 'phylla',
    'spiral', 'shapePack', 'spirograph', 'spiralizer', 'polyhedron',
    'topoform', 'rasterPlane', 'text', 'halftone', 'imageWeave',
  ];
  const presetOptionsFor = (system) => {
    const lib = (window.Vectura && window.Vectura.PresetLibraries
      && window.Vectura.PresetLibraries[system]) || [];
    return [
      { value: 'custom', label: 'Custom' },
      ...lib.map((preset) => ({ value: preset.id, label: preset.name })),
    ];
  };
  PRESET_CONTROL_SYSTEMS.forEach((system) => {
    const defs = CONTROL_DEFS[system];
    if (!Array.isArray(defs)) return;
    if (defs.some((def) => def && def.id === 'preset')) return; // already wired
    defs.unshift(
      { type: 'section', label: 'Presets' },
      { id: 'preset', label: 'Preset', type: 'select', options: presetOptionsFor(system) },
    );
  });

  const ns = (window.Vectura = window.Vectura || {});
  const ui = (ns.UI = ns.UI || {});
  ui.CONTROL_DEFS = CONTROL_DEFS;
})();
