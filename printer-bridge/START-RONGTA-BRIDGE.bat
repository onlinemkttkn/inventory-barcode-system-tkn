@echo off
setlocal
cd /d "%~dp0"

title TKN Rongta Cash Drawer Bridge

echo Starting TKN Rongta Bridge...
echo Printer: RONGTA 80mm Series Printer
echo.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass ^
  -File "%~dp0start-rongta-bridge.ps1" ^
  -PrinterName "RONGTA 80mm Series Printer" ^
  -Port 17890

echo.
echo Bridge stopped or failed to start.
pause
