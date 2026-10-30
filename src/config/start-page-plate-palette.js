/**
 * Start Page plate palette — window.Vectura.START_PAGE_PLATE_PALETTE (the array of entries) and START_PAGE_PLATE_PENS.
 *
 * 32 named plate colorways (12 light papers, 10 color grounds, 10 darks) for the Plates section, expressed on
 * the app's REAL catalogue (the palette test fails if one does not resolve):
 *   - paperType: a built-in Vectura.PAPERS.TYPES key. `ground` is that stock's color, a tint of it
 *     (groundFrom.tint = { palette, index, amount }, the paper picker's custom color), a palette color
 *     (groundFrom.palette/index, a saturated stock), or a custom color on black stock (groundFrom 'custom').
 *   - penId / accentPenId: ids from Vectura.START_PAGE_COLORWAYS.PENS, or from PENS below (same shapes:
 *     { model, colour } = a Vectura.PEN_MODELS colour; { palette, index } = a palette color). `ink` and `accent`
 *     are those pens' exact hexes.
 * Tables only: no logic lives here (src/core/start-page/plate-rhythm.js).
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const POSCA = 'uni-posca-pc1mr';
  const MOON = 'sakura-gelly-roll-moonlight';
  // Pens the Start Page colorway catalogue does not carry (all real model colours).
  const PENS = [
    { id: 'posca-white', model: POSCA, colour: 'White', hex: '#f7f7f4' },
    { id: 'posca-pastel-green', model: POSCA, colour: 'Pastel Green', hex: '#a8e0b0' },
    { id: 'posca-light-blue', model: POSCA, colour: 'Light Blue', hex: '#7ac8f0' },
    { id: 'posca-coral', model: POSCA, colour: 'Coral Pink', hex: '#ff8a7a' },
    { id: 'moon-orange-plate', model: MOON, colour: 'Fluorescent Orange', hex: '#ff7a2a' },
  ];

  const ST = 'stock';
  const TI = (palette, index, amount) => ({ tint: { palette, index, amount } });
  const PA = (palette, index) => ({ palette, index });
  const CU = 'custom';
  // (id, class, family, paperType, paperName, groundFrom, ground, penId, penName, ink, accentPenId, accent)
  const E = (id, cls, fam, paperType, paperName, groundFrom, ground, penId, penName, ink, accentPenId, accent) =>
    ({ id, name: penName + ' on ' + paperName, class: cls, fam, ground, ink, accent, paperType, paperName, penId, penName, accentPenId, groundFrom });

  const ENTRIES = [
    // light papers: archival tones, deep inks
    E('buff-sienna', 'light', 'red', 'cotton-rag', 'Cotton rag · buff', TI('ambers-01', 1, 0.2), '#f6eac7', 'pal-sienna', 'Burnt Sienna', '#9a3412', 'pal-prussian', '#0c4a6e'),
    E('bristol-indigo', 'light', 'blue', 'bristol-smooth', 'Bristol smooth', ST, '#fbfbf7', 'pal-indigo', 'Indigo', '#3730a3', 'pal-sienna', '#9a3412'),
    E('hotpress-teal', 'light', 'teal', 'hot-press', 'Hot press', ST, '#f8f5ec', 'pal-teal', 'Teal', '#0f766e', 'pal-wine', '#9d174d'),
    E('kraft-black', 'light', 'brown', 'kraft', 'Kraft', ST, '#c39a6b', 'micron-black', 'Pigma Micron Black', '#1b1b1d', 'micron-burgundy', '#6b1f2e'),
    E('newsprint-graphite', 'light', 'neutral', 'newsprint', 'Newsprint', ST, '#e4dfd0', 'pal-graphite', 'Graphite', '#525252', 'pal-sienna', '#9a3412'),
    E('vellum-moss', 'light', 'green', 'bristol-vellum', 'Bristol vellum', ST, '#f9f7ef', 'pal-moss', 'Moss', '#3f6212', 'pal-ochre', '#b45309'),
    E('tracing-navy', 'light', 'blue', 'tracing', 'Tracing', ST, '#eceff0', 'pal-navy', 'Navy', '#0f172a', 'pal-sienna', '#9a3412'),
    E('blush-wine', 'light', 'pink', 'hot-press', 'Hot press · blush', TI('reds-01', 1, 0.2), '#f9e4dd', 'pal-wine', 'Wine Rose', '#9d174d', 'pal-teal', '#0f766e'),
    E('sage-emerald', 'light', 'green', 'cold-press', 'Cold press · sage', TI('emeralds-01', 1, 0.3), '#def2df', 'pal-emerald', 'Emerald', '#065f46', 'micron-burgundy', '#6b1f2e'),
    E('aqua-prussian', 'light', 'blue', 'cold-press', 'Cold press · aqua', TI('cyans-01', 1, 0.3), '#ddf2ed', 'pal-prussian', 'Prussian', '#0c4a6e', 'pal-sienna', '#9a3412'),
    E('ochre-sepia', 'light', 'yellow', 'cold-press', 'Cold press · ochre', TI('ambers-01', 1, 0.45), '#f9e5a8', 'micron-sepia', 'Pigma Micron Sepia', '#5a3d2b', 'pal-cyan', '#0e7490'),
    E('lavender-violet', 'light', 'violet', 'bristol-vellum', 'Bristol vellum · lavender', TI('violets-01', 1, 0.24), '#ede7f2', 'pal-violet', 'Violet', '#5b21b6', 'pal-ochre', '#b45309'),
    // color grounds: saturated stocks (a palette color on Bristol smooth), pale or white gel inks
    E('sienna-butter', 'ground', 'red', 'bristol-smooth', 'Burnt Sienna stock', PA('oranges-01', 4), '#9a3412', 'pal-butter', 'Butter', '#fde68a', 'pal-gold', '#fcd45c'),
    E('cobalt-butter', 'ground', 'blue', 'bristol-smooth', 'Cobalt stock', PA('oceans-01', 3), '#1d4ed8', 'pal-butter', 'Butter', '#fde68a', 'pal-sky', '#7dd3fc'),
    E('plum-lime', 'ground', 'violet', 'bristol-smooth', 'Plum stock', PA('purples-01', 4), '#6b21a8', 'pal-lime', 'Lime', '#bef264', 'pal-rose', '#f8a5d2'),
    E('forest-white', 'ground', 'green', 'bristol-smooth', 'Forest stock', PA('emeralds-01', 4), '#065f46', 'gelly-white', 'Gelly Roll White', '#f8f8f4', 'pal-gold', '#fcd45c'),
    E('brick-white', 'ground', 'orange', 'bristol-smooth', 'Brick stock', PA('reds-01', 4), '#991b1b', 'gelly-white', 'Gelly Roll White', '#f8f8f4', 'pal-butter', '#fde68a'),
    E('amber-black', 'ground', 'yellow', 'bristol-smooth', 'Amber stock', PA('ambers-01', 3), '#f59e0b', 'micron-black', 'Pigma Micron Black', '#1b1b1d', 'pal-sienna', '#9a3412'),
    E('lagoon-yellow', 'ground', 'teal', 'bristol-smooth', 'Lagoon stock', PA('teals-01', 4), '#0f766e', 'moon-yellow', 'Gelly Roll Moonlight Fluorescent Yellow', '#e8ff3a', 'pal-butter', '#fde68a'),
    E('wine-mint', 'ground', 'pink', 'bristol-smooth', 'Wine Rose stock', PA('pinks-01', 4), '#9d174d', 'posca-pastel-green', 'Posca Pastel Green', '#a8e0b0', 'pal-gold', '#fcd45c'),
    E('indigo-silver', 'ground', 'indigo', 'bristol-smooth', 'Indigo stock', PA('indigos-01', 4), '#3730a3', 'gelly-silver', 'Gelly Roll Metallic Silver', '#b6bac0', 'pal-gold', '#fcd45c'),
    E('moss-white', 'ground', 'olive', 'bristol-smooth', 'Moss stock', PA('limes-01', 4), '#3f6212', 'gelly-white', 'Gelly Roll White', '#f8f8f4', 'pal-gold', '#fcd45c'),
    // darks: black stock with white / silver / gold gel; custom-colored black stock for the rest
    E('black-white', 'dark', 'dark', 'black', 'Black stock', ST, '#1c1c1e', 'gelly-white', 'Gelly Roll White', '#f8f8f4', 'gelly-silver', '#b6bac0'),
    E('black-silver', 'dark', 'dark', 'black', 'Black stock', ST, '#1c1c1e', 'gelly-silver', 'Gelly Roll Metallic Silver', '#b6bac0', 'gelly-gold', '#c9a048'),
    E('black-gold', 'dark', 'dark', 'black', 'Black stock', ST, '#1c1c1e', 'gelly-gold', 'Gelly Roll Metallic Gold', '#c9a048', 'gelly-white', '#f8f8f4'),
    E('charcoal-white', 'dark', 'dark', 'black', 'Black stock · charcoal', CU, '#29292b', 'posca-white', 'Posca White', '#f7f7f4', 'moon-orange-plate', '#ff7a2a'),
    E('slate-blue', 'dark', 'dark', 'black', 'Black stock · slate', CU, '#2c3945', 'moon-blue', 'Gelly Roll Moonlight Fluorescent Blue', '#4ab8ff', 'pal-butter', '#fde68a'),
    E('navy-sky', 'dark', 'dark', 'black', 'Black stock · navy', PA('oceans-01', 4), '#0f172a', 'posca-light-blue', 'Posca Light Blue', '#7ac8f0', 'pal-gold', '#fcd45c'),
    E('midnight-mint', 'dark', 'dark', 'black', 'Black stock · midnight green', CU, '#13241f', 'posca-pastel-green', 'Posca Pastel Green', '#a8e0b0', 'pal-butter', '#fde68a'),
    E('oxblood-coral', 'dark', 'dark', 'black', 'Black stock · oxblood', CU, '#3a1414', 'posca-coral', 'Posca Coral Pink', '#ff8a7a', 'pal-butter', '#fde68a'),
    E('graphite-white', 'dark', 'dark', 'black', 'Black stock · graphite', CU, '#4a4c50', 'gelly-white', 'Gelly Roll White', '#f8f8f4', 'pal-gold', '#fcd45c'),
    E('graphite-orange', 'dark', 'dark', 'black', 'Black stock · deep graphite', CU, '#2f2f32', 'moon-orange-plate', 'Gelly Roll Moonlight Fluorescent Orange', '#ff7a2a', 'gelly-white', '#f8f8f4'),
  ];

  Vectura.START_PAGE_PLATE_PENS = PENS;
  Vectura.START_PAGE_PLATE_PALETTE = ENTRIES;
})();
