import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../gitlab-api.js';
import { issueSchema, mapIssue } from './schemas.js';

export const createIssue = defineTool({
  name: 'create_issue',
  displayName: 'Create Issue',
  description: 'Create a new issue in a project.',
  summary: 'Create a new issue',
  icon: 'plus-circle',
  group: 'Issues',
  input: z.object({
    project: z.string().min(1).describe('Project path (e.g., "group/project") or numeric project ID'),
    title: z.string().min(1).describe('Issue title'),
    description: z.string().optional().describe('Issue description in Markdown'),
    labels: z.string().optional().describe('Comma-separated list of label names'),
    assignee_ids: z.array(z.number()).optional().describe('User IDs to assign'),
    milestone_id: z.number().optional().describe('Milestone ID'),
    confidential: z.boolean().optional().describe('Whether the issue is confidential'),
  }),
  output: z.object({
    issue: issueSchema.describe('The created issue'),
  }),
  handle: async params => {
    const body: Record<string, unknown> = { title: params.title };
    if (params.description !== undefined) body.description = params.description;
    if (params.labels !== undefined) body.labels = params.labels;
    if (params.assignee_ids !== undefined) body.assignee_ids = params.assignee_ids;
    if (params.milestone_id !== undefined) body.milestone_id = params.milestone_id;
    if (params.confidential !== undefined) body.confidential = params.confidential;

    const data = await api<Record<string, unknown>>(`/projects/${encodeURIComponent(params.project)}/issues`, {
      method: 'POST',
      body,
    });
    return { issue: mapIssue(data) };
  },
});
