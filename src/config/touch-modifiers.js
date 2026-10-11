/**
 * TUX-045: touch modifier tasks. The bar offers four tasks, not keyboard keys.
 * Each task is a one-shot latch (single tap) or a lock (second tap within lockMs).
 * Reader to task table: additive selection -> multiSelect; shift constraints -> constrain;
 * alt duplicate / erase-alternate / from-center -> duplicate; pan -> pan.
 * Dropped on touch (alternative named in Help): snap-off (View snap toggle), meta from-center
 * (Duplicate), meta square marquee, meta no-snap-close, meta pen-select override (Select tool).
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});
  const svg = (body) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  Vectura.TOUCH_MODIFIERS = {
    // A second tap within this many ms of latching locks the task.
    lockMs: 300,
    // Pointer-down inside one of these starts a consuming gesture (touch and pen only).
    consumeSurfaces: ['#main-canvas', '#layer-list', '#petal-designer-window canvas', '.petal-designer-inline canvas', '#pattern-designer-window canvas', '.pattern-designer-inline canvas'],
    tasks: [
      {
        id: 'multiSelect',
        name: 'Multi-select',
        shortLabel: 'Multi',
        description: 'Add to or remove from the selection. Tap once for the next tap, twice to keep it on.',
        icon: svg('<rect x="3.5" y="3.5" width="9" height="9" rx="1.5"/><rect x="11.5" y="11.5" width="9" height="9" rx="1.5"/>'),
      },
      {
        id: 'constrain',
        name: 'Constrain',
        shortLabel: 'Axis',
        description: 'Lock a drag to an axis or keep a shape square. Tap once for the next gesture, twice to keep it on.',
        icon: svg('<path d="M3 12h18M12 3v18"/><path d="M6 9l-3 3 3 3M18 9l3 3-3 3"/>'),
      },
      {
        id: 'duplicate',
        name: 'Duplicate',
        shortLabel: 'Copy',
        description: 'Drag a copy, draw from the center, or erase with the fill tool. Tap once for the next gesture, twice to keep it on.',
        icon: svg('<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h3.5"/>'),
      },
      {
        id: 'pan',
        name: 'Pan',
        shortLabel: 'Pan',
        description: 'Drag one finger to move the canvas. Tap once for the next gesture, twice to keep it on.',
        icon: svg('<path d="M12 3v18M3 12h18"/><path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>'),
      },
    ],
  };
})();
