import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gcpApi, resolveProjectId } from '../gcloud-api.js';
import { cloudFunctionSchema, mapCloudFunction } from './schemas.js';
import type { RawCloudFunction } from './schemas.js';

export const getFunction = defineTool({
  name: 'get_function',
  displayName: 'Get Function',
  description: 'Get detailed information about a specific Cloud Function.',
  summary: 'Get a Cloud Function',
  icon: 'zap',
  group: 'Cloud Functions',
  input: z.object({
    location: z.string().describe('Location (e.g., "us-central1")'),
    function_name: z.string().describe('Function name'),
    project_id: z.string().optional().describe('Project ID (defaults to currently active project)'),
  }),
  output: z.object({ function: cloudFunctionSchema }),
  handle: async params => {
    const projectId = resolveProjectId(params.project_id);
    const data = await gcpApi<RawCloudFunction>(
      `https://cloudfunctions.googleapis.com/v2/projects/${projectId}/locations/${params.location}/functions/${params.function_name}`,
    );
    return { function: mapCloudFunction(data) };
  },
});
