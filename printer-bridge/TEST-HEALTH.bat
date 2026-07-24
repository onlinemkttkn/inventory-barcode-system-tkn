@echo off
setlocal
echo Testing Rongta Bridge health...
powershell.exe -NoLogo -NoProfile -Command ^
  "try { Invoke-RestMethod -Uri 'http://127.0.0.1:17890/health' -TimeoutSec 3 | ConvertTo-Json } catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }"
pause
