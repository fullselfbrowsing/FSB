# 0000. Decision record template

- Status: Accepted
- Date: 2026-11-24

Copy this file to `NNNN-short-title.md` with the next free number, then replace every section. `scripts/verify-design-system.mjs` checks the shape: the first line is `# NNNN. Title`, the Status and Date lines exist, the five sections below appear in this order, and numbers run from 0000 without gaps or repeats.

Rules for using these records:

- Write a record when a choice changes a rule that more than one surface follows, or when someone keeps asking why something looks the way it does.
- Create it as `Proposed` before deciding, then update it in place. Once a record is `Accepted`, change only its status and links.
- To reverse a decision, write a new record whose status line is `Accepted` and whose body says `Supersedes NNNN`, then set the old record's status to `Superseded by NNNN`. The checker fails if either side is missing.
- Never reuse a number.
- Status is one of `Proposed`, `Accepted`, `Deprecated`, `Rejected` or `Superseded by NNNN`.

## Context and problem statement

What forces the decision: the situation, the problem, and the constraints. Two to six sentences. Link the code or pages involved.

## Considered options

1. The option that was chosen.
2. Each alternative that was seriously considered.

## Decision outcome

Chosen option: the option, and the reason in one or two sentences.

## Consequences

What becomes easier, what becomes harder, and what has to change elsewhere (tokens, pages, tests).

## Evidence

Links to the code, commits, pull requests and design boards that show the decision. Cite a path plus a selector or symbol, not a line number.
