# 45-01 Summary: Port Contract Library + Scaffold CLI

## Completed

- Added `scripts/lib/t1-port-contract.mjs`.
- Added `scripts/scaffold-t1-port.mjs`.
- Added `tests/t1-port-contract.test.js`.

## Behavior

- Validates required proof metadata for same-origin reads, same-origin writes, guarded writes, and separate-origin candidates.
- Rejects active writes without live UAT evidence.
- Rejects executable separate-origin candidates.
- Scans handler source for direct `chrome.scripting`/`chrome.tabs`, direct fetch/XHR, credential APIs, dynamic code, and secret-bearing console logs.
- Renders markdown checklists from the current readiness row for a slug.

## Verification

- `node tests/t1-port-contract.test.js` PASS, 11 passed / 0 failed.
- `node scripts/scaffold-t1-port.mjs --slug gitlab.list_projects` rendered a same-origin read checklist.
- `node scripts/scaffold-t1-port.mjs --slug linear.create_issue --type separate-origin-candidate` rendered a non-executable separate-origin checklist.
