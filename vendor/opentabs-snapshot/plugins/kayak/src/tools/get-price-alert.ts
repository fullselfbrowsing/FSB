// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../kayak-api.js';

export const getPriceAlert = defineTool({
  name: 'get_price_alert',
  displayName: 'Get Price Alert',
  description: 'Get the details and latest tracked price of a single saved KAYAK price alert by its ID.',
  summary: 'look up a kayak price alert',
  icon: 'bell',
  group: 'Price Alerts',
  input: z.object({
    alert_id: z.string().min(1).describe('The price alert ID to fetch'),
  }),
  output: z.object({
    alert: z.object({
      id: z.string(),
      route: z.string(),
      current_price: z.number(),
    }).describe('The price alert detail'),
  }),
  handle: async (params: { alert_id: string }) => {
    // NEVER executed by the importer. Upstream: api GET /v1/price-alerts/:id (default method).
    const data = await api<{ alert: { id: string; route: string; current_price: number } }>(
      `/v1/price-alerts/${params.alert_id}`
    );
    return { alert: data.alert };
  },
});
