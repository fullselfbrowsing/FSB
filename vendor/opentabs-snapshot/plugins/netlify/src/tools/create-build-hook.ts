import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../netlify-api.js';
import { buildHookSchema, type RawBuildHook, mapBuildHook } from './schemas.js';

export const createBuildHook = defineTool({
  name: 'create_build_hook',
  displayName: 'Create Build Hook',
  description:
    'Create a new build hook for a Netlify site. Build hooks generate a URL that triggers a new build for the specified branch when POSTed to.',
  summary: 'Create a build hook',
  icon: 'plus',
  group: 'Hooks',
  input: z.object({
    site_id: z.string().describe('The site ID to create the build hook for'),
    title: z.string().describe('Display title for the build hook'),
    branch: z.string().describe('Git branch to build when the hook is triggered'),
  }),
  output: buildHookSchema,
  handle: async params => {
    const raw = await api<RawBuildHook>(`/sites/${params.site_id}/build_hooks`, {
      method: 'POST',
      body: { title: params.title, branch: params.branch },
    });
    return mapBuildHook(raw);
  },
});
