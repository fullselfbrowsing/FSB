import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { awsApi } from '../aws-api.js';

export const stopInstance = defineTool({
  name: 'stop_instance',
  displayName: 'Stop EC2 Instance',
  description:
    'Stop a running EC2 instance. The instance must be in the "running" state. Returns the previous and current state of the instance.',
  summary: 'Stop a running EC2 instance',
  icon: 'square',
  group: 'EC2',
  input: z.object({
    instance_id: z.string().min(1).describe('EC2 instance ID to stop (e.g., i-1234567890abcdef0)'),
  }),
  output: z.object({
    instance_id: z.string().describe('Instance ID'),
    previous_state: z.string().describe('Previous instance state'),
    current_state: z.string().describe('Current instance state after stop'),
  }),
  handle: async params => {
    const data = await awsApi(
      'ec2',
      'StopInstances',
      { 'InstanceId.1': params.instance_id },
      { version: '2016-11-15' },
    );
    const stateChange = ((data as Record<string, unknown>).instancesSet as Record<string, unknown>)?.item as
      | Record<string, unknown>
      | undefined;
    if (!stateChange) throw ToolError.internal('Unexpected response from StopInstances');

    return {
      instance_id: String(stateChange.instanceId ?? params.instance_id),
      previous_state: String((stateChange.previousState as Record<string, unknown>)?.name ?? 'unknown'),
      current_state: String((stateChange.currentState as Record<string, unknown>)?.name ?? 'stopping'),
    };
  },
});
