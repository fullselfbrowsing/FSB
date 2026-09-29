---
status: partial
phase: 58-providers-panel
source: [58-VERIFICATION.md]
started: 2026-07-12T23:14:01Z
updated: 2026-07-13T01:18:30Z
deferred_until: milestone-end
deferred_by: user
---

## Current Test

[deferred to the v0.9.91 milestone-end UAT sweep by user instruction]

## Tests

### 1. Legacy hash canonicalization
expected: Opening `#api-config` activates Providers and rewrites the URL to `#providers` without a redirect loop.
result: [pending]

### 2. Exactly one advisory badge
expected: Exactly one Recommended badge is visible and remains visually distinct from the selected radio row.
result: [pending]

### 3. Selection and focus survive Refresh
expected: Manual or failed refresh changes evidence only; checked row, focus, API values, and Save state remain unchanged.
result: [pending]

### 4. Agent mode removes API controls
expected: Agent selection removes model, key, endpoint, and hint controls from view and tab order.
result: [pending]

### 5. API mode restores latent values
expected: Returning to an API provider restores its prior model, key, and endpoint values.
result: [pending]

### 6. Live, historical, unavailable, and stale evidence
expected: The corresponding scenarios visibly read Connected now, Seen before, Status unavailable, and Status may be stale; background refresh is polite and explicit failure alerts once.
result: [pending]

### 7. Empty and unsupported-client states
expected: A confirmed empty inventory shows No agent CLI detected; unsupported identities remain inert text in Other MCP clients.
result: [pending]

### 8. Agent usage and billing details
expected: Unknown auth shows Billing not reported, three em dashes, no currency field, and the correct official billing link opens safely.
result: [pending]

### 9. Light and dark themes
expected: Selection, recommendation, semantic badges, errors, body copy, and focus rings remain readable in both themes.
result: [pending]

### 10. Desktop and compact layout
expected: The roster is two columns at 900px and above, one column below, and has no compact-width overflow.
result: [pending]

### 11. Keyboard radio behavior
expected: Tab, arrows, and Space operate one native radio group without focus jumps after evidence updates.
result: [pending]

### 12. Reduced motion
expected: Refresh still announces status while spin, transform, and transition motion are removed.
result: [pending]

## Summary

total: 12
passed: 0
issues: 0
pending: 12
skipped: 0
blocked: 0

## Gaps

Live Chrome visual/interaction evidence is unavailable because the in-app Browser target list is empty. Automated/source verification is complete (8/8 must-haves and 6/6 PROV requirements satisfied). The user explicitly deferred all live UAT to the milestone-end gate so downstream phases can continue autonomously.
