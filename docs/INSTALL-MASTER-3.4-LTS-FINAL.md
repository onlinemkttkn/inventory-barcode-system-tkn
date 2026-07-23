# Install Master 3.4 LTS Final

1. Backup GitHub repository and Supabase database.
2. Upload all package files to repository root and replace duplicates.
3. Commit: `Deploy TKN POS ERP Master 3.4 LTS Final`.
4. Run SQL in this order:
   - `sql/UPGRADE-MASTER-3.4-LTS.sql`
   - `sql/UPGRADE-MASTER-3.4-LTS-CASHIER.sql`
5. Open `users-admin.html` as Owner/Admin and set Employee Code, PIN, branch and drawer permission.
6. Clear cache with Ctrl+Shift+R or test in Incognito.
7. Execute `docs/UAT-MASTER-3.4-LTS-FINAL.md`.

Cash drawer hardware requires `window.TKN_CASH_DRAWER_BRIDGE_URL`. Without a bridge, sale/receipt still works but the physical drawer cannot be opened by the browser alone.
