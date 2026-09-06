/* W-30 evidence — shadow-RECEIVE direction for non-directional lights
 * (docs/3d-audit/STILL-OPEN.md W-30 / lane-reports/UnitD-phase-review.md
 * §4). No gallery cell exercises this (shadowReceiveOnObjects is default
 * OFF, and no cell scene uses a point/spot/area light with it ON), so this
 * is a bespoke diagram, not a `scene3d-capture.js` gallery re-shoot.
 *
 * `scene3d.js`'s `buildFaceFootprint` (the RECEIVE footprint on a flat
 * receiver face) is owned by a different lane in this audit round and is
 * NOT touched by this fix — it still always projects along the PARALLEL
 * `Regions.Lighting.lightWorldDir(light)` direction, which reads
 * `light.azimuth`/`light.elevation` regardless of `light.type` and falls
 * back to its own DEFAULT (135deg/45deg) for a point/spot/area light (which
 * carries `position` instead). This script draws exactly that: the OLD
 * (still-production) footprint direction next to the NEW
 * `Shadows.projectLightToPlane` direction this fix adds as a reusable,
 * tested primitive — for the SAME light, same caster, same receiver wall.
 *
 * Geometry mirrors tests/unit/scene3d-shadow-footprint-direction.test.js
 * exactly (same positions) so the picture and the assertions describe the
 * same scene. A simple oblique (cavalier) projection — screenX = X - 0.35*Z,
 * screenY = -Y + 0.2*Z — gives a legible 2.5D read without a real camera.
 *
 *   node scripts/w30-footprint-direction-evidence.js [outDir]
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');
const { loadVecturaRuntime } = require('../tests/helpers/load-vectura-runtime');

const outDir = process.argv[2] || path.resolve(__dirname, '..', '..', '..', '..', 'docs', '3d-audit', 'fill-audit', 'after', 'W-30');

const v = (x, y, z) => ({ x, y, z });
const sub = (a, b) => v(a.x - b.x, a.y - b.y, a.z - b.z);
const norm = (a) => { const len = Math.hypot(a.x, a.y, a.z) || 1; return v(a.x / len, a.y / len, a.z / len); };
const angleBetweenDeg = (a, b) => {
  const na = norm(a); const nb = norm(b);
  const dot = na.x * nb.x + na.y * nb.y + na.z * nb.z;
  return Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
};
const DEG = Math.PI / 180;
const DEFAULT_LIGHT_DIR = (() => {
  const az = 135 * DEG; const el = 45 * DEG; const cosEl = Math.cos(el);
  return norm(v(-cosEl * Math.sin(az), -Math.sin(el), -cosEl * Math.cos(az)));
})();
const casterRimPoints = (center, radius) => {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const theta = (i * 60) * DEG;
    pts.push(v(center.x + radius * Math.cos(theta), center.y + radius * Math.sin(theta), center.z));
  }
  return pts;
};
const centroid = (pts) => {
  const s = pts.reduce((acc, p) => v(acc.x + p.x, acc.y + p.y, acc.z + p.z), v(0, 0, 0));
  return v(s.x / pts.length, s.y / pts.length, s.z / pts.length);
};

const CASTER_CENTER = v(0, 40, 0);
const CASTER_R = 15;
const WALL_ANCHOR = v(-100, 40, 0);
const WALL_NORMAL = v(1, 0, 0);
const WALL_Y_RANGE = [0, 90];
const WALL_Z_RANGE = [-60, 60];

const LIGHTS = {
  point: { id: 'p1', type: 'point', position: v(80, 100, 0) },
  spot: {
    id: 's1', type: 'spot', position: v(90, 70, -140), target: v(0, 0, 0), coneAngle: 45, penumbra: 10,
  },
  area: { id: 'a1', type: 'area', position: v(80, 100, 0), size: 60, samples: 6 },
  directional: { id: 'sun', type: 'directional', azimuth: 90, elevation: 25 },
};

// oblique (cavalier) projection to a 2D plotting plane
const proj = (p) => ({ x: p.x - 0.35 * p.z, y: -p.y + 0.2 * p.z });

function buildScene(Shadows, Lighting, light) {
  const casterPts = casterRimPoints(CASTER_CENTER, CASTER_R);
  const fallbackDir = light.type === 'directional' && Lighting
    ? Lighting.lightWorldDir(light)
    : DEFAULT_LIGHT_DIR;
  // OLD == exactly what scene3d.js's buildFaceFootprint calls TODAY for
  // every light type (parallel projector, `fallbackDir` as `lightDir`) —
  // for directional this equals correct/expected production behaviour
  // (used here as the byte-identity control); for point/spot/area this IS
  // the bug (fallbackDir has no relation to the light's real position).
  const oldFootprint = casterPts.map((P) => Shadows.projectAlongDirToPlane(P, fallbackDir, WALL_ANCHOR, WALL_NORMAL)).filter(Boolean);
  const newFootprint = casterPts.map((P) => Shadows.projectLightToPlane(P, light, WALL_ANCHOR, WALL_NORMAL, fallbackDir)).filter(Boolean);
  const expectedDir = light.type === 'directional' ? null : sub(CASTER_CENTER, light.position);
  const oldC = oldFootprint.length ? centroid(oldFootprint) : null;
  const newC = newFootprint.length ? centroid(newFootprint) : null;
  const oldAngle = expectedDir && oldC ? angleBetweenDeg(sub(oldC, CASTER_CENTER), expectedDir) : null;
  const newAngle = expectedDir && newC ? angleBetweenDeg(sub(newC, CASTER_CENTER), expectedDir) : null;
  const identical = light.type === 'directional'
    ? JSON.stringify(oldFootprint) === JSON.stringify(newFootprint)
    : null;
  return {
    light, casterPts, oldFootprint, newFootprint, oldC, newC, oldAngle, newAngle, identical,
  };
}

function buildSvg(scene, label) {
  const {
    light, casterPts, oldFootprint, newFootprint, oldC, newC,
  } = scene;
  const pts = [
    proj(CASTER_CENTER), proj(light.position || v(0, 300, 0)),
    ...casterPts.map(proj), ...oldFootprint.map(proj), ...newFootprint.map(proj),
    proj(v(WALL_ANCHOR.x, WALL_Y_RANGE[0], WALL_ANCHOR.z)),
    proj(v(WALL_ANCHOR.x, WALL_Y_RANGE[1], WALL_ANCHOR.z)),
    proj(v(WALL_ANCHOR.x, WALL_Y_RANGE[0], WALL_Z_RANGE[0])),
    proj(v(WALL_ANCHOR.x, WALL_Y_RANGE[1], WALL_Z_RANGE[1])),
  ];
  const xs = pts.map((p) => p.x); const ys = pts.map((p) => p.y);
  const pad = 20;
  const minX = Math.min(...xs) - pad; const maxX = Math.max(...xs) + pad;
  const minY = Math.min(...ys) - pad; const maxY = Math.max(...ys) + pad;
  const w = maxX - minX; const h = maxY - minY;
  const dot = (p, r, cls) => `<circle cx="${p.x}" cy="${p.y}" r="${r}" class="${cls}"/>`;
  const line = (a, b, cls) => `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="${cls}"/>`;
  // The wall is a FULL PLANE (Y x Z extent), not just its z=0 profile — the
  // oblique projection moves a point's screenX by its worldZ too, so an OLD
  // (parallel, wrong-direction) footprint point legitimately lands at a
  // different worldZ than a NEW one and would look like it "misses" a
  // z=0-only wall line even though both are genuinely ON the plane (world
  // x=-100). Draw the actual quad so every footprint dot visibly sits on it.
  const wallQuad = [
    v(WALL_ANCHOR.x, WALL_Y_RANGE[1], WALL_Z_RANGE[0]),
    v(WALL_ANCHOR.x, WALL_Y_RANGE[1], WALL_Z_RANGE[1]),
    v(WALL_ANCHOR.x, WALL_Y_RANGE[0], WALL_Z_RANGE[1]),
    v(WALL_ANCHOR.x, WALL_Y_RANGE[0], WALL_Z_RANGE[0]),
  ].map(proj);
  const wallPoly = `<polygon points="${wallQuad.map((p) => `${p.x},${p.y}`).join(' ')}" class="wall-quad"/>`;
  const lightP = light.position ? proj(light.position) : null;
  const casterP = proj(CASTER_CENTER);
  const rays = light.type === 'directional' ? '' : [
    lightP ? line(lightP, casterP, 'ray') : '',
    lightP && oldC ? line(lightP, proj(oldC), 'ray-old') : '',
    lightP && newC ? line(lightP, proj(newC), 'ray-new') : '',
  ].join('\n');
  const rims = casterPts.map((p) => dot(proj(p), 1.5, 'rim')).join('\n');
  const oldPts = oldFootprint.map((p) => dot(proj(p), 2, 'foot-old')).join('\n');
  const newPts = newFootprint.map((p) => dot(proj(p), 2, 'foot-new')).join('\n');
  const renderW = 900;
  const renderH = Math.ceil(Math.max(300, renderW * h / w));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${w} ${h}" width="${renderW}" height="${renderH}">
  <style>
    svg { background:#101114; font-family: monospace; }
    .wall { stroke:#556; stroke-width:1.2; stroke-dasharray:3,2; }
    .wall-quad { fill:#2a3040; fill-opacity:0.55; stroke:#556; stroke-width:0.8; }
    .ray { stroke:#556; stroke-width:0.6; }
    .ray-old { stroke:#ff5566; stroke-width:1; }
    .ray-new { stroke:#33e07a; stroke-width:1; }
    .rim { fill:#8892a0; }
    .caster { fill:none; stroke:#e7ebee; stroke-width:1.2; }
    .light { fill:#ffd166; }
    .foot-old { fill:#ff5566; }
    .foot-new { fill:#33e07a; }
    text { fill:#c8ccd4; font-size:5px; }
  </style>
  ${wallPoly}
  ${rays}
  ${dot(casterP, CASTER_R * 0.5, 'caster')}
  ${rims}
  ${lightP ? dot(lightP, 3, 'light') : ''}
  ${oldPts}
  ${newPts}
  <text x="${minX + 4}" y="${minY + 8}">${label}</text>
  <text x="${minX + 4}" y="${minY + 14}" fill="#ff5566">red = OLD (production, parallel/default-dir)</text>
  <text x="${minX + 4}" y="${minY + 20}" fill="#33e07a">green = NEW (Shadows.projectLightToPlane)</text>
</svg>`;
  return { svg, width: renderW, height: renderH };
}

async function rasterize(browser, name, { svg, width, height }) {
  fs.writeFileSync(path.join(outDir, `${name}.svg`), svg);
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
  await page.screenshot({ path: path.join(outDir, `${name}.png`) });
  await page.close();
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  console.error('[w30-evidence] loading runtime...');
  const runtime = await loadVecturaRuntime();
  console.error('[w30-evidence] runtime loaded');
  const V = runtime.window.Vectura;
  const Shadows = V.Scene3D.Shadows;
  const Lighting = V.Scene3D.Regions && V.Scene3D.Lighting;

  const results = {};
  for (const [key, light] of Object.entries(LIGHTS)) {
    results[key] = buildScene(Shadows, Lighting, light);
  }
  await runtime.cleanup();
  console.error('[w30-evidence] scenes built, launching browser...');

  const browser = await chromium.launch();
  console.error('[w30-evidence] browser launched');
  try {
    for (const [key, scene] of Object.entries(results)) {
      console.error(`[w30-evidence] rasterizing ${key}...`);
      await rasterize(browser, `${key}`, buildSvg(scene, `${key} light — W-30`));
      console.error(`[w30-evidence] rasterized ${key}`);
    }
  } finally {
    await browser.close();
  }

  const report = {};
  Object.entries(results).forEach(([key, scene]) => {
    report[key] = {
      lightType: scene.light.type,
      lightPosition: scene.light.position || null,
      oldAngleDegFromExpected: scene.oldAngle,
      newAngleDegFromExpected: scene.newAngle,
      byteIdenticalOldVsNew: scene.identical,
    };
  });
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify({
    unit: 'W-30',
    note: 'buildFaceFootprint (scene3d.js) is NOT wired to the fix in this lane — production still uses OLD for every light type. This evidence shows the NEW primitive Shadows.projectLightToPlane is now available and measurably correct; wiring is a follow-up (see W-30-impl.md).',
    results: report,
  }, null, 2));
  console.log('DONE', JSON.stringify(report, null, 2));
})();
