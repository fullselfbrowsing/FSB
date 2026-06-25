// Vendored metadata slice of the OpenTabs mastodon plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// Mastodon is the fediverse microblog app. Its upstream host is mastodon.social --
// the EXACT origin Plan 38-01 classified SENSITIVE -- so the merge-time classifyGate
// passes on a screened origin. The host-derived stem ('mastodon') is CORRECT -> NO
// STEM_OVERRIDES entry. Part of Phase-38 batch B sub-batch 1 (AI-chat + microblog/
// fediverse). Its ops GET the home timeline + a single status (reads), POST a new
// status (create_status -> the sensitive social WRITE), and DELETE a status
// (delete_status -> DESTRUCTIVE); posture-B re-gates the writes because the origin is
// sensitive. backing:'dom' (the frozen default) -> DOM-only routing.
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { listTimeline } from './tools/list-timeline.js';
import { getStatus } from './tools/get-status.js';
import { createStatus } from './tools/create-status.js';
import { deleteStatus } from './tools/delete-status.js';

class MastodonPlugin extends OpenTabsPlugin {
  readonly name = 'mastodon';
  readonly description =
    'OpenTabs plugin for Mastodon — read your home timeline, fetch a single status (toot), publish a new status, and delete a status';
  override readonly displayName = 'Mastodon';
  readonly urlPatterns = ['*://mastodon.social/*'];
  override readonly homepage = 'https://mastodon.social';
  readonly tools: ToolDefinition[] = [
    // Timeline + a single status (reads), publishing (the sensitive write), and deleting (destructive).
    listTimeline,
    getStatus,
    createStatus,
    deleteStatus,
  ];
}

const plugin = new MastodonPlugin();
export default plugin;
export { plugin };
