// Vendored metadata slice of the OpenTabs bitbucket plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// Bitbucket is a REST app (host bitbucket.org -> derived stem 'bitbucket', NOT in
// STEM_OVERRIDES). Its ops GET/POST against the Bitbucket Cloud REST API 2.0, so the
// side-effect class derives from the op-name verb + the {method:'...'} literal
// (api GET=read; api {method:'POST'}=write). This is part of the Phase-37
// dev/productivity batch-A sub-batch 3 (gitlab/bitbucket/vercel/netlify --
// code-hosting + deploy).
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { listPullRequests } from './tools/list-pull-requests.js';
import { getPullRequest } from './tools/get-pull-request.js';
import { createPullRequest } from './tools/create-pull-request.js';
import { listRepositories } from './tools/list-repositories.js';

class BitbucketPlugin extends OpenTabsPlugin {
  readonly name = 'bitbucket';
  readonly description =
    'OpenTabs plugin for Bitbucket — manage pull requests and repositories via the Bitbucket Cloud REST API';
  override readonly displayName = 'Bitbucket';
  readonly urlPatterns = ['*://bitbucket.org/*'];
  override readonly homepage = 'https://bitbucket.org';
  readonly tools: ToolDefinition[] = [
    // Pull requests + repositories (the vendored dev/productivity batch-A sub-batch-3 slice)
    listPullRequests,
    getPullRequest,
    createPullRequest,
    listRepositories,
  ];
}

const plugin = new BitbucketPlugin();
export default plugin;
export { plugin };
