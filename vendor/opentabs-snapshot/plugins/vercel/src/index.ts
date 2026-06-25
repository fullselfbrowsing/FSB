// Vendored metadata slice of the OpenTabs vercel plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// Vercel is a REST app (host vercel.com -> derived stem 'vercel', NOT in
// STEM_OVERRIDES). Its ops GET/POST against the Vercel REST API, so the side-effect
// class derives from the op-name verb + the {method:'...'} literal (api GET=read;
// api {method:'POST'}=write). This is part of the Phase-37 dev/productivity batch-A
// sub-batch 3 (gitlab/bitbucket/vercel/netlify -- code-hosting + deploy). Vercel is
// also a depth-shortlist read app discoverable from breadth.
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { listDeployments } from './tools/list-deployments.js';
import { getDeployment } from './tools/get-deployment.js';
import { listProjects } from './tools/list-projects.js';
import { createDeployment } from './tools/create-deployment.js';

class VercelPlugin extends OpenTabsPlugin {
  readonly name = 'vercel';
  readonly description =
    'OpenTabs plugin for Vercel — inspect deployments and projects and trigger deployments via the Vercel REST API';
  override readonly displayName = 'Vercel';
  readonly urlPatterns = ['*://vercel.com/*'];
  override readonly homepage = 'https://vercel.com';
  readonly tools: ToolDefinition[] = [
    // Deployments + projects (the vendored dev/productivity batch-A sub-batch-3 slice)
    listDeployments,
    getDeployment,
    listProjects,
    createDeployment,
  ];
}

const plugin = new VercelPlugin();
export default plugin;
export { plugin };
