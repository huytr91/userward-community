@echo off
setlocal
title Userward Local
echo Userward Local - build 2026.08.15.2
echo Opens http://127.0.0.1:3001 (port 3000 reserved for AI agent RPA tools)
echo Keep this window open. Closing it stops Userward.
echo.
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-userward.ps1"
if errorlevel 1 pause
