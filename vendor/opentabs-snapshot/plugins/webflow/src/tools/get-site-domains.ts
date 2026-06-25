import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../webflow-api.js';
import { domainSchema, mapDomain } from './schemas.js';
import type { RawDomain } from './schemas.js';

const subdomainSchema = z.object({
  id: z.string().describe('Subdomain record ID'),
  name: z.string().describe('Full subdomain (e.g., my-site.webflow.io)'),
  stage: z.string().describe('Domain stage (staging or production)'),
  has_valid_ssl: z.boolean().describe('Whether the subdomain has valid SSL'),
});

interface SubdomainRaw {
  _id?: string;
  name?: string;
  stage?: string;
  hasValidSSL?: boolean;
}

interface DomainsResponse {
  domains?: RawDomain[];
  subdomain?: SubdomainRaw;
}

export const getSiteDomains = defineTool({
  name: 'get_site_domains',
  displayName: 'Get Site Domains',
  description:
    'Get all domains and the default subdomain for a Webflow site. Returns custom domains with SSL status and the webflow.io staging subdomain.',
  summary: 'Get site domains and subdomain',
  icon: 'link',
  group: 'Sites',
  input: z.object({
    site_short_name: z.string().describe('Site short name / URL slug'),
  }),
  output: z.object({
    domains: z.array(domainSchema),
    subdomain: subdomainSchema,
  }),
  handle: async params => {
    const data = await api<DomainsResponse>(`/sites/${params.site_short_name}/domains`);
    const sub = data.subdomain ?? {};
    return {
      domains: (data.domains ?? []).map(mapDomain),
      subdomain: {
        id: sub._id ?? '',
        name: sub.name ?? '',
        stage: sub.stage ?? '',
        has_valid_ssl: sub.hasValidSSL ?? false,
      },
    };
  },
});
