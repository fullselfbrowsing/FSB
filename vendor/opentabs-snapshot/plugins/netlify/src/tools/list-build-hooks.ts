import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../netlify-api.js';
import { buildHookSchema, type RawBuildHook, mapBuildHook } from './schemas.js';

export const listBuildHooks = defineTool({
  name: 'list_build_hooks',
  displayName: 'List Build Hooks',
  description:
    'List build hooks for a Netlify site. Build hooks are URLs that trigger a new build when POSTed to. Returns hook title, branch, and trigger URL.',
  summary: 'List site build hooks',
  icon: 'webhook',
  group: 'Hooks',
  input: z.object({
    site_id: z.string().describe('The site ID to list build hooks for'),
  }),
  output: z.object({
    items: z.array(buildHookSchema).describe('List of build hooks'),
  }),
  handle: async params => {
    const raw = await api<RawBuildHook[]>(`/sites/${params.site_id}/build_hooks`);
    return { items: raw.map(mapBuildHook) };
  },
});
