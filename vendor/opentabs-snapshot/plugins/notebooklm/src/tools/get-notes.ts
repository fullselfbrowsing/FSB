import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { rpc, FEATURE_FLAGS } from '../notebooklm-api.js';
import { noteSchema, mapNote } from './schemas.js';

export const getNotes = defineTool({
  name: 'get_notes',
  displayName: 'Get Notes',
  description: 'Get all notes in a notebook. Returns note IDs, titles, content, and timestamps.',
  summary: 'Get notes in a notebook',
  icon: 'sticky-note',
  group: 'Notes',
  input: z.object({
    notebook_id: z.string().describe('Notebook UUID'),
  }),
  output: z.object({
    notes: z.array(noteSchema).describe('List of notes'),
    sync_token_seconds: z.number().describe('Sync token timestamp for polling updates'),
  }),
  handle: async params => {
    const data = await rpc<unknown[]>(
      'cFji9',
      [params.notebook_id, null, null, [...FEATURE_FLAGS]],
      `/notebook/${params.notebook_id}`,
    );
    const notesList = (data?.[0] as unknown[][] | undefined) ?? [];
    const syncToken = (data?.[1] as number[] | undefined) ?? [];
    return {
      notes: notesList.map(n => mapNote(n)).filter(n => n.created_at_seconds > 0),
      sync_token_seconds: syncToken[0] ?? 0,
    };
  },
});
