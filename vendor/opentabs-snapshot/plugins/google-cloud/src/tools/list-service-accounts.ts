import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gcpApi, resolveProjectId } from '../gcloud-api.js';
import { serviceAccountSchema, mapServiceAccount } from './schemas.js';
import type { RawServiceAccount } from './schemas.js';

export const listServiceAccounts = defineTool({
  name: 'list_service_accounts',
  displayName: 'List Service Accounts',
  description: 'List IAM service accounts in the project.',
  summary: 'List IAM service accounts',
  icon: 'bot',
  group: 'IAM',
  input: z.object({
    project_id: z.string().optional().describe('Project ID (defaults to currently active project)'),
    page_size: z.number().int().min(1).max(100).optional().describe('Max results per page (default 50)'),
    page_token: z.string().optional().describe('Page token from a previous response'),
  }),
  output: z.object({
    service_accounts: z.array(serviceAccountSchema).describe('List of service accounts'),
    next_page_token: z.string().describe('Token for next page, empty if no more results'),
  }),
  handle: async params => {
    const projectId = resolveProjectId(params.project_id);
    const data = await gcpApi<{ accounts?: RawServiceAccount[]; nextPageToken?: string }>(
      `https://iam.googleapis.com/v1/projects/${projectId}/serviceAccounts`,
      { params: { pageSize: params.page_size ?? 50, pageToken: params.page_token } },
    );
    return {
      service_accounts: (data.accounts ?? []).map(mapServiceAccount),
      next_page_token: data.nextPageToken ?? '',
    };
  },
});
