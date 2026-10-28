import React from 'react';
import { Watch, Headphones, Sparkles, Backpack, Package } from 'lucide-react';
import { OrderStatus, PaymentMethod } from '../lib/profit-engine.ts';

export function formatBRL(value: number, privacyMode = false): string {
  if (privacyMode) return 'R$ ••••••';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatPercent(value: number, privacyMode = false, decimals = 1): string {
  if (privacyMode) return '••,•%';
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe.toFixed(decimals).replace('.', ',')}%`;
}

export function formatNumber(value: number, privacyMode = false): string {
  if (privacyMode) return '•••';
  return new Intl.NumberFormat('pt-BR').format(Number.isFinite(value) ? value : 0);
}

export const ORDER_STATUS_META: Record<
  OrderStatus,
  {
    label: string;
    textClass: string;
    bgClass: string;
    borderClass: string;
  }
> = {
  paid_unfulfilled: {
    label: 'Pago e Não Processado',
    textClass: 'text-cyan-300',
    bgClass: 'bg-cyan-500/12',
    borderClass: 'border-cyan-500/30',
  },
  approved: {
    label: 'Aprovado',
    textClass: 'text-emerald-300',
    bgClass: 'bg-emerald-500/12',
    borderClass: 'border-emerald-500/30',
  },
  pending: {
    label: 'Pendente',
    textClass: 'text-amber-300',
    bgClass: 'bg-amber-500/12',
    borderClass: 'border-amber-500/30',
  },
  abandoned: {
    label: 'Carrinho Abandonado',
    textClass: 'text-orange-300',
    bgClass: 'bg-orange-500/12',
    borderClass: 'border-orange-500/30',
  },
  canceled: {
    label: 'Cancelado',
    textClass: 'text-rose-300',
    bgClass: 'bg-rose-500/12',
    borderClass: 'border-rose-500/30',
  },
  refunded: {
    label: 'Reembolsado',
    textClass: 'text-purple-300',
    bgClass: 'bg-purple-500/12',
    borderClass: 'border-purple-500/30',
  },
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  pix: 'PIX Instantâneo',
  credit_card: 'Cartão de Crédito',
  billet: 'Boleto Bancário',
};

/**
 * Resilient Product Thumbnail (Zero-Broken-Image Policy)
 */
export const ProductThumbnail: React.FC<{ imageKey: string; title: string }> = ({
  imageKey,
  title,
}) => {
  const key = (imageKey || '').toLowerCase();
  if (key.includes('watch')) {
    return (
      <div
        className="w-9 h-9 rounded-lg bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/80 flex items-center justify-center shrink-0 text-cyan-400"
        title={title}
      >
        <Watch className="w-4 h-4" />
      </div>
    );
  }
  if (key.includes('earbuds') || key.includes('fone') || key.includes('anc')) {
    return (
      <div
        className="w-9 h-9 rounded-lg bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/80 flex items-center justify-center shrink-0 text-emerald-400"
        title={title}
      >
        <Headphones className="w-4 h-4" />
      </div>
    );
  }
  if (key.includes('serum') || key.includes('vit')) {
    return (
      <div
        className="w-9 h-9 rounded-lg bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/80 flex items-center justify-center shrink-0 text-amber-400"
        title={title}
      >
        <Sparkles className="w-4 h-4" />
      </div>
    );
  }
  if (key.includes('backpack') || key.includes('mochila')) {
    return (
      <div
        className="w-9 h-9 rounded-lg bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/80 flex items-center justify-center shrink-0 text-indigo-400"
        title={title}
      >
        <Backpack className="w-4 h-4" />
      </div>
    );
  }
  return (
    <div
      className="w-9 h-9 rounded-lg bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/80 flex items-center justify-center shrink-0 text-slate-300"
      title={title}
    >
      <Package className="w-4 h-4" />
    </div>
  );
};
