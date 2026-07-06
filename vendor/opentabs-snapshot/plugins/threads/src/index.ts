// Vendored metadata slice of the OpenTabs threads plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// Threads is the Meta microblog app. Its upstream origin is www.threads.net -- the
// EXACT origin Plan 38-01 classified SENSITIVE -- so the merge-time classifyGate
// passes on a screened origin. The host-derived stem ('www') is WRONG; the vendored
// DIR NAME is exactly `threads` so it matches the STEM_OVERRIDES key and the importer
// canonicalizes the stem to 'threads' (emitting opentabs__threads__*, NOT
// opentabs__www__*) -- the SAME dir-name canonicalization cloudflare/datadog/jira/
// confluence use. Part of Phase-38 batch B sub-batch 1 (AI-chat + microblog/fediverse).
// Its ops GET the timeline + a single thread (reads) and POST a new thread
// (create_thread -> the sensitive social WRITE; posture-B re-gates it because the
// origin is sensitive). backing:'dom' (the frozen default) -> DOM-only routing.
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { listTimeline } from './tools/list-timeline.js';
import { getThread } from './tools/get-thread.js';
import { createThread } from './tools/create-thread.js';

class ThreadsPlugin extends OpenTabsPlugin {
  readonly name = 'threads';
  readonly description =
    'OpenTabs plugin for Threads — read your home timeline, fetch a single thread, and post a new thread on Threads';
  override readonly displayName = 'Threads';
  readonly urlPatterns = ['*://www.threads.net/*'];
  override readonly homepage = 'https://www.threads.net';
  readonly tools: ToolDefinition[] = [
    // Timeline + a single thread (reads) and posting a new thread (the sensitive write).
    listTimeline,
    getThread,
    createThread,
  ];
}

const plugin = new ThreadsPlugin();
export default plugin;
export { plugin };
