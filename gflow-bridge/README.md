# Puente gflow (Windows → Xeon)

Corre **en la PC Windows** con Chrome. El pipeline de EasyPanel (Xeon) llama aquí por la LAN. No abras este puerto a internet.

## Una vez

1. Instala [gflow-cli](https://github.com/lopezdu53/gflow-cli) y Chrome.
2. `gflow auth login --browser chrome`
3. Si Google te pasó a `flow.google.com` (Chrome abre Flow y gflow dice *handed this session*):
   - En Chrome entra a https://flow.google.com y crea un proyecto (o genera una imagen a mano).
   - En CMD: `gflow project create OpenReels` y luego `gflow project list`.
   - Pon el id en `GFLOW_CLI_PROJECT` antes de `start.bat`.
   - Prueba **una** imagen: `gflow image t2i "un coliseo romano" --model nano2 --json`
   - Imagen (t2i) a veces sigue en el driver viejo de `labs.google`. Video I2V sí está portado. Si t2i falla con *not ported*, las fotos no salen con esta cuenta hasta que gflow-cli lo porte; el I2V sí puede usarse si las stills vienen de otro proveedor.

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
