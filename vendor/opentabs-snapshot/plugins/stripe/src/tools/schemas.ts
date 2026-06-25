import { z } from 'zod';

// --- Shared Stripe list response type ---

export interface StripeList<T> {
  object?: string;
  data?: T[];
  has_more?: boolean;
  url?: string;
}

// --- Customer ---

export const customerSchema = z.object({
  id: z.string().describe('Customer ID (e.g., cus_xxx)'),
  name: z.string().describe('Customer name'),
  email: z.string().describe('Customer email'),
  phone: z.string().describe('Customer phone number'),
  description: z.string().describe('Customer description'),
  currency: z.string().describe('Default currency (e.g., usd)'),
  balance: z.number().describe('Account balance in smallest currency unit'),
  created: z.number().describe('Creation timestamp (Unix epoch seconds)'),
  livemode: z.boolean().describe('Whether this is a live mode object'),
  delinquent: z.boolean().describe('Whether the customer has unpaid invoices'),
  metadata: z.record(z.string(), z.string()).describe('Arbitrary key-value metadata'),
});

export interface RawCustomer {
  id?: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  description?: string | null;
  currency?: string | null;
  balance?: number;
  created?: number;
  livemode?: boolean;
  delinquent?: boolean;
  metadata?: Record<string, string>;
}

export const mapCustomer = (c: RawCustomer) => ({
  id: c.id ?? '',
  name: c.name ?? '',
  email: c.email ?? '',
  phone: c.phone ?? '',
  description: c.description ?? '',
  currency: c.currency ?? '',
  balance: c.balance ?? 0,
  created: c.created ?? 0,
  livemode: c.livemode ?? false,
  delinquent: c.delinquent ?? false,
  metadata: c.metadata ?? {},
});

// --- Product ---

export const productSchema = z.object({
  id: z.string().describe('Product ID (e.g., prod_xxx)'),
  name: z.string().describe('Product name'),
  description: z.string().describe('Product description'),
  active: z.boolean().describe('Whether the product is available for purchase'),
  created: z.number().describe('Creation timestamp (Unix epoch seconds)'),
  livemode: z.boolean().describe('Whether this is a live mode object'),
  default_price: z.string().describe('Default price ID'),
  metadata: z.record(z.string(), z.string()).describe('Arbitrary key-value metadata'),
});

export interface RawProduct {
  id?: string;
  name?: string;
  description?: string | null;
  active?: boolean;
  created?: number;
  livemode?: boolean;
  default_price?: string | null | { id?: string };
  metadata?: Record<string, string>;
}

export const mapProduct = (p: RawProduct) => ({
  id: p.id ?? '',
  name: p.name ?? '',
  description: p.description ?? '',
  active: p.active ?? false,
  created: p.created ?? 0,
  livemode: p.livemode ?? false,
  default_price: typeof p.default_price === 'string' ? p.default_price : (p.default_price?.id ?? ''),
  metadata: p.metadata ?? {},
});

// --- Price ---

export const priceSchema = z.object({
  id: z.string().describe('Price ID (e.g., price_xxx)'),
  product: z.string().describe('Product ID this price belongs to'),
  active: z.boolean().describe('Whether the price is available for purchase'),
  currency: z.string().describe('Currency code (e.g., usd)'),
  unit_amount: z.number().nullable().describe('Price in smallest currency unit (e.g., cents), null for custom'),
  type: z.string().describe('Price type: one_time or recurring'),
  recurring_interval: z.string().describe('Billing interval: day, week, month, or year (empty if one-time)'),
  recurring_interval_count: z.number().describe('Number of intervals between billings (0 if one-time)'),
  billing_scheme: z.string().describe('Billing scheme: per_unit or tiered'),
  created: z.number().describe('Creation timestamp (Unix epoch seconds)'),
  livemode: z.boolean().describe('Whether this is a live mode object'),
  metadata: z.record(z.string(), z.string()).describe('Arbitrary key-value metadata'),
});

export interface RawPrice {
  id?: string;
  product?: string | { id?: string };
  active?: boolean;
  currency?: string;
  unit_amount?: number | null;
  type?: string;
  recurring?: { interval?: string; interval_count?: number } | null;
  billing_scheme?: string;
  created?: number;
  livemode?: boolean;
  metadata?: Record<string, string>;
}

export const mapPrice = (p: RawPrice) => ({
  id: p.id ?? '',
  product: typeof p.product === 'string' ? p.product : (p.product?.id ?? ''),
  active: p.active ?? false,
  currency: p.currency ?? '',
  unit_amount: p.unit_amount ?? null,
  type: p.type ?? '',
  recurring_interval: p.recurring?.interval ?? '',
  recurring_interval_count: p.recurring?.interval_count ?? 0,
  billing_scheme: p.billing_scheme ?? '',
  created: p.created ?? 0,
  livemode: p.livemode ?? false,
  metadata: p.metadata ?? {},
});

// --- Payment Intent ---

export const paymentIntentSchema = z.object({
  id: z.string().describe('PaymentIntent ID (e.g., pi_xxx)'),
  amount: z.number().describe('Amount in smallest currency unit (e.g., cents)'),
  currency: z.string().describe('Currency code (e.g., usd)'),
  status: z
    .string()
    .describe(
      'Status: requires_payment_method, requires_confirmation, requires_action, processing, requires_capture, canceled, succeeded',
    ),
  customer: z.string().describe('Customer ID if attached'),
  description: z.string().describe('Description of the payment'),
  payment_method: z.string().describe('Payment method ID'),
  created: z.number().describe('Creation timestamp (Unix epoch seconds)'),
  livemode: z.boolean().describe('Whether this is a live mode object'),
  metadata: z.record(z.string(), z.string()).describe('Arbitrary key-value metadata'),
});

export interface RawPaymentIntent {
  id?: string;
  amount?: number;
  currency?: string;
  status?: string;
  customer?: string | null | { id?: string };
  description?: string | null;
  payment_method?: string | null | { id?: string };
  created?: number;
  livemode?: boolean;
  metadata?: Record<string, string>;
}

export const mapPaymentIntent = (pi: RawPaymentIntent) => ({
  id: pi.id ?? '',
  amount: pi.amount ?? 0,
  currency: pi.currency ?? '',
  status: pi.status ?? '',
  customer: typeof pi.customer === 'string' ? pi.customer : (pi.customer?.id ?? ''),
  description: pi.description ?? '',
  payment_method: typeof pi.payment_method === 'string' ? pi.payment_method : (pi.payment_method?.id ?? ''),
  created: pi.created ?? 0,
  livemode: pi.livemode ?? false,
  metadata: pi.metadata ?? {},
});

// --- Invoice ---

export const invoiceSchema = z.object({
  id: z.string().describe('Invoice ID (e.g., in_xxx)'),
  number: z.string().describe('Invoice number'),
  customer: z.string().describe('Customer ID'),
  status: z.string().describe('Status: draft, open, paid, uncollectible, void'),
  currency: z.string().describe('Currency code (e.g., usd)'),
  amount_due: z.number().describe('Amount due in smallest currency unit'),
  amount_paid: z.number().describe('Amount paid in smallest currency unit'),
  amount_remaining: z.number().describe('Amount remaining in smallest currency unit'),
  total: z.number().describe('Total in smallest currency unit'),
  due_date: z.number().nullable().describe('Due date (Unix epoch seconds)'),
  created: z.number().describe('Creation timestamp (Unix epoch seconds)'),
  livemode: z.boolean().describe('Whether this is a live mode object'),
  hosted_invoice_url: z.string().describe('URL for the hosted invoice page'),
  metadata: z.record(z.string(), z.string()).describe('Arbitrary key-value metadata'),
});

export interface RawInvoice {
  id?: string;
  number?: string | null;
  customer?: string | null | { id?: string };
  status?: string;
  currency?: string;
  amount_due?: number;
  amount_paid?: number;
  amount_remaining?: number;
  total?: number;
  due_date?: number | null;
  created?: number;
  livemode?: boolean;
  hosted_invoice_url?: string | null;
  metadata?: Record<string, string>;
}

export const mapInvoice = (i: RawInvoice) => ({
  id: i.id ?? '',
  number: i.number ?? '',
  customer: typeof i.customer === 'string' ? i.customer : (i.customer?.id ?? ''),
  status: i.status ?? '',
  currency: i.currency ?? '',
  amount_due: i.amount_due ?? 0,
  amount_paid: i.amount_paid ?? 0,
  amount_remaining: i.amount_remaining ?? 0,
  total: i.total ?? 0,
  due_date: i.due_date ?? null,
  created: i.created ?? 0,
  livemode: i.livemode ?? false,
  hosted_invoice_url: i.hosted_invoice_url ?? '',
  metadata: i.metadata ?? {},
});

// --- Subscription ---

export const subscriptionSchema = z.object({
  id: z.string().describe('Subscription ID (e.g., sub_xxx)'),
  customer: z.string().describe('Customer ID'),
  status: z
    .string()
    .describe('Status: incomplete, incomplete_expired, trialing, active, past_due, canceled, unpaid, paused'),
  currency: z.string().describe('Currency code (e.g., usd)'),
  current_period_start: z.number().describe('Current period start (Unix epoch seconds)'),
  current_period_end: z.number().describe('Current period end (Unix epoch seconds)'),
  cancel_at_period_end: z.boolean().describe('Whether the subscription cancels at period end'),
  canceled_at: z.number().nullable().describe('Cancellation timestamp (Unix epoch seconds)'),
  created: z.number().describe('Creation timestamp (Unix epoch seconds)'),
  livemode: z.boolean().describe('Whether this is a live mode object'),
  metadata: z.record(z.string(), z.string()).describe('Arbitrary key-value metadata'),
});

export interface RawSubscription {
  id?: string;
  customer?: string | null | { id?: string };
  status?: string;
  currency?: string;
  current_period_start?: number;
  current_period_end?: number;
  cancel_at_period_end?: boolean;
  canceled_at?: number | null;
  created?: number;
  livemode?: boolean;
  metadata?: Record<string, string>;
}

export const mapSubscription = (s: RawSubscription) => ({
  id: s.id ?? '',
  customer: typeof s.customer === 'string' ? s.customer : (s.customer?.id ?? ''),
  status: s.status ?? '',
  currency: s.currency ?? '',
  current_period_start: s.current_period_start ?? 0,
  current_period_end: s.current_period_end ?? 0,
  cancel_at_period_end: s.cancel_at_period_end ?? false,
  canceled_at: s.canceled_at ?? null,
  created: s.created ?? 0,
  livemode: s.livemode ?? false,
  metadata: s.metadata ?? {},
});

// --- Balance ---

export const balanceSchema = z.object({
  available: z
    .array(
      z.object({
        amount: z.number().describe('Available balance in smallest currency unit'),
        currency: z.string().describe('Currency code'),
      }),
    )
    .describe('Available balance per currency'),
  pending: z
    .array(
      z.object({
        amount: z.number().describe('Pending balance in smallest currency unit'),
        currency: z.string().describe('Currency code'),
      }),
    )
    .describe('Pending balance per currency'),
  livemode: z.boolean().describe('Whether this is a live mode object'),
});

export interface RawBalance {
  available?: Array<{ amount?: number; currency?: string }>;
  pending?: Array<{ amount?: number; currency?: string }>;
  livemode?: boolean;
}

export const mapBalance = (b: RawBalance) => ({
  available: (b.available ?? []).map(a => ({
    amount: a.amount ?? 0,
    currency: a.currency ?? '',
  })),
  pending: (b.pending ?? []).map(p => ({
    amount: p.amount ?? 0,
    currency: p.currency ?? '',
  })),
  livemode: b.livemode ?? false,
});

// --- Balance Transaction ---

export const balanceTransactionSchema = z.object({
  id: z.string().describe('Balance transaction ID (e.g., txn_xxx)'),
  amount: z.number().describe('Gross amount in smallest currency unit'),
  currency: z.string().describe('Currency code'),
  net: z.number().describe('Net amount after fees'),
  fee: z.number().describe('Fees deducted'),
  type: z.string().describe('Transaction type: charge, refund, adjustment, payout, transfer, etc.'),
  status: z.string().describe('Status: available or pending'),
  description: z.string().describe('Transaction description'),
  source: z.string().describe('Source object ID (e.g., charge ID)'),
  created: z.number().describe('Creation timestamp (Unix epoch seconds)'),
  available_on: z.number().describe('When the funds become available (Unix epoch seconds)'),
});

export interface RawBalanceTransaction {
  id?: string;
  amount?: number;
  currency?: string;
  net?: number;
  fee?: number;
  type?: string;
  status?: string;
  description?: string | null;
  source?: string | null | { id?: string };
  created?: number;
  available_on?: number;
}

export const mapBalanceTransaction = (bt: RawBalanceTransaction) => ({
  id: bt.id ?? '',
  amount: bt.amount ?? 0,
  currency: bt.currency ?? '',
  net: bt.net ?? 0,
  fee: bt.fee ?? 0,
  type: bt.type ?? '',
  status: bt.status ?? '',
  description: bt.description ?? '',
  source: typeof bt.source === 'string' ? bt.source : (bt.source?.id ?? ''),
  created: bt.created ?? 0,
  available_on: bt.available_on ?? 0,
});

// --- Event ---

export const eventSchema = z.object({
  id: z.string().describe('Event ID (e.g., evt_xxx)'),
  type: z.string().describe('Event type (e.g., customer.created, payment_intent.succeeded)'),
  created: z.number().describe('Creation timestamp (Unix epoch seconds)'),
  livemode: z.boolean().describe('Whether this is a live mode event'),
  request_id: z.string().describe('ID of the API request that caused the event'),
});

export interface RawEvent {
  id?: string;
  type?: string;
  created?: number;
  livemode?: boolean;
  request?: { id?: string } | null;
}

export const mapEvent = (e: RawEvent) => ({
  id: e.id ?? '',
  type: e.type ?? '',
  created: e.created ?? 0,
  livemode: e.livemode ?? false,
  request_id: e.request?.id ?? '',
});
