// Vendored metadata slice of the OpenTabs netlify plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// Netlify is a REST app (host app.netlify.com -> derived stem 'netlify' via the
// leading 'app.' strip, NOT in STEM_OVERRIDES). Its ops GET/POST against the Netlify
// REST API, so the side-effect class derives from the op-name verb + the
// {method:'...'} literal (api GET=read; api {method:'POST'}=write). This is part of
// the Phase-37 dev/productivity batch-A sub-batch 3 (gitlab/bitbucket/vercel/netlify
// -- code-hosting + deploy).
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { listSites } from './tools/list-sites.js';
import { getSite } from './tools/get-site.js';
import { listDeploys } from './tools/list-deploys.js';
import { createDeploy } from './tools/create-deploy.js';

class NetlifyPlugin extends OpenTabsPlugin {
  readonly name = 'netlify';
  readonly description =
    'OpenTabs plugin for Netlify — inspect sites and deploys and trigger deploys via the Netlify REST API';
  override readonly displayName = 'Netlify';
  readonly urlPatterns = ['*://app.netlify.com/*'];
  override readonly homepage = 'https://app.netlify.com';
  readonly tools: ToolDefinition[] = [
    // Sites + deploys (the vendored dev/productivity batch-A sub-batch-3 slice)
    listSites,
    getSite,
    listDeploys,
    createDeploy,
  ];
}

const plugin = new NetlifyPlugin();
export default plugin;
export { plugin };
