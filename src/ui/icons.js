/**
 * Centralized UI icon registry.
 *
 * Three families:
 *   Vectura.Icons.layer  — 12x12, returns full <svg> element string
 *   Vectura.Icons.tool   — 24x24, returns inner-path fragment (wrapped by ui-petal-designer renderIcon)
 *   Vectura.Icons.misc   — varied sizes, returns full <svg> element string
 */
(() => {
  const root = (window.Vectura = window.Vectura || {});

  const LAYER_STROKE = `stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"`;
  const layerSvg = (paths, size = 12) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 12 12" fill="none" stroke="currentColor" ${LAYER_STROKE}>${paths}</svg>`;

  const layer = {
    eye:      () => layerSvg(`<ellipse cx="6" cy="6" rx="5" ry="3.5"/><circle cx="6" cy="6" r="1.5" fill="currentColor" stroke="none"/>`),
    eyeOff:   () => layerSvg(`<path d="M1 1.5l10 9M3.5 3C2.2 3.9 1 6 1 6s2.2 3.5 5 3.5c.9 0 1.7-.2 2.4-.6"/><path d="M9 8.8C10 7.9 11 6 11 6S8.8 2.5 6 2.5c-.4 0-.7 0-1.1.1"/>`),
    lock:     () => layerSvg(`<rect x="2.5" y="5.5" width="7" height="5" rx="1"/><path d="M4 5.5V4a2 2 0 1 1 4 0v1.5"/><line x1="6" y1="7.5" x2="6" y2="8.5"/>`),
    lockOpen: () => layerSvg(`<rect x="2.5" y="5.5" width="7" height="5" rx="1"/><path d="M4 5.5V4a2 2 0 1 1 4 0" stroke-dasharray="2 1.5"/>`),
    folder:   () => layerSvg(`<path d="M1 4C1 3 1.7 2.5 2.5 2.5H5l1 1.5h3.5C10.3 4 11 4.7 11 5.5V9c0 .8-.7 1.5-1.5 1.5h-7C1.7 10.5 1 9.8 1 9V4z"/>`),
    layer:    () => layerSvg(`<rect x="1.5" y="3" width="9" height="7.5" rx=".8"/><line x1="3.5" y1="1.5" x2="8.5" y2="1.5"/>`),
    grpPlus:  () => layerSvg(`<path d="M1 4C1 3 1.7 2.5 2.5 2.5H4.5l1 1.5h4C10.3 4 11 4.7 11 5.5V9c0 .8-.7 1.5-1.5 1.5h-7C1.7 10.5 1 9.8 1 9V4z"/><line x1="6" y1="6" x2="6" y2="9"/><line x1="4.5" y1="7.5" x2="7.5" y2="7.5"/>`),
    caret:    () => layerSvg(`<path d="M4.5 3l3 3-3 3"/>`),
    trash:    () => layerSvg(`<path d="M5 5.5v3M7 5.5v3"/><path d="M9.5 3v7a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V3"/><path d="M1.5 3h9"/><path d="M4 3V2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1"/>`),
    dup:      () => layerSvg(`<rect x="4" y="4" width="7" height="7" rx="1"/><path d="M2 8c-.55 0-1-.45-1-1V2c0-.55.45-1 1-1h5c.55 0 1 .45 1 1"/>`),
    expand:   () => layerSvg(`<path d="M2 5c-.55 0-1-.45-1-1V2c0-.55.45-1 1-1h2c.55 0 1 .45 1 1"/><path d="M5 8c-.55 0-1-.45-1-1V5c0-.55.45-1 1-1h2c.55 0 1 .45 1 1"/><rect width="4" height="4" x="7" y="7" rx="1"/>`),
    maskSrc:        () => layerSvg(`<path d="M9 5.5c-.75 0-1.25.25-1.5 1"/><path d="M2 3a1 1 0 0 0-1 1v2a2.5 2.5 0 0 0 2.5 2.5 4 4 0 0 1 2.5 1 4 4 0 0 1 2.5-1 2.5 2.5 0 0 0 2.5-2.5V4a1 1 0 0 0-1-1h-1.5a4 4 0 0 0-2.5 1 4 4 0 0 0-2.5-1z"/><path d="M3 5.5c.75 0 1.25.25 1.5 1"/>`),
    maskSrcActive:  () => layerSvg(`<path fill-rule="evenodd" fill="currentColor" d="M2 3a1 1 0 0 0-1 1v2a2.5 2.5 0 0 0 2.5 2.5 4 4 0 0 1 2.5 1 4 4 0 0 1 2.5-1 2.5 2.5 0 0 0 2.5-2.5V4a1 1 0 0 0-1-1h-1.5a4 4 0 0 0-2.5 1 4 4 0 0 0-2.5-1zM1.1 5a2.2 1.7 0 1 0 4.4 0a2.2 1.7 0 1 0-4.4 0M6.5 5a2.2 1.7 0 1 0 4.4 0a2.2 1.7 0 1 0-4.4 0"/>`),
    maskOutlineShow: () => layerSvg(`<circle cx="3" cy="7.5" r="2"/><circle cx="9" cy="7.5" r="2"/><path d="M7 7.5a1 1 0 0 0-1-1 1 1 0 0 0-1 1"/><path d="M1.25 6.5L2.5 3.5c.35-.65.7-1 1.5-1"/><path d="M10.75 6.5L9.5 3.5c-.35-.65-.75-1-1.5-1"/>`),
    maskOutlineHide: () => layerSvg(`<circle cx="3" cy="7.5" r="2" fill="currentColor"/><circle cx="9" cy="7.5" r="2" fill="currentColor"/><path d="M7 7.5a1 1 0 0 0-1-1 1 1 0 0 0-1 1"/><path d="M1.25 6.5L2.5 3.5c.35-.65.7-1 1.5-1"/><path d="M10.75 6.5L9.5 3.5c-.35-.65-.75-1-1.5-1"/>`),
    ungroup:  () => layerSvg(`<path d="M1 3.5V2h1.5M9.5 2H11v1.5M1 8.5V10h1.5M9.5 10H11V8.5"/><rect x="3.5" y="3.5" width="5" height="5" rx=".5" stroke-dasharray="1.5 1.2"/>`),
    flowfield:    () => layerSvg(`<path d="M1 6.5a1 1 0 0 0 1-1V3.5a1 1 0 0 1 2 0v6.5a1 1 0 0 0 2 0V2a1 1 0 0 1 2 0v6.5a1 1 0 0 0 2 0v-2a1 1 0 0 1 1-1"/>`),
    wavetable:    () => layerSvg(`<path d="M1 2.5q1.25 1 2.5 0t2.5 0 2.5 0 2.5 0"/><path d="M1 6q1.25 1 2.5 0t2.5 0 2.5 0 2.5 0"/><path d="M1 9.5q1.25 1 2.5 0t2.5 0 2.5 0 2.5 0"/>`),
    hyphae:       () => layerSvg(`<path d="M6 11V7M6 7L3.5 4.5M6 7L8.5 4.5M3.5 4.5L2 3M3.5 4.5L4.2 2.5M8.5 4.5L7.2 2.5M8.5 4.5L10 3"/>`),
    topo:         () => layerSvg(`<circle cx="6" cy="6" r="1.5"/><circle cx="6" cy="6" r="3.2"/><circle cx="6" cy="6" r="5"/>`),
    spiral:       () => layerSvg(`<path d="M6 6c0 0 .8 0 .8-.8s-.8-.8-1.5-.5-1.3 1-1.2 2 .8 2.3 2.4 2.3S9 8 9 6.2 7.7 3 5.5 3 2 4.5 2 6.5"/>`),
    rings:        () => layerSvg(`<circle cx="6" cy="6" r="2"/><circle cx="6" cy="6" r="4.5"/>`),
    grid:         () => layerSvg(`<line x1="1" y1="4.5" x2="11" y2="4.5"/><line x1="1" y1="7.5" x2="11" y2="7.5"/><line x1="4" y1="1.5" x2="4" y2="10.5"/><line x1="8" y1="1.5" x2="8" y2="10.5"/>`),
    boids:        () => layerSvg(`<circle cx="8" cy="3.5" r=".5" fill="currentColor" stroke="none"/><path d="M1.7 9H6a4 4 0 0 0 4-4V3.5a2 2 0 0 0-3.64-1.15L1 10"/><path d="M10 3.5l1 .25-1 .25"/><path d="M5 9v1.5"/><path d="M7 8.875V10.5"/><path d="M3.5 9a3 3 0 0 0 1.92-5.305"/>`),
    attractor:    () => layerSvg(`<path d="M3 8c2.5 0 3.5-4 6-4a2 2 0 0 1 0 4c-2.5 0-3.5-4-6-4a2 2 0 1 0 0 4"/>`),
    lissajous:    () => layerSvg(`<path d="M2 6c0-2 1-3 2-3s2 2 4 2 2 1 2 3-1 3-2 3-2-2-4-2-2-1-2-3z"/>`),
    harmonograph: () => layerSvg(`<path d="M9 8.49h-3c-.55 0-.975.47-1.24.95A2 2 0 0 1 1 8.5c.005-.35.1-.7.285-1"/><path d="M3 8.5l1.565-2.89c.265-.485.05-1.09-.25-1.55a2 2 0 1 1 3.445-2.03"/><path d="M6 3l1.565 2.865C7.83 6.35 8.45 6.5 9 6.5a2 2 0 0 1 0 4"/>`),
    rainfall:     () => layerSvg(`<line x1="3" y1="2" x2="2" y2="6"/><line x1="6" y1="1" x2="5" y2="7"/><line x1="9" y1="2" x2="8" y2="8"/><line x1="4" y1="8" x2="3.5" y2="11"/><line x1="8" y1="7" x2="7.5" y2="10"/>`),
    phylla:       () => layerSvg(`<circle cx="4" cy="4" r="1"/><circle cx="8" cy="3" r="1"/><circle cx="9" cy="7" r="1"/><circle cx="5" cy="9" r="1"/><circle cx="2" cy="7" r="1"/>`),
    petalisDesigner: () => layerSvg(`<circle cx="6" cy="6" r="1.5"/><path d="M6 8.25A2.25 2.25 0 1 1 3.75 6 2.25 2.25 0 1 1 6 3.75a2.25 2.25 0 1 1 2.25 2.25 2.25 2.25 0 1 1-2.25 2.25"/><path d="M6 3.75V4.5M3.75 6H4.5M8.25 6H7.5M6 8.25V7.5"/>`),
    shapePack:    () => layerSvg(`<rect x="1.5" y="1.5" width="4" height="4" rx=".5"/><rect x="6.5" y="6.5" width="4" height="4" rx=".5"/><rect x="1.5" y="6.5" width="4" height="4" rx=".5"/>`),
    terrain:      () => layerSvg(`<path d="m4 1.5 2 4 2.5-2.5 2.5 7.5H1L4 1.5z"/>`),
    pattern:      () => layerSvg(`<rect width="3.5" height="4.5" x="1.5" y="1.5" rx=".5"/><rect width="3.5" height="2.5" x="7" y="1.5" rx=".5"/><rect width="3.5" height="4.5" x="7" y="6" rx=".5"/><rect width="3.5" height="2.5" x="1.5" y="8" rx=".5"/>`),
    svgDistort:   () => layerSvg(`<rect x="1.5" y="2" width="9" height="8" rx="1"/><path d="M3 6.5l1.5-2 1.5 2.5 1-1.5 2 2" stroke-width="1.2"/><path d="M3.5 1.5h5" stroke-linecap="round"/>`),
    shape:        () => layerSvg(`<path d="M6 1.5L10 3.75L10 8.25L6 10.5L2 8.25L2 3.75Z"/>`),
    polygon:      () => layerSvg(`<path d="M6 1.5L10.3 4.6L8.6 9.6H3.4L1.7 4.6Z"/>`),
    pen:          () => layerSvg(`<path d="M8.5 1.5L11 4L5 10H1.5V6.5L7.5 1.5ZM8.5 1.5L11 4M2 9.5L3.5 8"/>`),
    svg:          () => layerSvg(`<rect x="1.5" y="2" width="9" height="8" rx="1"/><path d="M3.5 7L4.5 5L6 7.5L7 6L9 8" stroke-width="1.2"/>`),
    oval:         () => layerSvg(`<ellipse cx="6" cy="6" rx="4.5" ry="3"/>`),
    rect:         () => layerSvg(`<rect x="1.5" y="3" width="9" height="6" rx="1"/>`),
  };

  // Tool icons return inner path fragments only — petal-designer's renderIcon()
  // wraps them in <svg viewBox="0 0 24 24"> at render time.
  const tool = {
    select:          () => '<path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
    lasso:           () => '<path d="M7 22a5 5 0 0 1-2-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 16.93c.96.43 1.96.74 2.99.91" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.34 14A6.8 6.8 0 0 1 2 10c0-4.42 4.48-8 10-8s10 3.58 10 8a7.19 7.19 0 0 1-.33 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M14.33 22h-.09a.35.35 0 0 1-.24-.32v-10a.34.34 0 0 1 .33-.34c.08 0 .15.03.21.08l7.34 6a.33.33 0 0 1-.21.59h-4.49l-2.57 3.85a.35.35 0 0 1-.28.14z" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>',
    direct:          () => '<path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    shape:           () => '<rect x="3" y="7" width="9" height="11" rx="1" fill="none" stroke="currentColor" stroke-width="1.6" /><circle cx="16.5" cy="14" r="4.5" fill="none" stroke="currentColor" stroke-width="1.6" />',
    'shape-rect':    () => '<rect x="5" y="6" width="14" height="12" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.8" />',
    'shape-oval':    () => '<ellipse cx="12" cy="12" rx="7.2" ry="5.8" fill="none" stroke="currentColor" stroke-width="1.8" />',
    'shape-line':    () => '<line x1="5" y1="19" x2="19" y2="5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /><circle cx="5" cy="19" r="1.3" fill="currentColor" /><circle cx="19" cy="5" r="1.3" fill="currentColor" />',
    'shape-polygon': () => '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    hand:            () => '<path d="M7 12V6.5c0-.8.6-1.5 1.4-1.5.7 0 1.3.6 1.3 1.4V12m0-5.3V5c0-.8.6-1.4 1.4-1.4s1.4.6 1.4 1.4v6.9m0-5.1V5.3c0-.8.6-1.4 1.4-1.4s1.4.6 1.4 1.4V13m0-3.6V8.5c0-.8.6-1.4 1.4-1.4s1.4.6 1.4 1.4v6.8c0 2.5-1.6 4.7-4 5.5l-2.1.7c-2.5.9-5.3-.4-6.2-2.9L5 12.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />',
    pen:             () => '<path d="M12 2.2L20.2 10.2L14.8 21.8H9.2L3.8 10.2Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" /><circle cx="12" cy="11.6" r="1.7" fill="currentColor" /><path d="M9.5 16.2L12 18.3L14.5 16.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" /><line x1="5" y1="20.5" x2="19" y2="20.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" /><circle cx="5" cy="20.5" r="1.3" fill="currentColor" /><circle cx="19" cy="20.5" r="1.3" fill="currentColor" />',
    'pen-draw':      () => '<path d="M12 2.2L20.2 10.2L14.8 21.8H9.2L3.8 10.2Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" /><circle cx="12" cy="11.6" r="1.6" fill="currentColor" />',
    'pen-add':       () => '<path d="M5 12h14M12 5v14" stroke="currentColor" stroke-width="2" stroke-linecap="round" /><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.4" />',
    'pen-delete':    () => '<path d="M6 12h12" stroke="currentColor" stroke-width="2" stroke-linecap="round" /><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.4" />',
    'pen-anchor':    () => '<circle cx="12" cy="12" r="2" fill="currentColor" /><path d="M3.5 12h5M15.5 12h5M12 3.5v5M12 15.5v5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />',
    fill:            () => '<path d="M16.56 8.94L7.62 0 6.21 1.41l2.38 2.38-5.15 5.15c-.59.57-.59 1.53 0 2.12l5.5 5.5c.29.29.68.44 1.06.44s.77-.15 1.06-.44l5.5-5.5c.59-.58.59-1.53 0-2.12zM5.21 10 10 5.21 14.79 10z" fill="currentColor" /><path d="M19 11.5s-2 2.17-2 3.5c0 1.1.9 2 2 2s2-.9 2-2c0-1.33-2-3.5-2-3.5z" fill="currentColor" />',
    'fill-erase':         () => '<path d="M16.56 8.94L7.62 0 6.21 1.41l2.38 2.38-5.15 5.15c-.59.57-.59 1.53 0 2.12l5.5 5.5c.29.29.68.44 1.06.44s.77-.15 1.06-.44l5.5-5.5c.59-.58.59-1.53 0-2.12zM5.21 10 10 5.21 14.79 10z" fill="currentColor" /><path d="M16.5 16.5l4.5 4.5M21 16.5l-4.5 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />',
    'fill-pattern':       () => '<path d="M16.56 8.94L7.62 0 6.21 1.41l2.38 2.38-5.15 5.15c-.59.57-.59 1.53 0 2.12l5.5 5.5c.29.29.68.44 1.06.44s.77-.15 1.06-.44l5.5-5.5c.59-.58.59-1.53 0-2.12zM5.21 10 10 5.21 14.79 10z" fill="currentColor"/><rect x="15" y="14" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M16.5 16h4M16.5 18h4M16.5 20h4" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>',
    'fill-pattern-erase': () => '<path d="M16.56 8.94L7.62 0 6.21 1.41l2.38 2.38-5.15 5.15c-.59.57-.59 1.53 0 2.12l5.5 5.5c.29.29.68.44 1.06.44s.77-.15 1.06-.44l5.5-5.5c.59-.58.59-1.53 0-2.12zM5.21 10 10 5.21 14.79 10z" fill="currentColor"/><rect x="15" y="14" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M16.5 15.5l4.5 4.5M21 15.5l-4.5 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    scissor:         () => '<path d="M11 16.586V19a1 1 0 0 1-1 1H2L18.37 3.63a1 1 0 1 1 3 3l-9.663 9.663a1 1 0 0 1-1.414 0L8 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    'scissor-line':  () => '<path d="M11 16.586V19a1 1 0 0 1-1 1H2L18.37 3.63a1 1 0 1 1 3 3l-9.663 9.663a1 1 0 0 1-1.414 0L8 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    'scissor-rect':  () => '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><line x1="9.56066" y1="9.56066" x2="12" y2="12"/><line x1="17" y1="17" x2="14.82" y2="14.82"/><circle cx="8.5" cy="15.5" r="1.5"/><line x1="9.56066" y1="14.43934" x2="17" y2="7"/></g>',
    'scissor-circle':() => '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="8.5" cy="8.5" r="1.5"/><line x1="9.56066" y1="9.56066" x2="12" y2="12"/><line x1="17" y1="17" x2="14.82" y2="14.82"/><circle cx="8.5" cy="15.5" r="1.5"/><line x1="9.56066" y1="14.43934" x2="17" y2="7"/></g>',
    'light-source':  () => '<circle cx="12" cy="12" r="4.4" fill="currentColor" /><path d="M12 2V5M12 19V22M2 12H5M19 12H22M4.5 4.5L6.6 6.6M17.4 17.4L19.5 19.5M4.5 19.5L6.6 17.4M17.4 6.6L19.5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />',
    'algo-draw':     () => '<rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="3 3"/><path d="M7 12c.5-2 1-2.5 1.5-1.5s1 2.5 1.5 0 1-2.5 1.5 0 1 2 1.5 1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/>',
  };

  const misc = {
    ring: () => `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.1" aria-hidden="true"><circle cx="6.5" cy="6.5" r="5.5"/><circle cx="6.5" cy="6.5" r="3.4"/><circle cx="6.5" cy="6.5" r="1.4"/></svg>`,
  };

  // Cursor icons: full <svg> elements with absolute colors. Designed to be
  // wrapped into `cursor: url(data:image/svg+xml;utf8,...)` data URLs.
  // Browsers don't propagate page colors into cursor data URLs, so these
  // must use literal hex colors (no currentColor).
  const cursor = {
    filled: () => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z" fill="#000000" stroke="#ffffff" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round"/></svg>`,
    outline: () => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z" fill="#ffffff" stroke="#000000" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`,
    pen: () => `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22"><path d="M2.2 19.8L4.5 18l11-11-2.3-2.3-11 11z" fill="#ffffff" stroke="#000000" stroke-width="1.3" stroke-linejoin="round"/><path d="M13.2 4.7L17 8.5" stroke="#000000" stroke-width="1.3" stroke-linecap="round"/><path d="M2.2 19.8l1.6-.6.7-1.7-1.5-1.5-1.7.7z" fill="#000000"/></svg>`,
    bucket: () => `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><path d="M5 14L13 6L24 16L16 24Z" fill="#ffffff" stroke="#000000" stroke-width="1.5" stroke-linejoin="round"/><path d="M5 14C2.5 11 4 7 7 6.5" fill="none" stroke="#000000" stroke-width="1.3" stroke-linecap="round"/><path d="M21 18L23.5 23.5" stroke="#3b82f6" stroke-width="2.2" stroke-linecap="round"/><circle cx="23.5" cy="23.5" r="2.2" fill="#3b82f6" stroke="#000000" stroke-width="1"/></svg>`,
    // Illustrator-style rotation cursor: a half-circle curve with equilateral
    // triangles at each endpoint. The arc bulges in the direction `angleDeg`
    // (0=east, 90=south in screen coords) which is the direction from the
    // selection's center to the corner under the mouse. The triangles always
    // face cardinal directions (N/S/E/W); which pair depends on the bulge
    // quadrant: NE→W&S, SE→N&W, SW→E&N, NW→S&E. Hotspot is (12, 12) so the
    // SVG center sits at the mouse position.
    // Double-headed resize arrow aligned with `angleDeg` (the direction from
    // the selection center to the corner under the cursor, in screen coords
    // with Y pointing down). Hotspot is (12, 12) so the arrow's midpoint
    // sits at the mouse position. Rotating the SVG keeps the arrow axis
    // visually consistent with the actual diagonal of a rotated bounding box
    // — so the NE corner of a 90°-rotated shape (physically at SE) shows
    // an arrow tilted along the NW↔SE diagonal rather than the static
    // logical-key cursor.
    resize: (angleDeg = 0) => {
      return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g transform="rotate(${angleDeg.toFixed(2)} 12 12)"><line x1="4" y1="12" x2="20" y2="12" stroke="#ffffff" stroke-width="3.6" stroke-linecap="round"/><line x1="4" y1="12" x2="20" y2="12" stroke="#000000" stroke-width="1.8" stroke-linecap="round"/><polygon points="2,12 7,8.5 7,15.5" fill="#000000" stroke="#ffffff" stroke-width="1.4" stroke-linejoin="round"/><polygon points="22,12 17,8.5 17,15.5" fill="#000000" stroke="#ffffff" stroke-width="1.4" stroke-linejoin="round"/></g></svg>`;
    },
    rotate: (angleDeg = -90) => {
      // L-shaped double-arrow rotation cursor. Natural orientation is the NE
      // corner (bend at upper-right, arrows pointing W and S). The icon
      // rotates around its geometric center (168, 136) so the bend always
      // points in direction `angleDeg` from the cursor's center. Hotspot is
      // (12, 12) — the SVG center maps to the path's center, so the mouse
      // sits where the rotation pivot is.
      const path = 'M172.59,210.85c-14.84-14.78,8.38-37.37,22.78-22.59,0,0,20.6,20.61,20.6,20.61.76-135.14,13.76-121.85-121.09-121.09,8.56,10.3,36.76,27.91,20.66,43.23-5.87,5.85-16.06,6.63-22.21.48l-48.92-48.89c-5.76-5.76-5.76-15.87,0-21.63,0,0,48.36-48.44,48.36-48.44,6.31-6.32,16.41-6.19,22.59-.15,16.33,15.24-11.71,33.17-20.46,43.39,149.97-5.02,158.08,3.35,153.05,153.1,10.21-8.68,27.82-36.55,43.16-20.74,6.25,6.12,6.53,16.41.09,22.84l-48.17,48.12c-5.99,5.98-16.19,5.97-22.17,0l-48.28-48.25Z';
      const rot = (angleDeg + 45).toFixed(2);
      return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="38 6 260 260"><g transform="rotate(${rot} 168 136)"><path d="${path}" fill="none" stroke="#ffffff" stroke-width="28" stroke-linejoin="round" stroke-linecap="round"/><path d="${path}" fill="#000000"/></g></svg>`;
    },
  };

  root.Icons = { layer, tool, misc, cursor };
})();
