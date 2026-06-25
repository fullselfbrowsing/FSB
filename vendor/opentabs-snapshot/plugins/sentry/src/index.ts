// Vendored metadata slice of the OpenTabs sentry plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// Sentry is a REST app (host sentry.io -> derived stem 'sentry', NOT in
// STEM_OVERRIDES). Its ops GET against the Sentry REST API (reads: list_issues /
// get_issue / list_projects) and PUT to /issues/:id/ to resolve an issue.
// resolve_issue carries a {method:'PUT'} signal in its (never-run) handle so the
// importer floors it to write (`resolve` is not a recognized side-effect verb).
// This is part of the Phase-37 dev/productivity batch-A sub-batch 4 (cloudflare/
// circleci/datadog/sentry/posthog -- cloud + observability, completing the category).
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { listIssues } from './tools/list-issues.js';
import { getIssue } from './tools/get-issue.js';
import { listProjects } from './tools/list-projects.js';
import { resolveIssue } from './tools/resolve-issue.js';

class SentryPlugin extends OpenTabsPlugin {
  readonly name = 'sentry';
  readonly description =
    'OpenTabs plugin for Sentry — inspect issues and projects and resolve issues via the Sentry REST API';
  override readonly displayName = 'Sentry';
  readonly urlPatterns = ['*://sentry.io/*'];
  override readonly homepage = 'https://sentry.io';
  readonly tools: ToolDefinition[] = [
    // Issues + projects (reads) and issue resolution (write) -- sub-batch-4 observability slice.
    listIssues,
    getIssue,
    listProjects,
    resolveIssue,
  ];
}

const plugin = new SentryPlugin();
export default plugin;
export { plugin };
