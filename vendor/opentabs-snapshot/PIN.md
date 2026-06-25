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
| Phase 37 | 2026-06-25 | 4b170216... | plugins/gitlab (4 ops: list/get/create_issue + create_merge_request; REST), plugins/bitbucket (4 ops: list/get/create_pull_request + list_repositories; REST), plugins/vercel (4 ops: list/get_deployment + list_projects + create_deployment; REST), plugins/netlify (4 ops: list/get_site + list_deploys + create_deploy; REST) | breadth batch A sub-batch 3 (BRDTH-01); code-hosting + deploy slice; all four hosts (gitlab.com/bitbucket.org/vercel.com/app.netlify.com) derive correctly -> NO STEM_OVERRIDES entry needed; create_merge_request/create_pull_request/create_deployment/create_deploy class write |
| Phase 37 | 2026-06-25 | 4b170216... | plugins/cloudflare (4 ops: list_zones/get_zone/list_dns_records + purge_cache; REST), plugins/circleci (4 ops: list_pipelines/get_pipeline/list_workflows + trigger_pipeline; REST), plugins/datadog (4 ops: query_metrics/list_monitors/get_monitor/list_dashboards; REST), plugins/sentry (4 ops: list_issues/get_issue/list_projects + resolve_issue; REST), plugins/posthog (4 ops: list_insights/get_insight/list_dashboards/query_events; REST) | breadth batch A sub-batch 4 (BRDTH-01); cloud + observability + CI/analytics slice, COMPLETING the dev/productivity category. cloudflare (dash.cloudflare.com->'dash') and datadog (app.datadoghq.com->'datadoghq') canonicalize to 'cloudflare'/'datadog' via the dir-name STEM_OVERRIDES; circleci/sentry/posthog derive correctly -> NO override. purge_cache classes DESTRUCTIVE (shared `purge` verb); trigger_pipeline ({method:'POST'}) / resolve_issue ({method:'PUT'}) class write |
| Phase 38 | 2026-06-25 | 4b170216... | plugins/chatgpt (3 ops: list_conversations/get_conversation + send_message; chatgpt.com), plugins/claude (3 ops: list_conversations/get_conversation + send_message; claude.ai), plugins/bluesky (4 ops: list_timeline/get_profile + create_post + delete_post; bsky.app), plugins/mastodon (4 ops: list_timeline/get_status + create_status + delete_status; mastodon.social), plugins/threads (3 ops: list_timeline/get_thread + create_thread; www.threads.net) | breadth batch B sub-batch 1 (continues BRDTH-01/03); AI-chat + microblog/fediverse, ALL screened SENSITIVE by 38-01 + ALL backing:'dom' (DOM-only, invocable=false). chatgpt/claude/mastodon derive correctly; bluesky's host/stem/slug is `bsky` (dir `bluesky`) -> NO override. threads vendors *://www.threads.net/* (the EXACT origin 38-01 screened sensitive -- the apex threads.net would emit UNscreened) and derives 'www' -> the dir-name STEM_OVERRIDES {threads:'threads'} canonicalizes the slug to opentabs__threads__* (the same first-label-isn't-app-name canonicalization as cloudflare/datadog/jira/confluence). send_message/create_* class write ({method:'POST'}); delete_post/delete_status class DESTRUCTIVE (apiVoid {method:'DELETE'}) |

## How this file gets used

- **At plan-time:** the planner reads the frontmatter `current_opentabs_*` fields to
  ground "what OpenTabs surface FSB depends on right now."
- **At execute-time:** when a phase vendors OpenTabs metadata, the executor appends a
  row recording the OpenTabs SHA and which metadata files landed.
- **At verify-time:** `tests/provenance-scaffold.test.js` cross-checks that this PIN.md
  pins the SHA + MIT license and that `vendor/opentabs-snapshot/` contains no runtime
  `.js` (the Wall-1 no-runtime guarantee).
