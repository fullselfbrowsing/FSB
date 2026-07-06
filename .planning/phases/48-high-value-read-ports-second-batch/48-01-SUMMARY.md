# 48-01 Summary: Vercel Read Head

Implemented `catalog/handlers/vercel.js` and mirrored it to `extension/catalog/handlers/vercel.js`.

Activated:

- `vercel.get_user`
- `vercel.list_teams`
- `vercel.list_projects`
- `vercel.get_project`
- `vercel.list_deployments`
- `vercel.get_deployment`
- `vercel.list_domains`

Deferred:

- `vercel.list_env_vars`, because environment-variable reads need separate sensitivity review.
