/**
 * Vectura — Divisions editor section (Phase 4A Inc-1).
 *
 * Registers a `divisions` control section on the shared FillControlSurface
 * (the reserved registerSection hook — no section shipped before this). The
 * section authors a layer's stroke divisions: an enable toggle, a phase
 * control, and a repeating CLASS LIST where each row is a run length (mm) + a
 * pen chooser (penId|null; null = the layer's OWN pen) + a gap toggle, with
 * add / remove / reorder.
 *
 * UNIVERSAL, not fill-scoped: the section edits `layer.divisions` (the
 * {enabled, phaseMm, classes:[{lenMm, penId, gap}]} bag from defaults.js), NOT
 * the caller's fill-params bag. A host mounts it by declaring
 *   caps: ['divisions'], sections: ['divisions'], sectionsOnly: true,
 *   sectionContext: { app, getLayer }
 * on FillControlSurface.mount. Every write routes through
 * engine.ensureLayerDivisions(layer) then a recompute
 * (computeAllDisplayGeometry runs the division pass at the optimizeLayers tail),
 * so the canvas, export, and plot stats all update.
 *
 * Inc-1 edits ONLY the existing schema. sanitizeDivisions (stroke-divide.js) +
 * ensureLayerDivisions (engine.js) STRIP unknown fields, so any new grammar
 * field must land in lockstep with those normalizers — that is Inc-3, not here.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};
  const FCS = UI.FillControlSurface;
  if (!FCS || typeof FCS.registerSection !== 'function') return;

  // ── doc-unit helpers (mm canonical; mirrors fill-control-surface) ──────────
  const getDocUnits = () => {
    const UU = Vectura.UnitUtils || {};
    const settings = Vectura.SETTINGS || {};
    return UU.normalizeDocumentUnits ? UU.normalizeDocumentUnits(settings.documentUnits) : 'metric';
  };
  const getUnitLabel = () => {
    const UU = Vectura.UnitUtils || {};
    return UU.getDocumentUnitLabel ? UU.getDocumentUnitLabel(getDocUnits()) : (getDocUnits() === 'imperial' ? 'in' : 'mm');
  };
  const mmToDoc = (v) => {
    const UU = Vectura.UnitUtils || {};
    if (UU.mmToDocumentUnits) return UU.mmToDocumentUnits(v, getDocUnits());
    return getDocUnits() === 'imperial' ? Number(v || 0) / 25.4 : Number(v || 0);
  };
  const docToMm = (v) => {
    const UU = Vectura.UnitUtils || {};
    if (UU.documentUnitsToMm) return UU.documentUnitsToMm(v, getDocUnits());
    return getDocUnits() === 'imperial' ? Number(v || 0) * 25.4 : Number(v || 0);
  };
  const docPrecision = () => (getDocUnits() === 'imperial' ? 3 : 2);
  const fmtDoc = (mm) => {
    const v = mmToDoc(Number(mm) || 0);
    if (!Number.isFinite(v)) return '0';
    let text = v.toFixed(docPrecision());
    if (text.includes('.')) text = text.replace(/\.?0+$/, '');
    return text || '0';
  };

  const getPens = () => {
    const pens = Vectura.SETTINGS && Vectura.SETTINGS.pens;
    return Array.isArray(pens) ? pens : [];
  };
  const penColor = (penId) => {
    const pen = getPens().find((p) => p && p.id === penId);
    return (pen && pen.color) || null;
  };

  const el = (tag, attrs = {}, children = []) => {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (v == null) return;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else node.setAttribute(k, v);
    });
    (Array.isArray(children) ? children : [children]).forEach((c) => c && node.appendChild(c));
    return node;
  };

  // Small select helper (Inc-3) — prefers the shared UI.Select, falls back to a
  // native <select> on harnesses without the component. The data-attr lands on
  // whichever element the value lives on so it stays queryable either way.
  const makeSelect = (options, value, enabled, onChange, attrs = {}) => {
    const host = el('div', { class: 'fcs-divisions-select' });
    if (typeof UI.Select === 'function') {
      UI.Select(host, { options, value, disabled: !enabled, ariaLabel: attrs['aria-label'], onChange });
      Object.entries(attrs).forEach(([k, v]) => { if (k !== 'aria-label') host.setAttribute(k, v); });
      return host;
    }
    const sel = el('select', { class: 'ctrl-sel' });
    Object.entries(attrs).forEach(([k, v]) => sel.setAttribute(k, v));
    options.forEach((o) => sel.appendChild(el('option', { value: o.value, text: o.label })));
    sel.value = value;
    sel.disabled = !enabled;
    sel.addEventListener('change', () => onChange(sel.value));
    host.appendChild(sel);
    return host;
  };

  /**
   * Section renderer. Rebuilds `ctx.container` from the LIVE layer.divisions on
   * every structural change (enable / add / remove / reorder); leaf edits
   * (length / pen / gap / phase) mutate + recompute in place so focus survives.
   */
  function build(ctx) {
    const container = ctx.container;
    if (!container) return;
    const sc = ctx.sectionContext || {};
    const app = sc.app || G.app || null;
    const engine = sc.engine || (app && app.engine) || null;
    const getLayer = typeof sc.getLayer === 'function' ? sc.getLayer : () => null;

    const layer = getLayer();
    if (!engine || !layer) {
      // No layer context — a host mounted the section without a target. Render
      // a quiet hint rather than a broken editor.
      container.textContent = '';
      container.appendChild(el('p', { class: 'fcs-divisions-hint', text: 'Select a layer to divide its strokes.' }));
      return;
    }

    const divs = () => (engine.ensureLayerDivisions ? engine.ensureLayerDivisions(layer) : layer.divisions)
      || { enabled: false, phaseMm: 0, classes: [] };

    const snapshot = () => {
      if (app && typeof app.pushHistory === 'function') app.pushHistory();
      else if (typeof ctx.onEdit === 'function') ctx.onEdit();
    };
    // Recompute path: ensure + geometry recompute (runs the division pass at
    // the optimizeLayers tail) + repaint. Mirrors the stroke-options recompute.
    const recompute = () => {
      if (engine.ensureLayerDivisions) engine.ensureLayerDivisions(layer);
      if (engine.computeAllDisplayGeometry) engine.computeAllDisplayGeometry();
      if (app && typeof app.render === 'function') app.render();
      if (typeof ctx.onChange === 'function') ctx.onChange(true);
    };

    const render = () => {
      const d = divs();
      const enabled = Boolean(d.enabled);
      container.textContent = '';

      // Header + enable toggle.
      const head = el('div', { class: 'fcs-divisions-head' });
      const enableLabel = el('label', { class: 'fcs-divisions-enable' });
      const enableInput = el('input', { type: 'checkbox', 'data-divisions-enable': '', 'aria-label': 'Enable stroke divisions' });
      enableInput.checked = enabled;
      enableInput.addEventListener('change', () => {
        snapshot();
        divs().enabled = enableInput.checked;
        recompute();
        render();
      });
      enableLabel.appendChild(enableInput);
      enableLabel.appendChild(el('span', { class: 'fcs-divisions-title', text: 'Divisions' }));
      head.appendChild(enableLabel);
      container.appendChild(head);

      // Body (phase + class list + add) is only meaningful when enabled.
      const body = el('div', { class: 'fcs-divisions-body' + (enabled ? '' : ' is-disabled') });
      container.appendChild(body);

      // Phase control (mm, shown in doc units).
      const phaseRow = el('div', { class: 'fcs-divisions-row fcs-divisions-phase-row' });
      phaseRow.appendChild(el('label', { class: 'fcs-divisions-label', for: 'fcs-divisions-phase', text: `Phase (${getUnitLabel()})` }));
      const phaseInput = el('input', {
        type: 'number', id: 'fcs-divisions-phase', class: 'fcs-divisions-num',
        'data-divisions-phase': '', inputmode: 'decimal', step: 'any',
        'aria-label': 'Division phase',
      });
      phaseInput.value = fmtDoc(d.phaseMm);
      phaseInput.disabled = !enabled;
      const commitPhase = () => {
        const doc = parseFloat(`${phaseInput.value}`.replace(/[^\d.\-]/g, ''));
        if (!Number.isFinite(doc)) { phaseInput.value = fmtDoc(divs().phaseMm); return; }
        snapshot();
        divs().phaseMm = docToMm(doc);
        recompute();
      };
      phaseInput.addEventListener('change', commitPhase);
      phaseInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { commitPhase(); phaseInput.blur(); } });
      phaseRow.appendChild(phaseInput);
      body.appendChild(phaseRow);

      // Grammar modes (Inc-3): pen assignment (Cycle / Weighted) + phase
      // behavior (Fixed / Per-path / Jitter). Both are structural — a change
      // shows/hides the per-class weight widgets + the seed row, so they
      // rebuild the section via render().
      const modesRow = el('div', { class: 'fcs-divisions-row fcs-divisions-modes-row' });
      modesRow.appendChild(el('label', { class: 'fcs-divisions-label', text: 'Pens' }));
      modesRow.appendChild(makeSelect(
        [{ value: 'cycle', label: 'Cycle' }, { value: 'weighted', label: 'Weighted' }],
        d.penMode || 'cycle', enabled,
        (v) => { snapshot(); divs().penMode = v; recompute(); render(); },
        { 'data-divisions-penmode': '', 'aria-label': 'Pen assignment mode' },
      ));
      modesRow.appendChild(el('label', { class: 'fcs-divisions-label', text: 'Phase mode' }));
      modesRow.appendChild(makeSelect(
        [{ value: 'fixed', label: 'Fixed' }, { value: 'perPath', label: 'Per-path' }, { value: 'jitter', label: 'Jitter' }],
        d.phaseMode || 'fixed', enabled,
        (v) => { snapshot(); divs().phaseMode = v; recompute(); render(); },
        { 'data-divisions-phasemode': '', 'aria-label': 'Phase mode' },
      ));
      body.appendChild(modesRow);

      // Seed (Inc-3) — only relevant to the deterministic modes (weighted pens
      // and jitter phase). Changing it deterministically re-shuffles.
      if (d.penMode === 'weighted' || d.phaseMode === 'jitter') {
        const seedRow = el('div', { class: 'fcs-divisions-row fcs-divisions-seed-row' });
        seedRow.appendChild(el('label', { class: 'fcs-divisions-label', for: 'fcs-divisions-seed', text: 'Seed' }));
        const seedInput = el('input', {
          type: 'number', id: 'fcs-divisions-seed', class: 'fcs-divisions-num',
          'data-divisions-seed': '', step: '1', inputmode: 'numeric', 'aria-label': 'Division seed',
        });
        seedInput.value = String(Math.trunc(Number(d.seed) || 0));
        seedInput.disabled = !enabled;
        const commitSeed = () => {
          const n = parseInt(`${seedInput.value}`.replace(/[^\d.\-]/g, ''), 10);
          snapshot();
          divs().seed = Number.isFinite(n) ? n : 0;
          recompute();
        };
        seedInput.addEventListener('change', commitSeed);
        seedInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { commitSeed(); seedInput.blur(); } });
        seedRow.appendChild(seedInput);
        body.appendChild(seedRow);
      }

      // Class list.
      const list = el('div', { class: 'fcs-divisions-classes', 'data-divisions-classes': '' });
      body.appendChild(list);

      const classes = Array.isArray(d.classes) ? d.classes : [];
      if (!classes.length) {
        list.appendChild(el('p', { class: 'fcs-divisions-hint', text: 'No classes — add a run length below.' }));
      }
      classes.forEach((cls, i) => list.appendChild(buildClassRow(cls, i, classes.length)));

      // Add-class button.
      const add = el('button', {
        type: 'button', class: 'fcs-divisions-add', 'data-divisions-add': '',
        'aria-label': 'Add division class',
      }, [document.createTextNode('+ Add Class')]);
      add.disabled = !enabled;
      add.addEventListener('click', () => {
        snapshot();
        const arr = divs().classes;
        arr.push({ lenMm: 10, penId: null, gap: false });
        recompute();
        render();
      });
      body.appendChild(add);
    };

    const buildClassRow = (cls, i, count) => {
      const d = divs();
      const enabled = Boolean(d.enabled);
      const row = el('div', { class: 'fcs-divisions-row fcs-divisions-class', 'data-division-row': String(i) });

      // Pen swatch (reflects the resolved color; layer pen when penId is null).
      const swatch = el('span', { class: 'fcs-divisions-swatch', 'data-division-swatch': '' });
      const paintSwatch = () => {
        const pid = divs().classes[i] ? divs().classes[i].penId : null;
        const color = penColor(pid) || penColor(layer.penId) || 'transparent';
        swatch.style.background = color;
      };
      paintSwatch();
      row.appendChild(swatch);

      // Length (mm, shown in doc units).
      const lenInput = el('input', {
        type: 'number', class: 'fcs-divisions-num', 'data-division-len': '',
        inputmode: 'decimal', step: 'any', min: '0',
        'aria-label': `Class ${i + 1} length`,
      });
      lenInput.value = fmtDoc(cls.lenMm);
      lenInput.disabled = !enabled;
      const commitLen = () => {
        const doc = parseFloat(`${lenInput.value}`.replace(/[^\d.\-]/g, ''));
        const target = divs().classes[i];
        if (!target) return;
        if (!Number.isFinite(doc)) { lenInput.value = fmtDoc(target.lenMm); return; }
        snapshot();
        target.lenMm = Math.max(0, docToMm(doc));
        recompute();
      };
      lenInput.addEventListener('change', commitLen);
      lenInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { commitLen(); lenInput.blur(); } });
      row.appendChild(lenInput);

      // Pen chooser — reuses the shared UI.Select (the same per-slot pattern the
      // 3D scene Style tab uses). The pen popover (createChip/open) is layer-
      // bound — it mutates layer pens via assignPenToLayers — so it cannot serve
      // a per-class penId slot; a Select of the palette is the correct control.
      const penHost = el('div', { class: 'fcs-divisions-pen', 'data-division-pen': '' });
      const penOptions = [{ value: '', label: 'Layer pen' }]
        .concat(getPens().map((p) => ({ value: p.id, label: p.name || p.id })));
      if (typeof UI.Select === 'function') {
        UI.Select(penHost, {
          options: penOptions,
          value: cls.penId || '',
          ariaLabel: `Class ${i + 1} pen`,
          disabled: !enabled,
          onChange: (v) => {
            const target = divs().classes[i];
            if (!target) return;
            snapshot();
            target.penId = v || null;
            paintSwatch();
            recompute();
          },
        });
      } else {
        // Fallback native select (older harnesses without the component).
        const sel = el('select', { class: 'ctrl-sel', 'aria-label': `Class ${i + 1} pen` });
        penOptions.forEach((o) => { const opt = el('option', { value: o.value, text: o.label }); sel.appendChild(opt); });
        sel.value = cls.penId || '';
        sel.disabled = !enabled;
        sel.addEventListener('change', () => {
          const target = divs().classes[i];
          if (!target) return;
          snapshot();
          target.penId = sel.value || null;
          paintSwatch();
          recompute();
        });
        penHost.appendChild(sel);
      }
      row.appendChild(penHost);

      // Gap toggle.
      const gapLabel = el('label', { class: 'fcs-divisions-gap' });
      const gapInput = el('input', { type: 'checkbox', 'data-division-gap': '', 'aria-label': `Class ${i + 1} gap` });
      gapInput.checked = Boolean(cls.gap);
      gapInput.disabled = !enabled;
      gapInput.addEventListener('change', () => {
        const target = divs().classes[i];
        if (!target) return;
        snapshot();
        target.gap = gapInput.checked;
        recompute();
      });
      gapLabel.appendChild(gapInput);
      gapLabel.appendChild(el('span', { text: 'Gap' }));
      row.appendChild(gapLabel);

      // Weight (Inc-3) — only shown in weighted pen mode. It is the class pen's
      // share of the deterministic weighted draw; a gap class carries no ink so
      // its weight is inert (disabled). Leaf edit: recompute in place.
      if (d.penMode === 'weighted') {
        const wLabel = el('label', { class: 'fcs-divisions-weight' });
        wLabel.appendChild(el('span', { text: 'w' }));
        const wInput = el('input', {
          type: 'number', class: 'fcs-divisions-num', 'data-division-weight': '',
          inputmode: 'decimal', step: 'any', min: '0', 'aria-label': `Class ${i + 1} weight`,
        });
        wInput.value = String(Number.isFinite(cls.weight) ? cls.weight : 1);
        wInput.disabled = !enabled || Boolean(cls.gap);
        const commitWeight = () => {
          const target = divs().classes[i];
          if (!target) return;
          const n = parseFloat(`${wInput.value}`.replace(/[^\d.\-]/g, ''));
          if (!Number.isFinite(n) || n < 0) { wInput.value = String(Number.isFinite(target.weight) ? target.weight : 1); return; }
          snapshot();
          target.weight = n;
          recompute();
        };
        wInput.addEventListener('change', commitWeight);
        wInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { commitWeight(); wInput.blur(); } });
        wLabel.appendChild(wInput);
        row.appendChild(wLabel);
      }

      // Reorder + remove actions.
      const acts = el('div', { class: 'fcs-divisions-acts' });
      const up = el('button', { type: 'button', class: 'fcs-divisions-act', 'data-division-up': '', 'aria-label': `Move class ${i + 1} up`, text: '▲' });
      up.disabled = !enabled || i === 0;
      up.addEventListener('click', () => reorder(i, i - 1));
      const down = el('button', { type: 'button', class: 'fcs-divisions-act', 'data-division-down': '', 'aria-label': `Move class ${i + 1} down`, text: '▼' });
      down.disabled = !enabled || i === count - 1;
      down.addEventListener('click', () => reorder(i, i + 1));
      const rm = el('button', { type: 'button', class: 'fcs-divisions-act fcs-divisions-remove', 'data-division-remove': '', 'aria-label': `Remove class ${i + 1}`, text: '×' });
      rm.disabled = !enabled;
      rm.addEventListener('click', () => {
        snapshot();
        divs().classes.splice(i, 1);
        recompute();
        render();
      });
      acts.appendChild(up);
      acts.appendChild(down);
      acts.appendChild(rm);
      row.appendChild(acts);

      return row;
    };

    const reorder = (from, to) => {
      const arr = divs().classes;
      if (to < 0 || to >= arr.length || from === to) return;
      snapshot();
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      recompute();
      render();
    };

    container.classList.add('fcs-divisions');
    render();
  }

  FCS.registerSection('divisions', { caps: ['divisions'], order: 100, build });
})();
