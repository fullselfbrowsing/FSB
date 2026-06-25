import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../netlify-api.js';

export const deleteBuildHook = defineTool({
  name: 'delete_build_hook',
  displayName: 'Delete Build Hook',
  description:
    'Delete a build hook from a Netlify site by its ID. The hook URL will no longer trigger builds. This action cannot be undone.',
  summary: 'Delete a build hook',
  icon: 'trash-2',
  group: 'Hooks',
  input: z.object({
    site_id: z.string().describe('The site ID the build hook belongs to'),
    hook_id: z.string().describe('The build hook ID to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await api(`/sites/${params.site_id}/build_hooks/${params.hook_id}`, {
      method: 'DELETE',
    });
    return { success: true };
  },
});
