# Quick 260630-gry: Shortcut Same-Origin/App-Specific T1 Proof

## Scope

Promote the next safe slice of the `same-origin-read` proof backlog by adding an app-specific Shortcut T1a head for the eight no-param read descriptors:

- `shortcut.get_current_user`
- `shortcut.list_epics`
- `shortcut.list_iterations`
- `shortcut.list_labels`
- `shortcut.list_members`
- `shortcut.list_objectives`
- `shortcut.list_teams`
- `shortcut.list_workflows`

Parameterized Shortcut reads and all Shortcut writes/destructive operations remain out of scope.

## Plan

1. Add a Shortcut handler that derives the workspace slug from the authoritative active tab URL, bootstraps tenant IDs through `/backend/api/private/user/slug-info/<slug>`, and calls `/backend/api/v3/*` with `Tenant-Organization2` and `Tenant-Workspace2` headers inside bound same-origin specs.
2. Thread the active tab URL from both capability invoke front doors into the T1a handler context.
3. Register `FsbHandlerShortcut` in the head manifest, service-worker import path, search readiness overrides, port contract, coverage/reporting lists, and origin-classification mapping.
4. Add tests for URL propagation, Shortcut bootstrap/header/shape guards, manifest count, dom->T1a upgrades, origin classification, and readiness surface coverage.
5. Package the extension, regenerate T1 readiness/tail/terminal reports, and run validation.

## Acceptance

- Shortcut handler never calls `chrome.scripting`, `chrome.tabs`, direct `fetch`, or `XMLHttpRequest`.
- Missing workspace slug, invalid slug-info bootstrap, or wrong response shape returns `RECIPE_DOM_FALLBACK_PENDING` before overclaiming success.
- T1 readiness moves from 84 ready / 2,225 tail / 1,096 same-origin-proof rows to 92 ready / 2,217 tail / 1,088 same-origin-proof rows.
- `npm run validate:extension` passes.
