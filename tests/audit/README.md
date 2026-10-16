# Scene3D proof audits

These files preserve exhaustive rendering, alias-history, and mutation proofs that are too costly for routine unit/visual lanes. The impacted/audit selector owns invoking them when Scene3D tone-law, mkTick, baseline, or audit-fixture files change; routine tests remain in `tests/unit/` and `tests/visual/` so selecting them does not execute audit `beforeAll` hooks. The former `tests/audit/unit/` copies were removed so every proof has one collected copy.

| Routine guard | Preserved proof | Distinct failure mechanism |
| --- | --- | --- |
| `unit/scene3d-tone-law-collapse.test.js` | `audit/scene3d-tone-law-collapse-a-combo.test.js`, `-b-single`, `-c-sweeps`, `-c-sweeps-u6`, `-c-sweeps-u8`, `-c-sweeps-u8-fresh`, `-d-sweep-u1-u5` (same prefix, `.test.js`) | All fold-cluster render equivalence, multi-primitive/density sweeps, caveat history, resolver mutation evidence, and synthetic-alias migration behavior. |
| `unit/scene3d-tone-law-dispatch.test.js` | `audit/scene3d-tone-law-dispatch.test.js`, `-dispatch-wave`, `-dispatch-mono`, `audit/scene3d-tone-law-dispatch-mutant.test.js` | Full law roster, every law's dispatch distinction, crosshatch mono laws, and an executable module-default dispatch mutant. Audit renders each law once and reuses scalar summaries. |
| `unit/scene3d-mktick-spacing-tone.test.js` | `audit/scene3d-mktick-spacing-tone.test.js`, `audit/scene3d-mktick-spacing-tone-bce{,-chain,-crumbs,-rim}.test.js` | Full density/primitive/rig matrix and named mutants for spacing, contacts, clipping, coverage, wedges, continuation, rims, and apex behavior. Mutant runtimes are constructed and cleaned up serially; tests compute their own immutable result summaries instead of reading sibling-test state, and raster/geometry evidence is kept only for direct consumers. |
| `visual/scene3d-tone-baseline.test.js` | Same file; no proof moved | Each scenario still runs three fresh times for deterministic summaries and mutation checks run fresh source; immutable summaries are reused across assertions within that fixture. |

Audit tests use the same `tests/helpers/` depth convention as unit tests. Run them explicitly through the queued npm Vitest entrypoint when the impacted/audit lane selects them.
