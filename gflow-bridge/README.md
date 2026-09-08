# Puente gflow (Windows → Xeon)

Corre **en la PC Windows** con Chrome. El pipeline de EasyPanel (Xeon) llama aquí por la LAN. No abras este puerto a internet.

## Una vez

1. Instala [gflow-cli](https://github.com/lopezdu53/gflow-cli) y Chrome.
2. `gflow auth login --browser chrome`
3. Si Google te pasó a `flow.google.com`:
   - **Imagen t2i no funciona** (`FlowHostMigratedError`). En Nuevo Flow usa Atlas o VIVI para las fotos.
   - I2V sí: crea un proyecto en https://flow.google.com (o `gflow project create --name OpenReels`) y `gflow project list`.
   - En **PowerShell** (no `set` ni `%USERPROFILE%`):
     ```powershell
     $env:GFLOW_BRIDGE_TOKEN = "el-mismo-secreto"
     $env:GFLOW_BRIDGE_ALLOW_IPS = "192.168.1.71"
     $env:GFLOW_CLI_PROJECT = "el-id-de-project-list"
     cd "$env:USERPROFILE\OpenReels\gflow-bridge"
     uv run --no-project python server.py
     ```
   - El id de un *incident* de error **no** es un project id.

## Cada vez que produzcas

En PowerShell (ajusta la IP del Xeon):

```bat
set GFLOW_BRIDGE_TOKEN=el-mismo-secreto-que-en-easypanel
set GFLOW_BRIDGE_ALLOW_IPS=192.168.1.71
set GFLOW_CLI_PROJECT=id-del-proyecto
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
