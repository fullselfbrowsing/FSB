import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getOrgSlug, sentryApi } from '../sentry-api.js';
import { eventSchema, mapEvent } from './schemas.js';

export const listIssueEvents = defineTool({
  name: 'list_issue_events',
  displayName: 'List Issue Events',
  description:
    'List the events (occurrences) for a specific Sentry issue. Each event represents a single occurrence ' +
    'of the issue with its own stack trace, tags, and context.',
  summary: 'List events for a specific issue',
  icon: 'list',
  group: 'Issues',
  input: z.object({
    issue_id: z.string().describe('The issue ID to list events for'),
    limit: z.number().optional().describe('Maximum number of events to return (default 25, max 100)'),
    cursor: z.string().optional().describe('Pagination cursor from a previous response'),
  }),
  output: z.object({
    events: z.array(eventSchema).describe('List of events for the issue'),
    cursor: z.string().describe('Pagination cursor for next page, empty if no more results'),
  }),
  handle: async params => {
    const orgSlug = getOrgSlug();
    const { data, nextCursor } = await sentryApi<Record<string, unknown>[]>(
      `/organizations/${orgSlug}/issues/${params.issue_id}/events/`,
      { query: { per_page: params.limit, cursor: params.cursor } },
    );
    return {
      events: (Array.isArray(data) ? data : []).map(e => mapEvent(e)),
      cursor: nextCursor ?? '',
    };
  },
});
