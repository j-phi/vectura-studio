/**
 * Vectura Studio — Transform-panel copy & icons (Illustrator Tools Parity,
 * Phase 3 Lane K: SEL-5 / SEL-6 / SG-6).
 *
 * Single source of truth for every user-visible string and inline icon used by
 * the true X/Y/W/H numeric transform, the link-W/H proportional toggle, the
 * Flip Horizontal / Vertical buttons, and the Direct-Selection anchor readout
 * that `src/ui/panels/transform-panel.js` injects into the Transform section.
 * Never inline transform-panel copy in UI code — add or edit entries here.
 *
 * The panel feature-detects `window.Vectura.TRANSFORM_PANEL` and falls back to
 * terse built-in defaults when this file has not loaded, so it tolerates late
 * loading. Load order: with the other `src/config/` scripts, before the UI.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  Vectura.TRANSFORM_PANEL = {
    // Field labels (the unit suffix, e.g. "(mm)"/"(in)", is appended live from
    // the document-units system — never hardcode a unit here).
    labels: {
      x: 'X',
      y: 'Y',
      width: 'W',
      height: 'H',
      anchorX: 'Anchor X',
      anchorY: 'Anchor Y',
    },
    // Tooltips / accessible labels.
    tooltips: {
      x: 'Bounding-box left (X)',
      y: 'Bounding-box top (Y)',
      width: 'Bounding-box width',
      height: 'Bounding-box height',
      linkOn: 'Constrain width & height proportions',
      linkOff: 'Width & height scale independently',
      flipH: 'Flip Horizontal',
      flipV: 'Flip Vertical',
      anchorX: 'Selected anchor X',
      anchorY: 'Selected anchor Y',
    },
    // Inline icons (aria-hidden decorative SVGs). currentColor so they inherit.
    icons: {
      // chain-link (proportions constrained)
      linkOn: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M6.5 9.5a2.5 2.5 0 0 0 3.5 0l2-2a2.5 2.5 0 0 0-3.5-3.5l-1 1"/><path d="M9.5 6.5a2.5 2.5 0 0 0-3.5 0l-2 2a2.5 2.5 0 0 0 3.5 3.5l1-1"/></svg>',
      // broken chain-link (proportions free)
      linkOff: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M6.5 9.5l-1.5 1.5a2.5 2.5 0 0 1-3.5-3.5l2-2"/><path d="M9.5 6.5l1.5-1.5a2.5 2.5 0 0 1 3.5 3.5l-2 2"/><path d="M11 3.5V2M13.5 5H15M2.5 11H1M5 12.5V14"/></svg>',
      // flip horizontal (mirror across a vertical axis)
      flipH: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.5v13"/><path d="M6 4L2.5 8 6 12z"/><path d="M10 4l3.5 4L10 12z"/></svg>',
      // flip vertical (mirror across a horizontal axis)
      flipV: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 8h13"/><path d="M4 6L8 2.5 12 6z"/><path d="M4 10l4 3.5 4-3.5z"/></svg>',
    },
    // Axis strings passed to renderer.flipSelection() (SEL-3 wrapper).
    flipAxis: { horizontal: 'horizontal', vertical: 'vertical' },
  };
})();
