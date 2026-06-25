import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, resolveNamespace } from '../temporal-api.js';
import { namespaceParam, workflowDetailSchema, mapWorkflowDetail, type RawWorkflowDetail } from './schemas.js';

export const getWorkflow = defineTool({
  name: 'get_workflow',
  displayName: 'Get Workflow',
  description:
    'Get detailed information about a specific workflow execution including configuration, status, history length, search attributes, and memo fields. Useful for debugging workflow state.',
  summary: 'Get workflow execution details',
  icon: 'file-text',
  group: 'Workflows',
  input: z.object({
    namespace: namespaceParam,
    workflow_id: z.string().describe('Workflow ID'),
    run_id: z.string().optional().describe('Run ID (optional — uses latest run if omitted)'),
  }),
  output: workflowDetailSchema,
  handle: async params => {
    const ns = resolveNamespace(params.namespace);
    const data = await api<RawWorkflowDetail>(
      ns,
      `/namespaces/${ns}/workflows/${encodeURIComponent(params.workflow_id)}`,
      { 'execution.runId': params.run_id },
    );
    return mapWorkflowDetail(data);
  },
});
