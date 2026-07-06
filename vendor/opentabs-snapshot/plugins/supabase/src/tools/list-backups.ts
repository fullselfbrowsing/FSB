import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../supabase-api.js';

const backupSchema = z.object({
  id: z.number().describe('Backup ID'),
  status: z.string().describe('Backup status'),
  inserted_at: z.string().describe('ISO 8601 timestamp when backup was created'),
  is_physical_backup: z.boolean().describe('Whether this is a physical backup'),
});

export const listBackups = defineTool({
  name: 'list_backups',
  displayName: 'List Backups',
  description: 'List all database backups for a Supabase project.',
  summary: 'List database backups',
  icon: 'database-backup',
  group: 'Database',
  input: z.object({
    ref: z.string().min(1).describe('Project reference ID'),
  }),
  output: z.object({
    backups: z.array(backupSchema).describe('List of backups'),
  }),
  handle: async params => {
    const data = await api<{ backups?: Record<string, unknown>[] }>(`/projects/${params.ref}/database/backups`);
    const backups = Array.isArray(data.backups)
      ? data.backups.map(b => ({
          id: (b.id as number) ?? 0,
          status: (b.status as string) ?? '',
          inserted_at: (b.inserted_at as string) ?? '',
          is_physical_backup: (b.is_physical_backup as boolean) ?? false,
        }))
      : [];
    return { backups };
  },
});
