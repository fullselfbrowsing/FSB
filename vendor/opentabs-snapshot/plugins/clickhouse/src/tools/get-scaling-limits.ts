import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../clickhouse-api.js';

const scalingLimitsSchema = z.object({
  min_replica_memory_gb: z.number().describe('Minimum memory per replica in GB'),
  max_replica_memory_gb: z.number().describe('Maximum memory per replica in GB'),
  min_total_memory_gb: z.number().describe('Minimum total memory across all replicas in GB'),
  max_total_memory_gb: z.number().describe('Maximum total memory across all replicas in GB'),
});

interface RawScalingLimits {
  minReplicaMemoryGb?: number;
  maxReplicaMemoryGb?: number;
  minMemoryGb?: number;
  maxMemoryGb?: number;
}

export const getScalingLimits = defineTool({
  name: 'get_scaling_limits',
  displayName: 'Get Scaling Limits',
  description:
    'Get the minimum and maximum memory and replica scaling limits for a cloud region. Useful for understanding what scaling options are available before adjusting service resources.',
  summary: 'Get region scaling limits',
  icon: 'ruler',
  group: 'Services',
  input: z.object({
    region: z.string().describe('Cloud region ID (e.g., "gcp-us-east1", "aws-us-east-1")'),
  }),
  output: z.object({
    limits: scalingLimitsSchema,
  }),
  handle: async params => {
    const data = await api<RawScalingLimits>('/api/autoScaling', {
      body: {
        rpcAction: 'getLimits',
        regionId: params.region,
      },
    });

    return {
      limits: {
        min_replica_memory_gb: data.minReplicaMemoryGb ?? 0,
        max_replica_memory_gb: data.maxReplicaMemoryGb ?? 0,
        min_total_memory_gb: data.minMemoryGb ?? 0,
        max_total_memory_gb: data.maxMemoryGb ?? 0,
      },
    };
  },
});
