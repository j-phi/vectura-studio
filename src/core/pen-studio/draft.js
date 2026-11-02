/**
 * Pen Studio draft — window.Vectura.PenStudioDraft. Unsaved tuning of ONE studio
 * pen (pure, no DOM). A draft is { ink:{key:value}, name?, desc? }; every op
 * returns a new draft and never mutates its inputs.
 *
 *   effectiveInk(pen, draft)       saved ink overlaid with the draft (default-valued keys dropped)
 *   valueOf(pen, draft, key)       draft -> saved -> model default
 *   set(draft, key, value)         clamped to the key's limits; non-numbers ignored
 *   keyState(pen, draft, key)      'draft' (differs from saved) | 'saved' | 'default'
 *   isDirty(pen, draft)            any ink value, name or description differs from the saved pen
 *   resetToModel(pen)              draft with every slider key at the model default
 *   commit(doc, penId, draft)      doc with the draft saved (empty name / description fall back)
 *   defaultSaveNewName(pen, draft) draft name when changed, else "<name> (custom)"
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  const S = () => Vectura.PenStudioStore || {};
  const sliders = () => ((Vectura.PEN_STUDIO && Vectura.PEN_STUDIO.SLIDERS) || []);
  const same = (a, b) => Math.abs(a - b) < 1e-9;
  const newDraft = () => ({ ink: {} });
  const inkOf = (draft) => (draft && draft.ink && typeof draft.ink === 'object' ? draft.ink : {});
  const savedValue = (pen, key) => (pen && pen.ink && own(pen.ink, key) && Number.isFinite(pen.ink[key]) ? pen.ink[key] : S().modelDefault(pen, key));

  const valueOf = (pen, draft, key) => {
    const d = inkOf(draft);
    if (own(d, key) && Number.isFinite(d[key])) return d[key];
    return savedValue(pen, key);
  };

  const effectiveInk = (pen, draft) => {
    const merged = Object.assign({}, (pen && pen.ink) || {}, inkOf(draft));
    return S().cleanInk(pen, merged);
  };

  const set = (draft, key, value) => {
    const next = { ink: Object.assign({}, inkOf(draft)) };
    if (draft && own(draft, 'name')) next.name = draft.name;
    if (draft && own(draft, 'desc')) next.desc = draft.desc;
    if (typeof value !== 'number' || !Number.isFinite(value)) return next;
    const spec = sliders().find((s) => s.key === key);
    const lim = ((Vectura.PEN_MODELS || {}).PARAM_LIMITS || {})[key] || (spec ? [spec.min, spec.max] : null);
    next.ink[key] = lim ? Math.min(lim[1], Math.max(lim[0], value)) : value;
    return next;
  };

  const keyState = (pen, draft, key) => {
    const d = inkOf(draft);
    const saved = savedValue(pen, key);
    if (own(d, key) && Number.isFinite(d[key]) && !same(d[key], saved)) return 'draft';
    return pen && pen.ink && own(pen.ink, key) ? 'saved' : 'default';
  };

  const isDirty = (pen, draft) => {
    if (!draft) return false;
    const d = inkOf(draft);
    if (Object.keys(d).some((k) => Number.isFinite(d[k]) && !same(d[k], savedValue(pen, k)))) return true;
    if (own(draft, 'name') && typeof draft.name === 'string') {
      const nm = S().cleanName(draft.name);
      if (nm && nm !== pen.name) return true;
    }
    if (own(draft, 'desc') && typeof draft.desc === 'string') {
      const ds = S().cleanDesc(draft.desc);
      if (ds && ds !== (pen.desc || '')) return true;
    }
    return false;
  };

  const resetToModel = (pen) => {
    const draft = newDraft();
    sliders().forEach((s) => { draft.ink[s.key] = S().modelDefault(pen, s.key); });
    return draft;
  };

  const commit = (doc, penId, draft) => {
    const pen = S().penById(doc, penId);
    if (!pen) return doc;
    const patch = { ink: effectiveInk(pen, draft) };
    if (draft && typeof draft.name === 'string' && S().cleanName(draft.name)) patch.name = draft.name;
    if (draft && typeof draft.desc === 'string' && S().cleanDesc(draft.desc)) patch.desc = draft.desc;
    return S().updatePen(doc, penId, patch);
  };

  const defaultSaveNewName = (pen, draft) => {
    const nm = draft && typeof draft.name === 'string' ? S().cleanName(draft.name) : '';
    if (nm && nm !== pen.name) return nm;
    const tpl = (Vectura.UI_CONSTANTS && Vectura.UI_CONSTANTS.PEN_STUDIO && Vectura.UI_CONSTANTS.PEN_STUDIO.SAVE_NEW_DEFAULT) || '{name} (custom)';
    return S().cleanName(tpl.replace('{name}', pen.name));
  };

  Vectura.PenStudioDraft = { newDraft, effectiveInk, valueOf, set, isDirty, keyState, resetToModel, commit, defaultSaveNewName };
})();
