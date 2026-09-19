STATUS: VERIFIED

# T3c-onset LIGHT VERIFY round 2 — round 5, lane fill-audit-a5

**Role:** verifier (read-only). **Unit:** `T3c-onset` follow-up (tests-only). **Worktree (read-only):**
`.claude/worktrees/fill-audit-a5` at `b1ab9ebd`, base `00e9bc7d` (this unit's own prior sha), grandbase
`6ebc76e8`. **Follow-up report reviewed:** `docs/3d-audit/lane-reports/T3c-onset-impl-2.md`, addressing
`T3c-onset-verify.md`'s NOT-VERIFIED finding (git-history dependency broke under CI's real shallow clone).
**Scratch:** `/private/tmp/claude-501/scratch-T3c-verify-2/{gitclone,shallow}` (both deleted after use —
worktree never edited/stashed).

## File change since round 1

Only `tests/unit/scene3d-mkdashramp-onset.test.js` touched (`git show b1ab9ebd --stat`: 1 file,
53 insertions / 30 deletions). Read the full diff (`git diff 00e9bc7d b1ab9ebd`): removed
`const { execFileSync } = require('child_process')`, removed `T3C_BASE_SHA`/`getPreT3cSource()` (the
`git show <sha>` call), added `getT3cNeutralizedSource()` (reads the CURRENT on-disk `surface-fill.js`
via `fs.readFileSync` and reverts only T3c's own `eachDrawn` gate via the same needle-checked
string-replacement helper the M1/M2/M3 mutants already use). Every `describe`/`test`/`expect` body is
byte-identical to `00e9bc7d` — confirmed by reading the diff, not just trusting the commit message.
Both sibling files (`scene3d-mkdashramp-{discrete,single-pass}.test.js`) are untouched since `00e9bc7d`
(`git diff 00e9bc7d b1ab9ebd --stat -- <both>` empty) — matches the report and the orchestrator's own
scoping instruction (a separate CI-5 unit owns the rest of the ~12-file systemic pattern).

## 1. RED still provable (now via mutation, not a history read) — MEASURED

No `execFileSync`, no `child_process`, no `git`, no `/tmp` or `/private/tmp` path, and no `.skip`/`.only`/
`.todo` anywhere in the file — confirmed by grep against the full file text (only 2 hits, both inside
comment prose describing the REMOVED old mechanism, not live code). Also grepped
`tests/helpers/load-vectura-runtime.js` (the only helper this file imports): its one "git show" mention
is illustrative comment prose in a docstring; the helper itself only uses `fs`, `path`, `vm` — no
`child_process`, no tmp paths, no skip logic.

In a full scratch `git clone --local` of the worktree at `b1ab9ebd` (node_modules symlinked): ran the file
in the foreground, `--pool=forks --poolOptions.forks.singleFork=true`: **GREEN, 27/27, 10.4s**, numbers
matching the report and round-1's own measurement exactly (sphere/addLayer d=31 ratio 0.564317, d=32
ratio EXACTLY 1.0, md5-identical; same for torus/addLayer 0.561778, sphere/create 0.546621, torus/create
0.553640).

To prove the assertions are non-vacuous (would RED without the fix), wrote a standalone probe script
(`probe-mutation-2.js`, mirrors `getT3cNeutralizedSource()`'s own technique independently, bypassing the
test file's `beforeAll` entirely) and ran it first against the **unmutated** real-fix source: reproduced
the exact same numbers (sphere/torus d=31 0.564317/0.561778, d=32 exactly 1.0/true) — confirms my probe
matches the file's own logic before using it to test mutations.

## 2. The mutation trips — MEASURED, independently reproduced (external to the file's own harness)

Directly edited `src/core/scene3d/surface-fill.js` on disk in the scratch clone (M1: `Math.round` →
`Math.floor` at line 2535, the same edit as round 1), then reran the standalone probe (not the file's
internal M1/M2/M3 builders, which read from the same now-mutated disk and would self-collide):

```
sphere d=31: md5-identical-to-uncapped-baseline=false  ratio=0.564317   (unchanged from real fix)
sphere d=32: md5-identical-to-uncapped-baseline=false  ratio=0.564317   (real fix: true / 1.000000 — DIVERGES under M1)
torus  d=31: md5-identical-to-uncapped-baseline=false  ratio=0.561778   (unchanged from real fix)
torus  d=32: md5-identical-to-uncapped-baseline=false  ratio=0.561778   (real fix: true / 1.000000 — DIVERGES under M1)
```

Under M1, d=32 stays capped (ratio equals d=31's own ratio, not 1.0) — O17's "d=32 inactive" clause would
go RED exactly as claimed, confirmed independently of the file's own internal mutation-kill mechanism.
Restored the file (`git diff --stat` empty afterward) and reran the full test: GREEN, 27/27, confirming
restoration.

Also ran the file's own committed M1/M2/M3 MUTATION-KILL block and O18 floor-disclosure block as shipped
(part of the full-suite run below) — all pass, matching the report's claims (each mutation trips O17's
d=32 clause; none moves the d=31 floor, an honestly-disclosed unguarded gap carried over unchanged from
round 1).

**Full guard suite, foreground, one run, matching every number from round 1 exactly:**

| file | result |
|---|---|
| `scene3d-mkdashramp-onset.test.js` | 27/27 |
| `scene3d-mkdashramp-discrete.test.js` | 22/22 |
| `scene3d-mkdashramp-single-pass.test.js` | 20/20 |
| `scene3d-mkdashramp-low-end.test.js` | 13/13 |
| `scene3d-mkdashramp-dark-end.test.js` | 4/4 |
| `scene3d-mark-laws-draw.test.js` | 30/30 |
| **Total** | **116/116** |

## 3. `## Bars changed` accuracy — ACCURATE

`git diff 00e9bc7d b1ab9ebd -- tests/unit/scene3d-mkdashramp-onset.test.js`: every changed line is either
a docstring/comment, the removed `execFileSync`/`T3C_BASE_SHA`/`getPreT3cSource` block, or the new
`getT3cNeutralizedSource` helper + the one `beforeAll` line pointing `scriptOverrides` at it. Zero
`describe`/`test`/`expect`/threshold/tolerance literal touched — verified by reading the full diff, not
sampling. "Bars changed: None" is accurate.

## Plus check — the specific new criteria from the orchestrator

- **Passes from a real `git clone --depth 1 file://…` of `3d-scene/fill-audit-a5`:** reproduced exactly as
  asked. `git clone --depth 1 --branch 3d-scene/fill-audit-a5 file:///…/fill-audit-a5 shallow/` → HEAD
  `b1ab9eb`. First confirmed the clone genuinely lacks history: `git cat-file -t 75777240` inside it →
  `fatal: Not a valid object name 75777240` (the exact SHA that broke round 1). Then, `node_modules`
  symlinked, ran the file foreground: **GREEN, 27/27, 9.68s** — no git-show error, no history dependency
  triggered. This is the literal CI failure mode from `T3c-onset-verify.md` §3, now closed for this file.
- **No git/child_process/tmp-path/skip dependency, direct or via helper:** confirmed by grep (file +
  its one helper import) — see §1. None found in live code.

## Verdict

**VERIFIED.** All three original checks hold under independent reproduction (numbers match exactly,
mutation trips confirmed both via the file's own committed mechanism and via an external standalone
probe, `## Bars changed: None` is accurate). The specific new criteria are also satisfied: the file
passes in a real `--depth 1` clone of the lane branch (the actual CI failure mode from round 1, now
closed), and contains no git/child_process/tmp-path/skip dependency in any form, direct or via its one
helper import. Carried-over, already-disclosed, non-blocking items: (1) O18's floor-side is still an
honestly-disclosed unguarded gap, unchanged from round 1 — not this follow-up's scope. (2) The same
`git show <fixed-sha>` pattern remains live in ~11 other files project-wide, including this unit's own two
siblings (`scene3d-mkdashramp-{discrete,single-pass}.test.js`) and is confirmed (round 1) to already be
breaking main's CI independent of this unit — the report and the orchestrator both correctly scope that
to a separate CI-5-class sweep, not this unit.

REPORT docs/3d-audit/lane-reports/T3c-onset-verify-2.md — VERIFIED — git-show dependency gone; 27/27 green in a real `--depth 1` clone, mutations trip.
