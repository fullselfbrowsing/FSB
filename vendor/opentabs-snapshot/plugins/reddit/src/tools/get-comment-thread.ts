import { redditGet } from '../reddit-api.js';
import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

interface RedditComment {
  id: string;
  name: string;
  author: string;
  body: string;
  score: number;
  created_utc: number;
  parent_id: string;
  depth: number;
  is_submitter: boolean;
  replies: '' | { kind: string; data: { children: Array<{ kind: string; data: RedditComment }> } };
}

interface PostListing {
  kind: string;
  data: { children: Array<{ kind: string; data: { id: string; name: string; title: string; subreddit: string } }> };
}

interface CommentListing {
  kind: string;
  data: { children: Array<{ kind: string; data: RedditComment }> };
}

const commentSchema = z.object({
  id: z.string().describe('Comment ID'),
  name: z.string().describe('Comment fullname (e.g., "t1_abc123")'),
  author: z.string().describe('Comment author username'),
  body: z.string().describe('Comment body text (markdown)'),
  score: z.number().describe('Comment score'),
  created_utc: z.number().describe('Comment creation time as Unix timestamp'),
  parent_id: z.string().describe('Parent thing fullname (t3_ for post, t1_ for parent comment)'),
  depth: z.number().describe('Nesting depth (0 = top-level reply)'),
  is_submitter: z.boolean().describe('Whether the commenter is the post author (OP)'),
});

const flattenComments = (
  children: Array<{ kind: string; data: RedditComment }>,
  maxDepth: number,
): Array<RedditComment> => {
  const result: Array<RedditComment> = [];
  for (const child of children) {
    if (child.kind !== 't1') continue;
    result.push(child.data);
    if (child.data.replies && typeof child.data.replies === 'object' && child.data.depth < maxDepth) {
      result.push(...flattenComments(child.data.replies.data.children, maxDepth));
    }
  }
  return result;
};

export const getCommentThread = defineTool({
  name: 'get_comment_thread',
  displayName: 'Get Comment Thread',
  description:
    'Get a specific comment and its nested replies. Focuses the comment tree on a particular comment, returning its full reply chain regardless of nesting depth. Use this to read deeply nested conversations that get_post may truncate.',
  summary: 'Get a comment and its replies',
  icon: 'message-square',
  group: 'Comments',
  input: z.object({
    subreddit: z.string().min(1).describe('Subreddit name without r/ prefix'),
    post_id: z.string().min(1).describe('Post ID without t3_ prefix (e.g., "1ki00n1")'),
    comment_id: z.string().min(1).describe('Comment ID without t1_ prefix (e.g., "o9z5cx1") — the comment to focus on'),
    depth: z
      .number()
      .int()
      .min(0)
      .max(10)
      .optional()
      .describe('Max reply nesting depth below the target comment (default 8)'),
    limit: z.number().int().min(0).max(500).optional().describe('Max number of child comments to return (default 100)'),
  }),
  output: z.object({
    comment: commentSchema.describe('The target comment'),
    replies: z.array(commentSchema).describe('Flattened array of nested replies with depth info'),
  }),
  handle: async params => {
    const queryParams: Record<string, string> = {
      comment: params.comment_id,
      depth: String((params.depth ?? 8) + 1),
      limit: String(params.limit ?? 100),
    };

    const data = await redditGet<[PostListing, CommentListing]>(
      `/r/${params.subreddit}/comments/${params.post_id}.json`,
      queryParams,
    );

    const commentChildren = data[1]?.data.children ?? [];
    const targetChild = commentChildren.find(c => c.kind === 't1' && c.data.id === params.comment_id);

    if (!targetChild || targetChild.kind !== 't1') {
      throw ToolError.notFound(`Comment ${params.comment_id} not found in post ${params.post_id}`);
    }

    const target = targetChild.data;
    const maxDepth = target.depth + (params.depth ?? 8);
    const replies =
      target.replies && typeof target.replies === 'object'
        ? flattenComments(target.replies.data.children, maxDepth)
        : [];

    return {
      comment: {
        id: target.id,
        name: target.name,
        author: target.author,
        body: target.body,
        score: target.score,
        created_utc: target.created_utc,
        parent_id: target.parent_id,
        depth: target.depth,
        is_submitter: target.is_submitter,
      },
      replies: replies.map(c => ({
        id: c.id,
        name: c.name,
        author: c.author,
        body: c.body,
        score: c.score,
        created_utc: c.created_utc,
        parent_id: c.parent_id,
        depth: c.depth,
        is_submitter: c.is_submitter,
      })),
    };
  },
});
