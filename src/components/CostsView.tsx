import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Archive,
  ArrowRight,
  Boxes,
  Check,
  CheckCircle2,
  Clock,
  DollarSign,
  Edit2,
  Edit3,
  HelpCircle,
  Package,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import {
  matchOrderToProduct,
  OrderExtraCost,
  OrderRecord,
  ProductRecord,
  SettingsRecord,
} from '../lib/profit-engine.ts';
import {
  formatBRL,
  formatNumber,
  formatPercent,
  ProductThumbnail,
} from './Formatters.tsx';

interface CostsViewProps {
  products: ProductRecord[];
  orders: OrderRecord[];
  settings: SettingsRecord;
  privacyMode: boolean;
  onUpdateProductCost: (
    product: ProductRecord,
    newCost: number,
    applyRetroactive: boolean,
    newPrice?: number
  ) => Promise<void>;
  onSaveProduct: (product: ProductRecord) => Promise<void>;
  onDeleteProduct: (productId: string) => Promise<void>;
  onSaveOperationalCosts: (
    defaultPackagingCost: number,
    orderExtraCosts: OrderExtraCost[]
  ) => Promise<void>;
  onRecalculateAllOperationalCosts: (
    defaultPackagingCost: number,
    orderExtraCosts: OrderExtraCost[]
  ) => Promise<void>;
  onSyncCartpandaProducts?: () => Promise<void>;
}

export const CostsView: React.FC<CostsViewProps> = ({
  products,
  orders,
  settings,
  privacyMode,
  onUpdateProductCost,
  onSaveProduct,
  onDeleteProduct,
  onSaveOperationalCosts,
  onRecalculateAllOperationalCosts,
  onSyncCartpandaProducts,
}) => {
  const [activeTab, setActiveTab] = useState<'products' | 'operational'>('products');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSyncingProducts, setIsSyncingProducts] = useState(false);

  // Auto-sync products on first view load if catalog is currently empty
  React.useEffect(() => {
    if (products.length === 0 && onSyncCartpandaProducts) {
      onSyncCartpandaProducts();
    }
  }, [products.length, onSyncCartpandaProducts]);

  const handleSyncStore = async () => {
    if (!onSyncCartpandaProducts) return;
    setIsSyncingProducts(true);
    try {
      await onSyncCartpandaProducts();
    } finally {
      setIsSyncingProducts(false);
    }
  };

  // Inline editing state for quick cost change in product table
  const [editingSku, setEditingSku] = useState<string | null>(null);
  const [costInput, setCostInput] = useState<string>('');
  const [priceInput, setPriceInput] = useState<string>('');

  // Retroactive confirmation modal state
  const [retroactiveModal, setRetroactiveModal] = useState<{
    product: ProductRecord;
    newCost: number;
    newPrice?: number;
    matchingOrdersCount: number;
  } | null>(null);
  const [isProcessingRetroactive, setIsProcessingRetroactive] = useState(false);

  // New product modal state
  const [showNewProductModal, setShowNewProductModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newSku, setNewSku] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newCostPrice, setNewCostPrice] = useState('');
  const [newStockQuantity, setNewStockQuantity] = useState('100');
  const [newImageUrl, setNewImageUrl] = useState('');

  // Operational costs editing state
  const [packagingCostInput, setPackagingCostInput] = useState<string>(
    String(settings.defaultPackagingCost ?? 3.5)
  );
  const [extraCostsList, setExtraCostsList] = useState<OrderExtraCost[]>(() =>
    Array.isArray(settings.orderExtraCosts)
      ? JSON.parse(JSON.stringify(settings.orderExtraCosts))
      : [
          { id: 'extra_1', name: 'Brinde / Adesivo', amount: 1.0, active: true },
          { id: 'extra_2', name: 'Fita e Etiqueta', amount: 0.5, active: true },
        ]
  );
  const [showNewExtraModal, setShowNewExtraModal] = useState(false);
  const [newExtraName, setNewExtraName] = useState('');
  const [newExtraAmount, setNewExtraAmount] = useState('');
  const [isSavingOperational, setIsSavingOperational] = useState(false);
  const [isRecalculatingOperational, setIsRecalculatingOperational] = useState(false);

  // Compute product sales & units from orders
  const productStats = useMemo(() => {
    const map = new Map<
      string,
      { unitsSold: number; totalGross: number; paidOrdersCount: number }
    >();

    for (const ord of orders) {
      if (ord.status !== 'approved' && ord.status !== 'paid_unfulfilled') continue;

      for (const prod of products) {
        const { matches, quantity } = matchOrderToProduct(ord, prod);
        if (matches) {
          const curr = map.get(prod.sku) || {
            unitsSold: 0,
            totalGross: 0,
            paidOrdersCount: 0,
          };
          curr.unitsSold += quantity;
          curr.totalGross += ord.grossAmount;
          curr.paidOrdersCount += 1;
          map.set(prod.sku, curr);
        }
      }
    }
    return map;
  }, [orders, products]);

  // Filtered products list
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;
    const q = searchQuery.toLowerCase();
    return products.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q)
    );
  }, [products, searchQuery]);

  // Overall Catalog Metrics
  const catalogMetrics = useMemo(() => {
    const totalCount = products.length;
    if (totalCount === 0) {
      return { totalCount: 0, avgCost: 0, avgPrice: 0, avgMargin: 0 };
    }
    const sumCost = products.reduce((acc, p) => acc + (Number(p.costPrice) || 0), 0);
    const sumPrice = products.reduce((acc, p) => acc + (Number(p.price) || 0), 0);
    const avgCost = sumCost / totalCount;
    const avgPrice = sumPrice / totalCount;
    const avgMargin = avgPrice > 0 ? ((avgPrice - avgCost) / avgPrice) * 100 : 0;

    return { totalCount, avgCost, avgPrice, avgMargin };
  }, [products]);

  // Trigger Save with Retroactive Check
  const initiateSaveCost = (product: ProductRecord) => {
    const parsedCost = Math.max(0, parseFloat(costInput.replace(',', '.')) || 0);
    const parsedPrice = priceInput ? parseFloat(priceInput.replace(',', '.')) || product.price : product.price;

    // Check how many orders have this product
    let matchingOrdersCount = 0;
    for (const ord of orders) {
      const { matches } = matchOrderToProduct(ord, product);
      if (matches) {
        matchingOrdersCount++;
      }
    }

    setRetroactiveModal({
      product,
      newCost: parsedCost,
      newPrice: parsedPrice,
      matchingOrdersCount,
    });
  };

  // Confirm Retroactive or Future-only
  const handleConfirmRetroactiveChoice = async (applyRetroactive: boolean) => {
    if (!retroactiveModal) return;
    const modalData = retroactiveModal;

    // Immediately close modal and exit editing mode so popup closes instantly on click
    setRetroactiveModal(null);
    setEditingSku(null);
    setIsProcessingRetroactive(true);

    try {
      await onUpdateProductCost(
        modalData.product,
        modalData.newCost,
        applyRetroactive,
        modalData.newPrice
      );
    } catch (err) {
      console.error('Error applying product cost:', err);
    } finally {
      setIsProcessingRetroactive(false);
    }
  };

  // Handle Create New Product
  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newSku.trim()) return;

    const parsedPrice = parseFloat(newPrice.replace(',', '.')) || 0;
    const parsedCost = parseFloat(newCostPrice.replace(',', '.')) || 0;
    const parsedStock = parseInt(newStockQuantity, 10) || 100;

    const newProd: ProductRecord = {
      id: `prod_${Date.now()}_${newSku.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
      ownerId: 'local_merchant',
      shopifyId: '',
      title: newTitle.trim(),
      sku: newSku.trim().toUpperCase(),
      imageUrl: newImageUrl.trim(),
      price: parsedPrice,
      costPrice: parsedCost,
      stockQuantity: parsedStock,
      active: true,
    };

    await onSaveProduct(newProd);
    setShowNewProductModal(false);
    setNewTitle('');
    setNewSku('');
    setNewPrice('');
    setNewCostPrice('');
    setNewImageUrl('');
  };

  // Handle Add Extra Operational Cost
  const handleAddExtraCost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExtraName.trim()) return;
    const amount = Math.max(0, parseFloat(newExtraAmount.replace(',', '.')) || 0);

    const newCostItem: OrderExtraCost = {
      id: `extra_${Date.now()}`,
      name: newExtraName.trim(),
      amount,
      active: true,
    };

    setExtraCostsList((prev) => [...prev, newCostItem]);
    setNewExtraName('');
    setNewExtraAmount('');
    setShowNewExtraModal(false);
  };

  // Handle Toggle Extra Cost
  const handleToggleExtraCost = (id: string) => {
    setExtraCostsList((prev) =>
      prev.map((c) => (c.id === id ? { ...c, active: !c.active } : c))
    );
  };

  // Handle Delete Extra Cost
  const handleDeleteExtraCost = (id: string) => {
    setExtraCostsList((prev) => prev.filter((c) => c.id !== id));
  };

  // Handle Save Operational Costs
  const handleSaveOperational = async () => {
    setIsSavingOperational(true);
    const parsedPackaging = Math.max(
      0,
      parseFloat(packagingCostInput.replace(',', '.')) || 0
    );
    try {
      await onSaveOperationalCosts(parsedPackaging, extraCostsList);
    } finally {
      setIsSavingOperational(false);
    }
  };

  // Handle Recalculate All Orders with Operational Costs
  const handleRecalculateOperational = async () => {
    setIsRecalculatingOperational(true);
    const parsedPackaging = Math.max(
      0,
      parseFloat(packagingCostInput.replace(',', '.')) || 0
    );
    try {
      await onRecalculateAllOperationalCosts(parsedPackaging, extraCostsList);
    } finally {
      setIsRecalculatingOperational(false);
    }
  };

  // Active operational costs sum
  const activeExtraSum = useMemo(() => {
    return extraCostsList
      .filter((c) => c.active)
      .reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
  }, [extraCostsList]);

  const packagingNumber = Math.max(
    0,
    parseFloat(packagingCostInput.replace(',', '.')) || 0
  );
  const totalPerOrderOperationalCost = packagingNumber + activeExtraSum;

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Boxes className="w-6 h-6 text-emerald-400" />
            <span>Custos dos Produtos & Insumos</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Defina o custo pago (CMV) em cada produto, custos fixos de embalagem e insumos por pedido.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab('products')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'products'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Custos dos Produtos (CMV)</span>
            <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-slate-950/40 text-slate-200 font-mono">
              {products.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('operational')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'operational'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Embalagem & Insumos por Pedido</span>
            <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-slate-950/40 text-slate-200 font-mono">
              {formatBRL(totalPerOrderOperationalCost, privacyMode)}
            </span>
          </button>
        </div>
      </div>

      {/* ================= TAB 1: PRODUCT COSTS (CMV) ================= */}
      {activeTab === 'products' && (
        <div className="space-y-6">
          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="p-4 rounded-xl bg-[#111827] border border-slate-800/90 shadow-sm">
              <span className="text-xs font-medium text-slate-400 block">Total de Produtos</span>
              <span className="text-xl sm:text-2xl font-bold font-mono text-slate-100 mt-1 block">
                {catalogMetrics.totalCount} itens
              </span>
              <span className="text-[11px] text-slate-400 mt-1 block">No catálogo ativo</span>
            </div>

            <div className="p-4 rounded-xl bg-[#111827] border border-slate-800/90 shadow-sm">
              <span className="text-xs font-medium text-slate-400 block">CMV Médio Unitário</span>
              <span className="text-xl sm:text-2xl font-bold font-mono text-amber-300 mt-1 block">
                {formatBRL(catalogMetrics.avgCost, privacyMode)}
              </span>
              <span className="text-[11px] text-slate-400 mt-1 block">Custo pago por unidade</span>
            </div>

            <div className="p-4 rounded-xl bg-[#111827] border border-slate-800/90 shadow-sm">
              <span className="text-xs font-medium text-slate-400 block">Preço Médio de Venda</span>
              <span className="text-xl sm:text-2xl font-bold font-mono text-slate-100 mt-1 block">
                {formatBRL(catalogMetrics.avgPrice, privacyMode)}
              </span>
              <span className="text-[11px] text-slate-400 mt-1 block">Ticket médio do produto</span>
            </div>

            <div className="p-4 rounded-xl bg-[#111827] border border-slate-800/90 shadow-sm">
              <span className="text-xs font-medium text-slate-400 block">Margem Média Bruta</span>
              <span className="text-xl sm:text-2xl font-bold font-mono text-emerald-400 mt-1 block">
                {formatPercent(catalogMetrics.avgMargin, privacyMode)}
              </span>
              <span className="text-[11px] text-slate-400 mt-1 block">Markup unitário de fábrica</span>
            </div>
          </div>

          {/* Search Toolbar & Action Button */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-[#111827] border border-slate-800/90 rounded-xl">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar produto por título ou SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/60"
              />
            </div>

            <div className="flex items-center gap-2">
              {onSyncCartpandaProducts && (
                <button
                  type="button"
                  onClick={handleSyncStore}
                  disabled={isSyncingProducts}
                  className="px-3 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700 transition-colors flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                  title="Buscar todos os 16 produtos cadastrados na Cartpanda"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 text-emerald-400 ${
                      isSyncingProducts ? 'animate-spin' : ''
                    }`}
                  />
                  <span>Sincronizar da Loja</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowNewProductModal(true)}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center justify-center gap-1.5 cursor-pointer shrink-0 shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>+ Novo Produto</span>
              </button>
            </div>
          </div>

          {/* Empty State Banner if no products found */}
          {filteredProducts.length === 0 && (
            <div className="p-8 text-center bg-[#111827] border border-slate-800/90 rounded-2xl space-y-3">
              <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-2xl w-fit mx-auto">
                <Boxes className="w-8 h-8" />
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <h3 className="text-base font-bold text-slate-100">
                  Nenhum produto listado no catálogo
                </h3>
                <p className="text-xs text-slate-400">
                  Clique no botão abaixo para puxar todos os 16 produtos da sua loja Cartpanda e definir o CMV pago em cada um.
                </p>
              </div>
              {onSyncCartpandaProducts && (
                <button
                  type="button"
                  onClick={handleSyncStore}
                  disabled={isSyncingProducts}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer shadow-sm shadow-emerald-950/40"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${isSyncingProducts ? 'animate-spin' : ''}`}
                  />
                  <span>Puxar Todos os Produtos da Cartpanda Agora</span>
                </button>
              )}
            </div>
          )}

          {/* Products Table (Desktop) */}
          <div className="hidden md:block bg-[#111827] border border-slate-800/90 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800/90 text-[11px] text-slate-400 bg-slate-900/50">
                    <th className="py-3 px-4 font-medium">Produto</th>
                    <th className="py-3 px-3 font-medium">SKU</th>
                    <th className="py-3 px-3 font-medium text-right">Preço de Venda</th>
                    <th className="py-3 px-3 font-medium text-right">Custo Pago (CMV)</th>
                    <th className="py-3 px-3 font-medium text-right">Margem Unitária</th>
                    <th className="py-3 px-3 font-medium text-right">Estoque</th>
                    <th className="py-3 px-3 font-medium text-right">Vendas Pagas</th>
                    <th className="py-3 px-4 font-medium text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs">
                  {filteredProducts.map((prod) => {
                    const isEditing = editingSku === prod.sku;
                    const stats = productStats.get(prod.sku) || {
                      unitsSold: 0,
                      totalGross: 0,
                      paidOrdersCount: 0,
                    };
                    const unitMargin =
                      prod.price > 0
                        ? ((prod.price - prod.costPrice) / prod.price) * 100
                        : 0;

                    return (
                      <tr key={prod.id} className="hover:bg-slate-800/30 transition-colors">
                        {/* Imagem + Título */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <ProductThumbnail
                              imageKey={prod.imageUrl}
                              title={prod.title}
                            />
                            <div className="min-w-0 max-w-[220px]">
                              <div className="font-semibold text-slate-100 truncate" title={prod.title}>
                                {prod.title}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                ID: {prod.id.slice(0, 16)}...
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* SKU */}
                        <td className="py-3 px-3 font-mono text-slate-300 whitespace-nowrap">
                          {prod.sku}
                        </td>

                        {/* Preço de Venda */}
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                          {isEditing ? (
                            <input
                              type="number"
                              step="0.01"
                              value={priceInput}
                              onChange={(e) => setPriceInput(e.target.value)}
                              className="w-20 px-2 py-1 text-xs font-mono text-right bg-slate-900 border border-slate-700 rounded text-slate-100 focus:outline-none"
                            />
                          ) : (
                            formatBRL(prod.price, privacyMode)
                          )}
                        </td>

                        {/* Custo Unitário (CMV) Editável */}
                        <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                          {isEditing ? (
                            <div className="inline-flex items-center justify-end gap-1.5">
                              <span className="text-slate-400 text-[11px]">R$</span>
                              <input
                                type="number"
                                step="0.01"
                                value={costInput}
                                onChange={(e) => setCostInput(e.target.value)}
                                className="w-20 px-2 py-1 text-xs font-mono text-right bg-slate-950 border border-emerald-500 rounded text-slate-100 focus:outline-none"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => initiateSaveCost(prod)}
                                className="p-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                                title="Salvar custo"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingSku(null)}
                                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 cursor-pointer"
                                title="Cancelar"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center justify-end gap-1.5 text-amber-300 font-semibold">
                              <span>{formatBRL(prod.costPrice, privacyMode)}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingSku(prod.sku);
                                  setCostInput(String(prod.costPrice));
                                  setPriceInput(String(prod.price));
                                }}
                                className="p-1 text-slate-400 hover:text-slate-100 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                                title="Editar custo pago neste produto"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>

                        {/* Margem Unitária */}
                        <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                              unitMargin >= 40
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                : unitMargin >= 20
                                ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                                : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                            }`}
                          >
                            {formatPercent(unitMargin, privacyMode)}
                          </span>
                        </td>

                        {/* Estoque */}
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                          {prod.stockQuantity} un.
                        </td>

                        {/* Vendas Pagas */}
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                          <span className="font-semibold text-slate-100">
                            {formatNumber(stats.unitsSold, privacyMode)} un.
                          </span>{' '}
                          <span className="text-[11px] text-slate-400">
                            ({stats.paidOrdersCount} ped.)
                          </span>
                        </td>

                        {/* Ações */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingSku(prod.sku);
                                setCostInput(String(prod.costPrice));
                                setPriceInput(String(prod.price));
                              }}
                              className="p-1.5 text-slate-400 hover:text-slate-100 rounded-md hover:bg-slate-800 transition-colors cursor-pointer"
                              title="Ajustar Custo e Preço"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteProduct(prod.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-400 rounded-md hover:bg-slate-800 transition-colors cursor-pointer"
                              title="Excluir produto do catálogo"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Products Cards (Mobile < 768px) */}
          <div className="block md:hidden space-y-3">
            {filteredProducts.map((prod) => {
              const isEditing = editingSku === prod.sku;
              const stats = productStats.get(prod.sku) || {
                unitsSold: 0,
                totalGross: 0,
                paidOrdersCount: 0,
              };
              const unitMargin =
                prod.price > 0
                  ? ((prod.price - prod.costPrice) / prod.price) * 100
                  : 0;

              return (
                <div
                  key={prod.id}
                  className="p-4 rounded-xl bg-[#111827] border border-slate-800/90 space-y-3"
                >
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
                        <div className="text-[10px] text-slate-400 font-mono">
                          SKU: {prod.sku} · Estoque: {prod.stockQuantity} un.
                        </div>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                        unitMargin >= 40
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          : 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                      }`}
                    >
                      {formatPercent(unitMargin, privacyMode)} margem
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
                        {stats.unitsSold} un.
                      </span>
                    </div>

                    <div className="col-span-2 p-2 bg-slate-900/60 rounded-lg border border-slate-800/60">
                      <span className="block text-[10px] font-sans text-slate-400">Custo Pago (CMV)</span>
                      {isEditing ? (
                        <div className="flex items-center gap-2 mt-1">
                          <input
                            type="number"
                            step="0.01"
                            value={costInput}
                            onChange={(e) => setCostInput(e.target.value)}
                            className="flex-1 px-2 py-1 text-xs font-mono bg-slate-950 border border-emerald-500 rounded text-slate-100 focus:outline-none"
                            placeholder="Novo custo"
                          />
                          <button
                            type="button"
                            onClick={() => initiateSaveCost(prod)}
                            className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
                          >
                            Salvar
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingSku(null)}
                            className="px-2 py-1 rounded bg-slate-800 text-slate-300 text-xs cursor-pointer"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between mt-0.5">
                          <span className="text-sm font-bold text-amber-300">
                            {formatBRL(prod.costPrice, privacyMode)}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingSku(prod.sku);
                              setCostInput(String(prod.costPrice));
                              setPriceInput(String(prod.price));
                            }}
                            className="px-2 py-1 text-[11px] rounded bg-slate-800 text-slate-200 border border-slate-700 flex items-center gap-1 cursor-pointer"
                          >
                            <Edit3 className="w-3 h-3 text-emerald-400" />
                            <span>Alterar Custo</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================= TAB 2: OPERATIONAL & PACKAGING COSTS ================= */}
      {activeTab === 'operational' && (
        <div className="space-y-6">
          {/* Packaging Cost Card */}
          <div className="p-5 sm:p-6 bg-[#111827] border border-slate-800/90 rounded-xl space-y-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <Archive className="w-5 h-5 text-emerald-400" />
                  <span>Custo Padrão de Embalagem por Pedido</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Defina quanto custa a caixa, envelope de segurança, fita adesiva e plástico bolha em cada envio.
                  Este custo será abatido automaticamente de cada pedido como custo operacional direto.
                </p>
              </div>
              <span className="px-2.5 py-1 text-xs font-mono font-bold rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                {formatBRL(packagingNumber, privacyMode)} / pedido
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
              <div className="relative flex-1 max-w-xs">
                <span className="text-xs text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none font-semibold">
                  R$
                </span>
                <input
                  type="number"
                  step="0.05"
                  value={packagingCostInput}
                  onChange={(e) => setPackagingCostInput(e.target.value)}
                  placeholder="3.50"
                  className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm font-mono text-slate-100 focus:outline-none focus:border-emerald-500/60"
                />
              </div>

              <button
                type="button"
                onClick={handleSaveOperational}
                disabled={isSavingOperational}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                {isSavingOperational ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>Salvar Custo de Embalagem</span>
              </button>
            </div>
          </div>

          {/* Dynamic Extra Costs per Order List */}
          <div className="p-5 sm:p-6 bg-[#111827] border border-slate-800/90 rounded-xl space-y-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <Package className="w-5 h-5 text-emerald-400" />
                  <span>Outros Custos & Insumos por Pedido</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Adicione custos operacionais extras aplicados por pedido (ex: brindes, cartões de agradecimento, tags, manuseio/separação).
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowNewExtraModal(true)}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
              >
                <Plus className="w-3.5 h-3.5 text-emerald-400" />
                <span>+ Adicionar Novo Insumo</span>
              </button>
            </div>

            {/* List of Extra Costs */}
            <div className="divide-y divide-slate-800/80 border border-slate-800/80 rounded-xl overflow-hidden bg-slate-900/40">
              {extraCostsList.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  Nenhum insumo extra cadastrado. Clique no botão acima para adicionar brindes ou outros custos fixos por envio.
                </div>
              ) : (
                extraCostsList.map((cost) => (
                  <div
                    key={cost.id}
                    className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-800/20 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleToggleExtraCost(cost.id)}
                        className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors cursor-pointer border ${
                          cost.active
                            ? 'bg-emerald-600 border-emerald-500 text-white'
                            : 'bg-slate-900 border-slate-700 text-transparent'
                        }`}
                        title={cost.active ? 'Desativar custo' : 'Ativar custo'}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <div>
                        <span
                          className={`text-xs font-semibold ${
                            cost.active ? 'text-slate-200' : 'text-slate-500 line-through'
                          }`}
                        >
                          {cost.name}
                        </span>
                        <span className="block text-[10px] text-slate-500">
                          {cost.active ? 'Ativo por pedido' : 'Inativo (desativado)'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono font-bold text-amber-300">
                        {formatBRL(cost.amount, privacyMode)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteExtraCost(cost.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 rounded-md hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Remover insumo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Total Operational Summary Strip */}
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-semibold text-slate-300 block">
                  Total de Custos Operacionais por Pedido:
                </span>
                <span className="text-[11px] text-slate-400">
                  Embalagem ({formatBRL(packagingNumber, privacyMode)}) + Insumos Ativos ({formatBRL(activeExtraSum, privacyMode)})
                </span>
              </div>
              <div className="text-lg sm:text-xl font-bold font-mono text-emerald-400">
                {formatBRL(totalPerOrderOperationalCost, privacyMode)} / pedido
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleSaveOperational}
                disabled={isSavingOperational}
                className="px-4 py-2.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                {isSavingOperational ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>Salvar Alterações de Insumos</span>
              </button>

              <button
                type="button"
                onClick={handleRecalculateOperational}
                disabled={isRecalculatingOperational}
                className="px-4 py-2.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700 transition-colors cursor-pointer flex items-center justify-center gap-2"
                title="Aplica o novo valor de embalagem e insumos a todos os pedidos existentes"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 text-sky-400 ${
                    isRecalculatingOperational ? 'animate-spin' : ''
                  }`}
                />
                <span>Recalcular Todos os Pedidos Anteriores com Estes Insumos</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= RETROACTIVE CONFIRMATION MODAL ================= */}
      {retroactiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-[#111827] border border-slate-700 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-400 shrink-0">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-100">
                  Aplicar aos pedidos anteriores?
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Você alterou o custo de{' '}
                  <strong className="text-slate-200">
                    "{retroactiveModal.product.title}"
                  </strong>{' '}
                  para{' '}
                  <strong className="text-amber-300 font-mono">
                    {formatBRL(retroactiveModal.newCost, privacyMode)}
                  </strong>
                  .
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Pedidos identificados com este produto:</span>
                <span className="font-mono font-bold text-emerald-400">
                  {retroactiveModal.matchingOrdersCount} pedido(s)
                </span>
              </div>
              <p className="text-[11px] text-slate-400 border-t border-slate-800/80 pt-2">
                Deseja recalcular retroativamente o CMV e o lucro líquido de todos os pedidos anteriores desse produto, ou aplicar apenas para pedidos futuros?
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                disabled={isProcessingRetroactive}
                onClick={() => handleConfirmRetroactiveChoice(true)}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                {isProcessingRetroactive ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>Sim, recalcular pedidos anteriores ({retroactiveModal.matchingOrdersCount})</span>
              </button>

              <button
                type="button"
                disabled={isProcessingRetroactive}
                onClick={() => handleConfirmRetroactiveChoice(false)}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700 text-xs font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Não, aplicar apenas para novos pedidos</span>
              </button>

              <button
                type="button"
                disabled={isProcessingRetroactive}
                onClick={() => setRetroactiveModal(null)}
                className="w-full py-1.5 text-center text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= NEW PRODUCT MODAL ================= */}
      {showNewProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-[#111827] border border-slate-700 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Tag className="w-4 h-4 text-emerald-400" />
                <span>Cadastrar Novo Produto</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowNewProductModal(false)}
                className="p-1 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateProduct} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Título do Produto *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Cama Nuvem Pet - Tamanho G"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-emerald-500/60"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    SKU / Código Único *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: CAM-PET-G"
                    value={newSku}
                    onChange={(e) => setNewSku(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg font-mono text-slate-100 focus:outline-none focus:border-emerald-500/60"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    Estoque Inicial
                  </label>
                  <input
                    type="number"
                    value={newStockQuantity}
                    onChange={(e) => setNewStockQuantity(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg font-mono text-slate-100 focus:outline-none focus:border-emerald-500/60"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    Preço de Venda (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="129.90"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg font-mono text-slate-100 focus:outline-none focus:border-emerald-500/60"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    Custo Pago / CMV (R$) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="45.00"
                    value={newCostPrice}
                    onChange={(e) => setNewCostPrice(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg font-mono text-amber-300 font-semibold focus:outline-none focus:border-emerald-500/60"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  URL da Imagem (opcional)
                </label>
                <input
                  type="url"
                  placeholder="https://exemplo.com/imagem.png"
                  value={newImageUrl}
                  onChange={(e) => setNewImageUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-emerald-500/60"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowNewProductModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer"
                >
                  Salvar Produto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= NEW EXTRA COST MODAL ================= */}
      {showNewExtraModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#111827] border border-slate-700 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Package className="w-4 h-4 text-emerald-400" />
                <span>Adicionar Novo Insumo por Pedido</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowNewExtraModal(false)}
                className="p-1 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddExtraCost} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Nome do Insumo / Custo *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Brinde / Adesivo, Tag Personalizada, Separação"
                  value={newExtraName}
                  onChange={(e) => setNewExtraName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-emerald-500/60"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Valor Unitário por Pedido (R$) *
                </label>
                <input
                  type="number"
                  step="0.05"
                  required
                  placeholder="1.50"
                  value={newExtraAmount}
                  onChange={(e) => setNewExtraAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg font-mono text-slate-100 focus:outline-none focus:border-emerald-500/60"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowNewExtraModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer"
                >
                  Adicionar Insumo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
