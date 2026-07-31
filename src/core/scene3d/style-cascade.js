/**
 * Scene3D.StyleCascade — the 3D Scene Studio style resolution table (Phase 1,
 * CONTRACT C).
 *
 * A scene3d layer carries `params.styleTable`:
 *   {
 *     scene:    { penId, mapper, params },      // scene-wide base style
 *     byObject: { [objectId]: Style },           // per-object overrides
 *     byFace:   { ['objectId/faceId']: Style },  // per-face overrides
 *   }
 *
 * resolve() picks the most specific style that exists for a target —
 * byFace > byObject > scene — and WHOLE-STYLE wins: there is no per-field
 * merge across scopes (a face override with mapper 'none' does not inherit
 * the object's hatch params). Every call returns a fresh object; mutating a
 * result never corrupts the table.
 *
 * Pure JS, no DOM: the scene3d generator calls resolve() per face and the
 * Scene panel edits the table via setStyle()/clearStyle(). require()-able
 * for unit tests (same IIFE + module.exports guard as optimization-utils.js).
 */
(() => {
  const globalScope = typeof window !== 'undefined' ? window : globalThis;

  const DEFAULT_MAPPER = 'none';

  const defaultStyle = () => ({ penId: null, mapper: DEFAULT_MAPPER, params: {} });

  // Deep-clone via JSON — styles are JSON-safe by contract (they serialize
  // inside .vectura files).
  const cloneParams = (params) => {
    if (!params || typeof params !== 'object') return {};
    try {
      return JSON.parse(JSON.stringify(params));
    } catch (_) {
      return {};
    }
  };

  // Normalize an arbitrary style-ish object into the canonical Style shape.
  // Always returns a NEW object (never a reference into the table or the
  // caller's argument).
  const normalizeStyle = (style) => {
    const src = style && typeof style === 'object' ? style : {};
    return {
      penId: src.penId != null ? src.penId : null,
      mapper: typeof src.mapper === 'string' && src.mapper ? src.mapper : DEFAULT_MAPPER,
      params: cloneParams(src.params),
    };
  };

  const freshResolved = (style, scope, key) => {
    const out = normalizeStyle(style);
    out.provenance = { scope, key };
    return out;
  };

  /**
   * Resolve the effective style for a target. byFace > byObject > scene.
   * Whole-style wins (no per-field merge). Returns a NEW object each call:
   *   { penId, mapper, params, provenance: { scope: 'face'|'object'|'scene', key } }
   * Missing table / maps / keys fall through to the scene default.
   */
  const resolve = (styleTable, target) => {
    const table = styleTable && typeof styleTable === 'object' ? styleTable : {};
    const t = target && typeof target === 'object' ? target : {};
    const objectId = t.objectId != null ? String(t.objectId) : null;
    const faceId = t.faceId != null ? String(t.faceId) : null;

    if (objectId && faceId) {
      const key = `${objectId}/${faceId}`;
      const style = table.byFace && table.byFace[key];
      if (style) return freshResolved(style, 'face', key);
    }
    if (objectId) {
      const style = table.byObject && table.byObject[objectId];
      if (style) return freshResolved(style, 'object', objectId);
    }
    if (table.scene) return freshResolved(table.scene, 'scene', null);
    return freshResolved(defaultStyle(), 'scene', null);
  };

  /**
   * Set the style for a scope. scope: 'scene' | 'object' | 'face'.
   * key: null for 'scene'; objectId for 'object'; 'objectId/faceId' for 'face'.
   * Mutates the table (creating missing maps); the stored style is a
   * normalized clone, never the caller's object.
   */
  const setStyle = (styleTable, scope, key, style) => {
    if (!styleTable || typeof styleTable !== 'object') return;
    const clean = normalizeStyle(style);
    if (scope === 'scene') {
      styleTable.scene = clean;
    } else if (scope === 'object') {
      if (key == null) return;
      if (!styleTable.byObject || typeof styleTable.byObject !== 'object') styleTable.byObject = {};
      styleTable.byObject[String(key)] = clean;
    } else if (scope === 'face') {
      if (key == null) return;
      if (!styleTable.byFace || typeof styleTable.byFace !== 'object') styleTable.byFace = {};
      styleTable.byFace[String(key)] = clean;
    }
  };

  /**
   * Clear the style for a scope. 'scene' resets to the default style;
   * 'object' / 'face' delete the map entry (resolution falls through to the
   * next broader scope).
   */
  const clearStyle = (styleTable, scope, key) => {
    if (!styleTable || typeof styleTable !== 'object') return;
    if (scope === 'scene') {
      styleTable.scene = defaultStyle();
    } else if (scope === 'object') {
      if (styleTable.byObject && key != null) delete styleTable.byObject[String(key)];
    } else if (scope === 'face') {
      if (styleTable.byFace && key != null) delete styleTable.byFace[String(key)];
    }
  };

  const api = { resolve, setStyle, clearStyle, defaultStyle };

  // Merge — don't replace — the Scene3D namespace (Charts/Mesh already live there).
  const Vectura = (globalScope.Vectura = globalScope.Vectura || {});
  Vectura.Scene3D = Vectura.Scene3D || {};
  Vectura.Scene3D.StyleCascade = {
    ...(Vectura.Scene3D.StyleCascade || {}),
    ...api,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
