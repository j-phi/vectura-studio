/**
 * Pen Studio configuration — window.Vectura.PEN_STUDIO.
 *
 * Pure data for the Pen Studio (boxes, lab, complement pairing). Logic lives in
 * src/core/pen-studio/*.js; copy lives in UI_CONSTANTS.PEN_STUDIO.
 *
 *   STORAGE_KEY / SCHEMA   the studio's own localStorage document (boxes + pens)
 *   LIMITS                 box / pen / name caps and the storage byte cap
 *   PLAIN_SIZES            sizes of a plain (model-less) studio ink
 *   PLAIN_COLORS()         the palette inks the Start Page already names (pal-*)
 *   STARTER_BOXES          first-run boxes; entries resolve against the real
 *                          catalogue (src/config/pen-models.js) by model id +
 *                          colour name, or against PLAIN_COLORS by palette id
 *   CURATED_PAIRS          hand-picked complements, key 'modelId|colour' or 'plain|name'
 *   CONTRAST               contrast-ratio thresholds the lab and complement use
 *   HUES, WEAVE, SLIDERS, TESTS, MATRIX_TESTS, *_MM   lab geometry and controls
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const MICRON = 'sakura-pigma-micron';
  const STABILO = 'stabilo-point-88';
  const GELLY = 'sakura-gelly-roll-classic';
  const GELLY_METAL = 'sakura-gelly-roll-metallic';
  const MOONLIGHT = 'sakura-gelly-roll-moonlight';
  const POSCA = 'uni-posca-pc1mr';
  const SIGNO = 'uniball-signo-broad-um153';

  const LIMITS = Object.freeze({
    maxBoxes: 32,
    maxPens: 256,
    nameMax: 48,
    descMax: 80,
    boxNameMax: 48,
    maxBytes: 512 * 1024,
  });

  const PLAIN_SIZES = Object.freeze([
    Object.freeze({ label: '0.3', nominalWidthMm: 0.3, laidWidthMm: 0.3 }),
    Object.freeze({ label: '0.5', nominalWidthMm: 0.5, laidWidthMm: 0.5 }),
  ]);

  // Palette inks with a name on the Start Page: id 'pal-*' in START_PAGE_COLORWAYS.PENS.
  const PLAIN_COLORS = () => {
    const S = Vectura.START_PAGE_COLORWAYS;
    const list = (S && Array.isArray(S.PENS)) ? S.PENS : [];
    return list
      .filter((p) => p && typeof p.id === 'string' && p.id.indexOf('pal-') === 0 && typeof p.hex === 'string')
      .map((p) => ({ id: p.id, name: p.label || p.colour || p.id, hex: p.hex }));
  };

  const cat = (catalog, color, sizes, name) => ({ catalog, color, sizes, name });
  const plain = (pal) => ({ plain: pal });

  const STARTER_BOXES = Object.freeze([
    { name: 'Micron set', pinned: true, pens: [
      cat(MICRON, 'Black', ['005', '05', '08'], 'Micron Black'),
      cat(MICRON, 'Sepia', ['01', '05'], 'Micron Sepia'),
      cat(MICRON, 'Burgundy', ['05'], 'Micron Burgundy'),
      cat(MICRON, 'Blue', ['05'], 'Micron Blue'),
      cat(MICRON, 'Green', ['05'], 'Micron Green'),
    ] },
    { name: 'Night papers', pinned: true, pens: [
      cat(GELLY, 'White', ['08'], 'Gelly Roll White'),
      cat(GELLY_METAL, 'Gold', ['08'], 'Gelly Gold'),
      cat(MOONLIGHT, 'Fluorescent Pink', ['08'], 'Moonlight Pink'),
      cat(MOONLIGHT, 'Fluorescent Blue', ['08'], 'Moonlight Blue'),
      cat(POSCA, 'Coral Pink', ['PC-1MR (0.7 pin)'], 'Posca Coral Pink'),
      cat(SIGNO, 'White', ['1.0'], 'Signo White'),
    ] },
    { name: 'Stabilo 88 brights', pinned: false, pens: [
      cat(STABILO, 'Turquoise', ['0.4'], 'Stabilo Turquoise'),
      cat(STABILO, 'Pink', ['0.4'], 'Stabilo Pink'),
      cat(STABILO, 'Red', ['0.4'], 'Stabilo Red'),
      cat(STABILO, 'Lilac', ['0.4'], 'Stabilo Lilac'),
    ] },
    { name: 'Studio inks', pinned: false, pens: [
      plain('pal-sienna'), plain('pal-prussian'), plain('pal-indigo'), plain('pal-teal'), plain('pal-butter'),
    ] },
  ]);

  const CURATED_PAIRS = Object.freeze({
    [`${MICRON}|Black`]: { model: MICRON, color: 'Burgundy' },
    [`${MICRON}|Sepia`]: { hex: '#0e7490', name: 'Deep Cyan' },
    'plain|Burnt Sienna': { hex: '#0c4a6e', name: 'Prussian' },
    'plain|Prussian': { hex: '#9a3412', name: 'Burnt Sienna' },
    'plain|Indigo': { hex: '#9a3412', name: 'Burnt Sienna' },
    'plain|Teal': { hex: '#9d174d', name: 'Wine Rose' },
    'plain|Butter': { hex: '#7dd3fc', name: 'Sky' },
    [`${GELLY}|White`]: { model: GELLY_METAL, color: 'Gold' },
    [`${GELLY_METAL}|Gold`]: { model: GELLY, color: 'White' },
    [`${MOONLIGHT}|Fluorescent Pink`]: { model: GELLY, color: 'White' },
    [`${MOONLIGHT}|Fluorescent Blue`]: { hex: '#fde68a', name: 'Butter' },
    [`${POSCA}|Coral Pink`]: { hex: '#fde68a', name: 'Butter' },
    [`${SIGNO}|White`]: { model: GELLY_METAL, color: 'Gold' },
  });

  const CONTRAST = Object.freeze({
    paperMin: 2.0,        // a complement must reach this against the paper
    penMin: 1.25,         // ... and this against the pen it pairs with
    readable: 2.6,        // target for generated hues
    faint: 1.6,           // below this a pen "barely shows"
    crisp: 7,             // at or above this the note says "crisp"
    darkCoverMin: 0.5,    // on dark paper a candidate model needs this coverOnDark
    darkFaintCover: 0.3,  // below this coverOnDark a pen is faint on dark paper
  });

  const HUES = Object.freeze([
    Object.freeze({ id: 'c180', deg: 180, key: 'COMPLEMENT' }),
    Object.freeze({ id: 'c150', deg: 150, key: 'SPLIT_MINUS' }),
    Object.freeze({ id: 'c210', deg: 210, key: 'SPLIT_PLUS' }),
  ]);

  const WEAVE = Object.freeze({ min: 3, max: 7, default: 5, modes: Object.freeze(['alt', 'third', 'mid']) });

  const slider = (key, labelKey, label, max, step, evidence) => Object.freeze({ key, label, labelKey, min: 0, max, step, evidence });
  const SLIDERS = Object.freeze([
    slider('wetness', 'SLIDER_BLEED', 'Bleed', 1, 0.05, 'EV_BLEED'),
    slider('blobs', 'SLIDER_BLOB', 'Pen-down blob', 3, 0.05, 'EV_BLOB'),
    slider('overlap', 'SLIDER_OVERLAP', 'Overlap darkening', 1, 0.05, 'EV_OVERLAP'),
    slider('skips', 'SLIDER_SKIPS', 'Skips / streaks', 0.25, 0.005, 'EV_SKIPS'),
    slider('starvation', 'SLIDER_STARVATION', 'Starvation', 0.9, 0.05, 'EV_STARVATION'),
    slider('coverOnDark', 'SLIDER_COVER', 'Coverage on dark', 1, 0.05, 'EV_COVER'),
  ]);

  Vectura.PEN_STUDIO = {
    STORAGE_KEY: 'vectura.penStudio',
    SCHEMA: Object.freeze({ id: 'vectura-pen-studio', version: 1 }),
    LIMITS,
    PLAIN_SIZES,
    PLAIN_COLORS,
    STARTER_BOXES,
    CURATED_PAIRS,
    CONTRAST,
    HUES,
    BOX_MATES_MAX: 3,
    WEAVE,
    SLIDERS,
    TESTS: Object.freeze(['line', 'bleed', 'blob', 'cross', 'skip', 'starv']),
    MATRIX_TESTS: Object.freeze(['line', 'bleed', 'blob', 'cross']),
    MATRIX_CELL_MM: Object.freeze({ w: 14, h: 3 }),
    STRIP_MM: Object.freeze({ w: 25, h: 2.4 }),
  };
})();
