import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { cloudflareApi, getAccountId } from '../cloudflare-api.js';

export const listVectorizeIndexes = defineTool({
  name: 'list_vectorize_indexes',
  displayName: 'List Vectorize Indexes',
  description:
    'List Vectorize vector database indexes in the account. Vectorize stores vector embeddings for semantic search and RAG applications.',
  summary: 'List Vectorize indexes',
  icon: 'search',
  group: 'AI',
  input: z.object({}),
  output: z.object({
    indexes: z
      .array(
        z.object({
          name: z.string().describe('Index name'),
          description: z.string().describe('Index description'),
          created_on: z.string().describe('ISO 8601 creation timestamp'),
          modified_on: z.string().describe('ISO 8601 last modification timestamp'),
          config: z.unknown().describe('Index configuration (dimensions, metric, etc.)'),
        }),
      )
      .describe('List of Vectorize indexes'),
  }),
  handle: async () => {
    const accountId = getAccountId();
    if (!accountId) {
      throw ToolError.validation('Could not determine account ID. Navigate to an account page first.');
    }
    const data = await cloudflareApi<Record<string, unknown>[]>(
      `/accounts/${encodeURIComponent(accountId)}/vectorize/indexes`,
    );
    const indexes = Array.isArray(data.result) ? (data.result as Record<string, unknown>[]) : [];
    return {
      indexes: indexes.map(i => ({
        name: (i.name as string) ?? '',
        description: (i.description as string) ?? '',
        created_on: (i.created_on as string) ?? '',
        modified_on: (i.modified_on as string) ?? '',
        config: i.config ?? null,
      })),
    };
  },
});
