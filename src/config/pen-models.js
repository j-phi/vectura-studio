/**
 * Pen model catalogue (pen models) — window.Vectura.PEN_MODELS.
 *
 *   { MODELS, ORDER, CLASS_ORDER, CLASS_LABELS, EFFECTS, PLAIN_TRAITS,
 *     INK_KEYS, PARAM_LIMITS, LIMITS, LIBRARY_KEY, SCHEMA }
 *
 * A document pen ({ id, name, color, width } in SETTINGS.pens) stays a plain
 * colour + diameter pen unless it names a `model` from this catalogue. A model
 * describes how a real pen lays ink on paper; the preview renderer
 * (src/render/ink-renderer.js) turns it into stroke edges, blobs, skips and
 * opacity. The values are estimates worked back from macro photos, reviews
 * and plotter-artist write-ups (docs/pen-models.md lists the sources and a
 * per-pen confidence). Every physical size is in document millimetres.
 *
 * Model fields
 *   label / short / brand        menu name, chip name, maker
 *   inkClass / tipShape          grouping in the model picker
 *   effect                       default special ink of the model ('plain',
 *                                'metallic', 'dual-metallic', 'fluorescent',
 *                                'glow', 'glitter', 'white'); drawn by the
 *                                special-inks layer (preview only)
 *   sizes[]                      { label, nominalWidthMm, laidWidthMm } — the
 *                                laid width is what the pen really puts down;
 *                                picking a size writes it to pen.width, which
 *                                is the width SVG export plots
 *   defaultSize                  size label picked with the model
 *   absorbentWidthGainMm         extra width on absorbent paper (× absorbency
 *                                × paper bleed × wetness)
 *   opacity / coverOnDark        ink coverage on light / dark stock (0..1)
 *   blend                        'multiply' (translucent dye) or 'source-over'
 *                                (opaque gel / paint)
 *   overlapDarkening             0..1 how much crossings darken
 *   edge { roughness, scaleMm }  edge lumpiness (× paper feather) and its scale
 *   bleed { wetness, featherResponse }  how much the ink wicks into the sheet
 *   dryskipResponse              0..1 how much the paper's tooth breaks the ink
 *   startBlob { mm, probability } / endPool { mm } / cornerPool
 *                                ink pooled at pen-down, lift and slow turns
 *   starvation { lengthMm, strength }  thinning along one long stroke
 *   skip { rate, lengthMm }      fraction of the line skipped, gap length
 *   widthJitter { amount, scaleMm }  slow width wobble
 *   nibDirectional { strength, angleRad }  fountain nib: width varies with the
 *                                stroke direction
 *   fx                           effect parameters (metallic, glitter, …) of
 *                                the special-inks layer
 *   colours[]                    the maker's colours { name, hex, effect }
 *   confidence                   0..1 how well the numbers are sourced
 *
 * Preview only: SVG export plots pen.width in pen.color and nothing else.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  // Null-prototype map: an unknown id such as 'constructor' or '__proto__'
  // can never resolve to an inherited Object member.
  const MODELS = Object.assign(Object.create(null), {
    'sakura-pigma-micron': {
      id: 'sakura-pigma-micron', label: 'Pigma Micron', short: 'Micron', brand: 'Sakura',
      inkClass: 'pigment-fineliner', tipShape: 'round', effect: 'plain', confidence: 0.75,
      sizes: [
        { label: '003', nominalWidthMm: 0.15, laidWidthMm: 0.17 },
        { label: '005', nominalWidthMm: 0.2, laidWidthMm: 0.22 },
        { label: '01', nominalWidthMm: 0.25, laidWidthMm: 0.27 },
        { label: '02', nominalWidthMm: 0.3, laidWidthMm: 0.32 },
        { label: '03', nominalWidthMm: 0.35, laidWidthMm: 0.36 },
        { label: '05', nominalWidthMm: 0.45, laidWidthMm: 0.46 },
        { label: '08', nominalWidthMm: 0.5, laidWidthMm: 0.55 },
        { label: '1', nominalWidthMm: 0.6, laidWidthMm: 0.65 },
      ],
      defaultSize: '05',
      absorbentWidthGainMm: 0.06, opacity: 0.92, coverOnDark: 0.05, blend: 'multiply', overlapDarkening: 0.25,
      edge: { roughness: 0.12, scaleMm: 0.04, softnessMm: 0.01 }, bleed: { wetness: 0.35, featherResponse: 0.4 }, dryskipResponse: 0.25,
      startBlob: { mm: 0.06, probability: 0.3 }, endPool: { mm: 0.04 }, cornerPool: 0.15,
      starvation: { lengthMm: 0, strength: 0 }, skip: { rate: 0, lengthMm: 0 }, widthJitter: { amount: 0.04, scaleMm: 6 },
      colours: [
        { name: 'Black', hex: '#1b1b1d', effect: 'plain' },
        { name: 'Blue', hex: '#1f3a8a', effect: 'plain' },
        { name: 'Red', hex: '#c0262d', effect: 'plain' },
        { name: 'Green', hex: '#1f6b3a', effect: 'plain' },
        { name: 'Burgundy', hex: '#6b1f2e', effect: 'plain' },
        { name: 'Purple', hex: '#4a2a7a', effect: 'plain' },
        { name: 'Sepia', hex: '#5a3d2b', effect: 'plain' },
        { name: 'Rose', hex: '#d6517a', effect: 'plain' },
        { name: 'Orange', hex: '#e46a1e', effect: 'plain' },
        { name: 'Yellow', hex: '#e9c21c', effect: 'plain' },
        { name: 'Fresh Green', hex: '#5aa83a', effect: 'plain' },
        { name: 'Royal Blue', hex: '#2a4fc4', effect: 'plain' },
        { name: 'Grey (cool)', hex: '#7a7f86', effect: 'plain' },
      ],
    },
    'rotring-isograph': {
      id: 'rotring-isograph', label: 'Isograph technical pen', short: 'Isograph', brand: 'Rotring',
      inkClass: 'technical-pen', tipShape: 'tube', effect: 'plain', confidence: 0.55,
      sizes: [
        { label: '0.1', nominalWidthMm: 0.1, laidWidthMm: 0.12 },
        { label: '0.18', nominalWidthMm: 0.18, laidWidthMm: 0.2 },
        { label: '0.25', nominalWidthMm: 0.25, laidWidthMm: 0.27 },
        { label: '0.35', nominalWidthMm: 0.35, laidWidthMm: 0.37 },
        { label: '0.5', nominalWidthMm: 0.5, laidWidthMm: 0.52 },
        { label: '0.7', nominalWidthMm: 0.7, laidWidthMm: 0.72 },
        { label: '1.0', nominalWidthMm: 1, laidWidthMm: 1.02 },
      ],
      defaultSize: '0.25',
      absorbentWidthGainMm: 0.05, opacity: 0.97, coverOnDark: 0, blend: 'multiply', overlapDarkening: 0.15,
      edge: { roughness: 0.05, scaleMm: 0.03, softnessMm: 0.005 }, bleed: { wetness: 0.45, featherResponse: 0.35 }, dryskipResponse: 0.15,
      startBlob: { mm: 0.1, probability: 0.6 }, endPool: { mm: 0.08 }, cornerPool: 0.25,
      starvation: { lengthMm: 6000, strength: 0.2 }, skip: { rate: 0, lengthMm: 0 }, widthJitter: { amount: 0.02, scaleMm: 10 },
      colours: [
        { name: 'Black India', hex: '#0e0e0e', effect: 'plain' },
      ],
    },
    'stabilo-point-88': {
      id: 'stabilo-point-88', label: 'Point 88', short: 'Stabilo 88', brand: 'Stabilo',
      inkClass: 'dye-fineliner', tipShape: 'round', effect: 'plain', confidence: 0.6,
      sizes: [
        { label: '0.4', nominalWidthMm: 0.4, laidWidthMm: 0.48 },
      ],
      defaultSize: '0.4',
      absorbentWidthGainMm: 0.12, opacity: 0.78, coverOnDark: 0, blend: 'multiply', overlapDarkening: 0.6,
      edge: { roughness: 0.2, scaleMm: 0.05, softnessMm: 0.02 }, bleed: { wetness: 0.6, featherResponse: 0.7 }, dryskipResponse: 0.2,
      startBlob: { mm: 0.1, probability: 0.45 }, endPool: { mm: 0.08 }, cornerPool: 0.3,
      starvation: { lengthMm: 0, strength: 0 }, skip: { rate: 0, lengthMm: 0 }, widthJitter: { amount: 0.06, scaleMm: 5 },
      colours: [
        { name: 'Black', hex: '#262628', effect: 'plain' },
        { name: 'Blue', hex: '#1f4fb0', effect: 'plain' },
        { name: 'Turquoise', hex: '#1aa0b8', effect: 'plain' },
        { name: 'Pink', hex: '#e0418f', effect: 'plain' },
        { name: 'Yellow', hex: '#f2d21a', effect: 'plain' },
        { name: 'Red', hex: '#d82b2b', effect: 'plain' },
        { name: 'Green', hex: '#2a9a4a', effect: 'plain' },
        { name: 'Lilac', hex: '#8a63c4', effect: 'plain' },
        { name: 'Neon Orange', hex: '#ff6a1a', effect: 'fluorescent' },
        { name: 'Neon Pink', hex: '#ff3fa4', effect: 'fluorescent' },
        { name: 'Neon Yellow', hex: '#e9ff2a', effect: 'fluorescent' },
        { name: 'Neon Green', hex: '#5dff4a', effect: 'fluorescent' },
      ],
    },
    'pentel-sign-pen': {
      id: 'pentel-sign-pen', label: 'Sign Pen S520', short: 'Sign Pen', brand: 'Pentel',
      inkClass: 'dye-fineliner', tipShape: 'round', effect: 'plain', confidence: 0.45,
      sizes: [
        { label: 'fine fibre', nominalWidthMm: 0.8, laidWidthMm: 0.85 },
      ],
      defaultSize: 'fine fibre',
      absorbentWidthGainMm: 0.18, opacity: 0.92, coverOnDark: 0, blend: 'multiply', overlapDarkening: 0.6,
      edge: { roughness: 0.18, scaleMm: 0.06, softnessMm: 0.02 }, bleed: { wetness: 0.6, featherResponse: 0.7 }, dryskipResponse: 0.2,
      startBlob: { mm: 0.18, probability: 0.6 }, endPool: { mm: 0.14 }, cornerPool: 0.3,
      starvation: { lengthMm: 0, strength: 0 }, skip: { rate: 0, lengthMm: 0 }, widthJitter: { amount: 0.08, scaleMm: 4 },
      colours: [
        { name: 'Black', hex: '#1c1c1e', effect: 'plain' },
        { name: 'Blue', hex: '#2a4aa8', effect: 'plain' },
        { name: 'Red', hex: '#d0262c', effect: 'plain' },
        { name: 'Green', hex: '#2a8a46', effect: 'plain' },
      ],
    },
    'sharpie-ultra-fine': {
      id: 'sharpie-ultra-fine', label: 'Sharpie Ultra Fine', short: 'Sharpie', brand: 'Sharpie',
      inkClass: 'alcohol-marker', tipShape: 'round', effect: 'plain', confidence: 0.55,
      sizes: [
        { label: 'Ultra Fine', nominalWidthMm: 0.5, laidWidthMm: 0.65 },
        { label: 'Extra Fine', nominalWidthMm: 0.4, laidWidthMm: 0.7 },
      ],
      defaultSize: 'Ultra Fine',
      absorbentWidthGainMm: 0.2, opacity: 0.85, coverOnDark: 0, blend: 'multiply', overlapDarkening: 0.55,
      edge: { roughness: 0.22, scaleMm: 0.05, softnessMm: 0.03 }, bleed: { wetness: 0.75, featherResponse: 0.6 }, dryskipResponse: 0.1,
      startBlob: { mm: 0.2, probability: 0.7 }, endPool: { mm: 0.18 }, cornerPool: 0.45,
      starvation: { lengthMm: 0, strength: 0 }, skip: { rate: 0, lengthMm: 0 }, widthJitter: { amount: 0.05, scaleMm: 6 },
      colours: [
        { name: 'Black', hex: '#202022', effect: 'plain' },
        { name: 'Blue', hex: '#1b4fc0', effect: 'plain' },
        { name: 'Red', hex: '#d7262f', effect: 'plain' },
        { name: 'Turquoise', hex: '#14a6c2', effect: 'plain' },
        { name: 'Lime', hex: '#8cd23a', effect: 'plain' },
        { name: 'Berry', hex: '#b52a6a', effect: 'plain' },
        { name: 'Neon Pink', hex: '#ff3fa0', effect: 'fluorescent' },
        { name: 'Neon Orange', hex: '#ff6a22', effect: 'fluorescent' },
      ],
    },
    'pilot-precise-v5-v7': {
      id: 'pilot-precise-v5-v7', label: 'Precise V5 / V7', short: 'Precise', brand: 'Pilot',
      inkClass: 'liquid-rollerball', tipShape: 'needle', effect: 'plain', confidence: 0.5,
      sizes: [
        { label: 'V5 (0.5)', nominalWidthMm: 0.5, laidWidthMm: 0.33 },
        { label: 'V7 (0.7)', nominalWidthMm: 0.7, laidWidthMm: 0.45 },
      ],
      defaultSize: 'V5 (0.5)',
      absorbentWidthGainMm: 0.14, opacity: 0.85, coverOnDark: 0, blend: 'multiply', overlapDarkening: 0.5,
      edge: { roughness: 0.12, scaleMm: 0.04, softnessMm: 0.015 }, bleed: { wetness: 0.8, featherResponse: 0.75 }, dryskipResponse: 0.15,
      startBlob: { mm: 0.12, probability: 0.55 }, endPool: { mm: 0.1 }, cornerPool: 0.35,
      starvation: { lengthMm: 0, strength: 0 }, skip: { rate: 0, lengthMm: 0 }, widthJitter: { amount: 0.05, scaleMm: 5 },
      colours: [
        { name: 'Black', hex: '#1d1d22', effect: 'plain' },
        { name: 'Blue', hex: '#1c3fb0', effect: 'plain' },
        { name: 'Red', hex: '#d0222c', effect: 'plain' },
        { name: 'Green', hex: '#1a8a3e', effect: 'plain' },
        { name: 'Purple', hex: '#5a2aa0', effect: 'plain' },
        { name: 'Pink', hex: '#e0408a', effect: 'plain' },
        { name: 'Turquoise', hex: '#1aa4c4', effect: 'plain' },
        { name: 'Orange', hex: '#f0701e', effect: 'plain' },
      ],
    },
    'pilot-kakuno-fountain': {
      id: 'pilot-kakuno-fountain', label: 'Kakuno fountain pen', short: 'Fountain', brand: 'Pilot',
      inkClass: 'fountain-dye', tipShape: 'nib', effect: 'plain', confidence: 0.55,
      sizes: [
        { label: 'EF', nominalWidthMm: 0.25, laidWidthMm: 0.3 },
        { label: 'F', nominalWidthMm: 0.3, laidWidthMm: 0.38 },
        { label: 'M', nominalWidthMm: 0.45, laidWidthMm: 0.5 },
      ],
      defaultSize: 'F',
      absorbentWidthGainMm: 0.15, opacity: 0.75, coverOnDark: 0, blend: 'multiply', overlapDarkening: 0.55,
      edge: { roughness: 0.18, scaleMm: 0.04, softnessMm: 0.02 }, bleed: { wetness: 0.85, featherResponse: 0.85 }, dryskipResponse: 0.1,
      startBlob: { mm: 0.12, probability: 0.5 }, endPool: { mm: 0.12 }, cornerPool: 0.5,
      starvation: { lengthMm: 0, strength: 0 }, skip: { rate: 0, lengthMm: 0 }, widthJitter: { amount: 0.06, scaleMm: 5 },
      nibDirectional: { strength: 0.15, angleRad: 0.7854 },
      colours: [
        { name: 'Iroshizuku Kon-Peki', hex: '#1a6ac8', effect: 'plain' },
        { name: 'Diamine Jack Frost (sheen)', hex: '#1a4a7a', effect: 'plain' },
        { name: 'Platinum Carbon Black', hex: '#161616', effect: 'plain' },
        { name: 'Sailor 123 (multichromatic)', hex: '#5a6a5a', effect: 'plain' },
        { name: 'De Atramentis Document', hex: '#2a2a6a', effect: 'plain' },
      ],
    },
    'sakura-gelly-roll-classic': {
      id: 'sakura-gelly-roll-classic', label: 'Gelly Roll', short: 'Gelly Roll', brand: 'Sakura',
      inkClass: 'gel', tipShape: 'ball', effect: 'plain', confidence: 0.7,
      sizes: [
        { label: '05', nominalWidthMm: 0.5, laidWidthMm: 0.25 },
        { label: '06', nominalWidthMm: 0.6, laidWidthMm: 0.3 },
        { label: '08', nominalWidthMm: 0.8, laidWidthMm: 0.4 },
        { label: '10', nominalWidthMm: 1, laidWidthMm: 0.5 },
      ],
      defaultSize: '08',
      absorbentWidthGainMm: 0, opacity: 0.95, coverOnDark: 0.8, blend: 'source-over', overlapDarkening: 0,
      edge: { roughness: 0.06, scaleMm: 0.03, softnessMm: 0.008 }, bleed: { wetness: 0.15, featherResponse: 0.15 }, dryskipResponse: 0.7,
      startBlob: { mm: 0.3, probability: 0.85 }, endPool: { mm: 0.08 }, cornerPool: 0.2,
      starvation: { lengthMm: 3000, strength: 0.35 }, skip: { rate: 0.03, lengthMm: 1.5 }, widthJitter: { amount: 0.1, scaleMm: 3 },
      colours: [
        { name: 'White', hex: '#f8f8f4', effect: 'white' },
        { name: 'Black', hex: '#16161a', effect: 'plain' },
        { name: 'Blue', hex: '#1e46b8', effect: 'plain' },
        { name: 'Red', hex: '#d82a2a', effect: 'plain' },
        { name: 'Green', hex: '#2a9a46', effect: 'plain' },
        { name: 'Purple', hex: '#6a2ab0', effect: 'plain' },
      ],
    },
    'uniball-signo-broad-um153': {
      id: 'uniball-signo-broad-um153', label: 'Signo Broad UM-153', short: 'Signo UM-153', brand: 'Uni-ball',
      inkClass: 'gel', tipShape: 'ball', effect: 'plain', confidence: 0.6,
      sizes: [
        { label: '1.0', nominalWidthMm: 1, laidWidthMm: 0.7 },
      ],
      defaultSize: '1.0',
      absorbentWidthGainMm: 0, opacity: 0.97, coverOnDark: 0.88, blend: 'source-over', overlapDarkening: 0,
      edge: { roughness: 0.06, scaleMm: 0.03, softnessMm: 0.008 }, bleed: { wetness: 0.15, featherResponse: 0.15 }, dryskipResponse: 0.8,
      startBlob: { mm: 0.15, probability: 0.55 }, endPool: { mm: 0.06 }, cornerPool: 0.1,
      starvation: { lengthMm: 4000, strength: 0.3 }, skip: { rate: 0.012, lengthMm: 1.2 }, widthJitter: { amount: 0.03, scaleMm: 3 },
      fx: { metallic: { strength: 0.55, baseDarken: 0.25, flakeDensity: 120, flakeSizeMm: 0.03, hueShift: 0, secondHex: null } },
      colours: [
        { name: 'White', hex: '#f6f6f2', effect: 'white' },
        { name: 'Gold', hex: '#c9a24a', effect: 'metallic' },
        { name: 'Silver', hex: '#b8bcc2', effect: 'metallic' },
        { name: 'Black', hex: '#16161a', effect: 'plain' },
      ],
    },
    'sakura-gelly-roll-metallic': {
      id: 'sakura-gelly-roll-metallic', label: 'Gelly Roll Metallic', short: 'Gelly Metallic', brand: 'Sakura',
      inkClass: 'metallic-gel', tipShape: 'ball', effect: 'metallic', confidence: 0.65,
      sizes: [
        { label: '08', nominalWidthMm: 0.8, laidWidthMm: 0.45 },
        { label: '10', nominalWidthMm: 1, laidWidthMm: 0.55 },
      ],
      defaultSize: '08',
      absorbentWidthGainMm: 0, opacity: 0.95, coverOnDark: 0.85, blend: 'source-over', overlapDarkening: 0.2,
      edge: { roughness: 0.06, scaleMm: 0.03, softnessMm: 0.008 }, bleed: { wetness: 0.15, featherResponse: 0.15 }, dryskipResponse: 0.7,
      startBlob: { mm: 0.3, probability: 0.85 }, endPool: { mm: 0.06 }, cornerPool: 0.2,
      starvation: { lengthMm: 3000, strength: 0.35 }, skip: { rate: 0.035, lengthMm: 1.5 }, widthJitter: { amount: 0.05, scaleMm: 3 },
      fx: { metallic: { strength: 0.75, baseDarken: 0.3, flakeDensity: 180, flakeSizeMm: 0.025, hueShift: 0, secondHex: null } },
      colours: [
        { name: 'Gold', hex: '#c9a048', effect: 'metallic' },
        { name: 'Silver', hex: '#b6bac0', effect: 'metallic' },
        { name: 'Copper', hex: '#b8673a', effect: 'metallic' },
        { name: 'Metallic Blue', hex: '#3a6ad0', effect: 'metallic' },
        { name: 'Metallic Green', hex: '#3aa060', effect: 'metallic' },
        { name: 'Metallic Red', hex: '#c43a4a', effect: 'metallic' },
        { name: 'Metallic Purple', hex: '#7a4ac0', effect: 'metallic' },
        { name: 'Metallic Pink', hex: '#e05aa0', effect: 'metallic' },
      ],
    },
    'pentel-hybrid-dual-metallic': {
      id: 'pentel-hybrid-dual-metallic', label: 'Hybrid Dual Metallic', short: 'Dual Metallic', brand: 'Pentel',
      inkClass: 'metallic-gel', tipShape: 'ball', effect: 'dual-metallic', confidence: 0.55,
      sizes: [
        { label: '1.0', nominalWidthMm: 1, laidWidthMm: 0.55 },
      ],
      defaultSize: '1.0',
      absorbentWidthGainMm: 0, opacity: 0.9, coverOnDark: 0.75, blend: 'source-over', overlapDarkening: 0.2,
      edge: { roughness: 0.06, scaleMm: 0.03, softnessMm: 0.008 }, bleed: { wetness: 0.15, featherResponse: 0.15 }, dryskipResponse: 0.7,
      startBlob: { mm: 0.25, probability: 0.7 }, endPool: { mm: 0.06 }, cornerPool: 0.2,
      starvation: { lengthMm: 0, strength: 0 }, skip: { rate: 0.01, lengthMm: 0.8 }, widthJitter: { amount: 0.05, scaleMm: 3 },
      fx: { metallic: { strength: 0.8, baseDarken: 0.45, flakeDensity: 260, flakeSizeMm: 0.04, hueShift: 25 } },
      colours: [
        { name: 'Black + Red', hex: '#2a1a1e', effect: 'dual-metallic', secondHex: '#c8303a' },
        { name: 'Black + Green', hex: '#1a2a22', effect: 'dual-metallic', secondHex: '#3ab060' },
        { name: 'Blue + Metallic Blue', hex: '#1a2a6a', effect: 'dual-metallic', secondHex: '#5a8aff' },
        { name: 'Violet + Metallic', hex: '#3a1a5a', effect: 'dual-metallic', secondHex: '#b07aff' },
        { name: 'Gold', hex: '#8a6a2a', effect: 'dual-metallic', secondHex: '#e0c060' },
        { name: 'Silver', hex: '#7a7e86', effect: 'dual-metallic', secondHex: '#dfe2e8' },
        { name: 'Red + Gold', hex: '#a0202a', effect: 'dual-metallic', secondHex: '#e0b050' },
      ],
    },
    'sakura-gelly-roll-moonlight': {
      id: 'sakura-gelly-roll-moonlight', label: 'Gelly Roll Moonlight', short: 'Moonlight', brand: 'Sakura',
      inkClass: 'fluorescent-gel', tipShape: 'ball', effect: 'fluorescent', confidence: 0.45,
      sizes: [
        { label: '06', nominalWidthMm: 0.6, laidWidthMm: 0.3 },
        { label: '08', nominalWidthMm: 0.8, laidWidthMm: 0.4 },
        { label: '10', nominalWidthMm: 1, laidWidthMm: 0.5 },
      ],
      defaultSize: '08',
      absorbentWidthGainMm: 0, opacity: 0.9, coverOnDark: 0.7, blend: 'source-over', overlapDarkening: 0.2,
      edge: { roughness: 0.06, scaleMm: 0.03, softnessMm: 0.008 }, bleed: { wetness: 0.15, featherResponse: 0.15 }, dryskipResponse: 0.7,
      startBlob: { mm: 0.3, probability: 0.85 }, endPool: { mm: 0.06 }, cornerPool: 0.2,
      starvation: { lengthMm: 0, strength: 0 }, skip: { rate: 0.025, lengthMm: 1.2 }, widthJitter: { amount: 0.05, scaleMm: 3 },
      fx: { fluorescent: { strength: 0.8, uvGlow: 0.9, haloMm: 0.15 } },
      colours: [
        { name: 'Fluorescent Yellow', hex: '#e8ff3a', effect: 'fluorescent' },
        { name: 'Fluorescent Orange', hex: '#ff7a2a', effect: 'fluorescent' },
        { name: 'Fluorescent Pink', hex: '#ff4ab0', effect: 'fluorescent' },
        { name: 'Fluorescent Green', hex: '#6aff5a', effect: 'fluorescent' },
        { name: 'Fluorescent Blue', hex: '#4ab8ff', effect: 'fluorescent' },
        { name: 'Lavender', hex: '#b49aff', effect: 'fluorescent' },
        { name: 'Red', hex: '#ff3a4a', effect: 'fluorescent' },
        { name: 'Dark Blue (weak glow)', hex: '#2a4ad0', effect: 'fluorescent' },
      ],
    },
    'sakura-gelly-roll-stardust': {
      id: 'sakura-gelly-roll-stardust', label: 'Gelly Roll Stardust', short: 'Stardust', brand: 'Sakura',
      inkClass: 'glitter-gel', tipShape: 'ball', effect: 'glitter', confidence: 0.4,
      sizes: [
        { label: '10 (bold)', nominalWidthMm: 1, laidWidthMm: 0.5 },
        { label: 'fine', nominalWidthMm: 0.8, laidWidthMm: 0.42 },
      ],
      defaultSize: '10 (bold)',
      absorbentWidthGainMm: 0, opacity: 0.7, coverOnDark: 0.35, blend: 'multiply', overlapDarkening: 0.35,
      edge: { roughness: 0.06, scaleMm: 0.03, softnessMm: 0.008 }, bleed: { wetness: 0.15, featherResponse: 0.15 }, dryskipResponse: 0.7,
      startBlob: { mm: 0.3, probability: 0.8 }, endPool: { mm: 0.06 }, cornerPool: 0.2,
      starvation: { lengthMm: 0, strength: 0 }, skip: { rate: 0.025, lengthMm: 1.2 }, widthJitter: { amount: 0.05, scaleMm: 3 },
      fx: { glitter: { density: 350, sizeMm: 0.05, sizeJitter: 0.5, sparkle: 0.8 } },
      colours: [
        { name: 'Gold', hex: '#c8a048', effect: 'glitter' },
        { name: 'Silver', hex: '#b8bcc2', effect: 'glitter' },
        { name: 'Copper', hex: '#b8673a', effect: 'glitter' },
        { name: 'Red', hex: '#d0303a', effect: 'glitter' },
        { name: 'Blue', hex: '#2a5ad0', effect: 'glitter' },
        { name: 'Green', hex: '#2aa05a', effect: 'glitter' },
        { name: 'Purple', hex: '#7a3ac0', effect: 'glitter' },
        { name: 'Clear', hex: '#f4f4f0', effect: 'glitter' },
      ],
    },
    'uni-posca-pc1mr': {
      id: 'uni-posca-pc1mr', label: 'Posca paint marker', short: 'Posca', brand: 'Uni',
      inkClass: 'paint-marker', tipShape: 'round', effect: 'plain', confidence: 0.6,
      sizes: [
        { label: 'PC-1MR (0.7 pin)', nominalWidthMm: 0.7, laidWidthMm: 0.8 },
        { label: 'PC-1M (0.7-1.0 bullet)', nominalWidthMm: 0.85, laidWidthMm: 1 },
        { label: 'PC-3M (0.9-1.3)', nominalWidthMm: 1.1, laidWidthMm: 1.3 },
      ],
      defaultSize: 'PC-1MR (0.7 pin)',
      absorbentWidthGainMm: 0.05, opacity: 0.97, coverOnDark: 0.95, blend: 'source-over', overlapDarkening: 0,
      edge: { roughness: 0.15, scaleMm: 0.06, softnessMm: 0.01 }, bleed: { wetness: 0.2, featherResponse: 0.15 }, dryskipResponse: 0.5,
      startBlob: { mm: 0.35, probability: 0.6 }, endPool: { mm: 0.2 }, cornerPool: 0.3,
      starvation: { lengthMm: 1500, strength: 0.7 }, skip: { rate: 0, lengthMm: 0 }, widthJitter: { amount: 0.08, scaleMm: 6 },
      fx: { metallic: { strength: 0.6, baseDarken: 0.15, flakeDensity: 400, flakeSizeMm: 0.02, hueShift: 0, secondHex: null } },
      colours: [
        { name: 'White', hex: '#f7f7f4', effect: 'white' },
        { name: 'Black', hex: '#1a1a1a', effect: 'plain' },
        { name: 'Metallic Gold', hex: '#c8a24a', effect: 'metallic' },
        { name: 'Metallic Silver', hex: '#c0c4ca', effect: 'metallic' },
        { name: 'Pink', hex: '#f07ab0', effect: 'plain' },
        { name: 'Coral Pink', hex: '#ff8a7a', effect: 'plain' },
        { name: 'Pastel Green', hex: '#a8e0b0', effect: 'plain' },
        { name: 'Fluo Pink', hex: '#ff4aa8', effect: 'fluorescent' },
        { name: 'Fluo Yellow', hex: '#eaff3a', effect: 'fluorescent' },
        { name: 'Light Blue', hex: '#7ac8f0', effect: 'plain' },
      ],
    },
    'glow-phosphorescent-marker': {
      id: 'glow-phosphorescent-marker', label: 'Glow-in-the-dark marker', short: 'Glow marker', brand: 'Generic',
      inkClass: 'paint-marker', tipShape: 'round', effect: 'glow', confidence: 0.25,
      sizes: [
        { label: 'fine nib', nominalWidthMm: 0.8, laidWidthMm: 0.9 },
      ],
      defaultSize: 'fine nib',
      absorbentWidthGainMm: 0, opacity: 0.55, coverOnDark: 0.4, blend: 'source-over', overlapDarkening: 0,
      edge: { roughness: 0.2, scaleMm: 0.06, softnessMm: 0.02 }, bleed: { wetness: 0.3, featherResponse: 0.2 }, dryskipResponse: 0.4,
      startBlob: { mm: 0.3, probability: 0.6 }, endPool: { mm: 0.2 }, cornerPool: 0,
      starvation: { lengthMm: 1500, strength: 0.6 }, skip: { rate: 0, lengthMm: 0 }, widthJitter: { amount: 0.08, scaleMm: 5 },
      fx: { glowInDark: { hex: '#7dff9a', strength: 0.8, decaySeconds: 600, grain: 0.5 } },
      colours: [
        { name: 'Glow green (day: pale yellow-green)', hex: '#e6f2c8', effect: 'glow' },
        { name: 'Glow aqua (day: pale off-white)', hex: '#e2f0ee', effect: 'glow', glowHex: '#5ae0ff' },
      ],
    },
  });

  // Picker order (also the comparison-sheet order): fineliners and
  // markers, then rollerball / fountain, then gel, then paint and novelty.
  const ORDER = Object.keys(MODELS);

  // Model picker groups.
  const CLASS_ORDER = [
    'pigment-fineliner', 'technical-pen', 'dye-fineliner', 'alcohol-marker', 'liquid-rollerball',
    'fountain-dye', 'gel', 'metallic-gel', 'fluorescent-gel', 'glitter-gel', 'paint-marker',
  ];
  const CLASS_LABELS = Object.freeze({
    'pigment-fineliner': 'Fineliners',
    'technical-pen': 'Technical pens',
    'dye-fineliner': 'Fibre tips',
    'alcohol-marker': 'Markers',
    'liquid-rollerball': 'Rollerballs',
    'fountain-dye': 'Fountain pens',
    gel: 'Gel pens',
    'metallic-gel': 'Metallic gel',
    'fluorescent-gel': 'Fluorescent gel',
    'glitter-gel': 'Glitter gel',
    'paint-marker': 'Paint markers',
  });

  // Special inks. 'plain' means no effect. The look of each effect is drawn
  // by the special-inks layer of src/render/ink-renderer.js (preview only).
  const EFFECTS = Object.freeze(['metallic', 'dual-metallic', 'fluorescent', 'glow', 'glitter', 'white']);

  // Effect parameters when a pen's model has none of its own (any pen can
  // carry an effect). A model's `fx` block overrides these for its default
  // effect; pen.ink.effectStrength / flakeDensity override both.
  //   strength      0..1 overall effect weight (sheen, glints, halo, glow)
  //   baseDarken    metallic ink looks darker than its swatch off the glint
  //   flakeDensity  flakes per mm² of laid ink (shown sparsely: × FLAKE_SHOW_K)
  //   flakeSizeMm   flake / particle size; sizeJitter ± fraction
  //   spread        lateral flake spread in half-widths (>1: some past the edge)
  //   haloMm        fluorescent halo; bloomMm glow-in-the-dark bloom (Lights off)
  //   dayAlpha      glow ink coverage in daylight; grain day-time speckle
  const EFFECT_DEFAULTS = Object.freeze({
    metallic: Object.freeze({ strength: 0.7, baseDarken: 0.3, flakeDensity: 180, flakeSizeMm: 0.03, sizeJitter: 0.35, spread: 0.9 }),
    'dual-metallic': Object.freeze({ strength: 0.8, baseDarken: 0.1, flakeDensity: 260, flakeSizeMm: 0.04, sizeJitter: 0.35, spread: 0.9 }),
    fluorescent: Object.freeze({ strength: 0.8, haloMm: 0.15 }),
    glow: Object.freeze({ strength: 0.85, bloomMm: 0.45, grain: 0.5, dayAlpha: 0.6, flakeDensity: 120, flakeSizeMm: 0.05, sizeJitter: 0.5, spread: 0.85 }),
    glitter: Object.freeze({ strength: 0.85, flakeDensity: 320, flakeSizeMm: 0.05, sizeJitter: 0.5, spread: 1.2, alpha: 0.7 }),
    white: Object.freeze({ strength: 1, coverOnDark: 0.92 }),
  });

  // "Special inks" strip (ink-settings popover, Pen Picker New Pen tab).
  // Picking one sets pen.color + pen.effect (+ color2: the second colour of
  // a dual metallic, or the emission colour of a glow ink). Dual metallics
  // come with the Pentel Hybrid Dual Metallic model's own colours.
  const EFFECT_SWATCHES = Object.freeze([
    { id: 'metallic-gold', group: 'metallic', name: 'Metallic gold', hex: '#c9a24a', effect: 'metallic' },
    { id: 'metallic-silver', group: 'metallic', name: 'Metallic silver', hex: '#b8bcc2', effect: 'metallic' },
    { id: 'metallic-copper', group: 'metallic', name: 'Metallic copper', hex: '#b8673a', effect: 'metallic' },
    { id: 'metallic-bronze', group: 'metallic', name: 'Metallic bronze', hex: '#8c6a3a', effect: 'metallic' },
    { id: 'metallic-rose-gold', group: 'metallic', name: 'Metallic rose gold', hex: '#d39a8c', effect: 'metallic' },
    { id: 'neon-green', group: 'fluorescent', name: 'Neon green', hex: '#5dff4a', effect: 'fluorescent' },
    { id: 'neon-pink', group: 'fluorescent', name: 'Neon pink', hex: '#ff3fa4', effect: 'fluorescent' },
    { id: 'neon-orange', group: 'fluorescent', name: 'Neon orange', hex: '#ff6a1a', effect: 'fluorescent' },
    { id: 'neon-yellow', group: 'fluorescent', name: 'Neon yellow', hex: '#e9ff2a', effect: 'fluorescent' },
    { id: 'neon-blue', group: 'fluorescent', name: 'Neon blue', hex: '#4ab8ff', effect: 'fluorescent' },
    { id: 'glow-green', group: 'glow', name: 'Glow-in-the-dark green', hex: '#e6f2c8', effect: 'glow', color2: '#7dff9a' },
    { id: 'glow-aqua', group: 'glow', name: 'Glow-in-the-dark aqua', hex: '#e2f0ee', effect: 'glow', color2: '#5ae0ff' },
    { id: 'glitter-gold', group: 'glitter', name: 'Glitter gold', hex: '#c8a048', effect: 'glitter' },
    { id: 'glitter-silver', group: 'glitter', name: 'Glitter silver', hex: '#b8bcc2', effect: 'glitter' },
    { id: 'glitter-clear', group: 'glitter', name: 'Glitter clear', hex: '#f4f4f0', effect: 'glitter' },
    { id: 'opaque-white', group: 'white', name: 'Opaque white', hex: '#f7f7f4', effect: 'white' },
  ].map((s) => Object.freeze(s)));
  const EFFECT_GROUP_LABELS = Object.freeze({
    metallic: 'Metallic', fluorescent: 'Neon', glow: 'Glow in the dark', glitter: 'Glitter', white: 'Opaque white',
  });
  // Emission colour of a glow ink without its own color2.
  const GLOW_DEFAULT_HEX = '#7dff9a';

  // Special-inks layer + "Lights off" view (src/render/ink-renderer.js).
  const FX_LIMITS = Object.freeze({
    flakeBudget: 20000,      // flakes drawn per pen per frame (deterministic thinning above)
    flakeMinPx: 0.7,         // below this a flake is sub-pixel: mean sheen tint instead
    flakeShowK: 0.06,        // fraction of the nominal flake density shown as sparkles
    flakeCellMm: 0.5,        // arc-length cell of the flake hash (mm-locked)
    maxFlakesPerPath: 60000, // per-path generation cap
    edgePx: 3,               // laid width (device px) above which the edge highlight runs per segment
    edgeSegBudget: 20000,    // sheen / edge samples per pen per frame (the sampling step grows above it)
    haloMinPx: 0.5,          // fluorescent halo below this is skipped
    bloomMaxPx: 64,          // Lights off bloom radius cap (device px)
    lightsOffDim: 'rgba(3,5,9,0.965)', // the sheet with the lights off (~3 % luminance)
  });

  // How a plain colour + diameter pen behaves on REALISTIC paper (item: ink
  // may bleed). On paper 'None' a plain pen is never touched: the renderer
  // keeps its exact pre-model path. dryskipResponse 0.5 and wetness 0.5 are
  // the neutral points (today's dry-skip mask and bleed halo at full weight).
  const PLAIN_TRAITS = Object.freeze({
    absorbentWidthGainMm: 0,
    opacity: 1,
    coverOnDark: 1,
    blend: 'paper',
    overlapDarkening: 0,
    edge: Object.freeze({ roughness: 0.14, scaleMm: 0.05, softnessMm: 0 }),
    bleed: Object.freeze({ wetness: 0.5, featherResponse: 0.5 }),
    dryskipResponse: 0.5,
    startBlob: Object.freeze({ mm: 0.04, probability: 0.3 }),
    endPool: Object.freeze({ mm: 0.03 }),
    cornerPool: 0.1,
    starvation: Object.freeze({ lengthMm: 0, strength: 0 }),
    skip: Object.freeze({ rate: 0, lengthMm: 1 }),
    widthJitter: Object.freeze({ amount: 0.02, scaleMm: 6 }),
  });

  // Per-pen ink overrides (pen.ink) — the ink-settings popover sliders. Each
  // value REPLACES the model's default; a missing key means "model default".
  //   wetness   bleed.wetness           roughness  edge.roughness
  //   opacity   opacity (coverOnDark scales with it on dark stock)
  //   blobs     multiplier on start blob / end pool / corner pool (1 = model)
  //   skips     skip.rate               jitter     widthJitter.amount
  //   effectStrength / flakeDensity     special-inks layer (sheen, glints,
  //                                     halo, glow; flakes per mm²)
  const INK_KEYS = Object.freeze(['wetness', 'roughness', 'opacity', 'blobs', 'skips', 'jitter', 'effectStrength', 'flakeDensity']);
  const PARAM_LIMITS = Object.freeze({
    wetness: Object.freeze([0, 1]),
    roughness: Object.freeze([0, 0.6]),
    opacity: Object.freeze([0.05, 1]),
    blobs: Object.freeze([0, 3]),
    skips: Object.freeze([0, 0.25]),
    jitter: Object.freeze([0, 0.3]),
    effectStrength: Object.freeze([0, 1]),
    flakeDensity: Object.freeze([0, 600]),
  });

  const LIMITS = Object.freeze({
    // Pen record caps (validator).
    modelIdMaxLen: 48,
    penIdMaxLen: 64,
    sizeMaxLen: 48,
    dyeOnDarkFloor: 0.12,                // a dye on black stock still leaves a faint trace
    // Ribbon renderer (src/render/ink-renderer.js).
    ribbonCacheBytes: 48 * 1024 * 1024, // LRU cap over cached ribbons (grows to 1.5× the drawn set)
    ribbonHardBytes: 128 * 1024 * 1024,  // … but never past this
    ribbonVisibleBytes: 80 * 1024 * 1024, // visible ribbons above this use a coarser (still nested) spacing
    buildBudgetMs: 8,                    // exact builds per frame before falling back
    coarseBudgetMs: 12,                  // extra budget for coarse (ds × 4) fallbacks
    refineSliceMs: 10,                   // idle refinement slice
    tierPx: 0.35,                        // pool / blob size (device px) that switches on the skeleton tier
    ribbonPx: 0.35,                      // visible edge lump size (device px) that switches on the ribbon tier
    ribbonMinPxPerMm: 8,                 // never ribbon below this zoom: lumps are sub-pixel and the fill raster dominates the frame
    minSampleMm: 0.012,                  // finest ribbon sample spacing
    maxSamplesPerPath: 400000,
    flattenTolMm: 0.01,                  // curve flattening tolerance
    cornerDeg: 35,                       // a turn sharper than this is a corner (pool + round join)
  });

  // Pen library ("My pens") / pen files (src/core/pen-library.js). A pen file
  // is { schema:'vectura-pens', version:1, appVersion, pens:[…] }; My pens is
  // stored in localStorage under LIBRARY_KEY in the same shape.
  const LIBRARY_KEY = 'vectura.penLibrary';
  const SCHEMA = Object.freeze({ id: 'vectura-pens', version: 1 });
  const FILE_LIMITS = Object.freeze({
    maxBytes: 256 * 1024,   // pen file import cap
    maxPens: 64,            // pens per imported file
    libraryMax: 128,        // My pens entries
    libraryMaxBytes: 256 * 1024,
    nameMax: 48,
    fileStem: 'vectura-pens',
    libraryIdPrefix: 'mypen-',
  });

  Vectura.PEN_MODELS = {
    MODELS, ORDER, CLASS_ORDER, CLASS_LABELS, EFFECTS, EFFECT_DEFAULTS, EFFECT_SWATCHES, EFFECT_GROUP_LABELS, GLOW_DEFAULT_HEX,
    FX_LIMITS, PLAIN_TRAITS, INK_KEYS, PARAM_LIMITS, LIMITS, LIBRARY_KEY, SCHEMA, FILE_LIMITS,
  };
})();
