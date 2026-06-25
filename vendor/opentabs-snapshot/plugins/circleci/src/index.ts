// Vendored metadata slice of the OpenTabs circleci plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// CircleCI is a REST app (host app.circleci.com -> derived stem 'circleci', NOT in
// STEM_OVERRIDES). Its ops GET against the CircleCI REST API v2 (reads) and POST to
// /project/:slug/pipeline to trigger a pipeline. trigger_pipeline carries a
// {method:'POST'} signal in its (never-run) handle so the importer floors it to
// write (`trigger` is not a recognized side-effect verb). This is part of the
// Phase-37 dev/productivity batch-A sub-batch 4 (cloudflare/circleci/datadog/sentry/
// posthog -- cloud + observability + CI, completing the category).
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { listPipelines } from './tools/list-pipelines.js';
import { getPipeline } from './tools/get-pipeline.js';
import { listWorkflows } from './tools/list-workflows.js';
import { triggerPipeline } from './tools/trigger-pipeline.js';

class CircleCIPlugin extends OpenTabsPlugin {
  readonly name = 'circleci';
  readonly description =
    'OpenTabs plugin for CircleCI — inspect pipelines and workflows and trigger pipelines via the CircleCI REST API';
  override readonly displayName = 'CircleCI';
  readonly urlPatterns = ['*://app.circleci.com/*'];
  override readonly homepage = 'https://app.circleci.com';
  readonly tools: ToolDefinition[] = [
    // Pipelines + workflows (reads) and pipeline trigger (write) -- sub-batch-4 CI slice.
    listPipelines,
    getPipeline,
    listWorkflows,
    triggerPipeline,
  ];
}

const plugin = new CircleCIPlugin();
export default plugin;
export { plugin };
