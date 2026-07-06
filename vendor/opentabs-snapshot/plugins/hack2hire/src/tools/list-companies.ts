import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../hack2hire-api.js';
import { type RawCompanyDirectoryEntry, companyDirectoryEntrySchema, mapCompanyDirectoryEntry } from './schemas.js';

interface Response {
  companies?: RawCompanyDirectoryEntry[];
}

export const listCompanies = defineTool({
  name: 'list_companies',
  displayName: 'List Companies',
  description:
    'List every company that Hack2Hire tracks interview questions for, with the canonical URL key (e.g. "amazon", "pinterest"), display name, country, and a priority value used to rank companies in the UI. Use the `key` field to look up questions in `list_questions` (uppercased) or `get_company_question_stats`.',
  summary: 'List all tracked companies',
  icon: 'building-2',
  group: 'Companies',
  input: z.object({}),
  output: z.object({
    companies: z.array(companyDirectoryEntrySchema),
  }),
  handle: async () => {
    const data = await api<Response>('/company-directory');
    return { companies: (data.companies ?? []).map(mapCompanyDirectoryEntry) };
  },
});
