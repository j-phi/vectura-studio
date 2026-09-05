# Shared brief — 3D Scene fill-audit fix implementers

MAIN = /Users/jayphi/Documents/github/vectura-studio (main worktree, HEAD d5af9e30, v1.3.98). NEVER edit files in MAIN except
`docs/3d-audit/fill-audit/after/<W-id>/` (your evidence output). Your code lives ONLY in the worktree named in your unit brief.
Always use absolute paths. Never `cd` outside your worktree except to run the capture script from MAIN.

## Inputs
- Audit findings: MAIN/docs/3d-audit/fill-audit/findings.json and worklist.json (your item = the object whose `id` matches).
  index.html `<section id="findings">` has the human-readable tables; the before images are under MAIN/docs/3d-audit/fill-audit/shots/.
- Handoff rules: MAIN/docs/stroke-fill-handoff.md — "Read this first", "DEAD", "Measured, NOT defects", "Process rules". Obey them.
- CLAUDE.md in your worktree: "Testing & Pre-Commit Validation", "Commit Hygiene", "Where a default actually comes from".

## Method (RGR, non-negotiable)
1. Reproduce the defect numerically first (your item's `test` names the oracle).
2. Write the test FIRST; run it; it must be RED on your worktree before you change source. Paste the red line in your notes.
3. Fix. Test GREEN. Do not widen tolerances, delete assertions, or add `.skip`. If a stale assertion elsewhere breaks
   because the product contract changed deliberately, update it and say why in the commit message.
4. Run: your new test file(s) + every test file that names the functions/laws you touched (grep tests/ for them) + `npm run test:integration`.
   Never run `tests/unit/scene3d-tone-law-dispatch.test.js` alone unless you touched dispatch. `npm run test:unit` once before commit.
5. Byte-identity: styles/Types you did NOT touch must render byte-identically. `tests/unit/scene3d-hlr-spatial-index-identity.test.js` must stay green.
   If a fingerprint guard for something you DID intentionally change goes red, update it with a justification in the commit body, not silently.

## Evidence (before/after, mandatory)
Re-shoot exactly the `before_images` your work item lists, from YOUR worktree's code, using MAIN's capture script:
  node MAIN/scripts/audit/scene3d-capture.js --tier B --root <your worktree> --port <your port> --only '<regex over primitive__mapper__style__density__angle>' --out MAIN/docs/3d-audit/fill-audit/after/<W-id>
  (use --tier A for default-style Tier-A shots). Then LOOK at the after images with the Read tool and compare to the before images.
Write MAIN/docs/3d-audit/fill-audit/after/<W-id>/report.json:
  {"id","title","branch","commit","before":[relative paths under shots/],"after":[relative paths under after/<W-id>/shots/],
   "notes":"≤8 sentences: root cause, fix, what changed visually, numbers before/after","tests":{"red":"<line>","green":"<line>","suites":"<counts>"},
   "byte_identical_pairs":[any before/after pairs that are byte-identical — that means the fix did nothing there; explain]}
Copy the same report.json into your worktree at docs/3d-audit/fill-audit-fixes/<W-id>.json and commit it with the code.

## Commit
ONE commit per work item on your branch. Message: `fix(scene3d): <title> (<W-id>)` + body with root cause, red-proof line, suites.
Do NOT bump package.json (hook cannot fire from a worktree; orchestrator bumps at merge). Do NOT push. Do NOT merge.

## Stop and report if
- the fix needs a file your unit brief lists as NOT yours; - the red test cannot be made red (the defect does not reproduce);
- byte-identity of untouched styles breaks and you cannot explain it; - a fix removes geometry and the coverage oracle scores it as a failure
  (handoff finding 2 — check the oracle before trusting it); - after 2 genuine attempts the DONE criterion is not met.
Then commit what is sound (test + notes, no half-fix) and report.

## Final report to orchestrator: ≤ 18 lines
commit hash, root cause (2 sentences), red→green lines, suites + counts, after-image paths you looked at and what changed,
byte-identical pairs (if any), what the adversarial reviewer should attack first.
