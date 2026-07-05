@echo off
REM Unattended morning run (invoked by the Windows scheduled task at 8:30 AM).
cd /d "%~dp0"
set "NODE_EXE="
for /d %%D in ("%USERPROFILE%\node-dl\node-v*-win-x64") do set "NODE_EXE=%%D\node.exe"
if not defined NODE_EXE set "NODE_EXE=node"
if not exist "data\logs" mkdir "data\logs"
"%NODE_EXE%" lib\morning-run.js >> "data\logs\morning.log" 2>&1

