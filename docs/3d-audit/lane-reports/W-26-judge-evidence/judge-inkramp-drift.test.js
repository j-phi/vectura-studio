const fs=require('fs');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const clone=(v)=>JSON.parse(JSON.stringify(v));
const PEN_MM=0.3;
const BOUNDS={width:200,height:200,m:8,dW:184,dH:184,penWidth:PEN_MM,truncate:4,fastPreview:false,preview3dQuality:'high'};
const CAMERA={projection:'orthographic',yaw:0,pitch:30,roll:0,cameraDistance:620,focalLength:520,zoom:1};
const SUN={type:'directional',azimuth:135,elevation:35,intensity:1,castShadows:false};
const RADIUS=62;
describe('ramp drift probe',()=>{
  let runtime,V,algo,defaults,SF;
  beforeAll(async()=>{runtime=await loadVecturaRuntime();V=runtime.window.Vectura;algo=V.AlgorithmRegistry.scene3d;defaults=V.ALGO_DEFAULTS.scene3d;SF=V.Scene3D.SurfaceFill;});
  afterAll(()=>runtime.cleanup());
  const scene=(mapper,o)=>{
    const p=clone(defaults);p.seed=0;p.camera=clone(CAMERA);
    if(o.pitch!=null)p.camera.pitch=o.pitch;
    p.ground={enabled:false};p.backdrop={enabled:false};
    const sun=clone(SUN); if(o.elev!=null)sun.elevation=o.elev; p.lights=[sun];
    p.objects=[{id:'ball',name:'Ball',primitive:'sphere',params:{radius:o.radius||RADIUS,detail:o.detail||48},transform:{x:0,y:0,z:0,yaw:0,pitch:0,roll:0,scale:1},visibility:'solid',role:'solid'}];
    p.tone={enabled:true,bands:3,thresholds:[0.33,0.66],ladder:[0.2,0.5,0.85],specular:{enabled:true,size:1}};
    const style={penId:null,mapper,params:{fillDensity:o.density||50,highlightTreatment:'none'}};
    p.styleTable={scene:clone(style),byObject:{ball:clone(style)},byFace:{}};
    return p;
  };
  const emittedRuns=(mapper,o)=>{const orig=SF.buildObject;const raw=[];SF.buildObject=function(x){const r=orig.call(this,x);if(r)r.forEach(q=>raw.push(q));return r;};try{algo.generate(scene(mapper,o),new V.SeededRNG(0),new V.SimpleNoise(0),BOUNDS);}finally{SF.buildObject=orig;}return raw;};
  const disc=(raw)=>{let minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9;raw.forEach(q=>{for(let i=0;i<q.length;i++){const p=q[i];if(p.x<minx)minx=p.x;if(p.x>maxx)maxx=p.x;if(p.y<miny)miny=p.y;if(p.y>maxy)maxy=p.y;}});return{cx:(minx+maxx)/2,cy:(miny+maxy)/2,R:Math.max(maxx-minx,maxy-miny)/2};};
  const inkRamp=(raw,nBins)=>{
    const d=disc(raw);const G=24;const cell=(2*d.R)/G;const acc=new Float64Array(G*G);
    raw.filter(q=>!q.back).forEach(q=>{for(let i=1;i<q.length;i++){const a=q[i-1],b=q[i];const len=Math.hypot(b.x-a.x,b.y-a.y);const n=Math.max(1,Math.ceil(len/(cell/4)));for(let k=0;k<n;k++){const t=(k+0.5)/n;const gx=Math.floor(((a.x+(b.x-a.x)*t)-(d.cx-d.R))/cell);const gy=Math.floor(((a.y+(b.y-a.y)*t)-(d.cy-d.R))/cell);if(gx<0||gy<0||gx>=G||gy>=G)continue;acc[gy*G+gx]+=len/n;}}});
    const cells=[];for(let gy=0;gy<G;gy++)for(let gx=0;gx<G;gx++){const X=((d.cx-d.R)+(gx+0.5)*cell-d.cx)/d.R;const Y=((d.cy-d.R)+(gy+0.5)*cell-d.cy)/d.R;if(Math.hypot(X,Y)>0.82)continue;cells.push({X,Y,dens:acc[gy*G+gx]/(cell*cell)});}
    let sXX=0,sXY=0,sYY=0,sX=0,sY=0,sD=0,sXD=0,sYD=0;
    cells.forEach(c=>{sXX+=c.X*c.X;sXY+=c.X*c.Y;sYY+=c.Y*c.Y;sX+=c.X;sY+=c.Y;sD+=c.dens;sXD+=c.X*c.dens;sYD+=c.Y*c.dens;});
    const M=[[sXX,sXY,sX],[sXY,sYY,sY],[sX,sY,cells.length]];
    const det3=(m)=>m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1])-m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0])+m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0]);
    const swap=(m,col,v)=>m.map((row,i)=>row.map((x,j)=>(j===col?v[i]:x)));
    const rhs=[sXD,sYD,sD];const D=det3(M);
    const bx=det3(swap(M,0,rhs))/D;const by=det3(swap(M,1,rhs))/D;
    const mag=Math.hypot(bx,by)||1e-9;const ux=bx/mag,uy=by/mag;
    const bins=Array.from({length:nBins},()=>({sum:0,n:0}));
    cells.forEach(c=>{const t=(c.X*ux+c.Y*uy+0.82)/1.64;const i=Math.min(nBins-1,Math.max(0,Math.floor(t*nBins)));bins[i].sum+=c.dens;bins[i].n+=1;});
    return bins.map(b=>(b.n?b.sum/b.n:0));
  };
  it('probe',()=>{
    const res=[];
    const variants=[
      {name:'shipped',o:{}},
      {name:'detail44',o:{detail:44}},{name:'detail52',o:{detail:52}},
      {name:'d48',o:{density:48}},{name:'d52',o:{density:52}},
      {name:'r60',o:{radius:60}},{name:'r64',o:{radius:64}},
      {name:'elev33',o:{elev:33}},{name:'elev37',o:{elev:37}},
      {name:'pitch28',o:{pitch:28}},{name:'pitch32',o:{pitch:32}},
    ];
    variants.forEach(v=>{
      ['contour','hatch'].forEach(m=>{
        const prof=inkRamp(emittedRuns(m,v.o),5);
        res.push({variant:v.name,mapper:m,ratio:Math.round(prof[4]/prof[0]*1000)/1000,prof:prof.map(x=>Math.round(x*1000)/1000)});
      });
    });
    fs.writeFileSync(process.env.RAMP_OUT||'/tmp/ramp.json',JSON.stringify(res,null,1));
    res.forEach(r=>console.log('RAMP',r.mapper,r.variant,r.ratio));
    expect(res.length).toBeGreaterThan(0);
  },1800000);
});
