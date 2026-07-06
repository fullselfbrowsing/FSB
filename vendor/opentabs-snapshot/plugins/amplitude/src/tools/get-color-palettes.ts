import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../amplitude-api.js';

const QUERY = `query AllColorPalettes {
  allColorPalettes {
    id name lightModeColors darkModeColors isAmplitudeDefault
    isUserPalette createdAt createdBy lastModifiedBy lastModifiedAt isActive
  }
}`;

const paletteSchema = z.object({
  id: z.number().int().describe('Palette ID'),
  name: z.string().describe('Palette name'),
  light_mode_colors: z.array(z.string()).describe('Hex color codes for light mode'),
  dark_mode_colors: z.array(z.string()).describe('Hex color codes for dark mode'),
  is_amplitude_default: z.boolean().describe('Whether this is a built-in Amplitude palette'),
  is_user_palette: z.boolean().describe('Whether this was created by a user'),
  is_active: z.boolean().describe('Whether the palette is currently active'),
});

export const getColorPalettes = defineTool({
  name: 'get_color_palettes',
  displayName: 'Get Color Palettes',
  description:
    'Get all color palettes available in the organization for chart visualization. Includes built-in Amplitude palettes and custom user-created palettes.',
  summary: 'Get chart color palettes',
  icon: 'palette',
  group: 'Analytics',
  input: z.object({}),
  output: z.object({
    palettes: z.array(paletteSchema).describe('Available color palettes'),
  }),
  handle: async () => {
    const data = await gql<{
      allColorPalettes: Array<{
        id?: number;
        name?: string;
        lightModeColors?: string[];
        darkModeColors?: string[];
        isAmplitudeDefault?: boolean;
        isUserPalette?: boolean;
        isActive?: boolean;
      }>;
    }>('AllColorPalettes', QUERY);
    return {
      palettes: (data.allColorPalettes ?? []).map(p => ({
        id: p.id ?? 0,
        name: p.name ?? '',
        light_mode_colors: p.lightModeColors ?? [],
        dark_mode_colors: p.darkModeColors ?? [],
        is_amplitude_default: p.isAmplitudeDefault ?? false,
        is_user_palette: p.isUserPalette ?? false,
        is_active: p.isActive ?? false,
      })),
    };
  },
});
