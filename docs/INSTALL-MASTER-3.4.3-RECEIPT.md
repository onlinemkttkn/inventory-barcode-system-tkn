# Install Master 3.4.3 RC — Receipt Header Update

## Upload

Upload every file from the update ZIP to the repository root and overwrite
matching files.

Commit:

```text
Deploy Master 3.4.3 receipt header update
```

No SQL is required.

After GitHub Pages deploys, press:

```text
Ctrl + Shift + R
```

## Test

1. Open `receipt.html?sale_no=<เลขบิลจริง>`.
2. Confirm company name, address and tax ID.
3. Confirm branch, cashier, payment method and bill number.
4. Test 58 mm, 80 mm and A4.
5. Block the QR CDN in DevTools and confirm the receipt still prints.
