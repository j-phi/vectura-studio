/*
 * Vectura Studio — Preset Save modal.
 *
 * The "name your preset" dialog opened from the gallery's dirty-state save pip
 * (and Cmd/Ctrl+S). Built on the UI.overlays.Modal primitive (focus trap, Esc,
 * focus restore). Shows a live thumbnail of the look being saved, a pre-filled
 * editable name, and — when the layer was edited away from one of the user's
 * own presets — a [Save as new] / [Update "<name>"] fork. When Developer Mode
 * is on it also offers a "Project repo (download)" destination for authoring
 * built-in defaults.
 *
 * The modal only COLLECTS intent; the gallery owns persistence and undo. On
 * commit it invokes opts.onConfirm({ name, mode, destination }) and closes.
 *
 * Usage:
 *   Vectura.UI.PresetSaveModal.open({
 *     layerType, params, suggestedName, origin, devMode, drawThumb, onConfirm
 *   });
 *
 * origin: { kind: 'user' | 'builtin' | 'scratch', preset: {id,name,group}|null }
 *
 * Developer Mode adds two authoring controls: an "Overwrite existing…" picker
 * that can target ANY preset for the algorithm (not just the user's own), and a
 * Category control (existing group or a freshly-typed one). The commit payload
 * then carries { name, mode, destination, targetId, group }.
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});

  const PREVIEW_SIZE = 96;

  const open = (opts = {}) => {
    const overlays = UI.overlays || {};
    if (typeof overlays.Modal !== 'function') return null;

    const host = opts.host || document.body;
    const layerType = opts.layerType;
    const params = opts.params || {};
    const origin = opts.origin || { kind: 'scratch', preset: null };
    const canUpdate = (origin.kind === 'user' || origin.kind === 'builtin') && origin.preset && origin.preset.id;
    const devMode = opts.devMode === true;
    const drawThumb = typeof opts.drawThumb === 'function' ? opts.drawThumb : null;
    const onConfirm = typeof opts.onConfirm === 'function' ? opts.onConfirm : () => {};

    // Dev-mode authoring data: the full preset list (for the overwrite picker)
    // and the set of existing categories (for the Category control).
    const DEFAULT_GROUPS = ['Classic', 'Geometric', 'Organic', 'Complex', 'Evolving', 'User'];
    const allPresets = (Array.isArray(opts.presets) ? opts.presets : [])
      .filter((p) => p && p.id && p.id !== 'custom');
    const groupList = (Array.isArray(opts.groups) && opts.groups.length ? opts.groups : DEFAULT_GROUPS).slice();
    const presetById = (id) => allPresets.find((p) => p.id === id) || null;
    const groupOf = (id) => { const p = presetById(id); return (p && p.group) || 'User'; };

    // Live state the footer reads on commit.
    let mode = 'new'; // 'new' | 'update'
    let destination = devMode ? 'repo' : 'user'; // 'user' | 'repo'
    // The preset that 'update' overwrites. Non-dev: only the user's own origin.
    // Dev: any preset (defaults to the origin, else the first in the library).
    let targetId = (origin.preset && origin.preset.id) || (devMode && allPresets[0] ? allPresets[0].id : null);
    // Category for the saved preset (dev-mode only control; 'User' otherwise).
    // Save-as-new defaults to the origin's category in dev, else 'User'; switching
    // to Overwrite adopts the target's category (see the mode buttons below).
    const newGroupDefault = devMode ? ((origin.preset && origin.preset.group) || 'User') : 'User';
    let group = newGroupDefault;
    let nameInput = null;
    let saveBtn = null;
    let catSelect = null;
    let catInput = null;
    const NEW_CAT = '__new__';

    // Reflect a group string into the Category control (select + optional custom
    // input) and into committed state.
    const setGroup = (g) => {
      group = g || 'User';
      if (!catSelect) return;
      const known = groupList.includes(group);
      catSelect.value = known ? group : NEW_CAT;
      if (catInput) {
        catInput.hidden = known;
        if (!known) catInput.value = group;
      }
    };

    const targetName = () => {
      const p = presetById(targetId);
      return (p && p.name) || (canUpdate ? origin.preset.name : 'this preset');
    };

    const syncSaveEnabled = () => {
      if (!saveBtn) return;
      const empty = !nameInput || !nameInput.value.trim();
      // Overwrite mode keeps a name, so an empty field still saves; but it needs
      // a target. Save-as-new needs a non-empty name.
      saveBtn.disabled = mode === 'update' ? !targetId : empty;
    };

    const commit = (modalApi) => {
      const name = (nameInput && nameInput.value.trim()) || (mode === 'update' ? targetName() : '');
      if (mode === 'new' && !name) return;
      if (mode === 'update' && !targetId) return;

      const doSave = () => {
        onConfirm({ name, mode, destination, targetId, group });
        modalApi.close();
      };

      if (mode === 'update' && typeof overlays.Dialog === 'function') {
        // Overwriting an existing preset is destructive — confirm first.
        const dlg = overlays.Dialog(host, {
          title: 'Overwrite preset?',
          message: `Replace "${targetName()}" with the current settings? The previous version will be overwritten. (Undo is available right after.)`,
          confirmLabel: 'Overwrite',
          cancelLabel: 'Cancel',
          destructive: true,
          onConfirm: () => { dlg.destroy(); doSave(); },
          onCancel: () => { dlg.destroy(); },
        });
        dlg.open();
        return;
      }
      doSave();
    };

    let modalApi = null;

    const render = (body) => {
      body.classList.add('preset-save-body');

      // ── Live preview ────────────────────────────────────────────────────────
      const previewWrap = document.createElement('div');
      previewWrap.className = 'preset-save-preview';
      const canvas = document.createElement('canvas');
      canvas.className = 'preset-save-preview-thumb';
      canvas.setAttribute('aria-hidden', 'true');
      previewWrap.appendChild(canvas);
      body.appendChild(previewWrap);
      if (drawThumb) {
        try { drawThumb(canvas, params, layerType, PREVIEW_SIZE); } catch (_) { /* no-op ctx */ }
      }

      // ── Name field ────────────────────────────────────────────────────────────
      const nameRow = document.createElement('div');
      nameRow.className = 'preset-save-field';
      const nameLbl = document.createElement('label');
      nameLbl.className = 'preset-save-label';
      nameLbl.textContent = 'Name';
      nameLbl.setAttribute('for', 'preset-save-name');
      nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.id = 'preset-save-name';
      nameInput.className = 'preset-save-input';
      nameInput.value = opts.suggestedName || '';
      nameInput.autocomplete = 'off';
      nameInput.spellcheck = false;
      nameRow.appendChild(nameLbl);
      nameRow.appendChild(nameInput);
      body.appendChild(nameRow);

      nameInput.addEventListener('input', syncSaveEnabled);
      nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(modalApi); }
      });

      // ── Save-as-new / Overwrite fork ──────────────────────────────────────────
      // Non-dev: a fork appears only when working from one of the user's OWN
      // presets ("Update <name>"). Dev: the fork is always available and the
      // overwrite target is ANY preset in the library, chosen via a picker.
      const showOverwrite = devMode ? allPresets.length > 0 : canUpdate;
      let pickerRow = null;
      if (showOverwrite) {
        const seg = document.createElement('div');
        seg.className = 'preset-save-seg seg-ctrl';
        seg.setAttribute('role', 'group');
        seg.setAttribute('aria-label', 'Save mode');
        const overwriteLabel = devMode ? 'Overwrite existing' : `Update "${origin.preset.name}"`;
        const mk = (value, text) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = `seg-opt${value === mode ? ' active' : ''}`;
          b.dataset.mode = value;
          b.textContent = text;
          b.addEventListener('click', () => {
            mode = value;
            seg.querySelectorAll('.seg-opt').forEach((el) => el.classList.toggle('active', el.dataset.mode === value));
            if (pickerRow) pickerRow.hidden = mode !== 'update';
            // Overwrite adopts the target's name + category; Save-as-new restores
            // the freshly-suggested auto-name. Either stays fully editable.
            if (mode === 'update') {
              if (nameInput) nameInput.value = targetName();
              setGroup(groupOf(targetId));
            } else {
              if (nameInput) nameInput.value = opts.suggestedName || '';
              setGroup(newGroupDefault);
            }
            if (nameInput) { try { nameInput.focus(); nameInput.select(); } catch (_) { /* jsdom */ } }
            syncSaveEnabled();
          });
          return b;
        };
        seg.appendChild(mk('new', 'Save as new'));
        seg.appendChild(mk('update', overwriteLabel));
        body.appendChild(seg);

        // Dev-mode overwrite-target picker (grouped by category).
        if (devMode) {
          pickerRow = document.createElement('div');
          pickerRow.className = 'preset-save-field';
          pickerRow.hidden = mode !== 'update';
          const pl = document.createElement('label');
          pl.className = 'preset-save-label';
          pl.textContent = 'Overwrite which preset';
          pl.setAttribute('for', 'preset-save-target');
          const ps = document.createElement('select');
          ps.id = 'preset-save-target';
          ps.className = 'ctrl-sel preset-save-target';
          const orderedGroups = [...groupList, ...[...new Set(allPresets.map((p) => p.group))].filter((g) => !groupList.includes(g))];
          orderedGroups.forEach((g) => {
            const inG = allPresets.filter((p) => p.group === g);
            if (!inG.length) return;
            const og = document.createElement('optgroup');
            og.label = g;
            inG.forEach((p) => {
              const o = document.createElement('option');
              o.value = p.id;
              o.textContent = p.name;
              og.appendChild(o);
            });
            ps.appendChild(og);
          });
          if (targetId) ps.value = targetId;
          ps.addEventListener('change', () => {
            targetId = ps.value;
            if (nameInput) nameInput.value = targetName();
            setGroup(groupOf(targetId));
            syncSaveEnabled();
          });
          pickerRow.appendChild(pl);
          pickerRow.appendChild(ps);
          body.appendChild(pickerRow);
        }
      }

      // ── Category (Developer Mode only) ───────────────────────────────────────
      // Existing group or a freshly-typed one. Sets the saved preset's group.
      if (devMode) {
        const catRow = document.createElement('div');
        catRow.className = 'preset-save-field';
        const cl = document.createElement('label');
        cl.className = 'preset-save-label';
        cl.textContent = 'Category';
        cl.setAttribute('for', 'preset-save-cat');
        catSelect = document.createElement('select');
        catSelect.id = 'preset-save-cat';
        catSelect.className = 'ctrl-sel preset-save-cat';
        groupList.forEach((g) => {
          const o = document.createElement('option');
          o.value = g;
          o.textContent = g;
          catSelect.appendChild(o);
        });
        const newOpt = document.createElement('option');
        newOpt.value = NEW_CAT;
        newOpt.textContent = '+ New category…';
        catSelect.appendChild(newOpt);
        catInput = document.createElement('input');
        catInput.type = 'text';
        catInput.id = 'preset-save-cat-new';
        catInput.className = 'preset-save-input preset-save-cat-new';
        catInput.placeholder = 'New category name';
        catInput.autocomplete = 'off';
        catInput.spellcheck = false;
        catInput.hidden = true;
        catSelect.addEventListener('change', () => {
          if (catSelect.value === NEW_CAT) {
            catInput.hidden = false;
            group = catInput.value.trim() || 'User';
            try { catInput.focus(); } catch (_) { /* jsdom */ }
          } else {
            catInput.hidden = true;
            group = catSelect.value;
          }
        });
        catInput.addEventListener('input', () => {
          if (catSelect.value === NEW_CAT) group = catInput.value.trim() || 'User';
        });
        catRow.appendChild(cl);
        catRow.appendChild(catSelect);
        catRow.appendChild(catInput);
        body.appendChild(catRow);
        setGroup(group); // initialize the selection to the resolved default
      }

      // ── Destination (Developer Mode only) ────────────────────────────────────
      if (devMode) {
        const destRow = document.createElement('div');
        destRow.className = 'preset-save-field';
        const destLbl = document.createElement('label');
        destLbl.className = 'preset-save-label';
        destLbl.textContent = 'Destination';
        destLbl.setAttribute('for', 'preset-save-dest');
        const destSel = document.createElement('select');
        destSel.id = 'preset-save-dest';
        destSel.className = 'ctrl-sel preset-save-dest';
        destSel.innerHTML = `
          <option value="repo">Repo (user-presets/ folder)</option>
          <option value="user">This browser only</option>
        `;
        destSel.value = destination;
        destSel.addEventListener('change', () => { destination = destSel.value; });
        destRow.appendChild(destLbl);
        destRow.appendChild(destSel);
        body.appendChild(destRow);
      }

      // ── Persistence microcopy ────────────────────────────────────────────────
      const note = document.createElement('p');
      note.className = 'preset-save-note';
      note.textContent = devMode
        ? 'Repo writes to the connected user-presets/ folder (or downloads a .vectura to drop in); run npm run user-presets:bundle to commit. Always mirrored to this browser too.'
        : 'Saved in this browser.';
      body.appendChild(note);

      // ── Footer ────────────────────────────────────────────────────────────────
      const footer = document.createElement('footer');
      footer.className = 'preset-save-footer';
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'hdr-btn';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', () => modalApi.close());
      saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'add-btn preset-save-confirm';
      saveBtn.textContent = 'Save';
      saveBtn.addEventListener('click', () => commit(modalApi));
      // On touch the Save button is pinned above the field via CSS order so the
      // on-screen keyboard never covers it.
      footer.appendChild(cancelBtn);
      footer.appendChild(saveBtn);
      body.appendChild(footer);

      syncSaveEnabled();
    };

    modalApi = overlays.Modal(host, {
      title: 'Save Preset',
      keyboard: true,
      dismissOnBackdrop: true,
      render,
      onOpen: () => {
        // Pre-select the auto-name so typing replaces it wholesale.
        if (nameInput) { try { nameInput.focus(); nameInput.select(); } catch (_) { /* jsdom */ } }
      },
      onClose: () => { if (modalApi) modalApi.destroy(); },
    });
    modalApi.open();
    return modalApi;
  };

  UI.PresetSaveModal = { open };
})();
