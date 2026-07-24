@echo off
setlocal EnableExtensions
cd /d "%~dp0"
net session >nul 2>&1
if not "%errorlevel%"=="0" (
  echo Run this file as Administrator.
  pause
  exit /b 1
)
set "CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist "%CSC%" set "CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
if not exist "%CSC%" (
  echo Windows C# compiler was not found.
  pause
  exit /b 2
)
mkdir "C:\Program Files\TKN Hardware Service" 2>nul
"%CSC%" /nologo /target:exe /out:"TKNHardwareService.exe" /reference:System.ServiceProcess.dll Program.cs
if errorlevel 1 (echo Build failed.& pause & exit /b 3)
copy /y "TKNHardwareService.exe" "C:\Program Files\TKN Hardware Service\" >nul
copy /y "config.json" "C:\Program Files\TKN Hardware Service\" >nul
sc.exe stop TKNHardwareService >nul 2>&1
sc.exe delete TKNHardwareService >nul 2>&1
timeout /t 2 /nobreak >nul
sc.exe create TKNHardwareService binPath= "\"C:\Program Files\TKN Hardware Service\TKNHardwareService.exe\"" start= auto DisplayName= "TKN POS Hardware Service"
sc.exe description TKNHardwareService "Rongta printer and cash drawer bridge for TKN POS ERP"
sc.exe failure TKNHardwareService reset= 86400 actions= restart/5000/restart/10000/restart/30000
sc.exe start TKNHardwareService
powershell.exe -NoProfile -Command "Start-Sleep -Seconds 2; try { Invoke-RestMethod http://127.0.0.1:17890/health | ConvertTo-Json } catch { Write-Host $_.Exception.Message -ForegroundColor Red }"
echo.
echo Installation complete.
pause
