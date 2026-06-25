import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getOrgSlug, sentryApi } from '../sentry-api.js';

const issueTagSchema = z.object({
  key: z.string().describe('Tag key (e.g., "browser", "os", "release", "environment")'),
  name: z.string().describe('Human-readable tag name'),
  total_values: z.number().describe('Number of unique values for this tag'),
  top_values: z
    .array(
      z.object({
        value: z.string().describe('Tag value'),
        count: z.number().describe('Number of events with this value'),
      }),
    )
    .describe('Most common values for this tag'),
});

export const listIssueTags = defineTool({
  name: 'list_issue_tags',
  displayName: 'List Issue Tags',
  description:
    'List tag distributions for a Sentry issue. Shows which browsers, operating systems, releases, ' +
    'environments, and other tags are associated with the issue, along with the top values and their counts.',
  summary: 'List tag distributions for an issue',
  icon: 'tags',
  group: 'Issues',
  input: z.object({
    issue_id: z.string().describe('The issue ID to list tags for'),
  }),
  output: z.object({
    tags: z.array(issueTagSchema).describe('List of tag distributions for the issue'),
    cursor: z.string().describe('Pagination cursor for next page, empty if no more results'),
  }),
  handle: async params => {
    const orgSlug = getOrgSlug();
    const { data, nextCursor } = await sentryApi<Record<string, unknown>[]>(
      `/organizations/${orgSlug}/issues/${params.issue_id}/tags/`,
    );
    return {
      cursor: nextCursor ?? '',
      tags: (Array.isArray(data) ? data : []).map(t => {
        const topValues = (t.topValues as Array<Record<string, unknown>>) ?? [];
        return {
          key: (t.key as string) ?? '',
          name: (t.name as string) ?? '',
          total_values: (t.totalValues as number) ?? 0,
          top_values: topValues.map(v => ({
            value: (v.value as string) ?? '',
            count: (v.count as number) ?? 0,
          })),
        };
      }),
    };
  },
});
