/*
 * Vectura Studio — HarmonographPresetGallery component.
 *
 * Compact dropdown selector for harmonograph-family presets (harmonograph +
 * pendula). A trigger button shows the active preset's 28 px canvas thumbnail
 * and name; clicking it opens a grouped popover list where every option also
 * renders the same thumbnail. Groups follow the craft-ladder order:
 *
 *   Classic → Detuned → Evolving   (empty groups are omitted)
 *
 * A "Custom" option is always first so users can deselect any preset.
 * Clicking an option calls opts.onApply(presetId) — the same apply path the
 * former gallery card used (merge params, preserve transform, storeLayerParams,
 * regen, rebuild controls). The active option carries .is-active from mount.
 *
 * Usage:
 *   Vectura.UI.HarmonographPresetGallery(targetEl, { layer, presets, onApply });
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});

  // Craft-ladder order. Empty groups are omitted at render time.
  const GROUP_ORDER = ['Classic', 'Detuned', 'Evolving', 'User'];
  const THUMB_SIZE = 28;

  const LS_KEY = (system) => `vectura.user_presets.${system}`;

  const loadUserPresets = (system) => {
    try {
      const raw = typeof localStorage !== 'undefined' && localStorage.getItem(LS_KEY(system));
      return raw ? JSON.parse(raw) : [];
    } catch (_) { return []; }
  };

  const saveUserPresets = (system, presets) => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LS_KEY(system), JSON.stringify(presets));
      }
    } catch (_) { /* quota or security error — silently ignore */ }
  };

  const readToken = (name, fallback) => {
    try {
      const root = document.documentElement;
      const v = root && getComputedStyle ? getComputedStyle(root).getPropertyValue(name) : '';
      return (v && v.trim()) || fallback;
    } catch (_) {
      return fallback;
    }
  };

  // Evaluate a preset's full figure and stroke it fit-to-box into the canvas.
  // Guarded for jsdom no-op contexts (getContext may return a stub lacking
  // setTransform / beginPath). Size parameter controls both CSS and backing dims.
  const drawThumb = (canvas, params, size = THUMB_SIZE) => {
    if (!canvas || typeof canvas.getContext !== 'function') return;
    const ctx = canvas.getContext('2d');
    if (!ctx || typeof ctx.beginPath !== 'function') return;
    const HC = (typeof window !== 'undefined' ? window : globalThis)?.Vectura?.HarmonographCore;
    const dpr = Math.max(1, Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 3));
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    if (typeof ctx.setTransform === 'function') ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    try { ctx.clearRect(0, 0, size, size); } catch (_) { return; }
    if (!HC || typeof HC.evaluatePath !== 'function') return;
    let path = [];
    try {
      path = HC.evaluatePath(params, { sampleCap: 1200 }).path || [];
    } catch (_) { path = []; }
    if (path.length < 2) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    path.forEach((pt) => {
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    });
    const span = Math.max(maxX - minX, maxY - minY, 1);
    const pad = Math.max(2, Math.round(size * 0.09));
    const s = (size - pad * 2) / span;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    try {
      ctx.strokeStyle = readToken('--ui-accent', '#6366f1');
      ctx.lineWidth = 0.15;
      ctx.beginPath();
      path.forEach((pt, i) => {
        const x = (pt.x - cx) * s + size / 2;
        const y = (pt.y - cy) * s + size / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    } catch (_) { /* no-op ctx */ }
  };

  const CHEVRON = `<svg class="hg-preset-chevron" viewBox="0 0 10 6" fill="none" aria-hidden="true"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  const create = (target, opts = {}) => {
    if (!target) return null;
    const layer = opts.layer;
    const system = layer ? layer.type : null;
    const builtInPresets = Array.isArray(opts.presets) ? opts.presets : [];
    const onApply = typeof opts.onApply === 'function' ? opts.onApply : () => {};
    let activeId = layer && layer.params ? layer.params.preset : undefined;

    // Merge built-in + user (localStorage) presets.
    let userPresets = system ? loadUserPresets(system) : [];
    let presets = [...builtInPresets, ...userPresets];

    const defaults = (() => {
      const all = (typeof window !== 'undefined' ? window : globalThis)?.Vectura?.ALGO_DEFAULTS;
      const base = all && layer ? all[layer.type] : null;
      return base && typeof base === 'object' ? base : {};
    })();

    const presetMap = {};
    presets.forEach((p) => { presetMap[p.id] = p; });

    // ── Wrapper ───────────────────────────────────────────────────────────────
    const wrap = document.createElement('div');
    wrap.className = 'hg-preset-dropdown-wrap';

    // ── Trigger button ────────────────────────────────────────────────────────
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'hg-preset-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');

    const triggerThumb = document.createElement('canvas');
    triggerThumb.className = 'hg-preset-trigger-thumb';
    triggerThumb.setAttribute('aria-hidden', 'true');
    trigger.appendChild(triggerThumb);

    const triggerLabel = document.createElement('span');
    triggerLabel.className = 'hg-preset-trigger-label';
    trigger.appendChild(triggerLabel);

    trigger.insertAdjacentHTML('beforeend', CHEVRON);
    wrap.appendChild(trigger);

    // ── Popover ───────────────────────────────────────────────────────────────
    const popover = document.createElement('div');
    popover.className = 'hg-preset-popover';
    popover.setAttribute('role', 'listbox');
    popover.hidden = true;
    wrap.appendChild(popover);

    // ── Helpers ───────────────────────────────────────────────────────────────
    const updateTrigger = (id) => {
      const preset = id && id !== 'custom' ? presetMap[id] : null;
      triggerLabel.textContent = preset ? preset.name : 'Custom';
      if (preset) {
        triggerThumb.style.display = '';
        drawThumb(triggerThumb, { ...defaults, ...(preset.params || {}) }, THUMB_SIZE);
      } else {
        triggerThumb.style.display = 'none';
      }
    };

    let outsideHandler = null;

    const close = () => {
      popover.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      if (outsideHandler) {
        document.removeEventListener('pointerdown', outsideHandler, true);
        outsideHandler = null;
      }
    };

    const open = () => {
      popover.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      // Refresh active state in case activeId changed externally.
      popover.querySelectorAll('.hg-preset-option').forEach((opt) => {
        const isActive = opt.dataset.presetId === (activeId || 'custom');
        opt.classList.toggle('is-active', isActive);
        opt.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      outsideHandler = (e) => { if (!wrap.contains(e.target)) close(); };
      document.addEventListener('pointerdown', outsideHandler, true);
    };

    trigger.addEventListener('click', () => { if (!popover.hidden) close(); else open(); });

    popover.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { close(); trigger.focus(); }
    });

    // ── Popover rebuild (called on init, after import, after delete) ──────────
    const rebuildPopover = () => {
      // Re-sync merged preset list and map.
      userPresets = system ? loadUserPresets(system) : [];
      presets = [...builtInPresets, ...userPresets];
      Object.keys(presetMap).forEach((k) => delete presetMap[k]);
      presets.forEach((p) => { presetMap[p.id] = p; });

      popover.innerHTML = '';

      // ── Option factory ──────────────────────────────────────────────────────
      const makeOption = (presetId, label, params, isUser) => {
        const isActive = presetId === (activeId || 'custom');
        const opt = document.createElement('button');
        opt.type = 'button';
        opt.className = `hg-preset-option${isActive ? ' is-active' : ''}`;
        opt.dataset.presetId = presetId;
        opt.setAttribute('role', 'option');
        opt.setAttribute('aria-selected', isActive ? 'true' : 'false');

        if (params) {
          const thumb = document.createElement('canvas');
          thumb.className = 'hg-preset-option-thumb';
          thumb.setAttribute('aria-hidden', 'true');
          opt.appendChild(thumb);
          drawThumb(thumb, params, THUMB_SIZE);
        } else {
          const ph = document.createElement('span');
          ph.className = 'hg-preset-option-thumb hg-preset-option-thumb--placeholder';
          opt.appendChild(ph);
        }

        const lbl = document.createElement('span');
        lbl.className = 'hg-preset-option-label';
        lbl.textContent = label;
        opt.appendChild(lbl);

        if (isUser) {
          const del = document.createElement('button');
          del.type = 'button';
          del.className = 'hg-preset-delete';
          del.setAttribute('aria-label', `Delete "${label}"`);
          del.innerHTML = `<svg viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
          del.addEventListener('click', (e) => {
            e.stopPropagation();
            const updated = loadUserPresets(system).filter((p) => p.id !== presetId);
            saveUserPresets(system, updated);
            if (activeId === presetId) {
              activeId = 'custom';
              updateTrigger('custom');
              onApply('custom');
            }
            rebuildPopover();
          });
          opt.appendChild(del);
        }

        return opt;
      };

      // ── "Custom" option ─────────────────────────────────────────────────────
      const customOpt = makeOption('custom', 'Custom', null, false);
      customOpt.addEventListener('click', () => {
        activeId = 'custom';
        updateTrigger('custom');
        close();
        onApply('custom');
      });
      popover.appendChild(customOpt);

      // ── Grouped preset options ──────────────────────────────────────────────
      GROUP_ORDER.forEach((groupName) => {
        const inGroup = presets.filter((p) => p.group === groupName);
        if (!inGroup.length) return;

        const section = document.createElement('div');
        section.className = 'hg-preset-group';

        const header = document.createElement('div');
        header.className = 'hg-preset-group-title';
        header.textContent = groupName;
        section.appendChild(header);

        const isUserGroup = groupName === 'User';
        inGroup.forEach((preset) => {
          const opt = makeOption(
            preset.id, preset.name,
            { ...defaults, ...(preset.params || {}) },
            isUserGroup
          );
          opt.setAttribute('aria-label', `${preset.name} — ${groupName}`);
          opt.addEventListener('click', () => {
            activeId = preset.id;
            updateTrigger(preset.id);
            close();
            onApply(preset.id);
          });
          section.appendChild(opt);
        });

        popover.appendChild(section);
      });

      // ── Import button ───────────────────────────────────────────────────────
      if (system) {
        const importBtn = document.createElement('button');
        importBtn.type = 'button';
        importBtn.className = 'hg-preset-import';
        importBtn.textContent = 'Import from .vectura…';
        importBtn.addEventListener('click', () => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.vectura';
          input.addEventListener('change', () => {
            const file = input.files && input.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              let doc;
              try { doc = JSON.parse(reader.result); } catch (_) {
                alert('Could not read .vectura file — invalid JSON.');
                return;
              }
              const layers = Array.isArray(doc.layers) ? doc.layers : [];
              const matchLayer = layers.find((l) => l.type === system);
              if (!matchLayer) {
                alert(`No ${system} layer found in this .vectura file.`);
                return;
              }
              const stem = file.name.replace(/\.vectura$/i, '');
              const defaultName = stem.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
              const promptFn = typeof window !== 'undefined' && typeof window.prompt === 'function'
                ? window.prompt
                : null;
              const name = promptFn
                ? (promptFn('Preset name:', defaultName) || '').trim() || defaultName
                : defaultName;
              const STRIP = new Set(['seed', 'posX', 'posY', 'scaleX', 'scaleY', 'rotation']);
              const params = Object.fromEntries(
                Object.entries(matchLayer.params || {}).filter(([k]) => !STRIP.has(k))
              );
              const id = `user-${system}-${Date.now()}`;
              const newPreset = { id, name, preset_system: system, group: 'User', params };
              const updated = [...loadUserPresets(system), newPreset];
              saveUserPresets(system, updated);
              rebuildPopover();
            };
            reader.readAsText(file);
          });
          input.click();
        });
        popover.appendChild(importBtn);
      }
    };

    // ── Init ──────────────────────────────────────────────────────────────────
    rebuildPopover();
    updateTrigger(activeId);
    target.appendChild(wrap);
    return { el: wrap };
  };

  UI.HarmonographPresetGallery = create;
})();
