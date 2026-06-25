import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../netlify-api.js';
import { siteSchema, type RawSite, mapSite } from './schemas.js';

export const listSites = defineTool({
  name: 'list_sites',
  displayName: 'List Sites',
  description:
    'List sites for a Netlify account. Supports filtering by name and pagination. Returns site name, URL, custom domain, framework, repo info, and SSL status.',
  summary: 'List sites in an account',
  icon: 'list',
  group: 'Sites',
  input: z.object({
    account_slug: z.string().describe('The account slug to list sites for'),
    name: z.string().optional().describe('Filter sites by name (substring match)'),
    page: z.number().optional().describe('Page number for pagination (starts at 1)'),
    per_page: z.number().optional().describe('Number of sites per page (default 20)'),
  }),
  output: z.object({
    items: z.array(siteSchema).describe('List of sites'),
  }),
  handle: async params => {
    const raw = await api<RawSite[]>(`/${params.account_slug}/sites`, {
      query: {
        page: params.page,
        per_page: params.per_page,
        name: params.name,
      },
    });
    return { items: raw.map(mapSite) };
  },
});
