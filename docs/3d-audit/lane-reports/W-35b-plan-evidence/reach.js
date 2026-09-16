const path=require('path');const crypto=require('crypto');
const {loadVecturaRuntime}=require(path.join(__dirname,'..','tests','helpers','load-vectura-runtime'));
(async()=>{const rt=await loadVecturaRuntime();const V=rt.window.Vectura;const P=V.Scene3D.Params;
 const gen=(prim,mapper,k)=>{const eng=new V.VectorEngine();eng.currentProfile={width:320,height:220,name:'r'};
  const gid=eng.addLayer('scene3d');eng.layers=eng.layers.filter((l)=>l.parentId!==gid);
  const g=eng.layers.find((l)=>l.id===gid);g.isGroup=true;g.containerRole='scene';const q=g.params;
  q.camera={...P.DEFAULT_CAMERA};q.ground={enabled:false};q.backdrop={enabled:false};
  const bag={...(P.PRIMITIVE_PARAM_DEFAULTS[prim]||{}),...(P.PRIMITIVE_CREATE_DEFAULTS[prim]||{})};
  q.objects=[{id:'obj',name:'Obj',primitive:prim,params:bag,transform:{x:0,y:0,z:0,yaw:0,pitch:0,roll:0,scale:1},visibility:'solid'}];
  q.lights=[{id:'sun',type:'directional',azimuth:135,elevation:45,intensity:1,castShadows:false}];
  const params={fillAngle:45,fillDensity:50,toneLaw:(V.SCENE_FILL_STYLES&&V.SCENE_FILL_STYLES.DEFAULT)||'ladder'};
  if(k!==null)params.sliceEndOverlap=k;
  const st={penId:null,mapper,params};
  q.styleTable={scene:JSON.parse(JSON.stringify(st)),byObject:{obj:JSON.parse(JSON.stringify(st))},byFace:{}};
  eng.computeAllDisplayGeometry();
  const paths=(eng.getLayerById(gid).scenePaths)||[];
  const fill=paths.filter((p)=>p.meta&&p.meta.kind==='sceneFill');
  const s=fill.map((p)=>(p.points||p).map((pt)=>`${pt.x.toFixed(9)},${pt.y.toFixed(9)}`).join(';')).join('|');
  return {md5:crypto.createHash('md5').update(s).digest('hex').slice(0,16),runs:fill.length,chars:s.length};};
 const rows=[];
 for(const prim of ['sphere','ellipsoid','capsule','cone','cylinder','torus']) for(const mapper of ['hatch','contour','crosshatch','spiral','contourSlice']){
   const a=gen(prim,mapper,null);const b=gen(prim,mapper,0);const c=gen(prim,mapper,8);const d=gen(prim,mapper,-2);
   rows.push({prim,mapper,absent:a.md5,k0:b.md5,k8:c.md5,kneg2:d.md5,runs:a.runs,
     identicalAt8:a.md5===c.md5,identicalAtNeg2:a.md5===d.md5,identicalAt0:a.md5===b.md5});}
 console.log(JSON.stringify(rows,null,1));rt.cleanup();})().then(()=>process.exit(0)).catch((e)=>{console.error(e);process.exit(1);});
