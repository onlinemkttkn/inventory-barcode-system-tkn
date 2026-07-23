# TKN POS ERP Master 3.4 LTS — Stable Candidate

## Included

- Red / Yellow / Black shared theme
- Standard permission-aware sidebar
- Logout pinned at the bottom for every role
- Cashier employee code + PIN
- Cashier open and close shift
- Opening cash float and closing cash reconciliation
- Real-time received amount and change
- Quick-cash buttons
- Cash drawer bridge hook
- Hold and restore one bill on the current device
- Product search row with Add button at the far right
- Product permission fix (`product.manage`)
- Product creator is derived from the authenticated session
- User page fields for employee code, PIN, branch, drawer permission and discount limit
- Role enum assignment fix
- Inventory operation hub without replacing the existing inventory pages
- Existing 3.4 RC report range and mobile transfer/issue features retained

## Cash drawer limitation

A web browser cannot directly open every cash drawer model.
Set this global value to a local hardware/printing bridge endpoint:

```javascript
window.TKN_CASH_DRAWER_BRIDGE_URL = 'http://127.0.0.1:PORT/open-drawer';
```

Without a bridge, sales still complete normally and the UI reports that hardware
configuration is pending.
