@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0PREVIEW_FACILITIES.ps1"
if errorlevel 1 pause
