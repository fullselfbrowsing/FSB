import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { rpc, FEATURE_FLAGS } from '../notebooklm-api.js';

const SOURCE_TYPES: Record<number, string> = {
  1: 'website',
  2: 'text',
  3: 'pdf',
  4: 'google_doc',
  5: 'google_slides',
  6: 'youtube',
  7: 'audio',
};

const sourceSchema = z.object({
  id: z.string().describe('Source UUID'),
  title: z.string().describe('Source title'),
  type: z.string().describe('Source type (website, text, pdf, google_doc, etc.)'),
  word_count: z.number().int().describe('Approximate word count'),
});

export const listSources = defineTool({
  name: 'list_sources',
  displayName: 'List Sources',
  description: 'List all sources in a notebook. Returns source IDs, titles, types, and word counts.',
  summary: 'List sources in a notebook',
  icon: 'library',
  group: 'Sources',
  input: z.object({
    notebook_id: z.string().describe('Notebook UUID'),
  }),
  output: z.object({
    sources: z.array(sourceSchema).describe('List of sources'),
  }),
  handle: async params => {
    const data = await rpc<unknown[][]>(
      'rLM1Ne',
      [params.notebook_id, null, [...FEATURE_FLAGS], null, 0],
      `/notebook/${params.notebook_id}`,
    );
    const project = (data?.[0] as unknown[]) ?? [];
    const rawSources = (project[1] as unknown[][] | undefined) ?? [];
    return {
      sources: rawSources.map(s => {
        const meta = (s[2] as unknown[] | undefined) ?? [];
        const typeField = (s[3] as unknown[] | undefined) ?? [];
        const typeNum = (typeField[1] as number) ?? 0;
        return {
          id: ((s[0] as unknown[])?.[0] as string) ?? '',
          title: (s[1] as string) ?? '',
          type: SOURCE_TYPES[typeNum] ?? `unknown_${typeNum}`,
          word_count: (meta[8] as number) ?? 0,
        };
      }),
    };
  },
});
