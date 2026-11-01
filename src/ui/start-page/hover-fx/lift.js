/**
 * Start Page hover effect: Lift & tilt (id "lift").
 * The art layer tilts toward the pointer inside its clipping frame, with a soft lift shadow on the frame and a
 * pointer-following glare. The frame clips everything, so nothing spills over text beside the art.
 */
(() => {
  'use strict';
  const W = window; const D = document;
  const H = W.Vectura && W.Vectura.StartPageHoverFx; if (!H) return;
  const MAX = 9; const LIFT = 1.045; const TAU_S = 0.09;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  H.registerSimple('lift', (el, opts) => {
    const handle = opts.handle;
    const art = (handle && handle.box) || el.querySelector('.sp-ink-art') || el;
    const gl = D.createElement('i'); gl.className = 'sp-hfx-tilt-glare'; gl.setAttribute('aria-hidden', 'true');
    const prevOverflow = el.style.overflow;
    const cur = { rx: 0, ry: 0, s: 1, gx: 50, gy: 30, g: 0 }; const tgt = { rx: 0, ry: 0, s: 1, gx: 50, gy: 30, g: 0 };
    let raf = 0; let last = 0; let active = false; let dead = false; let inside = false;
    const apply = () => {
      art.style.transform = `perspective(900px) rotateX(${cur.rx.toFixed(2)}deg) rotateY(${cur.ry.toFixed(2)}deg) scale(${cur.s.toFixed(4)})`;
      gl.style.setProperty('--gx', `${cur.gx.toFixed(1)}%`); gl.style.setProperty('--gy', `${cur.gy.toFixed(1)}%`); gl.style.opacity = cur.g.toFixed(3);
    };
    const rest = () => {
      active = false; art.style.transform = ''; art.style.willChange = ''; gl.style.opacity = ''; el.classList.remove('sp-hfx-lift'); el.style.overflow = prevOverflow; if (gl.parentNode) gl.remove();
    };
    const step = (dt) => {
      const a = 1 - Math.exp(-dt / TAU_S); let d = 0;
      for (const k in cur) { cur[k] += (tgt[k] - cur[k]) * a; d = Math.max(d, Math.abs(tgt[k] - cur[k]) * (k === 'gx' || k === 'gy' ? 0.01 : k === 's' ? 40 : 1)); }
      apply();
      if (d < 0.01 && !inside) { Object.assign(cur, tgt); rest(); return false; }
      return true;
    };
    const loop = (now) => { raf = 0; if (dead) return; const dt = last ? Math.min(0.064, Math.max(0.001, (now - last) / 1000)) : 1 / 60; last = now; if (step(dt)) raf = W.requestAnimationFrame(loop); };
    const kick = () => { if (!raf && !dead && W.requestAnimationFrame) { last = 0; raf = W.requestAnimationFrame(loop); } };
    const begin = () => {
      if (active) return; active = true;
      el.style.overflow = 'hidden'; el.classList.add('sp-hfx-lift'); art.style.willChange = 'transform';
      el.appendChild(gl);
    };
    const onMove = (e) => {
      if (H.isStill() || dead) return;
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
      const nx = clamp((e.clientX - r.left) / r.width - 0.5, -0.5, 0.5); const ny = clamp((e.clientY - r.top) / r.height - 0.5, -0.5, 0.5);
      inside = true; begin();
      Object.assign(tgt, { rx: -ny * 2 * MAX, ry: nx * 2 * MAX, s: LIFT, gx: (nx + 0.5) * 100, gy: (ny + 0.5) * 100, g: 1 });
      kick();
    };
    const onLeave = () => { inside = false; Object.assign(tgt, { rx: 0, ry: 0, s: 1, g: 0 }); kick(); };
    const onMotion = () => { if (H.isStill()) { inside = false; Object.assign(tgt, { rx: 0, ry: 0, s: 1, g: 0 }); Object.assign(cur, tgt); if (raf && W.cancelAnimationFrame) W.cancelAnimationFrame(raf); raf = 0; rest(); } };
    el.addEventListener('pointermove', onMove, { passive: true }); el.addEventListener('pointerleave', onLeave);
    W.addEventListener('vectura:start-page-motion', onMotion);
    return {
      destroy() { dead = true; if (raf && W.cancelAnimationFrame) W.cancelAnimationFrame(raf); el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerleave', onLeave); W.removeEventListener('vectura:start-page-motion', onMotion); rest(); },
      _advance(sec) { let t = 0; while (t < sec) { if (!step(1 / 60)) break; t += 1 / 60; } return t; },
      get active() { return active; },
    };
  });
})();
