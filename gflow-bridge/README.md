# Puente gflow (Windows → Xeon)

Corre **en la PC Windows** con Chrome. El pipeline de EasyPanel (Xeon) llama aquí por la LAN. No abras este puerto a internet.

## Una vez

1. Instala [gflow-cli](https://github.com/ffroliva/gflow-cli) y Chrome.
2. `gflow auth login --browser chrome`
3. Crea un proyecto en https://flow.google.com (o `gflow project create --name OpenReels`) y `gflow project list`.
4. En Chrome, abre ese proyecto y deja el chip **Agent en OFF** (`aria-pressed=false`). Si queda ON, gflow 0.71 no ve el botón Settings.
5. En **PowerShell** (no `set` ni `%USERPROFILE%`):

```powershell
$env:GFLOW_BRIDGE_TOKEN = "el-mismo-secreto"
$env:GFLOW_BRIDGE_ALLOW_IPS = "192.168.1.71"
$env:GFLOW_CLI_PROJECT = "el-id-de-project-list"
$env:GFLOW_CLI_PROJECT_NAME = "OpenReels"
cd "$env:USERPROFILE\OpenReels\gflow-bridge"
uv run --no-project python server.py
```

El id de un *incident* de error **no** es un project id.

Tras cada merge, vuelve a bajar `server.py`:

```powershell
cd "$env:USERPROFILE\OpenReels\gflow-bridge"
irm https://raw.githubusercontent.com/lopezdu53/OpenReels/cursor/grok-providers-fixes-6f6a/gflow-bridge/server.py -OutFile server.py
```

Nuevo Flow usa **VIVI** para fotos y **Veo t2v** para video. I2V local en Flow migrado suele colgar el frame picker (`still.png`); el puente reintenta **t2v**. En Veo **no pases `--duration`** (solo Omni Flash).

## Cada vez que produzcas

En PowerShell (ajusta la IP del Xeon):

```powershell
cd "$env:USERPROFILE\OpenReels\gflow-bridge"
$env:GFLOW_BRIDGE_TOKEN = "el-mismo-secreto-que-en-easypanel"
$env:GFLOW_BRIDGE_ALLOW_IPS = "192.168.1.71"
$env:GFLOW_CLI_PROJECT = "id-del-proyecto"
$env:GFLOW_CLI_PROJECT_NAME = "OpenReels"
uv run --no-project python server.py
```

Firewall de Windows: regla de entrada TCP **8787** **solo** desde la IP del Xeon.

Energía: que el Windows no se suspenda.

## En EasyPanel (Xeon)

Mismas variables en `video` y `video-worker`, luego **Implementar** ambos:

```
GFLOW_BRIDGE_URL=http://192.168.1.9:8787
GFLOW_BRIDGE_TOKEN=el-mismo-secreto-que-en-el-windows
```

Usa la IP LAN del Windows, no `localhost`.
