/**
 * Export SVG builder: window.Vectura.ExportSvgBuilder.
 *
 * The plotter-SVG snapshot and document code that File > Export SVG uses,
 * lifted out of ui-file-io.js so it can run without a UI (the Start Page art
 * renderer builds thumbnails with it on a private engine).
 *
 *   buildExportSnapshot(engine, { computeDisplayGeometry, optimizeTargets }) -> snapshot
 *   buildSvgDocument(snapshot) -> SVG string
 *   countPaths(snapshot) -> number
 *
 * Both read the global SETTINGS (paper size, margin, pens, crop flags, ...)
 * and write nothing. computeDisplayGeometry defaults to the engine's own;
 * optimizeTargets is only consulted when SETTINGS.optimizationExport is on.
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});
  const { SETTINGS = {} } = Vectura;

  const svgLineCap = (cap) => {
    const fn = window.Vectura?.STROKE_STYLE?.toCanvasCap;
    if (fn) return fn(cap);
    if (cap === 'projecting') return 'square';
    return cap === 'butt' ? 'butt' : 'round';
  };

  // Everything numeric that is interpolated into the SVG string goes through here: a crafted document can carry a
  // string where a number belongs (settings.margin, a custom paper size) and the export must never echo it as markup.
  const finite = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };

  const formatDashArray = (pattern) =>
    pattern.map((value) => Number(value).toFixed(3).replace(/\.?0+$/, '')).join(' ');

  const normalizeSvgId = (value, prefix = 'id') => {
    const fallback = `${prefix || 'id'}`;
    const base = `${value ?? ''}`.trim() || fallback;
    const sanitized = base.replace(/[^A-Za-z0-9_.-]/g, '_') || fallback;
    return /^[A-Za-z_]/.test(sanitized) ? sanitized : `${fallback}_${sanitized}`;
  };
  const isMaskLayerGeometryHidden = (layer) => Boolean(layer?.mask?.enabled && layer?.mask?.hideLayer);

  // Sliced building. The snapshot and the document are written as generators that yield when `opts.sliceMs` of work has
  // elapsed (never when it is absent), so a caller can build a big scene's SVG in tasks of a few milliseconds and let the page
  // paint, scroll and take input between them. The synchronous builders below run the very same generators to completion, so
  // sliced and unsliced output are the same bytes by construction.
  const perfNow = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  const makeSlicer = (opts) => {
    const budget = opts && opts.sliceMs > 0 ? opts.sliceMs : 0;
    let t = perfNow();
    return { sliced: budget > 0, due: () => budget > 0 && perfNow() - t >= budget, reset: () => { t = perfNow(); } };
  };
  const runToEnd = (gen) => {
    let r = gen.next();
    while (!r.done) r = gen.next();
    return r.value;
  };
  const SLICE_POINTS = 250; // vertices cloned / clipped per chunk of a sliced build

  function* snapshotSteps(engine, opts = {}) {
    const slice = makeSlicer(opts);
    const computeDisplay = typeof opts.computeDisplayGeometry === 'function'
      ? opts.computeDisplayGeometry
      : () => engine.computeAllDisplayGeometry();
    const optimizeTargets = opts.optimizeTargets;
    const prof = engine.currentProfile;
    const precision = Math.max(0, Math.min(6, finite(SETTINGS.precision, 3)));
    const useOptimized = Boolean(SETTINGS.optimizationExport);
    const removeHiddenGeometry = SETTINGS.removeHiddenGeometry !== false;
    const hardCrop = SETTINGS.cropExports !== false;
    const margin = finite(SETTINGS.margin, 0);
    const destructiveMarginCrop = hardCrop || (removeHiddenGeometry && SETTINGS.truncate !== false);
    const marginRect = destructiveMarginCrop
      ? {
          x: margin,
          y: margin,
          w: Math.max(0, prof.width - margin * 2),
          h: Math.max(0, prof.height - margin * 2),
        }
      : null;
    const useSvgMarginClip = SETTINGS.truncate && !destructiveMarginCrop;
    const optimize = Math.max(0, SETTINGS.plotterOptimize ?? 0);
    const tol = optimize > 0 ? Math.max(0.001, optimize) : 0;
    const quant = (v) => (tol ? Math.round(v / tol) * tol : v);
    // Direction-agnostic — same physical path forward/reversed must collapse
    // to a single key so duplicate layers dedup even after linesort flips
    // some paths to minimize pen travel.
    const pathKey = (path) => {
      if (path && path.meta && path.meta.kind === 'circle') {
        const cx = path.meta.cx ?? path.meta.x ?? 0;
        const cy = path.meta.cy ?? path.meta.y ?? 0;
        const r = path.meta.r ?? path.meta.rx ?? 0;
        return `c:${quant(cx)},${quant(cy)},${quant(r)}`;
      }
      if (!Array.isArray(path)) return '';
      const tokens = path.map((pt) => `${quant(pt.x)},${quant(pt.y)}`);
      const fwd = tokens.join('|');
      const rev = tokens.slice().reverse().join('|');
      return fwd <= rev ? fwd : rev;
    };

    computeDisplay();
    if (slice.sliced) { yield 'setup'; slice.reset(); }

    const optimizationTargetIds = useOptimized
      ? (typeof optimizeTargets === 'function'
        ? optimizeTargets({ includePlotterOptimize: true }).targetIds
        : new Set((engine.layers || []).filter((layer) => layer && (layer.type === 'compound' || window.Vectura.LayerInk.layerOwnsInk(layer)) && !engine.hasCompoundAncestor(layer)).map((layer) => layer.id)))
      : new Set();

    const penMap = new Map((SETTINGS.pens || []).map((pen) => [pen.id, pen]));
    const fallbackPen = {
      id: 'default',
      name: 'Default',
      color: '#000000',
      width: SETTINGS.strokeWidth ?? 0.3,
    };
    const clipPolygonsByLayerId = new Map();
    if (!removeHiddenGeometry) {
      const maskBounds = window.Vectura._UIExportUtil.getMaskExportBounds(engine, prof);
      (engine.layers || []).forEach((layer) => {
        if (!layer || !layer.visible || !layer.mask?.enabled) return;
        const polygons = window.Vectura._UIExportUtil.getLayerSilhouette(layer, engine, maskBounds) || [];
        if (polygons.length) clipPolygonsByLayerId.set(layer.id, polygons);
      });
    }

    const groups = [];
    // Gap-aware division dedup (Fix-A): the SAME shared two-pass deduper the
    // engine plotter-optimize pass and computeStats use, so the emitted SVG
    // matches the reported stats regardless of stack order or line-sort
    // interleave. Keyed per effective pen (the group key). Only active when
    // plotter-optimize is on.
    const SD = window.Vectura?.StrokeDivide;
    const deduper = (optimize > 0 && SD) ? SD.createPlotDeduper(quant, pathKey) : null;
    const seenGroupOrder = [];
    const groupMap = new Map();
    // Effective-pen grouping: expand every layer into path items first, then
    // bucket each item by its EFFECTIVE pen (path.meta.penId || layer.penId;
    // an unknown meta.penId falls back to the layer pen). Grouping by layer
    // pen alone put per-path pen overrides in the wrong <g>, deduped
    // identical geometry across different pens, and let pen-grouped line
    // sort interleave pens. The canvas renderer is the reference behavior.
    for (const [layerIndex, layer] of (engine.layers || []).entries()) {
      // A GROUP exports when it owns its ink: a compound bakes a silhouette
      // into layer.paths, a morph group publishes morphedPaths, and a 3D
      // scene group publishes its one composed pass on scenePaths. Skipping
      // every non-compound group is what made a scene-only document export a
      // blank SVG — its children are all `_sceneConsumed`, so nothing was
      // left to emit.
      const ownsInk = layer && (layer.type === 'compound' || window.Vectura.LayerInk.layerOwnsInk(layer));
      if (!layer?.visible || !ownsInk || isMaskLayerGeometryHidden(layer) || (engine.hasCompoundAncestor && engine.hasCompoundAncestor(layer))) continue;
      const layerPen = penMap.get(layer.penId) || fallbackPen;
      const ancestorMasks = engine.getAncestorMaskLayers ? engine.getAncestorMaskLayers(layer) : [];
      const forceLinear = destructiveMarginCrop || (removeHiddenGeometry && ancestorMasks.length);
      const lineCap = forceLinear ? 'butt' : layer.lineCap || 'round';
      // Stroke style model (STR-1/STR-3): join, miter limit and layer-level
      // dash travel with each item so SVG emission and the export-preview
      // canvas draw stay in lockstep.
      const lineJoin = ['miter', 'round', 'bevel'].includes(layer.lineJoin) ? layer.lineJoin : 'round';
      const miterLimit = Number.isFinite(layer.miterLimit) ? layer.miterLimit : 10;
      const dashArray = window.Vectura.STROKE_STYLE?.getLayerDashPattern
        ? window.Vectura.STROKE_STYLE.getLayerDashPattern(layer)
        : (layer.dash?.enabled && Array.isArray(layer.dash.pattern)
            && layer.dash.pattern.some((value) => Number(value) > 0)
          ? layer.dash.pattern.slice(0, 6)
          : null);
      const useCurves = Boolean(layer.params && layer.params.curves);
      const layerGroupId = window.Vectura._UIExportUtil.escapeXmlAttr(normalizeSvgId(layer.name || layer.id || 'Layer', 'layer'));
      const useLayerOptimized = useOptimized && optimizationTargetIds.has(layer.id);
      const ancestorClipLayerIds = removeHiddenGeometry ? [] : ancestorMasks.map((maskLayer) => maskLayer.id).filter(Boolean);
      // The source ink is read by reference and cloned / clipped chunk by chunk (both are pure per-path maps, so the chunks
      // concatenate to exactly what one whole-list call returns); a sliced build yields between chunks.
      const sourcePaths = (removeHiddenGeometry
        ? window.Vectura._UIExportUtil.getVisibleExportPaths(layer, { useOptimized: useLayerOptimized, sourceOnly: true })
        : window.Vectura._UIExportUtil.getRawExportPaths(layer, { useOptimized: useLayerOptimized, sourceOnly: true })) || [];
      let pathIndex = 0;
      for (let from = 0; from < sourcePaths.length;) {
        let to = from; let pts = 0;
        while (to < sourcePaths.length && (to === from || !slice.sliced || pts < SLICE_POINTS)) { const sp = sourcePaths[to++]; pts += Array.isArray(sp) ? sp.length : 8; }
        const part = sourcePaths.slice(from, to);
        from = to;
        // the margin clip builds its own geometry from the source (it never writes to it), so only an unclipped chunk needs a clone
        const paths = destructiveMarginCrop
          ? window.Vectura._UIExportUtil.hardClipExportPaths(part, marginRect, { useCurves: useCurves && !removeHiddenGeometry })
          : window.Vectura._UIExportUtil.cloneExportPaths(part);
        for (let k = 0; k < paths.length; k++) {
          const path = paths[k];
          const pathPen = penMap.get(path?.meta?.penId) || layerPen;
          // Group key comes from the shared effective-pen rule so the engine's
          // per-pen grouping / dedup / stats bucket paths under the exact same
          // pen this export plots them with (PenValidate.resolveEffectivePenId).
          const key = window.Vectura.PenValidate.resolveEffectivePenId(path?.meta, layer.penId, penMap);
          if (!groupMap.has(key)) {
            groupMap.set(key, { key, pen: pathPen, items: [] });
            seenGroupOrder.push(key);
          }
          groupMap.get(key).items.push({
            layer,
            layerIndex,
            pathIndex,
            path,
            lineCap,
            lineJoin,
            miterLimit,
            dashArray,
            useCurves: forceLinear ? false : useCurves,
            sharpEdges: !forceLinear && useCurves && layer.type === 'pattern' && !layer.params?.tileEdgeCurves,
            layerGroupId,
            ancestorClipLayerIds,
            strokeWidth: (SETTINGS.strokeWidthOverride === true
              ? (layer.strokeWidth ?? SETTINGS.strokeWidth ?? 0.3)
              : (pathPen.width ?? SETTINGS.strokeWidth ?? 0.3)).toFixed(3),
            strokeColor: pathPen.color || layerPen.color || '#000000',
            groupPenId: key,
            pathPenId: pathPen.id,
          });
          pathIndex += 1;
        }
        if (slice.due()) { yield 'chunk'; slice.reset(); }
      }
    }
    if (slice.sliced) { yield 'layers'; slice.reset(); }

    seenGroupOrder.forEach((key) => {
      const group = groupMap.get(key);
      if (!group) return;
      const items = group.items;

      const shouldInterleave = useOptimized && items.some((item) => {
        const grouping = item?.path?.meta?.lineSortGrouping;
        return grouping === 'pen' || grouping === 'combined';
      });
      if (shouldInterleave) {
        items.sort((a, b) => {
          const aOrder = Number.isFinite(a?.path?.meta?.lineSortOrder) ? a.path.meta.lineSortOrder : Number.MAX_SAFE_INTEGER;
          const bOrder = Number.isFinite(b?.path?.meta?.lineSortOrder) ? b.path.meta.lineSortOrder : Number.MAX_SAFE_INTEGER;
          if (aOrder !== bOrder) return aOrder - bOrder;
          if (a.layerIndex !== b.layerIndex) return a.layerIndex - b.layerIndex;
          return a.pathIndex - b.pathIndex;
        });
      }

      // Two passes over this pen group's items (already interleave-sorted):
      // pass 1 registers every claiming fragment's parent so a coincident
      // solid drops order-independently; pass 2 keeps or drops. A gapped or
      // multi-pen division keys on its own geometry + index, so it never
      // suppresses a coincident solid (the solid inks the gaps).
      const visibleItems = [];
      if (deduper) {
        items.forEach((item) => deduper.claim(key, item.path?.meta));
      }
      items.forEach((item) => {
        if (deduper && !deduper.keep(key, item.layer.id, item.path?.meta, item.path)) return;
        visibleItems.push(item);
      });
      groups.push({ key, pen: group.pen, items: visibleItems });
    });

    return {
      prof,
      precision,
      removeHiddenGeometry,
      hardCrop,
      useSvgMarginClip,
      margin,
      marginRect,
      groups,
      clipPolygonsByLayerId,
    };
  }
  const buildExportSnapshot = (engine, opts = {}) => runToEnd(snapshotSteps(engine, Object.assign({}, opts, { sliceMs: 0 })));

  const countPaths = (snapshot) =>
    (snapshot.groups || []).reduce((n, group) => n + (group.items?.length || 0), 0);

  function* documentSteps(snapshot, opts = {}) {
    const slice = makeSlicer(opts);
    const { prof, precision, groups, clipPolygonsByLayerId, useSvgMarginClip } = snapshot;
    const pageW = finite(prof.width, 0);
    const pageH = finite(prof.height, 0);
    const defs = [];
    const layerClipIds = new Map();
    if (useSvgMarginClip) {
      const m = finite(snapshot.margin ?? SETTINGS.margin, 0);
      const w = pageW - m * 2;
      const h = pageH - m * 2;
      defs.push(`<clipPath id="margin-clip"><rect x="${m}" y="${m}" width="${w}" height="${h}" /></clipPath>`);
    }
    if (!snapshot.removeHiddenGeometry) {
      clipPolygonsByLayerId.forEach((polygons, layerId) => {
        const clipId = normalizeSvgId(`${layerId || 'layer'}-mask-clip`, 'mask');
        const clipMarkup = window.Vectura._UIExportUtil.buildClipPathMarkup(clipId, polygons, precision, { profile: prof });
        if (!clipMarkup) return;
        defs.push(clipMarkup);
        layerClipIds.set(layerId, clipId);
      });
    }
    let svg = `<?xml version="1.0" standalone="no"?><svg width="${pageW}mm" height="${pageH}mm" viewBox="0 0 ${pageW} ${pageH}" xmlns="http://www.w3.org/2000/svg">`;
    if (defs.length) svg += `<defs>${defs.join('')}</defs>`;
    if (useSvgMarginClip) svg += `<g clip-path="url(#margin-clip)">`;

    for (const group of groups) {
      const pen = group.pen || {};
      const penName = normalizeSvgId(pen.name || pen.id || 'Pen', 'pen');
      // Pen models: the laid width is already pen.width (stroke-width
      // below); ink effects are preview-only. The model / special ink are
      // recorded as data attributes ONLY when set, so plain exports stay
      // byte-identical.
      // The effective special ink: the pen's own, else its model's built-in
      // one ('plain' — none, or switched off — adds no attribute).
      const PMx = window.Vectura.PenModel;
      const inkEffect = PMx && PMx.effectOf ? PMx.effectOf(pen)
        : (typeof pen.effect === 'string' && pen.effect ? pen.effect : 'plain');
      const penModelAttrs = (typeof pen.model === 'string' && pen.model
        ? ` data-vectura-pen-model="${window.Vectura._UIExportUtil.escapeXmlAttr(pen.model)}"` : '')
        + (inkEffect !== 'plain'
          ? ` data-vectura-ink-effect="${window.Vectura._UIExportUtil.escapeXmlAttr(inkEffect)}"` : '');
      svg += `<g id="${window.Vectura._UIExportUtil.escapeXmlAttr(`pen_${penName}`)}" stroke="${window.Vectura._UIExportUtil.escapeXmlAttr(pen.color || 'black')}" fill="none"${penModelAttrs}>`;
      for (const [itemIndex, item] of group.items.entries()) {
        item.ancestorClipLayerIds.forEach((layerId) => {
          const clipId = layerClipIds.get(layerId);
          if (clipId) svg += `<g clip-path="url(#${window.Vectura._UIExportUtil.escapeXmlAttr(clipId)})">`;
        });
        const joinAttrs = item.lineJoin === 'miter'
          ? ` stroke-linejoin="miter" stroke-miterlimit="${Number(item.miterLimit ?? 10)}"`
          : ` stroke-linejoin="${item.lineJoin || 'round'}"`;
        const layerDashAttr = item.dashArray ? ` stroke-dasharray="${formatDashArray(item.dashArray)}"` : '';
        svg += `<g id="${item.layerGroupId}-${itemIndex + 1}" stroke-width="${item.strokeWidth}" stroke-linecap="${svgLineCap(item.lineCap)}"${joinAttrs}${layerDashAttr}>`;
        let attrs = item.path?.meta?.exportClipped ? { 'stroke-linecap': 'butt' } : null;
        // Per-path cap override (`meta.strokeCap`). The pen-width ribbon
        // geometry sets butt so its outline/fill passes end exactly on the
        // clipped form instead of bulging half a pen width past it — the SVG
        // has to say so too, or the plot protrudes where the canvas didn't.
        const itemCap = window.Vectura?.Renderer?.resolvePathLineCap
          ? window.Vectura.Renderer.resolvePathLineCap(item.path, item.lineCap)
          : item.lineCap;
        if (itemCap && itemCap !== item.lineCap) {
          attrs = attrs || {};
          attrs['stroke-linecap'] = svgLineCap(itemCap);
        }
        // No per-item stroke/width override here: items are bucketed by
        // EFFECTIVE pen in getExportSnapshot, so the enclosing pen group
        // already carries the right stroke color and pen width.
        const dash = window.Vectura._UIExportUtil.getPathStrokeDash?.(item.path);
        if (dash) {
          attrs = attrs || {};
          attrs['stroke-dasharray'] = dash.map((value) => Number(value).toFixed(3).replace(/\.?0+$/, '')).join(' ');
        }
        // Variable line weight (silhouette / crease emphasis): emit a per-path
        // stroke-width override only when meta.weightScale differs from 1, so
        // default geometry keeps the group-level stroke-width untouched.
        // Resolved through Renderer.resolvePathWeightScale (with a
        // byte-identical lean-runtime fallback) so the emitted width cannot
        // drift from the canvas render, the export preview or expand.
        const rawWeight = Number(item.path?.meta?.weightScale);
        if (Number.isFinite(rawWeight) && rawWeight !== 1) {
          const weightScale = window.Vectura?.Renderer?.resolvePathWeightScale
            ? window.Vectura.Renderer.resolvePathWeightScale(item.path)
            : Math.max(0.1, Math.min(6, rawWeight));
          const scaledWidth = (parseFloat(item.strokeWidth) || 0) * weightScale;
          if (Number.isFinite(scaledWidth) && scaledWidth > 0) {
            attrs = attrs || {};
            attrs['stroke-width'] = Number(scaledWidth.toFixed(4));
          }
        }
        // Filled glyphs (spiralizer "Points" solid discs) override the group's
        // fill="none" with the stroke color so the marker exports solid.
        if (item.path?.meta?.fill) {
          attrs = attrs || {};
          attrs.fill = window.Vectura._UIExportUtil.escapeXmlAttr(item.strokeColor || group.pen?.color || 'black');
        }
        const markup = window.Vectura._UIExportUtil.shapeToSvg(item.path, precision, item.useCurves, attrs, item.sharpEdges);
        if (markup) svg += markup;
        svg += `</g>`;
        item.ancestorClipLayerIds.forEach((layerId) => {
          if (layerClipIds.get(layerId)) svg += `</g>`;
        });
        if (slice.due()) { yield 'item'; slice.reset(); }
      }
      svg += `</g>`;
    }

    if (useSvgMarginClip) svg += `</g>`;
    svg += `</svg>`;
    return svg;
  }
  const buildSvgDocument = (snapshot) => runToEnd(documentSteps(snapshot, { sliceMs: 0 }));

  Vectura.ExportSvgBuilder = { buildExportSnapshot, buildSvgDocument, countPaths, snapshotSteps, documentSteps };
})();
