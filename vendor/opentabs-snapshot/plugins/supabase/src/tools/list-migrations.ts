import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../supabase-api.js';
import { mapMigration, migrationSchema } from './schemas.js';

export const listMigrations = defineTool({
  name: 'list_migrations',
  displayName: 'List Migrations',
  description: 'List all applied database migrations for a Supabase project.',
  summary: 'List applied database migrations',
  icon: 'git-branch',
  group: 'Database',
  input: z.object({
    ref: z.string().min(1).describe('Project reference ID'),
  }),
  output: z.object({
    migrations: z.array(migrationSchema).describe('List of migrations'),
  }),
  handle: async params => {
    const data = await api<Record<string, unknown>[]>(`/projects/${params.ref}/database/migrations`);
    return { migrations: Array.isArray(data) ? data.map(mapMigration) : [] };
  },
});
