# Stack Research

**Domain:** On-demand MV3 browser HUD with permission-scoped Google Drive contract intelligence
**Researched:** 2026-07-14
**Confidence:** HIGH for browser/Drive integration posture; MEDIUM for PDF/OCR and team-notification delivery until representative files and recipients are available

## Recommended Stack

### Core Technologies

| Technology | Version / status | Purpose | Why recommended |
|------------|------------------|---------|-----------------|
| Existing FSB Manifest V3 runtime | Repo baseline; Chrome `>=88` | Service worker, dynamic content injection, messages, alarms, storage | Skopeo is an FSB capability, not a second application. MV3 forbids remotely hosted code and service workers are event-driven, so the design must extend current lifecycle patterns rather than introduce a long-lived runtime. |
| Existing bounded same-origin Drive/Docs reads | `gdrive` and `gdocs` T1a heads | Read accessible Drive metadata, permissions, and Google Docs text using the page-owned authenticated session | `extension/catalog/handlers/gdrive.js` and `gdocs.js` already implement fail-closed, origin-pinned reads. Reusing them avoids a second OAuth identity and preserves the user's current Drive access context. |
| Existing FSB provider layer | Current repo | Structured semantic extraction and cited question answering | Provider parity is already an FSB invariant. Contract extraction should use the shared provider surface with a strict schema and treat source text as untrusted data. |
| Compact native graph store | New schema, plain JavaScript | Stable document/clause/fact/event nodes plus typed relationships and provenance | Skopeo needs bounded lineage/path traversal, not a graph database. Plain records and adjacency indexes match Graphify's useful node-link ideas while remaining MV3-safe and dependency-light. |
| `chrome.storage.local` + trusted-context access | Current Chrome API; `unlimitedStorage` already granted | Persist source fingerprints, compact graph state, review state, alert ledger, and index snapshots | It survives service-worker eviction and browser restarts. Restrict access to trusted extension contexts and avoid storing full source files where compact excerpts/provenance suffice. |
| Existing MiniSearch | `^7.2.0` | Candidate retrieval over titles, clauses, facts, and citations | It is already bundled for the capability catalog. Use lexical retrieval to select a small evidence subgraph; graph traversal then resolves lineage and governing state. |
| Existing `chrome.alarms` lifecycle | Current Chrome API | Reconcile due events and re-arm owner reminders | FSB already uses alarm-backed state. Alarms may be delayed by sleep and should trigger reconciliation, not be treated as exact delivery guarantees. |

### Supporting Libraries

| Library / API | Version | Purpose | When to use |
|---------------|---------|---------|-------------|
| `@cfworker/json-schema` | `^4.1.1` | Validate extractor and graph mutations against closed schemas | Reuse for every AI-produced extraction fragment before it reaches the graph. |
| Existing JMESPath | `^0.16.0` | Bounded deterministic projection of provider/API results | Reuse only where current capability infrastructure already uses it; do not make graph queries an arbitrary-expression surface. |
| `chrome.notifications` | Chrome API; manifest addition required | Local reminder delivery | Use only if v1.2 defines the current browser user as a supported owner recipient. It cannot notify a different teammate by itself. |
| IndexedDB | Web platform API; conditional | Larger per-account graph/index storage | Add only if measured fixtures exceed a conservative `storage.local` budget or storage-write churn becomes material. Do not add a wrapper library before that threshold is proven. |
| PDF text extraction | Conditional spike | Read text-bearing signed PDFs | First try accessible, bounded Drive download/export or the rendered PDF text layer. Add a locally bundled parser only after representative PDFs prove it necessary. |

### Development and Evaluation Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Existing Node test harness | Unit and integration contracts | Add fixtures for active/superseded/amendment, conflicting dates, revoked access, low-OCR scan, missing final copy, Document 10, memo, and deadline deduplication. |
| Synthetic Drive DOM fixtures | Anchor resilience and visual state tests | Cover list virtualization, row recycling, SPA navigation, zoom, scroll, density changes, and unsupported-page recovery without hitting real Drive. |
| Golden extraction corpus | Accuracy/evaluation gate | Score exact dates, notice formulas, addresses, lineage, citations, abstention, and permission filtering separately; a single answer-quality score is insufficient. |
| Live Drive UAT | Authentication, permissions, and source navigation | Required before claiming permission preservation or reliable anchor/source behavior. Never fabricate unavailable access/revocation evidence. |

## Installation

No new runtime package should be installed for the foundation.

```bash
# Reuse current dependencies and Chrome APIs.
# A PDF parser is conditional on a fixture-backed spike, not a default install.
```

## Existing Integration Points

| Existing surface | Reuse |
|------------------|-------|
| `extension/catalog/handlers/gdrive.js` | Folder/file metadata, current user, and permissions through bounded page-owned GAPI reads. |
| `extension/catalog/handlers/gdocs.js` | Google Docs metadata, comments, and text export through origin-pinned reads. |
| `extension/utils/capability-fetch.js` | Existing bounded MAIN-world/same-origin request bridge; extend with explicit read actions only after negative controls. |
| `extension/utils/capability-catalog.js` | Pack registration/discovery boundary; Skopeo should not create a parallel tool universe. |
| `extension/utils/overlay-state.js` and content overlay modules | Lifecycle conventions, cleanup, Shadow DOM isolation, replay after injection, and reduced-motion behavior. |
| `extension/background.js` alarm/storage paths | Reconciliation and MV3 wake behavior; keep storage as truth and in-memory state disposable. |

## Alternatives Considered

| Recommended | Alternative | When the alternative is justified |
|-------------|-------------|-----------------------------------|
| Existing page-owned Drive/Docs session | New `chrome.identity` OAuth client | Only if representative signed PDFs cannot be read through the bounded same-origin route and the product accepts Google OAuth verification/restricted-scope obligations. |
| Compact native node-link records | Neo4j, FalkorDB, NetworkX, or Graphify runtime | Only for a future server-scale corpus that cannot be served by bounded client-side traversal; not for this milestone. |
| Lexical candidate retrieval + graph resolution | Vector database / full GraphRAG | Only if evaluation shows lexical retrieval misses governing evidence after schema, title, party, date, and relation indexes are in place. |
| Detect unreadable scans and request review | In-extension OCR stack | Only if real corpus volume makes human replacement/OCR impractical and the size, privacy, accuracy, and MV3 costs pass a dedicated phase. |
| Reconciliation on wake/session | Webhook/push infrastructure | Use a server webhook later if the requirement becomes browser-independent continuous sync; Drive push channels require an HTTPS receiver and renewal. |

## What NOT to Use

| Avoid | Why | Use instead |
|-------|-----|-------------|
| Graphify runtime / Python / NetworkX | Foreign runtime, packaging, and graph semantics do not fit a lightweight MV3 extension | Selectively copy the stable-ID, provenance, confidence, incremental-cache, and bounded-query concepts into plain JS contracts |
| GCP, NotebookLM, Sheets, or LM Studio as required components | Contradicts the approved native-FSB framing and adds separate permissions/state | Existing FSB provider/runtime plus Drive/Docs reads and local derived state |
| Remote scripts, hosted parser code, CDN icons/fonts | MV3 remote-code prohibition and supply-chain risk | Bundle audited local assets/code |
| Broad `drive.readonly` OAuth by default | Restricted scope, consent/verification burden, and broader access than the first pack needs | Current page-owned session or explicit user-selected/per-file access if OAuth becomes necessary |
| Full source documents in cross-user/global caches | Permission-revocation and data-leak risk | Per-account, per-file derived records with minimal cited excerpts and query-time access checks |
| OCR as a silent fallback | Low-quality scans can yield plausible but wrong dates/addresses | Explicit unreadable/low-confidence state and human review |
| A durable-background-sync claim in a browser-only build | Chrome alarms do not wake sleeping devices and may be delayed; Drive push requires a receiver | Reconcile on session/wake and label delivery semantics honestly |

## Stack Patterns by Variant

**Text-bearing Google Doc:** use current `gdocs.get_document_text`, source fingerprint, schema-validated extraction, graph replacement, and exact citations.

**Text-bearing PDF:** verify `canDownload`, use a bounded content path, parse locally, and retain byte/revision fingerprint plus page/span provenance.

**Scanned or blocked PDF:** record an evidence gap; do not infer governing facts or schedule an alert from it.

**Current user is the contract owner:** a Chrome notification can satisfy local delivery once the `notifications` permission and ledger are approved.

**Owner is another person:** requires an explicitly authorized delivery adapter (email/chat/calendar/server) and is a product decision; local Chrome notifications are insufficient.

## Sources

- [Graphify upstream: how it works](https://github.com/Graphify-Labs/graphify/blob/v8/docs/how-it-works.md) — stable IDs, provenance, confidence labels, content hashing, node-link format, and bounded graph queries.
- [Graphify upstream architecture](https://github.com/Graphify-Labs/graphify/blob/v8/ARCHITECTURE.md) — plain extraction fragments, schema validation, staged pipeline, and security boundaries.
- [Chrome Manifest V3](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3) — event-driven service workers and no remotely hosted code.
- [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) — isolated-world behavior and message/API boundaries.
- [Chrome storage API](https://developer.chrome.com/docs/extensions/reference/api/storage) — storage areas, quotas, and access levels.
- [Chrome alarms API](https://developer.chrome.com/docs/extensions/reference/api/alarms) — delay, sleep, and persistence semantics.
- [Chrome identity API](https://developer.chrome.com/docs/extensions/reference/api/identity) — OAuth token/account behavior if a later fallback requires it.
- [Google Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth) — narrow-scope guidance and restricted-scope obligations.
- [Google Drive download/export](https://developers.google.com/workspace/drive/api/guides/manage-downloads) — `capabilities.canDownload` and export constraints.
- [Google Drive changes](https://developers.google.com/workspace/drive/api/guides/manage-changes) — page-token incremental reconciliation.
- [Drive push notifications](https://developers.google.com/workspace/drive/api/guides/push) — HTTPS receiver and channel-expiration requirements.
- Local evidence: `extension/catalog/handlers/gdrive.js`, `extension/catalog/handlers/gdocs.js`, `extension/utils/capability-fetch.js`, `extension/manifest.json`, and `package.json`.

---
*Stack research for: FSB v1.2.0 Skopeo*
*Researched: 2026-07-14*
