// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../reddit-api.js';

export const getPost = defineTool({
  name: 'get_post',
  displayName: 'Get Post',
  description: 'Get a single Reddit post by its ID, including its body and top-level comments.',
  summary: 'read a single reddit post and its comments',
  icon: 'file-text',
  group: 'Posts',
  input: z.object({
    subreddit: z.string().min(1).describe('The subreddit the post lives in (without the r/ prefix)'),
    post_id: z.string().min(1).describe('The base-36 post ID to fetch'),
    comment_limit: z.number().int().min(0).max(500).optional().describe('Maximum number of comments to include'),
  }),
  output: z.object({
    post: z.object({
      id: z.string(),
      title: z.string(),
      selftext: z.string(),
    }).describe('The post with its body'),
    comments: z.array(z.object({
      id: z.string(),
      body: z.string(),
    })).describe('Top-level comments on the post'),
  }),
  handle: async (params: { subreddit: string; post_id: string; comment_limit?: number }) => {
    // NEVER executed by the importer. Upstream: api GET /r/:subreddit/comments/:id.json (read).
    const data = await api<{ post: { id: string; title: string; selftext: string }; comments: unknown[] }>(
      `/r/${params.subreddit}/comments/${params.post_id}.json`,
      { method: 'GET', query: { limit: params.comment_limit } }
    );
    return { post: data.post, comments: data.comments as { id: string; body: string }[] };
  },
});
