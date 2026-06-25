import { z } from 'zod';
import { defineTool, stripUndefined } from '@opentabs-dev/plugin-sdk';
import { api } from '../terraform-cloud-api.js';
import type { JsonApiResponse } from '../terraform-cloud-api.js';
import { workspaceSchema, mapWorkspace } from './schemas.js';
import type { RawWorkspace } from './schemas.js';

export const createWorkspace = defineTool({
  name: 'create_workspace',
  displayName: 'Create Workspace',
  description:
    'Create a new workspace in an organization. Optionally specify project, execution mode, Terraform version, and other settings.',
  summary: 'Create a new workspace',
  icon: 'plus',
  group: 'Workspaces',
  input: z.object({
    organization: z.string().describe('Organization name'),
    name: z.string().describe('Workspace name'),
    description: z.string().optional().describe('Workspace description'),
    project_id: z.string().optional().describe('Project ID to assign workspace to'),
    execution_mode: z.string().optional().describe('Execution mode: "remote", "local", or "agent" (default "remote")'),
    terraform_version: z.string().optional().describe('Terraform version constraint'),
    auto_apply: z.boolean().optional().describe('Whether to auto-apply after successful plan'),
    working_directory: z.string().optional().describe('Working directory for Terraform runs'),
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

    const relationships = params.project_id
      ? {
          project: {
            data: { id: params.project_id, type: 'projects' },
          },
        }
      : undefined;

    const body = stripUndefined({
      data: {
        type: 'workspaces',
        attributes,
        relationships,
      },
    });

    const data = await api<JsonApiResponse<RawWorkspace>>(
      `/organizations/${encodeURIComponent(params.organization)}/workspaces`,
      { method: 'POST', body },
    );

    return {
      workspace: mapWorkspace(data.data.id, data.data.attributes),
    };
  },
});
