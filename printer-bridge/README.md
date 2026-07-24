# Rongta Bridge Hotfix

This replaces the previous PowerShell bridge that failed because Windows
PowerShell decoded Thai UTF-8 text incorrectly.

## Install

1. Copy the entire `printer-bridge` folder over the existing folder.
2. Confirm the Windows printer name is exactly:

   `RONGTA 80mm Series Printer`

3. Right-click `START-RONGTA-BRIDGE.bat`.
4. Select **Run as administrator**.
5. Keep the black window open.
6. Open:

   `http://127.0.0.1:17890/health`

Expected result:

```json
{"ok":true,"service":"tkn-rongta-bridge", ...}
```

## Test the drawer

Run `TEST-DRAWER.bat`.

The drawer must be connected to the printer's cash-drawer port. If it does not
open, check the cable, drawer pin setting, and Rongta driver/device settings.

## Notes

- The script is ASCII-only to work reliably with Windows PowerShell 5.1.
- It supports CORS and Chrome Private Network preflight requests.
- A drawer failure must not cancel an already-saved POS sale.
