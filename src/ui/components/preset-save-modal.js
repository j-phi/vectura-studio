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
 * origin: { kind: 'user' | 'builtin' | 'scratch', preset: {id,name}|null }
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
    const canUpdate = origin.kind === 'user' && origin.preset && origin.preset.id;
    const devMode = opts.devMode === true;
    const drawThumb = typeof opts.drawThumb === 'function' ? opts.drawThumb : null;
    const onConfirm = typeof opts.onConfirm === 'function' ? opts.onConfirm : () => {};

    // Live state the footer reads on commit.
    let mode = 'new'; // 'new' | 'update'
    let destination = 'user'; // 'user' | 'repo'
    let nameInput = null;
    let saveBtn = null;

    const syncSaveEnabled = () => {
      if (!saveBtn) return;
      const empty = !nameInput || !nameInput.value.trim();
      // Update mode keeps the existing name, so an empty field still saves.
      saveBtn.disabled = mode === 'new' && empty;
    };

    const commit = (modalApi) => {
      const name = (nameInput && nameInput.value.trim()) || (canUpdate ? origin.preset.name : '');
      if (mode === 'new' && !name) return;

      const doSave = () => {
        onConfirm({ name, mode, destination });
        modalApi.close();
      };

      if (mode === 'update' && typeof overlays.Dialog === 'function') {
        // Overwriting an existing preset is destructive — confirm first.
        const dlg = overlays.Dialog(host, {
          title: 'Update preset?',
          message: `Replace "${origin.preset.name}" with the current settings? Your previous version of this preset will be overwritten. (Undo is available right after.)`,
          confirmLabel: 'Update',
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

      // ── Save-as-new / Update fork (only when working from a user preset) ──────
      if (canUpdate) {
        const seg = document.createElement('div');
        seg.className = 'preset-save-seg seg-ctrl';
        seg.setAttribute('role', 'group');
        seg.setAttribute('aria-label', 'Save mode');
        const mk = (value, text) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = `seg-opt${value === mode ? ' active' : ''}`;
          b.dataset.mode = value;
          b.textContent = text;
          b.addEventListener('click', () => {
            mode = value;
            seg.querySelectorAll('.seg-opt').forEach((el) => el.classList.toggle('active', el.dataset.mode === value));
            // Update keeps the preset's existing name; Save-as-new uses the
            // freshly-suggested auto-name. Either stays fully editable.
            if (nameInput) {
              nameInput.value = value === 'update' ? origin.preset.name : (opts.suggestedName || '');
              try { nameInput.focus(); nameInput.select(); } catch (_) { /* jsdom */ }
            }
            syncSaveEnabled();
          });
          return b;
        };
        seg.appendChild(mk('new', 'Save as new'));
        seg.appendChild(mk('update', `Update "${origin.preset.name}"`));
        body.appendChild(seg);
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
          <option value="user">User presets (this browser)</option>
          <option value="repo">Project repo (download .vectura)</option>
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
        ? 'User presets are saved in this browser. Repo presets download a .vectura for the bundler.'
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
