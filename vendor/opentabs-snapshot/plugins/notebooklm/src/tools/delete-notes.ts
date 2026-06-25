import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { rpc } from '../notebooklm-api.js';

export const deleteNotes = defineTool({
  name: 'delete_notes',
  displayName: 'Delete Notes',
  description: 'Delete one or more notes from a notebook.',
  summary: 'Delete notes',
  icon: 'file-x',
  group: 'Notes',
  input: z.object({
    notebook_id: z.string().describe('Notebook UUID'),
    note_ids: z.array(z.string()).min(1).describe('Array of note UUIDs to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await rpc('AH0mwd', [params.notebook_id, null, params.note_ids], `/notebook/${params.notebook_id}`);
    return { success: true };
  },
});
