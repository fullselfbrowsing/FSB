import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { cloudflareApi, getAccountId } from '../cloudflare-api.js';

export const listKvNamespaces = defineTool({
  name: 'list_kv_namespaces',
  displayName: 'List KV Namespaces',
  description: 'List all Workers KV namespaces in the account. Returns namespace IDs and titles.',
  summary: 'List KV namespaces',
  icon: 'database',
  group: 'Storage',
  input: z.object({
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
    per_page: z.number().int().min(5).max(100).optional().describe('Results per page (default 20, max 100)'),
  }),
  output: z.object({
    namespaces: z
      .array(
        z.object({
          id: z.string().describe('Namespace ID'),
          title: z.string().describe('Namespace title'),
          supports_url_encoding: z.boolean().describe('Whether the namespace supports URL encoding'),
        }),
      )
      .describe('List of KV namespaces'),
  }),
  handle: async params => {
    const accountId = getAccountId();
    if (!accountId) {
      throw ToolError.validation(
        'Could not determine account ID from the current URL. Navigate to an account page first.',
      );
    }
    const data = await cloudflareApi<Record<string, unknown>[]>(
      `/accounts/${encodeURIComponent(accountId)}/storage/kv/namespaces`,
      {
        query: {
          page: params.page ?? 1,
          per_page: params.per_page ?? 20,
        },
      },
    );
    const namespaces = Array.isArray(data.result) ? (data.result as Record<string, unknown>[]) : [];
    return {
      namespaces: namespaces.map(ns => ({
        id: (ns.id as string) ?? '',
        title: (ns.title as string) ?? '',
        supports_url_encoding: (ns.supports_url_encoding as boolean) ?? false,
      })),
    };
  },
});
