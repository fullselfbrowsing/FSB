import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../supabase-api.js';

export const restoreProject = defineTool({
  name: 'restore_project',
  displayName: 'Restore Project',
  description: 'Restore a paused Supabase project. This will start the project database and APIs again.',
  summary: 'Restore a paused project',
  icon: 'play',
  group: 'Projects',
  input: z.object({
    ref: z.string().min(1).describe('Project reference ID to restore'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the restore was initiated'),
  }),
  handle: async params => {
    await api(`/projects/${params.ref}/restore`, { method: 'POST' });
    return { success: true };
  },
});
