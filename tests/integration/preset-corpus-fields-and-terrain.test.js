/**
 * Whole-preset corpus canary (R-34), part 3 of 4. Every bundled preset of the
 * systems below is applied through the UI, exported, saved and reopened; see
 * tests/helpers/preset-corpus.js. The four parts are balanced by run time and
 * tests/unit/preset-corpus-roster.test.js checks they cover every system once.
 */
const { definePresetCorpusSuite } = require('../helpers/preset-corpus');

definePresetCorpusSuite('fields-and-terrain', ['flowfield', 'terrain', 'topo', 'text', 'spiral', 'phylla', 'attractor']);
