import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../leetcode-api.js';
import { type RawQuestionListItem, mapQuestionListItem, questionListItemSchema } from './schemas.js';

export const listProblems = defineTool({
  name: 'list_problems',
  displayName: 'List Problems',
  description:
    'List LeetCode problems with pagination. Optionally filter by category, difficulty, tags, status, and search keyword. Returns problem number, title, difficulty, acceptance rate, and topic tags.',
  summary: 'Browse the problem set',
  icon: 'list',
  group: 'Problems',
  input: z.object({
    categorySlug: z
      .string()
      .optional()
      .describe('Category slug (e.g., "algorithms", "database", "shell", "concurrency")'),
    skip: z.number().int().min(0).optional().describe('Number of problems to skip (default 0)'),
    limit: z.number().int().min(1).max(100).optional().describe('Number of problems to return (default 20, max 100)'),
    difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional().describe('Filter by difficulty'),
    status: z
      .enum(['NOT_STARTED', 'AC', 'TRIED'])
      .optional()
      .describe('Filter by status: NOT_STARTED, AC (accepted), TRIED'),
    tags: z.array(z.string()).optional().describe('Filter by topic tag slugs (e.g., ["array", "hash-table"])'),
    searchKeywords: z.string().optional().describe('Search by keyword in problem title'),
  }),
  output: z.object({
    total: z.number().describe('Total number of matching problems'),
    questions: z.array(questionListItemSchema),
  }),
  handle: async params => {
    const filters: Record<string, unknown> = {};
    if (params.difficulty) filters.difficulty = params.difficulty;
    if (params.status) filters.status = params.status;
    if (params.tags?.length) filters.tags = params.tags;
    if (params.searchKeywords) filters.searchKeywords = params.searchKeywords;

    const data = await graphql<{
      problemsetQuestionList: {
        totalNum: number;
        data: RawQuestionListItem[];
      };
    }>(
      `query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
				problemsetQuestionList: questionList(
					categorySlug: $categorySlug
					limit: $limit
					skip: $skip
					filters: $filters
				) {
					totalNum
					data {
						acRate difficulty freqBar
						frontendQuestionId: questionFrontendId
						isFavor paidOnly: isPaidOnly status title titleSlug
						topicTags { name slug }
						hasSolution hasVideoSolution
					}
				}
			}`,
      {
        categorySlug: params.categorySlug ?? '',
        skip: params.skip ?? 0,
        limit: params.limit ?? 20,
        filters,
      },
    );

    const list = data.problemsetQuestionList;
    return {
      total: list?.totalNum ?? 0,
      questions: (list?.data ?? []).map(mapQuestionListItem),
    };
  },
});
