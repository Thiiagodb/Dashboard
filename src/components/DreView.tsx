import React, { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  AdSpendRecord,
  CustomExpenseRecord,
  isPaidOrderStatus,
  OrderRecord,
  SettingsRecord,
  toSaoPauloDateKey,
} from '../lib/profit-engine.ts';
import { formatBRL, formatPercent } from './Formatters.tsx';

interface DreViewProps {
  orders: OrderRecord[];
  adSpends: AdSpendRecord[];
  customExpenses: CustomExpenseRecord[];
  settings: SettingsRecord;
  privacyMode: boolean;
  onAddExpense: (entry: Omit<CustomExpenseRecord, 'id' | 'ownerId'>) => Promise<void>;
  onDeleteExpense: (expenseId: string) => Promise<void>;
}

export const DreView: React.FC<DreViewProps> = ({
  orders,
  adSpends,
  customExpenses,
  settings,
  privacyMode,
  onAddExpense,
  onDeleteExpense,
}) => {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'out' | 'in'>('out');
  const [recurrence, setRecurrence] = useState<'monthly' | 'weekly' | 'one_time'>('monthly');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const dre = useMemo(() => {
    // Rule 1: paid_unfulfilled is treated and summed EXACTLY as approved/paid order
    const paidOrders = orders.filter((o) => isPaidOrderStatus(o.status));
    const canceledOrRefunded = orders.filter(
      (o) => o.status === 'canceled' || o.status === 'refunded'
    );

    const paidRevenue = paidOrders.reduce((acc, o) => acc + o.grossAmount, 0);
    const returnsAndCanceled = canceledOrRefunded.reduce(
      (acc, o) => acc + o.grossAmount,
      0
    );

    // 1. Faturamento Bruto (Produtos + Frete Cobrado, incluindo devolvidos/cancelados antes da dedução)
    const grossBilling = Number((paidRevenue + returnsAndCanceled).toFixed(2));
    // 2. (-) Devoluções / Cancelamentos
    const deductions = Number(returnsAndCanceled.toFixed(2));
    // 3. (=) Receita Líquida Real (Pedidos efetivamente pagos: approved + paid_unfulfilled)
    const realNetRevenue = Number(paidRevenue.toFixed(2));

    // 4. (-) CMV
    const cogs = Number(
      paidOrders.reduce((acc, o) => acc + o.cogsAmount, 0).toFixed(2)
    );
    // 5. (-) Taxas de Gateway / Checkout
    const checkoutFees = Number(
      paidOrders.reduce((acc, o) => acc + o.checkoutFee, 0).toFixed(2)
    );
    // 6. (-) Impostos (Simples Nacional)
    const taxes = Number(
      paidOrders.reduce((acc, o) => acc + o.taxAmount, 0).toFixed(2)
    );
    // 7. (-) Fretes Pagos
    const shipping = Number(
      paidOrders.reduce((acc, o) => acc + o.shippingCost, 0).toFixed(2)
    );

    // 8. (=) Margem Bruta
    const grossMargin = Number(
      (realNetRevenue - cogs - checkoutFees - taxes - shipping).toFixed(2)
    );

    // 9. (-) Investimento em Tráfego (Meta Ads)
    const adSpend = Number(
      adSpends.reduce((acc, a) => acc + a.spend, 0).toFixed(2)
    );

    // 10. (=) Resultado Operacional
    const operatingResult = Number((grossMargin - adSpend).toFixed(2));

    // 11. (-) Custos Fixos Cadastrados
    const fixedCosts = Number(
      customExpenses
        .reduce((acc, exp) => (exp.type === 'out' ? acc + exp.amount : acc - exp.amount), 0)
        .toFixed(2)
    );

    // 12. (=) Lucro Líquido Final no Bolso
    const finalPocketProfit = Number((operatingResult - fixedCosts).toFixed(2));

    const base = Math.max(1, realNetRevenue);

    return {
      grossBilling,
      deductions,
      realNetRevenue,
      cogs,
      checkoutFees,
      taxes,
      shipping,
      grossMargin,
      adSpend,
      operatingResult,
      fixedCosts,
      finalPocketProfit,
      base,
    };
  }, [orders, adSpends, customExpenses]);

  const rows = [
    {
      step: '01',
      label: '1. Faturamento Bruto (Produtos + Frete Cobrado)',
      value: dre.grossBilling,
      pct: (dre.grossBilling / dre.base) * 100,
      kind: 'header' as const,
    },
    {
      step: '02',
      label: '2. (-) Devoluções / Cancelamentos',
      value: -dre.deductions,
      pct: (dre.deductions / dre.base) * 100,
      kind: 'deduction' as const,
    },
    {
      step: '03',
      label: '3. (=) Receita Líquida Real (Aprovados + Pagos Não Processados)',
      value: dre.realNetRevenue,
      pct: 100,
      kind: 'subtotal' as const,
    },
    {
      step: '04',
      label: '4. (-) CMV (Custo da Mercadoria Vendida)',
      value: -dre.cogs,
      pct: (dre.cogs / dre.base) * 100,
      kind: 'deduction' as const,
    },
    {
      step: '05',
      label: '5. (-) Taxas de Gateway / Checkout (Cartpanda)',
      value: -dre.checkoutFees,
      pct: (dre.checkoutFees / dre.base) * 100,
      kind: 'deduction' as const,
    },
    {
      step: '06',
      label: `6. (-) Impostos (Simples Nacional — ${settings.taxRate}%)`,
      value: -dre.taxes,
      pct: (dre.taxes / dre.base) * 100,
      kind: 'deduction' as const,
    },
    {
      step: '07',
      label: '7. (-) Fretes Pagos (Custo Real de Envio)',
      value: -dre.shipping,
      pct: (dre.shipping / dre.base) * 100,
      kind: 'deduction' as const,
    },
    {
      step: '08',
      label: '8. (=) Margem Bruta (Lucro Bruto Comercial)',
      value: dre.grossMargin,
      pct: (dre.grossMargin / dre.base) * 100,
      kind: 'subtotal' as const,
    },
    {
      step: '09',
      label: '9. (-) Investimento em Tráfego (Meta Ads)',
      value: -dre.adSpend,
      pct: (dre.adSpend / dre.base) * 100,
      kind: 'deduction' as const,
    },
    {
      step: '10',
      label: '10. (=) Resultado Operacional (Pós-Tráfego)',
      value: dre.operatingResult,
      pct: (dre.operatingResult / dre.base) * 100,
      kind: 'subtotal' as const,
    },
    {
      step: '11',
      label: '11. (-) Custos Fixos Cadastrados (Ferramentas, Equipe, ERP)',
      value: -dre.fixedCosts,
      pct: (Math.abs(dre.fixedCosts) / dre.base) * 100,
      kind: 'deduction' as const,
    },
    {
      step: '12',
      label: '12. (=) Lucro Líquido Final no Bolso',
      value: dre.finalPocketProfit,
      pct: (dre.finalPocketProfit / dre.base) * 100,
      kind: 'final' as const,
    },
  ];

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount.replace(',', '.'));
    if (!name.trim() || isNaN(parsedAmount) || parsedAmount <= 0) return;

    setIsSubmitting(true);
    try {
      await onAddExpense({
        name: name.trim(),
        type,
        amount: Number(parsedAmount.toFixed(2)),
        recurrence,
        startDate: `${toSaoPauloDateKey(new Date())}T12:00:00-03:00`,
      });
      setName('');
      setAmount('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
      {/* Left 8 cols: 12-Step Accounting Cascade Table */}
      <div className="lg:col-span-8 bg-[#111827] border border-slate-800/90 rounded-xl overflow-hidden">
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h1 className="text-base sm:text-lg font-semibold text-slate-100">
              DRE — Demonstrativo do Resultado do Exercício
            </h1>
            <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">
              Visão em cascata contábil de Lucro Real (Base 100% = Receita Líquida Real)
            </p>
          </div>
          <div className="text-left sm:text-right font-mono text-xs text-emerald-400">
            Margem Líquida Final:{' '}
            <span className="font-bold">
              {formatPercent((dre.finalPocketProfit / dre.base) * 100, privacyMode)}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[540px] sm:min-w-0">
            <thead>
              <tr className="border-b border-slate-800/90 text-xs text-slate-400 bg-slate-900/50">
                <th className="py-2.5 sm:py-3 px-3 sm:px-6 font-medium">Rubrica Contábil / Estrutura DRE</th>
                <th className="py-2.5 sm:py-3 px-3 sm:px-4 font-medium text-right">Valor (R$)</th>
                <th className="py-2.5 sm:py-3 px-3 sm:px-6 font-medium text-right">Análise Vertical</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs sm:text-sm">
              {rows.map((row) => {
                const isSubtotal = row.kind === 'subtotal';
                const isFinal = row.kind === 'final';
                const isDeduction = row.kind === 'deduction';

                return (
                  <tr
                    key={row.step}
                    className={
                      isFinal
                        ? 'bg-emerald-500/10 border-t-2 border-emerald-500/40'
                        : isSubtotal
                        ? 'bg-slate-900/80 font-semibold'
                        : 'hover:bg-slate-800/30 transition-colors'
                    }
                  >
                    <td
                      className={`py-2.5 sm:py-3.5 px-3 sm:px-6 ${
                        isFinal
                          ? 'text-emerald-300 font-bold text-sm sm:text-base'
                          : isSubtotal
                          ? 'text-slate-100 font-semibold'
                          : 'text-slate-300 pl-5 sm:pl-9'
                      }`}
                    >
                      {row.label}
                    </td>
                    <td
                      className={`py-2.5 sm:py-3.5 px-3 sm:px-4 text-right font-mono tabular-nums ${
                        isFinal
                          ? dre.finalPocketProfit >= 0
                            ? 'text-emerald-400 font-bold text-sm sm:text-base'
                            : 'text-rose-400 font-bold text-sm sm:text-base'
                          : isSubtotal
                          ? 'text-slate-100 font-semibold'
                          : isDeduction
                          ? 'text-rose-300/90'
                          : 'text-slate-100 font-medium'
                      }`}
                    >
                      {formatBRL(row.value, privacyMode)}
                    </td>
                    <td className="py-2.5 sm:py-3.5 px-3 sm:px-6 text-right font-mono tabular-nums text-xs text-slate-400">
                      <div className="inline-flex items-center justify-end gap-2">
                        <span>{formatPercent(row.pct, privacyMode)}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right 4 cols: Interactive CustomExpense Manager (Line 11 of DRE) */}
      <div className="lg:col-span-4 bg-[#111827] border border-slate-800/90 rounded-xl p-5 space-y-5">
        <div className="pb-4 border-b border-slate-800/80">
          <h2 className="text-base font-semibold text-slate-100">
            Custos Fixos &amp; Despesas Operacionais
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Itens deduzidos na Linha 11 do DRE (Shopify, ERP, Equipe, Contabilidade)
          </p>
        </div>

        <form onSubmit={handleAdd} className="space-y-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Descrição do Custo / Receita
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Plataforma Cartpanda / Contador"
              className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-700/80 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/60"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Valor (R$)
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="199.90"
                className="w-full px-3 py-2 text-xs font-mono bg-slate-900 border border-slate-700/80 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/60"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Recorrência
              </label>
              <select
                value={recurrence}
                onChange={(e) =>
                  setRecurrence(e.target.value as 'monthly' | 'weekly' | 'one_time')
                }
                className="w-full px-2.5 py-2 text-xs bg-slate-900 border border-slate-700/80 rounded-lg text-slate-100 focus:outline-none"
              >
                <option value="monthly">Mensal</option>
                <option value="weekly">Semanal</option>
                <option value="one_time">Único</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => setType('out')}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                  type === 'out'
                    ? 'bg-rose-500/20 text-rose-300 font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Saída (-)
              </button>
              <button
                type="button"
                onClick={() => setType('in')}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                  type === 'in'
                    ? 'bg-emerald-500/20 text-emerald-300 font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Entrada (+)
              </button>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Adicionar ao DRE</span>
            </button>
          </div>
        </form>

        <div className="pt-3 border-t border-slate-800/80 space-y-2">
          {customExpenses.length === 0 ? (
            <div className="text-xs text-slate-500 py-4 text-center">
              Nenhum custo fixo cadastrado.
            </div>
          ) : (
            customExpenses.map((exp) => (
              <div
                key={exp.id}
                className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-900/60 border border-slate-800/80"
              >
                <div className="min-w-0">
                  <div className="text-xs font-medium text-slate-100 truncate">
                    {exp.name}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {exp.recurrence === 'monthly'
                      ? 'Mensal'
                      : exp.recurrence === 'weekly'
                      ? 'Semanal'
                      : 'Pontual'}
                  </div>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <span
                    className={`text-xs font-mono tabular-nums font-semibold ${
                      exp.type === 'out' ? 'text-rose-300' : 'text-emerald-400'
                    }`}
                  >
                    {exp.type === 'out' ? '-' : '+'}
                    {formatBRL(exp.amount, privacyMode)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onDeleteExpense(exp.id)}
                    className="p-1 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                    title="Remover despesa"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
