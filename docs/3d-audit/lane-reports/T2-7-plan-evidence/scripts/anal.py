import json, math, sys
from PIL import Image, ImageDraw
S='/private/tmp/claude-501/scratch-T2-7-plan'
def ang(a,b):
    return math.degrees(math.atan2(b[1]-a[1], b[0]-a[0]))
def fold(t):  # undirected angle in [0,180)
    t%=180.0
    return t
def adiff(a,b):
    d=abs(fold(a)-fold(b)); return min(d,180-d)
def analyse(tag, key, draw=True, HTOL=5.0):
    D=json.load(open(f'{S}/dump_{tag}.json'))[key]
    rp=D['rp']; P=D['paths']
    fills=[p for p in P if p['k']=='sceneFill']; edges=[p for p in P if p['k']=='sceneEdge']
    # per path chord angle & length
    rec=[]
    for p in fills:
        q=p['pts']; L=sum(math.dist(q[i],q[i-1]) for i in range(1,len(q)))
        a=ang(q[0],q[-1]) if math.dist(q[0],q[-1])>1e-6 else 0
        mid=((q[0][0]+q[-1][0])/2,(q[0][1]+q[-1][1])/2)
        # max turning inside path (bend)
        segs=[ang(q[i-1],q[i]) for i in range(1,len(q)) if math.dist(q[i-1],q[i])>1e-6]
        bend=max((adiff(segs[i],segs[i-1]) for i in range(1,len(segs))),default=0)
        # horizontal sub-segments length (screen angle within HTOL of 0)
        hl=sum(math.dist(q[i-1],q[i]) for i in range(1,len(q)) if math.dist(q[i-1],q[i])>1e-6 and adiff(ang(q[i-1],q[i]),0)<=HTOL)
        rec.append(dict(p=p,L=L,a=a,mid=mid,bend=bend,hl=hl))
    # neighbour median direction
    import bisect
    for r in rec:
        nb=[o['a'] for o in rec if o is not r and math.dist(o['mid'],r['mid'])<1.5*rp]
        if nb:
            # circular (axial) mean
            c=sum(math.cos(math.radians(2*x)) for x in nb); s=sum(math.sin(math.radians(2*x)) for x in nb)
            r['nbA']=math.degrees(math.atan2(s,c))/2; r['dev']=adiff(r['a'],r['nbA']); r['nbn']=len(nb)
        else: r['nbA']=None; r['dev']=None; r['nbn']=0
    horiz=[r for r in rec if adiff(r['a'],0)<=HTOL]
    rogueH=[r for r in horiz if r['dev'] is not None and r['dev']>30]
    rogue=[r for r in rec if r['dev'] is not None and r['dev']>30]
    bent=[r for r in rec if r['bend']>30]
    eh=[p for p in edges if len(p['pts'])>1 and adiff(ang(p['pts'][0],p['pts'][-1]),0)<=HTOL]
    res=dict(tag=tag,key=key,rp=round(rp,3),nFill=len(fills),nEdge=len(edges),
      horizFill=len(horiz), horizFillMm=round(sum(r['L'] for r in horiz),1),
      rogueDev30=len(rogue), rogueDev30Mm=round(sum(r['L'] for r in rogue),1),
      rogueHoriz=len(rogueH), rogueHorizMm=round(sum(r['L'] for r in rogueH),1),
      bent30=len(bent), bentHorizSegMm=round(sum(r['hl'] for r in bent),1),
      edgeHoriz=len(eh), edgeKinds=sorted(set(str(p['e']) for p in edges)))
    if draw:
        xs=[x for p in P for x,_ in p['pts']]; ys=[y for p in P for _,y in p['pts']]
        x0,x1,y0,y1=min(xs),max(xs),min(ys),max(ys); sc=700/max(x1-x0,y1-y0); pad=20
        W=int((x1-x0)*sc)+2*pad; H=int((y1-y0)*sc)+2*pad
        for mode in ('plain','anno'):
            im=Image.new('RGB',(W,H),(18,19,22)); d=ImageDraw.Draw(im)
            tf=lambda q:((q[0]-x0)*sc+pad,(q[1]-y0)*sc+pad)
            lw=max(1,int(round(0.3*sc)))
            for p in edges: d.line([tf(q) for q in p['pts']],fill=(225,238,255) if mode=='plain' else (60,200,60),width=lw)
            for r in rec:
                col=(225,238,255)
                if mode=='anno':
                    if r in rogueH: col=(255,40,40)
                    elif r['dev'] is not None and r['dev']>30: col=(255,160,0)
                    elif r['bend']>30: col=(255,0,255)
                d.line([tf(q) for q in r['p']['pts']],fill=col,width=lw)
            im.save(f'{S}/img/{mode}_{tag}_{key.replace("|","_")}.png')
        res['scale']=sc; res['origin']=(x0,y0,pad)
    return res, rec
if __name__=='__main__':
    for tag in sys.argv[1:]:
        for key in ['cone|create','cone|test','sphere|create','sphere|test']:
            r,_=analyse(tag,key); r.pop('origin',None); print(json.dumps(r))
