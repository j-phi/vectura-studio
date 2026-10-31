/**
 * Start Page Developer Mode tools — window.Vectura.UI.StartPagePlatesDev.
 *
 * The curator's bar above the Plates section while Developer Mode (SETTINGS.devMode, the Document Setup switch) is on:
 * a persistent "Developer Mode" indicator, Add plate from a bundled preset, Export defaults, Reset to shipped and
 * Exit Developer Mode. Built only while Developer Mode is on; with it off nothing here exists in the DOM.
 *
 *   create({ draft, presets(), onExit(), toast(msg, variant, action?) }) -> { el, sync(info), openPicker(), openExport(),
 *                                                                              closeDialogs(), destroy() }
 *     draft    the StartPageExamplePlates store (plates(), isDirty(), add(presetId), resetToShipped(), undoReset(token))
 *     sync     { mode, count } refreshes the status line (a page mode other than Curated cannot pin colorways)
 *   Export defaults: the exact EXAMPLE_PLATES region (StartPageExamplePlates.serialize). With the File System Access API
 *   (Chrome) "Write to start-page-picks.js" replaces that region in the file you pick; otherwise Download or Copy.
 *   Afterwards run `npm run start-page:picks` to pre-render thumbnails (until then new plates render live).
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  const create = (ctx) => {
    const { h } = Vectura.StartPageDom;
    const Model = () => Vectura.StartPageExamplePlates;
    let fileHandle = null;
    let dialog = null;

    const status = h('span', { class: 'sp-dev-status', role: 'status', 'aria-live': 'polite' });
    const btn = (act, label, title) => h('button', { type: 'button', class: 'sp-pl-btn sp-dev-btn', 'data-dev-act': act, title: title || null, text: label });
    const bar = h('div', { class: 'sp-dev', id: 'sp-dev', role: 'region', 'aria-label': 'Developer Mode: example plates' },
      h('span', { class: 'sp-dev-badge', text: 'Developer Mode' }),
      h('span', { class: 'sp-dev-copy', text: 'Editing the example plates that ship with Vectura Studio. Edits are a draft saved in this browser until you export.' }),
      h('span', { class: 'sp-dev-tools' },
        btn('add', 'Add from preset…', 'Add a plate from any bundled preset'),
        btn('export', 'Export defaults…', 'Generate the EXAMPLE_PLATES block for src/config/start-page-picks.js'),
        btn('reset', 'Reset to shipped', 'Throw the draft away and show the shipped examples'),
        btn('exit', 'Exit Developer Mode', 'Turn Developer Mode off (Document Setup > Contributor / Presets)')),
      status);

    const sync = (info = {}) => {
      const dirty = ctx.draft.isDirty();
      const n = ctx.draft.plates().length;
      const note = info.mode && info.mode !== 'curated' ? ' Colorway pins are edited in Curated mode.' : '';
      status.textContent = `${n} plate${n === 1 ? '' : 's'} · ${dirty ? 'draft differs from shipped' : 'matches shipped'}.${note}`;
      bar.dataset.dirty = String(dirty);
      const reset = bar.querySelector('[data-dev-act="reset"]');
      if (reset) reset.disabled = !dirty;
    };

    /* ------------------------------------------------------------------ dialogs */
    const closeDialogs = (refocus) => {
      if (!dialog) return;
      const d = dialog; dialog = null;
      d.el.remove();
      if (refocus && d.opener && d.opener.isConnected) { try { d.opener.focus({ preventScroll: true }); } catch (_) { /* noop */ } }
    };
    const openDialog = (kind, title, body, opener) => {
      closeDialogs(false);
      const el = h('div', { class: 'sp-dev-dlg', role: 'dialog', 'aria-label': title, 'data-dev-dialog': kind },
        h('div', { class: 'sp-dev-dlg-h' }, h('b', { text: title }), h('button', { type: 'button', class: 'sp-pl-btn', 'data-dev-close': '', text: 'Close' })),
        body);
      el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeDialogs(true); } });
      el.querySelector('[data-dev-close]').addEventListener('click', () => closeDialogs(true));
      bar.after(el);
      dialog = { el, opener };
      return el;
    };

    // Add: a filterable list over Vectura.PRESETS.
    const openPicker = () => {
      const opener = bar.querySelector('[data-dev-act="add"]');
      const all = (typeof ctx.presets === 'function' ? ctx.presets() : []).filter((p) => p && p.id);
      const input = h('input', { type: 'search', class: 'sp-dev-search', 'aria-label': 'Filter bundled presets', placeholder: 'Filter ' + all.length + ' bundled presets by name, algorithm or id', autocomplete: 'off', spellcheck: 'false' });
      const list = h('div', { class: 'sp-dev-list', role: 'listbox', 'aria-label': 'Bundled presets' });
      const MAX = 80;
      const label = (p) => `${p.name || p.id}`;
      const paint = () => {
        const f = input.value.trim().toLowerCase();
        const hits = all.filter((p) => !f || `${p.name || ''} ${p.preset_system || ''} ${p.id}`.toLowerCase().includes(f));
        list.textContent = '';
        hits.slice(0, MAX).forEach((p) => list.append(h('button', { type: 'button', role: 'option', class: 'sp-dev-opt', 'data-preset-id': p.id },
          h('b', { text: label(p) }), h('span', { text: `${p.preset_system || ''} · ${p.id}` }))));
        list.append(h('p', { class: 'sp-dev-more', text: hits.length > MAX ? `Showing ${MAX} of ${hits.length}. Type to narrow.` : `${hits.length} preset${hits.length === 1 ? '' : 's'}` }));
      };
      input.addEventListener('input', paint);
      list.addEventListener('click', async (e) => {
        const b = e.target.closest && e.target.closest('[data-preset-id]');
        if (!b) return;
        const p = all.find((x) => x.id === b.dataset.presetId);
        closeDialogs(true);
        if (p && typeof ctx.onAdd === 'function') await ctx.onAdd(p);
      });
      const el = openDialog('picker', 'Add a plate from a preset', h('div', { class: 'sp-dev-dlg-b' }, input, list), opener);
      paint();
      input.focus();
      return el;
    };

    // Export: the EXAMPLE_PLATES region, written back or handed over.
    const exportText = () => Model().serialize(ctx.draft.plates());
    const copyText = async (text) => {
      try { if (G.navigator && G.navigator.clipboard && G.navigator.clipboard.writeText) { await G.navigator.clipboard.writeText(text); return true; } } catch (_) { /* fall through */ }
      try {
        const ta = h('textarea', { 'aria-hidden': 'true', style: 'position:fixed;opacity:0;pointer-events:none' }); ta.value = text;
        G.document.body.append(ta); ta.select();
        const ok = G.document.execCommand && G.document.execCommand('copy'); ta.remove();
        return !!ok;
      } catch (_) { return false; }
    };
    // The one shared save path (TUX-054): never an inline anchor or revokeObjectURL.
    const download = async (text) => {
      try {
        const blob = new G.Blob([text + '\n'], { type: 'text/javascript' });
        const result = await G.Vectura.Download.saveBlob(blob, 'example-plates.snippet.js');
        return result !== 'cancelled';
      } catch (_) { return false; }
    };
    const writeBack = async () => {
      const pick = G.showOpenFilePicker;
      if (typeof pick !== 'function') throw new Error('This browser cannot write files. Use Download or Copy.');
      if (!fileHandle) {
        const handles = await pick.call(G, { multiple: false, types: [{ description: 'start-page-picks.js', accept: { 'text/javascript': ['.js'] } }] });
        fileHandle = handles && handles[0];
        if (!fileHandle) return null;
      }
      if (typeof fileHandle.requestPermission === 'function') {
        const perm = await fileHandle.requestPermission({ mode: 'readwrite' });
        if (perm !== 'granted') { fileHandle = null; throw new Error('Write permission was not granted.'); }
      }
      const text = await (await fileHandle.getFile()).text();
      let next;
      try { next = Model().replaceRegion(text, exportText()); } catch (err) { fileHandle = null; throw err; }
      const w = await fileHandle.createWritable();
      await w.write(next);
      await w.close();
      return fileHandle.name || 'start-page-picks.js';
    };
    const openExport = () => {
      const opener = bar.querySelector('[data-dev-act="export"]');
      const text = exportText();
      const canWrite = typeof G.showOpenFilePicker === 'function';
      const out = h('textarea', { class: 'sp-dev-out', readonly: true, rows: '12', spellcheck: 'false', 'aria-label': 'EXAMPLE_PLATES block' });
      out.value = text;
      const note = h('p', { class: 'sp-dev-note', role: 'status', 'aria-live': 'polite', text: '' });
      const say = (m) => { note.textContent = m; };
      const write = canWrite ? h('button', { type: 'button', class: 'sp-pl-btn sp-dev-primary', 'data-dev-do': 'write', text: 'Write to start-page-picks.js' }) : null;
      const body = h('div', { class: 'sp-dev-dlg-b' },
        h('p', { class: 'sp-dev-help' }, canWrite
          ? 'Write replaces the region between the <example-plates:begin> and <example-plates:end> markers in the file you pick (src/config/start-page-picks.js). Or download or copy the block and paste it in yourself.'
          : 'This browser cannot write to files. Download or copy the block and paste it between the <example-plates:begin> and <example-plates:end> markers in src/config/start-page-picks.js.'),
        out,
        h('div', { class: 'sp-dev-row' }, write,
          h('button', { type: 'button', class: 'sp-pl-btn', 'data-dev-do': 'download', text: 'Download' }),
          h('button', { type: 'button', class: 'sp-pl-btn', 'data-dev-do': 'copy', text: 'Copy' })),
        h('p', { class: 'sp-dev-help' }, 'Then run ', h('code', { text: 'npm run start-page:picks' }), ' to pre-render the thumbnails. Until you do, plates without one render live.'),
        note);
      body.addEventListener('click', async (e) => {
        const b = e.target.closest && e.target.closest('[data-dev-do]');
        if (!b) return;
        const what = b.dataset.devDo;
        if (what === 'copy') say((await copyText(text)) ? 'Copied the block to the clipboard.' : 'Copy was blocked. Select the text and copy it by hand.');
        else if (what === 'download') say((await download(text)) ? 'Downloaded example-plates.snippet.js.' : 'Download failed. Use Copy.');
        else if (what === 'write') {
          try {
            const name = await writeBack();
            if (name) say(`Wrote ${name}. Now run npm run start-page:picks.`);
          } catch (err) {
            if (err && err.name === 'AbortError') return;
            say(`${(err && err.message) || 'Write failed'} Falling back: the block was copied.`);
            await copyText(text);
          }
        }
      });
      const el = openDialog('export', 'Export defaults', body, opener);
      (write || el.querySelector('[data-dev-do]')).focus();
      return el;
    };

    bar.addEventListener('click', async (e) => {
      const b = e.target.closest && e.target.closest('[data-dev-act]');
      if (!b || b.disabled) return;
      const act = b.dataset.devAct;
      if (act === 'add') openPicker();
      else if (act === 'export') openExport();
      else if (act === 'exit') { if (typeof ctx.onExit === 'function') ctx.onExit(); }
      else if (act === 'reset') {
        const token = await ctx.draft.resetToShipped();
        if (typeof ctx.toast === 'function') ctx.toast('Example plates reset to shipped', 'info', { label: 'Undo', onAction: () => ctx.draft.undoReset(token) });
      }
    });

    return { el: bar, sync, openPicker, openExport, closeDialogs: () => closeDialogs(false), destroy() { closeDialogs(false); bar.remove(); } };
  };

  UI.StartPagePlatesDev = { create };
})();
