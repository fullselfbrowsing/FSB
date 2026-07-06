import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { awsApi } from '../aws-api.js';

export const startInstance = defineTool({
  name: 'start_instance',
  displayName: 'Start EC2 Instance',
  description:
    'Start a stopped EC2 instance. The instance must be in the "stopped" state. Returns the previous and current state of the instance.',
  summary: 'Start a stopped EC2 instance',
  icon: 'play',
  group: 'EC2',
  input: z.object({
    instance_id: z.string().min(1).describe('EC2 instance ID to start (e.g., i-1234567890abcdef0)'),
  }),
  output: z.object({
    instance_id: z.string().describe('Instance ID'),
    previous_state: z.string().describe('Previous instance state'),
    current_state: z.string().describe('Current instance state after start'),
  }),
  handle: async params => {
    const data = await awsApi(
      'ec2',
      'StartInstances',
      { 'InstanceId.1': params.instance_id },
      { version: '2016-11-15' },
    );
    const stateChange = ((data as Record<string, unknown>).instancesSet as Record<string, unknown>)?.item as
      | Record<string, unknown>
      | undefined;
    if (!stateChange) throw ToolError.internal('Unexpected response from StartInstances');

    return {
      instance_id: String(stateChange.instanceId ?? params.instance_id),
      previous_state: String((stateChange.previousState as Record<string, unknown>)?.name ?? 'unknown'),
      current_state: String((stateChange.currentState as Record<string, unknown>)?.name ?? 'pending'),
    };
  },
});
