/*
 * Vectura Studio — HarmonographPlotter component (Phase 1).
 *
 * Inline preview canvas for the harmonograph algorithm. Given a list of
 * pendulums and timing parameters, draws the trajectory using a simple
 * deterministic integration so users can preview before regenerating the
 * full layer.
 *
 * Props:
 *   width     — canvas px. Default 220.
 *   height    — canvas px. Default 220.
 *   pendulums — [{ frequency, phase, decay, amplitude }] (X axis = sum of
 *               cos terms with even indices, Y = sin terms with odd indices,
 *               matching the existing engine). Empty array → blank canvas.
 *   duration  — seconds of trajectory. Default 25.
 *   sampleStep — ms between integration samples. Default 0.02s.
 *   stroke    — CSS color. Default 'var(--ui-accent)'.
 *
 * Returns: { el, redraw, update, destroy }
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});

  const create = (host, initialProps = {}) => {
    let props = Object.assign({
      width: 220, height: 220, duration: 25, sampleStep: 0.02, stroke: 'var(--ui-accent)',
    }, initialProps);

    const el = document.createElement('div');
    el.className = 'harmonograph-plotter';

    const canvas = document.createElement('canvas');
    canvas.width = props.width;
    canvas.height = props.height;
    canvas.className = 'harmonograph-plotter-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Harmonograph trajectory preview');
    el.appendChild(canvas);

    const computePath = () => {
      const list = Array.isArray(props.pendulums) ? props.pendulums : [];
      if (!list.length) return [];
      const dur = Math.max(0.5, Number(props.duration) || 25);
      const step = Math.max(0.005, Number(props.sampleStep) || 0.02);
      const points = [];
      for (let t = 0; t <= dur; t += step) {
        let x = 0, y = 0;
        list.forEach((p, i) => {
          const f = Number(p.frequency) || 0;
          const ph = (Number(p.phase) || 0) * Math.PI / 180;
          const d = Math.exp(-Math.max(0, Number(p.decay) || 0) * t);
          const a = Number(p.amplitude) != null ? Number(p.amplitude) : 1;
          if (i % 2 === 0) x += a * d * Math.sin(2 * Math.PI * f * t + ph);
          else y += a * d * Math.cos(2 * Math.PI * f * t + ph);
        });
        points.push({ x, y });
      }
      return points;
    };

    const draw = () => {
      const ctx = canvas.getContext && canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const points = computePath();
      if (!points.length) return;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      points.forEach((p) => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      });
      const rangeX = (maxX - minX) || 1;
      const rangeY = (maxY - minY) || 1;
      const margin = 8;
      const sx = (canvas.width - margin * 2) / rangeX;
      const sy = (canvas.height - margin * 2) / rangeY;
      ctx.strokeStyle = props.stroke;
      ctx.lineWidth = 1;
      ctx.beginPath();
      points.forEach((p, i) => {
        const cx = margin + (p.x - minX) * sx;
        const cy = margin + (p.y - minY) * sy;
        if (i === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      });
      ctx.stroke();
    };

    draw();
    if (host) host.appendChild(el);

    return {
      el,
      canvas,
      redraw: draw,
      update(newProps) {
        const merged = Object.assign({}, props, newProps || {});
        const sizeChanged = newProps && (newProps.width != null || newProps.height != null);
        props = merged;
        if (sizeChanged) {
          canvas.width = props.width;
          canvas.height = props.height;
        }
        draw();
      },
      destroy() {
        if (el.parentNode) el.parentNode.removeChild(el);
      },
    };
  };

  UI.HarmonographPlotter = create;
})();
