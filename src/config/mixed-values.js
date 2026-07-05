/**
 * Vectura mixed-value indicator vocabulary + shared helper (MSC-1).
 *
 * WHILE a multi-selection holds differing per-layer values (pen — already
 * handled by the Pen Picker's COL-2/3 "?" badge — or stroke weight), the chips
 * and fields that would otherwise show a single value SHALL instead show an
 * explicit "mixed" indicator, so the surface never lies about a value the whole
 * selection doesn't share. Applying a value unifies the selection and clears
 * the indicator.
 *
 * This module owns:
 *   - Vectura.MIXED_VALUES: the user-visible strings (placeholder / badge /
 *     titles) — no inline copy in the surfaces.
 *   - Vectura.MixedValue: a tiny headless helper the stroke-weight surfaces call
 *     (mirrors the pen-selection `{ value, mixed }` shape the Pen Picker uses).
 *
 * Self-contained IIFE; every consumer feature-detects it and falls back to the
 * prior single-value behavior when it is absent (tolerant of late/omitted load).
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const MIXED_VALUES = {
    // Blank-field placeholder shown when the selection's values differ.
    placeholder: 'mixed',
    // Compact glyph for icon-only chips (mirrors the pen picker's "?" badge).
    badge: '?',
    // Field tooltip for the differing-stroke-weight case.
    strokeWeightTitle: 'Mixed stroke weights — enter a value to unify',
    // Float compare tolerance (mm) below which weights count as equal.
    EPSILON: 1e-4,
  };

  // True when a numeric multi-selection spans values wider than `eps`.
  const isMixedNumeric = (values, eps = MIXED_VALUES.EPSILON) => {
    if (!Array.isArray(values) || values.length < 2) return false;
    let min = Infinity;
    let max = -Infinity;
    for (const v of values) {
      const n = Number(v) || 0;
      if (n < min) min = n;
      if (n > max) max = n;
    }
    return (max - min) > (Number.isFinite(eps) ? eps : MIXED_VALUES.EPSILON);
  };

  // Resolve the shared stroke weight for a layer set, or flag it mixed.
  // Returns { value: number|null, mixed: boolean } — value is the shared weight
  // (or the first, for a single layer); null when mixed or empty.
  const strokeWeight = (layers) => {
    const list = (Array.isArray(layers) ? layers : []).filter(Boolean);
    if (!list.length) return { value: null, mixed: false };
    const weights = list.map((l) => Number(l.strokeWidth) || 0);
    const mixed = isMixedNumeric(weights);
    return { value: mixed ? null : weights[0], mixed };
  };

  Vectura.MIXED_VALUES = MIXED_VALUES;
  Vectura.MixedValue = { ...(Vectura.MixedValue || {}), isMixedNumeric, strokeWeight };
})();
