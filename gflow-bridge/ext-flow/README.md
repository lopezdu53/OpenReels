# OpenReels Flow (extensión Chrome)

El Puente encola stills e I2V. Esta extensión, en **tu Chrome de cada día** (sesión Gemini ya abierta), los genera en `flow.google.com` y los devuelve a `http://127.0.0.1:8787`.

No usa Playwright: Flow ve clics en la pestaña real.

## Instalar

1. Chrome → `chrome://extensions` → **Modo de desarrollador**.
2. **Cargar descomprimida** → carpeta `gflow-bridge/ext-flow` (la misma que viene con el Puente).
3. Abre [flow.google.com](https://flow.google.com) con el Gmail Gemini. **Agent OFF**.
4. En OpenReels Puente → pestaña Flow → motor **Extensión Flow** → **Conectar**.

El icono de la extensión muestra `ok` cuando está pollando el puente, `GO` mientras genera.

Inspirado en [Shivanshu85/Google-Flow-Automation](https://github.com/Shivanshu85/Google-Flow-Automation) (MIT), reescrito para `flow.google.com` y el contrato del Puente.

Si el popup dice **Failed to fetch**, Chrome no ve el puerto 8787: el Puente no está en **Conectar**, o hay que **Recargar** la extensión tras actualizar `ext-flow`. El permiso tiene que ser `http://127.0.0.1:8787/*` (puerto concreto; `:*` Chrome lo ignora).
