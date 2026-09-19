const L = require('/private/tmp/claude-501/scratch-T25/_t25/lib.js');
const W = require('/private/tmp/claude-501/scratch-T25/tests/helpers/scene3d-mktick-wedge.js');
const fs=require('fs');
(async () => {
  const tag=process.env.TAG||'HEAD', rig=process.env.RIG||'create';
  const V = await L.makeRuntime(tag, { instrument: true });
  const r = L.render(V, { primitive:'cone', mapper:'hatch', rig });
  const st=r.stat, RP=st.tickField.rowPitch;
  const ras=W.rasterizeField(st.tickField,6), ink=W.rasterizeInk(ras,r.paths,0.3);
  const dist=W.distanceTransform(ras.W,ras.H,ink), th=0.25*RP*6;
  const bare=[];
  for(let k=0;k<ras.W*ras.H;k+=1){ if(!ras.surf[k]||ink[k]||ras.tone[k]>=0.90||dist[k]<th) continue; bare.push([ras.x0+(k%ras.W)/6, ras.y0+Math.floor(k/ras.W)/6]); }
  const ticks = st.t25marks.map(t=>{ const Ld=L.plen(t.pts); const room=0.5*Math.max(0,t.R-t.L);
    return { pts:t.pts.map(q=>({x:q.x,y:q.y})), ldRP: Ld/RP, off: room>1e-6 ? (t.cOff||0)/room : 0, I:t.I }; });
  const edges = r.paths.filter(p=>p.meta&&p.meta.kind==='sceneEdge').map(p=>L.pathPts(p));
  fs.writeFileSync(process.env.OUT, JSON.stringify({tag,rig,RP,ticks,edges,bare}));
  console.log('ok', ticks.length, edges.length, bare.length);
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
