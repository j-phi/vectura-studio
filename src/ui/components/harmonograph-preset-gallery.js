/*
 * Vectura Studio — HarmonographPresetGallery component.
 *
 * The craft-ladder preset selector for the harmonograph family (harmonograph +
 * the pendula studio). Replaces the flat <select> with a grid of clickable
 * mini-thumbnail cards grouped by craft-ladder stage:
 *
 *   Classic → Detuned → Evolving
 *
 * Each card renders the preset figure to a small DPR-scaled canvas (via the
 * shared HarmonographCore.evaluatePath) and shows the preset name. Clicking a
 * card routes through opts.onApply(presetId) — the host wires that to the SAME
 * apply path the legacy <select> used (merge params, preserve transform, set
 * layer.params.preset, storeLayerParams, regen, rebuild controls). The card for
 * the currently-applied preset (layer.params.preset) is highlighted; a
 * non-matching ("Custom") state simply leaves every card inactive.
 *
 * Usage:
 *   Vectura.UI.HarmonographPresetGallery(targetEl, { layer, presets, onApply });
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});

  // Craft-ladder order. Empty groups are omitted at render time.
  const GROUP_ORDER = ['Classic', 'Detuned', 'Evolving'];

  const readToken = (name, fallback) => {
    try {
      const root = document.documentElement;
      const v = root && getComputedStyle ? getComputedStyle(root).getPropertyValue(name) : '';
      return (v && v.trim()) || fallback;
    } catch (_) {
      return fallback;
    }
  };

  // Evaluate a preset's full figure (defaults ⊕ preset params) and stroke it
  // fit-to-box into the thumbnail canvas. Mirrors the bbox/scale math in the
  // virtual plotter draw() and the per-pendulum mini-trace. Guarded for the
  // jsdom no-op ctx (getContext may return a stub lacking setTransform).
  const drawThumb = (canvas, params) => {
    if (!canvas || typeof canvas.getContext !== 'function') return;
    const ctx = canvas.getContext('2d');
    if (!ctx || typeof ctx.beginPath !== 'function') return;
    const HC = (typeof window !== 'undefined' ? window : globalThis)?.Vectura?.HarmonographCore;
    const CSS_SIZE = 64;
    const dpr = Math.max(1, Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 3));
    canvas.width = Math.round(CSS_SIZE * dpr);
    canvas.height = Math.round(CSS_SIZE * dpr);
    // Draw in logical CSS coords; the DPR-scaled backing store is handled by
    // this transform. Guarded for jsdom mocks lacking setTransform.
    if (typeof ctx.setTransform === 'function') ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    try { ctx.clearRect(0, 0, CSS_SIZE, CSS_SIZE); } catch (_) { return; }
    if (!HC || typeof HC.evaluatePath !== 'function') return;
    let path = [];
    try {
      path = HC.evaluatePath(params, { sampleCap: 1200 }).path || [];
    } catch (_) {
      path = [];
    }
    if (path.length < 2) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    path.forEach((pt) => {
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    });
    const span = Math.max(maxX - minX, maxY - minY, 1);
    const pad = 6;
    const s = (CSS_SIZE - pad * 2) / span;
    const toCanvas = (pt) => ({
      x: (pt.x - (minX + maxX) / 2) * s + CSS_SIZE / 2,
      y: (pt.y - (minY + maxY) / 2) * s + CSS_SIZE / 2,
    });
    try {
      ctx.strokeStyle = readToken('--ui-accent', '#6366f1');
      ctx.lineWidth = 1;
      ctx.beginPath();
      path.forEach((pt, i) => {
        const c = toCanvas(pt);
        if (i === 0) ctx.moveTo(c.x, c.y);
        else ctx.lineTo(c.x, c.y);
      });
      ctx.stroke();
    } catch (_) { /* no-op ctx */ }
  };

  const create = (target, opts = {}) => {
    if (!target) return null;
    const layer = opts.layer;
    const presets = Array.isArray(opts.presets) ? opts.presets : [];
    const onApply = typeof opts.onApply === 'function' ? opts.onApply : () => {};
    const activeId = layer && layer.params ? layer.params.preset : undefined;

    const defaults = (() => {
      const all = (typeof window !== 'undefined' ? window : globalThis)?.Vectura?.ALGO_DEFAULTS;
      const base = all && layer ? all[layer.type] : null;
      return base && typeof base === 'object' ? base : {};
    })();

    const root = document.createElement('div');
    root.className = 'hg-preset-gallery';

    GROUP_ORDER.forEach((groupName) => {
      const inGroup = presets.filter((p) => p.group === groupName);
      if (!inGroup.length) return;

      const section = document.createElement('div');
      section.className = 'hg-preset-group';

      const header = document.createElement('div');
      header.className = 'hg-preset-group-title';
      header.textContent = groupName;
      section.appendChild(header);

      const grid = document.createElement('div');
      grid.className = 'hg-preset-grid';

      inGroup.forEach((preset) => {
        const isActive = preset.id === activeId;
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `hg-preset-card${isActive ? ' is-active' : ''}`;
        card.dataset.presetId = preset.id;
        card.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        card.setAttribute('aria-label', `${preset.name} preset — ${groupName}`);
        card.title = preset.name;

        const thumb = document.createElement('canvas');
        thumb.className = 'hg-preset-thumb';
        thumb.setAttribute('aria-hidden', 'true');
        card.appendChild(thumb);

        const name = document.createElement('span');
        name.className = 'hg-preset-name';
        name.textContent = preset.name;
        card.appendChild(name);

        // Merge defaults ⊕ preset params for the figure preview — the same
        // shape the apply path produces (minus the preserved transform, which
        // doesn't affect the fit-to-box thumbnail).
        drawThumb(thumb, { ...defaults, ...(preset.params || {}) });

        card.addEventListener('click', () => onApply(preset.id));
        grid.appendChild(card);
      });

      section.appendChild(grid);
      root.appendChild(section);
    });

    target.appendChild(root);
    return { el: root };
  };

  UI.HarmonographPresetGallery = create;
})();
