// Vendored metadata slice of the OpenTabs gitlab plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// GitLab is a REST app (host gitlab.com -> derived stem 'gitlab', NOT in
// STEM_OVERRIDES). Its ops GET/POST against the GitLab REST API v4, so the
// side-effect class derives from the op-name verb + the {method:'...'} literal
// (api GET=read; api {method:'POST'}=write). This is part of the Phase-37
// dev/productivity batch-A sub-batch 3 (gitlab/bitbucket/vercel/netlify --
// code-hosting + deploy).
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { createIssue } from './tools/create-issue.js';
import { listIssues } from './tools/list-issues.js';
import { getIssue } from './tools/get-issue.js';
import { createMergeRequest } from './tools/create-merge-request.js';

class GitLabPlugin extends OpenTabsPlugin {
  readonly name = 'gitlab';
  readonly description =
    'OpenTabs plugin for GitLab — manage issues and merge requests via the GitLab REST API';
  override readonly displayName = 'GitLab';
  readonly urlPatterns = ['*://gitlab.com/*'];
  override readonly homepage = 'https://gitlab.com';
  readonly tools: ToolDefinition[] = [
    // Issues + merge requests (the vendored dev/productivity batch-A sub-batch-3 slice)
    listIssues,
    getIssue,
    createIssue,
    createMergeRequest,
  ];
}

const plugin = new GitLabPlugin();
export default plugin;
export { plugin };
