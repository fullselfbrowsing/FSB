# Phase 54: Permission-Scoped Drive Corpus Boundary - Context

**Gathered:** 2026-07-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the trusted Drive source boundary that every later Skopeo contract capability consumes: explicit stable-ID corpus enrollment, current-account authority, physical descendant membership, closed source-access states, per-operation access revalidation, revision/content fingerprints, idempotent reconciliation, and withdrawal-first removal of source-owned derived data.

This phase establishes authoritative account, corpus, and source records plus their lifecycle. It does not build the Chrome-local truth graph, extract contract facts, resolve governing lineage, render contract intelligence, answer questions, enforce Document 10 or memo policy, or deliver alerts. Those capabilities remain in Phases 55-59.

</domain>

<decisions>
## Implementation Decisions

### Enrollment & Corpus Membership
- Enrollment is an explicit **Enroll this folder** action available only while Skopeo is on an exact Drive folder. Background authority must re-fetch the claimed stable file ID and verify current account access plus folder MIME type before persisting enrollment; folder names and page copy are display-only.
- The enrolled root ID defines the corpus boundary. Direct child folders are vendor scopes, nested physical descendants inherit their nearest direct-child vendor, and files directly under the root are corpus-wide sources. Every admitted item requires verified physical parent ancestry and current access.
- Accessible shared or shared-drive items are included only when Drive parent ancestry places the actual item inside the enrolled root. A shortcut never widens the boundary to an external target, even when that target is otherwise accessible.
- Rename or move preserves enrollment because the stable root file ID remains unchanged. Trash, deletion, lost access, or active-account mismatch closes the corpus immediately and fails closed.

### Account Identity & Partitioning
- The active account authority is Drive `about.user.permissionId` obtained through the current page-owned Drive session. Email, display name, URL `authuser`, and Chrome profile position are never authority or partition keys.
- Persisted and in-memory authority is partitioned by a versioned exact tuple of `(accountPermissionId, corpusRootFileId)`. Every source-owned record also carries its stable source file ID; no global graph, search index, count cache, or result cache may influence another partition.
- v1.2 supports one active corpus per proven Drive account. Enrolling a different root is an explicit replacement, and the prior root loses all active authority before the replacement becomes visible or usable.
- Identity is re-read before corpus operations. A different permission ID immediately withdraws and tombstones the prior partition before the new identity can proceed; an unavailable or unprovable identity produces a neutral fail-quiet state and exposes no cached corpus data.

### Source States & Access Revalidation
- Source state is a closed six-member contract. `ready` requires current account/corpus access, valid ancestry, a supported readable content path, and a processed fingerprint matching the current source. `pending` means discovery, processing, or revalidation is incomplete. `unreadable` means an accessible source cannot yield reliable supported text. `download-blocked` means metadata is accessible but content export/download is denied.
- `inaccessible` represents explicit access denial or an opaque not-found response that cannot safely distinguish revocation from deletion. `missing` is emitted only after an authoritative reconciliation proves deletion, trash, or removal from the enrolled ancestry; an ambiguous 404 is never guessed to mean missing.
- A fresh account-and-source access certificate is required at ingestion, query, display, citation opening, and alert delivery. A source must be revalidated before it can influence ranking, traversal, relationships, counts, results, citations, or delivery. Identical checks may be coalesced only within one bounded operation, never reused across operation boundaries.
- Failure to obtain current proof withholds cached derived content immediately. Transient/API failure becomes metadata-minimized `pending`; confirmed denial becomes metadata-minimized `inaccessible`. Neither state exposes stale filenames, snippets, counts, relationships, citations, or prior answers.

### Reconciliation, Purging & Retention
- Build an initial recursive inventory, then reconcile from an account/corpus-bound Drive change token with targeted ancestry checks. Use a bounded full rescan when the token is invalid, membership is uncertain, or recovery requires it; change events outside the enrolled ancestry confer no corpus membership.
- Stable source identity, membership/metadata fingerprint, and content fingerprint remain separate. Prefer Drive revision/version/checksum evidence; derive a bounded export-content hash for Google-native files when no trustworthy content checksum exists. Rename/move avoids re-extraction when content is unchanged, while entering or leaving the enrolled ancestry still updates membership.
- Revocation, deletion, replacement, and account change publish a source tombstone or newer partition manifest first so no consumer can read old material. Source-owned fragments, indexes, citations, counts, relationships, and alert evidence are then removed. A validated replacement becomes visible only as one complete fragment, and crash recovery resumes from the fail-closed tombstone.
- Full source bytes and full extracted text exist only in memory for one bounded operation and are never retained by the normal path. Persistence is limited to bounded metadata, fingerprints, source state, and size-capped source-owned excerpts or spans needed by later evidence records. Diagnostics remain metadata-only and redacted.

### the agent's Discretion
- Exact closed schema field names, reason-code vocabulary, storage-key encoding, manifest/tombstone representation, and canonical hashing format, provided the accepted authority and removal semantics remain exact.
- Drive pagination, change-token checkpointing, single-flight/coalescing mechanics, retry limits, scan budgets, and recovery scheduling, provided no stale certificate crosses an operation boundary.
- Internal module boundaries, import order, background message names, bounded enrollment copy, and deterministic fixture construction.
- Exact visual placement and FSB-token styling of the in-context enrollment control and fail-quiet/source-state copy, provided Phase 52/53/53.1 lifecycle, accessibility, closed-copy, and zero-residue contracts remain unchanged.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `extension/catalog/handlers/gdrive.js` already exposes bounded `get_current_user`, `get_file`, `list_files`, `list_permissions`, and search reads through the active Drive page session. Its `permission_id`, stable file IDs, parents, MIME type, and typed fallback are the starting authority seam.
- `extension/utils/capability-fetch.js` owns the page-world `gapi.client.request` implementation and closed `gdrive` action vocabulary. It is the natural place to add bounded metadata/capability fields and Drive change-page reads without adding a new OAuth flow.
- `extension/catalog/handlers/gdocs.js` already performs origin-pinned Drive metadata reads and bounded Google Docs text export through `executeBoundSpec`, providing the current Google-native content-access precedent.
- `extension/content/skopeo-context-router.js` and `extension/content/skopeo-adapter-registry.js` already preserve stable Drive folder/file/document IDs behind recognized/uncertain/unsupported routing. Phase 54 should supply trusted enrollment and access authority to this deep-pack seam rather than weakening its identity rules.
- `extension/background.js` already owns exact tab/origin/generation projections, abortable controllers, serialized commit lanes, and final-currentness checks. The corpus authority and minimal view-model projection belong on this trusted side of the content boundary.
- `extension/utils/install-identity.js` and `extension/utils/skopeo-session-state.js` provide useful single-flight, strict-record validation, storage-failure, terminal-tombstone, and CommonJS-test patterns.

### Established Patterns
- Runtime modules are bundled classic scripts with closed frozen contracts, exact-key validation, a global service-worker/content namespace, and a CommonJS test export where needed.
- Background-owned tab, origin, generation, and installed capability state are authority; content-supplied IDs and tuples are revalidated claims. Page text, names, URLs, and DOM state cannot create account or corpus authority.
- Google reads use the existing page-owned same-origin session, bounded action vocabularies, origin pinning, response-size/shape checks, and structured typed failures. A second Google OAuth identity is not introduced by default.
- MV3 runtimes are disposable while browser-native storage is authoritative. Mutating asynchronous work uses generation/epoch ownership and fail-closed terminal records rather than trusting in-memory completion.
- Security-sensitive display data is projected minimally through text-only closed schemas; complete stores, parameter schemas, and execution authority remain background-only.

### Integration Points
- Extend the Drive request/handler seam with authoritative folder MIME/parent/access fields, `capabilities.canDownload`, trash/removal evidence, revision/version/checksums, pagination, and account-scoped changes/start-page-token reads.
- Add a strict background-owned corpus/source authority layer loaded before Skopeo controller routing. It should own enrollment records, partition manifests, source-state transitions, access certificates, fingerprints, change checkpoints, tombstones, and purge/recovery operations.
- Project only the current account/corpus/source state required by the active Drive/Docs deep pack into the existing Skopeo generation; never send the complete corpus store or source content to page content.
- Gate all later graph, query, display, citation, and alert consumers behind the same partition and fresh-certificate interface rather than allowing downstream modules to read storage directly.
- Add deterministic Node/fake-Chrome fixtures for enrollment, shared ancestry, shortcut exclusion, pagination, rename/move, change-token recovery, 403/opaque-404 classification, account switching, concurrent reconciliation, crash recovery, idempotency, and zero stale derived influence. Preserve focused Skopeo regressions plus `validate:extension` and the full test chain.

</code_context>

<specifics>
## Specific Ideas

- Apply the existing anchor rule to data authority: withdraw first, then resolve or replace. Brief absence is acceptable; stale cross-account or revoked intelligence is not.
- A direct child folder is the vendor scope, while a root-level file is corpus-wide policy/source material. Nested structure must not change vendor identity accidentally.
- Shortcut traversal is a boundary expansion and remains prohibited; actual shared descendants are admitted by verified ancestry rather than ownership labels.
- Account email can be displayed after current validation but never stored or compared as identity authority.
- A stale-data warning is insufficient for this phase: when current access cannot be proven, derived content disappears.

</specifics>

<deferred>
## Deferred Ideas

- Chrome-local graph records, extraction schemas, source-owned truth fragments, MiniSearch indexing, and prompt-injection boundaries — Phase 55.
- Governing lineage, exact facts, evidence confidence, citations, and deterministic deadline derivation — Phase 56.
- Contract folder and reading projections — Phase 57.
- Cited ask, Document 10, and complex-memo policy — Phase 58.
- Current-user alerts, delivery ledger, and milestone-wide live/adversarial release hardening — Phase 59.
- Multiple simultaneously active/named corpora, shortcut-target enrollment, new Google OAuth, IndexedDB migration, OCR, dedicated PDF parsing, external sources, and browser-independent synchronization remain future evidence-gated scope.

</deferred>
