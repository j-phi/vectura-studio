/**
 * Touch interaction methods for the UI class — mixed into UI.prototype by ui.js.
 */
(() => {
  const getEl = (id) => document.getElementById(id);

  window.Vectura = window.Vectura || {};
  window.Vectura._UITouchMixin = {
    isTouchCapable() {
      if (typeof window === 'undefined') return false;
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
      return (navigator?.maxTouchPoints || 0) > 0;
    },

    setTouchModifier(key, active) {
      const SETTINGS = window.Vectura.SETTINGS || {};
      if (!SETTINGS.touchModifiers || typeof SETTINGS.touchModifiers !== 'object') {
        SETTINGS.touchModifiers = { shift: false, alt: false, meta: false, pan: false };
      }
      SETTINGS.touchModifiers[key] = Boolean(active);
      this.refreshTouchModifierButtons();
      this.app.persistPreferencesDebounced?.();
    },

    refreshTouchModifierButtons() {
      const bar = getEl('touch-modifier-bar');
      if (!bar) return;
      const mods = (window.Vectura.SETTINGS || {}).touchModifiers || {};
      bar.querySelectorAll('.touch-mod-btn').forEach((btn) => {
        const key = btn.dataset.touchMod;
        btn.classList.toggle('active', Boolean(mods[key]));
      });
    },

    initTouchModifierBar() {
      const bar = getEl('touch-modifier-bar');
      if (!bar) return;
      const SETTINGS = window.Vectura.SETTINGS || {};
      if (!SETTINGS.touchModifiers || typeof SETTINGS.touchModifiers !== 'object') {
        SETTINGS.touchModifiers = { shift: false, alt: false, meta: false, pan: false };
      } else {
        SETTINGS.touchModifiers = {
          shift: Boolean(SETTINGS.touchModifiers.shift),
          alt: Boolean(SETTINGS.touchModifiers.alt),
          meta: Boolean(SETTINGS.touchModifiers.meta),
          pan: Boolean(SETTINGS.touchModifiers.pan),
        };
      }
      bar.classList.toggle('hidden', !this.isTouchCapable());
      bar.querySelectorAll('.touch-mod-btn').forEach((btn) => {
        btn.onclick = () => {
          const key = btn.dataset.touchMod;
          if (!key) return;
          this.setTouchModifier(key, !Boolean((window.Vectura.SETTINGS || {}).touchModifiers?.[key]));
        };
      });
      this.refreshTouchModifierButtons();
      window.addEventListener('resize', () => {
        bar.classList.toggle('hidden', !this.isTouchCapable());
      });
    },

    initTouchMouseBridge() {
      if (this.touchMouseBridgeInitialized) return;
      this.touchMouseBridgeInitialized = true;
      let activePointerId = null;
      const bridgeSelector = '.pane-resizer, .bottom-resizer, .layer-grip, .pen-grip, .noise-grip, .optimization-grip, .angle-dial';
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
