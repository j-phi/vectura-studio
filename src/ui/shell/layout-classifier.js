/**
 * Vectura layout classifier (TUX-006).
 *
 * Single source of truth for the shell layout class. Pure classify() plus an
 * apply() that writes body classes and body[data-layout].
 *
 *   'desktop' | 'touch-wide' | 'tablet' | 'phone'
 *
 * Body classes: phone -> mobile-layout + phone-layout; tablet -> mobile-layout +
 * tablet-layout; touch-wide -> touch-wide-layout (no mobile-layout); desktop -> none.
 * phone-short (TUX-007) is added when isShort(): coarse pointer and height < coarsePhoneMaxHeight.
 * touch-ui is present iff the primary pointer is coarse, in every layout.
 * Fires window 'vectura:layoutchange' {from, to, coarsePointer} on a real change.
 * Thresholds: Vectura.TOUCH_LAYOUT (src/config/defaults.js).
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const FALLBACK = { coarsePhoneMaxWidth: 600, coarsePhoneMaxHeight: 500, finePhoneMaxWidth: 540, wideMinWidth: 900 };
  const limits = () => Object.assign({}, FALLBACK, Vectura.TOUCH_LAYOUT || {});

  const LAYOUT_CLASSES = ['mobile-layout', 'phone-layout', 'tablet-layout', 'touch-wide-layout', 'phone-short'];

  const classify = ({ width, height, coarsePointer } = {}) => {
    const t = limits();
    if (coarsePointer) {
      if (width < t.coarsePhoneMaxWidth || height < t.coarsePhoneMaxHeight) return 'phone';
      if (width < t.wideMinWidth) return 'tablet';
      return 'touch-wide';
    }
    if (width < t.finePhoneMaxWidth) return 'phone';
    if (width < t.wideMinWidth) return 'tablet';
    return 'desktop';
  };

  // TUX-007: phone-short = coarse pointer AND height below the same threshold classify() uses.
  // It is the only short-height decision; CSS keys on body.phone-short and never re-measures.
  const isShort = (input = {}) => {
    const t = limits();
    return !!input.coarsePointer && input.height < t.coarsePhoneMaxHeight && classify(input) === 'phone';
  };

  const readInput = () => {
    let coarsePointer = false;
    try {
      coarsePointer = !!(G.matchMedia && G.matchMedia('(pointer: coarse)').matches);
    } catch (e) { coarsePointer = false; }
    return { width: G.innerWidth, height: G.innerHeight, coarsePointer };
  };

  let last = null;
  let lastCoarse = null;
  let lastShort = null;

  const classesFor = (layout) => {
    if (layout === 'phone') return ['mobile-layout', 'phone-layout'];
    if (layout === 'tablet') return ['mobile-layout', 'tablet-layout'];
    if (layout === 'touch-wide') return ['touch-wide-layout'];
    return [];
  };

  const apply = (doc) => {
    const d = doc || G.document;
    const input = readInput();
    const layout = classify(input);
    const body = d && d.body;
    if (body) {
      const want = classesFor(layout);
      LAYOUT_CLASSES.forEach((c) => body.classList.toggle(c, want.includes(c)));
      body.classList.toggle('phone-short', isShort(input));
      body.classList.toggle('touch-ui', input.coarsePointer);
      body.dataset.layout = layout;
    }
    const short = isShort(input);
    const changed = layout !== last || input.coarsePointer !== lastCoarse || short !== lastShort;
    const from = last;
    last = layout;
    lastCoarse = input.coarsePointer;
    lastShort = short;
    if (changed && typeof G.CustomEvent === 'function' && G.dispatchEvent) {
      G.dispatchEvent(new G.CustomEvent('vectura:layoutchange', { detail: { from, to: layout, coarsePointer: input.coarsePointer } }));
    }
    return layout;
  };

  const LayoutClassifier = { classify, isShort, readInput, apply, current: () => last };
  Vectura.LayoutClassifier = LayoutClassifier;
  if (typeof module !== 'undefined' && module.exports) module.exports = LayoutClassifier;
})();
