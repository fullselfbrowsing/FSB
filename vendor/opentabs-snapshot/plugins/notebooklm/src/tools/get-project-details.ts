import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { rpc, FEATURE_FLAGS } from '../notebooklm-api.js';
import { accountUserSchema } from './schemas.js';

export const getProjectDetails = defineTool({
  name: 'get_project_details',
  displayName: 'Get Project Details',
  description: 'Get sharing details and collaborators for a notebook, including the owner and permission level.',
  summary: 'Get notebook sharing details',
  icon: 'users',
  group: 'Notebooks',
  input: z.object({
    notebook_id: z.string().describe('Notebook UUID'),
  }),
  output: z.object({
    collaborators: z.array(accountUserSchema).describe('List of collaborators'),
    max_sources: z.number().int().describe('Maximum number of sources allowed'),
    is_public: z.boolean().describe('Whether the notebook is publicly shared'),
  }),
  handle: async params => {
    const data = await rpc<unknown[]>(
      'JFMDGd',
      [params.notebook_id, [...FEATURE_FLAGS]],
      `/notebook/${params.notebook_id}`,
    );
    const collabList = (data?.[0] as unknown[][] | undefined) ?? [];
    const maxSources = (data?.[2] as number) ?? 0;
    const isPublic = (data?.[3] as boolean) ?? false;
    return {
      collaborators: collabList.map(c => ({
        email: (c[0] as string) ?? '',
        name: (((c[3] as unknown[]) ?? [])[0] as string) ?? '',
        avatar_url: (((c[3] as unknown[]) ?? [])[1] as string) ?? '',
      })),
      max_sources: maxSources,
      is_public: isPublic,
    };
  },
});
