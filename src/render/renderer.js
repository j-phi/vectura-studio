/**
 * Canvas renderer for vector paths.
 */
(() => {
  const { SETTINGS } = window.Vectura || {};

  class Renderer {
    constructor(id, engine) {
      this.canvas = document.getElementById(id);
      this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
      this.engine = engine;
      this.scale = 1;
      this.offsetX = 0;
      this.offsetY = 0;
      this.isDrag = false;
      this.lastM = { x: 0, y: 0 };
      this.ready = Boolean(this.canvas && this.ctx);

      if (!this.ready) {
        console.warn(`[Renderer] Missing canvas or context for #${id}`);
        return;
      }

      const parent = this.canvas.parentElement;
      if (!parent) {
        console.warn('[Renderer] Canvas has no parent element.');
        this.ready = false;
        return;
      }

      new ResizeObserver(() => this.resize()).observe(parent);
      this.canvas.addEventListener('wheel', (e) => this.wheel(e));
      this.canvas.addEventListener('mousedown', (e) => this.down(e));
      window.addEventListener('mousemove', (e) => this.move(e));
      window.addEventListener('mouseup', () => this.up());
    }

    resize() {
      if (!this.ready || !this.canvas || !this.ctx) return;
      const p = this.canvas.parentElement.getBoundingClientRect();
      this.canvas.width = p.width * window.devicePixelRatio;
      this.canvas.height = p.height * window.devicePixelRatio;
      this.canvas.style.width = `${p.width}px`;
      this.canvas.style.height = `${p.height}px`;
      this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      if (this.scale === 1) this.center();
      this.draw();
    }

    center() {
      if (!this.ready || !this.canvas) return;
      const p = this.engine.currentProfile;
      const r = this.canvas.getBoundingClientRect();
      const sx = (r.width - 60) / p.width;
      const sy = (r.height - 60) / p.height;
      this.scale = Math.min(sx, sy);
      this.offsetX = (r.width - p.width * this.scale) / 2;
      this.offsetY = (r.height - p.height * this.scale) / 2;
    }

    draw() {
      if (!this.ready || !this.canvas || !this.ctx) return;
      const w = this.canvas.width / window.devicePixelRatio;
      const h = this.canvas.height / window.devicePixelRatio;
      this.ctx.clearRect(0, 0, w, h);
      this.ctx.fillStyle = '#121214';
      this.ctx.fillRect(0, 0, w, h);
      this.ctx.save();
      this.ctx.translate(this.offsetX, this.offsetY);
      this.ctx.scale(this.scale, this.scale);
      const prof = this.engine.currentProfile;
      this.ctx.fillStyle = SETTINGS.bgColor;
      this.ctx.shadowColor = 'rgba(0,0,0,0.5)';
      this.ctx.shadowBlur = 20;
      this.ctx.fillRect(0, 0, prof.width, prof.height);
      this.ctx.shadowBlur = 0;
      this.ctx.strokeStyle = '#333';
      this.ctx.lineWidth = 1 / this.scale;
      this.ctx.strokeRect(0, 0, prof.width, prof.height);

      this.ctx.lineJoin = 'round';

      this.engine.layers.forEach((l) => {
        if (!l.visible) return;
        this.ctx.lineWidth = l.strokeWidth ?? SETTINGS.strokeWidth;
        this.ctx.lineCap = l.lineCap || 'round';
        this.ctx.beginPath();
        this.ctx.strokeStyle = l.color;
        l.paths.forEach((path) => {
          if (path.length < 2) return;
          this.ctx.moveTo(path[0].x, path[0].y);
          for (let i = 1; i < path.length; i++) this.ctx.lineTo(path[i].x, path[i].y);
        });
        this.ctx.stroke();
      });
      this.ctx.restore();
    }

    wheel(e) {
      if (!this.ready) return;
      e.preventDefault();
      const s = this.scale * (1 + (e.deltaY > 0 ? -0.1 : 0.1));
      this.scale = Math.max(0.1, Math.min(s, 20));
      this.draw();
    }

    down(e) {
      if (!this.ready) return;
      if (e.shiftKey || e.button === 1) {
        this.isDrag = true;
        this.lastM = { x: e.clientX, y: e.clientY };
        this.canvas.style.cursor = 'grabbing';
      }
    }

    move(e) {
      if (!this.ready || !this.isDrag) return;
      this.offsetX += e.clientX - this.lastM.x;
      this.offsetY += e.clientY - this.lastM.y;
      this.lastM = { x: e.clientX, y: e.clientY };
      this.draw();
    }

    up() {
      if (!this.ready || !this.canvas) return;
      this.isDrag = false;
      this.canvas.style.cursor = 'crosshair';
    }
  }

  window.Vectura = window.Vectura || {};
  window.Vectura.Renderer = Renderer;
})();
