(() => {
  'use strict';
  const ns = (window.Vectura = window.Vectura || {});

  const TOUR_STEPS = [
    {
      target: '#viewport-container',
      placement: 'center',
      title: 'Generate Your First Layer',
      body: 'Select an algorithm from the left toolbar — then <b>double-click the canvas</b> to fill the document, or <b>drag</b> to draw any shape.',
    },
    {
      target: '.tool-btn[data-has-submenu]',
      placement: 'right',
      title: 'Unlock More Algorithms',
      body: 'Buttons with a <b>▸</b> indicator hold a family of related algorithms. <b>Press and hold</b> to reveal them.',
    },
    {
      target: '#left-panel-content',
      placement: 'right',
      title: 'Tune & Re-Seed',
      body: 'Adjust sliders to shape the output. Expand <b>Transform & Seed</b> in the left panel and hit <b>Randomize</b> to explore a new seed while keeping your settings.',
    },
    {
      target: '#layer-list',
      placement: 'left',
      title: 'Build with Layers',
      body: 'Each generation is an independent layer. <b>Drag to reorder</b>, use <b>⌘/Ctrl G</b> to group, or enable <b>Mask</b> on a parent to clip everything nested inside it.',
    },
    {
      target: '#btn-insert-mirror-modifier',
      placement: 'bottom',
      title: 'Add Mirror Symmetry',
      body: 'Insert a <b>Mirror Modifier</b> and drag layers into it. Drag the guide line to reposition the axis — or rotate it to any angle.',
    },
    {
      target: '#btn-export',
      placement: 'left',
      title: 'Export for Your Plotter',
      body: 'Open <b>Export SVG</b> to preview pen order, run line optimization, and download a plotter-ready file. <b>Save as .vectura</b> to pick up where you left off.',
    },
  ];

  class TutorialManager {
    constructor() {
      this._el = null;
      this._stepIndex = 0;
      this._onDismiss = null;
    }

    _init() {
      if (this._el) return;
      this._el = document.getElementById('tutorial-popover');
      if (!this._el) return;
      this._el.querySelector('.tutorial-close').onclick = () => this.dismiss();
      this._el.querySelector('.tutorial-btn--skip').onclick = () => this.dismiss();
      this._el.querySelector('.tutorial-btn--next').onclick = () => this._advance();
    }

    start(onDismiss) {
      this._init();
      if (!this._el) return;
      if (onDismiss) this._onDismiss = onDismiss;
      this._stepIndex = 0;
      this.goTo(0);
    }

    goTo(n) {
      this._init();
      if (!this._el) return;
      const step = TOUR_STEPS[n];
      if (!step) return;
      this._stepIndex = n;

      const stepNumEl = this._el.querySelector('.tutorial-step-num');
      const titleEl   = this._el.querySelector('.tutorial-title');
      const bodyEl    = this._el.querySelector('.tutorial-body');
      const nextBtn   = this._el.querySelector('.tutorial-btn--next');
      const dotsEl    = this._el.querySelector('.tutorial-dots');

      stepNumEl.textContent = `Step ${n + 1} of ${TOUR_STEPS.length}`;
      titleEl.textContent   = step.title;
      bodyEl.innerHTML      = step.body;
      nextBtn.textContent   = n === TOUR_STEPS.length - 1 ? 'Done ✓' : 'Next →';

      dotsEl.innerHTML = TOUR_STEPS.map((_, i) =>
        `<span class="tutorial-dot${i === n ? ' active' : ''}"></span>`
      ).join('');

      this._el.setAttribute('data-placement', step.placement);
      this._el.setAttribute('aria-hidden', 'false');

      this.positionAt(step.target, step.placement);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => this.positionAt(step.target, step.placement));
      });
    }

    _advance() {
      if (this._stepIndex >= TOUR_STEPS.length - 1) {
        this.dismiss();
      } else {
        this.goTo(this._stepIndex + 1);
      }
    }

    dismiss() {
      if (this._el) this._el.setAttribute('aria-hidden', 'true');
      if (this._onDismiss) {
        this._onDismiss();
        this._onDismiss = null;
      }
    }

    positionAt(selector, placement) {
      if (!this._el) return;

      if (placement === 'center') {
        const pw = this._el.offsetWidth  || 270;
        const ph = this._el.offsetHeight || 200;
        this._el.style.left = Math.round((window.innerWidth  - pw) / 2) + 'px';
        this._el.style.top  = Math.round((window.innerHeight - ph) / 2) + 'px';
        return;
      }

      const target = document.querySelector(selector);
      if (!target || target.offsetParent === null) {
        this.positionAt(selector, 'center');
        return;
      }

      const r   = target.getBoundingClientRect();
      const pw  = this._el.offsetWidth  || 270;
      const ph  = this._el.offsetHeight || 200;
      const GAP = 14;
      const vw  = window.innerWidth;
      const vh  = window.innerHeight;

      let left, top;
      if (placement === 'right')  { left = r.right + GAP;               top = r.top + r.height / 2 - ph / 2; }
      if (placement === 'left')   { left = r.left  - pw - GAP;          top = r.top + r.height / 2 - ph / 2; }
      if (placement === 'bottom') { left = r.left  + r.width / 2 - pw / 2; top = r.bottom + GAP; }
      if (placement === 'top')    { left = r.left  + r.width / 2 - pw / 2; top = r.top - ph - GAP; }

      left = Math.max(8, Math.min(vw - pw - 8, left));
      top  = Math.max(8, Math.min(vh - ph - 8, top));

      this._el.style.left = Math.round(left) + 'px';
      this._el.style.top  = Math.round(top)  + 'px';
    }
  }

  ns.Tutorial = new TutorialManager();
})();
