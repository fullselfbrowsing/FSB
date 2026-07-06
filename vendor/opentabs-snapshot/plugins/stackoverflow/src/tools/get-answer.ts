import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../stackoverflow-api.js';
import { answerSchema, mapAnswer } from './schemas.js';

export const getAnswer = defineTool({
  name: 'get_answer',
  displayName: 'Get Answer',
  description:
    'Get a specific Stack Overflow answer by its ID. Returns the full answer body, score, acceptance status, and author information.',
  summary: 'Get answer details by ID',
  icon: 'check-circle',
  group: 'Answers',
  input: z.object({
    answer_id: z.number().int().describe('Answer ID'),
  }),
  output: z.object({
    answer: answerSchema.describe('Answer details'),
  }),
  handle: async params => {
    const data = await api(`/answers/${params.answer_id}`);
    const item = data.items?.[0];
    if (!item) throw ToolError.notFound(`Answer ${params.answer_id} not found`);
    return { answer: mapAnswer(item) };
  },
});
