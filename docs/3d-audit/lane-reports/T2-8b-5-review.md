# T2-8b-5 / 5b / 5c adversarial review (net e609338c..e784bb1d)

Reviewer: Sonnet. Read-only on src/tests. Scratch scripts and a mutated copy live in the session scratchpad, not the repo.
Fixtures: `create` and `test` rigs as in the impl reports (1200x1000, m=20, pen 0.3, mkTick unless named, fillAngle 45, SUN az135/el45, ground and backdrop DISABLED, DEFAULT_CAMERA, object ink only). Machine load average was 40-68 for the whole review.

## Verdict: ACCEPT-WITH-FOLLOWUPS. No finding blocks the merge.

## Checks
1. Bars changed. `git diff e609338c HEAD -- tests` removed lines match the three "Bars changed" lists: 12 goldens re-pinned, CHANGED_BY_BCE 7 -> 12, contrast mutation, REC needle, APEX (c) >=3 -> >=2, noapex W_L mutation retired and replaced by (a2), KINDS and BC_MUT 20 -> 29, beforeAll 550000 -> 1800000. No unlisted threshold moved. No population narrowed. Two retired/vacuous mutants are disclosed (noapex-W_L, nogrow). One small gap: `nogrow` is still in KINDS and RIM_KINDS but no longer asserted, and the 5b/5c "disclosed" text says retired; fine, but it still costs 12 renders (spacing-tone file runs 37 min under load).
2. bandC ceilings: unchanged. `git diff` over tests has zero hits for bandC / ceiling.
3. tickSites: byte-identical to e609338c on 12 of 12 d=50 cells and 8 of 8 d=220 cells (test rig sphere/torus/cone x hatch/contour, create sphere hatch/contour). Paths changed on 19 of 20 (as intended; create sphere/contour d=220 is path-identical).
4. Isolation re-run after the last edit: 9 non-mkTick laws (none, isophoteWidth, phaseFineLadder, bundleEased, contFieldFore, mkDashRamp, interlockWeave, defectSplit, endShorten) x all 8 mappers x cone/torus/sphere, create rig, d=50 = 216 cells, md5 of pathSignature vs e609338c: 216/216 identical, 0 throws. This closes the "ran one edit earlier" gap in 5c.
5. Mutations, run by me on a scratch copy (ship source mutated, test file reduced to the needed kinds):
   - STEP coherence removed (`MK_TICK_RIM_COH_OFF=true`): RIMEDGE STEP bar fails, 0.702 > 0.35. TRIPS.
   - Join-bend refusal removed (`MK_TICK_RIM_HOOK_OFF=true`): NOHOOK bar fails, worst bend 16.70 > 8.5. TRIPS.
   - Rim-strip extension removed (`runExtensions();` deleted): test cone/hatch W_L 2.6575 > 1.90 (back above 1.90, equals the 2.658 base). TRIPS.
6. Perf, torus mkTick hatch d=220, test rig, my harness, load 40-60: HEAD 4.80 s and 5.08 s; e609338c 1.48 s and 1.70 s (ratio 3.2-3.4x, matches the claimed ~1.7 s vs ~0.5 s at idle). Create rig HEAD 13.9 s and 15.3 s under load. The test `scene3d-mark-laws-draw` "torus d=220 perf ceiling" (`ms < 2500`) FAILED in my foreground run at load 68 (the base would have passed at that load).
7. Suites on the worktree HEAD: spacing-tone 156/156 and mktick-wedge 57/57 (213/213 in one run, 2234 s); mktick-banding 22/22; mark-laws-draw 42/43 (only the perf ceiling above).
8. Process note: the long files exceeded 600 s so I polled background runs for the 2234 s run (a deviation from 0b, forced by load).

## Findings
F1 (follow-up, not blocking) `tests/unit/scene3d-mark-laws-draw.test.js:437` plus `surface-fill.js:7522-7560`: the extension is ~3.3x slower at torus d=220 and the 2.5 s ceiling now has 1.5x headroom at idle (5x before). It fails on a busy CI or dev box. Raise the ceiling to a ratio against a same-process baseline, or cut cost (the `lineClear` walk runs per candidate end).
F2 (follow-up) Regular-tick hooks on spheres are pre-existing and still ungated (impl 5c: 39 of 689 ticks > 30 deg on create sphere/hatch, worst 134 deg). Jay's literal ask "the lines in the spheres must not have angles/hooks" is met only for extended/continuation/apex ticks. NOHOOK text says so; the commit and changelog must not claim more.
F3 (follow-up) Density dependence not disclosed. Rim candidates fall off fast with density (create sphere/hatch rimExt candidates: 29 at d=50, 8 at d=120, 2 at d=220; cone create 33 / 19 / 17), because `room = 2.05 * RPn - len` (`surface-fill.js:7522`) shrinks with pitch. All claims (W_L, STEP, STRIP) are d=50 only; the feature is effectively a low-density feature. STRIP_OFF made no difference at d=120/220 cone/sphere, so STRIP_N/SLOPE (`:2762-2763`, tuned to torus n 15-42 vs sphere n<=9) is only proven at d=50.
F4 (follow-up) Thin or single-fixture guards: `nostraight` margin 0.01 mm (0.127 ship vs 0.135 bar vs 0.145 mutant), disclosed; `nocoh` trips only on test cone/hatch and `nocohstrip` only on create torus/hatch (each guard rests on one cell); STRIP is exercised by torus only.
F5 (minor, code) Dead loop `for (let rr = 1; rr <= 1; rr += 1)` at `surface-fill.js:7535`. Nine `MK_TICK_RIM_*_OFF` constants (`:2754-2770`) are mutation switches shipped in production source (documented for two of them only; `nogrow`'s GROW_OFF is now unused by any asserted test).
F6 (minor, comments) `:2741` says "<= 2 row pitches", code uses 2.05 (`:7522`). `:13293` leaves the stale "T2-8b-3/3c (BC-E) deferred span-end" comment above the new `runExtensions` block, whose comment is mis-indented (`:13294`). The comment at `:7532` is one 400-character line.
F7 (minor, test) `package-lock.json` has a libc-only diff in the worktree; keep it out of the merge.

## Confirmed true (not re-litigated)
Site records captured before the pass; two-phase plan/apply; no rim candidates for non-tick laws (queue only filled when `law.shape === 'tick'`); contrast mutation now removes `runExtensions();` and returns the pre-T2-8b hash on 12/12 (suite green).
