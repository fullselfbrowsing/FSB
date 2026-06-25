import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { type Hack2HireList, api } from '../hack2hire-api.js';
import { type RawVisitRecord, mapVisitRecord, visitRecordSchema } from './schemas.js';

export const listMyVisits = defineTool({
  name: 'list_my_visits',
  displayName: 'List My Visits',
  description:
    "List the authenticated user's recently visited interview questions, with the per-question reading status (NEW, READING, COMPLETED) and a snapshot of each linked post. Use this to find what the user has been working on or to filter by reading progress. Optionally filter to a specific postId to check the user's status on it.",
  summary: 'List my recently visited questions',
  icon: 'history',
  group: 'Account',
  input: z.object({
    postId: z
      .string()
      .optional()
      .describe('If provided, only return the visit record for this specific post ID (or empty if not visited).'),
    page: z.number().int().min(1).optional().describe('Page number (default 1).'),
    perPage: z.number().int().min(1).max(999).optional().describe('Results per page (default 25, max 999).'),
  }),
  output: z.object({
    visits: z.array(visitRecordSchema),
    total: z.number().int().describe('Total visit records matching the filters across all pages.'),
    page: z.number().int(),
    perPage: z.number().int(),
  }),
  handle: async params => {
    const data = await api<Hack2HireList<RawVisitRecord>>('/user/filter-visit-post-records', {
      page: params.page ?? 1,
      perPage: params.perPage ?? 25,
      postId: params.postId,
    });
    return {
      visits: (data.data ?? []).map(mapVisitRecord),
      total: data.total ?? 0,
      page: data.page ?? 1,
      perPage: data.perPage ?? 25,
    };
  },
});
