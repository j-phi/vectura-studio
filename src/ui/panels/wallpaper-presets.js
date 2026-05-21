/**
 * Vectura wallpaper presets + randomizer — PHASE 0 SEAM STUB.
 *
 * Owner: Team Gamma. Ships a small functional seed today so Team Beta's gallery
 * has cards + a working dice button to wire against. Gamma expands list() into
 * the full curated recipe set and refines randomize() (curated param ranges,
 * polished axis-lock UX) WITHOUT changing the public signatures.
 *
 * ── PUBLIC API CONTRACT (do not break) ───────────────────────────────────────
 *   WallpaperPresets.list() -> Array<{ id, name, mirror }>
 *     `id`    : kebab-case, prefixed "wallpaper-".
 *     `name`  : evocative display name (artist-facing).
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
 *     (guaranteed by WallpaperGroups.nearestValidGroup).
 * ──────────────────────────────────────────────────────────────────────────────
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const WG = () => Vectura.WallpaperGroups;

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

  const symFor = (groupId) => {
    const F = WG() && WG().FEATURES;
    return F && F[groupId] ? Object.assign({}, F[groupId]) : { lattice: 'square', rotation: 4, mirrors: 'straight' };
  };

  // PHASE 0 seed recipes. Gamma replaces/extends with the full curated gallery.
  const SEED = [
    { id: 'wallpaper-windowpane', name: 'Windowpane', group: 'p4m', tileWidth: 90, tileAngle: 90, domainScale: 1 },
    { id: 'wallpaper-snowflake-lace', name: 'Snowflake Lace', group: 'p6', tileWidth: 80, domainScale: 1.15, variantV1: true },
    { id: 'wallpaper-tatami', name: 'Tatami', group: 'pgg', tileWidth: 70, tileHeight: 120, tileAngle: 90 },
    { id: 'wallpaper-kasbah', name: 'Kasbah Tile', group: 'cmm', tileWidth: 88, tileAngle: 90 },
  ];

  const list = () => SEED.map((s) => {
    const { id, name } = s;
    const mirror = Object.assign({}, s);
    delete mirror.id; delete mirror.name;
    mirror.group = s.group;
    mirror.symmetry = symFor(s.group);
    return { id, name, mirror };
  });

  const randomize = (opts = {}) => {
    const wg = WG();
    const locked = opts.locked || {};
    const cur = opts.current || {};
    const curSym = cur.symmetry || (cur.group && wg ? symFor(cur.group) : { lattice: 'square', rotation: 4, mirrors: 'straight' });

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
    const lockedAxes = (wg && wg.getLockedAxes && wg.getLockedAxes(groupId)) || { tileHeight: false, tileAngle: false };

    const tileWidth = randInt(40, 140);
    return {
      group: groupId,
      symmetry,
      tileWidth,
      tileHeight: lockedAxes.tileHeight ? tileWidth : randInt(40, 140),
      tileAngle: lockedAxes.tileAngle ? (symmetry.lattice === 'hexagonal' ? 60 : 90) : randInt(60, 120),
      rotation: randInt(0, 359),
      domainScale: Math.round((0.7 + Math.random() * 0.8) * 100) / 100,
      variantV1: false,
    };
  };

  Vectura.WallpaperPresets = {
    list,
    randomize,
    _isPhase0Stub: true,
  };
})();
