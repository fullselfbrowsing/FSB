import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../webflow-api.js';
import { siteSchema, mapSite } from './schemas.js';
import type { RawSite } from './schemas.js';

const siteDetailSchema = siteSchema.extend({
  timezone: z.string().describe('Site timezone'),
  ssl_hosting: z.boolean().describe('Whether SSL hosting is enabled'),
  form_submissions: z.number().int().describe('Total form submissions'),
  style_count: z.number().int().describe('Number of styles'),
  asset_size: z.number().describe('Total asset size in bytes'),
});

interface RawSiteDetail extends RawSite {
  timezone?: string;
  sslHosting?: boolean;
  formSubmissions?: number;
  styleCount?: number;
  assetSize?: number;
}

interface SiteDomainsResponse {
  site?: RawSiteDetail;
}

export const getSite = defineTool({
  name: 'get_site',
  displayName: 'Get Site',
  description:
    'Get detailed information about a specific Webflow site by its short name. Returns site metadata, publish status, timezone, SSL, and asset information.',
  summary: 'Get site details',
  icon: 'globe',
  group: 'Sites',
  input: z.object({
    site_short_name: z.string().describe('Site short name / URL slug (e.g., "my-site-abc123")'),
  }),
  output: z.object({ site: siteDetailSchema }),
  handle: async params => {
    const data = await api<SiteDomainsResponse>(`/sites/${params.site_short_name}/domains`);
    const s = data.site ?? {};
    return {
      site: {
        ...mapSite(s),
        timezone: s.timezone ?? '',
        ssl_hosting: s.sslHosting ?? false,
        form_submissions: s.formSubmissions ?? 0,
        style_count: s.styleCount ?? 0,
        asset_size: s.assetSize ?? 0,
      },
    };
  },
});
