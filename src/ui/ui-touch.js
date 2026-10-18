/**
 * Touch interaction methods for the UI class — mixed into UI.prototype by ui.js.
 */
(() => {
  const getEl = (id) => document.getElementById(id);

  const Vectura = (window.Vectura = window.Vectura || {});
  // TUX-003: surfaces that own a pinch (the canvas, designers) opt in with this attribute. CSS
  // (touch-action:none) and installGestureZoomGuard() both read this one selector.
  const TOUCH_ZOOM_SELECTOR = '[data-touch-zoom]';
  Vectura.TOUCH_ZOOM_SELECTOR = TOUCH_ZOOM_SELECTOR;

  window.Vectura._UITouchMixin = {
    isTouchCapable() {
      if (typeof window === 'undefined') return false;
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
      return (navigator?.maxTouchPoints || 0) > 0;
    },

    // TUX-003: iOS Safari ignores touch-action:pan-x pan-y for page pinch and fires gesture*
    // events instead. Cancel them everywhere except inside a data-touch-zoom surface. Registered
    // only on touch-capable devices, so desktop Safari trackpad page zoom is untouched. The
    // `ontouchstart` term covers Playwright WebKit, which can report maxTouchPoints 0. No UA sniffing
    // (iPadOS reports a Mac UA). Self-contained: do not fold into other touch init.
    installGestureZoomGuard() {
      if (typeof window === 'undefined' || window.__vecturaGestureZoomGuard) return false;
      if (!(this.isTouchCapable() || 'ontouchstart' in window)) return false;
      window.__vecturaGestureZoomGuard = true;
      const guard = (e) => {
        const t = e.target;
        if (t && t.closest && t.closest(TOUCH_ZOOM_SELECTOR)) return;
        e.preventDefault();
      };
      ['gesturestart', 'gesturechange', 'gestureend'].forEach((type) => {
        document.addEventListener(type, guard, { capture: true, passive: false });
      });
      const canvas = getEl('main-canvas');
      if (canvas) canvas.setAttribute('data-touch-zoom', '');
      return true;
    },

    // TUX-045: the bar is built from Vectura.TOUCH_MODIFIERS. State lives in Vectura.InputModifiers
    // (runtime only: never saved, never in history).
    refreshTouchModifierButtons() {
      const IM = window.Vectura.InputModifiers;
      const cfg = window.Vectura.TOUCH_MODIFIERS || { tasks: [] };
      const bar = getEl('touch-modifier-bar');
      if (bar && IM) {
        bar.querySelectorAll('.touch-mod-btn').forEach((btn) => {
          const st = IM.getTaskState(btn.dataset.touchMod);
          btn.dataset.state = st;
          btn.classList.toggle('active', st !== 'off');
          btn.setAttribute('aria-pressed', st === 'off' ? 'false' : 'true');
        });
      }
      const badge = getEl('touch-mod-badge');
      if (badge && IM) {
        const chips = cfg.tasks.filter((t) => IM.getTaskState(t.id) !== 'off');
        badge.textContent = '';
        chips.forEach((t) => {
          const chip = document.createElement('span');
          const st = IM.getTaskState(t.id);
          chip.className = 'touch-mod-chip';
          chip.dataset.state = st;
          chip.textContent = st === 'locked' ? `${t.name} (locked)` : t.name;
          badge.appendChild(chip);
        });
        badge.hidden = chips.length === 0;
      }
    },

    initTouchModifierBar() {
      const bar = getEl('touch-modifier-bar');
      const IM = window.Vectura.InputModifiers;
      const cfg = window.Vectura.TOUCH_MODIFIERS;
      if (!bar || !IM || !cfg) return;
      bar.textContent = '';
      cfg.tasks.forEach((task) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'touch-mod-btn';
        btn.dataset.touchMod = task.id;
        btn.dataset.state = 'off';
        btn.title = task.description;
        btn.setAttribute('aria-label', task.name);
        btn.setAttribute('aria-pressed', 'false');
        btn.innerHTML = `<span class="touch-mod-icon" aria-hidden="true">${task.icon}</span>`
          + '<span class="touch-mod-label" aria-hidden="true"></span>'
          + '<span class="touch-mod-short" aria-hidden="true"></span>'
          + '<span class="touch-mod-lock" aria-hidden="true"><svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M7 10V8a5 5 0 0 1 10 0v2h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h6V8a3 3 0 0 0-6 0z"/></svg></span>';
        btn.querySelector('.touch-mod-label').textContent = task.name;
        btn.querySelector('.touch-mod-short').textContent = task.shortLabel;
        // Pointer timing, not dblclick: touch-action:manipulation removes dblclick on iOS.
        btn.addEventListener('pointerdown', () => { btn.__tuxDown = true; });
        btn.addEventListener('pointercancel', () => { btn.__tuxDown = false; });
        btn.addEventListener('pointerup', (e) => {
          if (e.pointerType === 'mouse' && e.button > 0) return;
          btn.__tuxDown = false;
          btn.__tuxTapAt = Date.now();
          IM.tap(task.id, btn.__tuxTapAt);
        });
        // Keyboard and assistive-tech activation arrive as a click with detail 0 and no pointerup.
        btn.addEventListener('click', (e) => {
          if (e.detail !== 0) return;
          IM.tap(task.id, Date.now());
        });
        bar.appendChild(btn);
      });
      if (!this._touchModSub) this._touchModSub = IM.subscribe(() => this.refreshTouchModifierButtons());
      IM.install();
      // The bar is for touch-capable devices only; a mouse-only narrow window never shows it.
      const apply = () => bar.classList.toggle('hidden', !this.isTouchCapable());
      apply();
      window.addEventListener('resize', apply);
      this.refreshTouchModifierButtons();
    },

    initTouchMouseBridge() {
      if (this.touchMouseBridgeInitialized) return;
      this.touchMouseBridgeInitialized = true;
      let activePointerId = null;
      const bridgeSelector = '.pen-grip, .noise-grip, .optimization-grip, .angle-dial, .toolbar-drag-handle';
      const shouldBridge = (target) => {
        if (!target || !target.closest) return false;
        if (target.closest('#main-canvas')) return false;
        if (target.closest('.petal-designer-window')) return false;
        return Boolean(target.closest(bridgeSelector));
      };
      const toMouse = (type, source) =>
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: source.clientX,
          clientY: source.clientY,
          screenX: source.screenX,
          screenY: source.screenY,
          button: 0,
          buttons: type === 'mouseup' ? 0 : 1,
        });

      document.addEventListener(
        'pointerdown',
        (e) => {
          if (e.pointerType === 'mouse') return;
          if (activePointerId !== null) return;
          if (!shouldBridge(e.target)) return;
          activePointerId = e.pointerId;
          e.target.dispatchEvent(toMouse('mousedown', e));
          e.preventDefault();
        },
        { passive: false, capture: true }
      );
      document.addEventListener(
        'pointermove',
        (e) => {
          if (e.pointerType === 'mouse') return;
          if (e.pointerId !== activePointerId) return;
          window.dispatchEvent(toMouse('mousemove', e));
          e.preventDefault();
        },
        { passive: false, capture: true }
      );
      const endBridge = (e) => {
        if (e.pointerType === 'mouse') return;
        if (e.pointerId !== activePointerId) return;
        window.dispatchEvent(toMouse('mouseup', e));
        activePointerId = null;
      };
      document.addEventListener('pointerup', endBridge, { capture: true });
      document.addEventListener('pointercancel', endBridge, { capture: true });
    },
  };
})();
