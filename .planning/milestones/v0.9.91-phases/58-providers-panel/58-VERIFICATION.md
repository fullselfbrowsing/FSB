---
phase: 58-providers-panel
verified: "2026-07-12T23:10:51Z"
status: human_needed
automated_status: passed
visual_status: human_needed
score: "8/8 must-haves verified"
requirements_score: "6/6 requirements satisfied"
artifacts_score: "11/11 declared artifacts verified"
key_links_score: "8/8 declared key links manually verified"
overrides_applied: 0
human_verification:
  - test: "Legacy hash canonicalization"
    expected: "Opening #api-config activates Providers and rewrites the URL to #providers without a redirect loop."
    why_human: "The in-app Browser exposed no runnable backend for a live extension page."
  - test: "Exactly one advisory badge"
    expected: "Exactly one Recommended badge is visible and remains visually distinct from the selected radio row."
    why_human: "Live rendered hierarchy and contrast require a browser judgment."
  - test: "Selection and focus survive Refresh"
    expected: "Manual or failed refresh changes evidence only; checked row, focus, API values, and Save state remain unchanged."
    why_human: "Native focus retention and live announcement behavior require Chrome interaction."
  - test: "Agent mode removes API controls"
    expected: "Agent selection removes model, key, endpoint, and hint controls from view and tab order."
    why_human: "Real browser tab order was unavailable."
  - test: "API mode restores latent values"
    expected: "Returning to an API provider restores its prior model, key, and endpoint values."
    why_human: "The VM contract passes, but the live extension flow was unavailable."
  - test: "Live, historical, unavailable, and stale evidence"
    expected: "The visible states read Connected now, Seen before, Status unavailable, and Status may be stale in the corresponding scenarios."
    why_human: "Live MCP/extension state fixtures could not be exercised in Chrome."
  - test: "Empty and unsupported-client states"
    expected: "A confirmed empty inventory shows No agent CLI detected; unsupported identities remain inert text in Other MCP clients."
    why_human: "Rendered disclosure behavior needs a live browser check."
  - test: "Agent usage and billing details"
    expected: "Unknown auth shows Billing not reported, three em dashes, no currency field, and the correct official billing link."
    why_human: "Link opening and final rendered copy were not exercised in Chrome."
  - test: "Light and dark themes"
    expected: "Selection, recommendation, semantic badges, errors, body copy, and focus rings remain readable in both themes."
    why_human: "Theme contrast is a visual judgment."
  - test: "Desktop and compact layout"
    expected: "The roster is two columns at 900px and above, one column below, with no compact-width overflow."
    why_human: "No live viewport backend was available."
  - test: "Keyboard radio behavior"
    expected: "Tab, arrows, and Space operate one native radio group without focus jumps after evidence updates."
    why_human: "Native keyboard behavior requires live Chrome interaction."
  - test: "Reduced motion"
    expected: "Refresh still announces status while spin, transform, and transition motion are removed."
    why_human: "The OS/browser reduced-motion preference could not be exercised."
---

# Phase 58: Providers Panel Verification Report

**Phase goal:** Turn API Configuration into a Providers panel that separates the seven BYOK API providers from agent CLIs, derives one non-selecting recommendation from Phase 57 evidence, and reports agent usage/billing without fabrication.

**Verified:** 2026-07-12T23:10:51Z  
**Status:** `human_needed`  
**Re-verification:** No — initial independent verification.

## Verdict

All automated functional requirements, declared artifacts, and manually traced key links pass. PROV-01 through PROV-06 are satisfied under the approved billing correction, INV-03 and INV-05 hold, the final code review is clean, and the focused compatibility cluster exits `0`.

The overall status is nevertheless `human_needed` because live Chrome visual, theme, responsive, native-keyboard, focus, and reduced-motion checks could not be performed. This is an evidence limitation, not an automated implementation gap. No visual pass is inferred from source or VM tests.

## Goal Achievement

### Merged Observable Truths

Roadmap criteria and the twelve plan truths were merged and deduplicated into eight observable outcomes.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Providers is the sole canonical route; legacy `#api-config` normalizes to `#providers`, and source-pin contracts remain green. | VERIFIED | `control_panel.html:47,144`; `normalizeSectionId` and section routing at `options.js:1770-1812`; provider UI test plus full focused cluster pass. |
| 2 | Ten native radios carry explicit `api`/`agent` kinds; checked state is user intent and uses the existing Save/Discard boundary. | VERIFIED | Static roster at `control_panel.html:152-282`; selection render/change at `options.js:798-878,900+`; VM tests prove no write before Save and correct discard restoration. |
| 3 | Agent selection removes API controls and renders agent evidence/account/setup/usage; API selection restores the latent BYOK surface. | VERIFIED | Mutually exclusive containers at `control_panel.html:298-560`; `renderProviderKind` at `options.js:815-819`; VM tests cover both directions and delayed/in-flight discovery cancellation. |
| 4 | Provider settings, API request settings, and advisory evidence remain separate; migrations fail closed and preserve inactive-kind configuration. | VERIFIED | Pure normalization at `providers-panel.js:123-136`; load/save normalization at `options.js:1954-2018,2266-2345`; agent ids never enter the seven-value hidden select or UniversalProvider. |
| 5 | Every render derives exactly one advisory recommendation using live > installed > clicked > xAI, fixed Claude/OpenCode/Codex ties, and no selection mutation. | VERIFIED | `getRecommendation` at `providers-panel.js:150-181`; badge-only renderer at `options.js:500-518`; logic and VM tests cover all tiers, ties, raw collisions, historical-only evidence, and selection non-mutation. |
| 6 | Live, installed, historical, clicked, unavailable, stale, and raw/unsupported evidence are distinct and defensive. | VERIFIED | Status derivation at `providers-panel.js:183-219`; evidence and text-only raw rendering at `options.js:520-635`; review fix `245b6e9d` rejects raw allowlisted-id collisions. |
| 7 | Evidence refresh runs on load, Providers entry, relevant storage changes, and manual action; it is bounded/coalesced, retains the last snapshot on failure, and never polls. | VERIFIED | Runtime request/timeout at `options.js:408-453`; refresh/coalescing/queue at `options.js:726-795`; load and section triggers at `options.js:1792-1794,2162`; VM tests cover timeout, malformed responses, stale retention, debounce, and queued invalidation. |
| 8 | Agent usage and billing are honest: Tokens/Turns/Duration are unknown until real data exists, no currency is shown, unknown auth says Billing not reported, and official links/copy are fixed. | VERIFIED | Frozen definitions and billing derivation at `providers-panel.js:22-53,221-245`; rendered details at `options.js:637-703`; static/VM and pure tests verify exact copy, destinations, rel attributes, three em dashes, and no cost node. |

**Score:** 8/8 merged truths verified. The human-verification priority rule still makes the phase status `human_needed`.

### Roadmap Success Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Rename/redirect and source-pin safety | VERIFIED | Canonical Providers markup, legacy normalization, permanent root tests, focused cluster pass. |
| Explicit provider kinds and kind-specific fields/status | VERIFIED | Closed definitions, ten radios, hidden API panel in agent mode, agent details, corrected scoped credential copy. |
| Exactly one strict advisory recommendation | VERIFIED | Pure fixed-tier algorithm plus badge-only renderer and non-mutation tests. |
| UniversalProvider never observes agent ids and inactive settings survive | VERIFIED | Separate `agentProviderId`; `modelProvider` remains the seven API ids; UniversalProvider remains unchanged and reads only `settings.modelProvider`. |
| Honest usage/billing without fabricated dollars | VERIFIED | Empty metrics use em dashes; no currency element; billing is conditional on explicit auth and unknown today. |

## Requirements Coverage

| Requirement | Status | Independent evidence |
|-------------|--------|----------------------|
| PROV-01 | SATISFIED | Nav and section use Providers; `#api-config` maps only to `providers`; the focused UI, discovery, combobox, Lattice, sunset, and UniversalProvider cluster passes. |
| PROV-02 | SATISFIED | Frozen definitions contain exactly seven `api` and three `agent` ids; all ten radios carry matching kind/id values; invalid settings fail closed. |
| PROV-03 | SATISFIED | Agent mode hides the complete API detail container and shows install, connection, Account Not reported, setup, usage, and scoped FSB credential copy. Literal generic subscription wording is intentionally not shown under unknown auth; see Billing Truth below. |
| PROV-04 | SATISFIED | Save/load/discard preserve `modelProvider`, model, keys/endpoints, and latent `agentProviderId`; active agent transitions cancel delayed and in-flight API discovery; UniversalProvider and all seven BYOK compatibility tests remain green. |
| PROV-05 | SATISFIED | Recommendation uses non-null canonical live, then detected install, then clicked, then xAI; fixed ties and historical-only fallback are tested; refresh cannot check a radio or write settings. |
| PROV-06 | SATISFIED | Agent details show Tokens, Turns, Duration and `No delegated runs yet` with no dollar/currency field. Unknown auth shows `Billing not reported`; only explicit subscription auth yields inclusion, while API/credits/Zen/provider modes yield CLI-provider billing. |

No Phase 58 requirement is orphaned: all PROV-01..06 appear in plan frontmatter and in the requirements traceability table.

## Billing Truth and Approved Interpretation

The original generic phrases “uses your subscription” and “included in your subscription” cannot truthfully describe the current Phase 57 evidence because it carries no auth or billing mode.

- Claude plans can include Claude Code, while Anthropic also documents API/usage-priced configurations: [Claude pricing](https://claude.com/pricing).
- OpenCode supports many configured providers and provider API keys, while Zen is pay-as-you-go and charged per request: [OpenCode providers](https://opencode.ai/docs/providers/), [OpenCode Zen](https://opencode.ai/docs/zen/).
- Current Codex accounting uses plan/usage credits and token-based credit rates rather than a universal no-incremental-cost promise: [Codex rate card](https://help.openai.com/en/articles/20001106-codex-rate-card-2).

Therefore the implemented rule is the honest fulfillment of PROV-03/06's no-fabrication intent:

- unknown auth -> `Billing not reported`;
- explicit `subscription` -> `Included in your subscription`;
- explicit `api`, `credits`, `zen`, or `provider` -> `Billed by your CLI provider`.

The no-key statement is scoped to FSB's credential boundary: FSB uses the CLI's existing sign-in and does not need the CLI credential. It does not claim that the CLI or its configured provider needs no credential.

## Required Artifacts

`gsd-tools verify artifacts` passed every plan: 3/3 for 58-01, 4/4 for 58-02, and 4/4 for 58-03 (11/11 declarations; 8 unique artifacts).

| Artifact | Level 1: exists | Level 2: substantive | Level 3/4: wired/data-flowing |
|----------|-----------------|----------------------|------------------------------|
| `extension/ui/providers-panel.js` | Yes, 266 lines | Closed definitions, normalization, recommendation, status, billing | Loaded before options; consumed by load/save/evidence/details. |
| `extension/ui/control_panel.html` | Yes | Complete route, ten-row roster, API and agent panels | Cached and rendered by options; helper script order is correct. |
| `extension/ui/options.css` | Yes | 444-line provider block with theme/state/responsive/motion rules | Class names match static/dynamic markup and renderers. |
| `extension/ui/options.js` | Yes | Kind state, refresh, renderers, persistence, discovery cancellation | Data flows from runtime and storage through helper to roster/details; selection flows separately to Save. |
| `tests/providers-panel-logic.test.js` | Yes, 518 lines | Pure edge-case and billing contract suite | Permanently included once in root `npm test`. |
| `tests/providers-panel-ui.test.js` | Yes, 1,557 lines | Static plus VM behavior/race/error suite | Permanently included once in root `npm test`. |
| `package.json` | Yes | Both tests are placed in the serial root suite | Ordering pins pass. |
| `58-VISUAL-QA.md` | Yes | Exact automated evidence and 12 honest human procedures | Correctly records browser unavailability; no visual result is fabricated. |

No missing, stub, orphaned, or hollow Phase 58 artifact was found.

## Key Link Verification

The generic key-link parser verified 2/8 because several plan entries use conceptual source labels such as `provider API radio`, `saveSettings`, and `selected agent row`, and one regex does not cross newlines. Manual wiring inspection verifies all eight links.

| From | To | Status | Evidence |
|------|----|--------|----------|
| `control_panel.html` | `providers-panel.js` before `options.js` | WIRED | Adjacent script tags at lines 2127-2128; load-order test passes. |
| Provider helper API allowlist | UniversalProvider `settings.modelProvider` | WIRED | Closed API ids at helper lines 4-12; save normalization at options lines 2266-2291; UniversalProvider reads `settings.modelProvider` only at line 137. |
| `loadSettings` | helper `normalizeSettings` | WIRED | Normalizes at options lines 1964-1969 before DOM selection at 1983-1989. |
| API radio | hidden `#modelProvider` and discovery/key path | WIRED | Valid API id assigned at options lines 864-868, then existing discovery and key visibility run. |
| `saveSettings` | UniversalProvider-compatible settings | WIRED | Sibling `providerKind`/`agentProviderId`; `modelProvider` remains the validated hidden API value at lines 2285-2291. |
| options evidence refresh | background `getMcpClients` | WIRED | Request at options line 432 reaches guarded background case 7681-7698 and calls `getMergedClients`. |
| refresh result | pure recommendation and badge-only renderer | WIRED | Helper result assigned at options line 742; renderer at 500-518 cannot write selection/storage. |
| selected agent | frozen provider definition and billing label | WIRED | Details renderer calls `getProviderDefinition` and `getBillingLabel(undefined)` at options 642-649 and writes fixed copy/link at 692-701. |

## Data-Flow Trace

| Surface | Source | Trace | Status |
|---------|--------|-------|--------|
| Agent evidence | Durable `fsbAgentProviders` plus live registry | background `getMcpClients` -> `FsbMcpAgentProviders.getMergedClients` -> options runtime request -> defensive map -> status/detail renderers | FLOWING |
| Recommendation | Same merged evidence | `getRecommendation` scans only fixed supported ids -> state recommendation -> one hidden/unhidden badge | FLOWING, advisory only |
| Saved intent | local settings/form state | normalize -> hidden API select + latent agent id -> native radio render -> Save writes sibling keys | FLOWING, isolated from evidence |
| Billing/details | Frozen provider definition plus auth state | selected allowlisted agent -> definition copy/link -> `getBillingLabel(undefined)` -> current unknown UI | FLOWING, non-fabricated |

## Invariant Verification

### INV-03 — BYOK provider parity

VERIFIED.

- `extension/ai/universal-provider.js` has no Phase 58 diff and its provider table remains exactly xAI, OpenAI, Anthropic, Gemini, Custom, LM Studio, and OpenRouter.
- The constructor reads only `settings.modelProvider`; no `providerKind` or agent id is referenced.
- The hidden select contains exactly the same seven ids; normalization rejects agent ids as `modelProvider`.
- Focused model discovery (79/79), combobox (30/30), Lattice bridge (110/110), and LM Studio UniversalProvider (13/13) tests pass.

### INV-05 — sunset modules remain frozen

VERIFIED.

- The Phase 58 source range has no diff under `extension/agents/*`.
- `agent-sunset-control-panel.test.js` passes.
- The Lattice compatibility test independently confirms the three retired modules remain absent or carry their deprecation banner.

## Behavioral Spot-Checks

| Behavior | Command/result | Status |
|----------|----------------|--------|
| Pure recommendation, normalization, and billing modes | Direct Node probe returned Codex for live, xAI for historical-only, Billing not reported for unknown auth, and retained Anthropic beside active Codex intent. | PASS |
| Phase 58 provider contracts | `node tests/providers-panel-logic.test.js && node tests/providers-panel-ui.test.js` | PASS |
| Compatibility cluster | Logic, UI, model discovery, combobox, Lattice bridge, merged MCP view, sunset, and LM Studio commands | PASS, exit 0 |
| Syntax | `node --check` for helper, options, and both provider tests | PASS |
| Declared commits | `gsd-tools verify commits` on 13 execution/review-fix commits | PASS, 13/13 |
| Schema drift | `gsd-tools verify schema-drift 58` | PASS, no drift |
| Scoped whitespace | `git diff --check` across all Phase 58 source/test files | PASS |

The complete root suite was not rerun by this verifier because the orchestrator explicitly provided a final-source green gate. The final review records `npm test` passing at every extension-touching fix gate, including `403a1047`; Plan 03 also records a clean detached-worktree pass at its then-current source commit. The independent focused cluster above runs against current HEAD after all fixes.

## Review and Scope Closure

- Final `58-REVIEW.md`: `status: clean`, 0 critical, 0 warning, 0 info.
- Final `58-REVIEW-FIX.md`: all 5 in-scope findings fixed, none skipped.
- Verified fixes include raw-id collision rejection, stale/queued refresh races, delayed and in-flight API discovery cancellation/restoration, balanced Providers markup, stable accessible names, semantic badge colors, Chrome 88 fallback styling, and pending debounce cancellation.
- Current Phase 58 source/test files are clean in the shared worktree.
- Phase 58 does not modify `extension/ai/universal-provider.js` or `extension/agents/*`.
- Unrelated pre-existing planning deletions and generated build/showcase changes were not touched.

## Anti-Pattern and Disconfirmation Pass

No Phase 58 blocker anti-pattern was found. Grep matches for “placeholder” are existing HTML input attributes, an intentional latent-model placeholder, or historical Lattice-test comments; none is a rendered Phase 58 implementation stub. The agent usage em dashes and Account/Billing not reported states are intentional truthful empty states pending later delegated-run/auth data.

Three ways the implementation could have looked correct while being wrong were checked explicitly:

1. A raw row colliding with `claude-code`, `opencode`, or `codex` could have become canonical. The helper now rejects `raw:true`, and logic/VM tests cover all three collisions.
2. A storage invalidation during an in-flight refresh could have been lost. The queue produces exactly one follow-up, and the second response becomes authoritative.
3. Delayed, active, or debounced API discovery could have mutated latent API state after agent selection. Generation invalidation, snapshot restoration, timer clearing, and provider/kind callback guards are present and exercised.

Disconfirmation notes:

- The literal old roadmap subscription caption is not displayed under unknown auth. That is the approved, evidence-backed correction rather than a missing implementation.
- Source and VM tests prove semantics but cannot prove visual hierarchy, real focus behavior, native radio interaction, contrast, wrapping, or reduced motion. Those remain the human gate below.
- The five-second runtime timeout is behaviorally covered with a shortened deterministic harness; its real-time browser experience is part of the live UAT gap.

## Human Verification Required

Twelve live-browser scenarios remain exactly as documented in `58-VISUAL-QA.md`:

1. Legacy hash canonicalization.
2. Exactly one advisory badge and selected-vs-recommended distinction.
3. Selection and focus retention across successful and failed Refresh.
4. Agent-mode API-control removal from view and tab order.
5. API-mode latent value restoration.
6. Live, historical, unavailable, stale, polite-status, and manual-alert rendering.
7. Empty inventory and unsupported-client disclosure.
8. Agent usage/billing copy, link opening, and no-currency rendering.
9. Light/dark contrast and non-color cues.
10. Desktop, intermediate, and compact responsive layout without overflow.
11. Keyboard-only native radio navigation and focus stability.
12. Reduced-motion refresh behavior.

## Gaps Summary

No automated or source-level gap blocks the Phase 58 goal. The only unresolved evidence is live visual/interaction UAT. Under the verifier status rules, any non-empty human-verification section takes priority over an otherwise passing 8/8 score, so the correct status is `human_needed`.

---

_Verified: 2026-07-12T23:10:51Z_  
_Verifier: independent gsd-verifier agent_
