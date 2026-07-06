import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../gitlab-api.js';
import { mapNote, noteSchema } from './schemas.js';

export const listNotes = defineTool({
  name: 'list_notes',
  displayName: 'List Notes',
  description:
    'List notes (comments) on an issue or merge request. System notes (status changes, label updates) are included by default.',
  summary: 'List notes on an issue or merge request',
  icon: 'message-square',
  group: 'Notes',
  input: z.object({
    project: z.string().min(1).describe('Project path (e.g., "group/project") or numeric project ID'),
    noteable_type: z.enum(['issues', 'merge_requests']).describe('Type of the noteable: "issues" or "merge_requests"'),
    noteable_iid: z.number().int().min(1).describe('IID of the issue or merge request'),
    order_by: z.enum(['created_at', 'updated_at']).optional().describe('Sort field (default: created_at)'),
    sort: z.enum(['asc', 'desc']).optional().describe('Sort direction (default: desc)'),
    per_page: z.number().int().min(1).max(100).optional().describe('Results per page (default 20, max 100)'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
  }),
  output: z.object({
    notes: z.array(noteSchema).describe('List of notes'),
  }),
  handle: async params => {
    const query: Record<string, string | number | boolean | undefined> = {
      per_page: params.per_page ?? 20,
      page: params.page,
      order_by: params.order_by,
      sort: params.sort,
    };

    const data = await api<Record<string, unknown>[]>(
      `/projects/${encodeURIComponent(params.project)}/${params.noteable_type}/${params.noteable_iid}/notes`,
      { query },
    );
    return { notes: (data ?? []).map(mapNote) };
  },
});
