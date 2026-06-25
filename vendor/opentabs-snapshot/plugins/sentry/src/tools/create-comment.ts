import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getOrgSlug, sentryApi } from '../sentry-api.js';

export const createComment = defineTool({
  name: 'create_comment',
  displayName: 'Create Comment',
  description: 'Add a comment (note) to a Sentry issue. The comment is posted as the authenticated user.',
  summary: 'Add a comment to an issue',
  icon: 'message-square-plus',
  group: 'Issues',
  input: z.object({
    issue_id: z.string().describe('The issue ID to comment on'),
    text: z.string().describe('Comment text content'),
  }),
  output: z.object({
    id: z.string().describe('The created comment ID'),
    text: z.string().describe('The comment text'),
    date_created: z.string().describe('ISO 8601 timestamp when the comment was posted'),
  }),
  handle: async params => {
    const orgSlug = getOrgSlug();
    const { data } = await sentryApi<Record<string, unknown>>(
      `/organizations/${orgSlug}/issues/${params.issue_id}/comments/`,
      { method: 'POST', body: { text: params.text } },
    );
    return {
      id: (data.id as string) ?? '',
      text: (data.text as string) ?? '',
      date_created: (data.dateCreated as string) ?? '',
    };
  },
});
