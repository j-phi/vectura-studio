const L = require('/private/tmp/claude-501/scratch-T25/_t25/lib.js');
const M = require('/private/tmp/claude-501/scratch-T25/_t25/metrics.js');
const fs = require('fs');
(async () => {
  const tag = process.env.TAG||'HEAD', prim = process.env.PRIM||'cone', map = process.env.MAP||'hatch', rig = process.env.RIG||'create';
  const V = await L.makeRuntime(tag, { instrument: true });
  const r = L.render(V, { primitive: prim, mapper: map, rig });
  const m = M.allMetrics(r);
  const nbSet = new Set(m.purity.nonBand.map(z=>z.i));
  const out = r.paths.map((p,i)=>({ kind: p.meta&&p.meta.kind, emit: p.meta&&p.meta.t25emit, nonBand: nbSet.has(i), pts: L.pathPts(p) }));
  fs.writeFileSync(process.env.OUT||'/private/tmp/claude-501/scratch-T25/_t25/paths.json', JSON.stringify({ tag, prim, map, rig, paths: out, ticks: r.stat.t25marks.map(t=>({I:t.I,R:t.R,L:t.L,cOff:t.cOff,line:t.lineIndex,pts:t.pts})) }));
  console.log('dumped', out.length, 'paths');
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
