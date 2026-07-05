@echo off
title JOB RADAR - Regulatory Analyst job discovery
cd /d "%~dp0"

REM --- locate the portable Node ---
set "NODE_EXE="
for /d %%D in ("%USERPROFILE%\node-dl\node-v*-win-x64") do set "NODE_EXE=%%D\node.exe"
if not defined NODE_EXE (
  where node >nul 2>nul && set "NODE_EXE=node"
)
if not defined NODE_EXE (
  echo Could not find Node.js. Expected it in %USERPROFILE%\node-dl
  pause
  exit /b 1
)

echo.
echo  Starting JOB RADAR...
echo  Node: %NODE_EXE%
echo.

REM --- open the browser shortly after the server boots ---
start "" /b cmd /c "timeout /t 2 >nul & start http://localhost:8090"

"%NODE_EXE%" server.js
pause

