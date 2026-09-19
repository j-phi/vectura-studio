import json,sys
from PIL import Image, ImageDraw
d=json.load(open(sys.argv[1])); dst=sys.argv[2]; Wpx=627
xs=[q['x'] for t in d['ticks'] for q in t['pts']]+[q['x'] for e in d['edges'] for q in e]
ys=[q['y'] for t in d['ticks'] for q in t['pts']]+[q['y'] for e in d['edges'] for q in e]
x0,x1,y0,y1=min(xs),max(xs),min(ys),max(ys); pad=0.02*max(x1-x0,y1-y0)
x0-=pad;x1+=pad;y0-=pad;y1+=pad; sc=Wpx/(x1-x0); H=int((y1-y0)*sc)
im=Image.new('RGB',(Wpx,H),(16,16,18)); dr=ImageDraw.Draw(im)
T=lambda q:((q['x']-x0)*sc,(q['y']-y0)*sc)
for b in d['bare']:
    px,py=(b[0]-x0)*sc,(b[1]-y0)*sc
    dr.point((px,py),fill=(0,90,120))
for e in d['edges']:
    dr.line([T(q) for q in e], fill=(60,200,90), width=2)
for t in d['ticks']:
    p=[T(q) for q in t['pts']]
    if t['ldRP']>2.0: col=(255,45,45); w=3
    elif t['ldRP']<0.5 and abs(t['off'])>0.5: col=(255,170,0); w=3
    else: col=(230,238,255); w=1
    if len(p)>=2: dr.line(p, fill=col, width=w)
im.save(dst); print(dst, im.size)
