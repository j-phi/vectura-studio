const L = require('/private/tmp/claude-501/scratch-T25/_t25/lib.js');
const W = require('/private/tmp/claude-501/scratch-T25/tests/helpers/scene3d-mktick-wedge.js');
(async () => {
 for (const tag of (process.env.TAGS||'pre-T2-3,T2-3,HEAD').split(',')) {
  const V = await L.makeRuntime(tag, { instrument: true });
  for (const rig of ['create','test']) for (const [p,mp] of [['cone','hatch'],['sphere','hatch'],['torus','hatch']]) {
   const r = L.render(V, { primitive:p, mapper:mp, rig });
   const st = r.stat; const RP = st.tickField.rowPitch;
   const ras = W.rasterizeField(st.tickField, 6);
   const ink = W.rasterizeInk(ras, r.paths, 0.3);
   const dist = W.distanceTransform(ras.W, ras.H, ink);
   const th = 0.25*RP*6;
   const tones = [];
   for (let k=0;k<ras.W*ras.H;k+=1){ if(!ras.surf[k]) continue; if(ras.tone[k]>=0.90) continue; if(ink[k]) continue; if(dist[k]>=th) tones.push(ras.tone[k]); }
   tones.sort((a,b)=>a-b);
   const q=(f)=>tones.length?tones[Math.floor(f*(tones.length-1))]:null;
   console.log(`${tag}|${rig}|${p}/${mp} tooShort=${st.tooShort} dupStub=${st.dupStub} offSurf=${st.offSurface} trunc=${st.trunc} marks=${st.marks} | wedgePx=${tones.length} wedgeTone med=${q(0.5)&&q(0.5).toFixed(3)} p10=${q(0.1)&&q(0.1).toFixed(3)} p90=${q(0.9)&&q(0.9).toFixed(3)} fracMid(0.2..0.8)=${(tones.filter(v=>v>=0.2&&v<=0.8).length/Math.max(1,tones.length)).toFixed(3)}`);
  }
 }
 process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
