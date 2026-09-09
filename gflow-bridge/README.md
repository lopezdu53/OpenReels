# Puente gflow (Windows → Xeon o estudio)

App de **un clic** en Windows. El worker de EasyPanel llama aquí: en casa por LAN, fuera de casa por un túnel inverso (el PC Windows **sale** a internet, no hay que abrir puertos).

## Instalar (sin PowerShell)

1. Instala [Google Chrome](https://www.google.com/chrome/). El exe instala solo **uv + gflow-cli + Chromium** (botón **Instalar todo**; también lo hace al Conectar si falta).
2. En la app: mira la línea de versión. Elige el **perfil de Chrome** del Gmail Gemini → **Entrar a Flow** (deja abierta la ventana negra; entra en el Chrome de gflow; cierra Flow; una tecla). El recuadro **Perfil gflow** se rellena con tu Gmail. Agent OFF.
3. Copia la carpeta `gflow-bridge` a este PC (o baja el `.exe` del Action *Windows bridge exe*).
4. Doble clic en **`OpenReelsPuente.vbs`** (o `OpenReelsPuente.exe`).
5. En la ventana:
   - **En casa** — IP del Xeon (`192.168.1.71`) y **Firewall Xeon**.
   - **Fuera de casa** — URL del estudio (`https://contenido.alfonsolopezd.com`) y el mismo token.
   - **Ambos** — LAN + remoto (recomendado si EasyPanel está en la nube y a veces estás en casa).
6. Pega el **token** (el mismo `GFLOW_BRIDGE_TOKEN` que en EasyPanel).
7. Project id de `gflow project list` y **Conectar**.
8. Chrome: proyecto Flow abierto, chip **Agent en OFF**.

**Inicio con Windows** deja el puente al encender el PC. Energía: que no se suspenda.

Tras cada merge, vuelve a bajar `server.py` (y `app.py` si usas la carpeta, no el exe):

```
https://raw.githubusercontent.com/lopezdu53/OpenReels/cursor/grok-providers-fixes-6f6a/gflow-bridge/server.py
```

(o el branch que esté desplegado en EasyPanel).

## EasyPanel (`video` + `video-worker`)

```
GFLOW_BRIDGE_URL=http://192.168.1.9:8787
GFLOW_BRIDGE_TOKEN=el-mismo-secreto-que-en-el-windows
```

Con el token, el worker usa LAN si responde; si el Windows no está en casa, espera al **modo Remoto** de la app. Para apagar el remoto: `GFLOW_BRIDGE_RELAY=0`.

Desde la oficina elige **Fuera de casa**. Chrome + Flow van **en ese PC**. Cloudflare (Error 1010) bloqueaba el cliente Python; la app ya manda User-Agent de Chrome. Si ves 404, el estudio aún no tiene el relay: merge + Implementar `video` y `video-worker`.

## I2V (Nuevo Flow)

VIVI stills + Veo I2V en serie. El puente pulsa **Add to prompt**, nombra stills `or-i2v-*.png`, y no recupera clips del Lab. En Veo no pases `--duration`.

Si no estás en casa y el puente está apagado, el job cae a fotos (Ken Burns) en vez de colgar 15 veces el I2V.

## Avanzado (CMD)

`start.bat` sigue existiendo si prefieres consola. La GUI no la necesita.
