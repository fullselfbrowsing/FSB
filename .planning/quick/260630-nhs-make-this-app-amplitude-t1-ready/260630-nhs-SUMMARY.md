# Quick Task 260630-nhs Summary: Make this app amplitude T1-ready

## Status

Complete.

## Changes

- Added `catalog/handlers/amplitude.js` and mirrored it to `extension/catalog/handlers/amplitude.js`.
- Registered the Amplitude head in the service worker/catalog manifests and readiness/report scripts.
- Marked the 14 read-classified Amplitude slugs as T1-ready in the search readiness override.
- Kept `amplitude.check_permissions` unregistered because it is write-classified and lacks write-activation evidence.
- Added Amplitude coverage to handler, readiness, terminal-state, origin-classification, and port-contract gates.

## T1-Ready Slugs

- `amplitude.get_color_palettes`
- `amplitude.get_current_user`
- `amplitude.get_entitlements`
- `amplitude.get_event_volumes`
- `amplitude.get_mtu_volumes`
- `amplitude.get_org_data`
- `amplitude.get_personal_space`
- `amplitude.get_report_quota`
- `amplitude.get_session_replay_volumes`
- `amplitude.list_events`
- `amplitude.list_orgs`
- `amplitude.list_spaces`
- `amplitude.list_users`
- `amplitude.search_content`

## Verification

- `node tests/capability-head-handlers.test.js`
- `node tests/head-handler-cap.test.js`
- `node tests/t1-readiness-report.test.js`
- `node tests/t1-terminal-states.test.js`
- `node scripts/verify-origin-classification.mjs`
- `node scripts/verify-t1-port-contract.mjs`
- Targeted readiness query confirmed 14 Amplitude read rows are `t1-ready` with handler proof and `amplitude.check_permissions` remains `discovery-pending`.
