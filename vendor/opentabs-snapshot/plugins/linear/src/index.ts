// Vendored metadata slice of the OpenTabs linear plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// Linear is the GraphQL/camelCase transport app -- its ops POST to a single GraphQL
// endpoint, so the side-effect class derives from the op-name VERB (the GraphQL/RPC
// carve-out in side-effect-class.mjs), NOT the HTTP method. This is the cross-app
// `create_*` collision near-neighbor (linear.create_issue vs asana/todoist
// create_*) the Phase-37 MED-03 fix proves wrong-invoke=0 against.
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { createIssue } from './tools/create-issue.js';
import { listIssues } from './tools/list-issues.js';
import { getIssue } from './tools/get-issue.js';
import { updateIssue } from './tools/update-issue.js';
import { createComment } from './tools/create-comment.js';

class LinearPlugin extends OpenTabsPlugin {
  readonly name = 'linear';
  readonly description =
    'OpenTabs plugin for Linear — manage issues, comments, and projects via the Linear GraphQL API';
  override readonly displayName = 'Linear';
  readonly urlPatterns = ['*://linear.app/*'];
  override readonly homepage = 'https://linear.app';
  readonly tools: ToolDefinition[] = [
    // Issues (the vendored dev/productivity batch-A slice)
    listIssues,
    getIssue,
    createIssue,
    updateIssue,
    createComment,
  ];
}

const plugin = new LinearPlugin();
export default plugin;
export { plugin };
