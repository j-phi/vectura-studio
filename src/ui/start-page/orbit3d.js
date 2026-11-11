/* ===================== StartPageOrbit3D: which pieces are 3D =====================
 * window.Vectura.StartPageOrbit3D.modelFor(type, presetId) -> a model id, or null when the piece is not 3D.
 *   topoform -> torus, spiralizer -> coiled-sphere, terrain -> terrain (terrain-alpine when the preset id says alpine),
 *   polyhedron -> icosahedron, scene3d / object3d -> 'scene:<presetId>', or 'scene:<key>' for a scene registered with
 *   registerScene(key, sceneFromDoc(payload), name) (a saved work's own scene), anything else -> null.
 * The id only MARKS the piece as 3D: the Start Page draws every piece, 3D or not, as a still drawing (a 3D piece is framed on its
 * body, see plates/layouts.js). Nothing turns, sways or drags any more; the live model and the scene orbit were retired. */
(function (W) {
  'use strict';
  const Vectura = (W.Vectura = W.Vectura || {});
  if (Vectura.StartPageOrbit3D) return;
  const SCENE_TYPES = { scene3d: 1, object3d: 1 };
  const presetById = id => { try { return (Vectura.PRESETS || []).find(p => p && p.id === id) || null; } catch (e) { return null; } };
  const sceneOf = preset => {
    const P = preset && preset.params; if (!P) return null;
    if (preset.preset_system === 'object3d' || (P.primitive && !Array.isArray(P.objects))) return { objects: [P], camera: P.camera, ground: P.ground };
    return Array.isArray(P.objects) ? P : null;
  };
  /* scenes registered at run time (a saved work's own scene, see registerScene / sceneFromDoc), by key */
  const SCENES = {};
  /* The first 3D Scene in a saved .vectura payload: a monolith scene3d layer's params, or a scene group's tree
   * collected back into that shape (Scene3D.Params.collectSceneParams, as the engine's compositor does). Null if none. */
  function sceneFromDoc(doc) {
    const st = doc && (doc.state || doc), eng = st && (st.engine || st), layers = eng && Array.isArray(eng.layers) ? eng.layers : null;
    if (!layers) return null;
    const live = l => l && l.visible !== false && l.params;
    const mono = layers.find(l => live(l) && l.type === 'scene3d' && !l.isGroup && Array.isArray(l.params.objects) && l.params.objects.length);
    if (mono) return mono.params;
    const g = layers.find(l => l && l.type === 'scene3d' && l.isGroup && l.containerRole === 'scene' && l.visible !== false);
    if (!g) return null;
    const kids = id => layers.filter(l => l && l.parentId === id), collected = [];
    const walk = id => kids(id).forEach(l => { if (!live(l)) return;
      if (l.type === 'object3d') collected.push({ kind: 'object', id: l.id, params: l.params });
      else if (l.type === 'booleanGroup3d') collected.push({ kind: 'boolean', id: l.id, params: l.params, children: kids(l.id).filter(c => c && c.type === 'object3d').map(c => c.id) });
      else if (l.type === 'sceneLight3d') collected.push({ kind: 'light', id: l.id, params: l.params });
      else if (l.type === 'sceneGround3d') collected.push({ kind: 'ground', id: l.id, params: l.params });
      if (l.isGroup) walk(l.id); });
    walk(g.id);
    const Params = Vectura.Scene3D && Vectura.Scene3D.Params, gp = g.params || {};
    let scene = null; try { scene = Params && typeof Params.collectSceneParams === 'function' ? Params.collectSceneParams(gp, collected) : null; } catch (e) { scene = null; }
    if (!scene) scene = Object.assign({}, gp, { objects: (gp.objects || []).concat(collected.filter(c => c.kind === 'object').map(c => c.params)), ground: { enabled: collected.some(c => c.kind === 'ground') } });
    return Array.isArray(scene.objects) && scene.objects.length ? scene : null;
  }
  /* a scene worth turning: one with at least one object */
  function sceneModel(id) {
    const reg = SCENES[id] || null, scene = reg ? reg.scene : sceneOf(presetById(id));
    return !!(scene && Array.isArray(scene.objects) && scene.objects.some(o => o && typeof o === 'object'));
  }
  const SCENE = /^scene:/;
  /* a 'scene:<key>' id counts only while its scene has an object */
  const SCENE_OK = {};
  const sceneOK = m => { if (!(m in SCENE_OK)) SCENE_OK[m] = sceneModel(m.slice(6)); return !!SCENE_OK[m]; };
  /* register (or refresh) a scene under `key`; modelFor(type, key) then gives 'scene:<key>'. Returns that id, or null */
  const registerScene = (key, scene, name) => {
    key = String(key || ''); if (!key || !scene || typeof scene !== 'object') return null;
    SCENES[key] = { scene, name: name || 'Scene' }; delete SCENE_OK['scene:' + key];
    return sceneOK('scene:' + key) ? 'scene:' + key : null;
  };
  const MAP = { topoform: 'torus', spiralizer: 'coiled-sphere', terrain: 'terrain', polyhedron: 'icosahedron' };
  const ALPINE = /alpine/i;
  /* Vectura algorithm type (+ optional preset id) -> model name, or null when the piece is not 3D. */
  const modelFor = (type, presetId) => {
    const t = String(type || '').toLowerCase();
    if (presetId && SCENES[presetId]) return sceneOK('scene:' + presetId) ? 'scene:' + presetId : null; /* a registered scene, whatever its label */
    if (SCENE_TYPES[t]) { const id = presetId ? 'scene:' + presetId : ''; return id && sceneOK(id) ? id : null; }
    const m = MAP[t] || null;
    return m === 'terrain' && presetId && ALPINE.test(String(presetId)) ? 'terrain-alpine' : m;
  };


  Vectura.StartPageOrbit3D = { modelFor, registerScene, sceneFromDoc, isScene: m => SCENE.test(String(m || '')), MAP };
})(window);
