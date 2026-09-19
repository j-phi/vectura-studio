import sys
S='/private/tmp/claude-501/scratch-T2-7-plan'
src=open(f'{S}/main/src/core/scene3d/surface-fill.js').read()
GAP, KAPPA, ALPHA, GAMMA, BEND = [float(x) for x in sys.argv[1:6]]; out=sys.argv[6]
NB = int(sys.argv[7]) if len(sys.argv)>7 else 1
RHO = float(sys.argv[8]) if len(sys.argv)>8 else 0.7
SAT = int(sys.argv[9]) if len(sys.argv)>9 else 1
UOFF = float(sys.argv[11]) if len(sys.argv)>11 else 0.0
SEP = 1 if (len(sys.argv)<=10 or sys.argv[10]=='1') else 0
def rep(s,a,b,label):
    n=s.count(a); assert n==1,(label,n); return s.replace(a,b)
old_len = src[src.index("          const Lease = (law.LMIN || 0) * R + (law.L0 - (law.LMIN || 0)) * R * eased;"):]
old_len = old_len[:old_len.index("        } else {")]
new_len = f"""          if (law.shape === 'tick') {{
            // T2-7 PROTO5 — contact-free, two channels, extents from the REAL neighbour rows.
            const PMINT = (1 + {GAP}) * w;
            const RPn = masterPitch / markRowCoverage();
            const fr5 = frameAt(k);
            // half-extent toward each side: to the midpoint of the gap to the neighbouring
            // MARKED ruling (every 1/cov master rulings), less half the contact gap; where there
            // is no neighbour on the front surface, to the silhouette/chart edge less 0.75 pen.
            const onFront = (dv) => {{
              if (!fr5) return false;
              const pp = fr5.toParam(0, dv);
              if (!(pp.a >= 0 && pp.a <= 1)) return false;
              let bb = pp.b; if (bb < 0 || bb > 1) {{ if (bb < -0.25 || bb > 1.25) return false; bb = ((bb % 1) + 1) % 1; }}
              const sm = sampleAt(pp.a, bb); return !!(sm && sm.front === wantFront);
            }};
            const edgeDist = (sgn, lim) => {{
              if (onFront(sgn * lim)) return lim;
              let lo = 0; let hi = lim;
              for (let it = 0; it < 12; it += 1) {{ const mid = 0.5 * (lo + hi); if (onFront(sgn * mid)) lo = mid; else hi = mid; }}
              return lo;
            }};
            let nbP = true; let nbM = true;
            const half = (sgn) => {{
              const cap = RPn;                                  // over2RP: a tick never exceeds 2 RP
              let h = 0.5 * R - 0.5 * PMINT;                    // fallback = the local estimate
              if ({NB} && fr5 && fr5.st && fr5.pr) {{
                const nStep = 1 / markRowCoverage();
                const qa = fr5.pr.a + sgn * nStep * fr5.st.a; let qb = fr5.pr.b + sgn * nStep * fr5.st.b;
                let q = null;
                if (qa >= 0 && qa <= 1) {{ if (qb < 0 || qb > 1) qb = ((qb % 1) + 1) % 1; q = sampleAt(qa, qb); }}
                if (q && q.front === wantFront) {{
                  const d = Math.abs((q.x - smp.x) * fr5.v.x + (q.y - smp.y) * fr5.v.y);
                  if (d > 1e-6) h = 0.5 * d - 0.5 * PMINT;
                  h = Math.min(h, edgeDist(sgn, Math.max(h, 0) + 0.75 * w) - 0.75 * w);
                }} else {{
                  if (sgn > 0) nbP = false; else nbM = false;
                  h = edgeDist(sgn, cap + 0.75 * w) - 0.75 * w;   // limb / chart edge: reach it
                }}
              }}
              return clamp(h, 0, cap);
            }};
            let hP = half(1); let hM = half(-1);            // raw extents (edge case may exceed RPn)
            {{ const Lp0 = 1.15 * MIN_MARK_MM; const tot = hP + hM; const want = Math.min(Lp0, 0.98 * (tot + PMINT));
              if (tot < want) {{ const add = 0.5 * (want - tot); hP += add; hM += add; }} }}   // T2-4 floor: plottable size beats the seam gap
            const aP = Math.min(hP, RPn); const aM = Math.min(hM, RPn);
            // layout at full tone: one centred main tick + (edge case) a chain of gradually
            // SHORTENING ticks out to the silhouette/rim, PMINT apart
            const chain = (sgn, from, room) => {{
              const out = []; let pos = from + PMINT; let len = Math.min(aP + aM, RPn) * {RHO};
              while (room - (pos - from) >= Math.max(2 * w, 0.5 * MIN_MARK_MM) + 1e-9 && out.length < 6) {{
                const l = Math.min(len, from + room - pos);
                if (l < 2 * w) break;
                out.push(sgn > 0 ? [pos, pos + l] : [-(pos + l), -pos]); pos += l + PMINT; len *= {RHO};
              }}
              return out;
            }};
            const chP = hP > aP + PMINT ? chain(1, aP, hP - aP) : [];
            const chM = hM > aM + PMINT ? chain(-1, aM, hM - aM) : [];
            const Lmain = Math.max(aP + aM, 1e-6);
            let Lall = Lmain; chP.concat(chM).forEach((q) => {{ Lall += q[1] - q[0]; }});
            const Reff = Math.max(hP + hM + PMINT, 2 * PMINT);
            const Lplot = 1.15 * MIN_MARK_MM;
            const cMax = Lall / Reff * w / PMINT;
            const c = Math.pow(mkAsk(I) / MK_DARK_AREA, {GAMMA}) * cMax;
            const f = clamp(Math.pow(c / ({KAPPA} * cMax), {ALPHA}), Math.min(1, Lplot / Lall), 1);
            // tone on the main band: f of its length; the rest of the band is NOT left as a seam
            // gutter — it is filled by two satellites flush to the band edges (split by a golden
            // hash so the channels between them never line up), each >= 2 pens or folded back.
            const segs = [];
            const Lm = f * Lmain; const G = Lmain - Lm;
            const P0guess = clamp(Lm * w / Math.max(1e-9, c * Reff), PMINT, MK_PMAX);
            // BAND FILL: the band's bare share G is cut into n slots no wider than ~2 contact
            // gaps (so no seam gutter), and the ink into n pieces that SHORTEN toward the light
            // side (ratio RHO), phase-shifted by a golden hash so the channels never line up.
            let n = Math.max(1, Math.floor(G / PMINT));
            while (n > 1 && Lm / n < 2 * w) n -= 1;
            if (!{SAT}) n = 1;
            const Iof = (dv) => {{ if (!fr5) return null; const pp = fr5.toParam(0, dv); if (!(pp.a >= 0 && pp.a <= 1)) return null; let bb = pp.b; if (bb < 0 || bb > 1) bb = ((bb % 1) + 1) % 1; const sm = sampleAt(pp.a, bb); return (sm && sm.front === wantFront && Number.isFinite(sm.I)) ? sm.I : null; }};
            const iP5 = Iof(0.5 * aP); const iM5 = Iof(-0.5 * aM);
            const darkPlus = (iP5 != null && iM5 != null) ? (iP5 < iM5) : true;
            const gg = G / n; const uu5 = ((k * 0.6180339887498949) % 1 + 1) % 1; const shift = (n > 1 ? (uu5 - 0.5) * 0.5 * gg : 0);
            const wts = []; let wsum = 0; for (let j = 0; j < n; j += 1) {{ const wj = Math.pow({RHO}, j); wts.push(wj); wsum += wj; }}
            // pieces ordered from the DARK edge: j = 0 longest
            let pos = gg / 2 + shift;                 // distance from the dark edge
            const order = [];
            for (let j = 0; j < n; j += 1) {{ const lj = Lm * wts[j] / wsum; order.push([pos, pos + lj]); pos += lj + gg; }}
            // a band that meets the silhouette/rim on one side is laid FROM that edge (pieces reach it)
            const edgeP = hP > 0 && !nbP; const edgeM = hM > 0 && !nbM;
            let fromPlus = darkPlus; let shiftBack = false;
            if (edgeP !== edgeM) {{ fromPlus = edgeP; shiftBack = true; }}
            if (shiftBack) {{ const d0 = order[0][0]; order.forEach((q) => {{ q[0] -= d0; q[1] -= d0; }}); if (fromPlus !== darkPlus) order.reverse().forEach((q, j, arr) => {{}}); }}
            order.forEach((q, j) => {{ const sg = fromPlus ? [aP - q[1], aP - q[0]] : [-aM + q[0], -aM + q[1]]; sg.push((j % 2) ? {UOFF} * P0guess : 0); segs.push(sg); }});
            chP.concat(chM).forEach((q) => {{ const mid = 0.5 * (q[0] + q[1]); const hl = 0.5 * f * (q[1] - q[0]); if (2 * hl >= 2 * w) segs.push([mid - hl, mid + hl, 0]); }});
            L = 0; segs.forEach((q) => {{ L += q[1] - q[0]; }});
            L = Math.max(L, 1e-6);
            P = L * w / Math.max(1e-9, c * Reff);
            if (P < PMINT) P = PMINT;
            if (P > MK_PMAX) {{ const sc = (c * Reff * MK_PMAX / w) / L; P = MK_PMAX; if (sc < 1) {{ segs.forEach((q) => {{ const mid = 0.5 * (q[0] + q[1]); const hl = 0.5 * sc * (q[1] - q[0]); q[0] = mid - hl; q[1] = mid + hl; }}); L *= sc; }} }}
            return {{ P, L, R: Reff, I, g, truePitch: 0, bandPitch: 0, segs }};
          }} else {{
{old_len}          }}
"""
src=rep(src,old_len,new_len,'len')
# solveAt needs smp name: it has `const smp = smps[k];` — confirm
assert "        const smp = smps[k];\n        const I = clamp(finite(smp.I, 0), 0, 1);" in src
a=src.index("          if (law.shape === 'tick') {\n            const nominalRP = masterPitch / MK_ROW_COV;")
b=src.index("        const drawnLen = place(fr, polys, a - arcMM[k], thetaAt(k, fr));")
src=src[:a]+"""          if (law.shape === 'tick' && sv.segs) {
            // main tick = the longest segment; every other segment (gutter satellite, wedge/limb
            // chain tick) is placed as its OWN mark after the main one, so it is a tick of its own
            polys = sv.segs.map((q) => [[q[2] || 0, q[0]], [q[2] || 0, q[1]]]);
            if (__SEP__ && polys.length > 1) {
              let bi = 0; sv.segs.forEach((q, i) => { if (q[1] - q[0] > sv.segs[bi][1] - sv.segs[bi][0]) bi = i; });
              const extra = polys.filter((_, i) => i !== bi); polys = [polys[bi]];
              sv.__extra = extra;
            }
          }
        }
""".replace('__SEP__', str(SEP))+src[b:]
src=rep(src,"        if (law.shape === 'tick') mkStat.tickSites.push(sv.I, sv.R, sv.P, drawnLen ? 1 : 0);",
 """        if (law.shape === 'tick') mkStat.tickSites.push(sv.I, sv.R, sv.P, drawnLen ? 1 : 0);
        if (law.shape === 'tick' && sv.__extra) {
          const th3 = Math.min(2, Math.floor(clamp(sv.I, 0, 1) * 3));
          sv.__extra.forEach((pl) => {
            const dl = place(fr, [pl], a - arcMM[k], thetaAt(k, fr));
            if (dl) { mkStat.lenByThird[th3] += dl; mkStat.cntByThird[th3] += 1; }
          });
          sv.__extra = null;
        }""", 'extra')
src=rep(src,"                if (Math.acos(cosv) * (180 / Math.PI) > 10) sawDirBad = true;",
 "                if (Math.acos(cosv) * (180 / Math.PI) > 10) sawDirBad = true;\n                if (law.shape === 'tick' && Math.acos(cosv) * (180 / Math.PI) > 25) { mkStat.offSurface += 1; return false; }",'dir')
src=rep(src,"          const pts = [];\n          let truncated = false;\n","          const pts = [];\n          let truncated = false;\n          let d0x = null; let d0y = null;\n",'bend0')
src=rep(src,"            curPt = nextPt;\n            pts.push(curPt);\n",f"""            if (stepCapMM) {{
              const sx = nextPt.x - curPt.x; const sy = nextPt.y - curPt.y; const sl = Math.hypot(sx, sy);
              if (sl > 1e-9) {{
                if (d0x == null) {{ d0x = sx / sl; d0y = sy / sl; }}
                else if ((sx * d0x + sy * d0y) / sl < Math.cos({BEND} * Math.PI / 180)) {{ truncated = true; break; }}
              }}
            }}
            curPt = nextPt;
            pts.push(curPt);
""",'bend')
open(out,'w').write(src); print('wrote',out)
