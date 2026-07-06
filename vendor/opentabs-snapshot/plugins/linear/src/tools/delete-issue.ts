import { graphql } from '../linear-api.js';
import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

export const deleteIssue = defineTool({
  name: 'delete_issue',
  displayName: 'Delete Issue',
  description: 'Move a Linear issue to the trash. Trashed issues can be restored within 30 days.',
  summary: 'Move an issue to the trash',
  icon: 'trash-2',
  group: 'Issues',
  input: z.object({
    issue_id: z.string().describe('Issue UUID to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the issue was successfully deleted'),
  }),
  handle: async params => {
    const data = await graphql<{
      issueDelete: { success: boolean };
    }>(
      `mutation DeleteIssue($id: String!) {
        issueDelete(id: $id) {
          success
        }
      }`,
      { id: params.issue_id },
    );

    if (!data.issueDelete) throw ToolError.internal('Issue deletion failed — no response');

    return { success: data.issueDelete.success };
  },
});
