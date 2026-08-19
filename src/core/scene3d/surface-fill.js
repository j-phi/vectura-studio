/**
 * Scene3D.SurfaceFill — curved-surface fills that WRAP the 3D form (spec §3.3;
 * Jay live-test D/I/F). A sphere/torus/… must not fill its flat 2D silhouette
 * with parallel scanlines (that reads as a flat disc); the strokes must follow
 * the parametric surface and foreshorten with it, and their density must track
 * the local light so tone bands read across the surface.
 *
 * Model (light-lab reference + spiralizer wrap pattern):
 *   - Re-evaluate the SAME parametric chart the mesh was built from
 *     (Scene3D.Charts.topo<Mode>(sizes)) on a (a,b) lattice, so the fill lands
 *     exactly on the rendered surface.
 *   - Per sample: local point + numeric normal → object transform → world;
 *     world normal → camera space for back-face culling (front ⇔ camN.z > 0);
 *     project through the SAME camera as the mesh (scene.projectWorld).
 *   - Iso-parameter line families wrap the form: meridians (fix b, sweep a),
 *     parallels (fix a, sweep b). hatch = meridians, contour = parallels,
 *     crosshatch = both, spiral = one helix, stipple = a lattice of dots.
 *   - TONE (I): each line carries an ordered-dither threshold; a sample draws
 *     only where the local shade (1 − Lambert I) exceeds it, so dark regions get
 *     every line (dense) and the BRIGHTEST band gets none — the blank paper IS
 *     the highlight (which retires the old solid-white specular disc).
 *
 * Pure/deterministic. Returns screen-space polylines ([{x,y,z}…]); the caller
 * depth-stamps, clips (HLR), and emits them. null ⇒ unsupported primitive, so
 * the caller falls back to the flat silhouette fill.
 */
(() => {
  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = (globalScope.Vectura = globalScope.Vectura || {});
  const G3 = Vectura.Geometry3D || {};

  const finite = G3.finite || ((val, f = 0) => (Number.isFinite(Number(val)) ? Number(val) : f));
  const clamp = G3.clamp || ((val, lo, hi) => Math.max(lo, Math.min(hi, Number(val) || 0)));
  const v = G3.v || ((x, y, z) => ({ x, y, z }));
  const sub = G3.sub || ((a, b) => v(a.x - b.x, a.y - b.y, a.z - b.z));
  const cross = G3.cross || ((a, b) => v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x));
  const dot = G3.dot || ((a, b) => a.x * b.x + a.y * b.y + a.z * b.z);
  const mul = G3.mul || ((a, s) => v(a.x * s, a.y * s, a.z * s));
  const normalize = G3.normalize || ((a) => {
    const len = Math.hypot(a.x, a.y, a.z) || 1;
    return v(a.x / len, a.y / len, a.z / len);
  });
  const rotatePoint = G3.rotatePoint;

  // Charts whose native (u,vv) convention samples u=AROUND / vv=ALONG-axis — the
  // OPPOSITE of the sphere/cone convention every wrap here assumes (a = along-axis
  // sweep, b = around wind). SurfaceFill wraps these (a,b) → raw(b,a) so a
  // meridian/parallel/helix lands with the correct roles: before this a
  // superellipsoid (or cylinder/capsule/pyramid) Spiral wound its LATITUDE `turns`
  // times → a near-vertical striped band instead of a helix (I21). Only the FILL
  // is normalized — the MESH still calls Charts.topo* directly, so mesh baselines
  // and the charts-parity golden are untouched.
  const AROUND_IS_U = new Set(['cylinder', 'capsule', 'superellipsoid', 'pyramid']);

  // ── A CYLINDER'S AND A CONE'S FLAT CAPS ARE NOT IN THE CHART ───────────────
  //
  // `Charts.topoCylinder` is an OPEN TUBE and `Charts.topoCone` is a lateral
  // cone. Neither includes the flat cap the MESH builds and the border pass
  // rims, so the curved fill could not reach it: the app-default cylinder
  // rendered with a completely bare top disc, measured as a 15.1 mm ink-free
  // hole — by a factor of six the largest bare region anywhere in the
  // primitive x mapper matrix, and the only one visible as a hole rather than
  // as tone.
  //
  // The ends of the ALONG-AXIS coordinate are spent on the caps, exactly as
  // `topoCapsule` spends its ends on the hemispheres, and the split is placed
  // by ARC LENGTH (centre -> rim is `capR` of a meridian that is `capR + h +
  // capR` long) so the ruling pitch stays even across the rim instead of
  // jumping at it. The cap centre is a chart singularity like a sphere's pole
  // and `sampleAt` already handles one.
  //
  // Added HERE, in the fill's own chart wrapper, and NOT in `charts.js`: the
  // MESH calls `Charts.topo*` directly, so `tests/baselines/scene3d/*.json`,
  // the charts-parity golden and every silhouette are untouched by this.
  const cappedChart = (raw, sizes, mode) => {
    // topoCylinder/topoCone place the along-axis extent at +-sy, so the side is
    // 2*sy long; the cap's radial extent is the rim radius.
    const alongLen = 2 * Math.max(1e-6, finite(sizes && sizes.sy, 1));
    const capR = Math.max(1e-6, Math.max(finite(sizes && sizes.sx, 1), finite(sizes && sizes.sz, 1)));
    // The cylinder is capped at BOTH ends; the cone tapers to a point at a = 1
    // and so has only a base.
    const both = mode === 'cylinder';
    const totalLen = alongLen + (both ? 2 * capR : capR);
    const f = capR / totalLen;
    if (!(f > 1e-6) || f > 0.49) return raw;
    const lo = f;
    const hi = both ? 1 - f : 1;
    const spanA = hi - lo;
    return (a, b) => {
      if (a < lo) { const t = a / lo; const p = raw(0, b); return { x: p.x * t, y: p.y, z: p.z * t }; }
      if (both && a > hi) { const t = (1 - a) / f; const p = raw(1, b); return { x: p.x * t, y: p.y, z: p.z * t }; }
      return raw(clamp((a - lo) / spanA, 0, 1), b);
    };
  };

  const chartFor = (mode, sizes) => {
    const C = Vectura.Scene3D && Vectura.Scene3D.Charts;
    if (!C) return null;
    let raw = null;
    switch (mode) {
      case 'sphere': raw = typeof C.topoSphereEllipsoid === 'function' ? C.topoSphereEllipsoid(sizes, 'sphere') : null; break;
      case 'torus': raw = typeof C.topoTorus === 'function' ? C.topoTorus(sizes) : null; break;
      case 'cone': raw = typeof C.topoCone === 'function' ? C.topoCone(sizes) : null; break;
      case 'cylinder': raw = typeof C.topoCylinder === 'function' ? C.topoCylinder(sizes) : null; break;
      case 'capsule': raw = typeof C.topoCapsule === 'function' ? C.topoCapsule(sizes) : null; break;
      case 'superellipsoid': raw = typeof C.topoSuperellipsoid === 'function' ? C.topoSuperellipsoid(sizes) : null; break;
      case 'torusKnot': raw = typeof C.topoTorusKnot === 'function' ? C.topoTorusKnot(sizes) : null; break;
      case 'pyramid': raw = typeof C.topoPyramid === 'function' ? C.topoPyramid(sizes) : null; break;
      default: raw = null;
    }
    if (typeof raw !== 'function') return null;
    const norm = AROUND_IS_U.has(mode) ? (a, b) => raw(b, a) : raw;
    return (mode === 'cylinder' || mode === 'cone') ? cappedChart(norm, sizes, mode) : norm;
  };

  // O6 — CENTRE-LIGHT FLOOR (see coverageForSample). Module scope so the test
  // seam at the bottom of the file reads the same constant the fill does.
  // The cap may never remove more than this fraction of the lit band's own
  // ladder coverage, and never take it under LIT_FLOOR outright.
  const GLINT_KEEP = 0.6;
  const LIT_FLOOR = 0.12;

  // ── The tone MASTER GRID (design spec §5.0/§5.4) ────────────────────────────
  //
  // Round 2 shipped a curved fill that did not shade: `bands` 2/3/4 produced
  // pixel-identical drawings. Two faults, and the first one hid the second.
  //
  // FAULT 1 — the dither rank WAS the family coordinate. Every family emitted
  // line i with the ordered-dither threshold `(i+0.5)/count`, and line i sits at
  // parameter b = `(i+0.5)/count`. Rank and position were the SAME NUMBER. So
  // "keep the fraction `cov` of the lines" did not thin the family — it cut it
  // at a LONGITUDE. Worse, on a lit form the light also varies with longitude,
  // so rank and coverage were correlated and the gate collapsed into a single
  // hard edge: full family on one side, bare paper on the other, no intermediate
  // density anywhere. Measured: a flat D ≈ 0.08 across the whole sphere at every
  // band count. The fix is to decouple the selection from the coordinate
  // entirely: see `ladderStep` below, whose phase accumulator keeps a subset
  // that is EVENLY SPACED at every coverage, so coverage means density. (The
  // first fix was a bit-reversed van der Corput rank, which decoupled the two
  // but spaced the survivors in power-of-two gaps — that is the defect
  // `ladderStep` replaces, and its measurements are recorded there.)
  //
  // FAULT 2 — nothing to be blank against. At the shipped line budget a FULL
  // family already sits at ~17 × pen width, so the lit band (a fraction of that)
  // was near-bare paper and blanking a sub-region of it — which is what every
  // highlight treatment does — was invisible. §5.4 states the rule directly:
  // floor the centre light so its spacing never exceeds 6 × pen. That is only
  // possible if the family the ladder subsets is itself dense enough, so when
  // the ladder is active the line budget is FLOORED at a master pitch measured
  // in pen widths. Density still rules above the floor.
  // A tone grid is the FINE grid the ladder subsets, not the finished spacing —
  // `hatchSpacing(density)` is the latter, so it is subdivided to become the
  // former. Chosen so the shipped default Density lands the ladder where Round 3
  // measured it well.
  const TONE_SUBDIV = 5;
  // §0 / C15 / designer item #5 — "cap TOTAL coverage, not just per-family
  // pitch: ~0.75 dark-fraction ceiling above the 1.2 x pen floor". 1.2 x pen is
  // the plot floor, but a SINGLE family ruling at 1.2 x pen already measures
  // D ~ 0.83 — and then the terminator's crossed family lands on top of it and
  // the form hits 0.946, darker than the contact shadow under it (C2/O13 fail:
  // the object stops sitting on the ground). So family A is floored where it
  // measures ~0.45, leaving the cross the room it needs to make T read, and the
  // COMBINED perceived coverage is ceilinged outright.
  const PLOT_FLOOR_PEN = 2.2;
  // ROUND 10 — READ, NOT RESTATED. These two lived here and the faceted path had
  // no copy at all, so the composed ceiling was a law of the curved path only.
  // They now live beside `FORM_INK` in `regions.js`, which is where the weight
  // they divide by comes from, and both fill paths read the one definition.
  // Values unchanged: 0.47 and 2.0, so every drawing stays byte-identical.
  // Resolved lazily: `regions.js` may register after this file, and the point of
  // the move is that there is exactly ONE definition, so a stale snapshot taken
  // at load time would defeat it. The literals are the fallback for a runtime
  // that somehow has no Regions, and they are the same 0.47 / 2.0.
  const darkCeilConst = () => {
    const R = Vectura.Scene3D && Vectura.Scene3D.Regions;
    return (R && Number.isFinite(R.TOTAL_DARK_CEIL)) ? R.TOTAL_DARK_CEIL : 0.47;
  };
  const darkestWeightConst = () => {
    const R = Vectura.Scene3D && Vectura.Scene3D.Regions;
    return (R && Number.isFinite(R.DARKEST_WEIGHT)) ? R.DARKEST_WEIGHT : 2.0;
  };
  // ROUND 10 — §5.4 #1 / O6, and it MOVED for the same reason the two above
  // did. `LIT_MAX_PITCH_PEN` was declared here and used only for two SPARSE-END
  // clamps on the master grid (`o6Pitch`, `litFloorCov`). Round 9 swept it at
  // 12 / 10 / 8 / 6 and Round 10 added 4: the two binding ladder fixtures are
  // bit-identical from 12 down to 6, and at 4 D(L) goes DOWN and the protected
  // F/M range breaks. It named O6 in its own comment and did not control it.
  // It now lives in `regions.js`, where it floors `formCeiling('L')` — the one
  // quantity that actually bounds D(L) — and the ladder test reads its O6 bar
  // from the same constant. The clamps below keep their job (they are the real
  // sparse-end clamps, and they bind when Density is genuinely too thin to
  // carry a ladder), but they are no longer what enforces O6.
  // Resolved lazily for the same reason as the two ceiling constants: exactly
  // ONE definition, and `regions.js` may register after this file.
  const litMaxPitchPen = () => {
    const R = Vectura.Scene3D && Vectura.Scene3D.Regions;
    return (R && Number.isFinite(R.LIT_MAX_PITCH_PEN)) ? R.LIT_MAX_PITCH_PEN : 12;
  };
  // The composed ceiling, read not restated. `82789c4` moved the two constants
  // to `regions.js` but left this file computing the ceiling from them by hand,
  // so `formCeiling` was the single expression on the faceted path only and a
  // second copy of the law survived here — which is how the L-zone floor above
  // would have been enforced on one path and not the other.
  const zoneCeiling = (zone) => {
    const R = Vectura.Scene3D && Vectura.Scene3D.Regions;
    if (R && typeof R.formCeiling === 'function') return R.formCeiling(zone);
    const ink = Regions.formInk(zone);
    const weight = clamp(finite(ink.coverage, 0) + finite(ink.cross, 0), 0, 4);
    return darkCeilConst() * clamp(weight / darkestWeightConst(), 0, 1);
  };
  const MASTER_MAX_LINES = 420;  // pathological-input guard (steps × lines)
  // ── UNCAPPED MODE — comparison only, NEVER the committed default ────────────
  //
  // Jay, on the ten-law comparison: "no limit on the number of lines you may use
  // — focus on nailing the lighting." The last round's renders were shaped as
  // much by the line budget as by the tone law, so the budget comes off and
  // exactly ONE physical limit is left standing: the PLOT FLOOR. Below ~1.2 x
  // pen width real ink floods and the plot comes off the bed wet; this repo has
  // always stated that bar as `PLOT_FLOOR_PEN` = 2.2 x pen, which is stricter,
  // and it is NOT relaxed here.
  //
  // What is lifted, and where:
  //   - MASTER_MAX_LINES        → `maxLines()`, 4000 instead of 420
  //   - the masterPitch clamp   → the master grid is ruled AT the plot floor, so
  //                               a tone law may ask for any pitch down to it
  //   - the density-derived N   → follows from the pitch above
  // What replaces them: a per-sample clamp `cov ≤ localPitch / floorPitch`, so
  // the floor is enforced where the geometry actually crowds (a sphere's
  // meridians converge to nothing at the poles) rather than on a global average.
  // Every clamp is counted and reported — see `floorStat` / `lastFloorStats`.
  const TONE_UNCAPPED = false;
  const UNCAPPED_MAX_LINES = 4000;
  const maxLines = () => (TONE_UNCAPPED ? UNCAPPED_MAX_LINES : MASTER_MAX_LINES);
  // The last uncapped build's floor report. `null` in the committed build.
  let lastFloorStats = null;
  // RULING CONTINUITY (see emitLine). The scale at which a break stops reading
  // as a break and starts reading as a wobble in one line, and at which a mark
  // stops reading as a stroke and starts reading as a speck. Stated in pen
  // widths like every other plot-safety number here: at the shipped 0.3 mm pen
  // these are 3.6 mm, an order of magnitude below a tone zone's own span on a
  // typical object, so a genuine zone termination is untouched and only
  // sub-stroke chatter is removed.
  const BRIDGE_PEN = 12;
  const SPECK_PEN = 12;
  // EMISSION FLOOR, unconditional. `scene3d.js` has carried MIN_RUN_MM = 0.6 for
  // structural edges since Phase 1 — "sub-pen-width fragments that draw as a dot
  // at best and only cost pen-down travel" — but it was never applied to fill
  // runs, and the curved fill emits plenty: measured on Jay's capsule, ten of
  // family A's twenty-eight runs were under 1 mm and four were under 0.2 mm.
  // Those are not tone at any density; they are a pen-down/pen-up dot. 2 x pen
  // reproduces the existing 0.6 mm at the shipped 0.3 mm pen.
  const MIN_MARK_PEN = 2;

  // A closed sweep's two ends meet ON the parameter seam, so they land on the
  // SAME sampled point — this is a floating-point tolerance, not a bridge. It is
  // deliberately far below MIN_MARK (2 x pen = 0.6 mm at the shipped pen): two
  // ends this close are one point, and nothing else can pass it.
  const SEAM_JOIN_MM = 1e-6;
  // Upper bound on a single ruling's sample count. A wrapped helix asks for more
  // samples than an axis line (see angleFamily); this is the same ceiling the
  // Fidelity control already carries, so `steps x N` stays bounded.
  const MAX_LINE_STEPS = 220;

  // STAGED RE-WIRING of the tone/highlight apparatus. All false => every ruling
  // emits continuously end-to-end; only back-face culling, HLR and MIN_RUN_MM
  // may cut it. Flip ONE at a time. See the dependency notes:
  //   - `masterGrid` and `dither` are a PAIR (masterGrid on + dither off = ~5x
  //     the line count with nothing dropped = a solid black form).
  //   - `coverageCap` / `feather` / `hysteresis` / `treatment` / `dashDuty` only
  //     touch quantities INSIDE the dither block, so each is a strict no-op
  //     while `dither` is off.
  //   - `hysteresis` is meaningless without `feather` OR `coverageCap`.
  //   - `dashDuty` needs `toneZones` (it reads FORM_INK[zone].duty).
  //   - `specular` is a total no-op at Highlight = None regardless (`noHL`).
  //   - `lightDriven` and `treatment` are mutually exclusive by construction.
  const HL_STAGE = {
    masterGrid:     true,  // the ladder's line budget (N, masterPitch, densityOverflow)
    toneZones:      false, // Regions.formZone + FORM_INK + the T/F cross families
    dither:         true,  // the rank-vs-coverage drop verdict itself
    coverageCap:    false, // cap = localPitch/floorPitch  AND  the myCeil ceiling
    feather:        false, // featherAt jitter on the comparison
    hysteresis:     false, // the one-sided re-start margin
    specular:       false, // glint cap + the blank H zone
    lightDriven:    false, // the per-sample specular highlight branch
    treatment:      false, // keep/dashed/dotted/sparse/stippleOut dispatch
    dashDuty:       false, // FORM_INK.duty dash breaks (the R rim)
    shadowGrade:    false, // emitShadowInfill
    continuitySink: true,  // bridge + speck cull. LEAVE ON: it only ever removes
                           // ink the dither made; it is the mitigation, not the disease.
  };

  // ── FIVE TONE ALGORITHMS, SIDE BY SIDE ──────────────────────────────────────
  //
  // Jay, on the phase-stepped Stage-1 render: the rulings "sit in visible
  // clusters of two or three with wider gaps between the clusters". Each
  // coverage LEVEL is internally even now (that is what the phase ladder buys),
  // but the ladder itself has only `tone.ladder.length` rungs — 3 on the shipped
  // default, coverages 0.85 / 0.50 / 0.20 read dark→light. Pitch is masterPitch
  // divided by coverage, so those three rungs are three pitches in the ratio
  // 1 : 1.7 : 4.25. Two adjacent rungs inside one crop read exactly as
  // "two or three tight, then a wide gap": the clustering is the BAND STEP.
  //
  // This is a comparison exercise, not a migration. All five laws live here at
  // once and the selector picks one. `ladder` is the committed default and is
  // byte-identical to the behaviour before this block existed.
  //
  //   'ladder'          the control — discrete rungs, phase-stepped selection.
  //   'continuousPitch' no bands at all. Local pitch is a smoothly EASED
  //                     function of intensity: tight in shadow, easing wider
  //                     toward the light. Rulings are placed by integrating that
  //                     pitch field (which is what the phase accumulator already
  //                     is) rather than by selecting from a rung.
  //   'fineLadder'      the minimal change: the same rung mechanism, but the
  //                     rung count is derived from the ladder's own coverage
  //                     RANGE at ~0.02 per rung, so the step falls below the
  //                     visual threshold instead of being removed.
  //   'weightModulated' perfectly even spacing EVERYWHERE — one pitch, the
  //                     sparse-end pitch — with tone carried by pen weight
  //                     instead of by line density. The plotter-real answer
  //                     (heavier pen / doubled pass in shadow) and the strongest
  //                     possible answer to "100 % even".
  //   'layeredCross'    tone by ADDING families: one in the light, a second
  //                     crossed family through the mid-tones, a third in the
  //                     darks. Each family internally even and continuous. The
  //                     classic engraving answer. Its zones come from intensity
  //                     directly — `HL_STAGE.toneZones` stays off.
  //
  // ── FIVE MORE, AIMED AT THE LIGHTING RATHER THAN AT THE SPACING ─────────────
  //
  // The first five are TONE-TRANSFER laws: they differ in how a coverage number
  // becomes placement. These five differ in what the coverage number MEANS.
  //
  //   'perceptualRamp'    the literal reading of "nail the lighting". Line
  //                       density does not map linearly to perceived grey, so
  //                       the intensity→coverage map goes through a calibrated
  //                       tone response (Murray-Davies ink area → CIE L*) and is
  //                       INVERTED, so apparent darkness on paper is linear in
  //                       scene radiance. It also divides by the LOCAL screen
  //                       pitch, which takes the chart's foreshortening out of
  //                       the answer: the grey then tracks the light and only
  //                       the light.
  //   'crossFade'         layeredCross's tonal strength without its two fatal
  //                       flaws. The second and third families are NOT zone
  //                       confined and are never gated: they fade in by
  //                       CONTINUOUS density, starting sparse and thickening, so
  //                       there is no traceable band edge and no ruling ever
  //                       terminates mid-surface. The composed target is split
  //                       across the families by 1 − Π(1 − a_k), so the three
  //                       together hit the target exactly instead of stacking.
  //   'contourFlow'       the rulings follow the LIGHTING instead of the chart.
  //                       Streamlines of the intensity field: 'iso' runs along
  //                       the iso-intensity curves, 'grad' runs down the
  //                       gradient (their orthogonals). The drawing's line
  //                       DIRECTION then describes the light, which is what a
  //                       hand engraver does. Coverage is perceptualRamp's.
  //   'errorDiffused'     perceptualRamp's target, placed by 1-D error diffusion
  //                       with a two-tap carry instead of by a phase
  //                       accumulator. Aperiodic by construction, so no banding
  //                       and no moiré against the raster, at the cost of the
  //                       Sturmian word's two-consecutive-gaps guarantee.
  //   'fullLightingModel' not a tone-transfer law at all — a SHADING MODEL.
  //                       Highlight, mid-tone, terminator, core shadow and
  //                       reflected/bounce light are each rendered as their own
  //                       term, with specular kept separate from diffuse, and
  //                       the composed darkness is then run through the same
  //                       calibrated response perceptualRamp inverts.
  //
  // ── FIVE MORE, ON THE OTHER AXIS: WEIGHT ALONG THE RULING ───────────────────
  //
  // Measured across the eleven above: nine tie at R² 0.00-0.14 on the sphere and
  // the capsule however the coverage law is written, because the emitter takes
  // ONE draw/skip verdict per RULING — it has to, or a ruling ends in open
  // front-facing surface. Tone can therefore only vary PERPENDICULAR to the
  // rulings, and light does not vary that way on a curved form. `contourFlow`
  // escaped by re-aiming the rulings along the light, at the cost of 10.6 mm
  // free ends and collapsed spacing.
  //
  // WEIGHT IS THE OTHER ESCAPE, AND IT COSTS NO CONTINUITY AT ALL: a stroke that
  // changes width mid-stroke breaks no line. The output format carries ONE
  // `meta.weightScale` per path (the renderer and the SVG export both read it as
  // a stroke-width multiplier), so a weight that varies along a ruling is
  // expressed as CONSECUTIVE ABUTTING PIECES — piece k's last point IS piece
  // k+1's first point, so the pen never lifts and nothing ends in open surface.
  // `splitByWeight` is the whole mechanism, and it never drops a short piece
  // (that would be the one thing this construction may not do — leave a hole);
  // it merges it into its neighbour instead.
  //
  //   'weightAlongLine'   the idea, minimal: geometry perfectly even at
  //                       weightModulated's own pitch, weight taken PER SAMPLE
  //                       from the local radiance and from the local pitch, so
  //                       the chart's foreshortening comes out of the tone too.
  //                       Same weight RANGE as weightModulated, so the pair
  //                       differ only in per-sample vs per-run.
  //   'weightDeepDark'    the darks the user says are missing. The base pitch is
  //                       chosen so the HEAVIEST legal stroke saturates it
  //                       (W_DEEP_AREA), and the transfer is the same L*-linear
  //                       response laws 6-10 invert, so the light end stays
  //                       delicate while the shadow runs to near-solid.
  //   'weightPlusSpacing' both channels at once — spacing concentrates toward
  //                       the shadow AND weight ramps, the required
  //                       amplification split geometrically between them, so
  //                       NEITHER has to quantise as hard.
  //   'weightMultiPass'   the plotter-honest deep dark: instead of asking for a
  //                       pen N times as wide, lay N real strokes of the actual
  //                       pen, offset perpendicular by one ink width and centred
  //                       on the ruling. Costs plot time; reports it.
  //   'weightSmoothstep'  the anti-banding study. weightModulated's per-run mean
  //                       weight exactly, but through a 7th-order smoothstep and
  //                       with a golden-ratio dither on the weight, so residual
  //                       quantisation is broken up rather than aligned.
  const TONE_ALGO = 'ladder';
  // 'contourFlow' only: which streamline family the rulings follow.
  //   'iso'  along the iso-intensity curves
  //   'grad' down the intensity gradient (their orthogonals)
  const FLOW_MODE = 'iso';

  // ── THE LADDER IS PHASE-STEPPED, NOT BIT-REVERSED ───────────────────────────
  //
  // The ladder decides WHICH rulings of a family survive at a given coverage.
  // Until now that was a threshold on a per-line rank drawn from the radical
  // inverse base 2 (van der Corput): keep line i iff `vdc(i) < cov`, with
  // vdc(0,1,2,3,…) = .5, .25, .75, .125, … A bit-reversed prefix is SPREAD —
  // that is what fixed the original "the rank WAS the family coordinate" fault
  // (see the master-grid note above, FAULT 1) — but spread is not the same
  // thing as EVENLY SPACED. vdc is a binary refinement, so the kept-index gaps
  // are always a POWER-OF-TWO pair. Measured on the app default at Stage 1:
  //   cov 0.62 → 11 gaps of 1 line and 18 of 2
  //   cov 0.42 → 17 gaps of 2 and 3 of 4
  //   cov 0.20 → gaps of 4 and 8
  // A gap twice as wide as its neighbours, in an otherwise regular field, reads
  // as a white band that should not be there. That is the "hatch, crosshatch,
  // spiral etc. on curved surfaces seem to have unexpected gaps" report, and it
  // is a property of the PERMUTATION, not of the geometry.
  //
  // The even selection is Bresenham's, i.e. a phase accumulator: carry a
  // running coverage total and keep a ruling exactly when the total crosses an
  // integer. At a CONSTANT coverage that is the Sturmian word of density cov,
  // whose gaps are exactly floor(1/cov) and ceil(1/cov) — two CONSECUTIVE
  // integers, which is the most even a subset of an integer grid can be.
  // Swept over cov 0.02…0.99 at N = 40/64/120/200 it produces a two-consecutive-
  // value gap set at every coverage (0 exceptions) against vdc's 81/194, and a
  // mean spacing CoV of 0.19 against vdc's 0.26.
  //
  // IT HAS TO BE AN ACCUMULATOR, not the closed form `frac((i+1)·cov) < cov`.
  // The two agree only while cov is the same for every ruling, and it is not —
  // every ruling reads its own span mean (see spanDrops). Where cov drifts by
  // cov' per ruling the closed form's phase advances by cov + i·cov', so the
  // kept density comes out as cov + i·cov': on the app-default sphere (cov ~0.2
  // lit to ~0.6 dark across ~100 rulings) that is a 50 % density error halfway
  // down the form — it would trade the gaps for a broken tone ramp. Adding each
  // ruling's OWN coverage advances the phase by exactly cov per ruling, so the
  // local density is the local coverage and the spacing stays even THROUGH the
  // ramp. `ladderPhase` (declared per buildObject call, beside `famSeq`) keys
  // one accumulator per family and span ordinal, so each family is phased
  // independently and rulings are visited in spatial order.
  //
  // WHAT IT COSTS, stated plainly: the kept sets are no longer NESTED. A rank
  // threshold is nested by construction (rank(i) < c1 < c2 ⇒ kept at both), so
  // a tone step used to ADD rulings where a phase-stepped set re-phases them.
  // That is not a preference — the two properties are provably incompatible.
  // Exhaustively (scratchpad `even/nested-proof.mjs`): for N = 6, 8, 9, 10, 11
  // and 12 there is NO nested chain whose every prefix keeps a gap set of at
  // most two consecutive values past m = 2, and vdc is already the best a
  // nested scheme can do (its gap ratio never exceeds 2). Nesting is not
  // load-bearing here: the verdict is taken ONCE PER SPAN, so a ruling still
  // draws its whole span or none of it, and ruling continuity — the thing the
  // seam/span/boundary tests protect — does not depend on it.
  //
  // The phase starts at 0.5 (not 0) for the same reason every family indexes at
  // (i + 0.5)/count: it centres the first kept ruling in its own gap instead of
  // pushing a whole gap in front of it.
  const LADDER_PHASE0 = 0.5;
  // Golden-ratio conjugate. Used to offset one phase track from the next where
  // the tracks are PARALLEL rather than sequential (the stipple raster's rows):
  // it is the step that stays furthest from lining up with itself at every
  // count, so no small number of rows ever falls into phase.
  const GOLDEN_STEP = 0.6180339887498949;
  // One step of the ladder: fold this ruling's coverage into the phase and read
  // off the verdict. Pure, so the test can drive it directly.
  const ladderStep = (phase, cov) => {
    const next = finite(phase, LADDER_PHASE0) + clamp(finite(cov, 0), 0, 1);
    return next >= 1 ? { phase: next - 1, keep: true } : { phase: next, keep: false };
  };
  // Drive the ladder over a whole family in one call — the sequence form of
  // `ladderStep`, exported for the spacing-regularity test.
  const ladderKeep = (covs, phase0) => {
    let phase = Number.isFinite(phase0) ? phase0 : LADDER_PHASE0;
    return (covs || []).map((c) => { const r = ladderStep(phase, c); phase = r.phase; return r.keep; });
  };

  // Zone-boundary FEATHER (§4, and O26 — a curved form must show NO banding
  // between tone bands). Coverage is piecewise-constant across a zone boundary,
  // so without this every line in the family flips state at the same place and
  // the flips line up into a contour. The comparison is dithered by a hash of
  // (line index, a COARSE bucket of the along-line parameter), which moves each
  // line's flip point independently by up to ±FEATHER_AMPL of rank — i.e.
  // stochastic line-end termination, the burin's own answer, at zero extra
  // pen-up cost. The bucket is coarse so the result is a ragged interdigitated
  // boundary, not per-sample speckle.
  // ROUND 4 (O26). The first cut hashed a QUANTIZED bucket of the along-line
  // parameter, so the offset was piecewise CONSTANT — every ruling flipped at one
  // of a handful of shared positions and the boundary came out as traceable right
  // angles in parameter space. A blocky staircase is exactly the artefact the
  // feather exists to prevent, and on the ground (C9/C10) the same idea reads as
  // the best artefact in the set because THERE it is continuous. So the offset is
  // now interpolated between adjacent hash samples: it wanders smoothly along
  // each ruling, and independently per ruling, which is what interdigitates.
  const FEATHER_AMPL = 0.30;
  const FEATHER_BUCKET = 5;
  // Re-start margin on the dither comparison, in units of `rank` (see the
  // one-sided hysteresis in emitLine). DERIVED, not tuned: `featherAt` returns
  // [-0.5, 0.5], so the feather moves the comparison by at most
  // ±FEATHER_AMPL/2. A margin of exactly that half-amplitude is the smallest
  // one the feather cannot fake — so the feather can still move WHERE a ruling
  // stops (its documented job) but can no longer switch a ruling back on again
  // mid-form (which was never its job).
  const HYST_RANK = FEATHER_AMPL / 2;
  // ...AND IT IS A SHARE OF THE LOCAL COVERAGE, NOT AN ABSOLUTE RANK OFFSET.
  //
  // The paragraph above derives the SIZE of the margin correctly and then states
  // it in the wrong units, which made it a ban rather than a margin everywhere
  // the form is sparse.
  //
  // A zone's usable rank budget IS its coverage: only rulings whose rank sits
  // below `covCapped` ever draw there. Subtracting a flat 0.15 therefore means
  // something different in every zone. At the dark ceiling (`TOTAL_DARK_CEIL`
  // 0.47) it is about a third of the budget and reads as "you need a real rise",
  // which is the documented intent. At the centre light, whose composed
  // coverage measures ~0.08 on the ladder fixtures, it is TWICE the whole
  // budget: `covCapped - HYST_RANK` is negative, no rank can satisfy it, and a
  // ruling that stops anywhere in L can never restart. That is not "harder to
  // restart", it is "cannot", and it deletes the sparse marks §5.4 #1 requires
  // the centre light to carry.
  //
  // So the margin is charged as a SHARE OF THE LOCAL COVERAGE. It keeps its
  // meaning in every zone — "a re-start needs a rise worth this much of what
  // the zone can lay down" — instead of meaning "a real rise" in the dark and
  // "never" in the light.
  //
  // MEASURED. `f` is margin ÷ coverage (the flat rule is f = 0.15/cov, which
  // is where it blows up). Four-fixture ladder, `scene3d-form-ladder`'s boolean
  // grid, with the L-zone speck exemption below held on throughout:
  //
  //   f        D(L) per fixture           worst    worst F/M   O12 2->3  C15 caustic
  //   flat     .0638 .0587 .0692 .0750    .0587 X  1.7300 X    .0346 X   demoted X
  //   0.05  <- .0725 .0702 .0762 .0865    .0702    1.6841      pass      1.069 both
  //   0.075                    (ladder unchanged)                pass    1.069 both
  //   0.10     .0725 .0702 .0762 .0865    .0702    1.6915      pass      demoted X
  //   0.15     .0725 .0702 .0762 .0865    .0702    1.6915      pass      demoted X
  //   0.20     .0684 .0698 .0736 .0840    .0684    1.6942      pass      demoted X
  //   0.32     .0684 .0690 .0714 .0798    .0684    1.6904      .0431 X   demoted X
  //   (Round 10, pre-p4)
  //            .0694 .0678 .0762 .0865    .0678    1.6601      .0465     1.069 both
  //
  // Bars, for reading the table: O6 ratchet D(L) >= 0.067, F/M <= 1.70, O12's
  // bands 2 -> 3 ratchet > 0.046.
  //
  // "demoted" is the C15 sub-window clause losing its own subject: above
  // f = 0.075 the pole caustic on `W-bigball-bands4` falls from 1.069 to 0.888
  // and stops being that drawing's worst point, so the global argmax moves to an
  // ordinary lighting-driven dark patch that DOES follow the sun — which is
  // exactly what `scene3d-subwindow-density`'s light-independence test reports.
  //
  // Every criterion is met across the plateau f ∈ (0, 0.075], and every one is
  // met at least as well as it was pre-p4. Pinned in the middle of the plateau
  // rather than at either edge: the flat rule failed in the first place because
  // it sat where a small change in the drawing flips a verdict.
  const HYST_COV_SHARE = HYST_RANK / 3;   // 0.05
  const hystFor = (covCapped) => HYST_COV_SHARE * clamp(covCapped, 0, 1);

  // Line count from the density slider (1..100 → ~6..40 wrap lines).
  const lineCountFor = (density) => Math.max(4, Math.round(6 + clamp(density, 0, 100) * 0.34));

  // A wrapped spiral needs many more loops than a hatch line-count to read as a
  // dense helix: Density 100 must approach full overlap (I13). The wrap budget is
  // `lineCountFor(density) × SPIRAL_TURN_GAIN`, capped so a pathological
  // density/detail combo cannot explode the sample count (steps × turns).
  const SPIRAL_TURN_GAIN = 2.4;
  const SPIRAL_MAX_TURNS = 120;

  // buildObject(opts) → array of screen polylines, or null when unsupported.
  //   opts: { mode, sizes, detail, fillFidelity, transform, applyTransform,
  //           projectWorld, camAngles, mapper, fillAngle, fillDensity, toneOn,
  //           intensityFn, xray }
  //   fillFidelity: Style-tab Fidelity — a multiplier (0.25..3, default 1) on the
  //   number of SAMPLES taken along each fill line. Distinct from `detail`, which
  //   is the mesh's tessellation. 1 ⇒ byte-identical to the pre-Fidelity fill.
  //   fillAngle: hatch/crosshatch direction in the surface's OWN tangent frame
  //   (deg). 0 = meridians (the legacy family), 90 = parallels; see the angle
  //   family block below. Omitted/0 ⇒ byte-identical to the pre-angle fill.
  //   cross: { angleDelta, densityRatio, triple } — the crosshatch family-B
  //   controls, with EXACTLY the faceted path's semantics (crossFamilies in
  //   scene3d.js): family B sits at fillAngle + angleDelta and its SPACING is
  //   scaled by densityRatio (ratio > 1 ⇒ sparser B); `triple` adds a third pass
  //   at fillAngle + 45 on family-B's spacing, and the CALLER owns its
  //   darkest-tone-band gate (as the faceted path does). Omitted ⇒ the legacy
  //   +90 / same-density / no-triple crossing family, byte-identical.
  //   intensityFn(worldNormal, worldPoint) → [0,1] combined multi-light intensity
  //   (worldPoint is the per-sample world surface point, needed by point/spot).
  //   xray: { backFaces, backDensity } — when backFaces, also emit the FAR
  //   surface as a second family (polylines tagged `.back = true`) so the caller
  //   draws it dashed/sparse; back count = front count × backDensity (0.2–1).
  //   I8 (light-driven): shadowSensitivity (stage count, dark-end grading),
  //   specularFn(worldNormal, worldPoint) → per-sample specular S, and
  //   highlight.{lightDriven, sensitivity} place a per-sample glint. All default
  //   off ⇒ byte-identical to the pre-I8 fill.
  const buildObject = (opts) => {
    if (!opts || !rotatePoint) return null;
    const chart = chartFor(opts.mode, opts.sizes);
    const applyTransform = opts.applyTransform;
    const projectWorld = opts.projectWorld;
    if (!chart || typeof applyTransform !== 'function' || typeof projectWorld !== 'function') return null;

    const t = opts.transform || { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 };
    const rot = { yaw: finite(t.yaw, 0), pitch: finite(t.pitch, 0), roll: finite(t.roll, 0) };
    const cam = opts.camAngles || { yaw: 0, pitch: 0, roll: 0 };
    const toneOn = Boolean(opts.toneOn && typeof opts.intensityFn === 'function');
    const intensityFn = opts.intensityFn || null;
    const EPS = 1e-3;

    // ── Tone LADDER consumption (items 1+2). The old dither compared the local
    // shade (1 − I) to a purely geometric per-line rank (i+0.5)/count, so the
    // curved fill ignored band count / thresholds / coverage / specular. Now
    // each sample's intensity I is quantized into a band (Regions.band) and the
    // band's authored coverage sets how many of the N lines draw there.
    //
    // Direction: SurfaceFill renders dark→dense, bright→sparse (the blank cap IS
    // the highlight — the retired specular disc). The ladder is authored dark→
    // light and Regions.band gives bright = HIGH index, so we read the coverage
    // for the COMPLEMENT band: the darkest surface gets the ladder's high-coverage
    // end (dense), the lit cap the low end (near-blank). Band COUNT (ladder
    // length) therefore changes the number of tone steps, and each Coverage
    // slider scales its band's line density.
    const Regions = Vectura.Scene3D && Vectura.Scene3D.Regions;
    const tone = opts.tone || null;
    const ladderLen = tone && Array.isArray(tone.ladder)
      ? tone.ladder.filter((c) => Number.isFinite(c)).length : 0;
    const useLadder = Boolean(toneOn && tone && Regions
      && typeof Regions.band === 'function' && typeof Regions.coverageFor === 'function'
      && ladderLen >= 1);
    // Specular: when enabled, the BRIGHTEST band is further sparsened/blanked to
    // read as a distinct glint cap, scaled by size (bigger size → blanker). When
    // disabled it keeps the ladder coverage. This is the live wiring of the Tone
    // section's Specular On/Off + size (they were previously dead), and doubles
    // as the "dark specular" fix — the bright band reads LIGHTER, never denser.
    // `none` — the total highlight/specular BYPASS (Jay, 2026-08-09: "none
    // should represent no highlighting being present at all. This means the
    // lines must not break"). It kills the glint cap outright, which is the
    // confirmed cause of the "chunks simply missing from my rings with
    // highlights off" report: the cap fired on the brightest band regardless of
    // whether any highlight was switched on. Under `none` there is no H zone, no
    // cap, no highlight channel and no highlight pen — the fill is exactly what
    // the tone ladder made.
    const noHL = opts.noHighlight === true;
    const specOn = Boolean(HL_STAGE.specular && useLadder && !noHL && tone.specular && tone.specular.enabled !== false);
    const specSize = specOn ? clamp(finite(tone.specular.size, 1), 0, 3) : 0;
    const nB = ladderLen;
    // I8 — shadow SENSITIVITY: graded darkening on the dark end (stage count).
    // Default 1 = strict no-op; N quantizes low intensity into N darkening stages
    // (more coverage → denser shadow), a smoother dark gradient as N rises.
    const shadowSens = clamp(Math.round(finite(opts.shadowSensitivity, 1)), 1, 8);
    const shadowGrades = Boolean(HL_STAGE.shadowGrade && useLadder && shadowSens > 1 && Regions && typeof Regions.shadowStage === 'function');
    // Ink line-fraction (0..1) for a sample: how many of the N wrap lines draw at
    // this local intensity. Dark → high, lit cap → low.
    // O6 — THE GLINT CAP IS BOUNDED. Unbounded, `cov *= (1 - 0.5*specSize)` took
    // a default-ish lit coverage of ~0.2 down to ~0.1, i.e. fewer than one wrap
    // line in ten. Two things went wrong with that, and they are the same thing
    // seen from two sides:
    //
    //   - The centre light was ALREADY near-bare paper, so blanking a sub-region
    //     of it — which is what every highlight treatment does — was invisible.
    //     That is why highlights "don't work": there was no surround to contrast
    //     against. A highlight is defined by the ink around it.
    //   - It fires on the BRIGHTEST BAND regardless of whether any highlight is
    //     switched on, so with highlights disabled a contour/parallel fill came
    //     out with chunks simply missing from its rings. Reported from the app on
    //     a capsule, and it is the same defect.
    //
    // So the cap now lightens the lit band by at most 1 - GLINT_KEEP of its own
    // ladder coverage, never below LIT_FLOOR outright. It still reads as a glint
    // (specular on is measurably lighter than specular off, and the ladder's
    // ordering is untouched) without gouging the fill.
    //
    // THE SPARSE-END FLOOR IS A PITCH, NOT A CONSTANT — AND IT IS NOT APPLIED
    // HERE. `zoneCoverage` below floors the lit band at `litFloorCov`, derived
    // from the master pitch so the lit band's SPACING can never exceed
    // `litMaxPitchPen() × pen` (3.6 mm at a 0.3 mm pen). This function floors it
    // at the bare constant `LIT_FLOOR`, which cannot know what pitch it buys.
    //
    // That is deliberate, and the reason is the scale it is applied at. This is
    // a PER-SAMPLE coverage: the span verdict averages it over a whole ruling,
    // so raising it here lifts every ruling that so much as clips the centre
    // light. Measured: floored here at `litFloorCov`, the app-default sphere's
    // lit cap went from 0.425 to 0.739 mm of ink per mm² — DENSER than its own
    // core shadow (0.567) — and the 62 mm contour ramp fell from 1.87x to 1.72x,
    // under the 1.8x bar `scene3d-fill-span-verdict` sets for "the drawing still
    // shades". The bar is right and the floor is right; the SCALE was wrong.
    //
    // So the pitch bar is charged once per SPAN, in the verdict itself (see
    // `litSpanFloor` in emitLine), on the rulings that actually lie in the
    // centre light. See there for the numbers.
    const coverageForSample = (I) => {
      const b = Regions.band(I, tone);
      // b: 0..nB-1, bright = HIGH
      let cov = Regions.coverageFor(nB - 1 - b, tone); // complement → dark = dense
      if (b === nB - 1) {
        const raw = cov;
        if (specOn) cov *= clamp(1 - 0.5 * specSize, 0, 1); // glint cap
        cov = Math.max(cov, raw * GLINT_KEEP, LIT_FLOOR);
      }
      return clamp(cov, 0, 1);
    };

    // ── THE FOUR ALTERNATIVE TONE LAWS ─────────────────────────────────────────
    //
    // Every one of them is a function of surface intensity `I` returning the
    // same quantity `coverageForSample` returns: the FRACTION of the master grid
    // that draws here. The phase accumulator turns that fraction into placement,
    // so a coverage field IS a pitch field — local pitch = masterPitch / cov —
    // and integrating it is exactly what `ladderStep` already does. That is why
    // none of these needs a second placement mechanism.
    //
    // THE ENVELOPE, and where its two ends come from. Neither end is invented:
    //   dark end  = the ladder's own densest rung. Going denser than the author
    //               asked is not this exercise's business.
    //   light end = `litFloorCov`, the coverage at which family A rules at
    //               exactly `litMaxPitchPen() × pen`. That is §5.4 #1 / O6's
    //               sparse-end floor, and it is the SAME bar `litSpanFloor`
    //               charges on the discrete ladder — so all five laws share one
    //               sparse end and the comparison is fair.
    // The plot floor needs no clamp here and cannot be reached: the master grid
    // already floors `masterPitch` at `PLOT_FLOOR_PEN × pen`, and coverage ≤ 1,
    // so the emitted pitch masterPitch/cov is ≥ masterPitch ≥ the floor. Stated
    // as a clamp anyway, because a floor you only argue for is not a floor.
    let toneEnv = null;
    const toneEnvelope = () => {
      if (toneEnv) return toneEnv;
      const covs = [];
      for (let b = 0; b < nB; b++) covs.push(clamp(finite(Regions.coverageFor(b, tone), 0.5), 0, 1));
      // UNCAPPED: the dark end is the PLOT FLOOR itself, not the ladder's densest
      // rung. The rung is a budget decision ("going denser than the author asked
      // is not this exercise's business") and the budget is exactly what has
      // been lifted; with the master grid ruled AT the floor, coverage 1 is the
      // floor, and that is the darkest legal tone rather than an authored one.
      const covDark = TONE_UNCAPPED ? 1
        : clamp(covs.length ? Math.max.apply(null, covs) : 0.85, 0.05, 1);
      const rawLight = covs.length ? Math.min.apply(null, covs) : 0.2;
      // The sparse end never goes BELOW the O6 pitch bar, and never above the
      // dark end (a degenerate one-rung ladder collapses to a flat field, which
      // is honest: there is no ramp to draw).
      const covLight = clamp(Math.max(rawLight, litFloorCov > 0 ? litFloorCov : rawLight), 0.02, covDark);
      // Plot floor, restated as the clamp it is.
      const capByFloor = (masterPitch > 1e-6 && floorPitch > 1e-6)
        ? clamp(masterPitch / floorPitch, 0.02, 1) : 1;
      toneEnv = { covDark: Math.min(covDark, capByFloor), covLight: Math.min(covLight, capByFloor) };
      return toneEnv;
    };
    // Smootherstep. The user asked for an EASE, not a linear ramp: this one has
    // zero first AND second derivative at both ends, so the ramp leaves the
    // shadow and arrives at the highlight without a visible knee.
    const ease = (t) => { const u = clamp(t, 0, 1); return u * u * u * (u * (6 * u - 15) + 10); };
    // 'continuousPitch' — the eased pitch field, no bands anywhere. The EASE is
    // applied in PITCH space, not in coverage space, because pitch is the thing
    // the eye measures: an eased coverage would still bunch the wide gaps at the
    // light end (coverage is a reciprocal). Reciprocating back at the end is
    // what hands the phase accumulator a density it can integrate.
    const contPitchCov = (I) => {
      const env = toneEnvelope();
      const uDark = 1 / Math.max(1e-6, env.covDark);    // pitch, in master-grid units
      const uLight = 1 / Math.max(1e-6, env.covLight);
      const u = uDark + (uLight - uDark) * ease(clamp(finite(I, 0), 0, 1));
      return clamp(1 / Math.max(1e-6, u), 0.02, 1);
    };
    // The ladder's own SHAPE as a continuous curve: piecewise-linear through the
    // authored rungs at their band centres. `fineLadder` re-quantizes this, so
    // it keeps the author's tone curve and only removes the step size.
    const bandCentre = (b) => {
      const th = (tone && Array.isArray(tone.thresholds))
        ? tone.thresholds.filter((t) => Number.isFinite(t)) : [];
      const lo = b === 0 ? 0 : clamp(finite(th[b - 1], b / nB), 0, 1);
      const hi = b >= nB - 1 ? 1 : clamp(finite(th[b], (b + 1) / nB), 0, 1);
      return (lo + hi) / 2;
    };
    const ladderCurve = (I) => {
      const x = clamp(finite(I, 0), 0, 1);
      if (nB <= 1) return coverageForSample(x);
      // Coverage read dark→dense, exactly as `coverageForSample` reads it.
      const covAtBand = (b) => clamp(finite(Regions.coverageFor(nB - 1 - b, tone), 0.5), 0, 1);
      if (x <= bandCentre(0)) return covAtBand(0);
      for (let b = 1; b < nB; b++) {
        const c0 = bandCentre(b - 1); const c1 = bandCentre(b);
        if (x <= c1) {
          const t = c1 > c0 + 1e-9 ? (x - c0) / (c1 - c0) : 1;
          return covAtBand(b - 1) + (covAtBand(b) - covAtBand(b - 1)) * t;
        }
      }
      return covAtBand(nB - 1);
    };
    // 'fineLadder' — rungs, still, but MANY. The count is derived, not chosen:
    // one rung per 0.02 of the ladder's own coverage range (0.85 → 0.41 on the
    // shipped default = 22 rungs), bounded so a degenerate ladder cannot ask for
    // one rung or a thousand.
    const FINE_RUNG_COV = 0.02;
    let fineRungs = 0;
    const fineRungCount = () => {
      if (fineRungs) return fineRungs;
      const env = toneEnvelope();
      fineRungs = clamp(Math.round((env.covDark - env.covLight) / FINE_RUNG_COV), 8, 32);
      return fineRungs;
    };
    const fineLadderCov = (I) => {
      const env = toneEnvelope();
      const n = fineRungCount();
      const span = env.covDark - env.covLight;
      if (span <= 1e-6 || n < 2) return env.covDark;
      const c = clamp(ladderCurve(I), env.covLight, env.covDark);
      const k = clamp(Math.round(((c - env.covLight) / span) * (n - 1)), 0, n - 1);
      return clamp(env.covLight + (k / (n - 1)) * span, 0.02, 1);
    };
    // 'weightModulated' and 'layeredCross' both hold the GEOMETRY constant and
    // put the tone somewhere else, so both read one coverage everywhere: the
    // sparse end, i.e. the widest even pitch the sparse-end floor allows. It has
    // to be the sparse end — a heavier pen or a second family can only ever ADD
    // ink, so the even base must be the lightest value the drawing needs.
    const flatCov = () => toneEnvelope().covLight;
    // 'weightModulated' — the tone the geometry no longer carries, restated as
    // pen weight. 1.0 in the light, up to covDark/covLight in the shadow, on the
    // same ease. That ratio is chosen so the WEIGHTED ink density (length × pen
    // width) traces the same dark/light ramp the ladder draws, which is what
    // makes the two comparable at all.
    const weightAt = (I) => {
      const env = toneEnvelope();
      const top = clamp(env.covDark / Math.max(1e-6, env.covLight), 1, 6);
      return clamp(top + (1 - top) * ease(clamp(finite(I, 0), 0, 1)), 1, 6);
    };
    // 'layeredCross' — the engraver's zones, off intensity alone. No call into
    // `Regions.formZone`, no `HL_STAGE.toneZones`: two cuts on I, placed at the
    // ladder's own thresholds when it has them so the three families change over
    // where the author said the tone does.
    const xcCuts = () => {
      const th = (tone && Array.isArray(tone.thresholds))
        ? tone.thresholds.filter((t) => Number.isFinite(t)).slice().sort((a, b) => a - b) : [];
      const lo = clamp(finite(th[0], 0.33), 0.02, 0.95);
      const hi = clamp(finite(th[th.length - 1], 0.66), lo + 0.02, 0.98);
      return { lo, hi };
    };
    const xcZoneOf = (smp) => {
      const c = xcCuts();
      const I = clamp(finite(smp && smp.I, 0), 0, 1);
      if (I < c.lo) return 'X2';   // darks — three families
      if (I < c.hi) return 'X1';   // mid-tones — two families
      return 'X0';                 // light — one family
    };
    // ── LAWS 6–10: THE LIGHTING, NOT THE SPACING ───────────────────────────────
    //
    // THE TONE RESPONSE, AND WHY IT HAS TO BE INVERTED.
    //
    // Line density does NOT map linearly onto perceived grey, and it fails in
    // two separate places:
    //
    //   (1) INK AREA is linear in density but perceived LIGHTNESS is not linear
    //       in ink area. Parallel rulings of width w at screen pitch p lay down
    //       an area fraction a = w/p (Murray-Davies; they do not overlap, which
    //       is what the plot floor guarantees). Paper reflectance is Y = 1 − a,
    //       and the eye reads Y through a cube root — CIE L*. So a drawing whose
    //       DENSITY ramps linearly has a GREY that crowds into the darks: half
    //       the ink is nowhere near half the apparent tone.
    //
    //   (2) THE CHART FORESHORTENS. `masterPitch` is a median over the form; the
    //       pitch that actually lands at a sample is `localPitch`, and on a
    //       sphere that varies by an order of magnitude between the equator and
    //       the pole. A law stated in coverage alone therefore draws the CHART's
    //       geometry as tone on top of the light's.
    //
    // Laws 6–10 all correct both: they name a target APPARENT AREA as a function
    // of the light, and then divide by the pitch that is actually here. What is
    // left is a drawing whose grey is a function of scene radiance and of
    // nothing else — which is the whole of "nail the lighting".
    const Lstar = (Y) => { const t = clamp(finite(Y, 1), 0, 1); return t > 0.008856 ? 116 * Math.cbrt(t) - 16 : 903.3 * t; };
    const invLstar = (L) => { const l = Math.max(0, finite(L, 100)); return l > 8 ? Math.pow((l + 16) / 116, 3) : l / 903.3; };
    // The nib lays a line wider than its nominal width — ink spreads into the
    // paper. One fitted constant, and the only one: it is measured back out of
    // the render by the apparent-tone metric, so a wrong value shows up as a
    // bowed response rather than hiding.
    const INK_SPREAD = 0.12;
    const inkWidth = () => penWidth * (1 + INK_SPREAD);
    const areaAt = (pitch) => clamp(inkWidth() / Math.max(1e-6, pitch), 0, 0.98);
    // The apparent-tone envelope. BOTH ENDS ARE PHYSICAL and neither is chosen:
    // darkest = the plot floor, lightest = the O6 sparse bar (`litMaxPitchPen()`
    // x pen, the pitch past which the centre light has no ink for a highlight to
    // be blank against). On the shipped 0.3 mm pen that is 0.66 mm → 3.6 mm, so
    // the widest tone ramp any law can draw is 5.45 : 1 in pitch. Every ramp
    // number below should be read against that ceiling, not against infinity.
    let toneAmp = null;
    const apparentEnvelope = () => {
      if (toneAmp) return toneAmp;
      const env = toneEnvelope();
      const pDark = masterPitch > 1e-6 ? masterPitch / Math.max(1e-6, env.covDark) : floorPitch;
      const pLight = masterPitch > 1e-6 ? masterPitch / Math.max(1e-6, env.covLight) : litMaxPitchPen() * penWidth;
      toneAmp = { aDark: areaAt(pDark), aLight: areaAt(pLight), pDark, pLight };
      return toneAmp;
    };
    // Radiance → target ink area, such that PERCEIVED grey is linear in radiance.
    // Interpolate in L* (which is the perceptual axis), then invert back through
    // Y = 1 − a to get the area a ruling field must actually lay down.
    const areaForTone = (I, aDark, aLight) => {
      const Ld = Lstar(1 - clamp(aDark, 0, 0.98));
      const Ll = Lstar(1 - clamp(aLight, 0, 0.98));
      const L = Ld + (Ll - Ld) * clamp(finite(I, 0), 0, 1);
      return clamp(1 - invLstar(L), 0, 0.98);
    };
    const targetArea = (I) => { const e = apparentEnvelope(); return areaForTone(I, e.aDark, e.aLight); };
    // Target area → coverage AT THIS SAMPLE. Dividing by the measured local
    // pitch is what removes the projection from the answer (see (2) above).
    // Falls back to the master pitch where the frame is degenerate — a pole or
    // the silhouette, where "the pitch between adjacent rulings" has no answer.
    const covForArea = (area, localPitch) => {
      const p = (Number.isFinite(localPitch) && localPitch > 1e-6) ? localPitch : masterPitch;
      if (!(p > 1e-6)) return clamp(finite(area, 0), 0, 1);
      return clamp((clamp(finite(area, 0), 0, 0.98) * p) / inkWidth(), 0.005, 1);
    };
    // 'perceptualRamp'
    const perceptualCov = (I, localPitch) => covForArea(targetArea(I), localPitch);

    // 'crossFade' — layeredCross's three layers, un-gated and continuous.
    //
    // Which of the three families is emitting. Set by `emitCrossFade`; family A
    // is layer 0 and is the default, so a build that never reaches the cross
    // emitter behaves exactly as one family.
    let xfLayer = 0;
    // The composed ceiling in the deepest shadow. Three families each at the
    // plot floor would compose to solid black, so the DARK end of crossFade's
    // envelope is stated as an area and split, never as three independent
    // floors. 0.72 is `Regions.TOTAL_DARK_CEIL`-shaped: dark enough to read as
    // the darkest tone on the form, short of a flooded blob.
    const XF_MAX_AREA = 0.72;
    // Each layer's WEIGHT at this radiance. Layer 0 runs everywhere; layer 1
    // fades in from just off the highlight; layer 2 from the mid-tones. The
    // fades are smootherstepped, so no layer has an edge anywhere — that is the
    // whole point, and it is what layeredCross's zone cuts could not do.
    const xfWeights = (I) => {
      const s = 1 - clamp(finite(I, 0), 0, 1);
      return [1, ease(clamp((s - 0.10) / 0.90, 0, 1)), ease(clamp((s - 0.45) / 0.55, 0, 1))];
    };
    const crossFadeCov = (I, localPitch) => {
      const e = apparentEnvelope();
      const total = areaForTone(I, XF_MAX_AREA, e.aLight);
      const w = xfWeights(I);
      const W = w[0] + w[1] + w[2];
      const share = W > 1e-9 ? clamp(w[clamp(Math.round(xfLayer), 0, 2)] / W, 0, 1) : 1;
      // Perceived coverage composes as 1 − Π(1 − a_k), so a_k = 1 − (1 − total)^share
      // makes the three families compose to EXACTLY `total`. Additive shares
      // would undershoot by a third; independent floors would flood.
      const a = 1 - Math.pow(1 - clamp(total, 0, 0.98), share);
      return covForArea(a, localPitch);
    };

    // 'fullLightingModel' — the whole shading anatomy, five terms, each its own.
    //
    // Everything above ramps DIFFUSE. This one renders the parts a draughtsman
    // actually names, so each reads distinctly on the page:
    //   (a) diffuse mid-tone       — plain Lambert
    //   (b) terminator             — the tone turns over fast HERE, so the ramp
    //                                steepens across the band where n·L ≈ 0
    //   (c) core shadow            — the darkest tone on the form sits just PAST
    //                                the terminator, not at the silhouette
    //   (d) reflected / bounce     — ground light lifting the shadow's far edge,
    //                                which is what stops a shadow reading as a
    //                                hole cut in the form
    //   (e) specular               — its own term with its own much tighter
    //                                falloff, SUBTRACTED from the diffuse tone
    //                                rather than folded into it
    // The signed (unclamped) Lambert is what makes (b), (c) and (d) separable at
    // all: `smp.I` is clamped, so the entire dark side of the form is I = 0 and
    // has no anatomy left in it.
    const FLM_CORE_AMPL = 0.30;
    const FLM_TERM_AMPL = 0.10;
    const FLM_BOUNCE_AMPL = 0.34;
    const FLM_SPEC_AMPL = 0.85;
    const FLM_SHININESS = 42;
    const flmDarkness = (smp) => {
      if (!smp) return 0.5;
      const I = clamp(finite(smp.I, 0), 0, 1);
      let D = 1 - I;                                   // (a) DIFFUSE
      const lights = zoneCtx ? zoneCtx.lights : null;
      const nl = (lights && typeof Regions.signedLambert === 'function')
        ? clamp(finite(Regions.signedLambert(smp.wN, smp.world, lights), 0), -1, 1)
        : (I > 0 ? I : -0.5);
      const w = clamp(finite(zoneCtx && zoneCtx.terminatorNL, finite(Regions.TERMINATOR_NL, 0.22)), 0.05, 0.6);
      D += FLM_TERM_AMPL * (1 - Math.abs(clamp(nl / w, -1, 1)));   // (b) TERMINATOR
      const u = (nl + 1.35 * w) / (0.85 * w);                      // (c) CORE SHADOW
      D += FLM_CORE_AMPL * Math.exp(-u * u);
      const lift = (typeof Regions.reflectedLift === 'function')   // (d) BOUNCE
        ? clamp(finite(Regions.reflectedLift(smp.wN, smp.world, zoneCtx && zoneCtx.ground), 0), 0, 1) : 0;
      D -= FLM_BOUNCE_AMPL * lift * ease(clamp((-nl - 2 * w) / Math.max(1e-6, 1 - 2 * w), 0, 1));
      if (lights && typeof Regions.specularTerm === 'function') {  // (e) SPECULAR
        D -= FLM_SPEC_AMPL * clamp(finite(Regions.specularTerm(smp.wN, smp.world, lights, opts.camAngles, FLM_SHININESS), 0), 0, 1);
      }
      return clamp(D, 0, 1);
    };
    const flmCov = (smp, localPitch) => {
      const e = apparentEnvelope();
      return covForArea(areaForTone(1 - flmDarkness(smp), e.aDark, e.aLight), localPitch);
    };

    // ── LAWS 12-16: THE TONE RIDES ON THE PEN, NOT ON THE PLACEMENT ────────────
    //
    // See the header block. These five hold the ruling's CONTINUITY absolutely —
    // the verdict is still one per ruling — and vary the stroke WIDTH instead,
    // which is a continuous quantity and cannot break a line.
    const W_MIN = 1;            // a plotter cannot draw thinner than its own pen
    const W_MAX = 6;            // scene3d.js clamps meta.weightScale to [0.1, 6]
    const W_LEVEL = 0.12;       // weight quantum at which a piece boundary opens
    const W_DEEP_AREA = 0.93;   // "near solid" — the deep-dark target ink area
    const W_FLOOD_AREA = 0.95;  // past this the ink is a blob; counted, not hidden
    const W_DITHER = 0.06;      // weightSmoothstep's low-discrepancy weight jitter
    const MP_MAX = 5;           // weightMultiPass — most strokes in one band
    const WEIGHT_LAWS = {
      weightAlongLine: 1, weightDeepDark: 1, weightPlusSpacing: 1,
      weightMultiPass: 1, weightSmoothstep: 1,
    };
    const isWeightLaw = () => WEIGHT_LAWS[TONE_ALGO] === 1;
    // Which of them vary the weight ALONG the ruling, and therefore split it into
    // abutting pieces. `weightSmoothstep` deliberately does not: it is the
    // anti-banding study ON weightModulated's own per-run mean, and splitting it
    // would confound the two questions.
    const splitsAlongLine = () => TONE_ALGO === 'weightAlongLine'
      || TONE_ALGO === 'weightDeepDark' || TONE_ALGO === 'weightPlusSpacing'
      || TONE_ALGO === 'weightMultiPass';
    // WHERE THE WEIGHT LAWS ACTUALLY LANDED — the counterpart to `floorStat`.
    // The weight range is bounded at both ends by physics (you cannot draw
    // thinner than the pen, and past W_FLOOD_AREA the ink is a blob), so "did
    // the law reach the dark it asked for" is a measurement, not an assertion.
    const weightStat = {
      samples: 0, floods: 0, atMax: 0, wMin: Infinity, wMax: 0,
      askMax: 0, aMin: 1, aMax: 0, wSum: 0,
    };
    // The base coverage each weight law rules its even grid at.
    //   weightAlongLine / weightSmoothstep  weightModulated's own sparse end, so
    //     the three are directly comparable.
    //   weightDeepDark / weightMultiPass    the pitch at which the heaviest legal
    //     stroke saturates. Derived, not chosen: any wider and no legal pen can
    //     reach W_DEEP_AREA; any tighter and the light end stops being delicate.
    //   weightPlusSpacing                   varies with radiance — see `wpsCov`.
    const deepFlatCov = () => {
      const env = toneEnvelope();
      const c = (W_DEEP_AREA * masterPitch) / (W_MAX * inkWidth());
      return clamp(finite(c, env.covLight), env.covLight, env.covDark);
    };
    const weightBaseCov = () => ((TONE_ALGO === 'weightDeepDark' || TONE_ALGO === 'weightMultiPass')
      ? deepFlatCov() : flatCov());
    // The light end never moves: weight 1 on the base grid. That is what "the
    // light end stays delicate" means arithmetically.
    const wLightArea = () => {
      const p = masterPitch > 1e-6
        ? masterPitch / Math.max(1e-6, weightBaseCov())
        : litMaxPitchPen() * penWidth;
      return areaAt(p);
    };
    const wDarkArea = () => {
      if (TONE_ALGO === 'weightAlongLine' || TONE_ALGO === 'weightSmoothstep') {
        const env = toneEnvelope();
        const top = clamp(env.covDark / Math.max(1e-6, env.covLight), 1, W_MAX);
        return clamp(wLightArea() * top, 0, 0.98);
      }
      return W_DEEP_AREA;
    };
    // The tone target, on the SAME perceptual response laws 6-10 invert: L* is
    // linear in scene radiance between the two ends.
    const wTargetArea = (I) => areaForTone(I, wDarkArea(), wLightArea());
    // How much more ink than the light end this radiance asks for.
    const wAmp = (I) => {
      const aL = wLightArea();
      return aL > 1e-9 ? Math.max(1, wTargetArea(I) / aL) : 1;
    };
    // 'weightPlusSpacing' — the amplification split geometrically between the two
    // channels. kappa = 0.5 is the even split: spacing carries sqrt(A) and weight
    // carries sqrt(A), so a channel that would have had to quantise a 4x range
    // now quantises a 2x one, and the product still lands exactly on A.
    const WPS_KAPPA = 0.5;
    const wpsCov = (I) => {
      const env = toneEnvelope();
      const base = flatCov();
      return clamp(base * Math.pow(wAmp(I), WPS_KAPPA), base, Math.min(1, env.covDark));
    };
    // The coverage a weight law is ruling at, at this radiance — the divisor the
    // weight has to be stated against.
    const weightCovAt = (I) => (TONE_ALGO === 'weightPlusSpacing' ? wpsCov(I) : weightBaseCov());
    // ...AND THE COVERAGE THE FLOOR ACTUALLY LEFT. `covAtSample` clamps coverage
    // to `localPitch / floorPitch` wherever the geometry crowds (a sphere's
    // meridians converge to nothing at the poles), so the grid that is really on
    // the paper there is SPARSER than the law asked for. A weight stated against
    // the nominal coverage is then wrong by exactly that factor, and it is wrong
    // in the worst direction: measured without this, the poles took weight 5x on
    // a grid the floor had already thinned, and flooded to L* 4.5 — a black cap
    // on a lit sphere. Same clamp, same expression, one place later.
    const weightCovEff = (I, localPitch) => {
      const c = weightCovAt(I);
      if (!(TONE_UNCAPPED && Number.isFinite(localPitch) && localPitch > 1e-6 && floorPitch > 1e-6)) return c;
      return Math.min(c, clamp(localPitch / floorPitch, 0.005, 1));
    };
    // Weight that lays `area` at this sample. area = w x cov x inkWidth /
    // localPitch: `cov` is in it because the ladder keeps only that fraction of
    // the master grid, so the pitch the stroke actually sits at is
    // localPitch / cov. Dividing by the LOCAL pitch is what takes the chart's
    // foreshortening out of the tone, exactly as `covForArea` does for laws 6-10
    // — and it is why a weight law can be pitch-correct where a coverage law
    // could only be pitch-correct on average.
    const weightForArea = (area, localPitch, cov) => {
      const p = (Number.isFinite(localPitch) && localPitch > 1e-6) ? localPitch : masterPitch;
      const c = clamp(finite(cov, 1), 1e-6, 1);
      if (!(p > 1e-6)) return W_MIN;
      const ask = (clamp(finite(area, 0), 0, 0.995) * p) / (c * inkWidth());
      const w = clamp(ask, W_MIN, W_MAX);
      const got = (w * c * inkWidth()) / p;
      weightStat.samples += 1;
      weightStat.wSum += w;
      if (ask > weightStat.askMax) weightStat.askMax = ask;
      if (w < weightStat.wMin) weightStat.wMin = w;
      if (w > weightStat.wMax) weightStat.wMax = w;
      if (got < weightStat.aMin) weightStat.aMin = got;
      if (got > weightStat.aMax) weightStat.aMax = got;
      if (w >= W_MAX - 1e-9) weightStat.atMax += 1;
      if (got > W_FLOOD_AREA) weightStat.floods += 1;
      return w;
    };
    // 7th-order smoothstep — zero first, second AND third derivative at both
    // ends. `weightSmoothstep`'s whole hypothesis is that the visible step is in
    // the TRANSFER and not in the quantisation.
    const ease7 = (t) => {
      const u = clamp(t, 0, 1); const u2 = u * u;
      return u2 * u2 * (35 - 84 * u + 70 * u2 - 20 * u2 * u);
    };
    // Golden-ratio (low-discrepancy) dither on the WEIGHT, keyed on the ruling.
    // A quantisation step that lands on the same value for every neighbouring
    // ruling is what reads as a band; one that walks is a texture.
    const wDithered = (w, lineIndex) => {
      const u = ((Number(lineIndex) || 0) * 0.6180339887498949) % 1;
      return clamp(w * (1 + W_DITHER * (u - 0.5) * 2), W_MIN, W_MAX);
    };
    // The per-sample weight the emitter records.
    const weightAtSample = (smp, localPitch) => {
      const I = clamp(finite(smp && smp.I, 0), 0, 1);
      if (TONE_ALGO === 'weightSmoothstep') {
        const env = toneEnvelope();
        const top = clamp(env.covDark / Math.max(1e-6, env.covLight), 1, W_MAX);
        return clamp(top + (1 - top) * ease7(I), W_MIN, W_MAX);
      }
      return weightForArea(wTargetArea(I), localPitch, weightCovEff(I, localPitch));
    };

    // The one entry point the emitter asks. `ladder` never reaches it.
    // `isCross` is true on a zone-gated pass, which only 'layeredCross' emits.
    // Those passes draw FULLY: an added family is the tone, so laddering it
    // would thin the very thing that is supposed to darken the zone. Measured
    // before this: the +65° family builds 13 rulings over the object, the gate
    // keeps the ones that reach the zone and the ladder at 0.41 then took the
    // survivors to ZERO — the mid-tone cross did not appear at all.
    const algoCoverage = (I, isCross, smp, localPitch) => {
      if (TONE_ALGO === 'continuousPitch') return contPitchCov(I);
      if (TONE_ALGO === 'fineLadder') return fineLadderCov(I);
      if (TONE_ALGO === 'layeredCross') return isCross ? 1 : flatCov();
      if (TONE_ALGO === 'weightModulated') return flatCov();
      // 6, 8 and 9 share ONE tone target and differ only in placement —
      // perceptualRamp rules straight families, contourFlow rules streamlines of
      // the light, errorDiffused changes the selection rule. Holding the target
      // fixed is what makes the three comparable at all.
      if (TONE_ALGO === 'perceptualRamp' || TONE_ALGO === 'contourFlow' || TONE_ALGO === 'errorDiffused') {
        return perceptualCov(I, localPitch);
      }
      if (TONE_ALGO === 'crossFade') return crossFadeCov(I, localPitch);
      if (TONE_ALGO === 'fullLightingModel') return flmCov(smp, localPitch);
      // The weight laws state their tone on the pen, so the coverage they hand
      // back is the GEOMETRY they want and nothing else — flat for four of them,
      // and the spacing half of the split for `weightPlusSpacing`.
      if (isWeightLaw()) return weightCovAt(clamp(finite(I, 0), 0, 1));
      return coverageForSample(I);
    };

    // ── FORM ZONES on the curved path ──────────────────────────────────────────
    // The ladder's own coverage numbers cannot express T > F > R (Lambert is
    // clamped, so T, F and R are all I = 0), so the zone classifier in Regions
    // owns the dark end and the ladder's coverage keeps owning the lit end. Both
    // fill implementations call the SAME classifier — that is the I27 parity
    // contract, and it is why a cube, a low-poly sphere and this capsule under
    // one light now land in the same zones.
    const zoneCtx = opts.formZone || null;
    const zonesOn = Boolean(HL_STAGE.toneZones && useLadder && zoneCtx && typeof Regions.formZone === 'function');
    // The blank highlight is placed by the SPECULAR term, not by "the top tone
    // band". That is what makes it sit offset toward the light (O7), shrink to a
    // few percent of the silhouette instead of a quarter of it (O4/O5), respond
    // to `tone.specular` on the curved path at all (O24) and vanish outright
    // when specular is switched off (O16). The exponent is tighter than the
    // light-driven glint's: this one has to land inside the ≤8%-of-silhouette
    // window of §5.4 #8, where the lightDriven region deliberately spans faces.
    const hlSpecFn = (specOn && typeof opts.specularFn === 'function') ? opts.specularFn : null;
    const HL_EXP = clamp(30 / Math.max(0.2, specSize || 1), 10, 120);
    const HL_TH = 0.35;
    const isGlint = (wN, world) => {
      if (!hlSpecFn) return false;
      // specularFn is authored at the lightDriven shininess; re-sharpen it to the
      // blank-highlight exponent by re-exponentiating the cosine it encodes.
      const s = clamp(hlSpecFn(wN, world), 0, 1);
      if (s <= 0) return false;
      const cosH = Math.pow(s, 1 / Math.max(1, finite(opts.specShininess, 6)));
      return Math.pow(cosH, HL_EXP) >= HL_TH;
    };
    const zoneOf = (smp) => {
      // 'layeredCross' owns the zone channel outright: its three families need a
      // per-sample gate and this is the gate the emitter already has. Derived
      // from intensity (see `xcZoneOf`) — `HL_STAGE.toneZones` stays off and
      // `Regions.formZone` is never called, so nothing of Stage 2 leaks in.
      if (TONE_ALGO === 'layeredCross' && toneOn) return xcZoneOf(smp);
      if (!zonesOn) return null;
      return Regions.formZone(smp.wN, smp.world, {
        tone,
        lights: zoneCtx.lights,
        ground: zoneCtx.ground,
        terminatorNL: zoneCtx.terminatorNL,
        highlight: isGlint(smp.wN, smp.world),
      });
    };
    // Zone → family-A coverage, with the two floors §5.4 #1 demands. The glint
    // cap may lighten the centre light, but never past `litMaxPitchPen()` — a
    // highlight is defined by the ink AROUND it, and a surround at 17 × pen has
    // no ink to be defined by. `litFloorCov` is the coverage at which family A's
    // spacing is exactly `litMaxPitchPen()` × pen, so the floor is stated in the
    // spec's units. (The comment used to say "6 × pen"; the constant has read 12
    // for several rounds and the two had drifted.)
    //
    // ROUND 10 — WHAT THIS FLOOR IS AND IS NOT. It is the SPARSE-END clamp: it
    // binds when Density is genuinely too thin to carry a ladder. It is NOT what
    // enforces O6. Measured on the four-fixture ladder, the requested coverage
    // here sits well ABOVE the composed ceiling on the binding fixtures, so it
    // is clamped downstream and neither this floor nor GLINT_KEEP reaches the
    // paper — GLINT_KEEP 0.6 → 0.8 → 1.0 is bit-identical on two of four. O6 is
    // bounded by `Regions.formCeiling('L')`, and that is where §5.4 #1's pitch
    // statement is now wired.
    let litFloorCov = LIT_FLOOR; // assigned once the master pitch is known, below
    let floorPitch = 0;          // ditto: the plot-safe local pitch (C15)
    // ── THE FORM SHADOW'S CROSS COMES OFF THE SILHOUETTE (§5.1, O3) ───────────
    // §5.1 gives F a single family whose rulings compress toward the limb; the
    // crossed family belongs to the terminator and F borrows a half-weight share
    // of it so it can hold a value of its own. What F must not do is carry that
    // second direction out to the contour. Family A already crowds hard there —
    // a sphere's meridians converge AT the silhouette — so a second direction on
    // top of it turns the outer rim into a woven mesh, and then the terminator
    // stops reading as a band, which is O3's own clause. Measured before this:
    // 46 % (r 46) and 54 % (r 92) of the outermost F windows carried two
    // families.
    // `nz` is the camera-space normal's z: 1 facing the camera, exactly 0 ON the
    // silhouette. So the taper is stated in the geometry's own terms and needs no
    // radius, no bbox and no projection assumption. Smoothstepped, so there is no
    // edge where it engages — an abrupt one would be a contour line, which is the
    // artefact O26 forbids.
    const LIMB_CROSS_LO = 0.30;
    const LIMB_CROSS_HI = 0.65;
    const limbCrossTaper = (smp) => {
      if (!smp || !Number.isFinite(smp.nz)) return 1;
      const u = clamp((Math.abs(smp.nz) - LIMB_CROSS_LO) / (LIMB_CROSS_HI - LIMB_CROSS_LO), 0, 1);
      return u * u * (3 - 2 * u);
    };
    // How much of `zone`'s crossed family actually lands on this sample. Only F
    // tapers: T's cross is the terminator's own band and must stay whole, and no
    // other zone crosses at all.
    const crossWeightAt = (zone, smp) => {
      const c = clamp(Regions.formInk(zone).cross, 0, 1);
      return zone === 'F' ? c * limbCrossTaper(smp) : c;
    };
    const zoneCoverage = (zone, isCross, isDensityCross, smp) => {
      const ink = Regions.formInk(zone);
      if (isCross) return clamp(crossWeightAt(zone, smp), 0, 1);
      if (isDensityCross) {
        // §0's craft rule made operational: Density past the plot floor spends
        // itself on a second DIRECTION, never on a tighter pitch. Weighted by the
        // zone's own coverage so the ladder's ORDER survives the spill — the
        // highlight gets none of it and the centre light barely any, which is
        // what keeps the blank readable while the form darkens.
        return clamp(ink.coverage * densityOverflow, 0, 1);
      }
      let cov = clamp(ink.coverage, 0, 1);
      if (zone === 'L') {
        const raw = cov;
        if (specOn) cov *= clamp(1 - 0.5 * specSize, 0, 1);
        cov = Math.max(cov, raw * GLINT_KEEP, litFloorCov);
      }
      return clamp(cov, 0, 1);
    };
    // A zone gate is one zone name, as it always was. 'layeredCross' needs a
    // family to span TWO zones (its mid-tone cross also runs through the darks),
    // and splitting that into two gated families would re-phase the ladder at
    // the zone edge and put a seam exactly where the tone is smoothest. So a
    // gate may also be a LIST. A string gate takes the identical branch it
    // always took, so the committed default is byte-identical.
    const gateAllows = (g, z) => (Array.isArray(g) ? g.indexOf(z) >= 0 : z === g);
    const SHADOW_TH = 0.5; // intensity below which the dark-grading infill engages

    // I8 — LIGHT-DRIVEN highlight: the highlight region is where the per-sample
    // specular term S is high (a glint that spans faces near a point light), not
    // the top tone band. `sensitivity` stages the drop: 1 = binary (uniform
    // treatment across the region), N = a gradient (brightest = blankest). When
    // engaged the perFace band-treatment dispatch is disabled (they are mutually
    // exclusive within one fill). Default off ⇒ every branch below is inert.
    const hlCfg = opts.highlight || null;
    const specularFn = opts.specularFn || null;
    const ldOn = Boolean(HL_STAGE.lightDriven && hlCfg && hlCfg.lightDriven && typeof specularFn === 'function' && Regions
      && typeof Regions.highlightStage === 'function');
    const ld = ldOn ? {
      treatment: hlCfg.treatment || 'blank',
      sensitivity: clamp(Math.round(finite(hlCfg.sensitivity, 1)), 1, 6),
    } : null;
    const LD_REG = 0.025; // specular threshold for "in the glint" (matches faceted)

    // Sample the surface at (a,b) → screen point + front flag + Lambert intensity.
    const sampleAt = (a, b) => {
      const aa = clamp(a, 0, 1);
      const bb = clamp(b, 0, 1);
      const p0 = chart(aa, bb);
      // FORWARD DIFFERENCE, WITH A BACKWARD FALLBACK ON THE DOMAIN EDGE.
      //
      // The partner samples used to be `chart(clamp(aa + EPS, 0, 1), …)`. At
      // aa = 1 (or bb = 1) the clamp puts the partner ON TOP OF p0, the cross
      // product collapses, and the whole sample returned null — so the LAST
      // sample of every sweep was silently dropped. On a chart whose `b` is the
      // periodic wind seam that is a hole exactly one step wide, on the seam,
      // at every ruling: a contour ring lost its closing segment and came back
      // as two pieces with a visible notch at longitude 0 (screen right on a
      // yaw-0 camera). Stepping BACKWARD off the edge measures the same tangent
      // (the sign is restored below), so the seam sample is a real sample again.
      const aFwd = aa + EPS <= 1;
      const bFwd = bb + EPS <= 1;
      const sgnA = aFwd ? 1 : -1;
      const sgnB = bFwd ? 1 : -1;
      const pa = chart(aFwd ? aa + EPS : aa - EPS, bb);
      const pb = chart(aa, bFwd ? bb + EPS : bb - EPS);
      if (!p0 || !pa || !pb) return null;
      let dPa = mul(sub(pa, p0), sgnA);
      let dPb = mul(sub(pb, p0), sgnB);
      let nLocal = cross(dPa, dPb);
      let nl = Math.hypot(nLocal.x, nLocal.y, nLocal.z);
      if (nl < 1e-9) {
        // A GENUINE CHART SINGULARITY, not an edge artefact: at a sphere's pole
        // every `b` names the same point, so the b-tangent is zero there however
        // it is measured. The POINT is still valid and the surface still has a
        // normal — take the frame a hair inside the domain and keep p0 where it
        // is, so meridians close on the pole instead of stopping a step short.
        const ai = clamp(aa, EPS * 2, 1 - EPS * 2);
        const bi = clamp(bb, EPS * 2, 1 - EPS * 2);
        const q0 = chart(ai, bi);
        const qa = chart(clamp(ai + EPS, 0, 1), bi);
        const qb = chart(ai, clamp(bi + EPS, 0, 1));
        if (!q0 || !qa || !qb) return null;
        dPa = sub(qa, q0); dPb = sub(qb, q0);
        nLocal = cross(dPa, dPb);
        nl = Math.hypot(nLocal.x, nLocal.y, nLocal.z);
        if (nl < 1e-9) return null;
      }
      nLocal = mul(nLocal, 1 / nl);
      if (dot(nLocal, p0) < 0) nLocal = mul(nLocal, -1); // outward (charts centre near origin)
      const world = applyTransform(p0, t);
      const wN = normalize(rotatePoint(nLocal, rot));
      const camN = rotatePoint(wN, cam);
      const scr = projectWorld(world);
      if (!scr || !Number.isFinite(scr.x) || !Number.isFinite(scr.y)) return null;
      // Screen-space derivatives of the parameter square. A wrapped family's
      // pitch is NOT uniform — meridians converge to nothing at a sphere's poles
      // — so the only way to know what a family actually rules at HERE is to
      // measure it here. See the plot-safe cap in emitLine (C15).
      let dA = null; let dB = null;
      if (useLadder) {
        const sa = projectWorld(applyTransform(pa, t));
        const sb = projectWorld(applyTransform(pb, t));
        if (sa && sb && Number.isFinite(sa.x) && Number.isFinite(sb.x)) {
          // Same backward-step sign restoration as the tangents above, so the
          // pitch this feeds (perpPitch, C15) keeps pointing the way the family
          // actually advances on the domain edge.
          dA = { x: ((sa.x - scr.x) / EPS) * sgnA, y: ((sa.y - scr.y) / EPS) * sgnA };
          dB = { x: ((sb.x - scr.x) / EPS) * sgnB, y: ((sb.y - scr.y) / EPS) * sgnB };
        }
      }
      const I = toneOn ? clamp(intensityFn(wN, world), 0, 1) : 1;
      // I8 — per-sample specular term for light-driven highlight (0 when off).
      const S = (ldOn && typeof specularFn === 'function') ? clamp(specularFn(wN, world), 0, 1) : 0;
      // `nz` = the camera-space normal's z. It is 1 facing the camera and 0 ON
      // the silhouette, so it is the exact, projection-correct measure of "how
      // close to the contour is this sample" — used by the limb taper below.
      return { x: scr.x, y: scr.y, z: scr.z, front: camN.z > 0, nz: camN.z, I, S, wN, world, dA, dB };
    };

    // PERPENDICULAR screen pitch between adjacent rulings at this sample.
    //
    // The offset between two adjacent lines in PARAMETER space projects to a
    // screen vector, but that vector's LENGTH is not the spacing the eye (or the
    // pen) sees: near a silhouette the projection shears hard and the offset
    // ends up nearly parallel to the rulings themselves, so the true
    // perpendicular gap is a fraction of it. Measuring the magnitude instead of
    // the perpendicular component under-reported crowding by 2x exactly where it
    // mattered, and the form's core shadow flooded to D = 0.81 — darker than the
    // contact shadow beneath it, which is C2/O13 and means the object floats.
    // The cross product with the ruling's own screen direction is the fix.
    const perpPitch = (smp, pitchStep, lineDir) => {
      if (!pitchStep || !lineDir || !smp.dA || !smp.dB) return null;
      const ox = smp.dA.x * pitchStep.a + smp.dB.x * pitchStep.b;
      const oy = smp.dA.y * pitchStep.a + smp.dB.y * pitchStep.b;
      const lx = smp.dA.x * lineDir.a + smp.dB.x * lineDir.b;
      const ly = smp.dA.y * lineDir.a + smp.dB.y * lineDir.b;
      const ll = Math.hypot(lx, ly);
      if (ll < 1e-9) return Math.hypot(ox, oy);
      const perp = Math.abs(ox * (ly / ll) - oy * (lx / ll));
      return perp > 1e-6 ? perp : 1e-6;
    };

    // ── Line budget ────────────────────────────────────────────────────────────
    // Density owns the count, exactly as before, EXCEPT that an active tone
    // ladder floors it: the ladder is a set of subsets of this family, so if the
    // family itself rules at 17 × pen there is no room below it for a centre
    // light and no room above it for anything but bare paper. The floor is
    // computed from the object's own PROJECTED size so it holds at any zoom and
    // for any primitive, and it only ever RAISES the count — Density is fully
    // live above it. With tone off, `N` is bit-for-bit `lineCountFor(density)`.
    let N = lineCountFor(finite(opts.fillDensity, 50));
    let masterPitch = 0;
    let densityOverflow = 0; // Density past the plot floor, spent on a 2nd direction
    // WHERE THE PLOT FLOOR BINDS. In uncapped mode the floor is the only limit
    // left, so it is the only thing standing between the tone law and the
    // lighting — and it has to be reported, not assumed. Counted per sample and
    // per ruling; `worst` is the deepest overdraw the law asked for, as a
    // multiple of the coverage the floor allowed.
    const floorStat = { samples: 0, clamped: 0, rulings: new Set(), touched: new Set(), worst: 1 };
    const penWidth = Math.max(0.02, finite(opts.penWidth, 0.3));
    if (HL_STAGE.masterGrid && useLadder && opts.penWidth != null) {
      // Calibrate off the MEDIAN local pitch the family will actually rule at,
      // not off a bounding box. A wrapped family's pitch is wildly non-uniform —
      // on a sphere the meridians converge to nothing at the poles and crowd at
      // the silhouette — and a bbox estimate gets it wrong by about 2x. When the
      // budget is too dense EVERY zone hits the plot floor and the whole ladder
      // flattens into one value: measured L/M/T/F all landing within 0.05 of each
      // other at an effective pitch of 0.75-0.79mm. Calibrating on the median
      // puts the darkest zone at the target pitch and leaves the lit end room.
      const rad = (finite(opts.fillAngle, 0) * Math.PI) / 180;
      // Across the primary family, in parameter space. 'contour' rules the other
      // axis; every other mapper's family runs along (cos, sin) of fillAngle.
      const acr = opts.mapper === 'contour'
        ? { a: 1, b: 0 }
        : { a: -Math.sin(rad), b: Math.cos(rad) };
      const widths = [];
      for (let i = 0; i <= 16; i++) {
        for (let j = 0; j <= 16; j++) {
          const smp = sampleAt(i / 16, j / 16);
          if (!smp || !smp.front || !smp.dA || !smp.dB) continue;
          const w = perpPitch(smp, acr, { a: -acr.b, b: acr.a });
          if (w != null && w > 1e-6) widths.push(w);
        }
      }
      if (widths.length >= 8) {
        widths.sort((x, y) => x - y);
        const median = widths[widths.length >> 1];
        // ── WHERE THE GRID IS CALIBRATED, AND WHY UNCAPPED MOVES IT ───────────
        //
        // The capped build calibrates on the MEDIAN local pitch, for the reason
        // stated above: a budgeted grid sized off the crowded end would put the
        // whole ladder on the plot floor and flatten it.
        //
        // With the budget lifted that trade is gone, and the median becomes the
        // thing standing between the law and the lighting. A tone law asks for a
        // spacing; it gets `localPitch / cov`, and coverage cannot exceed 1 — so
        // the DARKEST tone is reachable only where `localPitch` is at or below
        // the darkest target pitch. Calibrated on the median, that is half the
        // surface, and the other half saturates at coverage 1 and simply cannot
        // go darker. Measured, first cut: the perceptual ramp came back with an
        // apparent-tone span of 6.1 L* against a designed 16, and an R² of
        // 0.008 — the drawing had no ramp in it at all, and the law was not the
        // reason.
        //
        // So uncapped calibrates on the 90th percentile: the grid is fine enough
        // that 90 % of the surface can reach the floor, and the crowded tenth is
        // handled where crowding belongs — by the floor clamp, which is counted.
        const calib = TONE_UNCAPPED
          ? widths[Math.min(widths.length - 1, Math.floor(widths.length * 0.9))]
          : median;
        // ── DENSITY IS THE DIAL; THE FLOOR ONLY CATCHES THE SPARSE END ────────
        //
        // Round 3 sized the grid at a FIXED master pitch, and I claimed "Density
        // is fully live above it". It is not: `lineCountFor(100)` is 40 lines and
        // the floor wants ~150 for a 92mm ball at a 0.3mm pen, so N sat AT the
        // floor for every Density value and the ball emitted byte-identical
        // geometry at Density 10 and at 100. There was no Density setting left.
        //
        // So Density sets the pitch, through the SAME `hatchSpacing` law the
        // faceted path uses (subdivided: a tone grid is the fine grid the ladder
        // subsets, not the finished spacing). Two clamps sit on it, and each has
        // a reason rather than a number:
        //
        //   SPARSE END — the centre light must still carry ink, or the highlight
        //   has nothing to be blank against (O6, §5.4 #1). Derived from the LIT
        //   band's own requirement: L rules at `pitch / cov_L`, and that may not
        //   exceed LIT_MAX_PITCH. This is the only floor, and it binds only when
        //   Density is genuinely too sparse to carry a ladder.
        //
        //   DENSE END — past the plot floor you do not get darker by ruling
        //   closer, you get a flooded blob (§0). The excess is NOT discarded: it
        //   spills into a second DIRECTION, which is what the craft rule says to
        //   do with it and what keeps Density live at the top of its range.
        const tonePitch = Math.max(0.05, finite(opts.tonePitch, 3) / TONE_SUBDIV);
        const litCov = clamp(Regions.formInk('L').coverage, 0.05, 1);
        const o6Pitch = litMaxPitchPen() * penWidth * litCov;
        const floorPen = PLOT_FLOOR_PEN * penWidth;
        if (TONE_UNCAPPED) {
          // THE BUDGET IS OFF. The master grid is ruled at the plot floor
          // itself, which is the finest grid ink allows, so the tone law can ask
          // for any pitch from the floor upward and get it. Density's own pitch
          // (`tonePitch`) and the O6 sparse-end pitch no longer choose the grid
          // — the first is a budget, the second is a bar the LAW must clear and
          // still does, through `litFloorCov` at the sparse end of the envelope.
          // No overflow: there is no excess to spill when the grid IS the floor.
          masterPitch = floorPen;
          densityOverflow = 0;
        } else {
          masterPitch = Math.min(tonePitch, o6Pitch);
          if (masterPitch < floorPen) {
            densityOverflow = clamp(floorPen / masterPitch - 1, 0, 1);
            masterPitch = floorPen;
          }
        }
        N = clamp(Math.max(4, Math.round(calib / masterPitch)), 4, maxLines());
        masterPitch = calib / N; // what the family ACTUALLY rules at, typically
      }
    }
    // Coverage at which family A's spacing is exactly LIT_MAX_PITCH_PEN × pen —
    // the floor under the centre light, stated in §5.4's own units.
    litFloorCov = masterPitch > 0
      ? clamp(masterPitch / (litMaxPitchPen() * penWidth), 0.05, 1)
      : LIT_FLOOR;
    floorPitch = PLOT_FLOOR_PEN * penWidth;
    const BRIDGE_MM = BRIDGE_PEN * penWidth;
    const SPECK_MM = SPECK_PEN * penWidth;
    const MIN_MARK_MM = MIN_MARK_PEN * penWidth;
    // Samples along each fill line. The MESH's tessellation `detail` sets the
    // base; the Style tab's own Fidelity (`fillFidelity`) scales it.
    //
    // These are two different questions and they now have two different
    // controls. Mesh Fidelity buys FACETS — a 22-sided capsule. Style Fidelity
    // buys POINTS: each fill line re-evaluates the SAME parametric chart at more
    // (or fewer) places, so a dense line follows the form while a coarse one
    // cuts across it in chunky chords. Nothing here touches the mesh, so the
    // silhouette is unmoved whatever this says.
    //
    // Default 1 ⇒ Math.round(base × 1) === base ⇒ byte-identical. The upper
    // clamp keeps the spiral's `steps × turns` budget bounded (turns is already
    // capped at SPIRAL_MAX_TURNS).
    //
    // MERGE NOTE (round7-accepted → 3d-scene/p4). This is the SAMPLES-ALONG-A-
    // RULING axis; the tone master grid computed just above owns the NUMBER OF
    // RULINGS (`N`). They are orthogonal and neither reads the other — the
    // grid's median-pitch calibration walks its own fixed 17×17 `sampleAt`
    // lattice, not `steps`. The one real coupling is the budget: `N` may now
    // reach MASTER_MAX_LINES (420) where it used to cap at 40, so the product
    // `steps × N` is bounded by 220 × 420. See the plot-safety perf pin.
    const baseSteps = Math.max(28, Math.round(finite(opts.detail, 24) * 2));
    const fillFidelity = clamp(finite(opts.fillFidelity, 1), 0.25, 3);
    const steps = fillFidelity === 1
      ? baseSteps
      : Math.max(6, Math.min(220, Math.round(baseSteps * fillFidelity)));
    const out = [];
    const mapper = opts.mapper;

    // X-ray (Phase 6): when opts.xray.backFaces is set, emit a SECOND family
    // sampling the FAR surface (camN.z < 0, normally back-face-culled) so the
    // caller can draw it dashed at reduced density — the fix that makes a hatched
    // sphere actually show through. Back-family polylines carry a `.back` flag.
    const xray = opts.xray && opts.xray.backFaces ? opts.xray : null;
    const backDensity = clamp(finite(opts.xray && opts.xray.backDensity, 0.4), 0.2, 1);

    // Highlight treatment (Phase 4): generalizes the ordered-dither highlight
    // gate below from a boolean drop ('blank') into a band classifier that
    // dispatches the TOP tone band(s) to a chosen treatment. Only engaged when a
    // NON-'blank' treatment is supplied AND the sample sits in the highlight
    // band (opts.highlight.isHL(I)); everything else keeps the legacy drop, so
    // 'blank' output is byte-identical. keep/dashed/dotted/sparse/stippleOut are
    // handled per-line here; altFill/burst drop here and are filled by a
    // dedicated specular-region pass in the caller.
    // perFace band-treatment dispatch — DISABLED when lightDriven owns the
    // highlight (the two are mutually exclusive within one fill).
    const hl = (HL_STAGE.treatment && !ldOn && opts.highlight && opts.highlight.treatment && opts.highlight.treatment !== 'blank')
      ? opts.highlight : null;
    const hlIsHL = (hl && typeof hl.isHL === 'function') ? hl.isHL : () => false;
    const hlDensity = hl ? clamp(finite(hl.density, 25), 1, 100) : 25;
    const ldDensity = ldOn ? clamp(finite(hlCfg.density, 25), 1, 100) : 25;
    // Deterministic 2D hash (mirrors geometry3d strokeHash) for stippleOut.
    const sfHash = (a, b) => {
      let h = ((a | 0) * 73856093) ^ ((b | 0) * 19349663);
      h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    };

    // Smoothly-varying per-ruling feather offset in [-0.5, 0.5]. Deterministic:
    // same ruling, same position, same value, frame to frame (the "swim" contract).
    const featherAt = (lineIndex, step) => {
      const u = step / FEATHER_BUCKET;
      const k = Math.floor(u);
      const f = u - k;
      const seed = (lineIndex | 0) * 2654435761;
      const a = sfHash(seed, k);
      const b = sfHash(seed, k + 1);
      const t = f * f * (3 - 2 * f); // smoothstep — no corners at the sample joins
      return (a + (b - a) * t) - 0.5;
    };

    // Push a run to `out`, tagging the array when it belongs to the back family.
    // `lineIndex` (when given) records WHICH RULING the run came from. A ruling
    // is meant to survive as one polyline; the tag is what lets a test — or a
    // diagnostic — count how many pieces a single ruling was cut into, which is
    // the only way to tell legitimate tone (whole rulings dropped) apart from
    // fragmentation (one ruling chopped into stubs). Same tagging precedent as
    // `.back` / `.highlight`.
    const pushRun = (run, back, lineIndex) => {
      if (run.length < 2) return;
      if (back) run.back = true;
      if (lineIndex != null) run.lineIndex = lineIndex;
      out.push(run);
    };

    // A line in the (a,b) parameter square, as a function of its own 0..1 sweep
    // parameter. The axis-aligned families keep the exact legacy arithmetic:
    // 'b' ⇒ fix b, sweep a (meridian); 'a' ⇒ fix a, sweep b (parallel).
    const axisLine = (fixAxis, fixVal) => (fixAxis === 'b'
      ? (tt) => ({ a: tt, b: fixVal })
      : (tt) => ({ a: fixVal, b: tt }));

    // ── RULING CONTINUITY: the run sink ──────────────────────────────────────
    // Jay, 2026-08-16, on a hatched capsule with Highlight = None: "with no
    // highlights and hatched fill, I would not expect all of these partial fill
    // lines."
    //
    // The tone drop test is evaluated PER SAMPLE, and every quantity it reads
    // moves CONTINUOUSLY along a ruling on a wrapped surface: `cap =
    // localPitch / floorPitch` tracks the chart's foreshortening, the composed-
    // budget ceiling divides by that same local pitch, and the feather adds
    // ±FEATHER_AMPL/2 of rank on top. So a ruling whose rank sits anywhere near
    // the local coverage does not cut ONCE — it chatters, and arrives as a row
    // of stubs. Measured on Jay's capsule, family A emitted 28 runs at a MEDIAN
    // LENGTH OF 3 mm, ten of them under 1 mm and four under 0.2 mm, on a form
    // ~70 mm across. A FACETED face has a constant local pitch and a
    // near-constant zone, which is why a cube measures zero mid-form endpoints
    // and every chart-wrapped primitive is riddled with them. Highlight
    // treatment is NOT implicated: `none` and `blank` measure identically, so
    // the `0188e01` glint-cap bypass holds — the cut fires upstream of every
    // highlight branch, which is why no Highlight setting could ever have met
    // the "lines must not break" contract.
    //
    // TONE IS NOT TOUCHED. Dropping a whole ruling, and terminating a ruling
    // where the surface genuinely changes zone, are how this engine shades and
    // both still happen — `gateT`/`gateF`, the zone-confined crossed families,
    // are deliberately short and are left exactly as authored. What this sink
    // removes is sub-stroke chatter: a break too short to read as a break, and
    // a mark too short to read as a stroke.
    //
    // Only a DITHER drop is bridgeable (`softDrop`). A break because the
    // surface ended, because a zone-gated family left its zone, because a
    // highlight treatment re-routed the ink, or because `FORM_INK.R` asked for
    // a dashed rim (duty < 1) is DELIBERATE and calls `flush` — the rim's
    // dashes survive exactly as authored.
    // Each FAMILY gets its own id. `lineIndex` is only unique WITHIN a family —
    // crosshatch's A and B families both index from 0 — so a per-ruling test
    // that keyed on lineIndex alone would merge two different rulings into one
    // and read the pair as a fragmented line.
    let famSeq = 0;
    let currentFam = 'A';
    const nextFam = (kind) => { currentFam = `${kind}#${famSeq}`; famSeq += 1; return currentFam; };
    // THE LADDER'S PHASE, one accumulator per selection track (see ladderStep).
    // Declared HERE, per buildObject call, so a build is a pure function of its
    // opts — a module-scope phase would make the second drawing depend on the
    // first and break the byte-identity contracts. The key names the track a
    // ruling belongs to: its family, and its ordinal WITHIN the ruling for the
    // rare ruling that comes back as more than one span (the k-th spans of
    // successive rulings are the ones that neighbour each other on the form, so
    // they are the ones that must be evenly spaced against each other).
    const ladderPhase = new Map();
    // 'errorDiffused' — the SAME target density, placed by 1-D error diffusion
    // instead of by a phase accumulator.
    //
    // A phase accumulator is already the degenerate case of error diffusion: one
    // tap, all of the residual carried to the very next ruling. That is what
    // makes it Sturmian — at a constant coverage the gaps are exactly
    // floor(1/c) and ceil(1/c), the most even a subset of an integer grid can
    // be, and also perfectly PERIODIC, which is what beats against a regular
    // form and against the raster. Splitting the carry two ways (2/3 to i+1, 1/3
    // to i+2) keeps the running error bounded — so the field is still locally
    // even by construction, and still exactly hits the requested density over
    // any long run — while destroying the period. No banding, no moiré, and no
    // guarantee that the gap set is two consecutive integers: that guarantee is
    // exactly what is being traded away, and the measured gap set shows it.
    const edState = new Map();
    const edKeeps = (key, cov, seed) => {
      const st = edState.get(key)
        || { e1: Number.isFinite(seed) ? seed - 0.5 : 0, e2: 0 };
      const v = clamp(finite(cov, 0), 0, 1) + st.e1;
      const keep = v >= 0.5;
      const err = v - (keep ? 1 : 0);
      edState.set(key, { e1: st.e2 + err * (2 / 3), e2: err * (1 / 3) });
      return keep;
    };
    const ladderKeeps = (key, cov, seed) => {
      if (TONE_ALGO === 'errorDiffused') return edKeeps(key, cov, seed);
      const prev = ladderPhase.has(key)
        ? ladderPhase.get(key)
        : (Number.isFinite(seed) ? seed : LADDER_PHASE0);
      const r = ladderStep(prev, cov);
      ladderPhase.set(key, r.phase);
      return r.keep;
    };
    // ── WEIGHT ALONG ONE RULING, AS ABUTTING PIECES ──────────────────────────
    // The output format carries one weight per path, so a ruling whose weight
    // varies is emitted as consecutive pieces that SHARE their endpoints: piece
    // k's last point IS piece k+1's first point (the same object), so the pen
    // never lifts between them and no piece ends in open surface. A cut only
    // opens where the quantized weight has moved AND the piece so far is already
    // at least MIN_MARK_MM long, and a trailing stub is folded back into its
    // neighbour rather than dropped — dropping it is the one thing this
    // construction may not do, because that would leave a hole in the ruling.
    const meanW = (wPts, a, b) => {
      let s = 0; let n = 0;
      for (let i = a; i <= b; i++) { const v = Number(wPts[i]); if (Number.isFinite(v)) { s += v; n += 1; } }
      return n ? s / n : 1;
    };
    const splitByWeight = (run, wPts, ttPts, fam) => {
      const n = run.length;
      if (n < 2) { run.weightScale = meanW(wPts, 0, n - 1); return [run]; }
      const lvl = (w) => Math.round(clamp(finite(w, 1), W_MIN, W_MAX) / W_LEVEL);
      const cuts = [];
      let acc = 0;
      let cur = lvl(wPts[0]);
      for (let i = 1; i < n; i++) {
        acc += Math.hypot(run[i].x - run[i - 1].x, run[i].y - run[i - 1].y);
        // `cur` is NOT advanced when the piece is still too short, so a slow
        // ramp still cuts — it just cuts once, two levels on, instead of never.
        if (lvl(wPts[i]) !== cur && acc >= MIN_MARK_MM) { cuts.push(i); acc = 0; cur = lvl(wPts[i]); }
      }
      if (cuts.length && acc < MIN_MARK_MM) cuts.pop();   // fold the trailing stub back
      if (!cuts.length) { run.weightScale = meanW(wPts, 0, n - 1); return [run]; }
      const bounds = [0].concat(cuts, [n - 1]);
      const pieces = [];
      for (let k = 0; k + 1 < bounds.length; k++) {
        const a = bounds[k]; const b = bounds[k + 1];
        const pc = run.slice(a, b + 1);   // shares the boundary POINT with its neighbour
        pc.fam = fam;
        pc.tt0 = ttPts[a]; pc.tt1 = ttPts[b];
        pc.weightScale = meanW(wPts, a, b);
        pieces.push(pc);
      }
      return pieces;
    };
    // 'weightMultiPass' — the plotter-honest heavy line. Instead of asking for a
    // pen `w` times as wide, lay ROUND(w) real strokes of the actual pen, offset
    // perpendicular by one ink width and centred on the ruling. The piece itself
    // stays on the ruling and the extras sit alternately either side of it, so
    // the band grows symmetrically. Nothing ends anywhere new: every pass spans
    // exactly the parameter range of the piece it copies. Returned SEPARATELY
    // from the piece so the seam join still sees only the centre line.
    const extraPasses = (pc) => {
      const n = clamp(Math.round(finite(pc.weightScale, 1)), 1, MP_MAX);
      pc.weightScale = 1;
      if (n <= 1 || pc.length < 2) return [];
      const outp = [];
      for (let j = 1; j < n; j++) {
        const d = (j % 2 ? 1 : -1) * Math.ceil(j / 2) * inkWidth();
        const cp = pc.map((q, i) => {
          const p0 = pc[Math.max(0, i - 1)]; const p1 = pc[Math.min(pc.length - 1, i + 1)];
          const dx = p1.x - p0.x; const dy = p1.y - p0.y;
          const L = Math.hypot(dx, dy) || 1;
          return { x: q.x + (-dy / L) * d, y: q.y + (dx / L) * d, z: q.z };
        });
        cp.fam = pc.fam; cp.tt0 = pc.tt0; cp.tt1 = pc.tt1; cp.weightScale = 1;
        outp.push(cp);
      }
      return outp;
    };
    const makeSink = (back, lineIndex, fam) => {
      let run = [];
      let runLen = 0;
      let gapPts = [];
      let gapLen = 0;
      let softStart = false;   // this run began after a dither drop, not at a boundary
      let sawSoftDrop = false;
      // Sweep parameter at the run's first and last sample, and every run this
      // sink pushed, in order. Read only by emitLine's seam join (below): a
      // ruling whose sweep is CLOSED and which came back as a tail + a head is
      // one stroke that happened to be cut at the parameter seam.
      let runTT0 = null;
      let runTT1 = null;
      // 'weightModulated' only. The geometry is uniform, so the tone has to
      // ride on the pen: this accumulates the run's own mean weight from the
      // samples that actually joined it, which is finer than a per-ruling
      // weight and is what lets a hatch line darken as it enters the shadow.
      let wSum = 0;
      let wCnt = 0;
      // Laws 12-16 (the weight laws) additionally keep the weight and the sweep
      // parameter PER POINT, parallel to `run`, which is what lets `splitByWeight`
      // cut the finished run into abutting pieces after every existing cull has
      // already had its say on the run as a whole.
      let wPts = [];
      let ttPts = [];
      let wPend = 1;
      const mine = [];
      // Is this run WHOLLY inside the centre light? `null` until the first
      // sample lands; latches false as soon as a non-L sample is added. Read
      // only by the L-zone speck exemption below.
      let runLit = null;
      const emitRun = (softEnd) => {
        // A mark bounded by the SURFACE at both ends is legitimate however short
        // (a ruling clipped by a narrow neck, or by the poles), so only a mark
        // the dither carved out of the MIDDLE of a ruling can be a speck. The
        // sub-pen-width floor applies to every run regardless — that one is a
        // pen-down dot, not tone, at any density.
        //
        // ...AND NOT IN THE CENTRE LIGHT. The cull's premise is "a mark this
        // short is chatter, not tone". That premise is zone-relative and it is
        // false in L: `formCeiling('L')` is the smallest non-zero ceiling in the
        // ladder and §5.4 #1 caps the zone's pitch at LIT_MAX_PITCH_PEN (12) x
        // pen, so the intended drawing there IS a scatter of short, widely
        // spaced marks — and SPECK_PEN is also 12, i.e. the cull's threshold and
        // the zone's own design pitch are the same number. Worth +0.003 of
        // D(L) on the binding ladder fixture (`V-E-bands4-sun45`), measured with
        // the proportional re-start margin in place.
        //
        // Tightest exemption that does the job: a run is exempt only if EVERY
        // sample in it classified as L. A run that so much as touches M, T, F, R
        // or H is culled exactly as before, so the limb/terminator chatter this
        // sink was built to remove is untouched. `MIN_MARK_MM` still applies in
        // L — a sub-pen-width fragment is a pen-down dot in any zone.
        const speck = HL_STAGE.continuitySink && softStart && softEnd && runLen < SPECK_MM && runLit !== true;
        if (run.length >= 2 && runLen >= MIN_MARK_MM && !speck) {
          run.fam = fam;
          run.tt0 = runTT0; run.tt1 = runTT1;
          if (TONE_ALGO === 'weightModulated' && wCnt > 0) run.weightScale = wSum / wCnt;
          if (TONE_ALGO === 'weightSmoothstep' && wCnt > 0) run.weightScale = wDithered(wSum / wCnt, lineIndex);
          const pieces = (splitsAlongLine() && wCnt > 0)
            ? splitByWeight(run, wPts, ttPts, fam)
            : [run];
          pieces.forEach((pc) => {
            mine.push(pc);
            pushRun(pc, back, lineIndex);
            if (TONE_ALGO === 'weightMultiPass') {
              extraPasses(pc).forEach((xp) => pushRun(xp, back, lineIndex));
            }
          });
        }
        run = []; runLen = 0; softStart = false; runLit = null;
        runTT0 = null; runTT1 = null; wSum = 0; wCnt = 0;
        wPts = []; ttPts = [];
      };
      return {
        emitted: () => mine,
        flush: () => { emitRun(false); gapPts = []; gapLen = 0; sawSoftDrop = false; },
        softDrop: (pt) => {
          sawSoftDrop = true;
          if (!run.length) return;           // nothing open yet — a leading drop
          const prev = gapPts.length ? gapPts[gapPts.length - 1] : run[run.length - 1];
          gapLen += Math.hypot(pt.x - prev.x, pt.y - prev.y);
          gapPts.push(pt);
          if (gapLen > BRIDGE_MM) { emitRun(true); gapPts = []; gapLen = 0; }
        },
        noteW: (w) => { wSum += w; wCnt += 1; wPend = w; },
        addPt: (pt, zone, tt) => {
          runLit = (runLit === null) ? (zone === 'L') : (runLit && zone === 'L');
          if (!run.length) runTT0 = tt;
          runTT1 = tt;
          if (run.length && gapPts.length) {
            // Bridge. The skipped samples lie ON the surface, so re-adding them
            // keeps the ruling on the form instead of chording across it.
            gapPts.forEach((g) => {
              runLen += Math.hypot(g.x - run[run.length - 1].x, g.y - run[run.length - 1].y);
              run.push(g); wPts.push(wPend); ttPts.push(tt);
            });
          }
          gapPts = []; gapLen = 0;
          if (!run.length) softStart = sawSoftDrop;
          else runLen += Math.hypot(pt.x - run[run.length - 1].x, pt.y - run[run.length - 1].y);
          run.push(pt); wPts.push(wPend); ttPts.push(tt);
        },
      };
    };

    // ── THE DRAW/SKIP VERDICT IS A WHOLE-SPAN PROPERTY ───────────────────────
    // Measured on the Stage-1 (masterGrid + dither) emitter, 71 front rulings of
    // a lit sphere: `rank` is CONSTANT per ruling (71 rulings, 71 distinct
    // values) — it is the ruling's place in the bit-reversed permutation, a
    // whole-line quantity. The coverage it was compared against was
    // `coverageForSample(smp.I)`, a PER-SAMPLE function of surface intensity
    // that swings 0.35 (median) to 0.65 (max) along ONE ruling as a curved form
    // turns toward and away from the light. Comparing a per-line number against
    // a per-sample one is a category error, and it showed: 35 of 71 rulings
    // flipped verdict along their own length, and the deepest free end sat 47.6 %
    // of the sphere's radius inside the silhouette — a line stopping halfway
    // across open, unbroken, front-facing surface. `feather`, `coverageCap` and
    // `hysteresis` were all OFF, so this was never jitter.
    //
    // THE LAW (tests/unit/scene3d-fill-seam-continuity.test.js). On a lone convex
    // primitive a front ruling may end in exactly three places: the silhouette, a
    // chart pole, or nowhere (a closed ring). So the verdict is taken ONCE per
    // SPAN, where a span is a maximal run of consecutive samples that are (a) on
    // the wanted side of the surface and (b) in the same tone zone. Those two are
    // precisely the hard cuts the emitter already made — back-face culling and
    // the zone gate — so a span boundary is always a place a ruling was already
    // allowed to end, and a span interior never contains one.
    //
    // TONE IS NOT LOST. Dropping WHOLE rulings by rank is how this engine shades
    // (the file has said so since the ladder was written, and the seam tests
    // deliberately assert nothing about ink totals so that it stays free to). The
    // span's representative coverage is the MEAN over its own samples, so a
    // ruling that crosses mostly-dark surface still reads a high coverage and
    // draws, and one that crosses mostly-lit surface reads a low one and drops.
    // Taking the FIRST sample instead (a pure latch) was measured and rejected.
    // The first sample of a span sits ON the silhouette or the zone boundary,
    // where the intensity is extreme and unrepresentative of the span, so the
    // latch throws ink away: on one lit sphere, against the per-sample emitter,
    // the MEAN holds ink to within 3 % on every mapper (hatch -2.3 %, contour
    // -2.7 %, crosshatch -1.5 %, spiral -1.3 %) while the latch loses 12 % to
    // 42 % (contour 6533 -> 3790 mm). And it does not lose it evenly: the latch's
    // contour density read 0.140 / 0.126 / 0.066 / 0.222 / 0.421 across five bins
    // from the light, i.e. a hole in the middle of the form that is LIGHTER than
    // the lit end. Both stop the breaks; only one of them still draws the light.
    //
    // WHAT THIS COSTS, stated plainly. A ruling that runs FROM the light INTO the
    // shadow can no longer fade out along its own length — under the law it must
    // draw whole or not at all, so tone reads ACROSS the family, not along a
    // ruling. Where the light gradient runs along the rulings (a side-lit sphere
    // filled with contour rings) that removes an asymmetry the per-sample verdict
    // had: `scene3d-surface-fill`'s "the lit side thins" measures 0.033 where it
    // wants 0.114. It comes back with `toneZones` (Stage 2), which makes a zone
    // boundary a real span boundary — a ring crossing L -> M -> T -> F then takes
    // a verdict per zone, and ends where the surface genuinely changes, which is
    // the one mid-form end this design has always sanctioned.
    //
    // `valueAt(smp, index)` is the per-sample quantity the verdict reads;
    // `verdict(mean, midIndex, restarting, spanOrdinal)` returns true to DROP.
    // `spanOrdinal` is this span's position in the ruling (0 for the usual
    // single-span ruling); the ladder keys its phase on it so the k-th spans of
    // successive rulings — the pieces that actually neighbour each other on the
    // form — are spaced against each other and not against a different piece.
    // `restarting`
    // is true once this ruling has drawn a span AND dropped a later one — the
    // one-sided hysteresis margin (Stage 5) is charged there and nowhere else,
    // which is the same asymmetry it always had, moved to the scale the verdict
    // is now taken at. Returns one boolean per sample index, so the emit loop
    // stays a single pass.
    const spanDrops = (smps, zones, valueAt, verdict, wrap) => {
      const n = smps.length;
      const drop = new Array(n).fill(false);
      // Segment first, so a CLOSED sweep's two ends can be recognised as one
      // span before any verdict is taken.
      const spans = [];
      let s = 0;
      while (s < n) {
        if (!smps[s]) { s += 1; continue; }
        const z = zones ? zones[s] : null;
        let e = s;
        while (e + 1 < n && smps[e + 1] && (zones ? zones[e + 1] : null) === z) e += 1;
        spans.push([s, e]);
        s = e + 1;
      }
      // THE PARAMETER SEAM IS NOT A SPAN BOUNDARY. A closed sweep (a contour
      // ring: b = 1 IS b = 0) is handed to this loop as an array, so its two
      // ends arrive as the FIRST and LAST spans — but on the form they are one
      // continuous piece of surface with no boundary between them. Left apart
      // they took two verdicts, and where the two disagreed the ring stopped
      // dead on the wind meridian: measured 8.1 % of the radius inside the
      // silhouette on a lit sphere, on open front-facing surface. This is the
      // verdict-side statement of the same law `a5a8b63` fixed on the geometry
      // side, and it is decided the same way — the two ends are ONE point.
      if (wrap && spans.length > 1) {
        const first = spans[0];
        const last = spans[spans.length - 1];
        const sameZone = (zones ? zones[first[0]] : null) === (zones ? zones[last[0]] : null);
        if (first[0] === 0 && last[1] === n - 1 && sameZone) {
          spans.pop();
          spans[0] = [last[0], last[1], first[0], first[1]];   // tail + head, one span
        }
      }
      let drew = false;
      let stopped = false;
      spans.forEach((span, spanOrd) => {
        const idx = [];
        for (let i = 0; i < span.length; i += 2) {
          for (let k = span[i]; k <= span[i + 1]; k++) idx.push(k);
        }
        let sum = 0;
        idx.forEach((k) => { sum += valueAt(smps[k], k); });
        const d = verdict(sum / idx.length, idx[idx.length >> 1], drew && stopped, spanOrd);
        idx.forEach((k) => { drop[k] = d; });
        if (d) { if (drew) stopped = true; } else drew = true;
      });
      return drop;
    };

    // Emit one iso-line. `paramAt(tt)` walks the line through the (a,b)
    // parameter square. `threshold` is this line's ordered-dither cut (0..1) —
    // the sample draws only where the local shade (1 − I) meets it, so lines
    // vanish toward the lit highlight and pile up in shadow. `back` selects the
    // FAR side (camN.z < 0) instead of the visible front side, and tags the run.
    // The ladder's own selection is NOT a per-line number any more (see
    // `ladderStep`): the ruling's coverage is folded into its family's phase and
    // the verdict falls out of that, which is why there is no `ladderRank`
    // argument. `threshold` stays the geometric rank the legacy no-ladder
    // callers compare shade against. `zoneGate`, when set, restricts
    // the line to a single form zone: that is how the terminator's crossed
    // family is spent on T alone instead of being sprayed over the whole dark
    // band (O17 — Round 2 crossed ALL of band 0, at 0/90, and it read as wire mesh).
    const emitLine = (paramAt, threshold, back, lineIndex, count, zoneGate, pitchStep, lineDir, densityCross) => {
      const wantFront = !back;
      // Every ruling of one family shares one phase track (see ladderPhase).
      const ladderKey = currentFam;
      let hlRun = [];
      // The base channel goes through the shared run sink (see makeSink).
      const sink = makeSink(back, lineIndex, currentFam);
      // A hard cut ends the continuous span, so both trigger flags reset.
      const flush = () => { sink.flush(); };
      const softDrop = sink.softDrop;
      const addPt = sink.addPt;
      // Highlight runs are tagged so the caller draws them dashed/dotted on the
      // highlight pen (dashed/dotted treatments).
      const flushHL = () => {
        if (hlRun.length >= 2) {
          hlRun.highlight = true; hlRun.lineIndex = lineIndex;
          if (back) hlRun.back = true;
          out.push(hlRun);
        }
        hlRun = [];
      };
      // sparse: is THIS line kept in the highlight band? (every Nth by density).
      // Under lightDriven `hl` is null, so the perFace density is unavailable —
      // read the same density off the lightDriven config, otherwise `sparse`
      // keeps every line and collapses onto `keep` (O15).
      const sparseDensity = hl ? hlDensity : ldDensity;
      const sparseOwner = hl || ld;
      const sparseStep = sparseOwner ? Math.max(1, Math.round(100 / sparseDensity)) : 1;
      const lineKept = !sparseOwner || (lineIndex % sparseStep === 0);
      let sampleZone = null;
      // A family may ask for its own sample count (see angleFamily: a wrapped
      // helix is longer in the parameter square than an axis line, so it needs
      // proportionally more samples to stay on the form). Default is `steps`.
      const nSteps = Math.max(2, Math.min(MAX_LINE_STEPS,
        Number.isFinite(paramAt.steps) ? Math.round(paramAt.steps) : steps));

      // ── SAMPLE THE RULING ONCE, THEN DECIDE ONCE PER SPAN ────────────────────
      // Exactly the same sampleAt calls the emit loop used to make, hoisted so
      // the verdict can see the whole ruling before the first point is laid.
      // See `spanDrops` above for why the verdict has to be taken at this scale.
      const smps = new Array(nSteps + 1);
      const zones = new Array(nSteps + 1);
      // Geometric visibility, recorded BEFORE the zone gate nulls a sample: the
      // boundary refinement below is about where the SURFACE turns away, and a
      // zone edge is not that.
      const onSurf = new Array(nSteps + 1);
      for (let s = 0; s <= nSteps; s++) {
        const pr = paramAt(s / nSteps);
        const smp = sampleAt(pr.a, pr.b);
        const on = Boolean(smp && smp.front === wantFront);
        onSurf[s] = on;
        smps[s] = on ? smp : null;
        // The zone gate is a HARD cut, so a gated-out sample is not part of any
        // span; folding it in here keeps the span segmentation and the emit
        // loop's cut in step.
        if (on && toneOn) {
          const z = zoneOf(smp);
          // 'layeredCross' uses the zone ONLY as a gate. If the zone label
          // reached the span segmenter, family A — which is gated to nothing and
          // must run the whole form — would be cut into one span per zone and
          // could draw in the light and stop in the mid-tones, in open surface.
          // So the label a surviving sample carries is the GATE it passed, not
          // the zone it is in: one label per family ⇒ one span ⇒ one verdict.
          zones[s] = (TONE_ALGO === 'layeredCross') ? (zoneGate ? String(zoneGate) : null) : z;
          if (zoneGate && !gateAllows(zoneGate, z)) smps[s] = null;
        } else {
          zones[s] = null;
        }
      }
      // The composed coverage AT ONE SAMPLE — the exact arithmetic the per-sample
      // verdict used, factored out unchanged so the span verdict reads the same
      // number. `cap` and `myCeil` are Stage-3 (`coverageCap`) and are inert
      // while that flag is off; when it returns they vary continuously along a
      // ruling, and averaging them over the span is precisely what stops that
      // variation from cutting the ruling again.
      // The perpendicular gap between adjacent MASTER-GRID rulings at this
      // sample. Hoisted out of `covAtSample` because the weight laws need the
      // same number in the emit loop, where no coverage is being computed.
      const pitchAtStep = (smp, s) => {
        const tt = s / nSteps;
        const stepHere = typeof pitchStep === 'function' ? pitchStep(tt) : pitchStep;
        const dirHere = typeof lineDir === 'function' ? lineDir(tt) : lineDir;
        return perpPitch(smp, stepHere, dirHere);
      };
      const covAtSample = (smp, s, zone) => {
        // THE LOCAL PITCH IS MEASURED FIRST. Laws 6-10 are stated in APPARENT
        // AREA, not in coverage, so they need the pitch that actually lands here
        // in order to say what coverage buys that area (see `covForArea`). The
        // hoist is pure — `localPitch` never depended on `cov` — and `ladder`
        // and laws 1-5 read exactly the value they always did.
        //
        // `pitchStep` / `lineDir` are constants for a straight parameter-
        // space family and FUNCTIONS OF tt for the screen-frame crossed
        // family, whose direction — and therefore whose neighbour offset —
        // varies along the line. Everything downstream is unchanged.
        const localPitch = pitchAtStep(smp, s);
        // The four alternatives own the coverage outright. They never route
        // through `zoneCoverage`: under 'layeredCross' the zone label is a gate
        // name ('X1,X2'), not a FORM_INK row, and asking Regions for its ink
        // would be a category error. `ladder` takes the branch it always took.
        let cov = (TONE_ALGO !== 'ladder')
          ? algoCoverage(smp.I, Boolean(zoneGate), smp, localPitch)
          : (zone
            ? zoneCoverage(zone, Boolean(zoneGate), densityCross === true, smp)
            : coverageForSample(smp.I));
        // ── THE ONE PHYSICAL LIMIT LEFT IN UNCAPPED MODE ──────────────────────
        // Budget off, floor on. `HL_STAGE.coverageCap` is a different law (a
        // composed DARKNESS ceiling, `myCeil`) and stays off; this is the craft
        // rule and nothing else — a family may not rule closer than
        // `PLOT_FLOOR_PEN x pen`, measured where the geometry actually crowds.
        // Counted, because "where does the floor bind" is now the only question
        // standing between the law and the lighting.
        if (TONE_UNCAPPED && localPitch != null && localPitch > 1e-6 && floorPitch > 1e-6) {
          const capF = clamp(localPitch / floorPitch, 0, 1);
          const rk = `${ladderKey}|${lineIndex}`;
          floorStat.samples += 1;
          floorStat.touched.add(rk);
          if (cov > capF + 1e-9) {
            floorStat.clamped += 1;
            floorStat.rulings.add(rk);
            if (capF > 1e-9 && cov / capF > floorStat.worst) floorStat.worst = cov / capF;
            cov = capF;
          }
        }
        // §0, restated as arithmetic, and C15: past ~1.2 x pen width you do
        // not get darker by ruling closer — you get a flooded blob and a wet
        // plot. On a wrapped surface that limit is reached LOCALLY long
        // before it is reached globally: a sphere's meridians converge to
        // zero pitch at the poles, so the pole caps flooded solid (measured
        // D = 1.000) while the equator was still legible. Capping coverage by
        // the LOCAL pitch spends the excess the only way the craft rule
        // allows — by dropping rulings — and it is what keeps the lit end of
        // the ladder separable instead of saturating into the dark end.
        let cap = 1;
        if (HL_STAGE.coverageCap && localPitch != null) {
          // Effective pitch is localPitch / coverage and must stay at or above
          // the floor, so the darkest zone may not exceed localPitch/floor.
          // Applied MULTIPLICATIVELY, not as a clamp: where the geometry
          // crowds, every zone thins by the same factor, so the ladder's
          // ratios survive intact instead of the whole ramp collapsing onto
          // the floor together (which is exactly what a clamp did — L, M, T
          // and F all landed at the same effective pitch and the form went
          // flat).
          if (localPitch > 1e-6 && floorPitch > 1e-6) cap = clamp(localPitch / floorPitch, 0, 1);
        }
        let covCapped = cov * cap;
        // Perceived coverage composes as 1 - PROD(1 - c_i): the crossed
        // family overlaps family A, so treating them as additive over-reports
        // and lets the pair flood. Solve for the most the CROSS may lay down
        // without the pair passing the ceiling.
        // ── ONE COMPOSED BUDGET, SPLIT ACROSS EVERY PASS ─────────────────
        //
        // ROUND 7 (C2 / O13 / C15-on-the-object). Two faults, one cause.
        //
        // (a) The BASE pass had no composed budget at all. It was limited
        //     only by the multiplicative `cap = localPitch / floorPitch`,
        //     a per-family PITCH rule — so the ceiling was enforced purely
        //     by WITHHOLDING the cross, and where family A alone busted it
        //     the composed total simply stayed at whatever A had done.
        //     Measured at the peak: one family, alone, at an effective
        //     0.466 mm = 1.55 x pen, coverage 0.644 — inside C15's literal
        //     1.2 x bar, 1.4x past this path's own family-A floor, and
        //     carrying the object's maximum D.
        //
        // (b) The cross pass modelled family A's already-laid coverage as
        //     `penWidth * primary / localPitch` — using the CROSS family's
        //     local pitch, because that is the only one in scope. Family A
        //     runs at a different angle and therefore a different pitch, so
        //     the term was evaluated on the wrong quantity: where the cross
        //     ran sparser than A, `cA` came out too low, `room` too
        //     generous, and the pair composed to 0.642 against a 0.47
        //     ceiling. Measured at the peak window: family A 0.497,
        //     crossed family 0.289.
        //
        // Both are the same error the collar took three rounds to shed — a
        // cap stated on a proxy one transform away from the metric. So the
        // budget is no longer modelled at all. Each pass is handed a SHARE
        // of the zone's composed ceiling, in proportion to the ink that
        // pass is meant to contribute, and enforces only its own share
        // against its own pitch — which is the one pitch it actually knows.
        // Because 1 - PROD(1 - c_i) with c_i = 1 - (1-ceil)^(w_i/W) is
        // exactly `ceil` when every pass saturates, the composed total is
        // bounded by construction and no pass needs to know about any
        // other.
        if (HL_STAGE.coverageCap && zone && localPitch != null && localPitch > 1e-6) {
          // The ceiling stays PROPORTIONAL to the zone's intended weight,
          // never a flat clamp. A flat clamp collapses every zone that
          // reaches it onto one value — T and F both crossed, both
          // saturated, T/F 0.98, and the dip closed again.
          const ink = Regions.formInk(zone);
          const ceil = zoneCeiling(zone);
          // Every family that will land on this sample, and what each is
          // for. The Density overflow is a THIRD direction and has to be in
          // the denominator or it spends budget nobody accounted for.
          const wBase = Math.max(0, ink.coverage);
          // The cross's weight is what will ACTUALLY land here, tapered and
          // all — a family that is not drawn must not hold budget.
          const wCross = Math.max(0, crossWeightAt(zone, smp));
          const wOver = densityOverflow > 0 ? Math.max(0, ink.coverage * densityOverflow) : 0;
          const W = wBase + wCross + wOver;
          let share = 1;
          if (W > 1e-6) {
            if (densityCross) share = wOver / W;
            else if (zoneGate) share = wCross / W;
            else share = wBase / W;
          }
          const myCeil = share >= 1 ? ceil : 1 - Math.pow(1 - ceil, clamp(share, 0, 1));
          covCapped = Math.min(covCapped, (myCeil * localPitch) / penWidth);
        }
        return covCapped;
      };
      // ── A RULING ENDS ON THE BOUNDARY, NOT ONE SAMPLE SHORT OF IT ───────────
      //
      // The span verdict says WHETHER a ruling draws; this says WHERE it stops.
      // The emit loop keeps the samples whose camera-space normal faces the
      // camera and cuts at the first one that does not, so a ruling ends at the
      // last sample that happened to test front-facing — up to one whole sample
      // step inside the silhouette.
      //
      // On a SMOOTH chart that costs nothing: `nz` decays to zero AT the
      // silhouette, so the last front sample already sits a fraction of a
      // millimetre from it (sphere, ellipsoid, cylinder, cone, capsule and
      // superellipsoid all measured 0.00 mm on the app-default scene). On a
      // chart with CREASES `nz` jumps, and the whole sample step is lost: the
      // shipped pyramid (`detail: 8`, so a 45° wrapped ruling is sampled every
      // 3.4 mm) ended its rulings 3.43 mm (hatch/crosshatch) and 4.85 mm
      // (contour) inside open front-facing surface — a bare wedge along both
      // lower slant edges. The thin-tube charts lose the same step at their own
      // scale: torus 0.96-1.99 mm and torusKnot 1.06-1.25 mm on a tube whose
      // radius is only 2.24 mm / 1.20 mm.
      //
      // So the crossing is BISECTED. `edgeAt` returns the last point that is
      // still on the wanted side, to within 1/4096 of a sample step. It can
      // only ever extend a run onto surface the emitter already proved visible
      // — it never relaxes the front test, never bridges a gap, and never adds
      // a point where there was no adjacent off-surface sample to refine
      // against, so a ruling that was already flush with the silhouette is
      // untouched.
      const EDGE_BISECT = 12;
      const edgeAt = (sIn, sOut) => {
        let lo = sIn / nSteps; let hi = sOut / nSteps; let best = null;
        for (let k = 0; k < EDGE_BISECT; k++) {
          const mid = (lo + hi) / 2;
          const pr = paramAt(mid);
          const smp = sampleAt(pr.a, pr.b);
          if (smp && smp.front === wantFront) { lo = mid; best = smp; } else hi = mid;
        }
        return best ? { x: best.x, y: best.y, z: best.z } : null;
      };
      // Is this sweep CLOSED? Exactly the test the seam join below uses: the two
      // ends land on the same point, which is what "closed" means. A ring's
      // first and last spans are therefore one span, not two.
      const closedSweep = Boolean(smps[0] && smps[nSteps]
        && Math.hypot(smps[0].x - smps[nSteps].x, smps[0].y - smps[nSteps].y) < SEAM_JOIN_MM);
      // ── THE CENTRE LIGHT'S PITCH BAR, CHARGED ONCE PER SPAN ─────────────────
      // §5.4 #1 / O6: the lit band must still carry ink, because a highlight is
      // defined by the ink AROUND it and a surround ruling at 17 × pen has none.
      // The emitter states that bar in millimetres — `litMaxPitchPen() × pen` —
      // and `litFloorCov` is the coverage that buys exactly that pitch off the
      // master grid. `zoneCoverage` charges it; `coverageForSample` cannot,
      // because it is per-sample and the verdict is per-span.
      //
      // Since HL_STAGE Stage 0 turned `toneZones` off, `zoneOf` returns null for
      // every sample, so the whole object runs on the ladder path — and the bar
      // went with the zones. Measured on the app-default scene (sphere r 25,
      // detail 28, pen 0.3, Density 50, hatch): masterPitch 1.491 mm, so the
      // ladder's top rung (coverage 0.20) rules the centre light at 7.46 mm
      // against a 3.6 mm bar. On a 50 mm ball that is a bare wedge running from
      // the pole to the silhouette — reported from the app, and invisible on the
      // 62 mm test rig because the defect is a fixed number of MILLIMETRES and
      // that fixture is 2.5x wider.
      //
      // A span whose midpoint sits in the top tone band is a ruling that lies in
      // the centre light, so it is the one the bar is about. Charging it here
      // rather than in `coverageForSample` is what keeps the ladder intact:
      // per-sample it also lifted every ruling that merely clips the lit cap,
      // which drove the cap denser than the core shadow and took the 62 mm
      // contour ramp under its 1.8x bar (see coverageForSample).
      const litBand = nB - 1;
      const litSpanFloor = (cov, mid) => {
        const smp = smps[mid];
        if (!smp || zones[mid]) return cov;        // zones own their own floor
        return Regions.band(smp.I, tone) === litBand ? Math.max(cov, litFloorCov) : cov;
      };
      // One verdict per span, for the whole ruling, computed before any ink is
      // laid. `null` when the dither is off — every sample then draws.
      let spanDrop = null;
      const rulingDrop = new Map();   // zone → this ruling's verdict in that zone
      if (HL_STAGE.dither && toneOn) {
        spanDrop = useLadder
          ? spanDrops(smps, zones, (smp, s) => covAtSample(smp, s, zones[s]), (cov, mid, restarting, spanOrd) => {
            // The feather (Stage 4) is evaluated ONCE for the span, at its
            // midpoint, rather than per sample. It keeps its full amplitude —
            // so it still decorrelates WHICH rulings drop at a band edge, which
            // is what stops the edge reading as a traceable contour — but it can
            // no longer move a ruling's state mid-span, which was never its job.
            const jit = HL_STAGE.feather ? featherAt(lineIndex, mid) * FEATHER_AMPL : 0;
            // ...and the re-start margin (Stage 5) is charged on a span that
            // resumes a ruling which already drew and then stopped, which is the
            // only kind of re-start that is left. Raising the bar to start can
            // only ever REMOVE ink, so the composed C15/§0 budget is untouched.
            const margin = (HL_STAGE.hysteresis && restarting) ? hystFor(cov) : 0;
            // Both offsets were stated in RANK units against a fixed per-line
            // rank; against a phase ladder the identical quantity is a shift of
            // the EFFECTIVE COVERAGE, because `rank < cov + jit - margin` and
            // `keep at coverage cov + jit - margin` are the same statement. Both
            // are inert at this stage (feather and hysteresis are off) and the
            // arithmetic is carried unchanged so they mean the same thing when
            // they come back.
            const eff = clamp(litSpanFloor(cov, mid) + jit - margin, 0, 1);
            // ONE VERDICT PER RULING PER ZONE, and the span ordinal is
            // deliberately NOT in the key. A rank threshold used to give this
            // for free: every span of a ruling read the same per-line rank, so
            // a ruling could not draw on one side of a fold and vanish on the
            // other. A phase that steps per SPAN loses it — measured, it put
            // one torusKnot contour ring's near sheet on the page without its
            // far sheet and left a 1.54 mm end in open surface. The ladder
            // selects RULINGS (that is how this engine shades), so the RULING
            // is the unit that takes the step. The ZONE stays in the key,
            // because a zone step is a genuine tone boundary and is entitled to
            // its own verdict — that is what a zone-keyed span is for — whereas
            // a fold is not. At this stage `zones` is all null, so this is one
            // track per family.
            const zk = String(zones ? zones[mid] : null);
            if (rulingDrop.has(zk)) return rulingDrop.get(zk);
            const d = !ladderKeeps(`${ladderKey}|${zk}`, eff);
            rulingDrop.set(zk, d);
            return d;
          }, closedSweep)
          // Legacy, no-ladder callers: the same law, on the same quantity they
          // always compared (local shade against the line's geometric rank).
          : spanDrops(smps, zones, (smp) => clamp(1 - smp.I, 0, 1), (shade) => shade < threshold, closedSweep);
      }
      for (let s = 0; s <= nSteps; s++) {
        const tt = s / nSteps;
        const smp = smps[s];
        sampleZone = null;
        if (!smp) { flush(); flushHL(); continue; }
        if (toneOn) {
          const shade = clamp(1 - smp.I, 0, 1);
          // I8 — LIGHT-DRIVEN glint: the per-sample specular term overrides the
          // base tone fill inside the lit region. Brightest sample → blank; the
          // dim region edge → kept; graded by sensitivity (1 = binary). Spans
          // faces automatically because a point light's direction varies across
          // the surface. keep/dashed/dotted route kept samples to the highlight
          // channel; blank/sparse/stippleOut drop them to bare paper.
          if (ld) {
            const stg = Regions.highlightStage(smp.S, ld.sensitivity, LD_REG);
            if (stg.inRegion) {
              // `openness` = per-sample treatment strength (brightest → ~1). A
              // TREATED sample reroutes (keep/dashed/dotted → highlight channel)
              // or blanks (blank/sparse → bare paper); UNTREATED stays on the base
              // run. sensitivity 1 → whole region treated (binary); N → graded.
              const treated = sfHash(Math.round(smp.x * 4), Math.round(smp.y * 4)) < stg.openness;
              const tr = ld.treatment;
              if (tr === 'dashed' || tr === 'dotted') {
                if (treated) { flush(); hlRun.push({ x: smp.x, y: smp.y, z: smp.z }); }
                else { flushHL(); addPt({ x: smp.x, y: smp.y, z: smp.z }, null, tt); }
              } else if (tr === 'sparse' || tr === 'stippleOut') {
                // O15 — these two used to fall into the `blank` arm below, so
                // switching highlightMode to lightDriven silently turned a sparse
                // or stippled highlight into a hole. They now thin on the
                // highlight channel here exactly as they do under perFace.
                if (!treated) { flushHL(); addPt({ x: smp.x, y: smp.y, z: smp.z }, null, tt); }
                else if (tr === 'sparse'
                  ? lineKept
                  : sfHash(Math.round(smp.x * 4), Math.round(smp.y * 4)) < clamp((ldDensity / 100) * (0.3 + shade * 2), 0, 1)) {
                  flush(); hlRun.push({ x: smp.x, y: smp.y, z: smp.z });
                } else { flush(); flushHL(); }
              } else if (treated) { flush(); flushHL(); }        // blank glint
              else { flushHL(); addPt({ x: smp.x, y: smp.y, z: smp.z }, null, tt); }
              continue;
            }
          }
          // The sample draws where this ruling's PERMUTED rank sits below the
          // SPAN's coverage — dark spans cover more ranks (dense), the centre
          // light few (sparse), the glint none (blank). The verdict was taken
          // once, above, for this whole continuous span; see `spanDrops`.
          // Without a ladder (other callers) it degrades to the legacy shade
          // vs. threshold test, taken at the same scale.
          //
          // The zone gate is a HARD cut that confines a crossed family to its
          // own zone; it has to keep firing when `toneZones` is on but `dither`
          // is off, otherwise the T/F cross families spray over the whole
          // object. It is applied in the pre-pass (a gated-out sample is not on
          // any span) and repeated here so the run is actually flushed.
          const zone = zones[s];
          sampleZone = zone;
          if (zoneGate && !gateAllows(zoneGate, zone)) { flush(); flushHL(); continue; }
          let dropZone = spanDrop ? spanDrop[s] : false;
          let dutyBreak = false;
          // Dash duty — the reflected rim breaks its rulings rather than
          // tightening them (§5.1: widened spacing + duty 0.7). A duty break
          // is DELIBERATE, so it cuts hard, is never bridged, and stays a
          // PER-SAMPLE decision: it is the one mid-surface end this emitter is
          // supposed to make. (Stage 6 / `dashDuty`, and it needs `toneZones`.)
          if (HL_STAGE.dashDuty && !dropZone && zone) {
            const duty = clamp(finite(Regions.formInk(zone).duty, 1), 0, 1);
            if (duty < 1 && sfHash(lineIndex + 7717, Math.round(s / 2)) >= duty) { dropZone = true; dutyBreak = true; }
          }
          if (dropZone) {
            // Ordered-dither drop zone. Legacy (no highlight, or not the
            // highlight band): drop = bare paper. This is the ONE bridgeable
            // break: it is the dither's per-sample verdict, and on a wrapped
            // surface it chatters (see RULING CONTINUITY above). A duty break
            // is deliberate and still cuts hard.
            if (!hl || !hlIsHL(smp.I)) {
              flushHL();
              if (dutyBreak) flush();
              else softDrop({ x: smp.x, y: smp.y, z: smp.z });
              continue;
            }
            const t = hl.treatment;
            if (t === 'dashed' || t === 'dotted') { flush(); hlRun.push({ x: smp.x, y: smp.y, z: smp.z }); continue; }
            // O11/O14 — `sparse` and `stippleOut` used to push their survivors
            // into the BASE run, untagged: they came out in the object pen and
            // read as slightly thinner fill rather than as a highlight, and the
            // highlight pen never reached them. They belong on the highlight
            // channel, like keep/dashed/dotted.
            if (t === 'sparse') {
              if (!lineKept) { flush(); flushHL(); continue; }
              flush(); hlRun.push({ x: smp.x, y: smp.y, z: smp.z }); continue;
            }
            if (t === 'stippleOut') {
              // Thin toward the hotspot: keep-probability rises with shade (away
              // from the glint), deterministic on the quantized screen point.
              const keepProb = clamp((hlDensity / 100) * (0.3 + shade * 2), 0, 1);
              if (sfHash(Math.round(smp.x * 4), Math.round(smp.y * 4)) >= keepProb) { flush(); flushHL(); continue; }
              flush(); hlRun.push({ x: smp.x, y: smp.y, z: smp.z }); continue;
            }
            // altFill / burst: base fill drops here; a region pass fills it.
            flush(); flushHL(); continue;
          }
        }
        flushHL();
        // Meet the boundary on the way in, and again on the way out. Both are
        // no-ops unless the neighbouring sample is off the wanted side of the
        // surface, which is the only place a refinement is defined.
        if (s > 0 && !onSurf[s - 1]) { const e = edgeAt(s, s - 1); if (e) addPt(e, sampleZone, tt); }
        if (toneOn && TONE_ALGO === 'weightModulated') sink.noteW(weightAt(smp.I));
        else if (toneOn && isWeightLaw()) sink.noteW(weightAtSample(smp, pitchAtStep(smp, s)));
        addPt({ x: smp.x, y: smp.y, z: smp.z }, sampleZone, tt);
        if (s < nSteps && !onSurf[s + 1]) { const e = edgeAt(s, s + 1); if (e) addPt(e, sampleZone, tt); }
      }
      flush();
      flushHL();
      // ── THE SEAM JOIN ────────────────────────────────────────────────────────
      // A CLOSED sweep (a contour ring: `b` runs the full wind and b = 1 IS
      // b = 0) has no start and no end on the form — only a bookkeeping seam at
      // tt = 0/1. When the far side of the form cuts such a sweep, the loop
      // hands back a HEAD (from tt = 0) and a TAIL (to tt = 1) that are the two
      // ends of ONE stroke, meeting exactly on the seam. Left apart they plot as
      // two pens-down and read as a break in the ring. Stitch tail→head back
      // into one polyline. Nothing is added or removed: the join is only made
      // when the two endpoints are the SAME point, which is what "closed" means.
      const mine = sink.emitted();
      if (mine.length >= 2) {
        const head = mine[0];
        const tail = mine[mine.length - 1];
        if (head !== tail && head.tt0 === 0 && tail.tt1 === 1) {
          const h0 = head[0];
          const t1 = tail[tail.length - 1];
          if (Math.hypot(t1.x - h0.x, t1.y - h0.y) < SEAM_JOIN_MM) {
            for (let i = 1; i < head.length; i++) tail.push(head[i]);
            tail.tt1 = head.tt1;
            const at = out.indexOf(head);
            if (at >= 0) out.splice(at, 1);
          }
        }
      }
    };

    const emitFamily = (fixAxis, count, back, zoneGate) => {
      nextFam(zoneGate ? `gate${zoneGate}` : 'A');
      for (let i = 0; i < count; i++) {
        const fixVal = (i + 0.5) / count;
        emitLine(axisLine(fixAxis, fixVal), (i + 0.5) / count, back, i, count, zoneGate,
          fixAxis === 'b' ? { a: 0, b: 1 / count } : { a: 1 / count, b: 0 },
          fixAxis === 'b' ? { a: 1, b: 0 } : { a: 0, b: 1 });
      }
    };

    // ── Fill ANGLE on a wrapped surface ────────────────────────────────────────
    // Live defect (Jay): "Style > Hatch > Angle does nothing on at least one of
    // the shapes." buildObject documented `fillAngle` in its opts contract and
    // the scene3d caller passed it, but the module never read it — every
    // chart-wrapped primitive was hard-wired to the meridian family, so the dial
    // re-grouped the fill and re-emitted identical line art. (Faceted prims and
    // the flat-silhouette fallback always honoured it, hence "at least one".)
    //
    // The angle is measured in the surface's OWN tangent frame — exactly the
    // convention the faceted path uses, where 0 runs along the face's first
    // parametric axis. Here that first axis is `a` (the along-axis sweep), so:
    //   0°  ⇒ meridians  (the legacy hatch family — byte-identical, see below)
    //   90° ⇒ parallels  (the latitude family)
    // and everything between is a helical family that still wraps the form.
    // The rotation is done in the (a,b) parameter square, so the fill keeps
    // landing exactly on the rendered surface; `b` is periodic (the wind seam),
    // so a line clipped at b=0/b=1 continues as its neighbour with no visible
    // break. Deterministic — no RNG.
    //
    // Returns the family as { span, lineAt(frac) }. `frac` (0..1) is the line's
    // position across the family — the same 0..1 offset the axis families use —
    // and lineAt returns that line's paramAt(tt), or null when it misses the
    // parameter square entirely.
    const angleFamily = (angleDeg) => {
      const rad = (finite(angleDeg, 0) * Math.PI) / 180;
      const da = Math.cos(rad); const db = Math.sin(rad);   // along the line
      const na = -db; const nb = da;                        // across the family
      // ── THE WIND SEAM IS NOT A WALL ──────────────────────────────────────────
      //
      // The comment above always claimed "`b` is periodic (the wind seam), so a
      // line clipped at b=0/b=1 continues as its neighbour with no visible
      // break." IT DOES NOT. The clip below is a slab clip against the unit
      // SQUARE, so an angled ruling stops dead on the b = 1 meridian — and on a
      // yaw-0 sphere that meridian projects INSIDE the visible disc, running
      // from the right-hand equator point (at the silhouette) up to the pole (at
      // 0.87 R). The lune between it and the right silhouette is real, visible,
      // front-facing surface, and it was reached only by the residual corner
      // segments: measured on a 62 mm sphere, a ragged crescent up to 8 mm deep
      // — 13% of the radius — on the RIGHT limb only, with the left limb clean.
      // The asymmetry is the tell: b = 0.5 (the left limb) has no seam.
      //
      // The domain is a CYLINDER, not a square: a ∈ [0,1] with genuine ends (the
      // poles) and b ∈ R/Z with none. So clip against `a` alone and let `b` wrap.
      // Shifting b by one period shifts the family offset c by `nb`, so c ∈
      // [0, |nb|) already enumerates every distinct ruling — which makes the
      // line budget `count x span` land on exactly the same perpendicular
      // spacing (1/count) the axis families use, with no extra bookkeeping.
      //
      // Not used within WRAP_MIN_DA of the parallels direction: there `da` → 0,
      // a ruling would wind the seam many times per unit of `a`, and `steps`
      // could not follow it. That neighbourhood of 90° is the latitude family,
      // whose lines already span a whole wind and so have no seam to cross.
      const WRAP_MIN_DA = 0.2;
      if (Math.abs(da) >= WRAP_MIN_DA) {
        const period = Math.abs(nb);
        const wrap01 = (v) => { const w = v % 1; return w < 0 ? w + 1 : w; };
        const lineAtWrapped = (frac) => {
          const c = frac * period;
          const a0 = c * na; const b0 = c * nb;
          const ta = (0 - a0) / da; const tb = (1 - a0) / da;
          const t0 = Math.min(ta, tb); const t1 = Math.max(ta, tb);
          const len = t1 - t0;                     // = 1/|da|, the ruling's own length
          const at = (tt) => {
            const t = t0 + len * tt;
            return { a: clamp(a0 + t * da, 0, 1), b: wrap01(b0 + t * db) };
          };
          // Sample density per unit of parameter length matches an axis line's.
          at.steps = steps * len;
          return at;
        };
        return { span: period, lineAt: lineAtWrapped, na, nb, da, db };
      }
      // Perpendicular extent of the unit square → the offsets to sweep through.
      const projs = [0, na, nb, na + nb];
      const cMin = Math.min.apply(null, projs);
      const span = Math.max.apply(null, projs) - cMin;
      const lineAt = (frac) => {
        const c = cMin + frac * span;
        // Clip the infinite line p(t) = c·n + t·d to the unit square (slab clip).
        let t0 = -Infinity; let t1 = Infinity;
        let inside = true;
        const slab = (p0, dir) => {
          if (Math.abs(dir) < 1e-12) { if (p0 < -1e-9 || p0 > 1 + 1e-9) inside = false; return; }
          const ta = (0 - p0) / dir; const tb = (1 - p0) / dir;
          t0 = Math.max(t0, Math.min(ta, tb));
          t1 = Math.min(t1, Math.max(ta, tb));
        };
        slab(c * na, da);
        slab(c * nb, db);
        if (!inside || !(t1 > t0)) return null;
        const a0 = c * na; const b0 = c * nb;
        return (tt) => {
          const t = t0 + (t1 - t0) * tt;
          return { a: clamp(a0 + t * da, 0, 1), b: clamp(b0 + t * db, 0, 1) };
        };
      };
      return { span, lineAt, na, nb, da, db };
    };

    const emitAngledFamily = (angleDeg, count, back, zoneGate, densityCross) => {
      nextFam(densityCross ? 'over' : (zoneGate ? `gate${zoneGate}` : 'A'));
      const fam = angleFamily(angleDeg);
      // Keep the LINE SPACING (not the line count) constant as the family
      // rotates, so Density reads the same at every angle. span = 1 on an axis.
      const n = Math.max(2, Math.round(count * fam.span));
      for (let i = 0; i < n; i++) {
        const at = fam.lineAt((i + 0.5) / n);
        // Same dark→dense ladder the axis families use. Adjacent lines are
        // span/n apart ALONG the family normal, in parameter space.
        const step = fam.span / n;
        if (at) emitLine(at, (i + 0.5) / n, back, i, n, zoneGate,
          { a: fam.na * step, b: fam.nb * step }, { a: fam.da, b: fam.db }, densityCross);
      }
    };

    // ── THE CROSSED FAMILY IS MEASURED ON SCREEN, NOT IN THE CHART ────────────
    //
    // §2.3 states the rule as a statement about the EYE: crossed families sit at
    // +65°, "never +90°, which produces a visible square grid and moirés against
    // the raster". Until Round 8 that +65° was added to `fillAngle` inside the
    // (a,b) PARAMETER square and only then pushed through the chart, so what the
    // eye actually saw was the pushforward of 65°, which is 65° only where the
    // chart happens to be conformal and isotropic. On a sphere it is neither: the
    // pushforward metric is (R·cos v · du, R · dv), so as cos v → 0 toward the
    // pole the u-component collapses and any family carrying a dv component
    // swings toward 90° ON SCREEN against the parallels. Measured on the drawing
    // (length-weighted orientation histogram per 4 mm window): the terminator's
    // crossing ran a median 70° with a p90 of 85° and 13 % of windows at or past
    // 80° — the lit pole read as a clean square grid while the source said 65 the
    // whole time. It is also why O26's band boundaries were traceable: the flips
    // lined up along parameter-space isolines rather than along anything the
    // viewer can see.
    //
    // So the crossed family is now built the other way round. At every sample we
    // take family A's SCREEN direction (its own pushforward), rotate THAT by 65°
    // in screen space, and pull the result back through the inverse Jacobian to
    // get the parameter-space direction to march in. The family is therefore a
    // set of integral curves of a direction field rather than straight lines in
    // the chart — it CURVES in parameter space precisely so that it stays
    // straight-angled on screen, which is the frame the criterion is written in.
    //
    // Two things are deliberately NOT changed:
    //   - the crosshatch mapper's own family B (`cross.angleDelta`) keeps its
    //     parameter-frame semantics, because that dial is documented as matching
    //     the faceted path's `crossFamilies` exactly and is a user-facing angle;
    //   - the LINE BUDGET. The streamlines are seeded at the nominal family's own
    //     line positions, so `count` and the seeding pitch are untouched and the
    //     ladder's ink weights carry over unchanged.
    const CROSS_MIN_DET = 1e-9;
    // Fraction of the plot floor at which a traced ruling is treated as having
    // collapsed onto another (see sepDist below).
    const CROSS_SEP_FRAC = 0.5;

    // Pull an on-screen direction (tx,ty) back into the parameter square through
    // the inverse of J = [dA dB]. Returns null where J is degenerate — at a pole
    // or on the silhouette, where the surface has no two independent screen
    // directions to speak of and the question has no answer.
    const pullbackDir = (smp, tx, ty) => {
      if (!smp || !smp.dA || !smp.dB) return null;
      const det = smp.dA.x * smp.dB.y - smp.dB.x * smp.dA.y;
      const scale = Math.hypot(smp.dA.x, smp.dA.y) * Math.hypot(smp.dB.x, smp.dB.y);
      if (!(Math.abs(det) > CROSS_MIN_DET * Math.max(1e-12, scale))) return null;
      const a = (smp.dB.y * tx - smp.dB.x * ty) / det;
      const b = (smp.dA.x * ty - smp.dA.y * tx) / det;
      const n = Math.hypot(a, b);
      if (!(n > 1e-12)) return null;
      return { a: a / n, b: b / n };
    };

    // The parameter direction whose screen pushforward sits `deg` from family
    // A's, with the rotation SENSE (+1/−1) fixed once per family so the whole
    // family crosses the same way round.
    const screenCrossDir = (smp, aDir, deg, sense) => {
      if (!smp || !smp.dA || !smp.dB) return null;
      const sx = smp.dA.x * aDir.a + smp.dB.x * aDir.b;
      const sy = smp.dA.y * aDir.a + smp.dB.y * aDir.b;
      const L = Math.hypot(sx, sy);
      if (!(L > 1e-9)) return null;
      const rad = (sense * finite(deg, 65) * Math.PI) / 180;
      const c = Math.cos(rad); const s = Math.sin(rad);
      return pullbackDir(smp, (sx * c - sy * s) / L, (sx * s + sy * c) / L);
    };

    const alignTo = (d, ref) => (ref && (d.a * ref.a + d.b * ref.b) < 0 ? { a: -d.a, b: -d.b } : d);
    const inSquare = (p) => p.a >= 0 && p.a <= 1 && p.b >= 0 && p.b <= 1;
    // ── THE DOMAIN IS A CYLINDER, FOR A STREAMLINE TOO ────────────────────────
    // `angleFamily` learned this the hard way ("THE WIND SEAM IS NOT A WALL"):
    // `a` has genuine ends (the poles) and `b` is periodic, so a family clipped
    // against the unit SQUARE stops dead on a meridian that is ordinary visible
    // surface. A traced streamline hit exactly the same wall — measured on the
    // first contourFlow cut, the sphere came back as 50 fragments averaging half
    // a chord each, with an 18.35 mm free end and a 12.98 mm bare gap. So a flow
    // trace is bounded on `a` only, keeps `b` UNWRAPPED in its point list (so
    // the interpolation between two points never runs backwards across the
    // seam), and wraps only when it samples or emits.
    const wrapB = (v) => { const w = v % 1; return w < 0 ? w + 1 : w; };
    const inCylinder = (p) => p.a >= 0 && p.a <= 1;

    // Build the whole screen-frame crossed family once, and cache it: the T
    // gate, the F gate and the Density-overflow pass all emit the SAME geometry
    // and differ only in which zone they are allowed to draw in, so tracing once
    // makes the new family cheaper than the three straight ones it replaces.
    // ── 'contourFlow' — THE RULING DIRECTION IS THE LIGHT ──────────────────────
    //
    // Every other law here rules along the chart and varies the SPACING. This
    // one rules along the LIGHTING and lets the direction carry it, which is
    // what a hand engraver does: the strokes wrap a sphere because the light
    // wraps it, not because the parameterisation does.
    //
    // The intensity used is the SIGNED (unclamped) Lambert wherever the lights
    // are in scope. `smp.I` is clamped, so the whole dark side of a form is
    // I = 0 and its gradient vanishes — the field would have no direction at all
    // over exactly the half of the object this is supposed to describe.
    //
    //   'iso'  the level-set tangent, (−I_b, I_a) in the parameter square. This
    //          is coordinate-covariant: the level set of I is the same curve
    //          whatever chart names it, so no pullback is needed and none is
    //          done.
    //   'grad' the steepest-descent direction ON SCREEN, which is the honest
    //          orthogonal — perpendicularity is a screen property and the chart
    //          is not conformal. ∇_screen I = J^-T ∇_param I, then pulled back
    //          through `pullbackDir` exactly as the +65° family is.
    const FLOW_H = 1 / 256;
    const flowIntensity = (smp) => {
      if (!smp) return null;
      const lights = zoneCtx ? zoneCtx.lights : null;
      if (lights && typeof Regions.signedLambert === 'function') {
        return finite(Regions.signedLambert(smp.wN, smp.world, lights), finite(smp.I, 0));
      }
      return finite(smp.I, 0);
    };
    const flowDir = (p, mode) => {
      const smp = sampleAt(p.a, p.b);
      if (!smp) return null;
      const sA1 = sampleAt(clamp(p.a + FLOW_H, 0, 1), p.b);
      const sA0 = sampleAt(clamp(p.a - FLOW_H, 0, 1), p.b);
      const sB1 = sampleAt(p.a, clamp(p.b + FLOW_H, 0, 1));
      const sB0 = sampleAt(p.a, clamp(p.b - FLOW_H, 0, 1));
      if (!sA1 || !sA0 || !sB1 || !sB0) return null;
      const Ia = flowIntensity(sA1) - flowIntensity(sA0);
      const Ib = flowIntensity(sB1) - flowIntensity(sB0);
      const m = Math.hypot(Ia, Ib);
      if (!(m > 1e-12)) return null;   // the light is flat here; caller falls back
      if (mode !== 'grad') return { a: -Ib / m, b: Ia / m };
      if (!smp.dA || !smp.dB) return null;
      const det = smp.dA.x * smp.dB.y - smp.dB.x * smp.dA.y;
      const scale = Math.hypot(smp.dA.x, smp.dA.y) * Math.hypot(smp.dB.x, smp.dB.y);
      if (!(Math.abs(det) > CROSS_MIN_DET * Math.max(1e-12, scale))) return null;
      return pullbackDir(smp,
        (smp.dB.y * Ia - smp.dA.y * Ib) / det,
        (smp.dA.x * Ib - smp.dB.x * Ia) / det);
    };

    const crossFamilyCache = new Map();
    const buildCrossFamily = (baseAngleDeg, deg, count, flow) => {
      const key = `${baseAngleDeg}|${deg}|${count}|${flow || ''}`;
      if (crossFamilyCache.has(key)) return crossFamilyCache.get(key);
      const nominal = angleFamily(finite(baseAngleDeg, 0) + finite(deg, 65));
      const n = Math.max(2, Math.round(count * nominal.span));
      const step = nominal.span / n;
      const nomOff = { a: nominal.na * step, b: nominal.nb * step };
      const nomDir = { a: nominal.da, b: nominal.db };
      // Family A's parameter direction — the frame everything is measured from.
      const aRad = (finite(baseAngleDeg, 0) * Math.PI) / 180;
      const aDir = opts.mapper === 'contour'
        ? { a: 0, b: 1 }
        : { a: Math.cos(aRad), b: Math.sin(aRad) };
      // Fix the rotation sense once, at the first sample that has a frame: pick
      // whichever of ±deg lands closer to where the parameter-frame family used
      // to run, so the drawing keeps the same handedness it always had.
      let sense = 1;
      for (let i = 0; i < n && sense === 1; i++) {
        const at = nominal.lineAt((i + 0.5) / n);
        if (!at) continue;
        const seed = at(0.5);
        const smp = sampleAt(seed.a, seed.b);
        if (!smp || !smp.dA || !smp.dB) continue;
        const plus = screenCrossDir(smp, aDir, deg, 1);
        const minus = screenCrossDir(smp, aDir, deg, -1);
        if (!plus || !minus) continue;
        const dp = Math.abs(plus.a * nomDir.a + plus.b * nomDir.b);
        const dm = Math.abs(minus.a * nomDir.a + minus.b * nomDir.b);
        sense = dm > dp ? -1 : 1;
        break;
      }
      const dirField = (p, ref) => {
        let d = null;
        if (flow) {
          // The lighting field. Where it is degenerate — a flat-lit patch, the
          // pole of the light — the last direction the ruling had is a better
          // continuation than the chart's, so `ref` leads and nominal is the
          // last resort.
          d = flowDir(p, flow);
          return alignTo(d || ref || nomDir, ref || nomDir);
        }
        const smp = sampleAt(p.a, p.b);
        d = smp ? screenCrossDir(smp, aDir, deg, sense) : null;
        // Degenerate frame (pole / silhouette): fall back to the nominal
        // parameter direction rather than stopping the line dead.
        return alignTo(d || nomDir, ref || nomDir);
      };

      // ── THE RULINGS ARE SPACED IN SCREEN SPACE, NOT LEFT TO THE FIELD ────────
      //
      // Integral curves of a direction field are NOT an evenly-spaced family.
      // Where the field folds they run together onto a caustic, and every ruling
      // that reaches it lands on the same locus. That is not a modelling
      // subtlety — it is plainly visible: the first cut of this family drew a
      // solid black curve across the lit pole of the 92 mm ball, and the
      // window there went from D 0.433 to D 0.688 against a 0.56 object
      // ceiling. No per-ruling pitch estimate can catch it, because the rulings
      // that collide are not adjacent in the family; measuring the offset to
      // line i±1 more conservatively made it WORSE (0.644 → 0.688), which is
      // the measurement that ruled the estimate out as the cause.
      //
      // So spacing is enforced where the criterion is stated — on screen. A
      // ruling stops the moment it comes within the plot floor of a ruling
      // already laid down (Jobard–Lefebvre evenly-spaced streamlines). This is
      // §0 verbatim, applied to a curved family: past the floor you do not get
      // darker by ruling closer, so the ruling ends. Ending a stroke is also the
      // idiom the rest of this fill already speaks — the dither terminates
      // rulings everywhere.
      //
      // Occupancy is a sparse screen-space hash at the separation distance.
      // Back-facing samples are neither stamped nor tested: they project on top
      // of the front surface and would block rulings against geometry that is
      // not drawn.
      // WHAT SEPARATION, EXACTLY. The traced family is the FINE grid the ladder
      // subsets — the dither drops whole rulings by rank, so the geometry is laid
      // at the master pitch and only a fraction of it is ever drawn. Separating
      // at the master pitch itself therefore destroys the family before the
      // ladder gets to choose from it: measured, T fell 0.420 → 0.323 and T/F
      // went under the spec's own 1.25 on the big ball. The separation exists to
      // catch COLLAPSE — the caustic, where spacing goes to zero — not to space
      // the family, which the seeding already did. So it sits at a fraction of
      // the plot floor, low enough that an ordinary ruling never trips it.
      const sepDist = Math.max(1e-3, floorPitch * CROSS_SEP_FRAC);
      const CELL = sepDist * 0.7;
      const occ = new Map();
      const cellKey = (x, y) => ((Math.floor(x / CELL) + 8192) * 65536) + (Math.floor(y / CELL) + 8192);
      const occupiedByOther = (x, y, self) => {
        const ix = Math.floor(x / CELL); const iy = Math.floor(y / CELL);
        for (let j = -1; j <= 1; j++) {
          for (let i = -1; i <= 1; i++) {
            const v2 = occ.get(((ix + i + 8192) * 65536) + (iy + j + 8192));
            if (v2 !== undefined && v2 !== self) return true;
          }
        }
        return false;
      };
      const stamp = (x, y, self) => {
        const k = cellKey(x, y);
        if (!occ.has(k)) occ.set(k, self);
      };
      // EACH STREAMLINE CARRIES ITS NOMINAL COUNTERPART'S ARC LENGTH, centred on
      // the same seed. This is not cosmetic. A streamline is free to stay inside
      // the parameter square much longer than the straight chord it replaces, and
      // an unbounded trace put ~2x the ink on every ruling: the worst window on
      // the 92 mm ball went from 30 mm of ink to 66 mm and D from 0.529 to 0.669,
      // straight through the 0.56 object ceiling. Binding the arc length keeps
      // ink-per-ruling equal to the budget the ladder actually allocated, and it
      // keeps the k-th point of line i and the k-th point of line i+1 at the same
      // arc length from their seeds — which is what makes the neighbour offset
      // below an honest measurement of the local spacing rather than a guess.
      // A FLOW RULING IS NOT BUDGETED BY A CHORD. The arc bound above exists to
      // stop a +65° streamline spending twice the ink the ladder allocated to
      // the straight ruling it replaces. contourFlow has no straight ruling to
      // replace — the streamline IS the family — and binding it to the nominal
      // chord is what cut the sphere into 50 half-length fragments. So a flow
      // trace is given a full traversal of the domain and stops where the domain
      // does, which is what "edge to edge" means, with proportionally more steps
      // so the step SIZE is unchanged.
      const halfSteps = Math.max(4, Math.round(flow ? steps : steps / 2));
      const FLOW_ARC = 2.6;
      const trace = (seed, nomLen, self) => {
        const h = Math.max(1e-4, nomLen / 2) / halfSteps;
        const fwd = []; const bwd = [];
        // On a flow family the domain is a cylinder and `b` is not a wall (see
        // `inCylinder`); everywhere else the square clip is what it always was.
        const inDom = flow ? inCylinder : inSquare;
        const at = flow ? ((p) => ({ a: p.a, b: wrapB(p.b) })) : ((p) => p);
        const walk = (sign, into) => {
          let cur = { a: seed.a, b: seed.b };
          let ref = null;
          for (let k = 0; k < halfSteps; k++) {
            let d = dirField(at(cur), ref);
            if (ref == null && sign < 0) d = { a: -d.a, b: -d.b };
            const mid = { a: cur.a + d.a * h * 0.5, b: cur.b + d.b * h * 0.5 };
            if (!inDom(mid)) break;
            const d2 = dirField(at(mid), d);
            const nx = { a: cur.a + d2.a * h, b: cur.b + d2.b * h };
            if (!inDom(nx)) break;
            // Screen-space separation: walk the new step at sub-cell resolution
            // and stop the ruling the moment it enters another ruling's floor.
            const c0 = at(cur); const c1 = at(nx);
            const s0 = sampleAt(c0.a, c0.b);
            const s1 = sampleAt(c1.a, c1.b);
            if (s0 && s1 && s0.front && s1.front) {
              const segLen = Math.hypot(s1.x - s0.x, s1.y - s0.y);
              const sub = Math.max(1, Math.ceil(segLen / (CELL * 0.5)));
              let blocked = false;
              for (let q = 1; q <= sub; q++) {
                const u = q / sub;
                const px = s0.x + (s1.x - s0.x) * u; const py = s0.y + (s1.y - s0.y) * u;
                if (occupiedByOther(px, py, self)) { blocked = true; break; }
              }
              if (blocked) break;
              for (let q = 0; q <= sub; q++) {
                const u = q / sub;
                stamp(s0.x + (s1.x - s0.x) * u, s0.y + (s1.y - s0.y) * u, self);
              }
            }
            cur = nx; ref = d2;
            into.push({ a: cur.a, b: cur.b, da: d2.a, db: d2.b });
          }
        };
        walk(1, fwd);
        walk(-1, bwd);
        const d0 = dirField(at(seed), null);
        const pts = [];
        for (let i = bwd.length - 1; i >= 0; i--) pts.push(bwd[i]);
        pts.push({ a: seed.a, b: seed.b, da: d0.a, db: d0.b });
        for (let i = 0; i < fwd.length; i++) pts.push(fwd[i]);
        return { pts, seedIndex: bwd.length };
      };
      const lines = [];
      for (let i = 0; i < n; i++) {
        const at = nominal.lineAt((i + 0.5) / n);
        if (!at) { lines.push(null); continue; }
        // The nominal chord's own length through the parameter square — the arc
        // budget this ruling is entitled to.
        const p0 = at(0); const p1 = at(1);
        const nomLen = flow ? FLOW_ARC : Math.hypot(p1.a - p0.a, p1.b - p0.b);
        lines.push(trace(at(0.5), nomLen, i));
      }
      // NEIGHBOUR OFFSET, measured rather than assumed. Every streamline is
      // marched with the same step from a seed on the nominal family's own
      // normal, so index k is the same arc length along every line: the vector
      // from line i's k-th point to line i+1's k-th point IS the local offset to
      // the neighbouring ruling, which is the quantity the plot-safe cap needs.
      // Where the neighbour has already run off the square we fall back to the
      // nominal seeding offset.
      // BOTH neighbours, and the TIGHTER of the two — a ruling is as crowded as
      // its closest neighbour, not as its average one. Where neither neighbour
      // reaches this arc length (the family is running off the surface, which on
      // a sphere is exactly the pole) the last measured offset is carried
      // forward rather than reverting to the nominal seeding offset: the nominal
      // is an UPPER bound on the spacing, and handing an upper bound to a cap
      // whose whole job is to catch crowding licences the flood it exists to
      // prevent.
      lines.forEach((L, i) => {
        if (!L) return;
        const sides = [lines[i - 1] || null, lines[i + 1] || null];
        const raw = L.pts.map((p, k) => {
          let best = null;
          sides.forEach((o) => {
            if (!o) return;
            const q = o.pts[k - L.seedIndex + o.seedIndex];
            if (!q) return;
            const off = { a: q.a - p.a, b: q.b - p.b };
            const m = Math.hypot(off.a, off.b);
            if (!(m > 1e-9)) return;
            if (!best || m < best.m) best = { off, m };
          });
          // Diverging past the seeding pitch is legitimate but unbounded, so it
          // is clamped back to nominal: extra room is never spent, only crowding
          // is ever acted on.
          return best ? (best.m > step ? nomOff : best.off) : null;
        });
        let carry = nomOff;
        for (let k = 0; k < raw.length; k++) { if (raw[k]) carry = raw[k]; else raw[k] = carry; }
        for (let k = raw.length - 1; k >= 0; k--) { if (raw[k] === nomOff && raw[k + 1]) raw[k] = raw[k + 1]; else break; }
        L.off = raw;
      });
      const fam = { n, lines, step, nomOff, wrap: Boolean(flow) };
      crossFamilyCache.set(key, fam);
      return fam;
    };

    // Emit the screen-frame crossed family. Same signature role as
    // emitAngledFamily, same line budget, same ladder ranks.
    const emitScreenCross = (baseAngleDeg, deg, count, back, zoneGate, densityCross, flow) => {
      // MERGE FIX (shadow-anatomy × p4). This function is shadow-anatomy's
      // screen-frame replacement for the `emitAngledFamily` calls that used to
      // draw the terminator cross; p4 independently added `nextFam` family
      // tagging to `emitFamily` and `emitAngledFamily`, the only two emitLine
      // callers that existed when it was written. The two changes touch no
      // common line, so the merge was textually clean and silently produced a
      // third emitLine caller that never opens a family — every cross ruling
      // inherited the PREVIOUS family's id ('A#n'). That is not cosmetic:
      // `run.fam` is the key p4's continuity contract groups rulings by, so the
      // cross lines landed in family A's per-ruling buckets and made whole
      // rulings read as 3+ fragments, while `gate*` matched nothing at all.
      // Tag identically to `emitAngledFamily` — same argument names, same
      // precedence — so the cross is once again its own family.
      nextFam(densityCross ? 'over' : (zoneGate ? `gate${zoneGate}` : 'A'));
      const fam = buildCrossFamily(baseAngleDeg, deg, count, flow);
      for (let i = 0; i < fam.n; i++) {
        const L = fam.lines[i];
        if (!L || L.pts.length < 2) continue;
        const last = L.pts.length - 1;
        const idxAt = (tt) => clamp(tt, 0, 1) * last;
        const paramAt = (tt) => {
          const f = idxAt(tt);
          const k = Math.min(last - 1, Math.floor(f));
          const u = f - k;
          const p = L.pts[k]; const q = L.pts[k + 1];
          const bb = p.b + (q.b - p.b) * u;
          // `b` is stored UNWRAPPED on a flow family, precisely so this
          // interpolation cannot run backwards across the wind seam; it is
          // wrapped here, once, at the point it becomes a chart coordinate.
          return { a: clamp(p.a + (q.a - p.a) * u, 0, 1), b: fam.wrap ? wrapB(bb) : clamp(bb, 0, 1) };
        };
        const dirAt = (tt) => L.pts[Math.round(idxAt(tt))] || L.pts[0];
        const lineDir = (tt) => { const p = dirAt(tt); return { a: p.da, b: p.db }; };
        const pitchStep = (tt) => L.off[Math.round(idxAt(tt))] || fam.nomOff;
        emitLine(paramAt, (i + 0.5) / fam.n, back, i, fam.n, zoneGate,
          pitchStep, lineDir, densityCross);
      }
    };

    // I8 — SHADOW SENSITIVITY infill. The base dither can't densify shadow past a
    // meridian's own length (its rank is tied to its longitude), so graded
    // darkening is added as EXTRA lines confined to the dark region: a sample
    // survives only where I < SHADOW_TH, and each extra line's rank gates it by
    // stage so DEEPER shadow keeps MORE of them → a smooth dark gradient. More
    // sensitivity stages → more infill lines + a finer gradient. Default
    // (shadowSens 1) emits nothing → byte-identical.
    // `lineAt(frac)` places the infill line at the family's own 0..1 offset, so
    // the infill follows whatever direction the base family runs (axis or
    // angled) instead of always lying along the meridians.
    const emitShadowInfill = (lineAt, mainCount, back) => {
      if (!shadowGrades) return;
      const wantFront = !back;
      const extra = (shadowSens - 1) * Math.max(2, mainCount);
      for (let i = 0; i < extra; i++) {
        const paramAt = lineAt((i + 0.75) / extra); // interleaved with the base family
        if (!paramAt) continue;
        const rank = i % shadowSens;       // 0..shadowSens-1
        let run = [];
        const flush = () => { pushRun(run, back); run = []; };
        for (let s = 0; s <= steps; s++) {
          const tt = s / steps;
          const pr = paramAt(tt);
          const smp = sampleAt(pr.a, pr.b);
          if (!smp || smp.front !== wantFront || smp.I >= SHADOW_TH) { flush(); continue; }
          const stg = Regions.shadowStage(smp.I, shadowSens, SHADOW_TH);
          if (!stg.inRegion || stg.stage < rank) { flush(); continue; } // deeper shadow keeps more
          run.push({ x: smp.x, y: smp.y, z: smp.z });
        }
        flush();
      }
    };

    // Render one pass of the current mapper. `count` is the line/row budget
    // (reduced for the sparser back family) and `back` selects the far surface.
    // Returns false only for an unsupported mapper (so the front pass can bail).
    const runMapper = (count, back) => {
      const wantFront = !back;
      // Hatch/crosshatch are the two mappers that expose the Angle dial. 0 (and
      // any multiple of 180) is the legacy meridian family and takes the
      // axis-aligned emitters — byte-identical to the pre-fix output, so an
      // existing scene at angle 0 and every direct caller that omits fillAngle
      // are untouched. Contour/spiral/stipple have no Angle control and keep
      // their own families.
      const hatchAngle = finite(opts.fillAngle, 0);
      const onMeridianAxis = (((hatchAngle % 180) + 180) % 180) === 0;
      const meridianAt = (frac) => axisLine('b', frac);
      // Crosshatch family-B controls, clamped to the SAME ranges the faceted
      // path and the params schema use. A wrapped family's spacing is 1/count,
      // so the faceted "spacing × ratio" is "count ÷ ratio" here.
      const cross = opts.cross || {};
      const crossDelta = clamp(finite(cross.angleDelta, 90), 10, 170);
      const crossRatio = clamp(finite(cross.densityRatio, 1), 0.25, 2);
      const crossTriple = cross.triple === true;
      // Emit a family that is NOT the primary one, at an arbitrary angle. When
      // the primary family sits on a parametric axis the crossing family takes
      // the axis emitters too (delta 90 ⇒ the parallels family, exactly what
      // crosshatch has always emitted); when the primary is already an angled
      // scanline family, so is the crossing one. Either way the default
      // (delta 90, ratio 1, no triple) reproduces the previous output exactly.
      const emitSecondary = (angleDeg, count, back) => {
        if (!onMeridianAxis) { emitAngledFamily(angleDeg, count, back); return; }
        const a180 = (((finite(angleDeg, 0) % 180) + 180) % 180);
        if (a180 === 0) emitFamily('b', count, back);
        else if (a180 === 90) emitFamily('a', count, back);
        else emitAngledFamily(angleDeg, count, back);
      };
      // §5.0's hard ceiling, discharged: the ladder cannot reach a core shadow
      // by coverage alone (it runs out at full family), so the TERMINATOR — and
      // only the terminator — gains a second family, at +65°. Never +90°: an
      // orthogonal pair reads as a square grid and beats against the raster
      // (§2.3). This is what makes T out-ink F, which is the whole dip.
      // ROUND 8: the +65° is now measured in the SCREEN frame (see
      // emitScreenCross). One traced family serves all three passes.
      // 'layeredCross' — tone by ADDING families, the engraver's answer.
      // Family A (already emitted, at the flat sparse-end pitch) runs the whole
      // form. A second family crosses it wherever the surface is at or below the
      // mid-tone cut, and a third crosses both in the darks. Every family is
      // internally even and continuous, because each is a full phase-ladder pass
      // at ONE coverage; the tone is the COUNT of families over a point, not the
      // spacing of any of them.
      //
      // +65° and +32° are the angles this file already uses for a second and
      // third direction, and for the reason stated at `emitTerminatorCross`
      // below: +90° reads as a square grid and beats against the raster.
      // NOT `emitScreenCross`. That one traces streamlines of a screen-frame
      // direction field and stops a ruling the moment it comes within the plot
      // floor of one already laid — which is right for the terminator ACCENT it
      // was built for, and wrong here: measured, it built only 13 rulings across
      // the whole object for the +65° pass, so the added family read as four
      // stray arcs rather than as a second layer of tone. A plain angled family
      // is the same construction family A itself uses, so the added layers are
      // as even and as complete as the base one.
      const emitLayeredCross = (count, back) => {
        const base = finite(opts.fillAngle, 0);
        emitAngledFamily(base + 65, count, back, ['X1', 'X2']);
        emitAngledFamily(base + 32, count, back, ['X2']);
      };
      // 'crossFade' — layeredCross's three layers with the gates taken OFF.
      //
      // The two flaws being removed are both in the argument list. `zoneGate` is
      // gone, so no family is confined to a zone and therefore no family has an
      // edge to trace; and because every ruling is un-gated, every ruling runs
      // the full width of the form, so none of them can terminate in open
      // surface. The fade is carried entirely by `crossFadeCov` through
      // `xfLayer` — density, continuously, exactly as the eye reads a wash
      // thickening. Family A is layer 0 and was already emitted by the mapper.
      const emitCrossFade = (count, back) => {
        const base = finite(opts.fillAngle, 0);
        xfLayer = 1; emitAngledFamily(base + 65, count, back);
        xfLayer = 2; emitAngledFamily(base + 32, count, back);
        xfLayer = 0;
      };
      const emitTerminatorCross = (count, back) => {
        if (TONE_ALGO === 'layeredCross') { if (toneOn) emitLayeredCross(count, back); return; }
        if (TONE_ALGO === 'crossFade') { if (toneOn) emitCrossFade(count, back); return; }
        // 'contourFlow' replaces family A outright (see the mapper dispatch) and
        // adds nothing on top: the direction IS the tone statement.
        if (TONE_ALGO === 'contourFlow') return;
        if (!zonesOn) return;
        const base = finite(opts.fillAngle, 0);
        emitScreenCross(base, Regions.CROSS_OBJ_DEG, count, back, 'T');
        emitScreenCross(base, Regions.CROSS_OBJ_DEG, count, back, 'F');
        // The Density overflow (see the line budget): everything Density asked
        // for past the plot floor, laid down in a second direction instead of a
        // tighter pitch. Zero at and below the floor, so it is inert until it is
        // needed.
        if (densityOverflow > 0) {
          emitScreenCross(base, Regions.CROSS_OBJ_DEG, count, back, null, true);
        }
      };
      // 'contourFlow' owns family A itself on every line mapper: the rulings are
      // streamlines of the lighting field, seeded at the nominal family's own
      // line positions so the LINE BUDGET and the ladder's ranks are untouched
      // and only the direction changes. 'crosshatch' gets the orthogonal partner
      // — iso curves crossed by gradient curves, which is the engraver's pair.
      const flowMapper = TONE_ALGO === 'contourFlow' && toneOn
        && (mapper === 'hatch' || mapper === 'crosshatch' || mapper === 'contour');
      if (flowMapper) {
        const fBase = finite(opts.fillAngle, 0);
        emitScreenCross(fBase, 0, count, back, null, false, FLOW_MODE);
        if (mapper === 'crosshatch') {
          emitScreenCross(fBase, 0, count, back, null, false, FLOW_MODE === 'iso' ? 'grad' : 'iso');
        }
        emitShadowInfill(angleFamily(hatchAngle).lineAt, count, back);
      } else if (mapper === 'hatch') {
        if (onMeridianAxis) {
          emitFamily('b', count, back); // meridians wrap top-to-bottom
          emitTerminatorCross(count, back);
          emitShadowInfill(meridianAt, count, back);
        } else {
          emitAngledFamily(hatchAngle, count, back);
          emitTerminatorCross(count, back);
          emitShadowInfill(angleFamily(hatchAngle).lineAt, count, back);
        }
      } else if (mapper === 'crosshatch') {
        // Family B is `crossDensityRatio` SPACING wider than family A, i.e. this
        // many lines; ratio 1 leaves the count untouched.
        const countB = Math.max(2, Math.round(count / crossRatio));
        if (onMeridianAxis) emitFamily('b', count, back);
        else emitAngledFamily(hatchAngle, count, back);
        emitSecondary(hatchAngle + crossDelta, countB, back);      // the crossing family
        // §2.3 — the tone-driven third pass goes to +32°, not +45°: with family B
        // already at the user's delta, +45 lands close enough to A or B to beat.
        if (crossTriple) emitSecondary(hatchAngle + 32, countB, back); // darkest-band third pass
        emitTerminatorCross(count, back);
        emitShadowInfill(onMeridianAxis ? meridianAt : angleFamily(hatchAngle).lineAt, count, back);
      } else if (mapper === 'contour') {
        emitFamily('a', count, back); // latitude rings following the form
        emitTerminatorCross(count, back);
        emitShadowInfill((frac) => axisLine('a', frac), count, back);
      } else if (mapper === 'spiral') {
        // One continuous helix: the ALONG-axis coordinate sweeps 0→1 while the
        // AROUND coordinate winds `turns` times. `count` (line budget) is amplified
        // by SPIRAL_TURN_GAIN so Density 100 packs the loops toward full overlap
        // (I13); the back-face pass keeps its reduced `count`. The spiral controls
        // (I14) each warp this helix and are a strict no-op at their defaults.
        const sp = opts.spiral || {};
        const phase = finite(sp.offset, 0) / 360;              // angle offset → winding phase
        const gamma = clamp(finite(sp.eccentricity, 1), 0.3, 3); // sweep easing (1 = even)
        const symmetric = sp.center === 'bboxCenter';          // double helix from the middle
        const snap = sp.axisSnap === true;                     // wind the OTHER parametric axis
        const turns = Math.max(4, Math.min(SPIRAL_MAX_TURNS, Math.round(count * SPIRAL_TURN_GAIN)));
        // Same run sink as emitLine: a helix loop is a ruling too, and its
        // selection (by the turn it is on) is taken against a coverage that
        // varies along the loop, so it chattered in exactly the same way — just
        // less often, because a whole turn takes one verdict.
        const spiralFam = nextFam('spiral');
        const sink = makeSink(back, null, spiralFam);
        const flush = sink.flush;
        const total = steps * turns;
        // Sample the whole helix first, exactly as emitLine does, so the same
        // whole-span verdict can be taken here. A helix has no family index, so
        // its rank is the TURN it is on — and a turn's rank is as constant along
        // that turn as a ruling's is along itself, so comparing it against a
        // per-SAMPLE coverage cut turns in half in open surface for the very
        // same reason. Spans are delimited by the TURN as well as by the
        // surface: consecutive turns are different rulings and must be free to
        // take different verdicts.
        const sSmps = new Array(total + 1);
        const sZones = new Array(total + 1);
        const sTurn = new Array(total + 1);
        const sweepAt = (f) => {
          let sweep = symmetric ? (f < 0.5 ? f * 2 : (1 - f) * 2) : f;
          if (gamma !== 1) sweep = Math.pow(sweep, gamma);
          return sweep;
        };
        for (let s = 0; s <= total; s++) {
          const f = s / total;
          const sweep = sweepAt(f);
          const wind = (f * turns + phase) % 1;
          const smp = snap ? sampleAt(wind, sweep) : sampleAt(sweep, wind);
          const on = Boolean(smp && smp.front === wantFront);
          sSmps[s] = on ? smp : null;
          // 'layeredCross' has no gated family on the helix, so its intensity
          // zones would only cut the spiral into per-zone spans for nothing.
          sZones[s] = (on && toneOn && TONE_ALGO !== 'layeredCross') ? zoneOf(smp) : null;
          sTurn[s] = Math.floor(f * turns);
        }
        // Span key = (turn, zone). THE TURN HAS TO BE IN THE KEY, and this was
        // measured both ways. A helix's rank IS the turn it is on, so the turn is
        // the unit the verdict is taken over — the same relationship a ruling has
        // to its own rank. Keying the span on the ZONE ALONE (so a span is the
        // visible arc, and the arc's rank is the turn it is mostly on) does take
        // the helix's deepest free end from 13.3 % of the radius to 0.1 %, but a
        // sphere's helix stays front-facing straight across the wind seam, so the
        // whole visible face came back as ONE span with ONE verdict: ink rose
        // from 8190 mm to 9281 mm, the density ramp across the form collapsed
        // from 2.06x to 1.04x, and the lit end came back DENSER than mid-form.
        // That is a drawing that no longer shades, which is a worse defect than
        // the one being fixed. So the turn stays, and the residual free ends —
        // the ends of a loop whose neighbour dropped — stay with it. See the
        // report note: they land on the wind meridian, not scattered over the
        // form, because that is where every loop begins and ends.
        const sKeys = sZones.map((z, i) => `${sTurn[i]}|${z}`);
        let spTurn = -1;
        let spArc = 0;
        let sDrop = null;
        if (HL_STAGE.dither && toneOn) {
          sDrop = useLadder
            ? spanDrops(sSmps, sKeys,
              (smp, k) => (TONE_ALGO !== 'ladder'
                ? algoCoverage(smp.I, false, smp, null)
                : (sZones[k] ? zoneCoverage(sZones[k], false) : coverageForSample(smp.I))),
              // The helix's ruling index is the TURN, so the phase advances once
              // per turn (see ladderStep) and consecutive loops end up evenly
              // spaced instead of dropping in the power-of-two pattern a
              // bit-reversed rank on the turn number produced. `spanDrops`
              // numbers spans over the WHOLE helix, so the track key cannot be
              // that ordinal — it is the arc's ordinal WITHIN its turn, which is
              // what makes the k-th arc of each turn a track of neighbours.
              (cov, mid) => {
                const turn = sTurn[mid];
                if (turn !== spTurn) { spTurn = turn; spArc = 0; } else spArc += 1;
                return !ladderKeeps(`${spiralFam}|${spArc}`, clamp(cov, 0, 1));
              })
            : spanDrops(sSmps, sKeys, (smp) => clamp(1 - smp.I, 0, 1), (shade) => shade < 0.12);
        }
        for (let s = 0; s <= total; s++) {
          const smp = sSmps[s];
          if (!smp) { flush(); continue; }
          // Same hoist as emitLine's `sampleZone`: the sink's L-zone speck
          // exemption has to hold on EVERY path that feeds it, or the law is
          // enforced on the line families and not on the helix.
          // O18 — the spiral used to gate on a hardcoded `shade < 0.12` and
          // ignored `ladder[]` outright, so `bands` did nothing at all on a
          // spiral-filled object.
          const sampleZone = sZones[s];
          if (sDrop && sDrop[s]) {
            if (useLadder) { sink.softDrop({ x: smp.x, y: smp.y }); } else { flush(); }
            continue;
          }
          sink.addPt({ x: smp.x, y: smp.y, z: smp.z }, sampleZone);
        }
        flush();
      } else if (mapper === 'stipple') {
        // Dot lattice on the surface; a dot survives where local shade meets its
        // ordered-dither threshold (fewer dots toward the highlight). Each dot is a
        // small screen mark (a 0.01-unit marker would fall under the emitter's
        // MIN_RUN_MM floor and vanish). The DEFAULT ('dot', no dotSize) keeps the
        // legacy 6-segment R=0.7 ring exactly — a no-op default. Other shapes /
        // an explicit dotSize dispatch to the shared Mappers.stippleMark generator.
        const rows = count;
        const colsPer = Math.max(6, Math.round(count * 1.6));
        const legacyR = 0.7; // dot radius (screen units)
        const SEG = 6;
        const dotShape = typeof opts.dotShape === 'string' ? opts.dotShape : 'dot';
        const dotAngle = finite(opts.dotAngle, 0);
        const legacy = dotShape === 'dot' && !Number.isFinite(opts.dotSize);
        const R = Number.isFinite(opts.dotSize) ? clamp(opts.dotSize, 0.1, 3) : legacyR;
        const Marks = Vectura.Scene3D && Vectura.Scene3D.Mappers;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < colsPer; c++) {
            const smp = sampleAt((r + 0.5) / rows, (c + 0.5) / colsPer);
            if (!smp || smp.front !== wantFront) continue;
            if (toneOn) {
              // O18 — stipple used a hardcoded `(…%7)/7` dither and never read
              // `ladder[]`, so a stippled object showed no tone bands at all.
              // The dot now rides the same phase ladder the line families use,
              // against the local zone coverage.
              //
              // ONE TRACK PER ROW, and each row's phase OFFSET. A single track
              // running the whole raster (r x colsPer + c, which is what the
              // bit-reversed rank was indexed by) is even along the raster but
              // that is not the axis the eye reads — keeping every k-th dot in
              // raster order lands the survivors of consecutive rows at the same
              // column offset and the field  reads as diagonal rulings. So each
              // row is its own track, evenly spaced along itself, and its phase
              // starts a golden-ratio step further on than the row above, which
              // is the cheapest way to stop the rows lining up into columns.
              if (HL_STAGE.dither && useLadder) {
                const zone = TONE_ALGO === 'layeredCross' ? null : zoneOf(smp);
                const cov = TONE_ALGO !== 'ladder'
                  ? algoCoverage(smp.I, false, smp, null)
                  : (zone ? zoneCoverage(zone, false) : coverageForSample(smp.I));
                if (!ladderKeeps(`stipple|${back ? 'B' : 'F'}|${r}`, clamp(cov, 0, 1),
                  (r * GOLDEN_STEP) % 1)) continue;
              } else if (HL_STAGE.dither) {
                const shade = clamp(1 - smp.I, 0, 1);
                const th = ((r * colsPer + c) % 7) / 7; // scattered dither
                if (shade < th) continue;
              }
            }
            if (legacy || !Marks || typeof Marks.stippleMark !== 'function') {
              const ring = [];
              for (let k = 0; k <= SEG; k++) {
                const ang = (k / SEG) * Math.PI * 2;
                ring.push({ x: smp.x + Math.cos(ang) * R, y: smp.y + Math.sin(ang) * R, z: smp.z });
              }
              if (back) ring.back = true;
              out.push(ring);
            } else {
              Marks.stippleMark(dotShape, smp.x, smp.y, R, dotAngle).forEach((m) => {
                const mm = m.map((pt) => ({ x: pt.x, y: pt.y, z: smp.z }));
                if (back) mm.back = true;
                if (mm.length) out.push(mm);
              });
            }
          }
        }
      } else {
        return false; // unsupported mapper here
      }
      return true;
    };

    if (!runMapper(N, false)) return null; // front surface (unchanged when no x-ray)
    // X-ray back surface: sparser (count × backDensity) far-side family, tagged.
    if (xray) runMapper(Math.max(2, Math.round(N * backDensity)), true);
    // WHERE THE PLOT FLOOR BOUND, published for the comparison harness. Written
    // only in uncapped mode, so the committed build never allocates or exposes
    // it — `lastFloorStats` stays null and nothing downstream can read a number
    // that only exists for a prototype.
    lastFloorStats = TONE_UNCAPPED ? {
      algo: TONE_ALGO,
      penWidth,
      masterPitch: Math.round(masterPitch * 1000) / 1000,
      floorPitch: Math.round(floorPitch * 1000) / 1000,
      N,
      samples: floorStat.samples,
      clamped: floorStat.clamped,
      rulingsTouched: floorStat.touched.size,
      rulingsClamped: floorStat.rulings.size,
      worstAsk: Math.round(floorStat.worst * 100) / 100,
      // ...and, for laws 12-16, where the WEIGHT range bound. Both ends of it
      // are physical (W_MIN is the pen itself, W_FLOOD_AREA is a wet blob), so
      // "did the law reach the dark it asked for" has to be reported.
      weight: weightStat.samples ? {
        samples: weightStat.samples,
        wMin: Math.round(weightStat.wMin * 100) / 100,
        wMax: Math.round(weightStat.wMax * 100) / 100,
        wMean: Math.round((weightStat.wSum / weightStat.samples) * 100) / 100,
        askMax: Math.round(weightStat.askMax * 100) / 100,
        atMax: weightStat.atMax,
        floods: weightStat.floods,
        areaMin: Math.round(weightStat.aMin * 1000) / 1000,
        areaMax: Math.round(weightStat.aMax * 1000) / 1000,
        baseCov: Math.round(weightBaseCov() * 1000) / 1000,
      } : null,
    } : null;
    return out;
  };

  // Test seam for O6: the lit-band floor is applied deep inside a per-sample
  // dither, so its effect on the emitted paths is diluted by everything else in
  // the pipeline. `rawCoverage` is the brightest band's ladder coverage,
  // `specSize` the glint size (0 = specular off).
  const __litFloorForTest = (rawCoverage, specSize) => {
    const capped = specSize > 0
      ? rawCoverage * clamp(1 - 0.5 * specSize, 0, 1)
      : rawCoverage;
    return clamp(Math.max(capped, rawCoverage * GLINT_KEEP, LIT_FLOOR), 0, 1);
  };

  Vectura.Scene3D = Object.assign(Vectura.Scene3D || {},
    {
      SurfaceFill: {
        buildObject, chartFor, lineCountFor, __litFloorForTest, __ladderForTest: ladderKeep,
        get lastFloorStats() { return lastFloorStats; },
        get toneAlgo() { return TONE_ALGO; },
        get uncapped() { return TONE_UNCAPPED; },
        get flowMode() { return FLOW_MODE; },
      },
    });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { buildObject, chartFor, lineCountFor, __litFloorForTest, __ladderForTest: ladderKeep };
  }
})();
