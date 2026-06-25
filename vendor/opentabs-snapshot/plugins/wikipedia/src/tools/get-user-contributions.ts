import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../wikipedia-api.js';
import { userContribSchema, mapUserContrib } from './schemas.js';
import type { RawUserContrib } from './schemas.js';

interface UserContribsResponse {
  query?: {
    usercontribs?: RawUserContrib[];
  };
}

export const getUserContributions = defineTool({
  name: 'get_user_contributions',
  displayName: 'Get User Contributions',
  description:
    'Get recent edits made by a Wikipedia user. Returns edited articles, revision IDs, timestamps, edit summaries, and page sizes.',
  summary: 'List edits made by a user',
  icon: 'pencil-line',
  group: 'Users',
  input: z.object({
    username: z.string().describe('Wikipedia username'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of contributions to return (default 20, max 50)'),
  }),
  output: z.object({
    contributions: z.array(userContribSchema),
  }),
  handle: async params => {
    const data = await api<UserContribsResponse>({
      action: 'query',
      list: 'usercontribs',
      ucuser: params.username,
      uclimit: params.limit ?? 20,
      ucprop: 'ids|title|timestamp|comment|size',
    });

    return {
      contributions: (data.query?.usercontribs ?? []).map(mapUserContrib),
    };
  },
});
