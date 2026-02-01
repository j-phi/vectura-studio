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
      this.startHandleVec = null;
      this.tempTransform = null;
      this.lastM = { x: 0, y: 0 };
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
      this.canvas.addEventListener('mousedown', (e) => this.down(e));
      window.addEventListener('mousemove', (e) => this.move(e));
      window.addEventListener('mouseup', () => this.up());
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
      this.ctx.strokeStyle = '#333';
      this.ctx.lineWidth = 1 / this.scale;
      this.ctx.strokeRect(0, 0, prof.width, prof.height);

      this.ctx.lineJoin = 'round';

      const activeLayer = this.engine.getActiveLayer ? this.engine.getActiveLayer() : null;
      this.engine.layers.forEach((l) => {
        if (!l.visible) return;
        this.ctx.lineWidth = l.strokeWidth ?? SETTINGS.strokeWidth;
        this.ctx.lineCap = l.lineCap || 'round';
        this.ctx.beginPath();
        this.ctx.strokeStyle = l.color;
        const useCurves = Boolean(l.params && l.params.curves);
        l.paths.forEach((path) => {
          if (path && path.meta && path.meta.kind === 'circle') {
            const meta = l === activeLayer && this.tempTransform ? this.transformCircleMeta(path.meta, this.tempTransform) : path.meta;
            this.traceCircle(meta);
          } else {
            const next = l === activeLayer && this.tempTransform ? this.transformPath(path, this.tempTransform) : path;
            this.tracePath(next, useCurves);
          }
        });
        this.ctx.stroke();
      });

      if (activeLayer) {
        const bounds = this.getLayerBounds(activeLayer, this.tempTransform);
        if (bounds) this.drawSelection(bounds);
      }
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
      if (e.shiftKey || e.button === 1) {
        this.isPan = true;
        this.lastM = { x: e.clientX, y: e.clientY };
        this.canvas.style.cursor = 'grabbing';
        return;
      }

      if (e.button !== 0) return;
      const activeLayer = this.engine.getActiveLayer ? this.engine.getActiveLayer() : null;
      if (!activeLayer) return;

      const rect = this.canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const bounds = this.getLayerBounds(activeLayer);
      if (!bounds) return;
      const handle = this.hitHandle(sx, sy, bounds);
      const world = this.screenToWorld(sx, sy);
      if (handle) {
        this.isLayerDrag = true;
        this.dragMode = 'resize';
        this.activeHandle = handle;
        this.dragStart = world;
        this.startBounds = bounds;
        this.startHandleVec = this.getHandleVector(handle, bounds);
        this.canvas.style.cursor = this.handleCursor(handle);
        e.preventDefault();
        return;
      }
      if (this.pointInBounds(world, bounds)) {
        this.isLayerDrag = true;
        this.dragMode = 'move';
        this.dragStart = world;
        this.startBounds = bounds;
        this.canvas.style.cursor = 'move';
        e.preventDefault();
      }
    }

    move(e) {
      if (!this.ready) return;
      if (this.isPan) {
        this.offsetX += e.clientX - this.lastM.x;
        this.offsetY += e.clientY - this.lastM.y;
        this.lastM = { x: e.clientX, y: e.clientY };
        this.draw();
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
        } else if (this.dragMode === 'resize' && this.startBounds && this.startHandleVec) {
          const origin = this.getBoundsCenter(this.startBounds);
          const startVec = this.startHandleVec;
          const currVec = { x: world.x - origin.x, y: world.y - origin.y };
          const safeX = Math.abs(startVec.x) < 0.001 ? 0.001 : startVec.x;
          const safeY = Math.abs(startVec.y) < 0.001 ? 0.001 : startVec.y;
          let scaleX = currVec.x / safeX;
          let scaleY = currVec.y / safeY;
          if (e.shiftKey) {
            const uni = Math.abs(scaleX) > Math.abs(scaleY) ? scaleX : scaleY;
            scaleX = uni;
            scaleY = uni;
          }
          scaleX = Math.max(0.05, Math.min(scaleX, 20));
          scaleY = Math.max(0.05, Math.min(scaleY, 20));
          this.tempTransform = { dx: 0, dy: 0, scaleX, scaleY, origin };
        }
        this.draw();
        return;
      }

      this.updateHoverCursor(e);
    }

    up() {
      if (!this.ready || !this.canvas) return;
      if (this.isLayerDrag) {
        const activeLayer = this.engine.getActiveLayer ? this.engine.getActiveLayer() : null;
        if (activeLayer && this.tempTransform) {
          if (this.dragMode === 'move') {
            activeLayer.params.posX += this.tempTransform.dx;
            activeLayer.params.posY += this.tempTransform.dy;
          } else if (this.dragMode === 'resize') {
            activeLayer.params.scaleX *= this.tempTransform.scaleX;
            activeLayer.params.scaleY *= this.tempTransform.scaleY;
          }
          this.engine.generate(activeLayer.id);
          this.updateTransformInputs(activeLayer);
        }
        this.tempTransform = null;
      }
      this.isPan = false;
      this.isLayerDrag = false;
      this.dragMode = null;
      this.activeHandle = null;
      this.canvas.style.cursor = 'crosshair';
      this.draw();
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
      if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(rx) || !Number.isFinite(ry)) return;
      if (rx <= 0 || ry <= 0) return;
      this.ctx.moveTo(cx + rx, cy);
      if (Math.abs(rx - ry) < 0.001) {
        this.ctx.arc(cx, cy, rx, 0, Math.PI * 2);
        return;
      }
      this.ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
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
      return {
        x: (pt.x - origin.x) * temp.scaleX + origin.x + temp.dx,
        y: (pt.y - origin.y) * temp.scaleY + origin.y + temp.dy,
      };
    }

    transformPath(path, temp) {
      if (!path) return path;
      return path.map((pt) => this.transformPoint(pt, temp));
    }

    transformCircleMeta(meta, temp) {
      if (!temp || !meta) return meta;
      const origin = temp.origin || { x: 0, y: 0 };
      const center = this.transformPoint({ x: meta.cx ?? meta.x, y: meta.cy ?? meta.y }, temp);
      const baseR = Number.isFinite(meta.r) ? meta.r : Math.max(meta.rx ?? 0, meta.ry ?? 0);
      const rx = Math.abs(baseR * temp.scaleX);
      const ry = Math.abs(baseR * temp.scaleY);
      return { ...meta, cx: center.x, cy: center.y, rx, ry };
    }

    getLayerBounds(layer, temp) {
      if (!layer || !Array.isArray(layer.paths)) return null;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      layer.paths.forEach((path) => {
        if (path && path.meta && path.meta.kind === 'circle') {
          const meta = temp ? this.transformCircleMeta(path.meta, temp) : path.meta;
          const cx = meta.cx ?? meta.x;
          const cy = meta.cy ?? meta.y;
          const rx = meta.rx ?? meta.r;
          const ry = meta.ry ?? meta.r;
          minX = Math.min(minX, cx - rx);
          maxX = Math.max(maxX, cx + rx);
          minY = Math.min(minY, cy - ry);
          maxY = Math.max(maxY, cy + ry);
          return;
        }
        if (!Array.isArray(path)) return;
        path.forEach((pt) => {
          const next = temp ? this.transformPoint(pt, temp) : pt;
          minX = Math.min(minX, next.x);
          maxX = Math.max(maxX, next.x);
          minY = Math.min(minY, next.y);
          maxY = Math.max(maxY, next.y);
        });
      });
      if (!Number.isFinite(minX)) return null;
      return { minX, minY, maxX, maxY };
    }

    drawSelection(bounds) {
      const handleSize = 6 / this.scale;
      this.ctx.save();
      this.ctx.strokeStyle = '#f8fafc';
      this.ctx.lineWidth = 1 / this.scale;
      this.ctx.setLineDash([4 / this.scale, 4 / this.scale]);
      this.ctx.strokeRect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
      this.ctx.setLineDash([]);
      this.ctx.fillStyle = '#111827';
      this.ctx.strokeStyle = '#f8fafc';
      const handles = this.getHandlePoints(bounds);
      handles.forEach((pt) => {
        this.ctx.beginPath();
        this.ctx.rect(pt.x - handleSize / 2, pt.y - handleSize / 2, handleSize, handleSize);
        this.ctx.fill();
        this.ctx.stroke();
      });
      this.ctx.restore();
    }

    getHandlePoints(bounds) {
      return [
        { key: 'nw', x: bounds.minX, y: bounds.minY },
        { key: 'ne', x: bounds.maxX, y: bounds.minY },
        { key: 'se', x: bounds.maxX, y: bounds.maxY },
        { key: 'sw', x: bounds.minX, y: bounds.maxY },
      ];
    }

    hitHandle(sx, sy, bounds) {
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
      const center = this.getBoundsCenter(bounds);
      const points = {
        nw: { x: bounds.minX, y: bounds.minY },
        ne: { x: bounds.maxX, y: bounds.minY },
        se: { x: bounds.maxX, y: bounds.maxY },
        sw: { x: bounds.minX, y: bounds.maxY },
      };
      const pt = points[handle];
      if (!pt) return { x: 1, y: 1 };
      return { x: pt.x - center.x, y: pt.y - center.y };
    }

    getBoundsCenter(bounds) {
      return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
    }

    pointInBounds(pt, bounds) {
      return pt.x >= bounds.minX && pt.x <= bounds.maxX && pt.y >= bounds.minY && pt.y <= bounds.maxY;
    }

    handleCursor(handle) {
      if (handle === 'nw' || handle === 'se') return 'nwse-resize';
      if (handle === 'ne' || handle === 'sw') return 'nesw-resize';
      return 'default';
    }

    updateHoverCursor(e) {
      if (!this.canvas) return;
      const activeLayer = this.engine.getActiveLayer ? this.engine.getActiveLayer() : null;
      if (!activeLayer) return;
      const bounds = this.getLayerBounds(activeLayer, this.tempTransform);
      if (!bounds) return;
      const rect = this.canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const handle = this.hitHandle(sx, sy, bounds);
      if (handle) {
        this.canvas.style.cursor = this.handleCursor(handle);
        return;
      }
      const world = this.screenToWorld(sx, sy);
      if (this.pointInBounds(world, bounds)) {
        this.canvas.style.cursor = 'move';
      } else {
        this.canvas.style.cursor = 'crosshair';
      }
    }

    updateTransformInputs(layer) {
      const posX = document.getElementById('inp-pos-x');
      const posY = document.getElementById('inp-pos-y');
      const scaleX = document.getElementById('inp-scale-x');
      const scaleY = document.getElementById('inp-scale-y');
      if (posX) posX.value = layer.params.posX;
      if (posY) posY.value = layer.params.posY;
      if (scaleX) scaleX.value = layer.params.scaleX;
      if (scaleY) scaleY.value = layer.params.scaleY;
    }
  }

  window.Vectura = window.Vectura || {};
  window.Vectura.Renderer = Renderer;
})();
