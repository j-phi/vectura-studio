/**
 * Vectura Studio — Contextual Task Bar copy, icons & timings (Illustrator
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
      draw: svg('<path d="M4 16l1-3 8-8 2 2-8 8-3 1z"/><path d="M11.5 5.5l2 2"/>'),
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
    },
  };
})();
