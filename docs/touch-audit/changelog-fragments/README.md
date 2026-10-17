# Changelog fragments

Touch-remediation lanes must not edit `CHANGELOG.md`, `plans.md`, `README.md`,
or the in-app help and shortcut list. These files collide across parallel lanes.

Each lane writes one fragment per requirement: `TUX-###.md`. The final docs
unit merges all fragments into the shared files and deletes the fragments.

## Fragment format

```markdown
# TUX-###: <short title>

## CHANGELOG
- <one bullet, past tense, user-visible effect>

## plans.md
- <one line: status and follow-ups>

## README / help / shortcuts
- <exact text to add, or "none">
```

Rules:
- Use one fragment per requirement. Do not share fragments between lanes.
- Write "none" under a heading when no change is needed.
- Do not commit screenshots. Evidence goes to `docs/touch-audit/evidence/after/TUX-###/`.
