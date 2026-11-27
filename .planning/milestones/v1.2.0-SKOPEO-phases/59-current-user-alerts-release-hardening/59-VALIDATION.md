---
phase: 59
slug: current-user-alerts-release-hardening
status: automated_complete_human_needed
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-27
last_validated: 2026-08-27
---

# Phase 59 — Validation Strategy

## Test Infrastructure

| Property | Value |
|---|---|
| Framework | Existing Node `node:assert`/VM/fake-Chrome harnesses plus real local Chrome browser contract |
| Quick gate | Current plan's `node tests/skopeo-alert-*.test.js` commands and `node --check` for changed classic scripts |
| Aggregate | `npm run test:skopeo-release-evals` after truth, HUD, and Ask prerequisites |
| Full gate | Alert focused suites, storage boundary, manifest/extension validation, real Chrome, and `npm test` |
| Human evidence | Separate `59-HUMAN-UAT.md`; never inferred from deterministic fixtures |

## Sampling

- Run each owned focused test after every implementation task and every affected upstream regression after a background/HUD integration task.
- Re-run alert schema/store/engine/runtime together after any private model or state transition change.
- Re-run session lifecycle and browser contract after every content/shell/background action change.
- Re-run storage-boundary and corpus runtime after every store/participant/boot change.
- Before phase verification, `npm run validate:extension` and `npm test` must pass from the final head.

## Per-Plan Gate Map

| Plan | Requirements | Threats | Required gate |
|---|---|---|---|
| 59-01 | ALERT-01, ALERT-02, ALERT-04, ALERT-05 | T59-01..05, T59-07..10 | `node tests/skopeo-alert-schema.test.js && node tests/skopeo-alert-store.test.js && node tests/skopeo-alert-engine.test.js && node tests/skopeo-corpus-runtime.test.js && node scripts/verify-skopeo-storage-boundary.mjs` |
| 59-02 | ALERT-01..05 | T59-01..10 | `node tests/skopeo-alert-runtime.test.js && node tests/skopeo-hud-runtime.test.js && node tests/skopeo-truth-runtime.test.js && npm run validate:extension` |
| 59-03 | ALERT-02, ALERT-03, ALERT-05, VERIFY-03 | T59-01, T59-06, T59-08..11 | `node tests/skopeo-hud-schema.test.js && node tests/skopeo-hud-projector.test.js && node tests/skopeo-adaptive-composer.test.js && node tests/skopeo-hud-runtime.test.js && node tests/skopeo-session-lifecycle.test.js && node tests/skopeo-browser-contract.test.js` |
| 59-04 | VERIFY-01..05, all ALERT IDs | T59-01..12 | `npm run test:skopeo-release-evals && node scripts/verify-skopeo-storage-boundary.mjs` |
| 59-05 | All Phase 59 IDs | T59-01..12 | `npm run test:skopeo-truth-evals && npm run test:skopeo-hud-evals && npm run test:skopeo-ask-evals && npm run test:skopeo-release-evals && node tests/skopeo-session-lifecycle.test.js && node tests/skopeo-browser-contract.test.js && npm run validate:extension && npm test` |

## Wave 0 Artifacts

- [x] `tests/skopeo-alert-schema.test.js` — exact shapes, civil dates/timezones, caps/max+1, private/public separation, hostile data, freeze.
- [x] `tests/skopeo-alert-store.test.js` — partitioning, mapping, state transitions, strict storage faults, reverse dependencies, recovery, real purge participant.
- [x] `tests/skopeo-alert-engine.test.js` — exact minus-90 derivation, notice-only eligibility, mapping/dedupe/supersession, delivery windows, closed public state.
- [x] `tests/skopeo-alert-runtime.test.js` — alarm registry reconcile, delayed wake, attempt-before-create, interruption, duplicate effect prevention, API failure, current revalidation, click behavior.
- [x] Phase 59 extensions to HUD schema/projector/composer/runtime/browser tests — status, mapping confirmation, native notification copy boundary, focus/preferences/collision/teardown.
- [x] `tests/fixtures/skopeo-release-evals/manifest.json` and `cases.json` — versioned gold/adversarial matrix.
- [x] `tests/skopeo-release-evals.test.js` — exact requirement/threat coverage and separated evidence dimensions.
- [x] `59-HUMAN-UAT.md` — legal/domain, live Docs/PDF/download/shared/revocation/account, native notification, VoiceOver/usefulness ledger.
- [x] `package.json` — register `test:skopeo-release-evals` once after graph/truth/HUD/Ask prerequisites.

## Required Automated Oracles

1. Same alert identity reconciled repeatedly creates at most one alarm and one notification effect.
2. `attempted` is durable before notification creation; interruption never becomes delivered.
3. Deadline-minus-90 is computed through civil ordinals; renewal/expiration/termination never schedules.
4. Same-civil-date delayed alarm may deliver after revalidation; later civil date becomes missed without notification.
5. Owner display labels/emails never map; only exact explicit stable owner/current partition binding delivers.
6. Account, corpus, owner relation, governing path, deadline, consequence, source set, access, revision, timezone, or citation drift blocks/supersedes before effect.
7. Source/partition purge removes every owned alert/binding/index record and leaves no actionable alarm/notification click.
8. Public HUD and notification models contain no private IDs/URLs/revisions/keys/errors and hostile text remains inert.
9. Gold cases match exact expected dates, addresses, governing paths, calculations, policy/memo states, and negative disclosure sets.
10. Existing 100-cycle/virtualization/route/scroll/zoom/resize/teardown contracts remain exact.

## Manual-Only Evidence

| Dimension | Why manual | Required record |
|---|---|---|
| Legal/domain gold approval | Synthetic fixtures cannot establish contract interpretation | Reviewer, source/fixture revision, expected-vs-observed governing/date/address/calculation/policy disposition |
| Authorized live Drive/Docs/PDF | Real Google identity, access, revisions, download behavior, sharing, revocation, and account switching require user-controlled data/session | Docs, text PDF, blocked download, shared access, revocation, account switch, unsupported results |
| Native system notification | OS presentation and user notification settings vary | Scheduled/delayed/delivered/failure observation on target Chrome/OS |
| Human accessibility/usefulness | VoiceOver/comprehension/host coexistence require a person | VoiceOver order, keyboard, 200% zoom, forced colors, reduced motion, density, Drive/Docs controls |

These remain `human_needed` unless actual evidence is recorded. The milestone may be automated-complete with an explicit human-needed release disposition; it must not be called live-approved.

## Validation Sign-Off

- [x] Every planned implementation family has a focused automated command.
- [x] Alert state, Chrome effects, purge ownership, public UI, gold correctness, adversarial security, and lifecycle closure each have independent oracles.
- [x] Commands contain no watch mode and require no new test dependency.
- [x] Deterministic, provisional, legal/domain, authorized-live, and human-accessibility dimensions remain separate.
- [x] `nyquist_compliant: true` and `wave_0_complete: true`; Plan 59-04 created and registered the aggregate fixtures, and Plan 59-05 passed the final full gate.
