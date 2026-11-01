/**
 * Start Page colorway tables — window.Vectura.START_PAGE_COLORWAYS.
 *
 * Pure data for src/core/start-page/colorway.js. Every entry resolves to the
 * app's REAL catalogue (the colorway test fails if one does not):
 *   - papers: a built-in type from Vectura.PAPERS.TYPES (src/config/papers.js).
 *     A tint is the same stock with a custom color, as the paper picker allows:
 *     { tint: { palette, index, amount } } mixes palette color `index` of
 *     Vectura.PALETTES[palette] into the stock color; { color } is an explicit
 *     custom color (a saturated stock) whose palette source is recorded.
 *   - pens: { model, colour } is a colour of a Vectura.PEN_MODELS.MODELS entry
 *     (hex copied from the model, checked by the test); { palette, index } is
 *     a palette color (src/config/palettes.js) with a hand-given label.
 * Tables only: no logic lives here.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const MICRON = 'sakura-pigma-micron';
  const STABILO = 'stabilo-point-88';
  const GELLY = 'sakura-gelly-roll-classic';
  const GELLY_METAL = 'sakura-gelly-roll-metallic';
  const MOONLIGHT = 'sakura-gelly-roll-moonlight';

  const M = (id, model, colour, hex) => ({ id, model, colour, hex });
  const L = (id, label, palette, index, hex) => ({ id, label, palette, index, hex });

  const PENS = [
    // Pigma Micron
    M('micron-black', MICRON, 'Black', '#1b1b1d'), M('micron-blue', MICRON, 'Blue', '#1f3a8a'),
    M('micron-burgundy', MICRON, 'Burgundy', '#6b1f2e'), M('micron-green', MICRON, 'Green', '#1f6b3a'),
    M('micron-sepia', MICRON, 'Sepia', '#5a3d2b'), M('micron-purple', MICRON, 'Purple', '#4a2a7a'),
    M('micron-royal', MICRON, 'Royal Blue', '#2a4fc4'), M('micron-orange', MICRON, 'Orange', '#e46a1e'),
    M('micron-grey', MICRON, 'Gray (cool)', '#7a7f86'),
    // Stabilo Point 88 (the dye fineliner box; the app has no Staedtler Triplus)
    M('stabilo-black', STABILO, 'Black', '#262628'), M('stabilo-blue', STABILO, 'Blue', '#1f4fb0'),
    M('stabilo-turquoise', STABILO, 'Turquoise', '#1aa0b8'), M('stabilo-pink', STABILO, 'Pink', '#e0418f'),
    M('stabilo-red', STABILO, 'Red', '#d82b2b'), M('stabilo-green', STABILO, 'Green', '#2a9a4a'),
    M('stabilo-lilac', STABILO, 'Lilac', '#8a63c4'),
    // Gelly Roll (classic, metallic, Moonlight)
    M('gelly-white', GELLY, 'White', '#f8f8f4'), M('gelly-silver', GELLY_METAL, 'Silver', '#b6bac0'),
    M('gelly-gold', GELLY_METAL, 'Gold', '#c9a048'),
    M('moon-yellow', MOONLIGHT, 'Fluorescent Yellow', '#e8ff3a'), M('moon-orange', MOONLIGHT, 'Fluorescent Orange', '#ff7a2a'),
    M('moon-pink', MOONLIGHT, 'Fluorescent Pink', '#ff4ab0'), M('moon-green', MOONLIGHT, 'Fluorescent Green', '#6aff5a'),
    M('moon-blue', MOONLIGHT, 'Fluorescent Blue', '#4ab8ff'), M('moon-lavender', MOONLIGHT, 'Lavender', '#b49aff'),
    // Inks the model catalogue has no pen for: named by palette color
    L('pal-navy', 'Navy', 'oceans-01', 4, '#0f172a'), L('pal-moss', 'Moss', 'limes-01', 4, '#3f6212'),
    L('pal-slate', 'Slate', 'grays-01', 3, '#4b5563'), L('pal-graphite', 'Graphite', 'neutrals-01', 3, '#525252'),
    L('pal-indigo', 'Indigo', 'indigos-01', 4, '#3730a3'), L('pal-teal', 'Teal', 'teals-01', 4, '#0f766e'),
    L('pal-sienna', 'Burnt Sienna', 'oranges-01', 4, '#9a3412'), L('pal-ochre', 'Ochre', 'ambers-01', 4, '#b45309'),
    L('pal-cyan', 'Deep Cyan', 'cyans-01', 4, '#0e7490'), L('pal-violet', 'Violet', 'violets-01', 4, '#5b21b6'),
    L('pal-plum', 'Plum', 'fuchsias-01', 4, '#86198f'), L('pal-emerald', 'Emerald', 'emeralds-01', 4, '#065f46'),
    L('pal-purple', 'Purple', 'purples-01', 4, '#6b21a8'), L('pal-prussian', 'Prussian', 'skies-01', 4, '#0c4a6e'),
    L('pal-wine', 'Wine Rose', 'pinks-01', 4, '#9d174d'), L('pal-rose', 'Rose', 'pinks-01', 1, '#f8a5d2'),
    L('pal-gold', 'Gold', 'ambers-01', 1, '#fcd45c'), L('pal-butter', 'Butter', 'ambers-02', 4, '#fde68a'),
    L('pal-sky', 'Sky', 'skies-01', 2, '#7dd3fc'), L('pal-lime', 'Lime', 'limes-01', 2, '#bef264'),
  ];

  // Papers. `short` of the stock names the sheet; a tint adds " · <tint name>".
  const T = (id, type, tintName, palette, index, amount) => ({ id, type, tint: { name: tintName, palette, index, amount } });
  const B = (id, type) => ({ id, type });
  const S = (id, name, color, palette, index) => ({ id, type: 'bristol-smooth', name, color, palette, index });
  const PAPERS = [
    B('hot', 'hot-press'), B('cold', 'cold-press'), B('rough', 'rough'), B('bristol', 'bristol-smooth'),
    B('vellum', 'bristol-vellum'), B('cotton', 'cotton-rag'), B('kraft', 'kraft'), B('news', 'newsprint'),
    { id: 'black', type: 'black', name: 'Black stock' }, B('tracing', 'tracing'),
    T('blueWash', 'cold-press', 'blue wash', 'blues-01', 1, 0.42),
    T('blush', 'hot-press', 'blush', 'reds-01', 1, 0.2),
    T('rose', 'rough', 'rose', 'pinks-01', 1, 0.24),
    T('lavender', 'bristol-vellum', 'lavender', 'violets-01', 1, 0.24),
    T('buff', 'cotton-rag', 'buff', 'ambers-01', 1, 0.2),
    T('sage', 'cold-press', 'sage', 'emeralds-01', 1, 0.3),
    T('aqua', 'cold-press', 'aqua', 'cyans-01', 1, 0.3),
    // saturated stocks (Bristol smooth with a strong custom color), for Wildcard
    S('cobalt', 'Cobalt stock', '#1d4ed8', 'oceans-01', 3), S('persimmon', 'Persimmon stock', '#f97316', 'oranges-01', 3),
    S('lemon', 'Lemon stock', '#fde047', 'yellows-01', 2), S('forest', 'Forest stock', '#065f46', 'emeralds-01', 4),
    S('magenta', 'Magenta stock', '#d946ef', 'fuchsias-01', 3), S('sky', 'Sky stock', '#7dd3fc', 'skies-01', 2),
    S('indigoStock', 'Indigo stock', '#3730a3', 'indigos-01', 4), S('lime', 'Lime stock', '#bef264', 'limes-01', 2),
    S('vermilion', 'Vermilion stock', '#ef4444', 'reds-01', 3), S('lagoon', 'Lagoon stock', '#0f766e', 'teals-01', 4),
    S('butter', 'Butter stock', '#fde68a', 'ambers-02', 4), S('mint', 'Mint stock', '#a4f1d0', 'emeralds-01', 1),
    S('plumStock', 'Plum stock', '#6b21a8', 'purples-01', 4),
  ];

  // Curated: a hung show. [paper, ink]; warm archival stocks carry deep inks of their own family,
  // black-stock pieces are gel. A work gets its pairing by a stable hash of its id.
  const CURATED = [
    ['blueWash', 'micron-blue'], ['news', 'micron-black'], ['black', 'gelly-white'], ['buff', 'pal-sienna'],
    ['kraft', 'micron-sepia'], ['hot', 'pal-teal'], ['lavender', 'pal-indigo'], ['blush', 'micron-burgundy'],
    ['black', 'gelly-silver'], ['cotton', 'pal-graphite'], ['tracing', 'pal-navy'], ['black', 'gelly-gold'],
    ['aqua', 'pal-prussian'], ['rose', 'pal-wine'], ['bristol', 'pal-violet'], ['sage', 'micron-green'],
    ['hot', 'pal-ochre'], ['black', 'moon-blue'], ['cold', 'pal-plum'], ['vellum', 'pal-moss'],
  ];

  // Wildcard: [paper, ink, ink2?]; saturated stocks with contrasting gel, some duotones, darks interspersed.
  const WILDCARD = [
    ['cobalt', 'pal-gold'], ['persimmon', 'pal-navy'], ['black', 'moon-pink', 'moon-blue'], ['lemon', 'pal-violet'],
    ['forest', 'pal-rose'], ['magenta', 'pal-navy'], ['sky', 'micron-burgundy'], ['indigoStock', 'moon-orange', 'moon-pink'],
    ['lime', 'pal-purple'], ['vermilion', 'gelly-white'], ['lagoon', 'gelly-gold'], ['butter', 'pal-prussian'],
    ['mint', 'pal-plum'], ['plumStock', 'moon-green', 'pal-butter'],
  ];

  // Basic: the pen box (11, so it never stacks in a 4/5/6-column grid) on the theme's plain paper.
  const BASIC = {
    pens: ['stabilo-blue', 'stabilo-red', 'stabilo-turquoise', 'stabilo-lilac', 'micron-orange', 'stabilo-green',
      'stabilo-pink', 'micron-sepia', 'micron-royal', 'micron-purple', 'stabilo-black'],
    paper: { dark: '#161618', light: '#fbfaf6', lark: '#fbfaf6' },
    // On the dark paper, box pens too dark to read are swapped for a light ink in their slot (instead of
    // being nudged to a grey that collapses into their neighbors).
    darkSwap: {
      'stabilo-blue': 'moon-blue', 'micron-sepia': 'pal-gold', 'micron-royal': 'pal-lime',
      'micron-purple': 'moon-lavender', 'stabilo-black': 'gelly-white',
    },
  };

  // Mono: theme ink on theme paper (the Meridian document colors; paper type 'none' = plain sheet).
  const MONO = {
    dark: { paper: '#121214', ink: '#e6f1ff', name: 'Meridian Dark' },
    light: { paper: '#ffffff', ink: '#0a1320', name: 'Meridian Light' },
    lark: { paper: '#ffffff', ink: '#0a1320', name: 'Meridian Lark' },
  };

  // Random draws from every paper and pen above (duotone chance, contrast margin over the 3:1 floor).
  const RANDOM = { duoChance: 0.2, margin: 0.25, duoLumSpread: 0.35, retries: 24 };

  Vectura.START_PAGE_COLORWAYS = { PENS, PAPERS, CURATED, WILDCARD, BASIC, MONO, RANDOM, SEED_ALPHABET: '23456789ABCDEFGHJKMNPQRSTVWXYZ' };
})();
