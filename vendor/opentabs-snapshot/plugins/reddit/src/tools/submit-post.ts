import { redditPost } from '../reddit-api.js';
import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

interface SubmitResponse {
  json: {
    errors: Array<[string, string, string]>;
    data?: {
      url: string;
      name: string;
      id: string;
    };
  };
}

export const submitPost = defineTool({
  name: 'submit_post',
  displayName: 'Submit Post',
  description:
    'Submit a new text or link post to a subreddit. Note: some subreddits may require captcha for new or low-karma accounts.',
  summary: 'Submit a new post',
  icon: 'plus',
  group: 'Posts',
  input: z.object({
    subreddit: z.string().min(1).describe('Subreddit name without r/ prefix'),
    title: z.string().min(1).describe('Post title'),
    kind: z.enum(['self', 'link']).describe('"self" for a text post, "link" for a link post'),
    text: z.string().optional().describe('Post body text for self/text posts (supports Reddit markdown)'),
    url: z.string().optional().describe('URL for link posts'),
    flair_id: z.string().optional().describe('Flair ID to apply to the post'),
    flair_text: z.string().optional().describe('Custom flair text'),
    nsfw: z.boolean().optional().describe('Mark as NSFW'),
    spoiler: z.boolean().optional().describe('Mark as spoiler'),
  }),
  output: z.object({
    name: z.string().describe('Post fullname (e.g., "t3_abc123")'),
    id: z.string().describe('Post ID'),
    url: z.string().describe('URL of the new post'),
  }),
  handle: async params => {
    const body: Record<string, string> = {
      sr: params.subreddit,
      title: params.title,
      kind: params.kind,
    };
    if (params.text) body.text = params.text;
    if (params.url) body.url = params.url;
    if (params.flair_id) body.flair_id = params.flair_id;
    if (params.flair_text) body.flair_text = params.flair_text;
    if (params.nsfw) body.nsfw = 'true';
    if (params.spoiler) body.spoiler = 'true';

    const data = await redditPost<SubmitResponse>('/api/submit', body);

    if (data.json.errors.length > 0) {
      const errorMsg = data.json.errors.map(e => e[1]).join('; ');
      throw ToolError.validation(`Reddit API error: ${errorMsg}`);
    }

    const result = data.json.data;
    if (!result) {
      throw ToolError.internal('Post was submitted but no response data returned');
    }

    return {
      name: result.name,
      id: result.id,
      url: result.url,
    };
  },
});
