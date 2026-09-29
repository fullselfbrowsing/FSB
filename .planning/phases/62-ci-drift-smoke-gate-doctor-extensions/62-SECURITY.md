---
phase: 62
slug: ci-drift-smoke-gate-doctor-extensions
status: verified
threats_total: 8
threats_open: 0
register_authored_at_plan_time: true
asvs_level: 1
created: 2026-07-16
last_verified: 2026-07-16
verified_implementation: ba572f94
---

# Phase 62 — Security

> Per-phase security contract: all eight plan-time threats have verified mitigation evidence. Live CLI, browser, native-host, accessibility, and human UAT evidence remains deferred to the milestone-end sweep and is not represented as a security pass.

---

## Trust Boundaries

| Boundary | Description | Data crossing |
|----------|-------------|---------------|
| Fixture and matrix → daemon | Committed compatibility metadata and sanitized contract JSONL enter canonical classification and the production parser. | Bounded public schema, fixture reference, normalized events |
| Local process state → doctor | Production detectors and private bridge-auth state are reduced to local diagnostic output. | Local binary/version facts and three safe auth metadata fields |
| Daemon → extension background | Authenticated compatibility facts cross the reverse channel into validation, freshness projection, and durable storage. | Exact safe compatibility snapshot only |
| Provider output → diagnostics | Untrusted provider JSONL failures become a typed terminal and bounded diagnostic admission. | Exact sanitized drift labels only |
| Background projection → privileged UI | Validated persisted evidence becomes DOM, accessible descriptions, announcements, and styling. | Closed compatibility status/reason/timestamp projection |
| Repository evidence → acceptance | Root/CI scripts and source contracts decide whether Phase 62 automated evidence is accepted. | Commands, assertions, and pending human-ledger metadata |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation and verification evidence | Status |
|-----------|----------|-----------|-------------|--------------------------------------|--------|
| T62-01 | Tampering | Compatibility policy | mitigate | One recursively frozen matrix in `mcp/src/agent-providers/compatibility.ts`; detector, doctor, extension, fixture, and contract tests consume rather than duplicate policy. The 763-assertion phase contract pins the canonical schema, row, reasons, bounds, and owner. | closed |
| T62-02 | Tampering | Drift smoke / CI | mitigate | Root and CI each invoke the same production-registry/parser drift harness exactly once. Contract tests forbid a copied parser, live-binary substitution, or fixture-provenance relabeling. | closed |
| T62-03 | Information disclosure | Doctor diagnostics | mitigate | Doctor projects exactly eight adapter fields and three safe bridge-auth metadata fields; Claude auth remains `unknown` / `Not reported`. Secret canaries, offline behavior, malformed clocks, and browser-path separation are covered by focused diagnostics and phase-contract tests. | closed |
| T62-04 | Spoofing / elevation of privilege | Reverse channel | mitigate | `adapter.compatibility` requires the paired authenticated route and exact empty payload. Background owns validation, durable replacement, and fan-out; transport errors and process authority remain unchanged and source-pinned. | closed |
| T62-05 | Tampering | Browser compatibility storage | mitigate | Exact plain-object/schema validation, serialized durable replacement, envelope preservation, freshness downgrade, rejected-write isolation, corrupt-cache failure, and bounded coalescing are covered by storage/background tests. | closed |
| T62-06 | Tampering / information disclosure | Providers UI | mitigate | Closed text-only status mapping, agent-only DOM, one live region, semantic tokens, and negative authority guards prevent injection, secret/path/version leakage, and selection/form/recommendation mutation. The terminal UI source audit is 24/24 with both final ordering regressions passing. | closed |
| T62-07 | Information disclosure | Drift terminal and reporter | mitigate | Terminal/report detail exact-validates only `{adapterId, expected, observed}`. Tests exclude raw JSONL, messages, paths, versions, sessions, tasks, provider output, secrets, stacks, and caller context. | closed |
| T62-08 | Denial of service / repudiation | Diagnostic admission | mitigate | Authoritative-final reporting is exact-once per delegation, the dedupe FIFO is bounded at 512, and per-adapter admission is pre-throttled at ten seconds with boundary/rollback coverage. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Verification Evidence

- Terminal standard code review at documentation boundary `614c31b8` reviewed the complete 34-file source scope at implementation `ba572f94`: **clean**, 0 critical / 0 warning / 0 info.
- Terminal UI source audit at documentation boundary `8adfbb1f` reviewed implementation `ba572f94`: **24/24**, 0 blockers / 0 warnings.
- `tests/delegation-phase-contract.test.js`: **763 passed / 0 failed**, including T62-01 through T62-08, safe schemas, preserved interfaces, negative authority guards, and UAT-ledger integrity.
- Focused compatibility, drift, doctor, storage, background, Providers logic/UI, and spawn-supervisor suites pass as recorded in `62-REVIEW.md`.
- The final stock UI regressions prove that an older pre-manual storage debounce cannot erase manual success and an older expiry response cannot overwrite a newer external generation or cancel its deadline.
- No automated evidence checks off `UAT62-01` through `UAT62-03`; all remain `human_needed`, pending, and evidence-empty.

---

## Accepted Risks Log

No accepted risks. All plan-time threats are mitigated and verified closed.

---

## Security Audit Trail

| Audit date | Threats total | Closed | Open | Run by |
|------------|---------------|--------|------|--------|
| 2026-07-16 | 8 | 8 | 0 | Codex / `gsd-secure-phase` short-circuit verification |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-16
