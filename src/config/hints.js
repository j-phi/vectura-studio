/**
 * Vectura Studio — HUD copy & timings (Illustrator Tools Parity, Phase 1
 * Lane F: HUD-1…4).
 *
 * Single source of truth for every user-visible HUD string and threshold:
 * per-tool hint lines (bolded keyword + text segments), tool display names,
 * toast copy, toast auto-dismiss timing, the drag distance beyond which the
 * hint text clears, and the zoom-percent baseline. Consumed by
 * `src/ui/shell/hint-bar.js`. Never inline HUD copy in UI code — add or edit
 * entries here.
 *
 * Hint entries are keyed by the renderer tool id, except pen and scissor,
 * which are mode-aware: the hint bar resolves `pen` → `pen-<penMode>` and
 * `scissor` → `scissor-<scissorMode>` so subtool switches re-hint.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const seg = (key, text) => ({ key, text });
  // Shape tools share the "Drag to draw a {shape} | Shift+Drag to draw a
  // {constrained}" template (HUD-1).
  const shapeHint = (shape, constrained) => [
    seg('Drag', `to draw a ${shape}`),
    seg('Shift+Drag', `to draw a ${constrained}`),
  ];

  Vectura.HINTS = {
    // HUD-3: toast auto-dismiss.
    toast: { durationMs: 2000 },
    // HUD-1: canvas drag distance (CSS px) beyond which the hint text clears.
    dragClearThresholdPx: 4,
    // HUD-2: zoom baseline — 100% renders the document at CSS-physical size
    // (96 CSS px per inch → 96 / 25.4 px per mm; renderer.scale is px/mm).
    pxPerMm: 96 / 25.4,
    toasts: {
      shapeExpanded: 'Shape Expanded',
    },
    tools: {
      select: {
        name: 'Selection',
        hint: [
          seg('Click', 'the object to select'),
          seg('Shift+Click', 'to select multiple objects'),
          seg('Option+Drag', 'the object to duplicate'),
        ],
      },
      direct: {
        name: 'Direct Selection',
        hint: [
          seg('Select', 'the path or anchor point of an object'),
          seg('Shift+Click', 'to select multiple anchor points or paths'),
        ],
      },
      lasso: {
        name: 'Lasso',
        hint: [
          seg('Drag', 'around anchor points to select them'),
        ],
      },
      type: {
        name: 'Type',
        hint: [
          seg('Click or drag', 'to create a text box'),
          seg('Type', 'the text'),
          seg('Select', 'the text and edit it in the Text panel'),
        ],
      },
      'shape-rect': { name: 'Rectangle', hint: shapeHint('rectangle', 'square') },
      'shape-oval': { name: 'Oval', hint: shapeHint('oval', 'circle') },
      'shape-line': { name: 'Line', hint: shapeHint('line', '45° line') },
      'shape-polygon': { name: 'Polygon', hint: shapeHint('polygon', 'polygon with aligned edges') },
      'algo-draw': {
        name: 'Algorithm Draw',
        hint: [
          seg('Drag', 'to draw the selected algorithm onto the canvas'),
          seg('Hold', 'the toolbar button to pick a different algorithm'),
        ],
      },
      hand: {
        name: 'Hand',
        hint: [
          seg('Drag', 'to pan the canvas'),
        ],
      },
      'pen-draw': {
        name: 'Pen',
        hint: [
          seg('Click', 'to place anchor points'),
          seg('Drag', 'to pull out curve handles'),
          seg('Click', 'the first anchor to close the path'),
        ],
      },
      'pen-add': {
        name: 'Add Anchor Point',
        hint: [
          seg('Click', 'a path to add an anchor point'),
        ],
      },
      'pen-delete': {
        name: 'Delete Anchor Point',
        hint: [
          seg('Click', 'an anchor point to delete it'),
        ],
      },
      'pen-anchor': {
        name: 'Anchor Point',
        hint: [
          seg('Click', 'an anchor to toggle corner and smooth'),
          seg('Drag', 'an anchor to pull out handles'),
        ],
      },
      'scissor-line': {
        name: 'Scissor',
        hint: [
          seg('Drag', 'across paths to cut them'),
          seg('Shift+Drag', 'to constrain the cut line angle'),
        ],
      },
      'scissor-rect': {
        name: 'Scissor (Rectangle)',
        hint: [
          seg('Drag', 'a rectangle to cut the paths inside it'),
        ],
      },
      'scissor-circle': {
        name: 'Scissor (Circle)',
        hint: [
          seg('Drag', 'a circle to cut the paths inside it'),
        ],
      },
      fill: {
        name: 'Fill',
        hint: [
          seg('Click', 'inside a closed region to fill it'),
          seg('Cmd+Click', 'to cycle overlapping regions'),
        ],
      },
      'fill-erase': {
        name: 'Erase Fill',
        hint: [
          seg('Click', 'a filled region to erase its fill'),
        ],
      },
      'fill-pattern': {
        name: 'Pattern Fill',
        hint: [
          seg('Click', 'inside a closed region to apply the pattern'),
        ],
      },
      'fill-pattern-erase': {
        name: 'Erase Pattern Fill',
        hint: [
          seg('Click', 'a patterned region to erase its pattern'),
        ],
      },
      'light-source': {
        name: 'Light Source',
        hint: [
          seg('Click', 'the canvas to place the light source'),
        ],
      },
    },
  };
})();
