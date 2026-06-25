import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../docker-hub-api.js';
import { mapTag, tagSchema } from './schemas.js';
import type { RawTag } from './schemas.js';

export const getTag = defineTool({
  name: 'get_tag',
  displayName: 'Get Tag',
  description:
    'Get detailed information about a specific tag in a Docker Hub repository, including its digest, size, and platform-specific images.',
  summary: 'Get tag details including digest and platforms',
  icon: 'tag',
  group: 'Tags',
  input: z.object({
    namespace: z.string().describe('Namespace (e.g., "library" for official images)'),
    repository: z.string().describe('Repository name (e.g., "nginx")'),
    tag: z.string().describe('Tag name (e.g., "latest", "alpine")'),
  }),
  output: z.object({ tag: tagSchema }),
  handle: async params => {
    const data = await api<RawTag>(
      `/v2/namespaces/${params.namespace}/repositories/${params.repository}/tags/${params.tag}`,
    );
    return { tag: mapTag(data) };
  },
});
