const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

// Params that are sub-keys of rangeDual controls (not top-level control IDs)
// and internal/structural params that intentionally have no standalone slider
const SKIP_PARAMS = new Set([
  'label',
  'preset',
  // Noise rack — handled by noiseList control, not individual sliders
  'noises', 'noiseType', 'amplitude', 'noiseScale',
  'noiseOffsetX', 'noiseOffsetY', 'noiseLayer', 'noiseRadius',
  // Post-processing — handled by common controls, not rings-specific
  'smoothing', 'simplify', 'curves',
  // rangeDual sub-keys (the parent rangeDual entry covers both)
  'breakRadiusMin', 'breakRadiusMax',
  'breakWidthMin', 'breakWidthMax',
  'rayMinLength', 'rayMaxLength',
  'knotMinSize', 'knotMaxSize',
]);

function extractRingsDefaults(defaultsSource) {
  // Evaluate the IIFE to get ALGO_DEFAULTS.rings
  const sandbox = { window: { Vectura: {} } };
  const fn = new Function('window', defaultsSource);
  fn(sandbox.window);
  return sandbox.window.Vectura.ALGO_DEFAULTS?.rings || {};
}

function extractRingsControlIds(uiSource) {
  // Find the rings: [...] array inside CONTROL_DEFS and collect all { id: '...' } entries
  const controlDefsMatch = uiSource.match(/const CONTROL_DEFS\s*=\s*\{([\s\S]*?)^\s*\};/m);
  if (!controlDefsMatch) return new Set();

  // Find the rings array within CONTROL_DEFS
  const ringsMatch = uiSource.match(/rings\s*:\s*\[([\s\S]*?)\],\s*\n\s*topo\s*:/);
  if (!ringsMatch) return new Set();

  const ringsBody = ringsMatch[1];
  const ids = new Set();
  // Match id: 'someId' or id: "someId"
  const idPattern = /\bid\s*:\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = idPattern.exec(ringsBody)) !== null) {
    ids.add(m[1]);
  }
  // Also capture minKey/maxKey from rangeDual (they map to the param directly)
  const minKeyPattern = /\bminKey\s*:\s*['"]([^'"]+)['"]/g;
  const maxKeyPattern = /\bmaxKey\s*:\s*['"]([^'"]+)['"]/g;
  while ((m = minKeyPattern.exec(ringsBody)) !== null) ids.add(m[1]);
  while ((m = maxKeyPattern.exec(ringsBody)) !== null) ids.add(m[1]);

  return ids;
}

describe('Rings UI controls coverage', () => {
  let defaultsSource;
  let uiSource;
  let ringsDefaults;
  let controlIds;

  beforeAll(() => {
    defaultsSource = fs.readFileSync(path.join(ROOT, 'src/config/defaults.js'), 'utf8');
    uiSource = fs.readFileSync(path.join(ROOT, 'src/ui/ui.js'), 'utf8');
    ringsDefaults = extractRingsDefaults(defaultsSource);
    controlIds = extractRingsControlIds(uiSource);
  });

  test('ALGO_DEFAULTS.rings is non-empty', () => {
    expect(Object.keys(ringsDefaults).length).toBeGreaterThan(10);
  });

  test('rings CONTROL_DEFS has controls', () => {
    expect(controlIds.size).toBeGreaterThan(10);
  });

  test('every rings default param has a UI control', () => {
    const missing = [];
    for (const key of Object.keys(ringsDefaults)) {
      if (SKIP_PARAMS.has(key)) continue;
      if (!controlIds.has(key)) missing.push(key);
    }
    if (missing.length) {
      console.error('Missing UI controls for rings params:', missing);
    }
    expect(missing).toEqual([]);
  });

  test('all four new feature groups have count controls', () => {
    expect(controlIds.has('vMarkCount')).toBe(true);
    expect(controlIds.has('scarCount')).toBe(true);
    expect(controlIds.has('thickRingCount')).toBe(true);
    expect(controlIds.has('crackCount')).toBe(true);
  });

  test('all four new feature groups have sub-param controls', () => {
    // V-Markings
    expect(controlIds.has('vMarkDepth')).toBe(true);
    expect(controlIds.has('vMarkSpread')).toBe(true);
    expect(controlIds.has('vMarkSize')).toBe(true);
    expect(controlIds.has('vMarkSeed')).toBe(true);
    // Scars
    expect(controlIds.has('scarDepth')).toBe(true);
    expect(controlIds.has('scarWidth')).toBe(true);
    expect(controlIds.has('scarSize')).toBe(true);
    expect(controlIds.has('scarSeed')).toBe(true);
    // Thick rings
    expect(controlIds.has('thickRingDensity')).toBe(true);
    expect(controlIds.has('thickRingWidth')).toBe(true);
    expect(controlIds.has('thickRingSeed')).toBe(true);
    // Cracks
    expect(controlIds.has('crackDepth')).toBe(true);
    expect(controlIds.has('crackSpread')).toBe(true);
    expect(controlIds.has('crackNoise')).toBe(true);
    expect(controlIds.has('crackSeed')).toBe(true);
  });

  test('showIf conditions for new features reference correct param keys', () => {
    // Extract showIf sources from the rings block and verify they reference the right count param
    const ringsMatch = uiSource.match(/rings\s*:\s*\[([\s\S]*?)\],\s*\n\s*topo\s*:/);
    expect(ringsMatch).not.toBeNull();
    const ringsBody = ringsMatch[1];

    // vMarkDepth showIf should check vMarkCount
    expect(ringsBody).toMatch(/vMarkDepth[\s\S]{0,200}vMarkCount/);
    // scarDepth showIf should check scarCount
    expect(ringsBody).toMatch(/scarDepth[\s\S]{0,200}scarCount/);
    // thickRingDensity showIf should check thickRingCount
    expect(ringsBody).toMatch(/thickRingDensity[\s\S]{0,200}thickRingCount/);
    // crackDepth showIf should check crackCount
    expect(ringsBody).toMatch(/crackDepth[\s\S]{0,200}crackCount/);
  });
});
