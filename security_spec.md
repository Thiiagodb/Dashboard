# Security Specification (Phase 0: Payload-First Security TDD)

## 1. Data Invariants
1. **Strict Ownership (`ownerId`)**: Every document across `/orders/{orderId}`, `/order_items/{itemId}`, `/products/{productId}`, `/ad_spends/{adSpendId}`, `/custom_expenses/{expenseId}`, and `/settings/{settingId}` must belong exclusively to `request.auth.uid` (`ownerId == request.auth.uid`) with a verified email (`request.auth.token.email_verified == true`).
2. **PII Isolation**: `/orders/{orderId}` (containing `customerName`, `customerEmail`, `customerPhone`) and `/settings/{settingId}` (containing API tokens) are strictly restricted to the document owner (`resource.data.ownerId == request.auth.uid`) for both `get` and `list` operations. No blanket `isSignedIn()` reads exist.
3. **Relational Integrity for `OrderItem`**: An `OrderItem` in `/order_items/{itemId}` cannot be created unless its referenced parent order `/orders/$(incoming().orderId)` exists and belongs to `request.auth.uid`.
4. **Immutable Ownership & Creation Timestamps**: `ownerId` and `createdAt` can never be mutated on update (`incoming().ownerId == existing().ownerId && incoming().createdAt == existing().createdAt`).
5. **Server Timestamp Enforcement**: `createdAt` must equal `request.time` on `create`, and `updatedAt` must equal `request.time` on `create` and `update`.
6. **Strict Schema & Key Whitelisting**: Every `create` validates exact keys (`hasAll` and `hasOnly`), field types, enums, and maximum string lengths. Every `update` wraps `isValid[Entity](incoming())` and enforces action-based `affectedKeys().hasOnly(...)`.

## 2. The "Dirty Dozen" Payloads
1. **Identity Spoofing on Order Create**: `ownerId: "victim-uid-123"` while authenticated as `"attacker-uid-999"`. -> `PERMISSION_DENIED`
2. **Unverified Email Write**: Authenticated user with `email_verified: false` attempting to create a Product. -> `PERMISSION_DENIED`
3. **Shadow Field Injection on Order Update**: Updating an order's `status` while injecting `isVerified: true`. -> `PERMISSION_DENIED`
4. **Orphaned OrderItem Creation**: Creating an `OrderItem` referencing a non-existent `orderId: "non_existent_order_999"`. -> `PERMISSION_DENIED`
5. **Cross-Tenant OrderItem Injection**: Creating an `OrderItem` referencing an `orderId` owned by another user. -> `PERMISSION_DENIED`
6. **PII Leak via Order Get**: User B calling `get` on `/orders/order_owned_by_user_a`. -> `PERMISSION_DENIED`
7. **Unscoped List Query on Orders**: Calling `list` on `/orders` without filtering `where('ownerId', '==', request.auth.uid)`. -> `PERMISSION_DENIED`
8. **Resource Poisoning (ID Injection)**: Creating a document with an invalid ID containing spaces or >128 chars. -> `PERMISSION_DENIED`
9. **Value Poisoning on Status Update**: Updating `Order.status` to `"hacked_status"` (outside allowed enum). -> `PERMISSION_DENIED`
10. **Timestamp Forgery on Create**: Creating an `AdSpend` with a client-forged past `createdAt` timestamp (`createdAt != request.time`). -> `PERMISSION_DENIED`
11. **Ownership Mutation on Update**: Updating `Product.ownerId` to transfer ownership to another user. -> `PERMISSION_DENIED`
12. **Denial of Wallet Oversized String**: Creating a `CustomExpense` with a 10,000-character `name` (exceeds `maxLength: 160`). -> `PERMISSION_DENIED`
