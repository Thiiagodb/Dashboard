/**
 * Security Rules Verification Suite (Dirty Dozen Adversarial Payloads)
 * Verifies that all 12 Dirty Dozen payloads in security_spec.md are rejected by firestore.rules.
 */
export interface DirtyDozenScenario {
  id: number;
  name: string;
  collection: string;
  operation: 'create' | 'update' | 'get' | 'list';
  authUid: string | null;
  emailVerified: boolean;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_SCENARIOS: DirtyDozenScenario[] = [
  {
    id: 1,
    name: 'Identity Spoofing on Order Create',
    collection: 'orders/ord_1',
    operation: 'create',
    authUid: 'attacker-uid-999',
    emailVerified: true,
    payload: { ownerId: 'victim-uid-123', orderNumber: '#1001' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified Email Write',
    collection: 'products/prod_1',
    operation: 'create',
    authUid: 'user-uid-1',
    emailVerified: false,
    payload: { ownerId: 'user-uid-1', title: 'Product' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Shadow Field Injection on Order Update',
    collection: 'orders/ord_1',
    operation: 'update',
    authUid: 'user-uid-1',
    emailVerified: true,
    payload: { status: 'approved', isVerified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Orphaned OrderItem Creation',
    collection: 'order_items/item_1',
    operation: 'create',
    authUid: 'user-uid-1',
    emailVerified: true,
    payload: { ownerId: 'user-uid-1', orderId: 'non_existent_order_999' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Cross-Tenant OrderItem Injection',
    collection: 'order_items/item_2',
    operation: 'create',
    authUid: 'attacker-uid-999',
    emailVerified: true,
    payload: { ownerId: 'attacker-uid-999', orderId: 'victim_order_1' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'PII Leak via Order Get',
    collection: 'orders/victim_order_1',
    operation: 'get',
    authUid: 'attacker-uid-999',
    emailVerified: true,
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Unscoped List Query on Orders',
    collection: 'orders',
    operation: 'list',
    authUid: 'attacker-uid-999',
    emailVerified: true,
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Resource Poisoning (ID Injection)',
    collection: 'orders/invalid id with spaces!',
    operation: 'create',
    authUid: 'user-uid-1',
    emailVerified: true,
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Value Poisoning on Status Update',
    collection: 'orders/ord_1',
    operation: 'update',
    authUid: 'user-uid-1',
    emailVerified: true,
    payload: { status: 'hacked_status' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Timestamp Forgery on Create',
    collection: 'ad_spends/ad_1',
    operation: 'create',
    authUid: 'user-uid-1',
    emailVerified: true,
    payload: { ownerId: 'user-uid-1', createdAt: '2020-01-01T00:00:00Z' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Ownership Mutation on Update',
    collection: 'products/prod_1',
    operation: 'update',
    authUid: 'user-uid-1',
    emailVerified: true,
    payload: { ownerId: 'other-user-uid' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Denial of Wallet Oversized String',
    collection: 'custom_expenses/exp_1',
    operation: 'create',
    authUid: 'user-uid-1',
    emailVerified: true,
    payload: { ownerId: 'user-uid-1', name: 'A'.repeat(10000) },
    expectedResult: 'PERMISSION_DENIED',
  },
];
