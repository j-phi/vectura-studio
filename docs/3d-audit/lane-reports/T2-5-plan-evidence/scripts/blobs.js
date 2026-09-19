const L = require('/private/tmp/claude-501/scratch-T25/_t25/lib.js');
const W = require('/private/tmp/claude-501/scratch-T25/tests/helpers/scene3d-mktick-wedge.js');
(async () => {
 const tag=process.env.TAG||'HEAD';
 const V = await L.makeRuntime(tag, { instrument: true });
 for (const rig of (process.env.RIGS||'create').split(',')) for (const [p,mp] of [['cone','hatch']]) {
  const r = L.render(V, { primitive:p, mapper:mp, rig });
  const st=r.stat, RP=st.tickField.rowPitch;
  const ras=W.rasterizeField(st.tickField,6), ink=W.rasterizeInk(ras,r.paths,0.3);
  const dist=W.distanceTransform(ras.W,ras.H,ink), th=0.25*RP*6;
  const {W:Wd,H:Hd}=ras; const lab=new Int32Array(Wd*Hd).fill(0); let nl=0; const blobs=[];
  for(let k=0;k<Wd*Hd;k+=1){ if(lab[k]||!ras.surf[k]||ink[k]||ras.tone[k]>=0.90||dist[k]<th) continue;
    nl+=1; const q=[k]; lab[k]=nl; let n=0,sx=0,sy=0,st2=0,mx=0;
    while(q.length){ const c=q.pop(); n+=1; const cy=Math.floor(c/Wd), cx=c%Wd; sx+=cx; sy+=cy; st2+=ras.tone[c]; if(dist[c]>mx)mx=dist[c];
      for(const d of [1,-1,Wd,-Wd]){ const e=c+d; if(e<0||e>=Wd*Hd||lab[e]) continue; if(!ras.surf[e]||ink[e]||ras.tone[e]>=0.90||dist[e]<th) continue; lab[e]=nl; q.push(e); } }
    blobs.push({n, cx:sx/n, cy:sy/n, tone:st2/n, dmaxRP:2*mx/6/RP, x:ras.x0+(sx/n)/6, y:ras.y0+(sy/n)/6, areaMM:n/36});
  }
  blobs.sort((a,b)=>b.n-a.n);
  console.log(`${tag}|${rig}|${p}/${mp} RP=${RP.toFixed(2)} blobs=${blobs.length} totalWedgePx=${blobs.reduce((a,b)=>a+b.n,0)}`);
  blobs.slice(0,8).forEach((b,i)=>console.log(`  blob${i+1} px=${b.n} area=${b.areaMM.toFixed(1)}mm2 centre=(${b.x.toFixed(1)},${b.y.toFixed(1)}) meanTone=${b.tone.toFixed(3)} holeDiam=${b.dmaxRP.toFixed(2)}RP`));
 }
 process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
