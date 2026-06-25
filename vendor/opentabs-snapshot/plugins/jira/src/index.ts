// Vendored metadata slice of the OpenTabs jira plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// Jira AND Confluence both host on *.atlassian.net. The importer derives each app's
// slug STEM from the vendored DIR NAME via STEM_OVERRIDES ({jira:'jira',
// confluence:'confluence', ...}) -- NOT from the shared host -- so this slice emits
// DISTINCT opentabs__jira__* slugs that never collide with confluence's
// opentabs__confluence__*. Jira Cloud is a REST app (platform REST API v3): the
// side-effect class derives from the named-verb helper + {method:'...'} literal +
// the op-name verb (api GET=read for get/search; api {method:'POST'/'PUT'}=write for
// create/update/add). Part of the Phase-37 dev/productivity batch-A sub-batch 2.
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { createIssue } from './tools/create-issue.js';
import { searchIssues } from './tools/search-issues.js';
import { getIssue } from './tools/get-issue.js';
import { updateIssue } from './tools/update-issue.js';
import { addComment } from './tools/add-comment.js';

class JiraPlugin extends OpenTabsPlugin {
  readonly name = 'jira';
  readonly description =
    'OpenTabs plugin for Jira — manage issues and comments via the Jira Cloud platform REST API';
  override readonly displayName = 'Jira';
  readonly urlPatterns = ['*://*.atlassian.net/*'];
  override readonly homepage = 'https://www.atlassian.com/software/jira';
  readonly tools: ToolDefinition[] = [
    // Issues (the vendored dev/productivity batch-A sub-batch-2 slice)
    searchIssues,
    getIssue,
    createIssue,
    updateIssue,
    addComment,
  ];
}

const plugin = new JiraPlugin();
export default plugin;
export { plugin };
