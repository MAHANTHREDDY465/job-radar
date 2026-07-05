@echo off
title JOB RADAR - Telegram notification setup
cd /d "%~dp0"
set "NODE_EXE="
for /d %%D in ("%USERPROFILE%\node-dl\node-v*-win-x64") do set "NODE_EXE=%%D\node.exe"
if not defined NODE_EXE set "NODE_EXE=node"
echo.
echo  ONE-TIME TELEGRAM SETUP
echo  1. In Telegram, open @BotFather  -^>  /newbot  -^>  pick any name.
echo  2. BotFather replies with a token like  123456789:AAxxxxxxxx
echo  3. Paste that token below and press Enter.
echo.
set /p TGTOKEN="Bot token: "
"%NODE_EXE%" tools\telegram-setup.js %TGTOKEN%
pause

