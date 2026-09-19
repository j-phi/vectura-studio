const L = require('/private/tmp/claude-501/scratch-T25/_t25/lib.js');
const M = require('/private/tmp/claude-501/scratch-T25/_t25/metrics.js');
const P = require('/private/tmp/claude-501/scratch-T25/_t25/proto.js');
const Wh = require('/private/tmp/claude-501/scratch-T25/tests/helpers/scene3d-mktick-wedge.js');
const fs=require('fs');
const CFG = { 'P14': { anchor:'stagger', subdiv:true, L0:1.05 }, 'P7': { anchor:'stagger', subdiv:true } };
(async () => {
  const name=process.env.PROTO||'P14', rig=process.env.RIG||'create';
  const src = P.build(CFG[name]);
  const V = await L.makeRuntime('HEAD', { instrument: true, extraOverrides: { 'src/core/scene3d/surface-fill.js': L.instrumentSurfaceFill(src) } });
  const r = L.render(V, { primitive:'cone', mapper:'hatch', rig });
  const st=r.stat, RP=st.tickField.rowPitch;
  const ras=Wh.rasterizeField(st.tickField,6), ink=Wh.rasterizeInk(ras,r.paths,0.3);
  const dist=Wh.distanceTransform(ras.W,ras.H,ink), th=0.25*RP*6;
  const bare=[]; for(let k=0;k<ras.W*ras.H;k+=1){ if(!ras.surf[k]||ink[k]||ras.tone[k]>=0.90||dist[k]<th) continue; bare.push([ras.x0+(k%ras.W)/6, ras.y0+Math.floor(k/ras.W)/6]); }
  const ticks = st.t25marks.map(t=>{ const Ld=L.plen(t.pts); const band=t.band||t.R; const room=0.5*Math.max(0,band-(t.L/Math.max(1,Math.round(t.R/band))));
    return { pts:t.pts.map(q=>({x:q.x,y:q.y})), ldRP: Ld/RP, off: room>1e-6?(t.cOff||0)/room:0, I:t.I }; });
  const edges = r.paths.filter(p=>p.meta&&p.meta.kind==='sceneEdge').map(p=>L.pathPts(p));
  fs.writeFileSync(process.env.OUT, JSON.stringify({tag:name,rig,RP,ticks,edges,bare}));
  const m = M.allMetrics(r); console.log(name, rig, 'paths', m.pathCount, 'ink', m.inkMm, 'over2RP', ticks.filter(t=>t.ldRP>2).length);
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
