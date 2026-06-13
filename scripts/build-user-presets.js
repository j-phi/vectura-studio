#!/usr/bin/env node
/**
 * Regenerates src/config/user-presets.js — the SINGLE source of truth for the
 * preset library — from .vectura files placed in any per-algorithm subdirectory
 * of user-presets/ (e.g. user-presets/pendula/, user-presets/flowfield/, …).
 * The reserved user-presets/wallpaper/ directory is skipped — wallpaper recipes
 * are bundled by build-user-wallpaper-recipes.js.
 *
 * Usage: npm run user-presets:bundle
 *
 * IMPORTANT — directory naming: the subdirectory name must EXACTLY match the
 * layer "type" field in the .vectura file, which is the same as preset_system.
 * Many names are camelCase: shapePack, svgDistort, petalisDesigner. A snake_case
 * or lowercase variant will not match and the preset will be silently skipped.
 *
 * For each .vectura file the script finds the first layer whose type matches
 * the directory name, strips transform keys, and emits a preset object. A file
 * may declare a top-level "id" and/or "group" to control the preset's identity
 * and gallery category; absent those it falls back to a computed user id and the
 * "User" group. The name defaults to the title-cased filename stem; a top-level
 * "name" overrides it.
 *
 * Factory "Default" markers: every algorithm whose ALGO_DEFAULTS[type].preset is
 * "<type-lowercased>-default" gets an empty-params "<type>-default" preset
 * synthesized here (Classic group, first in the list) — they are byte-identical
 * to factory state and double as a one-click reset, so they are NOT stored as
 * files. The mapping is read from src/config/defaults.js.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO_ROOT = path.resolve(__dirname, '..');
const OUTPUT_PATH = path.join(REPO_ROOT, 'src/config/user-presets.js');
const USER_PRESETS_DIR = path.join(REPO_ROOT, 'user-presets');

// Keys that belong to the layer's canvas placement, not the algorithm look.
// NOTE: `seed` is deliberately NOT stripped — for stochastic algorithms the seed
// IS part of the look, and some curated presets pin one to lock a specific
// arrangement. (Gallery-saved user presets strip their own seed upstream.)
const TRANSFORM_KEYS = new Set(['posX', 'posY', 'scaleX', 'scaleY', 'rotation']);

// Reserved subdirectories that are not algorithm preset systems.
const RESERVED_DIRS = new Set(['wallpaper']);

const toTitleCase = (str) =>
  str
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

const slugify = (str) =>
  str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const stripTransformKeys = (params) => {
  const out = {};
  for (const [k, v] of Object.entries(params || {})) {
    if (!TRANSFORM_KEYS.has(k)) out[k] = v;
  }
  return out;
};

// ── Synthesize factory "Default" markers from ALGO_DEFAULTS ────────────────────
// defaults.js is a browser IIFE; evaluate it in a window-shimmed sandbox to read
// each algorithm's declared default-preset id without importing browser globals.
const readAlgoDefaults = () => {
  try {
    const sandbox = { window: {} };
    sandbox.globalThis = sandbox;
    sandbox.self = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(
      fs.readFileSync(path.join(REPO_ROOT, 'src/config/defaults.js'), 'utf8'),
      sandbox,
      { filename: 'src/config/defaults.js' }
    );
    return (sandbox.window.Vectura && sandbox.window.Vectura.ALGO_DEFAULTS) || {};
  } catch (e) {
    console.warn(`[user-presets:bundle] Could not read ALGO_DEFAULTS — no default markers synthesized (${e.message})`);
    return {};
  }
};

const ALGO_DEFAULTS = readAlgoDefaults();

// system -> its default preset id (from ALGO_DEFAULTS[type].preset). Drives both
// the synthesized "<type>-default" markers and floating a curated default preset
// to the front of its system's list (a fresh layer must show its default first).
const defaultIdBySystem = {};
for (const [type, def] of Object.entries(ALGO_DEFAULTS)) {
  if (def && typeof def === 'object' && typeof def.preset === 'string') {
    defaultIdBySystem[type] = def.preset;
  }
}

const synthesizeDefaults = () => {
  const out = [];
  for (const [type, def] of Object.entries(ALGO_DEFAULTS)) {
    if (!def || typeof def !== 'object') continue;
    if (def.preset === `${type.toLowerCase()}-default`) {
      out.push({ id: def.preset, name: 'Default', preset_system: type, group: 'Classic', params: {} });
    }
  }
  // Stable, deterministic ordering by id.
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
};

// Discover every algorithm subdirectory under user-presets/ (dir name == system
// == layer type). Absent directory → no file presets, only synthesized defaults.
const SYSTEMS = fs.existsSync(USER_PRESETS_DIR)
  ? fs.readdirSync(USER_PRESETS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !RESERVED_DIRS.has(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b))
  : [];

// Synthesized factory defaults come first so they render first in the Classic
// group; file presets follow.
const presets = [...synthesizeDefaults()];

for (const system of SYSTEMS) {
  const dir = path.join(REPO_ROOT, 'user-presets', system);
  if (!fs.existsSync(dir)) continue;

  const files = fs.readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.vectura'))
    .sort((a, b) => a.localeCompare(b));

  const systemPresets = [];
  for (const file of files) {
    const filePath = path.join(dir, file);
    let doc;
    try {
      doc = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
      console.warn(`[user-presets:bundle] Skipping ${file}: JSON parse error — ${e.message}`);
      continue;
    }

    const layers = Array.isArray(doc.layers) ? doc.layers : [];
    const layer = layers.find((l) => l.type === system);
    if (!layer) {
      console.warn(`[user-presets:bundle] Skipping ${file}: no ${system} layer found`);
      continue;
    }

    const stem = path.basename(file, '.vectura');
    const name = (typeof doc.name === 'string' && doc.name.trim()) || toTitleCase(stem);
    // Identity/category come from the canonical PresetSync meta block, falling
    // back to top-level keys (hand-made files), then a computed user id + group.
    const meta = (doc.meta && typeof doc.meta === 'object') ? doc.meta : {};
    const id = (typeof meta.presetId === 'string' && meta.presetId.trim())
      || (typeof doc.id === 'string' && doc.id.trim())
      || `${system}-user-${slugify(stem)}`;
    const group = (typeof meta.group === 'string' && meta.group.trim())
      || (typeof doc.group === 'string' && doc.group.trim())
      || 'User';
    const params = stripTransformKeys(layer.params || {});
    
    // Validate keys against ALGO_DEFAULTS
    const defaults = ALGO_DEFAULTS[system] || {};
    for (const key of Object.keys(params)) {
      if (!(key in defaults) && key !== 'seed' && !TRANSFORM_KEYS.has(key)) {
        console.warn(`[user-presets:bundle] Warning: ${file} contains unknown key '${key}' for ${system}. Stripping it.`);
        delete params[key];
      }
    }

    systemPresets.push({ id, name, preset_system: system, group, params });
  }

  // Float this system's default preset to the front so a fresh layer shows it
  // first in the gallery (the synthesized "<type>-default" markers are already
  // emitted up front; this covers systems whose default IS a curated file).
  const defaultId = defaultIdBySystem[system];
  if (defaultId) {
    const di = systemPresets.findIndex((p) => p.id === defaultId);
    if (di > 0) systemPresets.unshift(systemPresets.splice(di, 1)[0]);
  }

  for (const p of systemPresets) {
    presets.push(p);
    console.log(`[user-presets:bundle] Added: ${p.id} ("${p.name}") [${p.group}]`);
  }
}

const presetsJson = JSON.stringify(presets, null, 2)
  .split('\n')
  .map((line) => '    ' + line)
  .join('\n')
  .trim();

const output = `(() => {
  'use strict';
  // Auto-generated by scripts/build-user-presets.js — do not edit manually.
  // The user-presets/ file tree is the single source of truth for the preset
  // library. To add/edit presets: drop or edit .vectura files in
  // user-presets/<algorithm>/ (directory name == layer type), then run:
  //   npm run user-presets:bundle
  const Vectura = (window.Vectura = window.Vectura || {});
  if (!Array.isArray(Vectura.PRESETS)) Vectura.PRESETS = [];
  Vectura.PRESETS.push(...${presetsJson});
})();
`;

fs.writeFileSync(OUTPUT_PATH, output, 'utf8');
console.log(`[user-presets:bundle] Wrote ${presets.length} preset(s) to src/config/user-presets.js`);
