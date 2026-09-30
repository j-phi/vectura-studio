#!/usr/bin/env node
/**
 * W-07b-2 Clause C identity sweep (re-runnable).
 *
 * Claim under test: 5eb81cfb (W-07b-2) changed deepFillTSP only. For every other
 * tone law, scene3d `generate()` output is byte-identical between the parent
 * (5eb81cfb^) and 5eb81cfb. Population: every law in SCENE3D_TONE_LAWS.IDS
 * (48 at 5eb81cfb; 47 excluding deepFillTSP) x 4 primitives x 8 mappers.
 *
 * Each revision is exported with `git archive` into a scratch dir and loaded
 * through tests/helpers/load-vectura-runtime (rootDir option). Nothing is
 * stashed or reverted in the working tree.
 *
 * Usage:
 *   node scripts/audit/w07b2-identity-sweep.js --shard 0/4 --out r0.json
 *     [--revs base=5eb81cfb^,new=5eb81cfb,head=HEAD] [--pool-rev new]
 *     [--laws a,b] [--prims sphere,torus] [--mappers hatch,contour]
 *     [--scratch DIR]
 * Merge shards / compare: node scripts/audit/w07b2-identity-sweep.js --merge r0.json,r1.json --base base --new new
 *
 * Fixture per cell (printed and stored): rig = direct scene3d generate() (no
 * addLayer/create UI rig), camera = Params.DEFAULT_CAMERA, ground DISABLED,
 * backdrop disabled, tone enabled, one directional sun (az 135, el 45,
 * intensity 1, no shadows), fillDensity 50, fillAngle 45, bounds 1200x1000
 * (margin 20, pen 0.3), one object (primitive defaults, identity transform).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const { loadVecturaRuntime } = require(path.join(ROOT, 'tests/helpers/load-vectura-runtime'));

const FIXTURE = {
  rig: 'direct algo.generate(params, null, null, bounds)',
  camera: 'Scene3D.Params.DEFAULT_CAMERA',
  ground: 'disabled', backdrop: 'disabled', tone: 'enabled',
  light: 'directional sun az135 el45 intensity1 castShadows:false',
  fillDensity: 50, fillAngle: 45,
  bounds: { width: 1200, height: 1000, m: 20, dW: 1160, dH: 960, penWidth: 0.3 },
};
const PRIMS = ['sphere', 'torus', 'cone', 'box'];
const MAPPERS = ['none', 'hatch', 'wireframe', 'crosshatch', 'contour', 'spiral', 'stipple', 'contourSlice'];

const arg = (name, dflt) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : dflt;
};
const clone = (v) => JSON.parse(JSON.stringify(v));

const exportRev = (rev, scratch) => {
  const sha = execFileSync('git', ['rev-parse', rev], { cwd: ROOT }).toString().trim();
  const dir = path.join(scratch, sha);
  if (!fs.existsSync(path.join(dir, 'index.html'))) {
    fs.mkdirSync(dir, { recursive: true });
    const tar = execFileSync('git', ['archive', sha, 'src', 'index.html'], { cwd: ROOT, maxBuffer: 1 << 30 });
    execFileSync('tar', ['-x', '-C', dir], { input: tar });
  }
  return { sha, dir };
};

const loadRev = async (rev, scratch) => {
  const { sha, dir } = exportRev(rev, scratch);
  const runtime = await loadVecturaRuntime({ rootDir: dir });
  const V = runtime.window.Vectura;
  return {
    sha, runtime, V,
    algo: V.AlgorithmRegistry.scene3d,
    defaults: V.ALGO_DEFAULTS.scene3d,
    Params: V.Scene3D.Params,
  };
};

const build = (r, toneLaw, primitive, mapper) => {
  const { defaults, Params } = r;
  const SUN = { id: 'sun', type: 'directional', azimuth: 135, elevation: 45, intensity: 1, castShadows: false };
  const p = clone(defaults);
  p.objects = [{ id: 'obj', name: 'Obj', primitive, params: clone(Params.PRIMITIVE_PARAM_DEFAULTS[primitive] || {}), transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' }];
  p.ground = { enabled: false }; p.backdrop = { enabled: false };
  p.camera = clone(Params.DEFAULT_CAMERA);
  p.tone = { ...clone(defaults).tone, enabled: true };
  p.lights = [SUN];
  p.styleTable = { scene: { penId: null, mapper, params: { fillAngle: FIXTURE.fillAngle, fillDensity: FIXTURE.fillDensity, toneLaw } }, byObject: {}, byFace: {} };
  return p;
};

const compare = (merged, baseLabel, newLabel) => {
  const same = []; const diff = [];
  for (const [cell, md5s] of Object.entries(merged.cells)) {
    (md5s[baseLabel] === md5s[newLabel] ? same : diff).push(cell);
  }
  return { same, diff };
};

const main = async () => {
  if (arg('merge')) {
    const files = arg('merge').split(',');
    const parts = files.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
    const merged = { fixture: parts[0].fixture, revs: parts[0].revs, cells: {}, shardSeconds: parts.map((p) => p.seconds) };
    parts.forEach((p) => Object.assign(merged.cells, p.cells));
    const base = arg('base', 'base'); const nw = arg('new', 'new');
    const c = compare(merged, base, nw);
    console.log(`${base} vs ${nw}: cells=${Object.keys(merged.cells).length} identical=${c.same.length} differing=${c.diff.length}`);
    c.diff.forEach((d) => console.log('  DIFF', d));
    if (arg('out')) fs.writeFileSync(arg('out'), JSON.stringify({ ...merged, base, new: nw, identical: c.same.length, differing: c.diff }, null, 1));
    return;
  }

  const scratch = arg('scratch', path.join(os.tmpdir(), 'w07b2-sweep'));
  const revSpec = (arg('revs', 'base=5eb81cfb^,new=5eb81cfb,head=HEAD')).split(',').map((s) => s.split('='));
  const poolLabel = arg('pool-rev', 'new');
  const [shardI, shardN] = (arg('shard', '0/1')).split('/').map(Number);
  const t0 = Date.now();
  const rs = {};
  for (const [label, rev] of revSpec) rs[label] = await loadRev(rev, scratch);

  const T = rs[poolLabel].V.SCENE3D_TONE_LAWS;
  let laws = arg('laws') ? arg('laws').split(',') : T.IDS.slice();
  const prims = arg('prims') ? arg('prims').split(',') : PRIMS;
  const mappers = arg('mappers') ? arg('mappers').split(',') : MAPPERS;
  const all = [];
  laws.forEach((law) => prims.forEach((prim) => mappers.forEach((m) => all.push([law, prim, m]))));
  const mine = all.filter((_, i) => i % shardN === shardI);

  const cells = {};
  mine.forEach(([law, prim, m], n) => {
    const key = `${law}|${prim}|${m}`;
    const md5s = {};
    for (const [label] of revSpec) {
      const r = rs[label];
      try {
        const paths = r.algo.generate(build(r, law, prim, m), null, null, FIXTURE.bounds);
        md5s[label] = crypto.createHash('md5').update(JSON.stringify(paths)).digest('hex');
      } catch (e) { md5s[label] = 'ERR:' + String(e && e.message).slice(0, 80); }
    }
    cells[key] = md5s;
    const eq = Object.values(md5s).every((v) => v === Object.values(md5s)[0]);
    console.log(`[${shardI}/${shardN}] ${n + 1}/${mine.length} law=${law} prim=${prim} mapper=${m} density=${FIXTURE.fillDensity} ground=off ${eq ? 'same' : 'DIFF ' + JSON.stringify(md5s)}`);
  });

  const seconds = Math.round((Date.now() - t0) / 1000);
  const out = { fixture: FIXTURE, revs: Object.fromEntries(Object.entries(rs).map(([k, v]) => [k, v.sha])), shard: `${shardI}/${shardN}`, total: all.length, seconds, cells };
  if (arg('out')) fs.writeFileSync(arg('out'), JSON.stringify(out));
  Object.values(rs).forEach((r) => r.runtime.cleanup());
  console.log(`done shard ${shardI}/${shardN}: ${mine.length} cells in ${seconds}s`);
};

main().catch((e) => { console.error(e); process.exit(1); });
