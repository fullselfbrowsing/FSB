import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { cloudflareApi } from '../cloudflare-api.js';

export const listFirewallRules = defineTool({
  name: 'list_firewall_rules',
  displayName: 'List Firewall Rules',
  description: 'List classic firewall rules for a zone. Returns rule expressions, actions, priority, and status.',
  summary: 'List classic firewall rules',
  icon: 'flame',
  group: 'Security',
  input: z.object({
    zone_id: z.string().describe('Zone ID (32-char hex string)'),
  }),
  output: z.object({
    rules: z
      .array(
        z.object({
          id: z.string().describe('Firewall rule ID'),
          description: z.string().describe('Rule description'),
          action: z.string().describe('Action (block, challenge, js_challenge, allow, log, bypass)'),
          priority: z.number().nullable().describe('Rule priority'),
          paused: z.boolean().describe('Whether the rule is paused'),
          expression: z.string().describe('Filter expression'),
        }),
      )
      .describe('List of firewall rules'),
  }),
  handle: async params => {
    const data = await cloudflareApi<Record<string, unknown>[]>(
      `/zones/${encodeURIComponent(params.zone_id)}/firewall/rules`,
    );
    const rules = Array.isArray(data.result) ? (data.result as Record<string, unknown>[]) : [];
    return {
      rules: rules.map(r => {
        const filter = r.filter as Record<string, unknown> | undefined;
        return {
          id: (r.id as string) ?? '',
          description: (r.description as string) ?? '',
          action: (r.action as string) ?? '',
          priority: (r.priority as number) ?? null,
          paused: (r.paused as boolean) ?? false,
          expression: (filter?.expression as string) ?? '',
        };
      }),
    };
  },
});
