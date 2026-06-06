/*
 * Vectura Studio — PresetGallery component (universal).
 *
 * Compact dropdown selector for ANY algorithm's presets. A trigger button shows
 * the active preset's 28 px canvas thumbnail and name; clicking it opens a
 * grouped popover list where every option also renders the same thumbnail.
 * Groups follow the universal vocabulary order:
 *
 *   Classic → Geometric → Organic → Complex → Evolving → User
 *
 * (empty groups are omitted). A "Custom" option is always first so users can
 * deselect any preset. Clicking an option calls opts.onApply(presetId) — the
 * generic apply path (merge params, preserve transform, storeLayerParams,
 * regen, rebuild controls). The active option carries .is-active from mount.
 *
 * Thumbnails dispatch by layer type: harmonograph/pendula use the fast
 * HarmonographCore.evaluatePath path; every other algorithm calls its
 * window.Vectura.Algorithms[type].generate(params, rng) and strokes the
 * returned polylines fit-to-box. Generation is wrapped in try/catch so a
 * failing algorithm yields an empty canvas rather than a broken popover.
 *
 * Usage:
 *   Vectura.UI.PresetGallery(targetEl, { layer, presets, onApply });
 *   Vectura.UI.HarmonographPresetGallery — backward-compat alias.
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});

  // Universal group vocabulary order. Empty groups are omitted at render time.
  const GROUP_ORDER = ['Classic', 'Geometric', 'Organic', 'Complex', 'Evolving', 'User'];
  const THUMB_SIZE = 28;

  // Keys that belong to the layer's canvas placement, not the algorithm look —
  // stripped from a preset's params on both import and save so a preset never
  // carries a position/seed. Mirrors scripts/build-user-presets.js TRANSFORM_KEYS.
  const STRIP = new Set(['seed', 'posX', 'posY', 'scaleX', 'scaleY', 'rotation']);

  // Matches the bundler's slugify so a repo-download .vectura yields the same id.
  const slugify = (str) =>
    String(str).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const stripParams = (params) =>
    Object.fromEntries(Object.entries(params || {}).filter(([k]) => !STRIP.has(k)));

  // Harmonograph-family types use the fast analytic evaluator; everything else
  // routes through the algorithm registry's generate().
  const HG_TYPES = new Set(['harmonograph', 'pendula']);

  // Per-key caps applied to a preset's params before a generic generate() so a
  // 28 px thumbnail stays cheap to draw (a fully-populated popover renders dozens
  // of them on open). Values are high enough to keep each algorithm's shape
  // recognizable — e.g. attractors still need a few thousand iterations.
  const THUMB_PARAM_CAPS = {
    samples: 1200, count: 600, iter: 3000, density: 500, steps: 150,
    maxSteps: 150, attempts: 60, resolution: 90, res: 90, lines: 120,
  };

  const capThumbParams = (params) => {
    const out = { ...(params || {}) };
    for (const key in THUMB_PARAM_CAPS) {
      if (typeof out[key] === 'number' && out[key] > THUMB_PARAM_CAPS[key]) {
        out[key] = THUMB_PARAM_CAPS[key];
      }
    }
    return out;
  };

  // Evaluate a preset's geometry as an array of polylines [[{x,y}...]...],
  // dispatching by layer type. Returns [] on any failure.
  const evalPaths = (params, layerType) => {
    const V = (typeof window !== 'undefined' ? window : globalThis)?.Vectura;
    if (!V) return [];
    try {
      if (HG_TYPES.has(layerType)) {
        const HC = V.HarmonographCore;
        if (!HC || typeof HC.evaluatePath !== 'function') return [];
        const path = HC.evaluatePath(params, { sampleCap: 1200 }).path || [];
        return path.length >= 2 ? [path] : [];
      }
      const algo = V.Algorithms && V.Algorithms[layerType];
      if (!algo || typeof algo.generate !== 'function') return [];
      const seed = params?.seed ?? 1;
      const rng = V.SeededRNG ? new V.SeededRNG(seed) : Math.random;
      const noise = V.SimpleNoise ? new V.SimpleNoise(seed) : null;
      // Algorithms generate into document space; a synthetic square bounds is
      // fine because drawThumb fits the result to the canvas box afterward.
      const bounds = { width: 200, height: 200, m: 0, dW: 200, dH: 200, truncate: false };
      const result = algo.generate(capThumbParams(params), rng, noise, bounds);
      if (!Array.isArray(result)) return [];
      // Normalize each path to an array of {x,y}. Some algorithms (e.g. phylla
      // circles) emit empty arrays carrying a meta circle the renderer expands;
      // tessellate those so the thumbnail still shows the dot field.
      return result.map((p) => {
        if (Array.isArray(p) && p.length >= 2) return p;
        if (Array.isArray(p) && p.meta && p.meta.kind === 'circle') {
          const { cx, cy, r } = p.meta;
          const pts = [];
          for (let k = 0; k <= 12; k++) {
            const a = (k / 12) * Math.PI * 2;
            pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
          }
          return pts;
        }
        return null;
      }).filter(Boolean);
    } catch (_) {
      return [];
    }
  };

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

  // Evaluate a preset's figure (one or many polylines) and stroke it fit-to-box
  // into the canvas. Guarded for jsdom no-op contexts (getContext may return a
  // stub lacking setTransform / beginPath). `size` controls CSS + backing dims.
  const drawThumb = (canvas, params, layerType, size = THUMB_SIZE) => {
    if (!canvas || typeof canvas.getContext !== 'function') return;
    const ctx = canvas.getContext('2d');
    if (!ctx || typeof ctx.beginPath !== 'function') return;
    const dpr = Math.max(1, Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 3));
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    if (typeof ctx.setTransform === 'function') ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    try { ctx.clearRect(0, 0, size, size); } catch (_) { return; }

    const paths = evalPaths(params, layerType);
    if (!paths.length) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    paths.forEach((path) => path.forEach((pt) => {
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }));
    if (!Number.isFinite(minX) || !Number.isFinite(minY)) return;
    const span = Math.max(maxX - minX, maxY - minY, 1);
    const pad = Math.max(2, Math.round(size * 0.09));
    const s = (size - pad * 2) / span;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    try {
      ctx.strokeStyle = readToken('--ui-accent', '#6366f1');
      ctx.lineWidth = 0.15;
      paths.forEach((path) => {
        ctx.beginPath();
        path.forEach((pt, i) => {
          const x = (pt.x - cx) * s + size / 2;
          const y = (pt.y - cy) * s + size / 2;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      });
    } catch (_) { /* no-op ctx */ }
  };

  const CHEVRON = `<svg class="hg-preset-chevron" viewBox="0 0 10 6" fill="none" aria-hidden="true"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  const create = (target, opts = {}) => {
    if (!target) return null;
    const layer = opts.layer;
    const system = layer ? layer.type : null;
    const builtInPresets = Array.isArray(opts.presets) ? opts.presets : [];
    const onApply = typeof opts.onApply === 'function' ? opts.onApply : () => {};

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

    // ── Divergence detection ────────────────────────────────────────────────
    // "Custom" is hidden until the layer diverges from its named preset. Rather
    // than instrument every param-edit site, we derive the active preset by
    // comparing the layer's current params against the claimed preset's expected
    // params ({...defaults, ...preset.params}), ignoring keys a preset apply
    // never touches (transform/preserve set + the preset/label markers). A
    // mismatch on any compared key means the user has edited away → 'custom'.
    const IGNORED_KEYS = new Set([
      'preset', 'label',
      ...(Array.isArray(opts.preservedKeys) ? opts.preservedKeys : []),
    ]);
    const deepEqual = (a, b) => {
      if (a === b) return true;
      if (typeof a !== typeof b || !a || !b || typeof a !== 'object') return false;
      if (Array.isArray(a) !== Array.isArray(b)) return false;
      const ka = Object.keys(a), kb = Object.keys(b);
      if (ka.length !== kb.length) return false;
      return ka.every((k) => deepEqual(a[k], b[k]));
    };
    const isOnPreset = (presetId) => {
      const p = presetMap[presetId];
      if (!p || !layer || !layer.params) return false;
      const expected = { ...defaults, ...(p.params || {}) };
      for (const k of Object.keys(expected)) {
        if (IGNORED_KEYS.has(k)) continue;
        if (!deepEqual(layer.params[k], expected[k])) return false;
      }
      return true;
    };
    const computeActiveId = () => {
      const claimed = layer && layer.params ? layer.params.preset : undefined;
      if (claimed && claimed !== 'custom' && presetMap[claimed] && isOnPreset(claimed)) return claimed;
      return 'custom';
    };
    let activeId = computeActiveId();

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

    // ── Save pip ────────────────────────────────────────────────────────────────
    // A colored disk that fades in next to the trigger the instant the layer
    // diverges from its named preset (activeId === 'custom'). Clicking it opens
    // the Save Preset modal. Hidden while the layer is on a named preset.
    const savePip = document.createElement('button');
    savePip.type = 'button';
    savePip.className = 'hg-preset-save-pip';
    savePip.hidden = true;
    savePip.setAttribute('aria-label', 'Save current settings as a preset');
    savePip.setAttribute('title', 'Save current settings as a preset');
    savePip.innerHTML = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 4v5h7V4M8 21v-6h8v6" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;
    if (system) wrap.appendChild(savePip);

    // ── Popover ───────────────────────────────────────────────────────────────
    const popover = document.createElement('div');
    popover.className = 'hg-preset-popover';
    popover.setAttribute('role', 'listbox');
    popover.hidden = true;
    wrap.appendChild(popover);

    // ── Helpers ───────────────────────────────────────────────────────────────
    // The pip shows only while the layer is "dirty" (diverged → activeId
    // 'custom'). A one-time glow pulse fires on the hidden→visible transition;
    // CSS gates it behind prefers-reduced-motion.
    let pipVisible = false;
    const updateSavePip = (id) => {
      if (!system) return;
      const shouldShow = id === 'custom';
      if (shouldShow === pipVisible) return;
      pipVisible = shouldShow;
      savePip.hidden = !shouldShow;
      if (shouldShow) {
        savePip.classList.remove('is-pulsing');
        // Force reflow so re-adding the class restarts the animation.
        void savePip.offsetWidth;
        savePip.classList.add('is-pulsing');
      }
    };

    const updateTrigger = (id) => {
      const preset = id && id !== 'custom' ? presetMap[id] : null;
      triggerLabel.textContent = preset ? preset.name : 'Custom';
      if (preset) {
        triggerThumb.style.display = '';
        drawThumb(triggerThumb, { ...defaults, ...(preset.params || {}) }, system, THUMB_SIZE);
      } else {
        triggerThumb.style.display = 'none';
      }
      updateSavePip(id);
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
      // Re-derive divergence + rebuild on open so the list always reflects the
      // latest params (the "Custom" row appears/disappears and the right option
      // is highlighted). rebuildPopover stamps is-active from activeId.
      activeId = computeActiveId();
      updateTrigger(activeId);
      rebuildPopover();
      popover.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      outsideHandler = (e) => { if (!wrap.contains(e.target)) close(); };
      document.addEventListener('pointerdown', outsideHandler, true);
    };

    // Live divergence refresh — called after every param edit (via app.regen →
    // the panel's registered hook). Recomputes whether the layer still matches
    // its preset; the instant a param differs, the trigger flips to "Custom",
    // and the instant it's restored to the exact value it flips back. Cheap: a
    // param diff per call; the popover only re-renders when it's actually open.
    const refresh = () => {
      const fresh = computeActiveId();
      if (fresh === activeId) return;
      activeId = fresh;
      updateTrigger(activeId);
      if (!popover.hidden) rebuildPopover();
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
          drawThumb(thumb, params, system, THUMB_SIZE);
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
      // Only shown once the layer has diverged from its named preset (the user
      // edited a param away from the preset). On a clean preset it stays hidden,
      // so the gallery reads as a list of named looks, not a deselect affordance.
      if (activeId === 'custom') {
        const customOpt = makeOption('custom', 'Custom', null, false);
        customOpt.addEventListener('click', () => {
          activeId = 'custom';
          updateTrigger('custom');
          close();
          onApply('custom');
        });
        popover.appendChild(customOpt);
      }

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
              const params = stripParams(matchLayer.params);
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

    // ── Save flow ───────────────────────────────────────────────────────────────
    // Classify where the layer's look came from (recoverable for free: the layer
    // keeps its last *named* preset id even while diverged). Drives the modal's
    // Save-as-new / Update fork and the name heuristic basis.
    const classifyOrigin = () => {
      const claimed = layer && layer.params ? layer.params.preset : undefined;
      if (!claimed || claimed === 'custom') return { kind: 'scratch', preset: null };
      const user = (system ? loadUserPresets(system) : []).find((p) => p.id === claimed);
      if (user) return { kind: 'user', preset: { id: user.id, name: user.name, params: user.params } };
      const builtIn = builtInPresets.find((p) => p.id === claimed);
      if (builtIn) return { kind: 'builtin', preset: { id: builtIn.id, name: builtIn.name, params: builtIn.params } };
      return { kind: 'scratch', preset: null };
    };

    const toast = (message, variant = 'success', onClick) => {
      const T = window.Vectura && window.Vectura.UI && window.Vectura.UI.overlays && window.Vectura.UI.overlays.Toast;
      if (T && typeof T.show === 'function') T.show({ message, variant, onClick, duration: 6000 });
    };

    // Developer-mode repo export: a bundler-exact single-layer .vectura whose
    // filename slug matches scripts/build-user-presets.js so the resulting id is
    // deterministic. Auto-routed to user-presets/<system>/ by layer type.
    const downloadRepoPreset = (name, params) => {
      try {
        const V = window.Vectura || {};
        const doc = { type: 'vectura', version: V.VERSION, name, layers: [{ type: system, params: { ...params } }] };
        const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${slugify(name) || system}.vectura`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (_) { /* download blocked */ }
    };

    const handleSave = ({ name, mode, destination }) => {
      const cleanName = (name || '').trim();
      const params = stripParams(layer.params);

      if (destination === 'repo') {
        downloadRepoPreset(cleanName || system, layer.params);
        toast(`Saved "${cleanName}" — move into user-presets/${system}/ then commit (pre-commit auto-bundles).`, 'info');
        return;
      }

      const prevPresetId = layer.params.preset;
      if (typeof opts.pushHistory === 'function') opts.pushHistory();

      const origin = classifyOrigin();
      if (mode === 'update' && origin.preset) {
        const list = loadUserPresets(system);
        const idx = list.findIndex((p) => p.id === origin.preset.id);
        if (idx >= 0) {
          const prior = { ...list[idx], params: { ...list[idx].params } };
          list[idx] = { ...list[idx], name: cleanName || list[idx].name, params };
          saveUserPresets(system, list);
          activeId = list[idx].id;
          layer.params.preset = list[idx].id;
          rebuildPopover();
          updateTrigger(activeId);
          toast(`Updated "${list[idx].name}" · Undo`, 'success', () => {
            const cur = loadUserPresets(system);
            const j = cur.findIndex((p) => p.id === prior.id);
            if (j >= 0) cur[j] = prior;
            saveUserPresets(system, cur);
            layer.params.preset = prior.id;
            activeId = computeActiveId();
            rebuildPopover();
            updateTrigger(activeId);
          });
          return;
        }
        // origin vanished → fall through to save-as-new.
      }

      // Save as new (default; also the update fallback).
      const id = `user-${system}-${Date.now()}`;
      const newPreset = { id, name: cleanName, preset_system: system, group: 'User', params };
      saveUserPresets(system, [...loadUserPresets(system), newPreset]);
      activeId = id;
      layer.params.preset = id;
      rebuildPopover();
      updateTrigger(activeId);
      toast(`Saved "${cleanName}" to User presets · Undo`, 'success', () => {
        saveUserPresets(system, loadUserPresets(system).filter((p) => p.id !== id));
        layer.params.preset = prevPresetId;
        activeId = computeActiveId();
        rebuildPopover();
        updateTrigger(activeId);
      });
    };

    const openSaveModal = () => {
      const M = window.Vectura && window.Vectura.UI && window.Vectura.UI.PresetSaveModal;
      if (!M || typeof M.open !== 'function' || !system || !layer) return;
      const origin = classifyOrigin();
      const basis = origin.preset ? { ...defaults, ...(origin.preset.params || {}) } : defaults;
      const existingNames = (loadUserPresets(system) || []).map((p) => p.name);
      const NH = window.Vectura && window.Vectura.PresetNameHeuristics;
      const suggestedName = NH && typeof NH.suggestName === 'function'
        ? NH.suggestName(system, layer.params, { basis, existingNames })
        : 'My Preset';
      M.open({
        layerType: system,
        params: layer.params,
        suggestedName,
        origin,
        devMode: !!(window.Vectura && window.Vectura.SETTINGS && window.Vectura.SETTINGS.devMode === true),
        drawThumb,
        onConfirm: handleSave,
      });
    };

    savePip.addEventListener('click', openSaveModal);

    // ── Init ──────────────────────────────────────────────────────────────────
    rebuildPopover();
    updateTrigger(activeId);
    target.appendChild(wrap);
    return { el: wrap, refresh, openSave: openSaveModal };
  };

  UI.PresetGallery = create;
  // Backward-compat alias — existing call sites still reference this name.
  UI.HarmonographPresetGallery = create;
})();
