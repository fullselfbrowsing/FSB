import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql, QUERY_HASHES } from '../airbnb-api.js';

export const getMapViewportInfo = defineTool({
  name: 'get_map_viewport_info',
  displayName: 'Get Map Viewport Info',
  description: 'Get the localized location name for a map bounding box and zoom level.',
  summary: 'Get location name for a map viewport',
  icon: 'map',
  group: 'Map',
  input: z.object({
    southwest_lat: z.number().describe('Southwest corner latitude'),
    southwest_lng: z.number().describe('Southwest corner longitude'),
    northeast_lat: z.number().describe('Northeast corner latitude'),
    northeast_lng: z.number().describe('Northeast corner longitude'),
    zoom_level: z.number().describe('Map zoom level'),
  }),
  output: z.object({
    location_name: z.string().describe('Localized location name for the viewport'),
  }),
  handle: async params => {
    const data = await graphql<{
      maps: {
        getMapViewportInfo: {
          localizedLocationName?: string;
        };
      };
    }>('MapViewportInfoQuery', QUERY_HASHES.MapViewportInfoQuery, {
      request: {
        boundingBox: {
          southwest: { lat: params.southwest_lat, lng: params.southwest_lng },
          northeast: { lat: params.northeast_lat, lng: params.northeast_lng },
        },
        zoomLevel: params.zoom_level,
      },
    });

    return {
      location_name: data.maps.getMapViewportInfo.localizedLocationName ?? '',
    };
  },
});
