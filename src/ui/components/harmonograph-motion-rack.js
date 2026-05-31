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
    'sample-hold': 'Sample & Hold', random: 'Random',
  };

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

    const el = (tag, cls, text) => {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    };

    function render() {
      target.innerHTML = '';
      const wrap = el('div', 'motion-rack mb-4');

      const head = el('div', 'harmonograph-plotter-head');
      head.appendChild(el('span', 'text-[10px] uppercase tracking-widest text-vectura-muted', 'Motion Rack'));
      const addBtn = el('button', 'motion-add-lfo text-xs border border-vectura-border px-2 py-1 hover:bg-vectura-border text-vectura-accent transition-colors', '+ LFO');
      addBtn.type = 'button';
      addBtn.onclick = () => {
        motion.sources.push({ id: nextId('lfo'), enabled: true, shape: 'sine', syncMode: 'sync', rate: 1, depth: 1, phase: 0, polarity: 'bi' });
        commit();
      };
      head.appendChild(addBtn);
      wrap.appendChild(head);

      if (!motion.sources.length) {
        wrap.appendChild(el('div', 'text-[10px] text-vectura-muted mt-2',
          'Add an LFO, then assign it to a parameter to make the figure move as it plays. Try a slow Sine on a pendulum Detune to drift a circle into a snake.'));
      }

      motion.sources.forEach((src) => {
        const card = el('div', 'motion-lfo-card border border-vectura-border p-2 mt-2');
        card.dataset.sourceId = src.id;

        const r1 = el('div', 'motion-row flex items-center gap-2');
        const shapeSel = el('select', 'motion-lfo-shape bg-vectura-bg border border-vectura-border p-1 text-[10px] flex-1');
        shapeSel.innerHTML = SHAPES.map((s) => `<option value="${s}" ${s === src.shape ? 'selected' : ''}>${SHAPE_LABELS[s] || s}</option>`).join('');
        shapeSel.onchange = (e) => { src.shape = e.target.value; commit(); };
        const syncBtn = el('button', 'motion-lfo-sync text-[10px] border border-vectura-border px-2 py-1 text-vectura-text', src.syncMode === 'free' ? 'Free' : 'Sync');
        syncBtn.type = 'button';
        syncBtn.title = 'Sync = repeats exactly each loop; Free = drifts forever';
        syncBtn.onclick = () => { src.syncMode = src.syncMode === 'free' ? 'sync' : 'free'; commit(); };
        const delBtn = el('button', 'motion-lfo-remove text-[10px] border border-vectura-border px-2 py-1 text-vectura-danger', '×');
        delBtn.type = 'button';
        delBtn.title = 'Remove LFO';
        delBtn.onclick = () => {
          motion.sources = motion.sources.filter((s) => s.id !== src.id);
          motion.edges = motion.edges.filter((edge) => edge.sourceId !== src.id);
          commit();
        };
        r1.append(shapeSel, syncBtn, delBtn);
        card.appendChild(r1);

        const r2 = el('div', 'motion-row flex items-center gap-2 mt-1');
        const mkNum = (label, value, step, onChange, title) => {
          const w = el('label', 'text-[10px] text-vectura-muted flex items-center gap-1 flex-1');
          if (title) w.title = title;
          const inp = el('input', 'motion-num bg-vectura-bg border border-vectura-border p-1 text-[10px] w-full text-vectura-text');
          inp.type = 'number';
          inp.step = String(step);
          inp.value = String(value);
          inp.onchange = (e) => onChange(parseFloat(e.target.value));
          w.append(document.createTextNode(label), inp);
          return w;
        };
        r2.appendChild(mkNum(src.syncMode === 'free' ? 'Hz' : 'cyc/loop', src.rate ?? 1, 0.05, (v) => { src.rate = Number.isFinite(v) ? v : 1; commit(); }, 'Rate'));
        r2.appendChild(mkNum('Depth', src.depth ?? 1, 0.05, (v) => { src.depth = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1; commit(); }, 'Output depth 0–1'));
        const polBtn = el('button', 'motion-lfo-polarity text-[10px] border border-vectura-border px-2 py-1 text-vectura-text', src.polarity === 'uni' ? 'Uni' : 'Bi');
        polBtn.type = 'button';
        polBtn.title = 'Bipolar (−/+) or Unipolar (0/+)';
        polBtn.onclick = () => { src.polarity = src.polarity === 'uni' ? 'bi' : 'uni'; commit(); };
        r2.appendChild(polBtn);
        card.appendChild(r2);

        motion.edges.filter((e) => e.sourceId === src.id).forEach((edge) => {
          const row = el('div', 'motion-edge flex items-center gap-2 mt-1');
          row.appendChild(el('span', 'text-[10px] text-vectura-accent flex-1 truncate', `→ ${labelForPath(edge.targetParamPath)}`));
          const amt = el('input', 'motion-edge-amount bg-vectura-bg border border-vectura-border p-1 text-[10px] w-16 text-vectura-text');
          amt.type = 'number';
          amt.step = '0.01';
          amt.value = String(edge.amount ?? 0);
          amt.title = "Amount — signed depth in the parameter's own units";
          amt.onchange = (e) => { edge.amount = parseFloat(e.target.value) || 0; commit(); };
          const rm = el('button', 'motion-edge-remove text-[10px] border border-vectura-border px-2 text-vectura-danger', '×');
          rm.type = 'button';
          rm.onclick = () => { motion.edges = motion.edges.filter((x) => x.id !== edge.id); commit(); };
          row.append(amt, rm);
          card.appendChild(row);
        });

        const assignRow = el('div', 'motion-assign flex items-center gap-2 mt-1');
        const tgtSel = el('select', 'motion-assign-target bg-vectura-bg border border-vectura-border p-1 text-[10px] flex-1');
        tgtSel.innerHTML = assignableTargets().map((t) => `<option value="${t.path}">${t.label}</option>`).join('');
        const addEdge = el('button', 'motion-assign-add text-[10px] border border-vectura-border px-2 py-1 text-vectura-accent', 'Assign');
        addEdge.type = 'button';
        addEdge.onclick = () => {
          const path = tgtSel.value;
          motion.edges.push({ id: nextId('edge'), sourceId: src.id, targetParamPath: path, amount: defaultAmountFor(path) });
          commit();
        };
        assignRow.append(tgtSel, addEdge);
        card.appendChild(assignRow);

        wrap.appendChild(card);
      });

      target.appendChild(wrap);
    }

    render();
    return { el: target, render, destroy: () => { target.innerHTML = ''; } };
  };

  UI.HarmonographMotionRack = create;
})();
