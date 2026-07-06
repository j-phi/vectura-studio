/**
 * Smart-guide configuration — Illustrator tools parity, Phase 1 Lane A
 * (SEL-4, SG-1…SG-5).
 *
 * Every object-to-object guide threshold, perf limit, and user-visible label
 * string lives here — never inline in the renderer (repo config contract).
 * The renderer feature-detects `window.Vectura.SMART_GUIDES` and quietly
 * disables object smart guides / measurement chips when this file has not
 * been loaded, so the module tolerates late loading.
 *
 * Load order: with the other `src/config/` scripts, before `src/render/`.
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});

  Vectura.SMART_GUIDES = {
    // Screen-space proximity (px) within which dragged edges/centers snap to
    // other objects' edges/centers/anchors (SG-1/SG-4).
    toleranceScreenPx: 6,

    // Guide lines extend this many screen px past the union of the dragged
    // selection and the matched object (SG-1 "full-length" overhang).
    guideOverhangScreenPx: 12,

    // Perf guard (SG-1): when more than maxCandidateLayers other layers are
    // visible, only the nearestCandidateCount nearest (by bounds-center
    // distance at drag start) participate in guide/snap scans.
    maxCandidateLayers: 40,
    nearestCandidateCount: 16,

    // SG-4: anchor/endpoint snap candidates collected per drag session.
    maxAnchorCandidates: 600,
    maxAnchorsPerLayer: 24,

    // SG-3: equal-spacing hint chips + snap.
    spacing: {
      enabled: true,
      toleranceScreenPx: 6,
      // Neighbor gaps larger than this (mm) are ignored for spacing hints.
      maxGapWorld: 300,
    },

    // SG-2: semantic label vocabulary (the matched-feature words shown in
    // magenta beside a guide or under the pointer).
    labels: {
      path: 'path',
      anchor: 'anchor',
      midpoint: 'midpoint',
      endpoint: 'endpoint',
      center: 'center',
    },

    // Screen-px radius within which hovering the selection's bounding-box center
    // reveals the center helper point (marker + "center" label + X/Y chip).
    centerHitScreenPx: 7,

    // SEL-4: measurement chip vocabulary (hover X/Y, move-drag dX/dY).
    chip: {
      x: 'X',
      y: 'Y',
      dx: 'dX',
      dy: 'dY',
      labelSeparator: ': ',
      pairSeparator: ' / ',
    },

    // Decimal places for measurement chips — round to 0.1 document unit (0.1 mm).
    chipPrecision: 1,

    // Canvas-overlay guide label typography (screen px; drawn zoom-invariant).
    labelFontPx: 10,
    labelFontFamily: 'system-ui, -apple-system, sans-serif',
  };
})();
