# Requirements: FSB (Full Self-Browsing) -- v1.1.0 T1 App Execution Expansion

**Defined:** 2026-06-29
**Extended:** 2026-06-29 with Phase 51 full-tail migration.
**Core Value:** Reliable single-attempt execution -- the AI decides correctly; the mechanics execute precisely. v1.1.0 focuses on converting the v1.0.0 catalog tail from search/discovery support into verified direct T1 execution where it is technically and safely provable.

## v1 Requirements

Requirements for the v1.1.0 milestone. Each maps to roadmap phases beginning at Phase 44.

### T1R -- T1 Readiness, Porting, and Verification

- [x] **T1R-01**: Generate an authoritative T1 readiness matrix over all 2,314 descriptors, including app, slug, side-effect class, current tier/backing, origin class, suspected auth pattern, same-origin/separate-origin feasibility, and next action.
- [x] **T1R-02**: Update search/UI/docs language so catalog support, T1-ready execution, fail-closed guarded writes, T2 learn-pending, and T3 DOM/discovery-pending are visibly distinct and cannot be overclaimed.
- [x] **T1R-03**: Add a CI guard that prevents a descriptor from being marked T1-ready unless it has a registered handler or recipe plus required verification coverage.
- [x] **T1R-04**: Provide a reusable T1 port scaffold for same-origin reads, same-origin writes, and separate-origin candidates.
- [x] **T1R-05**: Every new T1 port must prove origin-pin, executeBoundSpec-only execution, logged-out/body shape guards, no-secret logging, consent compatibility, and router parity.
- [x] **T1R-06**: Port a first batch of high-value read descriptors to executable T1/T1b, selected by readiness feasibility, user value, and low side-effect risk.
- [x] **T1R-07**: Implement or explicitly reject a Pattern-D execution architecture for separate-origin/per-org-subdomain APIs, with negative-control tests proving unsafe ports fail closed.
- [x] **T1R-08**: Spike and decide the Google Workspace GAPI bridge handler family for Docs, Drive, and Calendar through a page-owned `window.gapi.client.request` trampoline.
- [x] **T1R-09**: Preserve all v1.0.0 security walls: no OpenTabs runtime/plugin code, no new MCP tool-per-app surface, no secret persistence, and denylist/sensitive-origin behavior unchanged unless deliberately re-scoped.
- [x] **T1R-10**: Generalize the live UAT template for guarded writes/destructive actions, recording method/path/body shape and CSRF/token location redacted to shape only.
- [x] **T1R-11**: Activate write/destructive T1 handlers only when live mutation-body UAT and consent/audit checks pass; otherwise keep them fail-closed with explicit reasons.
- [x] **T1R-12**: Close with a before/after T1 coverage report, full regression suite, validate:extension, and prioritized next-batch plan for the remaining tail.

### T1ALL -- Full Tail Migration Extension

Phase 51 promotes the previously deferred full-tail work into the active milestone. These are intentionally stricter than "catalog searchable"; they require direct execution proof or an explicit terminal state.

- [ ] **T1ALL-01**: Generate and maintain a Phase 51 worklist for every catalog-tail descriptor not currently T1-ready or guarded fail-closed, including app, slug, side-effect class, readiness, route feasibility, origin class, and required proof.
- [ ] **T1ALL-02**: Make every safe, non-denied descriptor in the catalog executable as T1/T1b where technically possible, using verified same-origin handlers, declarative recipes, Pattern-D bridges, GAPI/page bridges, or live learned recipes.
- [ ] **T1ALL-03**: Close all live UAT required for write/destructive actions before activating them; otherwise keep those rows guarded fail-closed with redacted evidence records.
- [ ] **T1ALL-04**: Keep denied origins blocked and document any product/legal policy exception before changing denylist behavior.
- [ ] **T1ALL-05**: Add or preserve user/developer readiness surfaces so app-level degraded, blocked, bridge-needed, UAT-needed, and T1-ready states cannot be confused.

## v2 Requirements

Acknowledged but deferred beyond v1.1.0 unless pulled into an approved phase.

### Post-Full-Tail Hardening

- **T1V2-01**: Optimize handler bundle size and cold-start after broad T1 coverage lands.
- **T1V2-02**: Add richer product UI for app-level health, degraded execution, and re-port prompts beyond the minimum Phase 51 readiness surfaces.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Claiming catalog-tail descriptors are T1-ready without per-app proof | Unsafe and inaccurate; each app requires origin/auth/shape/UAT verification. |
| Shipping OpenTabs plugin runtime code in the extension | Violates MV3 Wall 1; OpenTabs remains metadata/provenance input only. |
| Activating finance/payment/social/destructive writes from guessed endpoints | Writes stay fail-closed until live request shape and consent/audit behavior are proven. |
| Adding one MCP tool per app or per operation | Breaks the progressive-disclosure surface; the two capability tools remain the boundary. |
| Weakening denylist or sensitive-origin policy to inflate T1 coverage | Security posture is a gate, not a metric to game. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| T1R-01 | Phase 44 | Complete |
| T1R-02 | Phase 44 | Complete |
| T1R-03 | Phase 44 | Complete |
| T1R-04 | Phase 45 | Complete |
| T1R-05 | Phase 45 | Complete |
| T1R-06 | Phase 46, Phase 48 | Complete |
| T1R-07 | Phase 47, Phase 48 | Complete |
| T1R-08 | Phase 47, Phase 48 | Complete |
| T1R-09 | Phase 45 | Complete |
| T1R-10 | Phase 49 | Complete |
| T1R-11 | Phase 49 | Complete |
| T1R-12 | Phase 50 | Complete |
| T1ALL-01 | Phase 51 | Active |
| T1ALL-02 | Phase 51 | Active |
| T1ALL-03 | Phase 51 | Active |
| T1ALL-04 | Phase 51 | Active |
| T1ALL-05 | Phase 51 | Active |

**Coverage:**
- v1 requirements: 17 total
- Mapped to phases: 17
- Unmapped: 0

---
*Requirements defined: 2026-06-29 -- v1.1.0 T1 App Execution Expansion milestone started after closing v1.0.0 and was extended with Phase 51 full-tail migration on 2026-06-29.*
