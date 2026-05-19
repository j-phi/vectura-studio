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
    topo:         () => `<svg width="12" height="12" viewBox="54 26 224 224" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M246.59,26.52l-162.3-.16-.27.03c-16.88,1.84-29.06,14.75-29.62,31.38l.04,160.23c0,17.22,14,31.79,30.57,31.81l162.1.24.21-.02c16.97-1.42,30.26-15.28,30.26-31.56l.02-160.08c0-17.27-14.2-31.87-31.01-31.88ZM245.1,43.17c4.25,0,8.22,1.59,11.16,4.48,2.94,2.88,4.56,6.78,4.56,10.96v34.07c-5.67-6.49-11.64-12.95-18.29-19.04-14.84-13.61-30.37-23.59-47.27-30.39l49.83-.09ZM103.05,215.27c-3.44-2.45-4.84-6.58-3.67-10.77,2.83-10.11,13.82-18.03,25.03-18.03,2,0,3.94.25,5.78.75,2.01.55,6.81,2.35,7.98,7.3,1.34,5.64-1.62,10.32-3.5,12.61-5.37,6.53-14.29,10.92-22.19,10.92-3.67,0-6.84-.94-9.43-2.78ZM124.26,233.24c12.21-3.36,22.89-12.04,28.32-23.67,3.39-7.26,3.64-15.23.71-22.42-2.87-7.04-8.44-12.43-15.69-15.17-3.99-1.51-8.28-2.27-12.77-2.27-20.95,0-40.78,16.27-42.44,34.82-.98,10.98,3.96,20.62,13.23,25.78,2.21,1.23,4.54,2.2,6.96,2.92h-15.67c-8.79,0-15.67-6.78-15.68-15.42l-.03-36.59c20.02-12.43,41.44-23.9,63.08-25.87.96-.07,1.94-.11,2.91-.11,10.38,0,19.22,4.07,23.66,10.88,3.7,5.68,4.46,16.42,5.07,25.04l.14,1.93c.97,13.27,1.97,26.92,6.83,40.15h-48.62ZM191.18,233.24c-6.16-11.88-7.19-25.72-8.19-39.14-.64-8.55-1.29-17.39-3.27-25.66-2.26-9.47-7.68-17.08-16.11-22.61-7.43-4.87-16.27-7.34-26.27-7.34-10.5,0-22.46,2.69-36.66,8.26-9.77,4.06-19.29,8.82-29.46,14.76l-.03-21.63c13.65-1.6,28.02-4.69,44.74-9.62,1.79-.5,3.61-1.03,5.46-1.57,10.86-3.16,22.08-6.42,32.46-6.42,2.74,0,5.33.24,7.69.71,13.26,2.65,24.71,11.21,31.42,23.47,3.27,5.98,5.61,11.33,7.34,16.85l6.8,21.59c2.91,9.5,5.67,17.64,8.7,25.73,3.25,8.2,6.64,15.55,10.46,22.61h-35.09ZM256.32,228.71c-2.84,2.87-6.65,4.47-10.75,4.5-11.61-18.65-18.03-38.34-24.09-58.55-8.14-27.16-15.84-52.82-46.66-65.25-6.46-2.61-13.3-3.87-20.9-3.87-11.16,0-22.43,2.83-32.96,5.89-16.07,4.72-32.63,9.58-49.76,11.59v-26.32c3.78.29,7.62.44,11.49.44,13.35,0,27.73-1.72,45.28-5.41,9.83-2.11,20.31-4.07,30.43-4.07,12.4,0,23.37,2.91,35.6,9.42,18.84,10.04,33.59,24.66,43.85,43.46,11.89,21.78,17.2,45.63,22.34,68.69.58,2.61.65,5.01.69,7.89.05,4.45-1.56,8.57-4.56,11.6ZM260.83,149.78c-3.2-8.43-7.5-16.8-13.28-25.9-12.63-19.9-32.11-36.26-54.87-46.06-11.13-4.79-21.83-7.02-33.69-7.02-10.56,0-21.14,1.78-33.79,4.45-16.73,3.53-29.81,5.11-42.4,5.11-3.91,0-7.78-.16-11.58-.49l.11-22.59c.04-8.41,8.09-14.11,15.51-14.14l27.86.22c12.05.82,24.67,2.58,40.9,5.69,49.68,9.51,76.42,32.9,105.27,70.05l-.06,30.69Z"/></svg>`,
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

  // Align panel icons: 24×24 Lucide-sourced SVG. Each entry returns the inner
  // path fragment so the panel can wrap once with consistent stroke/size.
  const ALIGN_STROKE = `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
  const alignSvg = (paths, size = 18) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" ${ALIGN_STROKE} aria-hidden="true">${paths}</svg>`;

  const align = {
    // Align L/C/R (vertical baseline on start/center/end)
    alignLeft:    () => alignSvg(`<path d="M3 3v18"/><rect width="11" height="4" x="6" y="5" rx="1"/><rect width="7" height="4" x="6" y="15" rx="1"/>`),
    alignCenterH: () => alignSvg(`<path d="M12 3v18"/><rect width="11" height="4" x="6.5" y="5" rx="1"/><rect width="7" height="4" x="8.5" y="15" rx="1"/>`),
    alignRight:   () => alignSvg(`<path d="M21 3v18"/><rect width="11" height="4" x="7" y="5" rx="1" transform="rotate(180 12.5 7)"/><rect width="7" height="4" x="11" y="15" rx="1" transform="rotate(180 14.5 17)"/>`),
    // Align T/M/B (horizontal baseline on start/center/end)
    alignTop:     () => alignSvg(`<path d="M3 3h18"/><rect width="4" height="11" x="5" y="6" rx="1"/><rect width="4" height="7" x="15" y="6" rx="1"/>`),
    alignCenterV: () => alignSvg(`<path d="M3 12h18"/><rect width="4" height="11" x="5" y="6.5" rx="1"/><rect width="4" height="7" x="15" y="8.5" rx="1"/>`),
    alignBottom:  () => alignSvg(`<path d="M3 21h18"/><rect width="4" height="11" x="5" y="7" rx="1" transform="rotate(180 7 12.5)"/><rect width="4" height="7" x="15" y="11" rx="1" transform="rotate(180 17 14.5)"/>`),
    // Distribute by edge (V top/bottom, H left/right) and by center
    distributeTop:     () => alignSvg(`<rect width="14" height="6" x="5" y="14" rx="2"/><rect width="10" height="6" x="7" y="4" rx="2"/><path d="M2 14h20"/><path d="M2 4h20"/>`),
    distributeCenterV: () => alignSvg(`<rect width="14" height="6" x="5" y="14" rx="2"/><rect width="10" height="6" x="7" y="4" rx="2"/><path d="M22 7h-5"/><path d="M7 7H1"/><path d="M22 17h-3"/><path d="M5 17H2"/>`),
    distributeBottom:  () => alignSvg(`<rect width="14" height="6" x="5" y="4" rx="2"/><rect width="10" height="6" x="7" y="14" rx="2"/><path d="M2 20h20"/><path d="M2 10h20"/>`),
    distributeLeft:    () => alignSvg(`<rect width="6" height="14" x="4" y="5" rx="2"/><rect width="6" height="10" x="14" y="7" rx="2"/><path d="M4 2v20"/><path d="M14 2v20"/>`),
    distributeCenterH: () => alignSvg(`<rect width="6" height="14" x="4" y="5" rx="2"/><rect width="6" height="10" x="14" y="7" rx="2"/><path d="M17 22v-5"/><path d="M17 7V2"/><path d="M7 22v-3"/><path d="M7 5V2"/>`),
    distributeRight:   () => alignSvg(`<rect width="6" height="14" x="14" y="5" rx="2"/><rect width="6" height="10" x="4" y="7" rx="2"/><path d="M10 2v20"/><path d="M20 2v20"/>`),
    // Distribute spacing (equal gaps)
    distributeSpacingV: () => alignSvg(`<rect width="14" height="6" x="5" y="15" rx="2"/><rect width="14" height="6" x="5" y="3" rx="2"/><path d="M3 10h18"/><path d="M3 14h18"/>`),
    distributeSpacingH: () => alignSvg(`<rect width="6" height="14" x="15" y="5" rx="2"/><rect width="6" height="14" x="3" y="5" rx="2"/><path d="M10 3v18"/><path d="M14 3v18"/>`),
    // Align To: targets
    targetArtboard: () => alignSvg(`<rect width="16" height="20" x="4" y="2" rx="1"/><path d="M4 7h16M4 17h16"/>`),
    targetSelection: () => alignSvg(`<rect width="18" height="18" x="3" y="3" rx="1" stroke-dasharray="3 2"/>`),
    targetKey:       () => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="1"/><rect width="4" height="4" x="3" y="3" fill="currentColor" stroke="none"/></svg>`,
  };

  // Cursor icons: full <svg> elements with absolute colors. Designed to be
  // wrapped into `cursor: url(data:image/svg+xml;utf8,...)` data URLs.
  // Browsers don't propagate page colors into cursor data URLs, so these
  // must use literal hex colors (no currentColor).
  const cursor = {
    filled: () => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z" fill="#000000" stroke="#ffffff" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round"/></svg>`,
    outline: () => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z" fill="#ffffff" stroke="#000000" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`,
    pen: () => `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22"><path d="M2.2 19.8L4.5 18l11-11-2.3-2.3-11 11z" fill="#ffffff" stroke="#000000" stroke-width="1.3" stroke-linejoin="round"/><path d="M13.2 4.7L17 8.5" stroke="#000000" stroke-width="1.3" stroke-linecap="round"/><path d="M2.2 19.8l1.6-.6.7-1.7-1.5-1.5-1.7.7z" fill="#000000"/></svg>`,
    // Lucide paint-bucket. Rendered as a white halo beneath a black stroke so
    // it stays visible on any canvas color. Hotspot at (20, 22) — the bottom
    // tip of the droplet falling from the bucket, so the click point matches
    // where paint visibly lands.
    bucket: () => {
      const paths = `<path d="M11 7 6 2"/><path d="M18.992 12H2.041"/><path d="M21.145 18.38A3.34 3.34 0 0 1 20 16.5a3.3 3.3 0 0 1-1.145 1.88c-.575.46-.855 1.02-.855 1.595A2 2 0 0 0 20 22a2 2 0 0 0 2-2.025c0-.58-.285-1.13-.855-1.595"/><path d="m8.5 4.5 2.148-2.148a1.205 1.205 0 0 1 1.704 0l7.296 7.296a1.205 1.205 0 0 1 0 1.704l-7.592 7.592a3.615 3.615 0 0 1-5.112 0l-3.888-3.888a3.615 3.615 0 0 1 0-5.112L5.67 7.33"/>`;
      return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g fill="none" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">${paths}</g><g fill="none" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>`;
    },
    // Lucide microscope. Shown while the user holds CMD over the paint
    // bucket — signals "pick up the pattern under the cursor". Hotspot at
    // (10, 14) — the slide line directly under the objective lens.
    microscope: () => {
      const paths = `<path d="M6 18h8"/><path d="M3 22h18"/><path d="M14 22a7 7 0 1 0 0-14h-1"/><path d="M9 14h2"/><path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z"/><path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3"/>`;
      return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g fill="none" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">${paths}</g><g fill="none" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>`;
    },
    // Lucide copy-plus. Shown in Select mode while the user holds Alt —
    // signals "drag to duplicate this layer". Hotspot at (4, 4) so it
    // aligns with the regular select arrow's tip.
    copyPlus: () => {
      const paths = `<line x1="15" x2="15" y1="12" y2="18"/><line x1="12" x2="18" y1="15" y2="15"/><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>`;
      return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g fill="none" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">${paths}</g><g fill="none" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>`;
    },
    // Illustrator-style rotation cursor: a half-circle curve with equilateral
    // triangles at each endpoint. The arc bulges in the direction `angleDeg`
    // (0=east, 90=south in screen coords) which is the direction from the
    // selection's center to the corner under the mouse. The triangles always
    // face cardinal directions (N/S/E/W); which pair depends on the bulge
    // quadrant: NE→W&S, SE→N&W, SW→E&N, NW→S&E. Hotspot is (12, 12) so the
    // SVG center sits at the mouse position.
    // Diagonal resize cursor (lucide move-diagonal) aligned with `angleDeg`
    // (the direction from the selection center to the corner under the
    // cursor, in screen coords with Y pointing down). Hotspot is (12, 12) so
    // the shape's midpoint sits at the mouse position. The icon's natural
    // orientation is NE↔SW (i.e., already at -45°), so we apply a +45° offset
    // before rotating; rotating by 90° from natural visually mirrors it to
    // NW↔SE, covering both diagonals without a separate flipped variant.
    resize: (angleDeg = 0) => {
      const rot = (angleDeg + 45).toFixed(2);
      const paths = `<path d="M11 19H5v-6"/><path d="M13 5h6v6"/><path d="M19 5 5 19"/>`;
      return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g transform="rotate(${rot} 12 12)"><g fill="none" stroke="#ffffff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round">${paths}</g><g fill="none" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</g></g></svg>`;
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

  // Pathfinder panel icons: 24×24 viewBox, two overlapping rounded squares.
  // Back square at (5,5) 9×9, front square at (10,10) 9×9, overlap 4×4.
  // Filled regions (currentColor @ 0.45 opacity) = parts of the result that
  // survive the operation; stroke-only = consumed/discarded regions.
  const PF_STROKE = `fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"`;
  const pfSvg = (paths, size = 18) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" ${PF_STROKE} aria-hidden="true">${paths}</svg>`;

  const PF_UNION =
    'M6.5 5 H12.5 A1.5 1.5 0 0 1 14 6.5 V10 H17.5 A1.5 1.5 0 0 1 19 11.5 V17.5 A1.5 1.5 0 0 1 17.5 19 H11.5 A1.5 1.5 0 0 1 10 17.5 V14 H6.5 A1.5 1.5 0 0 1 5 12.5 V6.5 A1.5 1.5 0 0 1 6.5 5 Z';
  const PF_BACK_MINUS_OVERLAP =
    'M6.5 5 H12.5 A1.5 1.5 0 0 1 14 6.5 V10 H10 V14 H6.5 A1.5 1.5 0 0 1 5 12.5 V6.5 A1.5 1.5 0 0 1 6.5 5 Z';
  const PF_FRONT_MINUS_OVERLAP =
    'M14 10 H17.5 A1.5 1.5 0 0 1 19 11.5 V17.5 A1.5 1.5 0 0 1 17.5 19 H11.5 A1.5 1.5 0 0 1 10 17.5 V14 H14 Z';
  const PF_BACK_RECT  = '<rect x="5"  y="5"  width="9" height="9" rx="1.5"/>';
  const PF_FRONT_RECT = '<rect x="10" y="10" width="9" height="9" rx="1.5"/>';
  const PF_FILL = 'fill="currentColor" fill-opacity="0.45"';

  const pathfinder = {
    unite:      () => pfSvg(`<path d="${PF_UNION}" ${PF_FILL}/>`),
    minusFront: () => pfSvg(`<path d="${PF_BACK_MINUS_OVERLAP}" ${PF_FILL}/>` + PF_FRONT_RECT),
    intersect:  () => pfSvg(PF_BACK_RECT + PF_FRONT_RECT + `<rect x="10" y="10" width="4" height="4" ${PF_FILL} stroke="none"/>`),
    exclude:    () => pfSvg(
      `<path fill-rule="evenodd" d="` +
      'M6.5 5 H12.5 A1.5 1.5 0 0 1 14 6.5 V12.5 A1.5 1.5 0 0 1 12.5 14 H6.5 A1.5 1.5 0 0 1 5 12.5 V6.5 A1.5 1.5 0 0 1 6.5 5 Z ' +
      'M11.5 10 H17.5 A1.5 1.5 0 0 1 19 11.5 V17.5 A1.5 1.5 0 0 1 17.5 19 H11.5 A1.5 1.5 0 0 1 10 17.5 V11.5 A1.5 1.5 0 0 1 11.5 10 Z' +
      `" ${PF_FILL}/>`
    ),
    divide:     () => pfSvg(
      `<path d="${PF_BACK_MINUS_OVERLAP}" fill="currentColor" fill-opacity="0.5" stroke="none"/>` +
      `<rect x="10" y="10" width="4" height="4" fill="currentColor" fill-opacity="0.5" stroke="none"/>` +
      `<path d="${PF_FRONT_MINUS_OVERLAP}" fill="currentColor" fill-opacity="0.5" stroke="none"/>` +
      PF_BACK_RECT + PF_FRONT_RECT
    ),
    trim:       () => pfSvg(
      `<path d="${PF_BACK_MINUS_OVERLAP}" fill="currentColor" fill-opacity="0.35"/>` +
      `<rect x="10" y="10" width="9" height="9" rx="1.5" fill="currentColor" fill-opacity="0.65"/>`
    ),
    merge:      () => pfSvg(
      `<path d="${PF_BACK_MINUS_OVERLAP}" fill="currentColor" fill-opacity="0.55"/>` +
      `<rect x="10" y="10" width="9" height="9" rx="1.5" fill="currentColor" fill-opacity="0.55"/>`
    ),
    crop:       () => pfSvg(PF_BACK_RECT + `<rect x="10" y="10" width="4" height="4" ${PF_FILL} stroke="none"/>` + PF_FRONT_RECT),
    outline:    () => pfSvg(PF_BACK_RECT + PF_FRONT_RECT + '<circle cx="14" cy="10" r="0.9" fill="currentColor" stroke="none"/><circle cx="10" cy="14" r="0.9" fill="currentColor" stroke="none"/>'),
    minusBack:  () => pfSvg(PF_BACK_RECT + `<path d="${PF_FRONT_MINUS_OVERLAP}" ${PF_FILL}/>`),
  };

  // Paint bucket variant icons: 22×22 viewBox, each a small swatch showing
  // the fill pattern. Used in the paint bucket panel's variant grid.
  const PB_STROKE = `fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"`;
  const pbSvg = (paths, size = 18) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 22 22" ${PB_STROKE} aria-hidden="true">${paths}</svg>`;
  const PB_FRAME = '<rect x="2.5" y="2.5" width="17" height="17" rx="1.5" opacity="0.45"/>';

  const paintBucket = {
    none:       () => pbSvg(PB_FRAME + '<line x1="5" y1="17" x2="17" y2="5" stroke-width="1.6"/>'),
    hatch:      () => pbSvg(PB_FRAME + '<line x1="4" y1="8"  x2="18" y2="8"/><line x1="4" y1="11" x2="18" y2="11"/><line x1="4" y1="14" x2="18" y2="14"/>'),
    crosshatch: () => pbSvg(PB_FRAME + '<line x1="4" y1="9"  x2="18" y2="9"/><line x1="4" y1="13" x2="18" y2="13"/><line x1="9" y1="4" x2="9" y2="18"/><line x1="13" y1="4" x2="13" y2="18"/>'),
    wavelines:  () => pbSvg(PB_FRAME + '<path d="M4 8 Q7 5 11 8 T18 8"/><path d="M4 14 Q7 11 11 14 T18 14"/>'),
    zigzag:     () => pbSvg(PB_FRAME + '<path d="M4 8 L7 6 L10 8 L13 6 L16 8 L18 7"/><path d="M4 14 L7 12 L10 14 L13 12 L16 14 L18 13"/>'),
    stipple:    () => pbSvg(PB_FRAME + '<circle cx="6.5" cy="7" r="0.9" fill="currentColor"/><circle cx="11" cy="7" r="0.9" fill="currentColor"/><circle cx="15.5" cy="7" r="0.9" fill="currentColor"/><circle cx="8.5" cy="11" r="0.9" fill="currentColor"/><circle cx="13" cy="11" r="0.9" fill="currentColor"/><circle cx="6.5" cy="15" r="0.9" fill="currentColor"/><circle cx="11" cy="15" r="0.9" fill="currentColor"/><circle cx="15.5" cy="15" r="0.9" fill="currentColor"/>'),
    contour:    () => pbSvg(PB_FRAME + '<rect x="5" y="5" width="12" height="12" rx="2"/><rect x="7.5" y="7.5" width="7" height="7" rx="1.5"/><rect x="10" y="10" width="2" height="2" rx="0.5"/>'),
    spiral:     () => pbSvg(PB_FRAME + '<path d="M11 11 m-0.5 0 a0.5 0.5 0 1 0 1 0 a1.5 1.5 0 1 0 -3 0 a2.5 2.5 0 1 0 5 0 a3.5 3.5 0 1 0 -7 0 a4.5 4.5 0 1 0 9 0"/>'),
    radial:     () => pbSvg(PB_FRAME + '<line x1="11" y1="4"  x2="11" y2="18"/><line x1="4"  y1="11" x2="18" y2="11"/><line x1="6"  y1="6"  x2="16" y2="16"/><line x1="16" y1="6"  x2="6"  y2="16"/>'),
    grid:       () => pbSvg(PB_FRAME + '<circle cx="7" cy="7"   r="1" fill="currentColor"/><circle cx="11" cy="7"  r="1" fill="currentColor"/><circle cx="15" cy="7"  r="1" fill="currentColor"/><circle cx="7" cy="11"  r="1" fill="currentColor"/><circle cx="11" cy="11" r="1" fill="currentColor"/><circle cx="15" cy="11" r="1" fill="currentColor"/><circle cx="7" cy="15"  r="1" fill="currentColor"/><circle cx="11" cy="15" r="1" fill="currentColor"/><circle cx="15" cy="15" r="1" fill="currentColor"/>'),
    polygonal:  () => pbSvg(PB_FRAME + '<polygon points="11,4 17,8 15,15 7,15 5,8" fill="none"/><polygon points="11,7 14,9.5 13,13 9,13 8,9.5" fill="none"/>'),
    bucket:     () => pbSvg('<path d="M5 10 L11 4 L19 12 L13 18 Z" fill="currentColor" fill-opacity="0.18"/><path d="M5 10 L11 4 L19 12 L13 18 Z"/><path d="M5 10 C3 7.5 4.5 5 7 4.5"/>'),
  };

  root.Icons = { layer, tool, misc, cursor, align, pathfinder, paintBucket };
})();
