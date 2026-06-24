// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { graphql } from '../linear-api.js';

export const updateIssue = defineTool({
  name: 'update_issue',
  displayName: 'Update Issue',
  description: 'Update an existing Linear issue. Provide the issue ID and any fields to change.',
  summary: 'Update an issue',
  icon: 'pencil',
  group: 'Issues',
  input: z.object({
    issueId: z.string().min(1).describe('Issue ID to update'),
    title: z.string().optional().describe('New issue title'),
    description: z.string().optional().describe('New issue description in markdown'),
    assigneeId: z.string().optional().describe('User ID to reassign the issue to'),
    stateId: z.string().optional().describe('Workflow state ID to move the issue to'),
    priority: z.number().int().min(0).max(4).optional().describe('Priority from 0 (none) to 4 (urgent)'),
  }),
  output: z.object({
    issue: z
      .object({
        id: z.string(),
        title: z.string(),
      })
      .describe('The updated issue'),
  }),
  handle: async (params: { issueId: string }) => {
    // NEVER executed by the importer.
    // Upstream: graphql `issueUpdate` mutation (always POST) -> write.
    const data = await graphql<{ issueUpdate: { issue: { id: string; title: string } } }>(
      'mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { issue { id title } } }',
      { id: params.issueId, input: {} }
    );
    return { issue: data.issueUpdate.issue };
  },
});
