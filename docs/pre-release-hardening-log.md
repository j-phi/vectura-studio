# Pre-Release Hardening Log

This log tracks hardening ideas that should be completed before the final public release, but are intentionally deferred during beta to avoid slowing development.

- Purpose: track release hardening work, not beta delivery work.
- Enforcement: no CI gate and no release blocker behavior during beta.
- Ownership: human-maintained process log.

## Item Schema

Each entry must include:

- `id` (format: `PRH-001`, `PRH-002`, ...)
- `idea`
- `why_pre_release_only`
- `beta_risk_likelihood` (`low`, `medium`, `high`)
- `impact_if_missed_at_release`
- `proposed_change`
- `verification_before_final_release`
- `status` (`logged`, `selected`, `done`, `dropped`)
- `links` (PRs, issues, test files)

## Current Items

| id | idea | why_pre_release_only | beta_risk_likelihood | impact_if_missed_at_release | proposed_change | verification_before_final_release | status | links |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PRH-001 | Add E2E export->import bounds verification for hard-cropped margin exports. | Low probability during beta and adds test maintenance complexity now; primarily valuable as final hardening. | low | Margin overflow regressions could slip into public release and only appear in downstream export workflows. | Add a Playwright E2E that exports with `Crop Exports to Margin`, re-imports output, and asserts all drawable coordinates stay within configured margins. | E2E test passes in CI/local before final release and fails when margin overflow is reintroduced. | logged | `tests/integration/export-hard-crop.test.js` (current integration coverage baseline) |

## Operating Model

1. During beta, log applicable ideas as `logged` and continue development unless explicitly requested otherwise.
2. Before final public release, review all `PRH-*` items, mark chosen items as `selected`, implement them, then mark them `done`.
3. After release, carry unfinished items forward or mark them `dropped` with rationale.
