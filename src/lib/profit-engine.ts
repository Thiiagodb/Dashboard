/**
 * Core Financial, Status Classification, Anti-Test Filter, and Timezone (-03:00) Engine
 * Shared across Server API Routes (/api/ads/sync, /api/cartpanda/sync, /api/webhooks/cartpanda) and Client UI.
 */

export type OrderStatus =
  | 'approved'
  | 'paid_unfulfilled'
  | 'pending'
  | 'abandoned'
  | 'canceled'
  | 'refunded';

export type PaymentMethod = 'pix' | 'credit_card' | 'billet';

export type DatePeriodFilter = 'today' | 'yesterday' | '7d' | 'month' | 'custom' | 'all';

export interface OrderRecord {
  id: string;
  ownerId: string;
  orderNumber: string;
  cartpandaId: string;
  shopifyId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  installments: number;
  grossAmount: number;
  netAmount: number;
  checkoutFee: number;
  gatewayFee: number;
  shippingCost: number;
  taxAmount: number;
  cogsAmount: number;
  netProfit: number;
  profitMargin: number;
  utmSource: string;
  utmCampaign: string;
  utmMedium: string;
  utmContent: string;
  utmTerm: string;
  orderDate: string; // ISO string in -03:00
  itemsSummary: string;
}

export interface OrderItemRecord {
  id: string;
  ownerId: string;
  orderId: string;
  productId: string;
  title: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  totalPrice: number;
  totalCost: number;
}

export interface ProductRecord {
  id: string;
  ownerId: string;
  shopifyId: string;
  title: string;
  sku: string;
  imageUrl: string;
  price: number;
  costPrice: number;
  stockQuantity: number;
  active: boolean;
}

export interface AdSpendRecord {
  id: string;
  ownerId: string;
  date: string; // Standardized YYYY-MM-DDT12:00:00-03:00
  utmCampaign: string;
  utmSource: string;
  spend: number;
  clicks: number;
  impressions: number;
}

export interface CustomExpenseRecord {
  id: string;
  ownerId: string;
  name: string;
  type: 'out' | 'in';
  amount: number;
  recurrence: 'monthly' | 'weekly' | 'one_time';
  startDate: string;
}

export interface SettingsRecord {
  id: string;
  ownerId: string;
  storeName: string;
  taxRate: number;
  cartpandaOrderFeePercent: number; // Taxa percentual da plataforma Cartpanda por pedido (ex: 1.5% Pro, 2.5% Starter)
  cartpandaPixFeePercent: number;
  cartpandaPixFeeFixed: number;
  cartpandaCardFeePercent: number;
  cartpandaCardFeeFixed: number;
  cartpandaBilletFeeFixed: number;
  metaAccessToken: string;
  metaAdAccountId: string;
  lastSyncAt: string;
  cartpandaApiToken: string;
  cartpandaStoreSlug: string;
  lastCartpandaSyncAt: string;
  blockedTestPhones: string;
  dashboardPassword?: string;
}

export const DEFAULT_SETTINGS: Omit<SettingsRecord, 'id' | 'ownerId'> = {
  storeName: 'Minha Loja E-commerce',
  taxRate: 4.5, // Simples Nacional 4.5%
  cartpandaOrderFeePercent: 1.5, // Taxa percentual Cartpanda por pedido
  cartpandaPixFeePercent: 0.99,
  cartpandaPixFeeFixed: 0.0,
  cartpandaCardFeePercent: 4.99,
  cartpandaCardFeeFixed: 1.0,
  cartpandaBilletFeeFixed: 3.49,
  metaAccessToken: '',
  metaAdAccountId: '',
  lastSyncAt: '',
  cartpandaApiToken: '',
  cartpandaStoreSlug: '',
  lastCartpandaSyncAt: '',
  blockedTestPhones: '(41) 99582-4010, 41995824010, (11) 99999-9999',
  dashboardPassword: 'thiagodj97',
};

export const DEMO_SEED_ORDER_NUMBERS = new Set([
  '#CP-10492',
  '#CP-10491',
  '#CP-10490',
  '#AB-8094',
  '#CP-10489',
  '#CP-10488',
  '#CP-10487',
  '#CP-10486',
  '#CP-10485',
  '#CP-10484',
  '#CP-10483',
  '#CP-10482',
]);

/**
 * Timezone Helpers: America/Sao_Paulo (-03:00)
 */
export function toSaoPauloDateKey(isoOrDate: string | Date): string {
  try {
    if (typeof isoOrDate === 'string') {
      const trimmed = isoOrDate.trim();
      // If already YYYY-MM-DD format, return as is (never shift backward due to UTC midnight)
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return trimmed;
      }
      // If starts with YYYY-MM-DD and contains Brasilia -03:00 or noon indicator
      if (/^\d{4}-\d{2}-\d{2}T.*-03:00$/.test(trimmed)) {
        return trimmed.slice(0, 10);
      }
      const d = new Date(trimmed);
      if (isNaN(d.getTime())) {
        return new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Sao_Paulo',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date());
      }
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d);
    }
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(isoOrDate);
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }
}

export function toStandardBrasiliaNoon(dateStrOrIso: string): string {
  const ymd =
    dateStrOrIso.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(dateStrOrIso)
      ? dateStrOrIso.slice(0, 10)
      : toSaoPauloDateKey(dateStrOrIso);
  return `${ymd}T12:00:00-03:00`;
}

export function formatSaoPauloDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return iso;
  }
}

export function formatSaoPauloDayMonth(dateKey: string): string {
  const parts = dateKey.split('-');
  if (parts.length < 3) return dateKey;
  return `${parts[2]}/${parts[1]}`;
}

export function getSaoPauloDaysAgoIso(daysAgo: number, hour = 14, minute = 30): string {
  const now = new Date();
  const target = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  const ymd = toSaoPauloDateKey(target);
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return `${ymd}T${hh}:${mm}:00-03:00`;
}

export function isDateInPeriod(
  isoOrDate: string,
  period: DatePeriodFilter,
  referenceNow: Date = new Date(),
  customRange?: { start?: string; end?: string }
): boolean {
  if (period === 'all') return true;
  const itemKey = toSaoPauloDateKey(isoOrDate);
  const todayKey = toSaoPauloDateKey(referenceNow);

  if (period === 'custom') {
    if (!customRange) return true;
    const startKey = customRange.start ? customRange.start.slice(0, 10) : '';
    const endKey = customRange.end ? customRange.end.slice(0, 10) : '';
    if (startKey && endKey) {
      const min = startKey <= endKey ? startKey : endKey;
      const max = startKey <= endKey ? endKey : startKey;
      return itemKey >= min && itemKey <= max;
    }
    if (startKey) return itemKey >= startKey;
    if (endKey) return itemKey <= endKey;
    return true;
  }

  if (period === 'today') {
    return itemKey === todayKey;
  }

  const yesterdayDate = new Date(referenceNow.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayKey = toSaoPauloDateKey(yesterdayDate);

  if (period === 'yesterday') {
    return itemKey === yesterdayKey;
  }

  if (period === '7d') {
    const sevenDaysAgo = new Date(referenceNow.getTime() - 6 * 24 * 60 * 60 * 1000);
    const minKey = toSaoPauloDateKey(sevenDaysAgo);
    return itemKey >= minKey && itemKey <= todayKey;
  }

  if (period === 'month') {
    const currentYearMonth = todayKey.slice(0, 7);
    return itemKey.startsWith(currentYearMonth);
  }

  return true;
}

/**
 * Rule 1: Paid & Unfulfilled Status Helper
 * On Dashboard Overview and DRE, 'paid_unfulfilled' MUST be treated and summed
 * EXACTLY as an approved/paid order.
 */
export function isPaidOrderStatus(status: OrderStatus): boolean {
  return status === 'approved' || status === 'paid_unfulfilled';
}

/**
 * Extracts real customer name from any Cartpanda/Shopify customer or address structure
 */
export function extractCustomerName(raw: any): string {
  if (!raw) return 'Cliente Não Identificado';
  if (raw.customer) {
    if (raw.customer.name && String(raw.customer.name).trim()) return String(raw.customer.name).trim();
    if (raw.customer.full_name && String(raw.customer.full_name).trim()) return String(raw.customer.full_name).trim();
    const first = String(raw.customer.first_name || '').trim();
    const last = String(raw.customer.last_name || '').trim();
    const full = `${first} ${last}`.trim();
    if (full) return full;
  }
  if (raw.shipping_address) {
    if (raw.shipping_address.name && String(raw.shipping_address.name).trim()) return String(raw.shipping_address.name).trim();
    const first = String(raw.shipping_address.first_name || '').trim();
    const last = String(raw.shipping_address.last_name || '').trim();
    const full = `${first} ${last}`.trim();
    if (full) return full;
  }
  if (raw.billing_address) {
    if (raw.billing_address.name && String(raw.billing_address.name).trim()) return String(raw.billing_address.name).trim();
    const first = String(raw.billing_address.first_name || '').trim();
    const last = String(raw.billing_address.last_name || '').trim();
    const full = `${first} ${last}`.trim();
    if (full) return full;
  }
  if (raw.customer_name && String(raw.customer_name).trim()) return String(raw.customer_name).trim();
  if (raw.client_name && String(raw.client_name).trim()) return String(raw.client_name).trim();
  if (raw.customerName && String(raw.customerName).trim()) return String(raw.customerName).trim();
  if (raw.client?.name && String(raw.client.name).trim()) return String(raw.client.name).trim();
  if (raw.customer?.email) return String(raw.customer.email).split('@')[0];
  if (raw.customerEmail) return String(raw.customerEmail).split('@')[0];
  return 'Cliente E-commerce';
}

/**
 * Correctly extracts payment method preventing credit cards from becoming PIX
 */
export function extractPaymentMethod(raw: any): PaymentMethod {
  if (!raw) return 'pix';

  // 1. Installments > 1 in Brazilian checkouts is exclusively Credit Card
  const installments = Number(
    raw.installments ||
    raw.transaction?.installments ||
    raw.transactions?.[0]?.installments ||
    raw.order_payments?.[0]?.installments ||
    raw.payments?.[0]?.installments ||
    raw.payment_details?.installments ||
    1
  );
  if (installments > 1) {
    return 'credit_card';
  }

  // 2. Explicit card properties, card brands, or card transaction fields
  const cardBrand =
    raw.card_brand ||
    raw.brand ||
    raw.credit_card ||
    raw.last_digits ||
    raw.card_last_digits ||
    raw.first_digits ||
    raw.transaction?.card_brand ||
    raw.transaction?.brand ||
    raw.transaction?.last_digits ||
    raw.transaction?.card_last_digits ||
    raw.transaction?.first_digits ||
    raw.transaction?.authorization_code ||
    raw.transaction?.acquirer ||
    raw.transactions?.[0]?.card_brand ||
    raw.transactions?.[0]?.brand ||
    raw.transactions?.[0]?.last_digits ||
    raw.transactions?.[0]?.authorization_code ||
    raw.order_payments?.[0]?.card_brand ||
    raw.order_payments?.[0]?.brand ||
    raw.payment_details?.card_brand ||
    raw.payment_details?.brand ||
    raw.payment_details?.last_digits;

  if (cardBrand) {
    const cb = toSafeString(cardBrand).toLowerCase();
    if (
      cb.includes('visa') ||
      cb.includes('master') ||
      cb.includes('elo') ||
      cb.includes('amex') ||
      cb.includes('hiper') ||
      cb.includes('diners') ||
      cb.includes('card') ||
      cb.includes('cartao') ||
      cb.includes('credito') ||
      /^\d{4}$/.test(cb)
    ) {
      return 'credit_card';
    }
  }

  // 3. Inspect string candidates across all gateway payload variations
  const candidates: any[] = [
    raw.payment_method,
    raw.payment_type,
    raw.payment_name,
    raw.payment_method_name,
    raw.paymentMethod,
    raw.gateway,
    raw.gateway_id,
    raw.gateway_name,
    raw.payment_gateway,
    raw.payment_gateway_name,
    raw.financial_status,
    raw.status_description,
    raw.transaction?.payment_method,
    raw.transaction?.payment_type,
    raw.transaction?.payment_name,
    raw.transaction?.gateway,
    raw.transaction?.gateway_name,
    raw.transaction?.brand,
    raw.transactions?.[0]?.payment_method,
    raw.transactions?.[0]?.payment_type,
    raw.transactions?.[0]?.payment_name,
    raw.transactions?.[0]?.gateway,
    raw.transactions?.[0]?.brand,
    raw.order_payments?.[0]?.payment_method,
    raw.order_payments?.[0]?.payment_type,
    raw.order_payments?.[0]?.brand,
    raw.payments?.[0]?.payment_method,
    raw.payments?.[0]?.payment_type,
    raw.payment_details?.payment_method,
    raw.payment_details?.method,
    raw.payment_details?.brand,
  ];

  for (const c of candidates) {
    if (!c) continue;
    let s = '';
    if (typeof c === 'object') {
      s = toSafeString(c.name || c.method || c.type || c.brand || c.payment_method || c).toLowerCase();
    } else {
      s = toSafeString(c).toLowerCase();
    }
    if (!s) continue;

    // Check Credit Card first
    if (
      s.includes('card') ||
      s.includes('cartao') ||
      s.includes('cartão') ||
      s.includes('crédito') ||
      s.includes('credito') ||
      s.includes('credit') ||
      s.includes('visa') ||
      s.includes('master') ||
      s.includes('elo') ||
      s.includes('amex') ||
      s.includes('hiper') ||
      s.includes('diners') ||
      s.includes('stripe') ||
      s.includes('cielo') ||
      s.includes('rede') ||
      s.includes('stone')
    ) {
      return 'credit_card';
    }

    // Check Boleto
    if (
      s.includes('billet') ||
      s.includes('boleto') ||
      s.includes('bank_slip') ||
      s.includes('bankslip') ||
      s.includes('barcode')
    ) {
      return 'billet';
    }

    // Check PIX
    if (
      s.includes('pix') ||
      s.includes('qrcode') ||
      s.includes('chave_pix')
    ) {
      return 'pix';
    }
  }

  // 4. Check entire JSON serialized payload for specific signatures if ambiguous
  try {
    const rawStr = JSON.stringify(raw).toLowerCase();
    if (
      rawStr.includes('"payment_method":"credit_card"') ||
      rawStr.includes('cartao') ||
      rawStr.includes('crédito') ||
      rawStr.includes('mastercard') ||
      rawStr.includes('visa') ||
      rawStr.includes('elo') ||
      rawStr.includes('hipercard') ||
      rawStr.includes('amex')
    ) {
      return 'credit_card';
    }
    if (rawStr.includes('boleto') || rawStr.includes('bank_slip')) {
      return 'billet';
    }
    if (rawStr.includes('pix')) {
      return 'pix';
    }
  } catch {
    // ignore
  }

  return 'pix';
}

/**
 * Classifies order status based on payment status, fulfillment and tracking state.
 * Fully supports Cartpanda numeric status 2, paid_at timestamps, completed, etc.
 */
export function classifyOrderStatus(params: {
  financialStatus?: string | number | null;
  status?: string | number | null;
  paymentStatus?: string | number | null;
  paidAt?: string | null;
  fulfillmentStatus?: string | null;
  trackingCode?: string | null;
  isAbandonedCheckout?: boolean;
}): OrderStatus {
  if (params.isAbandonedCheckout) {
    return 'abandoned';
  }

  const fin = String(params.financialStatus || '').trim().toLowerCase();
  const st = String(params.status || '').trim().toLowerCase();
  const pmSt = String(params.paymentStatus || '').trim().toLowerCase();
  const ful = String(params.fulfillmentStatus || '').trim().toLowerCase();
  const hasTracking = Boolean(params.trackingCode && String(params.trackingCode).trim().length > 0);
  const hasPaidAt = Boolean(
    params.paidAt &&
    String(params.paidAt).trim().length > 0 &&
    String(params.paidAt).trim() !== 'null' &&
    String(params.paidAt).trim() !== 'undefined'
  );

  // Refunded
  if (
    fin === 'refunded' ||
    fin === 'reembolsado' ||
    st === 'refunded' ||
    st === 'reembolsado' ||
    st === '4' ||
    pmSt === 'refunded'
  ) {
    return 'refunded';
  }

  // Canceled
  if (
    fin === 'canceled' ||
    fin === 'cancelled' ||
    fin === 'cancelado' ||
    fin === 'voided' ||
    st === 'canceled' ||
    st === 'cancelled' ||
    st === 'cancelado' ||
    st === '3' ||
    pmSt === 'canceled' ||
    pmSt === 'cancelled'
  ) {
    return 'canceled';
  }

  // Abandoned
  if (fin === 'abandoned' || fin === 'abandonado' || st === 'abandoned' || st === 'abandonado') {
    return 'abandoned';
  }

  // Paid checks: covers Cartpanda status 2, "completed", "paid", "processing", "approved", or presence of paidAt
  const isPaid =
    hasPaidAt ||
    fin === 'paid' ||
    fin === 'approved' ||
    fin === 'authorized' ||
    fin === 'partially_paid' ||
    fin === 'pago' ||
    fin === 'aprovado' ||
    fin === 'completed' ||
    fin === 'concluido' ||
    fin === 'concluído' ||
    fin === 'processing' ||
    fin === 'processando' ||
    fin === 'captured' ||
    fin === 'capturado' ||
    fin === 'success' ||
    fin === 'succeeded' ||
    fin === 'paid_unfulfilled' ||
    st === 'paid' ||
    st === 'approved' ||
    st === 'authorized' ||
    st === 'pago' ||
    st === 'aprovado' ||
    st === 'completed' ||
    st === 'concluido' ||
    st === 'concluído' ||
    st === 'processing' ||
    st === 'success' ||
    st === 'succeeded' ||
    st === 'captured' ||
    st === 'capturado' ||
    st === 'closed' ||
    st === 'finished' ||
    st === '2' ||
    pmSt === 'paid' ||
    pmSt === 'approved' ||
    pmSt === 'pago' ||
    pmSt === 'aprovado' ||
    pmSt === 'completed' ||
    pmSt === 'captured' ||
    pmSt === 'success' ||
    pmSt === 'succeeded' ||
    pmSt === 'authorized' ||
    pmSt === '2';

  if (isPaid) {
    const isFulfilled =
      hasTracking ||
      ful === 'fulfilled' ||
      ful === 'delivered' ||
      ful === 'shipped' ||
      ful === 'enviado' ||
      ful === 'entregue';

    if (
      fin === 'paid_unfulfilled' ||
      st === 'paid_unfulfilled' ||
      !isFulfilled
    ) {
      return 'paid_unfulfilled';
    }
    return 'approved';
  }

  return 'pending';
}

/**
 * Safely converts any unknown input (string, number, object, address dict, null, undefined)
 * into a safe primitive string, preventing 'raw.includes is not a function' errors.
 */
export function toSafeString(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (typeof val === 'object') {
    try {
      const obj = val as Record<string, unknown>;
      const street =
        typeof obj.address1 === 'string'
          ? obj.address1
          : typeof obj.street === 'string'
          ? obj.street
          : '';
      const num =
        typeof obj.number === 'string' || typeof obj.number === 'number'
          ? String(obj.number)
          : '';
      const phone =
        typeof obj.phone === 'string' || typeof obj.phone === 'number'
          ? String(obj.phone)
          : '';
      const name = typeof obj.name === 'string' ? obj.name : '';
      if (street || num || phone || name) {
        return [street, num, phone, name].filter(Boolean).join(' ');
      }
      return JSON.stringify(val);
    } catch {
      return '';
    }
  }
  return String(val);
}

/**
 * Rule 3: Anti-Test Filter
 * Any order or abandoned cart whose customer phone, email, name, or address matches test numbers
 * (e.g. (41) 99582-4010) must be IGNORED and never persisted.
 */
export function normalizeDigits(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = toSafeString(value);
  return s.replace(/\D+/g, '');
}

export function isBlockedTestOrder(params?: {
  customerPhone?: unknown;
  shippingAddressPhone?: unknown;
  customerAddress?: unknown;
  customerName?: unknown;
  customerEmail?: unknown;
  orderNumber?: unknown;
  blockedPhonesConfig?: string;
} | null): boolean {
  if (!params || typeof params !== 'object') return false;

  const defaultBlocked = ['41995824010', '995824010', '11999999999'];
  const customBlocked = (toSafeString(params.blockedPhonesConfig) || '(41) 99582-4010')
    .split(',')
    .map((s) => normalizeDigits(s))
    .filter((s) => s.length >= 8);

  const allBlockedDigits = Array.from(new Set([...defaultBlocked, ...customBlocked]));

  const candidateStrings = [
    toSafeString(params.customerPhone),
    toSafeString(params.shippingAddressPhone),
    toSafeString(params.customerAddress),
  ];

  for (const raw of candidateStrings) {
    if (!raw || typeof raw !== 'string') continue;
    if (raw.includes('(41) 99582-4010') || raw.includes('99582-4010')) {
      return true;
    }
    const digits = normalizeDigits(raw);
    if (!digits) continue;
    for (const blocked of allBlockedDigits) {
      if (digits.includes(blocked) || (blocked.includes(digits) && digits.length >= 9)) {
        return true;
      }
    }
  }

  const nameLower = toSafeString(params.customerName).toLowerCase();
  const emailLower = toSafeString(params.customerEmail).toLowerCase();
  const orderNum = toSafeString(params.orderNumber).toUpperCase();

  if (
    nameLower.includes('pedido teste') ||
    nameLower.includes('teste lojista') ||
    nameLower.includes('cliente webhook') ||
    emailLower.startsWith('teste@') ||
    orderNum.includes('TEST') ||
    orderNum.startsWith('#WH-') ||
    DEMO_SEED_ORDER_NUMBERS.has(orderNum)
  ) {
    return true;
  }

  return false;
}

export function isTestOrDemoOrderRecord(
  order: OrderRecord,
  blockedPhonesConfig?: string
): boolean {
  if (
    DEMO_SEED_ORDER_NUMBERS.has(order.orderNumber) ||
    order.cartpandaId.startsWith('cp_1') ||
    order.cartpandaId.startsWith('cp_ord_') ||
    order.cartpandaId.startsWith('cp_abn_') ||
    order.cartpandaId.startsWith('wh_') ||
    order.orderNumber.startsWith('#WH-')
  ) {
    return true;
  }

  return isBlockedTestOrder({
    customerPhone: order.customerPhone,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    orderNumber: order.orderNumber,
    blockedPhonesConfig,
  });
}

/**
 * Rule 4: Real Profit Formula
 */
export function calculateOrderFinancials(params: {
  grossAmount: number;
  shippingCost: number;
  cogsAmount: number;
  paymentMethod: PaymentMethod;
  settings:
    | Pick<
        SettingsRecord,
        | 'taxRate'
        | 'cartpandaOrderFeePercent'
        | 'cartpandaPixFeePercent'
        | 'cartpandaPixFeeFixed'
        | 'cartpandaCardFeePercent'
        | 'cartpandaCardFeeFixed'
        | 'cartpandaBilletFeeFixed'
      >
    | Partial<SettingsRecord>;
}) {
  const grossAmount = Math.max(0, Number(params.grossAmount) || 0);
  const shippingCost = Math.max(0, Number(params.shippingCost) || 0);
  const cogsAmount = Math.max(0, Number(params.cogsAmount) || 0);

  // 1. Payment Gateway Fee (PIX, Card, Boleto)
  let gatewayFee = 0;
  if (params.paymentMethod === 'pix') {
    const pixPercent = Number(params.settings.cartpandaPixFeePercent ?? 0.99);
    const pixFixed = Number(params.settings.cartpandaPixFeeFixed ?? 0);
    gatewayFee = grossAmount * (pixPercent / 100) + pixFixed;
  } else if (params.paymentMethod === 'credit_card') {
    const cardPercent = Number(params.settings.cartpandaCardFeePercent ?? 4.99);
    const cardFixed = Number(params.settings.cartpandaCardFeeFixed ?? 1.0);
    gatewayFee = grossAmount * (cardPercent / 100) + cardFixed;
  } else {
    const billetFixed = Number(params.settings.cartpandaBilletFeeFixed ?? 3.49);
    gatewayFee = billetFixed;
  }

  // 2. Cartpanda Platform Fee per order (% por pedido da Cartpanda)
  const orderFeePercent = Number(params.settings.cartpandaOrderFeePercent ?? 0);
  const cartpandaPlatformFee = grossAmount * (orderFeePercent / 100);

  // Total checkout fees = Gateway fee + Cartpanda platform order fee
  const checkoutFee = Number((gatewayFee + cartpandaPlatformFee).toFixed(2));
  gatewayFee = Number(gatewayFee.toFixed(2));

  const netAmount = Number((grossAmount - checkoutFee).toFixed(2));
  const taxRate = Number(params.settings.taxRate ?? 0);
  const taxAmount = Number((grossAmount * (taxRate / 100)).toFixed(2));
  const productRevenue = Number((grossAmount - shippingCost).toFixed(2));
  const netProfit = Number((netAmount - cogsAmount - taxAmount - shippingCost).toFixed(2));
  const profitMargin =
    grossAmount > 0 ? Number(((netProfit / grossAmount) * 100).toFixed(2)) : 0;

  return {
    productRevenue,
    grossAmount: Number(grossAmount.toFixed(2)),
    netAmount,
    checkoutFee,
    gatewayFee,
    shippingCost: Number(shippingCost.toFixed(2)),
    taxAmount,
    cogsAmount: Number(cogsAmount.toFixed(2)),
    netProfit,
    profitMargin,
  };
}

/**
 * Sanitizes Cartpanda Store Slug so users can paste full URLs or plain names
 */
export function cleanCartpandaSlug(raw: string | undefined | null): string {
  if (!raw) return '';
  let s = String(raw).trim();
  s = s.replace(/^https?:\/\//i, '');
  s = s.replace(/^accounts\.cartpanda\.com\/api\//i, '');
  s = s.replace(/^accounts\.cartpanda\.com\//i, '');
  s = s.replace(/\.cartpanda\.com.*$/i, '');
  s = s.replace(/\.mycartpanda\.com.*$/i, '');
  s = s.replace(/\/.*$/, '');
  s = s.trim();
  if (s.toLowerCase() === 'api' || s.toLowerCase() === 'v1' || s.toLowerCase() === 'v2') {
    return '';
  }
  return s;
}

/**
 * Sanitizes Meta Ads Account ID so users can paste with or without act_
 */
export function cleanMetaAccountId(raw: string | undefined | null): string {
  if (!raw) return '';
  let s = String(raw).trim().replace(/\s+/g, '');
  if (!s.startsWith('act_') && /^\d+$/.test(s)) {
    return `act_${s}`;
  }
  return s;
}

/**
 * Parses Cartpanda / Shopify CSV export into normalized OrderRecord items
 */
export function parseOrdersCsv(
  csvContent: string,
  settings: Pick<
    SettingsRecord,
    | 'taxRate'
    | 'cartpandaPixFeePercent'
    | 'cartpandaPixFeeFixed'
    | 'cartpandaCardFeePercent'
    | 'cartpandaCardFeeFixed'
    | 'cartpandaBilletFeeFixed'
    | 'blockedTestPhones'
  >
): { orders: Omit<OrderRecord, 'id' | 'ownerId'>[]; ignoredTestCount: number } {
  const lines = csvContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return { orders: [], ignoredTestCount: 0 };

  const delimiter = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0]
    .split(delimiter)
    .map((h) => h.replace(/^["']|["']$/g, '').trim().toLowerCase());

  const getCol = (row: string[], nameParts: string[]): string => {
    const idx = headers.findIndex((h) => nameParts.some((p) => h.includes(p)));
    if (idx === -1 || idx >= row.length) return '';
    return row[idx].replace(/^["']|["']$/g, '').trim();
  };

  const parsed: Omit<OrderRecord, 'id' | 'ownerId'>[] = [];
  let ignoredTestCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i]
      .split(delimiter)
      .map((c) => c.replace(/^["']|["']$/g, '').trim());

    if (row.length < 2) continue;

    const orderNumber =
      getCol(row, ['número', 'numero', 'order', 'name', 'id']) || `#CP-${10000 + i}`;
    const customerName =
      getCol(row, ['cliente', 'customer', 'nome', 'comprador']) || 'Cliente Importado';
    const customerEmail = getCol(row, ['email', 'e-mail']) || '';
    const customerPhone = getCol(row, ['telefone', 'phone', 'celular']) || '';
    const rawTotal = getCol(row, ['total', 'valor', 'gross', 'preço', 'preco']) || '0';
    const rawShipping = getCol(row, ['frete', 'shipping']) || '0';
    const rawStatus = getCol(row, ['status', 'financial', 'pagamento']) || 'paid';
    const rawMethod = getCol(row, ['método', 'metodo', 'gateway', 'payment']) || 'pix';
    const rawDate = getCol(row, ['data', 'created', 'date']) || new Date().toISOString();
    const rawItems = getCol(row, ['itens', 'items', 'line', 'produto']) || 'Produto';

    if (
      isBlockedTestOrder({
        customerPhone,
        customerName,
        customerEmail,
        orderNumber,
        blockedPhonesConfig: settings.blockedTestPhones,
      })
    ) {
      ignoredTestCount++;
      continue;
    }

    const cleanNum = (str: string) => {
      const normalized = str.replace(/[^\d,.-]/g, '').replace(',', '.');
      return parseFloat(normalized) || 0;
    };

    const grossAmount = cleanNum(rawTotal);
    const shippingCost = cleanNum(rawShipping);
    const cogsAmount = Number((grossAmount * 0.28).toFixed(2)); // estimativa 28% se não houver coluna

    const paymentMethod: PaymentMethod = extractPaymentMethod({
      payment_method: rawMethod,
      gateway: rawMethod,
    });

    const status = classifyOrderStatus({
      financialStatus: rawStatus,
      status: rawStatus,
      paymentStatus: rawStatus,
    });

    const fin = calculateOrderFinancials({
      grossAmount,
      shippingCost,
      cogsAmount,
      paymentMethod,
      settings,
    });

    parsed.push({
      orderNumber: orderNumber.startsWith('#') ? orderNumber : `#${orderNumber}`,
      cartpandaId: `csv_${Date.now()}_${i}`,
      shopifyId: '',
      customerName,
      customerEmail,
      customerPhone,
      status,
      paymentMethod,
      installments: paymentMethod === 'credit_card' ? 3 : 1,
      ...fin,
      utmSource: 'import_csv',
      utmCampaign: 'historico_importado',
      utmMedium: 'cpc',
      utmContent: '',
      utmTerm: '',
      orderDate: rawDate.includes('T') ? rawDate : `${toSaoPauloDateKey(new Date())}T12:00:00-03:00`,
      itemsSummary: rawItems.slice(0, 380),
    });
  }

  return { orders: parsed, ignoredTestCount };
}
