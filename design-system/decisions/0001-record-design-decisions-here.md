# 0001. Record design decisions in design-system/decisions

- Status: Accepted
- Date: 2026-11-24

## Context and problem statement

FSB's design choices were spread over per-phase planning files (`UI-SPEC.md`, `CONTEXT.md`), a Key Decisions table in `.planning/PROJECT.md`, source comments and conversations. Several choices had no record at all: the two neutral ramps, the overlay orange and the type pairing. Each new piece of UI work rediscovered the rules from the code, and agents writing UI had no tracked design context.

## Considered options

1. Numbered Markdown records in `design-system/decisions/`, beside the tokens and guidelines they explain.
2. A single decision table in `DESIGN.md`, in the same Decision, Rationale, Outcome format as `.planning/PROJECT.md`.
3. A separate repository for design records.

## Decision outcome

Chosen option 1. One file per decision has room for context, alternatives and consequences, which a table row does not, and `scripts/verify-design-system.mjs` can check its shape. Design systems that keep records away from the code tend to let them go stale.

## Consequences

- A change to a rule that several surfaces follow comes with a record in the same pull request.
- Phase planning files stay phase-scoped. When a phase decides something that changes a shared rule, the decision is copied here and the phase file links to it.
- The template and its rules are in [0000-decision-record-template.md](0000-decision-record-template.md).

## Evidence

- [design-system/README.md](../README.md)
- [scripts/verify-design-system.mjs](../../scripts/verify-design-system.mjs) `checkDecisions`
- [.planning/PROJECT.md](../../.planning/PROJECT.md), section "Key Decisions"
