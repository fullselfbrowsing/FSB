import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiPost } from '../airtable-api.js';

export const createComment = defineTool({
  name: 'create_comment',
  displayName: 'Create Comment',
  description: 'Add a comment to a record. Comments are visible to all collaborators on the base.',
  summary: 'Add a comment to a record',
  icon: 'message-square',
  group: 'Records',
  input: z.object({
    base_id: z.string().describe('Base ID (app prefix)'),
    table_id: z.string().describe('Table ID (tbl prefix)'),
    record_id: z.string().describe('Record ID (rec prefix)'),
    text: z.string().describe('Comment text'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the comment was created'),
  }),
  handle: async params => {
    await apiPost<null>(
      `row/${params.record_id}/createRowComment`,
      {
        tableId: params.table_id,
        text: params.text,
      },
      { appId: params.base_id },
    );

    return { success: true };
  },
});
