import { graphql } from '../linear-api.js';
import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { issueSchema, mapIssue } from './schemas.js';

export const createIssue = defineTool({
  name: 'create_issue',
  displayName: 'Create Issue',
  description: 'Create a new issue in Linear. Requires a team ID and title at minimum.',
  summary: 'Create a new issue in Linear',
  icon: 'plus-circle',
  group: 'Issues',
  input: z.object({
    team_id: z.string().describe('Team UUID to create the issue in (use list_teams to find team IDs)'),
    title: z.string().describe('Issue title'),
    description: z.string().optional().describe('Issue description in markdown'),
    priority: z.number().optional().describe('Priority level (0=none, 1=urgent, 2=high, 3=medium, 4=low)'),
    assignee_id: z.string().optional().describe('UUID of the user to assign (use list_users to find user IDs)'),
    state_id: z.string().optional().describe('Workflow state UUID (use list_workflow_states to find state IDs)'),
    label_ids: z
      .array(z.string())
      .optional()
      .describe('Array of label UUIDs to apply (use list_labels to find label IDs)'),
    project_id: z.string().optional().describe('Project UUID to add the issue to (use list_projects to find IDs)'),
    cycle_id: z.string().optional().describe('Cycle UUID to add the issue to (use list_cycles to find IDs)'),
    due_date: z.string().optional().describe('Due date in YYYY-MM-DD format'),
    estimate: z.number().optional().describe('Estimate points'),
    parent_id: z.string().optional().describe('Parent issue UUID for creating a sub-issue'),
  }),
  output: z.object({
    issue: issueSchema.describe('The newly created issue'),
  }),
  handle: async params => {
    const input: Record<string, unknown> = {
      teamId: params.team_id,
      title: params.title,
    };
    if (params.description !== undefined) input.description = params.description;
    if (params.priority !== undefined) input.priority = params.priority;
    if (params.assignee_id) input.assigneeId = params.assignee_id;
    if (params.state_id) input.stateId = params.state_id;
    if (params.label_ids) input.labelIds = params.label_ids;
    if (params.project_id) input.projectId = params.project_id;
    if (params.cycle_id) input.cycleId = params.cycle_id;
    if (params.due_date) input.dueDate = params.due_date;
    if (params.estimate !== undefined) input.estimate = params.estimate;
    if (params.parent_id) input.parentId = params.parent_id;

    const data = await graphql<{
      issueCreate: {
        success: boolean;
        issue: Record<string, unknown>;
      };
    }>(
      `mutation CreateIssue($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue {
            id identifier title description priority priorityLabel url
            createdAt updatedAt dueDate estimate
            state { name type }
            assignee { name displayName }
            team { key name }
            labels { nodes { name } }
            project { name }
            cycle { number }
          }
        }
      }`,
      { input },
    );

    if (!data.issueCreate?.issue) throw ToolError.internal('Issue creation failed — no issue returned');

    return { issue: mapIssue(data.issueCreate.issue as Parameters<typeof mapIssue>[0]) };
  },
});
