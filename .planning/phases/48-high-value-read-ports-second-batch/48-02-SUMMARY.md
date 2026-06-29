# 48-02 Summary: CircleCI Read Extension

Extended `catalog/handlers/circleci.js` and mirrored it to `extension/catalog/handlers/circleci.js`.

Activated:

- `circleci.get_pipeline`
- `circleci.get_pipeline_workflows`
- `circleci.get_workflow`
- `circleci.get_workflow_jobs`
- `circleci.get_job`
- `circleci.get_job_artifacts`
- `circleci.get_job_tests`

Left inactive:

- CircleCI writes/destructive actions.
- Additional read candidates that need separate shape review, including contexts, schedules, metrics, flaky tests, and pipeline config.
