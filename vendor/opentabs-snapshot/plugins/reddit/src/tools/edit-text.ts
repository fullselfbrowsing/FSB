import { redditPost } from '../reddit-api.js';
import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

interface EditResponse {
  json: {
    errors: Array<[string, string, string]>;
    data?: {
      things: Array<{
        kind: string;
        data: { id: string; contentText: string };
      }>;
    };
  };
}

export const editText = defineTool({
  name: 'edit_text',
  displayName: 'Edit Post/Comment',
  description:
    'Edit the body text of a self-post or comment. Only the author can edit their own content. Link posts cannot be edited.',
  summary: 'Edit a post or comment',
  icon: 'edit',
  group: 'Actions',
  input: z.object({
    thing_id: z
      .string()
      .min(1)
      .describe('Fullname of the post or comment to edit (e.g., "t3_abc123" for a post, "t1_xyz" for a comment)'),
    text: z.string().min(1).describe('New body text (supports Reddit markdown)'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the edit was applied'),
    body: z.string().describe('Updated body text as returned by Reddit'),
  }),
  handle: async params => {
    const data = await redditPost<EditResponse>('/api/editusertext', {
      thing_id: params.thing_id,
      text: params.text,
    });

    if (data.json.errors.length > 0) {
      const errorMsg = data.json.errors.map(e => e[1]).join('; ');
      throw ToolError.validation(`Reddit API error: ${errorMsg}`);
    }

    const thing = data.json.data?.things[0]?.data;
    return {
      success: true,
      body: thing?.contentText ?? params.text,
    };
  },
});
