@echo off
rem Double-click to start UX Agent Studio on Windows.
title UX Agent Studio
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   UX Agent Studio needs Node.js, which isn't installed yet.
  echo   The download page is opening: install the LTS version, then double-click this file again.
  start "" "https://nodejs.org/en/download"
  echo.
  pause
  exit /b 1
)

node scripts\launch.mjs
if errorlevel 1 pause
