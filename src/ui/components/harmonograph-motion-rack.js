/*
 * Vectura Studio — HarmonographMotionRack component (studio Phase 2).
 *
 * The modulation UI: a stack of LFO cards whose outputs are assigned to
 * harmonograph parameters through the edge matrix stored at
 * layer.params.motion = { sources, edges } (see HarmonographModulation).
 *
 * Edits are PLAYBACK-ONLY — they never regen the static figure. The virtual
 * plotter reads layer.params.motion live each frame, so you can patch LFOs
 * while it loops and watch the figure react. Each mutation calls opts.commit()
 * (the host wires pushHistory + storeLayerParams) and the rack re-renders.
 *
 * Usage:
 *   Vectura.UI.HarmonographMotionRack(targetEl, { layer, commit });
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});

  let SEQ = 0;
  const nextId = (prefix) => { SEQ += 1; return `${prefix}-${SEQ}`; };

  const SHAPE_LABELS = {
    sine: 'Sine', triangle: 'Triangle', saw: 'Saw', square: 'Square',
    'sample-hold': 'Sample & Hold', random: 'Random', drawn: 'Drawn',
  };

  // Default hand-drawn curve when a source first becomes 'drawn': a triangle
  // (trough → apex → trough) so the editor opens with a visible, editable shape.
  const defaultDrawnPoints = () => [
    { x: 0, y: -1 },
    { x: 0.5, y: 1 },
    { x: 1, y: -1 },
  ];

  const create = (target, opts = {}) => {
    if (!target) return null;
    const layer = opts.layer;
    const commitHost = typeof opts.commit === 'function' ? opts.commit : () => {};
    const mod = window.Vectura && window.Vectura.HarmonographModulation;
    const SHAPES = (mod && mod.SHAPES) || ['sine', 'triangle', 'saw', 'square', 'sample-hold', 'random'];

    const params = (layer && layer.params) || {};
    if (!params.motion || typeof params.motion !== 'object') params.motion = { sources: [], edges: [] };
    const motion = params.motion;
    if (!Array.isArray(motion.sources)) motion.sources = [];
    if (!Array.isArray(motion.edges)) motion.edges = [];

    const assignableTargets = () => {
      const list = [
        { path: 'loopDrift', label: 'Loop Drift' },
        { path: 'scale', label: 'Scale' },
        { path: 'paperRotation', label: 'Paper Rotation' },
      ];
      (params.pendulums || []).forEach((p, i) => {
        const n = i + 1;
        list.push(
          { path: `pendulums.${i}.freq`, label: `Pend ${n} · Freq` },
          { path: `pendulums.${i}.micro`, label: `Pend ${n} · Detune` },
          { path: `pendulums.${i}.ampX`, label: `Pend ${n} · Amp X` },
          { path: `pendulums.${i}.ampY`, label: `Pend ${n} · Amp Y` },
          { path: `pendulums.${i}.phaseX`, label: `Pend ${n} · Phase X` },
          { path: `pendulums.${i}.phaseY`, label: `Pend ${n} · Phase Y` }
        );
      });
      return list;
    };
    const labelForPath = (path) => assignableTargets().find((t) => t.path === path)?.label || path;
    const defaultAmountFor = (path) => {
      if (path === 'loopDrift') return 0.02;
      if (path === 'scale') return 0.2;
      if (path === 'paperRotation') return 0.3;
      if (/\.freq$/.test(path)) return 0.5;
      if (/\.micro$/.test(path)) return 0.02;
      if (/\.(ampX|ampY)$/.test(path)) return 30;
      if (/\.(phaseX|phaseY)$/.test(path)) return 45;
      return 0.2;
    };

    const commit = () => { commitHost(); render(); };

    // Resolve a CSS custom property from the live theme (for canvas strokes),
    // with a fallback for headless/jsdom where computed styles are empty.
    const getThemeToken = (name, fallback = '') => {
      try {
        if (typeof window !== 'undefined' && window.getComputedStyle && document.documentElement) {
          const v = window.getComputedStyle(document.documentElement).getPropertyValue(name);
          if (v && v.trim()) return v.trim();
        }
      } catch (_) { /* jsdom / no DOM */ }
      return fallback;
    };

    const el = (tag, cls, text) => {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    };

    // An (i) badge. The global delegated handler in InfoModals (bound on
    // .info-btn) gives it a hover teaser + click-opens-modal for free — no
    // wiring here. dataset.info picks the INFO[key] copy.
    const infoBtn = (key) => {
      const b = el('button', 'info-btn', 'i');
      b.type = 'button';
      b.dataset.info = key;
      return b;
    };

    function render() {
      target.innerHTML = '';
      const wrap = el('div', 'motion-rack mb-4');

      const head = el('div', 'harmonograph-plotter-head');
      const headLabel = el('span', 'text-[10px] uppercase tracking-widest text-vectura-muted flex items-center gap-1', 'Motion Rack');
      headLabel.appendChild(infoBtn('pendula.motion.rack'));
      head.appendChild(headLabel);
      const addBtn = el('button', 'motion-add-lfo text-xs border border-vectura-border px-2 py-1 hover:bg-vectura-border text-vectura-accent transition-colors', '+ LFO');
      addBtn.type = 'button';
      addBtn.addEventListener("click", () => {
        motion.sources.push({ id: nextId('lfo'), enabled: true, shape: 'sine', syncMode: 'sync', rate: 1, depth: 1, phase: 0, polarity: 'bi' });
        commit();
      });
      head.appendChild(addBtn);
      head.appendChild(infoBtn('pendula.motion.addLfo'));
      const addMacroBtn = el('button', 'motion-add-macro text-xs border border-vectura-border px-2 py-1 hover:bg-vectura-border text-vectura-accent transition-colors', '+ Macro');
      addMacroBtn.type = 'button';
      addMacroBtn.title = 'Macro — a static knob (0–1) you can patch to many params at once';
      addMacroBtn.addEventListener("click", () => {
        motion.sources.push({ id: nextId('macro'), type: 'macro', enabled: true, value: 0.5, depth: 1 });
        commit();
      });
      head.appendChild(addMacroBtn);
      head.appendChild(infoBtn('pendula.motion.addMacro'));
      wrap.appendChild(head);

      if (!motion.sources.length) {
        wrap.appendChild(el('div', 'text-[10px] text-vectura-muted mt-2',
          'Add an LFO, then assign it to a parameter to make the figure move as it plays. Try a slow Sine on a pendulum Detune to drift a circle into a snake.'));
      }

      // A labelled numeric input shared by LFO and macro cards.
      const mkNum = (label, value, step, onChange, title, extraCls, infoKey) => {
        const w = el('label', 'text-[10px] text-vectura-muted flex items-center gap-1 flex-1');
        if (title) w.title = title;
        const inp = el('input', `motion-num bg-vectura-bg border border-vectura-border p-1 text-[10px] w-full text-vectura-text${extraCls ? ` ${extraCls}` : ''}`);
        inp.type = 'number';
        inp.step = String(step);
        inp.value = String(value);
        inp.addEventListener("change", (e) => onChange(parseFloat(e.target.value)));
        w.append(document.createTextNode(label), inp);
        if (infoKey) w.appendChild(infoBtn(infoKey));
        return w;
      };

      // Existing edges + the assign-to-target picker. Shared by every source
      // type, so a macro patches into params exactly like an LFO.
      const appendEdgeRows = (card, src) => {
        motion.edges.filter((e) => e.sourceId === src.id).forEach((edge) => {
          const row = el('div', 'motion-edge flex items-center gap-2 mt-1');
          // A → arrow indicator keeps the row reading as a routing.
          row.appendChild(el('span', 'motion-edge-arrow text-[10px] text-vectura-accent', '→'));
          // Re-target picker: re-point an existing edge without delete/re-add.
          // Amount is left untouched on re-target (least surprise, undoable).
          const retarget = el('select', 'motion-edge-retarget bg-vectura-bg border border-vectura-border p-1 text-[10px] flex-1 text-vectura-text');
          retarget.innerHTML = assignableTargets()
            .map((t) => `<option value="${t.path}" ${t.path === edge.targetParamPath ? 'selected' : ''}>${t.label}</option>`)
            .join('');
          retarget.value = edge.targetParamPath;
          retarget.addEventListener("change", (e) => { edge.targetParamPath = e.target.value; commit(); });
          row.appendChild(retarget);
          row.appendChild(infoBtn('pendula.motion.targetParamPath'));
          const amt = el('input', 'motion-edge-amount bg-vectura-bg border border-vectura-border p-1 text-[10px] w-16 text-vectura-text');
          amt.type = 'number';
          amt.step = '0.01';
          amt.value = String(edge.amount ?? 0);
          amt.title = "Amount — signed depth in the parameter's own units";
          amt.addEventListener(
            "change",
            (e) => { edge.amount = parseFloat(e.target.value) || 0; commit(); }
          );
          const rm = el('button', 'motion-edge-remove text-[10px] border border-vectura-border px-2 text-vectura-danger', '×');
          rm.type = 'button';
          rm.addEventListener(
            "click",
            () => { motion.edges = motion.edges.filter((x) => x.id !== edge.id); commit(); }
          );
          row.append(amt, infoBtn('pendula.motion.amount'), rm);
          card.appendChild(row);
        });

        const assignRow = el('div', 'motion-assign flex items-center gap-2 mt-1');
        const tgtSel = el('select', 'motion-assign-target bg-vectura-bg border border-vectura-border p-1 text-[10px] flex-1');
        tgtSel.innerHTML = assignableTargets().map((t) => `<option value="${t.path}">${t.label}</option>`).join('');
        const addEdge = el('button', 'motion-assign-add text-[10px] border border-vectura-border px-2 py-1 text-vectura-accent', 'Assign');
        addEdge.type = 'button';
        addEdge.addEventListener("click", () => {
          const path = tgtSel.value;
          motion.edges.push({ id: nextId('edge'), sourceId: src.id, targetParamPath: path, amount: defaultAmountFor(path) });
          commit();
        });
        assignRow.append(tgtSel, infoBtn('pendula.motion.targetParamPath'), addEdge);
        card.appendChild(assignRow);
      };

      const removeSource = (src) => {
        motion.sources = motion.sources.filter((s) => s.id !== src.id);
        motion.edges = motion.edges.filter((edge) => edge.sourceId !== src.id);
        commit();
      };

      motion.sources.forEach((src) => {
        if (src.type === 'macro') {
          renderMacroCard(wrap, src, { mkNum, appendEdgeRows, removeSource });
          return;
        }

        const card = el('div', 'motion-lfo-card border border-vectura-border p-2 mt-2');
        card.dataset.sourceId = src.id;

        const r1 = el('div', 'motion-row flex items-center gap-2');
        const shapeSel = el('select', 'motion-lfo-shape bg-vectura-bg border border-vectura-border p-1 text-[10px] flex-1');
        shapeSel.innerHTML = SHAPES.map((s) => `<option value="${s}" ${s === src.shape ? 'selected' : ''}>${SHAPE_LABELS[s] || s}</option>`).join('');
        shapeSel.addEventListener("change", (e) => {
          src.shape = e.target.value;
          // Seed an editable curve the first time this source becomes 'drawn'.
          if (src.shape === 'drawn' && (!Array.isArray(src.points) || src.points.length < 2)) {
            src.points = defaultDrawnPoints();
          }
          commit();
        });
        r1.append(shapeSel, infoBtn('pendula.motion.shape'));
        const syncBtn = el('button', 'motion-lfo-sync text-[10px] border border-vectura-border px-2 py-1 text-vectura-text', src.syncMode === 'free' ? 'Free' : 'Sync');
        syncBtn.type = 'button';
        syncBtn.title = 'Sync = repeats exactly each loop; Free = drifts forever';
        syncBtn.addEventListener(
          "click",
          () => { src.syncMode = src.syncMode === 'free' ? 'sync' : 'free'; commit(); }
        );
        const delBtn = el('button', 'motion-lfo-remove text-[10px] border border-vectura-border px-2 py-1 text-vectura-danger', '×');
        delBtn.type = 'button';
        delBtn.title = 'Remove LFO';
        delBtn.addEventListener("click", () => removeSource(src));
        r1.append(syncBtn, infoBtn('pendula.motion.syncMode'), delBtn);
        card.appendChild(r1);

        // Drawn shape: mount the hand-drawn curve editor below the shape row.
        if (src.shape === 'drawn') {
          if (!Array.isArray(src.points) || src.points.length < 2) src.points = defaultDrawnPoints();
          const drawn = buildDrawnEditor(src);
          drawn.appendChild(infoBtn('pendula.motion.drawn'));
          card.appendChild(drawn);
        }

        const r2 = el('div', 'motion-row flex items-center gap-2 mt-1');
        r2.appendChild(mkNum(src.syncMode === 'free' ? 'Hz' : 'cyc/loop', src.rate ?? 1, 0.05, (v) => { src.rate = Number.isFinite(v) ? v : 1; commit(); }, 'Rate', undefined, 'pendula.motion.rate'));
        r2.appendChild(mkNum('Depth', src.depth ?? 1, 0.05, (v) => { src.depth = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1; commit(); }, 'Output depth 0–1', undefined, 'pendula.motion.depth'));
        const polBtn = el('button', 'motion-lfo-polarity text-[10px] border border-vectura-border px-2 py-1 text-vectura-text', src.polarity === 'uni' ? 'Uni' : 'Bi');
        polBtn.type = 'button';
        polBtn.title = 'Bipolar (−/+) or Unipolar (0/+)';
        polBtn.addEventListener(
          "click",
          () => { src.polarity = src.polarity === 'uni' ? 'bi' : 'uni'; commit(); }
        );
        r2.append(polBtn, infoBtn('pendula.motion.polarity'));
        card.appendChild(r2);

        appendEdgeRows(card, src);
        wrap.appendChild(card);
      });

      target.appendChild(wrap);
    }

    // ── Macro card ──────────────────────────────────────────────────────────
    // A static knob: a single value slider (0..1) + a depth control. No
    // shape/rate/phase/sync. One macro can be assigned to many params.
    function renderMacroCard(wrap, src, helpers) {
      const { mkNum, appendEdgeRows, removeSource } = helpers;
      const card = el('div', 'motion-macro-card border border-vectura-border p-2 mt-2');
      card.dataset.sourceId = src.id;

      const r1 = el('div', 'motion-row flex items-center gap-2');
      r1.appendChild(el('span', 'motion-macro-label text-[10px] uppercase tracking-widest text-vectura-accent flex-1', 'Macro'));
      const delBtn = el('button', 'motion-macro-remove text-[10px] border border-vectura-border px-2 py-1 text-vectura-danger', '×');
      delBtn.type = 'button';
      delBtn.title = 'Remove macro';
      delBtn.addEventListener("click", () => removeSource(src));
      r1.appendChild(delBtn);
      card.appendChild(r1);

      const r2 = el('div', 'motion-row flex items-center gap-2 mt-1');
      const valLabel = el('label', 'motion-macro-value-label text-[10px] text-vectura-muted flex items-center gap-1 flex-1');
      valLabel.title = 'Macro value 0–1 — patched to params through signed edges';
      const slider = el('input', 'motion-macro-value flex-1');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '1';
      slider.step = '0.01';
      slider.value = String(Number.isFinite(src.value) ? src.value : 0.5);
      const readout = el('span', 'motion-macro-value-readout text-[10px] text-vectura-text w-8 text-right', slider.value);
      slider.oninput = (e) => { readout.textContent = e.target.value; };
      slider.addEventListener("change", (e) => {
        const v = parseFloat(e.target.value);
        src.value = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
        commit();
      });
      valLabel.append(document.createTextNode('Value'), slider, readout, infoBtn('pendula.motion.macroValue'));
      r2.appendChild(valLabel);
      card.appendChild(r2);

      const r3 = el('div', 'motion-row flex items-center gap-2 mt-1');
      r3.appendChild(mkNum('Depth', src.depth ?? 1, 0.05, (v) => { src.depth = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1; commit(); }, 'Output depth 0–1', 'motion-macro-depth', 'pendula.motion.depth'));
      card.appendChild(r3);

      appendEdgeRows(card, src);
      wrap.appendChild(card);
    }

    // ── Drawn-curve editor ──────────────────────────────────────────────────
    // A tiny canvas curve editor (LFOTool-style). Double-click to add a point,
    // drag to move (x clamped within neighbors, y in −1..1), double-click a
    // point (or right-click) to remove it (endpoints stay). Commits on every
    // edit so the figure rebuilds. DPR-scaled like the virtual plotter.
    function buildDrawnEditor(src) {
      const W = 220;
      const H = 64;
      const PAD = 4;
      const editor = el('div', 'motion-drawn-editor mt-1');
      const canvas = el('canvas', 'motion-drawn-canvas');
      canvas.dataset.sourceId = src.id;
      const dpr = Math.max(1, Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 3));
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      editor.appendChild(canvas);
      editor.appendChild(el('div', 'motion-drawn-hint text-[9px] text-vectura-muted',
        'Double-click to add a point · drag to shape · double-click a point to remove'));

      const ctx = canvas.getContext('2d');

      const sortPoints = () => { src.points.sort((a, b) => a.x - b.x); };
      const toCanvas = (pt) => ({
        cx: PAD + pt.x * (W - 2 * PAD),
        cy: PAD + (1 - (pt.y + 1) / 2) * (H - 2 * PAD),
      });
      const fromCanvas = (cx, cy) => ({
        x: (cx - PAD) / (W - 2 * PAD),
        y: (1 - (cy - PAD) / (H - 2 * PAD)) * 2 - 1,
      });
      const eventPos = (ev) => {
        const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: W, height: H };
        const sx = rect.width ? W / rect.width : 1;
        const sy = rect.height ? H / rect.height : 1;
        return { cx: (ev.clientX - rect.left) * sx, cy: (ev.clientY - rect.top) * sy };
      };

      const draw = () => {
        if (!ctx) return;
        if (typeof ctx.setTransform === 'function') ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = getThemeToken('--plotter-bg', '#101115');
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = getThemeToken('--ui-border', '#333');
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(PAD, H / 2);
        ctx.lineTo(W - PAD, H / 2);
        ctx.stroke();
        ctx.strokeStyle = getThemeToken('--ui-accent', '#6cf');
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        src.points.forEach((pt, i) => {
          const { cx, cy } = toCanvas(pt);
          if (i === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
        });
        ctx.stroke();
        ctx.fillStyle = getThemeToken('--ui-accent', '#6cf');
        src.points.forEach((pt) => {
          const { cx, cy } = toCanvas(pt);
          ctx.beginPath();
          ctx.arc(cx, cy, 3, 0, Math.PI * 2);
          ctx.fill();
        });
      };

      const hitPoint = (cx, cy) => {
        for (let i = 0; i < src.points.length; i += 1) {
          const { cx: px, cy: py } = toCanvas(src.points[i]);
          if (Math.hypot(px - cx, py - cy) <= 6) return i;
        }
        return -1;
      };

      let dragIdx = -1;
      canvas.onpointerdown = (ev) => {
        const { cx, cy } = eventPos(ev);
        const idx = hitPoint(cx, cy);
        if (idx >= 0) {
          dragIdx = idx;
          if (canvas.setPointerCapture && ev.pointerId != null) {
            try { canvas.setPointerCapture(ev.pointerId); } catch (_) { /* jsdom */ }
          }
        }
      };
      canvas.onpointermove = (ev) => {
        if (dragIdx < 0) return;
        const { cx, cy } = eventPos(ev);
        const np = fromCanvas(cx, cy);
        const pt = src.points[dragIdx];
        const isFirst = dragIdx === 0;
        const isLast = dragIdx === src.points.length - 1;
        // Endpoints keep their x (0 or 1); interior points clamp within neighbors.
        if (!isFirst && !isLast) {
          const lo = src.points[dragIdx - 1].x + 0.001;
          const hi = src.points[dragIdx + 1].x - 0.001;
          pt.x = Math.max(lo, Math.min(hi, np.x));
        }
        pt.y = Math.max(-1, Math.min(1, np.y));
        draw();
      };
      const endDrag = (ev) => {
        if (dragIdx < 0) return;
        dragIdx = -1;
        if (canvas.releasePointerCapture && ev && ev.pointerId != null) {
          try { canvas.releasePointerCapture(ev.pointerId); } catch (_) { /* jsdom */ }
        }
        commit();
      };
      canvas.onpointerup = endDrag;
      canvas.onpointercancel = endDrag;
      canvas.ondblclick = (ev) => {
        const { cx, cy } = eventPos(ev);
        const idx = hitPoint(cx, cy);
        // Double-click a point removes it (never the endpoints).
        if (idx > 0 && idx < src.points.length - 1) {
          src.points.splice(idx, 1);
          commit();
          return;
        }
        // Double-click empty space adds a point.
        const np = fromCanvas(cx, cy);
        np.x = Math.max(0.001, Math.min(0.999, np.x));
        np.y = Math.max(-1, Math.min(1, np.y));
        src.points.push(np);
        sortPoints();
        commit();
      };
      canvas.oncontextmenu = (ev) => {
        if (ev.preventDefault) ev.preventDefault();
        const { cx, cy } = eventPos(ev);
        const idx = hitPoint(cx, cy);
        if (idx > 0 && idx < src.points.length - 1) {
          src.points.splice(idx, 1);
          commit();
        }
      };

      draw();
      return editor;
    }

    render();
    return { el: target, render, destroy: () => { target.innerHTML = ''; } };
  };

  UI.HarmonographMotionRack = create;
})();
