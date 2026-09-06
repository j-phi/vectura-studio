'use strict';
const fs=require('fs');
const cap=JSON.parse(fs.readFileSync('/private/tmp/claude-501/-Users-jayphi-Documents-github-vectura-studio/f704cbd6-35ca-465f-9186-5c18a39c1856/scratchpad/out0a/capture.json'));
const paths=cap.scenePaths.map(p=>p.pts);
const flat=[];paths.forEach((p,pi)=>p.forEach((q,i)=>flat.push({pi,i,x:q.x,y:q.y})));
const CELL=0.5,grid=new Map();
flat.forEach((f,idx)=>{const k=`${Math.floor(f.x/CELL)},${Math.floor(f.y/CELL)}`;if(!grid.has(k))grid.set(k,[]);grid.get(k).push(idx);});
const pairs=[];
flat.forEach(f=>{const gx=Math.floor(f.x/CELL),gy=Math.floor(f.y/CELL);
 for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const a=grid.get(`${gx+dx},${gy+dy}`);if(!a)continue;
  a.forEach(idx=>{const g=flat[idx];if(g.pi<=f.pi)return;const d=Math.hypot(g.x-f.x,g.y-f.y);if(d<0.02)pairs.push({a:f.pi,b:g.pi,i:f.i,j:g.i,d,x:f.x,y:f.y});});}});
const byPair=new Map();pairs.forEach(p=>{const k=`${p.a}-${p.b}`;byPair.set(k,(byPair.get(k)||0)+1);});
console.log('vertex pairs on DIFFERENT paths within 0.02mm:',pairs.length);
[...byPair.entries()].sort((x,y)=>y[1]-x[1]).slice(0,12).forEach(([k,v])=>console.log('  paths',k,'count',v));
pairs.slice(0,6).forEach(p=>console.log(`   e.g. #${p.a}[${p.i}] ~ #${p.b}[${p.j}] d=${p.d.toFixed(5)} at mm(${p.x.toFixed(2)},${p.y.toFixed(2)})`));

// how much ink is drawn within one pen (0.3mm) of other ink -> "merged" length
const PEN=0.3;
let inkTot=0, inkCrowd=0;
paths.forEach((p,pi)=>{for(let i=1;i<p.length;i++){
  const L=Math.hypot(p[i].x-p[i-1].x,p[i].y-p[i-1].y);inkTot+=L;
  const mx=(p[i].x+p[i-1].x)/2,my=(p[i].y+p[i-1].y)/2;
  const gx=Math.floor(mx/CELL),gy=Math.floor(my/CELL);let best=Infinity;
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const a=grid.get(`${gx+dx},${gy+dy}`);if(!a)continue;
   a.forEach(idx=>{const g=flat[idx];if(g.pi===pi&&Math.abs(g.i-i)<6)return;const d=Math.hypot(g.x-mx,g.y-my);if(d<best)best=d;});}
  if(best<PEN)inkCrowd+=L;}});
console.log(`ink total ${inkTot.toFixed(1)}mm ; drawn within ${PEN}mm of other ink: ${inkCrowd.toFixed(1)}mm (${(inkCrowd/inkTot*100).toFixed(1)}%)`);
