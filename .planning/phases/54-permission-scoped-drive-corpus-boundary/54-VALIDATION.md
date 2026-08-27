---
phase: 54
slug: permission-scoped-drive-corpus-boundary
status: complete
nyquist_compliant: true
wave_0_complete: true
automated_green: true
live_approved: false
created: 2026-07-18
validated: 2026-07-20
---

# Phase 54 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in assertions / repository standalone test harness |
| **Config file** | `package.json`; focused tests run directly with `node` |
| **Quick run command** | `node tests/<owned-phase-54-file>.test.js && node --check <changed-js>` |
| **Full suite command** | `npm run validate:extension && npm test` |
| **Estimated runtime** | Task-local under 15 seconds; Phase 54 focused chain under 60 seconds; repository suite uses the existing project budget |

The Phase 54 focused chain is:

```sh
node tests/skopeo-corpus-schema.test.js && node tests/skopeo-corpus-store.test.js && node tests/skopeo-drive-corpus-transport.test.js && node tests/skopeo-drive-authority.test.js && node tests/skopeo-drive-reconciler.test.js && node tests/skopeo-corpus-runtime.test.js
```

No new test dependency is permitted or required. Tests use deterministic Drive/Docs fixtures, fake Chrome adapters, and failure injection around every authority-changing storage boundary.

---

## Sampling Rate

- **Immediate task sampling (fast):** Run only that task's `<verify><automated>` command: its owned focused oracle plus `node --check` for changed JavaScript. RED tasks run their controlled-failure command; GREEN tasks target under 15 seconds.
- **Plan completion sampling:** Run the plan's dependency-focused `<verification>` chain, not the browser/full repository suite by default. This may include earlier Phase 54 tests required by that plan's boundary.
- **Wave completion sampling:** Run the Phase 54 focused tests implemented through that wave and the storage/message static gate once it exists; target under 60 seconds.
- **Final Plan 08 / phase acceptance:** Separately run the exact six-test focused chain, static gate, provider/session regressions, real-Chrome contract, `npm run validate:extension`, and `npm test`. Plan 08 Task 2's immediate `<automated>` command remains a fast runtime/static/package-uniqueness oracle; the full chain belongs here and in its acceptance evidence.
- **Before `$gsd-verify-work`:** The final Plan 08 / phase acceptance chain must be green.
- **Max feedback latency:** 15 seconds task-local and 60 seconds phase-focused; repository/browser duration is tracked separately at final acceptance.

No three consecutive implementation tasks may pass without an automated authority, storage, transport, reconciliation, or integration oracle.

---

## Threat References

| Ref | Threat | Required negative oracle |
|-----|--------|--------------------------|
| T-54-01 | Spoofed email, `authuser`, folder name, URL, tab, or generation | Enrollment and reads stay closed without fresh exact sender, account, root, and source proof. |
| T-54-02 | Shortcut or unproven shared ancestry widens membership | External shortcut targets are never traversed; missing parent proof never becomes active membership. |
| T-54-03 | Certificate replay, cross-operation reuse, or stale display assembly | Immutable single/set certificates are exact-kind and operation-local; final currentness after display projection assembly rejects revoke/move/account/root/source/epoch drift. |
| T-54-04 | Cross-account, root, partition, or source substitution | Canonical tuple mismatch rejects before lookup and has no fallback/global scan. |
| T-54-05 | Drive 403/404/removed event or prior row/count leaks existence | Only authoritative reconciliation emits `missing`; unavailable/denied display proof structurally omits prior rows/counts/identifiers and yields generic current-source or corpus fail-quiet output. |
| T-54-06 | Crash, quota error, or restart exposes partially replaced or purged state | A newer closed manifest is visible first; recovery resumes idempotently and no stale participant influences output. |
| T-54-07 | Malicious Drive metadata or raw errors reach UI/logs | Only locally owned closed tokens are persisted/projected through text-only sinks. |
| T-54-08 | Content/dual-loaded helper reads local storage or a generic proxy recreates access | Persistence is background/trusted-module-only; dependency-closure static scan and real-Chrome sentinel reject direct local calls/listeners or generic storage access. |
| T-54-09 | Incomplete pagination, cyclic ancestry, races, or oversized/unsupported content becomes authoritative | Bounds and incomplete evidence fail closed; only Docs→`text/plain` export or exact `text/plain` blob is read, and byte 10,485,761 yields no truncated content/fingerprint. |
| T-54-10 | Rename/version metadata is mistaken for content identity | Stable source, metadata membership, and exact-byte content fingerprints remain separate. |

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 54-01-01 | 01 | 1 | CORPUS-02,03,06 | T-54-04,05,07,09,10 | RED closed tuple/state/fingerprint/raw-content contract. | controlled RED | `bash -lc 'set +e; out=$(node tests/skopeo-corpus-schema.test.js 2>&1); code=$?; set -e; test $code -ne 0; printf "%s\n" "$out" | rg "skopeo-corpus-schema|FsbSkopeoCorpusSchema"'` | ✅ | ✅ complete |
| 54-01-02 | 01 | 1 | CORPUS-02,03,06 | T-54-04,05,07,09,10 | Frozen exact schema makes six states, tuple isolation, separate fingerprints, and hostile-input closure GREEN. | unit | `node --check extension/utils/skopeo-corpus-schema.js && node tests/skopeo-corpus-schema.test.js` | ✅ | ✅ complete |
| 54-02-01 | 02 | 1 | CORPUS-02,05 | T-54-01,06,07,08,09 | RED enumerates every direct-local/secret path, injected dependency, fixed-message shape, and boot ordering edge. | controlled RED + static | `bash -lc 'set +e; out=$(node scripts/verify-skopeo-storage-boundary.mjs 2>&1); code=$?; set -e; test $code -ne 0; printf "%s\n" "$out" | rg "diagnostics-ring-buffer|automation-logger|dom-state|actions|storage.local|apiKey|pageUrl"'` | ✅ | ✅ complete |
| 54-02-02 | 02 | 1 | CORPUS-02,05 | T-54-01,06,07,08,09 | Persistence is background/trusted-module-only; dual-loaded utilities are storage-free and CAPTCHA secrets stay trusted. | unit + integration | `node --check extension/background.js && node --check extension/utils/trusted-local-feature-store.js && node --check extension/utils/diagnostics-ring-buffer.js && node --check extension/utils/automation-logger.js && node --check extension/content/dom-state.js && node --check extension/content/actions.js && node tests/skopeo-corpus-store.test.js` | ✅ | ✅ complete |
| 54-02-03 | 02 | 1 | CORPUS-02,05 | T-54-01,06,07,08,09 | Dependency-closure static mutations reject aliases, dead branches, injected trusted store, generic proxy, and secret payloads. | static + mutation | `node scripts/verify-skopeo-storage-boundary.mjs && node tests/skopeo-corpus-store.test.js` | ✅ | ✅ complete |
| 54-03-01 | 03 | 2 | CORPUS-02,05 | T-54-03,04,05,06,09 | RED exact-partition, one-visible-corpus, tombstone-first participant purge, and failure-injection matrix. | controlled RED | `bash -lc 'set +e; out=$(node tests/skopeo-corpus-store.test.js 2>&1); code=$?; set -e; test $code -ne 0; printf "%s\n" "$out" | rg "skopeo-corpus-store|FsbSkopeoCorpusStore"'` | ✅ | ✅ complete |
| 54-03-02 | 03 | 2 | CORPUS-02,05 | T-54-03,04,05,06,09 | Closed manifest/staging/pointer-last store rejects cross-tuple and optimistic visibility. | unit + failure injection | `node --check extension/utils/skopeo-corpus-store.js && node tests/skopeo-corpus-schema.test.js && node tests/skopeo-corpus-store.test.js` | ✅ | ✅ complete |
| 54-03-03 | 03 | 2 | CORPUS-02,05 | T-54-03,04,05,06,09 | Source/partition purge verifies every participant absent and recovers closed after every MV3/quota failure. | failure injection | `node --check extension/utils/skopeo-corpus-store.js && node tests/skopeo-corpus-store.test.js` | ✅ | ✅ complete |
| 54-04-01 | 04 | 2 | CORPUS-01,03,06 | T-54-01,02,05,09,10 | RED pins six private actions, exact two-MIME policy, 10,485,760-byte cap, typed failures, and resource-key closure. | controlled RED | `bash -lc 'set +e; out=$(node tests/skopeo-drive-corpus-transport.test.js 2>&1); code=$?; set -e; test $code -ne 0; printf "%s\n" "$out" | rg "skopeo-drive-corpus|FsbSkopeoDriveCorpusTransport"'` | ✅ | ✅ complete |
| 54-04-02 | 04 | 2 | CORPUS-01,03,06 | T-54-01,02,05,09,10 | Private page namespace uses exact requests, fixture-locked variants, no shortcut target/public catalog, and no partial oversize hash. | contract | `node --check extension/utils/capability-fetch.js && node tests/skopeo-drive-corpus-transport.test.js && node tests/lattice-provider-bridge-smoke.test.js` | ✅ | ✅ complete |
| 54-04-03 | 04 | 2 | CORPUS-01,03,06 | T-54-01,02,05,09,10 | Background wrapper validates source-scoped resource keys and keeps exact bytes/text operation-local. | unit + contract | `node --check extension/utils/skopeo-drive-corpus-transport.js && node tests/skopeo-drive-corpus-transport.test.js && node tests/lattice-provider-bridge-smoke.test.js` | ✅ | ✅ complete |
| 54-05-01 | 05 | 3 | CORPUS-01,02,03,04,05 | T-54-01,02,03,04,05,09 | RED enrollment/ancestry plus single/set display certificate replay and post-reconcile revoke/move/account/root/epoch races. | controlled RED | `bash -lc 'set +e; out=$(node tests/skopeo-drive-authority.test.js 2>&1); code=$?; set -e; test $code -ne 0; printf "%s\n" "$out" | rg "FsbSkopeoDriveAuthority|FsbSkopeoCorpusController|skopeo-drive-authority"'` | ✅ | ✅ complete |
| 54-05-02 | 05 | 3 | CORPUS-01,02,03,04,05 | T-54-01,02,03,04,05,09 | Fresh exact-source/set authority repeats currentness after display assembly; changed sources affect no row/count/output. | unit + integration | `node --check extension/utils/skopeo-drive-authority.js && node --check extension/utils/skopeo-corpus-controller.js && node tests/skopeo-drive-authority.test.js && node tests/skopeo-corpus-store.test.js && node tests/skopeo-drive-corpus-transport.test.js` | ✅ | ✅ complete |
| 54-06-01 | 06 | 4 | CORPUS-01,03,05,06 | T-54-02,05,06,09,10 | RED baseline/change/recovery, physical ancestry, opaque-404, missing, and separate fingerprint decisions. | controlled RED | `bash -lc 'set +e; out=$(node tests/skopeo-drive-reconciler.test.js 2>&1); code=$?; set -e; test $code -ne 0; printf "%s\n" "$out" | rg "FsbSkopeoDriveReconciler|skopeo-drive-reconciler"'` | ✅ | ✅ complete |
| 54-06-02 | 06 | 4 | CORPUS-01,03,05,06 | T-54-02,05,06,09,10 | Inventory/change hints converge through fresh ancestry, tombstone/purge-before-checkpoint, and bounded rescan. | unit + integration | `node --check extension/utils/skopeo-drive-reconciler.js && node tests/skopeo-corpus-schema.test.js && node tests/skopeo-corpus-store.test.js && node tests/skopeo-drive-corpus-transport.test.js && node tests/skopeo-drive-authority.test.js && node tests/skopeo-drive-reconciler.test.js` | ✅ | ✅ complete |
| 54-07-01 | 07 | 5 | CORPUS-01,02,03,04 | T-54-01,03,05,07,09 | RED exact-folder enrollment, current Drive/Docs six-state display, certified rows, and structural row/count withdrawal. | controlled RED | `bash -lc 'set +e; out=$(node tests/skopeo-corpus-runtime.test.js 2>&1); code=$?; set -e; test $code -ne 0; printf "%s\n" "$out" | rg "corpus|Enroll this folder"'` | ✅ | ✅ complete |
| 54-07-02 | 07 | 5 | CORPUS-01,02,03,04 | T-54-01,03,05,07,09 | Existing composer/shell/runtime renders only generic unsafe current state or same-operation certified rows/complete aggregate. | integration + UI | `node --check extension/content/skopeo-adaptive-composer.js && node --check extension/content/skopeo-shell.js && node --check extension/content/skopeo-runtime.js && node tests/skopeo-corpus-runtime.test.js && node tests/skopeo-adaptive-composer.test.js && node tests/skopeo-shell-contract.test.js && node tests/skopeo-catalog-runtime.test.js && node tests/skopeo-session-lifecycle.test.js` | ✅ | ✅ complete |
| 54-08-01 | 08 | 6 | CORPUS-01–06 | T-54-01–10 | Trusted boot and production exact-source/set `display` path close sender/wake/revoke/move/account/root/epoch races through final assembly. | integration | `node --check extension/background.js && node tests/skopeo-corpus-runtime.test.js && node tests/lattice-provider-bridge-smoke.test.js && node tests/skopeo-session-lifecycle.test.js` | ✅ | ✅ complete |
| 54-08-02 | 08 | 6 | CORPUS-01–06 | T-54-01–10 | Fast immediate runtime/static/package-uniqueness oracle; browser/full repository evidence remains the separate final plan gate. | fast integration/static | `node tests/skopeo-corpus-runtime.test.js && node scripts/verify-skopeo-storage-boundary.mjs && node -e "const s=String(require('./package.json').scripts.test||''); for (const n of ['skopeo-corpus-schema','skopeo-corpus-store','skopeo-drive-corpus-transport','skopeo-drive-authority','skopeo-drive-reconciler','skopeo-corpus-runtime']) if (s.split(n).length!==2) process.exit(1)"` | ✅ | ✅ complete |

This map is authoritative for the actual eight plans, nineteen tasks, and six waves. Task commands are immediate task feedback; Plan 08 acceptance/final verification separately owns the exact focused + static + provider/session + real-Chrome + repository chain.

---

## Wave 0 Requirements

- [x] `tests/skopeo-corpus-schema.test.js` — closed schema/state/fingerprint/canonical-key fixtures for CORPUS-02, CORPUS-03, and CORPUS-06.
- [x] `tests/skopeo-corpus-store.test.js` — crashable `chrome.storage` adapter, `TRUSTED_CONTEXTS` ordering, background-only trusted feature store, zero-local dual-loaded utilities, fixed-message gate, manifest, ownership-ledger, tombstone, purge, and wake recovery for CORPUS-02 and CORPUS-05.
- [x] `scripts/verify-skopeo-storage-boundary.mjs` — dependency-closure static proof that persistence is background/trusted-module-only and no injected/dual-loaded direct local call/listener, injected trusted store, generic proxy, or CAPTCHA secret path remains.
- [x] `tests/skopeo-drive-corpus-transport.test.js` — exact Drive/Docs request/response, typed error, Docs→`text/plain`/exact-`text/plain`-blob allowlist, 10,485,760/10,485,761 boundary, source-scoped `resourceKey`, unknown-variant, and malicious-field fixtures for CORPUS-01, CORPUS-03, and CORPUS-06.
- [x] `tests/skopeo-drive-authority.test.js` — account/root/source/ancestry proof, enrollment, single/bounded-set operation certificates, production display assembly, revoke/move/account/root/epoch races, replacement, and account-switch fixtures for CORPUS-01 through CORPUS-05.
- [x] `tests/skopeo-drive-reconciler.test.js` — recursive inventory, change-race, pagination, ancestry, shortcut, fingerprint, removal, and checkpoint fixtures for CORPUS-01, CORPUS-03, CORPUS-05, and CORPUS-06.
- [x] `tests/skopeo-corpus-runtime.test.js` — background/content integration, exact current Drive file/Docs six-state display, same-operation certified rows/complete aggregates, structural count/row withdrawal, message allowlist, storage surface, and exact-source/set consumer facade checks across CORPUS-01–06.
- [x] Deterministic Drive/Docs fixture library with shared-drive, opaque denial, missing-parent, pagination, cycle, oversized export, malformed, and malicious values.
- [x] Fake purge participants for fragment, index, citation, count, relationship, result-cache, and alert-evidence ownership.
- [x] `.planning/phases/54-permission-scoped-drive-corpus-boundary/54-HUMAN-UAT.md` — metadata-only live ledger template with no Drive IDs, filenames, content, snippets, tokens, or raw errors.

The first plan that needs each asset owns its creation. Core automated oracles must not be deferred to the final integration plan.

---

## Mandatory Failure-Injection Matrix

Automated tests must cover each purge/replacement await boundary; duplicate and out-of-order changes; incomplete pages; stale and mismatched epochs; fixture-locked 403, opaque 404, 429, and 5xx plus unknown authenticated variants; unavailable identity and true account switch; root replacement; trash, move-in, move-out, revoke, inaccessible, and authoritatively missing transitions; shortcut external targets; shared descendants with missing parents; cyclic ancestry; malicious fields; exact 10,485,760-byte success and declared/streamed 10,485,761-byte whole-read rejection; blocked downloads; every unsupported MIME family; malformed/cross-source `resourceKey`; quota failure; service-worker restart; cross-partition key substitution; single/set certificate replay; revoke/move/account/root/source/epoch change after reconciliation before/during display assembly; prior-row/count withdrawal; and direct/aliased/dead-branch content or dual-loaded storage probes.

A pass means:

1. No stale source-owned influence is visible.
2. No existence-sensitive projection escapes a fail-quiet state.
3. No checkpoint advances past uncommitted state.
4. Repeating recovery converges deterministically.
5. Full bytes and extracted text remain operation-local and are absent from persisted fixtures.
6. A source without fresh final display certification contributes no row, aggregate/count, label, state output, or message; unsafe current-source presentation is generic/fail-quiet and carries no stale identity.

---

## Observed Final Evidence — 2026-07-20

| Gate | Observed result |
|---|---|
| Exact focused chain: schema → store → transport → authority → reconciler → runtime | GREEN; all six processes exited 0. Notable outputs: trusted store 64 assertions, transport PASS, authority/controller PASS, reconciler PASS, runtime PASS. |
| `node scripts/verify-skopeo-storage-boundary.mjs` | GREEN; 32 injected/dependency files checked. |
| `node tests/lattice-provider-bridge-smoke.test.js` | GREEN; 111 passed, 0 failed; private corpus import count and order retained. |
| `node tests/skopeo-session-lifecycle.test.js` | GREEN; production runtime and session lifecycle contracts passed. |
| `node tests/skopeo-browser-contract.test.js` | GREEN in local Google Chrome 150.0.7871.128. DevTools `Extensions.loadUnpacked` loaded exactly one copied production extension; the trusted page completed 100 storage set/get/remove cycles with no residue, isolated content completed 100 denied cycles while preserving host DOM, and enrollment mechanics completed 100 render/withdraw cycles with exact accessible copy and zero resources. No live Drive fixture or authorization was used. |
| Fast Plan 08 runtime/static/package uniqueness oracle | GREEN; each focused test appears exactly once and in dependency order; the static gate appears exactly once before adjacent Skopeo validation. |
| `npm run validate:extension` | GREEN; storage verifier ran in-chain and 430 extension JavaScript files parsed cleanly. |
| `npm test` | GREEN; full repository chain exited 0, including the focused six and real-Chrome contract from the once-only package registration. |

### High-Threat Negative Proof Closure

| Threat | Observed automated proof |
|---|---|
| T-54-01 | Authority/controller and runtime integration rejected forged sender/tab/generation/origin/profile/context/entity claims and re-read current authority. |
| T-54-02 | Authority/reconciler fixtures proved physical ancestry and shortcut exclusion; content/public dependency scans exposed no private transport or certificate surface. |
| T-54-03 | Single/set authority and background facade fixtures rejected replay, implicit-all, duplicate, empty, over-limit, and final-tuple drift across all five operation kinds. |
| T-54-04 | Schema/store/authority fixtures rejected cross-account, root, partition, source, and epoch substitution. |
| T-54-05 | Reconciler/runtime/background display fixtures withdrew unsafe prior rows/counts and omitted affected row/aggregate/output after revoke, move, denial, or tuple drift. |
| T-54-06 | Store/reconciler failure matrices and boot integration proved closed manifest/tombstone ordering, idempotent wake recovery, and closed boot failure. |
| T-54-07 | Schema/transport/runtime fixtures rejected hostile metadata, markup, bidi, oversized fields, raw provider errors, source bodies, and identifier leakage. |
| T-54-08 | Static dependency closure plus real-Chrome trusted-versus-isolated storage cycles proved trusted-only persistence without a generic content bridge. |
| T-54-09 | Transport, store, authority, reconciler, runtime, and 100-cycle browser fixtures enforced pagination/byte/set bounds, aborts, and exact zero cleanup. |
| T-54-10 | Schema/reconciler fixtures kept stable source identity, membership fingerprint, and content fingerprint separate across rename, move, and content replacement. |

Authorized live Drive evidence was not run. The metadata-only `54-HUMAN-UAT.md` ledger remains `live_approved: false`, with every authorized-live scenario marked `human_needed`; deterministic fixtures and local Chrome do not change that approval boundary.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Exact-folder enrollment with real Drive ancestry, shared descendants, and shortcut exclusion | CORPUS-01 | Requires the user's authenticated target Drive and tenant-specific hierarchy. | Load the unpacked extension, visit the exact test folder, enroll it, and record only the expected/observed local state token for in-root, out-of-root, shared, and shortcut cases. |
| Real account switch, unavailable identity, and revoked access | CORPUS-02, CORPUS-04, CORPUS-05 | Requires authenticated account/session transitions the local fixture layer cannot prove. | Switch accounts and test offline/revoked states; verify the old projection disappears before any replacement and record no identifiers or content. |
| Actual Docs `text/plain` export, exact `text/plain` blob download, 403/404, and blocked-download response shapes | CORPUS-03, CORPUS-06 | Authenticated page-owned Drive response variants are environment-dependent. | Exercise only the two v1-supported MIME paths under the 10,485,760-byte ceiling, compare only metadata-level closed state/copy token with fixture-locked normalization, and leave unknown variants unsupported/fail-closed without claiming live validation. |
| Move, rename, edit, trash, delete, and browser restart during reconciliation | CORPUS-05, CORPUS-06 | Timing and MV3 worker lifecycle need real browser evidence. | Perform one mutation per ledger row; verify rename-only work preserves content identity, content edits replace once, and withdrawal/restart never exposes stale data. |
| Content-script storage isolation sentinel | CORPUS-02 | Chrome's real execution-context enforcement is stronger evidence than a mock. | From the injected context, prove a test sentinel cannot be read, written, or removed while trusted extension pages retain intended access. |

Live evidence is a verification ledger, not an approval checkpoint. Phase 59 remains the milestone-level live acceptance owner.

---

## Validation Sign-Off

- [x] All expected tasks have an automated verify command or explicit Wave 0 dependency.
- [x] Per-task map matches eight plans, nineteen tasks, and six dependency waves.
- [x] Sampling continuity prevents three consecutive tasks without automated verification.
- [x] Immediate fast task sampling is distinct from final Plan 08 browser/repository acceptance.
- [x] Wave 0 names every currently missing test/fixture reference.
- [x] Commands contain no watch-mode flags.
- [x] Task-local feedback target is under 15 seconds; phase-focused target is under 60 seconds.
- [x] `nyquist_compliant: true` is set in frontmatter.
- [x] Wave 0 assets exist and are green.
- [x] Deterministic real-Chrome storage/enrollment evidence is green and recorded.
- [x] Authorized-live Drive evidence is honestly separated in the metadata-only ledger as `human_needed` with `live_approved: false`.

**Approval:** automated Phase 54 acceptance complete; authorized live Drive acceptance remains `human_needed` and unapproved.
