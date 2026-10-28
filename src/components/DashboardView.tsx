import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowUpRight,
  Check,
  CreditCard,
  Edit3,
  FileText,
  QrCode,
} from 'lucide-react';
import {
  AdSpendRecord,
  formatSaoPauloDayMonth,
  isPaidOrderStatus,
  OrderRecord,
  PaymentMethod,
  ProductRecord,
  toSaoPauloDateKey,
} from '../lib/profit-engine.ts';
import {
  formatBRL,
  formatNumber,
  formatPercent,
  ProductThumbnail,
} from './Formatters.tsx';

interface DashboardViewProps {
  orders: OrderRecord[];
  adSpends: AdSpendRecord[];
  products: ProductRecord[];
  privacyMode: boolean;
  onUpdateProductCost: (product: ProductRecord, newCost: number) => Promise<void>;
  onNavigateOrders: () => void;
  onNavigateSettings?: () => void;
  onSyncAll?: () => Promise<void>;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  orders,
  adSpends,
  products,
  privacyMode,
  onUpdateProductCost,
  onNavigateOrders,
  onNavigateSettings,
  onSyncAll,
}) => {
  const [editingSku, setEditingSku] = useState<string | null>(null);
  const [costInput, setCostInput] = useState<string>('');
  const [chartType, setChartType] = useState<'area' | 'bar'>('area');

  // Rule 1: paid_unfulfilled is treated and summed EXACTLY as approved/paid order
  const paidOrders = useMemo(
    () => orders.filter((o) => isPaidOrderStatus(o.status)),
    [orders]
  );

  const metrics = useMemo(() => {
    const grossRevenue = paidOrders.reduce((acc, o) => acc + o.grossAmount, 0);
    const netRevenue = paidOrders.reduce((acc, o) => acc + o.netAmount, 0);
    const orderLevelProfit = paidOrders.reduce((acc, o) => acc + o.netProfit, 0);
    const totalAdSpend = adSpends.reduce((acc, a) => acc + a.spend, 0);

    // Real Net Profit after Ad Spend
    const realNetProfit = orderLevelProfit - totalAdSpend;
    const realProfitMargin =
      grossRevenue > 0 ? (realNetProfit / grossRevenue) * 100 : 0;
    const realRoas = totalAdSpend > 0 ? grossRevenue / totalAdSpend : 0;
    const paidCount = paidOrders.length;
    const avgCpa = paidCount > 0 ? totalAdSpend / paidCount : 0;
    const avgTicket = paidCount > 0 ? grossRevenue / paidCount : 0;

    return {
      grossRevenue,
      netRevenue,
      realNetProfit,
      realProfitMargin,
      realRoas,
      avgCpa,
      avgTicket,
      paidCount,
      totalAdSpend,
    };
  }, [paidOrders, adSpends]);

  // Daily Performance Aggregation in America/Sao_Paulo (-03:00)
  const dailySeries = useMemo(() => {
    const map = new Map<
      string,
      {
        dateKey: string;
        label: string;
        receita: number;
        trafego: number;
        custosOp: number;
        lucro: number;
      }
    >();

    // Ensure last 6 days are present for smooth chart visualization
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = toSaoPauloDateKey(d);
      map.set(key, {
        dateKey: key,
        label: formatSaoPauloDayMonth(key),
        receita: 0,
        trafego: 0,
        custosOp: 0,
        lucro: 0,
      });
    }

    for (const ord of paidOrders) {
      const key = toSaoPauloDateKey(ord.orderDate);
      const curr = map.get(key) || {
        dateKey: key,
        label: formatSaoPauloDayMonth(key),
        receita: 0,
        trafego: 0,
        custosOp: 0,
        lucro: 0,
      };
      const opCost =
        ord.cogsAmount + ord.taxAmount + ord.shippingCost + ord.checkoutFee;
      curr.receita = Number((curr.receita + ord.grossAmount).toFixed(2));
      curr.custosOp = Number((curr.custosOp + opCost).toFixed(2));
      curr.lucro = Number((curr.lucro + ord.netProfit).toFixed(2));
      map.set(key, curr);
    }

    for (const ad of adSpends) {
      const key = toSaoPauloDateKey(ad.date);
      const curr = map.get(key) || {
        dateKey: key,
        label: formatSaoPauloDayMonth(key),
        receita: 0,
        trafego: 0,
        custosOp: 0,
        lucro: 0,
      };
      curr.trafego = Number((curr.trafego + ad.spend).toFixed(2));
      curr.lucro = Number((curr.lucro - ad.spend).toFixed(2));
      map.set(key, curr);
    }

    return Array.from(map.values()).sort((a, b) =>
      a.dateKey.localeCompare(b.dateKey)
    );
  }, [paidOrders, adSpends]);

  // Payment Method Conversion Funnel (PIX, Cartão de Crédito, Boleto)
  const paymentFunnel = useMemo(() => {
    const methods: Array<{
      method: PaymentMethod;
      name: string;
      color: string;
      icon: React.ReactNode;
    }> = [
      {
        method: 'pix',
        name: 'PIX Instantâneo',
        color: '#10B981',
        icon: <QrCode className="w-4 h-4 text-emerald-400" />,
      },
      {
        method: 'credit_card',
        name: 'Cartão de Crédito',
        color: '#38BDF8',
        icon: <CreditCard className="w-4 h-4 text-sky-400" />,
      },
      {
        method: 'billet',
        name: 'Boleto Bancário',
        color: '#F59E0B',
        icon: <FileText className="w-4 h-4 text-amber-400" />,
      },
    ];

    const totalPaidRev = Math.max(1, metrics.grossRevenue);

    return methods.map((m) => {
      const allForMethod = orders.filter(
        (o) => o.paymentMethod === m.method && o.status !== 'abandoned'
      );
      const paidForMethod = paidOrders.filter((o) => o.paymentMethod === m.method);
      const totalAttempts = allForMethod.length;
      const approvedCount = paidForMethod.length;
      const conversionRate =
        totalAttempts > 0 ? (approvedCount / totalAttempts) * 100 : 0;
      const revenue = paidForMethod.reduce((acc, o) => acc + o.grossAmount, 0);
      const shareOfRevenue = (revenue / totalPaidRev) * 100;

      return {
        ...m,
        totalAttempts,
        approvedCount,
        conversionRate,
        revenue,
        shareOfRevenue,
      };
    });
  }, [orders, paidOrders, metrics.grossRevenue]);

  // Top Most Profitable Products Table
  const topProducts = useMemo(() => {
    return products
      .map((prod) => {
        const matchingOrders = paidOrders.filter((o) =>
          o.itemsSummary.toLowerCase().includes(prod.title.split(' ')[0].toLowerCase())
        );
        const unitsSold = Math.max(
          1,
          matchingOrders.reduce((acc, o) => {
            const match = o.itemsSummary.match(/(\d+)x/);
            return acc + (match ? parseInt(match[1], 10) : 1);
          }, 0)
        );
        const grossRev = Number((unitsSold * prod.price).toFixed(2));
        const totalCogs = Number((unitsSold * prod.costPrice).toFixed(2));
        const estFeesAndTax = Number((grossRev * 0.085).toFixed(2));
        const netProfit = Number((grossRev - totalCogs - estFeesAndTax).toFixed(2));
        const margin = grossRev > 0 ? (netProfit / grossRev) * 100 : 0;

        return {
          ...prod,
          unitsSold,
          grossRev,
          totalCogs,
          netProfit,
          margin,
        };
      })
      .sort((a, b) => b.netProfit - a.netProfit);
  }, [products, paidOrders]);

  const handleSaveCost = async (prod: ProductRecord) => {
    const parsed = parseFloat(costInput.replace(',', '.'));
    if (!isNaN(parsed) && parsed >= 0) {
      await onUpdateProductCost(prod, parsed);
    }
    setEditingSku(null);
  };

  return (
    <div className="space-y-6">
      {/* Onboarding Guide if no orders yet in the current period */}
      {orders.length === 0 && (
        <div className="bg-gradient-to-r from-[#111827] via-slate-900 to-[#111827] border border-emerald-500/30 rounded-xl p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Painel Conectado — Pronto para Sincronizar
              </h2>
              <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
                Nenhum pedido encontrado para o período selecionado. Conecte sua Cartpanda em <strong>Configurações</strong> via Token de API, utilize o Webhook automático, ou importe um arquivo CSV de pedidos para ver o Lucro Real e ROAS.
              </p>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              {onNavigateSettings && (
                <button
                  type="button"
                  onClick={onNavigateSettings}
                  className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer"
                >
                  Configurar Integrações
                </button>
              )}
              {onSyncAll && (
                <button
                  type="button"
                  onClick={onSyncAll}
                  className="px-3.5 py-2 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
                >
                  Atualizar Dados
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Row 1: 8 High-Density Financial KPIs */}
      <section aria-label="Indicadores Financeiros Principais">
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
          {/* 1. Faturamento Bruto */}
          <div className="bg-[#111827] border border-slate-800/90 rounded-xl p-3 sm:p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-[11px] sm:text-xs text-slate-400">
              <span className="truncate">Faturamento Bruto</span>
              <span className="font-mono text-slate-500 hidden sm:inline">100%</span>
            </div>
            <div className="mt-1.5 sm:mt-2 text-lg sm:text-2xl font-bold tracking-tight text-slate-50 font-mono tabular-nums truncate">
              {formatBRL(metrics.grossRevenue, privacyMode)}
            </div>
            <div className="mt-1.5 sm:mt-2 flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs text-slate-400">
              <span className="truncate">Produtos + Frete</span>
              <span aria-hidden="true" className="hidden sm:inline">·</span>
              <span className="text-emerald-400 font-mono tabular-nums shrink-0">
                {formatNumber(metrics.paidCount, privacyMode)} pagos
              </span>
            </div>
          </div>

          {/* 2. Faturamento Líquido */}
          <div className="bg-[#111827] border border-slate-800/90 rounded-xl p-3 sm:p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-[11px] sm:text-xs text-slate-400">
              <span className="truncate">Faturamento Líquido</span>
              <span className="font-mono text-slate-500 hidden sm:inline">Pós-Checkout</span>
            </div>
            <div className="mt-1.5 sm:mt-2 text-lg sm:text-2xl font-bold tracking-tight text-slate-50 font-mono tabular-nums truncate">
              {formatBRL(metrics.netRevenue, privacyMode)}
            </div>
            <div className="mt-1.5 sm:mt-2 flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs text-slate-400">
              <span className="truncate">Líquido Cartpanda</span>
              <span aria-hidden="true" className="hidden sm:inline">·</span>
              <span className="font-mono tabular-nums text-slate-300 shrink-0">
                {formatPercent(
                  metrics.grossRevenue > 0
                    ? (metrics.netRevenue / metrics.grossRevenue) * 100
                    : 0,
                  privacyMode
                )}
              </span>
            </div>
          </div>

          {/* 3. Lucro Líquido Real */}
          <div className="bg-[#111827] border border-emerald-500/30 rounded-xl p-3 sm:p-4 flex flex-col justify-between shadow-xs">
            <div className="flex items-center justify-between text-[11px] sm:text-xs text-emerald-300/90">
              <span className="font-medium truncate">Lucro Líquido Real</span>
              <span className="font-mono text-emerald-400 hidden sm:inline">No Bolso</span>
            </div>
            <div
              className={`mt-1.5 sm:mt-2 text-lg sm:text-2xl font-bold tracking-tight font-mono tabular-nums truncate ${
                metrics.realNetProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {formatBRL(metrics.realNetProfit, privacyMode)}
            </div>
            <div className="mt-1.5 sm:mt-2 flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs text-slate-400">
              <span className="truncate">Pós CMV, Imposto, Ads</span>
            </div>
          </div>

          {/* 4. Margem de Lucro Real */}
          <div className="bg-[#111827] border border-slate-800/90 rounded-xl p-3 sm:p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-[11px] sm:text-xs text-slate-400">
              <span className="truncate">Margem Real</span>
              <span className="font-mono text-slate-500 hidden sm:inline">Meta &gt; 20%</span>
            </div>
            <div
              className={`mt-1.5 sm:mt-2 text-lg sm:text-2xl font-bold tracking-tight font-mono tabular-nums truncate ${
                metrics.realProfitMargin >= 20
                  ? 'text-emerald-400'
                  : metrics.realProfitMargin >= 10
                  ? 'text-amber-400'
                  : 'text-rose-400'
              }`}
            >
              {formatPercent(metrics.realProfitMargin, privacyMode)}
            </div>
            <div className="mt-1.5 sm:mt-2 flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs text-slate-400">
              <span className="truncate">Lucro Real / Receita</span>
            </div>
          </div>

          {/* 5. ROAS Real */}
          <div className="bg-[#111827] border border-slate-800/90 rounded-xl p-3 sm:p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-[11px] sm:text-xs text-slate-400">
              <span className="truncate">ROAS Real</span>
              <span className="font-mono text-slate-500 hidden sm:inline">Meta Ads</span>
            </div>
            <div className="mt-1.5 sm:mt-2 text-lg sm:text-2xl font-bold tracking-tight text-sky-400 font-mono tabular-nums truncate">
              {privacyMode ? '•,••x' : `${metrics.realRoas.toFixed(2).replace('.', ',')}x`}
            </div>
            <div className="mt-1.5 sm:mt-2 flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs text-slate-400">
              <span className="truncate">Gasto:</span>
              <span className="font-mono tabular-nums text-slate-300 truncate">
                {formatBRL(metrics.totalAdSpend, privacyMode)}
              </span>
            </div>
          </div>

          {/* 6. CPA Médio */}
          <div className="bg-[#111827] border border-slate-800/90 rounded-xl p-3 sm:p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-[11px] sm:text-xs text-slate-400">
              <span className="truncate">CPA Médio Real</span>
              <span className="font-mono text-slate-500 hidden sm:inline">Custo / Pedido</span>
            </div>
            <div className="mt-1.5 sm:mt-2 text-lg sm:text-2xl font-bold tracking-tight text-slate-50 font-mono tabular-nums truncate">
              {formatBRL(metrics.avgCpa, privacyMode)}
            </div>
            <div className="mt-1.5 sm:mt-2 flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs text-slate-400">
              <span className="truncate">Tráfego / Pedidos</span>
            </div>
          </div>

          {/* 7. Ticket Médio */}
          <div className="bg-[#111827] border border-slate-800/90 rounded-xl p-3 sm:p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-[11px] sm:text-xs text-slate-400">
              <span className="truncate">Ticket Médio</span>
              <span className="font-mono text-slate-500 hidden sm:inline">AOV</span>
            </div>
            <div className="mt-1.5 sm:mt-2 text-lg sm:text-2xl font-bold tracking-tight text-slate-50 font-mono tabular-nums truncate">
              {formatBRL(metrics.avgTicket, privacyMode)}
            </div>
            <div className="mt-1.5 sm:mt-2 flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs text-slate-400">
              <span className="truncate">Médio por compra</span>
            </div>
          </div>

          {/* 8. Total de Pedidos Pagos */}
          <div className="bg-[#111827] border border-slate-800/90 rounded-xl p-3 sm:p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-[11px] sm:text-xs text-slate-400">
              <span className="truncate">Pedidos Pagos</span>
              <button
                onClick={onNavigateOrders}
                className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5 transition-colors shrink-0"
              >
                <span className="hidden sm:inline">Ver todos</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="mt-1.5 sm:mt-2 text-lg sm:text-2xl font-bold tracking-tight text-slate-50 font-mono tabular-nums truncate">
              {formatNumber(metrics.paidCount, privacyMode)}
            </div>
            <div className="mt-1.5 sm:mt-2 flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs text-slate-400">
              <span className="truncate">Aprovados e pagos</span>
            </div>
          </div>
        </div>
      </section>

      {/* Row 2: Daily Performance Chart + Payment Conversion Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Daily Performance Chart (8 cols) */}
        <div className="lg:col-span-8 bg-[#111827] border border-slate-800/90 rounded-xl p-5 flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
            <div>
              <h2 className="text-base font-semibold text-slate-100">
                Desempenho Financeiro Diário (Horário de Brasília -03:00)
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Comparativo diário de Receita Bruta · Gastos de Tráfego · Custos Operacionais · Lucro Líquido
              </p>
            </div>
            <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg self-start">
              <button
                type="button"
                onClick={() => setChartType('area')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  chartType === 'area'
                    ? 'bg-slate-800 text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Áreas
              </button>
              <button
                type="button"
                onClick={() => setChartType('bar')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  chartType === 'bar'
                    ? 'bg-slate-800 text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Barras
              </button>
            </div>
          </div>

          <div className="h-72 w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'area' ? (
                <AreaChart
                  data={dailySeries}
                  margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="gradReceita" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38BDF8" stopOpacity={0.32} />
                      <stop offset="95%" stopColor="#38BDF8" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="gradLucro" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.38} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="#64748B"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#64748B"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => (privacyMode ? '•••' : `R$${val}`)}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderColor: '#334155',
                      borderRadius: '0.5rem',
                      fontSize: '12px',
                    }}
                    formatter={(value: any, name: any) => [
                      formatBRL(Number(value), privacyMode),
                      String(name),
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="receita"
                    name="Receita Bruta"
                    stroke="#38BDF8"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#gradReceita)"
                  />
                  <Area
                    type="monotone"
                    dataKey="custosOp"
                    name="Custos Operacionais"
                    stroke="#F59E0B"
                    strokeWidth={1.75}
                    fillOpacity={0}
                  />
                  <Area
                    type="monotone"
                    dataKey="trafego"
                    name="Gastos Tráfego (Ads)"
                    stroke="#F43F5E"
                    strokeWidth={1.75}
                    fillOpacity={0}
                  />
                  <Area
                    type="monotone"
                    dataKey="lucro"
                    name="Lucro Líquido"
                    stroke="#10B981"
                    strokeWidth={2.25}
                    fillOpacity={1}
                    fill="url(#gradLucro)"
                  />
                </AreaChart>
              ) : (
                <BarChart
                  data={dailySeries}
                  margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="#64748B"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#64748B"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => (privacyMode ? '•••' : `R$${val}`)}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderColor: '#334155',
                      borderRadius: '0.5rem',
                      fontSize: '12px',
                    }}
                    formatter={(value: any, name: any) => [
                      formatBRL(Number(value), privacyMode),
                      String(name),
                    ]}
                  />
                  <Bar dataKey="receita" name="Receita Bruta" fill="#38BDF8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="custosOp" name="Custos Operacionais" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="trafego" name="Tráfego (Ads)" fill="#F43F5E" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="lucro" name="Lucro Líquido" fill="#10B981" radius={[4, 4, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center gap-6 text-xs text-slate-400">
            <span>Legenda:</span>
            <span className="text-sky-400 font-medium">Receita Bruta</span>
            <span aria-hidden="true">·</span>
            <span className="text-amber-400 font-medium">Custos Operacionais (CMV + Taxas + Frete)</span>
            <span aria-hidden="true">·</span>
            <span className="text-rose-400 font-medium">Gastos Tráfego (Meta Ads)</span>
            <span aria-hidden="true">·</span>
            <span className="text-emerald-400 font-medium">Lucro Líquido Real</span>
          </div>
        </div>

        {/* Payment Method Funnel & Conversion Rate (4 cols) */}
        <div className="lg:col-span-4 bg-[#111827] border border-slate-800/90 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="pb-4 border-b border-slate-800/80">
              <h2 className="text-base font-semibold text-slate-100">
                Conversão por Forma de Pagamento
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Taxa de aprovação e participação na receita paga
              </p>
            </div>

            <div className="mt-4 space-y-4">
              {paymentFunnel.map((item) => (
                <div
                  key={item.method}
                  className="p-3.5 rounded-lg bg-slate-900/70 border border-slate-800/80 space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {item.icon}
                      <span className="text-sm font-medium text-slate-100">
                        {item.name}
                      </span>
                    </div>
                    <span className="text-xs font-mono tabular-nums text-emerald-400 font-semibold">
                      {formatPercent(item.conversionRate, privacyMode)} aprovação
                    </span>
                  </div>

                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-200"
                      style={{
                        width: `${Math.min(100, Math.max(6, item.conversionRate))}%`,
                        backgroundColor: item.color,
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400 font-mono tabular-nums">
                    <span>
                      {formatNumber(item.approvedCount, privacyMode)} /{' '}
                      {formatNumber(item.totalAttempts, privacyMode)} pedidos
                    </span>
                    <span className="text-slate-200 font-medium">
                      {formatBRL(item.revenue, privacyMode)} (
                      {formatPercent(item.shareOfRevenue, privacyMode, 0)})
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Share Bar Chart */}
          <div className="mt-4 pt-3 border-t border-slate-800/80">
            <div className="h-24 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={paymentFunnel}
                  layout="vertical"
                  margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
                >
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={110}
                    stroke="#94A3B8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderColor: '#334155',
                      borderRadius: '0.5rem',
                      fontSize: '12px',
                    }}
                    formatter={(val: any) => [
                      formatBRL(Number(val), privacyMode),
                      'Faturamento',
                    ]}
                  />
                  <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                    {paymentFunnel.map((entry) => (
                      <Cell key={entry.method} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Top Most Profitable Products */}
      <section className="bg-[#111827] border border-slate-800/90 rounded-xl overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
          <div>
            <h2 className="text-sm sm:text-base font-semibold text-slate-100">
              Top Produtos Mais Lucrativos
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">
              Rentabilidade real por SKU descontando CMV unitário e taxas médias de checkout
            </p>
          </div>
          <span className="text-[10px] sm:text-xs text-slate-400">
            Ajuste o CMV unitário com o ícone de lápis em tempo real
          </span>
        </div>

        {/* Mobile Cards View (< 768px) */}
        <div className="block md:hidden divide-y divide-slate-800/70">
          {topProducts.map((prod) => {
            const isEditing = editingSku === prod.sku;
            return (
              <div key={prod.id} className="p-3.5 space-y-3">
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <ProductThumbnail
                      imageKey={prod.imageUrl}
                      title={prod.title}
                    />
                    <div className="min-w-0">
                      <div className="font-semibold text-xs text-slate-100 truncate">
                        {prod.title}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                        SKU: {prod.sku} · Estoque: {prod.stockQuantity} un.
                      </div>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 text-[10px] font-mono font-semibold rounded-full shrink-0 border ${
                      prod.margin >= 35
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                        : 'bg-sky-500/15 text-sky-400 border-sky-500/30'
                    }`}
                  >
                    {formatPercent(prod.margin, privacyMode)} margem
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="p-2 bg-slate-900/60 rounded-lg border border-slate-800/60">
                    <span className="block text-[10px] font-sans text-slate-400">Preço Venda</span>
                    <span className="font-semibold text-slate-100">
                      {formatBRL(prod.price, privacyMode)}
                    </span>
                  </div>

                  <div className="p-2 bg-slate-900/60 rounded-lg border border-slate-800/60">
                    <span className="block text-[10px] font-sans text-slate-400">Vendas Pagas</span>
                    <span className="font-semibold text-slate-200">
                      {formatNumber(prod.unitsSold, privacyMode)} un. ({formatBRL(prod.grossRev, privacyMode)})
                    </span>
                  </div>

                  <div className="p-2 bg-slate-900/60 rounded-lg border border-slate-800/60">
                    <span className="block text-[10px] font-sans text-slate-400">CMV Unitário</span>
                    {isEditing ? (
                      <div className="inline-flex items-center gap-1.5 mt-0.5">
                        <input
                          type="number"
                          step="0.01"
                          value={costInput}
                          onChange={(e) => setCostInput(e.target.value)}
                          className="w-16 px-1.5 py-0.5 text-xs font-mono bg-slate-950 border border-emerald-500 rounded text-slate-100 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveCost(prod)}
                          className="p-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white"
                          title="Salvar CMV"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1 text-amber-300">
                        <span>{formatBRL(prod.costPrice, privacyMode)}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSku(prod.sku);
                            setCostInput(String(prod.costPrice));
                          }}
                          className="p-1 text-slate-400 hover:text-slate-100 rounded"
                          title="Editar CMV Unitário"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="p-2 bg-slate-900/60 rounded-lg border border-slate-800/60">
                    <span className="block text-[10px] font-sans text-slate-400">Lucro Líquido</span>
                    <span className="font-bold text-emerald-400">
                      {formatBRL(prod.netProfit, privacyMode)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop Table View (>= 768px) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800/80 text-xs text-slate-400 bg-slate-900/40">
                <th className="py-3 px-5 font-medium">Produto</th>
                <th className="py-3 px-4 font-medium">SKU</th>
                <th className="py-3 px-4 font-medium text-right">Preço Venda</th>
                <th className="py-3 px-4 font-medium text-right">CMV Unitário</th>
                <th className="py-3 px-4 font-medium text-right">Vendas Pagas</th>
                <th className="py-3 px-4 font-medium text-right">Receita Bruta</th>
                <th className="py-3 px-4 font-medium text-right">Lucro Líquido</th>
                <th className="py-3 px-5 font-medium text-right">Margem Real</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-sm">
              {topProducts.map((prod) => {
                const isEditing = editingSku === prod.sku;
                return (
                  <tr
                    key={prod.id}
                    className="hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-3">
                        <ProductThumbnail
                          imageKey={prod.imageUrl}
                          title={prod.title}
                        />
                        <div>
                          <div className="font-medium text-slate-100">
                            {prod.title}
                          </div>
                          <div className="text-xs text-slate-400">
                            Estoque: {prod.stockQuantity} un.
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-300">
                      {prod.sku}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-200">
                      {formatBRL(prod.price, privacyMode)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {isEditing ? (
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <input
                            type="number"
                            step="0.01"
                            value={costInput}
                            onChange={(e) => setCostInput(e.target.value)}
                            className="w-20 px-2 py-1 text-xs font-mono text-right bg-slate-900 border border-emerald-500/60 rounded text-slate-100 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveCost(prod)}
                            className="p-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white"
                            title="Salvar CMV"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="inline-flex items-center justify-end gap-1.5 text-amber-300">
                          <span>{formatBRL(prod.costPrice, privacyMode)}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingSku(prod.sku);
                              setCostInput(String(prod.costPrice));
                            }}
                            className="p-1 text-slate-400 hover:text-slate-100 rounded transition-colors"
                            title="Editar CMV Unitário"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-200">
                      {formatNumber(prod.unitsSold, privacyMode)} un.
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-100 font-medium">
                      {formatBRL(prod.grossRev, privacyMode)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-400 font-semibold">
                      {formatBRL(prod.netProfit, privacyMode)}
                    </td>
                    <td className="py-3 px-5 text-right font-mono tabular-nums">
                      <span
                        className={
                          prod.margin >= 35
                            ? 'text-emerald-400 font-semibold'
                            : 'text-sky-400 font-medium'
                        }
                      >
                        {formatPercent(prod.margin, privacyMode)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
