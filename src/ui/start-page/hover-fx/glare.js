/**
 * Start Page hover effect: Glare sweep (id "glare").
 * One soft light band sweeps across the art, once per entry; clipped to the art element.
 */
(() => {
  'use strict';
  const W = window; const D = document;
  const H = W.Vectura && W.Vectura.StartPageHoverFx; if (!H) return;
  const COOLDOWN = 900;

  H.registerSimple('glare', (el) => {
    let g = null; let lastAt = -1e9; let dead = false; let inside = false; let t = 0;
    const ensure = () => { if (!g) { g = D.createElement('i'); g.className = 'sp-hfx-glare'; g.setAttribute('aria-hidden', 'true'); el.appendChild(g); g.addEventListener('animationend', () => g && g.classList.remove('go')); } return g; };
    const fire = () => {
      if (dead || H.isStill()) return;
      const now = Date.now(); if (now - lastAt < COOLDOWN) return; lastAt = now;
      const n = ensure(); n.classList.remove('go'); void n.offsetWidth; n.classList.add('go');
      clearTimeout(t); t = setTimeout(() => n.classList.remove('go'), 1100);
    };
    const onEnter = () => { if (inside) return; inside = true; fire(); };
    const onLeave = () => { inside = false; };
    el.addEventListener('pointerenter', onEnter); el.addEventListener('pointerleave', onLeave);
    return {
      fire, enter: onEnter,
      destroy() { dead = true; clearTimeout(t); el.removeEventListener('pointerenter', onEnter); el.removeEventListener('pointerleave', onLeave); if (g) { g.remove(); g = null; } },
    };
  });
})();
