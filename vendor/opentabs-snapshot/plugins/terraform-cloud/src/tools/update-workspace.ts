import { z } from 'zod';
import { defineTool, stripUndefined } from '@opentabs-dev/plugin-sdk';
import { api } from '../terraform-cloud-api.js';
import type { JsonApiResponse } from '../terraform-cloud-api.js';
import { workspaceSchema, mapWorkspace } from './schemas.js';
import type { RawWorkspace } from './schemas.js';

export const updateWorkspace = defineTool({
  name: 'update_workspace',
  displayName: 'Update Workspace',
  description: 'Update workspace settings. Only specified fields are changed.',
  summary: 'Update workspace settings',
  icon: 'pencil',
  group: 'Workspaces',
  input: z.object({
    workspace_id: z.string().describe('Workspace ID (e.g., "ws-...")'),
    name: z.string().optional().describe('New workspace name'),
    description: z.string().optional().describe('New description'),
    execution_mode: z.string().optional().describe('Execution mode: "remote", "local", or "agent"'),
    terraform_version: z.string().optional().describe('New Terraform version constraint'),
    auto_apply: z.boolean().optional().describe('Whether to auto-apply'),
    working_directory: z.string().optional().describe('New working directory'),
  }),
  output: z.object({
    workspace: workspaceSchema,
  }),
  handle: async params => {
    const attributes = stripUndefined({
      name: params.name,
      description: params.description,
      'execution-mode': params.execution_mode,
      'terraform-version': params.terraform_version,
      'auto-apply': params.auto_apply,
      'working-directory': params.working_directory,
    });

    const body = {
      data: {
        type: 'workspaces',
        attributes,
      },
    };

    const data = await api<JsonApiResponse<RawWorkspace>>(`/workspaces/${encodeURIComponent(params.workspace_id)}`, {
      method: 'PATCH',
      body,
    });

    return {
      workspace: mapWorkspace(data.data.id, data.data.attributes),
    };
  },
});
