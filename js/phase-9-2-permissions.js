/**
 * TKN POS / ERP — Phase 9.2
 * Role & Permission Foundation
 *
 * Additive module: does not overwrite existing project files.
 * Usage:
 *   import { can, getVisibleActions, applyPermissionUI } from './phase-9-2-permissions.js';
 */

export const ROLES = Object.freeze({
  CASHIER: 'cashier',
  SUPERVISOR: 'supervisor',
  ACCOUNTING: 'accounting',
  WAREHOUSE: 'warehouse',
  SALES: 'sales',
  OWNER: 'owner'
});

export const ACTIONS = Object.freeze({
  POS_SELL: 'pos.sell',
  POS_HOLD_BILL: 'pos.hold_bill',
  POS_SEARCH_BILL: 'pos.search_bill',
  POS_REPRINT_RECEIPT: 'pos.reprint_receipt',
  POS_DISCOUNT_REQUEST: 'pos.discount_request',
  POS_DISCOUNT_APPROVE: 'pos.discount_approve',
  POS_VOID_BILL: 'pos.void_bill',
  POS_RETURN_CREATE: 'pos.return_create',
  POS_RETURN_APPROVE: 'pos.return_approve',

  PAYMENT_RECEIVE_CASH: 'payment.receive_cash',
  PAYMENT_RECEIVE_QR: 'payment.receive_qr',
  PAYMENT_RECEIVE_TRANSFER: 'payment.receive_transfer',
  PAYMENT_SPLIT: 'payment.split',

  ACCOUNTING_SLIP_REVIEW: 'accounting.slip_review',
  ACCOUNTING_RECONCILE: 'accounting.reconcile',
  ACCOUNTING_DAILY_CLOSE: 'accounting.daily_close',
  ACCOUNTING_MONTHLY_CLOSE: 'accounting.monthly_close',
  ACCOUNTING_EXPORT: 'accounting.export',

  INVENTORY_RECEIVE: 'inventory.receive',
  INVENTORY_ISSUE: 'inventory.issue',
  INVENTORY_TRANSFER: 'inventory.transfer',
  INVENTORY_COUNT: 'inventory.count',
  INVENTORY_ADJUST: 'inventory.adjust',

  CUSTOMER_VIEW: 'customer.view',
  CUSTOMER_EDIT: 'customer.edit',
  CUSTOMER_EXPORT: 'customer.export',

  DASHBOARD_VIEW: 'dashboard.view',
  DASHBOARD_DRILLDOWN: 'dashboard.drilldown',
  REPORT_EXPORT: 'report.export',

  USER_MANAGE: 'user.manage',
  PERMISSION_MANAGE: 'permission.manage',
  AUDIT_VIEW: 'audit.view'
});

const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.CASHIER]: new Set([
    ACTIONS.POS_SELL,
    ACTIONS.POS_HOLD_BILL,
    ACTIONS.POS_SEARCH_BILL,
    ACTIONS.POS_REPRINT_RECEIPT,
    ACTIONS.POS_DISCOUNT_REQUEST,
    ACTIONS.POS_RETURN_CREATE,
    ACTIONS.PAYMENT_RECEIVE_CASH,
    ACTIONS.PAYMENT_RECEIVE_QR,
    ACTIONS.PAYMENT_RECEIVE_TRANSFER,
    ACTIONS.PAYMENT_SPLIT,
    ACTIONS.CUSTOMER_VIEW
  ]),

  [ROLES.SUPERVISOR]: new Set([
    ACTIONS.POS_SELL,
    ACTIONS.POS_HOLD_BILL,
    ACTIONS.POS_SEARCH_BILL,
    ACTIONS.POS_REPRINT_RECEIPT,
    ACTIONS.POS_DISCOUNT_REQUEST,
    ACTIONS.POS_DISCOUNT_APPROVE,
    ACTIONS.POS_VOID_BILL,
    ACTIONS.POS_RETURN_CREATE,
    ACTIONS.POS_RETURN_APPROVE,
    ACTIONS.PAYMENT_RECEIVE_CASH,
    ACTIONS.PAYMENT_RECEIVE_QR,
    ACTIONS.PAYMENT_RECEIVE_TRANSFER,
    ACTIONS.PAYMENT_SPLIT,
    ACTIONS.CUSTOMER_VIEW,
    ACTIONS.DASHBOARD_VIEW,
    ACTIONS.AUDIT_VIEW
  ]),

  [ROLES.ACCOUNTING]: new Set([
    ACTIONS.POS_SEARCH_BILL,
    ACTIONS.POS_REPRINT_RECEIPT,
    ACTIONS.ACCOUNTING_SLIP_REVIEW,
    ACTIONS.ACCOUNTING_RECONCILE,
    ACTIONS.ACCOUNTING_DAILY_CLOSE,
    ACTIONS.ACCOUNTING_MONTHLY_CLOSE,
    ACTIONS.ACCOUNTING_EXPORT,
    ACTIONS.DASHBOARD_VIEW,
    ACTIONS.DASHBOARD_DRILLDOWN,
    ACTIONS.REPORT_EXPORT,
    ACTIONS.AUDIT_VIEW
  ]),

  [ROLES.WAREHOUSE]: new Set([
    ACTIONS.INVENTORY_RECEIVE,
    ACTIONS.INVENTORY_ISSUE,
    ACTIONS.INVENTORY_TRANSFER,
    ACTIONS.INVENTORY_COUNT,
    ACTIONS.CUSTOMER_VIEW,
    ACTIONS.DASHBOARD_VIEW
  ]),

  [ROLES.SALES]: new Set([
    ACTIONS.POS_SEARCH_BILL,
    ACTIONS.CUSTOMER_VIEW,
    ACTIONS.CUSTOMER_EDIT,
    ACTIONS.DASHBOARD_VIEW,
    ACTIONS.DASHBOARD_DRILLDOWN,
    ACTIONS.REPORT_EXPORT
  ]),

  [ROLES.OWNER]: new Set(Object.values(ACTIONS))
});

export function normalizeRole(role) {
  return String(role || '').trim().toLowerCase();
}

export function can(role, action, overrides = {}) {
  const normalizedRole = normalizeRole(role);

  if (Array.isArray(overrides.deny) && overrides.deny.includes(action)) {
    return false;
  }

  if (Array.isArray(overrides.allow) && overrides.allow.includes(action)) {
    return true;
  }

  return ROLE_PERMISSIONS[normalizedRole]?.has(action) ?? false;
}

export function getVisibleActions(role, overrides = {}) {
  return Object.values(ACTIONS).filter((action) => can(role, action, overrides));
}

/**
 * HTML convention:
 *   <button data-permission="pos.void_bill">ยกเลิกบิล</button>
 *
 * Unauthorized elements are hidden and disabled.
 */
export function applyPermissionUI({
  role,
  root = document,
  overrides = {},
  hideUnauthorized = true
} = {}) {
  if (!root?.querySelectorAll) {
    throw new TypeError('root must support querySelectorAll');
  }

  const elements = root.querySelectorAll('[data-permission]');

  elements.forEach((element) => {
    const action = element.getAttribute('data-permission');
    const allowed = can(role, action, overrides);

    element.toggleAttribute('disabled', !allowed);
    element.setAttribute('aria-disabled', String(!allowed));

    if (hideUnauthorized) {
      element.hidden = !allowed;
    } else {
      element.hidden = false;
    }
  });
}

/**
 * Security note:
 * UI permission checks improve UX only.
 * Every sensitive operation must also be verified by the backend/database.
 */
