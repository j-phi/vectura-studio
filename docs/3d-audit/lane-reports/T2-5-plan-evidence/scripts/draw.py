import json, sys
from PIL import Image, ImageDraw
src = sys.argv[1]; dst = sys.argv[2]; W = int(sys.argv[3]) if len(sys.argv)>3 else 627
d = json.load(open(src))
xs=[q['x'] for p in d['paths'] for q in p['pts']]; ys=[q['y'] for p in d['paths'] for q in p['pts']]
x0,x1,y0,y1=min(xs),max(xs),min(ys),max(ys)
pad=0.02*max(x1-x0,y1-y0)
x0-=pad;x1+=pad;y0-=pad;y1+=pad
sc = W/(x1-x0); H=int((y1-y0)*sc)
im=Image.new('RGB',(W,H),(18,18,20)); dr=ImageDraw.Draw(im)
def T(q): return ((q['x']-x0)*sc,(q['y']-y0)*sc)
for p in d['paths']:
    if p['kind']=='sceneEdge': col=(255,70,70); w=2
    elif p['nonBand']: col=(255,220,60); w=2
    else: col=(225,235,255); w=1
    pts=[T(q) for q in p['pts']]
    if len(pts)>=2: dr.line(pts, fill=col, width=w)
im.save(dst); print(dst, im.size)
