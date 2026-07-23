# Master 3.4.2 LTS RC2 Update

## Critical fixes

- Cash received amount starts at 0.
- Cashier must enter or select received amount in the payment popup.
- Fixed quick-cash buttons: 20, 50, 100, 200, 300, 400, 500, 1000 and Exact.
- Insufficient or zero cash disables payment confirmation.
- Cart, quantity, price, discount, branch or payment changes reset cash to 0.
- Receipt no longer stays on “loading” when the QR library is unavailable.
- Receipt remains printable with a clear QR fallback.
- Return success stays inside the application and returns to the canonical bill-search page.
- Reports payment-channel separation and responsive Users UI remain included.

## Files to upload

Upload the contents of the update-only ZIP to the repository root and overwrite
files with the same names. The patch contains fewer than 100 files.

## SQL

No additional SQL is required for this RC2 patch if the two Master 3.4 SQL files
have already completed successfully.
