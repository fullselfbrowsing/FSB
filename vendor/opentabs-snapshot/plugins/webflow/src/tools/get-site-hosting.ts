import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../webflow-api.js';
import { pageSchema, mapPage } from './schemas.js';
import type { RawPage } from './schemas.js';

const redirectSchema = z.object({
  from: z.string().describe('Source path'),
  to: z.string().describe('Destination URL or path'),
  status_code: z.number().int().describe('HTTP redirect status code (301 or 302)'),
});

interface RawRedirect {
  from?: string;
  to?: string;
  statusCode?: number;
}

interface HostingResponse {
  pages?: RawPage[];
  redirects?: RawRedirect[];
}

export const getSiteHosting = defineTool({
  name: 'get_site_hosting',
  displayName: 'Get Site Hosting',
  description:
    'Get hosting information for a Webflow site including pages and redirects. Returns the list of pages and any configured URL redirects.',
  summary: 'Get site hosting details',
  icon: 'server',
  group: 'Sites',
  input: z.object({
    site_short_name: z.string().describe('Site short name / URL slug'),
  }),
  output: z.object({
    pages: z.array(pageSchema),
    redirects: z.array(redirectSchema),
  }),
  handle: async params => {
    const data = await api<HostingResponse>(`/sites/${params.site_short_name}/hosting`);
    return {
      pages: (data.pages ?? []).map(mapPage),
      redirects: (data.redirects ?? []).map(r => ({
        from: r.from ?? '',
        to: r.to ?? '',
        status_code: r.statusCode ?? 301,
      })),
    };
  },
});
