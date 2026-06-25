import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../redfin-api.js';
import type { BelowTheFoldPayload } from './schemas.js';

const amenityGroupSchema = z.object({
  group_name: z.string().describe('Amenity group (e.g., "Interior Features", "Exterior Features")'),
  amenities: z
    .array(
      z.object({
        name: z.string().describe('Amenity name'),
        values: z.array(z.string()).describe('Amenity values'),
      }),
    )
    .describe('Amenities in this group'),
});

export const getPropertyAmenities = defineTool({
  name: 'get_property_amenities',
  displayName: 'Get Property Amenities',
  description:
    'Get amenities and features for a property, including interior features, exterior features, building information, and utility details.',
  summary: 'Get property amenities and features',
  icon: 'list-checks',
  group: 'Properties',
  input: z.object({
    property_id: z.number().int().describe('Redfin property ID'),
  }),
  output: z.object({
    groups: z.array(amenityGroupSchema).describe('Amenity groups'),
    total_amenities: z.number().describe('Total number of amenities'),
  }),
  handle: async params => {
    const data = await api<BelowTheFoldPayload>('/stingray/api/home/details/belowTheFold', {
      query: {
        propertyId: params.property_id,
        accessLevel: 3,
      },
    });

    const amenitiesInfo = data.amenitiesInfo;
    const groups: {
      group_name: string;
      amenities: { name: string; values: string[] }[];
    }[] = [];

    for (const superGroup of amenitiesInfo?.superGroups ?? []) {
      for (const group of superGroup.amenityGroups ?? []) {
        const amenities: { name: string; values: string[] }[] = [];
        for (const a of group.amenityEntries ?? []) {
          amenities.push({
            name: a.amenityName ?? a.referenceName ?? '',
            values: a.amenityValues ?? [],
          });
        }
        if (amenities.length > 0) {
          groups.push({
            group_name: group.groupTitle ?? superGroup.titleString ?? '',
            amenities,
          });
        }
      }
    }

    return {
      groups,
      total_amenities: amenitiesInfo?.totalAmenities ?? 0,
    };
  },
});
