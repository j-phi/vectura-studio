/* W-32 Rank 4 planner — offline raster of the EMITTED geometry (planning image,
 * not an app screenshot; same precedent and disclosure as W-35b/W-35).
 * grey = sceneEdge (drawn outline), black = sceneFill ink, 0.3 mm round strokes.
 */
const fs=require('fs');
const ROOT='/private/tmp/claude-501/scratch-W32r4';
const {loadVecturaRuntime}=require(ROOT+'/tests/helpers/load-vectura-runtime');
const PPMM=Number(process.env.PPMM||48), PEN=0.3;
(async()=>{const rt=await loadVecturaRuntime();const V=rt.window.Vectura;const P=V.Scene3D.Params;
const prim=process.env.PRIM||'ellipsoid', mapper=process.env.MAP||'contour', dens=Number(process.env.D||50);
const build=()=>{const eng=new V.VectorEngine();eng.currentProfile={width:320,height:220,name:'r'};
 const gid=eng.addLayer('scene3d');eng.layers=eng.layers.filter(l=>l.parentId!==gid);
 const g=eng.layers.find(l=>l.id===gid);g.isGroup=true;g.containerRole='scene';const q=g.params;
 q.camera={...P.DEFAULT_CAMERA};q.ground={enabled:false};q.backdrop={enabled:false};
 const bag={...(P.PRIMITIVE_PARAM_DEFAULTS[prim]||{}),...(P.PRIMITIVE_CREATE_DEFAULTS[prim]||{})};
 q.objects=[{id:'obj',name:'O',primitive:prim,params:bag,transform:{x:0,y:0,z:0,yaw:0,pitch:0,roll:0,scale:1},visibility:'solid'}];
 q.lights=[{id:'sun',type:'directional',azimuth:135,elevation:45,intensity:1,castShadows:false}];
 const st={penId:null,mapper,params:{fillAngle:45,fillDensity:dens,toneLaw:'ladder'}};
 q.styleTable={scene:JSON.parse(JSON.stringify(st)),byObject:{obj:JSON.parse(JSON.stringify(st))},byFace:{}};
 eng.computeAllDisplayGeometry();return (eng.getLayerById(gid).scenePaths)||[];};
const box=(paths)=>{let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;paths.forEach(p=>(p.points||p).forEach(pt=>{if(pt.x<x0)x0=pt.x;if(pt.x>x1)x1=pt.x;if(pt.y<y0)y0=pt.y;if(pt.y>y1)y1=pt.y;}));return{x0,y0,x1,y1};};
const render=(paths,bb,file)=>{
 const W=Math.ceil((bb.x1-bb.x0)*PPMM)+8,H=Math.ceil((bb.y1-bb.y0)*PPMM)+8;
 const img=new Uint8Array(W*H*3).fill(255);
 const put=(px,py,c)=>{if(px<0||py<0||px>=W||py>=H)return;const k=(py*W+px)*3;if(c[0]<img[k]){img[k]=c[0];img[k+1]=c[1];img[k+2]=c[2];}};
 const disc=(x,y,c)=>{const r=(PEN/2)*PPMM;const px=(x-bb.x0)*PPMM+4,py=(y-bb.y0)*PPMM+4;
  for(let dy=-Math.ceil(r);dy<=Math.ceil(r);dy++)for(let dx=-Math.ceil(r);dx<=Math.ceil(r);dx++)
   if(dx*dx+dy*dy<=r*r)put(Math.round(px+dx),Math.round(py+dy),c);};
 const seg=(a,b,c)=>{const n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)*PPMM));
  for(let i=0;i<=n;i++)disc(a.x+(b.x-a.x)*i/n,a.y+(b.y-a.y)*i/n,c);};
 // edges first (grey), fill on top (black)
 [['sceneEdge',[170,170,170]],['sceneFill',[0,0,0]]].forEach(([kind,c])=>{
  paths.forEach(p=>{if(!p.meta||p.meta.kind!==kind)return;const pts=p.points||p;
   for(let i=1;i<pts.length;i++)seg(pts[i-1],pts[i],c);});});
 let hdr=`P6\n${W} ${H}\n255\n`;fs.writeFileSync(file,Buffer.concat([Buffer.from(hdr,'ascii'),Buffer.from(img)]));
 return {W,H};};
rt.window.__SIL_PROTO_OFF=true; const before=build();
rt.window.__SIL_PROTO_OFF=false; const after=build();
const bb=box(before.concat(after));
const dir='/Users/jayphi/Documents/github/vectura-studio/docs/3d-audit/lane-reports/W-32r4-plan-evidence/';
console.log(JSON.stringify({prim,mapper,dens,bb,before:render(before,bb,dir+'before.ppm'),after:render(after,bb,dir+'after.ppm')}));
rt.cleanup();})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
