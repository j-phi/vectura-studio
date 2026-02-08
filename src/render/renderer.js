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
      this.onSelectLayer = null;
      this.lastM = { x: 0, y: 0 };
      this.snap = null;
      this.snapAllowed = true;
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
      const world = this.screenToWorld(sx, sy);
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

      const topLayer = this.findLayerAtPoint(world);
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
        if (e.altKey && updatedSelected.length === 1) {
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
        } else if (this.dragMode === 'resize' && this.startBounds && this.activeHandle) {
          const fromCenter = e.altKey || e.ctrlKey;
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
          if (e.shiftKey) {
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
          if (e.shiftKey) {
            const snap = 15;
            delta = Math.round(delta / snap) * snap;
          }
          this.tempTransform = { dx: 0, dy: 0, scaleX: 1, scaleY: 1, origin: this.rotateOrigin, rotation: delta };
        }
        const activeLayers = this.getSelectedLayers();
        const bounds = activeLayers.length ? this.getSelectionBounds(activeLayers, this.tempTransform) : null;
        const needsGuides = SETTINGS.showGuides || SETTINGS.snapGuides;
        this.snapAllowed = !e.metaKey;
        this.guides = needsGuides && bounds ? this.computeGuides(activeLayers, bounds) : null;
        this.snap = SETTINGS.snapGuides && bounds ? this.computeSnap(activeLayers, bounds) : null;
        this.draw();
        return;
      }

      if (this.isSelecting && this.selectionStart) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = this.screenToWorld(sx, sy);
        const x = Math.min(this.selectionStart.x, world.x);
        const y = Math.min(this.selectionStart.y, world.y);
        const w = Math.abs(world.x - this.selectionStart.x);
        const h = Math.abs(world.y - this.selectionStart.y);
        this.selectionRect = { x, y, w, h };
        this.draw();
        return;
      }

      this.updateHoverCursor(e);
    }

    up() {
      if (!this.ready || !this.canvas) return;
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
            activeLayer.params.scaleX *= scaleX;
            activeLayer.params.scaleY *= scaleY;
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
      this.canvas.style.cursor = 'crosshair';
      this.guides = null;
      if (this.isSelecting) {
        const rect = this.selectionRect;
        if (rect) {
          const selected = this.engine.layers.filter((layer) => this.layerIntersectsRect(layer, rect));
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
      this.draw();
    }

    setSelection(ids, primaryId) {
      this.selectedLayerIds = new Set(ids || []);
      if (primaryId && this.selectedLayerIds.has(primaryId)) {
        this.selectedLayerId = primaryId;
      } else {
        this.selectedLayerId = this.selectedLayerIds.values().next().value || null;
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
      this.ctx.rect(rect.x, rect.y, rect.w, rect.h);
      this.ctx.fill();
      this.ctx.stroke();
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
      const activeLayers = this.getSelectedLayers();
      if (!activeLayers.length) {
        this.canvas.style.cursor = 'crosshair';
        return;
      }
      const bounds = this.getSelectionBounds(activeLayers, this.tempTransform);
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
