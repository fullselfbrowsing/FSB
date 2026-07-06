import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../jira-api.js';
import { buildAdfText } from './schemas.js';

export const createIssue = defineTool({
  name: 'create_issue',
  displayName: 'Create Issue',
  description: 'Create a new Jira issue in a project. Requires a project key, summary, and issue type.',
  summary: 'Create a new Jira issue',
  icon: 'plus-circle',
  group: 'Issues',
  input: z.object({
    project_key: z.string().describe('Project key to create the issue in (e.g. "KAN")'),
    summary: z.string().describe('Issue summary/title'),
    issue_type: z
      .string()
      .optional()
      .describe('Issue type name (e.g. "Task", "Story", "Bug", "Epic"). Defaults to "Task"'),
    description: z.string().optional().describe('Issue description in plain text'),
    priority: z.string().optional().describe('Priority name (e.g. "Highest", "High", "Medium", "Low", "Lowest")'),
    assignee_id: z.string().optional().describe('Assignee account ID (use search_users to find IDs)'),
    labels: z.array(z.string()).optional().describe('Labels to apply to the issue'),
    parent_key: z.string().optional().describe('Parent issue key for creating a subtask or child issue (e.g. "KAN-1")'),
  }),
  output: z.object({
    id: z.string().describe('Created issue ID'),
    key: z.string().describe('Created issue key (e.g. KAN-2)'),
  }),
  handle: async params => {
    const fields: Record<string, unknown> = {
      project: { key: params.project_key },
      summary: params.summary,
      issuetype: { name: params.issue_type ?? 'Task' },
    };

    if (params.description) {
      fields.description = buildAdfText(params.description);
    }
    if (params.priority) {
      fields.priority = { name: params.priority };
    }
    if (params.assignee_id) {
      fields.assignee = { accountId: params.assignee_id };
    }
    if (params.labels) {
      fields.labels = params.labels;
    }
    if (params.parent_key) {
      fields.parent = { key: params.parent_key };
    }

    const data = await api<{ id?: string; key?: string }>('/issue', {
      method: 'POST',
      body: { fields },
    });

    return {
      id: data.id ?? '',
      key: data.key ?? '',
    };
  },
});
