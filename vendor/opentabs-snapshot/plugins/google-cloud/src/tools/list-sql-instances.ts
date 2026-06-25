import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gcpApi, resolveProjectId } from '../gcloud-api.js';
import { sqlInstanceSchema, mapSqlInstance } from './schemas.js';
import type { RawSqlInstance } from './schemas.js';

export const listSqlInstances = defineTool({
  name: 'list_sql_instances',
  displayName: 'List Cloud SQL Instances',
  description: 'List Cloud SQL database instances in the project.',
  summary: 'List Cloud SQL instances',
  icon: 'database',
  group: 'Cloud SQL',
  input: z.object({
    project_id: z.string().optional().describe('Project ID (defaults to currently active project)'),
    max_results: z.number().int().min(1).max(500).optional().describe('Max results (default 50)'),
    page_token: z.string().optional().describe('Page token from a previous response'),
  }),
  output: z.object({
    instances: z.array(sqlInstanceSchema).describe('List of Cloud SQL instances'),
    next_page_token: z.string().describe('Token for next page, empty if no more results'),
  }),
  handle: async params => {
    const projectId = resolveProjectId(params.project_id);
    const data = await gcpApi<{ items?: RawSqlInstance[]; nextPageToken?: string }>(
      `https://sqladmin.googleapis.com/v1/projects/${projectId}/instances`,
      { params: { maxResults: params.max_results ?? 50, pageToken: params.page_token } },
    );
    return {
      instances: (data.items ?? []).map(mapSqlInstance),
      next_page_token: data.nextPageToken ?? '',
    };
  },
});
