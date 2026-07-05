/**
 * Stroke model write API (STR-5).
 *
 * A single `setStrokeWeight(layer, value)` used by both the Stroke Options
 * panel and (Phase 2) the Task Bar weight slider, guaranteeing the two
 * surfaces can never disagree.
 *
 * It writes ONLY `layer.strokeWidth` — never `layer.penId` nor the pen
 * record's `width` in SETTINGS.pens. This intentionally lets a layer's own
 * stroke weight diverge from its assigned pen's nominal width (the video edits
 * stroke weight and pen/color independently), distinct from the Pens panel's
 * width slider, which DOES cascade to every layer on that pen.
 *
 * History: push-before-change. A gesture calls with `{ begin:true }` on the
 * first live change (snapshots the pre-gesture state → exactly one undo step)
 * and `{ commit:true }` on release; intermediate live moves pass neither flag
 * and never push. Every call repaints (`app.render`) so the edit is live.
 */
(() => {
  const clampWeight = (value) => {
    const S = window.Vectura?.STROKE_STYLE;
    const min = Number.isFinite(S?.WEIGHT_MIN_MM) ? S.WEIGHT_MIN_MM : 0.01;
    const max = Number.isFinite(S?.WEIGHT_MAX_MM) ? S.WEIGHT_MAX_MM : 10;
    return Math.max(min, Math.min(max, value));
  };

  const setStrokeWeight = (layer, value, opts = {}) => {
    if (!layer) return null;
    const num = Number(value);
    const { app = null, begin = false, commit = false } = opts;
    // Push-before-change: snapshot the pre-gesture state so the whole drag
    // collapses to one undo step. Done BEFORE the write, only on begin.
    if (begin && app && typeof app.pushHistory === 'function') app.pushHistory();
    if (Number.isFinite(num)) {
      // Writes ONLY strokeWidth — never penId or the pen record.
      layer.strokeWidth = clampWeight(num);
    }
    if (app && typeof app.render === 'function') app.render();
    // `commit` is accepted for symmetry with the panel/Task-Bar gesture
    // lifecycle; the single history step was already taken at begin.
    void commit;
    return layer.strokeWidth;
  };

  const setStrokeWeightForLayers = (layers, value, opts = {}) => {
    if (!Array.isArray(layers) || !layers.length) return null;
    const { app = null, begin = false, commit = false } = opts;
    if (begin && app && typeof app.pushHistory === 'function') app.pushHistory();
    let last = null;
    layers.forEach((layer) => {
      // Suppress per-layer history/render; the batch owns the gesture.
      last = setStrokeWeight(layer, value, {});
    });
    if (app && typeof app.render === 'function') app.render();
    void commit;
    return last;
  };

  const Vectura = (window.Vectura = window.Vectura || {});
  Vectura.StrokeModel = {
    ...(Vectura.StrokeModel || {}),
    clampWeight,
    setStrokeWeight,
    setStrokeWeightForLayers,
  };
})();
