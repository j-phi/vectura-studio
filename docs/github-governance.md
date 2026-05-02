# GitHub Governance Setup

This document captures the GitHub-side settings that should be enabled to match the repository workflow documented in `AGENTS.md`, `README.md`, `plans.md`, and `docs/agentic-harness-strategy.md`.

## 1. Branch Protection / Rulesets

Apply a ruleset to `main` with:
- Require pull requests before merging.
- Require at least 1 approving review.
- Dismiss stale approvals when new commits are pushed.
- Require status checks to pass before merging.
- Require conversation resolution before merging.
- Block force pushes and deletions.
- Enable merge queue once the required checks are stable.

Recommended required checks:
- `unit`
- `integration`
- `e2e-smoke`
- `visual`
- `perf`
- any future workflow checks added for docs governance, dependency review, or security scanning

## 2. CODEOWNERS

The repository includes `.github/CODEOWNERS`. Keep the owner map current as collaborators are added so review routing and branch protection remain accurate.

## 3. GitHub Project

Use a Projects (v2) board with at least these fields:
- `Status`: Inbox / Ready / In Progress / In Review / Done
- `Priority`: P0 / P1 / P2 / P3
- `Type`: Bug / Feature / Docs / Workflow / Noise Rack / Research
- `Area`: UI / Rendering / Algorithms / Noise Rack / Export / Docs / CI
- `Algorithm`: rings / topo / wavetable / spiral / rainfall / flowfield / grid / phylla / petalis / n/a
- `Release`: Unreleased / next version tag

Recommended views:
- Board by `Status`
- Table grouped by `Release`
- Noise Rack parity table filtered to `Type = Noise Rack`

## 4. Issue Forms

The repository includes issue forms for:
- bugs
- feature requests
- Noise Rack parity work
- docs / governance work

Use labels consistently so release notes and Project automation stay useful.

## 5. Releases

`CHANGELOG.md` remains the human-curated source of release history.

GitHub Releases should:
- use the current version tag
- start from the generated release-note categories in `.github/release.yml`
- be checked against `CHANGELOG.md` before publishing

## 6. Dependency Management

Dependabot is configured for:
- `npm`
- GitHub Actions

Review policy:
- group patch/minor updates when safe
- treat major updates as individually reviewed work
- verify CI before merging
