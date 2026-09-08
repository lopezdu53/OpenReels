# Puente gflow (Windows → Xeon)

Corre **en la PC Windows** con Chrome. El pipeline de EasyPanel (Xeon) llama aquí por la LAN. No abras este puerto a internet.

## Una vez

1. Instala [gflow-cli](https://github.com/lopezdu53/gflow-cli) y Chrome.
2. `gflow auth login --browser chrome`
3. Si Flow ya está en `flow.google.com`: anota un project id (`gflow project list`) y pon `GFLOW_CLI_PROJECT`.

## Cada vez que produzcas

En PowerShell (ajusta la IP del Xeon):

```bat
set GFLOW_BRIDGE_TOKEN=el-mismo-secreto-que-en-easypanel
set GFLOW_BRIDGE_ALLOW_IPS=192.168.1.10
set GFLOW_CLI_PROJECT=opcional-si-ya-migraste
start.bat
```

Firewall de Windows: regla de entrada TCP **8787** **solo** desde la IP del Xeon.

Energía: que el Windows no se suspenda.

## En EasyPanel (Xeon)

Mismas variables en `video` y `video-worker`, luego **Implementar** ambos:

```
GFLOW_BRIDGE_URL=http://192.168.1.50:8787
GFLOW_BRIDGE_TOKEN=el-mismo-secreto-que-en-el-windows
```

Usa la IP LAN del Windows, no `localhost`.
