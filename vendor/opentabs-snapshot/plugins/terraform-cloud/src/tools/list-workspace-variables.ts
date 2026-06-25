import { z } from 'zod';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { api } from '../terraform-cloud-api.js';
import type { JsonApiListResponse } from '../terraform-cloud-api.js';
import { variableSchema, mapVariable } from './schemas.js';
import type { RawVariable } from './schemas.js';

export const listWorkspaceVariables = defineTool({
  name: 'list_workspace_variables',
  displayName: 'List Workspace Variables',
  description: 'List all variables for a workspace including Terraform and environment variables.',
  summary: 'List variables for a workspace',
  icon: 'variable',
  group: 'Variables',
  input: z.object({
    workspace_id: z.string().describe('Workspace ID (e.g., "ws-...")'),
  }),
  output: z.object({
    variables: z.array(variableSchema).describe('List of workspace variables'),
  }),
  handle: async params => {
    const data = await api<JsonApiListResponse<RawVariable>>(
      `/workspaces/${encodeURIComponent(params.workspace_id)}/vars`,
    );

    return {
      variables: (data.data ?? []).map(r => mapVariable(r.id, r.attributes)),
    };
  },
});
