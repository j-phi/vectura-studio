/*
 * Vectura Studio — core utilities shared across engine, algorithms, UI.
 *
 * Public API: window.Vectura.Utils.{ clone }
 *
 * Loaded before any other core/UI module in index.html so every IIFE can
 * reference Vectura.Utils.clone (and future shared helpers) without each
 * file redefining its own copy.
 *
 * `clone` prefers structuredClone (preserves Date/Map/Set/typed arrays);
 * falls back to JSON round-trip on legacy runtimes where structuredClone
 * is unavailable.
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
})();
