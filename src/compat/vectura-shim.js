import { MACHINES } from '../config/machines.js';
import { ALGO_DEFAULTS, SETTINGS, NOISE_IMAGES } from '../config/defaults.js';
import { PALETTES } from '../config/palettes.js';
import { PRESETS, PETALIS_PRESETS } from '../config/presets.js';
import { DESCRIPTIONS } from '../config/descriptions.js';
import { SeededRNG } from '../core/rng.js';
import { SimpleNoise } from '../core/noise.js';
import { Layer } from '../core/layer.js';
import { Algorithms } from '../core/algorithms/index.js';
import { VectorEngine } from '../core/engine.js';
import { Renderer } from '../render/renderer.js';
import { UI } from '../ui/ui.js';
import { App } from '../app/app.js';

export const installWindowVecturaShim = () => {
  if (typeof window === 'undefined') return null;

  window.Vectura = {
    MACHINES,
    ALGO_DEFAULTS,
    SETTINGS,
    NOISE_IMAGES,
    PALETTES,
    PRESETS,
    PETALIS_PRESETS,
    DESCRIPTIONS,
    SeededRNG,
    SimpleNoise,
    Layer,
    Algorithms,
    VectorEngine,
    Renderer,
    UI,
    App,
  };

  return window.Vectura;
};
