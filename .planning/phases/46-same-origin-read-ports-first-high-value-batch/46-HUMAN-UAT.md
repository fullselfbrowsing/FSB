# Phase 46 Human UAT Notes

**Status:** deferred / optional live evidence

No live Netlify, Bitbucket, or CircleCI credentials were available in this headless run. The shipped change is read-only and same-origin gated; headless tests prove endpoint construction, resolver upgrade, origin classification, and logged-out fallback behavior.

Suggested live smoke, when credentials are available:

| App | Slug | Page to open | Expected |
|-----|------|--------------|----------|
| Netlify | `netlify.list_sites` | `https://app.netlify.com/` signed in | Returns a success payload with an array body. |
| Netlify | `netlify.get_site` | `https://app.netlify.com/` signed in | Returns a success payload with a site object for a known `site_id`. |
| Bitbucket | `bitbucket.list_workspaces` | `https://bitbucket.org/` signed in | Returns a success payload with `values[]`. |
| Bitbucket | `bitbucket.get_repository` | `https://bitbucket.org/` signed in | Returns a success payload for a known workspace/repo pair. |
| CircleCI | `circleci.get_current_user` | `https://app.circleci.com/` signed in | Returns a success payload with current user fields. |
| CircleCI | `circleci.list_pipelines` | `https://app.circleci.com/` signed in | Returns a success payload with `items[]` for a known project slug. |

If any live response returns HTML, a login envelope, or an unexpected JSON shape, the handler should return `RECIPE_DOM_FALLBACK_PENDING` rather than false success.
