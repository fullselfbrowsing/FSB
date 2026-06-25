import { graphql } from '../linear-api.js';
import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { issueSchema, mapIssue } from './schemas.js';

export const updateIssue = defineTool({
  name: 'update_issue',
  displayName: 'Update Issue',
  description: 'Update an existing Linear issue. Only specified fields are changed; omitted fields remain unchanged.',
  summary: 'Update an existing issue',
  icon: 'pencil',
  group: 'Issues',
  input: z.object({
    issue_id: z.string().describe('Issue UUID to update'),
    title: z.string().optional().describe('New issue title'),
    description: z.string().optional().describe('New issue description in markdown'),
    priority: z.number().optional().describe('New priority level (0=none, 1=urgent, 2=high, 3=medium, 4=low)'),
    assignee_id: z.string().optional().describe('New assignee UUID (use list_users to find user IDs)'),
    state_id: z.string().optional().describe('New workflow state UUID (use list_workflow_states to find state IDs)'),
    label_ids: z.array(z.string()).optional().describe('Replace all labels with these label UUIDs'),
    project_id: z.string().optional().describe('Move to this project UUID'),
    cycle_id: z.string().optional().describe('Move to this cycle UUID'),
    due_date: z.string().optional().describe('New due date in YYYY-MM-DD format'),
    estimate: z.number().optional().describe('New estimate points'),
    team_id: z.string().optional().describe('Move to a different team UUID'),
    parent_id: z.string().optional().describe('Set parent issue UUID (make this a sub-issue)'),
  }),
  output: z.object({
    issue: issueSchema.describe('The updated issue'),
  }),
  handle: async params => {
    const input: Record<string, unknown> = {};
    if (params.title !== undefined) input.title = params.title;
    if (params.description !== undefined) input.description = params.description;
    if (params.priority !== undefined) input.priority = params.priority;
    if (params.assignee_id !== undefined) input.assigneeId = params.assignee_id;
    if (params.state_id !== undefined) input.stateId = params.state_id;
    if (params.label_ids !== undefined) input.labelIds = params.label_ids;
    if (params.project_id !== undefined) input.projectId = params.project_id;
    if (params.cycle_id !== undefined) input.cycleId = params.cycle_id;
    if (params.due_date !== undefined) input.dueDate = params.due_date;
    if (params.estimate !== undefined) input.estimate = params.estimate;
    if (params.team_id !== undefined) input.teamId = params.team_id;
    if (params.parent_id !== undefined) input.parentId = params.parent_id;

    const data = await graphql<{
      issueUpdate: {
        success: boolean;
        issue: Record<string, unknown>;
      };
    }>(
      `mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
        issueUpdate(id: $id, input: $input) {
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
      { id: params.issue_id, input },
    );

    if (!data.issueUpdate?.issue) throw ToolError.internal('Issue update failed — no issue returned');

    return { issue: mapIssue(data.issueUpdate.issue as Parameters<typeof mapIssue>[0]) };
  },
});
