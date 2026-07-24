@echo off
cd /d "%~dp0"
if not exist TKNHardwareService.exe (
 set "CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
 if not exist "%CSC%" set "CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
 "%CSC%" /nologo /target:exe /out:"TKNHardwareService.exe" /reference:System.ServiceProcess.dll Program.cs
)
TKNHardwareService.exe --console
pause
