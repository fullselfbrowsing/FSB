import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../gitlab-api.js';
import { issueSchema, mapIssue } from './schemas.js';

export const updateIssue = defineTool({
  name: 'update_issue',
  displayName: 'Update Issue',
  description: 'Update an existing issue. Only specified fields are changed.',
  summary: 'Update an issue',
  icon: 'pencil',
  group: 'Issues',
  input: z.object({
    project: z.string().min(1).describe('Project path (e.g., "group/project") or numeric project ID'),
    issue_iid: z.number().int().min(1).describe('Issue IID (project-scoped ID)'),
    title: z.string().optional().describe('New title'),
    description: z.string().optional().describe('New description in Markdown'),
    state_event: z.enum(['close', 'reopen']).optional().describe('Transition the issue state'),
    labels: z.string().optional().describe('Comma-separated list of label names (replaces existing)'),
    assignee_ids: z.array(z.number()).optional().describe('User IDs to assign (replaces existing)'),
    milestone_id: z.number().optional().describe('Milestone ID'),
    confidential: z.boolean().optional().describe('Whether the issue is confidential'),
  }),
  output: z.object({
    issue: issueSchema.describe('The updated issue'),
  }),
  handle: async params => {
    const body: Record<string, unknown> = {};
    if (params.title !== undefined) body.title = params.title;
    if (params.description !== undefined) body.description = params.description;
    if (params.state_event !== undefined) body.state_event = params.state_event;
    if (params.labels !== undefined) body.labels = params.labels;
    if (params.assignee_ids !== undefined) body.assignee_ids = params.assignee_ids;
    if (params.milestone_id !== undefined) body.milestone_id = params.milestone_id;
    if (params.confidential !== undefined) body.confidential = params.confidential;

    const data = await api<Record<string, unknown>>(
      `/projects/${encodeURIComponent(params.project)}/issues/${params.issue_iid}`,
      { method: 'PUT', body },
    );
    return { issue: mapIssue(data) };
  },
});
