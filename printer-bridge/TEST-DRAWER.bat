@echo off
setlocal
echo Sending cash drawer test command...
powershell.exe -NoLogo -NoProfile -Command ^
  "try { Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:17890/drawer' -TimeoutSec 5 | ConvertTo-Json } catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }"
pause
