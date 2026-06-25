---
current_opentabs_source: github
current_opentabs_repo: github.com/opentabs-dev/opentabs
current_opentabs_sha: 4b17021637d2cac12b8d84d21c40e765aa7b85e9
current_opentabs_ref: main
current_opentabs_pinned_at: "2026-06-21T21:54:20Z"
current_opentabs_license: MIT
schema_version: 1
---

# OpenTabs Snapshot Pin -- FSB <-> OpenTabs metadata provenance

This file is the SINGLE FSB-side index of the OpenTabs surface FSB consumes,
mirroring the `.planning/LATTICE-PIN.md` discipline (SHA + license + a per-phase
log). FSB's v1.0.0 milestone (Full App Catalog / OpenTabs Parity) imports
OpenTabs' MIT plugin **metadata** to emit closed-vocabulary FSB catalog
descriptors. This pin records the exact OpenTabs commit + license so that work is
hermetic, offline, and auditable.

**Current source:** github.com/opentabs-dev/opentabs @ 4b17021637d2cac12b8d84d21c40e765aa7b85e9 (main, 2026-06-21)
**License:** MIT -- Copyright (c) 2026-present OpenTabs Contributors

## Wall 1 -- metadata-only (non-negotiable)

ONLY OpenTabs **metadata** is ever vendored under `vendor/opentabs-snapshot/`. The
OpenTabs `dist/` build output and its `handle()` plugin runtime (any `.js` source)
are NEVER vendored and NEVER shipped inside the FSB extension. MV3 prohibits
remotely-hosted / dynamically-loaded code; FSB descriptors are closed-vocabulary
DATA bound by the fixed interpreter, never executable OpenTabs code. This
directory holds ONLY this `PIN.md` + a `_provenance.json` scaffold in Phase 35;
the actual metadata files land in Phase 36.

## MIT License (verbatim)

MIT License

Copyright (c) 2026-present OpenTabs Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Per-FSB-Phase Log

Each row records one FSB phase's OpenTabs-side metadata-vendoring state. Rows are
append-only; closed phases are not edited retroactively.

| FSB Phase | Date | OpenTabs SHA | Metadata vendored | Notes |
|-----------|------------|-------------|-------------------------------------------------------------|------------------------|
| Phase 35 | 2026-06-24 | 4b170216... | (none yet -- scaffold only; metadata files land in Phase 36) | PIN + license scaffold |
| Phase 36 | 2026-06-24 | 4b170216... | plugins/todoist (7-op Tasks smoke slice: create/list/get/update/close/reopen/delete) | importer smoke (CGEN-01) |
| Phase 37 | 2026-06-24 | 4b170216... | plugins/linear (5 ops: create/list/get/update_issue + create_comment; GraphQL), plugins/asana (4 ops: create/list/get/update_task; REST) | breadth batch A (BRDTH-01); the MED-03 create_* collision near-neighbors |
| Phase 37 | 2026-06-25 | 4b170216... | plugins/clickup (4 ops: create/list/get/update_task; REST), plugins/jira (5 ops: create/search/get/update_issue + add_comment; REST), plugins/confluence (4 ops: create/get/search/update_page; REST), plugins/airtable (5 ops: list/get/create/update/delete_record; REST) | breadth batch A sub-batch 2 (BRDTH-01); jira/confluence share *.atlassian.net -> distinct slugs via STEM_OVERRIDES; airtable.delete_record is the destructive crosscheck proof |

## How this file gets used

- **At plan-time:** the planner reads the frontmatter `current_opentabs_*` fields to
  ground "what OpenTabs surface FSB depends on right now."
- **At execute-time:** when a phase vendors OpenTabs metadata, the executor appends a
  row recording the OpenTabs SHA and which metadata files landed.
- **At verify-time:** `tests/provenance-scaffold.test.js` cross-checks that this PIN.md
  pins the SHA + MIT license and that `vendor/opentabs-snapshot/` contains no runtime
  `.js` (the Wall-1 no-runtime guarantee).
