import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../redfin-api.js';

interface ParcelPayload {
  fipsCode?: string;
  apn?: string;
  latLong?: { latitude?: number; longitude?: number };
  timeZone?: string;
}

export const getPropertyParcelInfo = defineTool({
  name: 'get_property_parcel_info',
  displayName: 'Get Parcel Info',
  description:
    'Get parcel information for a property, including FIPS code, APN (Assessor Parcel Number), and precise coordinates.',
  summary: 'Get parcel and assessor data',
  icon: 'map',
  group: 'Properties',
  input: z.object({
    property_id: z.number().int().describe('Redfin property ID'),
  }),
  output: z.object({
    fips_code: z.string().describe('FIPS code for the county'),
    apn: z.string().describe('Assessor Parcel Number'),
    latitude: z.number().describe('Latitude'),
    longitude: z.number().describe('Longitude'),
    time_zone: z.string().describe('Time zone'),
  }),
  handle: async params => {
    const data = await api<ParcelPayload>('/stingray/api/home/details/propertyParcelInfo', {
      query: {
        propertyId: params.property_id,
        accessLevel: 3,
      },
    });

    return {
      fips_code: data.fipsCode ?? '',
      apn: data.apn ?? '',
      latitude: data.latLong?.latitude ?? 0,
      longitude: data.latLong?.longitude ?? 0,
      time_zone: data.timeZone ?? '',
    };
  },
});
