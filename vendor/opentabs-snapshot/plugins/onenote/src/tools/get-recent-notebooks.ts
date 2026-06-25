import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../onenote-api.js';
import { type RawRecentNotebook, mapRecentNotebook, recentNotebookSchema } from './schemas.js';

interface RecentNotebooksResponse {
  value?: RawRecentNotebook[];
}

export const getRecentNotebooks = defineTool({
  name: 'get_recent_notebooks',
  displayName: 'Get Recent Notebooks',
  description:
    'Get recently accessed OneNote notebooks. Returns notebooks sorted by last access time, including notebooks from personal OneDrive and OneDrive for Business.',
  summary: 'Get recently accessed notebooks',
  icon: 'clock',
  group: 'Notebooks',
  input: z.object({
    include_personal: z
      .boolean()
      .optional()
      .describe('Include personal (consumer) notebooks in addition to business notebooks (default true)'),
  }),
  output: z.object({
    notebooks: z.array(recentNotebookSchema).describe('List of recently accessed notebooks'),
  }),
  handle: async params => {
    const includePersonal = params.include_personal ?? true;
    const data = await api<RecentNotebooksResponse>(
      `/me/onenote/notebooks/getRecentNotebooks(includePersonalNotebooks=${includePersonal})`,
    );
    return { notebooks: (data.value ?? []).map(mapRecentNotebook) };
  },
});
