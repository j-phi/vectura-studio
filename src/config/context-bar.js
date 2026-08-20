/**
 * Vectura Studio — Contextual Task Bar copy, icons & timings (Tools
 * Tools Parity, Phase 2 Lane G: TB-1…8).
 *
 * Single source of truth for every user-visible Task Bar string, every inline
 * SVG icon, and every timing/threshold constant. Consumed by
 * `src/ui/shell/context-bar.js` (framework + selection states) and by
 * `src/ui/shell/context-bar-modes.js` (Lane H sub-modes, which read the shared
 * ICONS/LABELS it needs). Never inline Task Bar copy or icons in the shell
 * modules — add or edit entries here.
 *
 * The bar morphs per selection context (TB-3..7); each state's button set is
 * assembled in code from these labels/tooltips/icons so the wording stays
 * centralized. Sub-mode-entering buttons (stroke icon, Simplify, shape props)
 * call Lane H's `Vectura.UI.ContextBarModes.enter*` entry points, feature-
 * detected — this config only owns their labels/icons.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  // Minimal stroke-icon SVG factory (20×20 viewBox, currentColor, 1.6 stroke)
  // matching the floating tool rail's icon family.
  const svg = (inner) =>
    `<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" ` +
    `stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

  // ── Scene 3D highlight treatments (shared by BOTH surfaces) ──────────────
  // Deliberately hung off Vectura directly rather than nested under
  // CONTEXT_BAR, because two independent surfaces render the highlight control
  // and must not drift: the ctxbar Highlight flyout
  // (`src/ui/shell/context-bar.js` buildHighlightBody) and the 3D panel's
  // Highlight block (`src/ui/panels/scene3d-panel.js`). They previously each
  // carried their own option list and their own "which rows are relevant" rule,
  // and had already diverged. One list, one predicate, read by both.
  //
  // NONE_VALUE is the *persisted* value for "no highlight at all". The engine
  // (`src/core/scene3d/params.js` HIGHLIGHT_TREATMENTS) still spells that value
  // 'keep'; only the user-visible label became "None". NONE_ALIASES lets the UI
  // also recognise a future canonical 'none' so saved documents keep reading as
  // None whichever spelling they hold.
  const SCENE_HIGHLIGHT = {
    NONE_VALUE: 'keep',
    NONE_ALIASES: ['none', 'keep'],
    // Treatments that put no configurable ink on the surface. Every detail row
    // (Strength / Pen / Bands / Alt fill / Burst) is inert for these, so those
    // rows are REMOVED — never shown disabled.
    INERT: ['blank', 'none', 'keep'],
    TREATMENTS: [
      { value: 'blank', label: 'Blank' },
      { value: 'keep', label: 'None' },
      { value: 'dashed', label: 'Dashed' },
      { value: 'dotted', label: 'Dotted' },
      { value: 'sparse', label: 'Sparse' },
      { value: 'altFill', label: 'Alt fill' },
      { value: 'burst', label: 'Burst' },
      { value: 'stippleOut', label: 'Stipple' },
    ],
  };
  // Map a stored value onto the option this UI actually offers: any None
  // spelling collapses onto NONE_VALUE, anything unknown falls back to 'blank'
  // (matching the engine's own clamp).
  SCENE_HIGHLIGHT.resolve = (value) => {
    if (SCENE_HIGHLIGHT.NONE_ALIASES.indexOf(value) !== -1) return SCENE_HIGHLIGHT.NONE_VALUE;
    return SCENE_HIGHLIGHT.TREATMENTS.some((o) => o.value === value) ? value : 'blank';
  };
  SCENE_HIGHLIGHT.hasDetailControls = (value) =>
    SCENE_HIGHLIGHT.INERT.indexOf(SCENE_HIGHLIGHT.resolve(value)) === -1;
  Vectura.SCENE_HIGHLIGHT = SCENE_HIGHLIGHT;

  // ── SCENE_FILL_STYLES — the Fill Style picker's presentation layer ────────
  // Declared here, beside SCENE_HIGHLIGHT and for the same reason: two
  // independent surfaces render the control (the ctxbar Style flyout in
  // `src/ui/shell/context-bar.js` and the docked Style tab in
  // `src/ui/panels/scene3d-panel.js`) and must not drift. One taxonomy, one
  // option builder, one blurb table, read by both.
  //
  // The ROSTER — 47 laws, their labels, their measured mechanism/strengths/
  // weaknesses/caveats, and the production/library tier split — is owned by
  // `src/config/scene3d-tone-laws.js` and is NOT duplicated here. That file
  // loads AFTER this one, so every read below is lazy (at render time).
  //
  // What this module adds on top of the roster is MARK CLASS. The roster's
  // own `FAMILIES` group by tone MECHANISM (width-based / ladders / bundles /
  // continuous fields …), which answers "how is the grey produced?" — a
  // question a user picking a fill does not ask. Mark class answers "what will
  // this look like?": parallel rulings, crossed rulings, dots, dashes, a
  // scribble, a network. The two are genuinely different cuts: `penCross` and
  // `penReserve` sit in the roster's `threePen` mechanism family but are
  // CROSSHATCH marks, and crosshatched vs single-direction textures occupy
  // separate perceptual clusters (Sterzik, Vollmer & Vollmer, IEEE TVCG 2024)
  // — so they must not sit in one undifferentiated list.
  const FILL_STYLE_DEFAULT = 'ladder';
  // Ordered; this is the optgroup order the picker renders.
  const FILL_STYLE_MARK_CLASSES = [
    { id: 'ref', label: 'No tone', blurb: 'The tone apparatus off. Every ruling drawn at one pitch and one weight — a wire cage, not a shaded solid.' },
    { id: 'hatch', label: 'Parallel hatching', blurb: 'One family of ruled lines, all running the same way.' },
    { id: 'cross', label: 'Crosshatch & multi-angle', blurb: 'Marks that cross, or rulings whose direction changes across the form. A separate perceptual cluster from single-direction hatching — not interchangeable with it.' },
    { id: 'flow', label: 'Flow lines', blurb: 'Lines that follow a direction field over the body rather than a fixed screen angle.' },
    { id: 'wave', label: 'Wavy lines & scribble', blurb: 'Rulings carrying a lateral wave, or drawn as a continuous scribble.' },
    { id: 'dash', label: 'Dashes & ticks', blurb: 'Broken rulings — short marks whose length, count or duty cycle carries the tone.' },
    { id: 'dot', label: 'Dots & stipple', blurb: 'Discrete dots or flicks instead of continuous line.' },
    { id: 'web', label: 'Networks & space-filling', blurb: 'One continuous path, or a network with no ruling direction anywhere.' },
  ];
  // lawId → mark-class id. Derived from each law's own measured `mechanism`
  // string in the roster; every one of the 47 ids is present, and
  // `assertComplete()` below is the test hook that keeps it that way when the
  // roster grows.
  const FILL_STYLE_MARK_OF = {
    none: 'ref',
    // Width-based, ladder, bundle, continuous-field and the even-grid pen laws
    // all draw ONE family of parallel rulings; only what modulates them differs.
    nibAngle: 'hatch', taperedEnds: 'hatch', weightModulated: 'hatch',
    isophoteWidth: 'hatch', whiteBand: 'hatch', weightSmoothstep: 'hatch',
    fineLadder: 'hatch', phaseFineLadder: 'hatch', perceptualRamp: 'hatch',
    bundleCount: 'hatch', bundleSubNib: 'hatch', bundleEased: 'hatch',
    bundleDither: 'hatch', bundleLozenge: 'hatch', bundleHandoff: 'hatch',
    contFieldSigmoid: 'hatch', contFieldTouch: 'hatch', contFieldFore: 'hatch',
    contFieldSurface: 'hatch', contFieldQuant: 'hatch',
    penInterleave: 'hatch', penPitchMatch: 'hatch', penFacing: 'hatch',
    endShorten: 'hatch',
    // penCross draws medium x broad CROSSHATCH in the darks; penReserve cuts
    // white reserves TRANSVERSE to the ruling and hatches inside them. Both
    // put crossed marks on the surface. mezzoRegion gives every blue-noise
    // region its own ruling angle (30-degree minimum separation), so the form
    // carries many directions at once rather than one.
    penCross: 'cross', penReserve: 'cross', mezzoRegion: 'cross',
    // Direction/stripe fields: the ruling direction is solved over the body.
    etfKang: 'flow', defectSplit: 'flow', turingStripe: 'flow',
    mkScribble: 'wave', ampSpacing: 'wave', weaveDepth: 'wave',
    interlockWeave: 'wave', trochoidLoop: 'wave', amplitudeOnly: 'wave',
    mkTick: 'dash', mkDashRamp: 'dash', dutyConst: 'dash',
    mkDotScreen: 'dot', lozengeStipple: 'dot', penStipple: 'dot',
    voronoiWeb: 'web', mazeFill: 'web', originSpiral: 'web', deepFillTSP: 'web',
  };
  // The shipped default law. It is deliberately NOT in the roster's 47 (those
  // are the laws the tone study MEASURED against it), but it IS the value
  // `params.js clampStyleParam('toneLaw')` resolves an absent/unknown key to,
  // and the value `surface-fill.js TONE_ALGO_DEFAULT` draws. Without an option
  // carrying it the picker would show a value the drawing is not using.
  const FILL_STYLE_DEFAULT_ENTRY = {
    id: FILL_STYLE_DEFAULT,
    label: 'Ladder (default)',
    markClass: 'hatch',
    mechanism: 'The shipped default: rulings are selected from a small set of discrete coverage rungs at one constant pen weight, so tone is carried by which rulings are drawn.',
    strengths: 'The measured baseline every other fill style is judged against.',
    weaknesses: 'One draw/skip verdict per ruling, so its coverage steps are visible and it cannot reach a deep shadow.',
    chooseWhen: 'The default. Pick Fine Ladder for the same mechanism with the step pushed below the visible threshold.',
    caveat: null,
    simulated: false,
    tier: 'production',
  };
  const SCENE_FILL_STYLES = {
    // User-visible copy, owned here so the ctxbar flyout and the docked panel
    // cannot drift. `sceneFlyouts.style.fillStyle` below re-exports these under
    // the ctxbar's own row-copy shape rather than restating the strings.
    LABEL: 'Fill Style',
    ARIA: 'Fill style',
    LIBRARY_LABEL: 'Library',
    LIBRARY_ARIA: 'Show the measured library (11 more fill styles, with caveats)',
    DEFAULT: FILL_STYLE_DEFAULT,
    MARK_CLASSES: FILL_STYLE_MARK_CLASSES,
    MARK_OF: FILL_STYLE_MARK_OF,
    DEFAULT_ENTRY: FILL_STYLE_DEFAULT_ENTRY,
    // Suffix stamped on a library-tier option so its tier is legible with the
    // select CLOSED, not only inside the open list.
    LIBRARY_SUFFIX: ' · library',
    // Prefaces every caveat the six simulated pen laws show. They emit three
    // stroke widths onto ONE pen layer because pen identity is carried per
    // style group, not per run — three real nibs cannot be named in one fill.
    SIMULATED_NOTE: 'Simulated — 3 nib widths on one pen layer.',
  };
  const fillStyleRoster = () => Vectura.SCENE3D_TONE_LAWS || null;
  SCENE_FILL_STYLES.roster = fillStyleRoster;
  SCENE_FILL_STYLES.markClass = (id) => {
    if (id === FILL_STYLE_DEFAULT) return FILL_STYLE_DEFAULT_ENTRY.markClass;
    return FILL_STYLE_MARK_OF[id] || 'hatch';
  };
  SCENE_FILL_STYLES.markClassLabel = (classId) => {
    const c = FILL_STYLE_MARK_CLASSES.find((m) => m.id === classId);
    return c ? c.label : '';
  };
  SCENE_FILL_STYLES.isLibrary = (id) => {
    const R = fillStyleRoster();
    return Boolean(R && R.LIBRARY.indexOf(id) !== -1);
  };
  // The full descriptor a surface renders: roster entry + mark class, or the
  // synthesized default entry. Null for an id neither knows.
  SCENE_FILL_STYLES.entry = (id) => {
    if (id === FILL_STYLE_DEFAULT) return { ...FILL_STYLE_DEFAULT_ENTRY, markClassLabel: SCENE_FILL_STYLES.markClassLabel('hatch') };
    const R = fillStyleRoster();
    const law = R && R.BY_ID[id];
    if (!law) return null;
    const markClass = SCENE_FILL_STYLES.markClass(id);
    return {
      ...law,
      markClass,
      markClassLabel: SCENE_FILL_STYLES.markClassLabel(markClass),
    };
  };
  // Map a stored value onto an option this picker actually offers. Anything
  // unknown collapses onto the default, matching the engine's own clamp.
  SCENE_FILL_STYLES.resolve = (value) => {
    if (typeof value !== 'string' || !value) return FILL_STYLE_DEFAULT;
    return SCENE_FILL_STYLES.entry(value) ? value : FILL_STYLE_DEFAULT;
  };
  // [{ group, options: [{ value, label }] }] for UI.Select, grouped by MARK
  // CLASS. `includeLibrary` false = the 36 production laws + the default;
  // true = all 47 + the default, each library row suffixed. Empty classes are
  // dropped so the disclosure never leaves a headed, empty group behind.
  SCENE_FILL_STYLES.groups = (includeLibrary) => {
    const R = fillStyleRoster();
    const ids = R ? R.IDS : [];
    const inTier = (id) => includeLibrary || !R || R.PRODUCTION.indexOf(id) !== -1;
    const out = [];
    FILL_STYLE_MARK_CLASSES.forEach((cls) => {
      const options = [];
      // The default heads its own class so it is never buried mid-list.
      if (cls.id === FILL_STYLE_DEFAULT_ENTRY.markClass) {
        options.push({ value: FILL_STYLE_DEFAULT, label: FILL_STYLE_DEFAULT_ENTRY.label });
      }
      ids.forEach((id) => {
        if (SCENE_FILL_STYLES.markClass(id) !== cls.id || !inTier(id)) return;
        const label = R.BY_ID[id].label + (SCENE_FILL_STYLES.isLibrary(id) ? SCENE_FILL_STYLES.LIBRARY_SUFFIX : '');
        options.push({ value: id, label });
      });
      if (options.length) out.push({ group: cls.label, options });
    });
    return out;
  };
  // The one-or-two lines a surface prints under the select. `text` always
  // leads with the MARK CLASS, so the kind of mark stays visible once the
  // select is closed; `caveat` is the measured warning, prefixed for the six
  // simulated pen laws. Either may be ''.
  SCENE_FILL_STYLES.note = (id) => {
    const e = SCENE_FILL_STYLES.entry(id);
    if (!e) return { text: '', caveat: '' };
    const text = e.markClassLabel ? `${e.markClassLabel} — ${e.chooseWhen || ''}` : (e.chooseWhen || '');
    let caveat = e.caveat || '';
    if (e.simulated) caveat = caveat ? `${SCENE_FILL_STYLES.SIMULATED_NOTE} ${caveat}` : SCENE_FILL_STYLES.SIMULATED_NOTE;
    return { text, caveat };
  };
  // Test hook: every roster id must have a mark class, and every mark class id
  // used must exist. Returns the offending ids so a failure names them.
  SCENE_FILL_STYLES.assertComplete = () => {
    const R = fillStyleRoster();
    const known = FILL_STYLE_MARK_CLASSES.map((c) => c.id);
    const missing = R ? R.IDS.filter((id) => !FILL_STYLE_MARK_OF[id]) : [];
    const unknown = Object.keys(FILL_STYLE_MARK_OF).filter((id) => known.indexOf(FILL_STYLE_MARK_OF[id]) === -1);
    const stray = R ? Object.keys(FILL_STYLE_MARK_OF).filter((id) => R.IDS.indexOf(id) === -1) : [];
    return { missing, unknown, stray };
  };
  Vectura.SCENE_FILL_STYLES = SCENE_FILL_STYLES;

  Vectura.CONTEXT_BAR = {
    // ── TB-1/8: timings & geometry (constant screen px; zoom-independent) ──
    timing: {
      // TB-8: fade/slide show-hide (≤120ms; motion.css owns the transition,
      // this value is echoed there and used for JS-side cleanup timers).
      showHideMs: 120,
      // TB-2: Show-panel attention pulse — 2 pulses over ~1s.
      pulseCount: 2,
      pulseDurationMs: 1000,
      // TB-1: gap in screen px between the selection bbox and the bar.
      anchorOffsetPx: 12,
      // TB-1: keep the bar this many px clear of viewport edges when clamping.
      viewportPadPx: 8,
      // Manual-drag threshold (px) beyond which a handle drag implies Pin.
      dragPinThresholdPx: 3,
    },

    // ── TB-8: ARIA ────────────────────────────────────────────────────────
    aria: {
      toolbarLabel: 'Contextual task bar',
      overflowLabel: 'More options',
      dragHandleLabel: 'Move task bar (drag to pin)',
    },

    // ── TB-2: overflow (…) menu — EXACT contents & order ────────────────────
    overflow: {
      buttonTooltip: 'More options',
      items: {
        showPanel: 'Show Properties panel',
        hideBar: 'Hide bar',
        resetPosition: 'Reset bar position',
        pinPosition: 'Pin bar position',
        quickHelp: 'Quick help',
      },
    },

    // ── Per-context button labels & tooltips ───────────────────────────────
    buttons: {
      // TB-3 idle
      addLayer: { label: 'Add Layer', tooltip: 'Add a new layer' },
      draw: { label: 'Draw', tooltip: 'Draw with the pencil tool' },
      documentSetup: { label: 'Document Setup', tooltip: 'Open Document Setup' },
      // TB-4 single path/shape
      editPath: { label: 'Edit Path', tooltip: 'Edit path anchors (Direct Selection)' },
      // TB-4b single algorithm layer (drawable generator) — algorithm-aware
      // affordances shown instead of Edit Path, since generator output is many
      // paths, not one editable contour.
      changeAlgo: { tooltip: 'Switch algorithm' },
      presets: { label: 'Presets', tooltip: 'Apply a preset' },
      randomize: { tooltip: 'Randomize (new variation)' },
      expand: { label: 'Expand', tooltip: 'Expand into an editable group' },
      stroke: { tooltip: 'Stroke weight' },
      shapeProps: { tooltip: 'Shape properties' },
      lock: { tooltip: 'Lock layer', tooltipUnlock: 'Unlock layer' },
      makeMask: { tooltip: 'Make mask' },
      // TB-5 multi / group
      group: { label: 'Group', tooltip: 'Group objects' },
      ungroup: { label: 'Ungroup', tooltip: 'Ungroup' },
      isolate: { tooltip: 'Isolate group' },
      align: { tooltip: 'Align & distribute' },
      // TB-6 direct / anchor
      simplify: { label: 'Simplify', tooltip: 'Simplify path' },
      smooth: { label: 'Smooth', tooltip: 'Smooth path' },
      anchorAdd: { tooltip: 'Add anchor point', tooltipOff: 'Select a path segment first' },
      anchorDelete: { tooltip: 'Delete anchor point', tooltipOff: 'Select an anchor point first' },
      anchorConnect: { tooltip: 'Connect endpoints', tooltipOff: 'Select two path endpoints first' },
      anchorCut: { tooltip: 'Cut path at anchor', tooltipOff: 'Select an anchor point first' },
      anchorCorner: { tooltip: 'Convert to corner', tooltipOff: 'Select an anchor point first' },
      anchorSmooth: { tooltip: 'Convert to smooth', tooltipOff: 'Select an anchor point first' },
      // TB-7 text
      pointArea: {
        tooltipToArea: 'Convert to Area Type',
        tooltipToPoint: 'Convert to Point Type',
      },
      outlineText: { label: 'Outline the text', tooltip: 'Convert text to outlines' },
      // 3D Scene Studio (Phase 1C) — scene-object / scene-face / scene-edge
      // contexts (kinds 'scene-object' | 'scene-face' | 'scene-edge').
      sceneDuplicate: { label: 'Duplicate', tooltip: 'Duplicate object' },
      sceneDelete: { tooltip: 'Delete object' },
      sceneDrop: { label: 'Drop', tooltip: 'Drop to ground (D)' },
      sceneVisibility: { tooltipSolid: 'Show solid', tooltipXray: 'Show X-ray' },
      sceneSelectFaces: { label: 'All Faces', tooltip: 'Select all faces of this object' },
      sceneClearStyle: {
        label: 'Clear Style',
        tooltip: 'Clear face style',
        tooltipOff: 'Style tools not loaded',
      },
      // Persistent scene-object dropdown pills (ask #8). Each opens a flyout that
      // stays open until you click elsewhere; copy for the rows lives in
      // CONTEXT_BAR.sceneFlyouts below.
      sceneStyle: { label: 'Style', tooltip: 'Fill style, pen, density & border' },
      sceneShadow: { label: 'Shadow', tooltip: 'Cast shadow — fill angle, style & pen' },
      sceneHighlight: { label: 'Highlight', tooltip: 'Highlight treatment' },
      sceneXray: { label: 'X-ray', tooltip: 'See-through / hidden-line style' },
      // I22: swap the selected object(s) primitive. Option list in
      // CONTEXT_BAR.sceneFlyouts.shape below.
      sceneShape: { label: 'Shape', tooltip: 'Change primitive shape' },
    },

    // ── Scene-object flyout copy + option lists (ask #8) ───────────────────
    // Persistent dropdowns opened from the four pills above. Option lists mirror
    // the docked Scene panel so both surfaces read identically; labels are here,
    // never inlined in context-bar.js.
    sceneFlyouts: {
      // Multi-select mixed-value vocabulary (display only). `label` names the
      // sentinel option shown in a select/segmented control when the selected
      // objects disagree; `dash` is the blank placeholder for sliders/dials.
      mixed: { label: 'Mixed', dash: '—', sentinel: '__scene-mixed__' },
      // I22 — primitive swap menu (object ctxbar). Values must match
      // Scene3D.Params.PRIMITIVES; the renderer bridge rejects any other name.
      // FULL parity with the docked panel's shelf (SHELF_PRIMS + MORE_PRIMS) and
      // the layer menu's "Add shape": all 12 primitives, in the panel's order.
      // Plane / Ellipsoid / Polyhedron were missing, so three shapes could be
      // added but never swapped TO from the canvas. (`solid` reads "Polyhedron"
      // everywhere in the UI.)
      shape: {
        label: 'Shape', aria: 'Primitive shape',
        primitives: [
          { value: 'box', label: 'Box' },
          { value: 'sphere', label: 'Sphere' },
          { value: 'cylinder', label: 'Cylinder' },
          { value: 'torus', label: 'Torus' },
          { value: 'cone', label: 'Cone' },
          { value: 'plane', label: 'Plane' },
          { value: 'ellipsoid', label: 'Ellipsoid' },
          { value: 'superellipsoid', label: 'Superellipsoid' },
          { value: 'torusKnot', label: 'Torus Knot' },
          { value: 'capsule', label: 'Capsule' },
          { value: 'pyramid', label: 'Pyramid' },
          { value: 'solid', label: 'Polyhedron' },
        ],
      },
      style: {
        // U9 — the first dropdown picks the KIND of fill (hatch / crosshatch /
        // contour / spiral / stipple / wireframe / none); the Fill Style row
        // beneath it picks the tone law that KIND is drawn with. Calling the
        // first one "Fill" made the second unnameable, so it is "Type".
        mapper: { label: 'Type', aria: 'Fill type' },
        fillStyle: {
          label: SCENE_FILL_STYLES.LABEL,
          aria: SCENE_FILL_STYLES.ARIA,
          libraryLabel: SCENE_FILL_STYLES.LIBRARY_LABEL,
          libraryAria: SCENE_FILL_STYLES.LIBRARY_ARIA,
        },
        pen: { label: 'Pen', aria: 'Style pen', inherit: 'Layer pen' },
        angle: { label: 'Angle', aria: 'Hatch angle' },
        density: { label: 'Density', aria: 'Fill density' },
        reset: { label: 'Reset override', tooltip: 'Clear this object’s style override' },
        // I6 — Border (silhouette outline) relocated here from the Highlight
        // flyout. Writes obj.border.* (a per-object field, not style.params).
        borderHead: 'Border',
        border: { label: 'Border', aria: 'Silhouette border' },
        borderStrength: { label: 'Weight', aria: 'Border strength' },
        borderPen: { label: 'Pen', aria: 'Border pen', inherit: 'Edge pen' },
        onOff: [{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }],
        mappers: [
          { value: 'none', label: 'None' },
          { value: 'wireframe', label: 'Wireframe' },
          { value: 'hatch', label: 'Hatch' },
          { value: 'crosshatch', label: 'Crosshatch' },
          { value: 'contour', label: 'Contour' },
          { value: 'spiral', label: 'Spiral' },
          { value: 'stipple', label: 'Stipple' },
        ],
        // Mappers that expose Angle (hatch families) and Density (all fills).
        angleMappers: ['hatch', 'crosshatch'],
        fillMappers: ['hatch', 'crosshatch', 'contour', 'spiral', 'stipple'],
      },
      shadow: {
        cast: { label: 'Cast', aria: 'Object casts shadow' },
        castOptions: [{ value: 'inherit', label: 'Auto' }, { value: 'on', label: 'On' }, { value: 'off', label: 'Off' }],
        mode: { label: 'Mode', aria: 'Shadow mode (additive hatch or inverse ground-fill thinning)' },
        modeOptions: [{ value: 'additive', label: 'Additive' }, { value: 'inverse', label: 'Inverse' }],
        // RC1 — Angle is the bearing of the FILL LINES drawn inside the shadow
        // region. It restyles the shadow; it does NOT move it. (Aiming the sun
        // is a LIGHTING concern — the Sun child layer, the on-canvas light
        // gizmo, or dragging the shadow itself.) The pre-RC1 strings here said
        // "sun bearing" / "Scene-wide (sun)" and both ctxbar and panel had to
        // override them locally; this config is now the single source of truth.
        angle: { label: 'Angle', aria: 'Shadow fill angle (scene-wide)', note: 'Fill lines (scene-wide)' },
        // When on, shadows.js derives the fill bearing from the light travel
        // direction, which makes the manual Angle dial inert — the flyout then
        // shows derivedNote instead of the dial.
        follow: {
          label: 'Follow light',
          aria: 'Shadow fill angle follows the light bearing',
          derivedNote: 'Angle is derived from the light bearing.',
        },
        style: { label: 'Style', aria: 'Shadow line style' },
        styleOptions: [
          { value: 'solid', label: 'Solid' }, { value: 'dashed', label: 'Dashed' },
          { value: 'dotted', label: 'Dotted' }, { value: 'dashdot', label: 'Dash-dot' },
        ],
        pen: { label: 'Pen', aria: 'Shadow pen', inherit: 'Caster pen' },
        density: { label: 'Density', aria: 'Shadow density' },
        layers: { label: 'Layers', aria: 'Shadow penumbra layers' },
        layerOptions: [{ value: 'off', label: 'Off' }, { value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' }],
      },
      highlight: {
        treatment: { label: 'Treatment', aria: 'Highlight treatment' },
        // Shared with the 3D panel — see SCENE_HIGHLIGHT above. Do not fork.
        treatments: SCENE_HIGHLIGHT.TREATMENTS,
        strength: { label: 'Strength', aria: 'Highlight density' },
        pen: { label: 'Pen', aria: 'Highlight pen', inherit: 'Inherit' },
        // I7 — when the treatment is "Alt fill" the flyout reveals this picker so
        // the alternate fill drawn in the highlight region is configurable (not a
        // fixed default). Mirrors params.js ALT_FILL_MAPPERS.
        altFill: { label: 'Alt fill', aria: 'Alternate fill mapper' },
        altFillMappers: [
          { value: 'hatch', label: 'Hatch' },
          { value: 'crosshatch', label: 'Crosshatch' },
          { value: 'contour', label: 'Contour' },
          { value: 'spiral', label: 'Spiral' },
          { value: 'stipple', label: 'Stipple' },
        ],
      },
      xray: {
        mode: { label: 'X-ray', aria: 'Object visibility' },
        modeOptions: [{ value: 'solid', label: 'Solid' }, { value: 'xray', label: 'X-ray' }],
        backFaces: { label: 'Back faces', aria: 'Show far surface' },
        backDensity: { label: 'Back density', aria: 'Far-surface density' },
        backLine: { label: 'Back line', aria: 'Far-surface line style' },
        pen: { label: 'Back pen', aria: 'Far-surface pen', inherit: 'Object pen' },
        lineOptions: [
          { value: 'solid', label: 'Solid' }, { value: 'dashed', label: 'Dashed' },
          { value: 'dotted', label: 'Dotted' }, { value: 'dashdot', label: 'Dash-dot' },
        ],
        onOff: [{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }],
        disabledHint: 'Set X-ray on to edit',
        // X-ray shows the FAR SURFACE through the near one, so it needs a
        // surface fill to show. scene3d.js emits the back-face family only for a
        // fill mapper (style.fillMappers above); under None / Wireframe the
        // x-ray output is identical to solid, so the back-face rows are removed
        // and this says why instead of leaving four dead controls on screen.
        needsFillHint: 'Back faces need a surface fill — set Style ▸ Fill.',
      },
    },

    // ── Align flyout (TB-5) — reuses the docked multi-selection panel's
    // `.align-btn[data-align-op]` buttons (identical geometry path). `op` maps
    // to the panel's data-align-op value; the flyout dispatches a click on the
    // matching docked button, so behavior stays byte-identical.
    align: {
      title: 'Align',
      groups: [
        {
          label: 'Align objects',
          actions: [
            { op: 'alignLeft', tooltip: 'Align left edges', icon: 'alignLeft' },
            { op: 'alignCenterH', tooltip: 'Align horizontal centers', icon: 'alignCenterH' },
            { op: 'alignRight', tooltip: 'Align right edges', icon: 'alignRight' },
            { op: 'alignTop', tooltip: 'Align top edges', icon: 'alignTop' },
            { op: 'alignCenterV', tooltip: 'Align vertical centers', icon: 'alignCenterV' },
            { op: 'alignBottom', tooltip: 'Align bottom edges', icon: 'alignBottom' },
            { op: 'alignCenterBoth', tooltip: 'Align centers (both axes)', icon: 'alignCenterBoth' },
          ],
        },
        {
          label: 'Distribute',
          actions: [
            { op: 'distributeCenterH', tooltip: 'Distribute centers horizontally', icon: 'distributeH' },
            { op: 'distributeCenterV', tooltip: 'Distribute centers vertically', icon: 'distributeV' },
          ],
        },
      ],
    },

    // ── TB-2: "Show panel" pulse targets per context kind ──────────────────
    // selector = the docked panel element pulsed; tab = optional right-pane tab
    // to switch to (null = leave current tab). Wayfinding, not navigation.
    showPanel: {
      idle: { selector: '#right-pane', tab: null },
      'single-algo': { selector: '#right-pane', tab: 'layers' },
      'single-path': { selector: '#right-pane', tab: 'layers' },
      'single-shape': { selector: '#right-pane', tab: 'layers' },
      'single-text': { selector: '#right-pane', tab: 'layers' },
      multi: { selector: '#right-pane', tab: 'layers' },
      group: { selector: '#right-pane', tab: 'layers' },
      direct: { selector: '#right-pane', tab: 'layers' },
      'scene-object': { selector: '#right-pane', tab: 'layers' },
      'scene-face': { selector: '#right-pane', tab: 'layers' },
      'scene-edge': { selector: '#right-pane', tab: 'layers' },
    },

    // TB-7: the docked panel that hosts the full text controls (family/style
    // pickers + size). The bar's family/style chips are wayfinding into this
    // panel — the full inline pickers are deferred to Lane J (TXT-3…5). Text
    // params render into the left pane (#left-pane / #left-panel-content).
    textPanel: { selector: '#left-pane' },

    // TB-3: real DOM trigger that opens Document Setup (File ▸ Document Setup).
    documentSetupTrigger: '#btn-settings',

    // In-app help anchor (Quick help). The help modal is opened by name; the
    // Task Bar section id lives here so the string is centralized.
    help: { sectionId: 'context-bar', fallbackTitle: 'Contextual Task Bar' },

    // ── TB-8: persistence key (self-contained cookie/localStorage; also kept
    // on Vectura.SETTINGS.contextBar so it lives in the canonical settings
    // object per spec). See context-bar.js for the interface request to fold
    // this into the App preference snapshot for .vectura round-trip.
    storageKey: 'vectura-context-bar',

    // ── Inline SVG icons (currentColor; sized in svg()) ────────────────────
    icons: {
      grip: svg('<circle cx="7" cy="5" r="0.9"/><circle cx="7" cy="10" r="0.9"/><circle cx="7" cy="15" r="0.9"/><circle cx="12" cy="5" r="0.9"/><circle cx="12" cy="10" r="0.9"/><circle cx="12" cy="15" r="0.9"/>'),
      overflow: svg('<circle cx="4.5" cy="10" r="1"/><circle cx="10" cy="10" r="1"/><circle cx="15.5" cy="10" r="1"/>'),
      // Pen-tool nib: the Draw button activates the pen tool, so it gets the
      // nib glyph (diamond nib + ink hole) rather than a pencil.
      draw: svg('<path d="M10 1.8L16.8 8.5L12.3 18.2H7.7L3.2 8.5Z"/><circle cx="10" cy="9.7" r="1.4" fill="currentColor" stroke="none"/>'),
      // Add Layer: a module grid with a plus in the fourth cell, distinct
      // from `changeAlgo`'s plain 2×2 grid.
      addLayer: svg('<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="11" y="3" width="6" height="6" rx="1"/><rect x="3" y="11" width="6" height="6" rx="1"/><path d="M14 11v6M11 14h6"/>'),
      documentSetup: svg('<rect x="4" y="3" width="12" height="14" rx="1.5"/><path d="M7 7h6M7 10h6M7 13h4"/>'),
      editPath: svg('<path d="M4 15l7-7"/><rect x="3" y="14" width="2.4" height="2.4" rx="0.3"/><rect x="10.6" y="6.4" width="2.4" height="2.4" rx="0.3"/><circle cx="15" cy="4.5" r="1.2"/>'),
      // Algorithm-layer affordances. changeAlgo: a 2×2 module grid (pick another
      // generator). presets: stacked cards. randomize: a five-pip die face.
      // expand: four corner arrows fanning outward (explode into a group).
      changeAlgo: svg('<rect x="3" y="3" width="5.6" height="5.6" rx="1"/><rect x="11.4" y="3" width="5.6" height="5.6" rx="1"/><rect x="3" y="11.4" width="5.6" height="5.6" rx="1"/><rect x="11.4" y="11.4" width="5.6" height="5.6" rx="1"/>'),
      presets: svg('<rect x="4" y="7" width="9" height="8" rx="1"/><path d="M7 7V5.4A1.4 1.4 0 0 1 8.4 4h6.2A1.4 1.4 0 0 1 16 5.4v6.2A1.4 1.4 0 0 1 14.6 13H13"/>'),
      randomize: svg('<rect x="4" y="4" width="12" height="12" rx="2.6"/><circle cx="7.6" cy="7.6" r="0.95" fill="currentColor" stroke="none"/><circle cx="12.4" cy="7.6" r="0.95" fill="currentColor" stroke="none"/><circle cx="10" cy="10" r="0.95" fill="currentColor" stroke="none"/><circle cx="7.6" cy="12.4" r="0.95" fill="currentColor" stroke="none"/><circle cx="12.4" cy="12.4" r="0.95" fill="currentColor" stroke="none"/>'),
      expand: svg('<path d="M8 4H4v4"/><path d="M12 4h4v4"/><path d="M8 16H4v-4"/><path d="M12 16h4v-4"/><path d="M8.5 8.5l-3-3M11.5 8.5l3-3M8.5 11.5l-3 3M11.5 11.5l3 3"/>'),
      stroke: svg('<path d="M4 6h12M4 10h12M4 14h12"/>'),
      shapeRect: svg('<rect x="4" y="6" width="12" height="8" rx="2"/>'),
      shapePolygon: svg('<path d="M10 3l6 4.4-2.3 7H6.3L4 7.4z"/>'),
      lock: svg('<rect x="4.5" y="9" width="11" height="7" rx="1.2"/><path d="M6.8 9V6.8a3.2 3.2 0 0 1 6.4 0V9"/>'),
      unlock: svg('<rect x="4.5" y="9" width="11" height="7" rx="1.2"/><path d="M6.8 9V6.8a3.2 3.2 0 0 1 6.2-0.8"/>'),
      makeMask: svg('<circle cx="10" cy="10" r="6"/><path d="M10 4v12"/>'),
      group: svg('<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="9" y="9" width="7" height="7" rx="1"/>'),
      ungroup: svg('<rect x="3.5" y="3.5" width="6" height="6" rx="1"/><rect x="10.5" y="10.5" width="6" height="6" rx="1" stroke-dasharray="2 1.6"/>'),
      isolate: svg('<rect x="3.5" y="5" width="13" height="10" rx="1.5"/><path d="M8 10h4M10 8v4"/>'),
      align: svg('<path d="M4 4v12"/><rect x="6" y="6" width="6" height="3" rx="0.6"/><rect x="6" y="11" width="9" height="3" rx="0.6"/>'),
      simplify: svg('<path d="M3 13c3 0 3-6 6-6s3 6 8 0"/>'),
      smooth: svg('<path d="M3 14c4-1 4-8 8-8"/><path d="M11 6c3 0 3 6 6 6" opacity="0.55"/>'),
      anchorAdd: svg('<path d="M10 5v10M5 10h10"/><rect x="8.4" y="8.4" width="3.2" height="3.2" fill="currentColor" stroke="none"/>'),
      anchorDelete: svg('<path d="M5 10h10"/><rect x="8.4" y="8.4" width="3.2" height="3.2" fill="currentColor" stroke="none"/>'),
      anchorConnect: svg('<circle cx="5" cy="10" r="1.6"/><circle cx="15" cy="10" r="1.6"/><path d="M6.6 10h6.8"/>'),
      anchorCut: svg('<path d="M4 7l12 6M4 13l12-6"/><circle cx="5" cy="6" r="1.4"/><circle cx="5" cy="14" r="1.4"/>'),
      anchorCorner: svg('<path d="M4 16V6h10"/><rect x="2.6" y="14.6" width="2.8" height="2.8" fill="currentColor" stroke="none"/>'),
      anchorSmooth: svg('<path d="M4 16C4 9 9 5 16 5"/><circle cx="4" cy="16" r="1.4" fill="currentColor" stroke="none"/>'),
      // Point Type: a "T" sitting on a baseline (no frame).
      pointType: svg('<path d="M5 6h10M10 6v9"/><path d="M4 16h12" opacity="0.55"/>'),
      // Area Type: a "T" inside a text frame (box).
      areaType: svg('<rect x="3.5" y="4" width="13" height="12" rx="1"/><path d="M7 8h6M10 8v5" />'),
      // Hollow-outline "T" glyph — a block T drawn as a closed outline (fill:none
      // + stroke), reading as "convert type to outlines".
      outlineText: svg('<path d="M3.5 4H16.5V7H11.7V16.5H8.3V7H3.5Z"/>'),
      // Align/distribute flyout glyphs.
      alignLeft: svg('<path d="M4 3v14"/><rect x="6" y="5" width="8" height="3" rx="0.6"/><rect x="6" y="12" width="5" height="3" rx="0.6"/>'),
      alignCenterH: svg('<path d="M10 3v14"/><rect x="5" y="5" width="10" height="3" rx="0.6"/><rect x="7" y="12" width="6" height="3" rx="0.6"/>'),
      alignRight: svg('<path d="M16 3v14"/><rect x="6" y="5" width="8" height="3" rx="0.6"/><rect x="9" y="12" width="5" height="3" rx="0.6"/>'),
      alignTop: svg('<path d="M3 4h14"/><rect x="5" y="6" width="3" height="8" rx="0.6"/><rect x="12" y="6" width="3" height="5" rx="0.6"/>'),
      alignCenterV: svg('<path d="M3 10h14"/><rect x="5" y="5" width="3" height="10" rx="0.6"/><rect x="12" y="7" width="3" height="6" rx="0.6"/>'),
      alignBottom: svg('<path d="M3 16h14"/><rect x="5" y="6" width="3" height="8" rx="0.6"/><rect x="12" y="9" width="3" height="5" rx="0.6"/>'),
      alignCenterBoth: svg('<path d="M10 3v14"/><path d="M3 10h14"/><rect x="7" y="7" width="6" height="6" rx="0.6"/>'),
      distributeH: svg('<rect x="3" y="6" width="3" height="8" rx="0.6"/><rect x="8.5" y="6" width="3" height="8" rx="0.6"/><rect x="14" y="6" width="3" height="8" rx="0.6"/>'),
      distributeV: svg('<rect x="6" y="3" width="8" height="3" rx="0.6"/><rect x="6" y="8.5" width="8" height="3" rx="0.6"/><rect x="6" y="14" width="8" height="3" rx="0.6"/>'),
      // 3D Scene Studio scene-context glyphs.
      sceneDuplicate: svg('<rect x="3.5" y="3.5" width="9" height="9" rx="1"/><rect x="7.5" y="7.5" width="9" height="9" rx="1"/>'),
      sceneDelete: svg('<path d="M5 6h10M8 6V4.5h4V6M6.5 6l0.7 9.5h5.6L13.5 6"/>'),
      sceneDrop: svg('<path d="M10 3v8M6.8 8l3.2 3 3.2-3"/><path d="M3.5 15.5h13"/>'),
      sceneVisibility: svg('<rect x="4" y="6" width="12" height="9" rx="1" stroke-dasharray="2.4 1.8"/><path d="M4 6l3-2.5h12l-3 2.5"/>'),
      sceneSelectFaces: svg('<path d="M10 2.8l6.2 3.6v7.2L10 17.2 3.8 13.6V6.4Z"/><path d="M3.8 6.4L10 10l6.2-3.6M10 10v7.2"/>'),
      sceneClearStyle: svg('<rect x="4" y="4" width="9" height="9" rx="1"/><path d="M12 12l4.5 4.5M16.5 12L12 16.5"/>'),
    },
  };
})();
