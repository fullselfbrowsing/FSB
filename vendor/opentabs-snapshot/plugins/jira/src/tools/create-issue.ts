// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../jira-api.js';

export const createIssue = defineTool({
  name: 'create_issue',
  displayName: 'Create Issue',
  description:
    'Create a new issue in a Jira project. Requires a project key, a summary, and an issue type at minimum. Optionally set description, assignee, priority, and labels.',
  summary: 'Create a new issue',
  icon: 'plus',
  group: 'Issues',
  input: z.object({
    project_key: z.string().min(1).describe('Project key to create the issue in (e.g. ENG)'),
    summary: z.string().min(1).describe('Issue summary/title'),
    issue_type: z.string().min(1).describe('Issue type name (e.g. Task, Bug, Story)'),
    description: z.string().optional().describe('Issue description in markdown'),
    assignee_account_id: z.string().optional().describe('Account ID of the user to assign'),
    priority: z.string().optional().describe('Priority name (e.g. High, Medium, Low)'),
    labels: z.array(z.string()).optional().describe('Labels to apply to the issue'),
  }),
  output: z.object({
    id: z.string().describe('The created issue ID'),
    key: z.string().describe('The created issue key (e.g. ENG-123)'),
    self: z.string().optional().describe('The created issue API URL'),
  }),
  handle: async (params: { project_key: string; summary: string; issue_type: string }) => {
    // NEVER executed by the importer. Upstream: api POST /rest/api/3/issue.
    const data = await api<{ id: string; key: string }>('/rest/api/3/issue', {
      method: 'POST',
      body: {
        fields: {
          project: { key: params.project_key },
          summary: params.summary,
          issuetype: { name: params.issue_type },
        },
      },
    });
    return data;
  },
});
