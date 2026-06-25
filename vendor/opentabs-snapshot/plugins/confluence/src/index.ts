// Vendored metadata slice of the OpenTabs confluence plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// Confluence AND Jira both host on *.atlassian.net. The importer derives each app's
// slug STEM from the vendored DIR NAME via STEM_OVERRIDES ({jira:'jira',
// confluence:'confluence', ...}) -- NOT from the shared host -- so this slice emits
// DISTINCT opentabs__confluence__* slugs that never collide with jira's
// opentabs__jira__*. Confluence Cloud is a REST app: the side-effect class derives
// from the named-verb helper + {method:'...'} literal + the op-name verb (api
// GET=read for get/search; api {method:'POST'/'PUT'}=write for create/update). Part
// of the Phase-37 dev/productivity batch-A sub-batch 2.
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { createPage } from './tools/create-page.js';
import { getPage } from './tools/get-page.js';
import { searchPages } from './tools/search-pages.js';
import { updatePage } from './tools/update-page.js';

class ConfluencePlugin extends OpenTabsPlugin {
  readonly name = 'confluence';
  readonly description =
    'OpenTabs plugin for Confluence — manage pages and spaces via the Confluence Cloud REST API';
  override readonly displayName = 'Confluence';
  readonly urlPatterns = ['*://*.atlassian.net/*'];
  override readonly homepage = 'https://www.atlassian.com/software/confluence';
  readonly tools: ToolDefinition[] = [
    // Pages (the vendored dev/productivity batch-A sub-batch-2 slice)
    searchPages,
    getPage,
    createPage,
    updatePage,
  ];
}

const plugin = new ConfluencePlugin();
export default plugin;
export { plugin };
