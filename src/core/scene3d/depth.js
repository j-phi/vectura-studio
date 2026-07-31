/**
 * Scene3D.Depth — the scene depth-buffer API (spec F-04).
 *
 * `build(tris)` rasterizes the scene's triangle soup ONCE into a retained
 * Float32 buffer and returns { depthAt(x, y[, excludeOwner]), occlude }.
 * Depth convention matches Geometry3D: larger d = nearer the camera.
 *
 * Owner-aware self-occlusion (the piece occludeSegmentsDepthBuffer lacks):
 * every cell retains its TWO nearest depths from DISTINCT owners, so
 * depthAt(x, y, owner) can answer "nearest depth written by anyone else" in
 * O(1) — a segment lying on its own face never self-occludes, while nearer
 * geometry from other owners still hides it. The rasterization math is forked
 * from Geometry3D.occludeSegmentsDepthBuffer (same barycentric fill, same
 * cell sizing) with the owner channel added.
 *
 * `occlude(segments)` honours per-segment { ownerId, mode: 'remove'|'dash',
 * bias } (falling back to the call-level defaults), splitting each segment
 * into visible runs and — for 'dash' — markHidden'd hidden runs.
 */
(() => {
  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = (globalScope.Vectura = globalScope.Vectura || {});
  const G3 = Vectura.Geometry3D || {};

  const { clamp, finite, lerp, pathWithMeta, markHidden } = G3;

  const NO_OWNER = -1;

  const parseTriangle = (entry) => {
    if (!entry) return null;
    if (Array.isArray(entry)) {
      if (entry.length < 3 || !entry[0] || !entry[1] || !entry[2]) return null;
      return { p0: entry[0], p1: entry[1], p2: entry[2], owner: entry.owner };
    }
    if (Array.isArray(entry.pts)) {
      if (entry.pts.length < 3) return null;
      return { p0: entry.pts[0], p1: entry.pts[1], p2: entry.pts[2], owner: entry.owner };
    }
    if (entry.a && entry.b && entry.c) return { p0: entry.a, p1: entry.b, p2: entry.c, owner: entry.owner };
    return null;
  };

  const build = (tris, opts = {}) => {
    const triList = (Array.isArray(tris) ? tris : []).map(parseTriangle).filter(Boolean);

    const passthroughOcclude = (segments) => (Array.isArray(segments) ? segments : [])
      .filter((seg) => seg && seg.a && seg.b)
      .map((seg) => pathWithMeta([seg.a, seg.b], seg.meta ? { ...seg.meta } : null));

    if (!triList.length) {
      return {
        empty: true,
        depthAt: () => -Infinity,
        occlude: passthroughOcclude,
      };
    }

    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    triList.forEach((t) => {
      [t.p0, t.p1, t.p2].forEach((p) => {
        if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
      });
    });
    if (!(maxX > minX) || !(maxY > minY)) {
      return { empty: true, depthAt: () => -Infinity, occlude: passthroughOcclude };
    }

    const maxDim = Math.max(64, finite(opts.maxDim, 1500));
    const span = Math.max(maxX - minX, maxY - minY);
    const cell = Math.max(finite(opts.cellSize, 1.5), span / maxDim);
    const cols = Math.max(1, Math.min(maxDim, Math.ceil((maxX - minX) / cell) + 1));
    const rows = Math.max(1, Math.min(maxDim, Math.ceil((maxY - minY) / cell) + 1));

    // Top-two-distinct-owners buffers: d1/o1 = nearest write, d2/o2 = nearest
    // write from a DIFFERENT owner than o1.
    const d1 = new Float32Array(cols * rows).fill(-Infinity);
    const d2 = new Float32Array(cols * rows).fill(-Infinity);
    const o1 = new Int32Array(cols * rows).fill(NO_OWNER);
    const o2 = new Int32Array(cols * rows).fill(NO_OWNER);

    const ownerIndex = new Map();
    const ownerIdOf = (owner) => {
      if (owner == null) return NO_OWNER;
      if (!ownerIndex.has(owner)) ownerIndex.set(owner, ownerIndex.size);
      return ownerIndex.get(owner);
    };

    const px = (x) => (x - minX) / cell;
    const py = (y) => (y - minY) / cell;

    const writeCell = (k, d, owner) => {
      if (owner !== NO_OWNER && owner === o1[k]) {
        if (d > d1[k]) d1[k] = d;
        return;
      }
      if (d > d1[k]) {
        // Previous best becomes the runner-up (it has a different owner).
        d2[k] = d1[k]; o2[k] = o1[k];
        d1[k] = d; o1[k] = owner;
        return;
      }
      if (owner !== NO_OWNER && owner === o2[k]) {
        if (d > d2[k]) d2[k] = d;
        return;
      }
      if (d > d2[k]) { d2[k] = d; o2[k] = owner; }
    };

    // Rasterize each triangle, writing the nearer (larger) interpolated depth.
    // Barycentric fill forked from Geometry3D.occludeSegmentsDepthBuffer.
    triList.forEach((t) => {
      const owner = ownerIdOf(t.owner);
      const ax = px(t.p0.x); const ay = py(t.p0.y);
      const bx = px(t.p1.x); const by = py(t.p1.y);
      const ccx = px(t.p2.x); const ccy = py(t.p2.y);
      const den = (by - ccy) * (ax - ccx) + (ccx - bx) * (ay - ccy);
      if (Math.abs(den) < 1e-9) return;
      const inv = 1 / den;
      const da = finite(t.p0.d, 0); const db = finite(t.p1.d, 0); const dc = finite(t.p2.d, 0);
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx, ccx)));
      const x1 = Math.min(cols - 1, Math.ceil(Math.max(ax, bx, ccx)));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by, ccy)));
      const y1 = Math.min(rows - 1, Math.ceil(Math.max(ay, by, ccy)));
      for (let y = y0; y <= y1; y++) {
        const fy = y + 0.5;
        for (let x = x0; x <= x1; x++) {
          const fx = x + 0.5;
          const w0 = ((by - ccy) * (fx - ccx) + (ccx - bx) * (fy - ccy)) * inv;
          const w1 = ((ccy - ay) * (fx - ccx) + (ax - ccx) * (fy - ccy)) * inv;
          const w2 = 1 - w0 - w1;
          if (w0 < -0.001 || w1 < -0.001 || w2 < -0.001) continue;
          writeCell(y * cols + x, w0 * da + w1 * db + w2 * dc, owner);
        }
      }
    });

    const depthAt = (x, y, excludeOwner) => {
      const gx = Math.round(px(x)); const gy = Math.round(py(y));
      if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) return -Infinity;
      const k = gy * cols + gx;
      if (excludeOwner != null && ownerIndex.has(excludeOwner) && o1[k] === ownerIndex.get(excludeOwner)) {
        return d2[k];
      }
      return d1[k];
    };

    const occlude = (segments, defaults = {}) => {
      const out = [];
      (Array.isArray(segments) ? segments : []).forEach((seg) => {
        if (!seg || !seg.a || !seg.b) return;
        const mode = (seg.mode || defaults.mode) === 'dash' ? 'dash' : 'remove';
        const bias = finite(seg.bias != null ? seg.bias : defaults.bias, 0.5);
        const owner = seg.ownerId != null ? seg.ownerId : defaults.ownerId;
        const za = finite(seg.a.z, 0);
        const zb = finite(seg.b.z, 0);
        const len = Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y);
        const steps = clamp(Math.round(len / cell) + 2, 8, 600);
        const runs = [];
        let current = null;
        let currentVisible = null;
        const flush = () => {
          if (current && current.length >= 2) runs.push({ visible: currentVisible, pts: current });
          current = null;
        };
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const x = lerp(seg.a.x, seg.b.x, t);
          const y = lerp(seg.a.y, seg.b.y, t);
          const z = lerp(za, zb, t);
          const visible = !(depthAt(x, y, owner) > z + bias);
          if (current && currentVisible !== visible) flush();
          if (!current) { current = []; currentVisible = visible; }
          current.push({ x, y });
        }
        flush();
        runs.forEach((run) => {
          if (run.visible) {
            out.push(pathWithMeta(run.pts, seg.meta ? { ...seg.meta } : null));
          } else if (mode === 'dash') {
            out.push(markHidden(pathWithMeta(run.pts, seg.meta ? { ...seg.meta } : null)));
          }
        });
      });
      return out;
    };

    return { empty: false, cols, rows, cell, minX, minY, depthAt, occlude };
  };

  const api = { build };

  Vectura.Scene3D = Object.assign(Vectura.Scene3D || {}, { Depth: api });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
