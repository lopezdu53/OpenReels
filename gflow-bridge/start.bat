@echo off
setlocal
cd /d "%~dp0"

if "%GFLOW_BRIDGE_TOKEN%"=="" (
  echo Abre OpenReelsPuente.vbs (app grafica). Para consola:
  echo   set GFLOW_BRIDGE_TOKEN=un-secreto-largo
  echo   set GFLOW_BRIDGE_ALLOW_IPS=192.168.1.71
  echo   start.bat
  exit /b 1
)

if "%GFLOW_BRIDGE_HOST%"=="" set GFLOW_BRIDGE_HOST=0.0.0.0
if "%GFLOW_BRIDGE_PORT%"=="" set GFLOW_BRIDGE_PORT=8787

echo Puente gflow en %GFLOW_BRIDGE_HOST%:%GFLOW_BRIDGE_PORT%
echo Firewall: permite TCP %GFLOW_BRIDGE_PORT% solo desde la IP del Xeon.
python server.py
