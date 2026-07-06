import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { cloudflareApi } from '../cloudflare-api.js';

export const listRulesets = defineTool({
  name: 'list_rulesets',
  displayName: 'List Rulesets',
  description:
    'List all rulesets for a zone. Rulesets contain WAF, rate limiting, redirect, and transform rules organized by phase (e.g., http_request_firewall_managed, ddos_l7, http_request_sanitize).',
  summary: 'List zone rulesets',
  icon: 'shield',
  group: 'Security',
  input: z.object({
    zone_id: z.string().describe('Zone ID (32-char hex string)'),
  }),
  output: z.object({
    rulesets: z
      .array(
        z.object({
          id: z.string().describe('Ruleset ID'),
          name: z.string().describe('Ruleset name'),
          description: z.string().describe('Ruleset description'),
          kind: z.string().describe('Ruleset kind: "managed", "custom", "root", "zone"'),
          phase: z.string().describe('Execution phase (e.g., "http_request_firewall_managed", "ddos_l7")'),
          version: z.string().describe('Current ruleset version'),
          last_updated: z.string().describe('ISO 8601 last updated timestamp'),
        }),
      )
      .describe('List of rulesets'),
  }),
  handle: async params => {
    const data = await cloudflareApi<Record<string, unknown>[]>(
      `/zones/${encodeURIComponent(params.zone_id)}/rulesets`,
    );
    const rulesets = Array.isArray(data.result) ? (data.result as Record<string, unknown>[]) : [];
    return {
      rulesets: rulesets.map(r => ({
        id: (r.id as string) ?? '',
        name: (r.name as string) ?? '',
        description: (r.description as string) ?? '',
        kind: (r.kind as string) ?? '',
        phase: (r.phase as string) ?? '',
        version: (r.version as string) ?? '',
        last_updated: (r.last_updated as string) ?? '',
      })),
    };
  },
});
