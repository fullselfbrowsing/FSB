import { z } from 'zod';

export const projectSchema = z.object({
  id: z.string().describe('Project reference ID'),
  name: z.string().describe('Project name'),
  organization_id: z.string().describe('Organization ID the project belongs to'),
  region: z.string().describe('Project region (e.g., us-east-1)'),
  status: z.string().describe('Project status (e.g., ACTIVE_HEALTHY, INACTIVE, COMING_UP)'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
});

export const mapProject = (p: Record<string, unknown> | undefined) => ({
  id: (p?.id as string) ?? '',
  name: (p?.name as string) ?? '',
  organization_id: (p?.organization_id as string) ?? '',
  region: (p?.region as string) ?? '',
  status: (p?.status as string) ?? '',
  created_at: (p?.created_at as string) ?? '',
});

export const organizationSchema = z.object({
  id: z.string().describe('Organization ID'),
  name: z.string().describe('Organization name'),
  slug: z.string().describe('Organization slug used in URLs'),
});

export const mapOrganization = (o: Record<string, unknown> | undefined) => ({
  id: (o?.id as string) ?? '',
  name: (o?.name as string) ?? '',
  slug: (o?.slug as string) || ((o?.id as string) ?? ''),
});

export const functionSchema = z.object({
  id: z.string().describe('Function UUID'),
  slug: z.string().describe('Function slug (URL-friendly name)'),
  name: z.string().describe('Function display name'),
  status: z.string().describe('Function status (e.g., ACTIVE, REMOVED)'),
  version: z.number().describe('Function version number'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  updated_at: z.string().describe('ISO 8601 last update timestamp'),
  verify_jwt: z.boolean().describe('Whether the function verifies JWT tokens'),
});

export const mapFunction = (f: Record<string, unknown> | undefined) => ({
  id: (f?.id as string) ?? '',
  slug: (f?.slug as string) ?? '',
  name: (f?.name as string) ?? '',
  status: (f?.status as string) ?? '',
  version: (f?.version as number) ?? 0,
  created_at: (f?.created_at as string) ?? '',
  updated_at: (f?.updated_at as string) ?? '',
  verify_jwt: (f?.verify_jwt as boolean) ?? true,
});

export const secretSchema = z.object({
  name: z.string().describe('Secret name'),
  value: z.string().describe('Secret value (masked in responses)'),
});

export const mapSecret = (s: Record<string, unknown> | undefined) => ({
  name: (s?.name as string) ?? '',
  value: (s?.value as string) ?? '',
});

export const bucketSchema = z.object({
  id: z.string().describe('Bucket ID'),
  name: z.string().describe('Bucket name'),
  public: z.boolean().describe('Whether the bucket is publicly accessible'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  updated_at: z.string().describe('ISO 8601 last update timestamp'),
});

export const mapBucket = (b: Record<string, unknown> | undefined) => ({
  id: (b?.id as string) ?? '',
  name: (b?.name as string) ?? '',
  public: (b?.public as boolean) ?? false,
  created_at: (b?.created_at as string) ?? '',
  updated_at: (b?.updated_at as string) ?? '',
});

export const memberSchema = z.object({
  user_id: z.string().describe('User UUID'),
  user_name: z.string().describe('Username'),
  email: z.string().describe('User email address'),
  role_name: z.string().describe('Role in the organization (e.g., Owner, Developer)'),
});

export const mapMember = (m: Record<string, unknown> | undefined) => ({
  user_id: (m?.user_id as string) ?? (m?.gotrue_id as string) ?? '',
  user_name: (m?.user_name as string) ?? (m?.username as string) ?? '',
  email: (m?.email as string) ?? (m?.primary_email as string) ?? '',
  role_name: (m?.role_name as string) ?? '',
});

export const migrationSchema = z.object({
  version: z.string().describe('Migration version string'),
  name: z.string().describe('Migration name or description'),
  statements: z.array(z.string()).optional().describe('SQL statements in the migration'),
});

export const mapMigration = (m: Record<string, unknown> | undefined) => ({
  version: (m?.version as string) ?? '',
  name: (m?.name as string) ?? '',
  statements: Array.isArray(m?.statements) ? (m.statements as string[]) : undefined,
});
