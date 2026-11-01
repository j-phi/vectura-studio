/*
 * The real Pen Studio copy (UI_CONSTANTS.PEN_STUDIO) and config
 * (Vectura.PEN_STUDIO) evaluated in a throwaway vm context, so stub-based
 * view tests read the same strings and numbers the app ships.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '../..');
let cached = null;

const load = () => {
  if (cached) return cached;
  const win = {};
  win.window = win; win.globalThis = win;
  const ctx = vm.createContext(win);
  ['src/config/ui-constants.js', 'src/config/pen-studio.js'].forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  });
  cached = { strings: win.Vectura.UI_CONSTANTS.PEN_STUDIO, config: win.Vectura.PEN_STUDIO };
  return cached;
};

module.exports = { load };
