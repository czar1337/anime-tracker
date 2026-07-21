@echo off
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel%==0 (
  set NODE_BIN=node
) else if exist "%ProgramFiles%\nodejs\node.exe" (
  set "NODE_BIN=%ProgramFiles%\nodejs\node.exe"
) else (
  echo Node.js was not found on this computer.
  echo Install it from https://nodejs.org and run this file again.
  pause
  exit /b 1
)

start "Anime Tracker Server" "%NODE_BIN%" server.js
timeout /t 1 /nobreak >nul
start "" http://localhost:4321
