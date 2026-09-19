const L = require('/private/tmp/claude-501/scratch-T25/_t25/lib.js');
const M = require('/private/tmp/claude-501/scratch-T25/_t25/metrics.js');
(async () => {
  const V = await L.makeRuntime(process.env.TAG||'HEAD', { instrument: true });
  const r = L.render(V, { primitive: process.env.PRIM||'cone', mapper: process.env.MAP||'hatch', rig: process.env.RIG||'create' });
  const m = M.allMetrics(r);
  const rows = r.paths.map((p,i)=>({i, len: L.plen(L.pathPts(p)), n: p.length, kind: p.meta&&p.meta.kind, emit: p.meta&&p.meta.t25emit, pts: L.pathPts(p)}));
  rows.sort((a,b)=>b.len-a.len);
  console.log('TOP 12 longest:');
  rows.slice(0,12).forEach(q=>console.log(`  #${q.i} len=${q.len.toFixed(2)} n=${q.n} ${q.kind} ${q.emit} start=(${q.pts[0].x.toFixed(1)},${q.pts[0].y.toFixed(1)}) end=(${q.pts[q.n-1].x.toFixed(1)},${q.pts[q.n-1].y.toFixed(1)})`));
  const edges = rows.filter(q=>q.kind==='sceneEdge');
  console.log('sceneEdge n=',edges.length,'total',edges.reduce((a,b)=>a+b.len,0).toFixed(1),'maxlen',edges[0]&&edges[0].len.toFixed(2));
  const xs=[],ys=[]; r.paths.forEach(p=>L.pathPts(p).forEach(q=>{xs.push(q.x);ys.push(q.y);}));
  console.log('bbox', Math.min(...xs).toFixed(1), Math.min(...ys).toFixed(1), Math.max(...xs).toFixed(1), Math.max(...ys).toFixed(1));
  // unmatched sceneFill: are they subsegments of a mark run?
  const nb = m.purity.nonBand.filter(z=>!String(z.cls).startsWith('sceneEdge'));
  console.log('non-mark sceneFill count', nb.length);
  const marks = r.stat.t25marks;
  nb.slice(0,6).forEach(z=>{
    const pts = L.pathPts(r.paths[z.i]);
    let best=null;
    marks.forEach(mk=>{ const d = Math.min(...mk.pts.map(q=>Math.hypot(q.x-pts[0].x,q.y-pts[0].y))); if(!best||d<best.d) best={d, len:L.plen(mk.pts), n:mk.pts.length}; });
    console.log(`  path#${z.i} len=${z.len.toFixed(2)} n=${z.n} nearestMarkTipDist=${best.d.toFixed(3)} markLen=${best.len.toFixed(2)}`);
  });
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
