/**
 * Canvas renderer for vector paths.
 */
(() => {
  const { SETTINGS } = window.Vectura || {};

  class Renderer {
    constructor(id, engine) {
      this.canvas = document.getElementById(id);
      this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
      this.engine = engine;
      this.scale = 1;
      this.offsetX = 0;
      this.offsetY = 0;
      this.isPan = false;
      this.isLayerDrag = false;
      this.dragMode = null;
      this.activeHandle = null;
      this.dragStart = { x: 0, y: 0 };
      this.startBounds = null;
      this.tempTransform = null;
      this.rotateOrigin = null;
      this.rotateStartAngle = 0;
      this.rotateStart = 0;
      this.guides = null;
      this.selectedLayerId = null;
      this.selectedLayerIds = new Set();
      this.isSelecting = false;
      this.selectionStart = null;
      this.selectionRect = null;
      this.selectionMode = SETTINGS.selectionMode || 'rect';
      this.selectionPath = null;
      this.lassoPath = null;
      this.isLassoSelecting = false;
      this.activeTool = SETTINGS.activeTool || 'select';
      this.scissorMode = SETTINGS.scissorMode || 'line';
      this.penMode = SETTINGS.penMode || 'draw';
      this.penPurpose = 'draw';
      this.penDraft = null;
      this.penPreview = null;
      this.isPenDragging = false;
      this.penDragAnchor = null;
      this.penDragStart = null;
      this.directSelection = null;
      this.directDrag = null;
      this.scissorStart = null;
      this.scissorEnd = null;
      this.isScissor = false;
      this.lightSource = SETTINGS.lightSource || null;
      this.lightSourceSelected = false;
      this.lightSourcePlacement = false;
      this.isLightDrag = false;
      this.lightDragOffset = { x: 0, y: 0 };
      this.onSelectLayer = null;
      this.onPenComplete = null;
      this.onScissor = null;
      this.onDirectEditStart = null;
      this.onDirectEditCommit = null;
      this.lastM = { x: 0, y: 0 };
      this.snap = null;
      this.snapAllowed = true;
      this.activePointerId = null;
      this.touchPointers = new Map();
      this.touchGesture = null;
      this.ready = Boolean(this.canvas && this.ctx);

      if (!this.ready) {
        console.warn(`[Renderer] Missing canvas or context for #${id}`);
        return;
      }

      const parent = this.canvas.parentElement;
      if (!parent) {
        console.warn('[Renderer] Canvas has no parent element.');
        this.ready = false;
        return;
      }

      new ResizeObserver(() => this.resize()).observe(parent);
      this.canvas.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
      if (window.PointerEvent) {
        this.canvas.addEventListener('pointerdown', (e) => this.down(e));
        window.addEventListener('pointermove', (e) => this.move(e));
        window.addEventListener('pointerup', (e) => this.up(e));
        window.addEventListener('pointercancel', (e) => this.up(e));
      } else {
        this.canvas.addEventListener('mousedown', (e) => this.down(e));
        window.addEventListener('mousemove', (e) => this.move(e));
        window.addEventListener('mouseup', (e) => this.up(e));
      }
    }

    setTool(tool) {
      if (!tool) return;
      if (tool !== 'pen') {
        this.penDraft = null;
        this.penPreview = null;
        this.isPenDragging = false;
        this.penDragAnchor = null;
        this.penDragStart = null;
        this.penPurpose = 'draw';
      } else {
        this.penPurpose = 'draw';
      }
      if (tool !== 'direct') {
        this.directDrag = null;
      }
      if (tool !== 'scissor') {
        this.isScissor = false;
        this.scissorStart = null;
        this.scissorEnd = null;
      }
      this.activeTool = tool;
      this.updateCursor();
      this.draw();
    }

    setPenMode(mode) {
      if (!mode) return;
      this.penMode = mode;
      SETTINGS.penMode = mode;
      this.updateCursor();
      this.draw();
    }

    setScissorMode(mode) {
      if (!mode) return;
      this.scissorMode = mode;
      this.draw();
    }

    setSelectionMode(mode) {
      if (!mode) return;
      this.selectionMode = mode;
      this.selectionRect = null;
      this.selectionStart = null;
      this.lassoPath = null;
      this.isLassoSelecting = false;
      this.draw();
    }

    setLightSourceMode(active) {
      this.lightSourcePlacement = Boolean(active);
      if (this.lightSourcePlacement) {
        this.lightSourceSelected = false;
        this.clearSelection();
      }
      this.draw();
    }

    setLightSource(point) {
      if (!point) return;
      this.lightSource = { x: point.x, y: point.y };
      SETTINGS.lightSource = { x: point.x, y: point.y };
      this.lightSourceSelected = true;
      this.draw();
    }

    clearLightSource() {
      this.lightSource = null;
      SETTINGS.lightSource = null;
      this.lightSourceSelected = false;
      this.lightSourcePlacement = false;
      this.draw();
    }

    hitLightSource(world) {
      if (!this.lightSource || !world) return false;
      const r = 6 / this.scale;
      const dx = world.x - this.lightSource.x;
      const dy = world.y - this.lightSource.y;
      return dx * dx + dy * dy <= r * r;
    }

    updateCursor() {
      if (!this.canvas) return;
      if (this.activeTool === 'hand') {
        this.canvas.style.cursor = this.isPan ? 'grabbing' : 'grab';
        return;
      }
      if (this.activeTool === 'pen') {
        this.canvas.style.cursor = 'crosshair';
        return;
      }
      if (this.activeTool === 'scissor') {
        this.canvas.style.cursor = 'crosshair';
        return;
      }
      this.canvas.style.cursor = 'crosshair';
    }

    getModifierState(e = {}) {
      const mods = SETTINGS.touchModifiers || {};
      const isTouchPointer = e.pointerType && e.pointerType !== 'mouse';
      const touchShift = isTouchPointer && Boolean(mods.shift);
      const touchAlt = isTouchPointer && Boolean(mods.alt);
      const touchMeta = isTouchPointer && Boolean(mods.meta);
      const touchPan = isTouchPointer && Boolean(mods.pan);
      return {
        shift: Boolean(e.shiftKey || touchShift),
        alt: Boolean(e.altKey || touchAlt),
        meta: Boolean(e.metaKey || e.ctrlKey || touchMeta),
        pan: Boolean(touchPan),
      };
    }

    wantsPan(e, modifiers = this.getModifierState(e)) {
      return this.activeTool === 'hand' || modifiers.shift || modifiers.pan || e.button === 1;
    }

    isTouchPointer(e) {
      return e?.pointerType === 'touch';
    }

    updateTouchPointer(e) {
      if (!this.isTouchPointer(e)) return;
      this.touchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    removeTouchPointer(e) {
      if (!this.isTouchPointer(e)) return;
      this.touchPointers.delete(e.pointerId);
    }

    canStartTouchGesture() {
      return !(
        this.isLayerDrag ||
        this.isSelecting ||
        this.isLassoSelecting ||
        this.isScissor ||
        this.directDrag ||
        this.isPenDragging ||
        this.isLightDrag
      );
    }

    getTouchGesturePair() {
      if (this.touchPointers.size < 2) return null;
      const points = Array.from(this.touchPointers.values());
      return [points[0], points[1]];
    }

    startTouchGesture() {
      const pair = this.getTouchGesturePair();
      if (!pair) return false;
      const [a, b] = pair;
      const center = { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
      const distance = Math.max(8, Math.hypot(b.x - a.x, b.y - a.y));
      this.cancelActiveInteractionsForTouchGesture();
      this.touchGesture = {
        startDistance: distance,
        startScale: this.scale,
        worldCenter: {
          x: (center.x - this.offsetX) / this.scale,
          y: (center.y - this.offsetY) / this.scale,
        },
      };
      return true;
    }

    updateTouchGesture() {
      const pair = this.getTouchGesturePair();
      if (!this.touchGesture || !pair) return false;
      const [a, b] = pair;
      const center = { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
      const distance = Math.max(8, Math.hypot(b.x - a.x, b.y - a.y));
      const ratio = distance / Math.max(1e-6, this.touchGesture.startDistance);
      const nextScale = Math.max(0.1, Math.min(this.touchGesture.startScale * ratio, 20));
      this.scale = nextScale;
      this.offsetX = center.x - this.touchGesture.worldCenter.x * nextScale;
      this.offsetY = center.y - this.touchGesture.worldCenter.y * nextScale;
      this.draw();
      return true;
    }

    stopTouchGesture() {
      this.touchGesture = null;
      this.updateCursor();
    }

    cancelActiveInteractionsForTouchGesture() {
      this.isPan = false;
      this.isLayerDrag = false;
      this.dragMode = null;
      this.activeHandle = null;
      this.tempTransform = null;
      this.snap = null;
      this.guides = null;
      this.isLightDrag = false;
      this.isPenDragging = false;
      this.penDragAnchor = null;
      this.penDragStart = null;
      this.directDrag = null;
      this.isScissor = false;
      this.scissorStart = null;
      this.scissorEnd = null;
      this.isSelecting = false;
      this.selectionRect = null;
      this.selectionStart = null;
      this.isLassoSelecting = false;
      this.lassoPath = null;
    }

    snapPenAngle(from, to) {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.hypot(dx, dy);
      if (!dist) return { ...to };
      const step = Math.PI / 4;
      const angle = Math.atan2(dy, dx);
      const snapped = Math.round(angle / step) * step;
      return { x: from.x + Math.cos(snapped) * dist, y: from.y + Math.sin(snapped) * dist };
    }

    snapScissorAngle(from, to, stepDeg = 15) {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.hypot(dx, dy);
      if (!dist) return { ...to };
      const step = (stepDeg * Math.PI) / 180;
      const angle = Math.atan2(dy, dx);
      const snapped = Math.round(angle / step) * step;
      return { x: from.x + Math.cos(snapped) * dist, y: from.y + Math.sin(snapped) * dist };
    }

    createAnchor(point) {
      return { x: point.x, y: point.y, in: null, out: null };
    }

    setAnchorHandles(anchor, target, options = {}) {
      if (!anchor || !target) return;
      const { breakHandle = false } = options;
      const vec = { x: target.x - anchor.x, y: target.y - anchor.y };
      anchor.out = { x: anchor.x + vec.x, y: anchor.y + vec.y };
      if (breakHandle) {
        anchor.in = null;
      } else {
        anchor.in = { x: anchor.x - vec.x, y: anchor.y - vec.y };
      }
    }

    cubicAt(p0, c1, c2, p1, t) {
      const u = 1 - t;
      const tt = t * t;
      const uu = u * u;
      const uuu = uu * u;
      const ttt = tt * t;
      return {
        x: uuu * p0.x + 3 * uu * t * c1.x + 3 * u * tt * c2.x + ttt * p1.x,
        y: uuu * p0.y + 3 * uu * t * c1.y + 3 * u * tt * c2.y + ttt * p1.y,
      };
    }

    sampleCubic(p0, c1, c2, p1) {
      const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      const handles = Math.hypot(c1.x - p0.x, c1.y - p0.y) + Math.hypot(c2.x - p1.x, c2.y - p1.y);
      const rough = Math.max(dist, handles);
      const steps = Math.min(120, Math.max(8, Math.round(rough / 4)));
      const pts = [];
      for (let i = 0; i <= steps; i++) {
        pts.push(this.cubicAt(p0, c1, c2, p1, i / steps));
      }
      return pts;
    }

    buildPenPathFromAnchors(anchors, closed = false) {
      if (!Array.isArray(anchors) || anchors.length < 2) return [];
      const pts = [];
      const count = anchors.length;
      for (let i = 0; i < count - 1; i++) {
        const a = anchors[i];
        const b = anchors[i + 1];
        let seg;
        if (!a.out && !b.in) {
          seg = [a, b];
        } else {
          const c1 = a.out || a;
          const c2 = b.in || b;
          seg = this.sampleCubic(a, c1, c2, b);
        }
        if (pts.length) seg.shift();
        pts.push(...seg);
      }
      if (closed && count > 2) {
        const a = anchors[count - 1];
        const b = anchors[0];
        let seg;
        if (!a.out && !b.in) {
          seg = [a, b];
        } else {
          const c1 = a.out || a;
          const c2 = b.in || b;
          seg = this.sampleCubic(a, c1, c2, b);
        }
        if (pts.length) seg.shift();
        pts.push(...seg);
      }
      return pts;
    }

    handlePenDown(world, e) {
      if (!world) return;
      const modifiers = this.getModifierState(e);
      const snapTol = 4 / this.scale;

      if (!this.penDraft) {
        this.penDraft = { anchors: [this.createAnchor(world)], closed: false };
        this.isPenDragging = true;
        this.penDragAnchor = 0;
        this.penDragStart = world;
        this.penPreview = null;
        this.draw();
        return;
      }

      const anchors = this.penDraft.anchors || [];
      if (!anchors.length) {
        anchors.push(this.createAnchor(world));
        this.penDraft.anchors = anchors;
        this.isPenDragging = true;
        this.penDragAnchor = anchors.length - 1;
        this.penDragStart = world;
        this.draw();
        return;
      }

      const first = anchors[0];
      const lastAnchor = anchors[anchors.length - 1];
      let next = { x: world.x, y: world.y };
      if (modifiers.shift) next = this.snapPenAngle(lastAnchor, next);
      const distToStart = Math.hypot(next.x - first.x, next.y - first.y);
      const isDoubleClick = e.detail && e.detail > 1;
      if (anchors.length >= 2 && distToStart <= snapTol && isDoubleClick) {
        this.penDraft.closed = true;
        this.commitPenPath();
        return;
      }
      const anchor = this.createAnchor(next);
      anchors.push(anchor);
      this.penDraft.anchors = anchors;
      this.isPenDragging = true;
      this.penDragAnchor = anchors.length - 1;
      this.penDragStart = next;
      if (isDoubleClick) {
        this.commitPenPath();
        return;
      }
      this.draw();
    }

    commitPenPath() {
      const anchors = this.penDraft?.anchors || [];
      if (!this.penDraft || anchors.length < 2) {
        this.cancelPenPath();
        return;
      }
      if (this.penPurpose === 'select') {
        if (anchors.length < 3) {
          this.cancelPenPath();
          return;
        }
        const path = this.buildPenPathFromAnchors(anchors, true);
        this.selectLayersByPolygon(path);
        this.penPurpose = 'draw';
      } else {
        const path = this.buildPenPathFromAnchors(anchors, this.penDraft.closed);
        if (this.onPenComplete) {
          const anchorPayload = anchors.map((anchor) => ({
            x: anchor.x,
            y: anchor.y,
            in: anchor.in ? { x: anchor.in.x, y: anchor.in.y } : null,
            out: anchor.out ? { x: anchor.out.x, y: anchor.out.y } : null,
          }));
          this.onPenComplete({
            path,
            anchors: anchorPayload,
            closed: Boolean(this.penDraft.closed),
          });
        }
      }
      this.penDraft = null;
      this.penPreview = null;
      this.isPenDragging = false;
      this.penDragAnchor = null;
      this.penDragStart = null;
      this.draw();
    }

    cancelPenPath() {
      this.penDraft = null;
      this.penPreview = null;
      this.isPenDragging = false;
      this.penDragAnchor = null;
      this.penDragStart = null;
      this.penPurpose = 'draw';
      this.draw();
    }

    undoPenPoint() {
      if (!this.penDraft || !this.penDraft.anchors || !this.penDraft.anchors.length) return;
      this.penDraft.anchors.pop();
      if (!this.penDraft.anchors.length) this.penDraft = null;
      this.draw();
    }

    cancelScissor() {
      if (!this.isScissor) return;
      this.isScissor = false;
      this.scissorStart = null;
      this.scissorEnd = null;
      this.draw();
    }

    cloneAnchor(anchor) {
      if (!anchor) return null;
      return {
        x: anchor.x,
        y: anchor.y,
        in: anchor.in ? { x: anchor.in.x, y: anchor.in.y } : null,
        out: anchor.out ? { x: anchor.out.x, y: anchor.out.y } : null,
      };
    }

    cloneAnchors(anchors) {
      return (anchors || []).map((anchor) => this.cloneAnchor(anchor));
    }

    expandCircleMeta(meta, segments = 72) {
      if (!meta) return [];
      const cx = meta.cx ?? meta.x ?? 0;
      const cy = meta.cy ?? meta.y ?? 0;
      const rx = meta.rx ?? meta.r ?? 0;
      const ry = meta.ry ?? meta.r ?? 0;
      const rot = meta.rotation ?? 0;
      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);
      const pts = [];
      for (let i = 0; i < segments; i++) {
        const t = (i / segments) * Math.PI * 2;
        const ex = Math.cos(t) * rx;
        const ey = Math.sin(t) * ry;
        pts.push({
          x: cx + ex * cosR - ey * sinR,
          y: cy + ex * sinR + ey * cosR,
        });
      }
      if (pts.length) pts.push({ ...pts[0] });
      return pts;
    }

    getLayerTransformParams(layer) {
      const profile = this.engine.currentProfile;
      const origin = {
        x: (layer?.origin?.x ?? profile.width / 2) + (layer?.params?.posX ?? 0),
        y: (layer?.origin?.y ?? profile.height / 2) + (layer?.params?.posY ?? 0),
      };
      const scaleX = layer?.params?.scaleX ?? 1;
      const scaleY = layer?.params?.scaleY ?? 1;
      const rot = ((layer?.params?.rotation ?? 0) * Math.PI) / 180;
      return { origin, scaleX, scaleY, rot, cosR: Math.cos(rot), sinR: Math.sin(rot) };
    }

    sourceToWorldPoint(layer, point) {
      if (!layer || !point) return point;
      const { origin, scaleX, scaleY, cosR, sinR } = this.getLayerTransformParams(layer);
      let x = point.x - (layer.origin?.x ?? 0);
      let y = point.y - (layer.origin?.y ?? 0);
      x *= scaleX;
      y *= scaleY;
      const rx = x * cosR - y * sinR;
      const ry = x * sinR + y * cosR;
      return { x: rx + origin.x, y: ry + origin.y };
    }

    worldToSourcePoint(layer, point) {
      if (!layer || !point) return point;
      const baseOrigin = layer.origin || { x: 0, y: 0 };
      const { origin, scaleX, scaleY, cosR, sinR } = this.getLayerTransformParams(layer);
      const dx = point.x - origin.x;
      const dy = point.y - origin.y;
      const ux = dx * cosR + dy * sinR;
      const uy = -dx * sinR + dy * cosR;
      const safeX = Math.abs(scaleX) < 1e-6 ? 1 : scaleX;
      const safeY = Math.abs(scaleY) < 1e-6 ? 1 : scaleY;
      return { x: ux / safeX + baseOrigin.x, y: uy / safeY + baseOrigin.y };
    }

    ensureLayerSourcePaths(layer) {
      if (!layer) return [];
      if (Array.isArray(layer.sourcePaths) && layer.sourcePaths.length) return layer.sourcePaths;
      const paths = (layer.paths || []).map((path) => {
        if (path && path.meta && path.meta.kind === 'circle') {
          const expanded = this.expandCircleMeta(path.meta, 72);
          const srcExpanded = expanded.map((pt) => this.worldToSourcePoint(layer, pt));
          srcExpanded.meta = { kind: 'poly', closed: true };
          return srcExpanded;
        }
        if (!Array.isArray(path)) return [];
        const src = path.map((pt) => this.worldToSourcePoint(layer, pt));
        if (path.meta) {
          const meta = { ...path.meta };
          delete meta.cx;
          delete meta.cy;
          delete meta.rx;
          delete meta.ry;
          delete meta.r;
          delete meta.rotation;
          src.meta = meta;
        }
        return src;
      });
      layer.sourcePaths = paths;
      layer.params.smoothing = 0;
      layer.params.simplify = 0;
      return layer.sourcePaths;
    }

    getDirectSelectionLayer() {
      if (!this.directSelection) return null;
      return this.engine.layers.find((layer) => layer.id === this.directSelection.layerId) || null;
    }

    pathToAnchors(path) {
      if (!Array.isArray(path) || path.length < 2) return { anchors: [], closed: false };
      const closedByPoints = (() => {
        const first = path[0];
        const last = path[path.length - 1];
        if (!first || !last) return false;
        const dx = first.x - last.x;
        const dy = first.y - last.y;
        return dx * dx + dy * dy < 1e-6;
      })();
      let anchors;
      let closed = closedByPoints || Boolean(path.meta?.closed);
      if (Array.isArray(path.meta?.anchors) && path.meta.anchors.length >= 2) {
        anchors = this.cloneAnchors(path.meta.anchors);
      } else {
        const points = closed && path.length > 2 ? path.slice(0, -1) : path;
        anchors = points.map((pt) => ({ x: pt.x, y: pt.y, in: null, out: null }));
      }
      if (closed && anchors.length >= 2) {
        const first = anchors[0];
        const last = anchors[anchors.length - 1];
        const dx = first.x - last.x;
        const dy = first.y - last.y;
        if (dx * dx + dy * dy < 1e-6) anchors = anchors.slice(0, -1);
      }
      if (anchors.length < 2) closed = false;
      return { anchors, closed };
    }

    findPathHitAtPoint(world, options = {}) {
      if (!world) return null;
      const { restrictToLayerId = null } = options;
      const layers = this.engine.layers.slice().reverse();
      let best = null;
      let bestDistSq = Infinity;
      layers.forEach((layer) => {
        if (!layer || layer.isGroup || !layer.visible) return;
        if (restrictToLayerId && layer.id !== restrictToLayerId) return;
        const stroke = layer.strokeWidth ?? SETTINGS.strokeWidth ?? 0.3;
        const tol = Math.max(2.5 / this.scale, stroke * 2);
        const tolSq = tol * tol;
        (layer.paths || []).forEach((path, pathIndex) => {
          if (path && path.meta && path.meta.kind === 'circle') {
            const cx = path.meta.cx ?? path.meta.x ?? 0;
            const cy = path.meta.cy ?? path.meta.y ?? 0;
            const r = path.meta.r ?? Math.max(path.meta.rx ?? 0, path.meta.ry ?? 0);
            const dist = Math.abs(Math.hypot(world.x - cx, world.y - cy) - r);
            const dSq = dist * dist;
            if (dSq <= tolSq && dSq < bestDistSq) {
              bestDistSq = dSq;
              best = { layer, pathIndex, path, segmentIndex: 0, point: { x: world.x, y: world.y }, distSq: dSq };
            }
            return;
          }
          if (!Array.isArray(path) || path.length < 2) return;
          for (let i = 0; i < path.length - 1; i++) {
            const a = path[i];
            const b = path[i + 1];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const lenSq = dx * dx + dy * dy;
            if (lenSq < 1e-9) continue;
            const t = Math.max(0, Math.min(1, ((world.x - a.x) * dx + (world.y - a.y) * dy) / lenSq));
            const px = a.x + t * dx;
            const py = a.y + t * dy;
            const ox = world.x - px;
            const oy = world.y - py;
            const dSq = ox * ox + oy * oy;
            if (dSq <= tolSq && dSq < bestDistSq) {
              bestDistSq = dSq;
              best = {
                layer,
                pathIndex,
                path,
                segmentIndex: i,
                segmentT: t,
                point: { x: px, y: py },
                distSq: dSq,
              };
            }
          }
        });
      });
      return best;
    }

    setDirectSelection(layer, pathIndex) {
      if (!layer || !Number.isInteger(pathIndex)) return null;
      const sourcePaths = this.ensureLayerSourcePaths(layer);
      const sourcePath = sourcePaths[pathIndex];
      if (!Array.isArray(sourcePath) || sourcePath.length < 2) return null;
      const parsed = this.pathToAnchors(sourcePath);
      if (!parsed.anchors.length) return null;
      this.directSelection = {
        layerId: layer.id,
        pathIndex,
        anchors: this.cloneAnchors(parsed.anchors),
        closed: parsed.closed,
        meta: sourcePath.meta ? { ...sourcePath.meta } : {},
      };
      return this.directSelection;
    }

    clearDirectSelection() {
      this.directSelection = null;
      this.directDrag = null;
      this.draw();
    }

    getDirectSelectionWorldAnchors() {
      const layer = this.getDirectSelectionLayer();
      if (!layer || !this.directSelection?.anchors?.length) return null;
      const anchors = this.directSelection.anchors.map((anchor) => ({
        x: this.sourceToWorldPoint(layer, anchor).x,
        y: this.sourceToWorldPoint(layer, anchor).y,
        in: anchor.in ? this.sourceToWorldPoint(layer, anchor.in) : null,
        out: anchor.out ? this.sourceToWorldPoint(layer, anchor.out) : null,
      }));
      return { layer, anchors };
    }

    hitDirectControl(world) {
      const data = this.getDirectSelectionWorldAnchors();
      if (!data) return null;
      const { anchors } = data;
      const handleTol = 5 / this.scale;
      const handleTolSq = handleTol * handleTol;
      for (let i = 0; i < anchors.length; i++) {
        const anchor = anchors[i];
        if (anchor.in) {
          const dx = world.x - anchor.in.x;
          const dy = world.y - anchor.in.y;
          if (dx * dx + dy * dy <= handleTolSq) return { type: 'in', index: i };
        }
        if (anchor.out) {
          const dx = world.x - anchor.out.x;
          const dy = world.y - anchor.out.y;
          if (dx * dx + dy * dy <= handleTolSq) return { type: 'out', index: i };
        }
      }
      const anchorTol = 6 / this.scale;
      const anchorTolSq = anchorTol * anchorTol;
      for (let i = 0; i < anchors.length; i++) {
        const anchor = anchors[i];
        const dx = world.x - anchor.x;
        const dy = world.y - anchor.y;
        if (dx * dx + dy * dy <= anchorTolSq) return { type: 'anchor', index: i };
      }
      return null;
    }

    applyDirectPath() {
      const layer = this.getDirectSelectionLayer();
      const selection = this.directSelection;
      if (!layer || !selection) return;
      const sourcePaths = this.ensureLayerSourcePaths(layer);
      const path = this.buildPenPathFromAnchors(selection.anchors, selection.closed);
      const meta = { ...(selection.meta || {}), anchors: this.cloneAnchors(selection.anchors), closed: Boolean(selection.closed) };
      path.meta = meta;
      sourcePaths[selection.pathIndex] = path;
      layer.sourcePaths = sourcePaths;
      this.engine.generate(layer.id);
      selection.meta = meta;
    }

    startDirectDrag(control) {
      if (!control || !this.directSelection) return false;
      this.directDrag = {
        type: control.type,
        index: control.index,
        moved: false,
        historyPushed: false,
      };
      return true;
    }

    updateDirectDrag(world, e) {
      if (!this.directDrag || !this.directSelection) return false;
      const layer = this.getDirectSelectionLayer();
      if (!layer) return false;
      const drag = this.directDrag;
      const anchor = this.directSelection.anchors[drag.index];
      if (!anchor) return false;
      const next = this.worldToSourcePoint(layer, world);
      if (!drag.historyPushed && this.onDirectEditStart) {
        this.onDirectEditStart();
        drag.historyPushed = true;
      }
      if (drag.type === 'anchor') {
        const dx = next.x - anchor.x;
        const dy = next.y - anchor.y;
        anchor.x = next.x;
        anchor.y = next.y;
        if (anchor.in) {
          anchor.in.x += dx;
          anchor.in.y += dy;
        }
        if (anchor.out) {
          anchor.out.x += dx;
          anchor.out.y += dy;
        }
      } else {
        anchor[drag.type] = { x: next.x, y: next.y };
        const modifiers = this.getModifierState(e);
        if (!modifiers.alt) {
          const dx = anchor.x - next.x;
          const dy = anchor.y - next.y;
          const mirror = drag.type === 'in' ? 'out' : 'in';
          anchor[mirror] = { x: anchor.x + dx, y: anchor.y + dy };
        }
      }
      drag.moved = true;
      this.applyDirectPath();
      this.draw();
      return true;
    }

    endDirectDrag() {
      if (!this.directDrag) return;
      const moved = this.directDrag.moved;
      this.directDrag = null;
      if (moved && this.onDirectEditCommit) this.onDirectEditCommit();
      this.draw();
    }

    makeAnchorSmooth(index) {
      if (!this.directSelection?.anchors?.length) return;
      const anchors = this.directSelection.anchors;
      const count = anchors.length;
      const anchor = anchors[index];
      if (!anchor) return;
      const prev = anchors[(index - 1 + count) % count] || anchor;
      const next = anchors[(index + 1) % count] || anchor;
      const vx = next.x - prev.x;
      const vy = next.y - prev.y;
      const len = Math.hypot(vx, vy) || 1;
      const ux = vx / len;
      const uy = vy / len;
      const scale = Math.max(0.8, Math.min(10, len * 0.2));
      anchor.in = { x: anchor.x - ux * scale, y: anchor.y - uy * scale };
      anchor.out = { x: anchor.x + ux * scale, y: anchor.y + uy * scale };
    }

    insertAnchorFromWorld(world, hit = null) {
      const baseHit = hit || this.findPathHitAtPoint(world, {
        restrictToLayerId: this.directSelection?.layerId || null,
      });
      if (!baseHit) return false;
      this.selectLayer(baseHit.layer);
      const selection = this.setDirectSelection(baseHit.layer, baseHit.pathIndex);
      if (!selection) return false;
      if (this.onDirectEditStart) this.onDirectEditStart();
      const insertIndex = Math.max(0, Math.min(selection.anchors.length, (baseHit.segmentIndex ?? 0) + 1));
      const sourcePoint = this.worldToSourcePoint(baseHit.layer, baseHit.point || world);
      selection.anchors.splice(insertIndex, 0, {
        x: sourcePoint.x,
        y: sourcePoint.y,
        in: null,
        out: null,
      });
      this.applyDirectPath();
      if (this.onDirectEditCommit) this.onDirectEditCommit();
      this.draw();
      return true;
    }

    removeAnchorFromWorld(world) {
      if (!this.directSelection) {
        const hitPath = this.findPathHitAtPoint(world);
        if (!hitPath) return false;
        this.selectLayer(hitPath.layer);
        if (!this.setDirectSelection(hitPath.layer, hitPath.pathIndex)) return false;
      }
      const hit = this.hitDirectControl(world);
      if (!hit || hit.type !== 'anchor') return false;
      if (this.directSelection.anchors.length <= 2) return false;
      if (this.onDirectEditStart) this.onDirectEditStart();
      this.directSelection.anchors.splice(hit.index, 1);
      if (this.directSelection.closed && this.directSelection.anchors.length < 3) {
        this.directSelection.closed = false;
      }
      this.applyDirectPath();
      if (this.onDirectEditCommit) this.onDirectEditCommit();
      this.draw();
      return true;
    }

    toggleAnchorFromWorld(world) {
      if (!this.directSelection) {
        const hit = this.findPathHitAtPoint(world);
        if (!hit) return false;
        this.selectLayer(hit.layer);
        if (!this.setDirectSelection(hit.layer, hit.pathIndex)) return false;
      }
      let control = this.hitDirectControl(world);
      if (!control || control.type !== 'anchor') {
        const hitPath = this.findPathHitAtPoint(world, {
          restrictToLayerId: this.directSelection?.layerId || null,
        });
        if (!hitPath || !this.directSelection?.anchors?.length) return false;
        const seg = Math.max(0, Math.min((hitPath.segmentIndex ?? 0), this.directSelection.anchors.length - 1));
        let idx = seg;
        if (Array.isArray(hitPath.path) && hitPath.path[seg + 1]) {
          const a = hitPath.path[seg];
          const b = hitPath.path[seg + 1];
          const da = Math.hypot(world.x - a.x, world.y - a.y);
          const db = Math.hypot(world.x - b.x, world.y - b.y);
          idx = db < da ? Math.min(this.directSelection.anchors.length - 1, seg + 1) : seg;
        }
        control = { type: 'anchor', index: idx };
      }
      const anchor = this.directSelection.anchors[control.index];
      if (!anchor) return false;
      if (this.onDirectEditStart) this.onDirectEditStart();
      if (anchor.in || anchor.out) {
        anchor.in = null;
        anchor.out = null;
      } else {
        this.makeAnchorSmooth(control.index);
      }
      this.applyDirectPath();
      if (this.onDirectEditCommit) this.onDirectEditCommit();
      this.draw();
      return true;
    }

    resize() {
      if (!this.ready || !this.canvas || !this.ctx) return;
      const p = this.canvas.parentElement.getBoundingClientRect();
      this.canvas.width = p.width * window.devicePixelRatio;
      this.canvas.height = p.height * window.devicePixelRatio;
      this.canvas.style.width = `${p.width}px`;
      this.canvas.style.height = `${p.height}px`;
      this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      if (this.scale === 1) this.center();
      this.draw();
    }

    center() {
      if (!this.ready || !this.canvas) return;
      const p = this.engine.currentProfile;
      const r = this.canvas.getBoundingClientRect();
      const sx = (r.width - 60) / p.width;
      const sy = (r.height - 60) / p.height;
      this.scale = Math.min(sx, sy);
      this.offsetX = (r.width - p.width * this.scale) / 2;
      this.offsetY = (r.height - p.height * this.scale) / 2;
    }

    draw() {
      if (!this.ready || !this.canvas || !this.ctx) return;
      const w = this.canvas.width / window.devicePixelRatio;
      const h = this.canvas.height / window.devicePixelRatio;
      this.ctx.clearRect(0, 0, w, h);
      this.ctx.fillStyle = '#121214';
      this.ctx.fillRect(0, 0, w, h);
      this.ctx.save();
      this.ctx.translate(this.offsetX, this.offsetY);
      this.ctx.scale(this.scale, this.scale);
      const prof = this.engine.currentProfile;
      this.ctx.fillStyle = SETTINGS.bgColor;
      this.ctx.shadowColor = 'rgba(0,0,0,0.5)';
      this.ctx.shadowBlur = 20;
      this.ctx.fillRect(0, 0, prof.width, prof.height);
      this.ctx.shadowBlur = 0;
      if (SETTINGS.gridOverlay) this.drawGridOverlay(prof);
      this.ctx.strokeStyle = '#333';
      this.ctx.lineWidth = 1 / this.scale;
      this.ctx.strokeRect(0, 0, prof.width, prof.height);

      this.ctx.lineJoin = 'round';

      const selectedLayer = this.getSelectedLayer();
      const selectedLayers = this.getSelectedLayers();
      const m = SETTINGS.margin;
      const innerW = prof.width - m * 2;
      const innerH = prof.height - m * 2;
      const previewMode = SETTINGS.optimizationPreview || 'off';
      const useOptimized = previewMode === 'replace';
      const showOptimizedOverlay = previewMode === 'overlay';
      const optimize = Math.max(0, SETTINGS.plotterOptimize ?? 0);
      const tol = optimize > 0 ? Math.max(0.001, optimize) : 0;
      const dedupe = optimize > 0 ? new Map() : null;
      const quant = (v) => (tol ? Math.round(v / tol) * tol : v);
      const pathKey = (path) => {
        if (path && path.meta && path.meta.kind === 'circle') {
          const cx = path.meta.cx ?? path.meta.x ?? 0;
          const cy = path.meta.cy ?? path.meta.y ?? 0;
          const r = path.meta.r ?? path.meta.rx ?? 0;
          return `c:${quant(cx)},${quant(cy)},${quant(r)}`;
        }
        if (!Array.isArray(path)) return '';
        return path
          .map((pt) => `${quant(pt.x)},${quant(pt.y)}`)
          .join('|');
      };
      const drawLayers = () => {
        this.engine.layers.forEach((l) => {
          if (!l.visible) return;
          const pen = SETTINGS.pens?.find((p) => p.id === l.penId) || null;
          const penId = l.penId || pen?.id || 'default';
          let seen = null;
          if (dedupe) {
            if (!dedupe.has(penId)) dedupe.set(penId, new Set());
            seen = dedupe.get(penId);
          }
          const strokeWidth = pen?.width ?? l.strokeWidth ?? SETTINGS.strokeWidth;
          this.ctx.lineWidth = strokeWidth;
          this.ctx.lineCap = l.lineCap || 'round';
          this.ctx.beginPath();
          this.ctx.strokeStyle = pen?.color || l.color;
          const useCurves = Boolean(l.params && l.params.curves);
          const paths = useOptimized && l.optimizedPaths ? l.optimizedPaths : l.paths;
          (paths || []).forEach((path) => {
            if (path && path.meta && path.meta.kind === 'circle') {
              const meta =
                this.selectedLayerIds?.has(l.id) && this.tempTransform
                  ? this.transformCircleMeta(path.meta, this.tempTransform)
                  : path.meta;
              if (seen) {
                const key = pathKey({ meta });
                if (key && seen.has(key)) return;
                if (key) seen.add(key);
              }
              this.traceCircle(meta);
            } else {
              const next =
                this.selectedLayerIds?.has(l.id) && this.tempTransform ? this.transformPath(path, this.tempTransform) : path;
              if (seen) {
                const key = pathKey(next);
                if (key && seen.has(key)) return;
                if (key) seen.add(key);
              }
              this.tracePath(next, useCurves);
            }
          });
          this.ctx.stroke();
        });
      };
      const drawOptimizedOverlay = () => {
        if (!showOptimizedOverlay) return;
        const overlayColor = SETTINGS.optimizationOverlayColor || '#38bdf8';
        const overlayWidth = Math.max(0.05, SETTINGS.optimizationOverlayWidth ?? 0.2);
        this.engine.layers.forEach((l) => {
          if (!l.visible || !l.optimizedPaths || !l.optimizedPaths.length) return;
          const useCurves = Boolean(l.params && l.params.curves);
          this.ctx.save();
          this.ctx.lineWidth = overlayWidth;
          this.ctx.lineCap = l.lineCap || 'round';
          this.ctx.lineJoin = 'round';
          this.ctx.strokeStyle = overlayColor;
          this.ctx.globalAlpha = 0.8;
          this.ctx.beginPath();
          l.optimizedPaths.forEach((path) => {
            if (path && path.meta && path.meta.kind === 'circle') {
              const meta =
                this.selectedLayerIds?.has(l.id) && this.tempTransform
                  ? this.transformCircleMeta(path.meta, this.tempTransform)
                  : path.meta;
              this.traceCircle(meta);
            } else {
              const next =
                this.selectedLayerIds?.has(l.id) && this.tempTransform ? this.transformPath(path, this.tempTransform) : path;
              this.tracePath(next, useCurves);
            }
          });
          this.ctx.stroke();
          this.ctx.restore();
        });
      };
      const drawHelperOverlays = () => {
        this.engine.layers.forEach((l) => {
          if (!l.visible || !l.params?.showPendulumGuides) return;
          if (!l.helperPaths || !l.helperPaths.length) return;
          const color = l.params.pendulumGuideColor || '#f59e0b';
          const width = l.params.pendulumGuideWidth ?? 0.25;
          const useCurves = Boolean(l.params && l.params.curves);
          l.helperPaths.forEach((path, index) => {
            if (!Array.isArray(path) || path.length < 2) return;
            const next =
              this.selectedLayerIds?.has(l.id) && this.tempTransform ? this.transformPath(path, this.tempTransform) : path;
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;
            next.forEach((pt) => {
              minX = Math.min(minX, pt.x);
              minY = Math.min(minY, pt.y);
              maxX = Math.max(maxX, pt.x);
              maxY = Math.max(maxY, pt.y);
            });
            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;

            this.ctx.save();
            this.ctx.lineWidth = width;
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            this.ctx.strokeStyle = color;
            this.ctx.globalAlpha = 0.65;
            this.ctx.beginPath();
            this.tracePath(next, useCurves);
            this.ctx.stroke();

            this.ctx.globalAlpha = 0.5;
            this.ctx.setLineDash([1.5, 1.5]);
            this.ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
            this.ctx.setLineDash([]);

            this.ctx.globalAlpha = 0.35;
            this.ctx.setLineDash([2, 2]);
            this.ctx.beginPath();
            this.ctx.moveTo(minX, centerY);
            this.ctx.lineTo(maxX, centerY);
            this.ctx.moveTo(centerX, minY);
            this.ctx.lineTo(centerX, maxY);
            this.ctx.stroke();
            this.ctx.setLineDash([]);

            this.ctx.globalAlpha = 0.7;
            this.ctx.fillStyle = color;
            const marker = 1.4;
            [
              [minX, centerY],
              [maxX, centerY],
              [centerX, minY],
              [centerX, maxY],
            ].forEach(([mx, my]) => {
              this.ctx.beginPath();
              this.ctx.arc(mx, my, marker, 0, Math.PI * 2);
              this.ctx.fill();
            });

            this.ctx.globalAlpha = 0.8;
            const cross = 2.5;
            this.ctx.beginPath();
            this.ctx.moveTo(centerX - cross, centerY);
            this.ctx.lineTo(centerX + cross, centerY);
            this.ctx.moveTo(centerX, centerY - cross);
            this.ctx.lineTo(centerX, centerY + cross);
            this.ctx.stroke();

            const start = next[0];
            const nextPt = next[1] || start;
            const dirX = nextPt.x - start.x;
            const dirY = nextPt.y - start.y;
            const mag = Math.hypot(dirX, dirY) || 1;
            const ux = dirX / mag;
            const uy = dirY / mag;
            const arrowLen = 6;
            this.ctx.beginPath();
            this.ctx.moveTo(start.x, start.y);
            this.ctx.lineTo(start.x + ux * arrowLen, start.y + uy * arrowLen);
            this.ctx.stroke();

            this.ctx.fillStyle = color;
            this.ctx.globalAlpha = 0.9;
            this.ctx.beginPath();
            this.ctx.arc(start.x, start.y, 1.2, 0, Math.PI * 2);
            this.ctx.fill();

            const label = `P${index + 1}`;
            this.ctx.font = '3px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
            this.ctx.textBaseline = 'middle';
            this.ctx.textAlign = 'left';
            this.ctx.fillText(label, start.x + 4, start.y - 4);

            this.ctx.restore();
          });
        });
      };
      const outlineEnabled = SETTINGS.selectionOutline !== false;
      const outlineColor = SETTINGS.selectionOutlineColor || '#ef4444';
      const drawSelectionOutline = () => {
        if (!outlineEnabled || !selectedLayers.length) return;
        selectedLayers.forEach((l) => {
          if (!l.visible) return;
          const isLineLayer = l.parentId || l.type === 'expanded';
          if (!isLineLayer) return;
          const pen = SETTINGS.pens?.find((p) => p.id === l.penId) || null;
          const strokeWidth = pen?.width ?? l.strokeWidth ?? SETTINGS.strokeWidth;
          const useCurves = Boolean(l.params && l.params.curves);
          const outlineWidth = SETTINGS.selectionOutlineWidth ?? 0.4;
          this.ctx.lineWidth = Math.max(0.1, strokeWidth + outlineWidth);
          this.ctx.lineCap = l.lineCap || 'round';
          this.ctx.strokeStyle = outlineColor;
          this.ctx.beginPath();
          l.paths.forEach((path) => {
            if (path && path.meta && path.meta.kind === 'circle') {
              const meta =
                this.selectedLayerIds?.has(l.id) && this.tempTransform
                  ? this.transformCircleMeta(path.meta, this.tempTransform)
                  : path.meta;
              this.traceCircle(meta);
            } else {
              const next =
                this.selectedLayerIds?.has(l.id) && this.tempTransform ? this.transformPath(path, this.tempTransform) : path;
              this.tracePath(next, useCurves);
            }
          });
          this.ctx.stroke();
        });
      };

      if (SETTINGS.truncate) {
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(m, m, innerW, innerH);
        this.ctx.clip();
        drawSelectionOutline();
      drawLayers();
      drawOptimizedOverlay();
        drawHelperOverlays();
        this.ctx.restore();
      } else {
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(m, m, innerW, innerH);
        this.ctx.clip();
        drawSelectionOutline();
        drawLayers();
        drawHelperOverlays();
        this.ctx.restore();

        const outsideAlpha = SETTINGS.outsideOpacity ?? 0.5;
        if (outsideAlpha > 0) {
          this.ctx.save();
          this.ctx.globalAlpha = outsideAlpha;
          this.ctx.beginPath();
          this.ctx.rect(0, 0, prof.width, prof.height);
          this.ctx.rect(m, m, innerW, innerH);
          this.ctx.clip('evenodd');
          drawLayers();
          this.ctx.restore();
        }
      }

      if (SETTINGS.marginLineVisible) {
        this.ctx.save();
        this.ctx.strokeStyle = SETTINGS.marginLineColor || '#52525b';
        this.ctx.lineWidth = SETTINGS.marginLineWeight ?? 0.2;
        const dotting = SETTINGS.marginLineDotting ?? 0;
        if (dotting > 0) this.ctx.setLineDash([dotting, dotting]);
        this.ctx.strokeRect(m, m, innerW, innerH);
        this.ctx.setLineDash([]);
        this.ctx.restore();
      }

      if (SETTINGS.showGuides && this.guides) this.drawGuides(this.guides);
      if (selectedLayers.length) {
        const bounds = this.getSelectionBounds(selectedLayers, this.tempTransform);
        const showHandles = selectedLayers.length === 1;
        if (bounds) this.drawSelection(bounds, { showHandles });
      }
      if (this.selectionRect) this.drawSelectionRect(this.selectionRect);
      if (this.lassoPath) this.drawSelectionPath(this.lassoPath);
      if (this.directSelection) this.drawDirectSelection();
      if (this.penDraft) this.drawPenPreview();
      if (this.isScissor && this.scissorStart && this.scissorEnd) this.drawScissorPreview();
      if (this.lightSource) this.drawLightSource();
      this.ctx.restore();
    }

    drawGridOverlay(profile) {
      if (!profile) return;
      const spacing = 10;
      this.ctx.save();
      this.ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      this.ctx.lineWidth = 0.15;
      this.ctx.beginPath();
      for (let x = 0; x <= profile.width; x += spacing) {
        this.ctx.moveTo(x, 0);
        this.ctx.lineTo(x, profile.height);
      }
      for (let y = 0; y <= profile.height; y += spacing) {
        this.ctx.moveTo(0, y);
        this.ctx.lineTo(profile.width, y);
      }
      this.ctx.stroke();
      this.ctx.restore();
    }

    wheel(e) {
      if (!this.ready) return;
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const wx = (mx - this.offsetX) / this.scale;
      const wy = (my - this.offsetY) / this.scale;
      const zoom = e.deltaY > 0 ? 0.9 : 1.1;
      const nextScale = Math.max(0.1, Math.min(this.scale * zoom, 20));
      this.offsetX = mx - wx * nextScale;
      this.offsetY = my - wy * nextScale;
      this.scale = nextScale;
      this.draw();
    }

    down(e) {
      if (!this.ready) return;
      if (this.isTouchPointer(e)) {
        this.updateTouchPointer(e);
        if (this.touchPointers.size >= 2) {
          if (!this.touchGesture && this.canStartTouchGesture()) this.startTouchGesture();
          if (this.touchGesture) {
            if (e.cancelable) e.preventDefault();
            return;
          }
        }
      }

      if (this.touchGesture) return;
      if (this.activePointerId !== null && e.pointerId !== undefined && e.pointerId !== this.activePointerId && e.pointerType !== 'mouse') {
        return;
      }
      if (e.pointerId !== undefined) {
        this.activePointerId = e.pointerId;
        if (this.canvas.setPointerCapture) {
          try {
            this.canvas.setPointerCapture(e.pointerId);
          } catch (err) {
            // Ignore pointer capture issues on unsupported combinations.
          }
        }
      }

      const modifiers = this.getModifierState(e);
      if (this.wantsPan(e, modifiers)) {
        this.isPan = true;
        this.lastM = { x: e.clientX, y: e.clientY };
        this.canvas.style.cursor = 'grabbing';
        if (e.cancelable) e.preventDefault();
        return;
      }

      const rect = this.canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const world = this.screenToWorld(sx, sy);
      if (e.button !== undefined && e.button !== 0) return;

      if (this.lightSourcePlacement) {
        this.setLightSource(world);
        this.lightSourcePlacement = false;
        return;
      }

      if (this.hitLightSource(world)) {
        this.lightSourceSelected = true;
        this.isLightDrag = true;
        this.lightDragOffset = { x: world.x - this.lightSource.x, y: world.y - this.lightSource.y };
        this.clearSelection();
        this.canvas.style.cursor = 'grabbing';
        return;
      }

      this.lightSourceSelected = false;

      const penSelectOverride = this.activeTool === 'pen' && modifiers.meta;
      const allowSelection = this.activeTool !== 'pen' || penSelectOverride;

      if (this.activeTool === 'pen' && !penSelectOverride) {
        if (this.penMode === 'draw') {
          this.handlePenDown(world, e);
          return;
        }
        let handled = false;
        if (this.penMode === 'add') handled = this.insertAnchorFromWorld(world);
        if (this.penMode === 'delete') handled = this.removeAnchorFromWorld(world);
        if (this.penMode === 'anchor') handled = this.toggleAnchorFromWorld(world);
        if (!handled) {
          const hit = this.findPathHitAtPoint(world);
          if (hit) {
            if (!this.selectedLayerIds.has(hit.layer.id)) this.selectLayer(hit.layer);
            this.setDirectSelection(hit.layer, hit.pathIndex);
            this.draw();
          }
        }
        return;
      }
      if (this.activeTool === 'scissor') {
        this.isScissor = true;
        this.scissorStart = world;
        this.scissorEnd = world;
        this.draw();
        return;
      }

      if (allowSelection) {
        if (this.activeTool === 'direct') {
          const directControl = this.hitDirectControl(world);
          if (directControl) {
            this.startDirectDrag(directControl);
            return;
          }
          const hit = this.findPathHitAtPoint(world);
          if (hit) {
            if (!this.selectedLayerIds.has(hit.layer.id)) this.selectLayer(hit.layer);
            const selection = this.setDirectSelection(hit.layer, hit.pathIndex);
            if (selection && selection.anchors.length) {
              const seg = Math.max(0, Math.min((hit.segmentIndex ?? 0), selection.anchors.length - 1));
              let idx = seg;
              if (Array.isArray(hit.path) && hit.path[seg + 1]) {
                const a = hit.path[seg];
                const b = hit.path[seg + 1];
                const da = Math.hypot(world.x - a.x, world.y - a.y);
                const db = Math.hypot(world.x - b.x, world.y - b.y);
                idx = db < da ? Math.min(selection.anchors.length - 1, seg + 1) : seg;
              }
              this.startDirectDrag({ type: 'anchor', index: idx });
            }
            this.draw();
            return;
          }
        }
        if (this.activeTool === 'select' && this.selectionMode === 'pen') {
          this.penPurpose = 'select';
          this.handlePenDown(world, e);
          return;
        }
        if (this.activeTool === 'select' && this.selectionMode === 'lasso') {
          this.isLassoSelecting = true;
          this.lassoPath = [world];
          this.clearSelection();
          this.draw();
          return;
        }
        const activeLayer = this.engine.getActiveLayer ? this.engine.getActiveLayer() : null;
        if (!activeLayer) return;
        const selectedLayers = this.getSelectedLayers();
        const selectionBounds = this.getSelectionBounds(selectedLayers);
        if (selectionBounds) {
          const handle = this.hitHandle(sx, sy, selectionBounds);
          if (handle) {
            this.isLayerDrag = true;
            this.snapAllowed = true;
            this.activeHandle = handle;
            this.dragStart = world;
            this.startBounds = selectionBounds;
            if (handle === 'rotate') {
              this.dragMode = 'rotate';
              this.rotateOrigin = this.getBoundsCenter(selectionBounds);
              this.rotateStart = this.selectedLayerId ? this.getSelectedLayer()?.params.rotation ?? 0 : 0;
              this.rotateStartAngle = Math.atan2(world.y - this.rotateOrigin.y, world.x - this.rotateOrigin.x);
              this.tempTransform = { dx: 0, dy: 0, scaleX: 1, scaleY: 1, origin: this.rotateOrigin, rotation: 0 };
              this.canvas.style.cursor = 'grabbing';
            } else {
              this.dragMode = 'resize';
              this.canvas.style.cursor = this.handleCursor(handle);
            }
            e.preventDefault();
            return;
          }
        }

        const topLayer =
          this.activeTool === 'direct' ? this.findLayerAtPointPrecise(world) : this.findLayerAtPoint(world);
        if (topLayer && !this.selectedLayerIds.has(topLayer.id)) {
          this.selectLayer(topLayer);
        }
        const updatedSelected = this.getSelectedLayers();
        const bounds = this.getSelectionBounds(updatedSelected);
        if (bounds && this.pointInBounds(world, bounds)) {
          this.isLayerDrag = true;
          this.snapAllowed = true;
          this.dragMode = 'move';
          this.dragStart = world;
          this.startBounds = bounds;
          this.canvas.style.cursor = updatedSelected.length > 1 ? 'grabbing' : 'move';
          if (modifiers.alt && updatedSelected.length === 1) {
            if (this.onDuplicateLayer) this.onDuplicateLayer();
            const dup = this.engine.duplicateLayer ? this.engine.duplicateLayer(updatedSelected[0].id) : null;
            if (dup) {
              this.selectLayer(dup);
              this.dragStart = world;
              this.startBounds = this.getSelectionBounds([dup]) || bounds;
            }
          }
          e.preventDefault();
        } else if (topLayer) {
          // no-op
        } else {
          this.isSelecting = true;
          this.selectionStart = world;
          this.selectionRect = { x: world.x, y: world.y, w: 0, h: 0 };
          this.clearSelection();
        }
      }
    }

    move(e) {
      if (!this.ready) return;
      if (this.isTouchPointer(e)) this.updateTouchPointer(e);
      if (this.touchGesture) {
        if (this.touchPointers.size >= 2) {
          this.updateTouchGesture();
          if (e.cancelable) e.preventDefault();
        }
        return;
      }
      if (this.activePointerId !== null && e.pointerId !== undefined && e.pointerId !== this.activePointerId && e.pointerType !== 'mouse') {
        return;
      }
      const modifiers = this.getModifierState(e);
      if (this.isPan) {
        this.offsetX += e.clientX - this.lastM.x;
        this.offsetY += e.clientY - this.lastM.y;
        this.lastM = { x: e.clientX, y: e.clientY };
        this.draw();
        return;
      }

      if (this.isLightDrag && this.lightSource) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = this.screenToWorld(sx, sy);
        this.lightSource = {
          x: world.x - this.lightDragOffset.x,
          y: world.y - this.lightDragOffset.y,
        };
        SETTINGS.lightSource = { ...this.lightSource };
        this.draw();
        return;
      }

      if (this.directDrag) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = this.screenToWorld(sx, sy);
        this.updateDirectDrag(world, e);
        return;
      }

      if (this.isLayerDrag) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = this.screenToWorld(sx, sy);
        if (this.dragMode === 'move') {
          const dx = world.x - this.dragStart.x;
          const dy = world.y - this.dragStart.y;
          this.tempTransform = { dx, dy, scaleX: 1, scaleY: 1, origin: { x: 0, y: 0 } };
        } else if (this.dragMode === 'resize' && this.startBounds && this.activeHandle) {
          const fromCenter = modifiers.alt || modifiers.meta;
          const origin = fromCenter ? this.getBoundsCenter(this.startBounds) : this.getResizeAnchor(this.activeHandle, this.startBounds);
          const handlePoint = this.getHandlePoint(this.activeHandle, this.startBounds);
          const startVec = { x: handlePoint.x - origin.x, y: handlePoint.y - origin.y };
          const currVec = { x: world.x - origin.x, y: world.y - origin.y };
          const rot = -(this.startBounds.rotation || 0);
          const cosR = Math.cos(rot);
          const sinR = Math.sin(rot);
          const startVecLocal = { x: startVec.x * cosR - startVec.y * sinR, y: startVec.x * sinR + startVec.y * cosR };
          const currVecLocal = { x: currVec.x * cosR - currVec.y * sinR, y: currVec.x * sinR + currVec.y * cosR };
          const safeX = Math.abs(startVecLocal.x) < 0.001 ? 0.001 : startVecLocal.x;
          const safeY = Math.abs(startVecLocal.y) < 0.001 ? 0.001 : startVecLocal.y;
          let scaleX = currVecLocal.x / safeX;
          let scaleY = currVecLocal.y / safeY;
          if (modifiers.shift) {
            const uni = Math.abs(scaleX) > Math.abs(scaleY) ? scaleX : scaleY;
            scaleX = uni;
            scaleY = uni;
          }
          scaleX = Math.max(0.05, Math.min(Math.abs(scaleX), 20));
          scaleY = Math.max(0.05, Math.min(Math.abs(scaleY), 20));
          this.tempTransform = { dx: 0, dy: 0, scaleX, scaleY, origin };
        } else if (this.dragMode === 'rotate' && this.rotateOrigin) {
          const angle = Math.atan2(world.y - this.rotateOrigin.y, world.x - this.rotateOrigin.x);
          let delta = ((angle - this.rotateStartAngle) * 180) / Math.PI;
          if (modifiers.shift) {
            const snap = 15;
            delta = Math.round(delta / snap) * snap;
          }
          this.tempTransform = { dx: 0, dy: 0, scaleX: 1, scaleY: 1, origin: this.rotateOrigin, rotation: delta };
        }
        const activeLayers = this.getSelectedLayers();
        const bounds = activeLayers.length ? this.getSelectionBounds(activeLayers, this.tempTransform) : null;
        const needsGuides = SETTINGS.showGuides || SETTINGS.snapGuides;
        this.snapAllowed = !modifiers.meta;
        this.guides = needsGuides && bounds ? this.computeGuides(activeLayers, bounds) : null;
        this.snap = SETTINGS.snapGuides && bounds ? this.computeSnap(activeLayers, bounds) : null;
        this.draw();
        return;
      }

      if (this.activeTool === 'pen' && this.penDraft) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const next = this.screenToWorld(sx, sy);
        const anchors = this.penDraft.anchors || [];
        if (this.isPenDragging && this.penDragAnchor !== null) {
          const anchor = anchors[this.penDragAnchor];
          if (anchor) {
            const target = modifiers.shift ? this.snapPenAngle(anchor, next) : next;
            const dist = Math.hypot(target.x - anchor.x, target.y - anchor.y);
            const minDist = 2 / this.scale;
            if (dist <= minDist) {
              anchor.in = null;
              anchor.out = null;
            } else {
              this.setAnchorHandles(anchor, target, { breakHandle: modifiers.alt });
            }
            this.penPreview = target;
          }
        } else {
          const last = anchors[anchors.length - 1];
          this.penPreview = modifiers.shift && last ? this.snapPenAngle(last, next) : next;
        }
        this.draw();
        return;
      }

      if (this.activeTool === 'scissor' && this.isScissor) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const next = this.screenToWorld(sx, sy);
        this.scissorEnd =
          this.scissorMode === 'line' && modifiers.shift && this.scissorStart
            ? this.snapScissorAngle(this.scissorStart, next, 15)
            : next;
        this.draw();
        return;
      }

      if (this.isLassoSelecting && this.lassoPath) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = this.screenToWorld(sx, sy);
        const last = this.lassoPath[this.lassoPath.length - 1];
        const minDist = 2 / this.scale;
        if (!last || Math.hypot(world.x - last.x, world.y - last.y) >= minDist) {
          this.lassoPath.push(world);
        }
        this.draw();
        return;
      }

      if (this.isSelecting && this.selectionStart) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = this.screenToWorld(sx, sy);
        const dx = world.x - this.selectionStart.x;
        const dy = world.y - this.selectionStart.y;
        let w = Math.abs(dx);
        let h = Math.abs(dy);
        let x = Math.min(this.selectionStart.x, world.x);
        let y = Math.min(this.selectionStart.y, world.y);
        if (modifiers.meta) {
          const size = Math.max(w, h);
          w = size;
          h = size;
          x = this.selectionStart.x + (dx < 0 ? -size : 0);
          y = this.selectionStart.y + (dy < 0 ? -size : 0);
        }
        this.selectionRect = { x, y, w, h };
        this.draw();
        return;
      }

      if (!this.isTouchPointer(e)) this.updateHoverCursor(e);
    }

    up(e = {}) {
      if (!this.ready || !this.canvas) return;
      this.removeTouchPointer(e);
      const clearActivePointer = () => {
        if (e.pointerId !== undefined && this.canvas.releasePointerCapture) {
          try {
            if (this.canvas.hasPointerCapture && this.canvas.hasPointerCapture(e.pointerId)) {
              this.canvas.releasePointerCapture(e.pointerId);
            }
          } catch (err) {
            // Ignore pointer capture release issues.
          }
        }
        this.activePointerId = null;
      };
      if (this.touchGesture) {
        if (this.touchPointers.size >= 2) {
          this.updateTouchGesture();
          return;
        }
        this.stopTouchGesture();
        if (this.touchPointers.size > 0) {
          clearActivePointer();
          return;
        }
      }
      if (this.activePointerId !== null && e.pointerId !== undefined && e.pointerId !== this.activePointerId && e.pointerType !== 'mouse') {
        return;
      }
      if (this.isLightDrag) {
        this.isLightDrag = false;
        this.canvas.style.cursor = 'crosshair';
      }
      if (this.isPenDragging) {
        this.isPenDragging = false;
        this.penDragAnchor = null;
        this.penDragStart = null;
      }
      if (this.directDrag) {
        this.endDirectDrag();
        clearActivePointer();
        return;
      }
      if (this.isScissor) {
        const start = this.scissorStart;
        const end = this.scissorEnd;
        if (start && end && this.onScissor) {
          if (this.scissorMode === 'rect') {
            const x = Math.min(start.x, end.x);
            const y = Math.min(start.y, end.y);
            const w = Math.abs(end.x - start.x);
            const h = Math.abs(end.y - start.y);
            this.onScissor({ mode: 'rect', rect: { x, y, w, h }, start, end });
          } else if (this.scissorMode === 'circle') {
            const r = Math.hypot(end.x - start.x, end.y - start.y);
            this.onScissor({ mode: 'circle', circle: { x: start.x, y: start.y, r }, start, end });
          } else {
            this.onScissor({ mode: 'line', line: { a: start, b: end }, start, end });
          }
        }
        this.isScissor = false;
        this.scissorStart = null;
        this.scissorEnd = null;
        this.draw();
        clearActivePointer();
        return;
      }
      if (this.isLassoSelecting) {
        if (this.lassoPath && this.lassoPath.length > 2) {
          this.selectLayersByPolygon(this.lassoPath);
        }
        this.isLassoSelecting = false;
        this.lassoPath = null;
        this.draw();
        clearActivePointer();
        return;
      }
      if (this.isLayerDrag) {
        const selectedLayers = this.getSelectedLayers();
        if (selectedLayers.length && this.tempTransform) {
          if (this.onCommitTransform) this.onCommitTransform();
          if (this.dragMode === 'move') {
            const snapDx = this.snapAllowed && this.snap ? this.snap.dx || 0 : 0;
            const snapDy = this.snapAllowed && this.snap ? this.snap.dy || 0 : 0;
            selectedLayers.forEach((layer) => {
              layer.params.posX += this.tempTransform.dx + snapDx;
              layer.params.posY += this.tempTransform.dy + snapDy;
              this.engine.generate(layer.id);
            });
          } else if (this.dragMode === 'resize' && selectedLayers.length === 1) {
            const activeLayer = selectedLayers[0];
            let scaleX = this.tempTransform.scaleX;
            let scaleY = this.tempTransform.scaleY;
            if (this.snapAllowed && this.snap) {
              if (this.snap.scaleX) scaleX *= this.snap.scaleX;
              if (this.snap.scaleY) scaleY *= this.snap.scaleY;
            }
            const prof = this.engine.currentProfile;
            const originLocal = activeLayer.origin || { x: prof.width / 2, y: prof.height / 2 };
            const baseOrigin = {
              x: originLocal.x + (activeLayer.params.posX ?? 0),
              y: originLocal.y + (activeLayer.params.posY ?? 0),
            };
            const resizeOrigin = this.tempTransform.origin || baseOrigin;
            activeLayer.params.scaleX *= scaleX;
            activeLayer.params.scaleY *= scaleY;
            activeLayer.params.posX =
              (baseOrigin.x - resizeOrigin.x) * scaleX + resizeOrigin.x - originLocal.x;
            activeLayer.params.posY =
              (baseOrigin.y - resizeOrigin.y) * scaleY + resizeOrigin.y - originLocal.y;
            this.engine.generate(activeLayer.id);
          } else if (this.dragMode === 'rotate') {
            const delta = this.tempTransform.rotation ?? 0;
            const origin = this.rotateOrigin || (this.startBounds ? this.startBounds.origin : null);
            selectedLayers.forEach((layer) => {
              const baseOrigin = {
                x: (layer.origin?.x ?? 0) + (layer.params.posX ?? 0),
                y: (layer.origin?.y ?? 0) + (layer.params.posY ?? 0),
              };
              if (origin) {
                const rot = (delta * Math.PI) / 180;
                const cosR = Math.cos(rot);
                const sinR = Math.sin(rot);
                const dx = baseOrigin.x - origin.x;
                const dy = baseOrigin.y - origin.y;
                const rx = dx * cosR - dy * sinR;
                const ry = dx * sinR + dy * cosR;
                layer.params.posX = origin.x + rx - (layer.origin?.x ?? 0);
                layer.params.posY = origin.y + ry - (layer.origin?.y ?? 0);
              }
              layer.params.rotation = (layer.params.rotation ?? 0) + delta;
              this.engine.generate(layer.id);
            });
          }
          const primary = this.getSelectedLayer();
          if (primary) this.updateTransformInputs(primary);
        }
        this.tempTransform = null;
        this.rotateOrigin = null;
        this.snap = null;
      }
      this.isPan = false;
      this.isLayerDrag = false;
      this.dragMode = null;
      this.activeHandle = null;
      this.updateCursor();
      this.guides = null;
      if (this.isSelecting) {
        const rect = this.selectionRect;
        if (rect) {
          const selected =
            this.selectionMode === 'oval'
              ? this.engine.layers.filter((layer) => this.layerIntersectsPoly(layer, this.ellipseToPoly(rect)))
              : this.engine.layers.filter((layer) => this.layerIntersectsRect(layer, rect));
          if (selected.length) {
            this.setSelection(
              selected.map((layer) => layer.id),
              selected[selected.length - 1].id
            );
          }
        }
        this.isSelecting = false;
        this.selectionStart = null;
        this.selectionRect = null;
      }
      this.draw();
      clearActivePointer();
    }

    computeGuides(activeLayers, bounds) {
      const prof = this.engine.currentProfile;
      const guides = { center: [], size: [] };
      const centerX = prof.width / 2;
      const centerY = prof.height / 2;
      const tol = 2;

      if (Math.abs(bounds.center.x - centerX) <= tol) {
        guides.center.push({ x1: centerX, y1: 0, x2: centerX, y2: prof.height });
      }
      if (Math.abs(bounds.center.y - centerY) <= tol) {
        guides.center.push({ x1: 0, y1: centerY, x2: prof.width, y2: centerY });
      }

      const targetW = bounds.maxX - bounds.minX;
      const targetH = bounds.maxY - bounds.minY;
      let widthMatch = false;
      let heightMatch = false;
      const activeIds = new Set(activeLayers.map((layer) => layer.id));
      this.engine.layers.forEach((layer) => {
        if (activeIds.has(layer.id) || !layer.visible) return;
        const otherBounds = this.getLayerBounds(layer);
        if (!otherBounds) return;
        const w = otherBounds.maxX - otherBounds.minX;
        const h = otherBounds.maxY - otherBounds.minY;
        if (Math.abs(w - targetW) <= tol) widthMatch = true;
        if (Math.abs(h - targetH) <= tol) heightMatch = true;
      });

      if (widthMatch) {
        guides.size.push({ x1: bounds.corners.nw.x, y1: bounds.corners.nw.y, x2: bounds.corners.sw.x, y2: bounds.corners.sw.y });
        guides.size.push({ x1: bounds.corners.ne.x, y1: bounds.corners.ne.y, x2: bounds.corners.se.x, y2: bounds.corners.se.y });
      }
      if (heightMatch) {
        guides.size.push({ x1: bounds.corners.nw.x, y1: bounds.corners.nw.y, x2: bounds.corners.ne.x, y2: bounds.corners.ne.y });
        guides.size.push({ x1: bounds.corners.sw.x, y1: bounds.corners.sw.y, x2: bounds.corners.se.x, y2: bounds.corners.se.y });
      }

      return guides.center.length || guides.size.length ? guides : null;
    }

    computeSnap(activeLayers, bounds) {
      const prof = this.engine.currentProfile;
      const centerX = prof.width / 2;
      const centerY = prof.height / 2;
      const tol = 2;
      const snap = { dx: 0, dy: 0, scaleX: 0, scaleY: 0 };

      if (Math.abs(bounds.center.x - centerX) <= tol) {
        snap.dx = centerX - bounds.center.x;
      }
      if (Math.abs(bounds.center.y - centerY) <= tol) {
        snap.dy = centerY - bounds.center.y;
      }

      const targetW = bounds.maxX - bounds.minX;
      const targetH = bounds.maxY - bounds.minY;
      let bestWidth = null;
      let bestHeight = null;
      let bestWDiff = Infinity;
      let bestHDiff = Infinity;
      const activeIds = new Set(activeLayers.map((layer) => layer.id));
      this.engine.layers.forEach((layer) => {
        if (activeIds.has(layer.id) || !layer.visible) return;
        const otherBounds = this.getLayerBounds(layer);
        if (!otherBounds) return;
        const w = otherBounds.maxX - otherBounds.minX;
        const h = otherBounds.maxY - otherBounds.minY;
        const wDiff = Math.abs(w - targetW);
        const hDiff = Math.abs(h - targetH);
        if (wDiff <= tol && wDiff < bestWDiff) {
          bestWDiff = wDiff;
          bestWidth = w;
        }
        if (hDiff <= tol && hDiff < bestHDiff) {
          bestHDiff = hDiff;
          bestHeight = h;
        }
      });
      if (bestWidth && targetW > 0) snap.scaleX = bestWidth / targetW;
      if (bestHeight && targetH > 0) snap.scaleY = bestHeight / targetH;

      return snap;
    }

    drawGuides(guides) {
      if (!guides) return;
      this.ctx.save();
      this.ctx.lineWidth = 1 / this.scale;
      this.ctx.setLineDash([6 / this.scale, 4 / this.scale]);
      this.ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
      guides.center.forEach((line) => {
        this.ctx.beginPath();
        this.ctx.moveTo(line.x1, line.y1);
        this.ctx.lineTo(line.x2, line.y2);
        this.ctx.stroke();
      });
      this.ctx.setLineDash([]);
      this.ctx.strokeStyle = 'rgba(250, 204, 21, 0.7)';
      guides.size.forEach((line) => {
        this.ctx.beginPath();
        this.ctx.moveTo(line.x1, line.y1);
        this.ctx.lineTo(line.x2, line.y2);
        this.ctx.stroke();
      });
      this.ctx.restore();
    }

    tracePath(path, useCurves) {
      if (!path || path.length < 2) return;
      this.ctx.moveTo(path[0].x, path[0].y);
      if (!useCurves || path.length < 3) {
        for (let i = 1; i < path.length; i++) this.ctx.lineTo(path[i].x, path[i].y);
        return;
      }
      for (let i = 1; i < path.length - 1; i++) {
        const midX = (path[i].x + path[i + 1].x) / 2;
        const midY = (path[i].y + path[i + 1].y) / 2;
        this.ctx.quadraticCurveTo(path[i].x, path[i].y, midX, midY);
      }
      const last = path[path.length - 1];
      this.ctx.lineTo(last.x, last.y);
    }

    traceCircle(meta) {
      if (!meta) return;
      const cx = meta.cx ?? meta.x;
      const cy = meta.cy ?? meta.y;
      const rx = meta.rx ?? meta.r;
      const ry = meta.ry ?? meta.r;
      const rotation = meta.rotation ?? 0;
      if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(rx) || !Number.isFinite(ry)) return;
      if (rx <= 0 || ry <= 0) return;
      this.ctx.moveTo(cx + rx, cy);
      if (Math.abs(rx - ry) < 0.001) {
        this.ctx.arc(cx, cy, rx, 0, Math.PI * 2);
        return;
      }
      this.ctx.ellipse(cx, cy, rx, ry, rotation, 0, Math.PI * 2);
    }

    getSelectedLayer() {
      return this.engine.layers.find((l) => l.id === this.selectedLayerId) || null;
    }

    getSelectedLayers() {
      return this.engine.layers.filter((l) => this.selectedLayerIds.has(l.id));
    }

    selectLayer(layer, options = {}) {
      if (!layer) return;
      const { additive = false, toggle = false } = options;
      if (!additive && !toggle) {
        this.selectedLayerIds.clear();
      }
      if (toggle) {
        if (this.selectedLayerIds.has(layer.id)) {
          this.selectedLayerIds.delete(layer.id);
        } else {
          this.selectedLayerIds.add(layer.id);
        }
      } else {
        this.selectedLayerIds.add(layer.id);
      }
      if (this.selectedLayerIds.size === 0) {
        this.selectedLayerId = null;
        if (this.onSelectLayer) this.onSelectLayer(null);
      } else {
        this.selectedLayerId = this.selectedLayerIds.has(layer.id)
          ? layer.id
          : this.selectedLayerIds.values().next().value;
        if (this.onSelectLayer) this.onSelectLayer(this.getSelectedLayer());
      }
      if (this.directSelection && this.directSelection.layerId !== this.selectedLayerId) {
        this.directSelection = null;
        this.directDrag = null;
      }
      this.draw();
    }

    setSelection(ids, primaryId) {
      this.selectedLayerIds = new Set(ids || []);
      if (primaryId && this.selectedLayerIds.has(primaryId)) {
        this.selectedLayerId = primaryId;
      } else {
        this.selectedLayerId = this.selectedLayerIds.values().next().value || null;
      }
      if (this.directSelection && this.directSelection.layerId !== this.selectedLayerId) {
        this.directSelection = null;
        this.directDrag = null;
      }
      if (this.onSelectLayer) {
        const layer = this.getSelectedLayer();
        this.onSelectLayer(layer || null);
      }
      this.draw();
    }

    clearSelection() {
      this.selectedLayerIds.clear();
      this.selectedLayerId = null;
      this.directSelection = null;
      this.directDrag = null;
      if (this.onSelectLayer) this.onSelectLayer(null);
      this.draw();
    }

    findLayerAtPoint(world) {
      const layers = this.engine.layers.slice().reverse();
      return (
        layers.find((layer) => {
          if (!layer.visible) return false;
          const bounds = this.getLayerBounds(layer);
          return bounds ? this.pointInBounds(world, bounds) : false;
        }) || null
      );
    }

    distanceToSegmentSq(p, a, b) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (dx === 0 && dy === 0) {
        const px = p.x - a.x;
        const py = p.y - a.y;
        return px * px + py * py;
      }
      const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
      const clamped = Math.max(0, Math.min(1, t));
      const cx = a.x + clamped * dx;
      const cy = a.y + clamped * dy;
      const ox = p.x - cx;
      const oy = p.y - cy;
      return ox * ox + oy * oy;
    }

    findLayerAtPointPrecise(world) {
      const layers = this.engine.layers.slice().reverse();
      let best = null;
      let bestDist = Infinity;
      layers.forEach((layer) => {
        if (!layer.visible) return;
        const stroke = layer.strokeWidth ?? SETTINGS.strokeWidth ?? 0.3;
        const tol = Math.max(1.5, stroke * 2);
        const tolSq = tol * tol;
        (layer.paths || []).forEach((path) => {
          if (path && path.meta && path.meta.kind === 'circle') {
            const cx = path.meta.cx ?? path.meta.x ?? 0;
            const cy = path.meta.cy ?? path.meta.y ?? 0;
            const r = path.meta.r ?? path.meta.rx ?? 0;
            const dist = Math.abs(Math.hypot(world.x - cx, world.y - cy) - r);
            if (dist * dist <= tolSq && dist < bestDist) {
              bestDist = dist;
              best = layer;
            }
            return;
          }
          if (!Array.isArray(path) || path.length < 2) return;
          for (let i = 0; i < path.length - 1; i++) {
            const d = this.distanceToSegmentSq(world, path[i], path[i + 1]);
            if (d <= tolSq && d < bestDist) {
              bestDist = d;
              best = layer;
              break;
            }
          }
        });
      });
      return best;
    }

    getSelectionBounds(layers, temp) {
      if (!layers || layers.length === 0) return null;
      if (layers.length === 1) {
        return this.getLayerBounds(layers[0], temp);
      }
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      layers.forEach((layer) => {
        const bounds = this.getLayerBounds(layer);
        if (!bounds) return;
        const corners = Object.values(bounds.corners);
        corners.forEach((pt) => {
          const next = temp ? this.transformPoint(pt, temp) : pt;
          minX = Math.min(minX, next.x);
          minY = Math.min(minY, next.y);
          maxX = Math.max(maxX, next.x);
          maxY = Math.max(maxY, next.y);
        });
      });
      if (!Number.isFinite(minX)) return null;
      const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
      const localMinX = minX - center.x;
      const localMinY = minY - center.y;
      const localMaxX = maxX - center.x;
      const localMaxY = maxY - center.y;
      const toWorld = (local) => ({ x: center.x + local.x, y: center.y + local.y });
      return {
        minX: localMinX,
        minY: localMinY,
        maxX: localMaxX,
        maxY: localMaxY,
        rotation: 0,
        origin: center,
        center,
        corners: {
          nw: toWorld({ x: localMinX, y: localMinY }),
          ne: toWorld({ x: localMaxX, y: localMinY }),
          se: toWorld({ x: localMaxX, y: localMaxY }),
          sw: toWorld({ x: localMinX, y: localMaxY }),
        },
      };
    }

    screenToWorld(x, y) {
      return { x: (x - this.offsetX) / this.scale, y: (y - this.offsetY) / this.scale };
    }

    worldToScreen(x, y) {
      return { x: x * this.scale + this.offsetX, y: y * this.scale + this.offsetY };
    }

    transformPoint(pt, temp) {
      if (!temp) return pt;
      const origin = temp.origin || { x: 0, y: 0 };
      let x = (pt.x - origin.x) * temp.scaleX;
      let y = (pt.y - origin.y) * temp.scaleY;
      if (temp.rotation) {
        const rot = (temp.rotation * Math.PI) / 180;
        const cosR = Math.cos(rot);
        const sinR = Math.sin(rot);
        const rx = x * cosR - y * sinR;
        const ry = x * sinR + y * cosR;
        x = rx;
        y = ry;
      }
      return { x: x + origin.x + temp.dx, y: y + origin.y + temp.dy };
    }

    transformPath(path, temp) {
      if (!path) return path;
      return path.map((pt) => this.transformPoint(pt, temp));
    }

    transformCircleMeta(meta, temp) {
      if (!temp || !meta) return meta;
      const center = this.transformPoint({ x: meta.cx ?? meta.x, y: meta.cy ?? meta.y }, temp);
      const baseR = Number.isFinite(meta.r) ? meta.r : Math.max(meta.rx ?? 0, meta.ry ?? 0);
      const rx = Math.abs(baseR * temp.scaleX);
      const ry = Math.abs(baseR * temp.scaleY);
      const rot = ((temp.rotation ?? 0) * Math.PI) / 180;
      return { ...meta, cx: center.x, cy: center.y, rx, ry, rotation: (meta.rotation ?? 0) + rot };
    }

    getLayerBounds(layer, temp) {
      if (!layer || !Array.isArray(layer.paths)) return null;
      const prof = this.engine.currentProfile;
      const baseOrigin = {
        x: (layer.origin?.x ?? prof.width / 2) + (layer.params.posX ?? 0),
        y: (layer.origin?.y ?? prof.height / 2) + (layer.params.posY ?? 0),
      };
      const origin = temp ? this.transformPoint(baseOrigin, temp) : baseOrigin;
      const baseRot = layer.params.rotation ?? 0;
      const tempRot = temp?.rotation ?? 0;
      const rot = ((baseRot + tempRot) * Math.PI) / 180;
      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);
      const unrotate = (pt) => {
        const dx = pt.x - origin.x;
        const dy = pt.y - origin.y;
        return {
          x: dx * cosR + dy * sinR,
          y: -dx * sinR + dy * cosR,
        };
      };

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      const addPoint = (pt) => {
        const local = unrotate(pt);
        minX = Math.min(minX, local.x);
        minY = Math.min(minY, local.y);
        maxX = Math.max(maxX, local.x);
        maxY = Math.max(maxY, local.y);
      };

      layer.paths.forEach((path) => {
        if (path && path.meta && path.meta.kind === 'circle') {
          const meta = temp ? this.transformCircleMeta(path.meta, temp) : path.meta;
          const cx = meta.cx ?? meta.x;
          const cy = meta.cy ?? meta.y;
          const rx = meta.rx ?? meta.r;
          const ry = meta.ry ?? meta.r;
          if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(rx) || !Number.isFinite(ry)) return;
          addPoint({ x: cx - rx, y: cy });
          addPoint({ x: cx + rx, y: cy });
          addPoint({ x: cx, y: cy - ry });
          addPoint({ x: cx, y: cy + ry });
          return;
        }
        if (!Array.isArray(path)) return;
        path.forEach((pt) => {
          const next = temp ? this.transformPoint(pt, temp) : pt;
          addPoint(next);
        });
      });
      if (!Number.isFinite(minX)) return null;
      const toWorld = (local) => ({
        x: origin.x + local.x * cosR - local.y * sinR,
        y: origin.y + local.x * sinR + local.y * cosR,
      });
      const nw = toWorld({ x: minX, y: minY });
      const ne = toWorld({ x: maxX, y: minY });
      const se = toWorld({ x: maxX, y: maxY });
      const sw = toWorld({ x: minX, y: maxY });
      const centerLocal = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
      const center = toWorld(centerLocal);
      return {
        minX,
        minY,
        maxX,
        maxY,
        rotation: rot,
        origin,
        center,
        corners: { nw, ne, se, sw },
      };
    }

    drawSelection(bounds, options = {}) {
      const { showHandles = true } = options;
      const handleSize = 6 / this.scale;
      const rotateRadius = 5 / this.scale;
      const { nw, ne, se, sw } = bounds.corners;
      this.ctx.save();
      this.ctx.strokeStyle = '#f8fafc';
      this.ctx.lineWidth = 1 / this.scale;
      this.ctx.setLineDash([4 / this.scale, 4 / this.scale]);
      this.ctx.beginPath();
      this.ctx.moveTo(nw.x, nw.y);
      this.ctx.lineTo(ne.x, ne.y);
      this.ctx.lineTo(se.x, se.y);
      this.ctx.lineTo(sw.x, sw.y);
      this.ctx.closePath();
      this.ctx.stroke();
      this.ctx.setLineDash([]);
      this.ctx.fillStyle = '#111827';
      this.ctx.strokeStyle = '#f8fafc';
      if (showHandles) {
        const handles = this.getHandlePoints(bounds);
        handles.forEach((pt) => {
          this.ctx.beginPath();
          this.ctx.rect(pt.x - handleSize / 2, pt.y - handleSize / 2, handleSize, handleSize);
          this.ctx.fill();
          this.ctx.stroke();
        });
      }
      const rotate = this.getRotateHandlePoint(bounds);
      this.ctx.beginPath();
      this.ctx.moveTo(ne.x, ne.y);
      this.ctx.lineTo(rotate.x, rotate.y);
      this.ctx.stroke();
      this.ctx.beginPath();
      this.ctx.arc(rotate.x, rotate.y, rotateRadius, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();
      this.ctx.restore();
    }

    drawSelectionRect(rect) {
      if (!rect) return;
      this.ctx.save();
      this.ctx.strokeStyle = 'rgba(148, 163, 184, 0.7)';
      this.ctx.fillStyle = 'rgba(148, 163, 184, 0.12)';
      this.ctx.lineWidth = 1 / this.scale;
      this.ctx.setLineDash([4 / this.scale, 4 / this.scale]);
      this.ctx.beginPath();
      if (this.selectionMode === 'oval') {
        this.ctx.ellipse(
          rect.x + rect.w / 2,
          rect.y + rect.h / 2,
          Math.abs(rect.w) / 2,
          Math.abs(rect.h) / 2,
          0,
          0,
          Math.PI * 2
        );
      } else {
        this.ctx.rect(rect.x, rect.y, rect.w, rect.h);
      }
      this.ctx.fill();
      this.ctx.stroke();
      this.ctx.restore();
    }

    drawSelectionPath(path) {
      if (!Array.isArray(path) || path.length < 2) return;
      this.ctx.save();
      this.ctx.strokeStyle = 'rgba(148, 163, 184, 0.8)';
      this.ctx.fillStyle = 'rgba(148, 163, 184, 0.08)';
      this.ctx.lineWidth = 1 / this.scale;
      this.ctx.setLineDash([4 / this.scale, 4 / this.scale]);
      this.ctx.beginPath();
      this.ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) this.ctx.lineTo(path[i].x, path[i].y);
      this.ctx.closePath();
      this.ctx.stroke();
      this.ctx.fill();
      this.ctx.setLineDash([]);
      this.ctx.restore();
    }

    drawDirectSelection() {
      const data = this.getDirectSelectionWorldAnchors();
      if (!data || !data.anchors.length) return;
      const { anchors } = data;
      const path = this.buildPenPathFromAnchors(anchors, Boolean(this.directSelection?.closed));
      this.ctx.save();
      this.ctx.strokeStyle = '#22d3ee';
      this.ctx.lineWidth = 1.1 / this.scale;
      this.ctx.setLineDash([4 / this.scale, 3 / this.scale]);
      this.ctx.beginPath();
      if (path.length) {
        this.ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) this.ctx.lineTo(path[i].x, path[i].y);
        if (this.directSelection?.closed) this.ctx.closePath();
      }
      this.ctx.stroke();
      this.ctx.setLineDash([]);

      const anchorR = 3.2 / this.scale;
      const handleR = 2.2 / this.scale;
      anchors.forEach((anchor) => {
        if (anchor.in) {
          this.ctx.strokeStyle = 'rgba(34, 211, 238, 0.65)';
          this.ctx.beginPath();
          this.ctx.moveTo(anchor.x, anchor.y);
          this.ctx.lineTo(anchor.in.x, anchor.in.y);
          this.ctx.stroke();
          this.ctx.beginPath();
          this.ctx.fillStyle = '#0f172a';
          this.ctx.strokeStyle = '#22d3ee';
          this.ctx.arc(anchor.in.x, anchor.in.y, handleR, 0, Math.PI * 2);
          this.ctx.fill();
          this.ctx.stroke();
        }
        if (anchor.out) {
          this.ctx.strokeStyle = 'rgba(34, 211, 238, 0.65)';
          this.ctx.beginPath();
          this.ctx.moveTo(anchor.x, anchor.y);
          this.ctx.lineTo(anchor.out.x, anchor.out.y);
          this.ctx.stroke();
          this.ctx.beginPath();
          this.ctx.fillStyle = '#0f172a';
          this.ctx.strokeStyle = '#22d3ee';
          this.ctx.arc(anchor.out.x, anchor.out.y, handleR, 0, Math.PI * 2);
          this.ctx.fill();
          this.ctx.stroke();
        }
        this.ctx.beginPath();
        this.ctx.fillStyle = '#0f172a';
        this.ctx.strokeStyle = '#22d3ee';
        this.ctx.arc(anchor.x, anchor.y, anchorR, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
      });
      this.ctx.restore();
    }

    drawPenPreview() {
      const anchors = this.penDraft?.anchors || [];
      if (!anchors.length) return;
      const last = anchors[anchors.length - 1];
      const previewAnchors =
        this.penPreview && !this.isPenDragging ? anchors.concat([this.createAnchor(this.penPreview)]) : anchors.slice();
      const path = this.buildPenPathFromAnchors(previewAnchors, false);
      this.ctx.save();
      this.ctx.strokeStyle = '#38bdf8';
      this.ctx.lineWidth = 1 / this.scale;
      this.ctx.setLineDash([4 / this.scale, 4 / this.scale]);
      this.ctx.beginPath();
      if (path.length) {
        this.ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) {
          this.ctx.lineTo(path[i].x, path[i].y);
        }
      }
      this.ctx.stroke();
      this.ctx.setLineDash([]);
      this.ctx.fillStyle = '#0f172a';
      this.ctx.strokeStyle = '#38bdf8';
      const r = 3 / this.scale;
      anchors.forEach((anchor, idx) => {
        if (anchor.in) {
          this.ctx.beginPath();
          this.ctx.moveTo(anchor.x, anchor.y);
          this.ctx.lineTo(anchor.in.x, anchor.in.y);
          this.ctx.stroke();
          this.ctx.beginPath();
          this.ctx.arc(anchor.in.x, anchor.in.y, r * 0.75, 0, Math.PI * 2);
          this.ctx.stroke();
        }
        if (anchor.out) {
          this.ctx.beginPath();
          this.ctx.moveTo(anchor.x, anchor.y);
          this.ctx.lineTo(anchor.out.x, anchor.out.y);
          this.ctx.stroke();
          this.ctx.beginPath();
          this.ctx.arc(anchor.out.x, anchor.out.y, r * 0.75, 0, Math.PI * 2);
          this.ctx.stroke();
        }
        this.ctx.beginPath();
        this.ctx.arc(anchor.x, anchor.y, r, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
        if (idx === 0) {
          this.ctx.beginPath();
          this.ctx.arc(anchor.x, anchor.y, r * 1.5, 0, Math.PI * 2);
          this.ctx.stroke();
        }
      });
      if (last) {
        this.ctx.beginPath();
        this.ctx.arc(last.x, last.y, r * 1.2, 0, Math.PI * 2);
        this.ctx.stroke();
      }
      if (this.penPreview) {
        this.ctx.beginPath();
        this.ctx.arc(this.penPreview.x, this.penPreview.y, r * 0.9, 0, Math.PI * 2);
        this.ctx.stroke();
      }
      this.ctx.restore();
    }

    drawScissorPreview() {
      if (!this.scissorStart || !this.scissorEnd) return;
      const a = this.scissorStart;
      const b = this.scissorEnd;
      this.ctx.save();
      this.ctx.strokeStyle = '#f59e0b';
      this.ctx.lineWidth = 1 / this.scale;
      this.ctx.setLineDash([6 / this.scale, 4 / this.scale]);
      if (this.scissorMode === 'rect') {
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        const w = Math.abs(b.x - a.x);
        const h = Math.abs(b.y - a.y);
        this.ctx.strokeRect(x, y, w, h);
      } else if (this.scissorMode === 'circle') {
        const r = Math.hypot(b.x - a.x, b.y - a.y);
        this.ctx.beginPath();
        this.ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
        this.ctx.stroke();
      } else {
        this.ctx.beginPath();
        this.ctx.moveTo(a.x, a.y);
        this.ctx.lineTo(b.x, b.y);
        this.ctx.stroke();
      }
      this.ctx.restore();
    }

    drawLightSource() {
      if (!this.lightSource) return;
      const r = 6 / this.scale;
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.fillStyle = '#facc15';
      this.ctx.strokeStyle = '#f59e0b';
      this.ctx.lineWidth = 1 / this.scale;
      this.ctx.arc(this.lightSource.x, this.lightSource.y, r, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();
      if (this.lightSourceSelected) {
        this.ctx.beginPath();
        this.ctx.strokeStyle = 'rgba(250, 204, 21, 0.7)';
        this.ctx.lineWidth = 1.5 / this.scale;
        this.ctx.arc(this.lightSource.x, this.lightSource.y, r * 1.8, 0, Math.PI * 2);
        this.ctx.stroke();
      }
      this.ctx.restore();
    }

    getHandlePoints(bounds) {
      return [
        { key: 'nw', ...bounds.corners.nw },
        { key: 'ne', ...bounds.corners.ne },
        { key: 'se', ...bounds.corners.se },
        { key: 'sw', ...bounds.corners.sw },
      ];
    }

    getRotateHandlePoint(bounds) {
      const offset = 18 / this.scale;
      const center = bounds.center;
      const target = bounds.corners.ne;
      const vx = target.x - center.x;
      const vy = target.y - center.y;
      const len = Math.hypot(vx, vy) || 1;
      return { key: 'rotate', x: target.x + (vx / len) * offset, y: target.y + (vy / len) * offset };
    }

    getHandlePoint(handle, bounds) {
      const map = {
        nw: bounds.corners.nw,
        ne: bounds.corners.ne,
        se: bounds.corners.se,
        sw: bounds.corners.sw,
      };
      return map[handle] || bounds.corners.se;
    }

    getResizeAnchor(handle, bounds) {
      const map = {
        nw: bounds.corners.se,
        ne: bounds.corners.sw,
        se: bounds.corners.nw,
        sw: bounds.corners.ne,
      };
      return map[handle] || bounds.center;
    }

    hitHandle(sx, sy, bounds) {
      const rotate = this.getRotateHandlePoint(bounds);
      const rotateScreen = this.worldToScreen(rotate.x, rotate.y);
      const rSize = 8;
      const rHalf = rSize / 2;
      if (
        sx >= rotateScreen.x - rHalf &&
        sx <= rotateScreen.x + rHalf &&
        sy >= rotateScreen.y - rHalf &&
        sy <= rotateScreen.y + rHalf
      ) {
        return 'rotate';
      }
      if (this.selectedLayerIds && this.selectedLayerIds.size > 1) return null;
      const handles = this.getHandlePoints(bounds).map((pt) => ({
        key: pt.key,
        screen: this.worldToScreen(pt.x, pt.y),
      }));
      const size = 8;
      const half = size / 2;
      const hit = handles.find(
        (h) => sx >= h.screen.x - half && sx <= h.screen.x + half && sy >= h.screen.y - half && sy <= h.screen.y + half
      );
      return hit ? hit.key : null;
    }

    getHandleVector(handle, bounds) {
      const center = bounds.center;
      const pt = this.getHandlePoint(handle, bounds);
      if (!pt) return { x: 1, y: 1 };
      return { x: pt.x - center.x, y: pt.y - center.y };
    }

    getBoundsCenter(bounds) {
      return bounds.center || { x: 0, y: 0 };
    }

    pointInBounds(pt, bounds) {
      const dx = pt.x - bounds.origin.x;
      const dy = pt.y - bounds.origin.y;
      const cosR = Math.cos(bounds.rotation);
      const sinR = Math.sin(bounds.rotation);
      const localX = dx * cosR + dy * sinR;
      const localY = -dx * sinR + dy * cosR;
      return localX >= bounds.minX && localX <= bounds.maxX && localY >= bounds.minY && localY <= bounds.maxY;
    }

    rectContainsPoint(rect, pt) {
      return pt.x >= rect.x && pt.x <= rect.x + rect.w && pt.y >= rect.y && pt.y <= rect.y + rect.h;
    }

    segmentsIntersect(a, b, c, d) {
      const cross = (p1, p2, p3) => (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
      const d1 = cross(a, b, c);
      const d2 = cross(a, b, d);
      const d3 = cross(c, d, a);
      const d4 = cross(c, d, b);
      if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
      const onSegment = (p1, p2, p3) =>
        Math.min(p1.x, p2.x) <= p3.x &&
        p3.x <= Math.max(p1.x, p2.x) &&
        Math.min(p1.y, p2.y) <= p3.y &&
        p3.y <= Math.max(p1.y, p2.y);
      if (d1 === 0 && onSegment(a, b, c)) return true;
      if (d2 === 0 && onSegment(a, b, d)) return true;
      if (d3 === 0 && onSegment(c, d, a)) return true;
      if (d4 === 0 && onSegment(c, d, b)) return true;
      return false;
    }

    segmentIntersectsRect(a, b, rect) {
      if (this.rectContainsPoint(rect, a) || this.rectContainsPoint(rect, b)) return true;
      const r1 = { x: rect.x, y: rect.y };
      const r2 = { x: rect.x + rect.w, y: rect.y };
      const r3 = { x: rect.x + rect.w, y: rect.y + rect.h };
      const r4 = { x: rect.x, y: rect.y + rect.h };
      return (
        this.segmentsIntersect(a, b, r1, r2) ||
        this.segmentsIntersect(a, b, r2, r3) ||
        this.segmentsIntersect(a, b, r3, r4) ||
        this.segmentsIntersect(a, b, r4, r1)
      );
    }

    pathIntersectsRect(path, rect) {
      if (!Array.isArray(path) || path.length < 2) return false;
      for (let i = 0; i < path.length - 1; i++) {
        if (this.segmentIntersectsRect(path[i], path[i + 1], rect)) return true;
      }
      return false;
    }

    pointInPoly(point, poly) {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x;
        const yi = poly[i].y;
        const xj = poly[j].x;
        const yj = poly[j].y;
        const intersect = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + 1e-9) + xi;
        if (intersect) inside = !inside;
      }
      return inside;
    }

    segmentIntersectsPoly(a, b, poly) {
      if (this.pointInPoly(a, poly) || this.pointInPoly(b, poly)) return true;
      for (let i = 0; i < poly.length; i++) {
        const p1 = poly[i];
        const p2 = poly[(i + 1) % poly.length];
        if (this.segmentsIntersect(a, b, p1, p2)) return true;
      }
      return false;
    }

    pathIntersectsPoly(path, poly) {
      if (!Array.isArray(path) || path.length < 2) return false;
      for (let i = 0; i < path.length - 1; i++) {
        if (this.segmentIntersectsPoly(path[i], path[i + 1], poly)) return true;
      }
      return false;
    }

    distancePointToSegment(p, a, b) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
      const proj = { x: a.x + t * dx, y: a.y + t * dy };
      return Math.hypot(p.x - proj.x, p.y - proj.y);
    }

    circleIntersectsPoly(meta, poly) {
      const cx = meta.cx ?? meta.x;
      const cy = meta.cy ?? meta.y;
      const r = meta.r ?? Math.max(meta.rx ?? 0, meta.ry ?? 0);
      if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(r)) return false;
      const center = { x: cx, y: cy };
      if (this.pointInPoly(center, poly)) return true;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        if (this.distancePointToSegment(center, a, b) <= r) return true;
      }
      return false;
    }

    layerIntersectsPoly(layer, poly) {
      if (!layer || !layer.visible) return false;
      return layer.paths.some((path) => {
        if (path && path.meta && path.meta.kind === 'circle') {
          return this.circleIntersectsPoly(path.meta, poly);
        }
        return this.pathIntersectsPoly(path, poly);
      });
    }

    selectLayersByPolygon(poly) {
      if (!poly || poly.length < 3) return;
      const selected = this.engine.layers.filter((layer) => this.layerIntersectsPoly(layer, poly));
      if (selected.length) {
        this.setSelection(
          selected.map((layer) => layer.id),
          selected[selected.length - 1].id
        );
      }
    }

    ellipseToPoly(rect, steps = 36) {
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;
      const rx = rect.w / 2;
      const ry = rect.h / 2;
      const pts = [];
      for (let i = 0; i < steps; i++) {
        const t = (i / steps) * Math.PI * 2;
        pts.push({ x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry });
      }
      return pts;
    }

    circleIntersectsRect(meta, rect) {
      const cx = meta.cx ?? meta.x;
      const cy = meta.cy ?? meta.y;
      const r = meta.r ?? Math.max(meta.rx ?? 0, meta.ry ?? 0);
      if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(r)) return false;
      if (this.rectContainsPoint(rect, { x: cx, y: cy })) return true;
      const closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
      const closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
      const dx = cx - closestX;
      const dy = cy - closestY;
      return dx * dx + dy * dy <= r * r;
    }

    layerIntersectsRect(layer, rect) {
      if (!layer || !layer.visible) return false;
      return layer.paths.some((path) => {
        if (path && path.meta && path.meta.kind === 'circle') {
          return this.circleIntersectsRect(path.meta, rect);
        }
        return this.pathIntersectsRect(path, rect);
      });
    }

    handleCursor(handle) {
      if (handle === 'nw' || handle === 'se') return 'nwse-resize';
      if (handle === 'ne' || handle === 'sw') return 'nesw-resize';
      if (handle === 'rotate') return 'grab';
      return 'default';
    }

    updateHoverCursor(e) {
      if (!this.canvas) return;
      const modifiers = this.getModifierState(e);
      if (this.activeTool === 'hand') {
        this.canvas.style.cursor = this.isPan ? 'grabbing' : 'grab';
        return;
      }
      if (this.activeTool === 'pen' && !modifiers.meta && this.penMode === 'draw') {
        this.canvas.style.cursor = 'crosshair';
        return;
      }
      if (this.activeTool === 'scissor' || (this.activeTool === 'select' && (this.selectionMode === 'pen' || this.selectionMode === 'lasso'))) {
        this.canvas.style.cursor = 'crosshair';
        return;
      }
      const rect = this.canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const world = this.screenToWorld(sx, sy);
      if (this.activeTool === 'direct') {
        const control = this.hitDirectControl(world);
        if (control) {
          this.canvas.style.cursor = control.type === 'anchor' ? 'move' : 'pointer';
          return;
        }
        const hit = this.findPathHitAtPoint(world);
        this.canvas.style.cursor = hit ? 'move' : 'crosshair';
        return;
      }
      if (this.activeTool === 'pen' && this.penMode !== 'draw' && !modifiers.meta) {
        const control = this.hitDirectControl(world);
        if (control) {
          this.canvas.style.cursor = this.penMode === 'delete' ? 'not-allowed' : 'pointer';
          return;
        }
        const hit = this.findPathHitAtPoint(world, {
          restrictToLayerId: this.directSelection?.layerId || null,
        });
        this.canvas.style.cursor = hit ? 'crosshair' : 'crosshair';
        return;
      }
      if (this.hitLightSource(world)) {
        this.canvas.style.cursor = this.isLightDrag ? 'grabbing' : 'move';
        return;
      }
      const activeLayers = this.getSelectedLayers();
      if (!activeLayers.length) {
        this.canvas.style.cursor = 'crosshair';
        return;
      }
      const bounds = this.getSelectionBounds(activeLayers, this.tempTransform);
      if (!bounds) return;
      const handle = this.hitHandle(sx, sy, bounds);
      if (handle) {
        this.canvas.style.cursor = this.handleCursor(handle);
        return;
      }
      if (this.pointInBounds(world, bounds)) {
        this.canvas.style.cursor = activeLayers.length > 1 ? 'grab' : 'move';
      } else {
        this.canvas.style.cursor = 'crosshair';
      }
    }

    updateTransformInputs(layer) {
      const posX = document.getElementById('inp-pos-x');
      const posY = document.getElementById('inp-pos-y');
      const scaleX = document.getElementById('inp-scale-x');
      const scaleY = document.getElementById('inp-scale-y');
      const rotation = document.getElementById('inp-rotation');
      if (posX) posX.value = layer.params.posX;
      if (posY) posY.value = layer.params.posY;
      if (scaleX) scaleX.value = layer.params.scaleX;
      if (scaleY) scaleY.value = layer.params.scaleY;
      if (rotation) rotation.value = layer.params.rotation;
    }
  }

  window.Vectura = window.Vectura || {};
  window.Vectura.Renderer = Renderer;
})();
