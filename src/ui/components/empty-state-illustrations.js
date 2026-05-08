/*
 * Vectura Studio — Empty-state illustrations (Phase 4).
 *
 * Composes the Phase 1 `UI.overlays.EmptyState` primitive with four canned
 * monochrome (`--ui-muted`) SVG illustrations:
 *   - layers   — "no layers yet"
 *   - canvas   — "empty canvas"
 *   - palette  — "empty palette"
 *   - patterns — "empty pattern catalog"
 *
 * Exposes:
 *   window.Vectura.UI.EmptyStates = {
 *     ICONS: { layers, canvas, palette, patterns },
 *     attach(host, { kind, title, message, cta }) -> { el, update, destroy }
 *   }
 *
 * Re-skinning helper only: it does not own where empty states render — the
 * panels that compose it decide based on their own state.
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});

  // Each illustration is a 64x64 inline SVG using `currentColor` so the
  // EmptyState primitive's `--ui-muted` color cascades naturally.
  const ICONS = {
    layers: `
<svg viewBox="0 0 64 64" width="56" height="56" fill="none" stroke="currentColor"
     stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <rect x="10" y="36" width="44" height="14" rx="2" opacity="0.45"/>
  <rect x="10" y="22" width="44" height="14" rx="2" opacity="0.7"/>
  <rect x="10" y="8"  width="44" height="14" rx="2"/>
  <line x1="18" y1="15" x2="46" y2="15" opacity="0.4"/>
  <line x1="18" y1="29" x2="46" y2="29" opacity="0.3"/>
</svg>`.trim(),

    canvas: `
<svg viewBox="0 0 64 64" width="56" height="56" fill="none" stroke="currentColor"
     stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <rect x="8" y="8" width="48" height="48" rx="3"/>
  <line x1="8"  y1="20" x2="56" y2="20" opacity="0.25"/>
  <line x1="8"  y1="44" x2="56" y2="44" opacity="0.25"/>
  <line x1="20" y1="8"  x2="20" y2="56" opacity="0.25"/>
  <line x1="44" y1="8"  x2="44" y2="56" opacity="0.25"/>
  <circle cx="32" cy="32" r="6" opacity="0.7"/>
  <circle cx="32" cy="32" r="2" fill="currentColor" stroke="none"/>
</svg>`.trim(),

    palette: `
<svg viewBox="0 0 64 64" width="56" height="56" fill="none" stroke="currentColor"
     stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M32 8c-13 0-24 10-24 22 0 7 5 12 12 12h4c2 0 4 1 4 4 0 5 3 10 9 10 11 0 19-9 19-22 0-15-12-26-24-26Z"/>
  <circle cx="22" cy="22" r="2.6" fill="currentColor" stroke="none" opacity="0.85"/>
  <circle cx="34" cy="18" r="2.6" fill="currentColor" stroke="none" opacity="0.65"/>
  <circle cx="44" cy="26" r="2.6" fill="currentColor" stroke="none" opacity="0.5"/>
  <circle cx="46" cy="38" r="2.6" fill="currentColor" stroke="none" opacity="0.35"/>
</svg>`.trim(),

    patterns: `
<svg viewBox="0 0 64 64" width="56" height="56" fill="none" stroke="currentColor"
     stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <rect x="8" y="8" width="48" height="48" rx="3"/>
  <path d="M8 20 L20 8"  opacity="0.4"/>
  <path d="M8 32 L32 8"  opacity="0.55"/>
  <path d="M8 44 L44 8"  opacity="0.7"/>
  <path d="M8 56 L56 8"  opacity="0.85"/>
  <path d="M20 56 L56 20" opacity="0.7"/>
  <path d="M32 56 L56 32" opacity="0.55"/>
  <path d="M44 56 L56 44" opacity="0.4"/>
</svg>`.trim(),
  };

  /**
   * Attach an empty-state illustration to a host element.
   * @param {HTMLElement|null} host - container to append to (null = detached).
   * @param {object} opts
   * @param {'layers'|'canvas'|'palette'|'patterns'|null} opts.kind
   * @param {string} [opts.title]
   * @param {string} [opts.message]
   * @param {{label:string, onClick:Function}} [opts.cta]
   * @param {string} [opts.illustration] - raw SVG override, takes precedence over `kind`.
   * @returns {{el:HTMLElement, update:Function, destroy:Function}|null}
   */
  function attach(host, opts = {}) {
    const factory = UI.overlays && UI.overlays.EmptyState;
    if (typeof factory !== 'function') return null;
    const illustration = opts.illustration || (opts.kind ? ICONS[opts.kind] : '') || '';
    return factory(host, {
      illustration,
      title: opts.title || '',
      message: opts.message || '',
      cta: opts.cta || null,
    });
  }

  UI.EmptyStates = { ICONS, attach };
})();
