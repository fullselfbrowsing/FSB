import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../leetcode-api.js';
import { type RawRecentSubmission, mapRecentSubmission, recentSubmissionSchema } from './schemas.js';

export const listRecentSubmissions = defineTool({
  name: 'list_recent_submissions',
  displayName: 'List Recent AC Submissions',
  description:
    'List a user recent accepted submissions. Returns the most recent accepted solutions with problem title, language, and timestamp.',
  summary: 'List recent accepted submissions',
  icon: 'check-circle',
  group: 'Submissions',
  input: z.object({
    username: z.string().describe('LeetCode username'),
    limit: z.number().int().min(1).max(20).optional().describe('Number of submissions to return (default 10, max 20)'),
  }),
  output: z.object({
    submissions: z.array(recentSubmissionSchema),
  }),
  handle: async params => {
    const data = await graphql<{
      recentAcSubmissionList: RawRecentSubmission[];
    }>(
      `query recentAcSubmissions($username: String!, $limit: Int!) {
				recentAcSubmissionList(username: $username, limit: $limit) {
					id title titleSlug timestamp statusDisplay lang
				}
			}`,
      { username: params.username, limit: params.limit ?? 10 },
    );
    return {
      submissions: (data.recentAcSubmissionList ?? []).map(mapRecentSubmission),
    };
  },
});
