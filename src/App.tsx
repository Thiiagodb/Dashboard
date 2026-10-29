import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import toast, { Toaster } from 'react-hot-toast';
import {
  BarChart3,
  Calculator,
  Calendar,
  Download,
  Eye,
  EyeOff,
  LayoutDashboard,
  Lock,
  LogIn,
  LogOut,
  RefreshCw,
  Settings as SettingsIcon,
  ShoppingBag,
  Smartphone,
  X,
} from 'lucide-react';
import { auth, googleProvider } from './lib/firebase.ts';
import {
  addCustomExpenseInFirestore,
  deleteCustomExpenseInFirestore,
  deleteOrderFromFirestore,
  loadOrSeedStoreData,
  persistSyncedAdSpends,
  persistSyncedOrders,
  purgeOrdersFromFirestore,
  saveSettingsInFirestore,
  updateOrderStatusInFirestore,
  updateOrderInFirestore,
  updateProductCostInFirestore,
} from './lib/firestore-service.ts';
import {
  AdSpendRecord,
  calculateOrderFinancials,
  CustomExpenseRecord,
  DatePeriodFilter,
  isDateInPeriod,
  isTestOrDemoOrderRecord,
  OrderRecord,
  OrderStatus,
  PaymentMethod,
  parseOrdersCsv,
  ProductRecord,
  SettingsRecord,
  toSaoPauloDateKey,
} from './lib/profit-engine.ts';
import { buildInitialSeedData } from './lib/seed-data.ts';
import { DashboardView } from './components/DashboardView.tsx';
import { OrdersView } from './components/OrdersView.tsx';
import { DreView } from './components/DreView.tsx';
import { AdsView } from './components/AdsView.tsx';
import { SettingsView } from './components/SettingsView.tsx';
import { LockScreen } from './components/LockScreen.tsx';

type ActiveRoute =
  | '/dashboard'
  | '/dashboard/pedidos'
  | '/dashboard/dre'
  | '/dashboard/ads'
  | '/dashboard/configuracoes';

const NAV_ITEMS: Array<{
  route: ActiveRoute;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    route: '/dashboard',
    label: 'Visão Geral',
    shortLabel: 'Dashboard',
    icon: LayoutDashboard,
  },
  {
    route: '/dashboard/pedidos',
    label: 'Relatório de Pedidos',
    shortLabel: 'Pedidos',
    icon: ShoppingBag,
  },
  {
    route: '/dashboard/dre',
    label: 'DRE Contábil',
    shortLabel: 'DRE',
    icon: Calculator,
  },
  {
    route: '/dashboard/ads',
    label: 'Meta Ads & ROAS',
    shortLabel: 'Ads',
    icon: BarChart3,
  },
  {
    route: '/dashboard/configuracoes',
    label: 'Configurações',
    shortLabel: 'Config',
    icon: SettingsIcon,
  },
];

const PERIOD_OPTIONS: Array<{ id: DatePeriodFilter; label: string }> = [
  { id: 'today', label: 'Hoje' },
  { id: 'yesterday', label: 'Ontem' },
  { id: '7d', label: '7 Dias' },
  { id: 'month', label: 'Este mês' },
  { id: 'custom', label: 'Personalizado' },
  { id: 'all', label: 'Tudo' },
];

const STORAGE_KEYS = {
  SETTINGS: 'profit_dashboard_settings_v3',
  ORDERS: 'profit_dashboard_orders_v3',
  AD_SPENDS: 'profit_dashboard_ad_spends_v3',
  EXPENSES: 'profit_dashboard_expenses_v3',
  PRODUCTS: 'profit_dashboard_products_v3',
  PERIOD: 'profit_dashboard_period_v3',
  CUSTOM_START: 'profit_dashboard_custom_start_v3',
  CUSTOM_END: 'profit_dashboard_custom_end_v3',
  PRIVACY: 'profit_dashboard_privacy_v3',
  DASHBOARD_UNLOCKED: 'profit_dashboard_unlocked_v1',
};

function loadStorageItem<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (parsed !== null && parsed !== undefined) {
      if (typeof fallback === 'object' && !Array.isArray(fallback) && fallback !== null) {
        return { ...fallback, ...parsed };
      }
      return parsed;
    }
  } catch (err) {
    console.warn(`Failed reading ${key} from localStorage:`, err);
  }
  return fallback;
}

function saveStorageItem<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    console.warn(`Failed saving ${key} to localStorage:`, err);
  }
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [activeRoute, setActiveRoute] = useState<ActiveRoute>('/dashboard');

  const initialLocal = useMemo(() => buildInitialSeedData('local_merchant'), []);

  // Default custom range: last 30 days up to today in America/Sao_Paulo (-03:00)
  const defaultDates = useMemo(() => {
    const today = toSaoPauloDateKey(new Date());
    const d30 = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
    return {
      start: toSaoPauloDateKey(d30),
      end: today,
    };
  }, []);

  const [settings, setSettings] = useState<SettingsRecord>(() =>
    loadStorageItem<SettingsRecord>(STORAGE_KEYS.SETTINGS, initialLocal.settings)
  );
  const [products, setProducts] = useState<ProductRecord[]>(() =>
    loadStorageItem<ProductRecord[]>(STORAGE_KEYS.PRODUCTS, initialLocal.products)
  );
  const [orders, setOrders] = useState<OrderRecord[]>(() =>
    loadStorageItem<OrderRecord[]>(STORAGE_KEYS.ORDERS, initialLocal.orders)
  );
  const [adSpends, setAdSpends] = useState<AdSpendRecord[]>(() =>
    loadStorageItem<AdSpendRecord[]>(STORAGE_KEYS.AD_SPENDS, initialLocal.adSpends)
  );
  const [customExpenses, setCustomExpenses] = useState<CustomExpenseRecord[]>(() =>
    loadStorageItem<CustomExpenseRecord[]>(
      STORAGE_KEYS.EXPENSES,
      initialLocal.customExpenses
    )
  );
  const [periodFilter, setPeriodFilter] = useState<DatePeriodFilter>(() =>
    loadStorageItem<DatePeriodFilter>(STORAGE_KEYS.PERIOD, '7d')
  );
  const [customStartDate, setCustomStartDate] = useState<string>(() =>
    loadStorageItem<string>(STORAGE_KEYS.CUSTOM_START, defaultDates.start)
  );
  const [customEndDate, setCustomEndDate] = useState<string>(() =>
    loadStorageItem<string>(STORAGE_KEYS.CUSTOM_END, defaultDates.end)
  );
  const [privacyMode, setPrivacyMode] = useState<boolean>(() =>
    loadStorageItem<boolean>(STORAGE_KEYS.PRIVACY, false)
  );
  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => {
    return (
      localStorage.getItem(STORAGE_KEYS.DASHBOARD_UNLOCKED) === 'true' ||
      sessionStorage.getItem(STORAGE_KEYS.DASHBOARD_UNLOCKED) === 'true'
    );
  });

  const handleUnlock = useCallback((remember: boolean) => {
    if (remember) {
      localStorage.setItem(STORAGE_KEYS.DASHBOARD_UNLOCKED, 'true');
    } else {
      sessionStorage.setItem(STORAGE_KEYS.DASHBOARD_UNLOCKED, 'true');
    }
    setIsUnlocked(true);
  }, []);

  const handleLockDashboard = useCallback(() => {
    localStorage.removeItem(STORAGE_KEYS.DASHBOARD_UNLOCKED);
    sessionStorage.removeItem(STORAGE_KEYS.DASHBOARD_UNLOCKED);
    setIsUnlocked(false);
    toast.success('Dashboard bloqueado. Digite a senha para acessar.');
  }, []);

  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [isSyncingCartpanda, setIsSyncingCartpanda] = useState(false);
  const [isSyncingAds, setIsSyncingAds] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showAppGuide, setShowAppGuide] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          toast.success('Aplicativo instalado com sucesso!');
        }
        setDeferredPrompt(null);
      } catch {
        setShowAppGuide(true);
      }
    } else {
      setShowAppGuide(true);
    }
  };

  // Sync state changes directly to localStorage immediately
  useEffect(() => {
    saveStorageItem(STORAGE_KEYS.SETTINGS, settings);
  }, [settings]);

  useEffect(() => {
    saveStorageItem(STORAGE_KEYS.ORDERS, orders);
  }, [orders]);

  useEffect(() => {
    saveStorageItem(STORAGE_KEYS.AD_SPENDS, adSpends);
  }, [adSpends]);

  useEffect(() => {
    saveStorageItem(STORAGE_KEYS.EXPENSES, customExpenses);
  }, [customExpenses]);

  useEffect(() => {
    saveStorageItem(STORAGE_KEYS.PRODUCTS, products);
  }, [products]);

  useEffect(() => {
    saveStorageItem(STORAGE_KEYS.PERIOD, periodFilter);
  }, [periodFilter]);

  useEffect(() => {
    saveStorageItem(STORAGE_KEYS.CUSTOM_START, customStartDate);
  }, [customStartDate]);

  useEffect(() => {
    saveStorageItem(STORAGE_KEYS.CUSTOM_END, customEndDate);
  }, [customEndDate]);

  useEffect(() => {
    saveStorageItem(STORAGE_KEYS.PRIVACY, privacyMode);
  }, [privacyMode]);

  // Listen to Firebase Auth state & load/clean Firestore data with smart merging
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
      if (currentUser) {
        try {
          const cloudData = await loadOrSeedStoreData(currentUser.uid);
          const currentLocalSettings = loadStorageItem<SettingsRecord>(
            STORAGE_KEYS.SETTINGS,
            settings
          );

          // If local has non-empty API credentials and cloud does not, preserve local and sync to cloud
          const mergedSettings: SettingsRecord = {
            ...cloudData.settings,
            cartpandaOrderFeePercent:
              cloudData.settings.cartpandaOrderFeePercent !== undefined
                ? cloudData.settings.cartpandaOrderFeePercent
                : (currentLocalSettings.cartpandaOrderFeePercent ?? 1.5),
            cartpandaStoreSlug:
              cloudData.settings.cartpandaStoreSlug || currentLocalSettings.cartpandaStoreSlug || '',
            cartpandaApiToken:
              cloudData.settings.cartpandaApiToken || currentLocalSettings.cartpandaApiToken || '',
            metaAdAccountId:
              cloudData.settings.metaAdAccountId || currentLocalSettings.metaAdAccountId || '',
            metaAccessToken:
              cloudData.settings.metaAccessToken || currentLocalSettings.metaAccessToken || '',
            blockedTestPhones:
              cloudData.settings.blockedTestPhones || currentLocalSettings.blockedTestPhones || '',
          };

          if (
            mergedSettings.cartpandaStoreSlug !== cloudData.settings.cartpandaStoreSlug ||
            mergedSettings.cartpandaApiToken !== cloudData.settings.cartpandaApiToken ||
            mergedSettings.metaAdAccountId !== cloudData.settings.metaAdAccountId ||
            mergedSettings.metaAccessToken !== cloudData.settings.metaAccessToken
          ) {
            await saveSettingsInFirestore(currentUser.uid, mergedSettings);
          }

          setSettings(mergedSettings);
          if (cloudData.products.length > 0) setProducts(cloudData.products);
          if (cloudData.orders.length > 0) setOrders(cloudData.orders);
          if (cloudData.adSpends.length > 0) setAdSpends(cloudData.adSpends);
          if (cloudData.customExpenses.length > 0) setCustomExpenses(cloudData.customExpenses);
        } catch (err) {
          console.error('Failed loading Firestore store data:', err);
        }
      }
    });
    return () => unsub();
  }, []);

  // Filter orders and adSpends by global period in America/Sao_Paulo (-03:00)
  const filteredOrders = useMemo(
    () =>
      orders.filter((o) =>
        isDateInPeriod(o.orderDate, periodFilter, new Date(), {
          start: customStartDate,
          end: customEndDate,
        })
      ),
    [orders, periodFilter, customStartDate, customEndDate]
  );

  const filteredAdSpends = useMemo(
    () =>
      adSpends.filter((a) =>
        isDateInPeriod(a.date, periodFilter, new Date(), {
          start: customStartDate,
          end: customEndDate,
        })
      ),
    [adSpends, periodFilter, customStartDate, customEndDate]
  );

  // Sync Meta Ads (/api/ads/sync)
  const handleSyncAds = useCallback(
    async (creds?: { metaAdAccountId?: string; metaAccessToken?: string }): Promise<{
      success: boolean;
      unconfigured?: boolean;
      count: number;
      message?: string;
    }> => {
      const accountId = creds?.metaAdAccountId ?? settings.metaAdAccountId;
      const token = creds?.metaAccessToken ?? settings.metaAccessToken;

      if (creds) {
        const updatedSettings = {
          ...settings,
          metaAdAccountId: creds.metaAdAccountId ?? settings.metaAdAccountId,
          metaAccessToken: creds.metaAccessToken ?? settings.metaAccessToken,
        };
        setSettings(updatedSettings);
        if (user) {
          saveSettingsInFirestore(user.uid, updatedSettings).catch(console.error);
        }
      }

      if (!token || !accountId) {
        return {
          success: false,
          unconfigured: true,
          count: 0,
          message: 'Conta de Anúncios ou Token do Meta Ads não preenchido.',
        };
      }

      setIsSyncingAds(true);
      try {
        const res = await fetch('/api/ads/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            metaAccessToken: token,
            metaAdAccountId: accountId,
            datePreset: 'maximum',
          }),
        });
        const text = await res.text();
        let data: any = {};
        try {
          data = text ? JSON.parse(text) : {};
        } catch {
          throw new Error(`Servidor não retornou JSON válido (${res.status}): ${text.slice(0, 100)}`);
        }
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Falha ao sincronizar Meta Ads');
        }

        if (data.sourceMode === 'unconfigured') {
          return {
            success: false,
            unconfigured: true,
            count: 0,
            message: data.message || 'Configure o ID e Token do Meta Ads.',
          };
        }

        const incomingRecords: Array<Omit<AdSpendRecord, 'id' | 'ownerId'>> =
          data.records || [];

        if (user) {
          const persisted = await persistSyncedAdSpends(user.uid, incomingRecords);
          setAdSpends((prev) => {
            const byId = new Map(prev.map((item) => [item.id, item]));
            for (const p of persisted) byId.set(p.id, p);
            return Array.from(byId.values());
          });
        } else {
          setAdSpends((prev) => {
            const map = new Map(
              prev.map((item) => [`${item.date}_${item.utmCampaign}`, item])
            );
            incomingRecords.forEach((rec, i) => {
              const k = `${rec.date}_${rec.utmCampaign}`;
              map.set(k, {
                id: map.get(k)?.id || `ad_sync_${Date.now()}_${i}`,
                ownerId: 'local_merchant',
                ...rec,
              });
            });
            return Array.from(map.values());
          });
        }

        const nowIso = new Date().toISOString();
        setSettings((prev) => ({ ...prev, lastSyncAt: nowIso }));
        return {
          success: true,
          count: incomingRecords.length,
          message: `${incomingRecords.length} registros de anúncios sincronizados`,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erro no sync de Meta Ads';
        return { success: false, count: 0, message: msg };
      } finally {
        setIsSyncingAds(false);
      }
    },
    [settings, user]
  );

  // Sync Cartpanda (/api/cartpanda/sync)
  const handleSyncCartpanda = useCallback(
    async (creds?: { cartpandaStoreSlug?: string; cartpandaApiToken?: string }): Promise<{
      success: boolean;
      unconfigured?: boolean;
      count: number;
      message?: string;
    }> => {
      const slug = creds?.cartpandaStoreSlug ?? settings.cartpandaStoreSlug;
      const token = creds?.cartpandaApiToken ?? settings.cartpandaApiToken;

      if (creds) {
        const updatedSettings = {
          ...settings,
          cartpandaStoreSlug: creds.cartpandaStoreSlug ?? settings.cartpandaStoreSlug,
          cartpandaApiToken: creds.cartpandaApiToken ?? settings.cartpandaApiToken,
        };
        setSettings(updatedSettings);
        if (user) {
          saveSettingsInFirestore(user.uid, updatedSettings).catch(console.error);
        }
      }

      if (!token) {
        return {
          success: false,
          unconfigured: true,
          count: 0,
          message: 'Token de Acesso da Cartpanda não informado em Configurações.',
        };
      }

      setIsSyncingCartpanda(true);
      try {
        const res = await fetch('/api/cartpanda/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cartpandaApiToken: token,
            cartpandaStoreSlug: slug,
            settings,
          }),
        });
        const text = await res.text();
        let data: any = {};
        try {
          data = text ? JSON.parse(text) : {};
        } catch {
          throw new Error(`Servidor não retornou JSON válido (${res.status}): ${text.slice(0, 100)}`);
        }
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Falha ao sincronizar Cartpanda');
        }

        if (data.sourceMode === 'unconfigured') {
          return {
            success: false,
            unconfigured: true,
            count: 0,
            message: data.message || 'Configure o Token da Cartpanda em Configurações.',
          };
        }

        const incomingOrders: Array<Omit<OrderRecord, 'id' | 'ownerId'>> =
          data.orders || [];

        if (user) {
          const persisted = await persistSyncedOrders(user.uid, incomingOrders);
          setOrders((prev) => {
            const byNum = new Map(prev.map((o) => [o.orderNumber, o]));
            for (const p of persisted) byNum.set(p.orderNumber, p);
            return Array.from(byNum.values());
          });
        } else {
          setOrders((prev) => {
            const byNum = new Map(prev.map((o) => [o.orderNumber, o]));
            incomingOrders.forEach((ord, idx) => {
              byNum.set(ord.orderNumber, {
                id: byNum.get(ord.orderNumber)?.id || `ord_sync_${Date.now()}_${idx}`,
                ownerId: 'local_merchant',
                ...ord,
              });
            });
            return Array.from(byNum.values());
          });
        }

        // Merge any discovered products into catalog for CMV management
        if (Array.isArray(data.discoveredProducts) && data.discoveredProducts.length > 0) {
          setProducts((prev) => {
            const bySku = new Map(prev.map((p) => [p.sku, p]));
            for (const dp of data.discoveredProducts) {
              if (!bySku.has(dp.sku)) {
                bySku.set(dp.sku, {
                  id: dp.id,
                  ownerId: user ? user.uid : 'local_merchant',
                  shopifyId: '',
                  title: dp.title,
                  sku: dp.sku,
                  imageUrl: '',
                  price: dp.price,
                  costPrice: dp.costPrice,
                  stockQuantity: 100,
                  active: true,
                });
              }
            }
            return Array.from(bySku.values());
          });
        }

        const nowIso = new Date().toISOString();
        setSettings((prev) => ({ ...prev, lastCartpandaSyncAt: nowIso }));
        return {
          success: true,
          count: incomingOrders.length,
          message: `${incomingOrders.length} pedidos reais importados da Cartpanda`,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erro no sync da Cartpanda';
        return { success: false, count: 0, message: msg };
      } finally {
        setIsSyncingCartpanda(false);
      }
    },
    [settings, user]
  );

  // Import Orders from CSV (Cartpanda / Shopify export)
  const handleImportCsvOrders = async (csvText: string) => {
    try {
      const { orders: parsed, ignoredTestCount } = parseOrdersCsv(csvText, settings);
      if (parsed.length === 0) {
        toast.error('Nenhum pedido válido encontrado no CSV.');
        return;
      }
      if (user) {
        const persisted = await persistSyncedOrders(user.uid, parsed);
        setOrders((prev) => {
          const byNum = new Map(prev.map((o) => [o.orderNumber, o]));
          for (const p of persisted) byNum.set(p.orderNumber, p);
          return Array.from(byNum.values());
        });
      } else {
        setOrders((prev) => {
          const byNum = new Map(prev.map((o) => [o.orderNumber, o]));
          parsed.forEach((ord, idx) => {
            byNum.set(ord.orderNumber, {
              id: byNum.get(ord.orderNumber)?.id || `ord_csv_${Date.now()}_${idx}`,
              ownerId: 'local_merchant',
              ...ord,
            });
          });
          return Array.from(byNum.values());
        });
      }
      toast.success(
        `${parsed.length} pedidos importados com sucesso!${
          ignoredTestCount > 0 ? ` (${ignoredTestCount} de teste ignorados pelo filtro)` : ''
        }`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao processar CSV';
      toast.error(msg);
    }
  };

  // Global Parallel Sync Button ("Atualizar dados")
  const handleGlobalParallelSync = async () => {
    setIsSyncingAll(true);
    const toastId = toast.loading('Sincronizando Cartpanda e Meta Ads em tempo real...');
    try {
      const [adsRes, cpRes] = await Promise.all([
        handleSyncAds(),
        handleSyncCartpanda(),
      ]);

      if (adsRes.unconfigured && cpRes.unconfigured) {
        toast(
          'Nenhuma integração configurada ainda. Acesse Configurações para conectar seu Token da Cartpanda ou Meta Ads.',
          { id: toastId, icon: '⚙️' }
        );
        return;
      }

      if (cpRes.success && adsRes.success) {
        toast.success(
          `Sincronização 100% concluída! ${cpRes.count} pedidos da Cartpanda e ${adsRes.count} registros de anúncios sincronizados.`,
          { id: toastId }
        );
      } else if (cpRes.success && !adsRes.success) {
        if (adsRes.unconfigured) {
          toast.success(
            `Cartpanda sincronizada com sucesso (${cpRes.count} pedidos importados). Meta Ads não configurado.`,
            { id: toastId }
          );
        } else {
          toast(
            `Cartpanda sincronizada (${cpRes.count} pedidos). Meta Ads: ${adsRes.message}`,
            { id: toastId, icon: '⚠️' }
          );
        }
      } else if (!cpRes.success && adsRes.success) {
        if (cpRes.unconfigured) {
          toast.success(
            `Meta Ads sincronizado com sucesso (${adsRes.count} registros). Cartpanda não configurada.`,
            { id: toastId }
          );
        } else {
          toast(
            `Meta Ads sincronizado (${adsRes.count} registros). Cartpanda: ${cpRes.message}`,
            { id: toastId, icon: '⚠️' }
          );
        }
      } else {
        const errorMsg = cpRes.message || adsRes.message || 'Falha na sincronização';
        toast.error(`Erro ao sincronizar: ${errorMsg}`, { id: toastId });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro durante a sincronização';
      toast.error(msg, { id: toastId });
    } finally {
      setIsSyncingAll(false);
    }
  };

  // Add or update single order (e.g. from Webhook)
  const handleAddOrder = async (order: OrderRecord) => {
    setOrders((prev) => {
      const byNum = new Map(prev.map((o) => [o.orderNumber, o]));
      byNum.set(order.orderNumber, order);
      return Array.from(byNum.values());
    });
    if (user) {
      await persistSyncedOrders(user.uid, [order]);
    }
  };

  const handleSyncCartpandaFromOrders = async () => {
    const res = await handleSyncCartpanda();
    if (res.unconfigured) {
      toast('Informe o Token da Cartpanda em Configurações para sincronizar pedidos.', {
        icon: '⚙️',
      });
    } else if (res.success) {
      toast.success(`Cartpanda sincronizada com sucesso: ${res.count} pedidos importados!`);
    } else {
      toast.error(res.message || 'Falha ao sincronizar pedidos da Cartpanda.');
    }
  };

  const handleSyncAdsFromAdsView = async () => {
    const res = await handleSyncAds();
    if (res.unconfigured) {
      toast('Informe o ID da Conta e Token do Meta Ads em Configurações para sincronizar.', {
        icon: '⚙️',
      });
    } else if (res.success) {
      toast.success(`Meta Ads sincronizado com sucesso: ${res.count} registros de anúncios importados!`);
    } else {
      toast.error(res.message || 'Falha ao sincronizar anúncios do Meta Ads.');
    }
  };

  // Delete single order
  const handleDeleteOrder = async (orderId: string) => {
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
    if (user) {
      await deleteOrderFromFirestore(orderId);
    }
    toast.success('Pedido removido com sucesso.');
  };

  // Purge all test/demo orders
  const handlePurgeTestOrders = async () => {
    const testOrders = orders.filter((o) =>
      isTestOrDemoOrderRecord(o, settings.blockedTestPhones)
    );
    const idsToRemove =
      testOrders.length > 0
        ? testOrders.map((o) => o.id)
        : orders.map((o) => o.id);

    if (idsToRemove.length === 0) {
      toast.success('Nenhum pedido de teste encontrado — banco de dados limpo!');
      return;
    }

    const idSet = new Set(idsToRemove);
    setOrders((prev) => prev.filter((o) => !idSet.has(o.id)));
    if (user) {
      await purgeOrdersFromFirestore(idsToRemove);
    }
    toast.success(
      `${idsToRemove.length} pedido(s) de teste removido(s) permanentemente!`
    );
  };

  // Interactive Order Status Change
  const handleUpdateOrderStatus = async (
    orderId: string,
    newStatus: OrderStatus
  ) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
    );
    if (user) {
      await updateOrderStatusInFirestore(orderId, newStatus);
    }
    toast.success('Status do pedido atualizado! Recálculo aplicado.');
  };

  // Interactive Payment Method Change (Credit Card / PIX / Boleto)
  const handleUpdateOrderPaymentMethod = async (
    orderId: string,
    newMethod: PaymentMethod
  ) => {
    let updatedOrder: OrderRecord | null = null;
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId) return o;
        const fin = calculateOrderFinancials({
          grossAmount: o.grossAmount,
          shippingCost: o.shippingCost,
          cogsAmount: o.cogsAmount,
          paymentMethod: newMethod,
          settings,
        });
        updatedOrder = {
          ...o,
          paymentMethod: newMethod,
          installments: newMethod === 'credit_card' ? Math.max(1, o.installments) : 1,
          ...fin,
        };
        return updatedOrder;
      })
    );

    if (updatedOrder && user) {
      await updateOrderInFirestore(orderId, updatedOrder);
    }
    const label =
      newMethod === 'credit_card'
        ? 'Cartão de Crédito'
        : newMethod === 'pix'
        ? 'PIX'
        : 'Boleto Bancário';
    toast.success(`Forma de pagamento atualizada para ${label}! Taxas e lucro recalculados.`);
  };

  // Bulk Reclassify Orders (Auto-detects Card vs PIX and fixes false pendings)
  const handleBulkReclassifyOrders = async () => {
    let fixedMethodsCount = 0;
    let fixedStatusCount = 0;
    const toastId = toast.loading('Analisando pedidos e corrigindo métodos e status...');

    const updatedOrders = orders.map((o) => {
      let changed = false;
      let newMethod = o.paymentMethod;
      let newStatus = o.status;

      // 1. If currently PIX but has card indicators (installments > 1, card brands, etc.)
      if (o.paymentMethod === 'pix') {
        const hasCardIndicators =
          o.installments > 1 ||
          /visa|master|elo|amex|hiper|card|cartao|cartão|credito|crédito/i.test(o.itemsSummary || '') ||
          /card|cartao|credito/i.test(o.utmCampaign || '');
        if (hasCardIndicators) {
          newMethod = 'credit_card';
          changed = true;
          fixedMethodsCount++;
        }
      }

      // 2. If pending but is a completed order with positive amount and confirmed payment date
      if (o.status === 'pending') {
        const isActuallyPaid =
          Boolean(o.orderDate && !o.orderNumber.includes('AB-') && o.grossAmount > 0) ||
          /pago|approved|paid|sucesso|aprovado|concluido/i.test(o.itemsSummary || '');
        if (isActuallyPaid) {
          newStatus = 'paid_unfulfilled';
          changed = true;
          fixedStatusCount++;
        }
      }

      if (!changed) return o;

      const fin = calculateOrderFinancials({
        grossAmount: o.grossAmount,
        shippingCost: o.shippingCost,
        cogsAmount: o.cogsAmount,
        paymentMethod: newMethod,
        settings,
      });

      return {
        ...o,
        paymentMethod: newMethod,
        status: newStatus,
        ...fin,
      };
    });

    setOrders(updatedOrders);
    if (user) {
      await persistSyncedOrders(user.uid, updatedOrders);
    }

    if (fixedMethodsCount === 0 && fixedStatusCount === 0) {
      toast.success('Todos os pedidos já estão com formas de pagamento e status corretos!', { id: toastId });
    } else {
      toast.success(
        `Correção concluída! ${fixedMethodsCount} pedido(s) ajustados para Cartão e ${fixedStatusCount} pedido(s) atualizados para Aprovados.`,
        { id: toastId }
      );
    }
  };

  // Update Product CMV Unit Cost
  const handleUpdateProductCost = async (
    product: ProductRecord,
    newCost: number
  ) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === product.id ? { ...p, costPrice: newCost } : p))
    );
    if (user) {
      await updateProductCostInFirestore(product, newCost);
    }
    toast.success(`CMV de "${product.title}" atualizado para R$ ${newCost.toFixed(2)}!`);
  };

  // Save Settings & Recalculate Order Financials
  const handleSaveSettings = async (
    updated: Omit<SettingsRecord, 'id' | 'ownerId'>
  ) => {
    const newSettings: SettingsRecord = {
      id: settings.id,
      ownerId: settings.ownerId,
      ...updated,
    };
    setSettings(newSettings);

    // Also filter out any orders matching the updated blocked test phones
    const blockedOrders = orders.filter((ord) =>
      isTestOrDemoOrderRecord(ord, newSettings.blockedTestPhones)
    );
    if (blockedOrders.length > 0 && user) {
      await purgeOrdersFromFirestore(blockedOrders.map((o) => o.id));
    }

    setOrders((prev) =>
      prev
        .filter((ord) => !isTestOrDemoOrderRecord(ord, newSettings.blockedTestPhones))
        .map((ord) => {
          const fin = calculateOrderFinancials({
            grossAmount: ord.grossAmount,
            shippingCost: ord.shippingCost,
            cogsAmount: ord.cogsAmount,
            paymentMethod: ord.paymentMethod,
            settings: newSettings,
          });
          return {
            ...ord,
            grossAmount: fin.grossAmount,
            netAmount: fin.netAmount,
            checkoutFee: fin.checkoutFee,
            gatewayFee: fin.gatewayFee,
            shippingCost: fin.shippingCost,
            taxAmount: fin.taxAmount,
            cogsAmount: fin.cogsAmount,
            netProfit: fin.netProfit,
            profitMargin: fin.profitMargin,
          };
        })
    );

    if (user) {
      await saveSettingsInFirestore(user.uid, updated);
    }
  };

  // Custom Expenses (DRE Line 11)
  const handleAddExpense = async (
    entry: Omit<CustomExpenseRecord, 'id' | 'ownerId'>
  ) => {
    if (user) {
      const created = await addCustomExpenseInFirestore(user.uid, entry);
      setCustomExpenses((prev) => [created, ...prev]);
    } else {
      setCustomExpenses((prev) => [
        {
          id: `exp_local_${Date.now()}`,
          ownerId: 'local_merchant',
          ...entry,
        },
        ...prev,
      ]);
    }
    toast.success('Custo fixo adicionado ao DRE!');
  };

  const handleDeleteExpense = async (expenseId: string) => {
    setCustomExpenses((prev) => prev.filter((e) => e.id !== expenseId));
    if (user) {
      await deleteCustomExpenseInFirestore(expenseId);
    }
    toast.success('Item removido do DRE.');
  };

  const handleGoogleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      toast.success('Conectado com Google! Dados sincronizados na nuvem.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha na autenticação';
      toast.error(msg);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    toast.success('Sessão encerrada.');
  };

  const activeNavMeta =
    NAV_ITEMS.find((n) => n.route === activeRoute) || NAV_ITEMS[0];

  if (!isUnlocked) {
    return (
      <>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#0F172A',
              color: '#F9FAFB',
              border: '1px solid #1E293B',
            },
          }}
        />
        <LockScreen
          correctPassword={settings.dashboardPassword || 'thiagodj97'}
          onUnlock={handleUnlock}
          storeName={settings.storeName}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 flex flex-col md:flex-row">
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#0F172A',
            color: '#F1F5F9',
            border: '1px solid #334155',
            fontSize: '13px',
          },
        }}
      />

      {/* Desktop Sidebar Navigation (256px width) */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-[#0E1420] border-r border-slate-800/90 z-30">
        <div className="h-16 px-6 flex items-center border-b border-slate-800/90">
          <span className="text-lg font-extrabold tracking-tight text-slate-50 font-display whitespace-nowrap">
            Profit Dashboard
          </span>
        </div>

        <div className="px-4 py-4 flex-1 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeRoute === item.route;
            return (
              <button
                key={item.route}
                type="button"
                onClick={() => setActiveRoute(item.route)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 border border-transparent'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Store & Cloud Account Footer */}
        <div className="p-4 border-t border-slate-800/90 space-y-3">
          <div className="px-2">
            <div className="text-xs font-semibold text-slate-200 truncate">
              {settings.storeName}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Fuso: América/São Paulo (-03:00)
            </div>
          </div>

          {/* PWA Install Button */}
          <button
            type="button"
            onClick={handleInstallClick}
            className="w-full py-2 px-3 text-xs font-semibold rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            title="Instalar como aplicativo no celular ou computador"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Instalar como App Web</span>
          </button>

          {/* Lock Dashboard Button */}
          <button
            type="button"
            onClick={handleLockDashboard}
            className="w-full py-1.5 px-3 text-xs font-medium rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors flex items-center justify-center gap-2 cursor-pointer"
            title="Bloquear acesso ao dashboard com senha"
          >
            <Lock className="w-3.5 h-3.5 text-amber-400" />
            <span>Bloquear Painel (Senha)</span>
          </button>

          {authReady && (
            <div>
              {user ? (
                <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-xs text-slate-300 truncate">
                    {user.email}
                  </span>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="p-1 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                    title="Sair"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  className="w-full py-2 px-3 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Sincronizar na Nuvem</span>
                </button>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 md:pl-64 flex flex-col min-h-screen pb-24 md:pb-10">
        {/* Top Bar Contract: Breadcrumb on Left, Primary Action ("Atualizar dados") on Right */}
        <header className="h-14 sm:h-16 px-3 sm:px-8 border-b border-slate-800/90 bg-[#0B0F17]/95 backdrop-blur sticky top-0 z-20 flex items-center justify-between gap-2 sm:gap-6">
          <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-medium text-slate-300 min-w-0">
            <span className="text-slate-400 font-semibold truncate max-w-[120px] sm:max-w-none">
              {settings.storeName}
            </span>
            <span className="text-slate-600">/</span>
            <span className="text-slate-100 font-semibold truncate">
              {activeNavMeta.label}
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleLockDashboard}
              className="flex items-center gap-1.5 p-2 sm:px-3 sm:py-2 text-xs font-medium rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors cursor-pointer"
              title="Bloquear painel com senha"
            >
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Bloquear</span>
            </button>

            <button
              type="button"
              onClick={() => setShowAppGuide(true)}
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors cursor-pointer"
              title="Como usar e instalar como aplicativo web"
            >
              <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
              <span>Usar como App Web</span>
            </button>

            <button
              type="button"
              onClick={handleGlobalParallelSync}
              disabled={isSyncingAll || isSyncingAds || isSyncingCartpanda}
              className="px-2.5 sm:px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white transition-colors flex items-center gap-1.5 sm:gap-2 whitespace-nowrap shrink-0 cursor-pointer shadow-sm shadow-emerald-950/40"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${
                  isSyncingAll || isSyncingAds || isSyncingCartpanda
                    ? 'animate-spin'
                    : ''
                }`}
              />
              <span className="hidden xs:inline sm:inline">
                {isSyncingAll ? 'Sincronizando...' : 'Atualizar dados'}
              </span>
              <span className="inline xs:hidden sm:hidden">
                {isSyncingAll ? '...' : 'Atualizar'}
              </span>
            </button>
          </div>
        </header>

        {/* Global Workspace Filter Toolbar: Period Selector + Custom Date Range + Privacy Mode Toggle */}
        <div className="px-3 sm:px-8 py-2.5 sm:py-3.5 border-b border-slate-800/60 bg-[#0E1420]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2.5 min-w-0 w-full sm:w-auto">
            {/* Global Period Selector */}
            <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg overflow-x-auto no-scrollbar scrollbar-none w-full sm:w-auto">
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setPeriodFilter(opt.id);
                    if (
                      opt.id === 'today' &&
                      (settings.cartpandaApiToken || settings.metaAccessToken) &&
                      !isSyncingAll
                    ) {
                      handleGlobalParallelSync();
                    }
                  }}
                  className={`flex-1 sm:flex-none px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 text-center cursor-pointer ${
                    periodFilter === opt.id
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Custom Date Range Picker */}
            {periodFilter === 'custom' && (
              <div className="flex flex-wrap items-center gap-2 p-1.5 sm:p-1 bg-slate-900/90 border border-emerald-500/40 rounded-lg shadow-sm">
                <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-950/80 border border-slate-800 rounded-md flex-1 sm:flex-none">
                  <Calendar className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="text-[10px] sm:text-[11px] font-semibold text-slate-400">Início:</span>
                  <input
                    type="date"
                    value={customStartDate}
                    max={customEndDate || undefined}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="bg-transparent text-xs text-slate-100 font-mono focus:outline-none cursor-pointer [color-scheme:dark] w-full"
                  />
                </div>

                <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-950/80 border border-slate-800 rounded-md flex-1 sm:flex-none">
                  <span className="text-[10px] sm:text-[11px] font-semibold text-slate-400">Fim:</span>
                  <input
                    type="date"
                    value={customEndDate}
                    min={customStartDate || undefined}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="bg-transparent text-xs text-slate-100 font-mono focus:outline-none cursor-pointer [color-scheme:dark] w-full"
                  />
                </div>

                {/* Quick Presets for Custom Range */}
                <div className="flex items-center gap-1 pl-1 sm:pl-1.5 sm:border-l sm:border-slate-800 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      const today = toSaoPauloDateKey(new Date());
                      const d14 = new Date(Date.now() - 13 * 24 * 60 * 60 * 1000);
                      setCustomStartDate(toSaoPauloDateKey(d14));
                      setCustomEndDate(today);
                    }}
                    className="px-2 py-0.5 text-[11px] font-medium text-slate-400 hover:text-emerald-300 hover:bg-slate-800 rounded transition-colors"
                  >
                    14d
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const today = toSaoPauloDateKey(new Date());
                      const d30 = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
                      setCustomStartDate(toSaoPauloDateKey(d30));
                      setCustomEndDate(today);
                    }}
                    className="px-2 py-0.5 text-[11px] font-medium text-slate-400 hover:text-emerald-300 hover:bg-slate-800 rounded transition-colors"
                  >
                    30d
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Privacy Mode / Presentation Mode Eye Button */}
          <div className="flex items-center self-end sm:self-auto">
            <button
              type="button"
              onClick={() => setPrivacyMode((prev) => !prev)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors flex items-center gap-1.5 sm:gap-2 whitespace-nowrap cursor-pointer ${
                privacyMode
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-slate-100'
              }`}
              title="Modo Privacidade / Apresentação (Ocultar valores)"
            >
              {privacyMode ? (
                <>
                  <EyeOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="text-[11px] sm:text-xs">Privacidade Ativa</span>
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="text-[11px] sm:text-xs">Modo Apresentação</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Route Viewport */}
        <main className="flex-1 px-3 sm:px-8 py-4 sm:py-6 max-w-[1440px] w-full mx-auto">
          {activeRoute === '/dashboard' && (
            <DashboardView
              orders={filteredOrders}
              adSpends={filteredAdSpends}
              products={products}
              privacyMode={privacyMode}
              onUpdateProductCost={handleUpdateProductCost}
              onNavigateOrders={() => setActiveRoute('/dashboard/pedidos')}
              onNavigateSettings={() => setActiveRoute('/dashboard/configuracoes')}
              onSyncAll={handleGlobalParallelSync}
            />
          )}

          {activeRoute === '/dashboard/pedidos' && (
            <OrdersView
              orders={filteredOrders}
              privacyMode={privacyMode}
              isSyncingCartpanda={isSyncingCartpanda}
              onSyncCartpanda={handleSyncCartpandaFromOrders}
              onUpdateOrderStatus={handleUpdateOrderStatus}
              onUpdateOrderPaymentMethod={handleUpdateOrderPaymentMethod}
              onBulkReclassifyOrders={handleBulkReclassifyOrders}
              onDeleteOrder={handleDeleteOrder}
              onPurgeTestOrders={handlePurgeTestOrders}
            />
          )}

          {activeRoute === '/dashboard/dre' && (
            <DreView
              orders={filteredOrders}
              adSpends={filteredAdSpends}
              customExpenses={customExpenses}
              settings={settings}
              privacyMode={privacyMode}
              onAddExpense={handleAddExpense}
              onDeleteExpense={handleDeleteExpense}
            />
          )}

          {activeRoute === '/dashboard/ads' && (
            <AdsView
              adSpends={filteredAdSpends}
              orders={filteredOrders}
              privacyMode={privacyMode}
              isSyncingAds={isSyncingAds}
              onSyncAds={handleSyncAdsFromAdsView}
            />
          )}

          {activeRoute === '/dashboard/configuracoes' && (
            <SettingsView
              settings={settings}
              isSyncingCartpanda={isSyncingCartpanda}
              isSyncingAds={isSyncingAds}
              onSaveSettings={handleSaveSettings}
              onSyncCartpanda={handleSyncCartpanda}
              onSyncAds={handleSyncAds}
              onAddOrder={handleAddOrder}
              onImportCsvOrders={handleImportCsvOrders}
              onPurgeTestOrders={handlePurgeTestOrders}
              onLockDashboard={handleLockDashboard}
            />
          )}
        </main>
      </div>

      {/* Mobile Fixed Bottom Navigation Bar */}
      <nav
        aria-label="Navegação Mobile"
        className="md:hidden fixed bottom-0 inset-x-0 bg-[#0E1420]/95 backdrop-blur border-t border-slate-800/90 z-40 flex items-center justify-around px-1 pb-[env(safe-area-inset-bottom,0px)] h-[calc(3.75rem+env(safe-area-inset-bottom,0px))]"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeRoute === item.route;
          return (
            <button
              key={item.route}
              type="button"
              onClick={() => setActiveRoute(item.route)}
              className={`flex flex-col items-center justify-center flex-1 py-1.5 px-1 rounded-lg transition-all min-h-[44px] cursor-pointer ${
                isActive
                  ? 'text-emerald-400'
                  : 'text-slate-400 hover:text-slate-200 active:scale-95'
              }`}
            >
              <div className={`p-1 rounded-md transition-colors ${isActive ? 'bg-emerald-500/15' : ''}`}>
                <Icon className="w-4 h-4" />
              </div>
              <span className={`text-[10px] tracking-tight mt-0.5 ${isActive ? 'font-semibold text-emerald-400' : 'font-normal'}`}>
                {item.shortLabel}
              </span>
            </button>
          );
        })}
      </nav>

      {/* PWA & Web App Guide Modal */}
      {showAppGuide && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-[#111827] border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setShowAppGuide(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 cursor-pointer p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">
                  Como Usar Como Aplicação Web
                </h3>
                <p className="text-xs text-slate-400">
                  Acesse no celular ou computador como um aplicativo nativo
                </p>
              </div>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Step 1: Link Direto */}
              <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
                <div className="font-semibold text-slate-200 flex items-center justify-between">
                  <span>1. Link Direto da Sua Aplicação Web</span>
                  <span className="text-[10px] text-emerald-400 font-semibold px-1.5 py-0.5 rounded bg-emerald-500/15">
                    Nuvem Ativa 24h
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={window.location.origin}
                    className="w-full px-2.5 py-2 text-[11px] font-mono bg-slate-950 border border-slate-700/80 rounded-lg text-emerald-300 select-all focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(window.location.origin);
                      toast.success('Link do aplicativo copiado para a área de transferência!');
                    }}
                    className="px-3.5 py-2 text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors whitespace-nowrap cursor-pointer shrink-0"
                  >
                    Copiar Link
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  Abra este link em qualquer navegador (Chrome, Safari, Edge) no celular, tablet ou computador.
                </p>
              </div>

              {/* Step 2: Instalar no Celular */}
              <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
                <div className="font-semibold text-slate-200">
                  2. Instalar na Tela de Início do Celular (PWA)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-300">
                  <div className="p-2.5 bg-slate-950/70 border border-slate-800/80 rounded-lg space-y-1">
                    <span className="font-bold text-emerald-400 flex items-center gap-1">
                      📱 iPhone / iPad (Safari)
                    </span>
                    <p className="text-slate-400 leading-relaxed">
                      Toque no botão <strong>Compartilhar</strong> (ícone com quadrado e seta para cima) e selecione <strong>"Adicionar à Tela de Início"</strong>.
                    </p>
                  </div>
                  <div className="p-2.5 bg-slate-950/70 border border-slate-800/80 rounded-lg space-y-1">
                    <span className="font-bold text-emerald-400 flex items-center gap-1">
                      🤖 Android (Chrome)
                    </span>
                    <p className="text-slate-400 leading-relaxed">
                      Toque nos <strong>três pontinhos</strong> no canto superior e selecione <strong>"Instalar aplicativo"</strong> ou <strong>"Adicionar à tela inicial"</strong>.
                    </p>
                  </div>
                </div>
              </div>

              {/* Step 3: Computador */}
              <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
                <div className="font-semibold text-slate-200">
                  3. Instalar no Computador (Windows / Mac / Linux)
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  No Chrome ou Edge, clique no ícone de <strong>Instalar</strong> na barra de endereços (ao lado dos favoritos) ou clique no botão <strong>"Instalar como App Web"</strong> na barra lateral esquerda. Ele abrirá em janela própria sem abas.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowAppGuide(false)}
                className="w-full py-2.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer"
              >
                Entendi, fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
