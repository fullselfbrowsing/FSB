import { z } from 'zod';

// --- Ticket ---

export const ticketSchema = z.object({
  id: z.number().describe('Ticket ID'),
  subject: z.string().describe('Ticket subject'),
  description: z.string().describe('First comment body (ticket description)'),
  status: z.string().describe('Ticket status (new, open, pending, hold, solved, closed)'),
  priority: z.string().describe('Ticket priority (low, normal, high, urgent)'),
  type: z.string().describe('Ticket type (problem, incident, question, task)'),
  requester_id: z.number().describe('Requester user ID'),
  submitter_id: z.number().describe('Submitter user ID'),
  assignee_id: z.number().describe('Assignee user ID'),
  group_id: z.number().describe('Assigned group ID'),
  organization_id: z.number().describe('Organization ID'),
  tags: z.array(z.string()).describe('Tags applied to the ticket'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  updated_at: z.string().describe('ISO 8601 last update timestamp'),
  due_at: z.string().describe('ISO 8601 due date for task tickets'),
  url: z.string().describe('API URL of the ticket'),
});

export interface RawTicket {
  id?: number;
  subject?: string;
  description?: string;
  status?: string;
  priority?: string | null;
  type?: string | null;
  requester_id?: number | null;
  submitter_id?: number | null;
  assignee_id?: number | null;
  group_id?: number | null;
  organization_id?: number | null;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
  due_at?: string | null;
  url?: string;
}

export const mapTicket = (t: RawTicket) => ({
  id: t.id ?? 0,
  subject: t.subject ?? '',
  description: t.description ?? '',
  status: t.status ?? '',
  priority: t.priority ?? '',
  type: t.type ?? '',
  requester_id: t.requester_id ?? 0,
  submitter_id: t.submitter_id ?? 0,
  assignee_id: t.assignee_id ?? 0,
  group_id: t.group_id ?? 0,
  organization_id: t.organization_id ?? 0,
  tags: t.tags ?? [],
  created_at: t.created_at ?? '',
  updated_at: t.updated_at ?? '',
  due_at: t.due_at ?? '',
  url: t.url ?? '',
});

// --- Comment ---

export const commentSchema = z.object({
  id: z.number().describe('Comment ID'),
  body: z.string().describe('Comment body text'),
  author_id: z.number().describe('Author user ID'),
  public: z.boolean().describe('Whether the comment is public (visible to requester)'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
});

export interface RawComment {
  id?: number;
  body?: string;
  author_id?: number;
  public?: boolean;
  created_at?: string;
}

export const mapComment = (c: RawComment) => ({
  id: c.id ?? 0,
  body: c.body ?? '',
  author_id: c.author_id ?? 0,
  public: c.public ?? true,
  created_at: c.created_at ?? '',
});

// --- User ---

export const userSchema = z.object({
  id: z.number().describe('User ID'),
  name: z.string().describe('Full name'),
  email: z.string().describe('Primary email address'),
  role: z.string().describe('User role (end-user, agent, admin)'),
  active: z.boolean().describe('Whether the user is active'),
  phone: z.string().describe('Phone number'),
  organization_id: z.number().describe('Default organization ID'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  updated_at: z.string().describe('ISO 8601 last update timestamp'),
});

export interface RawUser {
  id?: number;
  name?: string;
  email?: string;
  role?: string;
  active?: boolean;
  phone?: string | null;
  organization_id?: number | null;
  created_at?: string;
  updated_at?: string;
}

export const mapUser = (u: RawUser) => ({
  id: u.id ?? 0,
  name: u.name ?? '',
  email: u.email ?? '',
  role: u.role ?? '',
  active: u.active ?? false,
  phone: u.phone ?? '',
  organization_id: u.organization_id ?? 0,
  created_at: u.created_at ?? '',
  updated_at: u.updated_at ?? '',
});

// --- Organization ---

export const organizationSchema = z.object({
  id: z.number().describe('Organization ID'),
  name: z.string().describe('Organization name'),
  domain_names: z.array(z.string()).describe('Associated domain names'),
  details: z.string().describe('Details about the organization'),
  notes: z.string().describe('Notes about the organization'),
  tags: z.array(z.string()).describe('Tags applied to the organization'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  updated_at: z.string().describe('ISO 8601 last update timestamp'),
});

export interface RawOrganization {
  id?: number;
  name?: string;
  domain_names?: string[];
  details?: string | null;
  notes?: string | null;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
}

export const mapOrganization = (o: RawOrganization) => ({
  id: o.id ?? 0,
  name: o.name ?? '',
  domain_names: o.domain_names ?? [],
  details: o.details ?? '',
  notes: o.notes ?? '',
  tags: o.tags ?? [],
  created_at: o.created_at ?? '',
  updated_at: o.updated_at ?? '',
});

// --- Group ---

export const groupSchema = z.object({
  id: z.number().describe('Group ID'),
  name: z.string().describe('Group name'),
  description: z.string().describe('Group description'),
  default: z.boolean().describe('Whether this is the default group'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  updated_at: z.string().describe('ISO 8601 last update timestamp'),
});

export interface RawGroup {
  id?: number;
  name?: string;
  description?: string | null;
  default?: boolean;
  created_at?: string;
  updated_at?: string;
}

export const mapGroup = (g: RawGroup) => ({
  id: g.id ?? 0,
  name: g.name ?? '',
  description: g.description ?? '',
  default: g.default ?? false,
  created_at: g.created_at ?? '',
  updated_at: g.updated_at ?? '',
});

// --- View ---

export const viewSchema = z.object({
  id: z.number().describe('View ID'),
  title: z.string().describe('View title'),
  active: z.boolean().describe('Whether the view is active'),
  description: z.string().describe('View description'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  updated_at: z.string().describe('ISO 8601 last update timestamp'),
});

export interface RawView {
  id?: number;
  title?: string;
  active?: boolean;
  description?: string | null;
  created_at?: string;
  updated_at?: string;
}

export const mapView = (v: RawView) => ({
  id: v.id ?? 0,
  title: v.title ?? '',
  active: v.active ?? false,
  description: v.description ?? '',
  created_at: v.created_at ?? '',
  updated_at: v.updated_at ?? '',
});

// --- Search Result ---

export const searchResultSchema = z.object({
  id: z.number().describe('Result ID'),
  result_type: z.string().describe('Result type (ticket, user, organization, group)'),
  subject: z.string().describe('Subject or name of the result'),
  status: z.string().describe('Status (for tickets)'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  updated_at: z.string().describe('ISO 8601 last update timestamp'),
});

export interface RawSearchResult {
  id?: number;
  result_type?: string;
  subject?: string;
  name?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
}

export const mapSearchResult = (r: RawSearchResult) => ({
  id: r.id ?? 0,
  result_type: r.result_type ?? '',
  subject: r.subject ?? r.name ?? '',
  status: r.status ?? '',
  created_at: r.created_at ?? '',
  updated_at: r.updated_at ?? '',
});
