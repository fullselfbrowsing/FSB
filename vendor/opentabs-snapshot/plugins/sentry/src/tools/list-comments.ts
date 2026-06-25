import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getOrgSlug, sentryApi } from '../sentry-api.js';

const commentSchema = z.object({
  id: z.string().describe('Comment ID'),
  text: z.string().describe('Comment text content'),
  author_name: z.string().describe('Display name of the comment author'),
  author_email: z.string().describe('Email of the comment author'),
  date_created: z.string().describe('ISO 8601 timestamp when the comment was posted'),
  type: z.string().describe('Activity type (e.g., "note" for user comments)'),
});

type Comment = z.infer<typeof commentSchema>;

const mapComment = (c: Record<string, unknown> | undefined): Comment => {
  const user = (c?.user as Record<string, unknown>) ?? {};
  return {
    id: (c?.id as string) ?? '',
    text: (c?.text as string) ?? ((c?.data as Record<string, unknown>)?.text as string) ?? '',
    author_name: (user.name as string) ?? '',
    author_email: (user.email as string) ?? '',
    date_created: (c?.dateCreated as string) ?? '',
    type: (c?.type as string) ?? '',
  };
};

export const listComments = defineTool({
  name: 'list_comments',
  displayName: 'List Comments',
  description:
    'List comments (notes) on a Sentry issue. Returns the activity feed filtered to user-posted comments. ' +
    'Use create_comment to add a new comment.',
  summary: 'List comments on an issue',
  icon: 'message-square',
  group: 'Issues',
  input: z.object({
    issue_id: z.string().describe('The issue ID to list comments for'),
    cursor: z.string().optional().describe('Pagination cursor from a previous response'),
  }),
  output: z.object({
    comments: z.array(commentSchema).describe('List of comments on the issue'),
    cursor: z.string().describe('Pagination cursor for next page, empty if no more results'),
  }),
  handle: async params => {
    const orgSlug = getOrgSlug();
    const { data, nextCursor } = await sentryApi<Record<string, unknown>[]>(
      `/organizations/${orgSlug}/issues/${params.issue_id}/comments/`,
      { query: { cursor: params.cursor } },
    );
    return {
      comments: (Array.isArray(data) ? data : []).map(c => mapComment(c)),
      cursor: nextCursor ?? '',
    };
  },
});
