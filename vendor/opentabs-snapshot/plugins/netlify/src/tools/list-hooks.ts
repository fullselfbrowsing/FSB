import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../netlify-api.js';
import { hookSchema, type RawHook, mapHook } from './schemas.js';

export const listHooks = defineTool({
  name: 'list_hooks',
  displayName: 'List Hooks',
  description:
    'List notification hooks (outgoing webhooks) for a Netlify site. Returns hook type, trigger event, configuration data, and disabled status.',
  summary: 'List site notification hooks',
  icon: 'webhook',
  group: 'Hooks',
  input: z.object({
    site_id: z.string().describe('The site ID to list hooks for'),
  }),
  output: z.object({
    items: z.array(hookSchema).describe('List of notification hooks'),
  }),
  handle: async params => {
    const raw = await api<RawHook[]>('/hooks', {
      query: { site_id: params.site_id },
    });
    return { items: raw.map(mapHook) };
  },
});
