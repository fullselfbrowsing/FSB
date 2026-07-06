import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchPageData } from '../walmart-api.js';

const storeHoursSchema = z.object({
  day: z.string().describe('Day of week'),
  start: z.string().describe('Opening time (e.g., "06:00")'),
  end: z.string().describe('Closing time (e.g., "23:00")'),
});

const storeServiceSchema = z.object({
  name: z.string().describe('Service name (e.g., PHARMACY, DELI)'),
  display_name: z.string().describe('Display name'),
  phone: z.string().describe('Service phone number'),
});

const storeDetailSchema = z.object({
  store_id: z.string().describe('Store number'),
  name: z.string().describe('Store display name'),
  store_type: z.string().describe('Store type (e.g., "Walmart Supercenter")'),
  address: z.string().describe('Street address'),
  city: z.string().describe('City'),
  state: z.string().describe('State code'),
  zip: z.string().describe('ZIP code'),
  phone: z.string().describe('Main phone number'),
  is_open_24_hours: z.boolean().describe('Whether the store is open 24 hours'),
  hours: z.array(storeHoursSchema).describe('Weekly operating hours'),
  services: z.array(storeServiceSchema).describe('Available store services'),
});

interface RawNodeDetail {
  id?: string | number;
  displayName?: string;
  name?: string;
  phoneNumber?: string;
  open24Hours?: boolean;
  address?: {
    addressLineOne?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  };
  operationalHours?: Array<{
    day?: string;
    start?: string;
    end?: string;
    closed?: boolean;
  }>;
  services?: Array<{
    name?: string;
    displayName?: string;
    phone?: string;
  }>;
}

export const getStore = defineTool({
  name: 'get_store',
  displayName: 'Get Store',
  description:
    'Get detailed information about a specific Walmart store by its store number. Returns address, phone, hours, and services. The store_id can include a slug suffix (e.g., "5435-san-jose-ca") or just the numeric ID (e.g., "5435").',
  summary: 'Get store details by store number',
  icon: 'building-2',
  group: 'Stores',
  input: z.object({
    store_id: z.string().describe('Walmart store ID or slug (e.g., "5435" or "5435-san-jose-ca")'),
  }),
  output: z.object({ store: storeDetailSchema }),
  handle: async params => {
    const data = await fetchPageData(`/store/${params.store_id}`);

    const initialData = data.initialData as Record<string, unknown> | undefined;
    const nodeDetailWrapper = initialData?.initialDataNodeDetail as Record<string, unknown> | undefined;
    const innerData = nodeDetailWrapper?.data as Record<string, unknown> | undefined;
    const raw = innerData?.nodeDetail as RawNodeDetail | undefined;

    if (!raw) {
      throw ToolError.notFound(`Store not found: ${params.store_id}`);
    }

    return {
      store: {
        store_id: String(raw.id ?? ''),
        name: raw.displayName ?? '',
        store_type: raw.name ?? '',
        address: raw.address?.addressLineOne ?? '',
        city: raw.address?.city ?? '',
        state: raw.address?.state ?? '',
        zip: raw.address?.postalCode ?? '',
        phone: raw.phoneNumber ?? '',
        is_open_24_hours: raw.open24Hours ?? false,
        hours:
          raw.operationalHours
            ?.filter(h => !h.closed)
            .map(h => ({
              day: h.day ?? '',
              start: h.start ?? '',
              end: h.end ?? '',
            })) ?? [],
        services:
          raw.services?.map(s => ({
            name: s.name ?? '',
            display_name: s.displayName ?? '',
            phone: s.phone ?? '',
          })) ?? [],
      },
    };
  },
});
