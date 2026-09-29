---
phase: 58-providers-panel
reviewed: 2026-07-12T22:23:25Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - extension/ui/control_panel.html
  - extension/ui/options.css
  - extension/ui/options.js
  - extension/ui/providers-panel.js
  - package.json
  - tests/lattice-provider-bridge-smoke.test.js
  - tests/providers-panel-logic.test.js
  - tests/providers-panel-ui.test.js
findings:
  critical: 0
  warning: 2
  info: 0
  total: 2
status: issues_found
---

# Phase 58: Code Review Report

**Reviewed:** 2026-07-12T22:23:25Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

The iteration-1 fixes resolve all five original defects at their source/runtime boundaries: the empty-state claim now requires a ready semantic snapshot, refresh is bounded and paints a deterministic recommendation before waiting, radio names remain stable, stale load callbacks are cancelled and revalidated, and Chrome 88 has standalone selected/focus rules. The provider logic/UI, discovery, combobox, and Lattice compatibility tests pass; JavaScript syntax and `git diff --check` are also clean.

Two fresh cross-file accessibility/presentation issues remain. Semantic evidence classes are applied correctly in JavaScript but are visually neutralized by the final CSS cascade, and the stable-name fix removes recommendation/evidence text from the accessibility tree without providing the promised descriptive alternative.

## Prior Fix Validation

- **Original WR-01 — resolved:** `hasSupportedAgentEvidence()` treats only clicked, installed-true, connected, or live records as evidence, and `renderProviderEvidence()` gates the absence claim on `evidenceStatus === 'ready'`. VM tests cover three detected-false rows plus loading, unavailable, stale, and each positive evidence shape.
- **Original WR-02 — resolved:** `refreshProviderEvidence()` renders the fallback/last recommendation before `requestMcpClients()`. The runtime wrapper has a five-second timeout, one settlement guard, timer cleanup, stale-snapshot retention, and deterministic tests for first-load and post-success timeouts.
- **Original WR-03 — stable-name defect resolved:** every radio uses a provider-name-only `aria-labelledby`, and dynamic badge changes no longer mutate its accessible name. A separate missing-description regression is reported below as WR-02.
- **Original WR-04 — resolved:** user provider changes call `cancelPendingProviderSettingsModelLoad()`; the delayed callback also checks load generation, active API kind, and unchanged API provider before applying model state or calling `checkApiConnection()`. The held-timer regression proves both side effects stay cancelled after switching to an agent.
- **Original WR-05 — resolved:** `.provider-row.is-selected` and its dark-mode counterpart are standalone baseline rules, focus uses Chrome-88-compatible `:focus-within`, and `:has()` appears only inside `@supports selector(...)` enhancement blocks.

## Cross-File Checks

- Provider definitions and settings normalization remain closed to seven API ids and three agent ids; no agent id enters `modelProvider` or the Lattice API bridge.
- Recommendation remains advisory and deterministic (`live > installed > clicked > xAI`) with no selection, storage, model, key, or Save-bar mutation path.
- Runtime evidence is copied into a null-prototype map, malformed envelopes fail closed, prior successful snapshots survive failure, and raw client names use `textContent` only.
- Phase 57 evidence is not treated as auth metadata. Unknown auth renders `Billing not reported`; frozen provider copy/links remain qualified and opener-isolated.
- Focused verification passed: provider logic/UI tests, model discovery tests (101/101 and UI 79/79), model combobox (30/30), Lattice bridge (110/110), all scoped syntax checks, and `git diff --check`.

## Warnings

### WR-01: The base status selector overrides every semantic evidence color

**File:** `extension/ui/options.css:5901-5929`

**Issue:** Every evidence badge permanently has `provider-badge--status` in the markup. `setProviderEvidenceBadgeClass()` then adds `provider-badge--connected`, `--installed`, `--seen`, `--error`, or `--neutral`, but the later rule `.provider-badge--neutral, .provider-badge--status` has equal specificity and overwrites the foreground, background, and border from all preceding semantic modifier rules. As a result, Connected now, Installed, Seen before, and Status unavailable all render with the same neutral treatment even though the DOM classes and tests look correct. This defeats the UI contract's non-selection semantic status cues and leaves the current source test blind to the cascade.

**Fix:** Remove `.provider-badge--status` from the trailing neutral-color rule (the base `.provider-badge` already supplies a safe default and JavaScript always applies a state modifier), or place the semantic modifier rules after the base status rule. Add a CSS contract or computed-style test proving each runtime modifier wins over the permanent base class.

### WR-02: Recommendation and evidence are no longer exposed as accessible descriptions

**File:** `extension/ui/control_panel.html:168-273`

**Issue:** The stable `aria-labelledby` values correctly keep each radio's accessible name equal to its provider name, but both dynamic badges on all ten rows are also `aria-hidden="true"` and no radio has `aria-describedby`. The only separate live announcement says generic text such as “Provider status refreshed”; when an API row is selected, `renderSelectedAgentDetails()` does not supply agent-specific live content either. A screen-reader user therefore cannot discover which provider is Recommended or whether an agent is Connected, Installed, Seen before, or unavailable, contrary to the accessibility contract that recommendation/evidence are additional descriptive text and every state is text-identifiable.

**Fix:** Keep the provider-name-only `aria-labelledby`, but expose a stable per-row description. For example, update a visually hidden description span with the combined visible recommendation/evidence state and reference it from the radio with `aria-describedby`; alternatively, dynamically reference only the currently visible badge ids and remove `aria-hidden` from those badges. Add assertions that the accessible name stays exactly the provider name while the accessible description tracks recommended, live, installed, historical, and unavailable states.

---

_Reviewed: 2026-07-12T22:23:25Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_

