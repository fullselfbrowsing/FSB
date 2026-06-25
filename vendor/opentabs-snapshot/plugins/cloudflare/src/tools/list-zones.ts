import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { cloudflareApi } from '../cloudflare-api.js';
import { mapPagination, mapZone, paginationSchema, zoneSchema } from './schemas.js';

export const listZones = defineTool({
  name: 'list_zones',
  displayName: 'List Zones',
  description:
    'List all zones (domains) in the Cloudflare account. Returns domain names, status, plan, nameservers, and configuration. Supports filtering by name and status, with pagination.',
  summary: 'List all domains/zones',
  icon: 'globe',
  group: 'Zones',
  input: z.object({
    name: z.string().optional().describe('Filter by domain name (supports partial match)'),
    status: z.enum(['active', 'pending', 'initializing', 'moved']).optional().describe('Filter by zone status'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
    per_page: z.number().int().min(5).max(50).optional().describe('Results per page (default 20, max 50)'),
  }),
  output: z.object({
    zones: z.array(zoneSchema).describe('List of zones'),
    pagination: paginationSchema.describe('Pagination info'),
  }),
  handle: async params => {
    const data = await cloudflareApi<Record<string, unknown>[]>('/zones', {
      query: {
        name: params.name,
        status: params.status,
        page: params.page ?? 1,
        per_page: params.per_page ?? 20,
      },
    });
    const zones = Array.isArray(data.result) ? (data.result as Record<string, unknown>[]) : [];
    return {
      zones: zones.map(z => mapZone(z)),
      pagination: mapPagination(data.result_info as Record<string, unknown> | undefined),
    };
  },
});
