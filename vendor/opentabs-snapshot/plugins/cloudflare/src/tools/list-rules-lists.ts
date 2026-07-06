import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { cloudflareApi, getAccountId } from '../cloudflare-api.js';

export const listRulesLists = defineTool({
  name: 'list_rules_lists',
  displayName: 'List Rules Lists',
  description:
    'List account-level IP/CIDR lists used in firewall rules, WAF custom rules, and other security features. These lists define sets of IPs, ASNs, or hostnames that can be referenced by rules.',
  summary: 'List IP/rules lists',
  icon: 'list',
  group: 'Security',
  input: z.object({}),
  output: z.object({
    lists: z
      .array(
        z.object({
          id: z.string().describe('List ID'),
          name: z.string().describe('List name'),
          description: z.string().describe('List description'),
          kind: z.string().describe('List kind: "ip", "redirect", "hostname", "asn"'),
          num_items: z.number().describe('Number of items in the list'),
          num_referencing_filters: z.number().describe('Number of firewall rules referencing this list'),
          created_on: z.string().describe('ISO 8601 creation timestamp'),
          modified_on: z.string().describe('ISO 8601 last modification timestamp'),
        }),
      )
      .describe('List of rules lists'),
  }),
  handle: async () => {
    const accountId = getAccountId();
    if (!accountId) {
      throw ToolError.validation('Could not determine account ID. Navigate to an account page first.');
    }
    const data = await cloudflareApi<Record<string, unknown>[]>(
      `/accounts/${encodeURIComponent(accountId)}/rules/lists`,
    );
    const lists = Array.isArray(data.result) ? (data.result as Record<string, unknown>[]) : [];
    return {
      lists: lists.map(l => ({
        id: (l.id as string) ?? '',
        name: (l.name as string) ?? '',
        description: (l.description as string) ?? '',
        kind: (l.kind as string) ?? '',
        num_items: (l.num_items as number) ?? 0,
        num_referencing_filters: (l.num_referencing_filters as number) ?? 0,
        created_on: (l.created_on as string) ?? '',
        modified_on: (l.modified_on as string) ?? '',
      })),
    };
  },
});
