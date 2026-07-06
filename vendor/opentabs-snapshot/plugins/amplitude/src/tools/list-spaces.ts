import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../amplitude-api.js';
import { type RawSpace, mapSpace, spaceSchema } from './schemas.js';

const TEAM_QUERY = `query TeamSpaces($fetchItemCountInSpaces: Boolean!) {
  teamSpaces {
    itemCount @include(if: $fetchItemCountInSpaces)
    id spaceId orgId type name description richDescription
    isArchived isDeleted itemCount createdBy createdAt
    lastViewedDate lastModifiedAt lastViewedAt slackConnected
    permissionLevel pinnedItems { contentType contentId pinnedBy pinnedAt }
    public
  }
}`;

export const listSpaces = defineTool({
  name: 'list_spaces',
  displayName: 'List Spaces',
  description:
    'List all team spaces in the organization. Spaces are the top-level containers for organizing charts, dashboards, cohorts, and notebooks.',
  summary: 'List all team spaces',
  icon: 'layout-grid',
  group: 'Spaces',
  input: z.object({}),
  output: z.object({
    spaces: z.array(spaceSchema).describe('List of team spaces'),
  }),
  handle: async () => {
    const data = await gql<{ teamSpaces: RawSpace[] }>('TeamSpaces', TEAM_QUERY, { fetchItemCountInSpaces: true });
    return { spaces: (data.teamSpaces ?? []).map(mapSpace) };
  },
});
