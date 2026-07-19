/**
 * Vectura path-edit operations (Illustrator Tools Parity, Phase 1 Lane C).
 *
 * Selection-verb engine APIs over static path ('shape') layers:
 *
 *   PTH-1  simplifyBegin/simplifyPreview/simplifyCommit/simplifyCancel —
 *          scrubbable, lossless simplify session. Preview always recomputes
 *          from the begin() snapshot (never from the previous preview);
 *          preview(0) restores the original exactly; commit bakes the current
 *          preview as ONE undo step; cancel restores the snapshot.
 *   PTH-2  autoSmooth(layerIds) — suggested simplify strength t (no commit).
 *   PTH-3  smoothSelection(layerIds, strength) — one-shot undoable smooth verb.
 *   PTH-4  convertAnchorsToCorner / convertAnchorsToSmooth / cutAtAnchors /
 *          joinEndpoints + canConvert/canCut/canJoin eligibility predicates.
 *   PTH-5  expandLiveShape(layerId) — live parametric shape (meta.shape rect /
 *          polygon / oval / line descriptor) → plain path; emits ONE
 *          'vectura:shape-expanded' CustomEvent on window per expanded layer.
 *   SEL-3  flipLayers(layerIds, axis) — mirror the selection about its bounds
 *          center ('horizontal' = left/right, 'vertical' = top/bottom).
 *
 * Anchor-ref input contract (PTH-4 verbs and predicates):
 *   [{ layerId, pathIndex, anchorIndex }]
 * where pathIndex indexes layer.sourcePaths and anchorIndex indexes the anchor
 * list of that path under the renderer's pathToAnchors semantics: meta.anchors
 * when present, otherwise one anchor per polyline point, with the duplicated
 * closing point of a closed path dropped. This matches
 * renderer.directSelection { layerId, pathIndex, selectedIndices } 1:1 — the
 * UI maps each selected index i to { layerId, pathIndex, anchorIndex: i }.
 *
 * History contract: App history is snapshot-based with push-BEFORE-change
 * (app.pushHistory()); every mutating verb here pushes exactly once before it
 * mutates, so one undo restores the pre-verb document.
 *
 * Context resolution: every public function takes an optional trailing
 * `opts` accepting { app, engine } overrides; by default the live app is
 * resolved from window.app (set by main.js). Self-contained IIFE — tolerates
 * loading before/without the renderer or UI.
 */
(() => {
  const root = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = (root.Vectura = root.Vectura || {});

  const GU = () => Vectura.GeometryUtils || {};

  // Resolved lazily, never at load time: in the browser this file may load
  // before PathDraw registers, and under Node the unit tests require core
  // modules directly (and stitch only part of the namespace onto globalThis).
  const PD = () => {
    if (Vectura.PathDraw) return Vectura.PathDraw;
    if (typeof require === 'function') {
      try {
        return require('./path-draw.js');
      } catch (err) {
        return null;
      }
    }
    return null;
  };

  // ── Tuning constants (engine-internal; not user-visible strings) ────────────
  // World-unit (mm) chord tolerance when flattening displayed curves.
  const FLATTEN_TOLERANCE = 0.1;
  // Simplify reduction ladder: the fit tolerance is swept geometrically from
  // MIN→MAX (as a fraction of the path's bbox diagonal) to enumerate every
  // achievable anchor count, from the untouched original down to the minimal
  // shape-preserving bezier fit. Corners are preserved (cornerRadiusFrac 0), so
  // hard-cornered shapes (triangles, rectangles) collapse to a single rung and
  // cannot be reduced — the slider then has nowhere to travel.
  const SIMPLIFY_LADDER_MIN_FRAC = 0.0004;
  const SIMPLIFY_LADDER_MAX_FRAC = 0.25;
  const SIMPLIFY_LADDER_SAMPLES = 64;
  const SIMPLIFY_CORNER_ANGLE_DEG = 30;
  const SIMPLIFY_MIN_ANCHORS = 2;
  // autoSmooth: interior points whose Visvalingam triangle area is below
  // (fraction · diagonal)² are counted as removable noise.
  const AUTOSMOOTH_NOISE_FRACTION = 0.004;
  // autoSmooth: quantile of the noise areas that the suggested tolerance must
  // clear, and the safety factor applied on top.
  const AUTOSMOOTH_NOISE_QUANTILE = 0.95;
  const AUTOSMOOTH_TOLERANCE_FACTOR = 1.5;

  const SHAPE_EXPANDED_EVENT = 'vectura:shape-expanded';

  // ── Context ────────────────────────────────────────────────────────────────

  const resolveApp = (opts = {}) => opts.app || root.app || null;
  const resolveEngine = (opts = {}) => opts.engine || resolveApp(opts)?.engine || null;

  const findLayer = (engine, layerId) =>
    engine?.layers?.find?.((layer) => layer && layer.id === layerId) || null;

  // Static path layers are the only geometry this module may mutate: their
  // source-of-truth lives in layer.sourcePaths (source space) and
  // engine.generate() re-derives world paths from it. Generative layers
  // regenerate from params, so baked geometry edits would be clobbered.
  const isEligibleLayer = (layer) =>
    Boolean(layer && !layer.isGroup && layer.type === 'shape' && Array.isArray(layer.sourcePaths));

  const isLiveShapePath = (path) => Boolean(path?.meta?.shape);

  const isLiveShapeLayer = (layer) =>
    isEligibleLayer(layer) && layer.sourcePaths.some(isLiveShapePath);

  // ── Small geometry helpers ─────────────────────────────────────────────────

  const clonePaths = (paths) => GU().clonePaths
    ? GU().clonePaths(paths)
    : (paths || []).map((p) => {
      const next = p.map((pt) => ({ ...pt }));
      if (p.meta) next.meta = JSON.parse(JSON.stringify(p.meta));
      return next;
    });

  const cloneMeta = (meta) => (meta ? JSON.parse(JSON.stringify(meta)) : undefined);

  // Point count for the UI badge: anchors when the path is anchor-described,
  // raw polyline points otherwise.
  const countGeoPoints = (paths) =>
    (paths || []).reduce((sum, p) => {
      if (!Array.isArray(p)) return sum;
      const anchors = p.meta?.anchors;
      return sum + (Array.isArray(anchors) && anchors.length >= 2 ? anchors.length : p.length);
    }, 0);

  const pathsBBox = (paths) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    (paths || []).forEach((p) => {
      if (!Array.isArray(p)) return;
      if (p.meta && p.meta.kind === 'circle') {
        const cx = p.meta.cx ?? p.meta.x ?? 0;
        const cy = p.meta.cy ?? p.meta.y ?? 0;
        const rx = p.meta.rx ?? p.meta.r ?? 0;
        const ry = p.meta.ry ?? p.meta.r ?? 0;
        minX = Math.min(minX, cx - rx);
        maxX = Math.max(maxX, cx + rx);
        minY = Math.min(minY, cy - ry);
        maxY = Math.max(maxY, cy + ry);
        return;
      }
      p.forEach((pt) => {
        if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return;
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
      });
    });
    if (!Number.isFinite(minX)) return null;
    return { minX, minY, maxX, maxY };
  };

  const bboxDiagonal = (bbox) =>
    bbox ? Math.hypot(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY) : 0;

  // Flatten a path into the EXACT polyline the renderer draws for it, detached
  // from the input. The branch decision is NOT restated here — it is
  // PathDraw.classify, the single source of truth that renderer.tracePath, the
  // SVG exporters and flattenSmoothedPath all share. Flattening anything other
  // than what is drawn silently reshapes the layer on mutation:
  //   'cubic'     — anchors carry real bezier handles (curves ON, or the
  //                 per-path meta.forceCurves opt-in) → sample the exact bezier.
  //   'quadratic' — curves ON, no handles (algorithm polyline) → the draw-time
  //                 midpoint quadratic.
  //   'verbatim'/ — curves OFF, meta.straight/meta.baked, or <3 pts → the raw
  //   'empty'       POINTS array, unsmoothed. A default-drawn rect/polygon is
  //                 stored as handle-less anchors in a curves:false layer and
  //                 drawn SHARP; smoothing it here would round its corners away.
  // Both curve modes route through flattenSmoothedPath, which classifies again
  // and already strips anchors/shape and tags its result straight.
  // `useCurves` comes from the owning layer's params.curves.
  // The output is straight-tagged with stale baselines (originalAnchors) and
  // the parametric descriptor (anchors/shape) dropped, so the mutated result
  // renders verbatim and applyShapeAnchorRebuild can't restore pre-edit geometry.
  const flattenForEdit = (path, useCurves = false) => {
    const clone = clonePaths([path])[0];
    const meta = clone.meta ? { ...clone.meta } : {};
    const pathDraw = PD();
    const mode = pathDraw ? pathDraw.classify(clone, { useCurves }).mode : 'verbatim';
    const curved = mode === 'cubic' || mode === 'quadratic';

    let out;
    if (curved && GU().flattenSmoothedPath) {
      out = GU().flattenSmoothedPath(clone, FLATTEN_TOLERANCE);
      if (out.meta) {
        const m = { ...out.meta };
        delete m.originalAnchors;
        delete m.originalClosed;
        out.meta = m;
      }
      return out;
    }
    // Verbatim: the raw POINTS array is authoritative (exactly what tracePath's
    // lineTo branch draws; the anchors are ignored when curves are off). Using
    // the points also keeps this correct for world paths, whose points are
    // ground truth regardless of anchor bookkeeping.
    out = clone.map((pt) => ({ x: pt.x, y: pt.y }));
    const m = { ...meta };
    delete m.anchors;
    delete m.shape;
    delete m.originalAnchors;
    delete m.originalClosed;
    if (m.kind === 'shape' || m.kind === 'circle') delete m.kind;
    m.straight = true;
    if (meta.closed === true) m.closed = true;
    out.meta = m;
    return out;
  };

  const layerCurves = (layer) => Boolean(layer && layer.params && layer.params.curves);

  // Post-mutation housekeeping shared by every verb.
  const regenerateLayers = (engine, app, layerIds) => {
    (layerIds || []).forEach((id) => engine?.generate?.(id));
    const renderer = app?.renderer;
    renderer?.refreshDirectSelection?.();
    renderer?.draw?.();
  };

  // ── PTH-5 internals: live-shape expansion + event ──────────────────────────

  const emitShapeExpanded = (layer, source) => {
    try {
      if (typeof root.dispatchEvent === 'function' && typeof root.CustomEvent === 'function') {
        root.dispatchEvent(new root.CustomEvent(SHAPE_EXPANDED_EVENT, {
          detail: { layerId: layer.id, layerName: layer.name || '', source },
        }));
      }
    } catch (_) { /* headless contexts without CustomEvent */ }
  };

  // Strip the parametric shape descriptor from every source path of a live
  // shape layer, keeping the bezier anchors (the outline stays intact and
  // direct-editable). Emits the shape-expanded event ONCE per layer.
  const expandLiveShapeInPlace = (layer, source) => {
    if (!isLiveShapeLayer(layer)) return false;
    layer.sourcePaths.forEach((path) => {
      if (!isLiveShapePath(path)) return;
      const meta = { ...path.meta };
      delete meta.shape;
      if (meta.kind === 'shape' || meta.kind === 'circle') meta.kind = 'poly';
      path.meta = meta;
    });
    emitShapeExpanded(layer, source);
    return true;
  };

  // Public PTH-5 verb (also consumed by Phase 2): expand a live parametric
  // shape layer to a plain path layer. The parametric descriptor is stripped;
  // the outline's bezier anchors are preserved, so the geometry is unchanged
  // and stays direct-editable. One undo step; emits the shape-expanded event
  // once. Pass { pushHistory: false } when the caller already pushed.
  const expandLiveShape = (layerId, opts = {}) => {
    const engine = resolveEngine(opts);
    const app = resolveApp(opts);
    const layer = findLayer(engine, layerId);
    if (!isEligibleLayer(layer)) return { changed: false, reason: 'ineligible-layer' };
    if (!isLiveShapeLayer(layer)) return { changed: false, reason: 'not-live-shape' };
    if (opts.pushHistory !== false) app?.pushHistory?.();
    expandLiveShapeInPlace(layer, opts.source || 'api');
    regenerateLayers(engine, app, [layer.id]);
    return { changed: true, layerIds: [layer.id] };
  };

  // ── PTH-1 — simplify session (anchor-reduction ladder) ──────────────────────
  //
  // The Simplify slider is an ANCHOR-COUNT reducer, not a free tolerance dial.
  // begin() precomputes, per source path, a monotonic "reduction ladder": rung
  // 0 is the untouched original (the COMPLEX end — the slider's left, where the
  // thumb starts) and every higher rung is a strictly-lower anchor count from
  // fitting the fewest cubic beziers that still reproduce the shape. Corner
  // detection preserves hard corners, so a triangle / rectangle yields a single
  // rung (nothing removable) and the slider's usable range (maxSteps) is 0 — the
  // user is physically stopped once no more endpoints can be removed. A 4-point
  // gentle curve collapses to 3 (or fewer) with the silhouette held by beziers.

  let simplifySession = null;

  const restoreSessionLayer = (engine, rec) => {
    const layer = findLayer(engine, rec.id);
    if (!layer) return null;
    layer.sourcePaths = clonePaths(rec.original);
    layer.params.smoothing = rec.params.smoothing;
    layer.params.simplify = rec.params.simplify;
    return layer;
  };

  // A reduced rung → a path with meta.anchors + forceCurves, so the fitted
  // outline draws/exports as true cubic beziers even when the layer's Curves
  // toggle is off (mirrors the Smooth session). The parametric shape descriptor
  // is dropped: a reduced path is a plain, direct-editable path.
  const buildSimplifiedVariant = (anchors, closed, baseMeta) => {
    const built = buildPathFromAnchors(anchors, closed, baseMeta);
    if (built.meta) built.meta.forceCurves = true; else built.meta = { forceCurves: true };
    return built;
  };

  // The deepest rung index a record can reach across all of its paths.
  const recMaxRung = (rec) => rec.ladders.reduce((m, l) => Math.max(m, l.length - 1), 0);

  // Editable-anchor count under the renderer's semantics (meta.anchors when
  // present, else one anchor per polyline point with a closed path's duplicate
  // closing vertex dropped). This is the number fitBezierAnchors also reports,
  // so a triangle stored as a closed 4-point polyline reads as 3 — not 4 — and
  // is correctly seen as already-minimal (no phantom "drop the closing dup" rung).
  const anchorCountOf = (path) => parsePathAnchors(path).anchors.length;

  // Precompute one source path's reduction ladder. Rung 0 is the exact original
  // (lossless scrub). Higher rungs are the distinct, strictly-fewer-anchor
  // bezier fits found by sweeping the fit tolerance geometrically; corners are
  // preserved (cornerRadiusFrac 0) so the shape is held, only redundant anchors
  // are shed. Each rung records its tolerance fraction so autoSmooth can pick a
  // sensible default rung.
  const buildPathLadder = (path, useCurves) => {
    const originalClone = clonePaths([path])[0];
    const origCount = anchorCountOf(originalClone);
    const ladder = [{ count: origCount, path: originalClone, tolFrac: 0 }];
    const GUmod = GU();
    if (typeof GUmod.fitBezierAnchors !== 'function') return ladder;
    const flat = flattenForEdit(path, useCurves);
    const pts = (Array.isArray(flat) ? flat : []).map((pt) => ({ x: pt.x, y: pt.y }));
    if (pts.length < 4) return ladder; // 3-point (or fewer) shapes: nothing to reduce
    const closed = !!(flat.meta && flat.meta.closed)
      || (pts.length > 2 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 1e-6);
    // Reduced rungs are plain paths — strip the live-shape / stale-curve descriptor.
    const baseMeta = (path.meta ? { ...path.meta } : {});
    delete baseMeta.shape;
    delete baseMeta.originalAnchors;
    delete baseMeta.originalClosed;
    if (baseMeta.kind === 'shape' || baseMeta.kind === 'circle') delete baseMeta.kind;
    const diag = bboxDiagonal(pathsBBox([pts]));
    if (!(diag > 0)) return ladder;
    let lastCount = origCount;
    for (let s = 1; s <= SIMPLIFY_LADDER_SAMPLES; s += 1) {
      const frac = SIMPLIFY_LADDER_MIN_FRAC
        * Math.pow(SIMPLIFY_LADDER_MAX_FRAC / SIMPLIFY_LADDER_MIN_FRAC, s / SIMPLIFY_LADDER_SAMPLES);
      const anchors = GUmod.fitBezierAnchors(pts, closed, frac * diag, SIMPLIFY_CORNER_ANGLE_DEG, 0);
      if (!Array.isArray(anchors) || anchors.length < SIMPLIFY_MIN_ANCHORS) continue;
      const count = anchors.length;
      if (count < lastCount) {
        ladder.push({ count, path: buildSimplifiedVariant(anchors, closed, baseMeta), tolFrac: frac });
        lastCount = count;
      }
      if (count <= SIMPLIFY_MIN_ANCHORS) break;
    }
    return ladder;
  };

  const simplifyBegin = (layerIds, opts = {}) => {
    const engine = resolveEngine(opts);
    if (!engine || !Array.isArray(layerIds)) return null;
    const records = [];
    layerIds.forEach((id) => {
      const layer = findLayer(engine, id);
      if (!isEligibleLayer(layer)) return;
      const original = clonePaths(layer.sourcePaths);
      const useCurves = layerCurves(layer);
      const ladders = layer.sourcePaths.map((p) => buildPathLadder(p, useCurves));
      records.push({
        id: layer.id,
        original,
        ladders,
        params: {
          smoothing: layer.params?.smoothing ?? 0,
          simplify: layer.params?.simplify ?? 0,
        },
        pointsBefore: ladders.reduce((sum, l) => sum + l[0].count, 0),
        wasLive: isLiveShapeLayer(layer),
      });
    });
    if (!records.length) return null;
    const pointsBefore = records.reduce((sum, rec) => sum + rec.pointsBefore, 0);
    const maxSteps = records.reduce((m, rec) => Math.max(m, recMaxRung(rec)), 0);
    simplifySession = { engine, records, index: 0, maxSteps, pointsBefore, pointsAfter: pointsBefore };
    return { layerIds: records.map((rec) => rec.id), pointsBefore, maxSteps };
  };

  // Apply reduction-ladder rung `index` (0 = original, lossless scrub). Each
  // path uses min(index, its deepest rung); a record with nothing removable is
  // restored verbatim (params untouched) so unrelated layers in a multi-select
  // are never reshaped. Scrubbing is lossless — every rung is precomputed from
  // the begin() snapshot, never chained off a prior preview.
  const simplifyPreview = (index, opts = {}) => {
    if (!simplifySession) return null;
    const app = resolveApp(opts);
    const engine = simplifySession.engine;
    const maxSteps = simplifySession.maxSteps;
    const idx = Math.max(0, Math.min(maxSteps, Math.round(Number(index) || 0)));
    let pointsAfter = 0;
    simplifySession.records.forEach((rec) => {
      const layer = findLayer(engine, rec.id);
      if (!layer) return;
      const recIdx = Math.min(idx, recMaxRung(rec));
      if (recIdx <= 0) {
        restoreSessionLayer(engine, rec);
        pointsAfter += rec.pointsBefore;
        return;
      }
      layer.sourcePaths = rec.ladders.map((ladder) => {
        const rung = ladder[Math.min(recIdx, ladder.length - 1)];
        return clonePaths([rung.path])[0];
      });
      // The preview IS the geometry now; a nonzero smoothing/simplify param
      // would trigger the shape-anchor rebuild on generate() and clobber it.
      layer.params.smoothing = 0;
      layer.params.simplify = 0;
      pointsAfter += layer.sourcePaths.reduce((s, p) => s + anchorCountOf(p), 0);
    });
    simplifySession.index = idx;
    simplifySession.pointsAfter = pointsAfter;
    regenerateLayers(engine, app, simplifySession.records.map((rec) => rec.id));
    return { index: idx, maxSteps, pointsBefore: simplifySession.pointsBefore, pointsAfter };
  };

  const simplifyCancel = (opts = {}) => {
    if (!simplifySession) return false;
    const app = resolveApp(opts);
    const engine = simplifySession.engine;
    simplifySession.records.forEach((rec) => restoreSessionLayer(engine, rec));
    regenerateLayers(engine, app, simplifySession.records.map((rec) => rec.id));
    simplifySession = null;
    return true;
  };

  // Bake the current rung as ONE undo step. Order matters with the app's
  // push-before-change history: restore the originals, push (the snapshot IS
  // the pre-simplify document), then re-apply the final rung. Live parametric
  // shape layers that were actually reduced are expanded as part of the
  // destructive commit (PTH-5) and fire the shape-expanded event once each.
  const simplifyCommit = (opts = {}) => {
    if (!simplifySession) return null;
    const app = resolveApp(opts);
    const engine = simplifySession.engine;
    const session = simplifySession;
    const idxFinal = session.index;
    if (idxFinal <= 0) {
      simplifyCancel(opts);
      return { committed: false, index: 0, pointsBefore: session.pointsBefore, pointsAfter: session.pointsBefore };
    }
    // 1. Back to the pre-simplify document so the history snapshot is clean.
    session.records.forEach((rec) => restoreSessionLayer(engine, rec));
    regenerateLayers(engine, app, session.records.map((rec) => rec.id));
    app?.pushHistory?.();
    // 2. Re-apply the final rung destructively.
    simplifySession = session; // (unchanged; explicit for clarity)
    const result = simplifyPreview(idxFinal, opts);
    session.records.forEach((rec) => {
      const layer = findLayer(engine, rec.id);
      if (layer && rec.wasLive && recMaxRung(rec) > 0) emitShapeExpanded(layer, 'simplify');
    });
    simplifySession = null;
    return {
      committed: true,
      index: idxFinal,
      pointsBefore: result?.pointsBefore ?? session.pointsBefore,
      pointsAfter: result?.pointsAfter ?? session.pointsAfter,
    };
  };

  const getSimplifyState = () => {
    if (!simplifySession) return { active: false };
    return {
      active: true,
      index: simplifySession.index,
      maxSteps: simplifySession.maxSteps,
      layerIds: simplifySession.records.map((rec) => rec.id),
      pointsBefore: simplifySession.pointsBefore,
      pointsAfter: simplifySession.pointsAfter,
    };
  };

  // ── PTH-3b — smooth session (progressive corner rounding) ──────────────────
  //
  // The interactive Smooth slider is Illustrator-parity corner ROUNDING, driven
  // by the shared mechanism every Smooth surface uses
  // (GeometryUtils.roundCornerAnchors): the displayed curve is re-traced with a
  // TIGHT, faithful Schneider fit — the slider must never reshape or thin the
  // path (that is Simplify's verb) — and every detected corner rounds into a
  // fillet arc whose setback grows linearly with t across the slider's full
  // travel. At t=0 the original path is restored; at t=100 fillets meet at edge
  // midpoints. The rebuilt path is a densely-flattened curve (renders smooth
  // even with Curves off) whose meta.anchors are the editable fillet points.

  let smoothSession = null;

  const smoothBegin = (layerIds, opts = {}) => {
    const engine = resolveEngine(opts);
    if (!engine || !Array.isArray(layerIds)) return null;
    const records = [];
    layerIds.forEach((id) => {
      const layer = findLayer(engine, id);
      if (!isEligibleLayer(layer)) return;
      const original = clonePaths(layer.sourcePaths);
      // Snapshot each source path in its DISPLAYED form; the original is
      // restored at t=0 / cancel. Anchor-described drawn curves (PathDraw mode
      // 'cubic') are captured AS ANCHORS so the preview can round sharp anchors
      // in place — an already-smooth anchor is never split or re-authored.
      // Everything else (verbatim polylines, draw-time quadratics) is captured
      // as its flattened point curve for the fit-based rounding.
      const useCurves = layerCurves(layer);
      const pathDraw = PD();
      const paths = layer.sourcePaths.map((p) => {
        const mode = pathDraw ? pathDraw.classify(p, { useCurves }).mode : 'verbatim';
        if (mode === 'cubic') {
          const parsed = parsePathAnchors(p);
          if (Array.isArray(parsed.anchors) && parsed.anchors.length >= 2) {
            return {
              kind: 'anchors',
              anchors: parsed.anchors,
              closed: parsed.closed,
              meta: (p && p.meta) ? { ...p.meta } : {},
            };
          }
        }
        const flat = flattenForEdit(p, useCurves);
        const pts = (Array.isArray(flat) ? flat : []).map((pt) => ({ x: pt.x, y: pt.y }));
        const closed = !!(p && p.meta && p.meta.closed)
          || (pts.length > 2 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 1e-6);
        return { kind: 'points', points: pts, closed, meta: (p && p.meta) ? { ...p.meta } : {} };
      });
      records.push({
        id: layer.id,
        original,
        paths,
        params: { smoothing: layer.params?.smoothing ?? 0, simplify: layer.params?.simplify ?? 0 },
        wasLive: isLiveShapeLayer(layer),
      });
    });
    if (!records.length) return null;
    smoothSession = { engine, records, t: 0 };
    return { layerIds: records.map((rec) => rec.id) };
  };

  const smoothPreview = (t, opts = {}) => {
    if (!smoothSession) return null;
    const app = resolveApp(opts);
    const engine = smoothSession.engine;
    const tc = Math.max(0, Math.min(100, Number(t) || 0));
    const GUmod = GU();
    smoothSession.records.forEach((rec) => {
      const layer = findLayer(engine, rec.id);
      if (!layer) return;
      if (tc <= 0) {
        restoreSessionLayer(engine, rec);
        return;
      }
      layer.sourcePaths = rec.paths.map((pth) => {
        // Anchor-described paths round IN PLACE: sharp anchors fillet, smooth
        // anchors survive untouched (no re-fit, so no anchor re-authoring and
        // no jump at small t).
        if (pth.kind === 'anchors') {
          const src = cloneAnchorList(pth.anchors);
          const rounded = (GUmod && typeof GUmod.filletSharpAnchors === 'function')
            ? GUmod.filletSharpAnchors(src, pth.closed, tc / 100)
            : src;
          const built = buildPathFromAnchors(
            (Array.isArray(rounded) && rounded.length >= 2) ? rounded : src,
            pth.closed,
            pth.meta,
          );
          if (built.meta) built.meta.forceCurves = true;
          else built.meta = { forceCurves: true };
          return built;
        }
        const pts = pth.points || [];
        const passthrough = () => {
          const same = pts.map((a) => ({ x: a.x, y: a.y }));
          if (pth.meta) same.meta = { ...pth.meta };
          return same;
        };
        if (pts.length < 3 || !GUmod || typeof GUmod.roundCornerAnchors !== 'function') return passthrough();
        const anchors = GUmod.roundCornerAnchors(pts, pth.closed, tc / 100);
        if (!Array.isArray(anchors) || anchors.length < 2) return passthrough();
        const built = buildPathFromAnchors(anchors, pth.closed, pth.meta);
        // Render + export the fitted anchors as TRUE cubic beziers even when the
        // layer's Curves toggle is off (per-path opt-in honored by
        // Renderer.tracePath and the SVG exporter's pathToSvg). The dense point
        // array is kept for hit-testing/silhouette; the curve draws from anchors.
        if (built.meta) built.meta.forceCurves = true;
        else built.meta = { forceCurves: true };
        return built;
      });
      // The preview IS the geometry; a nonzero smoothing/simplify param would
      // re-run the shape-anchor rebuild on generate() and clobber it.
      layer.params.smoothing = 0;
      layer.params.simplify = 0;
    });
    smoothSession.t = tc;
    regenerateLayers(engine, app, smoothSession.records.map((rec) => rec.id));
    return { t: tc };
  };

  const smoothCancel = (opts = {}) => {
    if (!smoothSession) return false;
    const app = resolveApp(opts);
    const engine = smoothSession.engine;
    smoothSession.records.forEach((rec) => restoreSessionLayer(engine, rec));
    regenerateLayers(engine, app, smoothSession.records.map((rec) => rec.id));
    smoothSession = null;
    return true;
  };

  const smoothCommit = (opts = {}) => {
    if (!smoothSession) return null;
    const app = resolveApp(opts);
    const engine = smoothSession.engine;
    const session = smoothSession;
    const tFinal = session.t;
    if (tFinal <= 0) {
      smoothCancel(opts);
      return { committed: false, t: 0 };
    }
    // Back to pre-smooth so the history snapshot is clean, push, re-apply.
    session.records.forEach((rec) => restoreSessionLayer(engine, rec));
    regenerateLayers(engine, app, session.records.map((rec) => rec.id));
    app?.pushHistory?.();
    smoothSession = session;
    const result = smoothPreview(tFinal, opts);
    session.records.forEach((rec) => {
      const layer = findLayer(engine, rec.id);
      if (layer && rec.wasLive) expandLiveShapeInPlace(layer, 'smooth');
    });
    smoothSession = null;
    return { committed: true, t: result?.t ?? tFinal };
  };

  const getSmoothState = () => {
    if (!smoothSession) return { active: false };
    return { active: true, t: smoothSession.t, layerIds: smoothSession.records.map((rec) => rec.id) };
  };

  // ── PTH-2 — autoSmooth suggestion ──────────────────────────────────────────

  const triArea = (a, b, c) =>
    Math.abs((a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y)) / 2);

  // Curvature-error heuristic: flatten the displayed curve, measure each
  // interior point's Visvalingam triangle area, and treat points whose area is
  // below (noiseFraction · diagonal)² as removable noise. The suggested
  // tolerance clears the AUTOSMOOTH_NOISE_QUANTILE of those noise areas.
  // Returns a suggested FRACTION of the bbox diagonal, or 0 when nothing is
  // removable. Pure per-layer helper (no mutation, no history).
  const autoSmoothTolFrac = (layer) => {
    const basis = layer.sourcePaths.map((path) => flattenForEdit(path, layerCurves(layer)));
    const diag = bboxDiagonal(pathsBBox(basis));
    if (!(diag > 0)) return 0;
    const noiseAreaCeil = Math.pow(AUTOSMOOTH_NOISE_FRACTION * diag, 2);
    const noiseAreas = [];
    basis.forEach((p) => {
      if (!Array.isArray(p) || p.length < 3) return;
      for (let i = 1; i < p.length - 1; i++) {
        const area = triArea(p[i - 1], p[i], p[i + 1]);
        if (area < noiseAreaCeil) noiseAreas.push(area);
      }
    });
    if (!noiseAreas.length) return 0;
    noiseAreas.sort((a, b) => a - b);
    const q = noiseAreas[Math.min(noiseAreas.length - 1,
      Math.floor(noiseAreas.length * AUTOSMOOTH_NOISE_QUANTILE))];
    const tol = Math.sqrt(q) * AUTOSMOOTH_TOLERANCE_FACTOR;
    return tol / diag;
  };

  // Suggest a sensible default reduction-ladder rung: the deepest rung whose
  // fit tolerance stays within the noise heuristic's suggested fraction (so the
  // default removes noise without distorting the shape). Returns a rung INDEX
  // (matching the slider domain), or 0 when nothing is worth removing. Reads the
  // active session's precomputed ladders when scrubbing (the live geometry may
  // already be a preview); otherwise builds ladders ephemerally. Pure — no
  // mutation, no history.
  const rungForTolFrac = (ladders, tolFrac) => {
    let best = 0;
    let deepest = 0;
    ladders.forEach((ladder) => {
      deepest = Math.max(deepest, ladder.length - 1);
      for (let i = ladder.length - 1; i >= 1; i -= 1) {
        if (ladder[i].tolFrac > 0 && ladder[i].tolFrac <= tolFrac) { best = Math.max(best, i); break; }
      }
    });
    // Noise exists but every rung is coarser than the suggestion → still take
    // the gentlest reduction available.
    if (best === 0 && tolFrac > 0 && deepest > 0) best = 1;
    return best;
  };

  const autoSmooth = (layerIds, opts = {}) => {
    const engine = resolveEngine(opts);
    if (!engine || !Array.isArray(layerIds)) return 0;
    let tolFrac = 0;
    const laddersByRec = [];
    layerIds.forEach((id) => {
      const layer = findLayer(engine, id);
      if (!isEligibleLayer(layer)) return;
      tolFrac = Math.max(tolFrac, autoSmoothTolFrac(layer));
      const sessionRec = simplifySession
        && simplifySession.records.find((r) => r.id === id);
      laddersByRec.push(sessionRec
        ? sessionRec.ladders
        : layer.sourcePaths.map((p) => buildPathLadder(p, layerCurves(layer))));
    });
    if (tolFrac <= 0 || !laddersByRec.length) return 0;
    return laddersByRec.reduce((m, ladders) => Math.max(m, rungForTolFrac(ladders, tolFrac)), 0);
  };

  // ── PTH-4 — anchor parsing / write-back (renderer-compatible) ──────────────

  const cloneAnchor = (a) => (a ? {
    x: a.x,
    y: a.y,
    in: a.in ? { x: a.in.x, y: a.in.y } : null,
    out: a.out ? { x: a.out.x, y: a.out.y } : null,
  } : null);

  const cloneAnchorList = (anchors) => (anchors || []).map(cloneAnchor);

  // Mirror of renderer.pathToAnchors: meta.anchors when present, otherwise one
  // anchor per polyline point; a closed path's duplicated closing point is
  // dropped so anchor indices match renderer.directSelection.selectedIndices.
  const parsePathAnchors = (path) => {
    if (!Array.isArray(path) || path.length < 2) return { anchors: [], closed: false };
    const first = path[0];
    const last = path[path.length - 1];
    const closedByPoints = Boolean(first && last
      && (first.x - last.x) * (first.x - last.x) + (first.y - last.y) * (first.y - last.y) < 1e-6);
    let closed;
    let anchors;
    if (Array.isArray(path.meta?.anchors) && path.meta.anchors.length >= 2) {
      // Anchor-described paths: the meta flag is authoritative. An OPEN path
      // may legitimately start and end at the same point (e.g. a closed ring
      // cut at one anchor), so coincident endpoints must not force `closed`.
      closed = path.meta.closed === true
        || (path.meta.closed === undefined && closedByPoints);
      anchors = cloneAnchorList(path.meta.anchors);
    } else {
      closed = closedByPoints || Boolean(path.meta?.closed);
      const points = closed && path.length > 2 ? path.slice(0, -1) : path;
      anchors = points.map((pt) => ({ x: pt.x, y: pt.y, in: null, out: null }));
    }
    if (closed && anchors.length >= 2) {
      const fa = anchors[0];
      const la = anchors[anchors.length - 1];
      if ((fa.x - la.x) * (fa.x - la.x) + (fa.y - la.y) * (fa.y - la.y) < 1e-6) {
        anchors = anchors.slice(0, -1);
      }
    }
    if (anchors.length < 2) closed = false;
    return { anchors, closed };
  };

  // Mirror of renderer.normalizeEditedPathMeta: an anchor-level edit
  // invalidates the smoothing baseline and any primitive descriptor fields.
  const normalizeEditedMeta = (meta) => {
    const next = { ...(meta || {}) };
    delete next.originalAnchors;
    delete next.originalClosed;
    if (next.kind === 'circle') next.kind = 'poly';
    else if (!next.shape && next.kind === 'shape') next.kind = 'poly';
    if (!next.shape) {
      delete next.cx;
      delete next.cy;
      delete next.rx;
      delete next.ry;
      delete next.r;
      delete next.rotation;
    }
    delete next.straight; // anchors drive the drawn curve again
    return next;
  };

  // Rebuild a source path from an edited anchor list (renderer
  // _applySelectionPath write-back semantics).
  const buildPathFromAnchors = (anchors, closed, baseMeta) => {
    const built = GU().buildPolylineFromAnchors
      ? GU().buildPolylineFromAnchors(anchors, closed)
      : anchors;
    const out = built.map((pt) => ({ x: pt.x, y: pt.y }));
    out.meta = normalizeEditedMeta({
      ...(baseMeta || {}),
      anchors: cloneAnchorList(anchors),
      closed: Boolean(closed),
    });
    return out;
  };

  const reverseAnchors = (anchors) =>
    cloneAnchorList(anchors).reverse().map((a) => ({ x: a.x, y: a.y, in: a.out, out: a.in }));

  // Normalize + resolve anchor refs ({layerId, pathIndex, anchorIndex}) against
  // live geometry. Returns resolved entries with the parsed anchor list.
  const resolveAnchorRefs = (engine, refs) => {
    if (!engine || !Array.isArray(refs)) return [];
    const parsedCache = new Map(); // `${layerId}:${pathIndex}` → parse result
    const out = [];
    refs.forEach((r) => {
      if (!r || typeof r !== 'object') return;
      const layer = findLayer(engine, r.layerId);
      if (!isEligibleLayer(layer)) return;
      const pathIndex = Number(r.pathIndex);
      const anchorIndex = Number(r.anchorIndex);
      if (!Number.isInteger(pathIndex) || !Number.isInteger(anchorIndex)) return;
      const sourcePath = layer.sourcePaths[pathIndex];
      if (!Array.isArray(sourcePath) || sourcePath.length < 2) return;
      const key = `${layer.id}:${pathIndex}`;
      if (!parsedCache.has(key)) parsedCache.set(key, parsePathAnchors(sourcePath));
      const parsed = parsedCache.get(key);
      if (anchorIndex < 0 || anchorIndex >= parsed.anchors.length) return;
      out.push({ layer, pathIndex, anchorIndex, parsed, sourcePath });
    });
    return out;
  };

  // Group resolved refs: Map layerId → Map pathIndex → { layer, parsed, indices:Set }
  const groupRefsByPath = (resolved) => {
    const byLayer = new Map();
    resolved.forEach((entry) => {
      if (!byLayer.has(entry.layer.id)) byLayer.set(entry.layer.id, new Map());
      const byPath = byLayer.get(entry.layer.id);
      if (!byPath.has(entry.pathIndex)) {
        byPath.set(entry.pathIndex, { layer: entry.layer, parsed: entry.parsed, indices: new Set() });
      }
      byPath.get(entry.pathIndex).indices.add(entry.anchorIndex);
    });
    return byLayer;
  };

  // ── PTH-4 — eligibility predicates ─────────────────────────────────────────
  // Reasons are machine-readable codes for UI disabled states; user-facing
  // strings belong to the UI layer / src/config.

  const canConvert = (refs, opts = {}) => {
    const resolved = resolveAnchorRefs(resolveEngine(opts), refs);
    if (!resolved.length) return { ok: false, reason: 'no-valid-anchors' };
    return { ok: true, reason: '' };
  };

  const isCuttableRef = (entry) =>
    entry.parsed.closed
    || (entry.anchorIndex > 0 && entry.anchorIndex < entry.parsed.anchors.length - 1);

  const canCut = (refs, opts = {}) => {
    const resolved = resolveAnchorRefs(resolveEngine(opts), refs);
    if (!resolved.length) return { ok: false, reason: 'no-valid-anchors' };
    if (!resolved.some(isCuttableRef)) return { ok: false, reason: 'endpoints-not-cuttable' };
    return { ok: true, reason: '' };
  };

  const isOpenEndpointRef = (entry) =>
    !entry.parsed.closed
    && (entry.anchorIndex === 0 || entry.anchorIndex === entry.parsed.anchors.length - 1);

  const canJoin = (refs, opts = {}) => {
    if (!Array.isArray(refs) || refs.length !== 2) return { ok: false, reason: 'needs-two-endpoints' };
    const resolved = resolveAnchorRefs(resolveEngine(opts), refs);
    if (resolved.length !== 2) return { ok: false, reason: 'no-valid-anchors' };
    const [a, b] = resolved;
    if (!isOpenEndpointRef(a) || !isOpenEndpointRef(b)) return { ok: false, reason: 'not-open-endpoints' };
    if (a.layer.id !== b.layer.id) return { ok: false, reason: 'different-layers' };
    if (a.pathIndex === b.pathIndex) {
      if (a.anchorIndex === b.anchorIndex) return { ok: false, reason: 'same-endpoint' };
      if (a.parsed.anchors.length < 3) return { ok: false, reason: 'degenerate-loop' };
    }
    return { ok: true, reason: '' };
  };

  // ── PTH-4 — verbs ──────────────────────────────────────────────────────────

  // Shared runner: eligibility gate → ONE history push → live-shape expansion
  // (destructive verbs, PTH-5) → per-path mutation → regen + renderer refresh.
  const runAnchorVerb = (refs, opts, source, mutatePathGroup) => {
    const engine = resolveEngine(opts);
    const app = resolveApp(opts);
    const resolved = resolveAnchorRefs(engine, refs);
    if (!resolved.length) return { changed: false };
    app?.pushHistory?.();
    const byLayer = groupRefsByPath(resolved);
    const touched = [];
    byLayer.forEach((byPath, layerId) => {
      const layer = findLayer(engine, layerId);
      if (!layer) return;
      const wasLive = isLiveShapeLayer(layer);
      if (wasLive) expandLiveShapeInPlace(layer, source);
      // Descending path order so splice-based mutations keep indices valid.
      const pathIndices = [...byPath.keys()].sort((x, y) => y - x);
      pathIndices.forEach((pathIndex) => {
        const group = byPath.get(pathIndex);
        // Re-parse when the live-shape expansion touched metas (anchors kept,
        // indices unchanged) — parse is cheap and always current.
        const parsed = parsePathAnchors(layer.sourcePaths[pathIndex]);
        mutatePathGroup(layer, pathIndex, parsed, group.indices);
      });
      touched.push(layerId);
    });
    regenerateLayers(engine, app, touched);
    return { changed: true, layerIds: touched };
  };

  const convertAnchorsToCorner = (refs, opts = {}) =>
    runAnchorVerb(refs, opts, 'convert-corner', (layer, pathIndex, parsed, indices) => {
      const anchors = parsed.anchors;
      indices.forEach((i) => {
        if (!anchors[i]) return;
        anchors[i].in = null;
        anchors[i].out = null;
      });
      layer.sourcePaths[pathIndex] = buildPathFromAnchors(
        anchors, parsed.closed, layer.sourcePaths[pathIndex].meta
      );
    });

  const convertAnchorsToSmooth = (refs, opts = {}) =>
    runAnchorVerb(refs, opts, 'convert-smooth', (layer, pathIndex, parsed, indices) => {
      const anchors = parsed.anchors;
      const n = anchors.length;
      indices.forEach((i) => {
        const a = anchors[i];
        if (!a) return;
        let prev;
        let next;
        if (parsed.closed) {
          prev = anchors[(i - 1 + n) % n];
          next = anchors[(i + 1) % n];
        } else {
          prev = i === 0 ? a : anchors[i - 1];
          next = i === n - 1 ? a : anchors[i + 1];
        }
        // Symmetric handles along the neighbor chord (Catmull-Rom tangent).
        const dx = (next.x - prev.x) / 6;
        const dy = (next.y - prev.y) / 6;
        a.in = { x: a.x - dx, y: a.y - dy };
        a.out = { x: a.x + dx, y: a.y + dy };
        if (!parsed.closed) {
          if (i === 0) a.in = null;
          if (i === n - 1) a.out = null;
        }
      });
      layer.sourcePaths[pathIndex] = buildPathFromAnchors(
        anchors, parsed.closed, layer.sourcePaths[pathIndex].meta
      );
    });

  // Split the path at each selected anchor into open subpaths. The cut anchor
  // is duplicated across the two pieces: the ending copy keeps its `in`
  // handle, the starting copy keeps its `out` handle — an exact parametric
  // split at the anchor (the scissors' polygon-clipping pipeline cuts by
  // region, not at an anchor, so the split is done on the anchor list itself).
  const cutAtAnchors = (refs, opts = {}) =>
    runAnchorVerb(refs, opts, 'cut', (layer, pathIndex, parsed, indices) => {
      const anchors = parsed.anchors;
      const n = anchors.length;
      const idxs = [...indices]
        .filter((i) => (parsed.closed ? i >= 0 && i < n : i > 0 && i < n - 1))
        .sort((x, y) => x - y);
      if (!idxs.length) return;
      const pieces = [];
      const pieceFromRange = (list) => {
        const piece = cloneAnchorList(list);
        piece[0].in = null;
        piece[piece.length - 1].out = null;
        return piece;
      };
      if (parsed.closed) {
        for (let j = 0; j < idxs.length; j++) {
          const start = idxs[j];
          const end = idxs[(j + 1) % idxs.length];
          const run = [];
          let k = start;
          run.push(anchors[k]);
          do {
            k = (k + 1) % n;
            run.push(anchors[k]);
          } while (k !== end);
          if (run.length >= 2) pieces.push(pieceFromRange(run));
        }
      } else {
        let prev = 0;
        idxs.forEach((i) => {
          pieces.push(pieceFromRange(anchors.slice(prev, i + 1)));
          prev = i;
        });
        pieces.push(pieceFromRange(anchors.slice(prev)));
      }
      const baseMeta = layer.sourcePaths[pathIndex].meta;
      const newPaths = pieces
        .filter((piece) => piece.length >= 2)
        .map((piece) => buildPathFromAnchors(piece, false, baseMeta));
      if (!newPaths.length) return;
      layer.sourcePaths.splice(pathIndex, 1, ...newPaths);
    });

  // Remove the selected anchor points. A path that falls below two anchors is
  // dropped entirely. Closed/open flag is preserved for the surviving ring.
  const deleteAnchors = (refs, opts = {}) =>
    runAnchorVerb(refs, opts, 'delete-anchor', (layer, pathIndex, parsed, indices) => {
      const remaining = parsed.anchors.filter((_, i) => !indices.has(i));
      if (remaining.length >= 2) {
        layer.sourcePaths[pathIndex] = buildPathFromAnchors(
          remaining, parsed.closed, layer.sourcePaths[pathIndex].meta
        );
      } else {
        layer.sourcePaths.splice(pathIndex, 1);
      }
    });

  // Connect exactly two selected open endpoints with a straight segment.
  const joinEndpoints = (refs, opts = {}) => {
    const engine = resolveEngine(opts);
    const app = resolveApp(opts);
    const gate = canJoin(refs, opts);
    if (!gate.ok) return { changed: false, reason: gate.reason };
    const [a, b] = resolveAnchorRefs(engine, refs);
    const layer = a.layer;
    app?.pushHistory?.();
    if (isLiveShapeLayer(layer)) expandLiveShapeInPlace(layer, 'join');
    if (a.pathIndex === b.pathIndex) {
      // Close the path with a straight seam segment.
      const parsed = parsePathAnchors(layer.sourcePaths[a.pathIndex]);
      const anchors = parsed.anchors;
      anchors[0].in = null;
      anchors[anchors.length - 1].out = null;
      layer.sourcePaths[a.pathIndex] = buildPathFromAnchors(
        anchors, true, layer.sourcePaths[a.pathIndex].meta
      );
    } else {
      // Merge two open paths: orient A to END at its ref, B to START at its
      // ref, concatenate with a straight junction.
      const parsedA = parsePathAnchors(layer.sourcePaths[a.pathIndex]);
      const parsedB = parsePathAnchors(layer.sourcePaths[b.pathIndex]);
      let listA = cloneAnchorList(parsedA.anchors);
      if (a.anchorIndex === 0) listA = reverseAnchors(listA);
      let listB = cloneAnchorList(parsedB.anchors);
      if (b.anchorIndex === parsedB.anchors.length - 1) listB = reverseAnchors(listB);
      listA[listA.length - 1].out = null;
      listB[0].in = null;
      const merged = listA.concat(listB);
      const keepIndex = Math.min(a.pathIndex, b.pathIndex);
      const dropIndex = Math.max(a.pathIndex, b.pathIndex);
      const baseMeta = layer.sourcePaths[a.pathIndex].meta;
      layer.sourcePaths.splice(dropIndex, 1);
      layer.sourcePaths[keepIndex] = buildPathFromAnchors(merged, false, baseMeta);
    }
    regenerateLayers(engine, app, [layer.id]);
    return { changed: true, layerIds: [layer.id] };
  };

  // ── PTH-3 — smoothSelection verb ───────────────────────────────────────────

  // One-shot undoable Smooth verb — the SAME corner-rounding mechanism as the
  // progressive slider (GeometryUtils.roundCornerAnchors), applied at a fixed
  // strength: `strength` 0..1 maps directly onto the slider's t. The previous
  // implementation ran Laplacian neighbor-averaging passes (GeometryUtils.
  // smoothPath), which SHRIVELED closed shapes toward their pinned seam point
  // instead of rounding their corners. Live parametric shapes are expanded
  // first (destructive verb — PTH-5 contract) and fire the shape-expanded event.
  const smoothSelection = (layerIds, strength, opts = {}) => {
    const engine = resolveEngine(opts);
    const app = resolveApp(opts);
    const s = Math.max(0, Math.min(1, Number(strength) || 0));
    if (!engine || !Array.isArray(layerIds) || s <= 0) return { changed: false };
    const GUmod = GU();
    if (typeof GUmod.roundCornerAnchors !== 'function') return { changed: false };
    const layers = layerIds
      .map((id) => findLayer(engine, id))
      .filter((layer) => isEligibleLayer(layer));
    if (!layers.length) return { changed: false };
    app?.pushHistory?.();
    layers.forEach((layer) => {
      const curves = layerCurves(layer);
      const pathDraw = PD();
      expandLiveShapeInPlace(layer, 'smooth');
      layer.sourcePaths = layer.sourcePaths.map((path) => {
        if (!Array.isArray(path) || path.length < 3) return path;
        // Anchor-described drawn curves round in place, exactly as the session
        // preview does: sharp anchors fillet, smooth anchors survive untouched.
        const mode = pathDraw ? pathDraw.classify(path, { useCurves: curves }).mode : 'verbatim';
        if (mode === 'cubic') {
          const parsed = parsePathAnchors(path);
          if (Array.isArray(parsed.anchors) && parsed.anchors.length >= 2
            && typeof GUmod.filletSharpAnchors === 'function') {
            const rounded = GUmod.filletSharpAnchors(parsed.anchors, parsed.closed, s);
            const built = buildPathFromAnchors(
              (Array.isArray(rounded) && rounded.length >= 2) ? rounded : parsed.anchors,
              parsed.closed,
              path.meta ? { ...path.meta } : {},
            );
            if (built.meta) built.meta.forceCurves = true;
            else built.meta = { forceCurves: true };
            return built;
          }
        }
        // Everything else: round the DISPLAYED flattened curve via the fit.
        const flat = flattenForEdit(path, curves);
        const pts = flat.map((pt) => ({ x: pt.x, y: pt.y }));
        const closed = !!(path && path.meta && path.meta.closed)
          || (pts.length > 2
            && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 1e-6);
        const anchors = GUmod.roundCornerAnchors(pts, closed, s);
        if (!Array.isArray(anchors) || anchors.length < 2) return flat;
        const built = buildPathFromAnchors(anchors, closed, flat.meta);
        // True cubic output even with the layer's Curves toggle off (same
        // per-path opt-in the session commit uses).
        if (built.meta) built.meta.forceCurves = true;
        else built.meta = { forceCurves: true };
        return built;
      });
      // The rounded geometry is the new baseline; a nonzero smoothing param
      // would re-run the shape-anchor rebuild over it on the next generate().
      if (layer.params) {
        layer.params.smoothing = 0;
        layer.params.simplify = 0;
      }
    });
    regenerateLayers(engine, app, layers.map((layer) => layer.id));
    return { changed: true, layerIds: layers.map((layer) => layer.id) };
  };

  // ── SEL-3 — flipLayers (owned by Lane C; Lane A only invokes) ──────────────

  const FLIP_AXES = new Set(['horizontal', 'vertical']);

  // Mirror the selected layers about the selection's WORLD bounds center C.
  //   axis 'horizontal' → mirror left/right (negate world X)
  //   axis 'vertical'   → mirror top/bottom (negate world Y)
  //
  // Both branches are true WORLD reflections about C, so they are world-exact
  // AND self-inverse at any rotation (an earlier source-space reflection drifted
  // by several mm on flip-twice once rotation ≠ 0/90° because the world-bbox
  // center shifted between the two flips):
  //
  //   • Shape/path layers: flatten each WORLD display path exactly as the
  //     renderer draws it (flattenForEdit, honoring params.curves), reflect the
  //     world points about C, store back as sourcePaths, and reset the transform
  //     to identity (pos 0, scale 1, rotation 0). The geometry now lives in
  //     world coordinates; generate() reproduces it verbatim. Reflection
  //     preserves the world bbox center, so the second flip uses the same C.
  //   • Generative layers regenerate from params and cannot bake, so apply the
  //     world reflection to the transform itself. A horizontal world flip
  //     F_x·(R(θ)·S(sx,sy)) = R(−θ)·S(−sx,sy): negate rotation, negate the axis
  //     scale, and reflect the axis position (pos' = 2C − 2·origin − pos). This
  //     is the exact world mirror (vs. the prior scale-only form, which was not
  //     self-inverse under rotation) and inverts cleanly on the repeat.
  //
  // ONE push-before-change history entry; flip-twice restores within epsilon.
  const flipLayers = (layerIds, axis, opts = {}) => {
    const engine = resolveEngine(opts);
    const app = resolveApp(opts);
    if (!engine || !Array.isArray(layerIds) || !FLIP_AXES.has(axis)) return { changed: false };
    // Only geometry-bearing, non-group layers participate.
    const targets = layerIds
      .map((id) => findLayer(engine, id))
      .filter((layer) => layer && !layer.isGroup);
    if (!targets.length) return { changed: false };

    // Selection world bounds center from current world paths.
    const bbox = pathsBBox(targets.flatMap((layer) => layer.paths || []));
    if (!bbox) return { changed: false };
    const cx = (bbox.minX + bbox.maxX) / 2;
    const cy = (bbox.minY + bbox.maxY) / 2;
    const horizontal = axis === 'horizontal';
    const reflect = (pt) => (horizontal
      ? { x: 2 * cx - pt.x, y: pt.y }
      : { x: pt.x, y: 2 * cy - pt.y });

    app?.pushHistory?.();
    const touched = [];
    targets.forEach((layer) => {
      const params = layer.params || (layer.params = {});
      const origin = layer.origin || { x: 0, y: 0 };
      if (isEligibleLayer(layer)) {
        // Shape/path: bake the world reflection, then drop the transform so the
        // baked world coords are the source-of-truth (curves flattened first).
        const curves = layerCurves(layer);
        const flatWorld = (layer.paths || []).map((path) => flattenForEdit(path, curves));
        layer.sourcePaths = flatWorld.map((path) => {
          const out = path.map(reflect);
          out.meta = cloneMeta(path.meta);
          return out;
        });
        params.posX = 0;
        params.posY = 0;
        params.scaleX = 1;
        params.scaleY = 1;
        params.rotation = 0;
        params.smoothing = 0;
        params.simplify = 0;
      } else {
        // Generative: apply the world reflection to the transform params.
        params.rotation = -(params.rotation ?? 0);
        if (horizontal) {
          params.scaleX = -(params.scaleX ?? 1);
          params.posX = 2 * cx - 2 * origin.x - (params.posX ?? 0);
        } else {
          params.scaleY = -(params.scaleY ?? 1);
          params.posY = 2 * cy - 2 * origin.y - (params.posY ?? 0);
        }
      }
      touched.push(layer.id);
    });
    regenerateLayers(engine, app, touched);
    return { changed: true, layerIds: touched, axis };
  };

  // ── Public API ─────────────────────────────────────────────────────────────

  const api = {
    SHAPE_EXPANDED_EVENT,
    isEligibleLayer,
    isLiveShapeLayer,
    // PTH-1
    simplifyBegin,
    simplifyPreview,
    simplifyCommit,
    simplifyCancel,
    getSimplifyState,
    // PTH-2
    autoSmooth,
    // PTH-3
    smoothSelection,
    // PTH-3b — progressive smooth session
    smoothBegin,
    smoothPreview,
    smoothCommit,
    smoothCancel,
    getSmoothState,
    // PTH-4
    convertAnchorsToCorner,
    convertAnchorsToSmooth,
    cutAtAnchors,
    deleteAnchors,
    joinEndpoints,
    canConvert,
    canCut,
    canJoin,
    // PTH-5
    expandLiveShape,
    // SEL-3
    flipLayers,
  };

  Vectura.PathEditOps = { ...(Vectura.PathEditOps || {}), ...api };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
