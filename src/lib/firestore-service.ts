import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase.ts';
import {
  AdSpendRecord,
  CustomExpenseRecord,
  isTestOrDemoOrderRecord,
  OrderRecord,
  OrderStatus,
  ProductRecord,
  SettingsRecord,
} from './profit-engine.ts';
import { buildInitialSeedData } from './seed-data.ts';

function sanitizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120) || `id_${Date.now()}`;
}

const LEGACY_SEED_SKUS = new Set([
  'SW-TITAN-PRO',
  'ANC-STUDIO-CB',
  'SRM-VITC-30ML',
  'BKP-NOMAD-25L',
]);

const LEGACY_SEED_CAMPAIGNS = new Set([
  'ESC_SMARTWATCH_PRO_CBO',
  'ESC_MOCHILA_NOMAD_ABO',
  'RET_CATALOGO_DINAMICO_DPA',
  'ESC_SERUM_VITC_ADV',
  'ESC_EARBUDS_ANC_CBO',
]);

const LEGACY_SEED_EXPENSES = new Set([
  'Shopify Plano Basic + Apps de Upsell',
  'ERP Bling & Emissor de Notas Fiscais',
  'Equipe de Suporte / Recuperação de Pix e Boletos',
]);

export async function loadOrSeedStoreData(uid: string): Promise<{
  settings: SettingsRecord;
  products: ProductRecord[];
  orders: OrderRecord[];
  adSpends: AdSpendRecord[];
  customExpenses: CustomExpenseRecord[];
}> {
  const settingsPath = `settings/${uid}`;
  let settingsSnap;
  try {
    settingsSnap = await getDoc(doc(db, 'settings', uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, settingsPath);
  }

  if (!settingsSnap.exists()) {
    const seeded = buildInitialSeedData(uid);
    const { id: _sId, ...settingsFields } = seeded.settings;
    try {
      await setDoc(doc(db, 'settings', uid), {
        ...settingsFields,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, settingsPath);
    }
    return seeded;
  }

  try {
    const [productsSnap, ordersSnap, adSpendsSnap, expensesSnap] = await Promise.all([
      getDocs(query(collection(db, 'products'), where('ownerId', '==', uid))),
      getDocs(query(collection(db, 'orders'), where('ownerId', '==', uid))),
      getDocs(query(collection(db, 'ad_spends'), where('ownerId', '==', uid))),
      getDocs(query(collection(db, 'custom_expenses'), where('ownerId', '==', uid))),
    ]);

    const settingsData = settingsSnap.data() as Omit<SettingsRecord, 'id'>;
    const settings: SettingsRecord = {
      id: uid,
      ownerId: settingsData.ownerId,
      storeName: settingsData.storeName,
      taxRate: Number(settingsData.taxRate ?? 4.5),
      cartpandaOrderFeePercent: Number(settingsData.cartpandaOrderFeePercent ?? 1.5),
      cartpandaPixFeePercent: Number(settingsData.cartpandaPixFeePercent ?? 0.99),
      cartpandaPixFeeFixed: Number(settingsData.cartpandaPixFeeFixed ?? 0.0),
      cartpandaCardFeePercent: Number(settingsData.cartpandaCardFeePercent ?? 4.99),
      cartpandaCardFeeFixed: Number(settingsData.cartpandaCardFeeFixed ?? 1.0),
      cartpandaBilletFeeFixed: Number(settingsData.cartpandaBilletFeeFixed ?? 3.49),
      metaAccessToken: settingsData.metaAccessToken || '',
      metaAdAccountId: settingsData.metaAdAccountId || '',
      lastSyncAt: settingsData.lastSyncAt || '',
      cartpandaApiToken: settingsData.cartpandaApiToken || '',
      cartpandaStoreSlug: settingsData.cartpandaStoreSlug || '',
      lastCartpandaSyncAt: settingsData.lastCartpandaSyncAt || '',
      blockedTestPhones: settingsData.blockedTestPhones || '(41) 99582-4010, 41995824010, (11) 99999-9999',
      dashboardPassword: settingsData.dashboardPassword || 'thiagodj97',
    };

    const cleanupBatch = writeBatch(db);
    let cleanupCount = 0;

    const products: ProductRecord[] = [];
    for (const d of productsSnap.docs) {
      const data = d.data();
      if (LEGACY_SEED_SKUS.has(String(data.sku || ''))) {
        cleanupBatch.delete(doc(db, 'products', d.id));
        cleanupCount++;
        continue;
      }
      products.push({
        id: d.id,
        ownerId: data.ownerId,
        shopifyId: data.shopifyId,
        title: data.title,
        sku: data.sku,
        imageUrl: data.imageUrl,
        price: Number(data.price),
        costPrice: Number(data.costPrice),
        stockQuantity: Number(data.stockQuantity),
        active: Boolean(data.active),
      });
    }

    const orders: OrderRecord[] = [];
    for (const d of ordersSnap.docs) {
      const data = d.data();
      const ord: OrderRecord = {
        id: d.id,
        ownerId: data.ownerId,
        orderNumber: data.orderNumber,
        cartpandaId: data.cartpandaId,
        shopifyId: data.shopifyId,
        customerName: data.customerName,
        customerEmail: data.customerEmail,
        customerPhone: data.customerPhone,
        status: data.status as OrderStatus,
        paymentMethod: data.paymentMethod,
        installments: Number(data.installments),
        grossAmount: Number(data.grossAmount),
        netAmount: Number(data.netAmount),
        checkoutFee: Number(data.checkoutFee),
        gatewayFee: Number(data.gatewayFee),
        shippingCost: Number(data.shippingCost),
        taxAmount: Number(data.taxAmount),
        cogsAmount: Number(data.cogsAmount),
        netProfit: Number(data.netProfit),
        profitMargin: Number(data.profitMargin),
        utmSource: data.utmSource,
        utmCampaign: data.utmCampaign,
        utmMedium: data.utmMedium,
        utmContent: data.utmContent,
        utmTerm: data.utmTerm,
        orderDate: data.orderDate,
        itemsSummary: data.itemsSummary,
      };

      if (isTestOrDemoOrderRecord(ord, settings.blockedTestPhones)) {
        cleanupBatch.delete(doc(db, 'orders', d.id));
        cleanupCount++;
        continue;
      }
      orders.push(ord);
    }

    const adSpends: AdSpendRecord[] = [];
    for (const d of adSpendsSnap.docs) {
      const data = d.data();
      if (LEGACY_SEED_CAMPAIGNS.has(String(data.utmCampaign || ''))) {
        cleanupBatch.delete(doc(db, 'ad_spends', d.id));
        cleanupCount++;
        continue;
      }
      adSpends.push({
        id: d.id,
        ownerId: data.ownerId,
        date: data.date,
        utmCampaign: data.utmCampaign,
        utmSource: data.utmSource,
        spend: Number(data.spend),
        clicks: Number(data.clicks),
        impressions: Number(data.impressions),
      });
    }

    const customExpenses: CustomExpenseRecord[] = [];
    for (const d of expensesSnap.docs) {
      const data = d.data();
      if (LEGACY_SEED_EXPENSES.has(String(data.name || ''))) {
        cleanupBatch.delete(doc(db, 'custom_expenses', d.id));
        cleanupCount++;
        continue;
      }
      customExpenses.push({
        id: d.id,
        ownerId: data.ownerId,
        name: data.name,
        type: data.type,
        amount: Number(data.amount),
        recurrence: data.recurrence,
        startDate: data.startDate,
      });
    }

    if (cleanupCount > 0) {
      await cleanupBatch.commit();
    }

    return { settings, products, orders, adSpends, customExpenses };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'store_collections');
  }
}

export async function deleteOrderFromFirestore(orderId: string): Promise<void> {
  const path = `orders/${orderId}`;
  try {
    await deleteDoc(doc(db, 'orders', orderId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function purgeOrdersFromFirestore(orderIds: string[]): Promise<void> {
  if (orderIds.length === 0) return;
  const batch = writeBatch(db);
  for (const id of orderIds) {
    batch.delete(doc(db, 'orders', id));
  }
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'orders/batch_purge');
  }
}

export async function updateOrderStatusInFirestore(
  orderId: string,
  newStatus: OrderStatus
): Promise<void> {
  const path = `orders/${orderId}`;
  try {
    await updateDoc(doc(db, 'orders', orderId), {
      status: newStatus,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateOrderInFirestore(
  orderId: string,
  updates: Partial<OrderRecord>
): Promise<void> {
  const path = `orders/${orderId}`;
  try {
    const cleanUpdates: Record<string, any> = {
      updatedAt: serverTimestamp(),
    };
    if (updates.status !== undefined) cleanUpdates.status = updates.status;
    if (updates.paymentMethod !== undefined) cleanUpdates.paymentMethod = updates.paymentMethod;
    if (updates.checkoutFee !== undefined) cleanUpdates.checkoutFee = Number(updates.checkoutFee);
    if (updates.gatewayFee !== undefined) cleanUpdates.gatewayFee = Number(updates.gatewayFee);
    if (updates.netAmount !== undefined) cleanUpdates.netAmount = Number(updates.netAmount);
    if (updates.netProfit !== undefined) cleanUpdates.netProfit = Number(updates.netProfit);
    if (updates.profitMargin !== undefined) cleanUpdates.profitMargin = Number(updates.profitMargin);
    if (updates.installments !== undefined) cleanUpdates.installments = Number(updates.installments);

    await updateDoc(doc(db, 'orders', orderId), cleanUpdates);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function saveSettingsInFirestore(
  uid: string,
  settings: Partial<Omit<SettingsRecord, 'id' | 'ownerId'>> & { storeName?: string }
): Promise<void> {
  const path = `settings/${uid}`;
  try {
    const settingsRef = doc(db, 'settings', uid);
    const existingSnap = await getDoc(settingsRef).catch(() => null);
    const existingData = existingSnap?.exists() ? existingSnap.data() : null;

    const safeNum = (v: unknown, fallback: number): number => {
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    };
    const safeStr = (v: unknown, maxLen: number, fallback = ''): string => {
      if (typeof v !== 'string') return fallback;
      return v.slice(0, maxLen);
    };

    const payload = {
      ownerId: uid,
      storeName: safeStr(settings.storeName, 120, 'Minha Loja E-commerce'),
      taxRate: safeNum(settings.taxRate, 4.5),
      cartpandaOrderFeePercent: safeNum(settings.cartpandaOrderFeePercent, 1.5),
      cartpandaPixFeePercent: safeNum(settings.cartpandaPixFeePercent, 0.99),
      cartpandaPixFeeFixed: safeNum(settings.cartpandaPixFeeFixed, 0.0),
      cartpandaCardFeePercent: safeNum(settings.cartpandaCardFeePercent, 4.99),
      cartpandaCardFeeFixed: safeNum(settings.cartpandaCardFeeFixed, 1.0),
      cartpandaBilletFeeFixed: safeNum(settings.cartpandaBilletFeeFixed, 3.49),
      metaAccessToken: safeStr(settings.metaAccessToken, 500, ''),
      metaAdAccountId: safeStr(settings.metaAdAccountId, 120, ''),
      lastSyncAt: safeStr(settings.lastSyncAt, 40, ''),
      cartpandaApiToken: safeStr(settings.cartpandaApiToken, 500, ''),
      cartpandaStoreSlug: safeStr(settings.cartpandaStoreSlug, 120, ''),
      lastCartpandaSyncAt: safeStr(settings.lastCartpandaSyncAt, 40, ''),
      blockedTestPhones: safeStr(
        settings.blockedTestPhones,
        400,
        '(41) 99582-4010, 41995824010, (11) 99999-9999'
      ),
      dashboardPassword: safeStr(settings.dashboardPassword, 100, 'thiagodj97'),
      createdAt: existingData?.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    if (existingSnap?.exists()) {
      await updateDoc(settingsRef, payload);
    } else {
      await setDoc(settingsRef, payload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function persistSyncedAdSpends(
  uid: string,
  records: Array<Omit<AdSpendRecord, 'id' | 'ownerId'>>
): Promise<AdSpendRecord[]> {
  const saved: AdSpendRecord[] = [];
  for (const rec of records) {
    const rawId = `ad_${uid.slice(0, 6)}_${rec.date.slice(0, 10)}_${rec.utmCampaign}`;
    const docId = sanitizeId(rawId);
    const path = `ad_spends/${docId}`;
    try {
      const adRef = doc(db, 'ad_spends', docId);
      const existingSnap = await getDoc(adRef).catch(() => null);
      const existingData = existingSnap?.exists() ? existingSnap.data() : null;

      const safeNum = (v: unknown, min = 0) => {
        const n = Number(v);
        return Number.isFinite(n) ? Math.max(min, n) : min;
      };

      const payload = {
        ownerId: uid,
        date: String(rec.date || new Date().toISOString().slice(0, 10)).slice(0, 40),
        utmCampaign: String(rec.utmCampaign || 'Geral').slice(0, 160),
        utmSource: String(rec.utmSource || 'facebook').slice(0, 80),
        spend: safeNum(rec.spend, 0),
        clicks: safeNum(rec.clicks, 0),
        impressions: safeNum(rec.impressions, 0),
        createdAt: existingData?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (existingSnap?.exists()) {
        await updateDoc(adRef, payload);
      } else {
        await setDoc(adRef, payload);
      }

      saved.push({
        id: docId,
        ownerId: uid,
        ...rec,
        spend: payload.spend,
        clicks: payload.clicks,
        impressions: payload.impressions,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }
  return saved;
}

export async function persistSyncedOrders(
  uid: string,
  orders: Array<Omit<OrderRecord, 'id' | 'ownerId'>>
): Promise<OrderRecord[]> {
  const saved: OrderRecord[] = [];
  for (const ord of orders) {
    const rawId = `ord_${uid.slice(0, 6)}_${ord.cartpandaId || ord.orderNumber}`;
    const docId = sanitizeId(rawId);
    const path = `orders/${docId}`;
    try {
      const orderRef = doc(db, 'orders', docId);
      const existingSnap = await getDoc(orderRef).catch(() => null);
      const existingData = existingSnap?.exists() ? existingSnap.data() : null;

      const safeNum = (v: unknown, min = 0) => {
        const n = Number(v);
        return Number.isFinite(n) ? Math.max(min, n) : min;
      };
      const safeFloat = (v: unknown) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      };

      const orderNumber = (ord.orderNumber && String(ord.orderNumber).trim().length > 0
        ? String(ord.orderNumber).trim()
        : `#${Date.now()}`
      ).slice(0, 64);

      const customerName = (ord.customerName && String(ord.customerName).trim().length > 0
        ? String(ord.customerName).trim()
        : 'Cliente'
      ).slice(0, 160);

      const orderDate = (ord.orderDate && String(ord.orderDate).trim().length >= 1
        ? String(ord.orderDate).trim()
        : new Date().toISOString()
      ).slice(0, 40);

      const payload = {
        ownerId: uid,
        orderNumber,
        cartpandaId: String(ord.cartpandaId || '').slice(0, 128),
        shopifyId: String(ord.shopifyId || '').slice(0, 128),
        customerName,
        customerEmail: String(ord.customerEmail || '').slice(0, 160),
        customerPhone: String(ord.customerPhone || '').slice(0, 40),
        status: ord.status || 'pending',
        paymentMethod: ord.paymentMethod || 'pix',
        installments: Math.min(24, Math.max(1, Math.round(safeNum(ord.installments, 1)))),
        grossAmount: safeNum(ord.grossAmount, 0),
        netAmount: safeFloat(ord.netAmount),
        checkoutFee: safeNum(ord.checkoutFee, 0),
        gatewayFee: safeNum(ord.gatewayFee, 0),
        shippingCost: safeNum(ord.shippingCost, 0),
        taxAmount: safeNum(ord.taxAmount, 0),
        cogsAmount: safeNum(ord.cogsAmount, 0),
        netProfit: safeFloat(ord.netProfit),
        profitMargin: safeFloat(ord.profitMargin),
        utmSource: String(ord.utmSource || '').slice(0, 120),
        utmCampaign: String(ord.utmCampaign || '').slice(0, 160),
        utmMedium: String(ord.utmMedium || '').slice(0, 120),
        utmContent: String(ord.utmContent || '').slice(0, 160),
        utmTerm: String(ord.utmTerm || '').slice(0, 120),
        orderDate,
        itemsSummary: String(ord.itemsSummary || '1x Produto').slice(0, 400),
        createdAt: existingData?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (existingData) {
        await updateDoc(orderRef, payload);
      } else {
        await setDoc(orderRef, payload);
      }

      saved.push({
        id: docId,
        ownerId: uid,
        ...ord,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }
  return saved;
}

export async function addCustomExpenseInFirestore(
  uid: string,
  entry: Omit<CustomExpenseRecord, 'id' | 'ownerId'>
): Promise<CustomExpenseRecord> {
  const docId = sanitizeId(`exp_${uid.slice(0, 6)}_${Date.now()}`);
  const path = `custom_expenses/${docId}`;
  try {
    await setDoc(doc(db, 'custom_expenses', docId), {
      ownerId: uid,
      name: entry.name.slice(0, 160),
      type: entry.type,
      amount: Math.max(0, Number(entry.amount) || 0),
      recurrence: entry.recurrence,
      startDate: entry.startDate.slice(0, 40),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return {
      id: docId,
      ownerId: uid,
      ...entry,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteCustomExpenseInFirestore(expenseId: string): Promise<void> {
  const path = `custom_expenses/${expenseId}`;
  try {
    await deleteDoc(doc(db, 'custom_expenses', expenseId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function updateProductCostInFirestore(
  product: ProductRecord,
  newCostPrice: number,
  newPrice?: number
): Promise<void> {
  const path = `products/${product.id}`;
  try {
    await updateDoc(doc(db, 'products', product.id), {
      title: product.title.slice(0, 200),
      sku: product.sku.slice(0, 80),
      imageUrl: product.imageUrl.slice(0, 500),
      price: newPrice !== undefined ? Number(newPrice) : Number(product.price),
      costPrice: Math.max(0, Number(newCostPrice)),
      stockQuantity: Number(product.stockQuantity),
      active: Boolean(product.active),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}
