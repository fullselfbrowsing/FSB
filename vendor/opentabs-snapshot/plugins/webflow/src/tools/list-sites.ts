import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../webflow-api.js';
import { siteSchema, mapSite } from './schemas.js';
import type { RawSite } from './schemas.js';

interface SitesResponse {
  sites?: RawSite[];
  paginationMetadata?: {
    page?: number;
    pageSize?: number;
    totalCount?: number;
    totalPages?: number;
  };
}

export const listSites = defineTool({
  name: 'list_sites',
  displayName: 'List Sites',
  description:
    'List all sites in a Webflow workspace. Returns site names, slugs, publish status, and timestamps. Supports pagination.',
  summary: 'List sites in a workspace',
  icon: 'globe',
  group: 'Sites',
  input: z.object({
    workspace_slug: z.string().describe('Workspace URL slug'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
  }),
  output: z.object({
    sites: z.array(siteSchema),
    total_count: z.number().int().describe('Total number of sites'),
    total_pages: z.number().int().describe('Total number of pages'),
    page: z.number().int().describe('Current page number'),
  }),
  handle: async params => {
    const data = await api<SitesResponse>(`/workspaces/${params.workspace_slug}/sites`, {
      query: { page: params.page },
    });
    return {
      sites: (data.sites ?? []).map(mapSite),
      total_count: data.paginationMetadata?.totalCount ?? 0,
      total_pages: data.paginationMetadata?.totalPages ?? 0,
      page: data.paginationMetadata?.page ?? 1,
    };
  },
});
