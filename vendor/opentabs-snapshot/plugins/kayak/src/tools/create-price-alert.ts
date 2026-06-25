// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../kayak-api.js';

export const createPriceAlert = defineTool({
  name: 'create_price_alert',
  displayName: 'Create Price Alert',
  description:
    'Create a KAYAK price alert: track the price of a flight or hotel route and get notified when it changes. This stages a price-watch only -- it does NOT book anything or charge a card.',
  summary: 'create a price alert on kayak',
  icon: 'bell-plus',
  group: 'Price Alerts',
  input: z.object({
    kind: z.enum(['flight', 'hotel']).describe('Whether to watch a flight or a hotel route'),
    origin: z.string().optional().describe('Departure airport or city (for a flight alert)'),
    destination: z.string().min(1).describe('Destination airport, city, or hotel area to watch'),
    target_price: z.number().optional().describe('Optional price threshold to notify below'),
  }),
  output: z.object({
    alert: z.object({
      id: z.string(),
      route: z.string(),
    }).describe('The created price alert'),
  }),
  handle: async (params: { kind: 'flight' | 'hotel'; origin?: string; destination: string; target_price?: number }) => {
    // NEVER executed by the importer. Upstream: api POST /v1/price-alerts -- CREATES a price-watch
    // (create -> a side-effect WRITE_VERB, reinforced by the {method:'POST'} literal -> classes write;
    // BUT 'create' is NOT a PAYMENT_VERB and 'create_price_alert' is NOT a PAYMENT_OP_NAME, so this is
    // a BENIGN write, NOT a payment op -- the guard does not key on it). backing:'dom' keeps it DOM-only.
    const data = await api<{ alert: { id: string; route: string } }>('/v1/price-alerts', {
      method: 'POST',
      body: {
        kind: params.kind,
        origin: params.origin,
        destination: params.destination,
        target_price: params.target_price,
      },
    });
    return { alert: data.alert };
  },
});
