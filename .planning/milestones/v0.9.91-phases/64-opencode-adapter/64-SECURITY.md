---
phase: 64
slug: opencode-adapter
status: verified
threats_open: 0
asvs_level: 1
created: 2026-07-21
verified: 2026-07-21
---

# Phase 64 — Security

> Per-phase security contract for the OpenCode adapter, owned-server lifecycle, durable delegation state, and browser projection.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Adapter input | Provider stdout, version output, and declarative adapter data enter the generic supervisor | Untrusted native bytes and closed provider descriptors |
| Private runtime | FSB-generated OpenCode policy meets native configuration and process startup | Prompt/tool policy, private paths, fixed environment, and opaque secret references |
| Owned process | The supervisor starts, attests, leases, recovers, and terminates task, server, and policy-preflight trees | Process identity, loopback health, transient Basic authentication, and durable journals |
| Reverse channel | Normalized MCP events cross into extension persistence | Closed event fields, provider identity, terminal truth, and bounded diagnostics |
| Browser UI | Validated persistent records become Providers and delegation presentation | Canonical status, unknown billing classification, lifecycle state, and text-only summaries |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation and evidence | Status |
|-----------|----------|-----------|-------------|-------------------------|--------|
| T64-01 | Elevation of Privilege | Adapter architecture authority | mitigate | Exact five-method contract, closed two-provider registry, provider-neutral topology, shared attestation verifier, and real production composition coverage in `adapter.ts`, `registry.ts`, `opencode.ts`, and `mcp-opencode-server-topology.test.js`. | closed |
| T64-02 | Information Disclosure | Task and transient secret boundary | mitigate | Task remains stdin-only; fixed environment and opaque binding metadata are separate; only server/attach roles receive the transient secret; credential discovery is scrubbed by the source-pinned 142-name deny roster; journals, diagnostics, browser state, and UI cannot represent the secret. | closed |
| T64-03 | Elevation of Privilege | Owned process identity and recovery | mitigate | Activation and termination require retained FSB-owned process identity. Recovery never discovers or signals user processes, and task/server/policy-preflight runtime roles have durable, identity-aligned journals and crash-window tests. | closed |
| T64-04 | Tampering | Replay and fallback authority | mitigate | Provider/task consent is one-time and revalidated; replay closes before spawn; task input is written once; no post-spawn cold/attach fallback exists; later retry requires new user intent. | closed |
| T64-05 | Elevation of Privilege | Private configuration isolation | mitigate | OpenCode 1.14.25 is pinned to private config/test-home/managed roots with project config, external skills, downloads, updates, and inherited Claude prompts disabled; effective-policy attestations fail closed before task authority. | closed |
| T64-06 | Elevation of Privilege | Agent and tool resolution | mitigate | Prompt digest, primary mode, exact deny/allow ordering, no model override, loopback-only MCP, and effective process/server attestations are enforced; known native fallback warnings are rejected. | closed |
| T64-07 | Spoofing | Owned-server readiness | mitigate | Readiness is bound to exact loopback URL, authenticated health, pinned version, retained process identity, generation, and configuration digest; lease reuse repeats the identity and health checks. | closed |
| T64-08 | Tampering | Candidate and terminal truth | mitigate | Parser result remains private until EOF; publication also requires clean stderr/exit, tree settlement, and runtime cleanup. Durable store/controller and UI require an authoritative completed terminal. Native OpenCode token metrics now survive projection. | closed |
| T64-09 | Denial of Service / Information Disclosure | Parser, drift, and diagnostics | mitigate | Fatal bounded UTF-8/JSONL parsing, exact schemas and ordering, adapter-native drift fixtures, closed diagnostic vocabulary, independent throttling, and CI roster/fixture gates prevent unbounded or raw provider data from crossing the boundary. | closed |
| T64-10 | Information Disclosure | Browser persistence and UI | mitigate | Only canonical provider identity, bounded summaries, closed status, and unknown OpenCode billing are durable. Native config, topology, version, model, credentials, raw diagnostics, and premature result candidates are excluded from text-only UI projections. | closed |

---

## ASVS L1 Coverage

| Domain | Verified control |
|--------|------------------|
| V2 | High-entropy transient server authentication secret with no durable or public retention |
| V3 | Provider/task-bound one-time consent and pre-spawn replay fence |
| V4 | Exact provider, tool, configuration, and owned-process authority |
| V5 | Strict bounded schemas, canonical serialization, and authoritative terminal barrier |
| V7 | Closed diagnostic, journal, browser, and UI projections |
| V13 | Loopback-only authenticated health and exact version verification |
| V14 | Source-pinned private configuration and effective-policy attestations |

---

## Accepted Risks Log

No accepted risks. All registered HIGH and CRITICAL threats are mitigated.

The three entries in `64-HUMAN-UAT.md` remain pending as external account, OS-process, browser, and accessibility corroboration. They do not substitute for or weaken the deterministic controls above.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-21 | 10 | 10 | 0 | Codex (`gsd-security-auditor`) |

Automated evidence included the guarded 25-command Phase 64 matrix, the 106-assertion phase/security contract, event-store 34/34, controller 41/41, production adapter/topology/supervisor/recovery coverage, reverse-channel and browser projection suites, UI/source sentinels, and workspace-preserving build markers. The clean iteration-two code review independently closed CR-01 and WR-01 through WR-03.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-21
