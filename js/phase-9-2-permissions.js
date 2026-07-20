export const ROLES = Object.freeze({
  CASHIER: 'cashier',
  SUPERVISOR: 'supervisor',
  ACCOUNTING: 'accounting',
  WAREHOUSE: 'warehouse',
  SALES: 'sales',
  OWNER: 'owner'
});

const ROLE_PERMISSIONS = Object.freeze({
  cashier: new Set([
    'pos.reprint_receipt',
    'pos.return_create'
  ]),
  supervisor: new Set([
    'pos.reprint_receipt',
    'pos.return_create',
    'pos.void_bill'
  ]),
  accounting: new Set([
    'pos.reprint_receipt'
  ]),
  warehouse: new Set([]),
  sales: new Set([
    'pos.reprint_receipt'
  ]),
  owner: new Set([
    'pos.reprint_receipt',
    'pos.return_create',
    'pos.void_bill'
  ])
});

export function can(role, action) {
  return ROLE_PERMISSIONS[String(role || '').toLowerCase()]?.has(action) ?? false;
}

export function applyPermissionUI({
  role,
  root = document,
  hideUnauthorized = true
} = {}) {
  root.querySelectorAll('[data-permission]').forEach((element) => {
    const allowed = can(role, element.getAttribute('data-permission'));

    element.disabled = !allowed;
    element.setAttribute('aria-disabled', String(!allowed));

    if (hideUnauthorized) {
      element.hidden = !allowed;
    }
  });
}
