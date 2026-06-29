# 46-01 Summary: Candidate Selection + Handler Ports

Implemented the first Phase 46 read batch:

- Netlify: `list_sites`, `get_site`, `list_deploys`, `list_forms`.
- Bitbucket: `list_workspaces`, `list_repositories`, `get_repository`.
- CircleCI: `get_current_user`, `list_pipelines`, `get_project`.

Each handler builds a single same-origin GET bound spec, carries closed params copied from the descriptors, and rejects wrong-shape logged-out/error bodies with `RECIPE_DOM_FALLBACK_PENDING`.
