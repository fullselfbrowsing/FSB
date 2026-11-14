# Phase 54: Permission-Scoped Drive Corpus Boundary - Research

**Researched:** 2026-07-18
**Scope:** Planning evidence for CORPUS-01 through CORPUS-06
**Overall confidence:** High for repository seams, Google Drive semantics, storage and authority architecture, and automated validation; medium for authenticated Drive response shapes and live account-switch/revocation behavior until user-controlled Drive UAT is recorded

<user_constraints>
## User Constraints (from CONTEXT.md)

Source for every constraint in this section: [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:7]

### Phase Boundary

Deliver the trusted Drive source boundary that every later Skopeo contract capability consumes: explicit stable-ID corpus enrollment, current-account authority, physical descendant membership, closed source-access states, per-operation access revalidation, revision/content fingerprints, idempotent reconciliation, and withdrawal-first removal of source-owned derived data.

This phase establishes authoritative account, corpus, and source records plus their lifecycle. It does not build the Chrome-local truth graph, extract contract facts, resolve governing lineage, render contract intelligence, answer questions, enforce Document 10 or memo policy, or deliver alerts. Those capabilities remain in Phases 55-59.

### Locked Decisions

#### Enrollment & Corpus Membership
- Enrollment is an explicit **Enroll this folder** action available only while Skopeo is on an exact Drive folder. Background authority must re-fetch the claimed stable file ID and verify current account access plus folder MIME type before persisting enrollment; folder names and page copy are display-only.
- The enrolled root ID defines the corpus boundary. Direct child folders are vendor scopes, nested physical descendants inherit their nearest direct-child vendor, and files directly under the root are corpus-wide sources. Every admitted item requires verified physical parent ancestry and current access.
- Accessible shared or shared-drive items are included only when Drive parent ancestry places the actual item inside the enrolled root. A shortcut never widens the boundary to an external target, even when that target is otherwise accessible.
- Rename or move preserves enrollment because the stable root file ID remains unchanged. Trash, deletion, lost access, or active-account mismatch closes the corpus immediately and fails closed.

#### Account Identity & Partitioning
- The active account authority is Drive `about.user.permissionId` obtained through the current page-owned Drive session. Email, display name, URL `authuser`, and Chrome profile position are never authority or partition keys.
- Persisted and in-memory authority is partitioned by a versioned exact tuple of `(accountPermissionId, corpusRootFileId)`. Every source-owned record also carries its stable source file ID; no global graph, search index, count cache, or result cache may influence another partition.
- v1.2 supports one active corpus per proven Drive account. Enrolling a different root is an explicit replacement, and the prior root loses all active authority before the replacement becomes visible or usable.
- Identity is re-read before corpus operations. A different permission ID immediately withdraws and tombstones the prior partition before the new identity can proceed; an unavailable or unprovable identity produces a neutral fail-quiet state and exposes no cached corpus data.

#### Source States & Access Revalidation
- Source state is a closed six-member contract. `ready` requires current account/corpus access, valid ancestry, a supported readable content path, and a processed fingerprint matching the current source. `pending` means discovery, processing, or revalidation is incomplete. `unreadable` means an accessible source cannot yield reliable supported text. `download-blocked` means metadata is accessible but content export/download is denied.
- `inaccessible` represents explicit access denial or an opaque not-found response that cannot safely distinguish revocation from deletion. `missing` is emitted only after an authoritative reconciliation proves deletion, trash, or removal from the enrolled ancestry; an ambiguous 404 is never guessed to mean missing.
- A fresh account-and-source access certificate is required at ingestion, query, display, citation opening, and alert delivery. A source must be revalidated before it can influence ranking, traversal, relationships, counts, results, citations, or delivery. Identical checks may be coalesced only within one bounded operation, never reused across operation boundaries.
- Failure to obtain current proof withholds cached derived content immediately. Transient/API failure becomes metadata-minimized `pending`; confirmed denial becomes metadata-minimized `inaccessible`. Neither state exposes stale filenames, snippets, counts, relationships, citations, or prior answers.

#### Reconciliation, Purging & Retention
- Build an initial recursive inventory, then reconcile from an account/corpus-bound Drive change token with targeted ancestry checks. Use a bounded full rescan when the token is invalid, membership is uncertain, or recovery requires it; change events outside the enrolled ancestry confer no corpus membership.
- Stable source identity, membership/metadata fingerprint, and content fingerprint remain separate. Prefer Drive revision/version/checksum evidence; derive a bounded export-content hash for Google-native files when no trustworthy content checksum exists. Rename/move avoids re-extraction when content is unchanged, while entering or leaving the enrolled ancestry still updates membership.
- Revocation, deletion, replacement, and account change publish a source tombstone or newer partition manifest first so no consumer can read old material. Source-owned fragments, indexes, citations, counts, relationships, and alert evidence are then removed. A validated replacement becomes visible only as one complete fragment, and crash recovery resumes from the fail-closed tombstone.
- Full source bytes and full extracted text exist only in memory for one bounded operation and are never retained by the normal path. Persistence is limited to bounded metadata, fingerprints, source state, and size-capped source-owned excerpts or spans needed by later evidence records. Diagnostics remain metadata-only and redacted.

### the agent's Discretion
- Exact closed schema field names, reason-code vocabulary, storage-key encoding, manifest/tombstone representation, and canonical hashing format, provided the accepted authority and removal semantics remain exact.
- Drive pagination, change-token checkpointing, single-flight/coalescing mechanics, retry limits, scan budgets, and recovery scheduling, provided no stale certificate crosses an operation boundary.
- Internal module boundaries, import order, background message names, bounded enrollment copy, and deterministic fixture construction.
- Exact visual placement and FSB-token styling of the in-context enrollment control and fail-quiet/source-state copy, provided Phase 52/53/53.1 lifecycle, accessibility, closed-copy, and zero-residue contracts remain unchanged.

### Specific Ideas

- Apply the existing anchor rule to data authority: withdraw first, then resolve or replace. Brief absence is acceptable; stale cross-account or revoked intelligence is not.
- A direct child folder is the vendor scope, while a root-level file is corpus-wide policy/source material. Nested structure must not change vendor identity accidentally.
- Shortcut traversal is a boundary expansion and remains prohibited; actual shared descendants are admitted by verified ancestry rather than ownership labels.
- Account email can be displayed after current validation but never stored or compared as identity authority.
- A stale-data warning is insufficient for this phase: when current access cannot be proven, derived content disappears.

### Deferred Ideas (OUT OF SCOPE)

- Chrome-local graph records, extraction schemas, source-owned truth fragments, MiniSearch indexing, and prompt-injection boundaries — Phase 55.
- Governing lineage, exact facts, evidence confidence, citations, and deterministic deadline derivation — Phase 56.
- Contract folder and reading projections — Phase 57.
- Cited ask, Document 10, and complex-memo policy — Phase 58.
- Current-user alerts, delivery ledger, and milestone-wide live/adversarial release hardening — Phase 59.
- Multiple simultaneously active/named corpora, shortcut-target enrollment, new Google OAuth, IndexedDB migration, OCR, dedicated PDF parsing, external sources, and browser-independent synchronization remain future evidence-gated scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

The descriptions below are the exact Phase 54 requirements; the support column identifies the planning contracts that make each requirement testable. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-REQUIREMENTS.md:46]

| ID | Description | Research Support |
|----|-------------|------------------|
| CORPUS-01 | User can enroll the designated `vendor agreements` root by stable Drive folder identity, with only accessible vendor descendants included in the corpus. | Background-only enrollment, fresh `permissionId`, root folder re-fetch, recursive physical-parent inventory, direct-child vendor assignment, shared-drive parameters, and shortcut exclusion. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-REQUIREMENTS.md:48] |
| CORPUS-02 | User sees source and derived intelligence only for the active Drive account and enrolled corpus; no global or cross-account graph/index can influence results. | Exact versioned partition tuple, one global visibility gate, source ownership, trusted-only storage, fresh account proof, account-switch withdrawal, and downstream consumer API. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-REQUIREMENTS.md:49] |
| CORPUS-03 | User sees an honest ready, pending, unreadable, download-blocked, inaccessible, or missing state for each expected source instead of inferred content from an unreadable file. | Closed state reducer, typed Drive error taxonomy, MIME/read-path allowlist, 404 ambiguity rule, metadata-minimized projections, and transition matrix. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-REQUIREMENTS.md:50] |
| CORPUS-04 | Skopeo revalidates current source access during ingestion, query, display, citation opening, and alert delivery. | Operation-scoped, in-memory certificates with per-operation account/root/source/ancestry checks, same-operation coalescing only, and final manifest-currentness checks. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-REQUIREMENTS.md:51] |
| CORPUS-05 | Removing a file, revoking access, or switching accounts removes its derived snippets, counts, relationships, search entries, citations, and alert evidence before later results are shown. | Tombstone-first visibility, purge participant registry, owned-key ledger, terminal purge gate, account replacement ordering, crash recovery, and negative influence tests. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-REQUIREMENTS.md:52] |
| CORPUS-06 | New, changed, moved, renamed, deleted, or revoked sources update idempotently from stable file identity plus revision/content fingerprint without retaining unnecessary full-document copies. | Baseline-token/full-scan/race-close algorithm, targeted ancestry, separate metadata/content fingerprints, source-generation staging, checkpoint-after-apply, and in-memory-only bounded content. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-REQUIREMENTS.md:53] |
</phase_requirements>

## Summary

Phase 54 should be planned as a background-owned authority kernel with three independently testable edges: a page-bound Drive transport, a durable fail-closed corpus store, and a minimal Skopeo projection. The content-side Drive router may claim a stable folder/document ID, but only the authority kernel may turn that claim into account, corpus, membership, source-state, or access authority. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:53; extension/content/skopeo-context-router.js:121; extension/background.js:1959]

The most important implementation finding is a prerequisite outside the new corpus namespace: `chrome.storage.local.setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS'})` applies to the whole storage area, while the production isolated content bundle currently reads or writes `storage.local` from diagnostics, automation logging, element-cache configuration, and CAPTCHA handling. Those four content-context paths must move behind exact, non-generic background messages before the corpus store can be protected from content scripts. [CITED: https://developer.chrome.com/docs/extensions/reference/api/storage] [VERIFIED: extension/background.js:575; extension/utils/diagnostics-ring-buffer.js:19; extension/utils/automation-logger.js:658; extension/content/dom-state.js:580; extension/content/actions.js:3441]

Google Drive change feeds are not folder-root membership feeds. A token reports account- or shared-drive changes, and a removal can mean deletion or loss of access; every relevant event therefore remains a hint until `files.get` plus physical-parent ancestry proves membership. An opaque 404 must become `inaccessible`, never `missing`; only a complete, authoritative reconciliation may emit `missing`. [CITED: https://developers.google.com/workspace/drive/api/reference/rest/v3/changes/list] [CITED: https://developers.google.com/workspace/drive/api/guides/handle-errors] [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:31]

Do not model Chrome storage writes as transactions. Model visibility through one controlling manifest record: withdrawal publishes a newer closed/tombstoned manifest before deleting owned keys; replacement stages a complete generation and publishes its pointer only after validation. Any crash leaves the controlling manifest closed, so wake recovery can safely resume purge or discard orphan staging. [CITED: https://developer.chrome.com/docs/extensions/reference/api/storage] [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:39]

No new runtime package is needed. Use the repository's classic-script/CommonJS pattern, existing page-bound read primitive, `chrome.storage.local`, native Web Crypto SHA-256, standalone Node/fake-Chrome tests, and the local-Chrome runner. The graph, MiniSearch index, extraction schemas, facts, citations, and alert engine remain downstream. [VERIFIED: package.json:14; package.json:81; extension/utils/skopeo-action-authority.js:190; .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:91]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Exact-folder enrollment affordance | Browser / Client (Skopeo content shell) | Browser / Client (service worker) | Content presents one native control and sends the current stable-ID claim; background rechecks sender tab, origin, generation, folder ID, account, and MIME before persistence. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:19; extension/background.js:1999] |
| Drive identity, metadata, ancestry, and content proof | Browser / Client (service worker authority over page-bound bridge) | External Google Drive API | The service worker owns policy and exact tab/origin binding; Google `about`/`files`/`changes` responses supply the external evidence through the current page-owned session. [VERIFIED: extension/utils/capability-fetch.js:5600; extension/utils/capability-fetch.js:5732] [CITED: https://developers.google.com/workspace/drive/api/reference/rest/v3/User] |
| Account/corpus partition and visibility gate | Database / Storage (`chrome.storage.local`) | Browser / Client (service worker) | Durable exact tuples, manifests, source records, tombstones, checkpoints, and epochs must survive disposable MV3 workers; only the background store may interpret them. [CITED: https://developer.chrome.com/docs/extensions/reference/api/storage] [CITED: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle] |
| Initial inventory and incremental reconciliation | Browser / Client (service worker) | External Google Drive API | Background schedules bounded pages/checkpoints and applies state transitions; Drive list/change APIs provide hints and current metadata. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:37] [CITED: https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list] |
| Operation-scoped access certificates | Browser / Client (service worker) | External Google Drive API | Certificates are policy receipts minted from fresh account/root/source/ancestry reads and are never page- or storage-owned authority. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:33] |
| Tombstone, purge, and recovery | Database / Storage | Browser / Client (service worker) | A single manifest controls visibility; serialized background work removes every source-owned participant and resumes nonterminal records after wake. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:39] |
| Source state and minimal display projection | Browser / Client (service worker to content) | Browser / Client (shared Skopeo shell) | Background emits only closed, fresh, display-safe view models; the existing shell remains the sole renderer and content never receives the corpus store. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:66; .planning/milestones/v1.2.0-SKOPEO-STATE-SNAPSHOT.md:203] |
| Future graph/query/citation/alert use | Browser / Client (future background consumers) | Database / Storage | Phase 54 owns the admission/certificate/purge interface that downstream phases must call; it does not implement their payloads. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-ROADMAP.md:152; .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:91] |

## Standard Stack

| Concern | Use | Planning note |
|---------|-----|---------------|
| Runtime modules | Bundled classic JavaScript IIFEs with frozen contracts, a `globalThis.Fsb*` export, and CommonJS test export | Match the established Skopeo and storage helpers; do not add a bundler-only corpus runtime. [VERIFIED: extension/utils/skopeo-session-state.js:1; extension/utils/install-identity.js:162] |
| Account/API transport | Existing exact-tab, exact-origin `FsbCapabilityFetch` page bridge using Drive-page `gapi` and Docs same-origin Drive reads | Add a private corpus action vocabulary and typed status preservation; do not add OAuth or surface corpus internals as catalog capabilities. [VERIFIED: extension/utils/capability-fetch.js:5732; extension/catalog/handlers/gdocs.js:385] |
| Durable state | `chrome.storage.local`, protected with `TRUSTED_CONTEXTS` and accessed only through a background corpus store | `local` persists until extension removal and the manifest already grants `storage` plus `unlimitedStorage`; persistence minimization still applies. [CITED: https://developer.chrome.com/docs/extensions/reference/api/storage] [VERIFIED: extension/manifest.json:7] |
| Ephemeral state | In-memory operation maps/abort controllers; `chrome.storage.session` only for optional in-flight hints | Session storage is cleared on extension reload/update/browser restart and cannot be authority for enrollment, manifests, or checkpoints. [CITED: https://developer.chrome.com/docs/extensions/reference/api/storage] |
| Hashing | Native `crypto.subtle.digest('SHA-256', ...)` over versioned canonical metadata or exact bounded content bytes | Reuse the existing Web Crypto/digest-hex pattern; no crypto package or custom hash. [VERIFIED: extension/utils/skopeo-action-authority.js:181] |
| Validation | Exact-own-key validators, closed enums, length/count/integer caps, immutable normalized records | This is the current Skopeo contract style and is sufficient without a new schema dependency. [VERIFIED: extension/content/skopeo-context-router.js:52; package.json:81] |
| Tests | Standalone Node `node:assert`, VM/fake-Chrome storage/API fixtures, plus a real local-Chrome extension contract | The repository already runs this style and has Chrome available locally. [VERIFIED: tests/install-identity.test.js:1; tests/skopeo-session-lifecycle.test.js:1; tests/skopeo-browser-contract.test.js:1] |

No package installation or package-legitimacy audit is required: the plan can implement the entire phase with browser-native APIs and existing repository code. [VERIFIED: package.json:81; .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:96]

## Existing Architecture and Required Gaps

### Drive transport is the right seam, but not yet an authority transport

`gdrive.get_current_user` already maps `about.user.permissionId`, and the handler pins all reads to `https://drive.google.com` through `executeBoundPageRead`. This is the correct authenticated-session seam. [VERIFIED: extension/catalog/handlers/gdrive.js:14; extension/catalog/handlers/gdrive.js:158; extension/catalog/handlers/gdrive.js:230]

The current Drive file fields omit `driveId`, `version`, revision/checksum fields, `capabilities.canDownload`, `capabilities.canListChildren`, `shortcutDetails`, and `resourceKey`; current list responses also omit `incompleteSearch`. The current page request collapses all HTTP failures to one fallback, which cannot distinguish denial, opaque 404, transient failure, or rejected pagination. [VERIFIED: extension/utils/capability-fetch.js:2977; extension/utils/capability-fetch.js:3014; extension/utils/capability-fetch.js:3036]

The current `gdocs.get_document_text` proves a Docs-origin metadata/export path, but the generic bound fetch reads the complete response, truncates the returned text to 256 KiB, and does not report truncation. It is usable precedent, not a trustworthy whole-content fingerprint path. [VERIFIED: extension/catalog/handlers/gdocs.js:420; extension/utils/capability-fetch.js:300; extension/utils/capability-fetch.js:316]

Both page-bound wrappers re-read the target tab and require its current origin to equal the request origin before injection. Therefore every corpus operation needs an extant exact Drive/Docs authority tab; without one, or if its account cannot be proven, the operation must remain fail-quiet/pending rather than use cached credentials. [VERIFIED: extension/utils/capability-fetch.js:5617; extension/utils/capability-fetch.js:5732; .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:25]

### Skopeo already has the outer authority owner

The current controller derives the content sender's tab ID, checks the exact active generation/profile/context/entity tuple before and after reads, consumes action tokens before dispatch, and refuses late results. Phase 54 should add corpus actions and projections inside this controller rather than add an always-on content owner. [VERIFIED: extension/background.js:1959; extension/background.js:1999; extension/background.js:2052]

The Drive/Docs context router proves only a bounded stable identity claim from exact-origin route evidence. It intentionally does not prove Drive account, API access, folder MIME, physical ancestry, enrollment, or source state. [VERIFIED: extension/content/skopeo-context-router.js:68; extension/content/skopeo-context-router.js:184]

Phase 53.1 requires Drive/Docs to keep delegating through the existing deep adapter and preserves one lifecycle/shell with background-owned projections. Corpus status should enrich that deep pack, not change general catalog resolution. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/53.1-generalize-skopeo-adaptive-huds-across-the-capability-catalo/53.1-CONTEXT.md:24; .planning/milestones/v1.2.0-SKOPEO-STATE-SNAPSHOT.md:209]

### Storage protection has a mandatory migration prerequisite

Chrome documents `setAccessLevel()` on a `StorageArea`, not an individual key; `TRUSTED_CONTEXTS` excludes contexts originating outside the extension. The secure interpretation is therefore area-wide: protect all of `storage.local`, call it on every worker boot before corpus work, and fail closed if it cannot be established. [CITED: https://developer.chrome.com/docs/extensions/reference/api/storage]

The isolated content bundle includes two utility modules and two content modules that directly use `storage.local`: diagnostics ring persistence, automation/session/DOM logs, `elementCacheSize`, and CAPTCHA settings/key access. A generic get/set proxy would recreate the leak, so migration needs fixed-action background handlers: append-only redacted diagnostics/log writes, bounded cache-setting projection, and background-owned CAPTCHA secret use. [VERIFIED: extension/background.js:579; extension/background.js:5396; extension/utils/diagnostics-ring-buffer.js:27; extension/utils/automation-logger.js:658; extension/content/dom-state.js:580; extension/content/actions.js:3441]

Extension pages such as the side panel/options page remain trusted contexts and may continue using `storage.local`; content scripts must receive only the exact settings/results their operation needs. [CITED: https://developer.chrome.com/docs/extensions/reference/api/storage] [VERIFIED: extension/ui/sidepanel.js:912; extension/ui/options.js:1325]

## Recommended Architecture

### Module responsibilities

Exact filenames are discretionary, but the planner should keep these boundaries independently testable. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:42]

| Recommended module | Sole responsibility | Must not do |
|--------------------|---------------------|-------------|
| `utils/skopeo-corpus-schema.js` | Closed source states/reasons, exact account/partition/source records, canonical key/fingerprint encoders, view-model validation | Chrome calls, Drive calls, DOM, graph/extraction. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:31] |
| `utils/skopeo-corpus-store.js` | Trusted-local boot gate, manifests, epochs, source generations, ownership ledger, tombstone/purge/recovery lanes | Drive classification, rendering, direct downstream payload interpretation. [CITED: https://developer.chrome.com/docs/extensions/reference/api/storage] |
| `utils/skopeo-drive-corpus-transport.js` | Private page-bound `about`/`files`/`changes`/bounded-content actions and normalized typed responses | Enrollment policy, storage, public catalog registration, raw error/message logging. [VERIFIED: extension/utils/capability-fetch.js:5732] |
| `utils/skopeo-drive-authority.js` | Fresh account/root/source/ancestry proof, enrollment admission, operation certificate issue/coalescing/invalidation | Persisting certificates, reusing proof between operations, trusting content claims. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:33] |
| `utils/skopeo-drive-reconciler.js` | Baseline-token inventory, recursive membership/vendor assignment, change drain, fingerprints, checkpoints, bounded rescan | Making change events membership authority or publishing incomplete scans. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:37] |
| `utils/skopeo-corpus-controller.js` | Sender/generation admission, enroll/replace/account-switch orchestration, minimal view models, future consumer facade | Raw storage reads from content, a second Skopeo lifecycle, graph/query/citation implementation. [VERIFIED: extension/background.js:617; .planning/milestones/v1.2.0-SKOPEO-ROADMAP.md:152] |

Load pure schema/store/transport/authority/reconciler/controller dependencies after `capability-fetch.js` and before the Skopeo controller block; inject only the existing content UI stack plus any bounded view-model contract required by the deep pack. [VERIFIED: extension/background.js:152; extension/background.js:326; extension/background.js:602]

### End-to-end authority flow

```text
untrusted content claim: {sender tab, generation, contextEpoch, drive-folder ID}
  -> current background Skopeo tuple check
  -> fresh page-bound about.user.permissionId
  -> fresh files.get(root ID): accessible + folder MIME + not trashed
  -> persist enrollment intent under exact account/root tuple
  -> staged recursive inventory + saved baseline token + change drain
  -> validate complete manifests/fingerprints
  -> publish one active partition pointer
  -> project only fresh, bounded corpus/source view state to content

every later consequential source operation
  -> fresh operation ID + account/root proof
  -> fresh source metadata + physical ancestry + readability proof
  -> in-memory source certificate
  -> derived consumer runs through corpus facade
  -> repeat local epoch/manifest/generation currentness before output
```

This flow preserves the locked distinction between a content claim, Google evidence, background authority, durable visibility, and display projection. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:18; extension/background.js:2020]

## Record and Key Contracts

Use versioned, exact-key records and encode storage keys from a length-prefixed/canonical exact tuple. A SHA-256 digest may keep raw IDs out of key names, but each validated record must still carry the exact `accountPermissionId`, `corpusRootFileId`, and, for source-owned records, `sourceFileId` so collisions or misplaced values fail validation. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:26; extension/utils/skopeo-action-authority.js:190]

Recommended controlling records are: [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:43]

| Record | Required semantics |
|--------|--------------------|
| Global control manifest | Monotonic `authorityEpoch`, `visibility: closed|active|purging|unproven`, and nullable active partition pointer. Every consumer checks this first. |
| Account enrollment pointer | One enrolled root per exact account permission ID; replacing it never changes the global active pointer until the previous partition is purged and the new root is validated. |
| Partition manifest | Exact tuple, monotonic epoch, lifecycle `staging|active|withdrawn|purging|purged`, scan generation, token mode (`user` or `drive`), checkpoint, and active source-manifest generation. |
| Source authority record | Exact tuple/source ID, one of the six source states, minimized reason, physical vendor scope, metadata/content fingerprints, and no certificate. |
| Source visibility manifest | Independent lifecycle `staged|active|withheld|purging|purged` and nullable active derived-generation pointer; lifecycle values never become seventh source states. |
| Ownership ledger | Versioned, paged source-owned keys or registered participant generations covering fragments, indexes, citations, counts, relationships, and alert evidence. |
| Tombstone | Exact owner tuple/source ID, newer epoch, terminal/in-progress purge state, redacted reason class, and no filename/snippet/excerpt. |

Store operation certificates only in memory. Persisting a certificate, a certificate expiry timestamp, or a previous successful access check would invite cross-operation reuse after worker wake. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:33] [CITED: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle]

## Access-Certificate Semantics

Treat a certificate as an immutable receipt for one source in one bounded operation, not as a session, TTL cache, or durable permission. Recommended fields are `schemaVersion`, `operationId`, `operationKind`, `tabId`, `exactOrigin`, Skopeo `generation/contextEpoch`, `authorityEpoch`, exact account/root/source IDs, partition/source epochs, current metadata/content/ancestry fingerprints, `checkedAt`, decision, and closed reason. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:33; extension/background.js:1970]

The operation kind is a closed enum containing exactly the locked checkpoints: `ingestion`, `query`, `display`, `citation-open`, and `alert-delivery`. Enrollment/inventory may use separate internal proof types but cannot substitute for a later source certificate. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:33]

Certificate issue order should be: (1) verify current tab/origin/generation, (2) read `about.user.permissionId`, (3) verify root folder/access/trash state once for the operation, (4) fetch the source metadata, (5) walk current physical parents to the exact root while assigning the nearest direct-child vendor, (6) prove the operation-specific read path/capability, and (7) freeze the receipt. Shared root/ancestor calls may single-flight only inside the same `operationId`; dispose the complete coalescing map on completion, abort, deadline, or stale generation. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:20; .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:33]

Immediately before any derived influence or output, repeat local currentness for tab/generation, global authority epoch, active partition pointer, partition/source epochs, and non-tombstoned manifest. If the operation exceeded its bounded deadline, obtain new network proof; never stretch the old certificate. [VERIFIED: extension/background.js:2052; .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:44]

For multi-source query/display operations, issue one certificate per contributing source. A source that fails proof is withdrawn/purged as required, the old result is discarded, and any later result is recomputed without that source; a single certificate may not authorize an entire partition. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:33]

## Drive API Semantics That Shape the Plan

### Identity and current access

Drive documents `User.permissionId` as the requesting user's ID visible in Permission resources; permission IDs are opaque unique grantee identifiers, while email may be absent. This directly supports the locked account key and rejects email/URL/profile-position substitutes. [CITED: https://developers.google.com/workspace/drive/api/reference/rest/v3/User] [CITED: https://developers.google.com/workspace/drive/api/reference/rest/v3/permissions]

A successful, exact-field `files.get` proves current metadata access to that actual file. Content readability is a separate proof: Google directs clients to check `capabilities.canDownload` before download/export, blobs use `files.get?alt=media`, and Google Workspace files use `files.export`. [CITED: https://developers.google.com/workspace/drive/api/guides/manage-downloads]

Normalize only allowlisted status/reason classes from the page bridge. Suggested mapping is: network/401/429/5xx to unproven or `pending`; metadata 403 to `inaccessible`; metadata 404 to opaque `inaccessible`; successful metadata plus `canDownload:false` or a content-only denial to `download-blocked`; schema/oversize/unsupported-path success to `unreadable` when access and ancestry remain proven. [CITED: https://developers.google.com/workspace/drive/api/guides/handle-errors] [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:31]

### Membership, shared drives, and shortcuts

For shared-drive support, `supportsAllDrives=true` is required on `files.get`, `files.list`, `changes.list`, `changes.getStartPageToken`, and permission operations; list/change requests also need `includeItemsFromAllDrives=true`, and `user` or specific `drive` corpora are preferred to `allDrives`. [CITED: https://developers.google.com/workspace/drive/api/guides/enable-shareddrives]

Shared-drive parent metadata can be absent when the requester lacks parent access. Missing parent evidence is therefore not proof of root ancestry: keep the source metadata-minimized `pending`/withheld and require a targeted retry or complete rescan. [CITED: https://developers.google.com/workspace/drive/api/guides/shared-drives-diffs]

A Drive shortcut is a separate `application/vnd.google-apps.shortcut` file with its own parent ACL and a target ID. Inventory may classify or ignore the shortcut record, but must never follow `shortcutDetails.targetId`; only the actual item's own parent chain can admit it. [CITED: https://developers.google.com/workspace/drive/api/guides/shortcuts] [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:21]

### Pagination and change feeds

`files.list` returns trashed items unless filtered, reports `nextPageToken` and `incompleteSearch`, and requires a rejected page token to be discarded and pagination restarted. Never publish an inventory while a page remains, a token was rejected, or `incompleteSearch:true`. [CITED: https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list]

`changes.list(includeRemoved=true)` can report removal caused by deletion or loss of access. It returns pages until `nextPageToken` ends and then supplies `newStartPageToken`; documented change page tokens do not expire. The locked invalid-token recovery should therefore cover API rejection, corrupt/mismatched stored tokens, mode/account/root changes, and recovery uncertainty—not claim normal token expiry. [CITED: https://developers.google.com/workspace/drive/api/reference/rest/v3/changes/list] [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:37]

### Content and fingerprint evidence

Drive `version` is monotonic but reflects every server change, including changes not visible to the user, so it is a reconciliation hint rather than a content fingerprint. `headRevisionId`, MD5, and Drive-provided SHA checksums are unavailable for Docs Editor files; the revision list may also be incomplete for frequently edited Docs/Sheets/Slides. [CITED: https://developers.google.com/workspace/drive/api/reference/rest/v3/files] [CITED: https://developers.google.com/workspace/drive/api/guides/manage-revisions]

Google Workspace exports are limited to 10 MB. Phase 54 resolves the v1 reader policy to exactly two paths: Drive MIME `application/vnd.google-apps.document` exported with exact MIME `text/plain`, and stored blob MIME exactly `text/plain` downloaded with `alt=media`. PDF, Sheets, Slides, binary, HTML, Markdown, CSV, and every other/generic `text/*` MIME remain `unreadable`; a permissive textual family match is forbidden. The exact content ceiling is 10,485,760 bytes (10 MiB): declared or streamed byte 10,485,761 closes as `too-large`/`unreadable`, the stream is cancelled where possible, and no truncated or partial hash is admitted. `canDownload:false` or a content-specific denial closes as `download-blocked`. [CITED: https://developers.google.com/workspace/drive/api/reference/rest/v3/files/export] [CITED: https://developers.google.com/workspace/drive/api/guides/ref-export-formats] [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:96]

The private content action must enforce a byte cap before returning data, cancel a stream after the cap, hash exact bytes, and report `too-large` rather than silently truncate. The existing 256-KiB generic fetch path cannot provide that guarantee. [VERIFIED: extension/utils/capability-fetch.js:300; extension/utils/capability-fetch.js:316]

## Reconciliation and Fingerprint Design

### Initial inventory with race closure

Use this order so changes during the recursive scan are not lost: [CITED: https://developers.google.com/workspace/drive/api/reference/rest/v3/changes/list] [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:37]

1. Freshly prove account and root; allocate a nonvisible scan generation under the exact partition.
2. Obtain and persist a start page token for `user`, or for the root's exact shared `driveId` when using a drive-scoped feed.
3. Recursively page `files.list` with `'<folderId>' in parents and trashed=false`, `spaces=drive`, `supportsAllDrives=true`, and `includeItemsFromAllDrives=true`.
4. Verify each returned child's own parent includes the queued physical parent; never follow shortcut targets. Assign a direct-child folder's stable ID as vendor scope and carry it to its descendants; root-level files get corpus-wide scope.
5. Stage exact source records/fingerprints without making the partition visible. A visited-ID set and depth/item/page/request/time budgets make duplicate/cycle/API anomalies fail closed.
6. Drain changes from the saved baseline token, re-fetch each candidate, and repeat targeted ancestry. Events outside the root have no authority.
7. Persist every state/tombstone and only then checkpoint `newStartPageToken` and publish the complete partition/source manifest generation.

If any list page is rejected, incomplete, malformed, over budget, or has unprovable parent data, leave the scan generation invisible, put affected sources in metadata-minimized `pending`, and schedule a bounded full rescan. [CITED: https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list] [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:37]

### Incremental changes

For each change, use the stable file ID only to locate prior state; perform a current `files.get` and ancestry walk before admitting or retaining membership. A rename changes display/metadata fingerprint; a move may change vendor scope or membership; neither forces reprocessing if the content fingerprint is unchanged. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:38]

For `removed:true` without a usable file resource, immediately withhold/tombstone the prior source and classify it `inaccessible`, because deletion and lost access are indistinguishable. A later complete scan or accessible metadata showing trash/out-of-root may promote it to `missing`; the removal event or a 404 alone may not. [CITED: https://developers.google.com/workspace/drive/api/reference/rest/v3/changes/list] [CITED: https://developers.google.com/workspace/drive/api/guides/handle-errors]

Checkpoint the new change token only after all pages, targeted validations, tombstones, purges, and source manifest writes succeed. A crash before checkpoint replays the same changes through idempotent stable-ID/epoch operations. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:37]

### Three separate identities/fingerprints

| Value | Recommended canonical inputs | Consequence |
|-------|------------------------------|-------------|
| Stable source identity | Exact Drive file ID, always scoped by exact account/root partition | Locates one source across rename/move; never proves access or membership. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:38] |
| Membership/metadata fingerprint | Versioned exact sequence of source ID, sorted/current parents, root-relative vendor ID, MIME, trash, `driveId`, bounded current name, size, and relevant read capabilities | A change triggers reclassification/placement/display update, but does not by itself trigger extraction. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:38] |
| Content fingerprint | Prefer Drive SHA-256 for stored blobs; otherwise hash exact bounded downloaded/exported bytes. Keep Drive `version`, revision ID, MD5/SHA1, and size as labeled evidence/hints, not interchangeable algorithms | Equality permits reusing a later source fragment after fresh authority; inequality stages a replacement. Google-native metadata-only version changes can retain the same export hash. [CITED: https://developers.google.com/workspace/drive/api/reference/rest/v3/files] |

Canonical formats must include a schema/version prefix, fixed field order, explicit nulls, length-safe encoding, and sorted structural arrays. Hash content bytes exactly; do not Unicode-normalize, trim, or silently truncate exported text before hashing. [VERIFIED: extension/utils/skopeo-action-authority.js:190; .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:43]

## Closed Source-State Reducer

The state reducer should accept evidence records, not arbitrary requested next states, and should close derived visibility before every non-`ready` transition. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:31]

| State | Required evidence | Projection/derived behavior |
|-------|-------------------|-----------------------------|
| `ready` | Fresh account/root/source proof, proven physical ancestry, supported bounded readable path, successful exact content fingerprint, and processed fingerprint current | May expose freshly validated bounded metadata and activate the matching source generation. |
| `pending` | Discovery/reconciliation/revalidation in progress, transient/network/401/429/5xx failure, unprovable parent, interrupted scan, or retryable budget failure | Clear stale filename/copy from projection and withhold the active derived pointer; physical staged data may remain hidden for retry. |
| `unreadable` | Metadata and ancestry accessible, but MIME/path/size/empty or invalid content cannot yield reliable supported text | Show only freshly validated bounded state metadata; no content-derived generation. |
| `download-blocked` | Metadata and ancestry accessible, but `canDownload:false` or content export/download is specifically denied | Show freshly validated bounded state metadata; no content-derived generation. [CITED: https://developers.google.com/workspace/drive/api/guides/manage-downloads] |
| `inaccessible` | Source metadata returns explicit denial or opaque 404, or a removal event cannot distinguish revoke/delete | Publish metadata-minimized tombstone first, purge source-owned derived data, and expose no stale existence/name evidence. [CITED: https://developers.google.com/workspace/drive/api/guides/handle-errors] |
| `missing` | A complete authoritative scan or accessible metadata proves trash, deletion, or physical removal from enrolled ancestry | Publish tombstone, purge all source-owned data, retain only bounded terminal identity/state needed for idempotency. |

Unknown states, reasons, response keys, or impossible transitions must be rejected; do not add `error`, `stale`, `revoked`, or `processing` as seventh display states. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:31]

## Account Switch, Identity Failure, and Corpus Replacement

Begin every corpus operation with `about.user.permissionId`. If it is unavailable, synchronously publish a newer global `unproven/closed` control manifest, invalidate all in-memory certificates/controllers, project neutral fail-quiet state, and expose no cached data; a transient identity failure need not physically erase a partition that remains unreachable behind the closed gate. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:28]

If the proven permission ID differs from the active manifest, use this strict order: (1) close the global pointer and increment authority epoch, (2) abort operations and destroy all certificates, (3) tombstone the old partition and every source, (4) purge every owned category to terminal `purged`, (5) locate at most one enrollment for the newly proven account, (6) freshly validate/scan it, and only then publish it active. No new-account view/result may appear while old-account purge is incomplete or failed. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:27; .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:39]

Replacing a root for the same account uses the same sequence: persist the new enrollment intent only after fresh root/folder proof, withdraw and purge the old active root, fully validate the replacement in staging, then publish one complete active pointer. Brief absence is the intended behavior. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:19; .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:27]

Email/display name may be projected ephemerally only after the current `permissionId` proof; never store or compare it as account authority. URL `authuser` and profile order remain ignored even when they appear to match. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:25; .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:83]

## Tombstone-First Purge and Crash Recovery

Chrome's documented storage interface provides asynchronous `get`, `set`, and `remove` on a storage area but no transaction/CAS primitive. The safe planning consequence is a single-record visibility gate plus resumable idempotent writes—not a claim that a multi-key `set` is transactional. [CITED: https://developer.chrome.com/docs/extensions/reference/api/storage]

### Withdrawal protocol

1. Serialize the exact global/partition/source lane and re-read current epochs.
2. Write one newer controlling source or partition manifest with `visibility=purging`, no active generation pointer, and a tombstone reason before removing any payload key.
3. Enumerate the source ownership ledger/registered participants and remove fragments, indexes, citations, counts, relationships, result caches, and alert evidence. Each participant operation is repeatable.
4. Verify no owned key/participant generation remains; then write terminal `purged`. Keep the corpus/output gate closed until this succeeds.
5. Advance the reconciliation checkpoint only after the tombstone and purge terminal are durable.

This ordering is required by the locked withdrawal-first contract and makes stale data unreachable even if the worker stops between any two awaits. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:39] [CITED: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle]

### Replacement protocol

1. Close/tombstone the prior visible source generation.
2. Write replacement payloads beneath an immutable partition/source/fingerprint generation and build its complete ownership ledger while invisible.
3. Validate exact owner tuple, source ID, content fingerprint, record counts/digests, and participant completion.
4. Publish the one source manifest pointer as the final visibility write; then remove obsolete orphan generations.

Phase 54 should implement this as an opaque source-owned participant protocol with fake fragment/index/citation/count/relationship/alert participants in tests. Phase 55 supplies real graph/index fragments through that protocol rather than Phase 54 building them. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-ROADMAP.md:152; .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:39]

### Wake recovery

On every service-worker boot and before corpus admission, scan only the bounded control/manifest index: any `staging`, `withdrawn`, or `purging` record remains invisible; resume purge, discard orphan staging, or restart reconciliation. In-memory certificates never survive wake, and storage/cleanup failure leaves the control manifest closed. [CITED: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle] [VERIFIED: extension/utils/skopeo-session-state.js:49]

## Minimal UI and Consumer Contract

Add the enrollment action only for the exact recognized Drive-folder context and derive sender tab/generation/entity authority exactly as current Skopeo reads do. The background re-fetches the claimed ID; a folder name, visible row, URL copy, or content-supplied account value never reaches persistence authority. [VERIFIED: extension/content/skopeo-context-router.js:184; extension/background.js:1999]

Project a closed minimal view model such as `unconfigured`, `validating`, `active`, or `fail-quiet` plus the six source states and locally owned copy tokens. Do not send account permission IDs, the complete source list/store, filenames during pending/inaccessible states, content, excerpts, change tokens, resource keys, ownership ledgers, or certificates to content. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:34; .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:71]

Expose one future-consumer background facade—conceptually `withCertifiedSource(operationKind, tuple, sourceId, callback)` and `withCertifiedSources(...)`—that performs proof, hands bounded in-memory content to an authorized callback, and repeats local currentness before publish. Downstream phases must not read corpus storage directly. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:72]

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---------|-------------|-------------|-----|
| Google identity | Email matching, `authuser`, Chrome profile position, or a new OAuth flow | Fresh page-owned Drive `about.user.permissionId` | It is the locked opaque account authority and avoids two conflicting Google identities. [CITED: https://developers.google.com/workspace/drive/api/reference/rest/v3/User] |
| Cryptographic digest | Custom hash, delimiter-concatenated IDs, or MD5 as security proof | Versioned canonical bytes plus native Web Crypto SHA-256; Drive checksums as labeled evidence | Existing native pattern is available and avoids ambiguous encodings. [VERIFIED: extension/utils/skopeo-action-authority.js:190] |
| Folder membership | Name search, ownership labels, full-text search, shortcut target traversal, or change-event admission | Direct-child pagination plus current physical-parent walk to the exact root | Search/change/shortcut semantics do not prove the locked boundary. [CITED: https://developers.google.com/workspace/drive/api/guides/shortcuts] |
| Atomic database | Multi-key storage writes assumed transactional | One controlling manifest pointer, immutable staging generations, tombstone-first purge, recovery | Chrome documents storage operations but not a transaction primitive. [CITED: https://developer.chrome.com/docs/extensions/reference/api/storage] |
| Content extraction | OCR, PDF parser, Graphify runtime, whole-corpus uploads, or full persistent source text | Closed bounded read paths and honest `unreadable` until later phases add supported consumers | These are explicitly deferred and violate retention scope. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:91] |
| Storage bridge | Generic content-script `get/set/remove` proxy | Exact fixed-action background settings/log/CAPTCHA operations | A generic proxy would nullify trusted-only storage and allow corpus-key probing. [CITED: https://developer.chrome.com/docs/extensions/reference/api/storage] |

## Common Pitfalls

### Treating change events as membership or deletion proof

`changes.list` is broader than the enrolled folder and `removed` conflates deletion with loss of access. Re-fetch and walk ancestry; use `inaccessible` until a complete reconciliation proves `missing`. [CITED: https://developers.google.com/workspace/drive/api/reference/rest/v3/changes/list]

### Reusing a successful access check

A stored or cross-operation certificate becomes stale authority. Keep receipts in an operation-owned map, destroy them at the boundary, and repeat account/source proof for every ingestion/query/display/citation/alert operation. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:33]

### Enabling trusted-only storage before migrating content consumers

Area-wide access control will break current diagnostics/log/session persistence, cache configuration, and CAPTCHA secret reads. Move persistence wholly into `background.js` or a literal background-only trusted feature store absent from manifest content scripts and both dynamic injection lists. Dual-loaded diagnostics/automation utilities must contain zero direct `chrome.storage.local` calls/listeners on every branch; content uses named bounded feature messages only. Prove the full injected dependency closure, fixed dual-loaded files, trusted-store load order, and lack of generic proxy before gating feature/corpus boot. [VERIFIED: extension/background.js:579; extension/utils/diagnostics-ring-buffer.js:19; extension/utils/automation-logger.js:658; extension/content/dom-state.js:580; extension/content/actions.js:3441]

### Hashing a truncated export or treating `version` as content identity

The existing bound fetch truncates returned text, and Drive version covers metadata changes. A corpus action needs exact-byte cap/hash semantics; Google-native files use bounded export hash to avoid reprocessing a rename or metadata-only change. [VERIFIED: extension/utils/capability-fetch.js:316] [CITED: https://developers.google.com/workspace/drive/api/reference/rest/v3/files]

### Publishing replacement data before old authority is closed

Even a complete new fragment is unsafe while the old manifest remains visible. Tombstone first, purge all owned influence, validate staging, and publish one pointer last; storage failure leaves the corpus closed. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:39]

### Leaking existence through error UI or diagnostics

An inaccessible/pending record must not retain projected names, counts, snippets, relationships, raw Drive messages, IDs, or URLs. The exact current Drive file/Docs source may render a locally owned generic six-state token when identity is unsafe. Corpus rows require fresh per-source `display` certification in one bounded operation; prior rows/counts are withdrawn before unproven, pending, inaccessible, missing, or fail-quiet paint, and an aggregate is absent unless its complete source set remains certified through final assembly. Keep diagnostic reasons closed and metadata-only; render local copy tokens through text-only sinks. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:34; .planning/milestones/v1.2.0-SKOPEO-STATE-SNAPSHOT.md:193]

## Recommended Plan Boundaries

| Order | Plan boundary | Primary output |
|-------|---------------|----------------|
| 1 | Closed schema, six-state reducer, canonical partition/source keys, metadata/content fingerprints | Pure modules and deterministic fixtures; no Chrome/Drive calls. |
| 2 | Trusted-local boot gate, content-storage migration, manifests, source ownership, tombstone/purge/recovery | Secure durable substrate and real-Chrome access-level proof. |
| 3 | Private Drive/Docs corpus transport with fields, shared-drive parameters, typed errors, change pages, bounded exact-byte content action | Uniform fakeable transport; no public catalog capability. |
| 4 | Enrollment, fresh account/root/source/ancestry certificates, account switch and root replacement | Background authority kernel and negative certificate tests. |
| 5 | Initial inventory, baseline-token race closure, incremental reconciliation, state/fingerprint transitions | Idempotent reconciler and crash/checkpoint tests. |
| 6 | Current Skopeo controller/deep-pack integration, minimal enrollment/status UI, package registration, browser/UAT ledger | End-to-end Phase 54 focused gate without downstream graph work. |

This ordering puts closed contracts and the storage security prerequisite ahead of API orchestration, then integrates only after authority/reconciliation are independently green. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:68; package.json:31]

## Security Domain

### Trust boundaries

| Boundary | Trust rule | Required control |
|----------|------------|------------------|
| DOM/content script | Treat folder IDs, filenames, account hints, URLs, and UI state as claims | Exact message allowlist; derive tab/generation/entity from `sender`; background re-fetches every claimed Drive ID. [VERIFIED: extension/background.js:1999] |
| MAIN-world Drive bridge | Credentialed transport, but every response is untrusted external input | Private fixed actions, origin/shape/type/size validation, typed closed errors, no generic fetch or catalog capability. [VERIFIED: extension/utils/capability-fetch.js:316] |
| Background authority kernel | Sole policy and certificate issuer | Exact partition/source lanes, fresh proof per operation kind, local currentness check immediately before output. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:33] |
| `chrome.storage.local` | Durable authority only after content access is disabled | Migrate injected consumers, then call area-wide `setAccessLevel({accessLevel: "TRUSTED_CONTEXTS"})`; expose no generic storage proxy. [CITED: https://developer.chrome.com/docs/extensions/reference/api/storage] |
| Drive API | Identity/access evidence, not an authorization decision by itself | Normalize only requested fields; prove opaque account, root, source, and physical ancestry at the same operation boundary. [CITED: https://developers.google.com/workspace/drive/api/reference/rest/v3/User] |
| Future graph/index/citation/alert consumers | Untrusted callers of corpus authority | Background callbacks receive only certified bounded source material; durable influence is registered to the source ownership ledger. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:72] |

The implementation should cover ASVS-style authentication, session lifecycle, access control, input validation, cryptography, logging, and stored-data protection: opaque `permissionId` identity; operation-scoped certificates; exact object-level partition/source authorization; closed parsers; native SHA-256; metadata-only diagnostics; and trusted-only durable storage. This is a design mapping, not a claim of formal ASVS certification. [VERIFIED: extension/utils/skopeo-action-authority.js:190; extension/utils/diagnostics-ring-buffer.js:19]

### Threat and negative-test matrix

| Threat | Mandatory negative oracle |
|--------|---------------------------|
| Spoofed email, `authuser`, folder name, or copied URL | Enrollment and corpus access stay closed unless the fresh opaque account/root/source proof matches. |
| Forged/cross-tab/cross-generation content message | Reject before Drive or storage access; no existence-sensitive response. |
| Shortcut targeting an external descendant | Keep shortcut metadata only and never admit the target through the shortcut. [CITED: https://developers.google.com/workspace/drive/api/guides/shortcuts] |
| Shared item with missing/unprovable physical parent | State is `pending` or `inaccessible`, never `active`. |
| Replayed certificate or certificate reused for another operation kind | Reject; receipts are immutable, in-memory, exact-kind, and destroyed at operation end. |
| Account/root/source epoch changes after proof | Final local currentness check suppresses output and triggers withdrawal. |
| Cross-account/root/partition/source key substitution | Canonical tuple mismatch rejects before lookup; no fallback scan. |
| Drive 403/404 or `removed` change used as an existence oracle | Return the same quiet unavailable projection; require complete reconciliation before `missing`. [CITED: https://developers.google.com/drive/api/guides/handle-errors] |
| Crash/quota failure during replacement or purge | Controlling manifest remains closed; wake recovery resumes purge or discards invisible staging. |
| Malicious filename/error text/HTML | Never persist or render raw external messages; locally owned tokens through text-only sinks. |
| Direct content-script storage access or a generic storage proxy | Build/static scan fails; real-Chrome probe proves content cannot read/write/remove a sentinel. |
| Incomplete pagination, cyclic ancestry, change-feed race, or oversized export | Fail closed with deterministic bounds; do not publish a partial inventory or truncated content fingerprint. |

## Validation Architecture

Phase 54 needs fast deterministic task/plan feedback, affected-wave sampling, one final integration gate, a narrow real-Chrome boundary contract, and an authenticated Drive ledger that remains final/manual evidence only. Existing project validation is `npm run validate:extension && npm test`; the repository already uses standalone `node:test`/assert-style focused files, so no new test dependency is required. [VERIFIED: package.json:31]

### Test layers and commands

| Layer | Command | Target latency | Purpose |
|-------|---------|----------------|---------|
| Task-local | Owned `node tests/<phase-54-file>.test.js` plus `node --check <changed-js>` | under 15 seconds | Immediate implementation-task feedback for the changed schema, store, transport, authority, reconciliation, runtime, or static boundary. |
| Plan / affected wave | Relevant dependency/focused tests through that plan, plus the affected storage/message static check once it exists | under 60 seconds | Prove the changed boundary and its dependencies without requiring the entire six-test/browser/repository gate after every plan or wave. |
| Final phase-focused | `node tests/skopeo-corpus-schema.test.js && node tests/skopeo-corpus-store.test.js && node tests/skopeo-drive-corpus-transport.test.js && node tests/skopeo-drive-authority.test.js && node tests/skopeo-drive-reconciler.test.js && node tests/skopeo-corpus-runtime.test.js` | under 60 seconds | Exact full Phase 54 deterministic gate retained for final integration/phase verification; it may also run earlier when change risk warrants. |
| Final static/repository | `node scripts/verify-skopeo-storage-boundary.mjs`, then `npm run validate:extension && npm test` | existing suite budget | Final package/injection/storage constraints and repository regressions; may run earlier when risk warrants. [VERIFIED: package.json:31] |
| Final real Chrome | `node tests/skopeo-browser-contract.test.js` | browser harness budget | Final loaded-extension storage-isolation, accessibility, host-integrity, and lifecycle proof; may run earlier when browser-bound changes warrant. |
| Authenticated live Drive | `54-HUMAN-UAT.md` manual ledger only | final/manual; no automated latency claim | Optional user-authorized account/Drive response evidence. It is never per-plan/wave automated evidence, and unrun rows remain `human_needed`/not approved. |

### Requirement-to-test map

| Requirement | Automated evidence | Live/manual evidence |
|-------------|--------------------|----------------------|
| CORPUS-01 | Schema/reducer and authority tests cover exact enrolled-root membership, recursive physical ancestry, pagination, cycles, shared items, shortcut exclusion, and baseline/change race closure. | Enroll one exact folder and prove in-root/out-of-root/shared/shortcut cases. |
| CORPUS-02 | Store/runtime tests prove account mismatch closes all visibility, tombstones old partitions, purges every participant, and cannot resurrect after simulated wake/crash. | Switch Google accounts while active and while offline. |
| CORPUS-03 | Transport/authority tests prove exact private actions, sender binding, opaque account proof, response allowlists, fixed limits, and no generic Drive catalog/storage API. | Inspect actual Drive/Docs success and 403/404/blocked-download shapes. |
| CORPUS-04 | Certificate tests prove fresh same-operation evidence, exact operation kind/tuple/source, same-operation-only coalescing, epoch invalidation, and final currentness. | Revoke/move the item between proof and use and verify no result/citation/status leak. |
| CORPUS-05 | Store/reconciler/runtime tests inject failure after every manifest/payload/checkpoint write and verify closed recovery plus complete participant purge. | Delete, trash, revoke, move out, replace root, and restart Chrome mid-reconciliation. |
| CORPUS-06 | Fingerprint tests separate metadata from exact content hashes, ignore rename-only content work, replace changed bytes, and reject truncation/unsupported reads honestly. | Edit a Google Doc, rename it, and exercise a bounded text blob and unsupported/blocked file. |

### Wave 0 test assets

Create the six focused test files named above, deterministic Drive/Docs fixtures, a fake crashable `chrome.storage` adapter, an opaque purge-participant fixture covering fragment/index/citation/count/relationship/alert influence, and `54-HUMAN-UAT.md`. These assets do not exist yet and must be owned by the first plan that needs them; later plans must not defer their core automated oracle to a final integration task.

### Nyquist sampling cadence

- Every implementation task runs its owned fast focused test plus syntax check for changed JavaScript.
- Every plan runs its relevant dependency/focused tests; the complete six-test chain is not mandatory after each plan.
- Every wave runs the focused/static checks affected through that wave within the stated phase-focused latency budget; the full repository and browser gates are not mandatory after each wave.
- Final integration/phase verification runs the exact full six-test chain, storage static gate, real-Chrome contract, `npm run validate:extension`, and `npm test`. Any of those may run earlier when risk warrants.
- The authenticated live Drive ledger is final/manual evidence only. It is never counted as per-plan automated proof and is never claimed when not run; unperformed rows remain `human_needed` with `live_approved:false`. Phase 59 remains the milestone-level live acceptance owner. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-ROADMAP.md:186]

The automated failure-injection matrix must include: each purge/replacement await boundary, duplicate/out-of-order changes, incomplete pages, stale and mismatched epochs, 403/404/429/5xx, identity temporarily unavailable, true account switch, root replacement, inaccessible/missing/trash/move-in/move-out, shortcut external target, shared descendant with missing parents, cyclic ancestry, malicious fields, oversized bytes, blocked download, unsupported MIME, storage quota failure, service-worker restart, cross-partition keys, certificate replay, and direct content-storage probes. A pass means no stale influence, no existence-sensitive projection, no checkpoint advancement past uncommitted state, and deterministic eventual recovery.

If the final/manual authenticated ledger is actually run, it should record only scenario, expected local state/copy token, observed result, browser/extension build, and timestamp—never Drive IDs, filenames, content, snippets, tokens, or raw errors. If it is not run, retain honest `human_needed`/not-approved rows. It is optional manual verification evidence, never an automated cadence gate or approval checkpoint. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:34]

## Planning Sketches

```js
async function withCertifiedSource(kind, claim, callback) {
  const cert = await proveFreshAccountRootSourceAndAncestry(kind, claim);
  if (!cert.ok) return failQuiet(cert.reason);
  const value = await callback(cert); // bounded and operation-local
  if (!isStillCurrent(cert)) return failQuiet("authority_changed");
  return value;
}
```

```js
async function withdrawAndPurge(sourceKey, reason) {
  await writeClosedControlManifest(sourceKey, reason); // visibility closes first
  await purgeEveryRegisteredParticipant(sourceKey);    // idempotent
  await assertNoOwnedInfluence(sourceKey);
  await writeTerminalPurgedManifest(sourceKey);        // checkpoint may follow
}
```

These are contract sketches, not production signatures. The final design must serialize the owning lane, use versioned canonical records, and leave the manifest closed on every exception. [VERIFIED: .planning/milestones/v1.2.0-SKOPEO-phases/54-permission-scoped-drive-corpus-boundary/54-CONTEXT.md:39]

## Planning Resolutions

1. **V1 MIME and size policy is closed.** Support only Drive MIME `application/vnd.google-apps.document` through exact export MIME `text/plain`, and stored blob MIME exactly `text/plain` through `alt=media`. All other MIME types—including PDF, Sheets, Slides, binary, HTML, Markdown, CSV, and generic `text/*`—are `unreadable`. The exact ceiling is 10,485,760 bytes; byte 10,485,761 rejects/cancels the whole read as `too-large`/`unreadable`, never truncates, and never hashes partial content. `canDownload:false` and content-specific denial map to `download-blocked`. [CITED: https://developers.google.com/workspace/drive/api/guides/ref-export-formats]
2. **Unknown authenticated response variants remain unsupported.** Only normalized response/status shapes locked by deterministic fixtures are supported. Any unrecognized target-account response or reason-code variant fails closed until a fixture and normalization test are added. The optional live ledger may record only a metadata-level observed outcome; it cannot declare support or live validation by itself. [CITED: https://developers.google.com/drive/api/guides/handle-errors]
3. **`resourceKey` is source-scoped transport metadata only.** Accept it only when present/required, after validating it as metadata belonging to the exact trusted source operation. It is neither account/membership authority nor a fingerprint input, is never accepted from content, and is never persisted in display projections, logs, diagnostics, or content messages. Unknown/malformed/cross-source keys fail closed; no live probing is claimed. [CITED: https://developers.google.com/workspace/drive/api/guides/resource-keys]

These resolutions do not widen authority: unsupported or unprovable cases remain pending, inaccessible, download-blocked, or unreadable under the closed state rules.

## Environment Availability

- Local: Node `v24.14.1`, npm `11.11.0`, Chrome `150.0.7871.128`, existing repository tests, and `gsd-sdk` are available.
- Not locally automatable: an authenticated target Drive/Docs session and its tenant-specific response shapes; leave them unsupported and, if user-authorized, record only final/manual metadata-level evidence in the live ledger.
- Research fallback: Context7 is unavailable, so research used official Google Drive and Chrome Extension documentation plus direct codebase evidence. No new runtime dependency is recommended.

## Sources

### Primary documentation

- [Chrome extension storage](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [Chrome extension service-worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [Drive User resource](https://developers.google.com/workspace/drive/api/reference/rest/v3/User)
- [Drive files resource](https://developers.google.com/workspace/drive/api/reference/rest/v3/files)
- [Search files and folders](https://developers.google.com/workspace/drive/api/guides/search-files)
- [Changes list](https://developers.google.com/workspace/drive/api/reference/rest/v3/changes/list)
- [Manage changes](https://developers.google.com/workspace/drive/api/guides/manage-changes)
- [Shared drive support](https://developers.google.com/workspace/drive/api/guides/enable-shareddrives)
- [Shared drive differences](https://developers.google.com/workspace/drive/api/guides/about-shareddrives)
- [Shortcuts](https://developers.google.com/workspace/drive/api/guides/shortcuts)
- [Download and export files](https://developers.google.com/workspace/drive/api/guides/manage-downloads)
- [Export MIME formats](https://developers.google.com/workspace/drive/api/guides/ref-export-formats)
- [Resolve Drive errors](https://developers.google.com/drive/api/guides/handle-errors)

### Codebase evidence

- Phase contract and decisions: `54-CONTEXT.md`, `.planning/milestones/v1.2.0-SKOPEO-REQUIREMENTS.md`, `.planning/milestones/v1.2.0-SKOPEO-ROADMAP.md`, and `.planning/milestones/v1.2.0-SKOPEO-STATE-SNAPSHOT.md`.
- Existing sender/authority/message surfaces: `extension/background.js`, `extension/content/skopeo-context-router.js`, and `extension/utils/skopeo-action-authority.js`.
- Existing transport/content bounds: `extension/utils/capability-fetch.js`.
- Existing direct content-context storage consumers: `extension/utils/diagnostics-ring-buffer.js`, `extension/utils/automation-logger.js`, `extension/content/dom-state.js`, and `extension/content/actions.js`.

## Metadata

- Research date: 2026-07-18
- Valid until: 2026-08-17; re-check Drive/Chrome API documentation and live response shapes after that date.
- Confidence: high for codebase structure, locked requirements, Chrome storage access semantics, and Drive REST field semantics; medium for authenticated page-bridge response variants until live fixtures are captured.
- Assumptions: no unresolved factual claim is intentionally marked as assumed; environment-dependent response shapes remain unsupported under the explicit planning resolutions and optional metadata-only live ledger above.
