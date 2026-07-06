import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../stackoverflow-api.js';
import { questionSchema, mapQuestion } from './schemas.js';

export const getQuestion = defineTool({
  name: 'get_question',
  displayName: 'Get Question',
  description:
    'Get a specific Stack Overflow question by its ID. Returns the full question body, tags, score, answer count, and metadata. Use this to read the full content of a question.',
  summary: 'Get question details by ID',
  icon: 'help-circle',
  group: 'Questions',
  input: z.object({
    question_id: z.number().int().describe('Question ID'),
  }),
  output: z.object({
    question: questionSchema.describe('Question details'),
  }),
  handle: async params => {
    const data = await api(`/questions/${params.question_id}`);
    const item = data.items?.[0];
    if (!item) throw ToolError.notFound(`Question ${params.question_id} not found`);
    return { question: mapQuestion(item) };
  },
});
