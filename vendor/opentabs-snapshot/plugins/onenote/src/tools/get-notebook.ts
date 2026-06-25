import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../onenote-api.js';
import { type RawNotebook, mapNotebook, notebookSchema } from './schemas.js';

export const getNotebook = defineTool({
  name: 'get_notebook',
  displayName: 'Get Notebook',
  description:
    'Get detailed information about a specific OneNote notebook by its ID. Returns notebook metadata including name, creation date, sharing status, and web URL.',
  summary: 'Get a notebook by ID',
  icon: 'book-open',
  group: 'Notebooks',
  input: z.object({
    notebook_id: z.string().min(1).describe('Notebook ID'),
  }),
  output: z.object({
    notebook: notebookSchema.describe('Notebook details'),
  }),
  handle: async params => {
    const data = await api<RawNotebook>(`/me/onenote/notebooks/${params.notebook_id}`);
    return { notebook: mapNotebook(data) };
  },
});
