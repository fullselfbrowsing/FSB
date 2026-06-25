import { redditPost } from '../reddit-api.js';
import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

interface CommentResponseThing {
  kind: string;
  data: {
    id: string;
    parent: string;
    contentText: string;
    link: string;
  };
}

interface CommentResponse {
  json: {
    errors: Array<[string, string, string]>;
    data?: {
      things: CommentResponseThing[];
    };
  };
}

export const submitComment = defineTool({
  name: 'submit_comment',
  displayName: 'Submit Comment',
  description: 'Post a comment on a Reddit post or reply to an existing comment',
  summary: 'Post a comment or reply',
  icon: 'message-square',
  group: 'Comments',
  input: z.object({
    thing_id: z
      .string()
      .min(1)
      .describe('Fullname of the thing to comment on — "t3_xxx" for a post or "t1_xxx" for a comment reply'),
    text: z.string().min(1).describe('Comment body text (supports Reddit markdown)'),
  }),
  output: z.object({
    id: z.string().describe('New comment fullname (e.g., "t1_abc123")'),
    parent: z.string().describe('Parent thing fullname'),
    body: z.string().describe('Comment body text as submitted'),
  }),
  handle: async params => {
    const data = await redditPost<CommentResponse>('/api/comment', {
      thing_id: params.thing_id,
      text: params.text,
    });

    if (data.json.errors.length > 0) {
      const errorMsg = data.json.errors.map(e => e[1]).join('; ');
      throw ToolError.validation(`Reddit API error: ${errorMsg}`);
    }

    const comment = data.json.data?.things[0]?.data;
    if (!comment) {
      throw ToolError.internal('Comment was submitted but no response data returned');
    }

    return {
      id: comment.id,
      parent: comment.parent,
      body: params.text,
    };
  },
});
