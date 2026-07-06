import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, resolveNamespace } from '../temporal-api.js';
import { namespaceParam } from './schemas.js';

export const getSettings = defineTool({
  name: 'get_settings',
  displayName: 'Get Settings',
  description:
    'Get the Temporal UI settings for a namespace. Shows which actions are enabled/disabled (terminate, cancel, signal, reset, etc.), the server version, and codec configuration.',
  summary: 'Get namespace UI settings and capabilities',
  icon: 'settings',
  group: 'Infrastructure',
  input: z.object({
    namespace: namespaceParam,
  }),
  output: z.object({
    version: z.string().describe('Temporal server version'),
    disable_write_actions: z.boolean().describe('Whether all write actions are disabled'),
    workflow_terminate_disabled: z.boolean().describe('Whether workflow terminate is disabled'),
    workflow_cancel_disabled: z.boolean().describe('Whether workflow cancel is disabled'),
    workflow_signal_disabled: z.boolean().describe('Whether workflow signal is disabled'),
    workflow_reset_disabled: z.boolean().describe('Whether workflow reset is disabled'),
    workflow_pause_disabled: z.boolean().describe('Whether workflow pause is disabled'),
    start_workflow_disabled: z.boolean().describe('Whether starting workflows is disabled'),
    batch_actions_disabled: z.boolean().describe('Whether batch actions are disabled'),
  }),
  handle: async params => {
    const ns = resolveNamespace(params.namespace);
    const data = await api<{
      Version?: string;
      DisableWriteActions?: boolean;
      WorkflowTerminateDisabled?: boolean;
      WorkflowCancelDisabled?: boolean;
      WorkflowSignalDisabled?: boolean;
      WorkflowResetDisabled?: boolean;
      WorkflowPauseDisabled?: boolean;
      StartWorkflowDisabled?: boolean;
      BatchActionsDisabled?: boolean;
    }>(ns, '/settings');

    return {
      version: data.Version ?? '',
      disable_write_actions: data.DisableWriteActions ?? false,
      workflow_terminate_disabled: data.WorkflowTerminateDisabled ?? false,
      workflow_cancel_disabled: data.WorkflowCancelDisabled ?? false,
      workflow_signal_disabled: data.WorkflowSignalDisabled ?? false,
      workflow_reset_disabled: data.WorkflowResetDisabled ?? false,
      workflow_pause_disabled: data.WorkflowPauseDisabled ?? false,
      start_workflow_disabled: data.StartWorkflowDisabled ?? false,
      batch_actions_disabled: data.BatchActionsDisabled ?? false,
    };
  },
});
