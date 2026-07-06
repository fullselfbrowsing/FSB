---
phase: quick-260531-5tw
plan: 01
subsystem: release-versioning
tags:
  - version-bump
  - chore
  - release-prep
dependency_graph:
  requires: []
  provides:
    - All extension/showcase/docs files synchronized at 0.9.90
  affects:
    - Chrome Web Store listing copy
    - GitHub README badges + title
    - Live homepage APP_VERSION display (showcase/angular)
tech_stack:
  added: []
  patterns:
    - Hand-edit of generated APP_VERSION constant (PR #56 lesson)
key_files:
  created:
    - .planning/quick/260531-5tw-update-extension-version-to-0-9-90-acros/260531-5tw-SUMMARY.md
  modified:
    - extension/manifest.json
    - extension/README.md
    - package.json
    - package-lock.json
    - showcase/angular/package.json
    - showcase/angular/package-lock.json
    - showcase/angular/src/app/core/seo/version.ts
    - README.md
    - mcp/README.md
    - store-assets/chrome-web-store/listing-copy.md
decisions:
  - "Hand-edited showcase/angular/src/app/core/seo/version.ts rather than running the generator script, per PR #56 lesson (live homepage previously displayed stale version)"
  - "Updated package.json line 22 (zip filename `fsb-v0.9.67.zip` -> `fsb-v0.9.90.zip`) under Rule 1/3: the plan's done criterion requires ZERO occurrences of 0.9.67 in Task 1 files, so the zip-filename hit was in-scope even though the plan body listed only lines 3 and 120"
metrics:
  duration: ~4 minutes
  completed: 2026-05-31
  tasks_completed: 3
  files_modified: 10
  occurrences_replaced: 17
---

# Quick Task 260531-5tw: Update extension version to 0.9.90 across all references — Summary

One-liner: Bumped every tracked occurrence of `0.9.67` to `0.9.90` across the extension, root package, Angular showcase, MCP/README contextual mentions, and Chrome Web Store listing copy — 17 replacements across 10 files, with `mcp/package.json` (0.9.2) and `showcase/server/package.json` (0.9.50) intentionally untouched per independent-versioning rule.

## Replacements Performed

| # | File | Line | Before | After |
|---|------|------|--------|-------|
| 1 | extension/manifest.json | 3 | `"name": "FSB v0.9.67"` | `"name": "FSB v0.9.90"` |
| 2 | extension/manifest.json | 4 | `"version": "0.9.67"` | `"version": "0.9.90"` |
| 3 | extension/README.md | 3 | `FSB v0.9.67` | `FSB v0.9.90` |
| 4 | package.json | 3 | `"version": "0.9.67"` | `"version": "0.9.90"` |
| 5 | package.json | 22 | `fsb-v0.9.67.zip` | `fsb-v0.9.90.zip` |
| 6 | package.json | 120 | `badge/version-0.9.67-blue.svg` | `badge/version-0.9.90-blue.svg` |
| 7 | package-lock.json | 3 | `"version": "0.9.67"` | `"version": "0.9.90"` |
| 8 | package-lock.json | 9 | `"version": "0.9.67"` | `"version": "0.9.90"` |
| 9 | showcase/angular/package.json | 3 | `"version": "0.9.67"` | `"version": "0.9.90"` |
| 10 | showcase/angular/package-lock.json | 3 | `"version": "0.9.67"` | `"version": "0.9.90"` |
| 11 | showcase/angular/package-lock.json | 9 | `"version": "0.9.67"` | `"version": "0.9.90"` |
| 12 | showcase/angular/src/app/core/seo/version.ts | 2 | `APP_VERSION = '0.9.67'` | `APP_VERSION = '0.9.90'` |
| 13 | README.md | 1 | `# FSB v0.9.67 Full Self Browsing` | `# FSB v0.9.90 Full Self Browsing` |
| 14 | README.md | 12 | `badge/version-0.9.67-0078D4` | `badge/version-0.9.90-0078D4` |
| 15 | README.md | 35 | `FSB v0.9.67 is functional ...` | `FSB v0.9.90 is functional ...` |
| 16 | mcp/README.md | 534 | `extension release (0.9.67)` | `extension release (0.9.90)` |
| 17 | store-assets/chrome-web-store/listing-copy.md | 5 | `FSB v0.9.67` | `FSB v0.9.90` |

Total: 17 replacements. (Plan estimated 16; the actual count is 17 because `package.json` line 22 carried a third `0.9.67` reference in the `package` script's zip filename — see Deviations below.)

## Excluded Files (Confirmed Untouched)

| File | Pinned Version | Reason |
|------|----------------|--------|
| mcp/package.json | 0.9.2 | Independent MCP versioning per mcp/README.md line 534 |
| showcase/server/package.json | 0.9.50 | Independent server versioning |
| showcase/angular/public/llms-full.txt | (crawler output) | Crawler artifact, user manages separately |
| showcase/angular/public/sitemap.xml | (crawler output) | Crawler artifact, user manages separately |

Confirmation grep:

```
$ grep "\"version\":" mcp/package.json showcase/server/package.json
showcase/server/package.json:  "version": "0.9.50"
mcp/package.json:  "version": "0.9.2"
```

`git status --porcelain showcase/angular/public/llms-full.txt showcase/angular/public/sitemap.xml` continues to show the pre-existing modified state (unrelated to this plan).

## Final Repo-Wide Guard Output

Both the plan's verification grep and the constraint-mandated final grep returned zero hits:

```
$ grep -rn "0\.9\.67" --include='*.md' --include='*.json' --include='*.ts' --include='*.js' \
    --exclude-dir=node_modules --exclude-dir=lattice --exclude-dir=.planning .
(no output, exit 1)

$ grep -rn "0\.9\.67" --include="*.json" --include="*.ts" --include="*.js" --include="*.md" \
    --include="*.html" --include="*.xml" --include="*.txt" . 2>/dev/null \
  | grep -v node_modules | grep -v ".planning/" | grep -v "_archive"
(no output, exit 1)
```

JSON validity check on all five edited JSON files passed (`JSON OK`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 + Rule 3 - Scope completeness] Updated `package.json` line 22 zip filename**

- **Found during:** Task 1
- **Issue:** Plan body listed only `package.json` lines 3 and 120, but the file also contained `fsb-v0.9.67.zip` on line 22 inside the `"package"` script. The plan's explicit done criterion ("After these edits there should be ZERO occurrences of `0.9.67` in these four files") cannot be satisfied without updating this third occurrence.
- **Fix:** Edited line 22 from `fsb-v0.9.67.zip` to `fsb-v0.9.90.zip` to match the new release version. Leaving it stale would have produced a misnamed packaging artifact for the 0.9.90 release.
- **Files modified:** package.json
- **Commit:** e5212245 (Task 1)

No architectural changes were needed. No checkpoints were hit.

## Self-Check

Files claimed created:

- `[ -f ".planning/quick/260531-5tw-update-extension-version-to-0-9-90-acros/260531-5tw-SUMMARY.md" ]` -> FOUND (this file)

Commits claimed:

- `e5212245` (Task 1: extension + root) -> FOUND
- `0f2a5fbb` (Task 2: Angular showcase + APP_VERSION) -> FOUND
- `6007eaf7` (Task 3: docs + store assets) -> FOUND

Repo-wide grep guard for `0.9.67` -> 0 hits outside excluded paths.

JSON validity across all 5 edited JSON files -> OK.

## Self-Check: PASSED
