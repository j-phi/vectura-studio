/**
 * Phase 2 Lane H strings & thresholds (TB-9…11, SHP-1…3).
 *
 * Single source of truth for every user-visible string, tooltip, and numeric
 * threshold used by the Task Bar sub-modes (stroke weight / simplify) and the
 * live Shape Properties popover (polygon / rectangle). No inline strings live
 * in `src/ui/shell/context-bar-modes.js` — it feature-detects these objects and
 * falls back to sane defaults so it tolerates late/absent loading.
 *
 * Numeric readouts render in current document units via `Vectura.UnitUtils`;
 * the *_MM thresholds below are the millimetre model values.
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});

  // ── Shape Properties popover (SHP-1/2/3) ────────────────────────────────────
  Vectura.SHAPE_PROPS_UI = {
    // Side-count slider/stepper bounds. SHP-1 specs a 3–20 slider, but the
    // polygon draft cap (renderer shapeDraftSides / shortcuts.js) is 32 — so we
    // match 32 here to avoid silently clamping a 21–32-gon down to 20 the moment
    // the popover touches the control (avoidable data loss).
    SIDES_MIN: 3,
    SIDES_MAX: 32,
    SIDES_STEP: 1,
    // Corner-radius scrub sensitivity: mm gained per screen pixel of drag.
    CORNER_SCRUB_MM_PER_PX: 0.15,
    CORNER_STEP_MM: 0.5,
    // Popover offset below the anchor rect (px).
    ANCHOR_GAP_PX: 10,
    strings: {
      polygonTitle: 'Polygon',
      rectTitle: 'Rectangle',
      cornerLabel: 'Corner Type & Radius',
      cornerFieldLabel: 'Corner radius',
      cornerDecrease: 'Decrease corner radius',
      cornerIncrease: 'Increase corner radius',
      cornerMixed: 'Mixed',
      sidesLabel: 'Side Count',
      sidesDecrease: 'Fewer sides',
      sidesIncrease: 'More sides',
      close: 'Close',
      closeLabel: 'Close shape properties',
    },
  };

  // ── Task Bar sub-modes (TB-9/10/11) ─────────────────────────────────────────
  Vectura.CONTEXT_BAR_MODES_UI = {
    // Stroke weight bar slider bounds (mm). Falls back to STROKE_STYLE if present.
    STROKE_SLIDER_MIN_MM: 0.05,
    STROKE_SLIDER_MAX_MM: 5,
    STROKE_STEP_MM: 0.05,
    // Simplify strength slider (percentage, PTH-1 t domain).
    SIMPLIFY_MIN: 0,
    SIMPLIFY_MAX: 100,
    SIMPLIFY_STEP: 1,
    strings: {
      back: 'Back',
      done: 'Done',
      overflow: 'More options',
      // Stroke weight sub-mode (TB-10).
      strokeWeightLabel: 'Stroke weight',
      strokeDecrease: 'Decrease stroke weight',
      strokeIncrease: 'Increase stroke weight',
      openStrokeOptions: 'Open Stroke Options',
      // Simplify sub-mode (TB-11).
      simplifyLabel: 'Simplify',
      simplifyMinWave: 'Fewer points',
      simplifyMaxWave: 'More detail',
      autoSmooth: 'Auto-Smooth',
      // Badge template: {pts} and {t} substituted (PTH-1 exposes the counts;
      // the video shows % only — the pts prefix is a Vectura addition).
      simplifyBadge: '{pts} pts · {t} %',
    },
  };
})();
