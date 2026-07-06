import { z } from 'zod';

// --- Account ---

export const accountSchema = z.object({
  acct_num: z.string().describe('Account number'),
  acct_type: z.string().describe('Account type (e.g., Brokerage, WPS)'),
  acct_sub_type: z.string().describe('Account sub-type (e.g., Brokerage, Defined Contributions)'),
  acct_sub_type_desc: z.string().describe('Account sub-type description'),
  name: z.string().describe('Custom account name'),
  is_hidden: z.boolean().describe('Whether the account is hidden'),
  is_retirement: z.boolean().describe('Whether this is a retirement account'),
  is_tradable: z.boolean().describe('Whether trading is enabled'),
  reg_type_desc: z.string().describe('Registration type description'),
  total_market_value: z.number().describe('Total market value in USD'),
  todays_gain_loss: z.number().describe("Today's gain/loss in USD"),
  todays_gain_loss_pct: z.number().describe("Today's gain/loss percentage"),
  as_of_date_time: z.string().describe('As-of timestamp for the balance'),
  has_unpriced_positions: z.boolean().describe('Whether there are unpriced positions'),
});

export interface RawAsset {
  acctNum?: string;
  acctType?: string;
  acctSubType?: string;
  acctSubTypeDesc?: string;
  preferenceDetail?: {
    name?: string;
    isHidden?: boolean;
    isDefaultAcct?: boolean;
  };
  acctTypesIndDetail?: {
    isRetirement?: boolean;
  };
  acctTradeAttrDetail?: {
    isTradable?: boolean;
  };
  acctAttrDetail?: {
    regTypeDesc?: string;
  };
  gainLossBalanceDetail?: {
    totalMarketVal?: number;
    todaysGainLoss?: number;
    todaysGainLossPct?: number;
    asOfDateTime?: string;
    hasUnpricedPositions?: boolean;
  };
  workplacePlanDetail?: {
    planName?: string;
  };
}

export const mapAccount = (a: RawAsset) => ({
  acct_num: a.acctNum ?? '',
  acct_type: a.acctType ?? '',
  acct_sub_type: a.acctSubType ?? '',
  acct_sub_type_desc: a.acctSubTypeDesc ?? '',
  name: a.preferenceDetail?.name ?? a.workplacePlanDetail?.planName ?? a.acctSubTypeDesc ?? '',
  is_hidden: a.preferenceDetail?.isHidden ?? false,
  is_retirement: a.acctTypesIndDetail?.isRetirement ?? false,
  is_tradable: a.acctTradeAttrDetail?.isTradable ?? false,
  reg_type_desc: a.acctAttrDetail?.regTypeDesc ?? '',
  total_market_value: a.gainLossBalanceDetail?.totalMarketVal ?? 0,
  todays_gain_loss: a.gainLossBalanceDetail?.todaysGainLoss ?? 0,
  todays_gain_loss_pct: a.gainLossBalanceDetail?.todaysGainLossPct ?? 0,
  as_of_date_time: a.gainLossBalanceDetail?.asOfDateTime ?? '',
  has_unpriced_positions: a.gainLossBalanceDetail?.hasUnpricedPositions ?? false,
});

// --- Position ---

export const positionSchema = z.object({
  symbol: z.string().describe('Ticker symbol'),
  cusip: z.string().describe('CUSIP identifier'),
  security_description: z.string().describe('Security name/description'),
  security_type: z.string().describe('Security type (e.g., Equity, Mutual Fund)'),
  security_sub_type: z.string().describe('Security sub-type'),
  quantity: z.number().describe('Number of shares/units held'),
  market_value: z.number().describe('Current market value in USD'),
  total_gain_loss: z.number().describe('Total gain/loss in USD'),
  holding_pct: z.number().describe('Percentage of portfolio'),
  has_intraday_pricing: z.boolean().describe('Whether intraday pricing is available'),
  acct_num: z.string().describe('Account number this position belongs to'),
});

export interface RawPosition {
  symbol?: string;
  cusip?: string;
  securityDescription?: string;
  securityType?: string;
  securitySubType?: string;
  quantity?: number;
  marketValDetail?: {
    marketVal?: number;
    totalGainLoss?: number;
  };
  holdingPct?: number;
  hasIntradayPricingInd?: boolean;
}

export const mapPosition = (p: RawPosition, acctNum: string) => ({
  symbol: p.symbol ?? '',
  cusip: p.cusip ?? '',
  security_description: p.securityDescription ?? '',
  security_type: p.securityType ?? '',
  security_sub_type: p.securitySubType ?? '',
  quantity: p.quantity ?? 0,
  market_value: p.marketValDetail?.marketVal ?? 0,
  total_gain_loss: p.marketValDetail?.totalGainLoss ?? 0,
  holding_pct: p.holdingPct ?? 0,
  has_intraday_pricing: p.hasIntradayPricingInd ?? false,
  acct_num: acctNum,
});

// --- Quote ---

export const quoteSchema = z.object({
  symbol: z.string().describe('Ticker symbol'),
  name: z.string().describe('Security name'),
  last_price: z.number().describe('Last traded price'),
  net_change_today: z.number().describe("Today's net price change"),
  pct_change_today: z.number().describe("Today's percentage change"),
  last_date: z.string().describe('Date of last trade'),
  last_time: z.string().describe('Time of last trade'),
  security_type: z.string().describe('Security type'),
  instrument_type: z.string().describe('Instrument type'),
});

export interface RawQuote {
  status?: { errorCode?: string; errorText?: string };
  requestSymbol?: string;
  quoteData?: {
    symbol?: string;
    name?: string;
    lastPrice?: string | number;
    netChgToday?: string | number;
    pctChgToday?: string | number;
    lastDate?: string;
    lastTime?: string;
    securityType?: string;
    instrumentType?: string;
  };
}

const toNum = (v: string | number | undefined): number => {
  if (v === undefined || v === null) return 0;
  if (typeof v === 'number') return v;
  const n = Number.parseFloat(v);
  return Number.isNaN(n) ? 0 : n;
};

export const mapQuote = (q: RawQuote) => ({
  symbol: q.quoteData?.symbol ?? q.requestSymbol ?? '',
  name: q.quoteData?.name ?? '',
  last_price: toNum(q.quoteData?.lastPrice),
  net_change_today: toNum(q.quoteData?.netChgToday),
  pct_change_today: toNum(q.quoteData?.pctChgToday),
  last_date: q.quoteData?.lastDate ?? '',
  last_time: q.quoteData?.lastTime ?? '',
  security_type: q.quoteData?.securityType ?? '',
  instrument_type: q.quoteData?.instrumentType ?? '',
});

// --- Market Mover ---

export const marketMoverSchema = z.object({
  symbol: z.string().describe('Ticker symbol'),
  description: z.string().describe('Security name/description'),
  volume: z.number().describe('Trading volume'),
  pct_change: z.number().describe('Percentage change'),
  last_date: z.string().describe('Date of last trade'),
  last_time: z.string().describe('Time of last trade'),
});

export interface RawMarketMover {
  symbol?: string;
  description?: string;
  volume?: number;
  pctChg?: number;
  lastDate?: string;
  lastTime?: string;
}

export const mapMarketMover = (m: RawMarketMover) => ({
  symbol: m.symbol ?? '',
  description: m.description ?? '',
  volume: m.volume ?? 0,
  pct_change: m.pctChg ?? 0,
  last_date: m.lastDate ?? '',
  last_time: m.lastTime ?? '',
});

// --- Balance History ---

export const balancePointSchema = z.object({
  date: z.string().describe('Date (YYYY-MM-DD)'),
  value: z.number().describe('Portfolio balance value in USD'),
});

// --- News ---

export const newsItemSchema = z.object({
  text: z.string().describe('News headline text'),
  wire_name: z.string().describe('News wire source name'),
  received_date: z.string().describe('Date received'),
  received_time: z.string().describe('Time received'),
  symbols: z.array(z.string()).describe('Related ticker symbols'),
});

export interface RawNewsItem {
  text?: string;
  wirename?: string;
  receivedDate?: string;
  receivedTime?: string;
  resDate?: string;
  resTime?: string;
  symbols?: string[];
}

export const mapNewsItem = (n: RawNewsItem) => ({
  text: n.text ?? '',
  wire_name: n.wirename ?? '',
  received_date: n.receivedDate ?? n.resDate ?? '',
  received_time: n.receivedTime ?? n.resTime ?? '',
  symbols: n.symbols ?? [],
});

// --- Customer Order Flow ---

export const orderFlowSchema = z.object({
  symbol: z.string().describe('Ticker symbol'),
  buys_pct: z.number().describe('Percentage of buy orders'),
  sells_pct: z.number().describe('Percentage of sell orders'),
  todays_change_pct: z.number().describe("Today's price change percentage"),
  timestamp: z.string().describe('Timestamp of order data'),
});

export interface RawOrderFlow {
  symbol?: string;
  buysPct?: number;
  sellsPct?: number;
  todaysChgPct?: number;
  timestamp?: string;
}

export const mapOrderFlow = (o: RawOrderFlow) => ({
  symbol: o.symbol ?? '',
  buys_pct: o.buysPct ?? 0,
  sells_pct: o.sellsPct ?? 0,
  todays_change_pct: o.todaysChgPct ?? 0,
  timestamp: o.timestamp ?? '',
});

// --- Portfolio Event ---

export const portfolioEventSchema = z.object({
  date: z.string().describe('Event date'),
  days: z.number().describe('Days from today (negative = past)'),
  type: z.string().describe('Event type (earnings, dividends, fifty_two_week_high, fifty_two_week_low)'),
  symbol: z.string().describe('Ticker symbol'),
  description: z.string().describe('Security description'),
  last_price: z.number().describe('Last price'),
  change_since_closing_pct: z.number().describe('Percentage change since closing'),
});

interface RawEventDetail {
  securityDetail?: { symbol?: string; secDesc?: string };
  reportDate?: string;
  exDivDate?: string;
  changeSinceClosingPct?: number;
  lastPrice?: number;
  lastPriceDate?: string;
  low?: number;
  high?: number;
}

export interface RawPortfolioEvent {
  date?: string;
  days?: number;
  earnings?: RawEventDetail[];
  dividends?: RawEventDetail[];
  fiftyTwoWeekHigh?: RawEventDetail[];
  fiftyTwoWeekLow?: RawEventDetail[];
}

export const mapPortfolioEvents = (e: RawPortfolioEvent) => {
  const results: Array<{
    date: string;
    days: number;
    type: string;
    symbol: string;
    description: string;
    last_price: number;
    change_since_closing_pct: number;
  }> = [];

  const addEvents = (items: RawEventDetail[] | undefined | null, type: string) => {
    if (!items) return;
    for (const item of items) {
      results.push({
        date: e.date ?? '',
        days: e.days ?? 0,
        type,
        symbol: item.securityDetail?.symbol ?? '',
        description: item.securityDetail?.secDesc ?? '',
        last_price: item.lastPrice ?? 0,
        change_since_closing_pct: item.changeSinceClosingPct ?? 0,
      });
    }
  };

  addEvents(e.earnings, 'earnings');
  addEvents(e.dividends, 'dividends');
  addEvents(e.fiftyTwoWeekHigh, 'fifty_two_week_high');
  addEvents(e.fiftyTwoWeekLow, 'fifty_two_week_low');

  return results;
};

// --- Contribution Data ---

export const contributionSchema = z.object({
  current_year: z.number().describe('Current tax year'),
  prior_year: z.number().describe('Prior tax year'),
  prior_year_cutoff_date: z.string().describe('Cutoff date for prior year contributions'),
  individual_contrib_ytd: z.number().describe('Individual contributions year-to-date'),
  individual_limit: z.number().describe('Individual contribution limit'),
  employer_contrib_ytd: z.number().describe('Employer contributions year-to-date'),
  employer_limit: z.number().describe('Employer contribution limit'),
  is_catch_up_eligible: z.boolean().describe('Whether catch-up eligible'),
});
