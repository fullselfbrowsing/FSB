import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../onenote-api.js';
import { type RawNotebook, mapNotebook, notebookSchema } from './schemas.js';

export const createNotebook = defineTool({
  name: 'create_notebook',
  displayName: 'Create Notebook',
  description:
    "Create a new OneNote notebook. The notebook name must be unique across the user's notebooks. Returns the created notebook with its ID and web URL.",
  summary: 'Create a new notebook',
  icon: 'book-plus',
  group: 'Notebooks',
  input: z.object({
    display_name: z.string().min(1).describe('Name for the new notebook (must be unique)'),
  }),
  output: z.object({
    notebook: notebookSchema.describe('Created notebook'),
  }),
  handle: async params => {
    const data = await api<RawNotebook>('/me/onenote/notebooks', {
      method: 'POST',
      body: { displayName: params.display_name },
    });
    return { notebook: mapNotebook(data) };
  },
});
