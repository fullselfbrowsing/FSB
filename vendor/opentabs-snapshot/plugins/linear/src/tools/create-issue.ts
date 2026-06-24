// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { graphql } from '../linear-api.js';

export const createIssue = defineTool({
  name: 'create_issue',
  displayName: 'Create Issue',
  description:
    'Create a new issue in Linear. Requires a team and a title at minimum. Optionally set description, assignee, priority, labels, project, and estimate.',
  summary: 'Create a new issue',
  icon: 'plus',
  group: 'Issues',
  input: z.object({
    teamId: z.string().min(1).describe('Team ID to create the issue in'),
    title: z.string().min(1).describe('Issue title'),
    description: z.string().optional().describe('Issue description in markdown'),
    assigneeId: z.string().optional().describe('User ID to assign the issue to'),
    priority: z.number().int().min(0).max(4).optional().describe('Priority from 0 (none) to 4 (urgent)'),
    labelIds: z.array(z.string()).optional().describe('List of label IDs to apply'),
    projectId: z.string().optional().describe('Project ID to associate the issue with'),
    estimate: z.number().optional().describe('Estimate points for the issue'),
  }),
  output: z.object({
    issue: z
      .object({
        id: z.string(),
        identifier: z.string().optional(),
        title: z.string(),
        url: z.string().optional(),
      })
      .describe('The created issue'),
  }),
  handle: async (params: { teamId: string; title: string }) => {
    // NEVER executed by the importer (metadata-only read).
    // Upstream: graphql `issueCreate` mutation (always POST) -> write.
    const data = await graphql<{ issueCreate: { issue: { id: string; title: string } } }>(
      'mutation IssueCreate($input: IssueCreateInput!) { issueCreate(input: $input) { issue { id title } } }',
      { input: { teamId: params.teamId, title: params.title } }
    );
    return { issue: data.issueCreate.issue };
  },
});
