/**
 * Vectura morph panel (M4).
 *
 * Editor body for the `morph` modifier. Renders a child-aware live count
 * header plus the morph parameter controls (steps, easing, sequence mode,
 * resample, correspondence, winding check, multi-path strategy, emit sources,
 * closure, smoothing).
 *
 * State model lives on the modifier object created by createMorph() in
 * src/config/modifiers.js. Panel-local UI state (none currently) would live in
 * the module-level PANEL_STATE WeakMap — NEVER attach `_panel*` keys to the
 * modifier object (test INT-B-04).
 *
 * History contract (test INT-B-05): each discrete user action pushes history
 * exactly once. Chips/toggles/selects go through commit() (one push per click).
 * Sliders snapshot on pointerdown/first-input and push exactly once per drag,
 * matching mirror-panel's slider machinery.
 *
 * Entry point: window.Vectura.UI.MorphPanel.build(uiCtx, layer, container).
 * algo-config-panel.js calls this when the active modifier layer is type
 * 'morph'.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  // Reserved for future panel-local UI state; keyed by layer so it survives
  // rebuilds without ever touching the modifier object.
  const PANEL_STATE = new WeakMap();

  const EASING_OPTIONS = [
    { value: 'linear',      label: 'Linear' },
    { value: 'ease-in',     label: 'Ease In' },
    { value: 'ease-out',    label: 'Ease Out' },
    { value: 'ease-in-out', label: 'Ease In-Out' },
    { value: 'cubic-in',    label: 'Cubic In' },
    { value: 'cubic-out',   label: 'Cubic Out' },
  ];
  const SEQUENCE_OPTIONS = [
    { value: 'sequential', label: 'Sequential' },
    { value: 'cyclic',     label: 'Cyclic' },
  ];
  const CORRESPONDENCE_OPTIONS = [
    { value: 'centroid-angle', label: 'Centroid + Angle' },
    { value: 'nearest',        label: 'Nearest' },
    { value: 'arc-length',     label: 'Arc Length' },
  ];
  const MULTIPATH_OPTIONS = [
    { value: 'auto',           label: 'Auto' },
    { value: 'index-match',    label: 'Index Match' },
    { value: 'merge-centroid', label: 'Merge Centroid' },
    { value: 'merge-longest',  label: 'Merge Longest' },
  ];
  const CLOSURE_OPTIONS = [
    { value: 'auto',         label: 'Auto' },
    { value: 'force-open',   label: 'Force Open' },
    { value: 'force-closed', label: 'Force Closed' },
  ];

  const PERF_BUDGET = 200000;

  function build(uiCtx, layer, container) {
    const modifier = uiCtx.getModifierState(layer);
    if (!modifier) return;

    // Touch the WeakMap so panel-local state has a home (none used yet).
    const pState = PANEL_STATE.get(layer) || {};
    PANEL_STATE.set(layer, pState);

    const root = document.createElement('div');
    root.className = 'morph-panel';
    root.dataset.testid = 'morph-panel';
    container.appendChild(root);

    const commit = (fn, { rebuild = true } = {}) => {
      if (uiCtx.app?.pushHistory) uiCtx.app.pushHistory();
      fn();
      uiCtx.refreshModifierLayer(layer, { rebuildControls: rebuild });
    };

    /* ---------- live child count header ---------- */
    function visibleChildren() {
      const engine = uiCtx.app?.engine;
      if (!engine || typeof engine.getLayerDescendants !== 'function') return [];
      return engine.getLayerDescendants(layer.id)
        .filter((c) => c && !c.isGroup && c.visible !== false);
    }

    function renderCount() {
      const wrap = document.createElement('div');
      wrap.className = 'morph-count';

      const children = visibleChildren();
      const n = children.length;
      const steps = clampInt(modifier.steps, 1, 64, 6);
      const cyclic = modifier.sequenceMode === 'cyclic';

      if (n <= 1) {
        const callout = document.createElement('div');
        callout.className = 'morph-callout';
        callout.textContent = 'Add 2 or more child layers to begin morphing.';
        wrap.appendChild(callout);
        return wrap;
      }

      const segments = cyclic ? n : n - 1;
      const totalSteps = segments * steps;

      const text = document.createElement('div');
      text.className = 'morph-count-text';
      if (n === 2) {
        text.textContent = '2 children — morphing A→B';
      } else {
        text.textContent =
          `${n} children: A→B→C… (${segments} segments, ${totalSteps} total steps)`;
      }
      wrap.appendChild(text);

      if (steps * clampInt(modifier.resampleCount, 8, 512, 128) * segments > PERF_BUDGET) {
        const warn = document.createElement('span');
        warn.className = 'morph-warn';
        warn.textContent = '⚠ Heavy: high step/resample count';
        wrap.appendChild(warn);
      }
      return wrap;
    }

    root.appendChild(renderCount());

    /* ---------- helpers ---------- */
    function clampInt(v, min, max, fallback) {
      const n = Math.round(Number(v));
      if (!Number.isFinite(n)) return fallback;
      return Math.min(max, Math.max(min, n));
    }

    function labeledSection(title) {
      const sec = document.createElement('div');
      sec.className = 'morph-section';
      const label = document.createElement('div');
      label.className = 'morph-label control-label';
      label.textContent = title;
      sec.appendChild(label);
      return { sec, label };
    }

    // Slider with mirror-panel's "history exactly once per drag" contract.
    function buildSlider({ title, testid, field, min, max, step, isInt, fmt }) {
      const { sec, label } = labeledSection(title);

      const valTag = document.createElement('span');
      valTag.className = 'morph-value';
      label.appendChild(valTag);

      const input = document.createElement('input');
      input.type = 'range';
      input.className = 'morph-slider';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.dataset.testid = testid;
      input.dataset.field = field;

      const readVal = () => (isInt
        ? clampInt(modifier[field], min, max, min)
        : (Number.isFinite(+modifier[field]) ? +modifier[field] : min));

      const formatVal = (v) => (fmt === 'pct'
        ? `${Math.round(v * 100)}%`
        : `${isInt ? Math.round(v) : v}`);

      const syncTag = (v) => { valTag.textContent = formatVal(v); };

      input.value = String(readVal());
      syncTag(readVal());

      let preDragValue = null;
      let historyPushed = false;
      const beginDrag = () => {
        if (preDragValue === null) preDragValue = modifier[field];
      };
      input.addEventListener('pointerdown', beginDrag);
      input.addEventListener('keydown', beginDrag);
      input.addEventListener('input', () => {
        const v = isInt ? Math.round(+input.value) : +input.value;
        if (!historyPushed) {
          // Push with the value as it was BEFORE this gesture, then apply new.
          modifier[field] = preDragValue !== null ? preDragValue : modifier[field];
          if (uiCtx.app?.pushHistory) uiCtx.app.pushHistory();
          modifier[field] = v;
          historyPushed = true;
        } else {
          modifier[field] = v;
        }
        syncTag(v);
        // Lightweight refresh keeps the slider DOM in place during drag.
        uiCtx.refreshModifierLayer(layer, { rebuildControls: false });
      });
      const endDrag = () => {
        preDragValue = null;
        if (historyPushed) {
          // Final rebuild so the header count + warning badge re-render.
          historyPushed = false;
          uiCtx.refreshModifierLayer(layer, { rebuildControls: true });
        }
      };
      input.addEventListener('change', endDrag);
      input.addEventListener('pointerup', endDrag);
      input.addEventListener('pointercancel', endDrag);

      sec.appendChild(input);
      return sec;
    }

    // Chip row: one push per click via commit().
    function buildChips({ title, className, dataAttr, options, field }) {
      const { sec } = labeledSection(title);
      const row = document.createElement('div');
      row.className = className;
      options.forEach((opt) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'morph-chip';
        chip.dataset[dataAttr] = opt.value;
        chip.textContent = opt.label;
        if (modifier[field] === opt.value) chip.classList.add('active');
        chip.addEventListener('click', () => {
          if (modifier[field] === opt.value) return;
          commit(() => { modifier[field] = opt.value; });
        });
        row.appendChild(chip);
      });
      sec.appendChild(row);
      return sec;
    }

    function buildToggle({ title, testid, field }) {
      const { sec } = labeledSection(title);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'morph-toggle';
      btn.dataset.testid = testid;
      const sync = () => {
        const on = modifier[field] !== false;
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        btn.textContent = on ? 'On' : 'Off';
      };
      sync();
      btn.addEventListener('click', () => {
        commit(() => { modifier[field] = !(modifier[field] !== false); });
      });
      sec.appendChild(btn);
      return sec;
    }

    function buildSelect({ title, field, options }) {
      const { sec } = labeledSection(title);
      const select = document.createElement('select');
      select.className = 'morph-select';
      select.dataset.field = field;
      options.forEach((opt) => {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        if (modifier[field] === opt.value) o.selected = true;
        select.appendChild(o);
      });
      select.addEventListener('change', () => {
        const v = select.value;
        if (modifier[field] === v) return;
        commit(() => { modifier[field] = v; });
      });
      sec.appendChild(select);
      return sec;
    }

    /* ---------- 2. Steps ---------- */
    root.appendChild(buildSlider({
      title: 'Steps', testid: 'morph-steps', field: 'steps',
      min: 1, max: 64, step: 1, isInt: true,
    }));

    /* ---------- 3. Easing ---------- */
    root.appendChild(buildChips({
      title: 'Easing', className: 'morph-easing-chips', dataAttr: 'easing',
      options: EASING_OPTIONS, field: 'easing',
    }));

    /* ---------- 4. Sequence Mode ---------- */
    root.appendChild(buildChips({
      title: 'Sequence Mode', className: 'morph-sequence-chips', dataAttr: 'sequence',
      options: SEQUENCE_OPTIONS, field: 'sequenceMode',
    }));

    /* ---------- 5. Resample Count ---------- */
    root.appendChild(buildSlider({
      title: 'Resample Count', testid: 'morph-resample', field: 'resampleCount',
      min: 8, max: 512, step: 1, isInt: true,
    }));

    /* ---------- (Resample Mode select) ---------- */
    root.appendChild(buildSelect({
      title: 'Resample Mode', field: 'resampleMode',
      options: [
        { value: 'arc-length',    label: 'Arc Length' },
        { value: 'uniform-index', label: 'Uniform Index' },
      ],
    }));

    /* ---------- 6. Correspondence ---------- */
    root.appendChild(buildChips({
      title: 'Correspondence', className: 'morph-correspondence-chips', dataAttr: 'correspondence',
      options: CORRESPONDENCE_OPTIONS, field: 'correspondenceMode',
    }));

    /* ---------- Winding check (near correspondence) ---------- */
    root.appendChild(buildToggle({
      title: 'Winding Check', testid: 'morph-winding', field: 'windingCheck',
    }));

    /* ---------- 7. Multi-Path ---------- */
    root.appendChild(buildChips({
      title: 'Multi-Path', className: 'morph-multipath-chips', dataAttr: 'multipath',
      options: MULTIPATH_OPTIONS, field: 'multiPathStrategy',
    }));

    /* ---------- 8. Emit Sources ---------- */
    root.appendChild(buildToggle({
      title: 'Emit Sources', testid: 'morph-emit-sources', field: 'emitSources',
    }));

    /* ---------- 9. Closure ---------- */
    root.appendChild(buildSelect({
      title: 'Closure', field: 'closureMode', options: CLOSURE_OPTIONS,
    }));

    /* ---------- 10. Smoothing ---------- */
    root.appendChild(buildSlider({
      title: 'Smoothing', testid: 'morph-smoothing', field: 'smoothing',
      min: 0, max: 1, step: 0.05, isInt: false, fmt: 'pct',
    }));
  }

  UI.MorphPanel = { build };
})();
