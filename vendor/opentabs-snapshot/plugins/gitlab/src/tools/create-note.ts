import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../gitlab-api.js';
import { mapNote, noteSchema } from './schemas.js';

export const createNote = defineTool({
  name: 'create_note',
  displayName: 'Create Note',
  description: 'Add a comment (note) to an issue or merge request.',
  summary: 'Add a comment to an issue or MR',
  icon: 'message-square-plus',
  group: 'Notes',
  input: z.object({
    project: z.string().min(1).describe('Project path (e.g., "group/project") or numeric project ID'),
    noteable_type: z.enum(['issues', 'merge_requests']).describe('Type of the noteable: "issues" or "merge_requests"'),
    noteable_iid: z.number().int().min(1).describe('IID of the issue or merge request'),
    body: z.string().min(1).describe('Note body in Markdown'),
  }),
  output: z.object({
    note: noteSchema.describe('The created note'),
  }),
  handle: async params => {
    const data = await api<Record<string, unknown>>(
      `/projects/${encodeURIComponent(params.project)}/${params.noteable_type}/${params.noteable_iid}/notes`,
      { method: 'POST', body: { body: params.body } },
    );
    return { note: mapNote(data) };
  },
});
