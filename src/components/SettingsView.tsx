import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  FileSpreadsheet,
  HelpCircle,
  KeyRound,
  Lock,
  RefreshCw,
  Save,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Store,
  Trash2,
  Upload,
  Webhook,
  Zap,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  cleanCartpandaSlug,
  cleanMetaAccountId,
  formatSaoPauloDateTime,
  OrderRecord,
  SettingsRecord,
} from '../lib/profit-engine.ts';

interface SettingsViewProps {
  settings: SettingsRecord;
  isSyncingCartpanda: boolean;
  isSyncingAds: boolean;
  onSaveSettings: (updated: Omit<SettingsRecord, 'id' | 'ownerId'>) => Promise<void>;
  onSyncCartpanda: (creds?: {
    cartpandaStoreSlug?: string;
    cartpandaApiToken?: string;
  }) => Promise<{
    success: boolean;
    unconfigured?: boolean;
    count: number;
    message?: string;
  }>;
  onSyncAds: (creds?: {
    metaAdAccountId?: string;
    metaAccessToken?: string;
  }) => Promise<{
    success: boolean;
    unconfigured?: boolean;
    count: number;
    message?: string;
  }>;
  onAddOrder?: (order: OrderRecord) => Promise<void>;
  onImportCsvOrders?: (csvText: string) => Promise<void>;
  onPurgeTestOrders: () => Promise<void>;
  onLockDashboard?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  isSyncingCartpanda,
  isSyncingAds,
  onSaveSettings,
  onSyncCartpanda,
  onSyncAds,
  onAddOrder,
  onImportCsvOrders,
  onPurgeTestOrders,
  onLockDashboard,
}) => {
  const [formData, setFormData] = useState<Omit<SettingsRecord, 'id' | 'ownerId'>>({
    storeName: settings.storeName,
    taxRate: settings.taxRate,
    cartpandaOrderFeePercent: settings.cartpandaOrderFeePercent ?? 1.5,
    cartpandaPixFeePercent: settings.cartpandaPixFeePercent,
    cartpandaPixFeeFixed: settings.cartpandaPixFeeFixed,
    cartpandaCardFeePercent: settings.cartpandaCardFeePercent,
    cartpandaCardFeeFixed: settings.cartpandaCardFeeFixed,
    cartpandaBilletFeeFixed: settings.cartpandaBilletFeeFixed,
    metaAccessToken: settings.metaAccessToken,
    metaAdAccountId: settings.metaAdAccountId,
    lastSyncAt: settings.lastSyncAt,
    cartpandaApiToken: settings.cartpandaApiToken,
    cartpandaStoreSlug: settings.cartpandaStoreSlug,
    lastCartpandaSyncAt: settings.lastCartpandaSyncAt,
    blockedTestPhones: settings.blockedTestPhones,
    dashboardPassword: settings.dashboardPassword || 'thiagodj97',
  });

  React.useEffect(() => {
    setFormData({
      storeName: settings.storeName,
      taxRate: settings.taxRate,
      cartpandaOrderFeePercent: settings.cartpandaOrderFeePercent ?? 1.5,
      cartpandaPixFeePercent: settings.cartpandaPixFeePercent,
      cartpandaPixFeeFixed: settings.cartpandaPixFeeFixed,
      cartpandaCardFeePercent: settings.cartpandaCardFeePercent,
      cartpandaCardFeeFixed: settings.cartpandaCardFeeFixed,
      cartpandaBilletFeeFixed: settings.cartpandaBilletFeeFixed,
      metaAccessToken: settings.metaAccessToken,
      metaAdAccountId: settings.metaAdAccountId,
      lastSyncAt: settings.lastSyncAt,
      cartpandaApiToken: settings.cartpandaApiToken,
      cartpandaStoreSlug: settings.cartpandaStoreSlug,
      lastCartpandaSyncAt: settings.lastCartpandaSyncAt,
      blockedTestPhones: settings.blockedTestPhones,
      dashboardPassword: settings.dashboardPassword || 'thiagodj97',
    });
  }, [settings]);

  const [cartpandaTab, setCartpandaTab] = useState<'webhook' | 'api' | 'csv'>('webhook');
  const [showCartpandaToken, setShowCartpandaToken] = useState(false);
  const [showMetaToken, setShowMetaToken] = useState(false);
  const [showDashboardPassword, setShowDashboardPassword] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const webhookUrl = `${window.location.origin}/api/webhooks/cartpanda`;

  const handleCopyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopiedWebhook(true);
      toast.success('URL do Webhook copiada!');
      setTimeout(() => setCopiedWebhook(false), 2000);
    } catch {
      toast.error('Não foi possível copiar automaticamente.');
    }
  };

  const handleTestWebhook = async () => {
    setIsTestingWebhook(true);
    const toastId = toast.loading('Enviando evento de teste para o Webhook...');
    try {
      const res = await fetch('/api/webhooks/cartpanda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'order.paid',
          data: {
            id: `wh_test_${Date.now()}`,
            order_number: `#CP-WH-${Math.floor(1000 + Math.random() * 9000)}`,
            total_price: 197.9,
            created_at: new Date().toISOString(),
            financial_status: 'paid',
            fulfillment_status: 'fulfilled',
            payment_method: 'pix',
            customer: {
              name: 'Cliente Teste Webhook',
              email: 'webhook@cliente.com.br',
              phone: '(11) 98765-4321',
            },
            orders_shippings: {
              price: 18.5,
              tracking_code: 'BR123456789BR',
            },
            line_items: [
              {
                title: 'Kit Teste Webhook Cartpanda',
                quantity: 1,
                cost_price: 45.0,
                price: 197.9,
              },
            ],
            tracking_parameters: {
              utm_source: 'webhook_test',
              utm_campaign: 'validacao_integracao',
            },
          },
          settings: formData,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Falha ao processar webhook');
      }

      if (data.order && onAddOrder) {
        await onAddOrder(data.order);
      }

      toast.success(
        'Webhook funcionando perfeitamente! Pedido real de exemplo adicionado ao dashboard.',
        { id: toastId }
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao testar webhook';
      toast.error(msg, { id: toastId });
    } finally {
      setIsTestingWebhook(false);
    }
  };

  const handleSaveAll = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    try {
      const sanitized = {
        ...formData,
        cartpandaStoreSlug: cleanCartpandaSlug(formData.cartpandaStoreSlug),
        metaAdAccountId: cleanMetaAccountId(formData.metaAdAccountId),
      };
      setFormData(sanitized);
      await onSaveSettings(sanitized);
      toast.success('Todas as configurações foram salvas com sucesso!');
    } catch {
      toast.error('Erro ao salvar configurações.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleConnectAndSyncCartpanda = async () => {
    const slug = cleanCartpandaSlug(formData.cartpandaStoreSlug);
    const token = formData.cartpandaApiToken.trim();

    if (!token) {
      toast.error('Informe o Token de Acesso da Cartpanda (gerado em Configurações > API).');
      return;
    }

    const updated = {
      ...formData,
      cartpandaStoreSlug: slug,
      cartpandaApiToken: token,
    };
    setFormData(updated);

    const toastId = toast.loading('Salvando credenciais e conectando à Cartpanda...');
    try {
      await onSaveSettings(updated);
      const res = await onSyncCartpanda({
        cartpandaStoreSlug: slug,
        cartpandaApiToken: token,
      });
      if (res.success) {
        toast.success(
          `Cartpanda conectada com sucesso! ${res.count} pedidos sincronizados.`,
          { id: toastId }
        );
      } else {
        toast.error(res.message || 'Falha ao sincronizar pedidos da Cartpanda.', {
          id: toastId,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro na sincronização';
      toast.error(msg, { id: toastId });
    }
  };

  const handleConnectAndSyncAds = async () => {
    const accountId = cleanMetaAccountId(formData.metaAdAccountId);
    const token = formData.metaAccessToken.trim();

    if (!accountId) {
      toast.error('Informe o ID da sua Conta de Anúncios (ex: act_123456789).');
      return;
    }
    if (!token) {
      toast.error('Informe o Token de Acesso do Meta Ads.');
      return;
    }

    const updated = {
      ...formData,
      metaAdAccountId: accountId,
      metaAccessToken: token,
    };
    setFormData(updated);

    const toastId = toast.loading('Salvando credenciais e conectando ao Meta Ads...');
    try {
      await onSaveSettings(updated);
      const res = await onSyncAds({
        metaAdAccountId: accountId,
        metaAccessToken: token,
      });
      if (res.success) {
        toast.success(
          `Meta Ads conectado com sucesso! ${res.count} registros de anúncios importados.`,
          { id: toastId }
        );
      } else {
        toast.error(res.message || 'Falha ao sincronizar anúncios do Meta Ads.', {
          id: toastId,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro na sincronização do Meta Ads';
      toast.error(msg, { id: toastId });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (text && onImportCsvOrders) {
        await onImportCsvOrders(text);
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const isCartpandaConfigured = Boolean(
    formData.cartpandaStoreSlug || formData.cartpandaApiToken
  );
  const isMetaConfigured = Boolean(
    formData.metaAdAccountId && formData.metaAccessToken
  );

  return (
    <div className="space-y-6">
      {/* Top Header & Save Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#111827] border border-slate-800 rounded-xl p-5 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2.5">
            <Store className="w-5 h-5 text-emerald-400" />
            <span>Configurações &amp; Integrações</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Conecte sua Cartpanda, Meta Ads e configure suas taxas e impostos para cálculo automático de Lucro Real e ROAS.
          </p>
        </div>

        <button
          type="button"
          onClick={() => handleSaveAll()}
          disabled={isSaving}
          className="px-5 py-2.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white transition-all flex items-center gap-2 whitespace-nowrap shrink-0 self-start sm:self-auto cursor-pointer shadow-md shadow-emerald-950/40"
        >
          <Save className="w-4 h-4" />
          <span>{isSaving ? 'Salvando...' : 'Salvar Todas as Configurações'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ================= CARD 1: CARTPANDA ================= */}
        <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-5 shadow-sm flex flex-col justify-between">
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-base">
                  🐼
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <span>Cartpanda</span>
                    {isCartpandaConfigured ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        <CheckCircle2 className="w-3 h-3" />
                        Configurado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        Aguardando Conexão
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Importe pedidos, carrinhos abandonados e rastreio em tempo real
                  </p>
                </div>
              </div>

              {settings.lastCartpandaSyncAt && (
                <span className="text-[11px] font-mono text-slate-400 hidden sm:block">
                  Último sync: {formatSaoPauloDateTime(settings.lastCartpandaSyncAt)}
                </span>
              )}
            </div>

            {/* Integration Method Tabs */}
            <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg overflow-x-auto no-scrollbar scrollbar-none">
              <button
                type="button"
                onClick={() => setCartpandaTab('webhook')}
                className={`flex-1 py-1.5 px-2.5 sm:px-3 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                  cartpandaTab === 'webhook'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Webhook className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">1. Webhook (Mais Fácil)</span>
                <span className="sm:hidden">Webhook</span>
              </button>

              <button
                type="button"
                onClick={() => setCartpandaTab('api')}
                className={`flex-1 py-1.5 px-2.5 sm:px-3 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                  cartpandaTab === 'api'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Zap className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">2. API REST</span>
                <span className="sm:hidden">API REST</span>
              </button>

              <button
                type="button"
                onClick={() => setCartpandaTab('csv')}
                className={`flex-1 py-1.5 px-2.5 sm:px-3 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                  cartpandaTab === 'csv'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">3. Importar CSV</span>
                <span className="sm:hidden">Importar CSV</span>
              </button>
            </div>

            {/* TAB 1: WEBHOOK (Easiest) */}
            {cartpandaTab === 'webhook' && (
              <div className="space-y-4 pt-1">
                <div className="p-3.5 bg-emerald-950/20 border border-emerald-500/20 rounded-lg space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
                    <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Conexão Instantânea Sem Chave de API</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Copie a URL abaixo e cole no painel da Cartpanda em <strong>Configurações &gt; Webhooks &gt; Adicionar Webhook</strong> com todos os eventos selecionados:
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Sua URL Única de Webhook Cartpanda:
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={webhookUrl}
                      className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-700/80 rounded-lg text-emerald-300 select-all focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleCopyWebhook}
                      className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer shadow-sm"
                    >
                      {copiedWebhook ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-white" />
                          <span>Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copiar URL</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleTestWebhook}
                    disabled={isTestingWebhook}
                    className="w-full py-2.5 px-4 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Send className={`w-3.5 h-3.5 ${isTestingWebhook ? 'animate-pulse' : ''}`} />
                    <span>
                      {isTestingWebhook
                        ? 'Disparando evento de teste...'
                        : '🧪 Testar Disparo de Webhook (Criar Pedido de Exemplo)'}
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* TAB 2: API REST */}
            {cartpandaTab === 'api' && (
              <div className="space-y-4 pt-1">
                <div className="grid grid-cols-1 gap-3.5">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center justify-between">
                      <span>Slug da Loja Cartpanda</span>
                      <span className="text-[11px] font-normal text-emerald-400">Opcional</span>
                    </label>
                    <input
                      type="text"
                      value={formData.cartpandaStoreSlug}
                      onChange={(e) => {
                        const cleaned = cleanCartpandaSlug(e.target.value);
                        setFormData({
                          ...formData,
                          cartpandaStoreSlug: cleaned,
                        });
                      }}
                      placeholder="minha-loja (opcional)"
                      className="w-full px-3 py-2 text-xs font-mono bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      A Cartpanda autentica pedidos diretamente via Token Bearer. Se sua loja possuir subdomínio específico, informe aqui.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Token de Acesso da API (Bearer Token)
                    </label>
                    <div className="relative">
                      <input
                        type={showCartpandaToken ? 'text' : 'password'}
                        value={formData.cartpandaApiToken}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            cartpandaApiToken: e.target.value.trim(),
                          })
                        }
                        placeholder="Cole aqui seu token gerado na Cartpanda"
                        className="w-full pl-3 pr-9 py-2 text-xs font-mono bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCartpandaToken((prev) => !prev)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer"
                        title={showCartpandaToken ? 'Ocultar token' : 'Exibir token'}
                      >
                        {showCartpandaToken ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Encontre em: <strong>Cartpanda &gt; Configurações &gt; API &gt; Criar Novo Token</strong>.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleConnectAndSyncCartpanda}
                  disabled={isSyncingCartpanda}
                  className="w-full py-2.5 px-4 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-emerald-950/40"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isSyncingCartpanda ? 'animate-spin' : ''}`}
                  />
                  <span>
                    {isSyncingCartpanda
                      ? 'Conectando e sincronizando pedidos...'
                      : 'Conectar & Sincronizar Pedidos Agora'}
                  </span>
                </button>
              </div>
            )}

            {/* TAB 3: CSV IMPORT */}
            {cartpandaTab === 'csv' && (
              <div className="space-y-4 pt-1">
                <div className="p-4 border-2 border-dashed border-slate-700 hover:border-emerald-500/50 bg-slate-900/50 rounded-xl text-center space-y-3 transition-colors">
                  <div className="w-10 h-10 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-slate-200">
                      Importar Planilha de Pedidos (.CSV)
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5 max-w-sm mx-auto">
                      Exporte o histórico de pedidos da sua Cartpanda ou Shopify em formato CSV e envie aqui para calcular o lucro retroativo.
                    </p>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="csv-file-input"
                  />
                  <label
                    htmlFor="csv-file-input"
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-all cursor-pointer shadow-sm"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>Selecionar Arquivo .CSV</span>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ================= CARD 2: META ADS ================= */}
        <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-5 shadow-sm flex flex-col justify-between">
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 font-bold text-base">
                  📈
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <span>Meta Ads (Facebook &amp; Instagram)</span>
                    {isMetaConfigured ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500/15 text-sky-400 border border-sky-500/30">
                        <CheckCircle2 className="w-3 h-3" />
                        Configurado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        Aguardando Conexão
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Sincronização diária de gastos (spend), cliques e impressões por campanha
                  </p>
                </div>
              </div>

              {settings.lastSyncAt && (
                <span className="text-[11px] font-mono text-slate-400 hidden sm:block">
                  Último sync: {formatSaoPauloDateTime(settings.lastSyncAt)}
                </span>
              )}
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  ID da Conta de Anúncios (com ou sem act_)
                </label>
                <input
                  type="text"
                  value={formData.metaAdAccountId}
                  onChange={(e) => {
                    const cleaned = cleanMetaAccountId(e.target.value);
                    setFormData({
                      ...formData,
                      metaAdAccountId: cleaned,
                    });
                  }}
                  placeholder="ex: act_1234567890 ou 1234567890"
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Encontre no Gerenciador de Anúncios da Meta no topo da tela ou na URL.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Token de Acesso do Meta Marketing API
                </label>
                <div className="relative">
                  <input
                    type={showMetaToken ? 'text' : 'password'}
                    value={formData.metaAccessToken}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        metaAccessToken: e.target.value.trim(),
                      })
                    }
                    placeholder="EAABsbCS1iHgBO••••••••••••••••"
                    className="w-full pl-3 pr-9 py-2 text-xs font-mono bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowMetaToken((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer"
                    title={showMetaToken ? 'Ocultar token' : 'Exibir token'}
                  >
                    {showMetaToken ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Necessita apenas da permissão <code className="text-sky-300">ads_read</code>. Pode ser um Token de Usuário do Sistema ou Token de Acesso da Graph API.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleConnectAndSyncAds}
              disabled={isSyncingAds}
              className="w-full py-2.5 px-4 text-xs font-bold rounded-lg bg-sky-600 hover:bg-sky-500 text-white transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-sky-950/40"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isSyncingAds ? 'animate-spin' : ''}`}
              />
              <span>
                {isSyncingAds
                  ? 'Sincronizando gastos Meta Ads...'
                  : 'Conectar & Sincronizar Anúncios Agora'}
              </span>
            </button>
          </div>
        </div>

        {/* ================= CARD 3: TAXAS & IMPOSTOS ================= */}
        <div className="lg:col-span-2 bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-5 shadow-sm">
          <div className="pb-3 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-base">
                ⚖️
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-100">
                  Parâmetros de Custo, Impostos &amp; Taxas de Checkout
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Estes valores são aplicados na dedução de cada pedido para calcular o <strong>Lucro Líquido Real</strong>
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Nome da Loja
              </label>
              <input
                type="text"
                value={formData.storeName}
                onChange={(e) =>
                  setFormData({ ...formData, storeName: e.target.value })
                }
                className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Alíquota de Imposto (% Simples Nacional)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  value={formData.taxRate}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      taxRate: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-emerald-500"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-mono">
                  %
                </span>
              </div>
            </div>

            <div className="p-2.5 bg-emerald-950/25 border border-emerald-500/35 rounded-lg space-y-1">
              <label className="block text-xs font-semibold text-emerald-300 flex items-center justify-between">
                <span>Taxa Cartpanda por Pedido (%)</span>
                <span className="text-[10px] font-normal px-1 rounded bg-emerald-500/20 text-emerald-300">
                  Checkout
                </span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={formData.cartpandaOrderFeePercent}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      cartpandaOrderFeePercent: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-1.5 text-xs font-mono font-semibold bg-slate-900 border border-emerald-500/40 rounded-lg text-emerald-200 focus:outline-none focus:border-emerald-400"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-emerald-400 font-mono font-bold">
                  %
                </span>
              </div>
              <p className="text-[10px] text-slate-400 leading-tight">
                Taxa da plataforma Cartpanda sobre o valor do pedido (ex: 1.5% Pro / 2.5% Starter).
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Taxa PIX Cartpanda (%)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  value={formData.cartpandaPixFeePercent}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      cartpandaPixFeePercent: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-emerald-500"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-mono">
                  %
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Taxa PIX Fixa (R$)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  value={formData.cartpandaPixFeeFixed}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      cartpandaPixFeeFixed: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-emerald-500"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-mono">
                  R$
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Taxa Cartão de Crédito (%)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  value={formData.cartpandaCardFeePercent}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      cartpandaCardFeePercent: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-emerald-500"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-mono">
                  %
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Taxa Cartão Fixa (R$)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  value={formData.cartpandaCardFeeFixed}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      cartpandaCardFeeFixed: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-emerald-500"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-mono">
                  R$
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Taxa Boleto Fixa (R$)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  value={formData.cartpandaBilletFeeFixed}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      cartpandaBilletFeeFixed: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-emerald-500"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-mono">
                  R$
                </span>
              </div>
            </div>

            {/* Anti-Test Filter */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-amber-300 mb-1">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Telefones de Teste Ignorados</span>
              </label>
              <input
                type="text"
                value={formData.blockedTestPhones}
                onChange={(e) =>
                  setFormData({ ...formData, blockedTestPhones: e.target.value })
                }
                placeholder="(41) 99582-4010"
                className="w-full px-3 py-2 text-xs font-mono bg-slate-900 border border-amber-500/40 rounded-lg text-slate-100 focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {/* Purge Test Orders Action */}
          <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-[11px] text-slate-400">
              Pedidos com telefones listados no Filtro Anti-Testes são descartados automaticamente antes de entrar no seu banco de dados.
            </p>

            <button
              type="button"
              onClick={onPurgeTestOrders}
              className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 self-start sm:self-auto cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Remover Pedidos de Teste do Banco</span>
            </button>
          </div>
        </div>

        {/* ================= CARD 4: SEGURANÇA E SENHA DO DASHBOARD ================= */}
        <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4 shadow-sm lg:col-span-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold">
                <Lock className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <span>Segurança &amp; Senha de Acesso ao Dashboard</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    <ShieldCheck className="w-3 h-3" />
                    Protegido
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Proteja seus dados financeiros e pedidos exigindo senha para entrar no aplicativo.
                </p>
              </div>
            </div>

            {onLockDashboard && (
              <button
                type="button"
                onClick={onLockDashboard}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 self-start sm:self-auto cursor-pointer"
                title="Bloquear a tela agora para testar a senha"
              >
                <Lock className="w-3.5 h-3.5 text-emerald-400" />
                <span>Bloquear Tela Agora</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-200">
                Senha de Acesso (Atual: <span className="font-mono text-emerald-400">{formData.dashboardPassword || 'thiagodj97'}</span>)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <KeyRound className="w-4 h-4 text-emerald-500/70" />
                </div>
                <input
                  type={showDashboardPassword ? 'text' : 'password'}
                  value={formData.dashboardPassword || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      dashboardPassword: e.target.value,
                    })
                  }
                  placeholder="thiagodj97"
                  className="w-full pl-9 pr-10 py-2.5 text-xs font-mono bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setShowDashboardPassword(!showDashboardPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 cursor-pointer"
                  title={showDashboardPassword ? 'Ocultar senha' : 'Ver senha'}
                >
                  {showDashboardPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                Ao alterar a senha, clique em <strong>"Salvar Todas as Configurações"</strong> no topo da página.
              </p>
            </div>

            <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg space-y-1.5 text-xs text-slate-300">
              <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Como funciona o bloqueio:</span>
              </span>
              <ul className="space-y-1 text-[11px] text-slate-400 list-disc list-inside">
                <li>Qualquer pessoa abrindo o link no celular ou computador precisará digitar esta senha.</li>
                <li>Você pode marcar "Manter conectado neste navegador" para não ter que digitar sempre.</li>
                <li>Para bloquear a qualquer momento, use o botão de cadeado no menu lateral ou acima.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
