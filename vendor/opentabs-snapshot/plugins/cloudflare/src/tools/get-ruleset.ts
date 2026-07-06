import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { cloudflareApi } from '../cloudflare-api.js';

export const getRuleset = defineTool({
  name: 'get_ruleset',
  displayName: 'Get Ruleset',
  description:
    'Get a specific ruleset with all its rules. Returns the full rule definitions including expressions, actions, and configuration. Use list_rulesets first to discover ruleset IDs.',
  summary: 'Get ruleset with rules',
  icon: 'shield',
  group: 'Security',
  input: z.object({
    zone_id: z.string().describe('Zone ID (32-char hex string)'),
    ruleset_id: z.string().describe('Ruleset ID'),
  }),
  output: z.object({
    id: z.string().describe('Ruleset ID'),
    name: z.string().describe('Ruleset name'),
    phase: z.string().describe('Execution phase'),
    rules: z
      .array(
        z.object({
          id: z.string().describe('Rule ID'),
          expression: z.string().describe('Wirefilter expression'),
          action: z.string().describe('Action to take (block, challenge, skip, execute, etc.)'),
          description: z.string().describe('Rule description'),
          enabled: z.boolean().describe('Whether the rule is enabled'),
        }),
      )
      .describe('Rules in this ruleset'),
  }),
  handle: async params => {
    const data = await cloudflareApi<Record<string, unknown>>(
      `/zones/${encodeURIComponent(params.zone_id)}/rulesets/${encodeURIComponent(params.ruleset_id)}`,
    );
    const r = data.result as Record<string, unknown>;
    const rules = Array.isArray(r.rules) ? (r.rules as Record<string, unknown>[]) : [];
    return {
      id: (r.id as string) ?? '',
      name: (r.name as string) ?? '',
      phase: (r.phase as string) ?? '',
      rules: rules.map(rule => ({
        id: (rule.id as string) ?? '',
        expression: (rule.expression as string) ?? '',
        action: (rule.action as string) ?? '',
        description: (rule.description as string) ?? '',
        enabled: (rule.enabled as boolean) ?? true,
      })),
    };
  },
});
