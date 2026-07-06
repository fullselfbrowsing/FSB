import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../leetcode-api.js';
import { type RawDiscussion, discussionSchema, mapDiscussion } from './schemas.js';

export const listDiscussions = defineTool({
  name: 'list_discussions',
  displayName: 'List Discussions',
  description:
    'List discussion topics for a problem. Sorted by most votes by default. Returns topic title, view count, vote count, and creation date.',
  summary: 'List discussion topics for a problem',
  icon: 'message-square',
  group: 'Discussions',
  input: z.object({
    questionId: z.string().describe('Question ID (numeric string). Use get_problem to find the questionId.'),
    orderBy: z
      .enum(['most_votes', 'newest_to_oldest', 'most_relevant'])
      .optional()
      .describe('Sort order (default "most_votes")'),
    skip: z.number().int().min(0).optional().describe('Number to skip (default 0)'),
    first: z.number().int().min(1).max(25).optional().describe('Number of topics (default 10, max 25)'),
  }),
  output: z.object({
    total: z.number().describe('Total number of discussion topics'),
    discussions: z.array(discussionSchema),
  }),
  handle: async params => {
    const data = await graphql<{
      questionTopicsList: {
        totalNum: number;
        edges: Array<{ node: RawDiscussion }>;
      };
    }>(
      `query questionTopicsList($questionId: String!, $orderBy: TopicSortingOption, $skip: Int, $first: Int) {
				questionTopicsList(questionId: $questionId, orderBy: $orderBy, skip: $skip, first: $first) {
					totalNum
					edges {
						node {
							id title viewCount
							post { voteCount creationDate }
							tags { name slug }
						}
					}
				}
			}`,
      {
        questionId: params.questionId,
        orderBy: params.orderBy ?? 'most_votes',
        skip: params.skip ?? 0,
        first: params.first ?? 10,
      },
    );

    const list = data.questionTopicsList;
    return {
      total: list?.totalNum ?? 0,
      discussions: (list?.edges ?? []).map(e => mapDiscussion(e.node ?? {})),
    };
  },
});
