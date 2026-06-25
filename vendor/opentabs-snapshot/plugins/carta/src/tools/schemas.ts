import { z } from 'zod';

// --- Shared schemas ---

export const companySchema = z.object({
  name: z.string(),
  corporation_id: z.number(),
  is_public: z.boolean(),
  is_favourite: z.boolean(),
  landing_url: z.string(),
  has_logo: z.boolean(),
});

export const companyProfileSchema = z.object({
  legal_name: z.string(),
  date_of_incorporation: z.string().nullable(),
  address: z.string().nullable(),
  ceo: z.string().nullable(),
  website: z.string().nullable(),
  description: z.string().nullable(),
});

export const holdingsDashboardSchema = z.object({
  held_since: z.string().nullable(),
  cash_cost: z.number().nullable(),
  ownership: z.string().nullable(),
  currency: z.string(),
  show_cost_card: z.boolean(),
  captable_access_level: z.string(),
});

export const optionGrantSchema = z.object({
  id: z.number(),
  label: z.string(),
  issue_date: z.string(),
  issuable_type: z.string(),
  status: z.string(),
  currency: z.string(),
  quantity: z.number(),
  stock_type: z.string(),
  exercise_price: z.number().optional(),
  exercised: z.number(),
  vested: z.number(),
  exercisable: z.number(),
  can_exercise: z.number(),
  is_canceled: z.boolean(),
  is_expired: z.boolean(),
  has_vesting: z.boolean(),
  time_vested: z.number(),
});

export const shareSchema = z.object({
  id: z.number(),
  label: z.string(),
  issue_date: z.string(),
  issuable_type: z.string(),
  status: z.string(),
  currency: z.string(),
  quantity: z.number(),
  stock_type: z.string(),
  cost: z.number().optional(),
  exercise_type: z.string().optional(),
  exercise_from: z.string().optional(),
  is_canceled: z.boolean(),
  original_acquisition_date: z.string().optional(),
});

export const rsuSchema = z.object({
  id: z.number(),
  label: z.string(),
  issue_date: z.string(),
  issuable_type: z.string(),
  status: z.string(),
  currency: z.string(),
  quantity: z.number(),
  stock_type: z.string(),
  vested: z.number(),
  remaining_shares: z.number(),
  settled: z.number(),
  has_vesting: z.boolean(),
  time_vested: z.number(),
  eligible_for_settlement: z.number(),
  is_canceled: z.boolean(),
});

export const accountSchema = z.object({
  name: z.string(),
  id: z.string(),
  account_type: z.string(),
  is_favorite: z.boolean(),
});

export const taskSchema = z.object({
  count: z.number(),
  tasks: z.array(z.record(z.string(), z.unknown())),
});

export const userInfoSchema = z.object({
  id: z.number(),
  email: z.string(),
  name: z.string(),
  user_type: z.string(),
  account_name: z.string(),
  portfolio_id: z.number(),
});

// --- Defensive mappers ---

export const mapCompany = (raw: Record<string, unknown>) => ({
  name: String(raw.name ?? ''),
  corporation_id: Number(raw.corporation_id ?? 0),
  is_public: Boolean(raw.is_public),
  is_favourite: Boolean(raw.is_favourite ?? raw.is_favorite),
  landing_url: String(raw.landing_url ?? ''),
  has_logo: Boolean(raw.has_logo),
});

export const mapOptionGrant = (raw: Record<string, unknown>) => ({
  id: Number(raw.id ?? 0),
  label: String(raw.label ?? ''),
  issue_date: String(raw.issue_date ?? ''),
  issuable_type: String(raw.issuable_type ?? ''),
  status: String(raw.status ?? ''),
  currency: String(raw.currency ?? '$'),
  quantity: Number(raw.quantity ?? 0),
  stock_type: String(raw.stock_type ?? ''),
  exercise_price: raw.exercise_price != null ? Number(raw.exercise_price) : undefined,
  exercised: Number(raw.exercised ?? 0),
  vested: Number(raw.vested ?? 0),
  exercisable: Number(raw.exercisable ?? 0),
  can_exercise: Number(raw.can_exercise ?? 0),
  is_canceled: Boolean(raw.is_canceled),
  is_expired: Boolean(raw.is_expired),
  has_vesting: Boolean(raw.has_vesting),
  time_vested: Number(raw.time_vested ?? 0),
});

export const mapShare = (raw: Record<string, unknown>) => ({
  id: Number(raw.id ?? 0),
  label: String(raw.label ?? ''),
  issue_date: String(raw.issue_date ?? ''),
  issuable_type: String(raw.issuable_type ?? ''),
  status: String(raw.status ?? ''),
  currency: String(raw.currency ?? '$'),
  quantity: Number(raw.quantity ?? 0),
  stock_type: String(raw.stock_type ?? ''),
  cost: raw.cost != null ? Number(raw.cost) : undefined,
  exercise_type: raw.exercise_type != null ? String(raw.exercise_type) : undefined,
  exercise_from: raw.exercise_from != null ? String(raw.exercise_from) : undefined,
  is_canceled: Boolean(raw.is_canceled),
  original_acquisition_date: raw.original_acquisition_date != null ? String(raw.original_acquisition_date) : undefined,
});

export const mapRsu = (raw: Record<string, unknown>) => ({
  id: Number(raw.id ?? 0),
  label: String(raw.label ?? ''),
  issue_date: String(raw.issue_date ?? ''),
  issuable_type: String(raw.issuable_type ?? ''),
  status: String(raw.status ?? ''),
  currency: String(raw.currency ?? '$'),
  quantity: Number(raw.quantity ?? 0),
  stock_type: String(raw.stock_type ?? ''),
  vested: Number(raw.vested ?? 0),
  remaining_shares: Number(raw.remaining_shares ?? 0),
  settled: Number(raw.settled ?? 0),
  has_vesting: Boolean(raw.has_vesting),
  time_vested: Number(raw.time_vested ?? 0),
  eligible_for_settlement: Number(raw.eligible_for_settlement ?? 0),
  is_canceled: Boolean(raw.is_canceled),
});
