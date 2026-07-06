import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { cloudflareApi } from '../cloudflare-api.js';

export const listEmailRoutingRules = defineTool({
  name: 'list_email_routing_rules',
  displayName: 'List Email Routing Rules',
  description:
    'List email routing rules for a zone. Email routing rules define how incoming emails are forwarded to destination addresses.',
  summary: 'List email routing rules',
  icon: 'mail',
  group: 'Email',
  input: z.object({
    zone_id: z.string().describe('Zone ID (32-char hex string)'),
  }),
  output: z.object({
    rules: z
      .array(
        z.object({
          id: z.string().describe('Rule ID'),
          name: z.string().describe('Rule name'),
          enabled: z.boolean().describe('Whether the rule is enabled'),
          priority: z.number().describe('Rule priority'),
          matchers: z.array(z.unknown()).describe('Matching conditions'),
          actions: z.array(z.unknown()).describe('Actions to perform (forward, drop, etc.)'),
        }),
      )
      .describe('List of email routing rules'),
  }),
  handle: async params => {
    const data = await cloudflareApi<Record<string, unknown>[]>(
      `/zones/${encodeURIComponent(params.zone_id)}/email/routing/rules`,
    );
    const rules = Array.isArray(data.result) ? (data.result as Record<string, unknown>[]) : [];
    return {
      rules: rules.map(r => ({
        id: (r.tag as string) ?? '',
        name: (r.name as string) ?? '',
        enabled: (r.enabled as boolean) ?? false,
        priority: (r.priority as number) ?? 0,
        matchers: Array.isArray(r.matchers) ? (r.matchers as unknown[]) : [],
        actions: Array.isArray(r.actions) ? (r.actions as unknown[]) : [],
      })),
    };
  },
});
