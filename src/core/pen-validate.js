/**
 * Pen-record validator — sanitizes pen entries restored from untrusted
 * sources (.vectura project files) before they land in SETTINGS.pens.
 *
 * SETTINGS.pens is rendered into innerHTML by several panels; we must not
 * allow XSS payloads to survive an import. The validator enforces:
 *   - id:    must be a non-empty safe identifier (A-Z, a-z, 0-9, _, -)
 *   - color: must be a hex color (#rgb, #rgba, #rrggbb, #rrggbbaa)
 *   - width: must be a finite number, clamped to [0, 100]
 *   - name:  coerced to a string; left untouched (escapeHtml handles render)
 *
 * Public API: window.Vectura.PenValidate.validatePens(arr) -> array<pen>
 *
 * Invalid entries are dropped. Callers should fall back to defaults if the
 * returned array is empty.
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});

  const ID_RE = /^[A-Za-z0-9_-]+$/;
  // Allow only canonical CSS hex colors: #rgb, #rgba, #rrggbb, #rrggbbaa.
  // 5-/7-char hex are invalid and would not match a real color picker output.
  const HEX_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

  const isHexColor = (value) => typeof value === 'string' && HEX_RE.test(value);
  const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

  const validatePen = (pen) => {
    if (!pen || typeof pen !== 'object') return null;
    const id = `${pen.id ?? ''}`;
    if (!id || !ID_RE.test(id)) return null;
    if (!isHexColor(pen.color)) return null;
    let width = pen.width;
    if (typeof width === 'string') {
      const parsed = Number(width);
      width = Number.isFinite(parsed) ? parsed : NaN;
    }
    if (!isFiniteNumber(width)) return null;
    // Defensive clamp — pen widths above ~10mm are nonsensical and a runaway
    // value should never propagate.
    if (width < 0) width = 0;
    if (width > 100) width = 100;
    const name = typeof pen.name === 'string' ? pen.name : `${pen.name ?? id}`;
    const out = { id, name, color: pen.color, width };
    if (typeof pen.lineCap === 'string' && /^[A-Za-z]+$/.test(pen.lineCap)) {
      out.lineCap = pen.lineCap;
    }
    return out;
  };

  const validatePens = (input) => {
    if (!Array.isArray(input)) return [];
    const seen = new Set();
    const out = [];
    for (let i = 0; i < input.length; i += 1) {
      const pen = validatePen(input[i]);
      if (!pen) continue;
      if (seen.has(pen.id)) continue;
      seen.add(pen.id);
      out.push(pen);
    }
    return out;
  };

  Vectura.PenValidate = { validatePens, validatePen };
})();
