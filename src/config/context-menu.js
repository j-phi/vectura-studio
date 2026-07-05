/**
 * Vectura canvas context-menu vocabulary (CTX-1).
 *
 * All copy + tunables for the right-click canvas menu. The menu lists EXISTING
 * verbs only — no new behavior — each routing to the command the toolbar /
 * shortcut / Task Bar already uses. Disabled items carry a plain-language
 * reason shown as the item tooltip.
 *
 * Self-contained IIFE registering Vectura.CONTEXT_MENU. The menu module
 * feature-detects it and falls back to inline defaults if it is absent.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  Vectura.CONTEXT_MENU = {
    ariaLabel: 'Canvas actions',
    // Default one-shot Smooth strength (PTH-3 smoothSelection needs strength>0;
    // a moderate single-click smooth mirrors the video's Smooth verb).
    smoothStrength: 0.5,
    // Screen gap kept between the menu and the viewport edge.
    edgeGapPx: 8,
    labels: {
      duplicate: 'Duplicate',
      delete: 'Delete',
      undo: 'Undo',
      redo: 'Redo',
      group: 'Group',
      ungroup: 'Ungroup',
      isolate: 'Isolate group',
      exitIsolation: 'Exit isolation',
      simplify: 'Simplify…',
      smooth: 'Smooth',
      flipH: 'Flip Horizontal',
      flipV: 'Flip Vertical',
      // Trailing ▸ marks the "focus the Transform panel" affordance.
      transform: 'Transform ▸',
    },
    reasons: {
      undo: 'Nothing to undo',
      redo: 'Nothing to redo',
      group: 'Select 2 or more layers to group',
      ungroup: 'Select a group to ungroup',
      isolate: 'Select a single group to isolate',
      simplify: 'Select a path or shape to simplify',
      smooth: 'Select a path or shape to smooth',
      flip: 'Select a shape or path to flip',
    },
  };
})();
