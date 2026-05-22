/**
 * Vectura mirror panel (v2 redesign).
 *
 * Replaces the legacy buildMirrorModifierControls() flat stack with:
 *   - Top: persistent mirror stack (rows with thumb / color dot / name / summary / eye / lock / trash).
 *   - Bottom: editor with a clickable type-chip header + 4-up picker mode.
 *   - Per-type config bodies: line / radial / arc / wallpaper.
 *   - Inline info popovers with backdrop, escape-to-close.
 *   - Drag-to-rotate angle dial with Shift = 15° snap.
 *
 * State model is unchanged — fields read straight from the existing
 * createMirror{Line,Radial,Arc,Wallpaper} factories:
 *   line:      angle, xShift, yShift, replacedSide ('positive'|'negative')
 *   radial:    count, mode, centerX, centerY, angle
 *   arc:       centerX, centerY, radius, arcStart, arcEnd, replacedSide,
 *              strength, falloff, clipToArc, rotationOffset, copies
 *   wallpaper: group, tileWidth, tileHeight, tileAngle, rotation, centerX, centerY, domainScale
 *
 * Entry point: window.Vectura.UI.MirrorPanel.build(uiCtx, layer, container).
 * algo-config-panel.js calls this when the active layer is a mirror modifier.
 *
 * Reorder grip uses the existing .noise-card / .noise-drop-indicator drag
 * machinery so it composes with the rest of the modifier stack styling.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  /* ---------- type metadata ---------- */
  const TYPES = {
    line:      { label: 'Line',      hue: 'var(--mirror-line-hue)',   hueRaw: '#4e9ee1', tag: 'Reflect across a straight axis',     preview: 'mp-prev-line'  },
    radial:    { label: 'Radial',    hue: 'var(--mirror-radial-hue)', hueRaw: '#c084fc', tag: 'N-fold kaleidoscope around a point', preview: 'mp-prev-radial' },
    arc:       { label: 'Arc',       hue: 'var(--mirror-arc-hue)',    hueRaw: '#f0a85f', tag: 'Reflect through a circular surface', preview: 'mp-prev-arc'    },
    wallpaper: { label: 'Wallpaper', hue: 'var(--mirror-wall-hue)',   hueRaw: '#5cd99a', tag: 'Tile with one of 17 symmetries',     preview: 'mp-prev-wall'   },
  };

  // Derived from WallpaperGroups.FEATURES so the family field stays in lockstep
  // with the math file's lattice classification. (The pre-2026-05-21 hand-keyed
  // list mis-classified cmm as 'sq' even though it's rhombic.) Falls back to a
  // hard-coded list when the dependency isn't loaded yet — keeps the legacy
  // unit-test shape (length 17, lattice families).
  const buildWallGroups = () => {
    const FEATURES = window.Vectura?.WallpaperGroups?.FEATURES;
    if (FEATURES) {
      return Object.keys(FEATURES).map((id) => ({ id, family: FEATURES[id].lattice }));
    }
    return [
      { id: 'p1', family: 'oblique' }, { id: 'p2', family: 'oblique' },
      { id: 'pm', family: 'rectangular' }, { id: 'pg', family: 'rectangular' },
      { id: 'cm', family: 'rhombic' }, { id: 'pmm', family: 'rectangular' },
      { id: 'pmg', family: 'rectangular' }, { id: 'pgg', family: 'rectangular' },
      { id: 'cmm', family: 'rhombic' }, { id: 'p4', family: 'square' },
      { id: 'p4m', family: 'square' }, { id: 'p4g', family: 'square' },
      { id: 'p3', family: 'hexagonal' }, { id: 'p3m1', family: 'hexagonal' },
      { id: 'p31m', family: 'hexagonal' }, { id: 'p6', family: 'hexagonal' },
      { id: 'p6m', family: 'hexagonal' },
    ];
  };
  const WALL_GROUPS = buildWallGroups();

  // Friendly labels for the composable chip rows.
  const LATTICE_LABELS = {
    oblique:     'Parallelogram',
    rectangular: 'Rectangle',
    rhombic:     'Rhombus',
    square:      'Square',
    hexagonal:   'Hexagon',
  };
  const MIRROR_LABELS = {
    'none':           'None',
    'straight':       'Straight',
    'glide':          'Glide',
    'straight+glide': 'Straight + Glide',
    'corners':        'Through corners',
    'edges':          'Through edges',
    'all':            'All',
  };
  const ROTATION_LABEL = (n) => `${n}-fold`;

  const WALL_GROUP_DESC = {
    p1:   'Translation only — the tile slides but never rotates or mirrors.',
    p2:   'Half-turn (180°) rotation. No mirror lines.',
    pm:   'Parallel straight mirror lines.',
    pg:   'Parallel glide mirrors — slide along the line, then flip.',
    cm:   'Staggered (zig-zag) mirror lines.',
    pmm:  'Grid of perpendicular straight mirror lines.',
    pmg:  'Mirror lines in one direction, glide mirrors crossing them.',
    pgg:  'Two sets of perpendicular glide mirrors. No straight mirrors.',
    cmm:  'Two sets of perpendicular mirrors plus rotations — diamond grid.',
    p4:   'Quarter-turn (90°) rotations only. No mirror lines.',
    p4m:  'Full square symmetry — quarter-turns plus mirrors. Like a windowpane.',
    p4g:  'Quarter-turn rotations plus glide mirrors instead of straight ones.',
    p3:   'Third-turn (120°) rotations only. No mirror lines.',
    p3m1: '120° rotations with mirrors running through tile corners.',
    p31m: '120° rotations with mirrors running through tile edges.',
    p6:   'Sixth-turn (60°) rotations only. Like a snowflake without mirrors.',
    p6m:  'Full hexagonal symmetry — every rotation and every mirror.',
  };

  /* ---------- info topics ---------- */
  const keyRow = (code, sym, text) => `
    <div class="mp-ip-key-row">
      <span class="mp-ip-key-code">${code}</span>
      <svg class="mp-ip-key-svg" viewBox="0 0 36 24"><use href="#mp-${sym}"/></svg>
      <span>${text}</span>
    </div>`;

  const INFO_TOPICS = {
    'source-side': {
      tag: 'Line mirror · which half is kept',
      title: 'Source side',
      body: `
        <p>Pick which side of the mirror axis is the <strong>source</strong> — the half whose geometry gets reflected over to the other side.</p>
        <p><code>Positive</code> keeps the right (or above-axis) side as the source; the opposite side becomes the reflection.</p>
        <p><code>Negative</code> keeps the left (or below-axis) side instead.</p>
        <div class="mp-ip-note">Reflecting a half-shape that touches the axis gives a smooth, joined silhouette. Useful for arches, faces, lettering.</div>`,
    },
    'radial-mode': {
      tag: 'Radial mirror · how wedges relate',
      title: 'Symmetry mode',
      body: `
        <p>Three ways to arrange copies around the center.</p>
        <p><strong>Rotation</strong> — every wedge is just a rotated copy of the source. No reflections. Looks like a windmill.</p>
        <p><strong>Dihedral</strong> — rotation <em>plus</em> reflection. Every wedge has a mirror twin, doubling the symmetry. The classic kaleidoscope.</p>
        <p><strong>Edge</strong> — alternating wedges are mirror-flipped across each wedge boundary. Cleanest plotter output: each wedge holds one slice of the source.</p>`,
    },
    'arc-side': {
      tag: 'Arc mirror · which side is warped',
      title: 'Reflect side',
      body: `
        <p>The arc surface (the dashed circle) splits the canvas into <strong>inside</strong> and <strong>outside</strong>. Pick which side stays untouched and which gets the warped reflection.</p>
        <p><code>Outer</code> — geometry outside the circle stays straight; the inside becomes the inversion.</p>
        <p><code>Inner</code> — geometry inside the circle stays straight; the outside fans/splays away from the surface.</p>`,
    },
    'wall-rect': {
      tag: 'Lattice family · 8 groups',
      title: 'Rectangular & oblique',
      body: `
        <p>Patterns that repeat on a <strong>rectangular grid</strong>. The name tells you three things — the lattice type, the strongest rotation, and which kinds of mirrors exist.</p>
        <div class="mp-ip-key">
          <h5>Reading the names</h5>
          ${keyRow('p',  'kp',    'Primitive grid — one tile per repeat.')}
          ${keyRow('c',  'kc',    'Centered grid — adds a half-step "rhombus" tile.')}
          ${keyRow('1',  'kp',    'No rotation — just sliding (the <code>1</code> is implicit).')}
          ${keyRow('2',  'krot2', 'Half-turn (180°) rotation lives somewhere in the tile.')}
          ${keyRow('m',  'km',    'Straight mirror line — fold the tile and it matches.')}
          ${keyRow('g',  'kg',    'Glide mirror — slide along the line, <em>then</em> flip.')}
        </div>
        <div class="mp-ip-note">So <code>pmm</code> = rectangular grid, two perpendicular straight mirrors. <code>pgg</code> = same grid but glide mirrors only.</div>`,
    },
    'wall-sq': {
      tag: 'Lattice family · 4 groups',
      title: 'Square symmetry',
      body: `
        <p>Patterns that fit a <strong>square grid</strong>, so a quarter-turn rotation (90°) brings the tile back onto itself.</p>
        <div class="mp-ip-key">
          <h5>Reading the names</h5>
          ${keyRow('4',  'krot4', 'Quarter-turn (90°) rotation — the defining feature.')}
          ${keyRow('m',  'km',    'Straight mirror lines — full windowpane symmetry.')}
          ${keyRow('g',  'kg',    'Glide mirrors instead of straight ones.')}
          ${keyRow('cm', 'kc',    'Diagonal mirrors on a centered grid (used in <code>cmm</code>).')}
        </div>
        <div class="mp-ip-note">So <code>p4</code> rotates only, <code>p4m</code> adds straight mirrors, <code>p4g</code> uses glides, and <code>cmm</code> sits on a 45°-rotated lattice.</div>`,
    },
    'wall-hex': {
      tag: 'Lattice family · 5 groups',
      title: 'Hexagonal symmetry',
      body: `
        <p>Six-fold lattices — <strong>honeycombs, snowflakes, kaleidoscopes</strong>. Rotations of 60° or 120° are possible.</p>
        <div class="mp-ip-key">
          <h5>Reading the names</h5>
          ${keyRow('3',  'krot3', 'Third-turn (120°) rotation — three-fold symmetry.')}
          ${keyRow('6',  'krot6', 'Sixth-turn (60°) rotation — six-fold (snowflake) symmetry.')}
          ${keyRow('m',  'km',    'Mirror line. In <code>p3m1</code> mirrors run through tile <em>corners</em>; in <code>p31m</code> through <em>edges</em>.')}
        </div>
        <div class="mp-ip-note"><code>p3</code> and <code>p6</code> rotate only. <code>p6m</code> is the most symmetric of the 17 — every mirror and every rotation that fits a hexagon.</div>`,
    },
  };

  /* ---------- SVG sprite (injected once) ---------- */
  const SPRITE_ID = 'mp-sprite';
  const SPRITE_HTML = `
    <symbol id="mp-prev-line" viewBox="0 0 100 60">
      <line x1="50" y1="2" x2="50" y2="58" stroke="var(--mirror-line-hue)" stroke-width="0.8" stroke-dasharray="2.5 2"/>
      <g stroke-linecap="round" fill="none" stroke-width="1.5">
        <path d="M 50 32 C 50 38, 44 38, 44 44 L 44 60" stroke="#9ec5e8"/>
        <path d="M 50 32 C 50 38, 56 38, 56 44 L 56 60" stroke="var(--mirror-line-hue)"/>
        <path d="M 50 18 C 50 27, 34 27, 34 33 L 34 60" stroke="#9ec5e8"/>
        <path d="M 50 18 C 50 27, 66 27, 66 33 L 66 60" stroke="var(--mirror-line-hue)"/>
        <path d="M 50 4  C 50 16, 22 16, 22 24 L 22 60" stroke="#9ec5e8"/>
        <path d="M 50 4  C 50 16, 78 16, 78 24 L 78 60" stroke="var(--mirror-line-hue)"/>
      </g>
    </symbol>
    <symbol id="mp-prev-radial" viewBox="0 0 100 60">
      <circle cx="50" cy="30" r="2" fill="var(--mirror-radial-hue)"/>
      <g stroke="var(--mirror-radial-hue)" stroke-width="1.4" fill="none" transform="translate(50 30)">
        <g><path d="M0 -22 q4 8 0 16"/></g>
        <g transform="rotate(60)"><path d="M0 -22 q4 8 0 16"/></g>
        <g transform="rotate(120)"><path d="M0 -22 q4 8 0 16"/></g>
        <g transform="rotate(180)"><path d="M0 -22 q4 8 0 16"/></g>
        <g transform="rotate(240)"><path d="M0 -22 q4 8 0 16"/></g>
        <g transform="rotate(300)"><path d="M0 -22 q4 8 0 16"/></g>
      </g>
    </symbol>
    <symbol id="mp-prev-arc" viewBox="0 0 100 60">
      <circle cx="50" cy="30" r="17" fill="none" stroke="var(--mirror-arc-hue)" stroke-width="0.8" stroke-dasharray="2.2 2"/>
      <g stroke="#f3c694" stroke-width="1.4" fill="none" stroke-linecap="round">
        <path d="M 2 4  Q 22 16 40.4 16 L 59.6 16 Q 78 16 98 4"/>
        <path d="M 2 17 Q 22 23 34.5 23 L 65.5 23 Q 78 23 98 17"/>
        <path d="M 2 30 L 98 30"/>
        <path d="M 2 43 Q 22 37 34.5 37 L 65.5 37 Q 78 37 98 43"/>
        <path d="M 2 56 Q 22 44 40.4 44 L 59.6 44 Q 78 44 98 56"/>
      </g>
      <circle cx="50" cy="30" r="1.4" fill="var(--mirror-arc-hue)"/>
    </symbol>
    <symbol id="mp-prev-wall" viewBox="0 0 100 60">
      <g stroke="var(--mirror-wall-hue)" stroke-width="1" fill="none">
        <path d="M10 10 L25 25 M25 10 L10 25"/><path d="M35 10 L50 25 M50 10 L35 25"/>
        <path d="M60 10 L75 25 M75 10 L60 25"/><path d="M85 10 L100 25 M100 10 L85 25"/>
        <path d="M10 35 L25 50 M25 35 L10 50"/><path d="M35 35 L50 50 M50 35 L35 50"/>
        <path d="M60 35 L75 50 M75 35 L60 50"/><path d="M85 35 L100 50 M100 35 L85 50"/>
      </g>
    </symbol>

    <symbol id="mp-mode-rotate" viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="1.6" fill="currentColor"/>
      <g transform="translate(16 16)" stroke="currentColor" fill="none">
        <path d="M0 -10 a4 4 0 0 1 3 5"/>
        <path transform="rotate(120)" d="M0 -10 a4 4 0 0 1 3 5"/>
        <path transform="rotate(240)" d="M0 -10 a4 4 0 0 1 3 5"/>
      </g>
    </symbol>
    <symbol id="mp-mode-dihedral" viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="1.4" fill="currentColor"/>
      <g transform="translate(16 16)" stroke="currentColor" fill="none">
        <path d="M0 -10 q3 4 0 8"/><path d="M0 -10 q-3 4 0 8"/>
        <g transform="rotate(120)"><path d="M0 -10 q3 4 0 8"/><path d="M0 -10 q-3 4 0 8"/></g>
        <g transform="rotate(240)"><path d="M0 -10 q3 4 0 8"/><path d="M0 -10 q-3 4 0 8"/></g>
      </g>
    </symbol>
    <symbol id="mp-mode-edge" viewBox="0 0 32 32">
      <g stroke-dasharray="1.6 1.6" opacity="0.5" stroke="currentColor" fill="none">
        <line x1="16" y1="3" x2="16" y2="29"/><line x1="5" y1="22" x2="27" y2="10"/><line x1="5" y1="10" x2="27" y2="22"/>
      </g>
      <g transform="translate(16 16)" stroke="currentColor" fill="none">
        <path d="M-7 -7 l5 0 l-3 6 z"/>
        <g transform="rotate(60)"><path d="M-7 -7 l5 0 l-3 6 z"/></g>
        <g transform="rotate(120)"><path d="M-7 -7 l5 0 l-3 6 z"/></g>
        <g transform="rotate(180)"><path d="M-7 -7 l5 0 l-3 6 z"/></g>
        <g transform="rotate(240)"><path d="M-7 -7 l5 0 l-3 6 z"/></g>
        <g transform="rotate(300)"><path d="M-7 -7 l5 0 l-3 6 z"/></g>
      </g>
    </symbol>

    <symbol id="mp-side-pos" viewBox="0 0 32 32">
      <line x1="16" y1="3" x2="16" y2="29" stroke-dasharray="1.5 1.5" stroke="currentColor"/>
      <rect x="17" y="9" width="11" height="14" fill="currentColor" opacity="0.18"/>
      <path d="M22 13 q5 4 0 8" stroke="currentColor" fill="none"/>
      <path d="M10 13 q-5 4 0 8" stroke="currentColor" fill="none" opacity="0.4"/>
    </symbol>
    <symbol id="mp-side-neg" viewBox="0 0 32 32">
      <line x1="16" y1="3" x2="16" y2="29" stroke-dasharray="1.5 1.5" stroke="currentColor"/>
      <rect x="4" y="9" width="11" height="14" fill="currentColor" opacity="0.18"/>
      <path d="M10 13 q-5 4 0 8" stroke="currentColor" fill="none"/>
      <path d="M22 13 q5 4 0 8" stroke="currentColor" fill="none" opacity="0.4"/>
    </symbol>
    <symbol id="mp-side-outer" viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="10" stroke-dasharray="1.5 1.5" opacity="0.6" fill="none" stroke="currentColor"/>
      <g stroke-linecap="round" fill="none" stroke="currentColor">
        <path d="M 0 8 L 10 8 Q 16 12 22 8 L 32 8"/>
        <path d="M 0 12 L 6.83 12 Q 16 14.5 25.17 12 L 32 12"/>
        <path d="M 0 16 L 32 16"/>
        <path d="M 0 20 L 6.83 20 Q 16 17.5 25.17 20 L 32 20"/>
        <path d="M 0 24 L 10 24 Q 16 20 22 24 L 32 24"/>
      </g>
    </symbol>
    <symbol id="mp-side-inner" viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="10" stroke-dasharray="1.5 1.5" opacity="0.6" fill="none" stroke="currentColor"/>
      <g stroke-linecap="round" fill="none" stroke="currentColor">
        <path d="M 0 0 Q 5 8 10 8 L 22 8 Q 27 8 32 0"/>
        <path d="M 0 6 Q 4 12 6.83 12 L 25.17 12 Q 28 12 32 6"/>
        <path d="M 0 16 L 32 16"/>
        <path d="M 0 26 Q 4 20 6.83 20 L 25.17 20 Q 28 20 32 26"/>
        <path d="M 0 32 Q 5 24 10 24 L 22 24 Q 27 24 32 32"/>
      </g>
    </symbol>

    <!-- Wallpaper-group atlas icons.
         Asymmetric F-glyph (no X/Y symmetry) instanced per group with
         the correct rotations, hflips, and axis lines. Mirror axes use
         dash 1.5 1.5; glide axes use dash 0.5 2.0. Rotation centers are
         marked with order-coded shapes: lens=2, triangle=3, square=4,
         hexlet=6. See mockups/mirror-iconset.html for the design preview
         and mockups/mirror-iconset-spec.md for per-group rationale. -->
    <g id="mp-wg-glyph" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="-3" y="-3" width="6" height="6" rx="0.7"/>
      <path d="M-1.5 -1.5 H1.5 V1.5"/>
      <path d="M-1.5 1.5 L1.5 -1.5"/>
    </g>
    <g id="mp-wg-lens"><path d="M-1.2 0 Q0 -0.7 1.2 0 Q0 0.7 -1.2 0 Z"/></g>
    <g id="mp-wg-tri"><path d="M0 -1.4 L1.21 0.7 L-1.21 0.7 Z"/></g>
    <g id="mp-wg-sq"><rect x="-1" y="-1" width="2" height="2"/></g>
    <g id="mp-wg-hex"><path d="M-0.7 -1.2 L0.7 -1.2 L1.4 0 L0.7 1.2 L-0.7 1.2 L-1.4 0 Z"/></g>

    <symbol id="mp-wg-p1" viewBox="0 0 32 32">
      <path d="M9 9 L24 9 L28 23 L13 23 Z" fill="none" stroke="currentColor" stroke-width="0.8" stroke-dasharray="0.5 2.0" opacity="0.35"/>
      <use href="#mp-wg-glyph" transform="translate(9 9)"/>
      <use href="#mp-wg-glyph" transform="translate(24 9)"/>
      <use href="#mp-wg-glyph" transform="translate(13 23)"/>
      <use href="#mp-wg-glyph" transform="translate(28 23)"/>
    </symbol>

    <symbol id="mp-wg-p2" viewBox="0 0 32 32">
      <use href="#mp-wg-lens" transform="translate(16 16)"/>
      <use href="#mp-wg-lens" transform="translate(16 9)"/>
      <use href="#mp-wg-lens" transform="translate(16 23)"/>
      <use href="#mp-wg-lens" transform="translate(8 16)"/>
      <use href="#mp-wg-lens" transform="translate(24 16)"/>
      <use href="#mp-wg-glyph" transform="translate(8 9)"/>
      <use href="#mp-wg-glyph" transform="translate(24 9) rotate(180)"/>
      <use href="#mp-wg-glyph" transform="translate(8 23) rotate(180)"/>
      <use href="#mp-wg-glyph" transform="translate(24 23)"/>
    </symbol>

    <symbol id="mp-wg-pm" viewBox="0 0 32 32">
      <g stroke="currentColor" stroke-width="1.1" stroke-dasharray="1.5 1.5" opacity="0.5" fill="none">
        <line x1="16" y1="3" x2="16" y2="29"/>
        <line x1="3" y1="3" x2="3" y2="29"/>
      </g>
      <use href="#mp-wg-glyph" transform="translate(8 9)"/>
      <use href="#mp-wg-glyph" transform="translate(24 9) scale(-1 1)"/>
      <use href="#mp-wg-glyph" transform="translate(8 23)"/>
      <use href="#mp-wg-glyph" transform="translate(24 23) scale(-1 1)"/>
    </symbol>

    <symbol id="mp-wg-pg" viewBox="0 0 32 32">
      <line x1="3" y1="16" x2="29" y2="16" stroke="currentColor" stroke-width="1.1" stroke-dasharray="0.5 2.0" opacity="0.45"/>
      <path d="M26 13.5 L28.3 15 L26 16.5" fill="none" stroke="currentColor" stroke-width="1.0" opacity="0.55"/>
      <use href="#mp-wg-glyph" transform="translate(8 10)"/>
      <use href="#mp-wg-glyph" transform="translate(22 10)"/>
      <use href="#mp-wg-glyph" transform="translate(15 22) scale(1 -1)"/>
      <use href="#mp-wg-glyph" transform="translate(29 22) scale(1 -1)"/>
    </symbol>

    <symbol id="mp-wg-cm" viewBox="0 0 32 32">
      <g stroke="currentColor" stroke-width="1.1" fill="none">
        <line x1="16" y1="3" x2="16" y2="29" stroke-dasharray="1.5 1.5" opacity="0.5"/>
        <line x1="3"  y1="3" x2="3"  y2="29" stroke-dasharray="1.5 1.5" opacity="0.5"/>
        <line x1="8"  y1="3" x2="8"  y2="29" stroke-dasharray="0.5 2.0" opacity="0.45"/>
      </g>
      <use href="#mp-wg-glyph" transform="translate(8 9)"/>
      <use href="#mp-wg-glyph" transform="translate(24 9) scale(-1 1)"/>
      <use href="#mp-wg-glyph" transform="translate(16 23)"/>
      <use href="#mp-wg-glyph" transform="translate(0 23) scale(-1 1)"/>
    </symbol>

    <symbol id="mp-wg-pmm" viewBox="0 0 32 32">
      <g stroke="currentColor" stroke-width="1.1" stroke-dasharray="1.5 1.5" opacity="0.5" fill="none">
        <line x1="16" y1="3" x2="16" y2="29"/>
        <line x1="3" y1="16" x2="29" y2="16"/>
      </g>
      <use href="#mp-wg-lens" transform="translate(16 16)"/>
      <use href="#mp-wg-glyph" transform="translate(8 9)"/>
      <use href="#mp-wg-glyph" transform="translate(24 9) scale(-1 1)"/>
      <use href="#mp-wg-glyph" transform="translate(8 23) scale(1 -1)"/>
      <use href="#mp-wg-glyph" transform="translate(24 23) scale(-1 -1)"/>
    </symbol>

    <symbol id="mp-wg-pmg" viewBox="0 0 32 32">
      <line x1="16" y1="3" x2="16" y2="29" stroke="currentColor" stroke-width="1.1" stroke-dasharray="1.5 1.5" opacity="0.5"/>
      <line x1="3" y1="16" x2="29" y2="16" stroke="currentColor" stroke-width="1.1" stroke-dasharray="0.5 2.0" opacity="0.45"/>
      <use href="#mp-wg-lens" transform="translate(8 16)"/>
      <use href="#mp-wg-lens" transform="translate(24 16)"/>
      <use href="#mp-wg-glyph" transform="translate(8 9)"/>
      <use href="#mp-wg-glyph" transform="translate(24 9) scale(-1 1)"/>
      <use href="#mp-wg-glyph" transform="translate(0 23) scale(1 -1)"/>
      <use href="#mp-wg-glyph" transform="translate(16 23) rotate(180)"/>
    </symbol>

    <symbol id="mp-wg-pgg" viewBox="0 0 32 32">
      <g stroke="currentColor" stroke-width="1.1" stroke-dasharray="0.5 2.0" opacity="0.45" fill="none">
        <line x1="16" y1="3" x2="16" y2="29"/>
        <line x1="3" y1="16" x2="29" y2="16"/>
      </g>
      <use href="#mp-wg-lens" transform="translate(8 8)"/>
      <use href="#mp-wg-lens" transform="translate(24 8)"/>
      <use href="#mp-wg-lens" transform="translate(8 24)"/>
      <use href="#mp-wg-lens" transform="translate(24 24)"/>
      <use href="#mp-wg-glyph" transform="translate(8 12)"/>
      <use href="#mp-wg-glyph" transform="translate(24 12) scale(-1 1)"/>
      <use href="#mp-wg-glyph" transform="translate(0 20) scale(1 -1)"/>
      <use href="#mp-wg-glyph" transform="translate(16 20) rotate(180)"/>
    </symbol>

    <symbol id="mp-wg-cmm" viewBox="0 0 32 32">
      <g stroke="currentColor" stroke-width="1.1" fill="none">
        <line x1="16" y1="3" x2="16" y2="29" stroke-dasharray="1.5 1.5" opacity="0.5"/>
        <line x1="3" y1="16" x2="29" y2="16" stroke-dasharray="1.5 1.5" opacity="0.5"/>
        <line x1="5" y1="5" x2="27" y2="27" stroke-dasharray="0.5 2.0" opacity="0.45"/>
        <line x1="5" y1="27" x2="27" y2="5" stroke-dasharray="0.5 2.0" opacity="0.45"/>
      </g>
      <use href="#mp-wg-lens" transform="translate(16 16)"/>
      <use href="#mp-wg-glyph" transform="translate(8 9)"/>
      <use href="#mp-wg-glyph" transform="translate(24 9) scale(-1 1)"/>
      <use href="#mp-wg-glyph" transform="translate(8 23) scale(1 -1)"/>
      <use href="#mp-wg-glyph" transform="translate(24 23) scale(-1 -1)"/>
    </symbol>

    <symbol id="mp-wg-p4" viewBox="0 0 32 32">
      <use href="#mp-wg-sq" transform="translate(16 16)"/>
      <use href="#mp-wg-lens" transform="translate(22 10)"/>
      <use href="#mp-wg-lens" transform="translate(22 22)"/>
      <use href="#mp-wg-lens" transform="translate(10 22)"/>
      <use href="#mp-wg-lens" transform="translate(10 10)"/>
      <use href="#mp-wg-glyph" transform="translate(16 16) rotate(0)   translate(0 -8)"/>
      <use href="#mp-wg-glyph" transform="translate(16 16) rotate(90)  translate(0 -8)"/>
      <use href="#mp-wg-glyph" transform="translate(16 16) rotate(180) translate(0 -8)"/>
      <use href="#mp-wg-glyph" transform="translate(16 16) rotate(270) translate(0 -8)"/>
    </symbol>

    <symbol id="mp-wg-p4m" viewBox="0 0 32 32">
      <g stroke="currentColor" stroke-width="1.1" stroke-dasharray="1.5 1.5" opacity="0.5" fill="none">
        <line x1="16" y1="3" x2="16" y2="29"/>
        <line x1="3" y1="16" x2="29" y2="16"/>
        <line x1="4" y1="4" x2="28" y2="28"/>
        <line x1="4" y1="28" x2="28" y2="4"/>
      </g>
      <use href="#mp-wg-sq" transform="translate(16 16)"/>
      <g transform="translate(16 16)">
        <g transform="rotate(22.5)  translate(0 -9)"><g transform="scale(0.7)"><use href="#mp-wg-glyph"/></g></g>
        <g transform="rotate(67.5)  translate(0 -9)"><g transform="scale(0.7)"><use href="#mp-wg-glyph" transform="scale(-1 1)"/></g></g>
        <g transform="rotate(112.5) translate(0 -9)"><g transform="scale(0.7)"><use href="#mp-wg-glyph"/></g></g>
        <g transform="rotate(157.5) translate(0 -9)"><g transform="scale(0.7)"><use href="#mp-wg-glyph" transform="scale(-1 1)"/></g></g>
        <g transform="rotate(202.5) translate(0 -9)"><g transform="scale(0.7)"><use href="#mp-wg-glyph"/></g></g>
        <g transform="rotate(247.5) translate(0 -9)"><g transform="scale(0.7)"><use href="#mp-wg-glyph" transform="scale(-1 1)"/></g></g>
        <g transform="rotate(292.5) translate(0 -9)"><g transform="scale(0.7)"><use href="#mp-wg-glyph"/></g></g>
        <g transform="rotate(337.5) translate(0 -9)"><g transform="scale(0.7)"><use href="#mp-wg-glyph" transform="scale(-1 1)"/></g></g>
      </g>
    </symbol>

    <symbol id="mp-wg-p4g" viewBox="0 0 32 32">
      <g stroke="currentColor" stroke-width="1.1" fill="none">
        <line x1="4" y1="4" x2="28" y2="28" stroke-dasharray="1.5 1.5" opacity="0.5"/>
        <line x1="4" y1="28" x2="28" y2="4" stroke-dasharray="1.5 1.5" opacity="0.5"/>
        <line x1="16" y1="3" x2="16" y2="29" stroke-dasharray="0.5 2.0" opacity="0.45"/>
        <line x1="3" y1="16" x2="29" y2="16" stroke-dasharray="0.5 2.0" opacity="0.45"/>
      </g>
      <use href="#mp-wg-sq" transform="translate(5 5)"/>
      <use href="#mp-wg-sq" transform="translate(27 5)"/>
      <use href="#mp-wg-sq" transform="translate(5 27)"/>
      <use href="#mp-wg-sq" transform="translate(27 27)"/>
      <use href="#mp-wg-lens" transform="translate(16 16)"/>
      <g transform="translate(16 16)">
        <g transform="rotate(22)  translate(0 -9)"><g transform="scale(0.65)"><use href="#mp-wg-glyph"/></g></g>
        <g transform="rotate(-22) translate(0 -9)"><g transform="scale(0.65)"><use href="#mp-wg-glyph" transform="scale(-1 1)"/></g></g>
        <g transform="rotate(68)  translate(0 -9)"><g transform="scale(0.65)"><use href="#mp-wg-glyph"/></g></g>
        <g transform="rotate(112) translate(0 -9)"><g transform="scale(0.65)"><use href="#mp-wg-glyph" transform="scale(-1 1)"/></g></g>
        <g transform="rotate(158) translate(0 -9)"><g transform="scale(0.65)"><use href="#mp-wg-glyph"/></g></g>
        <g transform="rotate(202) translate(0 -9)"><g transform="scale(0.65)"><use href="#mp-wg-glyph" transform="scale(-1 1)"/></g></g>
        <g transform="rotate(248) translate(0 -9)"><g transform="scale(0.65)"><use href="#mp-wg-glyph"/></g></g>
        <g transform="rotate(292) translate(0 -9)"><g transform="scale(0.65)"><use href="#mp-wg-glyph" transform="scale(-1 1)"/></g></g>
      </g>
    </symbol>

    <symbol id="mp-wg-p3" viewBox="0 0 32 32">
      <path d="M16 8 L9.07 20 L22.93 20 Z" fill="none" stroke="currentColor" stroke-width="0.8" stroke-dasharray="0.5 2.0" opacity="0.35"/>
      <use href="#mp-wg-tri" transform="translate(16 16)"/>
      <use href="#mp-wg-tri" transform="translate(5 14)"/>
      <use href="#mp-wg-tri" transform="translate(27 14)"/>
      <use href="#mp-wg-glyph" transform="translate(16 8)"/>
      <use href="#mp-wg-glyph" transform="translate(9.07 20) rotate(120)"/>
      <use href="#mp-wg-glyph" transform="translate(22.93 20) rotate(240)"/>
    </symbol>

    <symbol id="mp-wg-p3m1" viewBox="0 0 32 32">
      <g stroke="currentColor" stroke-width="1.1" stroke-dasharray="1.5 1.5" opacity="0.5" fill="none">
        <line x1="16" y1="3" x2="16" y2="29"/>
        <g transform="rotate(60 16 16)"><line x1="16" y1="3" x2="16" y2="29"/></g>
        <g transform="rotate(-60 16 16)"><line x1="16" y1="3" x2="16" y2="29"/></g>
      </g>
      <use href="#mp-wg-tri" transform="translate(16 16)"/>
      <use href="#mp-wg-tri" transform="translate(16 4)"/>
      <use href="#mp-wg-tri" transform="translate(16 28)"/>
      <g transform="translate(16 16)">
        <g transform="rotate(30)  translate(0 -8)"><g transform="scale(0.7)"><use href="#mp-wg-glyph"/></g></g>
        <g transform="rotate(90)  translate(0 -8)"><g transform="scale(0.7)"><use href="#mp-wg-glyph" transform="scale(-1 1)"/></g></g>
        <g transform="rotate(150) translate(0 -8)"><g transform="scale(0.7)"><use href="#mp-wg-glyph"/></g></g>
        <g transform="rotate(210) translate(0 -8)"><g transform="scale(0.7)"><use href="#mp-wg-glyph" transform="scale(-1 1)"/></g></g>
        <g transform="rotate(270) translate(0 -8)"><g transform="scale(0.7)"><use href="#mp-wg-glyph"/></g></g>
        <g transform="rotate(330) translate(0 -8)"><g transform="scale(0.7)"><use href="#mp-wg-glyph" transform="scale(-1 1)"/></g></g>
      </g>
    </symbol>

    <symbol id="mp-wg-p31m" viewBox="0 0 32 32">
      <g stroke="currentColor" stroke-width="1.1" stroke-dasharray="1.5 1.5" opacity="0.5" fill="none">
        <line x1="3" y1="16" x2="29" y2="16"/>
        <g transform="rotate(60 16 16)"><line x1="3" y1="16" x2="29" y2="16"/></g>
        <g transform="rotate(120 16 16)"><line x1="3" y1="16" x2="29" y2="16"/></g>
      </g>
      <use href="#mp-wg-tri" transform="translate(16 16)"/>
      <use href="#mp-wg-tri" transform="translate(27 10)"/>
      <use href="#mp-wg-tri" transform="translate(5 10)"/>
      <use href="#mp-wg-tri" transform="translate(16 29)"/>
      <g transform="translate(16 16)">
        <g transform="rotate(-60) translate(0 -8)"><g transform="scale(0.7)"><use href="#mp-wg-glyph" transform="scale(-1 1)"/></g></g>
        <g transform="rotate(0)   translate(0 -8)"><g transform="scale(0.7)"><use href="#mp-wg-glyph"/></g></g>
        <g transform="rotate(60)  translate(0 -8)"><g transform="scale(0.7)"><use href="#mp-wg-glyph" transform="scale(-1 1)"/></g></g>
        <g transform="rotate(120) translate(0 -8)"><g transform="scale(0.7)"><use href="#mp-wg-glyph"/></g></g>
        <g transform="rotate(180) translate(0 -8)"><g transform="scale(0.7)"><use href="#mp-wg-glyph" transform="scale(-1 1)"/></g></g>
        <g transform="rotate(240) translate(0 -8)"><g transform="scale(0.7)"><use href="#mp-wg-glyph"/></g></g>
      </g>
    </symbol>

    <symbol id="mp-wg-p6" viewBox="0 0 32 32">
      <use href="#mp-wg-hex" transform="translate(16 16)"/>
      <use href="#mp-wg-tri" transform="translate(10 16)"/>
      <use href="#mp-wg-tri" transform="translate(22 16)"/>
      <use href="#mp-wg-lens" transform="translate(16 10)"/>
      <use href="#mp-wg-lens" transform="translate(16 22)"/>
      <g transform="translate(16 16)">
        <g transform="rotate(0)   translate(0 -9)"><g transform="scale(0.7)"><use href="#mp-wg-glyph"/></g></g>
        <g transform="rotate(60)  translate(0 -9)"><g transform="scale(0.7)"><use href="#mp-wg-glyph"/></g></g>
        <g transform="rotate(120) translate(0 -9)"><g transform="scale(0.7)"><use href="#mp-wg-glyph"/></g></g>
        <g transform="rotate(180) translate(0 -9)"><g transform="scale(0.7)"><use href="#mp-wg-glyph"/></g></g>
        <g transform="rotate(240) translate(0 -9)"><g transform="scale(0.7)"><use href="#mp-wg-glyph"/></g></g>
        <g transform="rotate(300) translate(0 -9)"><g transform="scale(0.7)"><use href="#mp-wg-glyph"/></g></g>
      </g>
    </symbol>

    <symbol id="mp-wg-p6m" viewBox="0 0 32 32">
      <g stroke="currentColor" stroke-width="1.1" stroke-dasharray="1.5 1.5" opacity="0.5" fill="none">
        <line x1="3" y1="16" x2="29" y2="16"/>
        <g transform="rotate(30 16 16)"><line x1="3" y1="16" x2="29" y2="16"/></g>
        <g transform="rotate(60 16 16)"><line x1="3" y1="16" x2="29" y2="16"/></g>
        <g transform="rotate(90 16 16)"><line x1="3" y1="16" x2="29" y2="16"/></g>
        <g transform="rotate(120 16 16)"><line x1="3" y1="16" x2="29" y2="16"/></g>
        <g transform="rotate(150 16 16)"><line x1="3" y1="16" x2="29" y2="16"/></g>
      </g>
      <use href="#mp-wg-hex" transform="translate(16 16)"/>
      <use href="#mp-wg-tri" transform="translate(10 16)"/>
      <use href="#mp-wg-tri" transform="translate(22 16)"/>
      <use href="#mp-wg-lens" transform="translate(16 10)"/>
      <use href="#mp-wg-lens" transform="translate(16 22)"/>
      <g transform="translate(16 16)">
        <g transform="rotate(15)  translate(0 -10)"><g transform="scale(0.6)"><use href="#mp-wg-glyph"/></g></g>
        <g transform="rotate(45)  translate(0 -10)"><g transform="scale(0.6)"><use href="#mp-wg-glyph" transform="scale(-1 1)"/></g></g>
        <g transform="rotate(75)  translate(0 -10)"><g transform="scale(0.6)"><use href="#mp-wg-glyph"/></g></g>
        <g transform="rotate(105) translate(0 -10)"><g transform="scale(0.6)"><use href="#mp-wg-glyph" transform="scale(-1 1)"/></g></g>
        <g transform="rotate(135) translate(0 -10)"><g transform="scale(0.6)"><use href="#mp-wg-glyph"/></g></g>
        <g transform="rotate(165) translate(0 -10)"><g transform="scale(0.6)"><use href="#mp-wg-glyph" transform="scale(-1 1)"/></g></g>
        <g transform="rotate(195) translate(0 -10)"><g transform="scale(0.6)"><use href="#mp-wg-glyph"/></g></g>
        <g transform="rotate(225) translate(0 -10)"><g transform="scale(0.6)"><use href="#mp-wg-glyph" transform="scale(-1 1)"/></g></g>
        <g transform="rotate(255) translate(0 -10)"><g transform="scale(0.6)"><use href="#mp-wg-glyph"/></g></g>
        <g transform="rotate(285) translate(0 -10)"><g transform="scale(0.6)"><use href="#mp-wg-glyph" transform="scale(-1 1)"/></g></g>
        <g transform="rotate(315) translate(0 -10)"><g transform="scale(0.6)"><use href="#mp-wg-glyph"/></g></g>
        <g transform="rotate(345) translate(0 -10)"><g transform="scale(0.6)"><use href="#mp-wg-glyph" transform="scale(-1 1)"/></g></g>
      </g>
    </symbol>

    <symbol id="mp-ic-eye" viewBox="0 0 24 24"><path d="M2 12 s3.5 -7 10 -7 10 7 10 7 -3.5 7 -10 7 -10 -7 -10 -7z"/><circle cx="12" cy="12" r="2.5"/></symbol>
    <symbol id="mp-ic-eye-off" viewBox="0 0 24 24"><path d="M3 3 l18 18"/><path d="M10.7 6.2 a10 10 0 0 1 1.3 -.2 c6.5 0 10 7 10 7 a17 17 0 0 1 -2.4 3.2"/><path d="M5.6 7.6 a17 17 0 0 0 -3.6 4.4 s3.5 7 10 7 a10 10 0 0 0 4.4 -1.1"/></symbol>
    <symbol id="mp-ic-lock" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11 V8 a4 4 0 0 1 8 0 v3"/></symbol>
    <symbol id="mp-ic-trash" viewBox="0 0 24 24"><path d="M5 7 h14"/><path d="M9 7 V5 a1 1 0 0 1 1 -1 h4 a1 1 0 0 1 1 1 V7"/><path d="M7 7 l1 12 a2 2 0 0 0 2 2 h4 a2 2 0 0 0 2 -2 l1 -12"/></symbol>
    <symbol id="mp-ic-plus" viewBox="0 0 24 24"><path d="M12 5 v14"/><path d="M5 12 h14"/></symbol>
    <symbol id="mp-ic-cross" viewBox="0 0 24 24"><path d="M6 6 l12 12"/><path d="M18 6 l-12 12"/></symbol>
    <symbol id="mp-ic-pick" viewBox="0 0 24 24">
      <rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/>
      <rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>
    </symbol>

    <symbol id="mp-kp" viewBox="0 0 36 24">
      <rect x="3" y="3" width="14" height="8"/><rect x="19" y="3" width="14" height="8"/>
      <rect x="3" y="13" width="14" height="8"/><rect x="19" y="13" width="14" height="8"/>
    </symbol>
    <symbol id="mp-kc" viewBox="0 0 36 24">
      <rect x="3" y="3" width="14" height="8"/><rect x="19" y="3" width="14" height="8"/>
      <rect x="3" y="13" width="14" height="8"/><rect x="19" y="13" width="14" height="8"/>
      <circle cx="10" cy="7"  r="1.4" fill="currentColor"/><circle cx="26" cy="7"  r="1.4" fill="currentColor"/>
      <circle cx="10" cy="17" r="1.4" fill="currentColor"/><circle cx="26" cy="17" r="1.4" fill="currentColor"/>
      <circle cx="18" cy="12" r="1.6" fill="currentColor"/>
    </symbol>
    <symbol id="mp-krot2" viewBox="0 0 36 24">
      <circle cx="18" cy="12" r="1.4" fill="currentColor"/>
      <path d="M11 6 q4 -3 7 0"/><path d="M25 18 q-4 3 -7 0"/>
      <path d="M11 6 l-2 0 m2 0 l0 -2"/><path d="M25 18 l2 0 m-2 0 l0 2"/>
    </symbol>
    <symbol id="mp-krot3" viewBox="0 0 36 24">
      <circle cx="18" cy="12" r="1.4" fill="currentColor"/>
      <g transform="translate(18 12)">
        <path d="M0 -8 q3 3 -2 5"/>
        <g transform="rotate(120)"><path d="M0 -8 q3 3 -2 5"/></g>
        <g transform="rotate(240)"><path d="M0 -8 q3 3 -2 5"/></g>
      </g>
    </symbol>
    <symbol id="mp-krot4" viewBox="0 0 36 24">
      <circle cx="18" cy="12" r="1.4" fill="currentColor"/>
      <g transform="translate(18 12)">
        <path d="M0 -8 q3 3 -2 5"/>
        <g transform="rotate(90)"><path d="M0 -8 q3 3 -2 5"/></g>
        <g transform="rotate(180)"><path d="M0 -8 q3 3 -2 5"/></g>
        <g transform="rotate(270)"><path d="M0 -8 q3 3 -2 5"/></g>
      </g>
    </symbol>
    <symbol id="mp-krot6" viewBox="0 0 36 24">
      <circle cx="18" cy="12" r="1.2" fill="currentColor"/>
      <g transform="translate(18 12)">
        <path d="M0 -8 q2 3 -1 5"/>
        <g transform="rotate(60)"><path d="M0 -8 q2 3 -1 5"/></g>
        <g transform="rotate(120)"><path d="M0 -8 q2 3 -1 5"/></g>
        <g transform="rotate(180)"><path d="M0 -8 q2 3 -1 5"/></g>
        <g transform="rotate(240)"><path d="M0 -8 q2 3 -1 5"/></g>
        <g transform="rotate(300)"><path d="M0 -8 q2 3 -1 5"/></g>
      </g>
    </symbol>
    <symbol id="mp-km" viewBox="0 0 36 24">
      <line x1="18" y1="2" x2="18" y2="22" stroke-dasharray="1.5 1.5" opacity="0.6"/>
      <path d="M6 8 q5 -3 9 0"/><path d="M30 8 q-5 -3 -9 0"/>
      <path d="M6 16 q5 3 9 0"/><path d="M30 16 q-5 3 -9 0"/>
    </symbol>
    <symbol id="mp-kg" viewBox="0 0 36 24">
      <line x1="18" y1="2" x2="18" y2="22" stroke-dasharray="1.5 1.5" opacity="0.6"/>
      <path d="M5 6 q5 -3 9 0"/><path d="M31 18 q-5 3 -9 0"/>
      <path d="M19 8 v8" opacity="0.55"/>
      <path d="M19 16 l-1.5 -2 m1.5 2 l1.5 -2" opacity="0.55"/>
    </symbol>
  `;

  function ensureSprite() {
    if (document.getElementById(SPRITE_ID)) return;
    const wrap = document.createElement('div');
    wrap.id = SPRITE_ID;
    wrap.setAttribute('aria-hidden', 'true');
    wrap.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;';
    wrap.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg"><defs>${SPRITE_HTML}</defs></svg>`;
    document.body.appendChild(wrap);
  }

  /* ---------- pure helpers ---------- */

  function defaultParamsFor(type) {
    // Mirror the existing factory shape; emit ALL fields so type-change resets cleanly.
    switch (type) {
      case 'line':      return { angle: 90, xShift: 0, yShift: 0, replacedSide: 'positive' };
      case 'radial':    return { mode: 'dihedral', count: 6, angle: 0, centerX: 0, centerY: 0 };
      case 'arc':       return { centerX: 0, centerY: 0, radius: 80, arcStart: -180, arcEnd: 180,
                                 replacedSide: 'outer', strength: 100, falloff: 0, minRadius: 0,
                                 clipToArc: false, rotationOffset: 0, copies: 1 };
      case 'wallpaper': return { group: 'p4m', tileWidth: 60, tileHeight: 60, tileAngle: 90,
                                 rotation: 0, centerX: 0, centerY: 0, domainScale: 1, variantV1: false };
    }
    return {};
  }

  function deriveWallpaperSymmetry(mirror) {
    const WG = window.Vectura?.WallpaperGroups;
    const fallback = { lattice: 'square', rotation: 4, mirrors: 'straight' };
    if (mirror?.symmetry?.lattice) return mirror.symmetry;
    if (WG?.FEATURES?.[mirror?.group]) return { ...WG.FEATURES[mirror.group] };
    return fallback;
  }

  function showCrystallographicNames() {
    return window.Vectura?.SETTINGS?.showCrystallographicNames === true;
  }

  // Persisted Styles/Build mode for the wallpaper editor. Mirrors the
  // showCrystallographicNames SETTINGS pattern — read/write window.Vectura.SETTINGS
  // directly so the cookie-persistence layer (ui/persistence.js) round-trips it.
  // 'styles' = gallery-first (default), 'build' = advanced chip/slider editor.
  function wallpaperMode() {
    const m = window.Vectura?.SETTINGS?.wallpaperPanelMode;
    return m === 'build' ? 'build' : 'styles';
  }
  function setWallpaperMode(mode) {
    const S = window.Vectura?.SETTINGS;
    if (S) S.wallpaperPanelMode = mode === 'build' ? 'build' : 'styles';
  }

  // The wallpaper mirror's "source" geometry is the modifier container's
  // descendant shape geometry — exactly what the engine reflects when it tiles.
  // We read effectivePaths (post other-modifier) falling back to raw paths so
  // the live preview matches the canvas. Returns Array<Array<{x,y}>>.
  function wallpaperSourcePaths(uiCtx, layer) {
    try {
      const engine = uiCtx?.app?.engine;
      if (!engine || !layer || typeof engine.getLayerDescendants !== 'function') return [];
      const out = [];
      engine.getLayerDescendants(layer.id).forEach((child) => {
        if (!child || child.isGroup) return;
        const paths = (child.effectivePaths && child.effectivePaths.length)
          ? child.effectivePaths
          : (child.paths || []);
        paths.forEach((p) => { if (Array.isArray(p) && p.length) out.push(p); });
      });
      return out;
    } catch (_) {
      return [];
    }
  }

  function nameFor(mirror) {
    switch (mirror.type) {
      case 'line':      return `Line · ${Math.round(mirror.angle ?? 0)}°`;
      case 'radial':    return `Radial · ${mirror.count ?? 6}× ${mirror.mode ?? 'dihedral'}`;
      case 'arc':       return `Arc · r ${Math.round(mirror.radius ?? 80)}`;
      case 'wallpaper': {
        if (showCrystallographicNames()) return `Wallpaper · ${mirror.group ?? 'p4m'}`;
        const sym = deriveWallpaperSymmetry(mirror);
        const mir = sym.mirrors === 'none' ? 'no mirror' : 'mirrored';
        return `Wallpaper · ${sym.lattice} · ${sym.rotation}-fold · ${mir}`;
      }
    }
    return 'Mirror';
  }

  function summaryFor(mirror) {
    switch (mirror.type) {
      case 'line': {
        const sym = mirror.replacedSide === 'negative' ? '−' : '+';
        return `${Math.round(mirror.angle ?? 0)}° · SHIFT ${Math.round(mirror.xShift ?? 0)},${Math.round(mirror.yShift ?? 0)} · SIDE ${sym}`;
      }
      case 'radial':
        return `${mirror.count ?? 6} WEDGES · ${(mirror.mode ?? 'dihedral').toUpperCase()} · ${Math.round(mirror.angle ?? 0)}°`;
      case 'arc':
        return `R ${Math.round(mirror.radius ?? 80)} · ${Math.round(mirror.arcStart ?? -180)}→${Math.round(mirror.arcEnd ?? 180)}° · ${(mirror.replacedSide ?? 'outer').toUpperCase()} · ${Math.round(mirror.strength ?? 100)}%`;
      case 'wallpaper':
        return `${(mirror.group ?? 'p4m').toUpperCase()} · ${Math.round(mirror.tileWidth ?? 60)}×${Math.round(mirror.tileHeight ?? 60)} · ${Math.round(mirror.rotation ?? 0)}°`;
    }
    return '';
  }

  function fillPct(val, min, max) {
    if (max === min) return '0';
    return (((val - min) / (max - min)) * 100).toFixed(2);
  }

  function pointToAngleDeg(clientX, clientY, rect, shift) {
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    deg = ((deg % 360) + 360) % 360;
    if (shift) deg = Math.round(deg / 15) * 15;
    else deg = Math.round(deg);
    return deg % 360;
  }

  function fireDialBlip(dial) {
    const pin = dial.querySelector('.mp-dial-pin');
    if (!pin) return;
    const angle = parseFloat(pin.style.getPropertyValue('--angle')) || 0;
    const colorRaw = getComputedStyle(dial).getPropertyValue('--mp-type-color').trim();
    let rgb = '78, 158, 225';
    try {
      const n = parseInt(colorRaw.replace('#', ''), 16);
      rgb = `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
    } catch (_) {}

    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    const SIZE = 50;
    const cvs = document.createElement('canvas');
    cvs.width = SIZE * DPR;
    cvs.height = SIZE * DPR;
    cvs.style.cssText = `position:absolute;top:0;left:0;width:${SIZE}px;height:${SIZE}px;pointer-events:none;border-radius:50%;z-index:1;`;
    dial.appendChild(cvs);

    const ctx = cvs.getContext('2d');
    ctx.scale(DPR, DPR);

    // Dial geometry in CSS px: 50×50 face, pin 20px from center
    const CX = 25, CY = 25, DIAL_R = 25, PIN_LEN = 20;
    const rad = angle * Math.PI / 180;
    const tipX = CX + Math.sin(rad) * PIN_LEN;
    const tipY = CY - Math.cos(rad) * PIN_LEN;
    // Max ring radius needed to cover the full face from any tip position
    const MAX_R = DIAL_R + PIN_LEN + 1;

    const DURATION = 480;
    const start = performance.now();

    (function frame(now) {
      const t = Math.min((now - start) / DURATION, 1);
      const ringR = (1 - (1 - t) * (1 - t)) * MAX_R;
      const alpha = (1 - t * t * t) * 0.65;

      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.save();
      ctx.beginPath();
      ctx.arc(CX, CY, DIAL_R - 0.5, 0, Math.PI * 2);
      ctx.clip();
      if (ringR > 0.5) {
        ctx.beginPath();
        ctx.arc(tipX, tipY, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${rgb}, ${alpha})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.restore();

      if (t < 1) requestAnimationFrame(frame);
      else cvs.remove();
    }(performance.now()));
  }

  function infoTrigger(topicId, label) {
    return `<button type="button" class="mp-info-trigger" data-info-open="${topicId}" title="${label}" aria-label="${label}">i</button>`;
  }

  function renderPopovers(topicIds) {
    return `
      <div class="mp-info-backdrop" data-info-close></div>
      ${topicIds.map((id) => {
        const t = INFO_TOPICS[id];
        if (!t) return '';
        return `
          <div class="mp-info-popover" data-info-id="${id}" role="dialog" aria-modal="true">
            <div class="mp-ip-head">
              <div>
                <span class="mp-ip-title-tag">${t.tag}</span>
                <div class="mp-ip-title">${t.title}</div>
              </div>
              <button type="button" class="mp-ip-close" data-info-close aria-label="Close">
                <svg><use href="#mp-ic-cross"/></svg>
              </button>
            </div>
            <div class="mp-ip-body">${t.body}</div>
          </div>`;
      }).join('')}
    `;
  }

  /* ---------- type-specific config bodies ---------- */

  function lineConfig(m) {
    return `
      ${renderPopovers(['source-side'])}
      <div class="mp-ctrl-grp">
        <div class="mp-ctrl-lbl">Source side ${infoTrigger('source-side', 'About source side')}</div>
        <div class="mp-side-row">
          <button type="button" class="mp-side-tile ${m.replacedSide === 'positive' ? 'active' : ''}" aria-pressed="${m.replacedSide === 'positive'}" data-set="replacedSide" data-val="positive">
            <svg><use href="#mp-side-neg"/></svg>
            <div class="mp-st-name">Positive</div>
          </button>
          <button type="button" class="mp-side-tile ${m.replacedSide === 'negative' ? 'active' : ''}" aria-pressed="${m.replacedSide === 'negative'}" data-set="replacedSide" data-val="negative">
            <svg><use href="#mp-side-pos"/></svg>
            <div class="mp-st-name">Negative</div>
          </button>
        </div>
      </div>

      <div class="mp-dial-row">
        <div class="mp-dial" role="slider" aria-valuemin="0" aria-valuemax="360" aria-valuenow="${m.angle}" aria-label="Angle" data-dial-param="angle">
          <span class="mp-dial-tick"></span>
          <span class="mp-dial-tick mp-tick-90"></span>
          <span class="mp-dial-tick mp-tick-180"></span>
          <span class="mp-dial-tick mp-tick-270"></span>
          <div class="mp-dial-pin" style="--angle: ${m.angle}deg;"></div>
          <div class="mp-dial-knob"></div>
        </div>
        <div class="mp-ctrl-grp">
          <div class="mp-ctrl-lbl">Angle <span class="mp-val-tag" data-tag="angle">${Math.round(m.angle)}°</span></div>
          <input type="range" class="mp-slider" min="0" max="360" value="${m.angle}"
                 data-param="angle" data-fmt="deg"
                 style="--fill:${fillPct(m.angle, 0, 360)}%;">
        </div>
      </div>

      <div class="mp-ctrl-row-2">
        <div class="mp-ctrl-grp">
          <div class="mp-ctrl-lbl">Shift X <span class="mp-val-tag" data-tag="xShift">${Math.round(m.xShift)}</span></div>
          <input type="range" class="mp-slider" min="-200" max="200" value="${m.xShift}"
                 data-param="xShift" style="--fill:${fillPct(m.xShift, -200, 200)}%;">
        </div>
        <div class="mp-ctrl-grp">
          <div class="mp-ctrl-lbl">Shift Y <span class="mp-val-tag" data-tag="yShift">${Math.round(m.yShift)}</span></div>
          <input type="range" class="mp-slider" min="-200" max="200" value="${m.yShift}"
                 data-param="yShift" style="--fill:${fillPct(m.yShift, -200, 200)}%;">
        </div>
      </div>
    `;
  }

  function radialConfig(m) {
    return `
      ${renderPopovers(['radial-mode'])}
      <div class="mp-ctrl-grp">
        <div class="mp-ctrl-lbl">Symmetry mode ${infoTrigger('radial-mode', 'About symmetry modes')}</div>
        <div class="mp-mode-row">
          <button type="button" class="mp-mode-tile ${m.mode === 'rotation' ? 'active' : ''}" aria-pressed="${m.mode === 'rotation'}" data-set="mode" data-val="rotation">
            <svg><use href="#mp-mode-rotate"/></svg><div class="mp-mt-name">Rotation</div>
          </button>
          <button type="button" class="mp-mode-tile ${m.mode === 'dihedral' ? 'active' : ''}" aria-pressed="${m.mode === 'dihedral'}" data-set="mode" data-val="dihedral">
            <svg><use href="#mp-mode-dihedral"/></svg><div class="mp-mt-name">Dihedral</div>
          </button>
          <button type="button" class="mp-mode-tile ${m.mode === 'edge' ? 'active' : ''}" aria-pressed="${m.mode === 'edge'}" data-set="mode" data-val="edge">
            <svg><use href="#mp-mode-edge"/></svg><div class="mp-mt-name">Edge</div>
          </button>
        </div>
      </div>

      <div class="mp-ctrl-grp">
        <div class="mp-ctrl-lbl">Wedges <span class="mp-val-tag" data-tag="count">${m.count}</span></div>
        <input type="range" class="mp-slider" min="2" max="24" value="${m.count}"
               data-param="count" data-int="1" style="--fill:${fillPct(m.count, 2, 24)}%;">
      </div>

      <div class="mp-dial-row">
        <div class="mp-dial" role="slider" aria-valuemin="0" aria-valuemax="360" aria-valuenow="${m.angle}" aria-label="Rotation offset" data-dial-param="angle">
          <span class="mp-dial-tick"></span>
          <span class="mp-dial-tick mp-tick-90"></span>
          <span class="mp-dial-tick mp-tick-180"></span>
          <span class="mp-dial-tick mp-tick-270"></span>
          <div class="mp-dial-pin" style="--angle: ${m.angle}deg;"></div>
          <div class="mp-dial-knob"></div>
        </div>
        <div class="mp-ctrl-grp">
          <div class="mp-ctrl-lbl">Rotation offset <span class="mp-val-tag" data-tag="angle">${Math.round(m.angle)}°</span></div>
          <input type="range" class="mp-slider" min="0" max="360" value="${m.angle}"
                 data-param="angle" data-fmt="deg" style="--fill:${fillPct(m.angle, 0, 360)}%;">
        </div>
      </div>

      <div class="mp-ctrl-row-2">
        <div class="mp-ctrl-grp">
          <div class="mp-ctrl-lbl">Center X <span class="mp-val-tag" data-tag="centerX">${Math.round(m.centerX)}</span></div>
          <input type="range" class="mp-slider" min="-200" max="200" value="${m.centerX}"
                 data-param="centerX" style="--fill:${fillPct(m.centerX, -200, 200)}%;">
        </div>
        <div class="mp-ctrl-grp">
          <div class="mp-ctrl-lbl">Center Y <span class="mp-val-tag" data-tag="centerY">${Math.round(m.centerY)}</span></div>
          <input type="range" class="mp-slider" min="-200" max="200" value="${m.centerY}"
                 data-param="centerY" style="--fill:${fillPct(m.centerY, -200, 200)}%;">
        </div>
      </div>
    `;
  }

  function arcConfig(m) {
    return `
      ${renderPopovers(['arc-side'])}
      <div class="mp-ctrl-grp">
        <div class="mp-ctrl-lbl">Reflect side ${infoTrigger('arc-side', 'About reflect side')}</div>
        <div class="mp-side-row">
          <button type="button" class="mp-side-tile ${m.replacedSide === 'outer' ? 'active' : ''}" aria-pressed="${m.replacedSide === 'outer'}" data-set="replacedSide" data-val="outer">
            <svg><use href="#mp-side-inner"/></svg><div class="mp-st-name">Outer</div>
          </button>
          <button type="button" class="mp-side-tile ${m.replacedSide === 'inner' ? 'active' : ''}" aria-pressed="${m.replacedSide === 'inner'}" data-set="replacedSide" data-val="inner">
            <svg><use href="#mp-side-outer"/></svg><div class="mp-st-name">Inner</div>
          </button>
        </div>
      </div>

      <div class="mp-ctrl-row-2">
        <div class="mp-ctrl-grp">
          <div class="mp-ctrl-lbl">Radius <span class="mp-val-tag" data-tag="radius">${Math.round(m.radius)}</span></div>
          <input type="range" class="mp-slider" min="10" max="400" value="${m.radius}"
                 data-param="radius" style="--fill:${fillPct(m.radius, 10, 400)}%;">
        </div>
        <div class="mp-ctrl-grp">
          <div class="mp-ctrl-lbl">Copies <span class="mp-val-tag" data-tag="copies">${m.copies}</span></div>
          <input type="range" class="mp-slider" min="1" max="12" value="${m.copies}"
                 data-param="copies" data-int="1" style="--fill:${fillPct(m.copies, 1, 12)}%;">
        </div>
      </div>

      <div class="mp-ctrl-row-2">
        <div class="mp-ctrl-grp">
          <div class="mp-ctrl-lbl">Arc start <span class="mp-val-tag" data-tag="arcStart">${Math.round(m.arcStart)}°</span></div>
          <input type="range" class="mp-slider" min="-180" max="180" value="${m.arcStart}"
                 data-param="arcStart" data-fmt="deg" style="--fill:${fillPct(m.arcStart, -180, 180)}%;">
        </div>
        <div class="mp-ctrl-grp">
          <div class="mp-ctrl-lbl">Arc end <span class="mp-val-tag" data-tag="arcEnd">${Math.round(m.arcEnd)}°</span></div>
          <input type="range" class="mp-slider" min="-180" max="180" value="${m.arcEnd}"
                 data-param="arcEnd" data-fmt="deg" style="--fill:${fillPct(m.arcEnd, -180, 180)}%;">
        </div>
      </div>

      <div class="mp-ctrl-row-2">
        <div class="mp-ctrl-grp">
          <div class="mp-ctrl-lbl">Strength <span class="mp-val-tag" data-tag="strength">${Math.round(m.strength)}%</span></div>
          <input type="range" class="mp-slider" min="0" max="100" value="${m.strength}"
                 data-param="strength" data-fmt="pct" style="--fill:${fillPct(m.strength, 0, 100)}%;">
        </div>
        <div class="mp-ctrl-grp">
          <div class="mp-ctrl-lbl">Falloff <span class="mp-val-tag" data-tag="falloff">${Math.round(m.falloff)}%</span></div>
          <input type="range" class="mp-slider" min="0" max="100" value="${m.falloff}"
                 data-param="falloff" data-fmt="pct" style="--fill:${fillPct(m.falloff, 0, 100)}%;">
        </div>
      </div>

      <div class="mp-ctrl-row-2">
        <div class="mp-ctrl-grp">
          <div class="mp-ctrl-lbl">Min radius <span class="mp-val-tag" data-tag="minRadius">${Math.round(m.minRadius ?? 0)}</span></div>
          <input type="range" class="mp-slider" min="0" max="400" value="${m.minRadius ?? 0}"
                 data-param="minRadius" style="--fill:${fillPct(m.minRadius ?? 0, 0, 400)}%;">
        </div>
        <div class="mp-ctrl-grp"></div>
      </div>

      <div class="mp-dial-row">
        <div class="mp-dial" role="slider" aria-valuemin="0" aria-valuemax="360" aria-valuenow="${m.rotationOffset}" aria-label="Rotation offset" data-dial-param="rotationOffset">
          <span class="mp-dial-tick"></span>
          <span class="mp-dial-tick mp-tick-90"></span>
          <span class="mp-dial-tick mp-tick-180"></span>
          <span class="mp-dial-tick mp-tick-270"></span>
          <div class="mp-dial-pin" style="--angle: ${m.rotationOffset}deg;"></div>
          <div class="mp-dial-knob"></div>
        </div>
        <div class="mp-ctrl-grp">
          <div class="mp-ctrl-lbl">Rotation offset <span class="mp-val-tag" data-tag="rotationOffset">${Math.round(m.rotationOffset)}°</span></div>
          <input type="range" class="mp-slider" min="0" max="360" value="${m.rotationOffset}"
                 data-param="rotationOffset" data-fmt="deg" style="--fill:${fillPct(m.rotationOffset, 0, 360)}%;">
        </div>
      </div>
      <div class="mp-ctrl-grp">
        <div class="mp-ctrl-lbl">Clip output</div>
        <div class="mp-side-row mp-side-row--text">
          <button type="button" class="mp-side-tile mp-side-tile--text ${m.clipToArc ? 'active' : ''}" aria-pressed="${!!m.clipToArc}" data-set="clipToArc" data-val="true">
            <div class="mp-st-name">Clip to arc</div>
          </button>
          <button type="button" class="mp-side-tile mp-side-tile--text ${!m.clipToArc ? 'active' : ''}" aria-pressed="${!m.clipToArc}" data-set="clipToArc" data-val="false">
            <div class="mp-st-name">Free</div>
          </button>
        </div>
      </div>

      <div class="mp-ctrl-row-2">
        <div class="mp-ctrl-grp">
          <div class="mp-ctrl-lbl">Center X <span class="mp-val-tag" data-tag="centerX">${Math.round(m.centerX)}</span></div>
          <input type="range" class="mp-slider" min="-200" max="200" value="${m.centerX}"
                 data-param="centerX" style="--fill:${fillPct(m.centerX, -200, 200)}%;">
        </div>
        <div class="mp-ctrl-grp">
          <div class="mp-ctrl-lbl">Center Y <span class="mp-val-tag" data-tag="centerY">${Math.round(m.centerY)}</span></div>
          <input type="range" class="mp-slider" min="-200" max="200" value="${m.centerY}"
                 data-param="centerY" style="--fill:${fillPct(m.centerY, -200, 200)}%;">
        </div>
      </div>
    `;
  }

  // Friendly, evocative card label for a bare crystallographic group.
  function wallGroupLabel(groupId) {
    const desc = WALL_GROUP_DESC[groupId] || '';
    // Use the first clause of the description as a short human label.
    const lead = desc.split(/[—.·]/)[0].trim();
    return lead || groupId;
  }

  // STYLES (gallery) mode: a scrollable grid of cards — the 17 bare groups
  // (friendly labels from WALL_GROUP_DESC, never raw pXX) plus the named recipes
  // from WallpaperPresets.list(). Each card hosts a live WallpaperPreview thumb.
  // A "Surprise me" dice button (WallpaperPresets.randomize) tops the grid.
  function wallStylesHtml(m) {
    const WG = window.Vectura?.WallpaperGroups;
    const sym = deriveWallpaperSymmetry(m);
    const activeGroup = (WG?.featuresToGroupId?.(sym)) || m.group || 'p4m';
    const groupIds = WG?.GROUP_IDS || WALL_GROUPS.map((g) => g.id);

    const groupCards = groupIds.map((gid) => {
      const isActive = gid === activeGroup;
      const label = wallGroupLabel(gid);
      const sub = showCrystallographicNames() ? gid : '';
      return `
        <button type="button" class="mp-stylecard mp-wallgrid-card ${isActive ? 'is-active' : ''}"
          data-style-group="${gid}" title="${(WALL_GROUP_DESC[gid] || gid).replace(/"/g, '&quot;')}">
          <span class="mp-stylecard-thumb" data-style-thumb data-style-group-thumb="${gid}"></span>
          <span class="mp-stylecard-name">${label}</span>
          ${sub ? `<span class="mp-stylecard-sub">${sub}</span>` : ''}
        </button>`;
    }).join('');

    const presets = (window.Vectura?.WallpaperPresets?.list?.() || []);
    const presetCards = presets.map((p, i) => `
        <button type="button" class="mp-stylecard mp-wallgrid-card mp-stylecard--preset"
          data-style-preset="${i}" title="${String(p.name || p.id).replace(/"/g, '&quot;')}">
          <span class="mp-stylecard-thumb" data-style-thumb data-style-preset-thumb="${i}"></span>
          <span class="mp-stylecard-name">${p.name || p.id}</span>
          <span class="mp-stylecard-sub">Recipe</span>
        </button>`).join('');

    return `
      <div class="mp-wallgrid-bar">
        <button type="button" class="mp-wallgrid-dice" data-act="surprise"
          title="Surprise me — pick a random valid pattern. Hold Shift to keep the current lattice family.">
          <span class="mp-wallgrid-dice-glyph">⚄</span> Surprise me
        </button>
        <span class="mp-wallgrid-dice-hint">Hold Shift to keep the lattice</span>
      </div>
      ${presetCards ? `<div class="mp-wallgrid-section">Recipes</div><div class="mp-wallgrid" data-wallgrid="presets">${presetCards}</div>` : ''}
      <div class="mp-wallgrid-section">All symmetries</div>
      <div class="mp-wallgrid" data-wallgrid="groups">${groupCards}</div>
    `;
  }

  function wallConfig(m) {
    const mode = wallpaperMode();
    const toggle = `
      <div class="mp-wallmode" role="tablist" aria-label="Wallpaper editor mode">
        <button type="button" class="mp-wallmode-btn ${mode === 'styles' ? 'is-active' : ''}"
          role="tab" aria-selected="${mode === 'styles'}" data-wall-mode="styles">Styles</button>
        <button type="button" class="mp-wallmode-btn ${mode === 'build' ? 'is-active' : ''}"
          role="tab" aria-selected="${mode === 'build'}" data-wall-mode="build">Build</button>
      </div>`;
    const body = mode === 'styles' ? wallStylesHtml(m) : wallBuildHtml(m);
    return `${toggle}${body}`;
  }

  function wallBuildHtml(m) {
    const WG = window.Vectura?.WallpaperGroups;
    const sym = deriveWallpaperSymmetry(m);
    const groupId = (WG?.featuresToGroupId?.(sym)) || m.group || 'p4m';
    const groupDef = WG?.GROUPS?.[groupId];
    const hasV1 = !!(groupDef && groupDef.hasV1);
    const variantOn = hasV1 && !!m.variantV1;
    const locked = WG?.getLockedAxes?.(groupId) || { tileHeight: false, tileAngle: false };
    const lockedAttr = (on) => on ? 'disabled aria-disabled="true"' : '';
    const lockedCls  = (on) => on ? ' is-locked' : '';
    // Touch-safe, actionable explanation of why a slider is locked — replaces the
    // hover-only pXX `title`. Names the axis that forces the value in plain words.
    const lockHint   = (on) => on
      ? ` <span class="mp-lock-hint" data-testid="wall-lock-hint">locked by symmetry</span>`
      : '';
    const lockNote   = (on, what) => on
      ? `<div class="mp-lock-note" data-testid="wall-lock-note">This pattern's symmetry sets ${what} automatically. Switch the Rotation order or Mirrors to unlock it.</div>`
      : '';

    // Lattice row
    const lattices = ['oblique', 'rectangular', 'rhombic', 'square', 'hexagonal'];
    const latticeChips = lattices.map((lat) => {
      const active = lat === sym.lattice ? 'is-active' : '';
      return `<button type="button" class="mp-chip ${active}" aria-pressed="${lat === sym.lattice}"
        data-sym-axis="lattice" data-sym-val="${lat}"
        title="${LATTICE_LABELS[lat]}">${LATTICE_LABELS[lat]}</button>`;
    }).join('');

    // Rotation row — all 5 rotations; disable any that don't apply to the current lattice.
    const allRotations = [1, 2, 3, 4, 6];
    const validRotations = WG?.LATTICE_ROTATIONS?.[sym.lattice] || [sym.rotation];
    const rotationChips = allRotations.map((rot) => {
      const valid = validRotations.includes(rot);
      const active = (rot === sym.rotation && valid) ? 'is-active' : '';
      const dis = valid ? '' : 'disabled aria-disabled="true"';
      const title = valid
        ? `${rot}-fold rotation`
        : `${rot}-fold rotation not available for ${LATTICE_LABELS[sym.lattice]?.toLowerCase() || sym.lattice} lattice`;
      return `<button type="button" class="mp-chip ${active}" aria-pressed="${active === 'is-active'}"
        data-sym-axis="rotation" data-sym-val="${rot}" ${dis}
        title="${title}">${ROTATION_LABEL(rot)}</button>`;
    }).join('');

    // Mirror row — contextual on (lattice, rotation).
    const mirrorOpts = WG?.MIRROR_CHAINS?.[`${sym.lattice}:${sym.rotation}`] || ['none'];
    const mirrorChips = mirrorOpts.map((mir) => {
      const active = mir === sym.mirrors ? 'is-active' : '';
      const label = MIRROR_LABELS[mir] || mir;
      return `<button type="button" class="mp-chip ${active}" aria-pressed="${mir === sym.mirrors}"
        data-sym-axis="mirrors" data-sym-val="${mir}"
        title="${label}">${label}</button>`;
    }).join('');

    // Friendly name badge is ALWAYS shown now (un-gated from the
    // showCrystallographicNames pref) so users always see where they landed
    // after a snap. The crystallographic id is appended when the pref is on.
    const friendly = wallGroupLabel(groupId);
    const badge = `<div class="mp-wall-badge" data-testid="wall-name-badge">→ ${friendly}${showCrystallographicNames() ? ` <span class="mp-wall-badge-id">${groupId}</span>` : ''}</div>`;
    const desc = WALL_GROUP_DESC[groupId] || '';
    return `
      ${renderPopovers(['wall-rect', 'wall-sq', 'wall-hex'])}
      <div class="mp-snap-line" data-testid="wall-snap-line" aria-live="polite" hidden></div>
      <div class="mp-ctrl-grp">
        <div class="mp-ctrl-lbl">Lattice ${infoTrigger('wall-rect', 'About lattice families')}</div>
        <div class="mp-chip-row" data-symmetry-row="lattice">${latticeChips}</div>
      </div>
      <div class="mp-ctrl-grp">
        <div class="mp-ctrl-lbl">Rotation order ${infoTrigger('wall-sq', 'About rotation orders')}</div>
        <div class="mp-chip-row" data-symmetry-row="rotation">${rotationChips}</div>
      </div>
      <div class="mp-ctrl-grp">
        <div class="mp-ctrl-lbl">Mirrors ${infoTrigger('wall-hex', 'About mirror types')}</div>
        <div class="mp-chip-row" data-symmetry-row="mirrors">${mirrorChips}</div>
      </div>
      ${desc ? `<div class="mp-wall-desc" data-testid="wall-desc">${desc}</div>` : ''}
      <div class="mp-ctrl-row-2">
        <div class="mp-ctrl-grp">
          <div class="mp-ctrl-lbl">Tile width <span class="mp-val-tag" data-tag="tileWidth">${Math.round(m.tileWidth)}</span></div>
          <input type="range" class="mp-slider" min="20" max="400" value="${m.tileWidth}"
                 data-param="tileWidth" style="--fill:${fillPct(m.tileWidth, 20, 400)}%;">
        </div>
        <div class="mp-ctrl-grp${lockedCls(locked.tileHeight)}">
          <div class="mp-ctrl-lbl">Tile height <span class="mp-val-tag" data-tag="tileHeight">${Math.round(m.tileHeight)}</span>${lockHint(locked.tileHeight)}</div>
          <input type="range" class="mp-slider" min="20" max="400" value="${m.tileHeight}"
                 data-param="tileHeight" ${lockedAttr(locked.tileHeight)} style="--fill:${fillPct(m.tileHeight, 20, 400)}%;">
          ${lockNote(locked.tileHeight, 'the tile height to match the tile width')}
        </div>
      </div>
      <div class="mp-dial-row${lockedCls(locked.tileAngle)}">
        <div class="mp-dial" role="slider" aria-valuemin="60" aria-valuemax="120" aria-valuenow="${m.tileAngle}" aria-label="Tile angle" data-dial-param="tileAngle" ${locked.tileAngle ? 'aria-disabled="true"' : ''}>
          <span class="mp-dial-tick"></span>
          <span class="mp-dial-tick mp-tick-90"></span>
          <span class="mp-dial-tick mp-tick-180"></span>
          <span class="mp-dial-tick mp-tick-270"></span>
          <div class="mp-dial-pin" style="--angle: ${m.tileAngle}deg;"></div>
          <div class="mp-dial-knob"></div>
        </div>
        <div class="mp-ctrl-grp${lockedCls(locked.tileAngle)}">
          <div class="mp-ctrl-lbl">Tile angle <span class="mp-val-tag" data-tag="tileAngle">${Math.round(m.tileAngle)}°</span>${lockHint(locked.tileAngle)}</div>
          <input type="range" class="mp-slider" min="60" max="120" value="${m.tileAngle}"
                 data-param="tileAngle" data-fmt="deg" ${lockedAttr(locked.tileAngle)} style="--fill:${fillPct(m.tileAngle, 60, 120)}%;">
          ${lockNote(locked.tileAngle, 'the tile angle')}
        </div>
      </div>
      <div class="mp-dial-row">
        <div class="mp-dial" role="slider" aria-valuemin="0" aria-valuemax="360" aria-valuenow="${m.rotation}" aria-label="Pattern angle" data-dial-param="rotation">
          <span class="mp-dial-tick"></span>
          <span class="mp-dial-tick mp-tick-90"></span>
          <span class="mp-dial-tick mp-tick-180"></span>
          <span class="mp-dial-tick mp-tick-270"></span>
          <div class="mp-dial-pin" style="--angle: ${m.rotation}deg;"></div>
          <div class="mp-dial-knob"></div>
        </div>
        <div class="mp-ctrl-grp">
          <div class="mp-ctrl-lbl">Pattern angle <span class="mp-val-tag" data-tag="rotation">${Math.round(m.rotation)}°</span></div>
          <input type="range" class="mp-slider" min="0" max="360" value="${m.rotation}"
                 data-param="rotation" data-fmt="deg" style="--fill:${fillPct(m.rotation, 0, 360)}%;">
        </div>
      </div>
      <div class="mp-ctrl-row-2">
        <div class="mp-ctrl-grp">
          <div class="mp-ctrl-lbl">Center X <span class="mp-val-tag" data-tag="centerX">${Math.round(m.centerX)}</span></div>
          <input type="range" class="mp-slider" min="-200" max="200" value="${m.centerX}"
                 data-param="centerX" style="--fill:${fillPct(m.centerX, -200, 200)}%;">
        </div>
        <div class="mp-ctrl-grp">
          <div class="mp-ctrl-lbl">Center Y <span class="mp-val-tag" data-tag="centerY">${Math.round(m.centerY)}</span></div>
          <input type="range" class="mp-slider" min="-200" max="200" value="${m.centerY}"
                 data-param="centerY" style="--fill:${fillPct(m.centerY, -200, 200)}%;">
        </div>
      </div>
      <div class="mp-ctrl-row-2">
        <div class="mp-ctrl-grp">
          <div class="mp-ctrl-lbl">Tile scale <span class="mp-val-tag" data-tag="domainScale">${Number(m.domainScale ?? 1).toFixed(2)}×</span></div>
          <input type="range" class="mp-slider" min="0.3" max="2" step="0.05" value="${m.domainScale ?? 1}"
                 data-param="domainScale" data-fmt="scale" style="--fill:${fillPct(m.domainScale ?? 1, 0.3, 2)}%;">
        </div>
      </div>
      ${hasV1 ? `
      <div class="mp-ctrl-grp">
        <div class="mp-ctrl-lbl">Tile layout</div>
        <div class="mp-side-row mp-side-row--text">
          <button type="button" class="mp-side-tile mp-side-tile--text ${!variantOn ? 'active' : ''}" aria-pressed="${!variantOn}" data-set="variantV1" data-val="false">
            <div class="mp-st-name">Crisp</div>
          </button>
          <button type="button" class="mp-side-tile mp-side-tile--text ${variantOn ? 'active' : ''}" aria-pressed="${variantOn}" data-set="variantV1" data-val="true">
            <div class="mp-st-name">Airy</div>
          </button>
        </div>
        <div class="mp-wall-desc">Two looks for the same symmetry — Crisp packs the motif tight to the tile; Airy gives it breathing room.</div>
      </div>
      ` : ''}
      ${badge}
    `;
  }

  function bodyHtmlFor(mirror) {
    switch (mirror.type) {
      case 'line':      return lineConfig(mirror);
      case 'radial':    return radialConfig(mirror);
      case 'arc':       return arcConfig(mirror);
      case 'wallpaper': return wallConfig(mirror);
    }
    return '';
  }

  /* ---------- main builder ---------- */

  // Panel-only state lives off-band so we don't pollute the serialized
  // .vectura modifier object. Keyed on the layer reference; entries are
  // garbage-collected when a layer goes away.
  const PANEL_STATE = new WeakMap();

  function build(uiCtx, layer, container) {
    ensureSprite();
    const modifier = uiCtx.getModifierState(layer);
    if (!modifier) return;
    if (!Array.isArray(modifier.mirrors)) modifier.mirrors = [];
    const mirrors = modifier.mirrors;

    // Make sure ids are stable so the row + canvas-mapping logic that the
    // legacy renderer / drag-preview keys off of keeps working. Colors are
    // already populated by the factories in modifiers.js.
    mirrors.forEach((m, i) => {
      if (!m.id) m.id = `mirror-${i + 1}`;
    });

    // Make sure at least one mirror exists per the design's "auto-add Line" rule.
    if (mirrors.length === 0) {
      mirrors.push(makeMirror('line', 0, uiCtx));
    }

    // Panel state survives rebuild via the WeakMap (no persistence to disk).
    const pState = PANEL_STATE.get(layer) || {};
    PANEL_STATE.set(layer, pState);
    let selectedId = pState.selectedId;
    if (!mirrors.find((m) => m.id === selectedId)) {
      selectedId = mirrors[mirrors.length - 1].id;
    }
    let pickerState = pState.pickerState || 'closed'; // 'closed' | 'new' | 'replace'

    const root = document.createElement('div');
    root.className = 'mp-root';
    root.dataset.testid = 'mirror-panel';

    container.appendChild(root);

    const persistPanelState = () => {
      pState.selectedId = selectedId;
      pState.pickerState = pickerState;
    };

    const commit = (fn, { rebuild = true } = {}) => {
      if (uiCtx.app?.pushHistory) uiCtx.app.pushHistory();
      fn();
      persistPanelState();
      // Use the lightweight refresh that skips control rebuild for slider drags
      // (we'll DOM-patch the row text + sliders in place), and the full rebuild
      // otherwise so the editor body swaps cleanly.
      uiCtx.refreshModifierLayer(layer, { rebuildControls: rebuild });
    };

    function selectedMirror() {
      return mirrors.find((m) => m.id === selectedId);
    }

    function setTypeColor() {
      const sel = selectedMirror();
      const t = sel ? TYPES[sel.type] : TYPES.line;
      root.style.setProperty('--mp-type-color', t.hueRaw);
    }

    function pathMultiplier() {
      // Worst-case path inflation per the legacy estimator. Useful as a
      // soft warning when users stack many radial wedges.
      return mirrors.reduce((acc, m) => {
        if (m.enabled === false) return acc;
        if (m.type === 'radial') {
          const n = Math.max(2, Math.round(m.count ?? 6));
          return acc * (m.mode === 'dihedral' ? 2 * n : n);
        }
        if (m.type === 'line' || m.type === 'arc') return acc * 2;
        return acc;
      }, 1);
    }

    function renderStack() {
      const sec = document.createElement('section');
      sec.className = 'mp-stack';
      // Compatibility hook: pre-existing e2e tests / external selectors key
      // off #mirror-stack from the legacy panel. Keep it as a stable anchor.
      sec.id = 'mirror-stack';
      const mult = pathMultiplier();
      const multBadge = mult > 16
        ? `<span class="mp-stack-warn" title="High path-count multiplier">~${mult}× paths</span>`
        : '';
      sec.innerHTML = `
        <div class="mp-stack-hdr">
          <div class="mp-stack-lbl">Mirror stack
            <span class="mp-stack-count">${mirrors.length}</span>
            ${multBadge}
          </div>
        </div>
        <div class="mp-stack-list"></div>
      `;
      const list = sec.querySelector('.mp-stack-list');

      mirrors.forEach((m) => {
        const t = TYPES[m.type] || TYPES.line;
        const row = document.createElement('div');
        row.className = 'mp-row noise-card' +
          (m.id === selectedId && pickerState === 'closed' ? ' is-selected' : '') +
          (m.enabled === false ? ' is-disabled' : '');
        row.style.setProperty('--mp-row-color', t.hueRaw);
        row.dataset.mirrorId = m.id;
        row.setAttribute('draggable', 'true');
        row.innerHTML = `
          <button class="mp-row-thumb" type="button" aria-label="Select mirror" tabindex="-1">
            <svg><use href="#${t.preview}"/></svg>
          </button>
          <div class="mp-row-meta">
            <div class="mp-row-name"><span class="mp-row-dot"></span><span class="mp-row-name-text">${nameFor(m)}</span></div>
            <div class="mp-row-summary">${summaryFor(m)}</div>
          </div>
          <div class="mp-row-actions">
            <button type="button" class="mp-icon-btn ${m.enabled !== false ? 'active' : ''}" data-act="toggle" title="${m.enabled !== false ? 'Hide' : 'Show'}" aria-label="${m.enabled !== false ? 'Disable mirror' : 'Enable mirror'}" aria-pressed="${m.enabled !== false}">
              <svg><use href="#${m.enabled !== false ? 'mp-ic-eye' : 'mp-ic-eye-off'}"/></svg>
            </button>
            <button type="button" class="mp-icon-btn ${m.locked ? 'active' : ''}" data-act="lock" title="${m.locked ? 'Unlock' : 'Lock'}" aria-label="${m.locked ? 'Unlock mirror' : 'Lock mirror'}" aria-pressed="${!!m.locked}">
              <svg><use href="#mp-ic-lock"/></svg>
            </button>
            <button type="button" class="mp-icon-btn mp-icon-danger" data-act="delete" title="Delete" aria-label="Delete mirror">
              <svg><use href="#mp-ic-trash"/></svg>
            </button>
          </div>
        `;

        // Drag-to-reorder. Native HTML5 DnD so we don't ship custom mouse
        // bookkeeping; a dashed drop indicator slides between rows.
        row.addEventListener('dragstart', (e) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', m.id);
          row.classList.add('mp-row--dragging');
        });
        row.addEventListener('dragend', () => {
          row.classList.remove('mp-row--dragging');
          list.querySelectorAll('.mp-drop-indicator').forEach((el) => el.remove());
        });
        row.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          const rect = row.getBoundingClientRect();
          const before = (e.clientY - rect.top) < rect.height / 2;
          list.querySelectorAll('.mp-drop-indicator').forEach((el) => el.remove());
          const ind = document.createElement('div');
          ind.className = 'mp-drop-indicator';
          list.insertBefore(ind, before ? row : row.nextSibling);
        });
        row.addEventListener('drop', (e) => {
          e.preventDefault();
          const sourceId = e.dataTransfer.getData('text/plain');
          if (!sourceId || sourceId === m.id) return;
          const rect = row.getBoundingClientRect();
          const before = (e.clientY - rect.top) < rect.height / 2;
          commit(() => {
            const order = mirrors.map((x) => x.id).filter((id) => id !== sourceId);
            const targetIdx = order.indexOf(m.id) + (before ? 0 : 1);
            order.splice(targetIdx, 0, sourceId);
            const map = new Map(mirrors.map((x) => [x.id, x]));
            modifier.mirrors = order.map((id) => map.get(id)).filter(Boolean);
          });
          renderAll();
        });

        row.addEventListener('click', (e) => {
          const act = e.target.closest('[data-act]');
          if (act) {
            e.stopPropagation();
            const a = act.dataset.act;
            if (a === 'toggle') {
              commit(() => { m.enabled = m.enabled === false; }, { rebuild: false });
              renderAll(); // local re-render swaps icon + class
            } else if (a === 'lock') {
              commit(() => { m.locked = !m.locked; }, { rebuild: false });
              renderAll();
            } else if (a === 'delete') {
              const idx = mirrors.findIndex((x) => x.id === m.id);
              commit(() => {
                modifier.mirrors = mirrors.filter((x) => x.id !== m.id);
                if (modifier.mirrors.length === 0) {
                  modifier.mirrors.push(makeMirror('line', 0, uiCtx));
                }
              });
              // Selection: nearest neighbor or first
              const next = modifier.mirrors[Math.min(idx, modifier.mirrors.length - 1)];
              if (next) selectedId = next.id;
              pickerState = 'closed';
              persistPanelState();
              renderAll();
            }
            return;
          }
          selectedId = m.id;
          pickerState = 'closed';
          persistPanelState();
          renderAll();
        });

        list.appendChild(row);
      });

      // Add-mirror button
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'mp-stack-add' + (pickerState === 'new' ? ' is-active' : '');
      add.innerHTML = `<svg><use href="#mp-ic-plus"/></svg> Add mirror`;
      add.addEventListener('click', () => {
        pickerState = 'new';
        persistPanelState();
        renderAll();
      });
      list.appendChild(add);

      return sec;
    }

    function renderEditor() {
      const sec = document.createElement('section');
      sec.className = 'mp-editor';

      const hdr = document.createElement('div');
      hdr.className = 'mp-editor-hdr';

      const body = document.createElement('div');
      body.className = 'mp-editor-body';

      if (pickerState !== 'closed') {
        const cur = pickerState === 'replace' ? selectedMirror()?.type : null;
        hdr.classList.add('is-picker');
        hdr.innerHTML = `
          <div class="mp-editor-hdr-left">
            <span class="mp-step-tag">Step 1 / 2 — pick a type</span>
            <span class="mp-type-chip"><span class="mp-chip-dot"></span>${pickerState === 'replace' ? 'Change mirror type' : 'Choose a mirror type'}</span>
          </div>
          <button type="button" class="mp-change-cta is-cancel" data-act="picker-cancel">
            <svg><use href="#mp-ic-cross"/></svg> Cancel
          </button>
        `;
        hdr.querySelector('[data-act="picker-cancel"]').addEventListener('click', (e) => {
          e.stopPropagation();
          pickerState = 'closed';
          persistPanelState();
          renderAll();
        });

        const prompt = pickerState === 'replace'
          ? `Pick a new type. Parameters reset to that type's defaults.`
          : `Each card previews the actual transformation. Click one to add it to the stack.`;
        body.innerHTML = `
          <div class="mp-picker-wrap">
            <div class="mp-picker-prompt">${prompt}</div>
            <div class="mp-picker-grid">
              ${['line', 'radial', 'arc', 'wallpaper'].map((k) => {
                const t = TYPES[k];
                const isCurrent = cur === k;
                return `
                  <button type="button" class="mp-type-card ${isCurrent ? 'is-current' : ''}" data-pick="${k}" style="--mp-card-color: ${t.hueRaw};">
                    <span class="mp-current-marker">CURRENT</span>
                    <div class="mp-type-preview"><svg><use href="#${t.preview}"/></svg></div>
                    <div class="mp-type-name"><span class="mp-type-dot"></span>${t.label}</div>
                    <div class="mp-type-tag">${t.tag}</div>
                  </button>`;
              }).join('')}
            </div>
          </div>
        `;
        body.querySelectorAll('[data-pick]').forEach((el) => {
          el.addEventListener('click', () => {
            const type = el.dataset.pick;
            if (pickerState === 'replace') {
              const target = selectedMirror();
              if (target) {
                // Set pickerState before commit so persistPanelState() inside
                // commit saves 'closed', preventing the rebuild from re-showing
                // the picker.
                pickerState = 'closed';
                commit(() => {
                  // Replace params entirely so stale fields from the previous
                  // type (e.g. line.angle when switching to arc) don't linger.
                  const fresh = makeMirror(type, mirrors.indexOf(target), uiCtx);
                  // Preserve the row's identity, color, and per-mirror flags.
                  fresh.id = target.id;
                  if (target.color) fresh.color = target.color;
                  fresh.enabled = target.enabled !== false;
                  fresh.locked = !!target.locked;
                  fresh.guideVisible = target.guideVisible !== false;
                  const idx = mirrors.indexOf(target);
                  modifier.mirrors[idx] = fresh;
                  selectedId = fresh.id;
                });
              }
            } else {
              const m = makeMirror(type, mirrors.length, uiCtx);
              // Set selectedId and pickerState before commit so the rebuild
              // triggered by refreshModifierLayer sees the correct state.
              selectedId = m.id;
              pickerState = 'closed';
              commit(() => { modifier.mirrors.push(m); });
            }
            persistPanelState();
            renderAll();
          });
        });
      } else {
        const sel = selectedMirror();
        const t = sel ? TYPES[sel.type] : TYPES.line;
        const isLocked = !!sel?.locked;
        if (!isLocked) hdr.classList.add('is-clickable');
        if (isLocked) hdr.classList.add('is-locked');
        hdr.innerHTML = `
          <div class="mp-editor-hdr-left">
            <span class="mp-step-tag">Editing mirror</span>
            <span class="mp-type-chip"><span class="mp-chip-dot"></span>${t.label} mirror</span>
          </div>
          <button type="button" class="mp-change-cta" data-act="change-type"${isLocked ? ' disabled' : ''}>
            <svg><use href="#mp-ic-pick"/></svg> Change type
          </button>
        `;
        if (!isLocked) {
          const openPicker = (e) => {
            if (e) e.stopPropagation();
            pickerState = 'replace';
            persistPanelState();
            renderAll();
          };
          hdr.querySelector('[data-act="change-type"]').addEventListener('click', openPicker);
          hdr.addEventListener('click', openPicker);
        }

        body.innerHTML = bodyHtmlFor(sel || {});
        if (isLocked) body.classList.add('is-locked');
        bindBodyControls(body, sel);
      }

      sec.appendChild(hdr);
      sec.appendChild(body);
      return sec;
    }

    function bindBodyControls(body, mirror) {
      if (!mirror) return;

      // Sliders — live tag/fill update without rebuild for smooth dragging.
      // History contract: pushHistory MUST be called on the pre-drag state so
      // undo rewinds to the value before this gesture started. We snapshot
      // on pointerdown/first-input and push exactly once per drag.
      body.querySelectorAll('input[type=range][data-param]').forEach((el) => {
        const param = el.dataset.param;
        const isInt = el.dataset.int === '1';
        let preDragValue = null; // pre-drag snapshot; null between drags
        let historyPushed = false;
        const beginDrag = () => {
          if (preDragValue === null) preDragValue = mirror[param];
        };
        el.addEventListener('pointerdown', beginDrag);
        el.addEventListener('keydown', beginDrag);
        el.addEventListener('input', () => {
          const v = isInt ? Math.round(+el.value) : +el.value;
          if (!historyPushed) {
            // Push history with the value as it was BEFORE this gesture.
            const newVal = v;
            mirror[param] = preDragValue !== null ? preDragValue : mirror[param];
            if (uiCtx.app?.pushHistory) uiCtx.app.pushHistory();
            mirror[param] = newVal;
            historyPushed = true;
          } else {
            mirror[param] = v;
          }
          const min = +el.min, max = +el.max;
          el.style.setProperty('--fill', ((v - min) / (max - min || 1)) * 100 + '%');
          const tag = body.querySelector(`[data-tag="${param}"]`);
          if (tag) {
            const fmt = el.dataset.fmt;
            tag.textContent = fmt === 'deg' ? `${Math.round(v)}°`
              : fmt === 'pct' ? `${Math.round(v)}%`
              : fmt === 'scale' ? `${v.toFixed(2)}×`
              : `${Math.round(v)}`;
          }
          // sync dial pin if present
          const dial = body.querySelector(`.mp-dial[data-dial-param="${param}"]`);
          if (dial) {
            const pin = dial.querySelector('.mp-dial-pin');
            if (pin) pin.style.setProperty('--angle', `${v}deg`);
            dial.setAttribute('aria-valuenow', String(v));
          }
          refreshRowText();
          // Recompute mirrored geometry + redraw. Skip the panel rebuild so
          // the slider DOM stays put and the drag remains smooth.
          uiCtx.refreshModifierLayer(layer, { rebuildControls: false });
        });
        const endDrag = () => {
          preDragValue = null;
          historyPushed = false;
        };
        el.addEventListener('change', endDrag);
        el.addEventListener('pointerup', endDrag);
        el.addEventListener('pointercancel', endDrag);
        el.addEventListener('dblclick', (e) => {
          e.preventDefault();
          const defaults = defaultParamsFor(mirror.type);
          if (!(param in defaults)) return;
          el.value = defaults[param];
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });

      // Tile clicks: side / mode / clipToArc / variantV1
      body.querySelectorAll('[data-set]').forEach((el) => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const param = el.dataset.set;
          let v = el.dataset.val;
          if (v === 'true') v = true;
          else if (v === 'false') v = false;
          else if (param === 'count' || param === 'copies') v = parseInt(v, 10);
          commit(() => { mirror[param] = v; });
          // Tile state (active class, active-family header) is encoded in the
          // rendered HTML — re-render the panel so it reflects the new value.
          renderAll();
        });
      });

      // Wallpaper composable-symmetry chips: rebuild the (lattice, rotation,
      // mirrors) tuple, resolve through nearestValidGroup, and dual-write
      // mirror.group + mirror.symmetry so the engine keeps reading mirror.group
      // and a roundtrip preserves both fields.
      body.querySelectorAll('[data-sym-axis]').forEach((el) => {
        el.addEventListener('click', (e) => {
          if (el.disabled) return;
          e.stopPropagation();
          const WG = window.Vectura?.WallpaperGroups;
          if (!WG?.nearestValidGroup) return;
          const axis = el.dataset.symAxis;
          let val = el.dataset.symVal;
          if (axis === 'rotation') val = parseInt(val, 10);
          const sym = deriveWallpaperSymmetry(mirror);
          const next = { ...sym, [axis]: val };
          const groupId = WG.nearestValidGroup(next);
          const resolvedSym = WG.FEATURES[groupId] || sym;
          // SNAPPING FEEDBACK: detect axes the user did NOT click that the
          // resolver changed anyway (because the requested tuple wasn't a valid
          // group). We flash those chips + show a transient plain-language line.
          const snapped = ['lattice', 'rotation', 'mirrors'].filter((a) =>
            a !== axis && String(next[a]) !== String(resolvedSym[a]));
          // Stash snap feedback in panel state so it survives the rebuild that
          // refreshModifierLayer triggers (the last panel to render applies it).
          if (snapped.length) {
            pState.pendingSnap = { axes: snapped, sym: { ...resolvedSym } };
          }
          commit(() => {
            mirror.group = groupId;
            mirror.symmetry = { ...resolvedSym };
          });
          renderAll();
        });
      });

      // Angle dial drag
      body.querySelectorAll('.mp-dial').forEach((dial) => {
        const row = dial.closest('.mp-dial-row');
        const dialParam = dial.dataset.dialParam;
        const slider = row && dialParam && row.querySelector(`input[type=range][data-param="${dialParam}"]`);
        if (!slider) return;
        let activePointerId = null;
        const apply = (ev) => {
          if (slider.disabled) return;
          const r = dial.getBoundingClientRect();
          const v = pointToAngleDeg(ev.clientX, ev.clientY, r, ev.shiftKey);
          if (+slider.value === v) return;
          slider.value = v;
          slider.dispatchEvent(new Event('input', { bubbles: true }));
        };
        dial.addEventListener('pointerdown', (e) => {
          if (slider.disabled) return;
          e.preventDefault();
          activePointerId = e.pointerId;
          try { dial.setPointerCapture(e.pointerId); } catch (_) {}
          dial.classList.add('is-dragging');
          apply(e);
        });
        dial.addEventListener('pointermove', (e) => {
          if (e.pointerId === activePointerId) apply(e);
        });
        const end = (e) => {
          if (e.pointerId !== activePointerId) return;
          activePointerId = null;
          dial.classList.remove('is-dragging');
          try { dial.releasePointerCapture(e.pointerId); } catch (_) {}
          slider.dispatchEvent(new Event('change', { bubbles: true }));
          fireDialBlip(dial);
        };
        dial.addEventListener('pointerup', end);
        dial.addEventListener('pointercancel', end);
        dial.addEventListener('dblclick', (e) => {
          e.preventDefault();
          if (!slider || slider.disabled) return;
          const defaults = defaultParamsFor(mirror.type);
          if (!(dialParam in defaults)) return;
          slider.value = defaults[dialParam];
          slider.dispatchEvent(new Event('input', { bubbles: true }));
          slider.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });

      // Info popovers
      body.querySelectorAll('[data-info-open]').forEach((el) => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = el.dataset.infoOpen;
          closeAllPopovers(body);
          const pop = body.querySelector(`.mp-info-popover[data-info-id="${id}"]`);
          const back = body.querySelector('.mp-info-backdrop');
          if (pop) pop.classList.add('is-open');
          if (back) back.classList.add('is-open');
        });
      });
      body.querySelectorAll('[data-info-close]').forEach((el) => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          closeAllPopovers(body);
        });
      });

      // Wallpaper-only wiring (Styles gallery, dice, mode toggle, previews).
      if (mirror.type === 'wallpaper') bindWallpaperControls(body, mirror);
    }

    // Transient snap feedback: highlight auto-changed chips and surface a
    // plain-language line. CSS owns the fade (motion.css, .mp-chip.mp-snap-*).
    // Reads from pState.pendingSnap so it applies on the live (rebuilt) panel.
    function applyPendingSnap() {
      const snap = pState.pendingSnap;
      if (!snap) return;
      pState.pendingSnap = null;
      flashSnap(snap.axes, snap.sym);
    }

    function flashSnap(snappedAxes, resolvedSym) {
      const body = root.querySelector('.mp-editor-body');
      if (!body) return;
      snappedAxes.forEach((axis) => {
        const chip = body.querySelector(`[data-sym-axis="${axis}"].is-active`);
        if (chip) {
          chip.classList.add('mp-snap-flash');
          setTimeout(() => chip.classList.remove('mp-snap-flash'), 1400);
        }
      });
      const labelFor = {
        lattice: LATTICE_LABELS[resolvedSym.lattice] || resolvedSym.lattice,
        rotation: ROTATION_LABEL(resolvedSym.rotation),
        mirrors: MIRROR_LABELS[resolvedSym.mirrors] || resolvedSym.mirrors,
      };
      const parts = snappedAxes.map((a) => `${a === 'rotation' ? 'rotation' : a} → ${labelFor[a]}`);
      const line = body.querySelector('[data-testid="wall-snap-line"]');
      if (line) {
        line.textContent = `Adjusted ${parts.join(' and ')} to keep a valid pattern.`;
        line.hidden = false;
        line.classList.add('mp-snap-show');
        setTimeout(() => { line.classList.remove('mp-snap-show'); line.hidden = true; }, 2600);
      }
    }

    function bindWallpaperControls(body, mirror) {
      // Mode toggle: persist Styles/Build choice in SETTINGS, then rebuild.
      body.querySelectorAll('[data-wall-mode]').forEach((el) => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          setWallpaperMode(el.dataset.wallMode);
          renderAll();
        });
      });

      // Live preview thumbnails via the WallpaperPreview seam. We pass the
      // active layer's descendant source geometry so cards preview the user's
      // actual art under each symmetry/recipe.
      const Preview = window.Vectura?.WallpaperPreview;
      const sourcePaths = wallpaperSourcePaths(uiCtx, layer);
      const renderThumb = (el, mirrorCfg) => {
        if (!Preview?.render || !el) return;
        try { Preview.render(el, { mirror: mirrorCfg, sourcePaths, size: 72 }); } catch (_) {}
      };
      const WG = window.Vectura?.WallpaperGroups;
      body.querySelectorAll('[data-style-group-thumb]').forEach((el) => {
        const gid = el.dataset.styleGroupThumb;
        renderThumb(el, { group: gid, symmetry: WG?.FEATURES?.[gid] });
      });
      const presets = window.Vectura?.WallpaperPresets?.list?.() || [];
      body.querySelectorAll('[data-style-preset-thumb]').forEach((el) => {
        const p = presets[parseInt(el.dataset.stylePresetThumb, 10)];
        if (p) renderThumb(el, p.mirror);
      });

      // Apply a bare group card. Dual-writes group + symmetry; pushes history.
      body.querySelectorAll('[data-style-group]').forEach((el) => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const gid = el.dataset.styleGroup;
          const resolvedSym = WG?.FEATURES?.[gid];
          commit(() => {
            mirror.group = gid;
            if (resolvedSym) mirror.symmetry = { ...resolvedSym };
          });
          renderAll();
        });
      });

      // Apply a named recipe card. Recipe.mirror already dual-writes group +
      // symmetry; merge the override fields over the current mirror.
      body.querySelectorAll('[data-style-preset]').forEach((el) => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const p = presets[parseInt(el.dataset.stylePreset, 10)];
          if (!p) return;
          commit(() => { Object.assign(mirror, p.mirror); });
          renderAll();
        });
      });

      // Surprise me — random valid group via the WallpaperPresets seam.
      // Shift keeps the current lattice family (axis-lock); discoverable via
      // the button title + hint text. Always undoable (commit pushes history).
      body.querySelectorAll('[data-act="surprise"]').forEach((el) => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const Presets = window.Vectura?.WallpaperPresets;
          if (!Presets?.randomize) return;
          const locked = { lattice: !!(e.shiftKey) };
          const override = Presets.randomize({ locked, current: mirror });
          commit(() => { Object.assign(mirror, override); });
          renderAll();
        });
      });
    }

    function refreshRowText() {
      const sel = selectedMirror();
      if (!sel) return;
      const row = root.querySelector(`.mp-row[data-mirror-id="${sel.id}"]`);
      if (!row) return;
      const nameEl = row.querySelector('.mp-row-name-text');
      const sumEl = row.querySelector('.mp-row-summary');
      if (nameEl) nameEl.textContent = nameFor(sel);
      if (sumEl) sumEl.textContent = summaryFor(sel);
    }

    function renderAll() {
      setTypeColor();
      root.innerHTML = '';
      root.appendChild(renderStack());
      root.appendChild(renderEditor());
      applyPendingSnap();
    }

    // Register ESC-cancels-picker for the currently-mounted panel.
    UI._mirrorPanelEscapeHook = () => {
      if (pickerState !== 'closed') {
        pickerState = 'closed';
        persistPanelState();
        renderAll();
        return true;
      }
      return false;
    };

    // Register the wallpaper-family cycle hook (⌘← / ⌘→). Returns true when
    // it actually advanced a wallpaper mirror so the host can stopPropagation.
    UI._mirrorPanelCycleHook = (dir) => {
      if (pickerState !== 'closed') return false;
      const sel = selectedMirror();
      if (!sel || sel.type !== 'wallpaper' || sel.locked) return false;
      const WG = window.Vectura?.WallpaperGroups;
      if (!WG?.cycleInFamily || !WG.FEATURES) return false;
      const curId = WG.featuresToGroupId(deriveWallpaperSymmetry(sel)) || sel.group || 'p4m';
      const nextId = WG.cycleInFamily(curId, dir);
      if (nextId === curId) return false;
      const nextSym = WG.FEATURES[nextId];
      if (!nextSym) return false;
      commit(() => {
        sel.group = nextId;
        sel.symmetry = { ...nextSym };
      });
      renderAll();
      return true;
    };

    renderAll();
  }

  function closeAllPopovers(scope) {
    (scope || document).querySelectorAll('.mp-info-popover.is-open, .mp-info-backdrop.is-open')
      .forEach((el) => el.classList.remove('is-open'));
  }

  function makeMirror(type, index, uiCtx) {
    // Reuse the existing factory functions to keep state model identical.
    const Modifiers = (G.Vectura && G.Vectura.Modifiers) || {};
    const f = type === 'radial' ? Modifiers.createRadialMirror
            : type === 'arc' ? Modifiers.createArcMirror
            : type === 'wallpaper' ? Modifiers.createWallpaperMirror
            : Modifiers.createMirrorLine;
    if (typeof f === 'function') return f(index || 0);
    // Defensive fallback (only hit in tests without Modifiers loaded)
    return Object.assign({ id: `mirror-${index + 1}`, type, enabled: true, locked: false, guideVisible: true }, defaultParamsFor(type));
  }

  // ESC has three precedence levels on the panel:
  //   1. Close any open info popover.
  //   2. Otherwise, cancel the picker if one is open.
  //   3. Otherwise, do nothing (let the host handle it).
  // We expose a single hook here so build() can register the active cancel.
  UI._mirrorPanelEscapeHook = UI._mirrorPanelEscapeHook || null;
  UI._mirrorPanelCycleHook = UI._mirrorPanelCycleHook || null;
  if (typeof document !== 'undefined' && !UI._mirrorPanelEscBound) {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const open = document.querySelector('.mp-info-popover.is-open');
        if (open) {
          closeAllPopovers();
          e.stopPropagation();
          return;
        }
        const hook = UI._mirrorPanelEscapeHook;
        if (typeof hook === 'function') {
          if (hook()) e.stopPropagation();
        }
        return;
      }
      // ⌘← / ⌘→ — cycle through groups sharing the current lattice. Only
      // active when a wallpaper mirror is selected and editable.
      const isArrow = e.key === 'ArrowLeft' || e.key === 'ArrowRight';
      if (isArrow && (e.metaKey || e.ctrlKey) && !e.altKey) {
        // Stay out of the way when the user is editing text.
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        const hook = UI._mirrorPanelCycleHook;
        if (typeof hook === 'function') {
          if (hook(e.key === 'ArrowRight' ? 1 : -1)) {
            e.preventDefault();
            e.stopPropagation();
          }
        }
      }
    });
    UI._mirrorPanelEscBound = true;
  }

  UI.MirrorPanel = {
    build,
    // pure helpers exported for unit tests
    defaultParamsFor,
    nameFor,
    summaryFor,
    pointToAngleDeg,
    fillPct,
    TYPES,
    WALL_GROUPS,
    INFO_TOPICS,
    ensureSprite,
  };
})();
