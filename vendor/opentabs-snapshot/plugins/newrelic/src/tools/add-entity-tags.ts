import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../newrelic-api.js';

export const addEntityTags = defineTool({
  name: 'add_entity_tags',
  displayName: 'Add Entity Tags',
  description:
    'Add tags to an entity. Each tag is a key-value pair. Adding a tag with an existing key appends the value.',
  summary: 'Add tags to an entity',
  icon: 'tag',
  group: 'Entities',
  input: z.object({
    guid: z.string().min(1).describe('Entity GUID'),
    tags: z
      .array(
        z.object({
          key: z.string().describe('Tag key'),
          values: z.array(z.string()).describe('Tag values'),
        }),
      )
      .min(1)
      .describe('Tags to add'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    const data = await graphql<{
      taggingAddTagsToEntity: {
        errors: Array<{ message: string }> | null;
      };
    }>(
      `mutation AddTags($guid: EntityGuid!, $tags: [TaggingTagInput!]!) {
        taggingAddTagsToEntity(guid: $guid, tags: $tags) {
          errors { message }
        }
      }`,
      { guid: params.guid, tags: params.tags },
    );
    const errors = data.taggingAddTagsToEntity?.errors;
    if (errors?.length) {
      throw ToolError.internal(errors.map(e => e.message).join('; '));
    }
    return { success: true };
  },
});
