/**
 * Vectura color-picker modal (Phase 3 step 4 — first modal).
 *
 * Exposes window.Vectura.UI.Modals.ColorPicker — the touch-friendly HSV
 * color picker that powers every "Color" button in Vectura. The IIFE-local
 * `openColorPickerAnchoredTo` (in `src/ui/ui.js`) routes to this module when
 * the device is touch-primary, or when called directly via
 * `this.openColorModal({ title, value, onApply })` (used by Layer Settings,
 * Layer Bar, the Auto-Colorize palette, and several pattern editors).
 *
 * Method exposed:
 *   - openColorModal({ title, value, onApply })
 *       Opens the centered overlay (composed via `this.openModal` — same
 *       primitive Help/Shortcuts and Info Modals use). Renders a
 *       saturation-value canvas, a hue strip canvas, a preview swatch, a
 *       6-char hex input, and Apply / Cancel buttons. Pointer drag on either
 *       canvas updates HSV; typing 6 hex chars updates HSV. Apply invokes
 *       `onApply(hex)` and closes; Cancel closes without invoking onApply.
 *
 * UI.prototype delegates `openColorModal` to this module via
 * `installOn(UI.prototype)`. Anchored color pickers
 * (`openColorPickerAnchoredTo`) remain as an IIFE-local helper in
 * `src/ui/ui.js` — not a UI.prototype method — and the touch-primary path
 * routes through `uiInstance.openColorModal(...)` which lands here.
 *
 * DI bag: {} (none — module is self-contained, depends only on
 *   `this.openModal`, `this.closeModal`, and `this.modal.bodyEl`).
 *
 * Compile gate at tests/unit/modals/color-picker-compile.test.js.
 * Lifecycle test at tests/integration/modals/color-picker.test.js.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};
  const Modals = UI.Modals = UI.Modals || {};

  let DEPS = null;

  const requireDeps = (name) => {
    if (!DEPS) {
      throw new Error(
        `ColorPicker.${name} invoked before ColorPicker.bind(deps) — load order broken`,
      );
    }
    return DEPS;
  };

  function openColorModal({ title, value, onApply }) {
    requireDeps('openColorModal');
    const initHex = /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : '#ff0000';
    const body = `
      <div class="color-modal">
        <div class="color-sv-wrapper">
          <canvas class="color-sv-canvas"></canvas>
          <div class="color-sv-cursor"></div>
        </div>
        <div class="color-hue-wrapper">
          <canvas class="color-hue-canvas"></canvas>
          <div class="color-hue-cursor"></div>
        </div>
        <div class="color-hex-row">
          <div class="color-preview-swatch"></div>
          <div class="color-hex-input-wrap">
            <span class="color-hex-symbol">#</span>
            <input type="text" class="color-modal-hex" maxlength="6" autocomplete="off" autocorrect="off" spellcheck="false" inputmode="text" placeholder="FFFFFF" value="${initHex.slice(1).toUpperCase()}">
          </div>
        </div>
        <div class="color-modal-actions">
          <button type="button" class="color-modal-cancel">Cancel</button>
          <button type="button" class="color-modal-apply">Apply</button>
        </div>
      </div>
    `;
    this.openModal({ title, body });

    const svCanvas = this.modal.bodyEl.querySelector('.color-sv-canvas');
    const svCursor = this.modal.bodyEl.querySelector('.color-sv-cursor');
    const hueCanvas = this.modal.bodyEl.querySelector('.color-hue-canvas');
    const hueCursor = this.modal.bodyEl.querySelector('.color-hue-cursor');
    const hexInput = this.modal.bodyEl.querySelector('.color-modal-hex');
    const preview = this.modal.bodyEl.querySelector('.color-preview-swatch');
    const cancelBtn = this.modal.bodyEl.querySelector('.color-modal-cancel');
    const applyBtn = this.modal.bodyEl.querySelector('.color-modal-apply');

    const hexToRgb = (hex) => {
      const h = hex.replace('#', '');
      return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16) };
    };
    const rgbToHex = (r, g, b) =>
      '#' + [r,g,b].map(v => Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
    const rgbToHsv = (r, g, b) => {
      r /= 255; g /= 255; b /= 255;
      const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max - min;
      let h = 0, s = max > 0 ? d / max : 0, v = max;
      if (d > 0) {
        if (max === r) h = ((g-b)/d % 6 + 6) % 6;
        else if (max === g) h = (b-r)/d + 2;
        else h = (r-g)/d + 4;
        h /= 6;
      }
      return { h, s, v };
    };
    const hsvToRgb = (h, s, v) => {
      const i = Math.floor(h*6), f = h*6-i, p = v*(1-s), q = v*(1-f*s), t = v*(1-(1-f)*s);
      const m = [[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]][i%6];
      return { r: Math.round(m[0]*255), g: Math.round(m[1]*255), b: Math.round(m[2]*255) };
    };

    const { r: ir, g: ig, b: ib } = hexToRgb(initHex);
    const hsv = rgbToHsv(ir, ig, ib);

    const drawSV = () => {
      const ctx = svCanvas.getContext('2d');
      const w = svCanvas.width, h = svCanvas.height;
      const { r, g, b } = hsvToRgb(hsv.h, 1, 1);
      const gradH = ctx.createLinearGradient(0,0,w,0);
      gradH.addColorStop(0, '#fff');
      gradH.addColorStop(1, rgbToHex(r,g,b));
      ctx.fillStyle = gradH;
      ctx.fillRect(0,0,w,h);
      const gradV = ctx.createLinearGradient(0,0,0,h);
      gradV.addColorStop(0, 'rgba(0,0,0,0)');
      gradV.addColorStop(1, '#000');
      ctx.fillStyle = gradV;
      ctx.fillRect(0,0,w,h);
    };

    const drawHue = () => {
      const ctx = hueCanvas.getContext('2d');
      const w = hueCanvas.width, h = hueCanvas.height;
      const grad = ctx.createLinearGradient(0,0,w,0);
      for (let i=0; i<=6; i++) grad.addColorStop(i/6, `hsl(${i*60},100%,50%)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0,0,w,h);
    };

    const refreshPicker = () => {
      const { r, g, b } = hsvToRgb(hsv.h, hsv.s, hsv.v);
      const hex = rgbToHex(r,g,b);
      preview.style.background = hex;
      svCursor.style.left = `${hsv.s * 100}%`;
      svCursor.style.top = `${(1 - hsv.v) * 100}%`;
      hueCursor.style.left = `${hsv.h * 100}%`;
      const { r: hr, g: hg, b: hb } = hsvToRgb(hsv.h, 1, 1);
      hueCursor.style.background = rgbToHex(hr,hg,hb);
    };

    const applyHsv = () => {
      const { r, g, b } = hsvToRgb(hsv.h, hsv.s, hsv.v);
      hexInput.value = rgbToHex(r,g,b).slice(1).toUpperCase();
      refreshPicker();
    };

    requestAnimationFrame(() => {
      const dpr = Math.min(Math.round(window.devicePixelRatio || 1), 3);
      svCanvas.width = svCanvas.offsetWidth * dpr;
      svCanvas.height = svCanvas.offsetHeight * dpr;
      hueCanvas.width = hueCanvas.offsetWidth * dpr;
      hueCanvas.height = hueCanvas.offsetHeight * dpr;
      drawSV();
      drawHue();
      applyHsv();
    });

    const trackDrag = (el, onMove) => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        onMove(e);
        el.setPointerCapture(e.pointerId);
        const move = (ev) => onMove(ev);
        const up = () => {
          el.removeEventListener('pointermove', move);
          el.removeEventListener('pointerup', up);
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up, { once: true });
      });
    };

    trackDrag(svCanvas, (e) => {
      const rect = svCanvas.getBoundingClientRect();
      hsv.s = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      hsv.v = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
      applyHsv();
    });

    trackDrag(hueCanvas, (e) => {
      const rect = hueCanvas.getBoundingClientRect();
      hsv.h = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      drawSV();
      applyHsv();
    });

    hexInput.addEventListener('input', (e) => {
      const raw = e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
      if (raw.length === 6) {
        const { r, g, b } = hexToRgb('#' + raw);
        Object.assign(hsv, rgbToHsv(r, g, b));
        drawSV();
        refreshPicker();
      }
    });

    cancelBtn.addEventListener("click", () => this.closeModal());
    applyBtn.addEventListener("click", () => {
      const raw = hexInput.value.replace(/[^0-9a-fA-F]/g, '');
      const hex = raw.length === 6
        ? '#' + raw.toLowerCase()
        : (() => { const {r,g,b} = hsvToRgb(hsv.h, hsv.s, hsv.v); return rgbToHex(r,g,b); })();
      if (onApply) onApply(hex);
      this.closeModal();
    });
  }

  Modals.ColorPicker = {
    /**
     * Inject closure-captured legacy ui.js IIFE locals.
     * @param {object} deps - currently empty bag (module is self-contained).
     */
    bind(deps) {
      DEPS = deps || {};
    },
    openColorModal,
    installOn(proto) {
      proto.openColorModal = function(opts) { return openColorModal.call(this, opts); };
    },
  };
})();
