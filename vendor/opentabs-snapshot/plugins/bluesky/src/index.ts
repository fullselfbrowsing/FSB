// Vendored metadata slice of the OpenTabs bluesky plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// Bluesky is the AT-Protocol microblog app. Its upstream host is bsky.app -- the
// EXACT origin Plan 38-01 classified SENSITIVE -- so the merge-time classifyGate
// passes on a screened origin. The host-derived stem ('bsky') is CORRECT -> NO
// STEM_OVERRIDES entry (the vendored DIR NAME is `bluesky` but the slug follows the
// HOST stem `bsky`). Part of Phase-38 batch B sub-batch 1 (AI-chat + microblog/
// fediverse). Its ops GET the timeline + a profile (reads), POST a new post
// (create_post -> the sensitive social WRITE), and DELETE a post (delete_post ->
// DESTRUCTIVE); posture-B re-gates the writes because the origin is sensitive.
// backing:'dom' (the frozen default) -> DOM-only routing.
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { listTimeline } from './tools/list-timeline.js';
import { getProfile } from './tools/get-profile.js';
import { createPost } from './tools/create-post.js';
import { deletePost } from './tools/delete-post.js';

class BlueskyPlugin extends OpenTabsPlugin {
  readonly name = 'bluesky';
  readonly description =
    'OpenTabs plugin for Bluesky — read your home timeline, look up a profile, post to your feed, and delete a post';
  override readonly displayName = 'Bluesky';
  readonly urlPatterns = ['*://bsky.app/*'];
  override readonly homepage = 'https://bsky.app';
  readonly tools: ToolDefinition[] = [
    // Timeline + profile (reads), posting (the sensitive write), and deleting (destructive).
    listTimeline,
    getProfile,
    createPost,
    deletePost,
  ];
}

const plugin = new BlueskyPlugin();
export default plugin;
export { plugin };
