import {
  AdSpendRecord,
  CustomExpenseRecord,
  DEFAULT_SETTINGS,
  OrderRecord,
  ProductRecord,
  SettingsRecord,
} from './profit-engine.ts';

export function buildInitialSeedData(ownerId: string): {
  settings: SettingsRecord;
  products: ProductRecord[];
  orders: OrderRecord[];
  adSpends: AdSpendRecord[];
  customExpenses: CustomExpenseRecord[];
} {
  const settings: SettingsRecord = {
    id: ownerId,
    ownerId,
    ...DEFAULT_SETTINGS,
    lastSyncAt: '',
    lastCartpandaSyncAt: '',
  };

  return {
    settings,
    products: [],
    orders: [],
    adSpends: [],
    customExpenses: [],
  };
}
