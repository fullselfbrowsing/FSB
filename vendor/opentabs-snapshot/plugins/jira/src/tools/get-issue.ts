import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../jira-api.js';
import { ISSUE_FIELDS, issueSchema, mapIssue } from './schemas.js';

export const getIssue = defineTool({
  name: 'get_issue',
  displayName: 'Get Issue',
  description: 'Get detailed information about a specific Jira issue by its key (e.g. KAN-1) or ID.',
  summary: 'Get details of an issue',
  icon: 'file-text',
  group: 'Issues',
  input: z.object({
    issue_key: z.string().describe('Issue key (e.g. "KAN-1") or issue ID'),
  }),
  output: z.object({
    issue: issueSchema.describe('The issue details'),
  }),
  handle: async params => {
    const data = await api<Record<string, unknown>>(`/issue/${encodeURIComponent(params.issue_key)}`, {
      query: { fields: ISSUE_FIELDS.join(',') },
    });
    return { issue: mapIssue(data) };
  },
});
