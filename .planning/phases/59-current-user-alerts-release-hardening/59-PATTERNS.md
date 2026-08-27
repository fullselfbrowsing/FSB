# Phase 59 — Pattern Map

**Mapped:** 2026-08-27
**Scope:** alerts, owner mapping, alarms/notifications, HUD status, golden release gates

## File-to-Analog Map

| Planned file | Closest repository analog | Reuse |
|---|---|---|
| `extension/utils/skopeo-alert-schema.js` | `skopeo-ask-schema.js`, `skopeo-hud-schema.js` | Classic IIFE/CommonJS dual export, exact own-data validation, bounded Unicode-safe text, null-prototype rebuild, recursive freeze. |
| `extension/utils/skopeo-alert-store.js` | `skopeo-truth-store.js`, `skopeo-decision-policy-store.js` | Injected trusted storage, strict mutation reads, serialized transitions, source/partition ownership, one-use corpus purge binder. |
| `extension/utils/skopeo-alert-engine.js` | `skopeo-deadline-engine.js`, `skopeo-decision-policy.js` | Pure deterministic civil-date and closed-state logic; no Chrome/storage/UI/provider calls. |
| `extension/utils/skopeo-alert-runtime.js` | `trigger-lifecycle.js`, `mcp-visual-session-lifecycle.js` | Injected alarm API, fixed prefix, `getAll` orphan reconciliation, idempotent create/clear, wake-safe effect orchestration. |
| `extension/background.js` | existing corpus boot, HUD controller/action registry, `onAlarm` fan-out, startup/install hooks | Dependency-first import, real participant registration, private candidate/revalidator, exact one-shot effects, early-return routing. |
| HUD schema/projector | existing Phase 57 folder/reading models | Extend reserved notification slot with closed status/actions; do not add a parallel projection. |
| composer/runtime/shell | existing contract view and Phase 58 confirmation | Local enum-to-copy, current action epoch, safe-focus confirmation, same Shadow rail and resource ledger. |
| `tests/skopeo-alert-*.test.js` | truth/policy/runtime tests | VM-load production module, fake storage/alarms/notifications, controlled RED markers, exact call/state assertions. |
| `tests/skopeo-release-evals.test.js` + fixtures | Ask/HUD/truth eval manifests | Versioned manifest/cases, requirement/threat mapping, separate deterministic/human dimensions. |

## Module Rules

### Alert schema

- Admit only exact own enumerable data properties; reject accessors, symbols, cycles, sparse arrays, prototypes, bidi/control text, raw URLs, and unknown fields.
- Keep private candidate/store/public status/notification models separate. A public parser must be unable to admit private stable IDs by construction.
- Cap partitions, bindings, alerts, source dependencies, labels, details, and serialized bytes; max+1 fails closed.

### Alert store

- Accept an injected `storageArea`, corpus schema, alert schema, clock, and byte-length function. No global Chrome lookup inside dual-loaded code.
- Strict read-before-mutate: absent keys may initialize; unreadable/malformed/version-mismatched keys block mutation and never become empty state.
- Persist private partition/account/source/owner/evidence identifiers only inside prefix-owned trusted local keys.
- Serialize transitions; rebuild and freeze every outward record; never return mutable storage objects.
- Issue the `alerts` purge binder once. Verify corpus-owned authorization before and after every await, delete durable influence before reporting success, and report `owned:true` on uncertainty.

### Alert engine

- Reuse deadline-engine ordinal functions, never locale/implicit date parsing.
- Eligibility requires `notice-deadline`, `eligible`, exact/current inputs, no blockers, consequence, timezone, citation/evidence, one current owner, and complete set.
- Compute alert date, dedupe digest input, mapping disposition, allowed transition, and minimized public status only. Effects belong elsewhere.
- Same labels with different stable IDs never map; identical stable identity across a stale revision still requires current relation/evidence revalidation.

### Alert runtime

- Accept injected store, engine, alarms, notifications, runtime URL resolver, revalidator, clock, timezone formatter, and optional test hooks.
- Register no listeners itself when dual-loaded; expose exact handlers for synchronous wiring in `background.js`.
- Use durable state as truth and Chrome alarms as reconstructed wake hints.
- Persist attempted before notification; notification success before delivered; close/dismiss is informational only.
- A revalidator result is a fresh candidate, not a boolean. Runtime compares the complete current alert identity before an effect.
- All API exceptions become closed failure states; no raw exception enters storage projection, HUD, notification, diagnostics, or telemetry.

### Background

- Import alert dependencies after truth/deadline and before HUD modules.
- Create/recover alert store and register its real `alerts` participant before corpus recovery. Keep `counts` as the only empty reserved participant.
- Keep alert/store/runtime facades lexical inside the trusted boundary. No generic content/MCP/storage proxy.
- Candidate derivation uses exact current graph/truth/corpus proof; notification click reuses fresh governing citation authorization rather than stored URL navigation.
- Synchronous event listeners recognize only exact `skopeoAlert:` IDs and early-return before unrelated alarm/notification logic.

### HUD

- Add only the current minimized alert status and zero/one mapping action.
- Mapping/removal requires current Interstitial confirmation and exact background re-derivation.
- A background notification never opens or raises the HUD automatically.
- Hide/kill removes content action authority but does not mutate a valid durable schedule.

## Test Patterns

- Start each plan with controlled RED tests using one exact marker and source-level absence checks.
- Use fake clock, timezone formatter, alarms registry, notification registry, worker-interruption hooks, strict storage faults, and corpus capability verifier.
- Assert exact call order for attempted-write → notification-create → delivered-write and supersede-write → alarm-clear → replacement-create.
- Exercise permutations, max/max+1, duplicate identical alarms, orphan alarms, missing alarms, delayed same-day alarms, delayed next-day alarms, restart with attempted state, permission denial, API rejection, source/access/revision/account/owner drift, notification click drift, and concurrent reconciliation.
- Preserve full-suite real Chrome and extension validation; no new test dependency.

## Security Boundaries

| Ref | Boundary |
|---|---|
| T59-01 | Owner label/email/profile order must not select a recipient. |
| T59-02 | Non-notice, ambiguous, stale, inaccessible, or incomplete dates must not schedule. |
| T59-03 | Alarm delay/restart must not become false on-time or delivered evidence. |
| T59-04 | Duplicate reconcile/alarm events must not create duplicate notification effects. |
| T59-05 | Source/account/access/revision/lineage/recipient drift must revoke before delivery. |
| T59-06 | Alert/notification/click IDs must not leak or replay private authority. |
| T59-07 | Purge/supersession must remove durable and Chrome-registry influence in safe order. |
| T59-08 | Hostile labels/consequences/filenames/prompts must remain bounded inert text. |
| T59-09 | Cross-vendor evidence or mappings must not influence another alert. |
| T59-10 | Content/MCP/telemetry/logs must not receive raw alert/store/source/account authority. |
| T59-11 | Mapping/status UI must preserve accessibility, host controls, and zero residue. |
| T59-12 | Synthetic evidence must not be promoted to legal/live/human release approval. |
