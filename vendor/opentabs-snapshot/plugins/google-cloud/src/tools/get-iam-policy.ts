import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gcpApi, resolveProjectId } from '../gcloud-api.js';
import { bindingSchema, mapBinding } from './schemas.js';
import type { RawBinding } from './schemas.js';

export const getIamPolicy = defineTool({
  name: 'get_iam_policy',
  displayName: 'Get IAM Policy',
  description: 'Get the IAM access control policy for the project. Returns all role bindings (who has which role).',
  summary: 'Get the project IAM policy',
  icon: 'shield-check',
  group: 'IAM',
  input: z.object({
    project_id: z.string().optional().describe('Project ID (defaults to currently active project)'),
  }),
  output: z.object({
    bindings: z.array(bindingSchema).describe('List of role-to-members bindings'),
  }),
  handle: async params => {
    const projectId = resolveProjectId(params.project_id);
    const data = await gcpApi<{ bindings?: RawBinding[] }>(
      `https://cloudresourcemanager.googleapis.com/v3/projects/${projectId}:getIamPolicy`,
      { method: 'POST', body: {} },
    );
    return { bindings: (data.bindings ?? []).map(mapBinding) };
  },
});
