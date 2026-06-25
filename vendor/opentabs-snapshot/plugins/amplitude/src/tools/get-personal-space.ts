import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../amplitude-api.js';
import { type RawSpace, mapSpace, spaceSchema } from './schemas.js';

const QUERY = `query PersonalSpace {
  personalSpace {
    id spaceId orgId type name description richDescription
    isArchived isDeleted itemCount createdBy createdAt
    lastViewedDate lastModifiedAt lastViewedAt slackConnected
    permissionLevel pinnedItems { contentType contentId pinnedBy pinnedAt }
    public users usersWithRoles { loginId spaceRole lastViewedAt }
    descendantFolders { id }
  }
}`;

export const getPersonalSpace = defineTool({
  name: 'get_personal_space',
  displayName: 'Get Personal Space',
  description: "Get the current user's personal space with its contents, permissions, and folder structure.",
  summary: "Get the user's personal workspace",
  icon: 'user-square',
  group: 'Spaces',
  input: z.object({}),
  output: z.object({ space: spaceSchema }),
  handle: async () => {
    const data = await gql<{ personalSpace: RawSpace }>('PersonalSpace', QUERY);
    return { space: mapSpace(data.personalSpace ?? {}) };
  },
});
