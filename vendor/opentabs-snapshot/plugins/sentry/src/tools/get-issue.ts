import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getOrgSlug, sentryApi } from '../sentry-api.js';
import { issueSchema, mapIssue } from './schemas.js';

export const getIssue = defineTool({
  name: 'get_issue',
  displayName: 'Get Issue',
  description:
    'Get detailed information about a specific Sentry issue by its ID. ' +
    'Returns title, status, priority, event count, user count, assigned user, and more.',
  summary: 'Get details for a specific issue',
  icon: 'bug',
  group: 'Issues',
  input: z.object({
    issue_id: z.string().describe('The issue ID to retrieve'),
  }),
  output: z.object({
    issue: issueSchema.describe('The issue details'),
  }),
  handle: async params => {
    const orgSlug = getOrgSlug();
    const { data } = await sentryApi<Record<string, unknown>>(`/organizations/${orgSlug}/issues/${params.issue_id}/`);
    return { issue: mapIssue(data) };
  },
});
