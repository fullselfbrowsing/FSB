import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../supabase-api.js';

export const pauseProject = defineTool({
  name: 'pause_project',
  displayName: 'Pause Project',
  description:
    'Pause a Supabase project. The project database and APIs will become unavailable. Use restore_project to bring it back.',
  summary: 'Pause a project to save resources',
  icon: 'pause',
  group: 'Projects',
  input: z.object({
    ref: z.string().min(1).describe('Project reference ID to pause'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the pause was initiated'),
  }),
  handle: async params => {
    await api(`/projects/${params.ref}/pause`, { method: 'POST' });
    return { success: true };
  },
});
