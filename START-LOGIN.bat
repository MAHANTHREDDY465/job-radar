@echo off
title JOB RADAR - one-time company login
cd /d "%~dp0"
set "NODE_EXE="
for /d %%D in ("%USERPROFILE%\node-dl\node-v*-win-x64") do set "NODE_EXE=%%D\node.exe"
if not defined NODE_EXE set "NODE_EXE=node"
echo.
echo  ONE-TIME LOGIN per company.
echo  Paste a job URL for the company you want to sign into
echo  (e.g. the Ecolab Pune role from the dashboard), then press Enter.
echo  A browser opens - sign in / create the account + verify email.
echo  The session is saved and reused automatically every morning.
echo.
set /p JOBURL="Job URL: "
"%NODE_EXE%" lib\apply.js --login "%JOBURL%"
echo.
echo  Done. You can close this window.
pause

