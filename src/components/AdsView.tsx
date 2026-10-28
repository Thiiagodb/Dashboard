import React, { useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  AdSpendRecord,
  isPaidOrderStatus,
  OrderRecord,
  toSaoPauloDateKey,
} from '../lib/profit-engine.ts';
import { formatBRL, formatNumber, formatPercent } from './Formatters.tsx';

interface AdsViewProps {
  adSpends: AdSpendRecord[];
  orders: OrderRecord[];
  privacyMode: boolean;
  isSyncingAds: boolean;
  onSyncAds: () => Promise<void>;
}

export const AdsView: React.FC<AdsViewProps> = ({
  adSpends,
  orders,
  privacyMode,
  isSyncingAds,
  onSyncAds,
}) => {
  const paidOrders = useMemo(
    () => orders.filter((o) => isPaidOrderStatus(o.status)),
    [orders]
  );

  const campaignAttribution = useMemo(() => {
    const map = new Map<
      string,
      {
        campaign: string;
        source: string;
        spend: number;
        clicks: number;
        impressions: number;
        ordersCount: number;
        revenue: number;
        orderNetProfit: number;
      }
    >();

    for (const ad of adSpends) {
      const key = ad.utmCampaign;
      const curr = map.get(key) || {
        campaign: key,
        source: ad.utmSource || 'facebook',
        spend: 0,
        clicks: 0,
        impressions: 0,
        ordersCount: 0,
        revenue: 0,
        orderNetProfit: 0,
      };
      curr.spend += ad.spend;
      curr.clicks += ad.clicks;
      curr.impressions += ad.impressions;
      map.set(key, curr);
    }

    for (const ord of paidOrders) {
      const key = ord.utmCampaign || 'ORGANICO_DIRETO';
      const curr = map.get(key) || {
        campaign: key,
        source: ord.utmSource || 'direct',
        spend: 0,
        clicks: 0,
        impressions: 0,
        ordersCount: 0,
        revenue: 0,
        orderNetProfit: 0,
      };
      curr.ordersCount += 1;
      curr.revenue += ord.grossAmount;
      curr.orderNetProfit += ord.netProfit;
      map.set(key, curr);
    }

    return Array.from(map.values())
      .map((item) => {
        const ctr =
          item.impressions > 0 ? (item.clicks / item.impressions) * 100 : 0;
        const cpc = item.clicks > 0 ? item.spend / item.clicks : 0;
        const cpa = item.ordersCount > 0 ? item.spend / item.ordersCount : 0;
        const roas = item.spend > 0 ? item.revenue / item.spend : 0;
        const realProfitAfterAds = item.orderNetProfit - item.spend;
        return {
          ...item,
          ctr,
          cpc,
          cpa,
          roas,
          realProfitAfterAds,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }, [adSpends, paidOrders]);

  return (
    <div className="space-y-6">
      <div className="bg-[#111827] border border-slate-800/90 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-base sm:text-lg font-semibold text-slate-100">
            Atribuição Meta Ads &amp; ROAS Real por Campanha
          </h1>
          <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">
            Cruzamento de insights da Graph API v21.0 com UTMs dos pedidos pagos
          </p>
        </div>

        <button
          type="button"
          onClick={onSyncAds}
          disabled={isSyncingAds}
          className="w-full sm:w-auto px-4 py-2 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white transition-colors flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer shadow-sm"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${isSyncingAds ? 'animate-spin' : ''}`}
          />
          <span>
            {isSyncingAds ? 'Sincronizando Meta Ads...' : 'Sincronizar Meta Ads'}
          </span>
        </button>
      </div>

      {/* Campaign Performance */}
      <div className="bg-[#111827] border border-slate-800/90 rounded-xl overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-800/80">
          <h2 className="text-sm font-semibold text-slate-100">
            Performance Consolidada por Campanha (`utm_campaign`)
          </h2>
        </div>

        {/* Mobile Campaign Cards (< 768px) */}
        <div className="block md:hidden divide-y divide-slate-800/70">
          {campaignAttribution.map((row) => (
            <div key={row.campaign} className="p-3.5 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono font-bold text-xs text-slate-100 truncate">
                    {row.campaign}
                  </div>
                  <span className="inline-block mt-0.5 px-2 py-0.2 rounded text-[10px] bg-slate-800 text-slate-300 font-mono">
                    Fonte: {row.source}
                  </span>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-[10px] font-sans text-slate-400 block">ROAS Real</span>
                  <span className="text-sm font-mono font-bold text-sky-400">
                    {privacyMode ? '•,••x' : `${row.roas.toFixed(2).replace('.', ',')}x`}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="p-2 bg-slate-900/60 rounded-lg border border-slate-800/60">
                  <span className="block text-[10px] font-sans text-slate-400">Gasto Ads</span>
                  <span className="font-semibold text-rose-300">
                    {formatBRL(row.spend, privacyMode)}
                  </span>
                </div>

                <div className="p-2 bg-slate-900/60 rounded-lg border border-slate-800/60">
                  <span className="block text-[10px] font-sans text-slate-400">Receita Bruta</span>
                  <span className="font-semibold text-slate-100">
                    {formatBRL(row.revenue, privacyMode)}
                  </span>
                </div>

                <div className="p-2 bg-slate-900/60 rounded-lg border border-slate-800/60">
                  <span className="block text-[10px] font-sans text-slate-400">Pedidos / CPA</span>
                  <span className="text-slate-200">
                    {formatNumber(row.ordersCount, privacyMode)} un. · {formatBRL(row.cpa, privacyMode)}
                  </span>
                </div>

                <div className="p-2 bg-slate-900/60 rounded-lg border border-slate-800/60">
                  <span className="block text-[10px] font-sans text-slate-400">Lucro Pós-Ads</span>
                  <span
                    className={`font-bold ${
                      row.realProfitAfterAds >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {formatBRL(row.realProfitAfterAds, privacyMode)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono pt-1">
                <span>Impr: {formatNumber(row.impressions, privacyMode)}</span>
                <span>Cliques: {formatNumber(row.clicks, privacyMode)}</span>
                <span>CTR: {formatPercent(row.ctr, privacyMode, 2)}</span>
                <span>CPC: {formatBRL(row.cpc, privacyMode)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Table (>= 768px) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800/80 text-xs text-slate-400 bg-slate-900/50">
                <th className="py-3 px-5 font-medium">Campanha UTM</th>
                <th className="py-3 px-3 font-medium">Fonte</th>
                <th className="py-3 px-3 font-medium text-right">Gasto Ads</th>
                <th className="py-3 px-3 font-medium text-right">Impr. / Cliques</th>
                <th className="py-3 px-3 font-medium text-right">CTR / CPC</th>
                <th className="py-3 px-3 font-medium text-right">Pedidos Pagos</th>
                <th className="py-3 px-3 font-medium text-right">CPA Real</th>
                <th className="py-3 px-3 font-medium text-right">Receita Bruta</th>
                <th className="py-3 px-3 font-medium text-right">ROAS Real</th>
                <th className="py-3 px-5 font-medium text-right">
                  Lucro Pós-Tráfego
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {campaignAttribution.map((row) => (
                <tr
                  key={row.campaign}
                  className="hover:bg-slate-800/30 transition-colors"
                >
                  <td className="py-3.5 px-5 font-mono font-semibold text-slate-100">
                    {row.campaign}
                  </td>
                  <td className="py-3.5 px-3 text-slate-300">{row.source}</td>
                  <td className="py-3.5 px-3 text-right font-mono tabular-nums text-rose-300">
                    {formatBRL(row.spend, privacyMode)}
                  </td>
                  <td className="py-3.5 px-3 text-right font-mono tabular-nums text-slate-300">
                    {formatNumber(row.impressions, privacyMode)} /{' '}
                    {formatNumber(row.clicks, privacyMode)}
                  </td>
                  <td className="py-3.5 px-3 text-right font-mono tabular-nums text-slate-300">
                    {formatPercent(row.ctr, privacyMode, 2)} ·{' '}
                    {formatBRL(row.cpc, privacyMode)}
                  </td>
                  <td className="py-3.5 px-3 text-right font-mono tabular-nums text-slate-100 font-medium">
                    {formatNumber(row.ordersCount, privacyMode)}
                  </td>
                  <td className="py-3.5 px-3 text-right font-mono tabular-nums text-slate-200">
                    {formatBRL(row.cpa, privacyMode)}
                  </td>
                  <td className="py-3.5 px-3 text-right font-mono tabular-nums text-slate-100 font-medium">
                    {formatBRL(row.revenue, privacyMode)}
                  </td>
                  <td className="py-3.5 px-3 text-right font-mono tabular-nums text-sky-400 font-semibold">
                    {privacyMode
                      ? '•,••x'
                      : `${row.roas.toFixed(2).replace('.', ',')}x`}
                  </td>
                  <td
                    className={`py-3.5 px-5 text-right font-mono tabular-nums font-semibold ${
                      row.realProfitAfterAds >= 0
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {formatBRL(row.realProfitAfterAds, privacyMode)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Daily Standardized AdSpend Log */}
      <div className="bg-[#111827] border border-slate-800/90 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800/80 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">
            Histórico Diário Sincronizado (`YYYY-MM-DDT12:00:00-03:00`)
          </h2>
          <span className="text-xs font-mono text-slate-400">
            Unique: [date, utmCampaign, utmSource]
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800/80 text-xs text-slate-400 bg-slate-900/50">
                <th className="py-2.5 px-5 font-medium">Timestamp Padronizado (-03:00)</th>
                <th className="py-2.5 px-4 font-medium">Data SP</th>
                <th className="py-2.5 px-4 font-medium">Campanha</th>
                <th className="py-2.5 px-4 font-medium text-right">Cliques</th>
                <th className="py-2.5 px-4 font-medium text-right">Impressões</th>
                <th className="py-2.5 px-5 font-medium text-right">Spend (R$)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {adSpends.map((ad) => (
                <tr key={ad.id} className="hover:bg-slate-800/30">
                  <td className="py-2.5 px-5 font-mono text-slate-300">
                    {ad.date}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-slate-400">
                    {toSaoPauloDateKey(ad.date)}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-slate-200">
                    {ad.utmCampaign}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-300">
                    {formatNumber(ad.clicks, privacyMode)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-300">
                    {formatNumber(ad.impressions, privacyMode)}
                  </td>
                  <td className="py-2.5 px-5 text-right font-mono tabular-nums font-medium text-rose-300">
                    {formatBRL(ad.spend, privacyMode)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
