const L = require('/private/tmp/claude-501/scratch-T25/_t25/lib.js');
const hull = (pts) => { const p = pts.slice().sort((a,b)=>a.x-b.x||a.y-b.y); const cr=(o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
  const lo=[],up=[]; for(const q of p){while(lo.length>=2&&cr(lo[lo.length-2],lo[lo.length-1],q)<=0)lo.pop();lo.push(q);} 
  for(let i=p.length-1;i>=0;i--){const q=p[i];while(up.length>=2&&cr(up[up.length-2],up[up.length-1],q)<=0)up.pop();up.push(q);} lo.pop();up.pop();return lo.concat(up); };
const segD=(p,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy;let t=l2?((p.x-a.x)*dx+(p.y-a.y)*dy)/l2:0;t=Math.max(0,Math.min(1,t));return Math.hypot(p.x-(a.x+t*dx),p.y-(a.y+t*dy));};
(async () => {
 for (const tag of ['HEAD']) { const V = await L.makeRuntime(tag, { instrument: true });
  for (const rig of ['create','test']) for (const [p,mp] of L.CELLS) {
   const r = L.render(V, { primitive:p, mapper:mp, rig });
   const RP = r.stat.tickField.rowPitch;
   const fld=[]; const fp=r.stat.tickField.pts; for(let i=0;i<fp.length;i+=3) fld.push({x:fp[i],y:fp[i+1]});
   const H = hull(fld);
   const dmid = [];
   r.paths.forEach(pp=>{ if(!(pp.meta&&pp.meta.kind==='sceneEdge')) return; const q=L.pathPts(pp); const m={x:(q[0].x+q[q.length-1].x)/2,y:(q[0].y+q[q.length-1].y)/2};
     let d=Infinity; for(let i=0;i<H.length;i++) d=Math.min(d,segD(m,H[i],H[(i+1)%H.length])); dmid.push(d/RP); });
   dmid.sort((a,b)=>a-b);
   console.log(`${tag}|${rig}|${p}/${mp} sceneEdge n=${dmid.length} distFromHull/RP: med=${dmid[Math.floor(dmid.length/2)].toFixed(3)} p95=${dmid[Math.floor(0.95*(dmid.length-1))].toFixed(3)} max=${dmid[dmid.length-1].toFixed(3)} interior(>1RP)=${dmid.filter(v=>v>1).length}`);
  } }
 process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
