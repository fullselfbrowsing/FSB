import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../hack2hire-api.js';
import { type RawCompanyStatsEntry, companyStatsSchema, mapCompanyStats } from './schemas.js';

interface Response {
  data?: RawCompanyStatsEntry[];
  selectedCollectionCounts?: Record<string, number>;
}

export const getCompanyQuestionStats = defineTool({
  name: 'get_company_question_stats',
  displayName: 'Get Company Question Stats',
  description:
    'Get the breakdown of tracked questions for a specific company — the total count plus a count per question type (ALGORITHM, SD, ML_SD, BLOG). Also returns the count for every curated collection. Useful for showing how many questions are available before drilling into a list.',
  summary: 'Question count breakdown for a company',
  icon: 'chart-bar',
  group: 'Companies',
  input: z.object({
    company: z
      .string()
      .describe('Company key in uppercase (e.g. "PINTEREST", "AMAZON"). Use list_companies to discover keys.'),
  }),
  output: z.object({
    stats: companyStatsSchema,
    selectedCollectionCounts: z
      .record(z.string(), z.number().int())
      .describe('Number of questions in each curated collection (e.g. "hack2hire-50-picks").'),
  }),
  handle: async params => {
    const data = await api<Response>('/post/company-statistics', {
      company: params.company,
    });
    const entry = (data.data ?? [])[0] ?? {};
    return {
      stats: mapCompanyStats(entry),
      selectedCollectionCounts: data.selectedCollectionCounts ?? {},
    };
  },
});
