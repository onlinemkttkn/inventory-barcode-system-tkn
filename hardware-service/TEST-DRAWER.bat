@echo off
powershell.exe -NoProfile -Command "try { Invoke-RestMethod -Method Post http://127.0.0.1:17890/drawer | ConvertTo-Json } catch { Write-Host $_.Exception.Message -ForegroundColor Red }"
pause
