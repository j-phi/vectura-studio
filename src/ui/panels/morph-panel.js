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

      const fillOn = modifier.fillMode !== 'off';
      const heaviness = steps * clampInt(modifier.resampleCount, 8, 512, 128) * segments * (fillOn ? 3 : 1);
      if (heaviness > PERF_BUDGET) {
        const warn = document.createElement('span');
        warn.className = 'morph-warn';
        warn.textContent = fillOn
          ? '⚠ Heavy: high step/resample count with Morph Fill'
          : '⚠ Heavy: high step/resample count';
        wrap.appendChild(warn);
      }
      const fillCap = clampInt(modifier.fillRegenLimit, 0, 4096, 0) || 32;
      if (fillOn && segments * steps > fillCap) {
        const note = document.createElement('span');
        note.className = 'morph-warn';
        note.textContent = `⚠ Fill capped: only midpoint rings filled (>${fillCap})`;
        wrap.appendChild(note);
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

    // Grouped, titled section container — visually clusters related controls
    // (Transition / Shape Matching / Output / Fill).
    function buildGroup(title) {
      const grp = document.createElement('div');
      grp.className = 'morph-group';
      const head = document.createElement('div');
      head.className = 'morph-group-title';
      head.textContent = title;
      grp.appendChild(head);
      root.appendChild(grp);
      return grp;
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

      const formatVal = (v) => {
        if (fmt === 'pct') return `${Math.round(v * 100)}%`;
        // 'auto0': a value of 0 means "auto" (e.g. fill cap auto-derives ~32).
        if (fmt === 'auto0' && Math.round(v) === 0) return 'Auto';
        return `${isInt ? Math.round(v) : v}`;
      };

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

    // Switch-style toggle: title on the left, a sliding pill switch on the
    // right. `isOn`/`toggle` are injected so this backs both boolean fields and
    // enum on/off fields (e.g. fillMode: 'morph'|'off'). `hint` shows a small
    // muted caption under the row.
    function buildSwitchRow({ title, testid, hint, isOn, toggle }) {
      const sec = document.createElement('div');
      sec.className = 'morph-section morph-switch-row';
      const head = document.createElement('div');
      head.className = 'morph-switch-head';
      const label = document.createElement('div');
      label.className = 'morph-label control-label';
      label.textContent = title;
      head.appendChild(label);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'morph-toggle';
      btn.dataset.testid = testid;
      btn.setAttribute('role', 'switch');
      const knob = document.createElement('span');
      knob.className = 'morph-toggle-knob';
      btn.appendChild(knob);
      const sync = () => {
        const on = isOn();
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        btn.setAttribute('aria-checked', on ? 'true' : 'false');
      };
      sync();
      btn.addEventListener('click', () => { commit(() => toggle()); });
      head.appendChild(btn);
      sec.appendChild(head);

      if (hint) {
        const cap = document.createElement('div');
        cap.className = 'morph-hint';
        cap.textContent = hint;
        sec.appendChild(cap);
      }
      return sec;
    }

    function buildToggle({ title, testid, field, hint }) {
      return buildSwitchRow({
        title, testid, hint,
        isOn: () => modifier[field] !== false,
        toggle: () => { modifier[field] = !(modifier[field] !== false); },
      });
    }

    // Enum-backed on/off toggle: stores a string value (onValue/offValue) on the
    // modifier so the field stays self-describing (e.g. fillMode: 'morph'|'off').
    function buildEnumToggle({ title, testid, field, onValue, offValue, hint }) {
      return buildSwitchRow({
        title, testid, hint,
        isOn: () => modifier[field] !== offValue,
        toggle: () => { modifier[field] = (modifier[field] !== offValue) ? offValue : onValue; },
      });
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

    /* ========== Transition ========== */
    const gTransition = buildGroup('Transition');
    gTransition.appendChild(buildSlider({
      title: 'Steps', testid: 'morph-steps', field: 'steps',
      min: 1, max: 64, step: 1, isInt: true,
    }));
    gTransition.appendChild(buildChips({
      title: 'Easing', className: 'morph-easing-chips', dataAttr: 'easing',
      options: EASING_OPTIONS, field: 'easing',
    }));
    gTransition.appendChild(buildChips({
      title: 'Sequence Mode', className: 'morph-sequence-chips', dataAttr: 'sequence',
      options: SEQUENCE_OPTIONS, field: 'sequenceMode',
    }));

    /* ========== Shape Matching ========== */
    const gMatch = buildGroup('Shape Matching');
    // Corner Match: smooth bezier corner-matched morphing for closed pairs.
    // When on, in-between rings are built from a small set of anchors with
    // interpolated bezier handles — a rounded polygon stays smooth as it blends
    // into a circle. Off falls back to the dense arc-length polyline morph.
    const cornerMatchOn = modifier.cornerMatch !== false;
    gMatch.appendChild(buildToggle({
      title: 'Corner Match', testid: 'morph-corner-match', field: 'cornerMatch',
      hint: 'Smooth bezier blend for closed shapes (keeps rounded corners round).',
    }));
    if (cornerMatchOn) {
      gMatch.appendChild(buildSlider({
        title: 'Max Anchors', testid: 'morph-corner-max', field: 'cornerMatchMax',
        min: 4, max: 256, step: 1, isInt: true,
      }));
    }
    gMatch.appendChild(buildSlider({
      title: 'Resample Count', testid: 'morph-resample', field: 'resampleCount',
      min: 8, max: 512, step: 1, isInt: true,
    }));
    gMatch.appendChild(buildSelect({
      title: 'Resample Mode', field: 'resampleMode',
      options: [
        { value: 'arc-length',    label: 'Arc Length' },
        { value: 'uniform-index', label: 'Uniform Index' },
      ],
    }));
    gMatch.appendChild(buildChips({
      title: 'Correspondence', className: 'morph-correspondence-chips', dataAttr: 'correspondence',
      options: CORRESPONDENCE_OPTIONS, field: 'correspondenceMode',
    }));
    gMatch.appendChild(buildToggle({
      title: 'Winding Check', testid: 'morph-winding', field: 'windingCheck',
      hint: 'Auto-reverse a child if it lowers the correspondence cost.',
    }));
    gMatch.appendChild(buildChips({
      title: 'Multi-Path', className: 'morph-multipath-chips', dataAttr: 'multipath',
      options: MULTIPATH_OPTIONS, field: 'multiPathStrategy',
    }));

    /* ========== Output ========== */
    const gOutput = buildGroup('Output');
    gOutput.appendChild(buildToggle({
      title: 'Emit Sources', testid: 'morph-emit-sources', field: 'emitSources',
      hint: 'Include the original child shapes alongside the blend rings.',
    }));
    gOutput.appendChild(buildSelect({
      title: 'Closure', field: 'closureMode', options: CLOSURE_OPTIONS,
    }));
    gOutput.appendChild(buildSlider({
      title: 'Smoothing', testid: 'morph-smoothing', field: 'smoothing',
      min: 0, max: 1, step: 0.05, isInt: false, fmt: 'pct',
    }));

    /* ========== Fill ========== */
    const gFill = buildGroup('Fill');
    gFill.appendChild(buildEnumToggle({
      title: 'Morph Fill', testid: 'morph-fill', field: 'fillMode',
      onValue: 'morph', offValue: 'off',
      hint: 'Regenerate interpolated fill geometry for each blend ring.',
    }));
    if (modifier.fillMode !== 'off') {
      gFill.appendChild(buildSlider({
        title: 'Fill Cap', testid: 'morph-fill-cap', field: 'fillRegenLimit',
        min: 0, max: 512, step: 1, isInt: true, fmt: 'auto0',
      }));
    }
  }

  UI.MorphPanel = { build };
})();
