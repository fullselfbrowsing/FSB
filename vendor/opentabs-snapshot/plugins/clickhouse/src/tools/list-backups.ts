import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getOrgId } from '../clickhouse-api.js';
import type { RawBackup } from './schemas.js';
import { backupSchema, mapBackup } from './schemas.js';

export const listBackups = defineTool({
  name: 'list_backups',
  displayName: 'List Backups',
  description: 'List available backups for a ClickHouse Cloud service.',
  summary: 'List service backups',
  icon: 'archive',
  group: 'Backups',
  input: z.object({
    service_id: z.string().describe('Service UUID'),
  }),
  output: z.object({
    backups: z.array(backupSchema),
  }),
  handle: async params => {
    const orgId = getOrgId();
    if (!orgId) throw ToolError.auth('No organization selected — please open ClickHouse Cloud console.');

    const data = await api<{ backups?: RawBackup[] }>('/api/backup', {
      body: {
        rpcAction: 'list',
        organizationId: orgId,
        instanceId: params.service_id,
      },
    });

    return { backups: (data.backups ?? []).map(mapBackup) };
  },
});
