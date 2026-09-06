'use strict';
const fs=require('fs');
const cap=JSON.parse(fs.readFileSync('/private/tmp/claude-501/-Users-jayphi-Documents-github-vectura-studio/f704cbd6-35ca-465f-9186-5c18a39c1856/scratchpad/out0a/capture.json'));
const paths=cap.scenePaths.map(p=>p.pts);
const PEN=0.3,S=cap.scale*2;
const flat=[];paths.forEach(p=>p.forEach(q=>flat.push(q)));
let minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9;flat.forEach(f=>{minx=Math.min(minx,f.x);maxx=Math.max(maxx,f.x);miny=Math.min(miny,f.y);maxy=Math.max(maxy,f.y);});
const W=Math.ceil((maxx-minx+2)*S),H=Math.ceil((maxy-miny+2)*S);
const img=new Uint8Array(W*H);const R=PEN/2*S,r=Math.ceil(R);
const dsk=[];for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++)if(x*x+y*y<=R*R)dsk.push([x,y]);
paths.forEach(p=>{for(let i=1;i<p.length;i++){const a=p[i-1],b=p[i];
 const ax=(a.x-minx+1)*S,ay=(a.y-miny+1)*S,bx=(b.x-minx+1)*S,by=(b.y-miny+1)*S;
 const n=Math.max(1,Math.ceil(Math.hypot(bx-ax,by-ay)));
 for(let t=0;t<=n;t++){const cx=Math.round(ax+(bx-ax)*t/n),cy=Math.round(ay+(by-ay)*t/n);
  dsk.forEach(([dx,dy])=>{const px=cx+dx,py=cy+dy;if(px<0||py<0||px>=W||py>=H)return;img[py*W+px]=1;});}}});
// integral image for fast disc-ish (square) coverage
const RW=Math.round(1.5*PEN*S); // window half-size ~0.45mm
const ii=new Int32Array((W+1)*(H+1));
for(let y=0;y<H;y++){let row=0;for(let x=0;x<W;x++){row+=img[y*W+x];ii[(y+1)*(W+1)+x+1]=ii[y*(W+1)+x+1]+row;}}
const sum=(x0,y0,x1,y1)=>ii[(y1+1)*(W+1)+x1+1]-ii[y0*(W+1)+x1+1]-ii[(y1+1)*(W+1)+x0]+ii[y0*(W+1)+x0];
const area=(2*RW+1)*(2*RW+1);
const solid=new Uint8Array(W*H);let ink=0,sol=0;
for(let y=RW;y<H-RW;y++)for(let x=RW;x<W-RW;x++){const i=y*W+x;if(!img[i])continue;ink++;
 const c=sum(x-RW,y-RW,x+RW,y+RW)/area;if(c>=0.75){solid[i]=1;sol++;}}
console.log(`window ${2*RW+1}px (${((2*RW+1)/S).toFixed(2)}mm); lone-stroke coverage ~${(PEN*S*(2*RW+1)/area).toFixed(2)}`);
console.log(`ink px ${ink}; px whose ${((2*RW+1)/S).toFixed(2)}mm window is >=75% inked: ${sol} (${(sol/ink*100).toFixed(2)}%)`);
const seen=new Uint8Array(W*H);const comps=[];
for(let i=0;i<solid.length;i++){if(!solid[i]||seen[i])continue;const st=[i];seen[i]=1;let n=0,x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
 while(st.length){const j=st.pop();n++;const jx=j%W,jy=(j-jx)/W;x0=Math.min(x0,jx);x1=Math.max(x1,jx);y0=Math.min(y0,jy);y1=Math.max(y1,jy);
  [1,-1,W,-W,W+1,W-1,-W+1,-W-1].forEach(d=>{const k=j+d;if(k<0||k>=solid.length||seen[k]||!solid[k])return;seen[k]=1;st.push(k);});}
 comps.push({n,w:x1-x0+1,h:y1-y0+1,cx:(x0+x1)/2/S+minx-1,cy:(y0+y1)/2/S+miny-1});}
comps.sort((a,b)=>b.n-a.n);
console.log('largest merged-ink blobs:');
comps.slice(0,8).forEach(c=>console.log(`  ${c.n}px  ${(c.w/S).toFixed(2)}x${(c.h/S).toFixed(2)}mm at mm(${c.cx.toFixed(1)},${c.cy.toFixed(1)})`));
console.log('blob count', comps.length);
