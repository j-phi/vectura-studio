# Agentic Harness Strategy

This document defines the default human+agent development harness for Vectura Studio and provides a reusable template for future projects.

## 1) Purpose and Outcomes

Goals:
- Make development interactions faster, clearer, and more reliable.
- Reduce rework by requiring explicit scope, acceptance criteria, and evidence.
- Keep process guidance synchronized across markdown control documents.
- Provide a portable harness that can be copied to future repositories.

Expected outcomes:
- Contributors can find workflow rules in under two minutes.
- PRs changing workflow/tooling policies include harness updates or an explicit rationale.
- Test and documentation expectations are consistent across docs and PR review.

## 2) Source-of-Truth Hierarchy

Use this precedence order when instructions conflict:
1. System/developer/tool runtime constraints.
2. Repository-level `AGENTS.md`.
3. Task-specific user instructions.
4. Domain docs (`README.md`, `docs/testing.md`, feature docs, requirement docs).

Conflict rule:
- Follow the highest-precedence instruction.
- If lower-precedence docs become stale, update them in the same PR as part of doc synchronization.
- If conflicts cannot be resolved safely, stop and request clarification.

## 3) Task Lifecycle Protocol

### Intake format
Every request should define:
- Goal and desired outcome.
- Scope boundaries (in/out).
- Acceptance criteria.
- Validation expectations (commands/manual checks).
- Delivery constraints (deadline, compatibility, rollback limits).

### Discovery-first workflow
1. Inspect current implementation and docs before proposing changes.
2. Confirm assumptions with direct evidence from files/tests/config.
3. Only ask questions that cannot be answered from repository context.

### Plan completeness criteria
A plan is implementation-ready only when it covers:
- Approach and affected files.
- Interfaces/contracts that change.
- Failure modes and edge cases.
- Test matrix and acceptance checks.
- Documentation updates required by the doc-sync matrix.

### Implementation evidence requirements
For each change, record:
- Commands executed.
- Pass/fail status.
- Any skipped checks and why.
- Residual risks or follow-up items.

### Closeout report template
Use this output structure in PR descriptions or handoff notes:

```md
## Summary
- What changed and why.

## Validation
- Command: <command> -> PASS/FAIL
- Manual check: <scenario> -> PASS/FAIL

## Documentation
- Updated: <paths>
- Not updated: <paths + rationale>

## Risks / Follow-ups
- <item>
```

## 4) Execution Standards

- Break work into small, bounded tasks with clear completion criteria.
- Define acceptance criteria before implementation.
- Prefer deterministic checks over ad-hoc validation.
- Keep commits/PRs reviewable and evidence-backed.
- Default to non-destructive operations; escalate destructive actions explicitly.

Artifact reporting standard:
- `commands_run`: exact commands used for verification.
- `results`: concise pass/fail outcome.
- `residual_risk`: explicit note of any unverified surfaces.

## 5) Testing Matrix (Minimum Required Checks)

| Change class | Minimum checks | Additional checks when applicable |
| --- | --- | --- |
| Docs-only (no behavior change) | Link/path sanity review | None |
| Core logic / algorithm behavior | `npm run test:unit` | `npm run test:integration`, `npm run test:visual` |
| Export/serialization/security surfaces | `npm run test:unit` + `npm run test:integration` | `npm run test:e2e` |
| UI interaction behavior | `npm run test:integration` | `npm run test:e2e`, targeted manual UX pass |
| Rendering output or baselines | `npm run test:visual` | `npm run test:perf` for heavy-path changes |
| CI-gating confidence pass | `npm run test:ci` | Add visual/perf runs before release-critical merges |

Reference:
- Test policies and command details live in `docs/testing.md`.

## 6) Documentation Synchronization Matrix

| Change category | Required documentation updates |
| --- | --- |
| Workflow/tooling/test policy changes | `docs/agentic-harness-strategy.md`, `AGENTS.md`, and any impacted sections of `README.md`/`docs/testing.md` |
| PR governance/process changes | `.github/pull_request_template.md` plus harness doc if policy changed |
| UI behavior / shortcuts / help changes | `README.md`, in-app help guide, in-app shortcut list, and `index.html` version increment |
| Feature capability changes | `README.md` relevant sections and any feature-specific docs |
| Deferred release-hardening ideas | Add/update entry in `docs/pre-release-hardening-log.md` |
| Any repository change | Ensure `index.html` version string is incremented (`V.x.y.z`) per `AGENTS.md` |

No-silent-drift rule:
- If a workflow-affecting change lands without corresponding doc updates, treat it as incomplete.

## 7) Prompting and Agent Collaboration Patterns (Codex Adapter)

Preferred request format:

```md
Goal:
Scope:
Acceptance Criteria:
Validation:
Constraints:
```

Collaboration defaults:
- Ask for a plan when scope is ambiguous or large.
- Use discovery before coding.
- Keep clarification questions limited to high-impact unknowns.
- Return evidence-first summaries: changes, tests, risks.
- Respect safety boundaries for destructive operations and restricted network/tool actions.

## 8) Legacy Doc Status Taxonomy

Status labels:
- `authoritative`: current source of truth for active behavior/policy.
- `operational`: active runbook/process reference.
- `backlog`: idea bank; not strict implementation contract.
- `archive-candidate`: useful history, but should not drive active decisions without reconfirmation.

Current classification:

| Document | Status | Owner expectation | Review cadence |
| --- | --- | --- | --- |
| `README.md` | `authoritative` | Feature owners + PR authors | Every feature/change PR |
| `docs/testing.md` | `operational` | Test/tooling maintainers + PR authors | Any test/CI workflow change |
| `plans.md` | `backlog` | Product/feature planning owner | Monthly or milestone planning |
| `requirements.md` | `backlog` | Product/architecture owner | Monthly or when revived |
| `docs/pre-release-hardening-log.md` | `operational` | Release/hardening owner + PR authors | On each deferred hardening item |

## 9) Future Project Bootstrap (Reusable Starter)

For new repos, copy this harness with these minimum hooks:
1. Add `docs/agentic-harness-strategy.md`.
2. Add/update `AGENTS.md` with mandatory harness-maintenance policy.
3. Add `.github/pull_request_template.md` with harness review checkbox.
4. Define a testing matrix tied to available scripts/CI.
5. Define a documentation synchronization matrix for that repo.
6. Establish doc status taxonomy and initial classifications.
7. Add README pointer to workflow docs for discoverability.

## 10) Governance

Update triggers (must update this document when changed):
- Task intake expectations.
- Planning/execution/reporting standards.
- Test policy thresholds or required commands.
- Documentation synchronization rules.
- Agent safety/approval boundaries.
- PR checklist enforcement rules.

PR coupling:
- PR template requires explicit harness review/update acknowledgment.

No silent drift:
- Workflow changes without harness/doc sync should be flagged in review and treated as incomplete.

## 11) Public Process Contracts

This harness introduces four explicit process contracts:
1. Harness Source-of-Truth Contract: `docs/agentic-harness-strategy.md` defines default agent workflow policy.
2. Documentation Contract: change-to-doc mapping matrix defines mandatory doc updates.
3. Governance Contract: PR checklist must assert harness review/update status.
4. Status Taxonomy Contract: shared labels reduce ambiguity across markdown docs.

## 12) Rollout Validation Scenario (Checklist Simulation)

Sample PR scenario:
- Change: update CI test command and Playwright policy.
- Expected required docs:
  - `docs/agentic-harness-strategy.md` (workflow/test policy impact)
  - `AGENTS.md` or `docs/testing.md` where command expectations changed
  - `.github/pull_request_template.md` only if checklist policy changed

Checklist pass condition:
- PR explicitly confirms harness doc review.
- If harness doc unchanged, PR provides rationale in checklist.
