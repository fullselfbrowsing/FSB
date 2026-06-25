// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../mastodon-api.js';

export const createStatus = defineTool({
  name: 'create_status',
  displayName: 'Create Status',
  description:
    'Publish a new status (toot) to Mastodon. Posts the text to your account at the chosen visibility; this is visible to your audience. Optionally reply to an existing status.',
  summary: 'post a status to mastodon',
  icon: 'plus',
  group: 'Timeline',
  input: z.object({
    status: z.string().min(1).describe('The text content of the status to publish'),
    visibility: z.enum(['public', 'unlisted', 'private', 'direct']).optional().describe('Status visibility'),
    in_reply_to_id: z.string().optional().describe('Status ID to reply to (omit to start a new status)'),
    spoiler_text: z.string().optional().describe('Content-warning text shown above the status'),
  }),
  output: z.object({
    status: z.object({
      id: z.string(),
      content: z.string(),
    }).describe('The published status'),
  }),
  handle: async (params: { status: string; visibility?: string; in_reply_to_id?: string; spoiler_text?: string }) => {
    // NEVER executed by the importer. Upstream: api POST /api/v1/statuses (create -> WRITE;
    // the {method:'POST'} literal reinforces the write class on both the verb AND method axes).
    const data = await api<{ status: { id: string; content: string } }>('/api/v1/statuses', {
      method: 'POST',
      body: {
        status: params.status,
        visibility: params.visibility,
        in_reply_to_id: params.in_reply_to_id,
        spoiler_text: params.spoiler_text,
      },
    });
    return { status: data.status };
  },
});
