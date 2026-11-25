const { loadSurfaceLockRuntime } = require('../helpers/surface-lock-scene');
const LR = require('../helpers/light-realism');
const crypto = require('crypto');

// voronoiWeb "Close cells" (voronoiClosedCells, default off): tone chooses WHOLE cells, never single walls.
//   - Every wall belongs to the cell (of the two it separates) with the lower tone rank, and its rank is that cell's rank (through the min's CDF, so the
//     ink per tone is unchanged). A cell is therefore drawn whole, and a wall is drawn when EITHER neighbour is: at any rank threshold the drawn walls
//     are the boundaries of whole cells. That is exact in the BAKE and is pinned at bake level below.
//   - Every vertex of a run carries its owner cell's normal, so the frame's per-vertex tone / facing gate is one decision per cell instead of cutting
//     a cell part-way. A tone contour still separates a cell from a neighbour with a different tone, so the frame keeps a few open ends on the lit
//     fade (measured: ~1/3 of the thinned web's); a silhouette / occlusion clip is a view clip and is not counted.

// An endpoint is open when no OTHER polyline passes within TOL of it (RDP keeps a wall within the simplify tolerance of a junction, not on it).
const openEnds = (lines, TOL = 0.12, dim = 2) => {
  const H = 1; const grid = new Map();
  const get = (p, a) => (a === 0 ? p.x : a === 1 ? p.y : p.z);
  const cellOf = (p) => { const k = []; for (let a = 0; a < dim; a++) k.push(Math.floor(get(p, a) / H)); return k; };
  const ids = (ks) => ks.join(',');
  const addSeg = (li, a, b) => {
    const lo = cellOf({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z || 0, b.z || 0) }); const hi = cellOf({ x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z || 0, b.z || 0) });
    const rec = (ax, cur) => { if (ax === dim) { const k = ids(cur); if (!grid.has(k)) grid.set(k, []); grid.get(k).push([li, a, b]); return; } for (let v = lo[ax]; v <= hi[ax]; v++) rec(ax + 1, cur.concat(v)); };
    rec(0, []);
  };
  lines.forEach((l, li) => { for (let i = 0; i + 1 < l.length; i++) addSeg(li, l[i], l[i + 1]); });
  const dseg = (p, a, b) => {
    const ab = [b.x - a.x, b.y - a.y, (b.z || 0) - (a.z || 0)]; const ap = [p.x - a.x, p.y - a.y, (p.z || 0) - (a.z || 0)];
    const l2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2]; let t = l2 > 0 ? (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / l2 : 0; t = Math.max(0, Math.min(1, t));
    return Math.hypot(ap[0] - t * ab[0], ap[1] - t * ab[1], ap[2] - t * ab[2]);
  };
  const out = [];
  lines.forEach((l, li) => {
    if (!l || l.length < 2) return;
    const a = l[0]; const b = l[l.length - 1];
    if (Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0)) < TOL) return; // a closed ring has no ends
    [a, b].forEach((p) => {
      let ok = false; const c = cellOf(p);
      const rec = (ax, cur) => { if (ok) return; if (ax === dim) { (grid.get(ids(cur)) || []).forEach(([lj, s, e]) => { if (lj !== li && dseg(p, s, e) < TOL) ok = true; }); return; } for (let d = -1; d <= 1; d++) rec(ax + 1, cur.concat(c[ax] + d)); };
      rec(0, []);
      if (!ok) out.push(p);
    });
  });
  return out;
};

const LAW = 'voronoiWeb';
const bakeSpec = (closed, scaleRef = 3) => ({
  objectId: 'o1', primitive: 'sphere', mode: 'sphere', sizes: { sx: 14, sy: 14, sz: 14 }, detail: 24, scale: { sx: 1, sy: 1, sz: 1 }, mapper: 'hatch', toneLaw: LAW,
  style: { fillAngle: 45, fillDensity: 50, densityScale: 1, markSpace: 'surface', ...(closed ? { voronoiClosedCells: true } : {}) },
  penWidth: 0.3, scaleRef, seed: { salt: 0, phase: 0, off: 0 }, toneModel: 'v2',
});

describe('voronoiWeb Close cells (voronoiClosedCells)', () => {
  let rt; let V; let SL; let W; let MS;
  const mk = (closed, extra = {}) => LR.buildCase(V, { law: LAW, markSpace: 'surface', ...extra, style: { ...(extra.style || {}), ...(closed ? { voronoiClosedCells: true } : {}) } });
  beforeAll(async () => { rt = await loadSurfaceLockRuntime(); V = rt.V; SL = V.Scene3D.SurfaceLock; W = V.Scene3D.SurfaceLockWebs; MS = V.Scene3D.SurfaceLockMarkSet; }, 240000);
  afterAll(() => rt && rt.cleanup());

  // The runs a tone gate of `t` draws, per level web (the levels are independent diagrams): returns the open ends of each web, 3D.
  const bakeOpenEnds = (ms, t) => {
    const bands = new Map();
    for (let r = 0; r < ms.runCount; r++) { if (ms.runRank[r] / MS.RANK_SCALE >= t) continue; const k = ms.runBand[2 * r] + ':' + ms.runBand[2 * r + 1]; if (!bands.has(k)) bands.set(k, []); bands.get(k).push(r); }
    let total = 0; let drawn = 0;
    bands.forEach((runs) => {
      const lines = runs.map((r) => { const l = []; for (let i = ms.runStart[r]; i < ms.runStart[r + 1]; i++) l.push({ x: ms.positions[3 * i], y: ms.positions[3 * i + 1], z: ms.positions[3 * i + 2] }); return l; });
      drawn += lines.length; total += openEnds(lines, 0.04, 3).length;
    });
    return { total, drawn };
  };

  it('RED/GREEN (bake): at any tone gate the drawn walls of a level web are whole cells: 0 dangling ends; the thinned web leaves many', () => {
    const off = W.bake(bakeSpec(false)); const on = W.bake(bakeSpec(true));
    expect(MS.validate(on)).toEqual([]);
    [0.05, 0.2, 0.4].forEach((t) => {
      const a = bakeOpenEnds(off, t); const b = bakeOpenEnds(on, t);
      expect(a.total, `thinned web at gate ${t}: ${JSON.stringify(a)}`).toBeGreaterThan(20);
      expect(b.total, `closed cells at gate ${t}: ${JSON.stringify(b)}`).toBe(0);
      expect(b.drawn).toBeGreaterThan(50);
    });
  });

  it('RED/GREEN (frame): the settled sphere keeps far fewer open ends away from the silhouette (the lit fade keeps a few: a tone contour is not a view clip)', () => {
    const run = (closed) => {
      const s = mk(closed); SL.clearCache(); SL.resetStats();
      const paths = s.composeFull(); const prof = LR.measure(s, { model: 'v2', paths });
      const [cx, cy] = prof.discC; const R = prof.discR;
      const ends = openEnds(s.fills(paths)).filter((p) => Math.hypot(p.x - cx, p.y - cy) < R - 1.5);
      return { ends, prof };
    };
    const off = run(false); const on = run(true);
    expect(off.ends.length, 'the thinned web leaves open ends').toBeGreaterThan(100);
    expect(on.ends.length, `${on.ends.length} vs ${off.ends.length}`).toBeLessThan(off.ends.length * 0.5);
  });

  it('tone still reads: the ink of the darkest tone bins is at least 1.5x that of the lightest bins that carry ink', () => {
    const s = mk(true); SL.clearCache();
    const paths = s.composeFull(); const prof = LR.measure(s, { model: 'v2', paths });
    const cov = LR.bins(prof, 'L', { n: 10 }).map((x) => (x.cov === null ? 0 : x.cov));
    const dark = (cov[0] + cov[1]) / 2; const lit = (cov[7] + cov[8]) / 2;
    expect(lit, JSON.stringify(cov)).toBeGreaterThan(0);
    expect(dark / lit, JSON.stringify(cov)).toBeGreaterThanOrEqual(1.5);
    for (let i = 1; i < cov.length; i++) expect(cov[i] - cov[i - 1], `bin ${i} ${JSON.stringify(cov)}`).toBeLessThan(0.04); // M1: no bin gets darker as the light rises
  });

  it('Level S is kept: settled == drag at one pose, the option rebakes (new key), and the default is byte-identical with or without the key', () => {
    const sha = (paths) => crypto.createHash('sha1').update(JSON.stringify(paths.map((p) => p.map((q) => [Math.round(q.x * 100), Math.round(q.y * 100)])))).digest('hex');
    const a = mk(true); SL.clearCache(); SL.resetStats();
    a.composeFull(); // the full bake is cached (a cold drag frame is the coarse LOD frame)
    a.setPose({ camYaw: 40, camPitch: 20 });
    const drag = a.composePreview(); const rest = a.composeFull();
    expect(sha(rest)).toBe(sha(drag));
    const x = mk(false); const y = mk(false, { style: { voronoiClosedCells: false } });
    expect(sha(x.composeFull())).toBe(sha(y.composeFull()));
    expect(SL.bakeKey(bakeSpec(true))).not.toBe(SL.bakeKey(bakeSpec(false)));
    expect(W.supports(bakeSpec(true))).toBe(true);
  });
});
