import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getOrgSlug, sentryApi } from '../sentry-api.js';
import { mapMember, memberSchema } from './schemas.js';

export const listMembers = defineTool({
  name: 'list_members',
  displayName: 'List Members',
  description:
    'List all members of the current Sentry organization. Returns name, email, role, and join date for each member.',
  summary: 'List organization members',
  icon: 'users',
  group: 'Organizations',
  input: z.object({
    limit: z.number().optional().describe('Maximum number of members to return (default 25, max 100)'),
    cursor: z.string().optional().describe('Pagination cursor from a previous response'),
  }),
  output: z.object({
    members: z.array(memberSchema).describe('List of organization members'),
    cursor: z.string().describe('Pagination cursor for next page, empty if no more results'),
  }),
  handle: async params => {
    const orgSlug = getOrgSlug();
    const { data, nextCursor } = await sentryApi<Record<string, unknown>[]>(`/organizations/${orgSlug}/members/`, {
      query: { per_page: params.limit, cursor: params.cursor },
    });
    return {
      members: (Array.isArray(data) ? data : []).map(m => mapMember(m)),
      cursor: nextCursor ?? '',
    };
  },
});
