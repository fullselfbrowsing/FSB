import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gcpApi, resolveProjectId } from '../gcloud-api.js';
import { roleSchema, mapRole } from './schemas.js';
import type { RawRole } from './schemas.js';

export const listIamRoles = defineTool({
  name: 'list_iam_roles',
  displayName: 'List IAM Roles',
  description: 'List custom IAM roles defined in the project. Use "roles" as a prefix to list predefined roles.',
  summary: 'List custom IAM roles',
  icon: 'key',
  group: 'IAM',
  input: z.object({
    project_id: z.string().optional().describe('Project ID (defaults to currently active project)'),
    page_size: z.number().int().min(1).max(300).optional().describe('Max results per page (default 50)'),
    page_token: z.string().optional().describe('Page token from a previous response'),
  }),
  output: z.object({
    roles: z.array(roleSchema).describe('List of IAM roles'),
    next_page_token: z.string().describe('Token for next page, empty if no more results'),
  }),
  handle: async params => {
    const projectId = resolveProjectId(params.project_id);
    const data = await gcpApi<{ roles?: RawRole[]; nextPageToken?: string }>(
      `https://iam.googleapis.com/v1/projects/${projectId}/roles`,
      { params: { pageSize: params.page_size ?? 50, pageToken: params.page_token } },
    );
    return { roles: (data.roles ?? []).map(mapRole), next_page_token: data.nextPageToken ?? '' };
  },
});
