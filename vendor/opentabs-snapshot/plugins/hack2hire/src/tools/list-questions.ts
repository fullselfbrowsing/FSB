import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { type Hack2HireList, api } from '../hack2hire-api.js';
import { POST_TYPES, STAGES, type RawPost, mapPostSummary, postSummarySchema } from './schemas.js';

const sortByOptions = ['isLocked', 'frequency', 'difficulty', 'createdDate'] as const;

export const listQuestions = defineTool({
  name: 'list_questions',
  displayName: 'List Questions',
  description:
    'Search and filter Hack2Hire interview questions. Combine filters to narrow results: `companyTags` (uppercase, e.g. "PINTEREST") returns questions reportedly asked at that company; `type` (ALGORITHM, SD, ML_SD, BLOG) selects the question category; `algorithmTags` filters by topic (e.g. ARRAY, GREEDY, HASH_TABLE, HEAP, TRIE); `stages` filters by interview stage (SCREENING, OA, ONSITE, PHONE); `difficulty` is 1 (Easy), 2 (Medium), or 3 (Hard); `selectedCollectionKey` selects a curated list (e.g. "hack2hire-50-picks", "engineering-problem-picks"). Returns a paginated list with summary fields including the company frequency map, tags, difficulty, and locked/free status.',
  summary: 'Search and filter interview questions',
  icon: 'search',
  group: 'Questions',
  input: z.object({
    companyTags: z
      .string()
      .optional()
      .describe(
        'Filter by company key in uppercase (e.g. "PINTEREST", "AMAZON"). Use list_companies to discover keys.',
      ),
    type: z
      .enum(POST_TYPES)
      .optional()
      .describe('Filter by question type — ALGORITHM (coding), SD (system design), ML_SD (ML system design), or BLOG.'),
    algorithmTags: z
      .string()
      .optional()
      .describe(
        'Filter by algorithm/topic tag (e.g. "ARRAY", "GREEDY", "HASH_TABLE", "HEAP", "TRIE", "BACKTRACKING", "BREADTH_FIRST_SEARCH", "UNION_FIND", "SORTING", "CONCURRENCY").',
      ),
    stages: z.enum(STAGES).optional().describe('Filter by interview stage where the question is reported.'),
    difficulty: z
      .number()
      .int()
      .min(1)
      .max(3)
      .optional()
      .describe('Filter by difficulty — 1 (Easy), 2 (Medium), or 3 (Hard).'),
    selectedCollectionKey: z
      .string()
      .optional()
      .describe(
        'Filter by curated collection key (e.g. "hack2hire-50-picks", "engineering-problem-picks", "object-oriented-problem-picks", "system-simulation-problem-picks", "classic-ml-system-design-picks", "new-ml-system-design-picks", "ai-system-design-picks", "classic-system-design-picks", "customer-facing-system-design-picks", "infra-system-design-picks", "new-system-design-topic-picks").',
      ),
    sortBy: z
      .enum(sortByOptions)
      .optional()
      .describe('Sort order. "isLocked" (default) lists free questions first, then locked.'),
    page: z.number().int().min(1).optional().describe('Page number (default 1).'),
    perPage: z.number().int().min(1).max(100).optional().describe('Results per page (default 10, max 100).'),
  }),
  output: z.object({
    questions: z.array(postSummarySchema),
    total: z.number().int().describe('Total number of questions matching the filters across all pages.'),
    page: z.number().int().describe('Current page number.'),
    perPage: z.number().int().describe('Results per page in this response.'),
  }),
  handle: async params => {
    const data = await api<Hack2HireList<RawPost>>('/post/filter', {
      page: params.page ?? 1,
      perPage: params.perPage ?? 10,
      companyTags: params.companyTags,
      type: params.type,
      algorithmTags: params.algorithmTags,
      stages: params.stages,
      difficulty: params.difficulty,
      selectedCollectionKey: params.selectedCollectionKey,
      sortBy: params.sortBy,
    });
    return {
      questions: (data.data ?? []).map(mapPostSummary),
      total: data.total ?? 0,
      page: data.page ?? 1,
      perPage: data.perPage ?? 10,
    };
  },
});
