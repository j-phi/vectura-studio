STATUS: ACCEPT-WITH-FOLLOWUPS

# Review — Unit D polish: phase-lock inside-footprint shadow hatch to outside family

**Lane:** handoff-c · **Worktree:** `.claude/worktrees/handoff-c` (read-only; verified clean before
and after review, `git status --short -- . ':!graphify-out'` empty both times).
**Range reviewed:** `d86cbf8d..8e9b0991`. **Implementer report:** `UnitD-phase-impl.md`.
**Method:** `git archive d86cbf8d` / `git archive HEAD` into scratch exports
(`/private/tmp/.../scratchpad/unitd-before`, `unitd-after`), `.git` symlinked to main's real `.git`
(sha reachable there) so the test file's own `git show <sha>:<path>` RED-switch works without
touching the worktree; `node_modules` symlinked from main.

## 1. Diff scope

`git diff --stat d86cbf8d..HEAD -- . ':!graphify-out'`: **3 files** —
`src/core/scene3d/shadows.js` (+66/-6), `tests/unit/scene3d-shadow-receive.test.js` (+185),
`scripts/unitd-phase-evidence.js` (new, +211). `hlr.js`, `params.js`, `scene3d.js`, `mappers.js`
**untouched** — confirmed by `git diff --stat`, not just report claims. Correct lane (handoff-c owns
`hlr.js`/`shadows.js`/pen-fill/fill-boolean).

Read the actual `shadows.js` diff: the fix is a module-level `WeakMap` (`outerRingGridMemo`), written
whenever `hatchRingsEvenOdd` is called with `rings.length > 1` (angle/spacing/anchor per ring by
object identity), read whenever a later `rings.length === 1` call's sole ring is a recognized object at
the same angle — in which case the inside scan continues the outside call's raw anchor at an integer
submultiple of its pitch. The untouched fallback path is **not quite byte-for-byte** as claimed: the
inner loop variable was renamed `k`→`k2` (cosmetic only — the `if`/`else` blocks don't actually share
scope, so the rename was unnecessary but harmless; logic and numeric behavior are identical). Minor
documentation inaccuracy, not a functional issue.

## 2. RED/GREEN — independently reproduced

- **GREEN**, current tree: `npx vitest run tests/unit/scene3d-shadow-receive.test.js` → **17/17**.
- **RED**, pinned to `d86cbf8d` via `VECTURA_PRE_UNITD_PHASE=1 npx vitest run … -t "Unit D polish"`:
  fails with `expected 0.19288502900715768 to be less than or equal to 0.05` — matches the report's
  number exactly. Confirms phase offset before ≈0.1929× pitch, bar ≤0.05×; density ≥1.4×; angle
  mismatch ≤1° — all reproduced independently, not taken on faith.

## 3. Flag-OFF byte-identity — verified directly, not just structurally

Wrote a standalone script (both scratch exports) driving the REAL `AlgorithmRegistry.scene3d.generate`
with `shadowReceiveOnObjects: false` across **6 cells**: directional/ladder, directional/crosshatch
(fell back to ladder — unrelated pre-existing toneLaw-id warning), area light, point light, spot light
(perspective camera), and a box-receiver + angled-caster case. **All 6 md5s identical between
`d86cbf8d` and `HEAD`.** This is stronger than the report's structural argument (`buildFaceFootprint`
returns null when the flag is off) — direct proof, not inference. No REJECT trigger.

## 4. Non-directional light types — phase-lock holds, but flags a pre-existing gap

Built a bespoke area-light + box-caster + plane-receiver scene, flag ON. Phase-lock still measured
`worstPhase/outerStep ≈ 7.8e-15` (≈0), `angleDelta=0`, `densityRatio=2.0` (≥1.4). **The mechanism is
light-type-agnostic** — it operates purely on the ring objects/angle/spacing `hatchRingsEvenOdd`
receives, regardless of what upstream code derived them from.

However, tracing upstream (`src/core/algorithms/scene3d.js:651-652`, `src/core/scene3d/regions.js`
`lightWorldDir`) shows `shadowReceiveOn`'s entire direction computation reads `light.azimuth`/
`light.elevation` off `p.lights[0]` **unconditionally, ignoring `light.type`** — an area/point/spot
light with no azimuth/elevation field silently falls back to the DEFAULT direction (135°/45°), not its
real position. So the shadow *placement* for non-directional lights is already wrong/degenerate
pre-existing behavior (matches the report's own carried-forward follow-up: "point/spot receive not
integration-covered"). The polish's phase-lock is correct and orthogonal to this — it does not make it
worse, and does not need to fix it (out of scope) — but it is not a new problem for this unit to own.

## 5. Two-face box receiver (different faces, same light)

Built a box receiver + caster positioned so the shadow spans the box's top face and front face across
their shared edge, flag ON. Instrumented `hatchRingsEvenOdd` to tag calls by ring-set centroid: **2
outer calls, 2 inner calls**, each inner call's nearest-centroid outer match phase-locks independently
(`worstPhase/outerStep` ≈ 2.7e-16 and 1.8e-14, both ≈0; density ratios 3.0× and 1.0×). No cross-face
phase bleed — the WeakMap keys are per-face `footprintPolys` array objects, so this is structurally
guaranteed, and I confirmed it empirically rather than taking the structure's word for it. (The 1.0×
density ratio on the second face is a legitimate tone-law outcome for that face's own lighting angle,
not a defect.)

## 6. Mutation testing

(a) **Literal revert** — the RED-proof-pin test already does this (pins `shadows.js` to `d86cbf8d`) and
fails as shown in §2.
(b) **Identity-breaking mutation** (the coordinator's specific concern, see §7) — inserted
`footprintPolys.map((fp) => fp.slice())` at the outside-call site in `scene3d.js` (scratch export only,
restored after). Re-ran the Unit D polish test: it **failed**, reproducing the exact same
`0.19288502900715768` phase ratio as the original bug. Restored the file, confirmed `diff` clean, reran
17/17 green. Both mutations are caught.

## 7. Coordinator's ledger flags — addressed

1. **WeakMap keyed by ring object identity — "if a caller ever copies the array, does it silently
   revert with no test failing?"** Constructed exactly this case (§6b): cloned `footprintPolys`
   elements before the outside `.concat` call only, breaking the identity link the memo depends on.
   Result: the SAME Unit D polish test (and the RED-proof pin) **fails**, at the identical phase ratio
   as the pre-fix baseline — because the test drives the real `generate()` pipeline and measures the
   emitted geometry's actual phase, not the WeakMap's internal state. It is an outcome-based regression
   test, not a snapshot of the mechanism, so this specific fragility **is caught**. No test change or
   re-keying (e.g. carrying phase/angle on the footprint record itself) is required for coverage —
   though carrying the phase on the record would still be a more robust design than identity-keying if a
   future refactor is planned; recording as a non-blocking suggestion, not a defect.
2. **Order-dependent, never-cleared module state** — confirmed: the memo assumes the outer call always
   precedes inner calls (true by construction in the one call site, `scene3d.js:1767-1782`, forEach
   after the outer call) and is never cleared. A stale anchor from an EARLIER render could theoretically
   leak into a later one only if a footprint poly array from a prior `generate()` call were still alive
   and reused by reference in a new call with a different angle/spacing — `buildFaceFootprint` builds
   fresh arrays every call (confirmed by reading `scene3d.js:1756` — `buildFaceFootprint(...)` returns a
   new value each invocation), so this is theoretical, not reachable through any current call site. Logged,
   not blocking.
3. **"Broken dash" reframing** — confirmed accurate: looked at `before-crop-mono.png` /
   `after-crop-mono.png` directly (§8). The report's own caveat (screenshot-vs-SVG alias) is honestly
   disclosed and doesn't affect the numeric proof.
4. **Evidence script mutates `shadows.js` on disk** — read `scripts/unitd-phase-evidence.js` in full.
   Restoration is double-guarded: an inner `finally` (line 171-174) restores immediately after the
   BEFORE render, and an outer `finally` (line 198-210) unconditionally re-writes and verifies the fixed
   content again before exit, regardless of what threw. Confirmed empirically: worktree's on-disk
   `shadows.js` currently contains the fix (`grep -c outerRingGridMemo` → 4). The one residual gap
   (inherent to any on-disk-swap technique, not specific to this script): a hard process kill
   (SIGKILL) between the write-pre-fix and the restore would leave the buggy file on disk with no
   `finally` able to run. Worth a one-line note in the script's header; not a blocker.
5. **Gallery coverage gap** — confirmed: no manifest cell exercises `shadowReceiveOnObjects` (grepped
   `docs/3d-audit/fill-audit/manifest*.jsonl` — the flag never appears), so the bespoke-scene evidence
   is the only option and is correctly labeled as such.

## 8. Evidence — looked at the PNGs

`before-crop-mono.png` vs `after-crop-mono.png` (single ink color, what a user actually sees): BEFORE
shows a visibly clumpy, uneven scatter inside the footprint — tight line-pairs next to noticeably wider
gaps, no consistent rhythm. AFTER shows a clean, evenly-spaced denser comb, continuous with the
surrounding outer rulings' own rhythm. This matches the claimed "continuous denser texture, not broken
dashes" bar. `before-crop.png` / `after-crop.png` (white=outer, green=inner diagnostic recolor) are
consistent with this — green rulings in AFTER sit at exact fractional divisions of the white grid; in
BEFORE the green rulings' relationship to the white grid drifts across the footprint.

## 9. Guards, one at a time (own re-run, not copied from the report)

- `tests/unit/scene3d-shadow-receive.test.js` — **17/17**
- `tests/unit/scene3d-shadow-overlap.test.js` (Unit C) — **4/4**
- `tests/unit/scene3d-hlr-spatial-index-identity.test.js` — **6/6**
- `tests/unit/scene3d-shadows.test.js` — **18/18**
- `tests/integration/scene3d-fill-style-picker.test.js` — **126/126**
- A3's ribbon-suite siblings: `scene3d-ribbon-c3-rule5.test.js` **6/6**,
  `scene3d-ribbon-outline-fill-seam.test.js` + `scene3d-ribbon-wall-coverage.test.js` — **40/40**
  combined (4+36), matching the report's claim. (Did not re-run the remaining ~13 of the "17 more
  shadow/tone-law files" individually — the five above cover every file this fix could plausibly touch
  by call graph; the rest is lower-risk, test-file-untouched surface.)

All match the implementer's reported counts. No widened tolerance, no re-pinned fingerprint, no
vacuous-pass pattern found.

## Bars changed

None. Every new assertion (`≤0.05×` phase, `≥1.4×` density, `≤1°` angle) is a **new** test in a **new**
test file section — no existing pinned value, tolerance, or fingerprint in any pre-existing test was
altered. Confirmed by re-reading the diff: both new describe blocks are pure additions at the end of the
file; the one line-level change inside an existing describe (`shadows.js`'s `k`→`k2` rename) is not a
bar, it's a variable name.

## Verdict: ACCEPT-WITH-FOLLOWUPS

The fix is correctly scoped, in the right lane, RED/GREEN independently reproduced, flag-OFF
byte-identity independently proven (not just argued) across 6 cells including non-directional lights,
the specific "silent identity-copy regression" concern was constructed and shown to be caught by the
existing test, and the two-face box case phase-locks independently per face. The evidence PNGs support
the claimed "continuous texture vs broken dashes" improvement.

Follow-ups (non-blocking, none require redoing this unit):
1. Non-directional lights (area/point/spot) drive shadow-receive direction from `azimuth`/`elevation`
   regardless of `light.type`, defaulting to 135°/45° when absent — pre-existing, not introduced or
   worsened here, but should get its own W-id before anyone ships a point/spot shadow-receive scene.
2. Consider carrying phase/angle on the footprint record itself instead of (or alongside) identity-keyed
   WeakMap lookup, for robustness against a future defensive-copy refactor — not required now because
   the outcome-based test already catches that regression (§6b, §7.1).
3. `scripts/unitd-phase-evidence.js`'s on-disk swap-and-restore has no protection against a hard process
   kill mid-swap; add a one-line header warning.
4. Minor doc fix: the code comment/report's "byte-for-byte untouched" claim for the original branch
   should say "unchanged apart from a cosmetic loop-variable rename."
