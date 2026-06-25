import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { rpc, FEATURE_FLAGS } from '../notebooklm-api.js';

export const getNotebookGuide = defineTool({
  name: 'get_notebook_guide',
  displayName: 'Get Notebook Guide',
  description:
    'Generate an AI summary of all sources in a notebook, along with suggested questions for deeper exploration. This is the primary way to get NotebookLM to analyze and synthesize your sources.',
  summary: 'Get AI summary of sources',
  icon: 'sparkles',
  group: 'Chat',
  input: z.object({
    notebook_id: z.string().describe('Notebook UUID'),
  }),
  output: z.object({
    summary: z.string().describe('AI-generated summary of all sources'),
    suggested_questions: z
      .array(
        z.object({
          question: z.string().describe('Suggested question'),
          prompt: z.string().describe('Full prompt for generating a briefing doc on this question'),
        }),
      )
      .describe('AI-suggested follow-up questions with prompts'),
    guide_id: z.string().describe('Guide ID for reference'),
  }),
  handle: async params => {
    const data = await rpc<unknown[]>(
      'VfAZjd',
      [params.notebook_id, [...FEATURE_FLAGS]],
      `/notebook/${params.notebook_id}`,
    );
    const inner = (data?.[0] as unknown[]) ?? [];
    const summary = (((inner[0] as unknown[]) ?? [])[0] as string) ?? '';
    const questionsBlock = (inner[1] as unknown[]) ?? [];
    const questionPairs = (questionsBlock[0] as unknown[][]) ?? [];
    const suggested_questions = questionPairs.map(q => ({
      question: (q[0] as string) ?? '',
      prompt: (q[1] as string) ?? '',
    }));
    const guideId = (data?.[1] as string) ?? '';
    return { summary, suggested_questions, guide_id: guideId };
  },
});
