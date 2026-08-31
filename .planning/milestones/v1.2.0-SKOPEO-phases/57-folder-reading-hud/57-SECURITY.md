---
phase: "57"
slug: folder-reading-hud
status: open_threats
threats_found: 38
threats_closed: 27
threats_accepted: 2
threats_open: 11
asvs_level: 1
asvs_profile: default
block_on: open
register_authored_at_plan_time: true
created: 2026-08-12
updated: 2026-08-12
audited_head: ade0b408cb49
audit_trail:
  - audited_at: "2026-08-12T21:33:55Z"
    auditor: "GSD security auditor"
    result: OPEN_THREATS
    register_rows: 38
    threats_closed: 27
    threats_open: 11
---

# Phase 57 — Security Audit

This audit verifies the 38 plan-authored threat rows for the folder and reading HUD against implementation at `ade0b408cb49`. Repeated threat IDs are plan-scoped entries, not duplicates. The count of 27 closed threats includes 25 implemented mitigations and two documented accepted risks. No implementation or test file was modified by this audit.

The repository has no security-specific configuration override, so the default ASVS Level 1 profile applies. `block_on: open` makes every missing plan-time mitigation below a release blocker.

## Result

**OPEN_THREATS** — 27/38 resolved; 11/38 remain open.

## Trust Boundaries

| Boundary | Required property |
|---|---|
| Hostile graph/truth/label input → HUD projector | Exact own-data shapes, accepted evidence states, complete-set binding, deterministic caps, and fail-closed projection. |
| Content message → background controller | Sender-derived tab/controller authority and exact current tuple/token validation. |
| Background truth/graph/provider state → content projection | Only bounded, opaque, text-safe public data may cross; raw identifiers, URLs, proofs, stores, and provider capabilities remain private. |
| Content runtime → shell | Current projection authority must survive every await and stale work must be unable to render or retain actions. |
| Shell → host page | Closed Shadow DOM, text-only rendering, certified collision geometry, bounded resources, and no host mutation. |
| Citation control → privileged navigation | A current one-shot opaque action must be refreshed and revalidated immediately before the background-owned tab-open effect. |
| Hide/navigation/replacement/teardown → retained authority | DOM, content epochs, and background capabilities must be synchronously revoked as one lifecycle transition. |

## Threat Verification

| Threat ID | Category | Disposition | Status | Code evidence |
|---|---|---|---|---|
| 57-01/T-57-01 | Tampering | mitigate | CLOSED | `extension/utils/skopeo-hud-schema.js:198-256` reflects own keys/descriptors and rejects accessors, symbols, sparse arrays, and custom prototypes before reads; `:270-317` validates text/tokens; `:673-718` reconstructs frozen output and applies the 64 KiB ceiling. |
| 57-01/T-57-02 | Spoofing / Tampering | mitigate | **OPEN** | `extension/background.js:2806-2832` falls back from governance citations to the first arbitrary assertion citation and collapses family states around that guessed source; `:2893-2923` has only one date producer and hard-codes final/gap/policy inputs. Definitive legal-state derivation is not bound to the declared accepted evidence. |
| 57-01/T-57-03 | Spoofing | mitigate | CLOSED | `extension/background.js:1935-1948` reparses the projection and checks every tuple/token field; `extension/content/skopeo-runtime.js:710-745` independently validates the envelope and complete current runtime authority before paint. |
| 57-01/T-57-05 | Tampering / Denial of service | mitigate | **OPEN** | `extension/utils/skopeo-hud-projector.js:254-287,882-887,985-998` allows `state: complete` with `sourceOverflow > 0`; `extension/background.js:2856-2891,1950-1962` creates private actions for all facts while the projector caps public facts at ten, causing max-plus-one input to suppress the whole projection instead of publishing a bounded result. |
| 57-01/T-57-06 | Information disclosure / Elevation of privilege | mitigate | CLOSED | `extension/utils/skopeo-hud-schema.js:133-185,432-466,604-653` uses exact public key sets; `:286-297` rejects unsafe text/token shapes. The parsed envelope at `:673-718` exposes only reconstructed allowlisted data. |
| 57-01/T-57-08 | Elevation of privilege | mitigate | CLOSED | `extension/utils/skopeo-hud-schema.js:58-66,122-127,432-466,604-653` constrains memo and notification slots to neutral states and admits only the three HUD modes; no ask, draft, send, approval, recipient, scheduling, or delivery authority exists in the public envelope. |
| 57-01/T-57-SC | Tampering | accept | CLOSED (accepted risk) | Documented in the Accepted Risks Log. Phase commits add no dependency, lockfile, manifest-permission, remote-asset, or runtime changes. |
| 57-02/T-57-02 | Spoofing / Tampering | mitigate | CLOSED | `extension/utils/skopeo-truth-engine.js:1361-1432` reparses complete sorted generation metadata; `:1466-1576` validates evaluation context, every active family/version, final metadata, source set, graph snapshot, and context before returning current truth. |
| 57-02/T-57-03 | Spoofing | mitigate | CLOSED | `extension/background.js:2428-2441` binds the shared-promise key to tab, generation, origin, profile, context, entity, and evaluation digest; `:2473-2525` rechecks ownership, abort state, and digest around every asynchronous stage. |
| 57-02/T-57-05 | Tampering / Denial of service | mitigate | CLOSED | `extension/utils/skopeo-truth-engine.js:1383-1417` rejects family metadata above the 32-source bound without accepting a prefix; `:1686-1701` clones, measures, and closes results above `MAX_MINIMIZED_RESULT_BYTES` (64 KiB). |
| 57-02/T-57-06 | Information disclosure / Elevation of privilege | mitigate | CLOSED | `extension/background.js:496-510` reaches the truth facade only through background lexical state and returns closed summaries on failure; `extension/utils/skopeo-truth-engine.js:1435-1455,1686-1701,1756-1765` emits minimized frozen projections rather than raw store/provider objects. |
| 57-02/T-57-08 | Elevation of privilege | mitigate | CLOSED | `extension/background.js:2456-2535` exposes inspection/recompute only inside an explicit HUD display request, with one tuple/digest-keyed in-flight promise and no alarm, cadence, scheduling, notification, policy, or delivery effect. |
| 57-02/T-57-SC | Tampering | accept | CLOSED (accepted risk) | Documented in the Accepted Risks Log. Phase commits add no install, dependency, lockfile, permission, remote asset, or runtime. |
| 57-03/T-57-01 | Spoofing | mitigate | CLOSED | `extension/background.js:1693-1838` applies exact-key message/binding parsing and resolves controller identity from sender/current state; `:1876-1895` rejects any projection request that does not match the derived binding. |
| 57-03/T-57-02 | Tampering | mitigate | **OPEN** | `extension/background.js:2567-2578` accepts a visible manifest from its nonempty bounded `sources` array without checking declared total/overflow completeness; `:3032-3055` then republishes that subset as complete with zero overflow. Post-await checks therefore revalidate a potentially truncated set, not the declared exact set. |
| 57-03/T-57-03 | Information disclosure | mitigate | CLOSED | `extension/background.js:2968-2979,3032-3055` mints opaque source/scope tokens before projection; `extension/utils/skopeo-hud-schema.js:133-185,673-718` admits only the closed content-safe envelope and rejects extra raw authority fields. |
| 57-03/T-57-04 | Elevation of privilege | mitigate | CLOSED | `extension/background.js:2013-2076` enforces exact action messages, ready→pending atomicity, current binding and fresh citation checks before refresh, commit, and `chrome.tabs.create`, then consumes or revokes the action. |
| 57-03/T-57-05 | Repudiation | mitigate | **OPEN** | `extension/background.js:1840-1845` accepts a reason parameter but names it `_reason` and discards it. Issue, reject, revoke, and consume paths at `:1931-1988,2024-2076` mutate status or return generic acknowledgements without the declared deterministic diagnostic reason codes. |
| 57-03/T-57-06 | Denial of service | mitigate | **OPEN** | Although collection and label caps exist, the required exact-set condition does not: `extension/background.js:2567-2578,3032-3055` can relabel a truncated manifest as complete, and `extension/utils/skopeo-hud-projector.js:882-887` ignores `sourceOverflow` when deciding folder completeness. |
| 57-03/T-57-08 | Tampering | mitigate | **OPEN** | Navigation/replacement teardown revokes background state, but the production hide path is only `extension/content/skopeo-shell.js:2956-2958 -> withdrawCorpus()`. It never calls runtime withdrawal or `extension/background.js:3185-3189`, so content/background projection actions remain live after hide. |
| 57-03/T-57-SC | Tampering | mitigate | CLOSED | The 15 Phase 57 task commits contain no package installation, dependency, or lockfile change; the only `package.json` change adds repository test-script wiring. |
| 57-04/T-57-01 | Spoofing | mitigate | CLOSED | `extension/content/skopeo-runtime.js:675-720,748-760` derives activation from current recognized Drive/Docs entity state, sends the full public tuple, and rejects changed tuple/entity/epoch state around the response await. |
| 57-04/T-57-03 | Information disclosure | mitigate | CLOSED | `extension/content/skopeo-adaptive-composer.js:1162-1190,1931-1957` validates a deep-frozen exact model with bounded action IDs; the shell renders those model strings through the `textContent` helper at `extension/content/skopeo-shell.js:747-765`. |
| 57-04/T-57-04 | Elevation of privilege | mitigate | CLOSED | `extension/content/skopeo-runtime.js:824-868` accepts only an action ID already present in the current model and sends only the opaque projection/action authority to background; URL construction and navigation remain in `extension/background.js:3090-3147,2013-2076`. |
| 57-04/T-57-05 | Repudiation | mitigate | **OPEN** | `extension/content/skopeo-runtime.js:660-673` withdraws without accepting or retaining a reason; invalid/rejected responses at `:761-779` collapse to `false` and local teardown rather than a stable closed-state reason. The background revoker also discards `_reason` at `extension/background.js:1840-1845`. |
| 57-04/T-57-06 | Denial of service | mitigate | CLOSED | `extension/content/skopeo-adaptive-composer.js:1512-1513,1931-1957` enforces eight-row paging and exact bounded model/action collections; `extension/content/skopeo-runtime.js:740-801` drops stale results; shell scope disposal and timer cancellation are centralized at `extension/content/skopeo-shell.js:1536-1558,2685-2712,3604-3647`. |
| 57-04/T-57-07 | Tampering | mitigate | CLOSED | `extension/content/skopeo-shell.js:747-765` writes strings with `textContent`; `:1330-1354` mounts the sole render surface in a closed Shadow root. Composer exact-model validation rejects arbitrary blocks/HTML before render. |
| 57-04/T-57-08 | Tampering | mitigate | **OPEN** | `extension/content/skopeo-runtime.js:1866-1867,2003-2004` starts contract and legacy corpus refreshes independently. Both later commit into the same shell corpus scope, and `extension/content/skopeo-shell.js:2828-2854` can replace a current contract view without checking its contract epoch. Not every asynchronous return is fenced by the shared render owner. |
| 57-04/T-57-SC | Tampering | mitigate | CLOSED | Phase commits introduce no package installation, dependency, or lockfile change. |
| 57-05/T-57-01 | Spoofing | mitigate | CLOSED | `extension/content/skopeo-adaptive-composer.js:1931-1957` validates exact deep-frozen model structure and unique bounded action IDs; `extension/content/skopeo-shell.js:3364-3428` revalidates model and authority before and after building the candidate surface. |
| 57-05/T-57-02 | Tampering | mitigate | **OPEN** | The contract and legacy corpus requests are launched concurrently at `extension/content/skopeo-runtime.js:1866-1867,2003-2004`; both target `_corpusScope`, and `extension/content/skopeo-shell.js:2828-2854` permits a later legacy response to displace the contract DOM while runtime still retains contract authority. |
| 57-05/T-57-03 | Information disclosure | mitigate | CLOSED | `extension/content/skopeo-shell.js:747-765` uses `textContent`; the content model is exact and contains opaque IDs only. `.planning/milestones/v1.2.0-SKOPEO-phases/57-folder-reading-hud/57-HUMAN-UAT.md:11-15` restricts human evidence to sanitized metadata and forbids sensitive names, IDs, URLs, tokens, text, and screenshots. |
| 57-05/T-57-04 | Elevation of privilege | mitigate | CLOSED | `extension/content/skopeo-shell.js:3181-3228` uses a real button and passes only `action.actionId` to the current callback; `extension/content/skopeo-runtime.js:839-868` and background currentness/freshness checks retain all navigation authority. |
| 57-05/T-57-05 | Repudiation | mitigate | CLOSED | `.planning/milestones/v1.2.0-SKOPEO-phases/57-folder-reading-hud/57-HUMAN-UAT.md:1-15,26-30` records `status: human_needed` and `live_approved: false`; `tests/skopeo-hud-evals.test.js` reports deterministic/provisional results separately from both human gates. |
| 57-05/T-57-06 | Denial of service | mitigate | CLOSED | Schema/composer hard caps and local eight-row paging are enforced at `extension/utils/skopeo-hud-schema.js:94-106`, `extension/content/skopeo-adaptive-composer.js:1512-1513,1931-1957`; shell scope/timer teardown is centralized at `extension/content/skopeo-shell.js:1536-1558,2685-2712,3604-3647`, with no host observer installed. |
| 57-05/T-57-07 | Tampering | mitigate | **OPEN** | CSS applies the narrow rail at `max-width: 480px` (`extension/content/skopeo-shell.js:644-650`), while the geometry certificate treats only widths `< 480` as narrow (`:2897-2918`). At exactly 480px collision certification covers a different rectangle than the rendered rail, so the declared no-interference layout mitigation is incomplete. |
| 57-05/T-57-08 | Tampering | mitigate | **OPEN** | Local scope disposal removes nodes/listeners/timers, but hide invokes only `extension/content/skopeo-shell.js:2956-2958`. It does not increment `extension/content/skopeo-runtime.js:660-668` or revoke `extension/background.js:3185-3189`; action authority therefore has nonzero residue after a declared teardown path. |
| 57-05/T-57-SC | Tampering | mitigate | CLOSED | No install, dependency, lockfile, manifest-permission, or runtime change occurred. The sole package change wires `test:skopeo-hud-evals` into existing repository tests. |

## Open Threats — Release Blockers

| Threat ID | Mitigation expected | Files searched / absent proof |
|---|---|---|
| 57-01/T-57-02 | Bind governance, dates, and gaps only to accepted exact evidence; unresolved evidence stays neutral. | `extension/background.js:2799-2924`; arbitrary governing-citation fallback and missing live date/gap producers remain. |
| 57-01/T-57-05 | Whole-result closure for cap/overflow boundaries. | `extension/utils/skopeo-hud-projector.js:254-287,882-887,985-998`; `extension/background.js:1950-1962,2856-2891`; complete+overflow and 11-fact joins are not closed correctly. |
| 57-03/T-57-02 | Verify the exact complete source set through publication. | `extension/background.js:2567-2578,2938-3055`; upstream total/overflow is neither checked nor preserved. |
| 57-03/T-57-05 | Emit stable non-sensitive reason codes for issue/revoke/reject/consume. | `extension/background.js:1840-2083`; reason is discarded and no diagnostic transition record exists. |
| 57-03/T-57-06 | Bound folder work while preserving an exact source set. | `extension/background.js:2567-2578,3032-3055`; `extension/utils/skopeo-hud-projector.js:882-887`; a truncated source subset can be certified complete. |
| 57-03/T-57-08 | Hide must revoke content and background projection/action epochs before any later render/action. | `extension/content/skopeo-shell.js:2956-2958`; `extension/content/skopeo-runtime.js:660-673`; `extension/background.js:3185-3189`; no production hide-to-revocation path exists. |
| 57-04/T-57-05 | Preserve stable closed-state withdrawal/rejection reason codes. | `extension/content/skopeo-runtime.js:660-673,748-801`; `extension/background.js:1840-1845`; outcomes collapse to boolean/null teardown. |
| 57-04/T-57-08 | Fence every asynchronous renderer by one current shared owner/epoch. | `extension/content/skopeo-runtime.js:912-936,1866-1867,2003-2004`; `extension/content/skopeo-shell.js:2828-2854`; legacy corpus can replace a current contract render. |
| 57-05/T-57-02 | Prevent stale DOM from becoming current under concurrent updates. | Same shared-scope race as 57-04/T-57-08; no contract-ownership check exists in the legacy renderer commit. |
| 57-05/T-57-07 | Certify the rectangle that CSS will actually render at every breakpoint. | `extension/content/skopeo-shell.js:644-650,2897-2918`; CSS and JavaScript disagree at exactly 480px. |
| 57-05/T-57-08 | Teardown must leave zero node/listener/timer/action residue and restore focus safely. | Local resource disposal exists, but `extension/content/skopeo-shell.js:2956-2958` leaves runtime/background action authority intact. |

## Accepted Risks Log

| Risk ID | Threat ref | Status | Scope and rationale | Accepted by | Date |
|---|---|---|---|---|---|
| P57-AR-01 | 57-01/T-57-SC | ACCEPTED | This plan deliberately accepts the unchanged baseline package-supply-chain risk. Its implementation is repository-native classic JavaScript and Node assertions; no package or lockfile changed. | Phase 57-01 plan | plan-time |
| P57-AR-02 | 57-02/T-57-SC | ACCEPTED | This plan deliberately accepts the unchanged baseline package-supply-chain risk. No install, dependency, lockfile, manifest permission, remote asset, or new runtime was introduced. | Phase 57-02 plan | plan-time |

No threat is transferred to a third party.

## Threat Flags and Review Correlation

The five Phase 57 summaries contain no `## Threat Flags` section, so there are no registered or unregistered executor flags to add. The existing code-review findings were used only where they prove or disprove a plan-time mitigation:

| Review evidence | Registered threats affected |
|---|---|
| CR-02, CR-03, CR-09 | Open 57-01/T-57-02 (governance/date/gap derivation). |
| CR-04, CR-10 | Open 57-01/T-57-05, 57-03/T-57-02, and 57-03/T-57-06 (bounded exact-set publication). |
| CR-05 | Open 57-04/T-57-05 (closed lifecycle reason contract). |
| CR-06 | Open 57-04/T-57-08 and 57-05/T-57-02 (shared asynchronous render ownership). |
| CR-08 | Open 57-03/T-57-08 and 57-05/T-57-08 (hide revocation/zero residue). |
| WR-01 | Open 57-05/T-57-07 (certified layout differs from rendered layout). |
| WR-03 | Explains why passing unit/eval suites do not constitute proof for the failed production joins above. |

`unregistered_flag`: none.

## Verification Evidence

The following implementation-focused suites passed during this audit:

```text
node tests/skopeo-hud-schema.test.js
node tests/skopeo-hud-projector.test.js
node tests/skopeo-hud-runtime.test.js
node tests/skopeo-adaptive-composer.test.js
node tests/skopeo-hud-evals.test.js
node tests/skopeo-browser-contract.test.js
```

The real local Chrome contract suite passed its node-reuse, ABA, reorder, detach, reverse-route, scroll, zoom, and 420px resize observations. The eval suite reported 34/34 deterministic and 34/34 provisional cases, while both `domain_fidelity` and authorized live Drive/Docs remain `human_needed`. Those passes do not close the production-join gaps listed above.

Supply-chain verification inspected all 15 Phase 57 task commits. No dependency, lockfile, manifest-permission, remote-asset, or new-runtime change was found; `package.json` only gained Phase 57 test-script wiring.

## Security Audit Trail

| Audit date | Implementation head | Register rows | Closed | Open | Result |
|---|---|---:|---:|---:|---|
| 2026-08-12 | `ade0b408cb49` | 38 | 27 | 11 | OPEN_THREATS |

## Sign-Off

- [x] All 38 plan-time threat rows classified by disposition.
- [x] Both accepted risks documented.
- [x] Summary threat flags checked; none found.
- [x] Implementation and tests remained read-only.
- [ ] `threats_open: 0` — blocked by the 11 findings above.

**Approval:** blocked pending implementation of all open mitigations and re-audit.
