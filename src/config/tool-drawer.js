/**
 * Vectura Studio — All Tools drawer catalog & categories (Illustrator Tools
 * Parity, Phase 3 Lane L: TLD-1/2).
 *
 * Single source of truth for the drawer's *structure*: the ordered category
 * grouping (Select / Draw / Shapes / Type / Modify / Navigate), which tool IDs
 * live in each category, and how each entry activates.
 *
 * DELIBERATELY NOT duplicated here: tool display names and keyboard shortcuts.
 * Those come from the rail's own registry — `UI.getSharedToolbarDefinitions()`
 * (src/ui/ui-petal-designer.js), whose `label` strings already carry the
 * shortcut in parentheses (e.g. "Selection (V)", "Rectangle (M)") and are kept
 * in sync with the keydown handler in `src/ui/shortcuts.js`. The drawer reads
 * those labels verbatim for its tooltips, so there is exactly one place the
 * name+shortcut text is authored. See `src/ui/shell/tool-drawer.js`.
 *
 * Each tool `id` maps 1:1 to a `getSharedToolbarDefinitions()` key. `activate`
 * describes how to select the tool through the *existing* UI methods
 * (`setActiveTool` / `setPenMode` / `setScissorMode` / `startLightSourcePlacement`),
 * matching the rail flyout semantics so the rail slot updates identically.
 *
 * The grid/list view toggle is a deliberate Vectura addition (not video-
 * evidenced); grid is the default and the choice persists in
 * `SETTINGS.toolDrawerView` (self-contained storage mirror below, folded into
 * the App preference snapshot by the integrator — see tool-drawer.js).
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  // Minimal chrome-icon factory (20×20 viewBox), matching the context bar family.
  const svg = (inner) =>
    `<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" ` +
    `stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

  Vectura.TOOL_DRAWER = {
    title: 'All Tools',

    // The rail overflow / "…" affordance that opens the drawer.
    overflow: {
      tooltip: 'All Tools',
      ariaLabel: 'Open the All Tools drawer',
      icon: svg('<circle cx="4.5" cy="10" r="1"/><circle cx="10" cy="10" r="1"/><circle cx="15.5" cy="10" r="1"/>'),
    },

    // Grid/list view toggle (persisted in SETTINGS; grid default).
    view: {
      default: 'grid',
      // Self-contained persistence mirror (localStorage + cookie); also mirrored
      // onto SETTINGS.toolDrawerView per SPEC. Integrator folds the key into the
      // App preference snapshot for cross-reload durability.
      storageKey: 'vectura-tool-drawer',
      grid: {
        label: 'Grid view',
        icon: svg('<rect x="3" y="3" width="5.5" height="5.5" rx="1"/><rect x="11.5" y="3" width="5.5" height="5.5" rx="1"/><rect x="3" y="11.5" width="5.5" height="5.5" rx="1"/><rect x="11.5" y="11.5" width="5.5" height="5.5" rx="1"/>'),
      },
      list: {
        label: 'List view',
        icon: svg('<path d="M7 5h10M7 10h10M7 15h10"/><circle cx="4" cy="5" r="0.9"/><circle cx="4" cy="10" r="0.9"/><circle cx="4" cy="15" r="0.9"/>'),
      },
    },

    // ARIA / help copy.
    aria: {
      drawerLabel: 'All Tools',
      viewToggleLabel: 'Drawer view',
    },

    // Ordered categories → tool IDs. Each `id` is a getSharedToolbarDefinitions
    // key (label + icon source). `activate` routes through existing UI methods.
    // Every registered, selectable tool/sub-tool appears exactly once across all
    // categories (the bare `shape`/`pen`/`scissor` rail-slot placeholder buttons
    // are represented by their sub-tool variants, not listed themselves).
    categories: [
      {
        id: 'select',
        label: 'Select',
        tools: [
          { id: 'select', activate: { tool: 'select' } },
          { id: 'direct', activate: { tool: 'direct' } },
          { id: 'lasso', activate: { tool: 'lasso' } },
        ],
      },
      {
        id: 'draw',
        label: 'Draw',
        tools: [
          { id: 'pen-draw', activate: { tool: 'pen', penMode: 'draw' } },
          { id: 'pen-add', activate: { tool: 'pen', penMode: 'add' } },
          { id: 'pen-delete', activate: { tool: 'pen', penMode: 'delete' } },
          { id: 'pen-anchor', activate: { tool: 'pen', penMode: 'anchor' } },
          { id: 'algo-draw', activate: { tool: 'algo-draw' } },
        ],
      },
      {
        id: 'shapes',
        label: 'Shapes',
        tools: [
          { id: 'shape-rect', activate: { tool: 'shape-rect' } },
          { id: 'shape-oval', activate: { tool: 'shape-oval' } },
          { id: 'shape-line', activate: { tool: 'shape-line' } },
          { id: 'shape-polygon', activate: { tool: 'shape-polygon' } },
        ],
      },
      {
        id: 'type',
        label: 'Type',
        tools: [
          { id: 'type', activate: { tool: 'type' } },
        ],
      },
      {
        id: 'modify',
        label: 'Modify',
        tools: [
          { id: 'fill', activate: { tool: 'fill' } },
          { id: 'fill-erase', activate: { tool: 'fill-erase' } },
          { id: 'fill-pattern', activate: { tool: 'fill-pattern' } },
          { id: 'fill-pattern-erase', activate: { tool: 'fill-pattern-erase' } },
          { id: 'scissor-line', activate: { tool: 'scissor', scissorMode: 'line' } },
          { id: 'scissor-rect', activate: { tool: 'scissor', scissorMode: 'rect' } },
          { id: 'scissor-circle', activate: { tool: 'scissor', scissorMode: 'circle' } },
          { id: 'light-source', activate: { custom: 'light-source' } },
        ],
      },
      {
        id: 'navigate',
        label: 'Navigate',
        tools: [
          { id: 'hand', activate: { tool: 'hand' } },
        ],
      },
    ],
  };
})();
