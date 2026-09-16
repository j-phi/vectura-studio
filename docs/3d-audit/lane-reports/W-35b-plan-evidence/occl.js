/* W-35b scout — ruling ends cut at an OCCLUDER boundary (not the silhouette).
 * Scene: two objects, one in front. Measure the signed gap between the BACK
 * object's cut ruling ends and the FRONT object's DRAWN outline (its hull).
 * Positive = the ruling stops OUTSIDE the occluder's outline, i.e. a white
 * hairline gap; negative = it runs under the occluder (overlap).
 * Also: torus self-occlusion ends vs the torus' own drawn inner/outer edges.
 */
const path = require('path');
const { loadVecturaRuntime } = require(path.join(__dirname, '..', 'tests', 'helpers', 'load-vectura-runtime'));
function hull(pts){const p=pts.slice().sort((a,b)=>(a.x-b.x)||(a.y-b.y));if(p.length<3)return p;const cr=(o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);const lo=[];for(const q of p){while(lo.length>=2&&cr(lo[lo.length-2],lo[lo.length-1],q)<=0)lo.pop();lo.push(q);}const up=[];for(let i=p.length-1;i>=0;i--){const q=p[i];while(up.length>=2&&cr(up[up.length-2],up[up.length-1],q)<=0)up.pop();up.push(q);}lo.pop();up.pop();return lo.concat(up);} 
function sd(H,x,y){let inside=true;let best=Infinity;const n=H.length;for(let i=0;i<n;i++){const a=H[i];const b=H[(i+1)%n];const ex=b.x-a.x;const ey=b.y-a.y;const L=Math.hypot(ex,ey)||1e-12;if(ex*(y-a.y)-ey*(x-a.x)<0)inside=false;let t=((x-a.x)*ex+(y-a.y)*ey)/(L*L);t=Math.max(0,Math.min(1,t));const px=a.x+ex*t;const py=a.y+ey*t;const d=Math.hypot(x-px,y-py);if(d<best)best=d;}return inside?-best:best;}
const q=(a,p)=>{if(!a.length)return 0;const s=a.slice().sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(p*(s.length-1)))];};
const PEN=0.3;
(async()=>{
  const rt=await loadVecturaRuntime(); const V=rt.window.Vectura; const P=V.Scene3D.Params;
  const CAM={...P.DEFAULT_CAMERA};
  const mk=(mapper,dens,cam)=>{
    const eng=new V.VectorEngine(); eng.currentProfile={width:320,height:220,name:'w35b-occl'};
    const gid=eng.addLayer('scene3d');
    eng.layers=eng.layers.filter((l)=>l.parentId!==gid);
    const g=eng.layers.find((l)=>l.id===gid); g.isGroup=true; g.containerRole='scene';
    const qq=g.params; qq.camera=cam; qq.ground={enabled:false}; qq.backdrop={enabled:false};
    const bagS={...(P.PRIMITIVE_PARAM_DEFAULTS.sphere||{}),...(P.PRIMITIVE_CREATE_DEFAULTS.sphere||{})};
    qq.objects=[
      {id:'back',name:'Back',primitive:'sphere',params:{...bagS},transform:{x:-6,y:0,z:-30,yaw:0,pitch:0,roll:0,scale:1},visibility:'solid'},
      {id:'front',name:'Front',primitive:'sphere',params:{...bagS},transform:{x:14,y:6,z:30,yaw:0,pitch:0,roll:0,scale:0.75},visibility:'solid'},
    ];
    qq.lights=[{id:'sun',type:'directional',azimuth:135,elevation:45,intensity:1,castShadows:false}];
    const st={penId:null,mapper,params:{fillAngle:45,fillDensity:dens,toneLaw:(V.SCENE_FILL_STYLES&&V.SCENE_FILL_STYLES.DEFAULT)||'ladder'}};
    qq.styleTable={scene:JSON.parse(JSON.stringify(st)),byObject:{back:JSON.parse(JSON.stringify(st)),front:JSON.parse(JSON.stringify(st))},byFace:{}};
    eng.computeAllDisplayGeometry();
    const paths=(eng.getLayerById(gid).scenePaths)||[];
    const vis=(p,id)=>p.meta&&p.meta.sceneTarget&&p.meta.sceneTarget.objectId===id&&!p.meta.sceneTarget.occluded;
    const frontBorder=[];
    paths.filter((p)=>p.meta&&p.meta.kind==='sceneEdge'&&vis(p,'front')&&['silhouette','boundary'].includes(p.meta.sceneTarget.edgeClass))
      .forEach((p)=>(p.points||p).forEach((pt)=>{if(Number.isFinite(pt.x))frontBorder.push({x:pt.x,y:pt.y});}));
    const backFill=paths.filter((p)=>p.meta&&p.meta.kind==='sceneFill'&&vis(p,'back'));
    return {frontBorder,backFill};
  };
  const out=[];
  for(const mapper of ['hatch','contour','crosshatch','spiral','contourSlice']){
    for(const dens of [50,220]){
      const {frontBorder,backFill}=mk(mapper,dens,CAM);
      if(frontBorder.length<3){out.push({mapper,dens,error:'no front border'});continue;}
      const H=hull(frontBorder);
      const ends=[];
      backFill.forEach((p)=>{const pts=p.points||p;if(!pts||pts.length<2)return;const a=pts[0];const b=pts[pts.length-1];
        if(Math.hypot(a.x-b.x,a.y-b.y)<0.05)return;ends.push(a);ends.push(b);});
      // only ends near the OCCLUDER's outline (within 1.5 mm) are occluder cuts
      const cuts=ends.map((e)=>({d:sd(H,e.x,e.y),x:e.x,y:e.y})).filter((r)=>Math.abs(r.d)<=1.5);
      const ds=cuts.map((r)=>r.d);
      out.push({mapper,dens,backRuns:backFill.length,ends:ends.length,occluderCuts:cuts.length,
        gapMax:+(ds.length?Math.max(...ds):0).toFixed(4),gapMaxPen:+((ds.length?Math.max(...ds):0)/PEN).toFixed(2),
        gapMed:+q(ds,0.5).toFixed(4),gapP90:+q(ds,0.9).toFixed(4),gapP90Pen:+(q(ds,0.9)/PEN).toFixed(2),
        gapMin:+(ds.length?Math.min(...ds):0).toFixed(4),over0p5pen:ds.filter((d)=>d>0.15).length});
    }
  }
  console.log(JSON.stringify(out,null,1)); rt.cleanup();
})().then(()=>process.exit(0)).catch((e)=>{console.error(e);process.exit(1);});
