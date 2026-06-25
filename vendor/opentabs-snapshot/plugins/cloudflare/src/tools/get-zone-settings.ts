import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { cloudflareApi } from '../cloudflare-api.js';

const zoneSettingSchema = z.object({
  id: z.string().describe('Setting identifier (e.g., "always_use_https", "min_tls_version", "brotli")'),
  value: z.unknown().describe('Current setting value (string, number, boolean, or object depending on the setting)'),
  editable: z.boolean().describe('Whether this setting can be modified on the current plan'),
  modified_on: z.string().nullable().describe('ISO 8601 timestamp of last modification, or null if never modified'),
});

export const getZoneSettings = defineTool({
  name: 'get_zone_settings',
  displayName: 'Get Zone Settings',
  description:
    'Get all settings for a zone. Returns ~56 settings including security level, SSL mode, cache TTL, minification, HTTP/2, Always Use HTTPS, Brotli compression, development mode, and more. Each setting shows its current value and whether it is editable on the current plan.',
  summary: 'Get all zone settings',
  icon: 'settings',
  group: 'Settings',
  input: z.object({
    zone_id: z.string().describe('Zone ID (32-char hex string)'),
  }),
  output: z.object({
    settings: z.array(zoneSettingSchema).describe('List of zone settings'),
  }),
  handle: async params => {
    const data = await cloudflareApi<Record<string, unknown>[]>(
      `/zones/${encodeURIComponent(params.zone_id)}/settings`,
    );
    const settings = Array.isArray(data.result) ? (data.result as Record<string, unknown>[]) : [];
    return {
      settings: settings.map(s => ({
        id: (s.id as string) ?? '',
        value: s.value,
        editable: (s.editable as boolean) ?? false,
        modified_on: (s.modified_on as string) ?? null,
      })),
    };
  },
});
