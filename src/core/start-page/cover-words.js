/**
 * Start Page cover word logic — window.Vectura.StartPageCoverWords. Pure: no DOM, no storage.
 *
 *   choices(prefs)          -> [{ id, label, word, disabled, hint, selected }]   (the word picker's rows)
 *   resolve(prefs)          -> { id, word, fellBack }                            (the word the cover sets)
 *   letters(word)           -> [{ ch, k }]                                       (spaces skipped, k = letter index)
 *   assignArts(chars, arts) -> art per letter (an art with coverSlot n takes letter n; otherwise works before studio picks; thin letters get the densest unused piece; reuse only when works + picks run out)
 *   nameParts(name)         -> { first, last, full }
 *
 * `prefs` is the startPage preference object (coverWord, customWord, name). The name is a preference only.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const FALLBACK = 'Vectura';
  const THIN = /[iljtfr1I!|]/;
  const ROWS = Object.freeze([
    { id: 'vectura', label: 'Vectura', word: 'Vectura' },
    { id: 'vectura-studio', label: 'Vectura Studio', word: 'Vectura Studio' },
    { id: 'last-name', label: 'Last name', needsName: true },
    { id: 'first-last', label: 'First + Last', needsName: true },
    { id: 'studies', label: 'Studies', word: 'Studies' },
    { id: 'botanicals', label: 'Botanicals', word: 'Botanicals' },
    { id: 'experiments', label: 'Experiments', word: 'Experiments' },
    { id: 'custom', label: 'Custom…', custom: true },
  ]);

  const nameParts = (name) => {
    const tokens = String(name || '').trim().split(/\s+/).filter(Boolean);
    return { first: tokens[0] || '', last: tokens.length ? tokens[tokens.length - 1] : '', full: tokens.join(' ') };
  };

  const wordFor = (row, prefs) => {
    const p = prefs || {};
    if (row.needsName) {
      const n = nameParts(p.name);
      return row.id === 'last-name' ? n.last : n.full;
    }
    if (row.custom) return String(p.customWord || '').trim();
    return row.word;
  };

  const resolve = (prefs) => {
    const p = prefs || {};
    const row = ROWS.find((r) => r.id === p.coverWord) || ROWS[0];
    const word = wordFor(row, p);
    if (!word) return { id: row.id, word: FALLBACK, fellBack: true };
    return { id: row.id, word, fellBack: false };
  };

  const choices = (prefs) => {
    const p = prefs || {};
    const selected = (ROWS.find((r) => r.id === p.coverWord) || ROWS[0]).id;
    return ROWS.map((r) => {
      const word = wordFor(r, p);
      const disabled = Boolean(r.needsName && !word);
      return { id: r.id, label: r.label, word: word || '', disabled, hint: disabled ? 'Add name' : '', selected: r.id === selected, custom: Boolean(r.custom) };
    });
  };

  const letters = (word) => {
    const out = [];
    let k = 0;
    Array.from(String(word || '')).forEach((ch) => { if (ch.trim()) out.push({ ch, k: k++ }); });
    return out;
  };

  const assignArts = (chars, arts) => {
    const list = Array.isArray(arts) ? arts : [];
    if (!list.length) return [];
    const used = new Set();
    // Pieces that carry a coverSlot belong to that letter (the default word's hand-set run) and are not up for grabs earlier.
    const slotted = list.filter((a) => Number.isInteger(a.coverSlot) && a.coverSlot < (chars || []).length);
    const reserved = new Set(slotted.map((a) => a.id));
    return (chars || []).map((ch, k) => {
      const own = slotted.find((a) => a.coverSlot === k && !used.has(a.id));
      if (own) { used.add(own.id); return own; }
      let free = list.filter((a) => !used.has(a.id) && !reserved.has(a.id));
      if (!free.length) free = list.filter((a) => !used.has(a.id));
      // Works first, then studio picks top the cover up; a piece is reused only once both run out.
      const works = free.filter((a) => a.kind !== 'pick');
      if (works.length) free = works;
      let pick;
      if (!free.length) pick = list[k % list.length];
      else if (THIN.test(ch)) pick = free.reduce((best, a) => ((a.bytes || 0) > (best.bytes || 0) ? a : best), free[0]);
      else pick = free[0];
      used.add(pick.id);
      return pick;
    });
  };

  Vectura.StartPageCoverWords = Object.freeze({ FALLBACK, choices, resolve, letters, assignArts, nameParts });
})();
