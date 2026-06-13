/*
 * Vectura Studio — core utilities shared across engine, algorithms, UI.
 *
 * Public API: window.Vectura.Utils.{ clone, generateId } (generateId is also
 * mirrored at window.Vectura.generateId for terse call sites).
 *
 * Loaded before any other core/UI module in index.html so every IIFE can
 * reference Vectura.Utils.clone / Vectura.generateId (and future shared
 * helpers) without each file redefining its own copy. Living in core/ — not a
 * UI module — keeps it available to core code (and core unit tests) without a
 * core→UI dependency.
 *
 * `clone` prefers structuredClone (preserves Date/Map/Set/typed arrays);
 * falls back to JSON round-trip on legacy runtimes where structuredClone
 * is unavailable.
 *
 * `generateId` is the one canonical id mint (layers, fills, groups, modifiers).
 * It prefers crypto.randomUUID; its fallback is a timestamp + random suffix and
 * MUST NOT recurse into generateId (an earlier refactor's fallback was
 * `generateId() + generateId()`, recursing until the stack overflowed). crypto
 * is read at call time so a runtime that swaps it — or a test that stubs it —
 * is honoured.
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  const Utils = (Vectura.Utils = Vectura.Utils || {});

  const _structuredClone = (typeof structuredClone === 'function')
    ? structuredClone
    : (typeof window !== 'undefined' && typeof window.structuredClone === 'function')
      ? window.structuredClone.bind(window)
      : null;

  const clone = _structuredClone
    ? (value) => _structuredClone(value)
    : (value) => JSON.parse(JSON.stringify(value));

  Utils.clone = clone;

  const generateId = () => {
    const c = (typeof window !== 'undefined' && window.crypto)
      || (typeof crypto !== 'undefined' ? crypto : null);
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  };

  Utils.generateId = generateId;
  Vectura.generateId = generateId;
})();
