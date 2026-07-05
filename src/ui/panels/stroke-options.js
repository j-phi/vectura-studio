/**
 * Vectura Stroke Options panel component (STR-2).
 *
 * A reusable component rendering the full stroke-editing surface observed in
 * the source video (Appendix A s20–46), top-to-bottom:
 *   Weight  — stepper + numeric field + preset dropdown (document units)
 *   Cap     — 3 icon toggles (Butt / Round / Projecting) with tooltips
 *   Corner  — 3 icon toggles (Miter / Round / Bevel) + Limit field enabled
 *             only while Miter is selected
 *   Align   — 3-way Align Stroke (Center / Inside / Outside), STR-4 model
 *   Dashed  — checkbox gating a 6-field dash/gap row; focused fields highlight
 *             their label chip; edits commit on blur/Enter in document units
 *             and re-render live; unchecking grays all six and reverts to solid
 *
 * Writes the STR-1 layer fields directly (cap/join/limit/align/dash) and routes
 * weight through the STR-5 Vectura.StrokeModel.setStrokeWeight API so the panel
 * and the Task Bar weight slider can never disagree.
 *
 * Hosts (two, per STR-2): the layer/appearance area of the config UI now, and
 * (Phase 2, TB-10) the Task Bar "Open Stroke Options" popover. Both call the
 * same `render(host, {app, layerIds})` / `mount(opts)` API.
 *
 * Self-contained IIFE tolerant of late loading: every external dependency
 * (STROKE_STYLE vocabulary, StrokeModel API, UnitUtils) is feature-detected.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  const S = () => Vectura.STROKE_STYLE || {};
  const STR = () => Vectura.STROKE_OPTIONS_UI || {};

  // ── Document units (mm ↔ display) ──────────────────────────────────────────
  const units = () => {
    const U = Vectura.UnitUtils || {};
    const norm = U.normalizeDocumentUnits
      || ((v) => (`${v || ''}`.trim().toLowerCase() === 'imperial' ? 'imperial' : 'metric'));
    const active = norm((Vectura.SETTINGS || {}).documentUnits);
    return {
      label: (U.getDocumentUnitLabel || ((u) => (u === 'imperial' ? 'in' : 'mm')))(active),
      toDoc: (mm) => (U.mmToDocumentUnits || ((v) => v))(mm, active),
      toMm: (v) => (U.documentUnitsToMm || ((x) => x))(v, active),
      precision: active === 'imperial' ? 4 : 2,
    };
  };

  const fmtDoc = (mm) => {
    const u = units();
    const v = u.toDoc(Number(mm) || 0);
    if (!Number.isFinite(v)) return '0';
    let text = v.toFixed(u.precision);
    if (text.includes('.')) text = text.replace(/\.?0+$/, '');
    return text;
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

  // ── Component ───────────────────────────────────────────────────────────────
  const mount = (opts = {}) => {
    const host = opts.host || opts.hostEl;
    if (!host) return { refresh() {}, destroy() {} };
    const app = opts.app || null;
    const cfg = S();
    const strings = STR();

    // Resolve the live target layer set on demand (supports layerIds via engine).
    const resolveLayers = () => {
      if (typeof opts.getLayers === 'function') return opts.getLayers() || [];
      if (Array.isArray(opts.layers)) return opts.layers;
      if (Array.isArray(opts.layerIds) && app?.engine?.getLayerById) {
        return opts.layerIds.map((id) => app.engine.getLayerById(id)).filter(Boolean);
      }
      return [];
    };

    const primary = () => resolveLayers()[0] || null;

    // History snapshot hook (push-before-change) + live repaint hooks, so each
    // host keeps its own model (mirrors FillControlSurface onEdit/onChange).
    const snapshot = () => {
      if (typeof opts.onEdit === 'function') return opts.onEdit();
      if (app?.pushHistory) app.pushHistory();
    };
    const repaint = ({ recompute = false } = {}) => {
      if (recompute && app?.engine?.computeAllDisplayGeometry) app.engine.computeAllDisplayGeometry();
      if (typeof opts.onChange === 'function') opts.onChange();
      else if (app?.render) app.render();
    };

    // Apply a mutation to every targeted layer under one history step.
    const writeAll = (mutate, { recompute = false } = {}) => {
      const layers = resolveLayers();
      if (!layers.length) return;
      snapshot();
      layers.forEach((layer) => mutate(layer));
      repaint({ recompute });
    };

    host.classList.add('stroke-options');
    host.innerHTML = '';

    let refreshFns = [];
    const refresh = () => refreshFns.forEach((fn) => fn());

    // ── Weight ────────────────────────────────────────────────────────────────
    const buildWeight = () => {
      const section = el('div', { class: 'stroke-row', 'data-stroke-section': 'weight' });
      section.appendChild(el('span', { class: 'stroke-row-label', text: strings.weightLabel || 'Weight:' }));

      const dec = el('button', {
        type: 'button', class: 'stroke-stepper', 'data-stroke-weight-dec': '',
        title: strings.weightDecrease || 'Decrease stroke weight', 'aria-label': strings.weightDecrease || 'Decrease stroke weight', text: '−',
      });
      const field = el('input', {
        type: 'text', class: 'stroke-field', 'data-stroke-weight-field': '',
        inputmode: 'decimal', 'aria-label': strings.weightLabel || 'Weight',
      });
      const inc = el('button', {
        type: 'button', class: 'stroke-stepper', 'data-stroke-weight-inc': '',
        title: strings.weightIncrease || 'Increase stroke weight', 'aria-label': strings.weightIncrease || 'Increase stroke weight', text: '+',
      });
      const unitTag = el('span', { class: 'stroke-unit', text: units().label });

      const preset = el('select', {
        class: 'stroke-preset', 'data-stroke-weight-preset': '',
        title: strings.weightPresetsLabel || 'Stroke weight presets',
        'aria-label': strings.weightPresetsLabel || 'Stroke weight presets',
      });
      preset.appendChild(el('option', { value: '', text: '–' }));
      (cfg.WEIGHT_PRESETS_MM || []).forEach((mm) => {
        preset.appendChild(el('option', { value: `${mm}`, text: `${fmtDoc(mm)} ${units().label}` }));
      });

      const stepMm = Number.isFinite(cfg.WEIGHT_STEP_MM) ? cfg.WEIGHT_STEP_MM : 0.05;
      const commitMm = (mm, kind) => {
        const M = Vectura.StrokeModel;
        writeAll((layer) => {
          if (M?.setStrokeWeight) M.setStrokeWeight(layer, mm, {});
          else layer.strokeWidth = mm;
        });
        refresh();
      };
      const readField = () => {
        const doc = parseFloat(`${field.value}`.replace(/[^\d.\-]/g, ''));
        if (!Number.isFinite(doc)) return null;
        return units().toMm(doc);
      };

      field.addEventListener('change', () => { const mm = readField(); if (mm != null) commitMm(mm); });
      field.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const mm = readField(); if (mm != null) commitMm(mm); } });
      const nudge = (dir) => {
        const cur = Number(primary()?.strokeWidth) || 0;
        commitMm(cur + dir * stepMm);
      };
      inc.addEventListener('click', () => nudge(1));
      dec.addEventListener('click', () => nudge(-1));
      preset.addEventListener('change', () => {
        const mm = parseFloat(preset.value);
        if (Number.isFinite(mm)) commitMm(mm);
        preset.value = '';
      });

      refreshFns.push(() => {
        // MSC-1: a multi-selection with differing weights shows an explicit
        // "mixed" placeholder rather than the primary's (misleading) value.
        const layers = resolveLayers();
        const M = Vectura.MixedValue;
        const MX = Vectura.MIXED_VALUES || {};
        const mv = (M && M.strokeWeight)
          ? M.strokeWeight(layers)
          : { value: layers[0]?.strokeWidth ?? null, mixed: false };
        if (mv.mixed) {
          if (document.activeElement !== field) field.value = '';
          field.placeholder = MX.placeholder || 'mixed';
          field.title = MX.strokeWeightTitle || '';
          field.classList.add('is-mixed');
        } else {
          if (document.activeElement !== field) field.value = layers.length ? fmtDoc(mv.value ?? 0) : '';
          field.placeholder = '';
          field.title = '';
          field.classList.remove('is-mixed');
        }
        unitTag.textContent = units().label;
      });

      section.appendChild(dec);
      section.appendChild(field);
      section.appendChild(inc);
      section.appendChild(unitTag);
      section.appendChild(preset);
      return section;
    };

    // ── Toggle group helper (Cap / Corner / Align) ──────────────────────────────
    const buildToggleGroup = ({ sectionKey, label, dataAttr, values, tooltips, read, write, recompute }) => {
      const section = el('div', { class: 'stroke-row', 'data-stroke-section': sectionKey });
      section.appendChild(el('span', { class: 'stroke-row-label', text: label }));
      const group = el('div', { class: 'stroke-toggle-group', role: 'group', 'aria-label': label });
      const buttons = values.map((value) => {
        const btn = el('button', {
          type: 'button', class: 'stroke-toggle', title: (tooltips && tooltips[value]) || value,
          'aria-label': (tooltips && tooltips[value]) || value, 'aria-pressed': 'false',
        });
        btn.setAttribute(dataAttr, value);
        btn.appendChild(iconFor(dataAttr, value));
        btn.addEventListener('click', () => {
          writeAll((layer) => write(layer, value), { recompute: Boolean(recompute) });
          refresh();
        });
        group.appendChild(btn);
        return btn;
      });
      section.appendChild(group);
      refreshFns.push(() => {
        const layer = primary();
        const active = layer ? read(layer) : null;
        buttons.forEach((btn) => {
          const on = btn.getAttribute(dataAttr) === active;
          btn.classList.toggle('is-active', on);
          btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
      });
      return { section, buttons };
    };

    // ── Corner (with Limit) ─────────────────────────────────────────────────────
    const buildCorner = () => {
      const { section } = buildToggleGroup({
        sectionKey: 'corner',
        label: strings.cornerLabel || 'Corner:',
        dataAttr: 'data-stroke-join',
        values: cfg.JOINS || ['miter', 'round', 'bevel'],
        tooltips: strings.cornerTooltips,
        read: (layer) => layer.lineJoin || 'round',
        write: (layer, value) => { layer.lineJoin = value; },
      });
      const limitWrap = el('span', { class: 'stroke-limit' });
      limitWrap.appendChild(el('span', { class: 'stroke-limit-label', text: strings.limitLabel || 'Limit:' }));
      const limit = el('input', {
        type: 'text', class: 'stroke-field stroke-limit-field', 'data-stroke-limit-field': '',
        inputmode: 'decimal', title: strings.limitTooltip || 'Miter limit',
        'aria-label': strings.limitLabel || 'Miter limit',
      });
      limitWrap.appendChild(limit);
      section.appendChild(limitWrap);

      const commitLimit = () => {
        const num = parseFloat(`${limit.value}`.replace(/[^\d.\-]/g, ''));
        if (!Number.isFinite(num)) return;
        const clamped = cfg.normalizeMiterLimit ? cfg.normalizeMiterLimit(num) : Math.max(1, Math.min(100, num));
        writeAll((layer) => { layer.miterLimit = clamped; });
        refresh();
      };
      limit.addEventListener('change', commitLimit);
      limit.addEventListener('keydown', (e) => { if (e.key === 'Enter') commitLimit(); });

      refreshFns.push(() => {
        const layer = primary();
        const isMiter = (layer?.lineJoin || 'round') === 'miter';
        limit.disabled = !isMiter;
        limitWrap.classList.toggle('is-disabled', !isMiter);
        limit.value = layer ? `${layer.miterLimit ?? 10}` : '';
      });
      return section;
    };

    // ── Dashed Line ─────────────────────────────────────────────────────────────
    const buildDash = () => {
      const section = el('div', { class: 'stroke-row stroke-row-dash', 'data-stroke-section': 'dash' });
      const head = el('label', { class: 'stroke-dash-head' });
      const checkbox = el('input', { type: 'checkbox', 'data-stroke-dash-toggle': '', 'aria-label': strings.dashedLineLabel || 'Dashed Line' });
      head.appendChild(checkbox);
      head.appendChild(el('span', { text: strings.dashedLineLabel || 'Dashed Line' }));
      section.appendChild(head);

      const grid = el('div', { class: 'stroke-dash-grid' });
      const fieldLabels = strings.dashFieldLabels || ['dash', 'gap', 'dash', 'gap', 'dash', 'gap'];
      const cells = [];
      for (let i = 0; i < 6; i += 1) {
        const cell = el('div', { class: 'stroke-dash-cell' });
        const input = el('input', {
          type: 'text', class: 'stroke-field stroke-dash-field', 'data-stroke-dash-field': `${i}`,
          inputmode: 'decimal', 'aria-label': `${fieldLabels[i]} ${Math.floor(i / 2) + 1}`,
        });
        const chip = el('span', { class: 'stroke-dash-label', 'data-stroke-dash-label': `${i}`, text: fieldLabels[i] });
        input.addEventListener('focus', () => chip.classList.add('is-focused'));
        input.addEventListener('blur', () => chip.classList.remove('is-focused'));
        const commit = () => {
          const doc = parseFloat(`${input.value}`.replace(/[^\d.\-]/g, ''));
          const mm = Number.isFinite(doc) ? Math.max(0, units().toMm(doc)) : 0;
          writeAll((layer) => {
            const dash = cfg.sanitizeDash ? cfg.sanitizeDash(layer.dash) : (layer.dash || { enabled: false, pattern: [] });
            const pattern = dash.pattern.slice();
            while (pattern.length <= i) pattern.push(0);
            pattern[i] = mm;
            layer.dash = { enabled: true, pattern: pattern.slice(0, 6) };
          });
          refresh();
        };
        input.addEventListener('change', commit);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { commit(); input.blur(); } });
        cell.appendChild(input);
        cell.appendChild(chip);
        grid.appendChild(cell);
        cells.push(input);
      }
      section.appendChild(grid);

      checkbox.addEventListener('change', () => {
        const on = checkbox.checked;
        writeAll((layer) => {
          const dash = cfg.sanitizeDash ? cfg.sanitizeDash(layer.dash) : (layer.dash || { enabled: false, pattern: [] });
          let pattern = dash.pattern.slice();
          // Enabling with an empty pattern pre-fills the first dash with a
          // sensible default (video f0029: "12 pt" first dash on enable).
          if (on && !pattern.some((v) => v > 0)) {
            const def = Number.isFinite(cfg.DEFAULT_DASH_MM) ? cfg.DEFAULT_DASH_MM : 3;
            pattern = [def];
          }
          layer.dash = { enabled: on, pattern: pattern.slice(0, 6) };
        });
        refresh();
      });

      refreshFns.push(() => {
        const layer = primary();
        const dash = cfg.sanitizeDash ? cfg.sanitizeDash(layer?.dash) : (layer?.dash || { enabled: false, pattern: [] });
        checkbox.checked = Boolean(dash.enabled);
        cells.forEach((input, i) => {
          input.disabled = !dash.enabled;
          const mm = dash.pattern[i];
          input.value = Number.isFinite(mm) && mm > 0 ? fmtDoc(mm) : '';
        });
        grid.classList.toggle('is-disabled', !dash.enabled);
      });
      return section;
    };

    // Assemble in strict top-to-bottom order.
    host.appendChild(buildWeight());
    host.appendChild(buildToggleGroup({
      sectionKey: 'cap',
      label: strings.capLabel || 'Cap:',
      dataAttr: 'data-stroke-cap',
      values: cfg.CAPS || ['butt', 'round', 'projecting'],
      tooltips: strings.capTooltips,
      read: (layer) => cfg.normalizeCap ? cfg.normalizeCap(layer.lineCap) : (layer.lineCap || 'round'),
      write: (layer, value) => { layer.lineCap = value; },
    }).section);
    host.appendChild(buildCorner());
    host.appendChild(buildToggleGroup({
      sectionKey: 'align',
      label: strings.alignLabel || 'Align Stroke:',
      dataAttr: 'data-stroke-align',
      values: cfg.ALIGNS || ['center', 'inside', 'outside'],
      tooltips: strings.alignTooltips,
      read: (layer) => layer.strokeAlign || 'center',
      write: (layer, value) => { layer.strokeAlign = value; },
      recompute: true,
    }).section);
    host.appendChild(buildDash());

    refresh();
    return {
      refresh,
      destroy() { host.innerHTML = ''; refreshFns = []; },
    };
  };

  // Minimal inline icons keyed by control + value. Kept dependency-free (no
  // external sprite) so the component drops into any host, incl. the Task Bar
  // popover. Distinct silhouettes so the toggles read at a glance.
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = (paths) => {
    const s = document.createElementNS(svgNS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('width', '16');
    s.setAttribute('height', '16');
    s.setAttribute('aria-hidden', 'true');
    paths.forEach((d) => {
      const p = document.createElementNS(svgNS, 'path');
      p.setAttribute('d', d);
      s.appendChild(p);
    });
    return s;
  };
  const ICONS = {
    'data-stroke-cap': {
      butt: ['M6 6v12M6 12h12'],
      round: ['M6 6v12M6 12h9', 'M15 8a4 4 0 010 8'],
      projecting: ['M6 6v12M6 12h12M18 9v6'],
    },
    'data-stroke-join': {
      miter: ['M5 19V5h14'],
      round: ['M5 19V9a4 4 0 014-4h10'],
      bevel: ['M5 19V9l4-4h10'],
    },
    'data-stroke-align': {
      center: ['M4 8h16M4 16h16', 'M12 4v16'],
      inside: ['M4 12h16', 'M12 4v16', 'M6 8h12v8H6z'],
      outside: ['M4 12h16', 'M12 4v16', 'M8 6h8v12H8z'],
    },
  };
  const iconFor = (dataAttr, value) => {
    const set = ICONS[dataAttr] || {};
    return svg(set[value] || ['M4 12h16']);
  };

  // Convenience: render(host, {app, layerIds|layers}) — the two-host entry point.
  const render = (host, options = {}) => mount({ host, ...options });

  UI.StrokeOptionsPanel = { mount, render };
})();
