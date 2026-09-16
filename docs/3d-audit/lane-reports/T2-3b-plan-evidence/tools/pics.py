import json,sys,os,math
import numpy as np
from PIL import Image
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import band
from band import raster_ink, object_mask, norm_blur, poly_detrend
SP=os.path.dirname(os.path.abspath(__file__))
def load(t): return json.load(open(f"{SP}/data/{t}.json"))
KEY=sys.argv[1]; tags=sys.argv[2].split(","); PP=float(sys.argv[3]) if len(sys.argv)>3 else 14.0
band.PPMM=PP
A=load("pre"); B=load("post")
rp=B["cells"][KEY]["rowPitch"]
xs=[];ys=[]
for d in (A["cells"][KEY],B["cells"][KEY]):
    for f in d["paths"]: xs+=f[0::2]; ys+=f[1::2]
x0,y0=min(xs)-1.0*rp,min(ys)-1.0*rp; x1,y1=max(xs)+1.0*rp,max(ys)+1.0*rp
W=int(math.ceil((x1-x0)*PP)); H=int(math.ceil((y1-y0)*PP))
print("raster",W,H,"rowPitch",round(rp,3))
panels=[]
for t in tags:
    d=load(t)["cells"][KEY]
    ink=raster_ink(d["paths"],x0,y0,W,H,ppmm=PP,pen=0.3)
    img=(255-(ink*255)).astype(np.uint8)
    Image.fromarray(img).save(f"{SP}/pics/{t}_{KEY.replace('|','-').replace('/','-')}.png")
    panels.append(img)
sheet=np.concatenate([np.concatenate([p, np.full((H,6),128,np.uint8)],1) for p in panels],1)
Image.fromarray(sheet).save(f"{SP}/pics/sheet_{KEY.replace('|','-').replace('/','-')}.png")
print("wrote sheet", sheet.shape)
