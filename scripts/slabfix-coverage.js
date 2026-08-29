/* SLAB FIX — contract C2 coverage (same method as scripts/judge-c-coverage.js), measured on REAL ribbon regions from the app.
 *   node scripts/slabfix-coverage.js <url> <outDir>
 * Hooks Vectura.PenFill.fillRegion during a real scene3d build, then rasterizes
 * every captured (region, paths) pair at 20 px/mm (6 samples per 0.3 mm pen).
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');

const URL = process.argv[2] || 'http://localhost:8414';
const outDir = process.argv[3] || path.resolve(__dirname, '..', 'docs', 'slab-fix-evidence');

const SPHERE = { id: 'ball', name: 'Ball', primitive: 'sphere', params: { radius: 46, detail: 26 },
  transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' };
const SUN = { id: 'sun', type: 'directional', azimuth: 90, elevation: 30, intensity: 1, castShadows: false };
const CAMERA = { projection: 'orthographic', yaw: 0, pitch: 0, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };

const STYLES = ['spiral', 'concentric', 'serpentine', 'contourParallel'];
const LAWS = ['taperedEnds', 'trochoidLoop', 'onePenDown'];

async function run(page, law, style) {
  return page.evaluate(async ({ SPHERE, SUN, CAMERA, law, style }) => {
    const app = window.app; const engine = app.engine; const V = window.Vectura;
    const caps = [];
    const PF = V.PenFill; const oFill = PF.fillRegion;
    PF.fillRegion = function (region, penWidth, st, o) {
      const r = oFill.apply(this, arguments);
      caps.push({ region: (region || []).map((g) => g.map((p) => [p.x, p.y])), penWidth, st,
        paths: ((r && r.paths) || []).map((p) => p.map((q) => [q.x, q.y])),
        reported: (r && typeof r.coverage === 'number') ? r.coverage : null });
      return r;
    };
    engine.layers = [];
    const gid = engine.addLayer('scene3d');
    engine.layers = engine.layers.filter((l) => l.parentId !== gid);
    const g = engine.layers.find((l) => l.id === gid);
    g.isGroup = true; g.containerRole = 'scene';
    const p = g.params;
    p.camera = CAMERA; p.ground = { enabled: false }; p.backdrop = { enabled: false };
    p.objects = [SPHERE]; p.lights = [SUN]; p.strokeFillStyle = style;
    const base = { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 60, toneLaw: law } };
    p.styleTable = { scene: JSON.parse(JSON.stringify(base)), byObject: { ball: JSON.parse(JSON.stringify(base)) }, byFace: {} };
    engine.computeAllDisplayGeometry();
    PF.fillRegion = oFill;

    // ── measure each captured region ────────────────────────────────────────
    const PPM = 20;                       // 0.05 mm/px -> 6 samples across a 0.3 mm pen
    const res = [];
    caps.forEach((c, idx) => {
      let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
      c.region.forEach((g2) => g2.forEach((q) => {
        if (q[0] < minx) minx = q[0]; if (q[0] > maxx) maxx = q[0];
        if (q[1] < miny) miny = q[1]; if (q[1] > maxy) maxy = q[1];
      }));
      if (!(maxx > minx)) return;
      const pad = c.penWidth * 2;
      const W = Math.ceil((maxx - minx + pad * 2) * PPM); const H = Math.ceil((maxy - miny + pad * 2) * PPM);
      if (W < 2 || H < 2 || W * H > 6e6) return;
      const X = (v) => (v - minx + pad) * PPM; const Y = (v) => (v - miny + pad) * PPM;
      const mk = () => { const cv = document.createElement('canvas'); cv.width = W; cv.height = H; return cv; };
      const rc = mk(); const rx = rc.getContext('2d');
      rx.fillStyle = '#000'; rx.beginPath();
      c.region.forEach((g2) => { rx.moveTo(X(g2[0][0]), Y(g2[0][1])); for (let i = 1; i < g2.length; i++) rx.lineTo(X(g2[i][0]), Y(g2[i][1])); rx.closePath(); });
      rx.fill('nonzero');
      const ic = mk(); const ix = ic.getContext('2d');
      ix.lineCap = 'round'; ix.lineJoin = 'round'; ix.strokeStyle = '#000'; ix.lineWidth = c.penWidth * PPM;
      let inkLen = 0;
      c.paths.forEach((q) => {
        ix.beginPath(); ix.moveTo(X(q[0][0]), Y(q[0][1]));
        for (let i = 1; i < q.length; i++) { ix.lineTo(X(q[i][0]), Y(q[i][1])); inkLen += Math.hypot(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]); }
        ix.stroke();
      });
      const rb = rx.getImageData(0, 0, W, H).data; const ib = ix.getImageData(0, 0, W, H).data;
      const N = W * H; const reg = new Uint8Array(N); const ink = new Uint8Array(N);
      let ra = 0, ca = 0;
      for (let i = 0, j = 3; i < N; i++, j += 4) {
        reg[i] = rb[j] > 96 ? 1 : 0; ink[i] = ib[j] > 96 ? 1 : 0;
        if (reg[i]) { ra++; if (ink[i]) ca++; }
      }
      if (ra < 4) return;
      // largest uncovered blob inside the region (4-connected flood)
      const seen = new Uint8Array(N); let biggest = 0; const stack = [];
      for (let s = 0; s < N; s++) {
        if (seen[s] || !reg[s] || ink[s]) continue;
        let sz = 0; stack.length = 0; stack.push(s); seen[s] = 1;
        while (stack.length) {
          const k = stack.pop(); sz++;
          const x = k % W; const y = (k - x) / W;
          if (x > 0) { const t = k - 1; if (!seen[t] && reg[t] && !ink[t]) { seen[t] = 1; stack.push(t); } }
          if (x < W - 1) { const t = k + 1; if (!seen[t] && reg[t] && !ink[t]) { seen[t] = 1; stack.push(t); } }
          if (y > 0) { const t = k - W; if (!seen[t] && reg[t] && !ink[t]) { seen[t] = 1; stack.push(t); } }
          if (y < H - 1) { const t = k + W; if (!seen[t] && reg[t] && !ink[t]) { seen[t] = 1; stack.push(t); } }
        }
        if (sz > biggest) biggest = sz;
      }
      const px2 = 1 / (PPM * PPM);
      res.push({ i: idx, regionMm2: +(ra * px2).toFixed(4), coveredMm2: +(ca * px2).toFixed(4),
        cov: +(ca / ra).toFixed(4), reported: c.reported,
        gapMm2: +(biggest * px2).toFixed(5), gapLimit: +((c.penWidth / 2) ** 2).toFixed(5),
        inkMm: +inkLen.toFixed(3), paths: c.paths.length,
        overdraw: +((inkLen * c.penWidth) / Math.max(1e-9, ca * px2)).toFixed(3) });
    });
    return { law, style, calls: caps.length, measured: res.length, res };
  }, { SPHERE, SUN, CAMERA, law, style });
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  page.on('pageerror', (e) => console.log('PAGEERR', String(e).slice(0, 200)));
  await page.goto(`${URL}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.app && window.app.engine && window.app.renderer, null, { timeout: 90000 });
  console.log('version', await page.evaluate(() => window.Vectura.APP_VERSION));

  const all = {};
  for (const law of LAWS) for (const style of STYLES) {
    const r = await run(page, law, style);
    const tot = r.res.reduce((a, b) => a + b.regionMm2, 0);
    const cov = r.res.reduce((a, b) => a + b.coveredMm2, 0);
    const ink = r.res.reduce((a, b) => a + b.inkMm, 0);
    const worst = r.res.slice().sort((a, b) => a.cov - b.cov)[0] || null;
    const maxGap = r.res.reduce((a, b) => Math.max(a, b.gapMm2), 0);
    const fail = r.res.filter((x) => x.cov < 0.995).length;
    const gapFail = r.res.filter((x) => x.gapMm2 >= x.gapLimit).length;
    const sortedC = r.res.map((x) => x.cov).sort((a, b) => a - b);
    const key = `${law}/${style}`;
    all[key] = { calls: r.calls, measured: r.measured, regionMm2: +tot.toFixed(1), coveredMm2: +cov.toFixed(1),
      areaWeightedCov: +(cov / Math.max(1e-9, tot)).toFixed(4), inkMm: +ink.toFixed(1),
      overdraw: +((ink * 0.3) / Math.max(1e-9, cov)).toFixed(3),
      regionsBelow995: fail, regionsGapFail: gapFail, maxGapMm2: maxGap, gapLimitMm2: 0.0225,
      covP01: sortedC[Math.floor(sortedC.length * 0.01)] ?? null, covMin: sortedC[0] ?? null,
      covMedian: sortedC[Math.floor(sortedC.length / 2)] ?? null,
      worst };
    console.log(key.padEnd(28), 'n', String(r.measured).padStart(4),
      'cov', all[key].areaWeightedCov, 'min', all[key].covMin, '<995:', fail,
      'maxGap', maxGap, 'ink', all[key].inkMm, 'overdraw', all[key].overdraw);
  }
  fs.writeFileSync(path.join(outDir, 'coverage.json'), JSON.stringify(all, null, 2));
  await browser.close();
})();
