// Vendored metadata slice of the OpenTabs reddit plugin (SHA 4b170216).
//
// Wall 1: METADATA ONLY. NO dist/, NO handle() runtime is executed. The importer
// (scripts/import-opentabs-catalog.mjs) does `await import()` on this module under
// tsx and reads ONLY the instance's name/urlPatterns + each tool's
// .name/.description/.input/.group/.summary. defineTool/OpenTabsPlugin resolve from
// the local sdk-stub (not the real SDK's DOM/fetch surface).
//
// Reddit is the content-read app -- the SAFE tier of this batch. Its urlPatterns
// host is the APEX *://reddit.com/* DELIBERATELY (so the frozen split('.')[0] derives
// the stem 'reddit', not the 'www' that www.reddit.com would derive) -> slug
// opentabs__reddit__* with NO STEM_OVERRIDES entry. reddit.com is NOT in
// service-denylist.json and the heuristic does not flag it -> classify() returns
// {sensitive:false,denied:false}, so the merge-time classifyGate passes a benign-safe
// origin. This slice carries ONLY read ops (list_subreddit_posts/get_post/
// search_posts); NO write op (submit/comment/vote are out of scope -- a reddit write
// would require reclassifying reddit.com sensitive). The existing hand-authored
// catalog/descriptors/reddit-inbox.json (slug 'reddit.inbox', backing 'recipe',
// service www.reddit.com) is a DISTINCT filename/slug -- these opentabs__reddit__*
// (backing 'dom') land ALONGSIDE it, NO clobber. Part of Phase-38 batch B sub-batch
// 2 (messaging + content-reads). backing:'dom' (the frozen default) -> DOM-only.
import { OpenTabsPlugin, type ToolDefinition } from './sdk-stub.js';
import { listSubredditPosts } from './tools/list-subreddit-posts.js';
import { getPost } from './tools/get-post.js';
import { searchPosts } from './tools/search-posts.js';

class RedditPlugin extends OpenTabsPlugin {
  readonly name = 'reddit';
  readonly description =
    'OpenTabs plugin for Reddit — list a subreddit’s posts, read a single post with its comments, and search posts (read-only)';
  override readonly displayName = 'Reddit';
  readonly urlPatterns = ['*://reddit.com/*'];
  override readonly homepage = 'https://www.reddit.com';
  readonly tools: ToolDefinition[] = [
    // Content reads only (the safe tier): subreddit posts, a single post, and search.
    listSubredditPosts,
    getPost,
    searchPosts,
  ];
}

const plugin = new RedditPlugin();
export default plugin;
export { plugin };
