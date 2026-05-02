/**
 * Pattern Designer methods for the UI class — mixed into UI.prototype by ui.js.
 */
(() => {
  const getPatternRegistry = () => window.Vectura?.PatternRegistry || null;
  const getPatternCatalog = () =>
    (window.Vectura?.PatternRegistry?.getPatterns?.() || window.Vectura?.PATTERNS || []);
  const clone = (value) => JSON.parse(JSON.stringify(value));

  const escapeHtml = (str) => {
    if (typeof str !== 'string') return String(str ?? '');
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  const cloneRegion = (region = []) => (region || []).map((pt) => ({ ...pt }));
  const cloneFillRecord = (fill = {}) => ({
    ...fill,
    regions: (fill.regions || (fill.region ? [fill.region] : [])).map((region) => cloneRegion(region)),
    region: Array.isArray(fill.region) ? cloneRegion(fill.region) : null,
    targetIds: Array.isArray(fill.targetIds) ? fill.targetIds.slice() : [],
  });

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
      const patterns = getPatternCatalog();
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
        fills: (layer.params.patternFills || []).map((f) => cloneFillRecord(f)),
        history: [],
        view: { zoom: 1, offsetX: 0, offsetY: 0 },
        cleanupCanvas: null,
        cleanupKeys: null,
        inline: true,
        gapTolerance: Math.max(0, parseFloat(layer.params.patternGapTolerance ?? 0) || 0),
        dragFillSession: null,
        selectedPath: null,
        pendingAnchors: [],
        dragShape: null,
        shadowTiles: false,
        pathMap: [],
        directEditState: null,
        trimMargins: { top: 0, bottom: 0, left: 0, right: 0, locked: false },
        draftEdit: null,
        moveDrag: null,
      };

      this.inlinePatternDesigner = pd;
      this._buildPatternDesignerPanel(pd);
      this._initPatternDesignerView(pd);
      this._renderPatternDesigner(pd);
      this._bindInlinePatternDesignerKeys(pd);
    },

    _clonePatternFills(fills = []) {
      return (fills || []).map((fill) => cloneFillRecord(fill));
    },

    _getPatternFillTargets(pd) {
      return window.Vectura.AlgorithmRegistry?.patternGetFillTargets?.(pd.layer.params.patternId, {
        cache: true,
      }) || null;
    },

    _buildFillRecordFromTarget(pd, target, options = {}) {
      if (!target) return null;
      const fillTypeEl = pd.root.querySelector('[data-pd-fill-type]');
      const densityEl = pd.root.querySelector('[data-pd-density]');
      const penEl = pd.root.querySelector('[data-pd-pen]');
      return {
        id: `fill-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        targetIds: [target.id],
        regions: (target.regions || []).map((region) => cloneRegion(region)),
        region: cloneRegion(target.outer || target.regions?.[0] || []),
        fillType: fillTypeEl?.value || 'hatch',
        density: parseFloat(densityEl?.value) || 1,
        penId: penEl?.value || null,
        angle: 0,
        amplitude: 1.0,
        dotSize: 1.0,
        padding: 0,
        shiftX: 0,
        shiftY: 0,
      };
    },

    _fillMatchesTarget(fill, target) {
      if (!fill || !target) return false;
      if (Array.isArray(fill.targetIds) && fill.targetIds.includes(target.id)) return true;
      const regions = fill.regions || (fill.region ? [fill.region] : []);
      if (regions.length !== (target.regions || []).length) return false;
      return regions.every((region, index) => {
        const ref = target.regions[index];
        if (!Array.isArray(region) || !Array.isArray(ref) || region.length !== ref.length) return false;
        return region.every((pt, ptIndex) =>
          Math.hypot(pt.x - ref[ptIndex].x, pt.y - ref[ptIndex].y) < 1e-6
        );
      });
    },

    _refreshFillRegions(pd) {
      const compiled = window.Vectura.AlgorithmRegistry?.patternGetFillTargets?.(
        pd.layer.params.patternId, { cache: false }
      );
      if (!compiled?.targets) return;
      pd.fills.forEach((fill) => {
        if (!Array.isArray(fill.targetIds) || !fill.targetIds.length) return;
        const target = compiled.targets.find((t) => fill.targetIds.includes(t.id));
        if (!target) return;
        fill.regions = (target.regions || []).map((region) => region.map((pt) => ({ ...pt })));
        fill.region = (target.outer || target.regions?.[0] || []).map((pt) => ({ ...pt }));
      });
    },

    _buildPatternDesignerPanel(pd) {
      const SETTINGS = window.Vectura.SETTINGS || {};
      const FillPanel = window.Vectura?.FillPanel;
      const fillOptions = (FillPanel?.FILL_TYPE_OPTIONS || [
        { value: 'hatch',      label: 'Hatch' },
        { value: 'crosshatch', label: 'Crosshatch' },
        { value: 'wavelines',  label: 'Wavy lines' },
        { value: 'zigzag',     label: 'Zigzag' },
        { value: 'stipple',    label: 'Stipple' },
        { value: 'contour',    label: 'Contour' },
        { value: 'spiral',     label: 'Spiral' },
        { value: 'radial',     label: 'Radial' },
        { value: 'grid',       label: 'Grid Dots' },
        { value: 'polygonal',  label: 'Polygonal' },
      ]).filter(o => o.value !== 'none')
        .map(o => `<option value="${o.value}">${o.label}</option>`).join('');
      const pens = (SETTINGS.pens || []).map(pen =>
        `<option value="${escapeHtml(pen.id)}">${escapeHtml(pen.name || pen.id)}</option>`
      ).join('');
      const toolMarkup = this.buildSharedToolbarMarkup([
        { tool: 'select', value: 'select', title: 'Select Path (S)' },
        { tool: 'move', value: 'move', title: 'Move Path (V)' },
        { tool: 'direct', value: 'direct', title: 'Direct Select — edit points (A)' },
        { tool: 'pen', value: 'pen', title: 'Draw Path (P)' },
        { tool: 'shape-rect', value: 'shape-rect', title: 'Rectangle (R)' },
        { tool: 'shape-oval', value: 'shape-oval', title: 'Oval (O)' },
        { tool: 'fill', value: 'fill', title: 'Paint Bucket (F)' },
        { tool: 'fill-erase', value: 'fill-erase', title: 'Erase Fill (Alt while filling)' },
      ], {
        buttonClass: 'pd-tool-btn',
        buttonAttr: 'data-pd-tool',
      });

      pd.root.innerHTML = `
        <div class="flex items-center justify-between mb-2 px-1">
          <div class="flex items-center gap-1.5">
            <span class="text-[11px] font-medium text-vectura-accent uppercase tracking-wide">Pattern Designer</span>
            <span data-pd-draft-badge class="hidden text-[9px] bg-vectura-accent text-black px-1 py-px rounded leading-tight">Unsaved</span>
          </div>
          <div class="flex gap-1 items-center">
            <button type="button" class="text-[10px] border border-vectura-border px-2 py-1 hover:bg-vectura-border text-vectura-muted transition-colors" data-pd-import-tile>
              Import SVG Tile
            </button>
            <button type="button" class="text-[10px] border border-vectura-border px-2 py-1 hover:bg-vectura-border text-vectura-muted transition-colors" data-pd-save-custom>
              Save Pattern
            </button>
            <button type="button" class="text-[10px] border border-vectura-border px-2 py-1 hover:bg-vectura-border text-vectura-muted transition-colors" data-pd-open-library>
              Load Saved
            </button>
            ${toolMarkup}
          </div>
        </div>
        <div data-pd-fill-settings class="hidden flex flex-wrap gap-2 mb-2 items-center text-[11px]">
          <label class="flex items-center gap-1"><span class="text-vectura-muted">Fill</span>
            <select data-pd-fill-type class="bg-vectura-bg border border-vectura-border px-1 py-0.5 text-[11px] focus:outline-none focus:border-vectura-accent">${fillOptions}</select>
          </label>
          <label class="flex items-center gap-1"><span class="text-vectura-muted">Density</span>
            <input type="number" data-pd-density value="1" min="0.5" max="50" step="0.5"
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
          <div class="flex items-center gap-3">
            <span class="text-[10px] text-vectura-muted" data-pd-status>Click a closed region to fill it</span>
            <label class="flex items-center gap-1 text-[10px] text-vectura-muted cursor-pointer select-none">
              <input type="checkbox" data-pd-shadow-tiles class="accent-vectura-accent"> Neighbors
            </label>
          </div>
          <button type="button" class="text-[10px] text-vectura-muted hover:text-vectura-accent transition-colors" data-pd-clear>Clear all</button>
        </div>
        <div data-pd-path-actions class="hidden flex flex-col gap-1 mb-1 text-[10px]">
          <div class="flex gap-1">
            <button type="button" class="border border-vectura-danger text-vectura-danger px-2 py-0.5 hover:bg-vectura-danger hover:text-white transition-colors" data-pd-delete-path>Delete Path</button>
            <button type="button" class="border border-vectura-border text-vectura-muted px-2 py-0.5 hover:bg-vectura-border transition-colors" data-pd-trim-path>Trim to Tile</button>
          </div>
          <div class="flex items-center gap-1 text-vectura-muted">
            <span class="shrink-0">Margins:</span>
            <label class="flex items-center gap-0.5">T<input type="number" data-pd-margin="top" min="0" max="5" step="1" value="0" class="w-8 bg-transparent border border-vectura-border text-center text-vectura-fg rounded-none px-0.5 py-px"></label>
            <label class="flex items-center gap-0.5">B<input type="number" data-pd-margin="bottom" min="0" max="5" step="1" value="0" class="w-8 bg-transparent border border-vectura-border text-center text-vectura-fg rounded-none px-0.5 py-px"></label>
            <label class="flex items-center gap-0.5">L<input type="number" data-pd-margin="left" min="0" max="5" step="1" value="0" class="w-8 bg-transparent border border-vectura-border text-center text-vectura-fg rounded-none px-0.5 py-px"></label>
            <label class="flex items-center gap-0.5">R<input type="number" data-pd-margin="right" min="0" max="5" step="1" value="0" class="w-8 bg-transparent border border-vectura-border text-center text-vectura-fg rounded-none px-0.5 py-px"></label>
            <button type="button" data-pd-margin-lock title="Lock all sides" class="px-1 py-px border border-vectura-border text-vectura-muted hover:text-vectura-accent transition-colors" aria-pressed="false">&#128275;</button>
          </div>
        </div>
        <div data-pd-fills-list class="space-y-1"></div>
        <details class="text-[10px] text-vectura-muted mt-2 border border-vectura-border px-2 py-1">
          <summary class="cursor-pointer select-none">&#8505; User Patterns &amp; Storage</summary>
          <p class="mt-1 leading-snug">User Patterns are saved in your browser&rsquo;s localStorage. They persist across sessions on this device but may be cleared if you clear browser data. Use <strong>Export</strong> on any User Pattern to save a permanent copy to disk.</p>
        </details>
        <div class="mt-3 border-t border-vectura-border pt-3">
          <div class="flex items-center justify-between mb-2">
            <span class="text-[10px] uppercase tracking-widest text-vectura-muted">Tile Validation</span>
            <span class="text-[10px] text-vectura-muted" data-pd-validation-summary>Checking…</span>
          </div>
          <div class="relative border border-vectura-border mb-2" style="height:150px;overflow:hidden;background:#0e0e11;">
            <canvas data-pd-preview-canvas style="position:absolute;top:0;left:0;"></canvas>
          </div>
          <label class="flex items-center gap-2 text-[11px] mb-2">
            <span class="text-vectura-muted">Show Gaps</span>
            <input type="range" min="0" max="24" step="0.5" value="${pd.gapTolerance ?? 0}" data-pd-gap-slider class="flex-1">
            <span class="text-vectura-muted w-10 text-right" data-pd-gap-value>${(pd.gapTolerance ?? 0).toFixed(1)}px</span>
          </label>
          <div data-pd-validation-issues class="space-y-1"></div>
        </div>`;

      this._bindPatternDesignerControls(pd);
      this._bindPatternDesignerCanvas(pd);
      this._bindPatternDesignerEditTools(pd);
      pd.root.querySelector(`[data-pd-tool="${pd.tool}"]`)?.classList.add('active');
      this._renderFillsList(pd);
      window.requestAnimationFrame(() => {
        this._initPatternDesignerView(pd);
        this._renderPatternDesigner(pd);
      });
    },

    _renderFillsList(pd) {
      const SETTINGS = window.Vectura.SETTINGS || {};
      const FillPanel = window.Vectura.FillPanel;
      const FILL_CAPS = FillPanel?.FILL_CAPS || {};
      const listEl = pd.root.querySelector('[data-pd-fills-list]');
      if (!listEl) return;
      listEl.innerHTML = '';
      if (!pd.fills.length) return;

      const fillOptions = FillPanel
        ? FillPanel.FILL_TYPE_OPTIONS.filter((o) => o.value !== 'none')
        : [
            { value: 'hatch',      label: 'Hatch' },
            { value: 'crosshatch', label: 'Crosshatch' },
            { value: 'wavelines',  label: 'Wavy lines' },
            { value: 'zigzag',     label: 'Zigzag' },
            { value: 'stipple',    label: 'Stipple' },
            { value: 'contour',    label: 'Contour' },
            { value: 'spiral',     label: 'Spiral' },
            { value: 'radial',     label: 'Radial' },
            { value: 'grid',       label: 'Grid Dots' },
            { value: 'polygonal',  label: 'Polygonal' },
          ];

      const pens = SETTINGS.pens || [];

      const updateParamVisibility = (paramsRow, fillType) => {
        const caps = FILL_CAPS[fillType] || {};
        const angleWrap = paramsRow.querySelector('[data-fl-angle-wrap]');
        const ampWrap = paramsRow.querySelector('[data-fl-amplitude-wrap]');
        const dotWrap = paramsRow.querySelector('[data-fl-dotsize-wrap]');
        const shiftWrap = paramsRow.querySelector('[data-fl-shift-wrap]');
        if (angleWrap) angleWrap.style.display = caps.angle ? '' : 'none';
        if (ampWrap) ampWrap.style.display = caps.amplitude ? '' : 'none';
        if (dotWrap) dotWrap.style.display = caps.dotSize ? '' : 'none';
        if (shiftWrap) shiftWrap.style.display = caps.shift ? '' : 'none';
      };

      pd.fills.forEach((fill, idx) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'border border-vectura-border bg-vectura-bg mb-0.5';

        const fillOpts = fillOptions
          .map((o) => `<option value="${o.value}"${fill.fillType === o.value ? ' selected' : ''}>${o.label}</option>`)
          .join('');
        const penOpts =
          `<option value=""${!fill.penId ? ' selected' : ''}>Default</option>` +
          pens.map((p) => `<option value="${p.id}"${fill.penId === p.id ? ' selected' : ''}>${p.name || p.id}</option>`).join('');

        const row1 = document.createElement('div');
        row1.className = 'flex items-center gap-1 text-[10px] px-1.5 py-1';
        row1.innerHTML = `
          <span class="text-vectura-muted flex-shrink-0">#${idx + 1}</span>
          <select class="bg-vectura-bg border border-vectura-border px-0.5 py-0 text-[10px] focus:outline-none flex-1 min-w-0" data-fl-type>${fillOpts}</select>
          <input type="number" class="bg-vectura-bg border border-vectura-border px-0.5 py-0 text-[10px] w-10 focus:outline-none" data-fl-density value="${fill.density ?? 1}" min="0.5" max="50" step="0.5" title="Density">
          <select class="bg-vectura-bg border border-vectura-border px-0.5 py-0 text-[10px] focus:outline-none w-16 min-w-0" data-fl-pen>${penOpts}</select>
          <button type="button" class="text-vectura-muted hover:text-red-400 transition-colors flex-shrink-0 ml-0.5" data-fl-del title="Delete fill">×</button>`;

        const row2 = document.createElement('div');
        row2.className = 'flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] px-1.5 pb-1 text-vectura-muted';
        row2.innerHTML = `
          <span data-fl-angle-wrap class="flex items-center gap-0.5">
            <span title="Angle">∠</span><input type="number" class="bg-vectura-bg border border-vectura-border px-0.5 py-0 text-[9px] w-9 focus:outline-none" data-fl-angle value="${fill.angle ?? 0}" min="0" max="360" step="1" title="Angle (°)">°
          </span>
          <span data-fl-amplitude-wrap class="flex items-center gap-0.5">
            <span>amp</span><input type="number" class="bg-vectura-bg border border-vectura-border px-0.5 py-0 text-[9px] w-10 focus:outline-none" data-fl-amplitude value="${fill.amplitude ?? 1.0}" min="0.1" max="3.0" step="0.05" title="Amplitude">
          </span>
          <span data-fl-dotsize-wrap class="flex items-center gap-0.5">
            <span>dot</span><input type="number" class="bg-vectura-bg border border-vectura-border px-0.5 py-0 text-[9px] w-10 focus:outline-none" data-fl-dotsize value="${fill.dotSize ?? 1.0}" min="0.1" max="3.0" step="0.05" title="Dot size">
          </span>
          <span class="flex items-center gap-0.5">
            <span>pad</span><input type="number" class="bg-vectura-bg border border-vectura-border px-0.5 py-0 text-[9px] w-10 focus:outline-none" data-fl-padding value="${fill.padding ?? 0}" min="0" max="10" step="0.1" title="Padding (mm)">
          </span>
          <span data-fl-shift-wrap class="flex items-center gap-0.5">
            <span>dx</span><input type="number" class="bg-vectura-bg border border-vectura-border px-0.5 py-0 text-[9px] w-9 focus:outline-none" data-fl-shiftx value="${fill.shiftX ?? 0}" min="-50" max="50" step="0.5" title="Shift X">
            <span>dy</span><input type="number" class="bg-vectura-bg border border-vectura-border px-0.5 py-0 text-[9px] w-9 focus:outline-none" data-fl-shifty value="${fill.shiftY ?? 0}" min="-50" max="50" step="0.5" title="Shift Y">
          </span>`;

        updateParamVisibility(row2, fill.fillType);

        row1.querySelector('[data-fl-type]').addEventListener('change', (e) => {
          fill.fillType = e.target.value;
          updateParamVisibility(row2, fill.fillType);
          this._applyPatternDesignerChanges(pd);
        });
        row1.querySelector('[data-fl-density]').addEventListener('change', (e) => {
          fill.density = parseFloat(e.target.value) || 1;
          this._applyPatternDesignerChanges(pd);
        });
        row1.querySelector('[data-fl-pen]').addEventListener('change', (e) => {
          fill.penId = e.target.value || null;
          this._applyPatternDesignerChanges(pd);
        });
        row1.querySelector('[data-fl-del]').addEventListener('click', () => {
          this._pushPdHistory(pd);
          pd.fills.splice(idx, 1);
          this._applyPatternDesignerChanges(pd);
        });
        row2.querySelector('[data-fl-angle]').addEventListener('change', (e) => {
          fill.angle = parseFloat(e.target.value) || 0;
          this._applyPatternDesignerChanges(pd);
        });
        row2.querySelector('[data-fl-amplitude]').addEventListener('change', (e) => {
          fill.amplitude = parseFloat(e.target.value) || 1.0;
          this._applyPatternDesignerChanges(pd);
        });
        row2.querySelector('[data-fl-dotsize]').addEventListener('change', (e) => {
          fill.dotSize = parseFloat(e.target.value) || 1.0;
          this._applyPatternDesignerChanges(pd);
        });
        row2.querySelector('[data-fl-padding]').addEventListener('change', (e) => {
          fill.padding = parseFloat(e.target.value) ?? 0;
          this._applyPatternDesignerChanges(pd);
        });
        row2.querySelector('[data-fl-shiftx]').addEventListener('change', (e) => {
          fill.shiftX = parseFloat(e.target.value) || 0;
          this._applyPatternDesignerChanges(pd);
        });
        row2.querySelector('[data-fl-shifty]').addEventListener('change', (e) => {
          fill.shiftY = parseFloat(e.target.value) || 0;
          this._applyPatternDesignerChanges(pd);
        });

        wrapper.appendChild(row1);
        wrapper.appendChild(row2);
        listEl.appendChild(wrapper);
      });
    },

    _bindInlinePatternDesignerKeys(pd) {
      const handler = (e) => {
        if (!pd?.root) return;
        if (e.key === 'z' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          const entry = pd.history.pop();
          if (!entry) return;
          const fills = entry.fills ?? entry;
          const svgState = entry.svgState ?? null;
          pd.fills = fills;
          if (svgState) {
            const registry = getPatternRegistry();
            const meta = this._getPatternMetaForLayer(pd.layer);
            if (registry && meta) {
              registry.saveCustomPattern({ ...meta, svg: svgState.svg, cachedTile: null, validation: null });
              window.Vectura.AlgorithmRegistry?.patternInvalidateCache?.(svgState.patternId);
              pd.directEditState = null;
              this.app.regen();
            }
          }
          this._applyPatternDesignerChanges(pd);
          return;
        }
        if (e.key === 'f' || e.key === 'F') {
          pd.tool = e.shiftKey ? 'fill-erase' : 'fill';
          pd.root.querySelectorAll('[data-pd-tool]').forEach((b) => b.classList.toggle('active', b.dataset.pdTool === pd.tool));
        }
        if (e.key === 'v' || e.key === 'V') {
          pd.tool = 'move';
          pd.moveDrag = null;
          pd.directEditState = null;
          pd.pendingAnchors = [];
          pd.dragShape = null;
          this._syncPdToolActive(pd);
          this._renderPatternDesigner(pd);
        }
        if (e.key === 'Alt' && pd.tool === 'fill') {
          pd.root.querySelectorAll('[data-pd-tool]').forEach((b) => b.classList.toggle('active', b.dataset.pdTool === 'fill-erase'));
        }
      };
      const onKeyUp = (e) => {
        if (e.key !== 'Alt' || !pd?.root) return;
        pd.root.querySelectorAll('[data-pd-tool]').forEach((b) => b.classList.toggle('active', b.dataset.pdTool === pd.tool));
      };
      window.addEventListener('keydown', handler);
      window.addEventListener('keyup', onKeyUp);
      pd.cleanupKeys = () => {
        window.removeEventListener('keydown', handler);
        window.removeEventListener('keyup', onKeyUp);
      };
    },

    createPatternDesignerMarkup() {
      const SETTINGS = window.Vectura.SETTINGS || {};
      const FillPanel2 = window.Vectura?.FillPanel;
      const fillOptions = (FillPanel2?.FILL_TYPE_OPTIONS || [
        { value: 'hatch',      label: 'Hatch' },
        { value: 'crosshatch', label: 'Crosshatch' },
        { value: 'wavelines',  label: 'Wavy lines' },
        { value: 'zigzag',     label: 'Zigzag' },
        { value: 'stipple',    label: 'Stipple' },
        { value: 'contour',    label: 'Contour' },
        { value: 'spiral',     label: 'Spiral' },
        { value: 'radial',     label: 'Radial' },
        { value: 'grid',       label: 'Grid Dots' },
        { value: 'polygonal',  label: 'Polygonal' },
      ]).filter(o => o.value !== 'none')
        .map(o => `<option value="${o.value}">${o.label}</option>`).join('');
      const pens = (SETTINGS.pens || []).map(pen =>
        `<option value="${escapeHtml(pen.id)}">${escapeHtml(pen.name || pen.id)}</option>`
      ).join('');
      const toolMarkup = this.buildSharedToolbarMarkup([
        { tool: 'fill', value: 'fill', title: 'Paint Bucket (F)' },
        { tool: 'fill-erase', value: 'fill-erase', title: 'Erase Fill (Alt while filling)' },
      ], {
        buttonClass: 'petal-tool-btn',
        buttonAttr: 'data-pd-tool',
      });
      return `
        <div class="petal-designer-header" data-pd-header>
          <div class="petal-designer-title">Pattern Designer</div>
          <div class="petal-designer-actions">
            <button type="button" class="petal-copy-btn" data-pd-import-tile>Import SVG Tile</button>
            <button type="button" class="petal-copy-btn" data-pd-save-custom>Save Pattern</button>
            <button type="button" class="petal-copy-btn" data-pd-open-library>Load Saved</button>
            ${toolMarkup}
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
              <input type="number" data-pd-density value="1" min="0.5" max="50" step="0.5"
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
          <div class="mt-4 border-t border-vectura-border pt-3">
            <div class="flex items-center justify-between mb-2">
              <span class="text-[10px] uppercase tracking-widest text-vectura-muted">Tile Validation</span>
              <span class="text-[10px] text-vectura-muted" data-pd-validation-summary>Checking…</span>
            </div>
            <div class="relative border border-vectura-border mb-2" style="height:180px;overflow:hidden;background:#0e0e11;">
              <canvas data-pd-preview-canvas style="position:absolute;top:0;left:0;"></canvas>
            </div>
            <label class="flex items-center gap-2 text-[11px] mb-2">
              <span class="text-vectura-muted">Show Gaps</span>
              <input type="range" min="0" max="24" step="0.5" value="0" data-pd-gap-slider class="flex-1">
              <span class="text-vectura-muted w-10 text-right" data-pd-gap-value>0.0px</span>
            </label>
            <div data-pd-validation-issues class="space-y-1"></div>
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
        fills: (layer.params.patternFills || []).map((f) => cloneFillRecord(f)),
        view: { zoom: 1, offsetX: 0, offsetY: 0 },
        history: [],
        gapTolerance: Math.max(0, parseFloat(layer.params.patternGapTolerance ?? 0) || 0),
        dragFillSession: null,
        selectedPath: null,
        pendingAnchors: [],
        dragShape: null,
        shadowTiles: false,
        pathMap: [],
        directEditState: null,
        trimMargins: { top: 0, bottom: 0, left: 0, right: 0, locked: false },
        draftEdit: null,
        moveDrag: null,
      };
      this.patternDesigner = pd;
      this._bindPatternDesignerDrag(pd);
      this._bindPatternDesignerControls(pd);
      this._bindPatternDesignerCanvas(pd);
      this._bindPatternDesignerEditTools(pd);
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
      const cx = (x, dx = 0) => offsetX + (x + dx * data.vbW) * zoom;
      const cy = (y, dy = 0) => offsetY + (y + dy * data.vbH) * zoom;

      const drawGroups = (dx, dy, alpha) => {
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = alpha < 1 ? 'rgba(180,180,180,0.7)' : 'rgba(230,230,230,0.85)';
        ctx.lineWidth = 1;
        let flatIndex = 0;
        pd.pathMap = [];
        for (const group of data.groups) {
          for (const path of group.paths) {
            if (path.length < 2) { flatIndex++; continue; }
            const isSelected = alpha === 1 && pd.selectedPath !== null && pd.selectedPath === flatIndex;
            if (isSelected) {
              ctx.strokeStyle = 'rgba(80,200,120,1)';
              ctx.lineWidth = 2.5;
            } else {
              ctx.strokeStyle = alpha < 1 ? 'rgba(180,180,180,0.7)' : 'rgba(230,230,230,0.85)';
              ctx.lineWidth = 1;
            }
            ctx.beginPath();
            ctx.moveTo(cx(path[0].x, dx), cy(path[0].y, dy));
            for (let i = 1; i < path.length; i++) ctx.lineTo(cx(path[i].x, dx), cy(path[i].y, dy));
            ctx.stroke();
            if (alpha === 1) pd.pathMap.push({ path, flatIndex });
            flatIndex++;
          }
        }
        ctx.globalAlpha = 1;
      };

      // Shadow tiles (neighbors)
      if (pd.shadowTiles) {
        const offsets = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
        offsets.forEach(([dx, dy]) => {
          ctx.setLineDash([]);
          drawGroups(dx, dy, 0.35);
        });
      }

      // Primary tile boundary
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(100,180,255,0.25)';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx(0), cy(0), data.vbW * zoom, data.vbH * zoom);
      ctx.setLineDash([]);

      // Fills
      for (const fill of pd.fills) {
        const regions = fill.regions || (fill.region ? [fill.region] : []);
        regions.forEach((region, regionIndex) => {
          if (!Array.isArray(region) || region.length < 3) return;
          ctx.beginPath();
          ctx.moveTo(cx(region[0].x), cy(region[0].y));
          for (let i = 1; i < region.length; i += 1) ctx.lineTo(cx(region[i].x), cy(region[i].y));
          ctx.closePath();
          ctx.fillStyle = regionIndex === 0 ? 'rgba(68,136,255,0.12)' : 'rgba(14,14,17,0.95)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(68,136,255,0.45)';
          ctx.lineWidth = 1;
          ctx.stroke();
        });
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

      // Primary tile paths (with selection highlight)
      ctx.setLineDash([]);
      drawGroups(0, 0, 1);

      // Pen tool in-progress anchors
      if (pd.tool === 'pen' && pd.pendingAnchors.length > 0) {
        ctx.strokeStyle = 'rgba(255,200,80,0.9)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(cx(pd.pendingAnchors[0].x), cy(pd.pendingAnchors[0].y));
        for (let i = 1; i < pd.pendingAnchors.length; i++) {
          ctx.lineTo(cx(pd.pendingAnchors[i].x), cy(pd.pendingAnchors[i].y));
        }
        ctx.stroke();
        ctx.setLineDash([]);
        pd.pendingAnchors.forEach((pt, i) => {
          ctx.fillStyle = i === 0 ? 'rgba(255,100,100,0.9)' : 'rgba(255,200,80,0.9)';
          ctx.beginPath();
          ctx.arc(cx(pt.x), cy(pt.y), 3, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      // Shape drag preview
      if (pd.dragShape) {
        const { startX, startY, endX, endY, type } = pd.dragShape;
        const x0 = Math.min(startX, endX), y0 = Math.min(startY, endY);
        const w = Math.abs(endX - startX), h = Math.abs(endY - startY);
        ctx.strokeStyle = 'rgba(255,200,80,0.9)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        if (type === 'shape-oval') {
          ctx.beginPath();
          ctx.ellipse(cx(x0 + w / 2), cy(y0 + h / 2), w * zoom / 2, h * zoom / 2, 0, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.strokeRect(cx(x0), cy(y0), w * zoom, h * zoom);
        }
        ctx.setLineDash([]);
      }

      // Direct-select overlay
      if (pd.tool === 'direct' && pd.directEditState) {
        this._renderDirectSelectOverlay(ctx, pd, pd.directEditState, cx, cy, zoom);
      }

      // Move-tool preview overlay
      if (pd.tool === 'move' && pd.moveDrag?.moved) {
        const anchors = pd.moveDrag.currentAnchors;
        ctx.save();
        ctx.strokeStyle = 'rgba(251,191,36,0.7)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        anchors.forEach((a, i) => {
          if (i === 0) ctx.moveTo(cx(a.x), cy(a.y)); else ctx.lineTo(cx(a.x), cy(a.y));
        });
        if (pd.moveDrag.closed) ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      this._refreshPatternValidation(pd);
    },

    _getPatternMetaForLayer(layer) {
      if (!layer?.params?.patternId) return null;
      return getPatternCatalog().find((pattern) => pattern?.id === layer.params.patternId) || null;
    },

    _refreshPatternValidation(pd) {
      const summaryEl = pd.root.querySelector('[data-pd-validation-summary]');
      const issuesEl = pd.root.querySelector('[data-pd-validation-issues]');
      const previewCanvas = pd.root.querySelector('[data-pd-preview-canvas]');
      const meta = this._getPatternMetaForLayer(pd.layer);
      const validation = meta
        ? window.Vectura.AlgorithmRegistry?.patternValidateMeta?.(meta, { cache: true, gapTolerance: pd.gapTolerance || 0 })
        : null;
      pd.validation = validation || null;
      if (summaryEl) {
        if (!validation) summaryEl.textContent = 'No validation available';
        else if (validation.valid) summaryEl.textContent = 'Tile seams look valid';
        else summaryEl.textContent = `${validation.blockers} blocker${validation.blockers !== 1 ? 's' : ''}, ${validation.warnings} warning${validation.warnings !== 1 ? 's' : ''}`;
      }
      if (issuesEl) {
        issuesEl.innerHTML = '';
        const issues = validation?.issues || [];
        if (!issues.length) {
          issuesEl.innerHTML = '<div class="text-[10px] text-vectura-muted">No seam issues detected for the selected tile.</div>';
        } else {
          issues.slice(0, 6).forEach((issue) => {
            const row = document.createElement('div');
            const issueKind = issue.code === 'seam-gap' ? 'gap' : (issue.severity === 'blocker' ? 'blocker' : 'warning');
            row.className = `w-full text-left text-[10px] border px-2 py-1 transition-colors ${
              issueKind === 'gap'
                ? 'border-yellow-500/70 text-yellow-300'
                : issue.severity === 'blocker'
                  ? 'border-vectura-danger text-vectura-danger'
                  : 'border-vectura-border text-vectura-muted'
            }`;
            row.innerHTML = `
              <div class="flex items-start justify-between gap-2">
                <button type="button" class="flex-1 text-left hover:text-vectura-accent transition-colors" data-pd-issue-focus>${escapeHtml(issue.message)}</button>
                ${issue.autoFixable ? '<button type="button" class="petal-copy-btn !h-6 !min-w-0 px-2" data-pd-issue-fix>Auto-Close</button>' : ''}
              </div>
            `;
            row.querySelector('[data-pd-issue-focus]')?.addEventListener('click', () => {
              const point = Array.isArray(issue.points) && issue.points.length ? issue.points[0] : null;
              if (point) {
                const data = window.Vectura.AlgorithmRegistry?.patternGetGroups?.(pd.layer.params.patternId);
                const mainCanvas = pd.root.querySelector('[data-pd-canvas]');
                if (data && mainCanvas) {
                  const wrap = mainCanvas.parentElement;
                  const wrapW = wrap.clientWidth || 460;
                  const wrapH = wrap.clientHeight || 320;
                  pd.view = {
                    zoom: Math.min(8, pd.view.zoom * 1.35),
                    offsetX: wrapW / 2 - point.x * pd.view.zoom * 1.35,
                    offsetY: wrapH / 2 - point.y * pd.view.zoom * 1.35,
                  };
                  this._renderPatternDesigner(pd);
                }
              }
            });
            row.querySelector('[data-pd-issue-fix]')?.addEventListener('click', () => {
              this._applyPatternIssueAutoFix(pd, issue);
            });
            issuesEl.appendChild(row);
          });
        }
      }
      if (previewCanvas) this._renderPatternValidationPreview(previewCanvas, meta, validation);
    },

    _renderPatternValidationPreview(canvas, meta, validation) {
      if (!canvas || !meta) return;
      const compiled = validation?.compiled || window.Vectura.AlgorithmRegistry?.patternCompileMeta?.(meta, { cache: true });
      if (!compiled) return;
      const wrap = canvas.parentElement;
      const width = wrap.clientWidth || 320;
      const height = wrap.clientHeight || 180;
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#0e0e11';
      ctx.fillRect(0, 0, width, height);
      const tileW = compiled.vbW || 1;
      const tileH = compiled.vbH || 1;
      const scale = Math.min((width - 24) / (tileW * 3), (height - 24) / (tileH * 3));
      const originX = (width - tileW * 3 * scale) / 2;
      const originY = (height - tileH * 3 * scale) / 2;
      const drawPoint = (pt, ox, oy) => ({
        x: originX + (ox + pt.x) * scale,
        y: originY + (oy + pt.y) * scale,
      });
      ctx.strokeStyle = 'rgba(230,230,230,0.68)';
      ctx.lineWidth = 1;
      for (let ty = 0; ty < 3; ty += 1) {
        for (let tx = 0; tx < 3; tx += 1) {
          const ox = tx * tileW;
          const oy = ty * tileH;
          ctx.strokeStyle = tx === 1 && ty === 1 ? 'rgba(120,190,255,0.45)' : 'rgba(100,100,110,0.3)';
          ctx.strokeRect(originX + ox * scale, originY + oy * scale, tileW * scale, tileH * scale);
          ctx.strokeStyle = 'rgba(230,230,230,0.65)';
          (compiled.groups || []).forEach((group) => {
            (group.paths || []).forEach((path) => {
              if (!Array.isArray(path) || path.length < 2) return;
              const first = drawPoint(path[0], ox, oy);
              ctx.beginPath();
              ctx.moveTo(first.x, first.y);
              for (let i = 1; i < path.length; i += 1) {
                const next = drawPoint(path[i], ox, oy);
                ctx.lineTo(next.x, next.y);
              }
              ctx.stroke();
            });
          });
        }
      }
      (validation?.issues || []).slice(0, 12).forEach((issue) => {
        const color = issue.code === 'seam-gap'
          ? '#facc15'
          : issue.severity === 'blocker'
            ? '#ef4444'
            : '#f59e0b';
        (issue.points || []).forEach((point) => {
          if (!point) return;
          for (let ty = 0; ty < 3; ty += 1) {
            for (let tx = 0; tx < 3; tx += 1) {
              const draw = drawPoint(point, tx * tileW, ty * tileH);
              ctx.beginPath();
              ctx.strokeStyle = color;
              ctx.lineWidth = 1.25;
              ctx.arc(draw.x, draw.y, 3, 0, Math.PI * 2);
              ctx.stroke();
            }
          }
        });
      });
    },

    _serializeVecturaPayload() {
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
      return {
        type: 'vectura',
        version,
        created: new Date().toISOString(),
        state: this.app.captureState(),
        images: imagePayload,
        customPatterns: getPatternRegistry()?.exportAllCustomPatterns?.() || [],
      };
    },

    saveVecturaFile() {
      const payload = this._serializeVecturaPayload();
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

    _applyVecturaPayload(data) {
      const registry = getPatternRegistry();
      const state = data?.state || data;
      if (!state?.engine || !state?.settings) throw new Error('Missing state payload');
      if (registry?.replaceProjectPatterns) {
        registry.replaceProjectPatterns(Array.isArray(data?.customPatterns) ? data.customPatterns : []);
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
    },

    openVecturaFile(file) {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          this._applyVecturaPayload(data);
        } catch (err) {
          this.openModal({
            title: 'Invalid File',
            body: `<p class="modal-text">That file could not be loaded as a .vectura document.</p>`,
          });
        }
      };
      reader.readAsText(file);
    },

    _bindPatternTileImportInput() {
      if (this._patternTileImportBound) return;
      const input = document.getElementById('file-import-pattern-svg');
      if (!input) return;
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        const pending = this._pendingPatternImportContext;
        if (!file || !pending) return;
        const reader = new FileReader();
        reader.onload = () => {
          this._pendingPatternImportContext = null;
          input.value = '';
          this.openPatternTileImportReview({
            fileName: file.name,
            svgText: `${reader.result || ''}`,
            layer: pending.layer,
            pd: pending.pd,
          });
        };
        reader.readAsText(file);
      });
      this._patternTileImportBound = true;
    },

    triggerPatternTileImport(layer, pd = null) {
      this._bindPatternTileImportInput();
      const input = document.getElementById('file-import-pattern-svg');
      if (!input) return;
      this._pendingPatternImportContext = { layer, pd };
      input.click();
    },

    openPatternTileImportReview({ fileName = 'custom-pattern.svg', svgText = '', layer, pd = null }) {
      const draftName = `${fileName}`.replace(/\.svg$/i, '').replace(/[-_]+/g, ' ').trim() || 'Custom Pattern';
      const registry = getPatternRegistry();
      const draftId = registry?.ensureCustomId?.(draftName) || `custom-${Date.now().toString(36)}`;
      const draftMeta = {
        id: draftId,
        name: draftName,
        filename: fileName,
        source: 'Custom Patterns',
        svg: svgText,
        custom: true,
      };
      const validation = window.Vectura.AlgorithmRegistry?.patternValidateMeta?.(draftMeta, { cache: false, cacheKey: `${draftId}-preview` });
      const body = document.createElement('div');
      body.className = 'space-y-3';
      body.innerHTML = `
        <label class="block text-xs">
          <div class="text-vectura-muted mb-1">Pattern Name</div>
          <input type="text" class="w-full bg-vectura-bg border border-vectura-border px-2 py-1 text-xs focus:outline-none focus:border-vectura-accent" data-pattern-import-name value="${escapeHtml(draftName)}">
        </label>
        <div class="text-[11px] text-vectura-muted">${escapeHtml(fileName)}</div>
        <div class="relative border border-vectura-border" style="height:220px;background:#0e0e11;">
          <canvas data-pattern-import-preview style="position:absolute;top:0;left:0;"></canvas>
        </div>
        <div data-pattern-import-issues class="space-y-1"></div>
        <div class="flex items-center justify-end gap-2">
          <button type="button" class="petal-copy-btn" data-pattern-import-cancel>Cancel</button>
          <button type="button" class="petal-copy-btn" data-pattern-import-save ${validation?.valid ? '' : 'disabled'}>Save Pattern</button>
        </div>
      `;
      this.openModal({
        title: 'Import SVG Tile',
        body,
      });
      this._renderPatternValidationPreview(body.querySelector('[data-pattern-import-preview]'), draftMeta, validation);
      const issuesEl = body.querySelector('[data-pattern-import-issues]');
      if (issuesEl) {
        if (!validation) {
          issuesEl.innerHTML = '<div class="text-[11px] text-vectura-danger">That SVG could not be parsed into a tile.</div>';
        } else if (!validation.issues.length) {
          issuesEl.innerHTML = '<div class="text-[11px] text-vectura-accent">Tile seams look valid. This pattern can be saved.</div>';
        } else {
          issuesEl.innerHTML = validation.issues
            .slice(0, 8)
            .map((issue) => `<div class="text-[11px] ${issue.severity === 'blocker' ? 'text-vectura-danger' : 'text-vectura-muted'}">${escapeHtml(issue.message)}</div>`)
            .join('');
        }
      }
      body.querySelector('[data-pattern-import-cancel]')?.addEventListener('click', () => this.closeModal());
      body.querySelector('[data-pattern-import-save]')?.addEventListener('click', () => {
        const nameInput = body.querySelector('[data-pattern-import-name]');
        const nextName = `${nameInput?.value || draftName}`.trim() || draftName;
        const saved = registry?.saveCustomPattern?.({
          ...draftMeta,
          id: registry.ensureCustomId(nextName),
          name: nextName,
          validation: {
            blockers: validation?.blockers || 0,
            warnings: validation?.warnings || 0,
            valid: validation?.valid === true,
            validatedAt: new Date().toISOString(),
          },
          cachedTile: validation?.compiled || null,
        });
        if (!saved) return;
        if (layer?.params) layer.params.patternId = saved.id;
        if (this.app.pushHistory) this.app.pushHistory();
        this.storeLayerParams(layer);
        this.app.regen();
        this.buildControls();
        this.updateFormula();
        this.closeModal();
        if (pd) this._refreshPatternValidation(pd);
      });
    },

    saveCurrentPatternAsCustom(layer, pd = null) {
      const registry = getPatternRegistry();
      const meta = pd ? this._getPatternMetaForLayer(pd.layer) : this._getPatternMetaForLayer(layer);
      if (!registry || !meta) return;
      const defaultName = meta.custom && !meta.isDraft ? meta.name : meta.name.replace(/ Copy$/, '');
      const body = document.createElement('div');
      body.className = 'space-y-3';
      body.innerHTML = `
        <label class="flex flex-col gap-1 text-[11px]">
          <span class="text-vectura-muted">Pattern name</span>
          <input type="text" data-pd-save-name value="${escapeHtml(defaultName)}"
            class="bg-vectura-bg border border-vectura-border px-2 py-1 text-[11px] focus:outline-none focus:border-vectura-accent w-full"
            placeholder="My Pattern">
        </label>
        <p class="text-[10px] text-vectura-muted">Saves to User Patterns (browser localStorage) and downloads an SVG copy.</p>
        <div class="flex justify-end gap-2">
          <button type="button" data-pd-save-cancel class="text-[11px] border border-vectura-border px-3 py-1 hover:bg-vectura-border text-vectura-muted transition-colors">Cancel</button>
          <button type="button" data-pd-save-confirm class="text-[11px] border border-vectura-accent px-3 py-1 bg-vectura-accent text-black hover:opacity-90 transition-opacity">Save &amp; Export</button>
        </div>`;
      const doSave = () => {
        const nameInput = body.querySelector('[data-pd-save-name]');
        const name = `${nameInput?.value || ''}`.trim() || defaultName;
        if (pd) {
          this._commitDraftAsUserPattern(pd, name);
        } else {
          const validation = window.Vectura.AlgorithmRegistry?.patternValidateMeta?.(meta, { cache: true });
          const saved = registry.saveCustomPattern({
            ...meta,
            id: registry.ensureCustomId(name),
            name,
            isDraft: false,
            source: 'Custom Patterns',
            validation: validation ? { blockers: validation.blockers, warnings: validation.warnings, valid: validation.valid, validatedAt: new Date().toISOString() } : null,
            cachedTile: validation?.compiled || null,
          });
          if (!saved) return;
          layer.params.patternId = saved.id;
          if (this.app.pushHistory) this.app.pushHistory();
          this.storeLayerParams(layer);
          this.app.regen();
          this.buildControls();
          this.updateFormula();
          this._downloadPatternSvg(name, meta.svg);
        }
        this.closeModal();
      };
      body.querySelector('[data-pd-save-confirm]')?.addEventListener('click', doSave);
      body.querySelector('[data-pd-save-cancel]')?.addEventListener('click', () => this.closeModal());
      body.querySelector('[data-pd-save-name]')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doSave();
        if (e.key === 'Escape') this.closeModal();
      });
      this.openModal({ title: 'Save Pattern', body });
      window.requestAnimationFrame(() => {
        const input = body.querySelector('[data-pd-save-name]');
        if (input) { input.focus(); input.select(); }
      });
    },

    openCustomPatternLibrary(layer, pd = null, initialTab = 'default') {
      const registry = getPatternRegistry();
      const body = document.createElement('div');
      body.className = 'flex flex-col gap-2';
      let activeTab = initialTab;

      const STORAGE_TIP = 'Stored in browser localStorage — export for guaranteed persistence';

      const renderBody = () => {
        const allPatterns = registry?.getPatterns?.() || [];
        const defaultPatterns = allPatterns.filter((p) => !p.custom);
        const userPatterns = registry?.getCustomPatterns?.() || [];

        body.innerHTML = `
          <div class="flex gap-0 mb-2 border-b border-vectura-border">
            <button type="button" data-lib-tab="default"
              class="text-[11px] px-3 py-1.5 border-b-2 transition-colors ${activeTab === 'default' ? 'border-vectura-accent text-vectura-accent' : 'border-transparent text-vectura-muted hover:text-vectura-text'}">
              Default
            </button>
            <button type="button" data-lib-tab="user"
              class="text-[11px] px-3 py-1.5 border-b-2 transition-colors ${activeTab === 'user' ? 'border-vectura-accent text-vectura-accent' : 'border-transparent text-vectura-muted hover:text-vectura-text'}">
              User Patterns${userPatterns.length ? ` <span class="text-[9px]">(${userPatterns.length})</span>` : ''}
            </button>
          </div>
          <div data-lib-content class="overflow-y-auto max-h-80 space-y-1">
            ${activeTab === 'default'
              ? defaultPatterns.map((p) => `
                  <div class="border border-vectura-border px-2 py-1.5 flex items-center justify-between gap-2">
                    <div class="min-w-0">
                      <div class="text-[11px] text-vectura-text truncate">${escapeHtml(p.name)}</div>
                      <div class="text-[9px] text-vectura-muted truncate">${escapeHtml(p.source || 'Default')}</div>
                    </div>
                    <button type="button" class="petal-copy-btn shrink-0" data-pattern-load="${escapeHtml(p.id)}">Load</button>
                  </div>`).join('') || '<div class="text-[11px] text-vectura-muted py-2">No default patterns found.</div>'
              : userPatterns.map((p) => `
                  <div class="border border-vectura-border px-2 py-1.5 flex items-center justify-between gap-2" data-pattern-row="${escapeHtml(p.id)}">
                    <div class="min-w-0 flex items-center gap-1.5">
                      <span class="shrink-0 w-2 h-2 rounded-full bg-orange-400 cursor-default"
                        data-storage-tip title="${escapeHtml(STORAGE_TIP)}"></span>
                      <div>
                        <div class="text-[11px] text-vectura-text truncate">${escapeHtml(p.name)}</div>
                        <div class="text-[9px] text-vectura-muted truncate">${escapeHtml(p.filename || p.id)}</div>
                      </div>
                    </div>
                    <div class="flex items-center gap-1 shrink-0">
                      <button type="button" class="petal-copy-btn" data-pattern-load="${escapeHtml(p.id)}">Load</button>
                      <button type="button" class="petal-copy-btn" title="Export SVG" data-pattern-export="${escapeHtml(p.id)}">&#8595;</button>
                      <button type="button" class="petal-copy-btn text-vectura-danger border-vectura-danger hover:bg-vectura-danger hover:text-white" data-pattern-delete="${escapeHtml(p.id)}">&#10005;</button>
                    </div>
                  </div>`).join('') || '<div class="text-[11px] text-vectura-muted py-2">No saved patterns yet. Use <strong>Save Pattern</strong> to add one.</div>'
            }
          </div>`;

        body.querySelectorAll('[data-lib-tab]').forEach((btn) => {
          btn.addEventListener('click', () => {
            activeTab = btn.dataset.libTab;
            renderBody();
          });
        });

        body.querySelectorAll('[data-pattern-load]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const targetId = btn.dataset.patternLoad;
            const switchPattern = () => {
              layer.params.patternId = targetId;
              if (this.app.pushHistory) this.app.pushHistory();
              this.storeLayerParams(layer);
              this.app.regen();
              this.buildControls();
              this.updateFormula();
              this.closeModal();
              if (pd) {
                pd.draftEdit = null;
                this._refreshPatternValidation(pd);
              }
            };
            if (pd?.draftEdit?.isDirty) {
              this._confirmDiscardDraft(pd, switchPattern);
            } else {
              if (pd) pd.draftEdit = null;
              switchPattern();
            }
          });
        });

        body.querySelectorAll('[data-pattern-export]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const pattern = registry?.getPatternById?.(btn.dataset.patternExport);
            if (pattern) this._downloadPatternSvg(pattern.name, pattern.svg);
          });
        });

        body.querySelectorAll('[data-pattern-delete]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const delId = btn.dataset.patternDelete;
            registry?.deleteCustomPattern?.(delId);
            if (layer?.params?.patternId === delId) {
              this.ensurePatternLayerSelection(layer);
              this.storeLayerParams(layer);
            }
            if (pd?.draftEdit?.draftId === delId) pd.draftEdit = null;
            this.app.regen();
            this.buildControls();
            this.updateFormula();
            renderBody();
          });
        });

        // Storage tooltip with 500ms hover delay
        let tipTimer = null;
        body.querySelectorAll('[data-storage-tip]').forEach((dot) => {
          dot.addEventListener('mouseenter', () => {
            tipTimer = setTimeout(() => {
              dot.setAttribute('title', STORAGE_TIP);
            }, 500);
          });
          dot.addEventListener('mouseleave', () => clearTimeout(tipTimer));
        });
      };

      this.openModal({ title: 'Load Pattern', body });
      renderBody();
    },

    _ensurePatternDesignerEditableMeta(pd) {
      const registry = getPatternRegistry();
      const meta = this._getPatternMetaForLayer(pd.layer);
      if (!registry || !meta) return null;

      // User pattern — edit in place, no draft needed
      if (meta.custom && !meta.isDraft) return meta;

      // Already in draft mode for this pattern — reuse the existing draft
      if (pd.draftEdit) {
        const existing = registry.getPatternById(pd.draftEdit.draftId);
        if (existing) return existing;
      }

      // Built-in (or stale draft) — create a volatile draft without persisting to localStorage
      const originalId = meta.isDraft ? (pd.draftEdit?.originalId || meta.id) : meta.id;
      const rawDraftId = `draft-${registry.ensureCustomId(meta.name)}-edit`;
      const draftSaved = registry.saveCustomPattern({
        ...meta,
        id: rawDraftId,
        isDraft: true,
        name: meta.name,
        source: 'Draft',
        validation: null,
        cachedTile: null,
      });
      if (!draftSaved) return null;
      pd.draftEdit = { originalId, draftId: draftSaved.id, isDirty: false };
      pd.layer.params.patternId = draftSaved.id;
      this.storeLayerParams(pd.layer);
      return draftSaved;
    },

    _applyPatternIssueAutoFix(pd, issue) {
      if (!pd || !issue?.autoFixable || issue.fix?.target !== 'endpoint-pair') return;
      const registry = getPatternRegistry();
      const editableMeta = this._ensurePatternDesignerEditableMeta(pd);
      if (!registry || !editableMeta) return;
      const compiled = clone(editableMeta.cachedTile || pd.validation?.compiled || {});
      const endpoints = issue.fix?.endpoints || [];
      const axis = issue.fix?.axis;
      const value = issue.fix?.value;
      endpoints.forEach((entry) => {
        const path = compiled.groups?.[entry.groupIndex]?.paths?.[entry.pathIndex];
        if (!Array.isArray(path) || !path.length) return;
        const index = entry.endpoint === 'start' ? 0 : path.length - 1;
        const point = path[index];
        if (!point) return;
        if (axis === 'x') point.x = value;
        if (axis === 'y') point.y = value;
        if (entry.side === 'top') point.y = 0;
        if (entry.side === 'bottom') point.y = compiled.vbH;
        if (entry.side === 'left') point.x = 0;
        if (entry.side === 'right') point.x = compiled.vbW;
      });
      const nextValidation = window.Vectura.AlgorithmRegistry?._validateCompiledPattern?.(editableMeta, compiled, {
        gapTolerance: pd.gapTolerance || 0,
      });
      const saved = registry.saveCustomPattern({
        ...editableMeta,
        validation: nextValidation
          ? {
              blockers: nextValidation.blockers,
              warnings: nextValidation.warnings,
              valid: nextValidation.valid,
              validatedAt: new Date().toISOString(),
            }
          : editableMeta.validation,
        cachedTile: compiled,
      });
      if (!saved) return;
      pd.layer.params.patternId = saved.id;
      if (this.app.pushHistory) this.app.pushHistory();
      this.storeLayerParams(pd.layer);
      this.app.regen();
      this._renderPatternDesigner(pd);
    },

    _bindPatternDesignerCanvas(pd) {
      const canvas = pd.root.querySelector('[data-pd-canvas]');
      if (!canvas) return;
      const toTile = (ex, ey) => ({
        x: (ex - pd.view.offsetX) / pd.view.zoom,
        y: (ey - pd.view.offsetY) / pd.view.zoom,
      });
      const getSelection = (tx, ty, additive = false) => {
        const compiled = this._getPatternFillTargets(pd);
        const selection = window.Vectura.AlgorithmRegistry?.patternGetFillTargetsAtPoint
          ? window.Vectura.AlgorithmRegistry.patternGetFillTargetsAtPoint(pd.layer.params.patternId, tx, ty, { cache: true })
          : null;
        if (!compiled || !selection) return [];
        if (additive) return selection.ancestors || [];
        return selection.smallest ? [selection.smallest] : [];
      };
      const ensureSessionHistory = (session) => {
        if (session.historyPushed) return;
        session.historyPushed = true;
        this._pushPdHistory(pd);
        if (this.app.pushHistory) this.app.pushHistory();
      };
      const applyPourAt = (tx, ty, e, session) => {
        const effectiveTool = pd.tool === 'fill' && (e.altKey || window.Vectura.SETTINGS?.touchModifiers?.alt)
          ? 'fill-erase'
          : pd.tool;
        const targets = getSelection(tx, ty, Boolean(e.shiftKey));
        const statusEl = pd.root.querySelector('[data-pd-status]');
        if (!targets.length) {
          if (statusEl) statusEl.textContent = 'No fill target at pointer';
          return;
        }
        let changed = false;
        targets.forEach((target) => {
          const visitKey = `${effectiveTool}:${target.id}`;
          if (session.visited.has(visitKey)) return;
          session.visited.add(visitKey);
          if (effectiveTool === 'fill') {
            if (pd.fills.some((fill) => this._fillMatchesTarget(fill, target))) return;
            ensureSessionHistory(session);
            const nextFill = this._buildFillRecordFromTarget(pd, target);
            if (!nextFill) return;
            pd.fills.push(nextFill);
            changed = true;
          } else if (effectiveTool === 'fill-erase') {
            const before = pd.fills.length;
            const nextFills = pd.fills.filter((fill) => !this._fillMatchesTarget(fill, target));
            if (nextFills.length === before) return;
            ensureSessionHistory(session);
            pd.fills = nextFills;
            changed = true;
          }
        });
        if (changed) {
          session.mutated = true;
          this._applyPatternDesignerChanges(pd, { skipHistoryPush: true });
        } else if (statusEl) {
          statusEl.textContent = effectiveTool === 'fill-erase' ? 'No matching fill to erase' : 'Fill already applied';
        }
      };
      let panState = null;
      let dragSession = null;
      const isFillTool = () => pd.tool === 'fill' || pd.tool === 'fill-erase';
      const onDown = (e) => {
        const rect = canvas.getBoundingClientRect();
        const ex = e.clientX - rect.left, ey = e.clientY - rect.top;
        if (e.button === 1) {
          panState = { sx: ex, sy: ey, ox: pd.view.offsetX, oy: pd.view.offsetY };
          e.preventDefault();
          return;
        }
        if (e.button !== 0) return;
        if (!isFillTool()) return;
        const { x: tx, y: ty } = toTile(ex, ey);
        dragSession = { visited: new Set(), historyPushed: false, mutated: false };
        applyPourAt(tx, ty, e, dragSession);
      };
      const onMove = (e) => {
        const rect = canvas.getBoundingClientRect();
        if (panState) {
          pd.view.offsetX = panState.ox + (e.clientX - rect.left - panState.sx);
          pd.view.offsetY = panState.oy + (e.clientY - rect.top - panState.sy);
          this._renderPatternDesigner(pd);
          return;
        }
        if (!isFillTool()) return;
        if (!dragSession || !(e.buttons & 1)) return;
        const { x: tx, y: ty } = toTile(e.clientX - rect.left, e.clientY - rect.top);
        applyPourAt(tx, ty, e, dragSession);
      };
      const onUp = () => {
        panState = null;
        dragSession = null;
      };
      const onWheel = (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const ex = e.clientX - rect.left, ey = e.clientY - rect.top;
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        const newZoom = Math.max(0.1, Math.min(200, pd.view.zoom * factor));
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

    _syncPdToolActive(pd) {
      pd.root.querySelectorAll('[data-pd-tool]').forEach(b => b.classList.toggle('active', b.dataset.pdTool === pd.tool));
      const pathActionsEl = pd.root.querySelector('[data-pd-path-actions]');
      if (pathActionsEl) {
        const showActions = pd.tool === 'select' && pd.selectedPath !== null;
        pathActionsEl.classList.toggle('hidden', !showActions);
      }
      const fillSettingsEl = pd.root.querySelector('[data-pd-fill-settings]');
      if (fillSettingsEl) {
        fillSettingsEl.classList.toggle('hidden', pd.tool !== 'fill' && pd.tool !== 'fill-erase');
      }
      const isDirtyDraft = !!(pd.draftEdit?.isDirty);
      const draftBadge = pd.root.querySelector('[data-pd-draft-badge]');
      if (draftBadge) draftBadge.classList.toggle('hidden', !isDirtyDraft);
      const saveBtn = pd.root.querySelector('[data-pd-save-custom]');
      if (saveBtn) saveBtn.classList.toggle('border-vectura-accent', isDirtyDraft);
      const canvas = pd.root.querySelector('[data-pd-canvas]');
      if (canvas) {
        if (pd.tool === 'select' || pd.tool === 'direct') canvas.style.cursor = 'default';
        else if (pd.tool === 'move') canvas.style.cursor = pd.moveDrag ? 'grabbing' : 'grab';
        else if (pd.tool === 'pen') canvas.style.cursor = 'crosshair';
        else if (pd.tool === 'shape-rect' || pd.tool === 'shape-oval') canvas.style.cursor = 'crosshair';
        else canvas.style.cursor = 'crosshair';
      }
    },

    _bindPatternDesignerControls(pd) {
      pd.root.querySelectorAll('[data-pd-tool]').forEach(btn => {
        btn.addEventListener('click', () => {
          pd.tool = btn.dataset.pdTool;
          if (pd.tool !== 'select') pd.selectedPath = null;
          if (pd.tool !== 'direct') pd.directEditState = null;
          pd.pendingAnchors = [];
          pd.dragShape = null;
          this._syncPdToolActive(pd);
          this._renderPatternDesigner(pd);
        });
      });
      pd.root.querySelector('[data-pd-close]')?.addEventListener('click', () => this.closePatternDesigner());
      pd.root.querySelector('[data-pd-clear]')?.addEventListener('click', () => {
        pd.fills = [];
        this._applyPatternDesignerChanges(pd);
      });
      const shadowCb = pd.root.querySelector('[data-pd-shadow-tiles]');
      if (shadowCb) {
        shadowCb.addEventListener('change', () => {
          pd.shadowTiles = shadowCb.checked;
          this._renderPatternDesigner(pd);
        });
      }
      pd.root.querySelector('[data-pd-delete-path]')?.addEventListener('click', () => {
        if (pd.selectedPath !== null) this._deletePathFromTileSvg(pd, pd.selectedPath);
      });
      pd.root.querySelector('[data-pd-trim-path]')?.addEventListener('click', () => {
        if (pd.selectedPath !== null) {
          const data = window.Vectura.AlgorithmRegistry?.patternGetGroups?.(pd.layer.params.patternId);
          if (data) this._trimPathToTile(pd, pd.selectedPath, data.vbW, data.vbH, pd.trimMargins);
        }
      });
      pd.root.querySelectorAll('[data-pd-margin]').forEach(input => {
        input.addEventListener('input', () => {
          const side = input.dataset.pdMargin;
          const val = Math.max(0, Math.min(5, parseFloat(input.value) || 0));
          if (pd.trimMargins.locked) {
            pd.trimMargins.top = pd.trimMargins.bottom = pd.trimMargins.left = pd.trimMargins.right = val;
            pd.root.querySelectorAll('[data-pd-margin]').forEach(inp => { inp.value = val; });
          } else {
            pd.trimMargins[side] = val;
          }
        });
      });
      const marginLockBtn = pd.root.querySelector('[data-pd-margin-lock]');
      if (marginLockBtn) {
        marginLockBtn.addEventListener('click', () => {
          pd.trimMargins.locked = !pd.trimMargins.locked;
          marginLockBtn.setAttribute('aria-pressed', pd.trimMargins.locked ? 'true' : 'false');
          marginLockBtn.innerHTML = pd.trimMargins.locked ? '&#128274;' : '&#128275;';
          if (pd.trimMargins.locked) {
            // Sync all to top value when locking
            const val = pd.trimMargins.top;
            pd.trimMargins.bottom = pd.trimMargins.left = pd.trimMargins.right = val;
            pd.root.querySelectorAll('[data-pd-margin]').forEach(inp => { inp.value = val; });
          }
        });
      }
      pd.root.querySelector('[data-pd-import-tile]')?.addEventListener('click', () => {
        this.triggerPatternTileImport(pd.layer, pd);
      });
      pd.root.querySelector('[data-pd-save-custom]')?.addEventListener('click', () => {
        this.saveCurrentPatternAsCustom(pd.layer, pd);
      });
      pd.root.querySelector('[data-pd-open-library]')?.addEventListener('click', () => {
        this.openCustomPatternLibrary(pd.layer, pd);
      });
      const gapSlider = pd.root.querySelector('[data-pd-gap-slider]');
      const gapValue = pd.root.querySelector('[data-pd-gap-value]');
      if (gapSlider) {
        const syncGap = (raw) => {
          pd.gapTolerance = Math.max(0, parseFloat(raw) || 0);
          pd.layer.params.patternGapTolerance = pd.gapTolerance;
          if (gapValue) gapValue.textContent = `${pd.gapTolerance.toFixed(1)}px`;
          this._refreshPatternValidation(pd);
        };
        gapSlider.addEventListener('input', (e) => syncGap(e.target.value));
        gapSlider.addEventListener('change', (e) => syncGap(e.target.value));
      }
    },

    _applyPatternDesignerChanges(pd, options = {}) {
      const layer = pd.layer;
      if (!options.skipHistoryPush && this.app.pushHistory) this.app.pushHistory();
      layer.params.patternFills = pd.fills.map(f => ({
        id: f.id,
        targetIds: Array.isArray(f.targetIds) ? f.targetIds.slice() : [],
        regions: (f.regions || (f.region ? [f.region] : [])).map((region) => cloneRegion(region)),
        region: cloneRegion(f.region || f.regions?.[0] || []),
        fillType: f.fillType,
        density: f.density,
        penId: f.penId || null,
        angle: f.angle ?? 0,
        amplitude: f.amplitude ?? 1.0,
        dotSize: f.dotSize ?? 1.0,
        padding: f.padding ?? 0,
        shiftX: f.shiftX ?? 0,
        shiftY: f.shiftY ?? 0,
      }));
      const sensitivityEl = pd.root.querySelector('[data-pd-sensitivity]');
      if (sensitivityEl) layer.params.fillSensitivity = parseFloat(sensitivityEl.value) || 2.0;
      layer.params.patternGapTolerance = pd.gapTolerance || 0;
      this.storeLayerParams(layer);
      this.app.regen();
      this._renderPatternDesigner(pd);
      this._refreshPatternValidation(pd);
      if (pd.inline && this._renderFillsList) this._renderFillsList(pd);
      const statusEl = pd.root.querySelector('[data-pd-status]');
      if (statusEl) {
        const n = pd.fills.length;
        statusEl.textContent = n === 0 ? 'Click a closed region to fill it' : `${n} fill${n !== 1 ? 's' : ''} active`;
      }
    },

    // ─── Direct-select helpers ────────────────────────────────────────────────

    _parseSvgDToAnchors(d) {
      const anchors = [];
      let closed = false;
      let cx = 0, cy = 0, sx = 0, sy = 0;
      const floats = s => s.trim().replace(/,/g, ' ').split(/\s+/).filter(Boolean).map(parseFloat).filter(v => !isNaN(v));
      const cmdRe = /([MmLlHhVvCcSsQqTtZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
      let m;
      while ((m = cmdRe.exec(d)) !== null) {
        const cmd = m[1];
        const ns = floats(m[2]);
        switch (cmd) {
          case 'M': for (let i = 0; i + 1 < ns.length; i += 2) { cx = ns[i]; cy = ns[i+1]; if (i===0){sx=cx;sy=cy;} anchors.push({ x: cx, y: cy, in: null, out: null }); } break;
          case 'm': for (let i = 0; i + 1 < ns.length; i += 2) { cx += ns[i]; cy += ns[i+1]; if (i===0){sx=cx;sy=cy;} anchors.push({ x: cx, y: cy, in: null, out: null }); } break;
          case 'L': for (let i = 0; i + 1 < ns.length; i += 2) { cx = ns[i]; cy = ns[i+1]; anchors.push({ x: cx, y: cy, in: null, out: null }); } break;
          case 'l': for (let i = 0; i + 1 < ns.length; i += 2) { cx += ns[i]; cy += ns[i+1]; anchors.push({ x: cx, y: cy, in: null, out: null }); } break;
          case 'H': for (const x of ns) { cx = x; anchors.push({ x: cx, y: cy, in: null, out: null }); } break;
          case 'h': for (const x of ns) { cx += x; anchors.push({ x: cx, y: cy, in: null, out: null }); } break;
          case 'V': for (const y of ns) { cy = y; anchors.push({ x: cx, y: cy, in: null, out: null }); } break;
          case 'v': for (const y of ns) { cy += y; anchors.push({ x: cx, y: cy, in: null, out: null }); } break;
          case 'C': for (let i = 0; i + 5 < ns.length; i += 6) {
            if (anchors.length) anchors[anchors.length-1].out = { x: ns[i], y: ns[i+1] };
            cx = ns[i+4]; cy = ns[i+5];
            anchors.push({ x: cx, y: cy, in: { x: ns[i+2], y: ns[i+3] }, out: null });
          } break;
          case 'c': for (let i = 0; i + 5 < ns.length; i += 6) {
            if (anchors.length) anchors[anchors.length-1].out = { x: cx+ns[i], y: cy+ns[i+1] };
            const ex = cx+ns[i+4], ey = cy+ns[i+5];
            anchors.push({ x: ex, y: ey, in: { x: cx+ns[i+2], y: cy+ns[i+3] }, out: null });
            cx = ex; cy = ey;
          } break;
          case 'S': for (let i = 0; i + 3 < ns.length; i += 4) {
            const prev = anchors.length ? anchors[anchors.length-1] : null;
            const c1x = prev?.out ? 2*cx-prev.out.x : cx, c1y = prev?.out ? 2*cy-prev.out.y : cy;
            if (anchors.length) anchors[anchors.length-1].out = { x: c1x, y: c1y };
            cx = ns[i+2]; cy = ns[i+3];
            anchors.push({ x: cx, y: cy, in: { x: ns[i], y: ns[i+1] }, out: null });
          } break;
          case 's': for (let i = 0; i + 3 < ns.length; i += 4) {
            const prev = anchors.length ? anchors[anchors.length-1] : null;
            const c1x = prev?.out ? 2*cx-prev.out.x : cx, c1y = prev?.out ? 2*cy-prev.out.y : cy;
            if (anchors.length) anchors[anchors.length-1].out = { x: c1x, y: c1y };
            const ex = cx+ns[i+2], ey = cy+ns[i+3];
            anchors.push({ x: ex, y: ey, in: { x: cx+ns[i], y: cy+ns[i+1] }, out: null });
            cx = ex; cy = ey;
          } break;
          case 'Q': for (let i = 0; i + 3 < ns.length; i += 4) { cx = ns[i+2]; cy = ns[i+3]; anchors.push({ x: cx, y: cy, in: null, out: null }); } break;
          case 'q': for (let i = 0; i + 3 < ns.length; i += 4) { cx += ns[i+2]; cy += ns[i+3]; anchors.push({ x: cx, y: cy, in: null, out: null }); } break;
          case 'Z': case 'z': closed = true; cx = sx; cy = sy; break;
        }
      }
      // Deduplicate closing point if last === first
      if (closed && anchors.length >= 2) {
        const first = anchors[0], last = anchors[anchors.length-1];
        if (Math.hypot(first.x - last.x, first.y - last.y) < 0.001) anchors.pop();
      }
      return { anchors, closed };
    },

    _anchorsToSvgD(anchors, closed) {
      if (!anchors.length) return '';
      const f = v => v.toFixed(4);
      let d = `M${f(anchors[0].x)},${f(anchors[0].y)}`;
      for (let i = 0; i < anchors.length - 1; i++) {
        const a = anchors[i], b = anchors[i+1];
        if (!a.out && !b.in) {
          d += ` L${f(b.x)},${f(b.y)}`;
        } else {
          const c1 = a.out || { x: a.x, y: a.y };
          const c2 = b.in || { x: b.x, y: b.y };
          d += ` C${f(c1.x)},${f(c1.y)} ${f(c2.x)},${f(c2.y)} ${f(b.x)},${f(b.y)}`;
        }
      }
      if (closed) {
        const a = anchors[anchors.length-1], b = anchors[0];
        if (a.out || b.in) {
          const c1 = a.out || { x: a.x, y: a.y };
          const c2 = b.in || { x: b.x, y: b.y };
          d += ` C${f(c1.x)},${f(c1.y)} ${f(c2.x)},${f(c2.y)} ${f(b.x)},${f(b.y)}`;
        }
        d += ' Z';
      }
      return d;
    },

    _svgElementToEditSet(el, elIndex) {
      const tag = el.tagName?.toLowerCase();
      if (tag === 'path') {
        const d = el.getAttribute('d') || '';
        const { anchors, closed } = this._parseSvgDToAnchors(d);
        return anchors.length >= 1 ? { elIndex, anchors, closed, srcTag: 'path' } : null;
      }
      if (tag === 'rect') {
        const x = parseFloat(el.getAttribute('x') || 0);
        const y = parseFloat(el.getAttribute('y') || 0);
        const w = parseFloat(el.getAttribute('width') || 0);
        const h = parseFloat(el.getAttribute('height') || 0);
        return {
          elIndex, closed: true, srcTag: 'rect',
          anchors: [
            { x, y, in: null, out: null },
            { x: x + w, y, in: null, out: null },
            { x: x + w, y: y + h, in: null, out: null },
            { x, y: y + h, in: null, out: null },
          ],
        };
      }
      if (tag === 'ellipse' || tag === 'circle') {
        const ecx = parseFloat(el.getAttribute('cx') || 0);
        const ecy = parseFloat(el.getAttribute('cy') || 0);
        const rx = parseFloat(el.getAttribute('rx') || el.getAttribute('r') || 0);
        const ry = parseFloat(el.getAttribute('ry') || el.getAttribute('r') || rx);
        const k = 0.5522847498;
        return {
          elIndex, closed: true, srcTag: tag,
          anchors: [
            { x: ecx, y: ecy - ry, in: { x: ecx - rx*k, y: ecy - ry }, out: { x: ecx + rx*k, y: ecy - ry } },
            { x: ecx + rx, y: ecy, in: { x: ecx + rx, y: ecy - ry*k }, out: { x: ecx + rx, y: ecy + ry*k } },
            { x: ecx, y: ecy + ry, in: { x: ecx + rx*k, y: ecy + ry }, out: { x: ecx - rx*k, y: ecy + ry } },
            { x: ecx - rx, y: ecy, in: { x: ecx - rx, y: ecy + ry*k }, out: { x: ecx - rx, y: ecy - ry*k } },
          ],
        };
      }
      if (tag === 'line') {
        const x1 = parseFloat(el.getAttribute('x1') || 0);
        const y1 = parseFloat(el.getAttribute('y1') || 0);
        const x2 = parseFloat(el.getAttribute('x2') || 0);
        const y2 = parseFloat(el.getAttribute('y2') || 0);
        return {
          elIndex, closed: false, srcTag: 'line',
          anchors: [
            { x: x1, y: y1, in: null, out: null },
            { x: x2, y: y2, in: null, out: null },
          ],
        };
      }
      if (tag === 'polyline' || tag === 'polygon') {
        const pts = (el.getAttribute('points') || '').trim().split(/[\s,]+/).filter(Boolean);
        const anchors = [];
        for (let i = 0; i + 1 < pts.length; i += 2) {
          anchors.push({ x: parseFloat(pts[i]) || 0, y: parseFloat(pts[i + 1]) || 0, in: null, out: null });
        }
        return anchors.length >= 2
          ? { elIndex, closed: tag === 'polygon', srcTag: tag, anchors }
          : null;
      }
      return null;
    },

    _commitDirectEditToSvg(pd) {
      const state = pd.directEditState;
      if (!state) return;
      const editableMeta = this._ensureCustomPattern(pd);
      if (!editableMeta) return;
      const svgText = editableMeta.svg;
      if (!svgText) return;
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgText, 'image/svg+xml');
      const elements = Array.from(doc.querySelectorAll('path,line,polyline,polygon,rect,ellipse,circle'));
      const el = elements[state.elIndex];
      if (!el) return;
      const d = this._anchorsToSvgD(state.anchors, state.closed);
      if (!d) return;
      const newEl = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
      newEl.setAttribute('d', d);
      newEl.setAttribute('stroke', el.getAttribute('stroke') || 'currentColor');
      newEl.setAttribute('fill', el.getAttribute('fill') || 'none');
      el.parentNode.replaceChild(newEl, el);
      const newSvg = new XMLSerializer().serializeToString(doc.documentElement);
      this._commitSvgEdit(pd, newSvg);
      // Re-parse to get updated elIndex (element type may have changed from rect→path)
      const newDoc = new DOMParser().parseFromString(newSvg, 'image/svg+xml');
      const newElements = Array.from(newDoc.querySelectorAll('path,line,polyline,polygon,rect,ellipse,circle'));
      const reparsed = this._svgElementToEditSet(newElements[state.elIndex], state.elIndex);
      if (reparsed) {
        state.anchors = reparsed.anchors;
        state.closed = reparsed.closed;
        state.srcTag = reparsed.srcTag;
      }
    },

    _renderDirectSelectOverlay(ctx, pd, state, cxFn, cyFn, zoom) {
      const { anchors, closed, selectedIndices } = state;
      if (!anchors.length) return;
      const selSet = selectedIndices || new Set();
      const anchorR = Math.max(2, 3.5 / Math.max(0.1, zoom) * zoom);
      const handleR = Math.max(1.5, 2.2 / Math.max(0.1, zoom) * zoom);

      // Draw path outline
      ctx.save();
      ctx.strokeStyle = 'rgba(34,211,238,0.55)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(cxFn(anchors[0].x), cyFn(anchors[0].y));
      for (let i = 1; i < anchors.length; i++) {
        const a = anchors[i-1], b = anchors[i];
        if (!a.out && !b.in) {
          ctx.lineTo(cxFn(b.x), cyFn(b.y));
        } else {
          const c1 = a.out || { x: a.x, y: a.y };
          const c2 = b.in || { x: b.x, y: b.y };
          ctx.bezierCurveTo(cxFn(c1.x), cyFn(c1.y), cxFn(c2.x), cyFn(c2.y), cxFn(b.x), cyFn(b.y));
        }
      }
      if (closed && anchors.length > 1) {
        const a = anchors[anchors.length-1], b = anchors[0];
        if (a.out || b.in) {
          const c1 = a.out || { x: a.x, y: a.y };
          const c2 = b.in || { x: b.x, y: b.y };
          ctx.bezierCurveTo(cxFn(c1.x), cyFn(c1.y), cxFn(c2.x), cyFn(c2.y), cxFn(b.x), cyFn(b.y));
        }
        ctx.closePath();
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw handles and anchors
      ctx.lineWidth = 1;
      anchors.forEach((a, i) => {
        const isSel = selSet.has(i);
        const ax = cxFn(a.x), ay = cyFn(a.y);
        if (a.in) {
          ctx.strokeStyle = 'rgba(34,211,238,0.5)';
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(cxFn(a.in.x), cyFn(a.in.y)); ctx.stroke();
          ctx.beginPath(); ctx.arc(cxFn(a.in.x), cyFn(a.in.y), handleR, 0, Math.PI*2);
          ctx.fillStyle = '#0f172a'; ctx.fill();
          ctx.strokeStyle = '#22d3ee'; ctx.stroke();
        }
        if (a.out) {
          ctx.strokeStyle = 'rgba(34,211,238,0.5)';
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(cxFn(a.out.x), cyFn(a.out.y)); ctx.stroke();
          ctx.beginPath(); ctx.arc(cxFn(a.out.x), cyFn(a.out.y), handleR, 0, Math.PI*2);
          ctx.fillStyle = '#0f172a'; ctx.fill();
          ctx.strokeStyle = '#22d3ee'; ctx.stroke();
        }
        // Anchor: square for corner nodes (no handles), circle for smooth
        const hasHandles = a.in || a.out;
        ctx.strokeStyle = '#22d3ee';
        ctx.fillStyle = isSel ? '#22d3ee' : '#0f172a';
        if (!hasHandles) {
          // Square for corner anchors
          const s = anchorR;
          ctx.beginPath();
          ctx.rect(ax - s, ay - s, s*2, s*2);
        } else {
          ctx.beginPath();
          ctx.arc(ax, ay, anchorR, 0, Math.PI*2);
        }
        ctx.fill(); ctx.stroke();
      });
      ctx.restore();
    },

    _hitDirectSelectControl(pd, tx, ty) {
      const state = pd.directEditState;
      if (!state?.anchors?.length) return null;
      const tol = 7 / pd.view.zoom;
      // Check handles first
      for (let i = 0; i < state.anchors.length; i++) {
        const a = state.anchors[i];
        if (a.in && Math.hypot(tx - a.in.x, ty - a.in.y) < tol) return { type: 'in', index: i };
        if (a.out && Math.hypot(tx - a.out.x, ty - a.out.y) < tol) return { type: 'out', index: i };
      }
      // Check anchors
      const ancTol = 8 / pd.view.zoom;
      for (let i = 0; i < state.anchors.length; i++) {
        const a = state.anchors[i];
        if (Math.hypot(tx - a.x, ty - a.y) < ancTol) return { type: 'anchor', index: i };
      }
      return null;
    },

    _snapDirectAngle(from, to, stepDeg = 15) {
      const dx = to.x - from.x, dy = to.y - from.y;
      const dist = Math.hypot(dx, dy);
      if (!dist) return { ...to };
      const step = (stepDeg * Math.PI) / 180;
      const angle = Math.atan2(dy, dx);
      const snapped = Math.round(angle / step) * step;
      return { x: from.x + Math.cos(snapped) * dist, y: from.y + Math.sin(snapped) * dist };
    },

    _confirmDiscardDraft(pd, onConfirm) {
      const originalName = pd.draftEdit?.originalId || 'this pattern';
      const body = document.createElement('div');
      body.className = 'space-y-3';
      body.innerHTML = `
        <p class="text-[11px] text-vectura-text">Discard unsaved edits to <strong>${escapeHtml(originalName)}</strong>?</p>
        <div class="flex justify-end gap-2">
          <button type="button" data-discard-cancel class="text-[11px] border border-vectura-border px-3 py-1 hover:bg-vectura-border text-vectura-muted transition-colors">Keep Editing</button>
          <button type="button" data-discard-confirm class="text-[11px] border border-vectura-danger px-3 py-1 text-vectura-danger hover:bg-vectura-danger hover:text-white transition-colors">Discard</button>
        </div>`;
      body.querySelector('[data-discard-confirm]')?.addEventListener('click', () => {
        this._discardDraft(pd);
        this.closeModal();
        if (typeof onConfirm === 'function') onConfirm();
      });
      body.querySelector('[data-discard-cancel]')?.addEventListener('click', () => this.closeModal());
      this.openModal({ title: 'Discard changes?', body });
    },

    // ─── Edit-tool helpers ────────────────────────────────────────────────────

    _ensureCustomPattern(pd) {
      return this._ensurePatternDesignerEditableMeta(pd);
    },

    _getPatternSvg(pd) {
      const meta = this._getPatternMetaForLayer(pd.layer);
      return meta?.svg || null;
    },

    _pushPdHistory(pd) {
      const meta = this._getPatternMetaForLayer(pd.layer);
      pd.history.push({
        fills: this._clonePatternFills(pd.fills),
        svgState: meta?.svg != null ? { svg: meta.svg, patternId: meta.id } : null,
      });
    },

    _commitSvgEdit(pd, newSvg) {
      const registry = getPatternRegistry();
      const meta = this._getPatternMetaForLayer(pd.layer);
      if (!meta || !registry) return false;
      this._pushPdHistory(pd);
      const saved = registry.saveCustomPattern({ ...meta, svg: newSvg, cachedTile: null, validation: null });
      if (!saved) return false;
      if (pd.draftEdit) pd.draftEdit.isDirty = true;
      pd.layer.params.patternId = saved.id;
      this.storeLayerParams(pd.layer);
      window.Vectura.AlgorithmRegistry?.patternInvalidateCache?.(saved.id);
      if (this.app.pushHistory) this.app.pushHistory();
      this.app.regen();
      this._renderPatternDesigner(pd);
      this._refreshPatternValidation(pd);
      return true;
    },

    _discardDraft(pd) {
      const registry = getPatternRegistry();
      if (!pd.draftEdit) return;
      const { originalId, draftId } = pd.draftEdit;
      registry.discardDraftPattern?.(draftId);
      pd.draftEdit = null;
      pd.layer.params.patternId = originalId;
      this.storeLayerParams(pd.layer);
      window.Vectura.AlgorithmRegistry?.patternInvalidateCache?.(draftId);
      this._syncPdToolActive(pd);
      this._renderPatternDesigner(pd);
      this._refreshPatternValidation(pd);
    },

    _commitDraftAsUserPattern(pd, name) {
      const registry = getPatternRegistry();
      if (!registry) return null;
      const draftMeta = pd.draftEdit?.draftId
        ? registry.getPatternById(pd.draftEdit.draftId)
        : this._getPatternMetaForLayer(pd.layer);
      if (!draftMeta) return null;
      const saved = registry.saveCustomPattern({
        ...draftMeta,
        id: registry.ensureCustomId(name),
        name: `${name}`.trim() || draftMeta.name,
        isDraft: false,
        source: 'Custom Patterns',
        validation: null,
        cachedTile: null,
      });
      if (!saved) return null;
      if (pd.draftEdit?.draftId) registry.discardDraftPattern?.(pd.draftEdit.draftId);
      pd.draftEdit = null;
      pd.layer.params.patternId = saved.id;
      this.storeLayerParams(pd.layer);
      this._downloadPatternSvg(saved.name, draftMeta.svg);
      if (this.app.pushHistory) this.app.pushHistory();
      this.app.regen();
      this.buildControls();
      this.updateFormula();
      this._syncPdToolActive(pd);
      this._refreshPatternValidation(pd);
      return saved;
    },

    _downloadPatternSvg(name, svg) {
      if (!svg) return;
      try {
        const blob = new Blob([svg], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${name || 'pattern'}.svg`.replace(/[^a-z0-9_\-. ]/gi, '_');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        // Download is best-effort.
      }
    },

    _deletePathFromTileSvg(pd, flatIndex) {
      const editableMeta = this._ensureCustomPattern(pd);
      if (!editableMeta) return;
      const svgText = editableMeta.svg;
      if (!svgText) return;
      const mapEntry = pd.pathMap?.find(e => e.flatIndex === flatIndex);
      const elIdx = mapEntry?.path?._srcElementIndex;
      if (elIdx === undefined) return;
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgText, 'image/svg+xml');
      const elements = Array.from(doc.querySelectorAll('path,line,polyline,polygon,rect,ellipse,circle'));
      if (elIdx < 0 || elIdx >= elements.length) return;
      elements[elIdx].parentNode.removeChild(elements[elIdx]);
      const newSvg = new XMLSerializer().serializeToString(doc.documentElement);
      pd.selectedPath = null;
      this._syncPdToolActive(pd);
      this._commitSvgEdit(pd, newSvg);
    },

    _addPathToTileSvg(pd, anchors) {
      if (!anchors || anchors.length < 2) return;
      const editableMeta = this._ensureCustomPattern(pd);
      if (!editableMeta) return;
      const svgText = editableMeta.svg || '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgText, 'image/svg+xml');
      const svgEl = doc.documentElement;
      const d = anchors.map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt.x.toFixed(3)},${pt.y.toFixed(3)}`).join(' ');
      const pathEl = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
      pathEl.setAttribute('d', d);
      pathEl.setAttribute('stroke', 'currentColor');
      pathEl.setAttribute('fill', 'none');
      svgEl.appendChild(pathEl);
      const newSvg = new XMLSerializer().serializeToString(svgEl);
      pd.pendingAnchors = [];
      this._commitSvgEdit(pd, newSvg);
    },

    _addShapeToTileSvg(pd, type, bounds) {
      const { x0, y0, w, h } = bounds;
      if (w < 1 || h < 1) return;
      const editableMeta = this._ensureCustomPattern(pd);
      if (!editableMeta) return;
      const svgText = editableMeta.svg || '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgText, 'image/svg+xml');
      const svgEl = doc.documentElement;
      let el;
      if (type === 'shape-oval') {
        el = doc.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        el.setAttribute('cx', (x0 + w / 2).toFixed(3));
        el.setAttribute('cy', (y0 + h / 2).toFixed(3));
        el.setAttribute('rx', (w / 2).toFixed(3));
        el.setAttribute('ry', (h / 2).toFixed(3));
      } else {
        el = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
        el.setAttribute('x', x0.toFixed(3));
        el.setAttribute('y', y0.toFixed(3));
        el.setAttribute('width', w.toFixed(3));
        el.setAttribute('height', h.toFixed(3));
      }
      el.setAttribute('stroke', 'currentColor');
      el.setAttribute('fill', 'none');
      svgEl.appendChild(el);
      const newSvg = new XMLSerializer().serializeToString(svgEl);
      pd.dragShape = null;
      this._commitSvgEdit(pd, newSvg);
    },

    _trimPathToTile(pd, flatIndex, vbW, vbH, margins = {}) {
      const editableMeta = this._ensureCustomPattern(pd);
      if (!editableMeta) return;
      const svgText = editableMeta.svg;
      if (!svgText) return;
      const mapEntry = pd.pathMap?.find(e => e.flatIndex === flatIndex);
      const elIdx = mapEntry?.path?._srcElementIndex;
      if (elIdx === undefined) return;
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgText, 'image/svg+xml');
      const elements = Array.from(doc.querySelectorAll('path,line,polyline,polygon,rect,ellipse,circle'));
      if (elIdx < 0 || elIdx >= elements.length) return;
      const el = elements[elIdx];

      // Get path points from pd.pathMap
      const entry = mapEntry;
      if (!entry) return;
      const pts = entry.path;

      // Cohen-Sutherland clip segments to tile bounds ± margins
      const mTop = Math.max(0, Math.min(5, margins.top || 0));
      const mBottom = Math.max(0, Math.min(5, margins.bottom || 0));
      const mLeft = Math.max(0, Math.min(5, margins.left || 0));
      const mRight = Math.max(0, Math.min(5, margins.right || 0));
      const clipX0 = mLeft, clipY0 = mTop, clipX1 = vbW - mRight, clipY1 = vbH - mBottom;
      const INSIDE = 0, LEFT = 1, RIGHT = 2, BOTTOM = 4, TOP = 8;
      const code = (x, y) => {
        let c = INSIDE;
        if (x < clipX0) c |= LEFT;
        else if (x > clipX1) c |= RIGHT;
        if (y < clipY0) c |= TOP;
        else if (y > clipY1) c |= BOTTOM;
        return c;
      };
      const clipSeg = (x0, y0, x1, y1) => {
        let c0 = code(x0, y0), c1 = code(x1, y1);
        let px0 = x0, py0 = y0, px1 = x1, py1 = y1;
        for (;;) {
          if (!(c0 | c1)) return [px0, py0, px1, py1];
          if (c0 & c1) return null;
          const cOut = c0 || c1;
          let x, y;
          if (cOut & BOTTOM) { x = px0 + (px1 - px0) * (clipY1 - py0) / (py1 - py0); y = clipY1; }
          else if (cOut & TOP) { x = px0 + (px1 - px0) * (clipY0 - py0) / (py1 - py0); y = clipY0; }
          else if (cOut & RIGHT) { y = py0 + (py1 - py0) * (clipX1 - px0) / (px1 - px0); x = clipX1; }
          else { y = py0 + (py1 - py0) * (clipX0 - px0) / (px1 - px0); x = clipX0; }
          if (cOut === c0) { px0 = x; py0 = y; c0 = code(px0, py0); }
          else { px1 = x; py1 = y; c1 = code(px1, py1); }
        }
      };

      // Build clipped sub-paths
      const subPaths = [];
      let cur = null;
      for (let i = 0; i + 1 < pts.length; i++) {
        const seg = clipSeg(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
        if (!seg) { if (cur) { subPaths.push(cur); cur = null; } continue; }
        const [sx0, sy0, sx1, sy1] = seg;
        if (!cur) cur = [{ x: sx0, y: sy0 }];
        cur.push({ x: sx1, y: sy1 });
      }
      if (cur) subPaths.push(cur);

      if (!subPaths.length) {
        // Nothing inside tile — just delete
        el.parentNode.removeChild(el);
      } else {
        // Replace element with trimmed path(s)
        const parent = el.parentNode;
        subPaths.forEach((sub, i) => {
          const d = sub.map((pt, j) => `${j === 0 ? 'M' : 'L'}${pt.x.toFixed(3)},${pt.y.toFixed(3)}`).join(' ');
          const newEl = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
          newEl.setAttribute('d', d);
          newEl.setAttribute('stroke', 'currentColor');
          newEl.setAttribute('fill', 'none');
          if (i === 0) parent.replaceChild(newEl, el);
          else parent.appendChild(newEl);
        });
      }

      const newSvg = new XMLSerializer().serializeToString(doc.documentElement);
      pd.selectedPath = null;
      this._syncPdToolActive(pd);
      this._commitSvgEdit(pd, newSvg);
    },

    _bindPatternDesignerEditTools(pd) {
      const canvas = pd.root.querySelector('[data-pd-canvas]');
      if (!canvas) return;

      const toTile = (ex, ey) => ({
        x: (ex - pd.view.offsetX) / pd.view.zoom,
        y: (ey - pd.view.offsetY) / pd.view.zoom,
      });

      const HIT_RADIUS = 6;

      const hitTestPath = (tx, ty) => {
        let best = null, bestDist = HIT_RADIUS / pd.view.zoom;
        for (const { path, flatIndex } of pd.pathMap) {
          for (let i = 0; i + 1 < path.length; i++) {
            const ax = path[i].x, ay = path[i].y;
            const bx = path[i + 1].x, by = path[i + 1].y;
            const dxs = bx - ax, dys = by - ay;
            const len2 = dxs * dxs + dys * dys;
            let t = len2 > 0 ? ((tx - ax) * dxs + (ty - ay) * dys) / len2 : 0;
            t = Math.max(0, Math.min(1, t));
            const px = ax + t * dxs, py = ay + t * dys;
            const dist = Math.hypot(tx - px, ty - py);
            if (dist < bestDist) { bestDist = dist; best = flatIndex; }
          }
        }
        return best;
      };

      // ── Direct-select drag state ───────────────────────────────────────────
      let directDrag = null;

      const startDirectDrag = (control, tx, ty, e) => {
        const state = pd.directEditState;
        if (!state) return;
        if (control.type === 'anchor') {
          if (e.shiftKey) {
            if (state.selectedIndices.has(control.index)) state.selectedIndices.delete(control.index);
            else state.selectedIndices.add(control.index);
          } else if (!state.selectedIndices.has(control.index)) {
            state.selectedIndices = new Set([control.index]);
          }
          if (e.altKey) {
            // Duplicate anchor
            const orig = state.anchors[control.index];
            const dup = { x: orig.x, y: orig.y, in: orig.in ? { ...orig.in } : null, out: orig.out ? { ...orig.out } : null };
            const insertIdx = control.index + 1;
            state.anchors.splice(insertIdx, 0, dup);
            state.selectedIndices = new Set([insertIdx]);
            control = { type: 'anchor', index: insertIdx };
          }
        }
        const anchor = state.anchors[control.index];
        const otherStarts = control.type === 'anchor'
          ? [...state.selectedIndices].filter(i => i !== control.index).map(i => {
              const a = state.anchors[i];
              return a ? { index: i, x: a.x, y: a.y } : null;
            }).filter(Boolean)
          : [];
        directDrag = {
          type: control.type,
          index: control.index,
          anchorStart: anchor ? { x: anchor.x, y: anchor.y } : null,
          otherStarts,
          moved: false,
          commitPending: false,
        };
      };

      const updateDirectDrag = (tx, ty, e) => {
        if (!directDrag || !pd.directEditState) return;
        const state = pd.directEditState;
        const anchor = state.anchors[directDrag.index];
        if (!anchor) return;

        if (directDrag.type === 'anchor') {
          let next = { x: tx, y: ty };
          if (e.shiftKey && directDrag.anchorStart) {
            next = this._snapDirectAngle(directDrag.anchorStart, next, 15);
          }
          const dxm = next.x - anchor.x, dym = next.y - anchor.y;
          anchor.x = next.x; anchor.y = next.y;
          if (anchor.in) { anchor.in.x += dxm; anchor.in.y += dym; }
          if (anchor.out) { anchor.out.x += dxm; anchor.out.y += dym; }
          for (const other of directDrag.otherStarts) {
            const oa = state.anchors[other.index];
            if (!oa) continue;
            oa.x += dxm; oa.y += dym;
            if (oa.in) { oa.in.x += dxm; oa.in.y += dym; }
            if (oa.out) { oa.out.x += dxm; oa.out.y += dym; }
          }
        } else {
          // Bezier handle drag
          anchor[directDrag.type] = { x: tx, y: ty };
          if (!e.altKey) {
            // Mirror opposite handle for smooth editing
            const mirror = directDrag.type === 'in' ? 'out' : 'in';
            const dx = anchor.x - tx, dy = anchor.y - ty;
            anchor[mirror] = { x: anchor.x + dx, y: anchor.y + dy };
          }
        }
        directDrag.moved = true;
        directDrag.commitPending = true;
        this._renderPatternDesigner(pd);
      };

      const endDirectDrag = () => {
        if (!directDrag) return;
        if (directDrag.moved && directDrag.commitPending) {
          this._commitDirectEditToSvg(pd);
          this._refreshFillRegions(pd);
          this._applyPatternDesignerChanges(pd, { skipHistoryPush: true });
        }
        directDrag = null;
      };

      let penDblTimer = null;

      const onEditDown = (e) => {
        if (e.button !== 0) return;
        const rect = canvas.getBoundingClientRect();
        const ex = e.clientX - rect.left, ey = e.clientY - rect.top;
        const { x: tx, y: ty } = toTile(ex, ey);

        if (pd.tool === 'select') {
          const hit = hitTestPath(tx, ty);
          pd.selectedPath = (hit !== null && hit === pd.selectedPath) ? null : hit;
          this._syncPdToolActive(pd);
          this._renderPatternDesigner(pd);
          return;
        }

        if (pd.tool === 'move') {
          const hitFlatIdx = hitTestPath(tx, ty);
          if (hitFlatIdx !== null) {
            const mapEntry = pd.pathMap.find(entry => entry.flatIndex === hitFlatIdx);
            const elIdx = mapEntry?.path?._srcElementIndex;
            if (elIdx !== undefined) {
              const editableMeta = this._ensureCustomPattern(pd);
              if (editableMeta?.svg) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(editableMeta.svg, 'image/svg+xml');
                const elements = Array.from(doc.querySelectorAll('path,line,polyline,polygon,rect,ellipse,circle'));
                if (elIdx < elements.length) {
                  const editSet = this._svgElementToEditSet(elements[elIdx], elIdx);
                  if (editSet) {
                    pd.moveDrag = {
                      elIdx,
                      origAnchors: editSet.anchors.map(a => ({ ...a })),
                      currentAnchors: editSet.anchors.map(a => ({ ...a })),
                      closed: editSet.closed,
                      startTx: tx, startTy: ty,
                      moved: false,
                    };
                    this._renderPatternDesigner(pd);
                  }
                }
              }
            }
          }
          return;
        }

        if (pd.tool === 'direct') {
          // First check if we hit a control in the current edit state
          const ctrlHit = this._hitDirectSelectControl(pd, tx, ty);
          if (ctrlHit) {
            startDirectDrag(ctrlHit, tx, ty, e);
            return;
          }
          // Otherwise hit-test paths to start editing a new element
          const hitFlatIdx = hitTestPath(tx, ty);
          if (hitFlatIdx !== null) {
            const mapEntry = pd.pathMap.find(entry => entry.flatIndex === hitFlatIdx);
            const elIdx = mapEntry?.path?._srcElementIndex;
            if (elIdx !== undefined) {
              const editableMeta = this._ensureCustomPattern(pd);
              if (editableMeta?.svg) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(editableMeta.svg, 'image/svg+xml');
                const elements = Array.from(doc.querySelectorAll('path,line,polyline,polygon,rect,ellipse,circle'));
                if (elIdx < elements.length) {
                  const editSet = this._svgElementToEditSet(elements[elIdx], elIdx);
                  if (editSet) {
                    pd.directEditState = { ...editSet, selectedIndices: new Set() };
                    startDirectDrag({ type: 'anchor', index: 0 }, tx, ty, e);
                    // Find nearest anchor to the click and use that instead
                    let nearIdx = 0, nearDist = Infinity;
                    pd.directEditState.anchors.forEach((a, i) => {
                      const d = Math.hypot(tx - a.x, ty - a.y);
                      if (d < nearDist) { nearDist = d; nearIdx = i; }
                    });
                    directDrag = null;
                    pd.directEditState.selectedIndices = new Set();
                    startDirectDrag({ type: 'anchor', index: nearIdx }, tx, ty, e);
                    this._renderPatternDesigner(pd);
                    return;
                  }
                }
              }
            }
          }
          // Click on empty space — clear selection
          if (!e.shiftKey) {
            pd.directEditState = null;
            this._renderPatternDesigner(pd);
          }
          return;
        }

        if (pd.tool === 'pen') {
          if (pd.pendingAnchors.length >= 2) {
            const first = pd.pendingAnchors[0];
            const distToFirst = Math.hypot(tx - first.x, ty - first.y);
            if (distToFirst < HIT_RADIUS / pd.view.zoom || e.detail >= 2) {
              if (penDblTimer) { clearTimeout(penDblTimer); penDblTimer = null; }
              this._addPathToTileSvg(pd, [...pd.pendingAnchors, { ...pd.pendingAnchors[0] }]);
              return;
            }
          }
          if (penDblTimer) { clearTimeout(penDblTimer); penDblTimer = null; }
          penDblTimer = setTimeout(() => { penDblTimer = null; }, 300);
          pd.pendingAnchors.push({ x: tx, y: ty });
          this._renderPatternDesigner(pd);
          return;
        }

        if (pd.tool === 'shape-rect' || pd.tool === 'shape-oval') {
          pd.dragShape = { startX: tx, startY: ty, endX: tx, endY: ty, type: pd.tool };
          return;
        }
      };

      const onEditMove = (e) => {
        if (!(e.buttons & 1)) return;
        const rect = canvas.getBoundingClientRect();
        const { x: tx, y: ty } = toTile(e.clientX - rect.left, e.clientY - rect.top);
        if (pd.tool === 'direct' && directDrag) {
          updateDirectDrag(tx, ty, e);
          return;
        }
        if (pd.tool === 'move' && pd.moveDrag) {
          const dx = tx - pd.moveDrag.startTx;
          const dy = ty - pd.moveDrag.startTy;
          pd.moveDrag.currentAnchors = pd.moveDrag.origAnchors.map(a => ({ ...a, x: a.x + dx, y: a.y + dy }));
          pd.moveDrag.moved = true;
          this._renderPatternDesigner(pd);
          return;
        }
        if (pd.dragShape) {
          pd.dragShape.endX = tx;
          pd.dragShape.endY = ty;
          this._renderPatternDesigner(pd);
        }
      };

      const onEditUp = (e) => {
        if (e.button !== 0) return;
        if (pd.tool === 'direct' && directDrag) {
          endDirectDrag();
          return;
        }
        if (pd.tool === 'move' && pd.moveDrag) {
          if (pd.moveDrag.moved) {
            pd.directEditState = {
              elIndex: pd.moveDrag.elIdx,
              anchors: pd.moveDrag.currentAnchors,
              closed: pd.moveDrag.closed,
              selectedIndices: new Set(),
            };
            this._commitDirectEditToSvg(pd);
            pd.directEditState = null;
            this._refreshFillRegions(pd);
            this._applyPatternDesignerChanges(pd, { skipHistoryPush: true });
          }
          pd.moveDrag = null;
          this._renderPatternDesigner(pd);
          return;
        }
        if (pd.dragShape && (pd.tool === 'shape-rect' || pd.tool === 'shape-oval')) {
          const { startX, startY, endX, endY, type } = pd.dragShape;
          const x0 = Math.min(startX, endX), y0 = Math.min(startY, endY);
          const w = Math.abs(endX - startX), h = Math.abs(endY - startY);
          pd.dragShape = null;
          this._addShapeToTileSvg(pd, type, { x0, y0, w, h });
        }
      };

      const onEditKey = (e) => {
        if (!pd?.root) return;
        const tag = document.activeElement?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'select' || tag === 'textarea') return;

        if (e.key === 'z' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          const entry = pd.history.pop();
          if (!entry) return;
          const fills = entry.fills ?? entry;
          const svgState = entry.svgState ?? null;
          pd.fills = fills;
          if (svgState) {
            const registry = getPatternRegistry();
            const meta = this._getPatternMetaForLayer(pd.layer);
            if (registry && meta) {
              registry.saveCustomPattern({ ...meta, svg: svgState.svg, cachedTile: null, validation: null });
              window.Vectura.AlgorithmRegistry?.patternInvalidateCache?.(svgState.patternId);
              pd.directEditState = null;
              this.app.regen();
            }
          }
          this._applyPatternDesignerChanges(pd);
          return;
        }

        if (e.key === 'a' || e.key === 'A') {
          e.preventDefault();
          pd.tool = 'direct';
          pd.selectedPath = null; pd.pendingAnchors = []; pd.dragShape = null;
          this._syncPdToolActive(pd); this._renderPatternDesigner(pd);
        } else if (e.key === 'v' || e.key === 'V') {
          e.preventDefault();
          pd.tool = 'move'; pd.moveDrag = null; pd.directEditState = null;
          pd.pendingAnchors = []; pd.dragShape = null;
          this._syncPdToolActive(pd); this._renderPatternDesigner(pd);
        } else if (e.key === 's' || e.key === 'S') {
          e.preventDefault();
          pd.tool = 'select'; pd.directEditState = null;
          pd.pendingAnchors = []; pd.dragShape = null;
          this._syncPdToolActive(pd); this._renderPatternDesigner(pd);
        } else if (e.key === 'p' || e.key === 'P') {
          e.preventDefault();
          pd.tool = 'pen'; pd.directEditState = null;
          pd.pendingAnchors = []; pd.dragShape = null;
          this._syncPdToolActive(pd); this._renderPatternDesigner(pd);
        } else if (e.key === 'r' || e.key === 'R') {
          e.preventDefault();
          pd.tool = 'shape-rect'; pd.directEditState = null;
          pd.pendingAnchors = []; pd.dragShape = null;
          this._syncPdToolActive(pd); this._renderPatternDesigner(pd);
        } else if (e.key === 'o' || e.key === 'O') {
          e.preventDefault();
          pd.tool = 'shape-oval'; pd.directEditState = null;
          pd.pendingAnchors = []; pd.dragShape = null;
          this._syncPdToolActive(pd); this._renderPatternDesigner(pd);
        } else if ((e.key === 'Delete' || e.key === 'Backspace') && pd.tool === 'select' && pd.selectedPath !== null) {
          e.preventDefault();
          this._deletePathFromTileSvg(pd, pd.selectedPath);
        } else if ((e.key === 'Delete' || e.key === 'Backspace') && pd.tool === 'direct' && pd.directEditState) {
          // Delete selected anchor(s) from the direct-edit path
          e.preventDefault();
          const state = pd.directEditState;
          if (state.selectedIndices.size > 0 && state.anchors.length > state.selectedIndices.size + 1) {
            const sorted = [...state.selectedIndices].sort((a, b) => b - a);
            sorted.forEach(i => state.anchors.splice(i, 1));
            state.selectedIndices = new Set();
            this._commitDirectEditToSvg(pd);
          }
        } else if (pd.tool === 'direct' && pd.directEditState && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault();
          const step = (e.metaKey || e.ctrlKey) ? 10 : 1;
          const dxk = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
          const dyk = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
          const state = pd.directEditState;
          const indicesToMove = state.selectedIndices.size
            ? [...state.selectedIndices]
            : state.anchors.map((_, i) => i);
          indicesToMove.forEach(i => {
            const a = state.anchors[i];
            if (!a) return;
            a.x += dxk; a.y += dyk;
            if (a.in) { a.in.x += dxk; a.in.y += dyk; }
            if (a.out) { a.out.x += dxk; a.out.y += dyk; }
          });
          this._commitDirectEditToSvg(pd);
        } else if (e.key === 'Escape') {
          pd.pendingAnchors = []; pd.dragShape = null; pd.directEditState = null;
          directDrag = null;
          this._renderPatternDesigner(pd);
        }
      };

      // Register — canvas gets the pointer events, window gets keys
      canvas.addEventListener('pointerdown', onEditDown);
      window.addEventListener('pointermove', onEditMove);
      window.addEventListener('pointerup', onEditUp);
      window.addEventListener('keydown', onEditKey);

      // Merge cleanup into pd.cleanupCanvas (already set by _bindPatternDesignerCanvas)
      const prevCleanup = pd.cleanupCanvas || (() => {});
      pd.cleanupCanvas = () => {
        prevCleanup();
        canvas.removeEventListener('pointerdown', onEditDown);
        window.removeEventListener('pointermove', onEditMove);
        window.removeEventListener('pointerup', onEditUp);
        window.removeEventListener('keydown', onEditKey);
        if (penDblTimer) clearTimeout(penDblTimer);
      };
    },
  };
})();
