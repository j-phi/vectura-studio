/**
 * Vectura wallpaper presets + randomizer — CURATED GALLERY.
 *
 * Owner: Team Gamma. Provides the artist-facing recipe gallery (consumed by
 * Team Beta's cards) and the dice-button randomizer. Every recipe + every
 * random roll is a real crystallographic group, guaranteed valid against
 * window.Vectura.WallpaperGroups.
 *
 * ── PUBLIC API CONTRACT (do not break) ───────────────────────────────────────
 *   WallpaperPresets.list() -> Array<{ id, name, mirror }>
 *     `id`    : kebab-case, prefixed "wallpaper-".
 *     `name`  : evocative display name (artist-facing, no crystallographic codes).
 *     `mirror`: partial wallpaper mirror config to merge over createWallpaperMirror()
 *               defaults. ALWAYS dual-writes `group` AND `symmetry` so the engine
 *               (reads group) and the chips (read symmetry) stay consistent.
 *
 *   WallpaperPresets.randomize(opts) -> object (mirror overrides)
 *     opts = {
 *       locked:  { lattice?:bool, rotation?:bool, mirrors?:bool },  // axes to KEEP
 *       current: object  // current mirror config, source for locked axis values
 *     }
 *     Returns { group, symmetry, tileWidth, tileHeight, tileAngle, rotation,
 *               domainScale, variantV1 } — always a VALID crystallographic group
 *     (guaranteed by WallpaperGroups.featuresToGroupId / nearestValidGroup).
 *
 * ── SOURCE OF TRUTH ───────────────────────────────────────────────────────────
 *   list() is the SINGLE source of truth for the wallpaper gallery. These recipes
 *   are NOT mirrored into src/config/presets.js: that file stores algorithm-`params`
 *   presets keyed by `preset_system` (petalisDesigner / terrain / rings / svgDistort),
 *   each consumed by a parameter-driven algorithm. A wallpaper mirror is a different
 *   shape (a mirror-modifier config, not algorithm params) and nothing in the app
 *   reads a `wallpaperMirror` system out of PRESETS. Duplicating here would create a
 *   second, drift-prone source of truth with no consumer — so it is deliberately
 *   omitted.
 * ──────────────────────────────────────────────────────────────────────────────
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const WG = () => Vectura.WallpaperGroups;

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
  const round2 = (n) => Math.round(n * 100) / 100;
  const randFloat = (lo, hi) => round2(lo + Math.random() * (hi - lo));

  const FALLBACK_SYM = { lattice: 'square', rotation: 4, mirrors: 'straight' };

  const symFor = (groupId) => {
    const F = WG() && WG().FEATURES;
    return F && F[groupId] ? Object.assign({}, F[groupId]) : Object.assign({}, FALLBACK_SYM);
  };

  const lockedAxesFor = (groupId) => {
    const wg = WG();
    return (wg && wg.getLockedAxes && wg.getLockedAxes(groupId)) || { tileHeight: false, tileAngle: false };
  };

  // ── Curated gallery ─────────────────────────────────────────────────────────
  // Each recipe declares a real `group` plus tasteful tile params. Locked axes
  // (square/hex force H=W and a fixed cell angle; rhombic ignores tileAngle) are
  // sanitised at build time in list(), so authors needn't pre-strip them — but
  // recipes below already avoid setting conflicting fields for clarity.
  // Curated so no recipe is a visual twin of another or of a bare-group card.
  // A recipe earns its place by differing in a VISIBLE axis the icon shows:
  // pattern angle, lattice skew (tileAngle), aspect (tileWidth:tileHeight), or
  // the alternate domain (variantV1). Recipes that were merely "group X at the
  // default look" (Windowpane=p4m, Hex Bloom=p6m, Kaleidoscope=p3m1, Star
  // Anise=p31m, Pinwheel=diagonal p4 — now the p4 group card itself) were
  // dropped, as was one of the two near-identical pgg rectangles.
  const RECIPES = [
    // ── Square (p4 / p4m / p4g) ────────────────────────────────────────────
    { id: 'wallpaper-op-art-weave',   name: 'Op-Art Weave',      group: 'p4g', tileWidth: 72,  domainScale: 1.6, variantV1: true },
    { id: 'wallpaper-courtyard',      name: 'Courtyard',         group: 'p4m', tileWidth: 120, domainScale: 0.78, rotation: 45 },

    // ── Rectangular (pm / pg / pmm / pmg / pgg) ────────────────────────────
    { id: 'wallpaper-picket-fence',   name: 'Picket Fence',      group: 'pm',  tileWidth: 56,  tileHeight: 120, tileAngle: 90 },
    { id: 'wallpaper-switchback',     name: 'Switchback',        group: 'pgg', tileWidth: 60,  tileHeight: 110, tileAngle: 90 },
    { id: 'wallpaper-brick-path',     name: 'Brick Path',        group: 'pg',  tileWidth: 90,  tileHeight: 64,  tileAngle: 90, domainScale: 0.85 },
    { id: 'wallpaper-leaded-glass',   name: 'Leaded Glass',      group: 'pmm', tileWidth: 78,  tileHeight: 100, tileAngle: 90 },
    { id: 'wallpaper-procession',     name: 'Procession',        group: 'pmg', tileWidth: 64,  tileHeight: 96,  tileAngle: 90, domainScale: 1.05 },

    // ── Rhombic (cm / cmm) — tileAngle drives the diamond skew ──────────────
    { id: 'wallpaper-kasbah',         name: 'Kasbah Tile',       group: 'cmm', tileWidth: 88,  tileAngle: 70 },
    { id: 'wallpaper-harlequin',      name: 'Harlequin',         group: 'cm',  tileWidth: 80,  tileAngle: 55 },
    { id: 'wallpaper-diamond-trellis',name: 'Diamond Trellis',   group: 'cmm', tileWidth: 100, tileAngle: 50, domainScale: 0.82 },

    // ── Oblique (p1 / p2) — skewed parallelogram lattices ──────────────────
    { id: 'wallpaper-drift-grid',     name: 'Drift Grid',        group: 'p1',  tileWidth: 92,  tileHeight: 70,  tileAngle: 72 },
    { id: 'wallpaper-pinwheel-skew',  name: 'Skewed Pinwheel',   group: 'p2',  tileWidth: 84,  tileHeight: 96,  tileAngle: 66, domainScale: 1.08 },

    // ── Hexagonal (p3 / p3m1 / p31m / p6 / p6m) ────────────────────────────
    { id: 'wallpaper-snowflake-lace', name: 'Snowflake Lace',    group: 'p6',  tileWidth: 84,  domainScale: 1.15, variantV1: true },
    { id: 'wallpaper-alpine-frost',   name: 'Alpine Frost',      group: 'p6m', tileWidth: 96,  domainScale: 1.4, variantV1: true },
    { id: 'wallpaper-trefoil',        name: 'Trefoil',           group: 'p3',  tileWidth: 90,  domainScale: 1, variantV1: true },
    // Restored: tilted off-axis (rotation) so each reads distinctly from its
    // bare Triangle Mirror (p3m1) / Triangle Edge (p31m) group card.
    { id: 'wallpaper-kaleidoscope',   name: 'Kaleidoscope',      group: 'p3m1', tileWidth: 88, domainScale: 0.85, rotation: 30 },
    { id: 'wallpaper-star-anise',     name: 'Star Anise',        group: 'p31m', tileWidth: 92, domainScale: 1.1, rotation: 30 },
  ];

  const list = () => RECIPES.map((r) => {
    const { id, name } = r;
    const group = r.group;
    const sym = symFor(group);
    const locks = lockedAxesFor(group);
    const mirror = Object.assign({}, r);
    delete mirror.id;
    delete mirror.name;
    mirror.group = group;
    mirror.symmetry = sym;
    // Respect locked axes: square/hex force tileHeight = tileWidth and a fixed
    // cell angle, so never carry conflicting authored values into the mirror.
    if (locks.tileHeight) delete mirror.tileHeight;
    if (locks.tileAngle) delete mirror.tileAngle;
    return { id, name, mirror };
  });

  const randomize = (opts = {}) => {
    const wg = WG();
    const locked = opts.locked || {};
    const cur = opts.current || {};
    const curSym = cur.symmetry || (cur.group ? symFor(cur.group) : Object.assign({}, FALLBACK_SYM));

    const lattices = ['oblique', 'rectangular', 'rhombic', 'square', 'hexagonal'];
    const lattice = locked.lattice ? curSym.lattice : pick(lattices);

    const rots = (wg && wg.LATTICE_ROTATIONS && wg.LATTICE_ROTATIONS[lattice]) || [curSym.rotation];
    const rotation = (locked.rotation && rots.includes(curSym.rotation)) ? curSym.rotation : pick(rots);

    const mirs = (wg && wg.MIRROR_CHAINS && wg.MIRROR_CHAINS[`${lattice}:${rotation}`]) || ['none'];
    const mirrors = (locked.mirrors && mirs.includes(curSym.mirrors)) ? curSym.mirrors : pick(mirs);

    const target = { lattice, rotation, mirrors };
    const groupId = (wg && wg.featuresToGroupId && wg.featuresToGroupId(target))
      || (wg && wg.nearestValidGroup && wg.nearestValidGroup(target))
      || 'p4m';
    const symmetry = symFor(groupId);
    const locks = lockedAxesFor(groupId);

    // Tasteful tile sizing: never degenerate-tiny or huge. Square/hex consume
    // only tileWidth; rectangular/oblique get an independently sized height.
    const tileWidth = randInt(60, 120);
    const tileHeight = locks.tileHeight ? tileWidth : randInt(60, 120);
    // tileAngle: square/hex are locked to their canonical cell angle. Rhombic
    // and oblique honor a skew within a pleasant, non-collapsing range.
    let tileAngle;
    if (locks.tileAngle) {
      tileAngle = symmetry.lattice === 'hexagonal' ? 60 : 90;
    } else {
      tileAngle = randInt(50, 100);
    }

    // domainScale: subtle gap (<1) to subtle overlap (>1); avoid extremes that
    // wipe the tile out or create a solid blob.
    const domainScale = randFloat(0.82, 1.25);

    // variantV1: only meaningful where the group exposes an alternate
    // fundamental domain; keep it an occasional flourish.
    const groupDef = wg && wg.GROUPS && wg.GROUPS[groupId];
    const variantV1 = !!(groupDef && groupDef.hasV1) && Math.random() < 0.35;

    return {
      group: groupId,
      symmetry,
      tileWidth,
      tileHeight,
      tileAngle,
      rotation: randInt(0, 359),
      domainScale,
      variantV1,
    };
  };

  Vectura.WallpaperPresets = {
    list,
    randomize,
  };
})();
