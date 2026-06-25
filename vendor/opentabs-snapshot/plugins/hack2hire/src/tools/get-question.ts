import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../hack2hire-api.js';
import { type RawPost, mapPostDetail, postDetailSchema } from './schemas.js';

export const getQuestion = defineTool({
  name: 'get_question',
  displayName: 'Get Question',
  description:
    'Get the full detail of a single Hack2Hire interview question by its post ID, including the markdown content preview, company frequencies, algorithm tags, interview stages, difficulty, and the IDs of any associated coding questions (use those IDs with list_question_comments). For paid (locked) questions the contentPreview field returns a teaser only — full content requires a Hack2Hire premium subscription.',
  summary: 'Get full detail of one question',
  icon: 'file-text',
  group: 'Questions',
  input: z.object({
    postId: z.string().describe('Post ID — get this from list_questions.'),
  }),
  output: z.object({ question: postDetailSchema }),
  handle: async params => {
    const data = await api<RawPost>(`/post/${params.postId}`);
    return { question: mapPostDetail(data) };
  },
});
