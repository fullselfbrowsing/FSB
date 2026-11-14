# Pitfalls Research

**Domain:** High-trust contract intelligence and semantic overlays in an MV3 browser extension
**Researched:** 2026-07-14
**Confidence:** HIGH for security/lifecycle pitfalls; MEDIUM for corpus-specific extraction failure rates until sample agreements are supplied

## Critical Pitfalls

### Pitfall 1: Derived Data Becomes a Permission Side Channel

**What goes wrong:** A user loses Drive access—or switches Google accounts—but can still retrieve cached snippets, vendor counts, graph relationships, memo existence, citation titles, or prior answers.

**Why it happens:** Teams filter final search results but build one global graph/cache and assume ingestion-time access remains valid.

**How to avoid:** Partition all derived state by stable Drive account and enrolled corpus; attach every node/edge/excerpt to source ownership; revalidate access at query/display time; atomically tombstone source-owned records on 403, removal, permission change, or account mismatch. Restrict extension storage access to trusted contexts.

**Warning signs:** Cache keys lack account/source IDs; inaccessible nodes influence rankings; a 403 is logged but old results still render; counts change when restricted fixtures are added.

**Verification:** Two-user/one-profile fixtures, account-switch test, permission-revocation test, removed-file change test, and negative assertions for snippets/counts/edges/citations.

**Phase to address:** Drive permissions and source-store foundation, before graph/query/UI.

---

### Pitfall 2: Similarity Is Mistaken for Governing State

**What goes wrong:** The most relevant old clause is presented as current, or an amendment is treated as replacing the entire agreement when it changes only one section.

**Why it happens:** Generic RAG ranks passages but does not model execution status, effective dates, amendment scope, supersession, or conflict.

**How to avoid:** Maintain explicit document/clause lineage; require executed/effective evidence; resolve governing state before facts or synthesis; show historical contrast separately; abstain on unresolved precedence.

**Warning signs:** Answers cite whichever clause scores highest; active status comes from filename/order; adding Doc 11 does not invalidate Doc 4 facts/alerts.

**Verification:** Gold corpus with baseline agreement, partial amendment, full replacement, unsigned draft, and conflicting effective dates; every material fact must resolve through one governing path.

**Phase to address:** Truth graph and lineage, before deadline or cited-ask phases.

---

### Pitfall 3: Prompt Injection Enters Through Contracts or the Host Page

**What goes wrong:** A document or Drive DOM string instructs the model to ignore policies, reveal other sources, call tools, or fabricate a cleared conclusion.

**Why it happens:** Contract text is placed in the same instruction channel as system policy, or extraction calls retain agent/tool authority.

**How to avoid:** Treat page/source text as untrusted quoted data; use closed schemas; run extraction/synthesis without browser-tool authority; constrain answers to an evidence bundle; validate citation IDs and reject output that references inaccessible/unknown sources; sanitize rendered text.

**Warning signs:** Model output contains tool commands, references sources not in the bundle, follows document-written instructions, or introduces unsupported dates.

**Verification:** Poisoned-document fixtures, malicious filenames/HTML, fake citation IDs, and cross-vendor exfiltration prompts.

**Phase to address:** Extraction contract and renderer security before any provider-backed feature.

---

### Pitfall 4: Exact-Looking Dates and Addresses Are Wrong

**What goes wrong:** Skopeo computes a notice deadline from an expiration date, reverses a 60-day notice/90-day window, misreads a scan, chooses the wrong timezone, or displays the wrong written-notice address.

**Why it happens:** LLM extraction and OCR produce plausible values; legal date rules are collapsed into one date field; exactness in UI is mistaken for validation.

**How to avoid:** Keep signed/effective/term/renewal/notice-start/notice-deadline dates distinct; store raw clause/citation and deterministic calculation steps; require governing lineage; use explicit confidence/review state; block alerts from ambiguous or low-OCR facts.

**Warning signs:** No derivation trace; a notice deadline exists without notice clause citation; all confidence values are high; low-quality scans schedule alarms.

**Verification:** Boundary-day/leap-year/timezone tests, “60 days within 90-day window” fixture, conflicting-address fixture, and scan-induced digit substitutions.

**Phase to address:** Facts/deadline engine after lineage; alert phase must enforce eligibility.

---

### Pitfall 5: Incremental Updates Leave Ghost Truth

**What goes wrong:** Replacing, moving, or losing access to a document leaves stale facts, edges, search hits, badges, and scheduled alerts.

**Why it happens:** Updates merge new extraction into a global graph without removing the old source-owned fragment; modified time alone is treated as identity.

**How to avoid:** Stable file ID + revision/content fingerprint; atomic per-source replacement; source ownership on every record; recompute affected lineage/facts/deadlines/index; cancel or supersede ledger entries tied to the old evidence revision.

**Warning signs:** Node count only grows; old clauses remain searchable after replacement; duplicate alerts appear after re-index; removed sources still have citations.

**Verification:** Re-index idempotency, amendment replace, rename/move, delete, revoke, and rollback-on-invalid-extraction tests.

**Phase to address:** Graph/source-store foundation.

---

### Pitfall 6: Drive's Virtualized SPA Breaks Anchors

**What goes wrong:** A badge attaches to the wrong vendor row after scrolling; a supersession banner survives navigation; overlays cover host controls or remain after kill.

**Why it happens:** Drive recycles DOM rows, changes classes/labels, and navigates without full reloads; implementations retain element references or rely on positional selectors.

**How to avoid:** Semantic anchor descriptors keyed to validated file/document identity; observe DOM and geometry; invalidate detached/recycled targets; re-resolve after navigation/zoom/density change; fail quiet; one idempotent teardown removes observers, focus handlers, ghosting, and Shadow roots.

**Warning signs:** nth-child/hash-class selectors; stale element refs; badge identity changes when scrolling; off/kill leaves style or MutationObserver activity.

**Verification:** Virtualized-row recycling, reorder, SPA route, zoom, resize, keyboard, reduced-motion, and 100-cycle on/off residue tests.

**Phase to address:** Lifecycle/anchor foundation before contract views.

---

### Pitfall 7: “Automatic Notification” Is Overclaimed

**What goes wrong:** An alarm is scheduled but the owner never receives anything because the device slept, Chrome was closed, the owner is another teammate, permission was revoked, or the delivery channel failed.

**Why it happens:** Scheduling, alarm firing, notification creation, and human delivery are treated as one event.

**How to avoid:** Define recipient/channel semantics explicitly; use alarms as reconciliation triggers; recheck evidence/access/owner at send time; maintain scheduled/attempted/delivered/failed/missed ledger states; dedupe by vendor+event+evidence revision; surface missing owner or delivery failure. A local Chrome notification only reaches the current browser user.

**Warning signs:** “notified” is written when `chrome.alarms.create` succeeds; no failure UI; another employee is listed as owner with no external delivery adapter.

**Verification:** sleep/wake and browser-restart reconciliation, late alarm, owner change, evidence revision, duplicate-index, denied notification permission, and simulated adapter failure.

**Phase to address:** Notification phase after facts; delivery-channel scope must be approved in requirements.

---

### Pitfall 8: Compliance UX Sounds Like Legal Approval

**What goes wrong:** “Likely restricted” or an 82% score is treated as a definitive legal conclusion, especially when Document 10 or a complex memo is absent.

**Why it happens:** Product copy rewards decisiveness and hides conflicts/gaps; raw confidence percentages imply calibrated certainty.

**How to avoid:** Use evidence states (`EXTRACTED`, `INFERRED`, `AMBIGUOUS`, unreadable); explain why; label governing/history; require source opening for consequential conclusions; block “cleared” when Document 10 is missing/inaccessible; keep memos human-authored and exception-based.

**Warning signs:** Answers without citations; percentage-only confidence; “compliant/approved” labels; missing review policy does not change result state.

**Verification:** UX copy audit, missing Document 10/memo fixtures, conflict/abstention cases, and source-open UAT.

**Phase to address:** Shared trust-state design, then cited ask/policy phase.

## Technical Debt Patterns

| Shortcut | Immediate benefit | Long-term cost | Acceptable? |
|----------|-------------------|----------------|-------------|
| File names/order define active version | Fast demo | Silent wrong governing state | Never |
| One global graph/index | Simple storage | Cross-account and revocation leaks | Never |
| Merge-only updates | Easy incremental build | Ghost facts and duplicate alerts | Never |
| Selector-only anchoring | Quick mockup | Breaks on virtualization/redesign | Fixture-only prototype, never release |
| Store whole documents in `storage.local` | Easy queries | Sensitive retention and write/startup cost | Only encrypted/authorized diagnostic fixture, not normal path |
| Add OCR immediately | More apparent coverage | Bundle/performance/privacy and false exactness | Defer until corpus evidence justifies |
| Treat local notification as team delivery | Easy “done” checkbox | Wrong recipient semantics | Never without explicit current-user scope |

## Integration Gotchas

| Integration | Common mistake | Correct approach |
|-------------|----------------|------------------|
| Page-owned Drive GAPI | Assume page API presence/shape forever | Bounded actions, origin pinning, size caps, typed fallback, negative controls, live UAT |
| Drive permissions | Check only `permissions.list` during enrollment | Current-account partition plus query/send-time access/capability check; purge on revoke/removal |
| Download/export | Treat visible file as downloadable/indexable | Honor scope and `capabilities.canDownload`; blocked content becomes a gap |
| Chrome storage | Expose derived contract state to content scripts by default | Trusted-context access and message-based minimal view models |
| Chrome alarms | Assume exact or always-on timing | Persist due state, reconcile on wake/start/session, record late/missed delivery |
| Shadow DOM | Assume isolation solves layout/a11y | Still manage viewport collision, focus, screen readers, reduced motion, and teardown |

## Performance Traps

| Trap | Symptoms | Prevention | Threshold |
|------|----------|------------|-----------|
| Full corpus re-extraction on every invocation | Slow toggle, provider cost, rate limits | Fingerprints and per-source incremental replacement | Breaks quickly beyond a few documents |
| Render/observe every Drive row continuously | Scroll jank, observer storms | On-demand runtime, viewport-bounded anchors, batched observations | Dense/virtualized folder views |
| Send raw corpus for each question | Token blowup and leakage surface | MiniSearch candidates + bounded graph evidence bundle | Multi-document vendors |
| Load whole graph on every service-worker event | Wake latency/memory spikes | Compact indexes, partitioned reads, lazy subgraph loading; measure before IndexedDB move | Hundreds/thousands of docs |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Render extracted HTML | XSS/page compromise | Text nodes and strict sanitized rendering only |
| Provider call retains browser tools | Prompt injection can act | Extraction/synthesis calls have no tool authority |
| Citation accepts model-provided URL | Open redirect or inaccessible source disclosure | Resolve citation IDs through trusted source registry |
| Memo/Document 10 policy hard-coded by file position | Rename/reorder bypass | Stable configured file identity and access state |
| Logs contain clauses/addresses/answers | Sensitive data persists outside corpus controls | Metadata-only/redacted diagnostics and explicit debug consent |

## UX Pitfalls

| Pitfall | User impact | Better approach |
|---------|-------------|-----------------|
| Movie-HUD density | Users ignore everything | One state/one job; scarce halo; quiet vendors stay quiet |
| Sidebar detached from source | Reconciliation burden and distrust | Anchor status to row/clause and make citations navigable |
| Modal for uncertainty | Interruption without action | Inline confidence/gap state; reserve gates for irreversible actions |
| Ghost layer persists | Host feels broken | Temporary focused-ask state; guaranteed teardown |
| “Off” leaves a rail | Violates consent/attention promise | Zero visible or interactive residue when off |

## "Looks Done But Isn't" Checklist

- [ ] **Kill switch:** verify observers, ghosting, focus hooks, Shadow roots, alarms tied to session UI, and pending provider renders cannot resurrect the HUD.
- [ ] **Permission scope:** verify revocation/account switching removes snippets, counts, graph paths, citations, and notification evidence.
- [ ] **Governing lineage:** verify partial amendments, unsigned drafts, conflicts, and superseded clauses—not only simple version numbers.
- [ ] **Exact facts:** verify raw source span, derivation, timezone, confidence, and review eligibility for every deadline/address.
- [ ] **Notification:** verify delivery state and failure/reconciliation, not merely alarm creation.
- [ ] **Cited ask:** verify every material claim maps to an accessible source and unsupported claims are rejected/abstained.
- [ ] **Anchoring:** verify virtualization/reordering/SPA navigation and zero residue after repeated toggles.
- [ ] **Accessibility:** verify keyboard, focus, screen reader labels, contrast, zoom, and reduced motion in all three states.

## Pitfall-to-Build-Boundary Mapping

| Pitfall | Prevention boundary | Verification |
|---------|---------------------|--------------|
| Permission side channel | Source/account partition first | Revoke/switch negative suite |
| Wrong governing state | Graph lineage before facts/query | Amendment gold corpus |
| Prompt injection | Extractor schema/evidence boundary | Poisoned-source suite |
| Wrong dates/address | Deterministic facts before alerts | Boundary/date/address fixtures |
| Ghost truth | Atomic source replacement | Idempotency/delete/revoke suite |
| Anchor drift | Lifecycle + semantic anchor engine | Drive virtualization/redesign fixture |
| Notification overclaim | Delivery adapter/ledger after facts | Sleep/failure/dedupe UAT |
| Legal-approval UX | Shared trust states + policy gate | Copy/source-open/policy UAT |

## Sources

- [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) — isolated worlds, message boundaries, and untrusted-page guidance.
- [Chrome storage API](https://developer.chrome.com/docs/extensions/reference/api/storage) — access levels, quotas, and lifecycle.
- [Chrome alarms API](https://developer.chrome.com/docs/extensions/reference/api/alarms) — sleep, delay, and persistence limits.
- [Google Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth) — narrow/restricted scope posture.
- [Google Drive download/export](https://developers.google.com/workspace/drive/api/guides/manage-downloads) — `canDownload` and content-access constraints.
- [Google Drive changes](https://developers.google.com/workspace/drive/api/guides/manage-changes) — removals, loss of access, and incremental tokens.
- [Drive push notifications](https://developers.google.com/workspace/drive/api/guides/push) — receiver and channel-expiration limits.
- [Graphify how it works](https://github.com/Graphify-Labs/graphify/blob/v8/docs/how-it-works.md) — source hashes, stable IDs, provenance, and confidence states selectively adapted here.
- Local evidence: supplied requirements/design plus current FSB Drive/Docs handlers, capability bridge, overlay lifecycle, storage, and alarm code.

---
*Pitfalls research for: FSB v1.2.0 Skopeo*
*Researched: 2026-07-14*
