/**
 * Start Page hover effect: Re-plot (id "replot").
 * Hovering replays a quick plot-in of the art, once per entry, with a cooldown.
 */
(() => {
  'use strict';
  const W = window;
  const H = W.Vectura && W.Vectura.StartPageHoverFx; if (!H) return;
  const COOLDOWN = 1400;

  H.registerSimple('replot', (el, opts) => {
    const handle = opts.handle; let lastAt = -1e9; let inside = false; let dead = false;
    const ink = () => W.Vectura.StartPageInk;
    const fire = () => {
      const Ink = ink(); if (dead || !Ink || H.isStill() || !handle || !handle.alive || !handle.alive() || handle.run) return;
      const now = Date.now(); if (now - lastAt < COOLDOWN) return; lastAt = now;
      Ink.drawIn(handle, { style: opts.style || 'plot', duration: opts.duration || 1000 });
    };
    const onEnter = () => { if (inside) return; inside = true; fire(); };
    const onLeave = () => { inside = false; };
    el.addEventListener('pointerenter', onEnter); el.addEventListener('pointerleave', onLeave);
    return {
      fire, enter: onEnter,
      destroy() { dead = true; el.removeEventListener('pointerenter', onEnter); el.removeEventListener('pointerleave', onLeave); const Ink = ink(); if (Ink && handle && handle.run) Ink.finish(handle); },
    };
  });
})();
