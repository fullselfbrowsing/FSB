import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../gitlab-api.js';
import { issueSchema, mapIssue } from './schemas.js';

export const getIssue = defineTool({
  name: 'get_issue',
  displayName: 'Get Issue',
  description: 'Get detailed information about a specific issue.',
  summary: 'Get issue details',
  icon: 'circle-dot',
  group: 'Issues',
  input: z.object({
    project: z.string().min(1).describe('Project path (e.g., "group/project") or numeric project ID'),
    issue_iid: z.number().int().min(1).describe('Issue IID (project-scoped ID)'),
  }),
  output: z.object({
    issue: issueSchema.describe('The issue'),
  }),
  handle: async params => {
    const data = await api<Record<string, unknown>>(
      `/projects/${encodeURIComponent(params.project)}/issues/${params.issue_iid}`,
    );
    return { issue: mapIssue(data) };
  },
});
