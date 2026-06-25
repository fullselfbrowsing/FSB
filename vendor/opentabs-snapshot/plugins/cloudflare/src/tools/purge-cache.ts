// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { apiVoid } from '../cloudflare-api.js';

export const purgeCache = defineTool({
  name: 'purge_cache',
  displayName: 'Purge Cache',
  description:
    'Purge cached content for a Cloudflare zone. Purge everything, or selectively purge by URL, host, tag, or prefix. This evicts cache entries and cannot be undone.',
  summary: 'Purge the zone cache',
  icon: 'trash-2',
  group: 'Cache',
  input: z.object({
    zone_id: z.string().min(1).describe('Cloudflare zone ID whose cache to purge'),
    purge_everything: z.boolean().optional().describe('Purge the entire cache for the zone'),
    files: z.array(z.string()).optional().describe('Specific URLs to purge from cache'),
    tags: z.array(z.string()).optional().describe('Cache-Tags to purge'),
    hosts: z.array(z.string()).optional().describe('Hostnames to purge'),
    prefixes: z.array(z.string()).optional().describe('URL prefixes to purge'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the purge request was accepted'),
  }),
  handle: async (params: { zone_id: string }) => {
    // NEVER executed by the importer. Upstream: apiVoid POST /zones/:id/purge_cache
    // (purge -> DESTRUCTIVE via the shared verb set; the {method:'POST'} literal only escalates).
    await apiVoid(`/zones/${encodeURIComponent(params.zone_id)}/purge_cache`, { method: 'POST' });
    return { success: true };
  },
});
