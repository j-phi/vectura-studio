/**
 * Paint bucket operations — cross-layer region detection, fill-record
 * authoring, and geometry expansion for `layer.fills[]`.
 *
 * Public API on window.Vectura.PaintBucketOps:
 *   - findFillTargetStack(engine, worldX, worldY)
 *   - applyFillAtPoint(engine, app, worldX, worldY, options)
 *   - buildFillRecord(targetEntry, fillParams)
 *   - generateGeometryForLayer(layer)
 *   - expandFill(engine, layer) — bake fills[] into sibling shape layers
 *     wrapped in a 'paintfill' group container (parent stays live).
 *
 * Hover, click, and drag-pour live in the renderer; this module is the
 * geometry-and-data layer beneath them.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const polyContainsPoint = (poly, px, py) => {
    const fn = Vectura.AlgorithmRegistry?._polyContainsPoint;
    if (typeof fn === 'function') return fn(poly, px, py);
    if (!Array.isArray(poly) || poly.length < 3) return false;
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x;
      const yi = poly[i].y;
      const xj = poly[j].x;
      const yj = poly[j].y;
      const intersect =
        ((yi > py) !== (yj > py)) &&
        (px < ((xj - xi) * (py - yi)) / ((yj - yi) || 1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  const isClosedRing = (path, tolerance = 0.5) => {
    if (!Array.isArray(path) || path.length < 3) return false;
    const first = path[0];
    const last = path[path.length - 1];
    if (!first || !last) return false;
    return Math.hypot((first.x ?? 0) - (last.x ?? 0), (first.y ?? 0) - (last.y ?? 0)) <= tolerance;
  };

  const shoelaceArea = (poly) => {
    if (!Array.isArray(poly) || poly.length < 3) return 0;
    let area = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      area += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
    }
    return Math.abs(area) / 2;
  };

  const clonePolygon = (poly) => poly.map((pt) => ({ x: pt.x, y: pt.y }));

  // Collect every open path (non-closed-ring) from all eligible layers.
  // Returns whole path arrays so that findSubRegionByClipping can use the
  // overall first→last direction (one clip plane per path, not per segment).
  const collectBarrierPaths = (engine, tolerance) => {
    const paths = [];
    for (const layer of (engine?.layers || [])) {
      if (!isLayerEligible(layer)) continue;
      for (const p of getLayerPaths(engine, layer)) {
        if (isClosedRing(p, tolerance)) continue;
        if (p.length >= 2) paths.push(p);
      }
    }
    return paths;
  };

  // Chord-bisect region detection. For each barrier path, find where it
  // intersects the outer ring, build the two arc-bounded half-regions, and
  // return whichever half contains the cursor. Handles curved and multi-vertex
  // barriers correctly because it uses the actual path shape (not just the
  // first→last endpoint direction).
  //
  // Fallback: if a barrier has < 2 ring intersections (e.g. a Y-branch that
  // starts at the ring boundary and ends inside), falls back to SH half-plane
  // clip by first→last direction, which is correct for those straight spokes.
  const findSubRegionByClipping = (outerRing, barrierPaths, px, py, gapThreshold = 0) => {
    const segInt = G.Vectura?.PathBoolean?.segmentIntersectSegment || null;
    if (!segInt) return null;
    const cross2d = (ux, uy, vx, vy) => ux * vy - uy * vx;

    // Strips the duplicate closing point so we work with an open vertex list.
    const toOpen = (ring) => {
      const pts = ring.slice();
      const f = pts[0], l = pts[pts.length - 1];
      if (pts.length > 1 && Math.abs(f.x - l.x) < 1e-9 && Math.abs(f.y - l.y) < 1e-9) {
        pts.pop();
      }
      return pts;
    };
    const close = (pts) => [...pts, { x: pts[0].x, y: pts[0].y }];

    // Sutherland-Hodgman half-plane fallback (for straight Y-spoke barriers).
    const shClip = (openPoly, anchor, dx, dy, side) => {
      const n = openPoly.length;
      const out = [];
      for (let i = 0; i < n; i++) {
        const curr = openPoly[i], next = openPoly[(i + 1) % n];
        const sc = cross2d(dx, dy, curr.x - anchor.x, curr.y - anchor.y);
        const sn = cross2d(dx, dy, next.x - anchor.x, next.y - anchor.y);
        if (sc * side >= 0) out.push(curr);
        if ((sc * side >= 0) !== (sn * side >= 0)) {
          const den = cross2d(dx, dy, next.x - curr.x, next.y - curr.y);
          if (Math.abs(den) > 1e-10) {
            const t = Math.max(0, Math.min(1, cross2d(dx, dy, anchor.x - curr.x, anchor.y - curr.y) / den));
            out.push({ x: curr.x + t * (next.x - curr.x), y: curr.y + t * (next.y - curr.y) });
          }
        }
      }
      return out;
    };

    let openPoly = toOpen(outerRing);
    if (openPoly.length < 3) return null;

    for (const barrier of barrierPaths) {
      if (barrier.length < 2) continue;
      const closed = close(openPoly);
      const nSegs = closed.length - 1;

      // Intersect every barrier segment against every ring segment.
      const hits = [];
      for (let bi = 0; bi < barrier.length - 1; bi++) {
        for (let ri = 0; ri < nSegs; ri++) {
          const h = segInt(barrier[bi], barrier[bi + 1], closed[ri], closed[ri + 1]);
          if (!h) continue;
          const pt = { x: h.x, y: h.y, barrierT: bi + h.t, ringT: ri + h.u };
          if (!hits.some(q => Math.abs(q.x - pt.x) < 1e-6 && Math.abs(q.y - pt.y) < 1e-6)) {
            hits.push(pt);
          }
        }
      }

      if (hits.length < 2) {
        // Barrier doesn't chord the ring. Try snapping its endpoints to the
        // nearest ring boundary point within gapThreshold. This bridges small
        // gaps without creating a virtual closing line for barriers floating
        // entirely inside the ring.
        if (gapThreshold > 0) {
          const trySnap = (ep, barrierIdx) => {
            let best = null, bestDist = Infinity;
            for (let ri = 0; ri < nSegs; ri++) {
              const A = closed[ri], B = closed[ri + 1];
              const ABx = B.x - A.x, ABy = B.y - A.y;
              const len2 = ABx * ABx + ABy * ABy;
              const t = len2 > 1e-12
                ? Math.max(0, Math.min(1, ((ep.x - A.x) * ABx + (ep.y - A.y) * ABy) / len2))
                : 0;
              const nx = A.x + t * ABx, ny = A.y + t * ABy;
              const d = Math.hypot(ep.x - nx, ep.y - ny);
              if (d < bestDist) { bestDist = d; best = { x: nx, y: ny, ringT: ri + t }; }
            }
            if (bestDist <= gapThreshold && best) {
              if (!hits.some(q => Math.abs(q.x - best.x) < 1e-6 && Math.abs(q.y - best.y) < 1e-6)) {
                hits.push({ x: best.x, y: best.y, barrierT: barrierIdx, ringT: best.ringT });
              }
            }
          };
          trySnap(barrier[0], 0);
          trySnap(barrier[barrier.length - 1], barrier.length - 1);
        }
        if (hits.length < 2) continue;
      }

      // Sort intersections by ring parameter; use outermost two as chord endpoints.
      hits.sort((a, b) => a.ringT - b.ringT);
      const E1 = hits[0], E2 = hits[hits.length - 1];
      const ri1 = Math.floor(E1.ringT), ri2 = Math.floor(E2.ringT);

      // Forward arc: ring vertices from E1 to E2 (increasing index).
      const arcFwd = [{ x: E1.x, y: E1.y }];
      for (let i = ri1 + 1; i <= ri2 && i < nSegs; i++) arcFwd.push({ x: closed[i].x, y: closed[i].y });
      arcFwd.push({ x: E2.x, y: E2.y });

      // Backward arc: ring vertices from E2 back to E1 (wrapping around).
      const arcBwd = [{ x: E2.x, y: E2.y }];
      for (let i = ri2 + 1; i < nSegs; i++) arcBwd.push({ x: closed[i].x, y: closed[i].y });
      for (let i = 0; i <= ri1; i++) arcBwd.push({ x: closed[i].x, y: closed[i].y });
      arcBwd.push({ x: E1.x, y: E1.y });

      // Barrier slice from min-barrierT hit to max-barrierT hit.
      const byBarrierT = hits.slice().sort((a, b) => a.barrierT - b.barrierT);
      const bh1 = byBarrierT[0], bh2 = byBarrierT[byBarrierT.length - 1];
      const bSlice = [{ x: bh1.x, y: bh1.y }];
      for (let i = Math.ceil(bh1.barrierT); i <= Math.floor(bh2.barrierT); i++) {
        if (i >= 0 && i < barrier.length) {
          const pt = barrier[i];
          const prev = bSlice[bSlice.length - 1];
          if (Math.abs(pt.x - prev.x) > 1e-9 || Math.abs(pt.y - prev.y) > 1e-9) {
            bSlice.push({ x: pt.x, y: pt.y });
          }
        }
      }
      const prevLast = bSlice[bSlice.length - 1];
      if (Math.abs(bh2.x - prevLast.x) > 1e-9 || Math.abs(bh2.y - prevLast.y) > 1e-9) {
        bSlice.push({ x: bh2.x, y: bh2.y });
      }

      // Orient barrier slice so bSlice[0] corresponds to E1.
      const bh1isE1 = Math.abs(bh1.ringT - E1.ringT) < Math.abs(bh1.ringT - E2.ringT);
      const bE1toE2 = bh1isE1 ? bSlice : [...bSlice].reverse();
      const bE2toE1 = [...bE1toE2].reverse();

      // Region A: forward ring arc (E1→E2) + barrier back (E2→E1).
      const regionA = close([...arcFwd, ...bE2toE1.slice(1)]);
      // Region B: backward ring arc (E2→E1) + barrier forward (E1→E2).
      const regionB = close([...arcBwd, ...bE1toE2.slice(1)]);

      if (regionA.length >= 4 && polyContainsPoint(regionA, px, py)) {
        openPoly = toOpen(regionA);
      } else if (regionB.length >= 4 && polyContainsPoint(regionB, px, py)) {
        openPoly = toOpen(regionB);
      }
      // else: degenerate, leave openPoly unchanged
    }

    const result = close(openPoly);
    return result.length >= 4 ? result : null;
  };

  // Stable hash for the (layer + polygon) pair so drag-pour can detect
  // "did the cursor leave this region?" without keeping references to the
  // exact path object (which may be replaced on geometry recompute).
  const loopIdFor = (layerId, poly) => {
    if (!Array.isArray(poly) || !poly.length) return `${layerId}:empty`;
    const a = poly[0];
    const b = poly[Math.floor(poly.length / 2)] || a;
    const c = poly[poly.length - 1];
    return `${layerId}:${a.x.toFixed(2)},${a.y.toFixed(2)}:${b.x.toFixed(2)},${b.y.toFixed(2)}:${c.x.toFixed(2)},${c.y.toFixed(2)}`;
  };

  const docBoundsPolygon = (engine) => {
    const w = Number.isFinite(engine?.docW) ? engine.docW
      : Number.isFinite(engine?.currentProfile?.width) ? engine.currentProfile.width
        : Number.isFinite(Vectura.SETTINGS?.paperWidth) ? Vectura.SETTINGS.paperWidth
          : 297;
    const h = Number.isFinite(engine?.docH) ? engine.docH
      : Number.isFinite(engine?.currentProfile?.height) ? engine.currentProfile.height
        : Number.isFinite(Vectura.SETTINGS?.paperHeight) ? Vectura.SETTINGS.paperHeight
          : 210;
    return [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
      { x: 0, y: 0 },
    ];
  };

  const getLayerPaths = (engine, layer) => {
    if (typeof engine?.getDisplayPaths === 'function') {
      const dp = engine.getDisplayPaths(layer);
      if (Array.isArray(dp) && dp.length) return dp;
    }
    return layer.displayPaths || layer.paths || [];
  };

  const isLayerEligible = (layer) => {
    if (!layer) return false;
    if (layer.visible === false) return false;
    if (layer.isGroup && layer.containerRole !== 'compound') return false;
    if (layer.locked) return false;
    if (layer.mask?.enabled && layer.mask?.hideLayer) return false;
    return true;
  };

  // Returns the smallest-area fill record whose region contains the point,
  // along with its layer and index in the layer's fills[]. Mirrors the
  // "Alt-click selects what you see" rule used by erase: nested fills surface
  // the innermost one. CMD+click adoption uses this to pick a fill to edit.
  const findFillAtPoint = (engine, worldX, worldY) => {
    if (!engine?.layers) return null;
    let best = null;
    for (const layer of engine.layers) {
      if (!isLayerEligible(layer)) continue;
      if (!Array.isArray(layer.fills) || !layer.fills.length) continue;
      for (let i = 0; i < layer.fills.length; i += 1) {
        const rec = layer.fills[i];
        if (!rec?.region) continue;
        if (!polyContainsPoint(rec.region, worldX, worldY)) continue;
        const area = shoelaceArea(rec.region);
        if (!best || area < best.area) {
          best = { layer, index: i, rec, area };
        }
      }
    }
    return best;
  };

  // Returns the top-most eligible layer (last in array = highest z) whose
  // closed rings contain the given world point.
  const findHoveredLayer = (engine, worldX, worldY, tolerance = 0.5) => {
    if (!engine?.layers) return null;
    for (let i = engine.layers.length - 1; i >= 0; i--) {
      const layer = engine.layers[i];
      if (!isLayerEligible(layer)) continue;
      const paths = getLayerPaths(engine, layer);
      for (const p of paths) {
        if (!isClosedRing(p, tolerance)) continue;
        if (polyContainsPoint(p, worldX, worldY)) return layer;
      }
    }
    return null;
  };

  const findFillTargetStack = (engine, worldX, worldY, options = {}) => {
    const { scope = 'all-objects', sensitivity = 5 } = options;
    const tolerance = Math.max(0.01, sensitivity * 0.1);

    // Collect candidate rings with their owning layer. Single-object mode
    // restricts candidates to the top-most hovered layer; all-objects mode
    // uses every eligible layer.
    const candidates = [];
    if (scope === 'single-object') {
      const hoveredLayer = findHoveredLayer(engine, worldX, worldY, tolerance);
      if (hoveredLayer) {
        for (const p of getLayerPaths(engine, hoveredLayer)) {
          if (!isClosedRing(p, tolerance)) continue;
          candidates.push({ path: p, layer: hoveredLayer, area: shoelaceArea(p) });
        }
      }
    } else {
      for (const layer of (engine?.layers || [])) {
        if (!isLayerEligible(layer)) continue;
        for (const p of getLayerPaths(engine, layer)) {
          if (!isClosedRing(p, tolerance)) continue;
          candidates.push({ path: p, layer, area: shoelaceArea(p) });
        }
      }
    }

    // Sort ascending by area (smallest = innermost ring).
    candidates.sort((a, b) => a.area - b.area);

    // K = index of the smallest ring that contains the cursor.
    // The cursor sits in the band between candidates[K-1] and candidates[K].
    let K = -1;
    for (let i = 0; i < candidates.length; i++) {
      if (polyContainsPoint(candidates[i].path, worldX, worldY)) { K = i; break; }
    }

    // Build band entries centered at K, expanding symmetrically outward and
    // inward on each scroll step.  innerPolygon (when present) is passed as
    // the second region to the fill generator's XOR compositing so fill lines
    // land only in the donut band, not the full disc interior.
    //
    // Guard: only use a candidate as innerPolygon if its centroid is actually
    // inside the outer ring. Two non-nested rings (e.g. two separate circles
    // of different sizes) share no containment relationship — the even-odd
    // fill rule would incorrectly highlight parts of the inner ring that fall
    // outside the outer ring (making both appear highlighted on hover).
    const polyCentroid = (poly) => {
      let sx = 0, sy = 0;
      for (const p of poly) { sx += p.x; sy += p.y; }
      return { x: sx / poly.length, y: sy / poly.length };
    };
    const entries = [];
    if (K >= 0) {
      const N = candidates.length;
      for (let i = 0; ; i++) {
        const outIdx = Math.min(K + i, N - 1);
        const inIdx  = K - 1 - i;
        const outer  = candidates[outIdx];
        const innerCandidate = inIdx >= 0 ? candidates[inIdx] : null;
        const c = innerCandidate ? polyCentroid(innerCandidate.path) : null;
        const inner = (innerCandidate && c && polyContainsPoint(outer.path, c.x, c.y))
          ? innerCandidate : null;
        entries.push({
          layer: outer.layer,
          polygon: clonePolygon(outer.path),
          innerPolygon: inner ? clonePolygon(inner.path) : null,
          area: outer.area,
          loopId: `band:${outIdx}:${inIdx >= 0 ? inIdx : 'x'}:${outer.layer.id}`,
          isDocBounds: false,
        });
        if (outIdx === N - 1 && inIdx < 0) break;
      }

      // In all-objects mode: if open pen-path strokes from other layers divide
      // the innermost candidate ring into sub-regions, ray-cast a tighter
      // polygon so only the enclosed face the cursor sits in is highlighted,
      // not the whole outer ring. This entry is prepended as the default
      // (scope 0) selection; scroll-to-widen still reaches the full ring.
      const kLayer = candidates[K].layer;
      if (scope !== 'single-object' && !(Array.isArray(kLayer.fills) && kLayer.fills.length > 0)) {
        const kRing = candidates[K].path;
        let kMinX = Infinity, kMinY = Infinity, kMaxX = -Infinity, kMaxY = -Infinity;
        for (const pt of kRing) {
          if (pt.x < kMinX) kMinX = pt.x; if (pt.x > kMaxX) kMaxX = pt.x;
          if (pt.y < kMinY) kMinY = pt.y; if (pt.y > kMaxY) kMaxY = pt.y;
        }
        const allBarriers = collectBarrierPaths(engine, tolerance);
        // Keep paths that have at least one point inside (or touching) kRing.
        const localBarriers = allBarriers.filter((path) => {
          for (const pt of path) {
            if (pt.x < kMinX || pt.x > kMaxX || pt.y < kMinY || pt.y > kMaxY) continue;
            if (polyContainsPoint(kRing, pt.x, pt.y)) return true;
          }
          return false;
        });
        if (localBarriers.length > 0) {
          const gapThreshold = Math.min(50, sensitivity * 5);
          const subPoly = findSubRegionByClipping(kRing, localBarriers, worldX, worldY, gapThreshold);
          const subArea = subPoly ? shoelaceArea(subPoly) : 0;
          if (subPoly && subArea > 0 && subArea < candidates[K].area * 0.98) {
            entries.unshift({
              layer: candidates[K].layer,
              polygon: subPoly,
              innerPolygon: null,
              area: subArea,
              loopId: `barrier-sub:${K}:${candidates[K].layer.id}:${localBarriers.length}`,
              isDocBounds: false,
            });
          }
        }
      }
    }

    const docPoly = docBoundsPolygon(engine);
    const fallbackLayer = (K >= 0 ? candidates[K].layer : null)
      || engine?.getActiveLayer?.() || engine?.layers?.[0] || null;
    entries.push({
      layer: fallbackLayer,
      polygon: docPoly,
      innerPolygon: null,
      area: shoelaceArea(docPoly),
      loopId: '__doc-bounds__',
      isDocBounds: true,
    });

    return { stack: entries, includesDocBounds: true };
  };

  const newFillId = () => `fill-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  // C1 migration: legacy 'wavelines'/'zigzag' fillMode strings collapse onto
  // 'wave' with smoothing 1.0 / 0.0 respectively. Keeps dispatcher input
  // monotonic so legacy saves on disk still load through the same code path.
  const _normalizeFillMode = (mode, params) => {
    if (mode === 'wavelines') {
      if (params.fillWaveSmoothing == null) params.fillWaveSmoothing = 1.0;
      return 'wave';
    }
    if (mode === 'zigzag') {
      if (params.fillWaveSmoothing == null) params.fillWaveSmoothing = 0.0;
      return 'wave';
    }
    // C2 migration:
    //   - 'stipple' → 'dots' with shape=circle (preserve dotPattern)
    //   - 'grid'    → 'dots' with pattern=grid, shape=tick
    if (mode === 'stipple') {
      if (params.fillDotShape == null) params.fillDotShape = 'circle';
      return 'dots';
    }
    if (mode === 'grid') {
      if (params.fillDotShape == null) params.fillDotShape = 'tick';
      params.fillDotPattern = 'grid';
      return 'dots';
    }
    // C3 migration:
    //   - 'crosshatch' → 'hatch' lineCount 2
    //   - 'triaxial'   → 'hatch' lineCount 3
    if (mode === 'crosshatch') {
      if (params.fillLineCount == null) params.fillLineCount = 2;
      return 'hatch';
    }
    if (mode === 'triaxial') {
      if (params.fillLineCount == null) params.fillLineCount = 3;
      return 'hatch';
    }
    return mode;
  };

  const buildFillRecord = (targetEntry, fillParams = {}) => ({
    id: newFillId(),
    fillType: _normalizeFillMode(fillParams.fillMode ?? fillParams.fillType ?? 'hatch', fillParams),
    density: fillParams.fillDensity ?? 1,
    angle: fillParams.fillAngle ?? 0,
    amplitude: fillParams.fillAmplitude ?? 1.0,
    waveSmoothing: fillParams.fillWaveSmoothing ?? 1.0,
    waveHarmonics: fillParams.fillWaveHarmonics ?? 1,
    // New semantics: dotLength is a physical length in mm (0 = single point,
    // up to 10mm). The stipple/grid renderers expand each dot into a
    // continuous spiral when dotLength > 0. dotSize (legacy ratio) is no
    // longer authored from the bucket panel but kept on fill records for
    // backward compatibility with older saves.
    dotLength: fillParams.fillDotLength ?? 0,
    dotRotation: fillParams.fillDotRotation ?? 0,
    dotSize: fillParams.fillDotSize ?? 0.6,
    padding: fillParams.fillPadding ?? 0,
    shiftX: fillParams.fillShiftX ?? 0,
    shiftY: fillParams.fillShiftY ?? 0,
    dotPattern: fillParams.fillDotPattern ?? 'brick',
    dotShape: fillParams.fillDotShape ?? 'circle',
    dotJitter: fillParams.fillDotJitter ?? 0,
    lineCount: fillParams.fillLineCount ?? 1,
    axes: fillParams.fillAxes ?? 3,
    polyTile: fillParams.fillPolyTile ?? 'grid',
    polyPadding: fillParams.fillPolyPadding ?? 0,
    polyRotation: fillParams.fillPolyRotation ?? 0,
    polyRotationStep: fillParams.fillPolyRotationStep ?? 0,
    polyScaleStep: fillParams.fillPolyScaleStep ?? 0,
    spiralTurns: fillParams.fillSpiralTurns ?? 8,
    spiralTightness: fillParams.fillSpiralTightness ?? 0.5,
    spiralDirection: fillParams.fillSpiralDirection ?? 'cw',
    radialSpokes: fillParams.fillRadialSpokes ?? 36,
    radialSkip: fillParams.fillRadialSkip ?? 0,
    contourDirection: fillParams.fillContourDirection ?? 'inset',
    contourStepVariance: fillParams.fillContourStepVariance ?? 0,
    contourSimplify: fillParams.fillContourSimplify ?? 0.05,
    centralDensity: fillParams.fillRadialCentralDensity ?? 1.0,
    outerDiameter: fillParams.fillRadialOuterDiameter ?? 1.0,
    // B1 Flow Field
    flowFieldType: fillParams.fillFlowFieldType ?? 'perlin',
    flowNoiseScale: fillParams.fillFlowNoiseScale ?? 6.0,
    flowSeed: fillParams.fillFlowSeed ?? 1,
    flowTraceLen: fillParams.fillFlowTraceLen ?? 60,
    flowSeparation: fillParams.fillFlowSeparation ?? 2.5,
    // B2 Voronoi
    voronoiSeeds: fillParams.fillVoronoiSeeds ?? 60,
    voronoiJitter: fillParams.fillVoronoiJitter ?? 0.5,
    voronoiStroke: fillParams.fillVoronoiStroke ?? 'boundary',
    voronoiSeedMode: fillParams.fillVoronoiSeedMode ?? 'random',
    // B3 Truchet
    truchetTileSet: fillParams.fillTruchetTileSet ?? 'quarter-arcs',
    truchetTileSize: fillParams.fillTruchetTileSize ?? 6,
    truchetSeed: fillParams.fillTruchetSeed ?? 1,
    truchetRotations: fillParams.fillTruchetRotations ?? 4,
    // B4 Maze
    mazeCellSize: fillParams.fillMazeCellSize ?? 5,
    mazeAlgorithm: fillParams.fillMazeAlgorithm ?? 'dfs',
    mazeBranchBias: fillParams.fillMazeBranchBias ?? 0.5,
    mazeSeed: fillParams.fillMazeSeed ?? 1,
    mazeWallMode: fillParams.fillMazeWallMode ?? 'walls',
    // B5 Scribble
    scribbleSmoothness: fillParams.fillScribbleSmoothness ?? 0.6,
    scribbleSeed: fillParams.fillScribbleSeed ?? 1,
    scribbleCoverage: fillParams.fillScribbleCoverage ?? 1.0,
    // B6 L-System
    lsysPreset: fillParams.fillLsysPreset ?? 'coral',
    lsysIterations: fillParams.fillLsysIterations ?? 4,
    lsysAngleVariance: fillParams.fillLsysAngleVariance ?? 8,
    lsysSeed: fillParams.fillLsysSeed ?? 1,
    lsysScale: fillParams.fillLsysScale ?? 1.0,
    // B7 Halftone
    halftoneSource: fillParams.fillHalftoneSource ?? 'radial',
    halftoneMinR: fillParams.fillHalftoneMinR ?? 0.2,
    halftoneMaxR: fillParams.fillHalftoneMaxR ?? 1.5,
    halftoneFrequency: fillParams.fillHalftoneFrequency ?? 5,
    halftoneAngle: fillParams.fillHalftoneAngle ?? 0,
    halftoneInvert: fillParams.fillHalftoneInvert ?? 'off',
    // B8 Stripes
    stripeBandWidth: fillParams.fillStripeBandWidth ?? 4,
    stripeGap: fillParams.fillStripeGap ?? 2,
    stripeAngle: fillParams.fillStripeAngle ?? 0,
    stripePrimary: fillParams.fillStripePrimary ?? 'hatch',
    stripeSecondary: fillParams.fillStripeSecondary ?? 'none',
    stripeSecondaryDensity: fillParams.fillStripeSecondaryDensity ?? 2,
    // B9 Spirograph
    spiroRatioA: fillParams.fillSpiroRatioA ?? 5,
    spiroRatioB: fillParams.fillSpiroRatioB ?? 3,
    spiroPhase: fillParams.fillSpiroPhase ?? 0,
    spiroTurns: fillParams.fillSpiroTurns ?? 50,
    spiroDeformation: fillParams.fillSpiroDeformation ?? 0,
    // B10 Weave
    weavePattern: fillParams.fillWeavePattern ?? 'plain',
    weaveStrandWidth: fillParams.fillWeaveStrandWidth ?? 1.5,
    weaveGap: fillParams.fillWeaveGap ?? 0.3,
    weaveAngle: fillParams.fillWeaveAngle ?? 0,
    weaveOver: fillParams.fillWeaveOver ?? 1,
    weaveUnder: fillParams.fillWeaveUnder ?? 1,
    sensitivity: fillParams.fillSensitivity ?? 5,
    penId: fillParams.penId ?? null,
    region: clonePolygon(targetEntry.polygon),
    innerRegion: targetEntry.innerPolygon ? clonePolygon(targetEntry.innerPolygon) : null,
    loopId: targetEntry.loopId,
    isDocBounds: Boolean(targetEntry.isDocBounds),
    createdAt: Date.now(),
  });

  const applyFillAtPoint = (engine, app, worldX, worldY, options = {}) => {
    if (!engine) return null;
    const { scopeIndex = 0, mode = 'pour', fillParams = {} } = options;

    if (mode === 'erase') {
      // Find the fill record whose region (a) contains the point and (b) has
      // the smallest area — that matches what's highlighted under the cursor
      // when hovering, so Alt-click removes "what you see."
      let best = null;
      for (const layer of (engine.layers || [])) {
        if (!isLayerEligible(layer)) continue;
        if (!Array.isArray(layer.fills) || !layer.fills.length) continue;
        for (let i = 0; i < layer.fills.length; i += 1) {
          const rec = layer.fills[i];
          if (!rec?.region) continue;
          if (!polyContainsPoint(rec.region, worldX, worldY)) continue;
          const area = shoelaceArea(rec.region);
          if (!best || area < best.area) {
            best = { layer, index: i, rec, area };
          }
        }
      }
      if (!best) return null;
      app?.pushHistory?.();
      best.layer.fills.splice(best.index, 1);
      engine.computeAllDisplayGeometry?.();
      return { mode: 'erase', layerId: best.layer.id, fillId: best.rec.id, loopId: best.rec.loopId };
    }

    const { stack } = findFillTargetStack(engine, worldX, worldY, {
      scope: fillParams.fillScope || 'all-objects',
      sensitivity: fillParams.fillSensitivity ?? 5,
    });
    if (!stack.length) return null;
    const idx = Math.max(0, Math.min(scopeIndex, stack.length - 1));
    const target = stack[idx];
    let targetLayer = target.layer;
    // Empty document case: clicking on bare canvas with no eligible host layer
    // hits the doc-bounds entry but `targetLayer` resolves to null. Create a
    // background shape layer on the fly so "fill the canvas" works as the user
    // expects — same shape (the document rect) the fill targets, sitting at
    // panel-top / canvas-back so it doesn't obscure shapes added later.
    if (!targetLayer && target.isDocBounds) {
      const Layer = Vectura.Layer;
      if (!Layer) return null;
      const SETTINGS = Vectura.SETTINGS || {};
      SETTINGS.globalLayerCount = (SETTINGS.globalLayerCount || engine._layerCounter || 0) + 1;
      if (typeof engine._layerCounter === 'number') engine._layerCounter += 1;
      const id = Math.random().toString(36).slice(2, 11);
      app?.pushHistory?.();
      targetLayer = new Layer(id, 'shape', 'Background');
      // Empty paths: the layer hosts only the paint-bucket fill geometry. The
      // doc-bounds polygon lives on the fill record's region; nothing should
      // draw the boundary itself.
      targetLayer.paths = [];
      targetLayer.displayPaths = [];
      targetLayer.effectivePaths = [];
      targetLayer.sourcePaths = null;
      // Insert at index 0 (panel-top = canvas-back) so the background renders
      // behind any subsequently-added shapes.
      engine.layers.unshift(targetLayer);
      engine.activeLayerId = id;
    }
    if (!targetLayer) return null;

    if (!Array.isArray(targetLayer.fills)) targetLayer.fills = [];
    const record = buildFillRecord(target, fillParams);
    // For the auto-created background layer we already pushed history above;
    // skip a second push for the same logical action.
    if (target.layer) app?.pushHistory?.();
    targetLayer.fills.push(record);
    engine.computeAllDisplayGeometry?.();
    return { mode: 'pour', layerId: targetLayer.id, fillId: record.id, loopId: target.loopId };
  };

  const resolvePenWidth = (penId) => {
    const pens = Array.isArray(Vectura.SETTINGS?.pens) ? Vectura.SETTINGS.pens : [];
    const pen = pens.find((p) => p && p.id === penId);
    const w = Number(pen?.width);
    return Number.isFinite(w) && w > 0 ? w : 0.3;
  };

  const generateGeometryForLayer = (layer) => {
    if (!layer || !Array.isArray(layer.fills) || !layer.fills.length) return [];
    const gen = Vectura.AlgorithmRegistry?._generatePatternFillPaths;
    if (typeof gen !== 'function') return [];
    const all = [];
    for (const rec of layer.fills) {
      if (!rec || !rec.region || rec.fillType === 'none') continue;
      const fillArg = {
        // When innerRegion is set (band/donut fill), include it in regions so
        // the generator's compositeContainsPoint XOR logic excludes the hole.
        regions: rec.innerRegion ? [rec.region, rec.innerRegion] : [rec.region],
        region: rec.region,
        fillType: rec.fillType,
        density: rec.density,
        angle: rec.angle,
        amplitude: rec.amplitude,
        dotSize: rec.dotSize,
        dotLength: rec.dotLength,
        dotRotation: rec.dotRotation,
        penWidth: resolvePenWidth(rec.penId),
        padding: rec.padding,
        shiftX: rec.shiftX,
        shiftY: rec.shiftY,
        dotPattern: rec.dotPattern,
        axes: rec.axes,
        polyTile: rec.polyTile,
        centralDensity: rec.centralDensity,
        outerDiameter: rec.outerDiameter,
      };
      let paths;
      try {
        paths = gen(fillArg) || [];
      } catch (err) {
        if (typeof console !== 'undefined') console.warn('[PaintBucketOps] fill generator failed', err);
        paths = [];
      }
      for (const p of paths) {
        if (Array.isArray(p) && p.length >= 2) {
          if (!p.meta) p.meta = {};
          p.meta.paintBucketFillId = rec.id;
          all.push(p);
        }
      }
    }
    return all;
  };

  // Generate baked paths for a single fill record (mirrors the per-record
  // loop body of generateGeometryForLayer, scoped to one record so expandFill
  // can split records into separate output layers).
  const generatePathsForFillRecord = (rec) => {
    const gen = Vectura.AlgorithmRegistry?._generatePatternFillPaths;
    if (typeof gen !== 'function') return [];
    if (!rec || !rec.region || rec.fillType === 'none') return [];
    let paths;
    try {
      paths = gen({
        regions: rec.innerRegion ? [rec.region, rec.innerRegion] : [rec.region],
        region: rec.region,
        fillType: rec.fillType,
        density: rec.density,
        angle: rec.angle,
        amplitude: rec.amplitude,
        dotSize: rec.dotSize,
        dotLength: rec.dotLength,
        dotRotation: rec.dotRotation,
        penWidth: resolvePenWidth(rec.penId),
        padding: rec.padding,
        shiftX: rec.shiftX,
        shiftY: rec.shiftY,
        dotPattern: rec.dotPattern,
        axes: rec.axes,
        polyTile: rec.polyTile,
        centralDensity: rec.centralDensity,
        outerDiameter: rec.outerDiameter,
      }) || [];
    } catch (err) {
      if (typeof console !== 'undefined') console.warn('[PaintBucketOps] fill generator failed', err);
      paths = [];
    }
    return paths.filter((p) => Array.isArray(p) && p.length >= 2);
  };

  const nextLayerId = (engine) => {
    const SETTINGS = Vectura.SETTINGS || {};
    SETTINGS.globalLayerCount = (SETTINGS.globalLayerCount || engine._layerCounter || 0) + 1;
    if (typeof engine._layerCounter === 'number') engine._layerCounter += 1;
    return Math.random().toString(36).slice(2, 11);
  };

  const generateGroupName = (engine, parentName) => {
    const base = `${parentName || 'Layer'} + Fill`;
    const taken = new Set((engine.layers || []).map((l) => l.name));
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(`${base} ${n}`)) n += 1;
    return `${base} ${n}`;
  };

  // Mutates engine: converts a layer's paint-bucket fills[] into baked sibling
  // shape layers wrapped in a 'paintfill' group container.
  //
  // Engine.layers layout after expand (the slot the source layer occupied):
  //   [..., group, parent, fill1, fill2, ..., fillN, ...]
  // — parent stays first child (panel-top of the group, drawn first), fills
  // follow in record order (drawn after parent → visually on top, matching the
  // pre-expand renderer output where fill paths are concatenated after the
  // parent's effectivePaths).
  //
  // The original parent keeps its id; the group gets a new id. Modifiers on the
  // original parent move to the group container so the group transforms as a
  // unit. Each fill child carries a defensive copy of its source fill record
  // on `sourceFillRecord` for serialization / future "re-pour" support.
  //
  // Returns { groupId, layerId, fillLayerIds } on success, null otherwise.
  // Callers wrap with app.pushHistory().
  const expandFill = (engine, layer) => {
    if (!engine || !layer) return null;
    if (layer.isGroup) return null;
    if (!Array.isArray(layer.fills) || !layer.fills.length) return null;
    const Layer = Vectura.Layer;
    if (!Layer) return null;

    const originalIndex = engine.layers.indexOf(layer);
    if (originalIndex < 0) return null;

    const records = layer.fills.slice();
    const fillChildren = [];
    records.forEach((rec, i) => {
      const paths = generatePathsForFillRecord(rec);
      if (!paths.length) return; // Skip records that produce no geometry.
      const child = new Layer(nextLayerId(engine), 'shape', `Fill ${i + 1} (${rec.fillType || 'hatch'})`);
      child.type = 'shape';
      child.isGroup = false;
      child.containerRole = null;
      child.groupType = null;
      child.penId = rec.penId || layer.penId;
      const pens = Array.isArray(Vectura.SETTINGS?.pens) ? Vectura.SETTINGS.pens : [];
      const pen = pens.find((p) => p && p.id === child.penId) || null;
      if (pen) {
        child.color = pen.color || child.color;
        child.strokeWidth = pen.width ?? child.strokeWidth;
      } else {
        child.color = layer.color;
        child.strokeWidth = layer.strokeWidth;
      }
      child.lineCap = layer.lineCap || 'round';
      const tagged = paths.map((p) => {
        const next = p.map((pt) => ({ x: pt.x, y: pt.y }));
        next.meta = {
          ...(p.meta || {}),
          source: 'paintfill-baked',
          paintBucketFillId: rec.id,
        };
        if (child.penId) next.meta.penId = child.penId;
        return next;
      });
      child.paths = tagged;
      child.displayPaths = tagged.map((p) => p);
      child.effectivePaths = tagged.map((p) => p);
      child.sourcePaths = tagged.map((p) => p);
      // Defensive copy so later edits to the original record (or its disposal)
      // don't leak into the baked child.
      child.sourceFillRecord = JSON.parse(JSON.stringify(rec));
      fillChildren.push(child);
    });

    // Build the group container.
    const group = new Layer(nextLayerId(engine), 'shape', generateGroupName(engine, layer.name));
    group.type = 'shape';
    group.isGroup = true;
    group.containerRole = null;
    group.groupType = 'paintfill';
    group.groupCollapsed = false;
    group.params = { seed: 0, posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0 };
    group.paramStates = {};
    group.sourcePaths = null;
    group.paths = [];
    group.displayPaths = [];
    group.effectivePaths = [];
    // Inherit the original layer's parentId — nested expansion places the new
    // paintfill group inside whatever container the source was already in.
    group.parentId = layer.parentId ?? null;
    // Inherit appearance from the parent so the group "looks like" its source
    // in any UI surface that reads the group's pen/color (e.g. layer card).
    group.penId = layer.penId;
    group.color = layer.color;
    group.strokeWidth = layer.strokeWidth;
    group.lineCap = layer.lineCap;
    // Move modifiers from the original parent to the group container so the
    // mirror/etc. transforms apply to parent + fills as a unit.
    if (layer.modifier) {
      group.modifier = layer.modifier;
      layer.modifier = null;
    }

    // Reparent the original layer + the new fill children under the group,
    // and clear the original's fills (the baked children now own that geometry).
    layer.parentId = group.id;
    layer.fills = [];
    fillChildren.forEach((child) => { child.parentId = group.id; });

    // Splice the original layer's slot with [group, parent, ...fills]. Parent
    // first among children = panel-top child = drawn first (canvas-back).
    // Fills follow in record order = drawn after parent = visually on top,
    // matching the pre-expand renderer output.
    engine.layers.splice(originalIndex, 1, group, layer, ...fillChildren);

    if (typeof engine.setActiveLayerId === 'function') {
      engine.setActiveLayerId(group.id);
    } else {
      engine.activeLayerId = group.id;
    }
    if (typeof engine.computeAllDisplayGeometry === 'function') {
      engine.computeAllDisplayGeometry();
    }

    return {
      groupId: group.id,
      layerId: layer.id,
      fillLayerIds: fillChildren.map((c) => c.id),
    };
  };

  // Apply an affine transform to a layer's fill regions in place. Fill regions
  // are stored as absolute world polygons, so any committed change to the
  // owning layer's position/scale/rotation must transform the regions in
  // lockstep — otherwise the fill stays at the original world location while
  // the shape moves.
  //
  // `temp` matches the renderer's tempTransform shape:
  //   { dx, dy, scaleX, scaleY, origin: {x,y}, rotation? }  (rotation in deg)
  // Point mapping: p' = origin + R*(p-origin)*scale + (dx,dy).
  const transformLayerFills = (layer, temp) => {
    if (!layer || !temp) return;
    const fills = layer.fills;
    if (!Array.isArray(fills) || !fills.length) return;
    const dx = temp.dx ?? 0;
    const dy = temp.dy ?? 0;
    const sx = temp.scaleX ?? 1;
    const sy = temp.scaleY ?? 1;
    const rotDeg = temp.rotation ?? 0;
    if (dx === 0 && dy === 0 && sx === 1 && sy === 1 && !rotDeg) return;
    const origin = temp.origin || { x: 0, y: 0 };
    const rot = (rotDeg * Math.PI) / 180;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    const mapPt = (pt) => {
      let x = (pt.x - origin.x) * sx;
      let y = (pt.y - origin.y) * sy;
      if (rotDeg) {
        const rx = x * cosR - y * sinR;
        const ry = x * sinR + y * cosR;
        x = rx; y = ry;
      }
      return { x: x + origin.x + dx, y: y + origin.y + dy };
    };
    for (const rec of fills) {
      if (!rec) continue;
      if (Array.isArray(rec.region)) rec.region = rec.region.map(mapPt);
      if (Array.isArray(rec.innerRegion)) rec.innerRegion = rec.innerRegion.map(mapPt);
      const s = mapPt({ x: rec.shiftX ?? 0, y: rec.shiftY ?? 0 });
      rec.shiftX = s.x;
      rec.shiftY = s.y;
    }
  };

  const translateLayerFills = (layer, dx, dy) => {
    if (!dx && !dy) return;
    transformLayerFills(layer, { dx, dy, scaleX: 1, scaleY: 1, origin: { x: 0, y: 0 } });
  };

  // Mutates engine: splits a baked fill layer (output of expandFill) into a
  // group of one-path-per-layer children — e.g. a hatch fill becomes a group
  // containing one shape layer per hatch line. Inherits pen/color/parent from
  // the source layer so the exploded children render identically to the source.
  //
  // Engine.layers layout after explode (the slot the source layer occupied):
  //   [..., group, path1, path2, ..., pathN, ...]
  //
  // Returns { groupId, childIds } on success, null otherwise.
  // Callers wrap with app.pushHistory().
  const explodeFillLayer = (engine, layer) => {
    if (!engine || !layer) return null;
    if (layer.isGroup) return null;
    const paths = Array.isArray(layer.paths) ? layer.paths : [];
    if (paths.length < 1) return null;
    const Layer = Vectura.Layer;
    if (!Layer) return null;

    const originalIndex = engine.layers.indexOf(layer);
    if (originalIndex < 0) return null;

    const children = paths.map((path, i) => {
      const child = new Layer(nextLayerId(engine), 'shape', `${layer.name} — ${i + 1}`);
      child.type = 'shape';
      child.isGroup = false;
      child.containerRole = null;
      child.groupType = null;
      child.penId = layer.penId;
      child.color = layer.color;
      child.strokeWidth = layer.strokeWidth;
      child.lineCap = layer.lineCap || 'round';
      const cloned = path.map((pt) => ({ x: pt.x, y: pt.y }));
      cloned.meta = {
        ...(path.meta || {}),
        source: 'paintfill-exploded',
        explodedFromLayerId: layer.id,
        explodedIndex: i,
      };
      child.paths = [cloned];
      child.displayPaths = [cloned];
      child.effectivePaths = [cloned];
      child.sourcePaths = [cloned];
      return child;
    });

    const group = new Layer(nextLayerId(engine), 'shape', `${layer.name} (exploded)`);
    group.type = 'shape';
    group.isGroup = true;
    group.containerRole = null;
    group.groupType = 'paintfill-exploded';
    group.groupCollapsed = false;
    group.params = { seed: 0, posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0 };
    group.paramStates = {};
    group.sourcePaths = null;
    group.paths = [];
    group.displayPaths = [];
    group.effectivePaths = [];
    group.parentId = layer.parentId ?? null;
    group.penId = layer.penId;
    group.color = layer.color;
    group.strokeWidth = layer.strokeWidth;
    group.lineCap = layer.lineCap;
    // Move modifiers onto the group so transforms apply to all path-children
    // as a unit (mirrors the expandFill convention).
    if (layer.modifier) {
      group.modifier = layer.modifier;
      layer.modifier = null;
    }
    // Tag for serialization / future "re-bake" support.
    if (layer.sourceFillRecord) {
      group.sourceFillRecord = JSON.parse(JSON.stringify(layer.sourceFillRecord));
    }

    children.forEach((c) => { c.parentId = group.id; });

    // Replace the source layer's slot with [group, ...children]. The source
    // layer is discarded — its geometry now lives entirely in the children.
    engine.layers.splice(originalIndex, 1, group, ...children);

    if (typeof engine.setActiveLayerId === 'function') {
      engine.setActiveLayerId(group.id);
    } else {
      engine.activeLayerId = group.id;
    }
    if (typeof engine.computeAllDisplayGeometry === 'function') {
      engine.computeAllDisplayGeometry();
    }

    return {
      groupId: group.id,
      childIds: children.map((c) => c.id),
    };
  };

  Vectura.PaintBucketOps = {
    findFillTargetStack,
    findFillAtPoint,
    findHoveredLayer,
    applyFillAtPoint,
    buildFillRecord,
    generateGeometryForLayer,
    expandFill,
    explodeFillLayer,
    transformLayerFills,
    translateLayerFills,
  };
})();
