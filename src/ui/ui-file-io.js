/**
 * File I/O and SVG export methods for the UI class.
 * Mixed into UI.prototype by ui.js.
 */
(() => {
  const {
    SETTINGS = {},
    Layer,
  } = window.Vectura || {};

  const clone =
    typeof structuredClone === 'function' ? (obj) => structuredClone(obj) : (obj) => JSON.parse(JSON.stringify(obj));

  const normalizeSvgId = (value, prefix = 'id') => {
    const fallback = `${prefix || 'id'}`;
    const base = `${value ?? ''}`.trim() || fallback;
    const sanitized = base.replace(/[^A-Za-z0-9_.-]/g, '_') || fallback;
    return /^[A-Za-z_]/.test(sanitized) ? sanitized : `${fallback}_${sanitized}`;
  };
  const isMaskLayerGeometryHidden = (layer) => Boolean(layer?.mask?.enabled && layer?.mask?.hideLayer);

  window.Vectura = window.Vectura || {};
  window.Vectura._UIFileIOMixin = {
    getAppVersion() {
      const runtimeVersion = window.Vectura?.APP_VERSION;
      if (runtimeVersion) return `${runtimeVersion}`;
      const meta = document.querySelector('.pane-meta');
      if (!meta) return '';
      return `${meta.textContent || ''}`.replace('V.', '').trim();
    },

    saveVecturaFile() {
      const version = this.getAppVersion();
      const images = window.Vectura?.NOISE_IMAGES || {};
      const imagePayload = Object.entries(images).reduce((acc, [id, img]) => {
        if (!img || !img.data) return acc;
        acc[id] = {
          width: img.width,
          height: img.height,
          data: Array.from(img.data),
        };
        return acc;
      }, {});
      const payload = {
        type: 'vectura',
        version,
        created: new Date().toISOString(),
        state: this.app.captureState(),
        images: imagePayload,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `vectura-${date}.vectura`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },

    openVecturaFile(file) {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          const state = data?.state || data;
          if (!state?.engine || !state?.settings) {
            throw new Error('Missing state payload');
          }
          if (data?.images) {
            const store = (window.Vectura.NOISE_IMAGES = window.Vectura.NOISE_IMAGES || {});
            Object.entries(data.images).forEach(([id, img]) => {
              if (!img || !Array.isArray(img.data)) return;
              store[id] = {
                width: img.width,
                height: img.height,
                data: new Uint8ClampedArray(img.data),
              };
            });
          }
          this.app.applyState(state);
          this.app.history = [];
          this.app.pushHistory();
        } catch (err) {
          this.openModal({
            title: 'Invalid File',
            body: `<p class="modal-text">That file could not be loaded as a .vectura document.</p>`,
          });
        }
      };
      reader.readAsText(file);
    },

    importSvgFile(file) {
      if (!file || !Layer) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result;
        const groups = this.parseSvgToLayerGroups(text);
        if (!groups.length) {
          this.openModal({
            title: 'No Paths Found',
            body: `<p class="modal-text">The SVG did not contain any vector paths to import.</p>`,
          });
          return;
        }
        if (this.app.pushHistory) this.app.pushHistory();
        const created = [];
        groups.forEach((group) => {
          const id = Math.random().toString(36).slice(2, 11);
          const name = this.getUniqueLayerName(group.name || 'Imported SVG', id);
          const layer = new Layer(id, 'expanded', name);
          layer.params.seed = 0;
          layer.params.smoothing = 0;
          layer.params.simplify = 0;
          layer.params.curves = false;
          layer.sourcePaths = clone(group.paths);
          if (group.stroke) layer.color = group.stroke;
          if (Number.isFinite(group.strokeWidth)) layer.strokeWidth = group.strokeWidth;
          created.push(layer);
          this.app.engine.layers.push(layer);
          this.app.engine.generate(layer.id);
        });
        const primary = created[created.length - 1];
        if (primary && this.app.renderer) {
          this.app.engine.activeLayerId = primary.id;
          this.app.renderer.setSelection([primary.id], primary.id);
        }
        this.renderLayers();
        this.buildControls();
        this.updateFormula();
        this.app.render();
      };
      reader.readAsText(file);
    },

    parseSvgToLayerGroups(svgText) {
      if (!svgText) return [];
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgText, 'image/svg+xml');
      const svg = doc.querySelector('svg');
      if (!svg) return [];
      const parseNumber = (val, fallback = 0) => {
        if (!val) return fallback;
        const cleaned = `${val}`.replace(/[^0-9.+-]/g, '');
        const num = parseFloat(cleaned);
        return Number.isFinite(num) ? num : fallback;
      };
      const viewBox = svg.getAttribute('viewBox');
      let vbMinX = 0;
      let vbMinY = 0;
      let vbW = parseNumber(svg.getAttribute('width'), 0);
      let vbH = parseNumber(svg.getAttribute('height'), 0);
      if (viewBox) {
        const parts = viewBox.split(/[\s,]+/).map((v) => parseFloat(v));
        if (parts.length >= 4) {
          [vbMinX, vbMinY, vbW, vbH] = parts;
        }
      }
      const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      if (viewBox) tempSvg.setAttribute('viewBox', viewBox);
      if (vbW && vbH) {
        tempSvg.setAttribute('width', vbW);
        tempSvg.setAttribute('height', vbH);
      }
      tempSvg.style.position = 'absolute';
      tempSvg.style.left = '-9999px';
      tempSvg.style.top = '-9999px';
      tempSvg.style.width = '0';
      tempSvg.style.height = '0';
      tempSvg.style.visibility = 'hidden';
      document.body.appendChild(tempSvg);

      const groups = new Map();
      const order = [];
      const addGroup = (key, name, stroke, strokeWidth) => {
        if (!groups.has(key)) {
          groups.set(key, { name, stroke, strokeWidth, paths: [], isClosed: false, originalFill: null });
          order.push(key);
        }
        return groups.get(key);
      };
      const elements = svg.querySelectorAll('path, line, polyline, polygon, rect, circle, ellipse');
      const stripEventHandlers = (node) => {
        [...node.attributes].forEach((a) => { if (/^on/i.test(a.name)) node.removeAttribute(a.name); });
        node.querySelectorAll('*').forEach((child) => {
          [...child.attributes].forEach((a) => { if (/^on/i.test(a.name)) child.removeAttribute(a.name); });
        });
      };
      elements.forEach((el) => {
        const clone = el.cloneNode(true);
        stripEventHandlers(clone);
        tempSvg.appendChild(clone);
        const stroke = el.getAttribute('stroke') || el.style?.stroke || '';
        const strokeWidth = parseNumber(el.getAttribute('stroke-width') || el.style?.strokeWidth, NaN);
        const groupLabel =
          el.closest('g')?.getAttribute('data-name') ||
          el.closest('g')?.getAttribute('id') ||
          (stroke && stroke !== 'none' ? `Stroke ${stroke}` : 'Imported SVG');
        const key = `${groupLabel}|${stroke || 'none'}`;
        const group = addGroup(key, groupLabel || 'Imported SVG', stroke && stroke !== 'none' ? stroke : null, strokeWidth);
        const fill = el.getAttribute('fill') || el.style?.fill || '';
        if (fill && fill !== 'none') {
          group.isClosed = true;
          if (!group.originalFill) group.originalFill = fill;
        }
        const paths = this.svgElementToPaths(clone, vbMinX, vbMinY);
        paths.forEach((path) => group.paths.push(path));
        clone.remove();
      });
      tempSvg.remove();

      // Geometric closure pass: mark groups closed if any path starts and ends at the same point
      order.forEach((key) => {
        const group = groups.get(key);
        if (group.isClosed) return;
        group.paths.forEach((path) => {
          if (path.length < 3) return;
          const first = path[0];
          const last = path[path.length - 1];
          if (Math.hypot(last.x - first.x, last.y - first.y) < 1.0) {
            group.isClosed = true;
          }
        });
      });

      return order.map((key) => groups.get(key)).filter((group) => group.paths && group.paths.length);
    },

    svgElementToPaths(el, offsetX = 0, offsetY = 0) {
      if (!el) return [];
      const tag = el.tagName.toLowerCase();
      const applyMatrix = (pt, matrix) => {
        if (!matrix) return pt;
        return {
          x: pt.x * matrix.a + pt.y * matrix.c + matrix.e,
          y: pt.x * matrix.b + pt.y * matrix.d + matrix.f,
        };
      };
      const applyOffset = (pt) => ({ x: pt.x - offsetX, y: pt.y - offsetY });
      const matrix = typeof el.getCTM === 'function' ? el.getCTM() : null;
      const normalizePoints = (points) =>
        points.map((pt) => applyOffset(applyMatrix({ x: pt.x, y: pt.y }, matrix)));
      const parseNumber = (val, fallback = 0) => {
        if (val === undefined || val === null) return fallback;
        const cleaned = `${val}`.replace(/[^0-9.+-]/g, '');
        const num = parseFloat(cleaned);
        return Number.isFinite(num) ? num : fallback;
      };

      if (tag === 'line') {
        const x1 = parseNumber(el.getAttribute('x1'));
        const y1 = parseNumber(el.getAttribute('y1'));
        const x2 = parseNumber(el.getAttribute('x2'));
        const y2 = parseNumber(el.getAttribute('y2'));
        return [normalizePoints([{ x: x1, y: y1 }, { x: x2, y: y2 }])];
      }
      if (tag === 'polyline' || tag === 'polygon') {
        const pointsAttr = el.getAttribute('points') || '';
        const coords = pointsAttr
          .trim()
          .split(/[\s,]+/)
          .map((val) => parseFloat(val))
          .filter((val) => Number.isFinite(val));
        const points = [];
        for (let i = 0; i < coords.length; i += 2) {
          points.push({ x: coords[i], y: coords[i + 1] });
        }
        if (tag === 'polygon' && points.length) points.push({ ...points[0] });
        return points.length ? [normalizePoints(points)] : [];
      }
      if (tag === 'rect') {
        const x = parseNumber(el.getAttribute('x'));
        const y = parseNumber(el.getAttribute('y'));
        const w = parseNumber(el.getAttribute('width'));
        const h = parseNumber(el.getAttribute('height'));
        const points = [
          { x, y },
          { x: x + w, y },
          { x: x + w, y: y + h },
          { x, y: y + h },
          { x, y },
        ];
        return [normalizePoints(points)];
      }
      if (tag === 'circle' || tag === 'ellipse') {
        const cx = parseNumber(el.getAttribute('cx'));
        const cy = parseNumber(el.getAttribute('cy'));
        const rx = parseNumber(el.getAttribute(tag === 'circle' ? 'r' : 'rx'));
        const ry = parseNumber(el.getAttribute(tag === 'circle' ? 'r' : 'ry'));
        const steps = 48;
        const points = [];
        for (let i = 0; i <= steps; i++) {
          const t = (i / steps) * Math.PI * 2;
          points.push({ x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry });
        }
        return [normalizePoints(points)];
      }
      if (tag === 'path') {
        try {
          const len = el.getTotalLength ? el.getTotalLength() : 0;
          if (!Number.isFinite(len) || len <= 0) return [];
          const steps = Math.max(10, Math.floor(len / 2));
          const step = len / steps;
          
          const allSubPaths = [];
          let currentPath = [];

          for (let idx = 0; idx <= steps + 1; idx++) {
             const actualLen = Math.min(idx * step, len);
             const pt = el.getPointAtLength(actualLen);
             
             if (currentPath.length > 0) {
                const prev = currentPath[currentPath.length - 1];
                const prevLen = Math.max(0, (idx - 1) * step);
                const dLen = actualLen - prevLen;
                const maxDist = (dLen > 0 ? dLen : step) * 1.5;
                
                if (Math.hypot(pt.x - prev.x, pt.y - prev.y) > maxDist) {
                    let L = prevLen;
                    let R = actualLen;
                    let beforeJump = L;
                    
                    for (let iter = 0; iter < 8; iter++) {
                        const mid = (L + R) / 2;
                        const midPt = el.getPointAtLength(mid);
                        if (Math.hypot(midPt.x - prev.x, midPt.y - prev.y) > (mid - prevLen) * 1.5) {
                            R = mid;
                        } else {
                            beforeJump = mid;
                            L = mid;
                        }
                    }
                    
                    if (currentPath.length > 1) {
                        const endPt = el.getPointAtLength(beforeJump);
                        currentPath.push({ x: endPt.x, y: endPt.y });
                        allSubPaths.push(normalizePoints(currentPath));
                    }
                    
                    const jumpPt = el.getPointAtLength(beforeJump + 0.05);
                    currentPath = [{ x: jumpPt.x, y: jumpPt.y }, { x: pt.x, y: pt.y }];
                    if (actualLen === len) break;
                    continue;
                }
             }
             currentPath.push({ x: pt.x, y: pt.y });
             if (actualLen === len) break;
          }
          if (currentPath.length > 0) allSubPaths.push(normalizePoints(currentPath));
          return allSubPaths;
        } catch (err) {
          return [];
        }
      }
      return [];
    },

    getExportSnapshot() {
      const prof = this.app.engine.currentProfile;
      const precision = Math.max(0, Math.min(6, SETTINGS.precision ?? 3));
      const useOptimized = Boolean(SETTINGS.optimizationExport);
      const removeHiddenGeometry = SETTINGS.removeHiddenGeometry !== false;
      const hardCrop = SETTINGS.cropExports !== false;
      const destructiveMarginCrop = hardCrop || (removeHiddenGeometry && SETTINGS.truncate !== false);
      const marginRect = destructiveMarginCrop
        ? {
            x: SETTINGS.margin,
            y: SETTINGS.margin,
            w: Math.max(0, prof.width - SETTINGS.margin * 2),
            h: Math.max(0, prof.height - SETTINGS.margin * 2),
          }
        : null;
      const useSvgMarginClip = SETTINGS.truncate && !destructiveMarginCrop;
      const optimize = Math.max(0, SETTINGS.plotterOptimize ?? 0);
      const tol = optimize > 0 ? Math.max(0.001, optimize) : 0;
      const quant = (v) => (tol ? Math.round(v / tol) * tol : v);
      const pathKey = (path) => {
        if (path && path.meta && path.meta.kind === 'circle') {
          const cx = path.meta.cx ?? path.meta.x ?? 0;
          const cy = path.meta.cy ?? path.meta.y ?? 0;
          const r = path.meta.r ?? path.meta.rx ?? 0;
          return `c:${quant(cx)},${quant(cy)},${quant(r)}`;
        }
        if (!Array.isArray(path)) return '';
        return path.map((pt) => `${quant(pt.x)},${quant(pt.y)}`).join('|');
      };

      this.app.computeDisplayGeometry();

      const optimizationTargetIds = useOptimized
        ? (typeof this.optimizeTargetsForCurrentScope === 'function'
          ? this.optimizeTargetsForCurrentScope({ includePlotterOptimize: true }).targetIds
          : new Set((this.app.engine.layers || []).filter((layer) => layer && !layer.isGroup).map((layer) => layer.id)))
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
        const maskBounds = window.Vectura._UIExportUtil.getMaskExportBounds(this.app.engine, prof);
        (this.app.engine.layers || []).forEach((layer) => {
          if (!layer || !layer.visible || !layer.mask?.enabled) return;
          const polygons = window.Vectura._UIExportUtil.getLayerSilhouette(layer, this.app.engine, maskBounds) || [];
          if (polygons.length) clipPolygonsByLayerId.set(layer.id, polygons);
        });
      }

      const groups = [];
      const dedupe = optimize > 0 ? new Map() : null;
      const seenGroupOrder = [];
      const groupMap = new Map();
      (this.app.engine.layers || []).forEach((layer) => {
        if (!layer?.visible || layer.isGroup || isMaskLayerGeometryHidden(layer)) return;
        const pen = penMap.get(layer.penId) || fallbackPen;
        const key = pen.id || fallbackPen.id;
        if (!groupMap.has(key)) {
          groupMap.set(key, { key, pen, layers: [] });
          seenGroupOrder.push(key);
        }
        groupMap.get(key).layers.push(layer);
      });

      seenGroupOrder.forEach((key) => {
        const group = groupMap.get(key);
        if (!group) return;
        const pen = group.pen || fallbackPen;
        const items = [];
        group.layers.forEach((layer, layerIndex) => {
          const ancestorMasks = this.app.engine.getAncestorMaskLayers ? this.app.engine.getAncestorMaskLayers(layer) : [];
          const forceLinear = destructiveMarginCrop || (removeHiddenGeometry && ancestorMasks.length);
          const lineCap = forceLinear ? 'butt' : layer.lineCap || 'round';
          const useCurves = Boolean(layer.params && layer.params.curves);
          const layerGroupId = window.Vectura._UIExportUtil.escapeXmlAttr(normalizeSvgId(layer.name || layer.id || 'Layer', 'layer'));
          const useLayerOptimized = useOptimized && optimizationTargetIds.has(layer.id);
          const ancestorClipLayerIds = removeHiddenGeometry ? [] : ancestorMasks.map((maskLayer) => maskLayer.id).filter(Boolean);
          let paths = removeHiddenGeometry
            ? window.Vectura._UIExportUtil.getVisibleExportPaths(layer, { useOptimized: useLayerOptimized })
            : window.Vectura._UIExportUtil.getRawExportPaths(layer, { useOptimized: useLayerOptimized });
          if (destructiveMarginCrop) {
            paths = window.Vectura._UIExportUtil.hardClipExportPaths(paths, marginRect, {
              useCurves: useCurves && !removeHiddenGeometry,
            });
          }
          (paths || []).forEach((path, pathIndex) => {
            const pathPenId = path?.meta?.penId || pen.id;
            const pathPen = penMap.get(pathPenId) || pen;
            items.push({
              layer,
              layerIndex,
              pathIndex,
              path,
              lineCap,
              useCurves: forceLinear ? false : useCurves,
              sharpEdges: !forceLinear && useCurves && layer.type === 'pattern' && !layer.params?.tileEdgeCurves,
              layerGroupId,
              ancestorClipLayerIds,
              strokeWidth: (layer.strokeWidth ?? pathPen.width ?? SETTINGS.strokeWidth).toFixed(3),
              strokeColor: pathPen.color || pen.color || '#000000',
              groupPenId: pen.id,
              pathPenId,
            });
          });
        });

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

        const visibleItems = [];
        let seen = null;
        if (dedupe) {
          if (!dedupe.has(key)) dedupe.set(key, new Set());
          seen = dedupe.get(key);
        }
        items.forEach((item) => {
          const dedupeKey = seen ? pathKey(item.path) : '';
          if (seen && dedupeKey) {
            if (seen.has(dedupeKey)) return;
            seen.add(dedupeKey);
          }
          visibleItems.push(item);
        });
        groups.push({ key, pen, items: visibleItems });
      });

      return {
        prof,
        precision,
        removeHiddenGeometry,
        hardCrop,
        useSvgMarginClip,
        marginRect,
        groups,
        clipPolygonsByLayerId,
      };
    },

    exportSVG() {
      const snapshot =
        typeof this.getExportSnapshot === 'function'
          ? this.getExportSnapshot()
          : window.Vectura.UI.prototype.getExportSnapshot.call(this);
      const { prof, precision, groups, clipPolygonsByLayerId, useSvgMarginClip } = snapshot;
      const defs = [];
      const layerClipIds = new Map();
      if (useSvgMarginClip) {
        const m = SETTINGS.margin;
        const w = prof.width - m * 2;
        const h = prof.height - m * 2;
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
      let svg = `<?xml version="1.0" standalone="no"?><svg width="${prof.width}mm" height="${prof.height}mm" viewBox="0 0 ${prof.width} ${prof.height}" xmlns="http://www.w3.org/2000/svg">`;
      if (defs.length) svg += `<defs>${defs.join('')}</defs>`;
      if (useSvgMarginClip) svg += `<g clip-path="url(#margin-clip)">`;

      groups.forEach((group) => {
        const pen = group.pen || {};
        const penName = normalizeSvgId(pen.name || pen.id || 'Pen', 'pen');
        svg += `<g id="${window.Vectura._UIExportUtil.escapeXmlAttr(`pen_${penName}`)}" stroke="${window.Vectura._UIExportUtil.escapeXmlAttr(pen.color || 'black')}" fill="none">`;
        group.items.forEach((item, itemIndex) => {
          item.ancestorClipLayerIds.forEach((layerId) => {
            const clipId = layerClipIds.get(layerId);
            if (clipId) svg += `<g clip-path="url(#${window.Vectura._UIExportUtil.escapeXmlAttr(clipId)})">`;
          });
          svg += `<g id="${item.layerGroupId}-${itemIndex + 1}" stroke-width="${item.strokeWidth}" stroke-linecap="${item.lineCap}" stroke-linejoin="round">`;
          let attrs = item.path?.meta?.exportClipped ? { 'stroke-linecap': 'butt' } : null;
          if (item.pathPenId && item.pathPenId !== item.groupPenId) {
            attrs = attrs || {};
            attrs.stroke = window.Vectura._UIExportUtil.escapeXmlAttr(item.strokeColor || 'black');
            attrs['stroke-width'] = item.strokeWidth;
          }
          const markup = window.Vectura._UIExportUtil.shapeToSvg(item.path, precision, item.useCurves, attrs, item.sharpEdges);
          if (markup) svg += markup;
          svg += `</g>`;
          item.ancestorClipLayerIds.forEach((layerId) => {
            if (layerClipIds.get(layerId)) svg += `</g>`;
          });
        });
        svg += `</g>`;
      });

      if (useSvgMarginClip) svg += `</g>`;
      svg += `</svg>`;
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'vectura.svg';
      a.click();
    },
  };
})();
