import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { cloudflareApi, getAccountId } from '../cloudflare-api.js';

export const listD1Databases = defineTool({
  name: 'list_d1_databases',
  displayName: 'List D1 Databases',
  description: "List D1 SQL databases in the account. D1 is Cloudflare's serverless SQL database.",
  summary: 'List D1 databases',
  icon: 'database',
  group: 'Storage',
  input: z.object({}),
  output: z.object({
    databases: z
      .array(
        z.object({
          uuid: z.string().describe('Database UUID'),
          name: z.string().describe('Database name'),
          version: z.string().describe('Database version'),
          num_tables: z.number().describe('Number of tables'),
          file_size: z.number().describe('Database file size in bytes'),
          created_at: z.string().describe('ISO 8601 creation timestamp'),
        }),
      )
      .describe('List of D1 databases'),
  }),
  handle: async () => {
    const accountId = getAccountId();
    if (!accountId) {
      throw ToolError.validation('Could not determine account ID. Navigate to an account page first.');
    }
    const data = await cloudflareApi<Record<string, unknown>[]>(
      `/accounts/${encodeURIComponent(accountId)}/d1/database`,
    );
    const dbs = Array.isArray(data.result) ? (data.result as Record<string, unknown>[]) : [];
    return {
      databases: dbs.map(d => ({
        uuid: (d.uuid as string) ?? '',
        name: (d.name as string) ?? '',
        version: (d.version as string) ?? '',
        num_tables: (d.num_tables as number) ?? 0,
        file_size: (d.file_size as number) ?? 0,
        created_at: (d.created_at as string) ?? '',
      })),
    };
  },
});
