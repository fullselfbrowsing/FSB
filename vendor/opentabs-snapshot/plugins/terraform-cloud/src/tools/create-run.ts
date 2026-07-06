import { defineTool, stripUndefined } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../terraform-cloud-api.js';
import type { JsonApiResponse } from '../terraform-cloud-api.js';
import type { RawRun } from './schemas.js';
import { mapRun, runSchema } from './schemas.js';

export const createRun = defineTool({
  name: 'create_run',
  displayName: 'Create Run',
  description: 'Queue a new plan/apply run for a workspace. Optionally set as destroy, plan-only, or refresh-only.',
  summary: 'Queue a new run',
  icon: 'play-circle',
  group: 'Runs',
  input: z.object({
    workspace_id: z.string().describe('Workspace ID (e.g., "ws-...")'),
    message: z.string().optional().describe('Run message describing the reason'),
    is_destroy: z.boolean().optional().describe('Whether this is a destroy run'),
    plan_only: z.boolean().optional().describe('Whether to only plan without applying'),
    refresh_only: z.boolean().optional().describe('Whether to only refresh state'),
    auto_apply: z.boolean().optional().describe('Override auto-apply setting'),
  }),
  output: z.object({
    run: runSchema.describe('Created run'),
  }),
  handle: async params => {
    const attributes = stripUndefined({
      message: params.message,
      'is-destroy': params.is_destroy,
      'plan-only': params.plan_only,
      'refresh-only': params.refresh_only,
      'auto-apply': params.auto_apply,
    });

    const res = await api<JsonApiResponse<RawRun>>('/runs', {
      method: 'POST',
      body: {
        data: {
          type: 'runs',
          attributes,
          relationships: {
            workspace: {
              data: {
                id: params.workspace_id,
                type: 'workspaces',
              },
            },
          },
        },
      },
    });
    return {
      run: mapRun(res.data.id, res.data.attributes),
    };
  },
});
