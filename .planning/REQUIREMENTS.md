# Requirements: FSB (Full Self-Browsing)

**Defined:** 2026-09-28  
**Core value:** Reliable single-attempt execution — the AI decides correctly; the mechanics execute precisely.  
**Milestone:** v1.0.0 Jev Fast Mode  
**Source:** `.planning/PROJECT.md` and `.planning/research/JEV-REFERENCE.md`

## v1 Requirements

### MEAS — Timing and Baseline

- [ ] **MEAS-01:** An operator can inspect per-call wall time, FSB execution time, model time, tokens, and cost for both MCP and autopilot sessions, with unavailable values labelled rather than invented.
- [ ] **MEAS-02:** An operator can retrieve session details for a journal-backed MCP session, including its tool calls and timing records.
- [ ] **MEAS-03:** An operator can run a repeatable, outcome-checked task suite and save a baseline of completion rate, wall time per completed task, and cost before enabling Jev.

### JEV — Decision Provider and Safety

- [ ] **JEV-01:** A user on any FSB install can use FSB-provided Jev without supplying or configuring a Jev or OpenRouter key, signing in, or receiving a per-user or per-install usage quota.
- [ ] **JEV-02:** FSB's Jev credential stays in server-side secret storage; the extension sends bounded decision requests to the FSB server over HTTPS and never receives the upstream credential.
- [ ] **JEV-03:** The extension and server omit secrets, credential values, password, file, and hidden inputs, and unnecessary page content from Jev requests; page text is treated as untrusted data rather than instructions.
- [ ] **JEV-04:** An operator can inspect the actual returned model version, token usage, FSB-borne cost when available, and typed fallback reason for each Jev decision without exposing request bodies or credentials in logs.
- [ ] **JEV-05:** Jev can evaluate labelled tasks in shadow mode without acting, so operation, target, completion, stuck, and risk thresholds are calibrated on a pinned model before live use.
- [ ] **JEV-06:** Jev can add a confirmation requirement but cannot remove an existing confirmation, bypass an execution safety breaker, or authorize an action on its own.
- [ ] **JEV-07:** The FSB server validates a fixed bounded decision schema, limits request size and concurrent upstream work, records aggregate usage and FSB-borne cost, and supports an operator-wide disable switch; malformed, unavailable, and disabled calls return typed fallbacks.

### AUTO — Autopilot Fast Mode

- [ ] **AUTO-01:** A user can enable or disable Jev fast mode in the control panel's Advanced Settings, or through the MCP settings tool (SET-01), which changes the same stored setting; it is off by default, explains that bounded page context is sent through FSB to Jev, and existing autopilot behavior remains available when off.
- [ ] **AUTO-02:** For a supported simple step, Jev can choose only an offered operation and element from FSB's filtered current snapshot; FSB validates target freshness and executes the action through its existing mechanics.
- [ ] **AUTO-03:** The LLM retains planning, generated text, page reading, unsupported actions, and decisions below calibrated thresholds.
- [ ] **AUTO-04:** The fast loop uses observable page evidence for completion and stuck checks, enforces task time, action, and Jev-call budgets, and reports the actual terminal state.
- [ ] **AUTO-05:** Ambiguous targets, changed page state, provider errors, and missing evidence fall back to the existing LLM path or a truthful blocked outcome without repeating an unsafe action.

### MCP — Faster Existing Tool Surface

- [ ] **MCP-01:** MCP clients receive shorter descriptions for all 73 existing tools while retaining enough argument and safety guidance to use them correctly.
- [ ] **MCP-02:** Action tools accept an optional `expect` value and return a bounded outcome check in the same call, so the caller can distinguish verified effect from uncertainty.
- [ ] **MCP-03:** Existing `run_task` honors the extension's Advanced Settings fast-mode toggle, applies bounded Jev decisions when enabled, and reports done, ambiguous, blocked, or needs-confirmation outcomes without claiming success from Jev's answer alone.
- [ ] **MCP-04:** Existing MCP tool names, required arguments, and wire contracts remain byte-stable; this milestone adds only the optional `expect` parameter on action tools and the settings tool approved on 2026-09-29 (SET-01, SET-02).

### SET — Settings Control

- [ ] **SET-01:** An MCP client can use one new tool to view all of FSB's control-panel settings in one compact call and to change a single setting by key in one call. Secret values are masked on read and refused on write. Every other setting is writable.
- [ ] **SET-02:** Changes made through the settings tool use the control panel's own validation and storage, so the control panel, autopilot, and `run_task` share one value per setting, including the Jev fast-mode switch once Phase 68 adds it. Only MCP clients get the tool, and the autopilot tool list stays unchanged.

### EVAL — Comparative Release Gate

- [ ] **EVAL-01:** An operator can compare whole-task completion rate, wall time per completed task, and cost across baseline, fast mode, and a non-Jev control on the same task set.
- [ ] **EVAL-02:** Fast-mode release evidence reports pass or fail against predeclared speed, completion, and safety criteria; failed criteria keep the affected fast path experimental or disabled rather than being reported as a win.

### REL — Versioned Release

- [ ] **REL-01:** The extension is versioned as 1.0.0 through a `CHANGELOG.md` v1.0.0 entry followed by `npm run version:set:extension -- 1.0.0`.
- [ ] **REL-02:** The MCP package receives the planned minor version bump for its additive optional parameters and the new settings tool, with compatibility checks against existing callers.

## Future Requirements

| Candidate | Reason deferred |
| --- | --- |
| A Jev-generated plan, typed prose, or page summary | Jev returns typed decisions; the LLM owns writing and reading. |
| Automatic fast mode for every task | This milestone gathers task-level evidence and keeps activation opt-in. |
| New MCP tools for Jev | Existing action tools and `run_task` cover the planned surface; add a tool only after a separately reviewed need. |
| User-supplied Jev or OpenRouter keys | FSB provides Jev through its hosted server path. |
| Further decision-model gateways or self-hosted models | The v1.0.0 server path uses a pinned Jev upstream. |
| Per-user or per-install Jev usage quotas | The owner chose unrestricted availability for now; usage is monitored centrally. |

## Out of Scope

| Item | Reason |
| --- | --- |
| Replacing the LLM with Jev | Planning, text generation, extraction, and complex page understanding still require the LLM. |
| Jev inventing selectors or arbitrary tool arguments | It may choose only code-offered options; FSB mechanics validate and execute. |
| Reducing existing purchase, account, publication, or other confirmation gates | Jev can only tighten confirmations. |
| Sending passwords, credential values, or hidden fields to a decision provider | Violates the existing secret-handling boundary. |
| Sending the FSB-owned Jev credential to extension code or storage | A shared credential cannot remain secret in a distributed client. |
| A second fast-mode switch, such as an MCP argument or a separately stored toggle | Advanced Settings holds the only fast-mode setting; the MCP settings tool reads and writes that same value. |
| User sign-in or payment entitlement for Jev | FSB provides Jev to every installation in this milestone. |

## Traceability

| Phase | Requirements | Count |
| --- | --- | ---: |
| 66 — Baseline and Session Timing | MEAS-01, MEAS-02, MEAS-03 | 3 |
| 66.1 — MCP Settings Tool (inserted) | SET-01, SET-02 | 2 |
| 67 — Hosted Jev Gateway, Policy, and Shadow Mode | JEV-01, JEV-02, JEV-03, JEV-04, JEV-05, JEV-06, JEV-07 | 7 |
| 68 — Autopilot Fast Mode | AUTO-01, AUTO-02, AUTO-03, AUTO-04, AUTO-05 | 5 |
| 69 — MCP Descriptions and Same-Call Checks | MCP-01, MCP-02, MCP-04 | 3 |
| 70 — Bounded MCP Fast Task | MCP-03 | 1 |
| 71 — Comparative Gate and Release | EVAL-01, EVAL-02, REL-01, REL-02 | 4 |

**Coverage:** 25/25 requirements mapped exactly once.
