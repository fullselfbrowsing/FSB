import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../supabase-api.js';

const snippetSchema = z.object({
  id: z.string().describe('Snippet UUID'),
  name: z.string().describe('Snippet name'),
  description: z.string().describe('Snippet description'),
  visibility: z.string().describe('Visibility (e.g., "user", "project", "org")'),
  project_id: z.string().describe('Project ID the snippet belongs to'),
});

export const listSqlSnippets = defineTool({
  name: 'list_sql_snippets',
  displayName: 'List SQL Snippets',
  description: 'List saved SQL snippets for the authenticated user.',
  summary: 'List saved SQL snippets',
  icon: 'code',
  group: 'Database',
  input: z.object({}),
  output: z.object({
    snippets: z.array(snippetSchema).describe('List of SQL snippets'),
  }),
  handle: async () => {
    const data = await api<{ data?: Record<string, unknown>[] }>('/snippets');
    const items = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];
    return {
      snippets: (items as Record<string, unknown>[]).map(s => ({
        id: (s.id as string) ?? '',
        name: (s.name as string) ?? '',
        description: (s.description as string) ?? '',
        visibility: (s.visibility as string) ?? '',
        project_id: (s.project_id as string) ?? ((s.project as Record<string, unknown>)?.id as string) ?? '',
      })),
    };
  },
});
