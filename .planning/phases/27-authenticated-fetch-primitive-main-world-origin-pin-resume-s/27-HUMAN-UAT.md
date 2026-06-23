---
phase: 27-authenticated-fetch-primitive-main-world-origin-pin-resume-s
status: human_needed
created: 2026-06-20
---

# Phase 27 Human UAT: Authenticated MAIN-World Fetch Logged-In-Shape Closeout

This scenario requires a real Chrome session signed in to github.com. It was NOT executed in the autonomous run and must not be treated as passed until a human records the observed result. The CI suite `tests/capability-fetch.test.js` already proves every FSB-owned mechanic through mocks/stubs/fixtures (the MAIN-world recorder + serialization-safety, the in-page CSRF threading, the active-tab origin-pin with no side effect on mismatch, the `BEFORE_API_REQUEST` resume-sidecar lifecycle, the `classifyOnWake` mutating-method `RECOVERY_AMBIGUOUS`, and the end-to-end success shape through the stubbed seam). The ONE property the CI suite cannot prove is the irreducibly-live one: that real GitHub HttpOnly cookies (`_gh_sess` / `logged_in`, JS-unreadable) actually attach in the page MAIN world and return a LOGGED-IN body shape (not logged-out). That shape assertion is the subject of this UAT.

## Setup

1. Load `extension/` as an unpacked Chrome extension.
2. Sign in to github.com in a normal `https://` tab.
3. Keep the active tab on `https://github.com` (the origin-pin requires the active-tab origin to equal `https://github.com`; the second-layer pin in `executeBoundSpec` re-asserts `chrome.tabs.get(tabId).url` origin === `spec.origin` before any side effect).
4. Have the hardcoded recipe `catalog/recipes/github-notifications.json` (origin `https://github.com`, endpoint `/notifications`, method `GET`, `authStrategy: same-origin-cookie`, `extract: "@"`) available to the Phase-27 entry path (`interpretRecipe` -> `executeBoundSpec`).
5. Keep DevTools closed unless you are inspecting the in-flight snapshot or the recorded request.

## Required Scenarios

| ID | Scenario | Procedure | Expected Outcome | Status |
|----|----------|-----------|------------------|--------|
| UAT-27-01 | Logged-in shape | Signed in to github.com with the active tab on `https://github.com`, run the hardcoded `github.com GET /notifications` recipe (`catalog/recipes/github-notifications.json`) through the Phase-27 entry path against that tab. | The response is HTTP 200 (NOT a 302 to `/login?return_to=...`) AND/OR the `<meta name="user-login">` tag is NON-EMPTY (your username). A non-empty username / 200 confirms the first-party HttpOnly cookies attached in the page MAIN world and the body is the logged-in shape. | human_needed |
| UAT-27-02 | Logged-out contrast | Sign out of github.com (or use a fresh Chrome profile with no github.com session), keep the active tab on `https://github.com`, and run the SAME recipe via the Phase-27 entry path. | A 302 to `/login?return_to=...` (surfaced because the in-page fetch uses `redirect: 'manual'`) AND/OR an empty/absent `<meta name="user-login">`. This confirms the UAT-27-01 result was genuinely cookie-attached (a real authenticated read), not a static page that returns the same content signed-out. | human_needed |
| UAT-27-03 | Origin-pin live | With the active tab on a NON-github origin (any other `https://` site), attempt the same `github.com GET /notifications` recipe via the Phase-27 entry path. | `RECIPE_ORIGIN_MISMATCH` (both `code` and `errorCode`); NO request is fired and NO `executeScript` side effect occurs (the active-tab origin != `spec.origin` short-circuits in `executeBoundSpec` before injection). | human_needed |

## Recording Results

When executed, replace each `human_needed` status with `pass`, `fail`, or `partial`, and add the date, Chrome version, extension commit, and a short observed-outcome note (e.g. the observed HTTP status and the `<meta name="user-login">` content, redacted to logged-in/logged-out rather than the literal username if preferred). Before recording, re-verify the A1/A2 GitHub-behavior assumptions at run time, since GitHub's web UI can change: confirm the `<meta name="user-login">` tag name is still the logged-in marker and that the signed-out redirect is still a 302 to `/login?return_to=...` (the A1 assumption was last live-probed 2026-06-20 per 27-CONTEXT.md; A2 is that `_gh_sess` / `logged_in` remain HttpOnly so the logged-in shape is obtainable ONLY via the page-context `credentials:'include'` fetch). Do not mark the Phase 27 live FETCH-05 assertion complete unless UAT-27-01 has a recorded outcome.
