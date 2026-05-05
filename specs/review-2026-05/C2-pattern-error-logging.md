# C2 — Pattern silent catches

This ticket is implemented as part of `S1-pattern-svg-xss.md` because both fixes touch `src/core/pattern.js` and concern the same trust / observability boundary. See the **REQ-5** and the C2 bullet under "Implementation notes" in `S1-pattern-svg-xss.md`.

## Problem (summary)

`src/core/pattern.js:701` (`catch (_) {}`) and `:851` (`catch (err) {}`) swallow errors silently, hiding real failures from logs.

## Required behavior (summary)

- **REQ-1 (Unwanted behavior):** If a `try`/`catch` block in `pattern.js` catches an error, then the system shall emit `console.warn('[Pattern] <context>:', err)` rather than swallow silently.

## Where to find the full spec

Open `S1-pattern-svg-xss.md` in this directory. The C2 work is bundled there to keep the `pattern.js` edits in a single PR.
