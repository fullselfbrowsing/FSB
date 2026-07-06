import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { cloudflareApi } from '../cloudflare-api.js';

export const updateZoneSetting = defineTool({
  name: 'update_zone_setting',
  displayName: 'Update Zone Setting',
  description:
    'Update a single zone setting by its ID. Common settings: "always_use_https" (on/off), "min_tls_version" ("1.0"/"1.1"/"1.2"/"1.3"), "ssl" ("off"/"flexible"/"full"/"strict"), "brotli" (on/off), "browser_cache_ttl" (number), "development_mode" (on/off), "security_level" ("off"/"essentially_off"/"low"/"medium"/"high"/"under_attack"). Use get_zone_settings first to see available settings and their current values.',
  summary: 'Update a zone setting',
  icon: 'settings',
  group: 'Settings',
  input: z.object({
    zone_id: z.string().describe('Zone ID (32-char hex string)'),
    setting_id: z
      .string()
      .describe(
        'Setting ID (e.g., "always_use_https", "ssl", "min_tls_version", "brotli", "development_mode", "security_level")',
      ),
    value: z.unknown().describe('New value for the setting (string, number, or object depending on the setting)'),
  }),
  output: z.object({
    id: z.string().describe('Setting ID'),
    value: z.unknown().describe('Updated value'),
    editable: z.boolean().describe('Whether the setting is editable'),
    modified_on: z.string().nullable().describe('ISO 8601 last modification timestamp'),
  }),
  handle: async params => {
    const data = await cloudflareApi<Record<string, unknown>>(
      `/zones/${encodeURIComponent(params.zone_id)}/settings/${encodeURIComponent(params.setting_id as string)}`,
      { method: 'PATCH', body: { value: params.value } },
    );
    const r = data.result as Record<string, unknown>;
    return {
      id: (r.id as string) ?? '',
      value: r.value,
      editable: (r.editable as boolean) ?? false,
      modified_on: (r.modified_on as string) ?? null,
    };
  },
});
