import os, sys
S="/private/tmp/claude-501/scratch-T23b"
SP=os.path.dirname(os.path.abspath(__file__))
PRE=open(f"{S}/pre/src/core/scene3d/surface-fill.js").read()
OUT=f"{SP}/variants"; os.makedirs(OUT, exist_ok=True)

def one(src, needle, repl, label):
    n=src.count(needle)
    assert n==1, f"{label}: needle count {n}"
    return src.replace(needle, repl)

MK_N = "      mkTick:        { shape: 'tick',     chan: 'count', lat: 'brick',   or: 'none',   L0: 1.02 },"
def mkrow(chan, L0, extra=""):
    return f"      mkTick:        {{ shape: 'tick',     chan: '{chan}',   lat: 'brick',   or: 'none',   L0: {L0}{extra} }},"

CONST_N = "    const MK_BAND_MAX_PASSES = 6;"
FLAG_N  = "        const countChan = law.chan === 'count' || (law.chan === 'alt' && parity === 1);"
BR_N = """        } else {
          P = clamp(law.P0 * R, PMIN, MK_PMAX);
          L = Math.min(g * P, capOf(P));
        }
        return { P, L, R, I, g, truePitch, bandPitch };"""
STAG_N = """          polys = mkShape(shapeFor(), sv.L, sv.R, w);
        }
        if (place(fr, polys, a - arcMM[k], thetaAt(k, fr))) {"""
STAG_R = """          polys = mkShape(shapeFor(), sv.L, sv.R, w);
          if (law.shape === 'tick') {
            const room = 0.5 * Math.max(0, sv.R - sv.L);
            if (room > 1e-6) {
              const idx = a / Math.max(1e-6, sv.P);
              const uu = ((idx * 0.6180339887498949) % 1 + 1) % 1;
              const cOff = room * (2 * uu - 1);
              polys = polys.map((pl) => pl.map((pt) => [pt[0], pt[1] + cOff]));
            }
          }
        }
        if (place(fr, polys, a - arcMM[k], thetaAt(k, fr))) {"""

def branch(body):
    return f"""        }} else if (lenChan) {{
{body}
        }} else {{
          P = clamp(law.P0 * R, PMIN, MK_PMAX);
          L = Math.min(g * P, capOf(P));
        }}
        return {{ P, L, R, I, g, truePitch, bandPitch }};"""

SHIPPED_BODY = """          const t = clamp(1 - I, 0, 1);
          const eased = (1 - MK_TICK_EASE_BLEND) * t + MK_TICK_EASE_BLEND * (t * t * (3 - 2 * t));
          L = (law.LMIN || 0) * R + (law.L0 - (law.LMIN || 0)) * R * eased;
          P = clamp(L / Math.max(1e-6, g), PMIN, MK_PMAX);"""
LCONST_BODY = """          L = law.L0 * R;
          P = clamp(L / Math.max(1e-6, g), PMIN, MK_PMAX);"""
PFIXED_BODY = """          const t = clamp(1 - I, 0, 1);
          const eased = (1 - MK_TICK_EASE_BLEND) * t + MK_TICK_EASE_BLEND * (t * t * (3 - 2 * t));
          L = (law.LMIN || 0) * R + (law.L0 - (law.LMIN || 0)) * R * eased;
          P = clamp((law.P0 || 1.02) * R, PMIN, MK_PMAX);"""

def build(name, *, chan='count', L0='1.02', extra='', blend='0.92', body=SHIPPED_BODY, branch_on=True, stagger=False):
    s = PRE
    s = one(s, CONST_N, CONST_N + f"\n    const MK_TICK_EASE_BLEND = {blend};", 'CONST')
    s = one(s, FLAG_N, FLAG_N + "\n        const lenChan = law.chan === 'len';", 'FLAG')
    if branch_on: s = one(s, BR_N, branch(body), 'BRANCH')
    s = one(s, MK_N, mkrow(chan, L0, extra), 'MKROW')
    if stagger: s = one(s, STAG_N, STAG_R, 'STAG')
    open(f"{OUT}/{name}.js","w").write(s)
    print("wrote", name)

LENEX = ", LMIN: 0.18, P0: 1.02"
build('V1_dead')                                                         # chan still count, branch present but dead
build('V2_len_L102', chan='len', L0='1.02', extra=LENEX)
build('V3_len_L116', chan='len', L0='1.16', extra=LENEX)                 # post minus stagger
build('V4_full',     chan='len', L0='1.16', extra=LENEX, stagger=True)   # == post
build('V4_L102',     chan='len', L0='1.02', extra=LENEX, stagger=True)
build('V3b_blend0',  chan='len', L0='1.16', extra=LENEX, blend='0')
build('V3c_blend1',  chan='len', L0='1.16', extra=LENEX, blend='1')
build('V3d_Lconst',  chan='len', L0='1.16', extra=LENEX, body=LCONST_BODY)
build('V3e_Pfixed',  chan='len', L0='1.16', extra=LENEX, body=PFIXED_BODY)
build('V2c_nobranch',chan='len', L0='1.16', extra=LENEX, branch_on=False)
build('V0b_L116cnt', chan='count', L0='1.16')                            # pre design, just a longer tick
