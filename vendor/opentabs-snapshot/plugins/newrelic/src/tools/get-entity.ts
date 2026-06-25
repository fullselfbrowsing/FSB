import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../newrelic-api.js';
import { entitySchema, mapEntity } from './schemas.js';
import type { RawEntity } from './schemas.js';

export const getEntity = defineTool({
  name: 'get_entity',
  displayName: 'Get Entity',
  description: 'Get detailed information about a specific monitored entity by its GUID.',
  summary: 'Get entity details by GUID',
  icon: 'info',
  group: 'Entities',
  input: z.object({
    guid: z.string().min(1).describe('Entity GUID'),
  }),
  output: z.object({
    entity: entitySchema.describe('Entity details'),
  }),
  handle: async params => {
    const data = await graphql<{
      actor: { entity: RawEntity | null };
    }>(
      `query GetEntity($guid: EntityGuid!) {
        actor {
          entity(guid: $guid) {
            guid name type domain entityType alertSeverity reporting permalink
            tags { key values }
          }
        }
      }`,
      { guid: params.guid },
    );
    if (!data.actor.entity) throw ToolError.notFound(`Entity not found: ${params.guid}`);
    return { entity: mapEntity(data.actor.entity) };
  },
});
