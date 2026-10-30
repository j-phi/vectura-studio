/**
 * Start Page DOM helpers — window.Vectura.StartPageDom. `h(tag, attrs, ...kids)` builds an element without
 * ever parsing user text as HTML (text goes through textContent / text nodes).
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v; // trusted, developer-authored markup only (icons)
      else if (k === 'dataset') Object.entries(v).forEach(([dk, dv]) => { el.dataset[dk] = dv; });
      else el.setAttribute(k, v === true ? '' : v);
    });
    kids.flat().forEach((kid) => { if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid)); });
    return el;
  };
  const pad2 = (n) => String(n).padStart(2, '0');
  Vectura.StartPageDom = { h, pad2 };
})();
