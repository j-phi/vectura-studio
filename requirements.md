# Requirements: Optimization, History Timeline, and Testing Suite

## 0) Overview
This document defines requirements for three initiatives:
1) vpype-like optimization tools with visual confirmation and easy toggleable actions.
2) A non-destructive visual history timeline with time travel.
3) A robust automated testing suite for the full app.

The requirements are written to fit the current zero-build, browser-first architecture and the existing UI/engine structure.

---

## 1) vpype-like Optimization Integration

### 1.1 Goals
- Provide a set of plotter-focused optimization operations modeled after vpype (e.g., linesimplify, linesort, multipass, filter).
- Make optimizations easy to enable/disable with clear, immediate visual confirmation.
- Allow optimizations to be applied at any point in the workflow without destructive changes to underlying data.
- Support per-layer and per-pen optimization workflows.

### 1.2 Non-Goals
- No dependency on vpype itself (must be implemented natively in JS).
- No server-side processing; all operations run locally in the browser.
- No permanent destructive modifications without explicit user action.

### 1.3 User Experience Requirements
- Provide an "Optimization" panel with:
  - Toggle buttons for each optimization type.
  - Per-optimization settings (e.g., tolerance for linesimplify).
  - An "Apply" and "Bypass" switch for each optimization, and a global "Bypass All" toggle.
  - A global "Reset Optimizations" action.
- Optimizations must support three scopes:
  - Active layer only.
  - Selected layers.
  - All layers.
- Optimizations must support per-pen group operations (e.g., linesort within each pen group).
- Visual confirmation must include:
  - Before/after stats for line count and point count.
  - Before/after estimated plot distance/time.
  - Optional overlay preview of "optimized" vs "original" paths.

### 1.4 Functional Requirements (Operations)
Each operation must be independently configurable, re-ordered, and composable. The pipeline should allow enabling/disabling steps without losing parameters.

#### A) linesimplify
- Inputs:
  - tolerance (numeric, mm; range and step defined).
  - mode: "polyline" or "curve" (matches current curves behavior).
- Output:
  - Reduced points per path with minimal shape deviation.
- Requirements:
  - Must preserve closed paths as closed.
  - Must preserve circles (meta circle paths) without simplification.
  - Must respect margin truncation and outside opacity rules.

#### B) linesort
- Inputs:
  - method: nearest-neighbor, greedy, or angle-based.
  - direction: none / horizontal / vertical / radial.
  - grouping: per pen, per layer, or combined.
- Output:
  - Reorders paths to reduce pen travel.
- Requirements:
  - Must not alter the geometry of each path, only order.
  - Must keep pen grouping consistent for export.

#### C) filter
- Inputs:
  - min length (mm).
  - max length (mm).
  - remove tiny fragments (toggle).
- Output:
  - Removes lines below/above length thresholds.
- Requirements:
  - Must provide a preview of filtered count and allow revert.

#### D) multipass
- Inputs:
  - passes (integer).
  - offset jitter (mm) or radial offset per pass.
  - optional randomness seed.
- Output:
  - Duplicates paths with controlled offsets for thicker strokes.
- Requirements:
  - Must operate on selected layers or per pen.
  - Must be reversible.

#### E) Other optional optimizations (if feasible)
- snap to grid (tolerance, mm).
- merge collinear segments.
- path join (if endpoints are within threshold).

### 1.5 Data/Architecture Requirements
- Optimizations must be non-destructive by default:
  - Store "sourcePaths" as original generation output.
  - Store "optimizedPaths" for each layer (or derived on the fly).
  - Keep a pipeline configuration per layer and per pen group.
- Pipeline must be deterministic (given the same inputs and seed).
- Optimizations must be applied before export and optionally previewed in canvas.
- Export should allow toggling "Include optimizations" vs "Export raw".

### 1.6 Performance Requirements
- Operations should be incremental when possible (only recompute affected layers).
- Ensure responsiveness on typical 100-300 line layers (target: under 150ms per operation for typical sizes).
- Large operations should show progress if longer than 500ms.

### 1.7 Acceptance Criteria
- User can toggle each optimization and immediately see visual impact.
- User can reorder pipeline steps and see updated results.
- User can bypass or reset optimizations without losing raw data.
- Export supports optimized vs raw paths.

---

## 2) Non-Destructive History Timeline (Time Travel)

### 2.1 Goals
- Provide a visual timeline of edits and allow users to scrub backwards/forwards in history.
- Keep all edits non-destructive and reversible.

### 2.2 User Experience Requirements
- Add a "History" panel accessible from the UI.
- Display a chronological list with:
  - Timestamp.
  - Action summary (e.g., "Changed Noise Type", "Moved layer", "Applied linesimplify").
  - Layer/pen scope.
- Provide a slider or scrubber to move through history.
- Clicking a history item must restore that state.
- Allow branching: if the user makes changes after moving back, create a new branch and show it in the UI.

### 2.3 Functional Requirements
- Record the following actions as history entries:
  - Parameter changes.
  - Layer creation/deletion/duplication.
  - Transform changes (position/scale/rotation).
  - Selection changes (optional, configurable).
  - Optimization pipeline changes.
- Support configurable history depth (existing undo setting).
- Provide visual diff for the selected history entry:
  - Compare current vs selected state for line counts, points, pen distance.
- Preserve seed-based determinism for consistent replays.

### 2.4 Data/Architecture Requirements
- Snapshot format should support:
  - Full state (layers, params, settings, palette/pen assignments).
  - Optional delta compression to reduce memory usage.
- Must store snapshots in memory only (no server).
- Allow exporting history as JSON for debugging (optional).

### 2.5 Acceptance Criteria
- Users can scrub back and forward without corrupting data.
- The timeline updates immediately with new actions.
- Time travel does not lose prior states; creating new edits after time travel creates a new branch.

---

## 3) Testing Suite Requirements

### 3.1 Goals
- Provide reliable regression coverage for rendering, algorithms, UI interactions, and export.
- Ensure deterministic behavior across algorithms and parameter updates.

### 3.2 Test Categories

#### A) Unit Tests
- Core math helpers (noise, RNG, transforms, simplification).
- Algorithm outputs:
  - Deterministic given seed.
  - Stable path counts for baseline inputs.

#### B) Integration Tests
- UI controls to parameter updates to render (e.g., slider updates regenerate output).
- Layer operations (add/delete/duplicate/group/expand).
- Optimization pipeline apply/bypass/export.
- History timeline scrub restores full state.

#### C) Visual Regression Tests
- Snapshot rendering of key algorithms with known seeds.
- Compare SVG export output against known baselines.

#### D) Performance/Stress Tests
- Large line counts do not exceed timeouts.
- Path simplification and sorting handle 1k-10k line sets without crashing.

### 3.3 Test Tooling Requirements
- Use a JS test runner (e.g., Vitest or Jest) with DOM support for UI logic.
- Provide a headless browser harness (e.g., Playwright) for e2e.
- Include a basic snapshot diff for SVG outputs.

### 3.4 CI Requirements
- Run unit + integration tests on every push.
- Run visual regression on main branch or nightly.
- Fail CI on snapshot drift unless explicitly updated.

### 3.5 Acceptance Criteria
- All core algorithms have deterministic unit tests.
- UI workflows have coverage for critical actions.
- Exported SVGs are stable against baselines.

---

## 4) Open Questions (Resolved)
- Optimization storage: per layer (not global).
- History scope: only changes that mutate output (exclude selection-only events).
- Maximum history size: configurable in Settings, default 500MB.
- Optimization scope: primary paths only (exclude helper guides).

---

## 5) Deliverables
- Requirements document (this file).
- UI wireframe notes for Optimization + History panels.
- Proposed test plan and toolchain decision.
