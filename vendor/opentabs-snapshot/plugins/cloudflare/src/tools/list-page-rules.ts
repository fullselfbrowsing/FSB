import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { cloudflareApi } from '../cloudflare-api.js';

export const listPageRules = defineTool({
  name: 'list_page_rules',
  displayName: 'List Page Rules',
  description:
    'List page rules for a zone. Page rules define URL-based behaviors like redirects, cache settings, and security level overrides.',
  summary: 'List page rules',
  icon: 'file-text',
  group: 'Rules',
  input: z.object({
    zone_id: z.string().describe('Zone ID (32-char hex string)'),
  }),
  output: z.object({
    rules: z
      .array(
        z.object({
          id: z.string().describe('Page rule ID'),
          status: z.string().describe('Rule status: "active" or "disabled"'),
          priority: z.number().describe('Rule priority (1 = highest)'),
          target: z.string().describe('URL pattern this rule matches'),
          actions: z.array(z.unknown()).describe('Actions applied when the rule matches'),
          created_on: z.string().describe('ISO 8601 creation timestamp'),
          modified_on: z.string().describe('ISO 8601 last modification timestamp'),
        }),
      )
      .describe('List of page rules'),
  }),
  handle: async params => {
    const data = await cloudflareApi<Record<string, unknown>[]>(
      `/zones/${encodeURIComponent(params.zone_id)}/pagerules`,
    );
    const rules = Array.isArray(data.result) ? (data.result as Record<string, unknown>[]) : [];
    return {
      rules: rules.map(r => {
        const targets = Array.isArray(r.targets) ? (r.targets as Record<string, unknown>[]) : [];
        const firstTarget = targets[0];
        const constraint = firstTarget?.constraint as Record<string, unknown> | undefined;
        return {
          id: (r.id as string) ?? '',
          status: (r.status as string) ?? '',
          priority: (r.priority as number) ?? 0,
          target: (constraint?.value as string) ?? '',
          actions: Array.isArray(r.actions) ? (r.actions as unknown[]) : [],
          created_on: (r.created_on as string) ?? '',
          modified_on: (r.modified_on as string) ?? '',
        };
      }),
    };
  },
});
