# TKN Hardware Service v1

Windows Service for Rongta 80mm USB printer and cash drawer.

## Install
1. Confirm the Windows printer name is `RONGTA 80mm Series Printer`.
2. Right-click `INSTALL-SERVICE.bat` and choose Run as administrator.
3. Open `http://127.0.0.1:17890/health`.
4. Run `TEST-DRAWER.bat`.

The service starts automatically with Windows and restarts after failures.
PowerShell fallback is included separately.
