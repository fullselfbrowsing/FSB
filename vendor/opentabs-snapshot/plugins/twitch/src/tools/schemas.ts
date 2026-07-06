import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared fragments
// ---------------------------------------------------------------------------

const userRefSchema = z.object({
  id: z.string().describe('Twitch user ID'),
  login: z.string().describe('Twitch login name (lowercase, URL-safe)'),
  displayName: z.string().describe('User display name'),
  profileImageURL: z.string().describe("URL of the user's profile image"),
});

const gameRefSchema = z.object({
  id: z.string().describe('Game/category ID'),
  name: z.string().describe('Game/category name'),
});

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

const userRolesSchema = z.object({
  isPartner: z.boolean().describe('Whether the user is a Twitch Partner'),
  isAffiliate: z.boolean().describe('Whether the user is a Twitch Affiliate'),
});

export const userSchema = userRefSchema.extend({
  description: z.string().describe('User bio / channel description'),
  createdAt: z.string().describe('ISO 8601 timestamp of account creation'),
  hasPrime: z.boolean().describe('Whether the user has Twitch Prime'),
  roles: userRolesSchema.describe('Partner and Affiliate status'),
  followerCount: z.number().describe('Total number of followers'),
});

export type User = z.infer<typeof userSchema>;

export interface RawUser {
  id?: string;
  login?: string;
  displayName?: string;
  description?: string;
  profileImageURL?: string;
  createdAt?: string;
  hasPrime?: boolean;
  roles?: {
    isPartner?: boolean;
    isAffiliate?: boolean;
  };
  followers?: {
    totalCount?: number;
  };
  followerCount?: number;
}

export function mapUser(raw: RawUser): User {
  return {
    id: raw.id ?? '',
    login: raw.login ?? '',
    displayName: raw.displayName ?? '',
    description: raw.description ?? '',
    profileImageURL: raw.profileImageURL ?? '',
    createdAt: raw.createdAt ?? '',
    hasPrime: raw.hasPrime ?? false,
    roles: {
      isPartner: raw.roles?.isPartner ?? false,
      isAffiliate: raw.roles?.isAffiliate ?? false,
    },
    followerCount: raw.followers?.totalCount ?? raw.followerCount ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Stream
// ---------------------------------------------------------------------------

export const streamSchema = z.object({
  id: z.string().describe('Stream ID'),
  title: z.string().describe('Stream title'),
  viewersCount: z.number().describe('Current number of viewers'),
  type: z.string().describe('Stream type (e.g. "live")'),
  createdAt: z.string().describe('ISO 8601 timestamp when the stream started'),
  broadcaster: userRefSchema.describe('Broadcaster info'),
  game: gameRefSchema.describe('Game/category being streamed'),
});

export type Stream = z.infer<typeof streamSchema>;

export interface RawStream {
  id?: string;
  title?: string;
  viewersCount?: number;
  type?: string;
  createdAt?: string;
  broadcaster?: {
    id?: string;
    login?: string;
    displayName?: string;
    profileImageURL?: string;
  };
  game?: {
    id?: string;
    name?: string;
  };
}

export function mapStream(raw: RawStream): Stream {
  return {
    id: raw.id ?? '',
    title: raw.title ?? '',
    viewersCount: raw.viewersCount ?? 0,
    type: raw.type ?? '',
    createdAt: raw.createdAt ?? '',
    broadcaster: {
      id: raw.broadcaster?.id ?? '',
      login: raw.broadcaster?.login ?? '',
      displayName: raw.broadcaster?.displayName ?? '',
      profileImageURL: raw.broadcaster?.profileImageURL ?? '',
    },
    game: {
      id: raw.game?.id ?? '',
      name: raw.game?.name ?? '',
    },
  };
}

// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------

export const gameSchema = gameRefSchema.extend({
  displayName: z.string().describe('Localized display name for the game'),
  viewersCount: z.number().describe('Total viewers across all streams'),
  broadcastersCount: z.number().describe('Number of channels currently streaming this game'),
  boxArtURL: z.string().describe('URL of the game box art image'),
});

export type Game = z.infer<typeof gameSchema>;

export interface RawGame {
  id?: string;
  name?: string;
  displayName?: string;
  viewersCount?: number;
  broadcastersCount?: number;
  boxArtURL?: string;
}

export function mapGame(raw: RawGame): Game {
  return {
    id: raw.id ?? '',
    name: raw.name ?? '',
    displayName: raw.displayName ?? raw.name ?? '',
    viewersCount: raw.viewersCount ?? 0,
    broadcastersCount: raw.broadcastersCount ?? 0,
    boxArtURL: raw.boxArtURL ?? '',
  };
}

// ---------------------------------------------------------------------------
// Clip
// ---------------------------------------------------------------------------

const broadcasterRefSchema = z.object({
  id: z.string().describe('Broadcaster user ID'),
  login: z.string().describe('Broadcaster login name'),
  displayName: z.string().describe('Broadcaster display name'),
});

export const clipSchema = z.object({
  id: z.string().describe('Clip ID'),
  slug: z.string().describe('URL-safe slug for the clip'),
  title: z.string().describe('Clip title'),
  viewCount: z.number().describe('Total number of views'),
  createdAt: z.string().describe('ISO 8601 timestamp when the clip was created'),
  thumbnailURL: z.string().describe('URL of the clip thumbnail image'),
  durationSeconds: z.number().describe('Clip duration in seconds'),
  broadcaster: broadcasterRefSchema.describe('Broadcaster who was clipped'),
  game: gameRefSchema.describe('Game/category at the time of the clip'),
});

export type Clip = z.infer<typeof clipSchema>;

export interface RawClip {
  id?: string;
  slug?: string;
  title?: string;
  viewCount?: number;
  createdAt?: string;
  thumbnailURL?: string;
  durationSeconds?: number;
  broadcaster?: {
    id?: string;
    login?: string;
    displayName?: string;
  };
  game?: {
    id?: string;
    name?: string;
  };
}

export function mapClip(raw: RawClip): Clip {
  return {
    id: raw.id ?? '',
    slug: raw.slug ?? '',
    title: raw.title ?? '',
    viewCount: raw.viewCount ?? 0,
    createdAt: raw.createdAt ?? '',
    thumbnailURL: raw.thumbnailURL ?? '',
    durationSeconds: raw.durationSeconds ?? 0,
    broadcaster: {
      id: raw.broadcaster?.id ?? '',
      login: raw.broadcaster?.login ?? '',
      displayName: raw.broadcaster?.displayName ?? '',
    },
    game: {
      id: raw.game?.id ?? '',
      name: raw.game?.name ?? '',
    },
  };
}

// ---------------------------------------------------------------------------
// Video
// ---------------------------------------------------------------------------

export const videoSchema = z.object({
  id: z.string().describe('Video ID'),
  title: z.string().describe('Video title'),
  viewCount: z.number().describe('Total number of views'),
  publishedAt: z.string().describe('ISO 8601 timestamp when the video was published'),
  lengthSeconds: z.number().describe('Video duration in seconds'),
  game: gameRefSchema.describe('Game/category associated with the video'),
  thumbnailURL: z.string().describe('URL of the video thumbnail image'),
});

export type Video = z.infer<typeof videoSchema>;

export interface RawVideo {
  id?: string;
  title?: string;
  viewCount?: number;
  publishedAt?: string;
  lengthSeconds?: number;
  game?: {
    id?: string;
    name?: string;
  };
  thumbnailURL?: string;
}

export function mapVideo(raw: RawVideo): Video {
  return {
    id: raw.id ?? '',
    title: raw.title ?? '',
    viewCount: raw.viewCount ?? 0,
    publishedAt: raw.publishedAt ?? '',
    lengthSeconds: raw.lengthSeconds ?? 0,
    game: {
      id: raw.game?.id ?? '',
      name: raw.game?.name ?? '',
    },
    thumbnailURL: raw.thumbnailURL ?? '',
  };
}
