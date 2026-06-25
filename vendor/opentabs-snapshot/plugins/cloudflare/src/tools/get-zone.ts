// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../cloudflare-api.js';

export const getZone = defineTool({
  name: 'get_zone',
  displayName: 'Get Zone',
  description: 'Get detailed information about a single Cloudflare zone (domain) by its zone ID.',
  summary: 'Get a zone by id',
  icon: 'globe',
  group: 'Zones',
  input: z.object({
    zone_id: z.string().min(1).describe('Cloudflare zone ID'),
  }),
  output: z.object({
    id: z.string().describe('Zone ID'),
    name: z.string().describe('Zone (domain) name'),
    status: z.string().optional().describe('Zone status'),
  }),
  handle: async (params: { zone_id: string }) => {
    // NEVER executed by the importer. Upstream: api GET /zones/:id (default method).
    const data = await api<{ id: string; name: string }>(
      `/zones/${encodeURIComponent(params.zone_id)}`
    );
    return data;
  },
});
