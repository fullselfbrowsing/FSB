# Phase 59: Current-User Alerts & Release Hardening - Context

**Gathered:** 2026-08-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver one browser-local deadline notification only when the current Drive account has been explicitly mapped to the exact current agreement owner, and only on the civil date exactly 90 calendar days before an eligible governing notice deadline. Persist an honest, deduplicated lifecycle ledger; revalidate account, access, governing path, deadline, owner mapping, source set, revisions, and notification authority before delivery; reconcile state after service-worker wake, browser start, delayed alarms, source withdrawal, or evidence replacement. Close v1.2.0 with golden-corpus, permission-negative, adversarial, lifecycle, regression, security, UI, and honest live-UAT evidence. This phase does not deliver to teammates, send email/chat/calendar messages, wake a sleeping device, send legal notices, mutate Drive content, infer an owner from a label/email, add OCR, or claim human evidence that was not observed.

</domain>

<decisions>
## Implementation Decisions

### Recipient Identity and Mapping
- **D-01:** Delivery is a local Chrome system notification only. Team/email/chat/calendar delivery remains out of scope.
- **D-02:** The current recipient is the fresh Drive `permissionId` already used as the corpus partition identity. No profile position, display name, email string, authuser index, or host label establishes current-user authority.
- **D-03:** Owner mapping is an explicit local policy action binding one exact current graph owner identity to the current account/corpus partition. Owner-label equality never maps a recipient.
- **D-04:** Absent, stale, ambiguous, cross-account, or differently mapped owner state is `not-locally-deliverable`; it never schedules or claims notification.
- **D-05:** Mapping and removal use the existing Interstitial consequence boundary, are re-derived in background immediately before the write, and never alter contract sources.

### Alert Eligibility and Time
- **D-06:** Only a Phase 56 `eligible` governing `notice-deadline` derivation can produce an alert. Renewal, expiration, termination, ambiguous, inaccessible, stale, or review-required dates cannot.
- **D-07:** The alert civil date is the governing deadline civil date minus exactly 90 calendar days. The delivery window is that full civil date in the governing cited/configured timezone; 09:00 local is the preferred alarm instant and a delayed alarm may deliver later only on that same civil date.
- **D-08:** If the alert civil date has passed, record `missed` and do not send a retroactive notification. If the deadline/evidence changes, supersede the old schedule before creating the replacement.
- **D-09:** Notification eligibility requires one exact current vendor, one exact current owner relation, exact/current deadline inputs, accessible governing citation evidence, and a complete current source set.

### Ledger, Dedupe, and Reconciliation
- **D-10:** Persist one background-only, account/corpus-partitioned alert envelope. An alert key is a digest of the exact agreement/family, deadline derivation, owner mapping, evidence revision, and rule version—not a label or raw alarm name.
- **D-11:** The closed lifecycle is `scheduled → attempted → delivered|failed`, with `missed` and `superseded` terminal dispositions. Public HUD state exposes scheduled, attempted, delivered, failed, missed, or not-locally-deliverable; superseded history stays private unless it is the current explanatory state.
- **D-12:** Mark `attempted` durably before calling `chrome.notifications.create`; mark `delivered` only after the promise succeeds. Reconcile an interrupted attempted state as `failed`, never delivered.
- **D-13:** Chrome alarms are wake hints. Startup, install/update, service-worker boot, truth refresh, and every Skopeo alert alarm run one idempotent reconciliation pass that compares durable desired state with `chrome.alarms.getAll()` and recreates, clears, supersedes, fails, or misses entries deterministically.
- **D-14:** Alarm and notification IDs use a fixed Skopeo prefix plus an opaque digest. Event listeners register synchronously at service-worker evaluation and route only exact recognized IDs.

### Delivery and Evidence Navigation
- **D-15:** Immediately before delivery, background re-authorizes the current account, corpus, exact source set, access, governing lineage, deadline, consequence, owner relation/mapping, timezone, citation revision, and alert key. Any uncertainty blocks notification and records a closed failed/missed reason without leaking source existence.
- **D-16:** A delivered notification names the bounded vendor, exact governing notice deadline, consequence, mapped owner label, and governing evidence label. It never includes raw IDs, private URLs, prompt/provider content, inaccessible labels, or unrelated vendor facts.
- **D-17:** Clicking the notification or its evidence action performs a fresh evidence reauthorization. Only then may background open the exact current governing source; otherwise the click is inert and the ledger records no false navigation success.
- **D-18:** Chrome notification API unavailability, permission denial, source authority unavailability, or create failure produces `failed`; it never falls back to a page alert, telemetry, network delivery, or another user.

### HUD and Release Evidence
- **D-19:** The existing folder/reading rail replaces the Phase 57 notification placeholder with a concise current local-alert status and explicit owner-mapping actions. No new shell, always-on badge, notification center, or detached settings app is created.
- **D-20:** Automated release approval requires a versioned gold corpus for exact governing paths, dates, addresses, calculations, ambiguity, permission negatives, Document 10, memo, and near-deadline behavior plus source replacement/deletion/revocation, duplicate alert, prompt injection, malicious filename, fake citation, cross-vendor exfiltration, lifecycle, and teardown negatives.
- **D-21:** Synthetic gold fixtures may approve deterministic correctness and security only. Legal/domain adjudication, authorized live Drive/Docs/PDF behavior, real account switching/revocation, VoiceOver, and human usefulness remain `human_needed` unless observed and recorded by an authorized reviewer.
- **D-22:** The release gate reports unsupported PDF/scan/download/live-host coverage explicitly; it never infers OCR, PDF text support, delivery, or live approval from unit fixtures.

### the agent's Discretion
- Exact schema keys, digest prefixes, bounded caps, storage prefixes, closed failure codes, alarm-name shape, and module boundaries within the accepted authority model.
- Exact copy and arrangement in the existing rail and native notification template, provided vendor/deadline/consequence/owner/evidence and honest delivery state remain clear and accessible.
- Exact same-day alarm time and reconciliation cadence, provided the civil alert date remains exactly deadline-minus-90 and late cross-day delivery becomes `missed`.
- Exact golden fixture organization and evaluation scoring, provided automated, provisional, legal/domain, authorized-live, and human accessibility evidence remain separately reported.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `skopeo-deadline-engine.js` already exports strict civil-date ordinal conversion and emits eligible results only after timezone, boundary, consequence, citation, exactness, currentness, and conflict checks.
- The Phase 54 corpus partition uses fresh Drive `permissionId`; Phase 55 graph records expose stable owner records and exact `assigned-owner` relations; Phase 56 truth owns current governing citations and deadline derivations.
- The corpus store already reserves the `alerts` purge participant; Phase 59 replaces its authorized-empty binder with the real alert store so source/partition withdrawal removes scheduled influence before later use.
- `background.js` already has one synchronous `chrome.alarms.onAlarm` fan-out, `onInstalled`, and `onStartup`; Phase 59 adds an early exact-prefix branch and idempotent reconcile hooks.
- The Phase 57 HUD has an intentionally neutral notification-delivery slot, exact private action registries, current projection authority, one Interstitial confirmation surface, and accessible folder/reading renderers.

### Established Patterns
- Trusted local stores use closed versioned envelopes, serialized mutations, cloned/frozen reads, and corpus-owned purge capabilities.
- Content receives only minimized frozen projections and opaque one-shot actions; raw account, source, graph, truth, policy, alert, alarm, notification, or storage authority remains background-only.
- Consequential effects recheck current authority immediately before the effect and fail closed on every error or stale transition.
- Chrome MV3 state lives in durable storage; alarms wake the worker but can be delayed and therefore cannot establish delivery truth.

### Integration Points
- Add alert schema/store/engine imports after truth/deadline dependencies and before HUD construction.
- Construct/recover the alert store inside the trusted corpus boot boundary and bind it to the reserved `alerts` participant before corpus recovery.
- Derive candidate alerts from exact current graph/truth/corpus snapshots after truth publication/inspection, then reconcile durable schedules and the Chrome alarm registry.
- Extend the current HUD projection/action registry and existing composer/runtime/shell rather than creating another content lifecycle.
- Add the required `notifications` manifest permission; `alarms`, `storage`, and the bundled icon already exist.

</code_context>

<deferred>
## Deferred Ideas

- Cross-person, email, chat, calendar, backend, acknowledgement, escalation, and browser-independent delivery remain TEAM-01..03.
- Notice drafting/sending, source mutation, OCR, dedicated PDF parsing, and additional corpus sources remain future requirements.
- A full notification history/settings application is deferred; Phase 59 exposes concise current status in the existing HUD and retains the complete private durable ledger.

</deferred>
