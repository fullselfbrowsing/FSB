import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../hack2hire-api.js';
import { type RawCodingQuestionRef, codingQuestionRefSchema, mapCodingQuestionRef } from './schemas.js';

export const listQuestionCodingProblems = defineTool({
  name: 'list_question_coding_problems',
  displayName: 'List Question Coding Problems',
  description:
    'List the coding problems associated with a post. Each post can have one or more coding problems — for example a multi-part interview question. Returns each coding problem ID and its type (SINGLE_STEP or MULTI_STEP). Use the returned IDs with `list_question_comments` to read comments anchored to the coding problem itself.',
  summary: 'List coding problems for a post',
  icon: 'code',
  group: 'Questions',
  input: z.object({
    postId: z.string().describe('Post ID — get this from list_questions or get_question.'),
  }),
  output: z.object({
    codingProblems: z.array(codingQuestionRefSchema),
  }),
  handle: async params => {
    const data = await api<RawCodingQuestionRef[]>('/coding/filter', {
      postId: params.postId,
    });
    return { codingProblems: (data ?? []).map(mapCodingQuestionRef) };
  },
});
