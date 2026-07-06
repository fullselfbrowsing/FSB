import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { cloudflareApi } from '../cloudflare-api.js';

export const listSslCertificates = defineTool({
  name: 'list_ssl_certificates',
  displayName: 'List SSL Certificates',
  description:
    'List SSL/TLS certificate packs for a zone. Returns certificate type (universal, advanced, custom), status, hostnames covered, and validity dates.',
  summary: 'List SSL certificate packs',
  icon: 'lock',
  group: 'SSL',
  input: z.object({
    zone_id: z.string().describe('Zone ID (32-char hex string)'),
  }),
  output: z.object({
    certificates: z
      .array(
        z.object({
          id: z.string().describe('Certificate pack ID'),
          type: z.string().describe('Certificate type: "universal", "advanced", "custom_certificate"'),
          status: z.string().describe('Status: "active", "pending_validation", "pending_issuance", etc.'),
          hosts: z.array(z.string()).describe('Hostnames covered by this certificate'),
          certificate_authority: z.string().describe('CA that issued the certificate'),
          validity_days: z.number().describe('Certificate validity in days'),
        }),
      )
      .describe('List of SSL certificate packs'),
  }),
  handle: async params => {
    const data = await cloudflareApi<Record<string, unknown>[]>(
      `/zones/${encodeURIComponent(params.zone_id)}/ssl/certificate_packs`,
    );
    const certs = Array.isArray(data.result) ? (data.result as Record<string, unknown>[]) : [];
    return {
      certificates: certs.map(c => ({
        id: (c.id as string) ?? '',
        type: (c.type as string) ?? '',
        status: (c.status as string) ?? '',
        hosts: Array.isArray(c.hosts) ? (c.hosts as string[]) : [],
        certificate_authority: (c.certificate_authority as string) ?? '',
        validity_days: (c.validity_days as number) ?? 0,
      })),
    };
  },
});
