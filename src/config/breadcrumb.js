/**
 * Vectura Studio — Isolation breadcrumb copy (Illustrator Tools Parity,
 * Phase 2 Lane I: ISO-1 / ISO-2).
 *
 * Single source of truth for every user-visible string used by
 * `src/ui/shell/breadcrumb-bar.js` — the breadcrumb bar shown WHILE group /
 * morph-child isolation is active. Never inline breadcrumb copy in UI code;
 * add or edit entries here.
 *
 * The `rootLabel` is the top-of-trail crumb (Illustrator shows "Layer 1"); in
 * Vectura the top level is the document itself, so clicking it exits isolation
 * entirely. `unnamedGroup` is the fallback when a group layer has no name.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  Vectura.BREADCRUMB = {
    // Top-of-trail crumb (document root). Clicking exits isolation fully.
    rootLabel: 'Document',
    // Fallback label for a group layer with an empty name.
    unnamedGroup: 'Group',
    // Trail separator glyph rendered between crumbs (decorative, aria-hidden).
    separator: '›', // ›
    // Accessible labels.
    ariaNav: 'Isolation breadcrumb',
    ariaBack: 'Exit isolation level',
    // Suffix appended to the active (current) crumb for screen readers.
    ariaCurrentSuffix: 'current isolation level',
  };
})();
