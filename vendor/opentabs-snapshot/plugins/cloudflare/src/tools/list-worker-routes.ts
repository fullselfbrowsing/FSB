import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { cloudflareApi } from '../cloudflare-api.js';

export const listWorkerRoutes = defineTool({
  name: 'list_worker_routes',
  displayName: 'List Worker Routes',
  description:
    'List Workers routes for a zone. Worker routes map URL patterns to Worker scripts that handle matching requests.',
  summary: 'List Workers routes for a zone',
  icon: 'route',
  group: 'Workers',
  input: z.object({
    zone_id: z.string().describe('Zone ID (32-char hex string)'),
  }),
  output: z.object({
    routes: z
      .array(
        z.object({
          id: z.string().describe('Route ID'),
          pattern: z.string().describe('URL pattern (e.g., "example.com/api/*")'),
          script: z.string().nullable().describe('Worker script name, or null if no script is attached'),
        }),
      )
      .describe('List of worker routes'),
  }),
  handle: async params => {
    const data = await cloudflareApi<Record<string, unknown>[]>(
      `/zones/${encodeURIComponent(params.zone_id)}/workers/routes`,
    );
    const routes = Array.isArray(data.result) ? (data.result as Record<string, unknown>[]) : [];
    return {
      routes: routes.map(r => ({
        id: (r.id as string) ?? '',
        pattern: (r.pattern as string) ?? '',
        script: (r.script as string) ?? null,
      })),
    };
  },
});
