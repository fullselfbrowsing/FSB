import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { rpc } from '../notebooklm-api.js';

export const createNote = defineTool({
  name: 'create_note',
  displayName: 'Create Note',
  description: 'Create a new note in a notebook. Notes can contain markdown-formatted text.',
  summary: 'Create a note',
  icon: 'file-plus',
  group: 'Notes',
  input: z.object({
    notebook_id: z.string().describe('Notebook UUID'),
    content: z.string().describe('Note content (supports markdown)'),
  }),
  output: z.object({
    note_id: z.string().describe('ID of the newly created note'),
  }),
  handle: async params => {
    const data = await rpc<unknown[]>(
      'CYK0Xb',
      [params.notebook_id, params.content],
      `/notebook/${params.notebook_id}`,
    );
    const inner = Array.isArray(data?.[0]) ? data[0] : data;
    const id = (inner?.[0] as string) ?? '';
    return { note_id: id };
  },
});
