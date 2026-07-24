@echo off
net session >nul 2>&1
if not "%errorlevel%"=="0" (echo Run as Administrator.& pause & exit /b 1)
sc.exe stop TKNHardwareService
sc.exe delete TKNHardwareService
timeout /t 2 /nobreak >nul
rmdir /s /q "C:\Program Files\TKN Hardware Service"
echo Uninstalled.
pause
