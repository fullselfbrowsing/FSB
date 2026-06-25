import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../newrelic-api.js';

export const deleteEntityTags = defineTool({
  name: 'delete_entity_tags',
  displayName: 'Delete Entity Tags',
  description: 'Delete tags from an entity by tag key. Removes all values for the specified keys.',
  summary: 'Delete tags from an entity',
  icon: 'tag',
  group: 'Entities',
  input: z.object({
    guid: z.string().min(1).describe('Entity GUID'),
    tag_keys: z.array(z.string()).min(1).describe('Tag keys to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    const data = await graphql<{
      taggingDeleteTagFromEntity: {
        errors: Array<{ message: string }> | null;
      };
    }>(
      `mutation DeleteTags($guid: EntityGuid!, $tagKeys: [String!]!) {
        taggingDeleteTagFromEntity(guid: $guid, tagKeys: $tagKeys) {
          errors { message }
        }
      }`,
      { guid: params.guid, tagKeys: params.tag_keys },
    );
    const errors = data.taggingDeleteTagFromEntity?.errors;
    if (errors?.length) {
      throw ToolError.internal(errors.map(e => e.message).join('; '));
    }
    return { success: true };
  },
});
