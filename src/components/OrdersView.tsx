import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  Filter,
  HelpCircle,
  QrCode,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  User as UserIcon,
} from 'lucide-react';
import {
  formatSaoPauloDateTime,
  isPaidOrderStatus,
  OrderRecord,
  OrderStatus,
  PaymentMethod,
} from '../lib/profit-engine.ts';
import { formatBRL, formatPercent } from './Formatters.tsx';

interface OrdersViewProps {
  orders: OrderRecord[];
  privacyMode: boolean;
  isSyncingCartpanda: boolean;
  onSyncCartpanda: () => Promise<void>;
  onUpdateOrderStatus: (orderId: string, newStatus: OrderStatus) => Promise<void>;
  onUpdateOrderPaymentMethod?: (orderId: string, newMethod: PaymentMethod) => Promise<void>;
  onBulkReclassifyOrders?: () => Promise<void>;
  onDeleteOrder: (orderId: string) => Promise<void>;
  onPurgeTestOrders: () => Promise<void>;
}

const ORDER_STATUS_META: Record<
  OrderStatus,
  { label: string; bgClass: string; textClass: string; borderClass: string }
> = {
  paid_unfulfilled: {
    label: 'Aprovado (Aguardando Envio)',
    bgClass: 'bg-emerald-500/15',
    textClass: 'text-emerald-300',
    borderClass: 'border-emerald-500/40',
  },
  approved: {
    label: 'Aprovado (Enviado)',
    bgClass: 'bg-emerald-500/15',
    textClass: 'text-emerald-300',
    borderClass: 'border-emerald-500/40',
  },
  pending: {
    label: 'Pagamento Pendente',
    bgClass: 'bg-amber-500/15',
    textClass: 'text-amber-300',
    borderClass: 'border-amber-500/30',
  },
  abandoned: {
    label: 'Carrinho Abandonado',
    bgClass: 'bg-orange-500/15',
    textClass: 'text-orange-300',
    borderClass: 'border-orange-500/30',
  },
  canceled: {
    label: 'Cancelado',
    bgClass: 'bg-rose-500/15',
    textClass: 'text-rose-300',
    borderClass: 'border-rose-500/30',
  },
  refunded: {
    label: 'Reembolsado',
    bgClass: 'bg-purple-500/15',
    textClass: 'text-purple-300',
    borderClass: 'border-purple-500/30',
  },
};

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  credit_card: 'Cartão de Crédito',
  pix: 'PIX',
  billet: 'Boleto Bancário',
};

const STATUS_FILTER_TABS: Array<{ id: string; label: string }> = [
  { id: 'all', label: 'Todos os Status' },
  { id: 'paid_all', label: '✅ Aprovados / Pagos' },
  { id: 'paid_unfulfilled', label: '📦 Aguardando Envio' },
  { id: 'approved', label: '🚚 Enviados' },
  { id: 'pending', label: '⏳ Pendentes' },
  { id: 'abandoned', label: '🛒 Abandonados' },
  { id: 'canceled', label: '❌ Cancelados' },
  { id: 'refunded', label: '↩️ Reembolsados' },
];

export const OrdersView: React.FC<OrdersViewProps> = ({
  orders,
  privacyMode,
  isSyncingCartpanda,
  onSyncCartpanda,
  onUpdateOrderStatus,
  onUpdateOrderPaymentMethod,
  onBulkReclassifyOrders,
  onDeleteOrder,
  onPurgeTestOrders,
}) => {
  const [activeStatusTab, setActiveStatusTab] = useState<string>('all');
  const [activePaymentFilter, setActivePaymentFilter] = useState<'all' | PaymentMethod>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // 1. Calculate Payment Method Breakdown Metrics (Cards Strip)
  const paymentMethodMetrics = useMemo(() => {
    const totalPaidRevenue = orders
      .filter((o) => isPaidOrderStatus(o.status))
      .reduce((acc, o) => acc + o.grossAmount, 0) || 1;

    const computeForMethod = (method: PaymentMethod) => {
      const allForMethod = orders.filter((o) => o.paymentMethod === method);
      const paidForMethod = allForMethod.filter((o) => isPaidOrderStatus(o.status));
      const revenue = paidForMethod.reduce((acc, o) => acc + o.grossAmount, 0);
      const netProfit = paidForMethod.reduce((acc, o) => acc + o.netProfit, 0);
      const share = (revenue / totalPaidRevenue) * 100;
      const count = allForMethod.length;
      const paidCount = paidForMethod.length;
      const ticket = paidCount > 0 ? revenue / paidCount : 0;

      return {
        method,
        label: PAYMENT_METHOD_LABELS[method],
        count,
        paidCount,
        revenue,
        netProfit,
        share,
        ticket,
      };
    };

    return {
      credit_card: computeForMethod('credit_card'),
      pix: computeForMethod('pix'),
      billet: computeForMethod('billet'),
    };
  }, [orders]);

  // 2. Filter Orders by Status, Payment Method, and Search Query
  const filteredOrders = useMemo(() => {
    return orders.filter((ord) => {
      // Payment Method Filter
      if (activePaymentFilter !== 'all' && ord.paymentMethod !== activePaymentFilter) {
        return false;
      }

      // Status Filter
      if (activeStatusTab === 'paid_all') {
        if (!isPaidOrderStatus(ord.status)) return false;
      } else if (activeStatusTab !== 'all') {
        if (ord.status !== activeStatusTab) return false;
      }

      // Search Filter
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        ord.orderNumber.toLowerCase().includes(q) ||
        ord.customerName.toLowerCase().includes(q) ||
        ord.customerEmail.toLowerCase().includes(q) ||
        ord.customerPhone.toLowerCase().includes(q) ||
        ord.utmCampaign.toLowerCase().includes(q) ||
        ord.utmSource.toLowerCase().includes(q) ||
        ord.itemsSummary.toLowerCase().includes(q)
      );
    });
  }, [orders, activeStatusTab, activePaymentFilter, searchQuery]);

  const getCustomerDisplayName = (ord: OrderRecord): string => {
    if (
      ord.customerName &&
      ord.customerName !== 'Cliente E-commerce' &&
      ord.customerName !== 'Cliente Não Identificado' &&
      ord.customerName.trim().length > 0
    ) {
      return ord.customerName;
    }
    if (ord.customerEmail && ord.customerEmail.includes('@')) {
      return ord.customerEmail.split('@')[0];
    }
    if (ord.customerPhone) {
      return ord.customerPhone;
    }
    return 'Cliente';
  };

  return (
    <div className="space-y-5">
      {/* Header & Direct Sync Action */}
      <div className="bg-[#111827] border border-slate-800/90 rounded-xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <span>Relatório de Pedidos &amp; Formas de Pagamento</span>
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>Fuso Horário: América/São Paulo (-03:00)</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1 text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5" />
              Filtro Anti-Testes Ativo ((41) 99582-4010 bloqueado)
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar pedido, cliente, telefone..."
              className="w-full sm:w-56 pl-9 pr-4 py-2 text-xs bg-slate-900 border border-slate-700/80 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/60"
            />
          </div>

          {onBulkReclassifyOrders && (
            <button
              type="button"
              onClick={onBulkReclassifyOrders}
              className="px-3 py-2 text-xs font-semibold rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer shadow-sm"
              title="Detecta automaticamente cartões que entraram como PIX e corrige pedidos aprovados"
            >
              <Sparkles className="w-3.5 h-3.5 text-sky-400" />
              <span>Corrigir Métodos &amp; Status</span>
            </button>
          )}

          <button
            type="button"
            onClick={onPurgeTestOrders}
            className="px-3 py-2 text-xs font-medium rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            title="Remover todos os pedidos de teste"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Limpar Testes</span>
          </button>

          <button
            type="button"
            onClick={onSyncCartpanda}
            disabled={isSyncingCartpanda}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer shadow-sm"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isSyncingCartpanda ? 'animate-spin' : ''}`}
            />
            <span>
              {isSyncingCartpanda ? 'Sincronizando...' : 'Sincronizar Cartpanda'}
            </span>
          </button>
        </div>
      </div>

      {/* ================= PAYMENT METHOD SUMMARY CARDS STRIP ================= */}
      <section aria-label="Separação por Forma de Pagamento" className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3.5">
        {/* 1. Cartão de Crédito */}
        <div
          onClick={() =>
            setActivePaymentFilter((prev) =>
              prev === 'credit_card' ? 'all' : 'credit_card'
            )
          }
          className={`p-4 rounded-xl border transition-all cursor-pointer relative overflow-hidden ${
            activePaymentFilter === 'credit_card'
              ? 'bg-sky-950/40 border-sky-500/60 ring-2 ring-sky-500/40 shadow-md'
              : 'bg-[#111827] border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-sky-500/15 text-sky-400">
                <CreditCard className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-200">
                  Cartão de Crédito
                </span>
                <span className="block text-[10px] text-slate-400">
                  {paymentMethodMetrics.credit_card.count} pedidos totais
                </span>
              </div>
            </div>
            <span className="px-2 py-0.5 text-[10px] font-mono rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
              {formatPercent(paymentMethodMetrics.credit_card.share, privacyMode, 0)} share
            </span>
          </div>

          <div className="mt-3 flex items-baseline justify-between">
            <div className="text-xl font-bold font-mono tabular-nums text-slate-100">
              {formatBRL(paymentMethodMetrics.credit_card.revenue, privacyMode)}
            </div>
            <div className="text-right text-xs font-mono text-emerald-400">
              {paymentMethodMetrics.credit_card.paidCount} pagos
            </div>
          </div>

          <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-mono">
            <span>Ticket Médio: {formatBRL(paymentMethodMetrics.credit_card.ticket, privacyMode)}</span>
            <span className="text-sky-300">
              {activePaymentFilter === 'credit_card' ? '● Filtro Ativo' : 'Clique para filtrar'}
            </span>
          </div>
        </div>

        {/* 2. PIX */}
        <div
          onClick={() =>
            setActivePaymentFilter((prev) => (prev === 'pix' ? 'all' : 'pix'))
          }
          className={`p-4 rounded-xl border transition-all cursor-pointer relative overflow-hidden ${
            activePaymentFilter === 'pix'
              ? 'bg-emerald-950/40 border-emerald-500/60 ring-2 ring-emerald-500/40 shadow-md'
              : 'bg-[#111827] border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-emerald-500/15 text-emerald-400">
                <QrCode className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-200">
                  PIX
                </span>
                <span className="block text-[10px] text-slate-400">
                  {paymentMethodMetrics.pix.count} pedidos totais
                </span>
              </div>
            </div>
            <span className="px-2 py-0.5 text-[10px] font-mono rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              {formatPercent(paymentMethodMetrics.pix.share, privacyMode, 0)} share
            </span>
          </div>

          <div className="mt-3 flex items-baseline justify-between">
            <div className="text-xl font-bold font-mono tabular-nums text-slate-100">
              {formatBRL(paymentMethodMetrics.pix.revenue, privacyMode)}
            </div>
            <div className="text-right text-xs font-mono text-emerald-400">
              {paymentMethodMetrics.pix.paidCount} pagos
            </div>
          </div>

          <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-mono">
            <span>Ticket Médio: {formatBRL(paymentMethodMetrics.pix.ticket, privacyMode)}</span>
            <span className="text-emerald-300">
              {activePaymentFilter === 'pix' ? '● Filtro Ativo' : 'Clique para filtrar'}
            </span>
          </div>
        </div>

        {/* 3. Boleto Bancário */}
        <div
          onClick={() =>
            setActivePaymentFilter((prev) => (prev === 'billet' ? 'all' : 'billet'))
          }
          className={`p-4 rounded-xl border transition-all cursor-pointer relative overflow-hidden ${
            activePaymentFilter === 'billet'
              ? 'bg-amber-950/40 border-amber-500/60 ring-2 ring-amber-500/40 shadow-md'
              : 'bg-[#111827] border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-amber-500/15 text-amber-400">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-200">
                  Boleto Bancário
                </span>
                <span className="block text-[10px] text-slate-400">
                  {paymentMethodMetrics.billet.count} pedidos totais
                </span>
              </div>
            </div>
            <span className="px-2 py-0.5 text-[10px] font-mono rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {formatPercent(paymentMethodMetrics.billet.share, privacyMode, 0)} share
            </span>
          </div>

          <div className="mt-3 flex items-baseline justify-between">
            <div className="text-xl font-bold font-mono tabular-nums text-slate-100">
              {formatBRL(paymentMethodMetrics.billet.revenue, privacyMode)}
            </div>
            <div className="text-right text-xs font-mono text-amber-400">
              {paymentMethodMetrics.billet.paidCount} pagos
            </div>
          </div>

          <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-mono">
            <span>Ticket Médio: {formatBRL(paymentMethodMetrics.billet.ticket, privacyMode)}</span>
            <span className="text-amber-300">
              {activePaymentFilter === 'billet' ? '● Filtro Ativo' : 'Clique para filtrar'}
            </span>
          </div>
        </div>
      </section>

      {/* ================= PAYMENT METHOD FILTER SELECTOR BUTTONS ================= */}
      <div className="flex items-center gap-2 p-2 bg-[#111827] border border-slate-800 rounded-xl overflow-x-auto no-scrollbar scrollbar-none">
        <span className="text-xs font-semibold text-slate-400 pl-2 pr-1 flex items-center gap-1.5 whitespace-nowrap shrink-0">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          Filtrar Método:
        </span>

        <button
          type="button"
          onClick={() => setActivePaymentFilter('all')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
            activePaymentFilter === 'all'
              ? 'bg-slate-700 text-white shadow-sm'
              : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          Todos os Métodos ({orders.length})
        </button>

        <button
          type="button"
          onClick={() => setActivePaymentFilter('credit_card')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
            activePaymentFilter === 'credit_card'
              ? 'bg-sky-500/25 text-sky-200 border border-sky-500/50 shadow-sm'
              : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          <CreditCard className="w-3.5 h-3.5 text-sky-400" />
          <span>Cartão de Crédito</span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-sky-950/60 text-sky-300 border border-sky-500/30">
            {paymentMethodMetrics.credit_card.count}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActivePaymentFilter('pix')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
            activePaymentFilter === 'pix'
              ? 'bg-emerald-500/25 text-emerald-200 border border-emerald-500/50 shadow-sm'
              : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          <QrCode className="w-3.5 h-3.5 text-emerald-400" />
          <span>PIX</span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-emerald-950/60 text-emerald-300 border border-emerald-500/30">
            {paymentMethodMetrics.pix.count}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActivePaymentFilter('billet')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
            activePaymentFilter === 'billet'
              ? 'bg-amber-500/25 text-amber-200 border border-amber-500/50 shadow-sm'
              : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="w-3.5 h-3.5 text-amber-400" />
          <span>Boleto Bancário</span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-amber-950/60 text-amber-300 border border-amber-500/30">
            {paymentMethodMetrics.billet.count}
          </span>
        </button>
      </div>

      {/* ================= STATUS FILTER TABS ================= */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 no-scrollbar scrollbar-none">
        {STATUS_FILTER_TABS.map((tab) => {
          const isActive = activeStatusTab === tab.id;
          const count =
            tab.id === 'all'
              ? orders.length
              : tab.id === 'paid_all'
              ? orders.filter((o) => isPaidOrderStatus(o.status)).length
              : orders.filter((o) => o.status === tab.id).length;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveStatusTab(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                isActive
                  ? tab.id === 'paid_all' || tab.id === 'paid_unfulfilled' || tab.id === 'approved'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-slate-700 text-slate-100 border border-slate-600'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>{tab.label}</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-800/80 text-slate-300">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredOrders.length === 0 ? (
        <div className="bg-[#111827] border border-slate-800/90 rounded-xl p-12 text-center text-slate-400">
          Nenhum pedido encontrado para a combinação selecionada (
          {activePaymentFilter === 'all' ? 'Todos os métodos' : PAYMENT_METHOD_LABELS[activePaymentFilter]}
          {activeStatusTab !== 'all' ? ` · Status: ${activeStatusTab}` : ''}
          ).
        </div>
      ) : (
        <>
          {/* ================= MOBILE VIEW: Responsive Cards (< 768px) ================= */}
          <div className="block md:hidden space-y-3.5">
            {filteredOrders.map((ord) => {
              const statusMeta = ORDER_STATUS_META[ord.status] || ORDER_STATUS_META.pending;
              const customerDisplay = getCustomerDisplayName(ord);
              const isPaid = isPaidOrderStatus(ord.status);

              return (
                <div
                  key={ord.id}
                  className="bg-[#111827] border border-slate-800 rounded-xl p-4 space-y-3 shadow-sm"
                >
                  {/* Top: Order #, Date & Action */}
                  <div className="flex items-center justify-between pb-2.5 border-b border-slate-800/80">
                    <div>
                      <div className="font-mono font-bold text-sm text-slate-100">
                        {ord.orderNumber}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400">
                        {formatSaoPauloDateTime(ord.orderDate)}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {ord.status === 'pending' && (
                        <button
                          type="button"
                          onClick={() => onUpdateOrderStatus(ord.id, 'paid_unfulfilled')}
                          className="px-2 py-1 rounded text-[11px] font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 cursor-pointer flex items-center gap-1"
                          title="Marcar pedido como aprovado"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Aprovar</span>
                        </button>
                      )}

                      <select
                        aria-label={`Alterar status do pedido ${ord.orderNumber}`}
                        value={ord.status}
                        onChange={(e) =>
                          onUpdateOrderStatus(ord.id, e.target.value as OrderStatus)
                        }
                        className={`px-2 py-1 rounded-md text-[11px] font-semibold border focus:outline-none cursor-pointer ${statusMeta.bgClass} ${statusMeta.textClass} ${statusMeta.borderClass}`}
                      >
                        <option value="approved" className="bg-slate-900 text-emerald-300">
                          ✅ Aprovado (Enviado)
                        </option>
                        <option value="paid_unfulfilled" className="bg-slate-900 text-emerald-300">
                          📦 Aprovado (Aguardando Envio)
                        </option>
                        <option value="pending" className="bg-slate-900 text-amber-300">
                          ⏳ Pagamento Pendente
                        </option>
                        <option value="abandoned" className="bg-slate-900 text-orange-300">
                          🛒 Carrinho Abandonado
                        </option>
                        <option value="canceled" className="bg-slate-900 text-rose-300">
                          ❌ Cancelado
                        </option>
                        <option value="refunded" className="bg-slate-900 text-purple-300">
                          ↩️ Reembolsado
                        </option>
                      </select>

                      <button
                        type="button"
                        onClick={() => onDeleteOrder(ord.id)}
                        className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                        title="Remover pedido"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Customer & Interactive Payment Method */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5 text-slate-200 font-medium">
                      <UserIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="truncate max-w-[190px]">{customerDisplay}</span>
                      {(ord.customerPhone || ord.customerEmail) && (
                        <span className="text-[11px] text-slate-400 font-mono">
                          ({ord.customerPhone || ord.customerEmail})
                        </span>
                      )}
                    </div>

                    {/* Interactive Payment Method Picker */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-400">Método:</span>
                      {onUpdateOrderPaymentMethod ? (
                        <select
                          value={ord.paymentMethod}
                          onChange={(e) =>
                            onUpdateOrderPaymentMethod(ord.id, e.target.value as PaymentMethod)
                          }
                          className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-xs font-mono text-slate-200 focus:outline-none cursor-pointer"
                        >
                          <option value="credit_card">💳 Cartão de Crédito</option>
                          <option value="pix">⚡ PIX</option>
                          <option value="billet">📄 Boleto Bancário</option>
                        </select>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 border border-slate-700 font-mono text-[11px] text-slate-300">
                          {PAYMENT_METHOD_LABELS[ord.paymentMethod]}
                        </span>
                      )}
                      {ord.paymentMethod === 'credit_card' && ord.installments > 1 && (
                        <span className="text-[10px] text-sky-400 font-mono">
                          ({ord.installments}x)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Items summary */}
                  <div className="text-[11px] text-slate-400 bg-slate-900/60 p-2 rounded-lg border border-slate-800/80 truncate">
                    {ord.itemsSummary || '1x Produto'}
                  </div>

                  {/* 2x2 Financial Grid */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/60 font-mono text-xs">
                    <div className="p-2 bg-slate-900/40 rounded-lg">
                      <span className="block text-[10px] text-slate-400 font-sans">Valor Bruto</span>
                      <span className="font-semibold text-slate-100">
                        {formatBRL(ord.grossAmount, privacyMode)}
                      </span>
                    </div>

                    <div className="p-2 bg-slate-900/40 rounded-lg">
                      <span className="block text-[10px] text-slate-400 font-sans">Frete Real</span>
                      <span className="text-slate-300">
                        {formatBRL(ord.shippingCost, privacyMode)}
                      </span>
                    </div>

                    <div className="p-2 bg-slate-900/40 rounded-lg">
                      <span className="block text-[10px] text-slate-400 font-sans">Taxa Checkout</span>
                      <span className="text-rose-400">
                        -{formatBRL(ord.checkoutFee, privacyMode)}
                      </span>
                    </div>

                    <div className="p-2 bg-slate-900/40 rounded-lg">
                      <span className="block text-[10px] text-slate-400 font-sans">Lucro Líquido</span>
                      <span
                        className={`font-bold ${
                          ord.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {formatBRL(ord.netProfit, privacyMode)}{' '}
                        <span className="text-[10px] font-normal text-slate-400">
                          ({formatPercent(ord.profitMargin, privacyMode)})
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ================= DESKTOP VIEW: Full Unit Economics Table (>= 768px) ================= */}
          <div className="hidden md:block bg-[#111827] border border-slate-800/90 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800/90 text-[11px] text-slate-400 bg-slate-900/50">
                    <th className="py-3 px-4 font-medium whitespace-nowrap">Pedido</th>
                    <th className="py-3 px-3 font-medium whitespace-nowrap">Data (SP)</th>
                    <th className="py-3 px-3 font-medium whitespace-nowrap">Cliente</th>
                    <th className="py-3 px-3 font-medium whitespace-nowrap">Status</th>
                    <th className="py-3 px-3 font-medium whitespace-nowrap">Forma de Pagamento</th>
                    <th className="py-3 px-3 font-medium whitespace-nowrap">Origem / UTM</th>
                    <th className="py-3 px-3 font-medium text-right whitespace-nowrap">Frete Real</th>
                    <th className="py-3 px-3 font-medium text-right whitespace-nowrap">Valor Bruto</th>
                    <th className="py-3 px-3 font-medium text-right whitespace-nowrap">Taxa Checkout</th>
                    <th className="py-3 px-3 font-medium text-right whitespace-nowrap">CMV</th>
                    <th className="py-3 px-4 font-medium text-right whitespace-nowrap">Lucro Líquido</th>
                    <th className="py-3 px-3 font-medium text-center whitespace-nowrap">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs">
                  {filteredOrders.map((ord) => {
                    const statusMeta = ORDER_STATUS_META[ord.status] || ORDER_STATUS_META.pending;
                    const customerDisplay = getCustomerDisplayName(ord);

                    return (
                      <tr key={ord.id} className="hover:bg-slate-800/35 transition-colors">
                        {/* Pedido */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-mono font-semibold text-slate-100">
                            {ord.orderNumber}
                          </div>
                          <div
                            className="text-[11px] text-slate-400 max-w-[180px] truncate"
                            title={ord.itemsSummary}
                          >
                            {ord.itemsSummary}
                          </div>
                        </td>

                        {/* Data SP */}
                        <td className="py-3 px-3 font-mono tabular-nums text-slate-300 whitespace-nowrap">
                          {formatSaoPauloDateTime(ord.orderDate)}
                        </td>

                        {/* Cliente */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="font-semibold text-slate-100">
                            {customerDisplay}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            {ord.customerPhone || ord.customerEmail}
                          </div>
                        </td>

                        {/* Status Interativo */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <select
                              aria-label={`Alterar status do pedido ${ord.orderNumber}`}
                              value={ord.status}
                              onChange={(e) =>
                                onUpdateOrderStatus(ord.id, e.target.value as OrderStatus)
                              }
                              className={`px-2.5 py-1 rounded-md text-xs font-semibold border focus:outline-none cursor-pointer ${statusMeta.bgClass} ${statusMeta.textClass} ${statusMeta.borderClass}`}
                            >
                              <option value="approved" className="bg-slate-900 text-emerald-300">
                                ✅ Aprovado (Enviado)
                              </option>
                              <option value="paid_unfulfilled" className="bg-slate-900 text-emerald-300">
                                📦 Aprovado (Aguardando Envio)
                              </option>
                              <option value="pending" className="bg-slate-900 text-amber-300">
                                ⏳ Pagamento Pendente
                              </option>
                              <option value="abandoned" className="bg-slate-900 text-orange-300">
                                🛒 Carrinho Abandonado
                              </option>
                              <option value="canceled" className="bg-slate-900 text-rose-300">
                                ❌ Cancelado
                              </option>
                              <option value="refunded" className="bg-slate-900 text-purple-300">
                                ↩️ Reembolsado
                              </option>
                            </select>

                            {ord.status === 'pending' && (
                              <button
                                type="button"
                                onClick={() => onUpdateOrderStatus(ord.id, 'paid_unfulfilled')}
                                className="px-2 py-1 rounded text-[11px] font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 cursor-pointer flex items-center gap-1"
                                title="Marcar como Aprovado"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Aprovar</span>
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Forma de Pagamento Interativa (Cartão / PIX / Boleto) */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          {onUpdateOrderPaymentMethod ? (
                            <select
                              value={ord.paymentMethod}
                              onChange={(e) =>
                                onUpdateOrderPaymentMethod(ord.id, e.target.value as PaymentMethod)
                              }
                              className={`px-2.5 py-1 rounded-md text-xs font-mono border focus:outline-none cursor-pointer ${
                                ord.paymentMethod === 'credit_card'
                                  ? 'bg-sky-500/15 text-sky-300 border-sky-500/40'
                                  : ord.paymentMethod === 'pix'
                                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                                  : 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                              }`}
                              title="Clique para alterar a forma de pagamento e recalcular taxas"
                            >
                              <option value="credit_card" className="bg-slate-900 text-sky-300">
                                💳 Cartão de Crédito
                              </option>
                              <option value="pix" className="bg-slate-900 text-emerald-300">
                                ⚡ PIX
                              </option>
                              <option value="billet" className="bg-slate-900 text-amber-300">
                                📄 Boleto Bancário
                              </option>
                            </select>
                          ) : (
                            <div className="flex items-center gap-1.5 text-slate-200">
                              {ord.paymentMethod === 'pix' && <QrCode className="w-3.5 h-3.5 text-emerald-400" />}
                              {ord.paymentMethod === 'credit_card' && <CreditCard className="w-3.5 h-3.5 text-sky-400" />}
                              {ord.paymentMethod === 'billet' && <FileText className="w-3.5 h-3.5 text-amber-400" />}
                              <span>{PAYMENT_METHOD_LABELS[ord.paymentMethod]}</span>
                            </div>
                          )}
                          {ord.paymentMethod === 'credit_card' && ord.installments > 1 && (
                            <div className="text-[10px] text-sky-400 font-mono mt-0.5">
                              {ord.installments}x parcelas
                            </div>
                          )}
                        </td>

                        {/* Origem / UTM Campaign */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="text-slate-200 font-medium">
                            {ord.utmSource || 'direto'}
                          </div>
                          <div
                            className="text-[11px] text-slate-400 font-mono max-w-[150px] truncate"
                            title={ord.utmCampaign}
                          >
                            {ord.utmCampaign || '—'}
                          </div>
                        </td>

                        {/* Frete Real */}
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                          {formatBRL(ord.shippingCost, privacyMode)}
                        </td>

                        {/* Valor Bruto */}
                        <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-slate-100 whitespace-nowrap">
                          {formatBRL(ord.grossAmount, privacyMode)}
                        </td>

                        {/* Taxa Cartpanda */}
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-rose-400 whitespace-nowrap">
                          -{formatBRL(ord.checkoutFee, privacyMode)}
                        </td>

                        {/* CMV Unitário */}
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                          {formatBRL(ord.cogsAmount, privacyMode)}
                        </td>

                        {/* Lucro Líquido Real */}
                        <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                          <span
                            className={`font-bold ${
                              ord.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {formatBRL(ord.netProfit, privacyMode)}
                          </span>
                          <div className="text-[10px] text-slate-400 font-sans">
                            {formatPercent(ord.profitMargin, privacyMode)}
                          </div>
                        </td>

                        {/* Ação */}
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => onDeleteOrder(ord.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 rounded-md hover:bg-slate-800 transition-colors cursor-pointer"
                            title="Remover pedido da listagem"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Table Footer with Summary */}
            <div className="p-3 bg-slate-900/60 border-t border-slate-800/90 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-2">
              <div className="flex items-center gap-2">
                <span>Exibindo <strong>{filteredOrders.length}</strong> de {orders.length} pedidos</span>
                {activePaymentFilter !== 'all' && (
                  <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 font-medium">
                    Filtro: {PAYMENT_METHOD_LABELS[activePaymentFilter]}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 font-mono">
                <span>
                  Faturamento:{' '}
                  <strong className="text-slate-100">
                    {formatBRL(
                      filteredOrders
                        .filter((o) => isPaidOrderStatus(o.status))
                        .reduce((acc, o) => acc + o.grossAmount, 0),
                      privacyMode
                    )}
                  </strong>
                </span>
                <span>
                  Lucro Líquido:{' '}
                  <strong className="text-emerald-400">
                    {formatBRL(
                      filteredOrders
                        .filter((o) => isPaidOrderStatus(o.status))
                        .reduce((acc, o) => acc + o.netProfit, 0),
                      privacyMode
                    )}
                  </strong>
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
