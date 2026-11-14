---
phase: 59-current-user-alerts-release-hardening
researched: 2026-08-27
status: complete
sources: repository-and-official-chrome-docs
---

# Phase 59 — Implementation Research

## Executive Summary

Phase 59 should be implemented as a durable, background-only alert owner attached to the existing corpus/truth/HUD authority chain. Chrome alarms are not clocks and notifications are not delivery receipts: alarms may be delayed after device sleep, and the service worker may stop between side effects. The implementation therefore needs a strict persistent state machine, same-civil-date delivery window, attempt-before-effect ordering, reconciliation on every wake/start/current truth refresh, and fresh source/recipient/evidence authorization immediately before `chrome.notifications.create`.

Recipient matching cannot be inferred from the Phase 55 owner label. The existing current-account authority is the fresh Drive `permissionId`, while graph owner records have stable source-owned identities. Phase 59 should persist an explicit binding from the exact current owner stable identity to the current partition account permission ID. Any ambiguity, change, or mismatch is honestly not locally deliverable.

The repository already reserved the `alerts` purge participant specifically for this phase. A real alert store should replace the empty binder during trusted boot, so source deletion, revocation, account/corpus removal, and replacement delete alert influence through the same tombstone-first corpus protocol that already protects graph/truth state.

## Official Chrome Constraints

- The Chrome alarms API requires the existing `alarms` permission; an alarm may be delayed arbitrarily, does not wake a sleeping device, and missed alarms fire after wake. Important alarms must be checked/recreated because persistence historically varies across restart/update. Source: https://developer.chrome.com/docs/extensions/reference/api/alarms
- Extension service workers are short-lived; state must be stored durably and listeners must be registered synchronously. Source: https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers
- `runtime.onStartup` fires when the profile starts, but important state should also be reconciled when the worker evaluates because a worker wake is not the same as browser startup. Source: https://developer.chrome.com/docs/extensions/reference/api/runtime
- Native system notifications require the `notifications` manifest permission and a basic notification requires type, title, message, and icon URL. Click/button handlers belong in the service worker. Source: https://developer.chrome.com/docs/extensions/how-to/ui/notifications

## Requirement-to-Architecture Map

| Requirement | Required implementation result |
|---|---|
| ALERT-01 | Pure eligibility/date derivation accepts only an eligible governing notice deadline and subtracts exactly 90 civil days. |
| ALERT-02 | Explicit owner mapping compares stable owner identity and fresh partition permission ID; all other recipient states are not locally deliverable. |
| ALERT-03 | Closed notification projection contains bounded vendor/deadline/consequence/owner/evidence labels plus private current evidence binding. |
| ALERT-04 | Delivery revalidator recomputes source set, lineage/deadline, recipient, access, revision, and alert identity; changed input supersedes prior state/alarm. |
| ALERT-05 | Versioned persistent store and reconciler own scheduled/attempted/delivered/failed/missed/superseded state and exact alarm registry reconciliation. |
| VERIFY-01/02 | Versioned gold corpus covers active/partial/full replacement/draft/conflict/unreadable/inaccessible/policy/memo/near-deadline outcomes with exact expected paths/dates/addresses/calculations. |
| VERIFY-03 | Existing real-Chrome lifecycle/virtualization/geometry/resource contract gains alert/mapping/status coverage and repeated cycles. |
| VERIFY-04 | Human ledger records Docs/PDF/download/shared/revocation/account observations without synthetic promotion. |
| VERIFY-05 | One adversarial aggregate covers injection, filename, fake citation, cross-vendor, replacement, deletion, revocation, and duplicate delivery. |

## Recommended Modules

| File | Responsibility | Must not own |
|---|---|---|
| `extension/utils/skopeo-alert-schema.js` | Closed mapping/candidate/ledger/public-status shapes, caps, cloning/freezing, civil-date and ID validation | Storage, Chrome APIs, truth inference |
| `extension/utils/skopeo-alert-store.js` | Versioned trusted-local partitions, owner bindings, alert entries, serialized transitions, source reverse index, recovery, real `alerts` purge participant | Eligibility, UI, notifications |
| `extension/utils/skopeo-alert-engine.js` | Pure 90-day derivation, recipient/dedupe/supersession decisions, state-transition validation, public status/notification copy input | Storage and Chrome effects |
| `extension/utils/skopeo-alert-runtime.js` | Injected alarm/notification reconciliation, attempt-before-create delivery, startup/wake reconciliation, exact prefix routing | Corpus/graph/truth acquisition or content messaging |
| `extension/background.js` | Trusted store/runtime construction, current candidate/revalidator adapters, mapping actions, HUD projection join, synchronous event wiring | Raw authority exposure |
| Existing HUD schema/projector/composer/runtime/shell | Minimized status/actions and existing confirmation/render lifecycle | Alert persistence, source IDs, recipient IDs, alarms |
| `tests/skopeo-alert-*.test.js` | Unit/store/runtime/security/gold evaluation contracts | Network/live claims |

Keeping Chrome effects in an injected runtime makes alarm and notification behavior exhaustively testable without weakening the trusted store or reproducing business rules inside `background.js`.

## Alert Candidate Contract

The background candidate builder should consume one current exact agreement/vendor family and return a closed private candidate containing:

- partition claim/key and exact source file ID set;
- stable agreement/family identity and current truth generation/evaluation digest;
- stable owner record/relation identity and bounded display label;
- fresh current-account permission ID and explicit owner binding state;
- exactly one eligible deadline result ID, governing notice deadline civil date, timezone, consequence, exact input citation IDs, and governing evidence binding;
- bounded vendor/evidence display labels only when current disclosure authority allows them;
- source-set, access, and revision digests.

The candidate builder rejects zero/multiple owners, zero/multiple eligible notice deadlines, any non-notice date, missing consequence, incomplete exact set, current conflict, absent current citation, cap overflow, or cross-vendor evidence. It may produce a minimized not-deliverable status for a current disclosable owner mapping state without persisting a schedule.

## Civil-Date Scheduling

Reuse `FsbSkopeoDeadlineEngine.parseCivilDate`, `toOrdinal`, and `fromOrdinal`; do not use `Date.parse`, locale parsing, or implicit `new Date(civilString)`.

1. `alertCivilDate = fromOrdinal(toOrdinal(deadlineCivilDate) - 90)`.
2. Convert local 09:00 in the cited/configured IANA timezone to a unique epoch using `Intl.DateTimeFormat.formatToParts` round-tripping. Reject unavailable/invalid/mismatched timezones; do not use the machine timezone as a fallback.
3. Define the delivery window by the timezone's current civil date. Before the date: scheduled. On the date: deliver at/after the alarm hint if current. After the date: missed.
4. A delayed alarm on the same civil date may deliver; a later civil date cannot.

This meets “exactly 90 days” at the contract's civil-date granularity while remaining honest about Chrome sleep/delay behavior.

## Durable Store and State Machine

Use one prefix-owned set of records rather than one unbounded monolithic value. Recommended owned records:

- partition control/version record;
- owner-binding records keyed by partition + stable owner identity;
- alert records keyed by opaque digest;
- source reverse-index records listing alert keys;
- bounded recovery/control record if a multi-key transition is interrupted.

Every mutation is serialized and uses strict read-before-write behavior. Valid transitions:

```text
absent → scheduled
scheduled → attempted | missed | superseded | failed
attempted → delivered | failed
delivered → superseded
failed → scheduled (only with a new retry/reconciliation epoch on the same alert date)
missed | superseded → terminal
```

The store must durably write `attempted` before the notification call. A worker restart that sees `attempted` without delivered confirmation records failed/interrupted, never delivered. Notification closing is not a delivery failure.

The real `alerts` purge participant removes every alert/binding/reverse-index record influenced by the exact source or partition and proves zero influence through the corpus-owned capability verifier. Alarm clearing follows store reconciliation; durable authority is withdrawn first.

## Reconciliation and Chrome Effects

Use prefix `skopeoAlert:` plus an opaque digest. Reconciliation:

1. recover/validate durable store;
2. list only prefixed Chrome alarms and compare them with current scheduled entries;
3. clear orphan/superseded/missed alarms;
4. recreate missing scheduled alarms without changing correct existing `scheduledTime` materially;
5. resolve stale `attempted` as failed/interrupted;
6. for due entries, call injected fresh revalidator;
7. if identity/evidence changed, supersede before creating a replacement candidate;
8. if current and same alert civil date, persist attempted, create notification, then persist delivered;
9. on API error/denial/unavailability, persist failed with closed reason;
10. if date passed, persist missed without notification.

Register alarm, notification click, and button handlers synchronously in the existing service-worker fan-out. `onInstalled`, `onStartup`, boot completion, and current truth refresh call the same deduplicated reconciliation promise.

## Owner Mapping and HUD

Extend the current background HUD action registry with `map-current-owner` and `remove-current-owner-mapping`. The public action contains only an opaque action ID, closed label, bounded consequence copy, and requires-confirmation flag. Background re-derives exact current account/corpus/owner identity and source evidence before a store mutation.

The public HUD status is a minimized closed record with state, bounded summary/detail, optional alert/deadline civil dates, and zero or one mapping action. It contains no alert key, alarm/notification ID, owner stable ID, account permission ID, source ID, citation ID, revision, raw failure, or storage data.

## Golden and Adversarial Evaluation

Use deterministic redacted fixture documents/records rather than treating prior synthetic HUD fixtures as legal gold. The manifest should name expected:

- governing source path/role and cited locator handle;
- signed/effective/expiration/termination/renewal/notice dates;
- notice window, deadline, delivery method, destination/address, consequence, timezone/boundary;
- owner relation/mapping and alert civil date;
- Document 10 and complex memo state;
- expected answer/alert disposition and no-disclosure fields.

Cases: active base; partial amendment; full replacement; unsigned draft; conflicting facts; unreadable scan; inaccessible source; current Document 10; complex memo present/missing; exactly near deadline; source replacement/deletion/revocation; malicious filename; prompt injection; fake citation; cross-vendor evidence; duplicate alarm/notification.

The aggregate reports at least:

- `deterministic_gold: pass|fail`;
- `structural_security: pass|fail`;
- `lifecycle_browser: pass|fail`;
- `domain_fidelity: human_needed|approved`;
- `authorized_live_drive_docs_pdf: human_needed|approved`;
- `human_accessibility: human_needed|approved`.

## Key Pitfalls

- Treating alarm firing as on-time delivery or notification creation as owner contact.
- Comparing owner/user labels or emails instead of explicit stable mapping.
- Scheduling from the next material date when it is renewal/expiration rather than notice deadline.
- Persisting only an alarm and losing desired state after update/restart.
- Calling notification before the attempted ledger write.
- Retrying a missed cross-day alert and falsely claiming the 90-day reminder.
- Reusing stored display copy without fresh source/recipient/evidence authorization.
- Clearing the Chrome alarm before durable supersession/purge is committed.
- Letting notification clicks open stored URLs without fresh citation authorization.
- Treating synthetic gold cases or local Chrome fixtures as authorized live/legal approval.

## Planning Recommendation

Use five sequential plans:

1. closed alert schema, store, owner mapping, purge ownership, and pure 90-day engine;
2. injected alarm/notification runtime plus trusted background boot/revalidation/scheduling;
3. minimized folder/reading HUD status and explicit mapping confirmation actions;
4. versioned golden corpus, adversarial/security/lifecycle aggregates, and live-UAT ledger;
5. real-Chrome release closure, full validation/regression, reviews/audits, and milestone completion.
