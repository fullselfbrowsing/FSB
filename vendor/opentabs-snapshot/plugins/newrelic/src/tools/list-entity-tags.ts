import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../newrelic-api.js';
import { tagSchema, mapTag } from './schemas.js';
import type { RawTag } from './schemas.js';

export const listEntityTags = defineTool({
  name: 'list_entity_tags',
  displayName: 'List Entity Tags',
  description:
    'List all tags on a specific entity. Tags are key-value pairs used for filtering and organizing entities.',
  summary: 'List tags on an entity',
  icon: 'tags',
  group: 'Entities',
  input: z.object({
    guid: z.string().min(1).describe('Entity GUID'),
  }),
  output: z.object({
    tags: z.array(tagSchema).describe('Entity tags'),
  }),
  handle: async params => {
    const data = await graphql<{
      actor: { entity: { tags: RawTag[] } | null };
    }>(
      `query ListEntityTags($guid: EntityGuid!) {
        actor {
          entity(guid: $guid) {
            tags { key values }
          }
        }
      }`,
      { guid: params.guid },
    );
    if (!data.actor.entity) throw ToolError.notFound(`Entity not found: ${params.guid}`);
    return { tags: (data.actor.entity.tags ?? []).map(mapTag) };
  },
});
