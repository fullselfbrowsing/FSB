---
status: resolved
discovered: 2026-04-03
updated: 2026-06-15
session_id: session_1775188402694
milestone: v0.9.24
---

# Auth-Blocked Partial Outcome Lifecycle

## Verification Task

Find Vijaya Sai Latha Pupilati's LinkedIn profile, understand her background, browse relevant recent jobs, and send her the job details as a LinkedIn message.

## Expected

If FSB can do only part of the task because the final step requires authentication, it should preserve the useful completed work and end with an explicit blocked/manual-handoff outcome.

## Actual

The run completed useful research work, then hit the LinkedIn messaging auth boundary and ended as `error`.

## MCP Evidence

- Session: `session_1775188402694`
- Status: `error`
- Duration: 42s
- Iterations: 14
- Action history shows successful navigation and reading across Google search, LinkedIn profile, and LinkedIn jobs pages
- Final recorded progress message: "Task requires sending her a LinkedIn message, but automation lacks login/credentials for messaging. Cannot complete sending message."
- Session logs contain no runtime exception or transport failure; the run terminated cleanly through the lifecycle path

## Root Cause

1. The agent loop exposes only two terminal task lifecycle tools: `complete_task` and `fail_task`.
2. Auth-blocked tasks that still produced useful intermediate work have no first-class `partial` or `blocked` terminal state.
3. Because of that binary outcome model, the run is forced into `fail_task`/`error`, which discards the useful work from the final session result and makes the history look like a crash instead of a constrained handoff.

## Gap Work Created

- Phase 162.1: Partial Completion Lifecycle
- Phase 162.2: Auth Wall Handoff with Result Preservation

## Resolution

Resolved by archived milestone v0.9.24. `.planning/milestones/v0.9.24-ROADMAP.md`
records Phase 162.1 as shipped for first-class partial/blocked terminal
outcomes and Phase 162.2 as shipped for auth-wall handoff with result
preservation.
