# Puente gflow (Windows → Xeon o estudio)

App de **un clic** en Windows. El worker de EasyPanel llama aquí: en casa por LAN, fuera de casa por un túnel inverso (el PC Windows **sale** a internet, no hay que abrir puertos).

## Instalar (sin PowerShell)

1. Instala [Google Chrome](https://www.google.com/chrome/). El exe instala **uv + gflow-cli + colorama + Chromium** (botón **Instalar todo**). La línea de estado muestra versiones y si hay actualización.
2. En la app: mira la línea de versión. Elige el **perfil de Chrome** del Gmail Gemini y la **sesión gflow** (keepupwalking7, no la última que se usó). **Entrar a Flow** abre **otro** Chrome (el de esa sesión) y **se queda abierto**. Entra con el Gmail Gemini; cuando veas Flow, cierra **tú** esa ventana y pulsa una tecla. Agent OFF.
3. Copia la carpeta `gflow-bridge` a este PC (o baja el `.exe` del Action *Windows bridge exe*).
4. Doble clic en **`OpenReelsPuente.vbs`** (o `OpenReelsPuente.exe`). La ventana es horizontal: a la izquierda Conexión / Flow / Sistema; a la derecha el registro. **Ayuda → Acerca de** muestra la versión.
5. En **Conexión**:
   - **En casa** — IP del Xeon (`192.168.1.71`) y **Firewall Xeon**.
   - **Fuera de casa** — URL del estudio (`https://contenido.alfonsolopezd.com`) y el mismo token.
   - **Ambos** — LAN + remoto (recomendado si EasyPanel está en la nube y a veces estás en casa).
6. Pega el **token** (el mismo `GFLOW_BRIDGE_TOKEN` que en EasyPanel).
7. Pon un **nombre de este PC** (ej. Sala, Oficina). En el estudio eliges qué puente genera.
7. Pestaña **Flow**: project id de `gflow project list` y **Conectar**.
8. Chrome: proyecto Flow abierto, chip **Agent en OFF**.

## Motor: Extensión Flow (sin Playwright)

Si Flow marca **actividad inusual** en el Chrome de gflow, usa tu Chrome de cada día:

1. Pestaña **Flow** → motor **Extensión Flow**.
2. `chrome://extensions` → Modo desarrollador → **Cargar descomprimida** → carpeta `gflow-bridge/ext-flow`.
3. Abre [flow.google.com](https://flow.google.com) con el Gmail Gemini. Agent OFF. Deja la pestaña abierta.
4. **Conectar** el puente. OpenReels sigue llamando `/v1/image` y `/v1/video` (LAN o remoto); la extensión hace poll a `http://127.0.0.1:8787/v1/ext/poll` y publica el PNG/mp4 en `/v1/ext/result`.

Si el popup dice **Failed to fetch** / poll nunca: el Puente no está escuchando o Chrome ignoró el permiso. En el Puente pulsa **Conectar** (log: `escuchando 0.0.0.0:8787`). Recarga la extensión. El `manifest` pide `http://127.0.0.1:8787/*` (el puerto tiene que ir escrito; `127.0.0.1:*` Chrome no lo aplica).

**Sistema → Evitar suspensión y cierre de sesión** (activado por defecto) pide a Windows que no duerma, no apague la pantalla ni bloquee la sesión mientras el puente está abierto. Hace falta para los clips de 8s de Flow. **Inicio con Windows** deja el puente al encender el PC.

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

gflow Imagen (0.73+) + Veo I2V en serie. El puente pulsa **Add to prompt**, nombra stills `or-i2v-*.png`, y **espera el mp4**. gflow 0.79 cierra Chrome al fallar el ACK (~24–26%) y Flow **cancela** el clip. El Puente lanza gflow con Python, espera el ACK 60 min y **no deja que Playwright cierre Chrome** mientras el clip sigue en cola (`keep_chrome=1`). Status **4 antes de generar** = cola LP; **4 después de status 2** = Flow falló el audio: busca el mp4 en Chrome y no espera 60+20 min. En el log: `status 4 = en cola solo ANTES de generar`. Si este Gmail **no tiene Lower Priority** en el menú de Flow (`is not offered`), el puente **reintenta al momento con Veo 3.1 Lite** y no espera el catálogo (no se envió el clip). En Veo **no pases `--duration`**. En Omni 1.1 Flash el puente manda **`--duration 10`** (máximo); si Flow no tiene fila, reintenta sin el flag. Si Flow cambia el RPC de stills (`ogiZ0b`), el puente reintenta y busca la imagen en Chrome. Si Flow muestra **actividad inusual** (toast con flecha curva / `refresh`), no se cobró: el puente lee `PUBLIC_ERROR_UNUSUAL_ACTIVITY` (gflow develop #909), **pulsa esa flecha** (el mismo reload que a mano cumple el job) y espera el still o el mp4. Si el reload no devuelve media, **bloquea nuevos jobs ~30 min**. El CLI es demasiado rápido (modelo+prompt+Generate en ~2s); el puente espera 8s antes de Generate y ~50s entre jobs. Cuentas migradas a **flow.google.com** no aceptan Imagen 4 (`image4` / Nano Lite) ni labs.google: el puente manda Nano Banana 2 y `GFLOW_CLI_FLOW_HOST=auto`.

Si no estás en casa y el puente está apagado, el job cae a fotos (Ken Burns) en vez de colgar 15 veces el I2V.

## Avanzado (CMD)

`start.bat` sigue existiendo si prefieres consola. La GUI no la necesita.
