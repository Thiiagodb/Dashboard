import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  calculateOrderFinancials,
  classifyOrderStatus,
  cleanCartpandaSlug,
  cleanMetaAccountId,
  DEFAULT_SETTINGS,
  extractCustomerName,
  extractPaymentMethod,
  isBlockedTestOrder,
  parseOrdersCsv,
  PaymentMethod,
  toSaoPauloDateKey,
  toStandardBrasiliaNoon,
  toSafeString,
} from './src/lib/profit-engine.ts';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '5mb' }));

  /**
   * 1. Meta Ads API Sync (/api/ads/sync)
   * Connects to graph.facebook.com/v21.0/{accountId}/insights
   * Syncs by day and campaign: spend, clicks, impressions
   * Standardizes date to Brasilia noon: YYYY-MM-DDT12:00:00-03:00
   */
  app.post('/api/ads/sync', async (req, res) => {
    try {
      const {
        metaAccessToken = '',
        metaAdAccountId = '',
        datePreset = 'maximum',
      } = req.body || {};

      const cleanToken = String(metaAccessToken || '').trim();
      const cleanAccountId = cleanMetaAccountId(metaAdAccountId);

      if (!cleanToken || cleanToken.length < 10 || !cleanAccountId) {
        return res.json({
          ok: false,
          sourceMode: 'unconfigured',
          syncedAt: new Date().toISOString(),
          records: [],
          message: 'Informe o ID da Conta (ex: act_1234567890) e o Access Token do Meta Ads.',
        });
      }

      const syncedRecords: Array<{
        date: string;
        utmCampaign: string;
        utmSource: string;
        spend: number;
        clicks: number;
        impressions: number;
      }> = [];

      const initialUrl = new URL(
        `https://graph.facebook.com/v21.0/${encodeURIComponent(cleanAccountId)}/insights`
      );
      initialUrl.searchParams.set('level', 'campaign');
      initialUrl.searchParams.set('time_increment', '1');
      initialUrl.searchParams.set('date_preset', datePreset || 'maximum');
      initialUrl.searchParams.set('limit', '500');
      initialUrl.searchParams.set('fields', 'campaign_name,spend,clicks,impressions,date_start');
      initialUrl.searchParams.set('access_token', cleanToken);

      let currentUrl: string | null = initialUrl.toString();
      let pagesFetched = 0;

      while (currentUrl && pagesFetched < 10) {
        let response: Response;
        try {
          response = await fetch(currentUrl, {
            method: 'GET',
            headers: { Accept: 'application/json' },
          });
        } catch (networkErr: unknown) {
          const msg = networkErr instanceof Error ? networkErr.message : 'Falha de rede';
          throw new Error(`Não foi possível conectar aos servidores do Facebook Graph API (${msg}).`);
        }

        if (!response.ok) {
          const errBody = (await response.json().catch(() => ({}))) as {
            error?: { message?: string; type?: string; code?: number };
          };
          const rawMsg = errBody?.error?.message || `Erro HTTP ${response.status}`;

          if (rawMsg.includes('OAuth') || rawMsg.includes('Session') || rawMsg.includes('expired')) {
            throw new Error('Token do Meta Ads expirado ou inválido. Gere um novo token no Meta for Developers.');
          }
          if (rawMsg.includes('permission') || rawMsg.includes('Scope')) {
            throw new Error('O Token do Meta Ads não possui a permissão "ads_read". Adicione a permissão no Meta for Developers.');
          }
          if (rawMsg.includes('Unsupported get request') || rawMsg.includes('Object with ID')) {
            throw new Error(`Conta de anúncios "${cleanAccountId}" não encontrada. Verifique se o ID numérico está correto.`);
          }
          throw new Error(`Meta Ads API: ${rawMsg}`);
        }

        const payload = (await response.json()) as {
          data?: Array<{
            campaign_name?: string;
            spend?: string;
            clicks?: string;
            impressions?: string;
            date_start?: string;
          }>;
          paging?: {
            next?: string;
          };
        };

        if (Array.isArray(payload.data)) {
          for (const row of payload.data) {
            const standardizedDate = toStandardBrasiliaNoon(
              row.date_start || toSaoPauloDateKey(new Date())
            );
            syncedRecords.push({
              date: standardizedDate,
              utmCampaign: (row.campaign_name || 'campanha_meta_geral').slice(0, 150),
              utmSource: 'facebook',
              spend: Number(parseFloat(row.spend || '0').toFixed(2)),
              clicks: parseInt(row.clicks || '0', 10) || 0,
              impressions: parseInt(row.impressions || '0', 10) || 0,
            });
          }
        }

        currentUrl = payload.paging?.next || null;
        pagesFetched++;
      }

      // Explicitly fetch today's real-time live spend to guarantee 100% up-to-date live data
      try {
        const todayUrl = new URL(
          `https://graph.facebook.com/v21.0/${encodeURIComponent(cleanAccountId)}/insights`
        );
        todayUrl.searchParams.set('level', 'campaign');
        todayUrl.searchParams.set('date_preset', 'today');
        todayUrl.searchParams.set('fields', 'campaign_name,spend,clicks,impressions,date_start');
        todayUrl.searchParams.set('access_token', cleanToken);

        const todayRes = await fetch(todayUrl.toString(), {
          headers: { Accept: 'application/json' },
        });
        if (todayRes.ok) {
          const todayPayload = (await todayRes.json()) as {
            data?: Array<{
              campaign_name?: string;
              spend?: string;
              clicks?: string;
              impressions?: string;
              date_start?: string;
            }>;
          };
          if (Array.isArray(todayPayload.data)) {
            const todayNoon = toStandardBrasiliaNoon(toSaoPauloDateKey(new Date()));
            for (const row of todayPayload.data) {
              const campaign = (row.campaign_name || 'campanha_meta_geral').slice(0, 150);
              const spend = Number(parseFloat(row.spend || '0').toFixed(2));
              const entry = {
                date: todayNoon,
                utmCampaign: campaign,
                utmSource: 'facebook',
                spend,
                clicks: parseInt(row.clicks || '0', 10) || 0,
                impressions: parseInt(row.impressions || '0', 10) || 0,
              };
              const existingIdx = syncedRecords.findIndex(
                (r) => r.date === todayNoon && r.utmCampaign === campaign
              );
              if (existingIdx >= 0) {
                syncedRecords[existingIdx] = entry;
              } else if (spend > 0 || entry.clicks > 0) {
                syncedRecords.push(entry);
              }
            }
          }
        }
      } catch (todayErr) {
        console.warn('Non-critical: today live spend fetch exception:', todayErr);
      }

      return res.json({
        ok: true,
        sourceMode: 'live_meta_graph_api',
        endpoint: `https://graph.facebook.com/v21.0/${cleanAccountId}/insights`,
        syncedAt: new Date().toISOString(),
        records: syncedRecords,
        count: syncedRecords.length,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao sincronizar Meta Ads';
      return res.status(400).json({ ok: false, error: message });
    }
  });

  /**
   * 2. Cartpanda REST API Sync (/api/cartpanda/sync)
   * Official Base URL: https://accounts.cartpanda.com/api/v1/orders with Authorization: Bearer {token}
   * Auto-probes candidate endpoints: /api/v1/orders, /api/{slug}/orders, {slug}.mycartpanda.com/api/v1/orders
   * Pulls /orders and /abandoned
   * Enforces Anti-Test Filter ((41) 99582-4010) and paid_unfulfilled classification
   */
  app.post('/api/cartpanda/sync', async (req, res) => {
    try {
      const {
        cartpandaApiToken = '',
        cartpandaStoreSlug = '',
        settings = DEFAULT_SETTINGS,
      } = req.body || {};

      const token = String(cartpandaApiToken || '').trim();
      const slug = cleanCartpandaSlug(cartpandaStoreSlug);

      if (!token) {
        return res.json({
          ok: false,
          sourceMode: 'unconfigured',
          syncedAt: new Date().toISOString(),
          ignoredTestCount: 0,
          orders: [],
          discoveredProducts: [],
          message: 'Informe o Token de Acesso da Cartpanda (Bearer Token) em Configurações.',
        });
      }

      const extractArray = (payload: any, ...keys: string[]): any[] => {
        if (!payload) return [];
        if (Array.isArray(payload)) return payload;
        for (const k of keys) {
          const val = payload[k];
          if (Array.isArray(val)) return val;
          if (val && typeof val === 'object') {
            if (Array.isArray(val.data)) return val.data;
            if (Array.isArray(val.orders)) return val.orders;
            if (Array.isArray(val.items)) return val.items;
            if (Array.isArray(val.checkouts)) return val.checkouts;
          }
        }
        if (Array.isArray(payload.data)) return payload.data;
        if (payload.data && typeof payload.data === 'object') {
          if (Array.isArray(payload.data.data)) return payload.data.data;
          if (Array.isArray(payload.data.orders)) return payload.data.orders;
        }
        if (Array.isArray(payload.orders)) return payload.orders;
        if (Array.isArray(payload.results)) return payload.results;
        if (typeof payload === 'object') {
          const vals = Object.values(payload);
          if (
            vals.length > 0 &&
            vals.every(
              (v) =>
                typeof v === 'object' &&
                v !== null &&
                ('order_number' in v || 'id' in v || 'total_price' in v || 'number' in v)
            )
          ) {
            return vals;
          }
        }
        return [];
      };

      // Candidate endpoints to probe in order of priority
      const candidateEndpoints: string[] = [
        'https://accounts.cartpanda.com/api/v1/orders',
      ];
      if (slug) {
        candidateEndpoints.push(`https://accounts.cartpanda.com/api/${encodeURIComponent(slug)}/orders`);
        candidateEndpoints.push(`https://${encodeURIComponent(slug)}.mycartpanda.com/api/v1/orders`);
        candidateEndpoints.push(`https://${encodeURIComponent(slug)}.cartpanda.com/api/v1/orders`);
      }

      let workingEndpointUrl: string | null = null;
      const allRawOrders: Array<Record<string, any>> = [];
      let lastErrorMessage = '';

      // Probe candidate endpoints on page 1
      for (const endpoint of candidateEndpoints) {
        try {
          const sep = endpoint.includes('?') ? '&' : '?';
          const probeUrl = `${endpoint}${sep}page=1&per_page=100&limit=100`;
          const oRes = await fetch(probeUrl, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
            },
          });

          if (oRes.ok) {
            const pageJson = await oRes.json().catch(() => null);
            if (pageJson && typeof pageJson === 'object' && !Array.isArray(pageJson)) {
              if (
                pageJson.status === 'error' ||
                pageJson.status === 'fail' ||
                pageJson.message === 'Unauthenticated.' ||
                pageJson.error === true
              ) {
                lastErrorMessage = pageJson.message || pageJson.error || 'Autenticação falhou';
                continue;
              }
            }
            const extracted = extractArray(pageJson, 'orders', 'data');
            workingEndpointUrl = endpoint;
            allRawOrders.push(...extracted);
            break;
          } else {
            const errJson = (await oRes.json().catch(() => ({}))) as { message?: string; error?: any };
            if (oRes.status === 401) {
              lastErrorMessage = 'Token Bearer da Cartpanda inválido ou não autorizado (401). Copie um token válido em Cartpanda > Configurações > API.';
            } else if (oRes.status === 403) {
              lastErrorMessage = errJson.message || 'Acesso negado pela Cartpanda (403). Verifique se o token tem permissão de leitura de pedidos.';
            } else if (oRes.status === 404) {
              lastErrorMessage = `Endpoint ${endpoint} não encontrado (404).`;
            } else {
              lastErrorMessage = errJson.message || `Cartpanda retornou HTTP ${oRes.status}`;
            }
          }
        } catch (netErr: unknown) {
          const msg = netErr instanceof Error ? netErr.message : 'Falha de conexão';
          lastErrorMessage = `Erro de rede ao conectar com Cartpanda: ${msg}`;
        }
      }

      if (!workingEndpointUrl) {
        throw new Error(
          lastErrorMessage ||
            'Não foi possível conectar à API da Cartpanda. Verifique seu Token de Acesso em Configurações.'
        );
      }

      // Multi-page fetch: pages 2 to 5 using the discovered working endpoint
      for (let page = 2; page <= 5; page++) {
        const sep = workingEndpointUrl.includes('?') ? '&' : '?';
        const pageUrl = `${workingEndpointUrl}${sep}page=${page}&per_page=100&limit=100`;
        try {
          const pageRes = await fetch(pageUrl, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
            },
          });
          if (!pageRes.ok) break;
          const pageJson = await pageRes.json().catch(() => null);
          const extracted = extractArray(pageJson, 'orders', 'data');
          if (!extracted || extracted.length === 0) break;
          allRawOrders.push(...extracted);
          if (extracted.length < 50) break;
        } catch {
          break;
        }
      }

      // Fetch abandoned checkouts
      let rawAbandoned: Array<Record<string, any>> = [];
      const baseForAbandoned = workingEndpointUrl.replace(/\/orders\/?$/, '');
      const abandonedCandidates = [
        `${baseForAbandoned}/abandoned?page=1&per_page=100`,
        `${baseForAbandoned}/checkouts?page=1&per_page=100`,
      ];
      for (const abUrl of abandonedCandidates) {
        try {
          const aRes = await fetch(abUrl, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
            },
          });
          if (aRes.ok) {
            const abandonedJson = await aRes.json().catch(() => null);
            rawAbandoned = extractArray(abandonedJson, 'abandoned', 'checkouts', 'data');
            if (rawAbandoned.length > 0) break;
          }
        } catch {
          // Abandoned cart fetch non-critical
        }
      }

      const safeExtractPhone = (data: any): string => {
        if (!data || typeof data !== 'object') return '';
        const candidates = [
          data.customer?.phone,
          data.phone,
          data.shipping_address?.phone,
          data.billing_address?.phone,
          data.telephone,
          data.cellphone,
          data.mobile,
        ];
        for (const c of candidates) {
          if (typeof c === 'string' && c.trim()) return c.trim();
          if (typeof c === 'number') return String(c);
        }
        return '';
      };

      const safeExtractAddress = (data: any): string => {
        if (!data || typeof data !== 'object') return '';
        const candidates = [
          data.shipping_address?.address1,
          data.shipping_address?.street,
          data.billing_address?.address1,
          data.billing_address?.street,
          typeof data.shipping_address === 'string' ? data.shipping_address : '',
          typeof data.billing_address === 'string' ? data.billing_address : '',
          typeof data.address === 'string' ? data.address : '',
        ];
        for (const c of candidates) {
          if (typeof c === 'string' && c.trim()) return c.trim();
        }
        if (data.shipping_address && typeof data.shipping_address === 'object') {
          const s = toSafeString(data.shipping_address);
          if (s) return s;
        }
        if (data.address && typeof data.address === 'object') {
          const s = toSafeString(data.address);
          if (s) return s;
        }
        return '';
      };

      const normalizedOrders: Array<Record<string, any>> = [];
      const discoveredProductsMap = new Map<
        string,
        { id: string; title: string; sku: string; price: number; costPrice: number }
      >();
      let ignoredTestCount = 0;

      for (const raw of allRawOrders) {
        const phone = safeExtractPhone(raw);
        const addressStr = safeExtractAddress(raw);
        const customerName = extractCustomerName(raw);
        const rawEmail = raw.customer?.email || raw.email || '';
        const customerEmail = typeof rawEmail === 'string' ? rawEmail : toSafeString(rawEmail);

        // Format order number cleanly
        const rawNum =
          raw.order_number || raw.number || raw.code || raw.name || raw.id || `${Date.now()}`;
        const orderNumber = String(rawNum).startsWith('#') ? String(rawNum) : `#${rawNum}`;

        if (
          isBlockedTestOrder({
            customerPhone: phone,
            shippingAddressPhone: safeExtractPhone(raw.shipping_address),
            customerAddress: addressStr,
            customerName,
            customerEmail,
            orderNumber,
            blockedPhonesConfig: settings.blockedTestPhones,
          })
        ) {
          ignoredTestCount++;
          continue;
        }

        const status = classifyOrderStatus({
          financialStatus:
            raw.financial_status ||
            raw.transaction?.financial_status ||
            raw.payment_status,
          status:
            raw.status ||
            raw.status_id ||
            raw.order_status_id ||
            raw.transaction?.status ||
            raw.transactions?.[0]?.status ||
            raw.order_payments?.[0]?.status,
          paymentStatus:
            raw.payment_status ||
            raw.payment_status_text ||
            raw.payment_status_id ||
            raw.transaction?.status ||
            raw.transaction?.payment_status ||
            raw.transactions?.[0]?.status,
          paidAt:
            raw.paid_at ||
            raw.payment_date ||
            raw.authorized_at ||
            raw.approved_at ||
            raw.processed_at ||
            raw.captured_at ||
            raw.transaction?.paid_at ||
            raw.transaction?.approved_at ||
            raw.transactions?.[0]?.paid_at ||
            raw.order_payments?.[0]?.paid_at,
          fulfillmentStatus: raw.fulfillment_status,
          trackingCode: raw.tracking_code || raw.orders_shippings?.tracking_code,
          isAbandonedCheckout: false,
        });

        const paymentMethod = extractPaymentMethod(raw);
        const installments = Number(
          raw.installments ||
          raw.transaction?.installments ||
          raw.transactions?.[0]?.installments ||
          raw.order_payments?.[0]?.installments ||
          raw.payments?.[0]?.installments ||
          raw.payment_details?.installments ||
          1
        );

        const shippingCost = Number(raw.orders_shippings?.price ?? raw.shipping_cost ?? 0);
        const grossAmount = Number(raw.total_price ?? raw.gross_amount ?? raw.subtotal_price ?? 0);
        const items = Array.isArray(raw.line_items)
          ? raw.line_items
          : Array.isArray(raw.items)
          ? raw.items
          : Array.isArray(raw.order_items)
          ? raw.order_items
          : [];

        const cogsAmount = items.reduce(
          (acc: number, it: any) =>
            acc + Number(it.cost_price ?? 0) * Number(it.quantity ?? 1),
          0
        );

        // Collect discovered products for catalog
        for (const it of items) {
          const title = String(it.title || it.name || 'Produto').trim();
          const sku = String(it.sku || title.toLowerCase().replace(/\s+/g, '-')).slice(0, 50);
          if (title && !discoveredProductsMap.has(sku)) {
            discoveredProductsMap.set(sku, {
              id: `prod_${sku}`,
              title,
              sku,
              price: Number(it.price || grossAmount || 99.9),
              costPrice: Number(it.cost_price || 0),
            });
          }
        }

        const financials = calculateOrderFinancials({
          grossAmount,
          shippingCost,
          cogsAmount,
          paymentMethod,
          settings,
        });

        const tracking = raw.tracking_parameters || {};
        normalizedOrders.push({
          cartpandaId: String(raw.id || ''),
          shopifyId: String(raw.shopify_id || ''),
          orderNumber,
          customerName,
          customerEmail: String(raw.customer?.email || raw.email || ''),
          customerPhone: String(phone),
          status,
          paymentMethod,
          installments,
          ...financials,
          utmSource: String(tracking.utm_source || 'facebook'),
          utmCampaign: String(tracking.utm_campaign || 'campanha_direta'),
          utmMedium: String(tracking.utm_medium || 'cpc'),
          utmContent: String(tracking.utm_content || ''),
          utmTerm: String(tracking.utm_term || ''),
          orderDate: String(raw.created_at || raw.created || raw.inserted_at || new Date().toISOString()),
          itemsSummary:
            items
              .map((it: any) => `${it.quantity || 1}x ${it.title || it.name || 'Produto'}`)
              .join(', ')
              .slice(0, 380) || '1x Produto',
        });
      }

      for (const rawAb of (Array.isArray(rawAbandoned) ? rawAbandoned : [])) {
        const phone = safeExtractPhone(rawAb);
        const addressStr = safeExtractAddress(rawAb);
        const customerName = extractCustomerName(rawAb);
        const rawNum = rawAb.checkout_number || rawAb.number || rawAb.id || `${Date.now()}`;
        const orderNumber = String(rawNum).startsWith('#') ? String(rawNum) : `#AB-${rawNum}`;
        const rawEmail = rawAb.customer?.email || rawAb.email || '';
        const customerEmail = typeof rawEmail === 'string' ? rawEmail : toSafeString(rawEmail);

        if (
          isBlockedTestOrder({
            customerPhone: phone,
            shippingAddressPhone: safeExtractPhone(rawAb.shipping_address),
            customerAddress: addressStr,
            customerName,
            customerEmail,
            orderNumber,
            blockedPhonesConfig: settings.blockedTestPhones,
          })
        ) {
          ignoredTestCount++;
          continue;
        }

        const grossAmount = Number(rawAb.total_price ?? 0);
        const shippingCost = Number(rawAb.orders_shippings?.price ?? 0);
        const items = Array.isArray(rawAb.line_items) ? rawAb.line_items : [];
        const cogsAmount = items.reduce(
          (acc: number, it: any) =>
            acc + Number(it.cost_price ?? 0) * Number(it.quantity ?? 1),
          0
        );

        const financials = calculateOrderFinancials({
          grossAmount,
          shippingCost,
          cogsAmount,
          paymentMethod: 'credit_card',
          settings,
        });

        const tracking = rawAb.tracking_parameters || {};
        normalizedOrders.push({
          cartpandaId: String(rawAb.id || ''),
          shopifyId: '',
          orderNumber,
          customerName: customerName || 'Visitante Checkout',
          customerEmail: String(customerEmail || ''),
          customerPhone: String(phone),
          status: 'abandoned',
          paymentMethod: 'credit_card',
          installments: 1,
          ...financials,
          utmSource: String(tracking.utm_source || 'facebook'),
          utmCampaign: String(tracking.utm_campaign || 'campanha_direta'),
          utmMedium: String(tracking.utm_medium || 'cpc'),
          utmContent: String(tracking.utm_content || ''),
          utmTerm: String(tracking.utm_term || ''),
          orderDate: String(rawAb.created_at || rawAb.created || new Date().toISOString()),
          itemsSummary:
            items
              .map((it: any) => `${it.quantity || 1}x ${it.title || it.name || 'Produto'}`)
              .join(', ')
              .slice(0, 380) || 'Carrinho Iniciado',
        });
      }

      return res.json({
        ok: true,
        sourceMode: 'live_cartpanda_api',
        endpoint: workingEndpointUrl,
        syncedAt: new Date().toISOString(),
        ignoredTestCount,
        orders: normalizedOrders,
        discoveredProducts: Array.from(discoveredProductsMap.values()),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao sincronizar Cartpanda';
      return res.status(400).json({ ok: false, error: message });
    }
  });

  /**
   * 3. Cartpanda Webhook Endpoint (/api/webhooks/cartpanda)
   * Events: order.created, order.paid, order.refunded, order.canceled, checkout.abandoned
   */
  app.post('/api/webhooks/cartpanda', async (req, res) => {
    try {
      const payload = req.body || {};
      const event = String(payload.event || 'order.paid');
      const data = payload.data || payload.order || payload;
      const settings = payload.settings || DEFAULT_SETTINGS;

      const safeExtractPhone = (item: any): string => {
        if (!item || typeof item !== 'object') return '';
        const candidates = [
          item.customer?.phone,
          item.phone,
          item.shipping_address?.phone,
          item.billing_address?.phone,
          item.telephone,
          item.cellphone,
          item.mobile,
        ];
        for (const c of candidates) {
          if (typeof c === 'string' && c.trim()) return c.trim();
          if (typeof c === 'number') return String(c);
        }
        return '';
      };

      const safeExtractAddress = (item: any): string => {
        if (!item || typeof item !== 'object') return '';
        const candidates = [
          item.shipping_address?.address1,
          item.shipping_address?.street,
          item.billing_address?.address1,
          item.billing_address?.street,
          typeof item.shipping_address === 'string' ? item.shipping_address : '',
          typeof item.billing_address === 'string' ? item.billing_address : '',
          typeof item.address === 'string' ? item.address : '',
        ];
        for (const c of candidates) {
          if (typeof c === 'string' && c.trim()) return c.trim();
        }
        if (item.shipping_address && typeof item.shipping_address === 'object') {
          const s = toSafeString(item.shipping_address);
          if (s) return s;
        }
        if (item.address && typeof item.address === 'object') {
          const s = toSafeString(item.address);
          if (s) return s;
        }
        return '';
      };

      const phone = safeExtractPhone(data);
      const addressStr = safeExtractAddress(data);
      const rawEmail = data.customer?.email || data.customerEmail || data.email || '';
      const customerEmail = typeof rawEmail === 'string' ? rawEmail : toSafeString(rawEmail);

      // Rule 3: Anti-Test Filter
      if (
        isBlockedTestOrder({
          customerPhone: phone,
          shippingAddressPhone: safeExtractPhone(data.shipping_address),
          customerAddress: addressStr,
          customerName: data.customer?.name || data.customerName,
          customerEmail,
          orderNumber: data.order_number || data.id,
          blockedPhonesConfig: settings.blockedTestPhones,
        })
      ) {
        return res.status(200).json({
          ok: true,
          ignoredAsTest: true,
          reason: `Filtro Anti-Testes acionado: pedido de teste bloqueado (${
            phone || data.order_number || 'teste'
          }). Ignorado e não persistido.`,
        });
      }

      const customerName = extractCustomerName(data);
      const paymentMethod = extractPaymentMethod(data);

      const status = classifyOrderStatus({
        financialStatus:
          event === 'order.paid'
            ? 'paid'
            : event === 'order.refunded'
            ? 'refunded'
            : event === 'order.canceled'
            ? 'canceled'
            : event === 'checkout.abandoned'
            ? 'abandoned'
            : data.financial_status || data.transaction?.financial_status || data.status || 'pending',
        status: data.status || data.status_id || data.transaction?.status || data.transactions?.[0]?.status,
        paymentStatus: data.payment_status || data.payment_status_text || data.transaction?.status,
        paidAt:
          event === 'order.paid'
            ? (data.paid_at || data.payment_date || data.approved_at || new Date().toISOString())
            : (data.paid_at || data.payment_date || data.authorized_at || data.approved_at || data.transaction?.paid_at),
        fulfillmentStatus: data.fulfillment_status ?? 'Unfulfilled',
        trackingCode: data.tracking_code ?? data.orders_shippings?.tracking_code ?? null,
        isAbandonedCheckout: event === 'checkout.abandoned',
      });

      const grossAmount = Number(data.total_price ?? data.grossAmount ?? data.gross_amount ?? 0);
      const shippingCost = Number(data.orders_shippings?.price ?? data.shippingCost ?? data.shipping_cost ?? 0);
      const cogsAmount = Number(data.cogsAmount ?? data.cogs_amount ?? 0);

      const financials = calculateOrderFinancials({
        grossAmount,
        shippingCost,
        cogsAmount,
        paymentMethod,
        settings,
      });

      const tracking = data.tracking_parameters || {};

      const rawNum = data.order_number || data.number || data.code || data.name || data.id || `${Date.now()}`;
      const orderNumber = String(rawNum).startsWith('#') ? String(rawNum) : `#${rawNum}`;

      const normalizedOrder = {
        cartpandaId: String(data.id || `cp_${Date.now()}`),
        shopifyId: String(data.shopify_id || ''),
        orderNumber,
        customerName,
        customerEmail: String(data.customer?.email || data.customerEmail || data.email || ''),
        customerPhone: String(phone),
        status,
        paymentMethod,
        installments: Number(data.installments || 1),
        ...financials,
        utmSource: String(tracking.utm_source || data.utmSource || 'facebook'),
        utmCampaign: String(tracking.utm_campaign || data.utmCampaign || ''),
        utmMedium: String(tracking.utm_medium || data.utmMedium || ''),
        utmContent: String(tracking.utm_content || data.utmContent || ''),
        utmTerm: String(tracking.utm_term || data.utmTerm || ''),
        orderDate: String(data.created_at || data.created || new Date().toISOString()),
        itemsSummary: String(data.itemsSummary || data.line_items?.[0]?.title || '1x Produto'),
      };

      return res.status(200).json({
        ok: true,
        ignoredAsTest: false,
        event,
        order: normalizedOrder,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro no processamento do Webhook';
      return res.status(500).json({ ok: false, error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n Profit Dashboard pronto!`);
    console.log(` > No Computador: http://localhost:${PORT}`);
    console.log(` > No Celular (mesmo Wi-Fi): http://192.168.1.5:${PORT}\n`);
  });
}

startServer();
