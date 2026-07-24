@echo off
powershell.exe -NoProfile -Command "try { Invoke-RestMethod http://127.0.0.1:17890/health | ConvertTo-Json } catch { Write-Host $_.Exception.Message -ForegroundColor Red }"
pause
