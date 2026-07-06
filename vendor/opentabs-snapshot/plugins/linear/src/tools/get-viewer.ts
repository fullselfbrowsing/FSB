import { graphql } from '../linear-api.js';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { mapUser, userSchema } from './schemas.js';

export const getViewer = defineTool({
  name: 'get_viewer',
  displayName: 'Get Viewer',
  description: "Get the authenticated user's profile information.",
  summary: "Get the current user's profile",
  icon: 'user',
  group: 'Teams & Users',
  input: z.object({}),
  output: z.object({
    user: userSchema.describe('The authenticated user'),
    organization_name: z.string().describe('Name of the organization'),
    organization_url_key: z.string().describe('URL key of the organization (used in linear.app URLs)'),
  }),
  handle: async () => {
    const data = await graphql<{
      viewer: Record<string, unknown> & {
        organization: { name?: string; urlKey?: string };
      };
    }>(
      `query GetViewer {
        viewer {
          id name email displayName active admin
          organization { name urlKey }
        }
      }`,
    );

    return {
      user: mapUser(data.viewer as Parameters<typeof mapUser>[0]),
      organization_name: data.viewer.organization?.name ?? '',
      organization_url_key: data.viewer.organization?.urlKey ?? '',
    };
  },
});
