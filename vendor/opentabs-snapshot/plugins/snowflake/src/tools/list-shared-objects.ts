import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { runQuery } from '../snowflake-api.js';

const shareSchema = z.object({
  name: z.string().describe('Share name'),
  kind: z.string().describe('Share kind (INBOUND or OUTBOUND)'),
  databaseName: z.string().describe('Database name associated with the share'),
  ownerAccount: z.string().describe('Owner account for the share'),
  created_on: z.string().describe('Creation timestamp'),
  comment: z.string().describe('Share comment'),
});

export const listSharedObjects = defineTool({
  name: 'list_shared_objects',
  displayName: 'List Shared Objects',
  description:
    'List data shares in the Snowflake account. Shows both inbound (shared with you) and outbound (shared by you) data shares.',
  summary: 'List data shares',
  icon: 'share-2',
  group: 'Schema',
  input: z.object({}),
  output: z.object({
    shares: z.array(shareSchema).describe('List of data shares'),
  }),
  handle: async () => {
    const result = await runQuery('SHOW SHARES');

    const shares = result.rows.map(row => ({
      name: row[1] ?? '',
      kind: row[2] ?? '',
      databaseName: row[4] ?? '',
      ownerAccount: row[3] ?? '',
      created_on: row[0] ?? '',
      comment: row[6] ?? '',
    }));

    return { shares };
  },
});
