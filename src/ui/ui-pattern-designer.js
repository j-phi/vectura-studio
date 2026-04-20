/**
 * Pattern Designer methods for the UI class — mixed into UI.prototype by ui.js.
 */
(() => {
  const escapeHtml = (str) => {
    if (typeof str !== 'string') return String(str ?? '');
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  window.Vectura = window.Vectura || {};
  window.Vectura._UIPatternDesignerMixin = {
    destroyInlinePatternDesigner() {
      if (!this.inlinePatternDesigner) return;
      const { root, cleanupCanvas, cleanupKeys } = this.inlinePatternDesigner;
      if (cleanupCanvas) cleanupCanvas();
      if (cleanupKeys) cleanupKeys();
      if (root && root.parentElement) root.remove();
      this.inlinePatternDesigner = null;
    },

    ensurePatternLayerSelection(layer) {
      if (!layer || layer.type !== 'pattern') return null;
      if (!layer.params || typeof layer.params !== 'object') layer.params = {};
      const patterns = Array.isArray(window.Vectura?.PATTERNS) ? window.Vectura.PATTERNS : [];
      if (!patterns.length) return null;
      const currentId = `${layer.params.patternId || ''}`;
      const hasCurrent = patterns.some((pattern) => pattern?.id === currentId);
      if (!hasCurrent) {
        layer.params.patternId = patterns[0].id;
      }
      return layer.params.patternId;
    },

    mountInlinePatternDesigner(layer, mountTarget) {
      if (!layer || !mountTarget) return;
      this.destroyInlinePatternDesigner();
      this.ensurePatternLayerSelection(layer);

      const root = document.createElement('div');
      root.className = 'pattern-designer-inline';
      mountTarget.appendChild(root);

      const pd = {
        root,
        layer,
        tool: 'fill',
        fills: (layer.params.patternFills || []).map(f => ({
          ...f,
          region: (f.region || []).slice(),
        })),
        history: [],
        view: { zoom: 1, offsetX: 0, offsetY: 0 },
        cleanupCanvas: null,
        cleanupKeys: null,
        inline: true,
      };

      this.inlinePatternDesigner = pd;
      this._buildPatternDesignerPanel(pd);
      this._initPatternDesignerView(pd);
      this._renderPatternDesigner(pd);
      this._bindInlinePatternDesignerKeys(pd);
    },

    _buildPatternDesignerPanel(pd) {
      const SETTINGS = window.Vectura.SETTINGS || {};
      const fillOptions = [
        { value: 'hatch',       label: 'H. Hatch' },
        { value: 'vhatch',      label: 'V. Hatch' },
        { value: 'crosshatch',  label: 'Cross-hatch' },
        { value: 'dhatch45',    label: 'Diagonal 45°' },
        { value: 'dhatch135',   label: 'Diagonal 135°' },
        { value: 'xcrosshatch', label: 'Diag. cross' },
        { value: 'wavelines',   label: 'Wavy lines' },
        { value: 'zigzag',      label: 'Zigzag' },
        { value: 'stipple',     label: 'Stipple' },
        { value: 'contour',     label: 'Contour' },
      ].map(o => `<option value="${o.value}">${o.label}</option>`).join('');
      const pens = (SETTINGS.pens || []).map(pen =>
        `<option value="${escapeHtml(pen.id)}">${escapeHtml(pen.name || pen.id)}</option>`
      ).join('');

      pd.root.innerHTML = `
        <div class="flex items-center justify-between mb-2 px-1">
          <span class="text-[11px] font-medium text-vectura-accent uppercase tracking-wide">Texture Designer</span>
          <div class="flex gap-1">
            <button type="button" class="pd-tool-btn active" data-pd-tool="fill" title="Paint Bucket (F)">
              <svg viewBox="0 0 24 24" width="12" height="12"><path d="M16.56 8.94L7.62 0 6.21 1.41l2.38 2.38-5.15 5.15c-.59.57-.59 1.53 0 2.12l5.5 5.5c.29.29.68.44 1.06.44s.77-.15 1.06-.44l5.5-5.5c.59-.58.59-1.53 0-2.12zM5.21 10 10 5.21 14.79 10z" fill="currentColor"/><path d="M19 11.5s-2 2.17-2 3.5c0 1.1.9 2 2 2s2-.9 2-2c0-1.33-2-3.5-2-3.5z" fill="currentColor"/></svg>
            </button>
            <button type="button" class="pd-tool-btn" data-pd-tool="erase" title="Erase (E)">
              <svg viewBox="0 0 24 24" width="12" height="12"><path d="M15.14 3c-.51 0-1.02.2-1.41.59L2.59 14.73c-.78.77-.78 2.04 0 2.83L5.03 20H20v-2h-6.84l7.25-7.26c.78-.78.78-2.05 0-2.83L16.56 3.59c-.4-.39-.91-.59-1.42-.59zm0 2 1.42 1.42L5.82 17H4v-1.84z" fill="currentColor"/></svg>
            </button>
          </div>
        </div>
        <div class="flex flex-wrap gap-2 mb-2 items-center text-[11px]">
          <label class="flex items-center gap-1"><span class="text-vectura-muted">Fill</span>
            <select data-pd-fill-type class="bg-vectura-bg border border-vectura-border px-1 py-0.5 text-[11px] focus:outline-none focus:border-vectura-accent">${fillOptions}</select>
          </label>
          <label class="flex items-center gap-1"><span class="text-vectura-muted">Density</span>
            <input type="number" data-pd-density value="5" min="0.5" max="50" step="0.5"
              class="w-12 bg-vectura-bg border border-vectura-border px-1 py-0.5 text-[11px] focus:outline-none focus:border-vectura-accent">
          </label>
          <label class="flex items-center gap-1"><span class="text-vectura-muted">Pen</span>
            <select data-pd-pen class="bg-vectura-bg border border-vectura-border px-1 py-0.5 text-[11px] focus:outline-none focus:border-vectura-accent">
              <option value="">Layer default</option>${pens}
            </select>
          </label>
          <label class="flex items-center gap-1"><span class="text-vectura-muted">Sensitivity</span>
            <input type="number" data-pd-sensitivity value="${pd.layer.params.fillSensitivity ?? 2}" min="0.1" max="20" step="0.1"
              class="w-12 bg-vectura-bg border border-vectura-border px-1 py-0.5 text-[11px] focus:outline-none focus:border-vectura-accent">
          </label>
        </div>
        <div class="relative border border-vectura-border mb-2" style="height:260px;overflow:hidden;background:#0e0e11;cursor:crosshair;">
          <canvas data-pd-canvas style="position:absolute;top:0;left:0;touch-action:none;"></canvas>
        </div>
        <div class="flex items-center justify-between mb-1">
          <span class="text-[10px] text-vectura-muted" data-pd-status>Click a closed region to fill it</span>
          <button type="button" class="text-[10px] text-vectura-muted hover:text-vectura-accent transition-colors" data-pd-clear>Clear all</button>
        </div>
        <div data-pd-fills-list class="space-y-1"></div>`;

      this._bindPatternDesignerControls(pd);
      this._bindPatternDesignerCanvas(pd);
      this._renderFillsList(pd);
      window.requestAnimationFrame(() => {
        this._initPatternDesignerView(pd);
        this._renderPatternDesigner(pd);
      });
    },

    _renderFillsList(pd) {
      const SETTINGS = window.Vectura.SETTINGS || {};
      const listEl = pd.root.querySelector('[data-pd-fills-list]');
      if (!listEl) return;
      listEl.innerHTML = '';
      if (!pd.fills.length) return;
      const fillOptions = [
        { value: 'hatch', label: 'H. Hatch' },
        { value: 'vhatch', label: 'V. Hatch' },
        { value: 'crosshatch', label: 'Cross-hatch' },
        { value: 'dhatch45', label: 'Diag. 45°' },
        { value: 'dhatch135', label: 'Diag. 135°' },
        { value: 'xcrosshatch', label: 'Diag. cross' },
        { value: 'wavelines', label: 'Wavy lines' },
        { value: 'zigzag', label: 'Zigzag' },
        { value: 'stipple', label: 'Stipple' },
        { value: 'contour', label: 'Contour' },
      ];
      const pens = SETTINGS.pens || [];
      pd.fills.forEach((fill, idx) => {
        const row = document.createElement('div');
        row.className = 'flex items-center gap-1 text-[10px] border border-vectura-border px-1.5 py-1 bg-vectura-bg';
        const fillOpts = fillOptions.map(o =>
          `<option value="${o.value}"${fill.fillType === o.value ? ' selected' : ''}>${o.label}</option>`
        ).join('');
        const penOpts = `<option value=""${!fill.penId ? ' selected' : ''}>Default</option>` +
          pens.map(p => `<option value="${p.id}"${fill.penId === p.id ? ' selected' : ''}>${p.name || p.id}</option>`).join('');
        row.innerHTML = `
          <span class="text-vectura-muted flex-shrink-0">#${idx + 1}</span>
          <select class="bg-vectura-bg border border-vectura-border px-0.5 py-0 text-[10px] focus:outline-none flex-1 min-w-0" data-fl-type>${fillOpts}</select>
          <input type="number" class="bg-vectura-bg border border-vectura-border px-0.5 py-0 text-[10px] w-10 focus:outline-none" data-fl-density value="${fill.density}" min="0.5" max="50" step="0.5">
          <select class="bg-vectura-bg border border-vectura-border px-0.5 py-0 text-[10px] focus:outline-none w-16 min-w-0" data-fl-pen>${penOpts}</select>
          <button type="button" class="text-vectura-muted hover:text-red-400 transition-colors flex-shrink-0 ml-0.5" data-fl-del title="Delete fill">×</button>`;

        row.querySelector('[data-fl-type]').addEventListener('change', (e) => {
          fill.fillType = e.target.value;
          this._applyPatternDesignerChanges(pd);
        });
        row.querySelector('[data-fl-density]').addEventListener('change', (e) => {
          fill.density = parseFloat(e.target.value) || 5;
          this._applyPatternDesignerChanges(pd);
        });
        row.querySelector('[data-fl-pen]').addEventListener('change', (e) => {
          fill.penId = e.target.value || null;
          this._applyPatternDesignerChanges(pd);
        });
        row.querySelector('[data-fl-del]').addEventListener('click', () => {
          pd.history.push(pd.fills.map(f => ({ ...f, region: f.region.slice() })));
          pd.fills.splice(idx, 1);
          this._applyPatternDesignerChanges(pd);
        });
        listEl.appendChild(row);
      });
    },

    _bindInlinePatternDesignerKeys(pd) {
      const handler = (e) => {
        if (!pd?.root) return;
        if (e.key === 'z' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          if (pd.history.length) {
            pd.fills = pd.history.pop();
            this._applyPatternDesignerChanges(pd);
          }
          return;
        }
        if (e.key === 'f' || e.key === 'F') {
          pd.tool = 'fill';
          pd.root.querySelectorAll('[data-pd-tool]').forEach(b => b.classList.toggle('active', b.dataset.pdTool === 'fill'));
        }
        if (e.key === 'e' || e.key === 'E') {
          pd.tool = 'erase';
          pd.root.querySelectorAll('[data-pd-tool]').forEach(b => b.classList.toggle('active', b.dataset.pdTool === 'erase'));
        }
      };
      window.addEventListener('keydown', handler);
      pd.cleanupKeys = () => window.removeEventListener('keydown', handler);
    },

    createPatternDesignerMarkup() {
      const SETTINGS = window.Vectura.SETTINGS || {};
      const fillOptions = [
        { value: 'hatch',       label: 'Horizontal hatch' },
        { value: 'vhatch',      label: 'Vertical hatch' },
        { value: 'crosshatch',  label: 'Cross-hatch (H+V)' },
        { value: 'dhatch45',    label: 'Diagonal 45°' },
        { value: 'dhatch135',   label: 'Diagonal 135°' },
        { value: 'xcrosshatch', label: 'Diagonal cross' },
        { value: 'wavelines',   label: 'Wavy lines' },
        { value: 'zigzag',      label: 'Zigzag' },
        { value: 'stipple',     label: 'Stipple dots' },
        { value: 'contour',     label: 'Contour' },
      ].map(o => `<option value="${o.value}">${o.label}</option>`).join('');
      const pens = (SETTINGS.pens || []).map(pen =>
        `<option value="${escapeHtml(pen.id)}">${escapeHtml(pen.name || pen.id)}</option>`
      ).join('');
      return `
        <div class="petal-designer-header" data-pd-header>
          <div class="petal-designer-title">Pattern Designer</div>
          <div class="petal-designer-actions">
            <button type="button" class="petal-tool-btn" data-pd-tool="fill" title="Paint Bucket">
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" style="display:block">
                <path d="M16.56 8.94L7.62 0 6.21 1.41l2.38 2.38-5.15 5.15c-.59.57-.59 1.53 0 2.12l5.5 5.5c.29.29.68.44 1.06.44s.77-.15 1.06-.44l5.5-5.5c.59-.58.59-1.53 0-2.12zM5.21 10 10 5.21 14.79 10z" fill="currentColor"/>
                <path d="M19 11.5s-2 2.17-2 3.5c0 1.1.9 2 2 2s2-.9 2-2c0-1.33-2-3.5-2-3.5z" fill="currentColor"/>
              </svg>
            </button>
            <button type="button" class="petal-tool-btn" data-pd-tool="erase" title="Erase Fill">
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" style="display:block">
                <path d="M15.14 3c-.51 0-1.02.2-1.41.59L2.59 14.73c-.78.77-.78 2.04 0 2.83L5.03 20H20v-2h-6.84l7.25-7.26c.78-.78.78-2.05 0-2.83L16.56 3.59c-.4-.39-.91-.59-1.42-.59zm0 2 1.42 1.42L5.82 17H4v-1.84z" fill="currentColor"/>
              </svg>
            </button>
            <button type="button" class="petal-close" data-pd-close title="Close">&#215;</button>
          </div>
        </div>
        <div class="p-3">
          <div class="flex flex-wrap gap-3 mb-3 items-center">
            <label class="flex items-center gap-2 text-xs">
              <span class="text-vectura-muted">Fill</span>
              <select data-pd-fill-type class="bg-vectura-bg border border-vectura-border px-1 py-0.5 text-xs focus:outline-none focus:border-vectura-accent">${fillOptions}</select>
            </label>
            <label class="flex items-center gap-2 text-xs">
              <span class="text-vectura-muted">Density</span>
              <input type="number" data-pd-density value="5" min="0.5" max="50" step="0.5"
                     class="w-14 bg-vectura-bg border border-vectura-border px-1 py-0.5 text-xs focus:outline-none focus:border-vectura-accent">
            </label>
            <label class="flex items-center gap-2 text-xs">
              <span class="text-vectura-muted">Pen</span>
              <select data-pd-pen class="bg-vectura-bg border border-vectura-border px-1 py-0.5 text-xs focus:outline-none focus:border-vectura-accent">
                <option value="">Layer default</option>
                ${pens}
              </select>
            </label>
          </div>
          <div class="relative border border-vectura-border" style="height:320px;overflow:hidden;background:#0e0e11;">
            <canvas data-pd-canvas style="position:absolute;top:0;left:0;touch-action:none;cursor:crosshair;"></canvas>
          </div>
          <div class="flex items-center justify-between mt-3">
            <button type="button" class="petal-copy-btn" data-pd-clear>Clear all fills</button>
            <span class="text-[11px] text-vectura-muted" data-pd-status>Click a closed region to fill it</span>
          </div>
        </div>`;
    },

    openPatternDesigner(layer) {
      if (!layer || layer.type !== 'pattern') {
        this.openModal({
          title: 'Pattern Designer',
          body: '<p class="modal-text">Add or select a <strong>Pattern</strong> layer first to open the Pattern Designer.</p>',
        });
        return;
      }
      this.ensurePatternLayerSelection(layer);
      this.closePatternDesigner();
      const root = document.createElement('div');
      root.id = 'pattern-designer-window';
      root.className = 'petal-designer-window';
      root.innerHTML = this.createPatternDesignerMarkup();
      document.body.appendChild(root);
      const pd = {
        root,
        layer,
        tool: 'fill',
        fills: (layer.params.patternFills || []).map(f => ({ ...f, region: (f.region || []).slice() })),
        view: { zoom: 1, offsetX: 0, offsetY: 0 },
      };
      this.patternDesigner = pd;
      this._bindPatternDesignerDrag(pd);
      this._bindPatternDesignerControls(pd);
      this._bindPatternDesignerCanvas(pd);
      this._initPatternDesignerView(pd);
      this._renderPatternDesigner(pd);
      root.querySelector('[data-pd-tool="fill"]')?.classList.add('active');
    },

    closePatternDesigner() {
      if (!this.patternDesigner) return;
      const { root, cleanupCanvas, cleanupDrag } = this.patternDesigner;
      if (cleanupCanvas) cleanupCanvas();
      if (cleanupDrag) cleanupDrag();
      if (root && root.parentElement) root.remove();
      this.patternDesigner = null;
    },

    _bindPatternDesignerDrag(pd) {
      const header = pd.root.querySelector('[data-pd-header]');
      if (!header) return;
      let drag = null;
      const onDown = (e) => {
        if (e.target.closest('button,select,input')) return;
        const rect = pd.root.getBoundingClientRect();
        drag = { sx: e.clientX, sy: e.clientY, ox: rect.left, oy: rect.top };
        pd.root.classList.add('dragging');
        pd.root.style.transform = '';
        e.preventDefault();
      };
      const onMove = (e) => {
        if (!drag) return;
        pd.root.style.left = `${drag.ox + e.clientX - drag.sx}px`;
        pd.root.style.top = `${drag.oy + e.clientY - drag.sy}px`;
      };
      const onUp = () => { drag = null; pd.root.classList.remove('dragging'); };
      header.addEventListener('pointerdown', onDown);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      pd.cleanupDrag = () => {
        header.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      pd.root.style.top = '60px';
      pd.root.style.left = '50%';
      pd.root.style.transform = 'translateX(-50%)';
    },

    _initPatternDesignerView(pd) {
      const canvas = pd.root.querySelector('[data-pd-canvas]');
      if (!canvas) return;
      const wrap = canvas.parentElement;
      const wrapW = wrap.clientWidth || 460;
      const wrapH = wrap.clientHeight || 320;
      canvas.width = wrapW;
      canvas.height = wrapH;
      canvas.style.width = wrapW + 'px';
      canvas.style.height = wrapH + 'px';
      const data = window.Vectura.AlgorithmRegistry?.patternGetGroups?.(pd.layer.params.patternId);
      if (!data) return;
      const margin = 32;
      const zoom = Math.min((wrapW - margin * 2) / data.vbW, (wrapH - margin * 2) / data.vbH);
      pd.view = {
        zoom,
        offsetX: (wrapW - data.vbW * zoom) / 2,
        offsetY: (wrapH - data.vbH * zoom) / 2,
      };
    },

    _renderPatternDesigner(pd) {
      const canvas = pd.root.querySelector('[data-pd-canvas]');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const { zoom, offsetX, offsetY } = pd.view;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#0e0e11';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const data = window.Vectura.AlgorithmRegistry?.patternGetGroups?.(pd.layer.params.patternId);
      if (!data) return;
      const cx = (x) => offsetX + x * zoom;
      const cy = (y) => offsetY + y * zoom;
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(100,180,255,0.25)';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx(0), cy(0), data.vbW * zoom, data.vbH * zoom);
      ctx.setLineDash([]);
      for (const fill of pd.fills) {
        if (!fill.region || fill.region.length < 3) continue;
        ctx.beginPath();
        ctx.moveTo(cx(fill.region[0].x), cy(fill.region[0].y));
        for (let i = 1; i < fill.region.length; i++) ctx.lineTo(cx(fill.region[i].x), cy(fill.region[i].y));
        ctx.closePath();
        ctx.fillStyle = 'rgba(68,136,255,0.12)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(68,136,255,0.45)';
        ctx.lineWidth = 1;
        ctx.stroke();
        const fillPaths = window.Vectura.AlgorithmRegistry?._generatePatternFillPaths?.(fill) || [];
        ctx.strokeStyle = 'rgba(68,136,255,0.65)';
        ctx.lineWidth = 0.8;
        for (const fp of fillPaths) {
          if (fp.length < 2) continue;
          ctx.beginPath();
          ctx.moveTo(cx(fp[0].x), cy(fp[0].y));
          for (let i = 1; i < fp.length; i++) ctx.lineTo(cx(fp[i].x), cy(fp[i].y));
          ctx.stroke();
        }
      }
      ctx.strokeStyle = 'rgba(230,230,230,0.85)';
      ctx.lineWidth = 1;
      for (const group of data.groups) {
        for (const path of group.paths) {
          if (path.length < 2) continue;
          ctx.beginPath();
          ctx.moveTo(cx(path[0].x), cy(path[0].y));
          for (let i = 1; i < path.length; i++) ctx.lineTo(cx(path[i].x), cy(path[i].y));
          ctx.stroke();
        }
      }
    },

    _bindPatternDesignerCanvas(pd) {
      const canvas = pd.root.querySelector('[data-pd-canvas]');
      if (!canvas) return;
      const toTile = (ex, ey) => ({
        x: (ex - pd.view.offsetX) / pd.view.zoom,
        y: (ey - pd.view.offsetY) / pd.view.zoom,
      });
      const getRegion = (tx, ty) => {
        const data = window.Vectura.AlgorithmRegistry?.patternGetGroups?.(pd.layer.params.patternId);
        const pip = window.Vectura.AlgorithmRegistry?._polyContainsPoint;
        if (!data || !pip) return null;
        const sensitivityEl = pd.root.querySelector('[data-pd-sensitivity]');
        const sensitivity = parseFloat(sensitivityEl?.value) || (pd.layer.params.fillSensitivity ?? 2.0);
        let best = null, bestArea = Infinity;
        for (const group of data.groups) {
          for (const path of group.paths) {
            if (path.length < 3) continue;
            const f = path[0], l = path[path.length - 1];
            if (Math.hypot(f.x - l.x, f.y - l.y) > sensitivity) continue;
            if (!pip(path, tx, ty)) continue;
            let minX = f.x, maxX = f.x, minY = f.y, maxY = f.y;
            for (const p of path) {
              if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
              if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
            }
            const area = (maxX - minX) * (maxY - minY);
            if (area < bestArea) { bestArea = area; best = path; }
          }
        }
        return best;
      };
      let panState = null;
      const onDown = (e) => {
        const rect = canvas.getBoundingClientRect();
        const ex = e.clientX - rect.left, ey = e.clientY - rect.top;
        if (e.button === 1 || (e.button === 0 && e.altKey)) {
          panState = { sx: ex, sy: ey, ox: pd.view.offsetX, oy: pd.view.offsetY };
          e.preventDefault();
          return;
        }
        if (e.button !== 0) return;
        const { x: tx, y: ty } = toTile(ex, ey);
        if (pd.tool === 'fill') {
          const region = getRegion(tx, ty);
          const statusEl = pd.root.querySelector('[data-pd-status]');
          if (!region) {
            if (statusEl) statusEl.textContent = 'No closed region at click point';
            return;
          }
          const f = region[0], l = region[region.length - 1];
          const poly = Math.hypot(f.x - l.x, f.y - l.y) < 0.5 ? region.slice(0, -1) : region.slice();
          const fillTypeEl = pd.root.querySelector('[data-pd-fill-type]');
          const densityEl = pd.root.querySelector('[data-pd-density]');
          const penEl = pd.root.querySelector('[data-pd-pen]');
          pd.history.push(pd.fills.map(f => ({ ...f, region: f.region.slice() })));
          pd.fills.push({
            id: `fill-${Date.now()}`,
            region: poly,
            fillType: fillTypeEl?.value || 'hatch',
            density: parseFloat(densityEl?.value) || 5,
            penId: penEl?.value || null,
          });
          this._applyPatternDesignerChanges(pd);
        } else if (pd.tool === 'erase') {
          const pip = window.Vectura.AlgorithmRegistry?._polyContainsPoint;
          if (!pip) return;
          const before = pd.fills.length;
          pd.fills = pd.fills.filter(fill => !pip(fill.region, tx, ty));
          if (pd.fills.length !== before) this._applyPatternDesignerChanges(pd);
        }
      };
      const onMove = (e) => {
        if (!panState) return;
        const rect = canvas.getBoundingClientRect();
        pd.view.offsetX = panState.ox + (e.clientX - rect.left - panState.sx);
        pd.view.offsetY = panState.oy + (e.clientY - rect.top - panState.sy);
        this._renderPatternDesigner(pd);
      };
      const onUp = () => { panState = null; };
      const onWheel = (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const ex = e.clientX - rect.left, ey = e.clientY - rect.top;
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        const newZoom = Math.max(0.1, Math.min(40, pd.view.zoom * factor));
        pd.view.offsetX = ex - (ex - pd.view.offsetX) * (newZoom / pd.view.zoom);
        pd.view.offsetY = ey - (ey - pd.view.offsetY) * (newZoom / pd.view.zoom);
        pd.view.zoom = newZoom;
        this._renderPatternDesigner(pd);
      };
      canvas.addEventListener('pointerdown', onDown);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      canvas.addEventListener('wheel', onWheel, { passive: false });
      pd.cleanupCanvas = () => {
        canvas.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('wheel', onWheel);
      };
    },

    _bindPatternDesignerControls(pd) {
      pd.root.querySelectorAll('[data-pd-tool]').forEach(btn => {
        btn.addEventListener('click', () => {
          pd.tool = btn.dataset.pdTool;
          pd.root.querySelectorAll('[data-pd-tool]').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        });
      });
      pd.root.querySelector('[data-pd-close]')?.addEventListener('click', () => this.closePatternDesigner());
      pd.root.querySelector('[data-pd-clear]')?.addEventListener('click', () => {
        pd.fills = [];
        this._applyPatternDesignerChanges(pd);
      });
    },

    _applyPatternDesignerChanges(pd) {
      const layer = pd.layer;
      if (this.app.pushHistory) this.app.pushHistory();
      layer.params.patternFills = pd.fills.map(f => ({
        id: f.id,
        region: f.region,
        fillType: f.fillType,
        density: f.density,
        penId: f.penId || null,
      }));
      const sensitivityEl = pd.root.querySelector('[data-pd-sensitivity]');
      if (sensitivityEl) layer.params.fillSensitivity = parseFloat(sensitivityEl.value) || 2.0;
      this.storeLayerParams(layer);
      this.app.regen();
      this._renderPatternDesigner(pd);
      if (pd.inline && this._renderFillsList) this._renderFillsList(pd);
      const statusEl = pd.root.querySelector('[data-pd-status]');
      if (statusEl) {
        const n = pd.fills.length;
        statusEl.textContent = n === 0 ? 'Click a closed region to fill it' : `${n} fill${n !== 1 ? 's' : ''} active`;
      }
    },
  };
})();
