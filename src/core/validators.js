/**
 * Vectura.Validators — generic field validators used for security-sensitive
 * untrusted inputs (preference snapshots, imported project files, URL params).
 *
 * Audit context (Bugs-7, audit-2026-05-20): applyPreferenceSnapshot used to
 * accept arbitrary strings into SETTINGS.bgColor, which then flowed into
 * inline `style.background`. A malicious cookie/localStorage value such as
 * `red; background: url(https://attacker/x)` would punch through the CSS
 * parser. These helpers enforce strict types so a tampered preference store
 * cannot CSS-inject the document.
 *
 * No external dependencies — pure functions, safe to load early.
 */
(() => {
  const root = (typeof window !== 'undefined' ? window : globalThis);
  root.Vectura = root.Vectura || {};

  // Strict hex color: # followed by exactly 3, 4, 6, or 8 hex digits.
  // The character class is anchored at both ends so anything outside the
  // hex grammar (`;`, `(`, whitespace, etc.) is rejected outright. This
  // matches the input format used by every color picker in the app and is
  // safe to drop into an inline `style.background`.
  const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

  const isHexColor = (value) => {
    if (typeof value !== 'string') return false;
    if (value.length > 9) return false;
    return HEX_COLOR_RE.test(value);
  };

  // Coerce to a finite number, clamp to [min, max], otherwise return null.
  // Accepts numeric strings ('5', '0.3') to match how cookie-rehydrated
  // values may arrive after JSON round-tripping.
  const finiteInRange = (value, min, max) => {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return null;
    if (n < min) return min;
    if (n > max) return max;
    return n;
  };

  // Integer variant — rounds after clamping.
  const finiteIntInRange = (value, min, max) => {
    const clamped = finiteInRange(value, min, max);
    if (clamped == null) return null;
    return Math.round(clamped);
  };

  // Strict enum membership. Returns the input if allowed, null otherwise.
  // Falsy / non-string inputs reject — this is on purpose so a malicious
  // `{__proto__: …}` payload can't sneak through.
  const fromEnum = (value, allowed) => {
    if (typeof value !== 'string') return null;
    if (!Array.isArray(allowed)) return null;
    return allowed.indexOf(value) >= 0 ? value : null;
  };

  // Boolean coercion that only accepts actual booleans. Used when a snapshot
  // field MUST be true/false (not truthy/falsy) so a tampered string like
  // `'false'` does not silently flip behavior.
  const strictBool = (value) => (value === true || value === false ? value : null);

  // String capped to maxLength with an optional regex allowlist. Used for
  // free-form labels (paperSize custom IDs, paletteId etc.) where we cannot
  // enumerate every possible value but still want to bound DOM exposure.
  const safeString = (value, maxLength = 64, pattern = /^[A-Za-z0-9_\-\.]+$/) => {
    if (typeof value !== 'string') return null;
    if (value.length === 0 || value.length > maxLength) return null;
    if (pattern && !pattern.test(value)) return null;
    return value;
  };

  root.Vectura.Validators = {
    isHexColor,
    finiteInRange,
    finiteIntInRange,
    fromEnum,
    strictBool,
    safeString,
    HEX_COLOR_RE,
  };
})();
