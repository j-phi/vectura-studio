# W-10d-2 evidence — reading notes

Added at integration round 2 (2026-09-10) per MERGE CHECKLIST item 12.

## `leaf-scene/*-exported-state.json` is NOT a single-key diff

Do not read a wide blast radius into a `diff` of the two exported-state files. Alongside the one
key the unit actually changes (the migrated `toneLaw`), the two exports differ in **session-random
values that carry no meaning**: layer / object `id`s are freshly generated UUIDs on every run, and
seeds are re-drawn per session. Compare the `toneLaw` key (and its siblings) directly; a whole-file
diff will show dozens of lines that are pure session noise.

The same caveat applies to every evidence `report.json` in this audit that records a `layerId` — a
re-run reproduces the PNGs byte-for-byte while every `layerId` and `generatedAt` changes (verified
at integration r2 by re-running `scripts/audit/w30d-shadows-evidence.js`: 14/14 PNGs byte-identical,
report identical except `layerId`s and `generatedAt`).

## Commit-body correction

`79b626d2`'s commit body states the pre-fix `originSpiral` wedge render is **910** points. That is a
typo: the correct figure is **5851** points. Recorded here and in the integration merge commit for
`3d-scene/fill-audit-2`, because a merge (rather than a squash) cannot rewrite the lane commit body.
