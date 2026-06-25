import { z } from 'zod';

// --- User ---

export const userSchema = z.object({
  id: z.string().describe('User ID'),
  username: z.string().describe('Username'),
  full_name: z.string().describe('Display name'),
  image_url: z.string().describe('Profile image URL'),
  follower_count: z.number().describe('Number of followers'),
  following_count: z.number().describe('Number of users being followed'),
  pin_count: z.number().describe('Total pin count'),
  board_count: z.number().describe('Total board count'),
  is_partner: z.boolean().describe('Whether the user is a verified partner'),
});

export interface RawUser {
  id?: string;
  username?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  image_medium_url?: string;
  image_large_url?: string;
  image_xlarge_url?: string;
  follower_count?: number;
  following_count?: number;
  pin_count?: number;
  board_count?: number;
  is_partner?: boolean;
}

export const mapUser = (u: RawUser) => ({
  id: u.id ?? '',
  username: u.username ?? '',
  full_name: u.full_name ?? `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim(),
  image_url: u.image_xlarge_url ?? u.image_large_url ?? u.image_medium_url ?? '',
  follower_count: u.follower_count ?? 0,
  following_count: u.following_count ?? 0,
  pin_count: u.pin_count ?? 0,
  board_count: u.board_count ?? 0,
  is_partner: u.is_partner ?? false,
});

// --- Current User (extended) ---

export const currentUserSchema = userSchema.extend({
  email: z.string().describe('Email address'),
  country: z.string().describe('Country code'),
  created_at: z.string().describe('Account creation date'),
});

export interface RawCurrentUser extends RawUser {
  email?: string;
  country?: string;
  created_at?: string;
}

export const mapCurrentUser = (u: RawCurrentUser) => ({
  ...mapUser(u),
  email: u.email ?? '',
  country: u.country ?? '',
  created_at: u.created_at ?? '',
});

// --- Board ---

export const boardSchema = z.object({
  id: z.string().describe('Board ID'),
  name: z.string().describe('Board name'),
  description: z.string().describe('Board description'),
  url: z.string().describe('Board URL path'),
  pin_count: z.number().describe('Number of pins on the board'),
  follower_count: z.number().describe('Number of followers'),
  section_count: z.number().describe('Number of sections'),
  privacy: z.string().describe('Privacy setting (public or secret)'),
  is_collaborative: z.boolean().describe('Whether the board allows collaborators'),
  created_at: z.string().describe('Creation date'),
  image_url: z.string().describe('Board cover image URL'),
  owner_username: z.string().describe('Board owner username'),
});

export interface RawBoard {
  id?: string;
  name?: string;
  description?: string;
  url?: string;
  pin_count?: number;
  follower_count?: number;
  section_count?: number;
  privacy?: string;
  is_collaborative?: boolean;
  created_at?: string;
  image_cover_url?: string;
  image_thumbnail_url?: string;
  owner?: { username?: string };
}

export const mapBoard = (b: RawBoard) => ({
  id: b.id ?? '',
  name: b.name ?? '',
  description: b.description ?? '',
  url: b.url ?? '',
  pin_count: b.pin_count ?? 0,
  follower_count: b.follower_count ?? 0,
  section_count: b.section_count ?? 0,
  privacy: b.privacy ?? 'public',
  is_collaborative: b.is_collaborative ?? false,
  created_at: b.created_at ?? '',
  image_url: b.image_cover_url ?? b.image_thumbnail_url ?? '',
  owner_username: b.owner?.username ?? '',
});

// --- Board Section ---

export const boardSectionSchema = z.object({
  id: z.string().describe('Section ID'),
  title: z.string().describe('Section title'),
  pin_count: z.number().describe('Number of pins in the section'),
  slug: z.string().describe('URL slug for the section'),
});

export interface RawBoardSection {
  id?: string;
  title?: string;
  pin_count?: number;
  slug?: string;
}

export const mapBoardSection = (s: RawBoardSection) => ({
  id: s.id ?? '',
  title: s.title ?? '',
  pin_count: s.pin_count ?? 0,
  slug: s.slug ?? '',
});

// --- Pin ---

export const pinSchema = z.object({
  id: z.string().describe('Pin ID'),
  title: z.string().describe('Pin title'),
  description: z.string().describe('Pin description'),
  link: z.string().describe('External link URL'),
  image_url: z.string().describe('Pin image URL'),
  dominant_color: z.string().describe('Dominant color hex'),
  is_video: z.boolean().describe('Whether the pin contains a video'),
  repin_count: z.number().describe('Number of saves/repins'),
  comment_count: z.number().describe('Number of comments'),
  pinner_username: z.string().describe('Username of the pin creator'),
  board_name: z.string().describe('Board name the pin belongs to'),
  created_at: z.string().describe('Creation date'),
});

export interface RawPin {
  id?: string;
  node_id?: string;
  title?: string;
  description?: string;
  auto_alt_text?: string;
  link?: string;
  images?: { orig?: { url?: string }; '736x'?: { url?: string } };
  image_medium_size_url?: string;
  dominant_color?: string;
  is_video?: boolean;
  repin_count?: number;
  comment_count?: number;
  pinner?: { username?: string };
  board?: { name?: string };
  pinned_to_board?: { name?: string };
  created_at?: string;
}

/**
 * Extract a numeric pin ID from either `id` or `node_id` (base64 `Pin:<id>`).
 */
const extractPinId = (p: RawPin): string => {
  if (p.id) return p.id;
  if (p.node_id) {
    try {
      const decoded = atob(p.node_id);
      const match = decoded.match(/^Pin:(.+)$/);
      if (match?.[1]) return match[1];
    } catch {
      /* not base64 */
    }
  }
  return '';
};

export const mapPin = (p: RawPin) => ({
  id: extractPinId(p),
  title: p.title ?? '',
  description: p.description ?? p.auto_alt_text ?? '',
  link: p.link ?? '',
  image_url: p.images?.orig?.url ?? p.images?.['736x']?.url ?? p.image_medium_size_url ?? '',
  dominant_color: p.dominant_color ?? '',
  is_video: p.is_video ?? false,
  repin_count: p.repin_count ?? 0,
  comment_count: p.comment_count ?? 0,
  pinner_username: p.pinner?.username ?? '',
  board_name: p.board?.name ?? p.pinned_to_board?.name ?? '',
  created_at: p.created_at ?? '',
});
