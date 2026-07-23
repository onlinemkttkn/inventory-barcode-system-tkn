# Install Master 3.4.2 RC2 Update

1. Back up the current repository or record the current commit hash.
2. Upload every file from `TKN_POS_ERP_MASTER_3_4_LTS_RC2_UPDATE_ONLY.zip`
   to the repository root.
3. Choose overwrite/replace for files with matching names.
4. Commit:

```text
Deploy Master 3.4.2 LTS RC2 cashier and receipt fixes
```

5. Do not rerun SQL if these already succeeded:
   - `sql/UPGRADE-MASTER-3.4-LTS.sql`
   - `sql/UPGRADE-MASTER-3.4-LTS-CASHIER.sql`
6. Wait for deployment, then use `Ctrl + Shift + R`.
7. Test in Private/Incognito mode.

## Required UAT

- Cash popup opens with received amount 0.
- Typing less than the net total keeps Confirm disabled.
- Every quick-cash button fills the correct amount.
- “Exact” fills the bill net total.
- After sale, the success popup stays open until cashier confirmation.
- Receipt loads and Print is enabled even when QR CDN is blocked.
- Return success goes back to bill search without logging out.
