import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gcpApi, resolveProjectId } from '../gcloud-api.js';
import { sqlInstanceSchema, mapSqlInstance } from './schemas.js';
import type { RawSqlInstance } from './schemas.js';

export const getSqlInstance = defineTool({
  name: 'get_sql_instance',
  displayName: 'Get Cloud SQL Instance',
  description: 'Get detailed information about a specific Cloud SQL database instance.',
  summary: 'Get a Cloud SQL instance',
  icon: 'database',
  group: 'Cloud SQL',
  input: z.object({
    instance_name: z.string().describe('Cloud SQL instance name'),
    project_id: z.string().optional().describe('Project ID (defaults to currently active project)'),
  }),
  output: z.object({ instance: sqlInstanceSchema }),
  handle: async params => {
    const projectId = resolveProjectId(params.project_id);
    const data = await gcpApi<RawSqlInstance>(
      `https://sqladmin.googleapis.com/v1/projects/${projectId}/instances/${params.instance_name}`,
    );
    return { instance: mapSqlInstance(data) };
  },
});
