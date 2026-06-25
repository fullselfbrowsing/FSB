import { redditGet } from '../reddit-api.js';
import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

interface RedditPostDetail {
  id: string;
  name: string;
  title: string;
  author: string;
  subreddit: string;
  score: number;
  upvote_ratio: number;
  num_comments: number;
  url: string;
  permalink: string;
  selftext: string;
  is_self: boolean;
  created_utc: number;
  over_18: boolean;
  stickied: boolean;
  link_flair_text: string | null;
}

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
  stickied: boolean;
  replies: '' | { kind: string; data: { children: Array<{ kind: string; data: RedditComment }> } };
}

interface PostListing {
  kind: string;
  data: { children: Array<{ kind: string; data: RedditPostDetail }> };
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

/**
 * Flatten a nested comment tree into a flat array, preserving depth information.
 */
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

export const getPost = defineTool({
  name: 'get_post',
  displayName: 'Get Post',
  description:
    'Get a Reddit post and its comments by subreddit and post ID. Returns the post details and a flattened comment tree.',
  summary: 'Get a post and its comments',
  icon: 'file-text',
  group: 'Posts',
  input: z.object({
    subreddit: z.string().min(1).describe('Subreddit name without r/ prefix'),
    post_id: z.string().min(1).describe('Post ID without t3_ prefix (e.g., "1ki00n1")'),
    comment_limit: z
      .number()
      .int()
      .min(0)
      .max(500)
      .optional()
      .describe('Max number of top-level comments (default 50)'),
    comment_depth: z.number().int().min(0).max(10).optional().describe('Max comment nesting depth (default 3)'),
    sort: z
      .enum(['confidence', 'top', 'new', 'controversial', 'old', 'qa'])
      .optional()
      .describe('Comment sort order (default "confidence")'),
  }),
  output: z.object({
    post: z.object({
      id: z.string().describe('Post ID'),
      name: z.string().describe('Post fullname (e.g., "t3_abc123")'),
      title: z.string().describe('Post title'),
      author: z.string().describe('Author username'),
      subreddit: z.string().describe('Subreddit name'),
      score: z.number().describe('Post score'),
      upvote_ratio: z.number().describe('Upvote ratio'),
      num_comments: z.number().describe('Total number of comments'),
      url: z.string().describe('Post URL'),
      permalink: z.string().describe('Reddit permalink'),
      selftext: z.string().describe('Self post body'),
      is_self: z.boolean().describe('Whether this is a text post'),
      created_utc: z.number().describe('Creation timestamp'),
    }),
    comments: z.array(commentSchema).describe('Flattened array of comments with depth info'),
  }),
  handle: async params => {
    const queryParams: Record<string, string> = {
      limit: String(params.comment_limit ?? 50),
      depth: String(params.comment_depth ?? 3),
    };
    if (params.sort) {
      queryParams.sort = params.sort;
    }

    const data = await redditGet<[PostListing, CommentListing]>(
      `/r/${params.subreddit}/comments/${params.post_id}.json`,
      queryParams,
    );

    const postData = data[0]?.data.children[0]?.data;
    if (!postData) {
      throw ToolError.notFound('Post not found');
    }

    const comments = flattenComments(data[1]?.data.children ?? [], params.comment_depth ?? 3);

    return {
      post: {
        id: postData.id,
        name: postData.name,
        title: postData.title,
        author: postData.author,
        subreddit: postData.subreddit,
        score: postData.score,
        upvote_ratio: postData.upvote_ratio,
        num_comments: postData.num_comments,
        url: postData.url,
        permalink: postData.permalink,
        selftext: postData.selftext ?? '',
        is_self: postData.is_self,
        created_utc: postData.created_utc,
      },
      comments: comments.map(c => ({
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
