@echo off
cd /d "%~dp0"
node watch.mjs
if errorlevel 1 pause
