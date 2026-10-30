/**
 * Start Page cover word picker — window.Vectura.UI.StartPageWordPicker.
 *
 * The pen-icon button ("Choose the cover word") opens a small menu of the words the cover can set. Rows come from
 * StartPageCoverWords.choices(prefs); name-based rows are disabled with "Add name" until a name exists; "Custom…"
 * swaps in an inline input. Keyboard: arrows / Home / End move, Enter / Space choose, Esc closes (focus returns
 * to the button), a click outside closes. The caller sanitizes and persists (onPick(id, customWord?)).
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  const create = ({ button, prefs, onPick }) => {
    const { h } = Vectura.StartPageDom;
    const Words = () => Vectura.StartPageCoverWords;
    let menu = null;
    let open = false;

    const items = () => [...(menu ? menu.querySelectorAll('[role="menuitemradio"]:not([aria-disabled="true"])') : [])];
    const focusItem = (i) => { const list = items(); if (list.length) list[(i + list.length) % list.length].focus(); };

    const close = (refocus = true) => {
      if (!open) return;
      open = false;
      menu.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      if (refocus) button.focus();
    };

    const renderRows = () => {
      menu.textContent = '';
      Words().choices(prefs()).forEach((c) => {
        const row = h('button', {
          type: 'button', role: 'menuitemradio', class: 'sp-wp-item', 'data-word': c.id, 'aria-checked': String(c.selected),
          'aria-disabled': c.disabled ? 'true' : null, tabindex: '-1',
        }, h('span', { class: 'sp-wp-label', text: c.label }),
        c.disabled ? h('em', { class: 'sp-wp-hint', text: c.hint }) : (c.word && !c.custom ? h('span', { class: 'sp-wp-word', text: c.word }) : null));
        menu.append(row);
      });
    };

    const customForm = () => {
      const row = menu.querySelector('[data-word="custom"]');
      if (!row) return;
      const max = Vectura.START_PAGE?.LIMITS?.textMax?.customWord || 24;
      const input = h('input', { type: 'text', class: 'sp-wp-input', maxlength: String(max), 'aria-label': 'Custom cover word', placeholder: 'Your word', value: prefs().customWord || '' });
      const apply = h('button', { type: 'button', class: 'sp-wp-apply', text: 'Set word' });
      const form = h('div', { class: 'sp-wp-form' }, input, apply);
      row.replaceWith(form);
      const commit = () => { const v = input.value; close(true); onPick('custom', v); };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); commit(); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
        else e.stopPropagation();
      });
      apply.addEventListener('click', commit);
      input.focus();
    };

    const build = () => {
      menu = h('div', { id: 'sp-word-menu', class: 'sp-wp', role: 'menu', 'aria-label': 'Cover word', hidden: true });
      menu.addEventListener('click', (e) => {
        const t = e.target.closest && e.target.closest('[role="menuitemradio"]');
        if (!t || !menu.contains(t)) return;
        if (t.getAttribute('aria-disabled') === 'true') return;
        if (t.dataset.word === 'custom') { customForm(); return; }
        close(true);
        onPick(t.dataset.word);
      });
      menu.addEventListener('keydown', (e) => {
        const list = items();
        const i = list.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') { e.preventDefault(); focusItem(i + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); focusItem(i - 1); }
        else if (e.key === 'Home') { e.preventDefault(); focusItem(0); }
        else if (e.key === 'End') { e.preventDefault(); focusItem(-1); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
        else if (e.key === 'Tab') close(false);
      });
      button.parentNode.append(menu);
      document.addEventListener('pointerdown', (e) => {
        if (open && !menu.contains(e.target) && !button.contains(e.target)) close(false);
      }, true);
    };

    const show = () => {
      if (!menu) build();
      renderRows();
      open = true;
      menu.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      const sel = menu.querySelector('[aria-checked="true"]:not([aria-disabled="true"])');
      (sel || items()[0])?.focus();
    };

    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', 'sp-word-menu');
    button.addEventListener('click', () => (open ? close(true) : show()));
    button.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); show(); } });

    return { close, isOpen: () => open, sync: () => { if (open) renderRows(); } };
  };

  UI.StartPageWordPicker = { create };
})();
