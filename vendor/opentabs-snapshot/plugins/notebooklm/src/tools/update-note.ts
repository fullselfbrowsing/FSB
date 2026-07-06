import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { rpc } from '../notebooklm-api.js';

export const updateNote = defineTool({
  name: 'update_note',
  displayName: 'Update Note',
  description: 'Update the content of an existing note.',
  summary: 'Update a note',
  icon: 'file-pen',
  group: 'Notes',
  input: z.object({
    notebook_id: z.string().describe('Notebook UUID'),
    note_id: z.string().describe('Note UUID to update'),
    content: z.string().describe('New note content (supports markdown)'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await rpc('cYAfTb', [params.notebook_id, params.note_id, [[[params.content]]]], `/notebook/${params.notebook_id}`);
    return { success: true };
  },
});
