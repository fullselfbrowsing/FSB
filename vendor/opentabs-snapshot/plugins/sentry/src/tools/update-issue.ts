import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getOrgSlug, sentryApi } from '../sentry-api.js';
import { issueSchema, mapIssue } from './schemas.js';

export const updateIssue = defineTool({
  name: 'update_issue',
  displayName: 'Update Issue',
  description:
    "Update an issue's attributes. Supports changing status (resolve, unresolve, ignore), " +
    'assigning to a user or team, bookmarking, and marking as seen. Only specified fields are modified.',
  summary: 'Update issue status, assignee, or other attributes',
  icon: 'pencil',
  group: 'Issues',
  input: z.object({
    issue_id: z.string().describe('The issue ID to update'),
    status: z
      .enum(['resolved', 'resolvedInNextRelease', 'unresolved', 'ignored'])
      .optional()
      .describe('New status for the issue'),
    assigned_to: z.string().optional().describe('Username or team slug to assign to. Pass empty string to unassign'),
    has_seen: z.boolean().optional().describe('Mark as seen or unseen for the current user'),
    is_bookmarked: z.boolean().optional().describe('Bookmark or unbookmark the issue'),
    is_public: z.boolean().optional().describe('Make the issue public or private'),
    is_subscribed: z.boolean().optional().describe('Subscribe or unsubscribe from notifications'),
    priority: z.enum(['critical', 'high', 'medium', 'low']).optional().describe('Set issue priority level'),
  }),
  output: z.object({
    issue: issueSchema.describe('The updated issue'),
  }),
  handle: async params => {
    const orgSlug = getOrgSlug();
    const body: Record<string, unknown> = {};
    if (params.status !== undefined) body.status = params.status;
    if (params.assigned_to !== undefined) body.assignedTo = params.assigned_to || '';
    if (params.has_seen !== undefined) body.hasSeen = params.has_seen;
    if (params.is_bookmarked !== undefined) body.isBookmarked = params.is_bookmarked;
    if (params.is_public !== undefined) body.isPublic = params.is_public;
    if (params.is_subscribed !== undefined) body.isSubscribed = params.is_subscribed;
    if (params.priority !== undefined) body.priority = params.priority;

    const { data } = await sentryApi<Record<string, unknown>>(`/organizations/${orgSlug}/issues/${params.issue_id}/`, {
      method: 'PUT',
      body,
    });
    return { issue: mapIssue(data) };
  },
});
