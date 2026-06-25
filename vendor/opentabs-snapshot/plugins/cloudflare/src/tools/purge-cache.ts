import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { cloudflareApi } from '../cloudflare-api.js';

export const purgeCache = defineTool({
  name: 'purge_cache',
  displayName: 'Purge Cache',
  description:
    'Purge cached content for a zone. Can purge everything, specific URLs, or by tags/prefixes/hosts. Use purge_everything=true to clear all cached files.',
  summary: 'Purge zone cache',
  icon: 'eraser',
  group: 'Cache',
  input: z.object({
    zone_id: z.string().describe('Zone ID (32-char hex string)'),
    purge_everything: z.boolean().optional().describe('Purge all cached files (default false)'),
    files: z.array(z.string()).optional().describe('Array of URLs to purge (max 30)'),
    tags: z.array(z.string()).optional().describe('Array of cache tags to purge (Enterprise only)'),
    hosts: z.array(z.string()).optional().describe('Array of hostnames to purge (Enterprise only)'),
    prefixes: z.array(z.string()).optional().describe('Array of URL prefixes to purge (Enterprise only)'),
  }),
  output: z.object({
    id: z.string().describe('Purge request ID'),
  }),
  handle: async params => {
    const body: Record<string, unknown> = {};
    if (params.purge_everything) {
      body.purge_everything = true;
    } else {
      if (params.files) body.files = params.files;
      if (params.tags) body.tags = params.tags;
      if (params.hosts) body.hosts = params.hosts;
      if (params.prefixes) body.prefixes = params.prefixes;
    }

    const data = await cloudflareApi<Record<string, unknown>>(
      `/zones/${encodeURIComponent(params.zone_id)}/purge_cache`,
      { method: 'POST', body },
    );
    const result = data.result as Record<string, unknown> | undefined;
    return { id: (result?.id as string) ?? '' };
  },
});
