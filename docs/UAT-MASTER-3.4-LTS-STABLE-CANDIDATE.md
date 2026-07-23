# UAT Master 3.4 LTS Stable Candidate

## Cashier
- [ ] Staff sees Logout.
- [ ] Cashier Employee Code/PIN opens a shift.
- [ ] Invalid PIN is rejected.
- [ ] Opening float is saved.
- [ ] Cash payment shows Received and real-time Change.
- [ ] Insufficient received amount disables checkout.
- [ ] QR/Transfer/Card set change to zero.
- [ ] Product Add button is at the end of the product row.
- [ ] Hold Bill and Restore Bill work on the same device.
- [ ] Cash sale completes and receipt opens.
- [ ] Close Shift shows expected cash and difference.
- [ ] Cash drawer bridge failure does not cancel the sale.

## Products
- [ ] Owner/Admin can open products-admin.html.
- [ ] Product save no longer checks the incorrect `products.manage`.
- [ ] Created/updated actor comes from the authenticated session/RPC.

## Users
- [ ] Role save no longer fails on app_role enum.
- [ ] Employee Code and PIN can be saved.
- [ ] Text does not overlap on desktop or mobile.

## Regression
- [ ] VOID restores stock once.
- [ ] Return works.
- [ ] Stock adjustment logs STOCK_ADJUST.
- [ ] Custom-date report works.
- [ ] Transfer and Issue multi-item pages work.
- [ ] Console has no red JavaScript/import errors.
