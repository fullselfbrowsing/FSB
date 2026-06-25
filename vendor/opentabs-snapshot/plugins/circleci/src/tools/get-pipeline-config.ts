import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../circleci-api.js';

interface RawPipelineConfig {
  source?: string;
  compiled?: string;
  setup_config?: string;
  compiled_setup_config?: string;
}

export const getPipelineConfig = defineTool({
  name: 'get_pipeline_config',
  displayName: 'Get Pipeline Config',
  description: 'Get the compiled YAML configuration for a pipeline. Returns the source and compiled config.',
  summary: 'Get pipeline configuration',
  icon: 'file-code',
  group: 'Pipelines',
  input: z.object({
    pipeline_id: z.string().describe('Pipeline UUID'),
  }),
  output: z.object({
    source: z.string().describe('The source YAML config'),
    compiled: z.string().describe('The compiled config after processing'),
  }),
  handle: async ({ pipeline_id }) => {
    const data = await api<RawPipelineConfig>(`/pipeline/${pipeline_id}/config`);
    return {
      source: data.source ?? '',
      compiled: data.compiled ?? '',
    };
  },
});
