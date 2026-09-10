"""Outbound poller: Windows → estudio (EasyPanel / Xeon). Stdlib only."""

from __future__ import annotations

import json
import ssl
import time
import urllib.error
import urllib.request
from typing import Any, Callable

from server import run_kind

LogFn = Callable[[str], None]

# Cloudflare Browser Integrity Check (Error 1010) blocks Python-urllib/*.
BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)


def _url(base: str, path: str) -> str:
    return base.rstrip("/") + path


def _headers(token: str, studio_url: str) -> dict[str, str]:
    origin = studio_url.rstrip("/")
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "es-MX,es;q=0.9,en;q=0.8",
        "User-Agent": BROWSER_UA,
        "Origin": origin,
        "Referer": origin + "/",
    }


def format_remote_http_error(code: int, body: str) -> str:
    text = body[:240]
    lowered = text.lower()
    if code == 403 and ("1010" in text or "access denied" in lowered or "cloudflare" in lowered):
        return (
            "Cloudflare 1010: bloqueó el cliente (antes parecía Python). "
            "Cierra y abre esta app actualizada. Si sigue, en Cloudflare → Security → "
            "Browser Integrity Check OFF, o una excepción para /api/v1/gflow/bridge/*"
        )
    if code == 404:
        return (
            "El estudio aún no tiene el relay remoto (404). Hay que mergear el PR del puente "
            "e Implementar video + video-worker en EasyPanel."
        )
    if code == 401:
        return "Token inválido. Debe ser el mismo GFLOW_BRIDGE_TOKEN que en EasyPanel (video y worker)."
    if code == 503:
        return "El estudio no tiene GFLOW_BRIDGE_TOKEN. Pónlo en EasyPanel (video + video-worker)."
    return f"Remoto HTTP {code}: {text}"


def _req(url: str, token: str, studio_url: str, payload: dict[str, Any] | None = None, timeout: int = 40) -> dict[str, Any]:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="GET" if payload is None else "POST",
        headers=_headers(token, studio_url),
    )
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as res:
        raw = res.read().decode("utf-8")
    return json.loads(raw) if raw else {}


def poll_once(studio_url: str, token: str, wait_sec: int = 20) -> dict[str, Any] | None:
    payload = _req(
        _url(studio_url, "/api/v1/gflow/bridge/poll"),
        token,
        studio_url,
        {"waitSec": wait_sec},
        timeout=wait_sec + 15,
    )
    job = payload.get("job")
    return job if isinstance(job, dict) else None


def post_result(studio_url: str, token: str, job_id: str, result: dict[str, Any]) -> None:
    body = {"id": job_id, **result}
    _req(_url(studio_url, "/api/v1/gflow/bridge/result"), token, studio_url, body, timeout=120)


def probe_remote(studio_url: str, token: str) -> str:
    data = _req(_url(studio_url, "/api/v1/gflow/bridge/status"), token, studio_url, None, timeout=20)
    queued = data.get("queued", 0)
    return f"Remoto OK. El estudio responde. Cola: {queued}."


def run_poll_loop(
    studio_url: str,
    token: str,
    should_stop: Callable[[], bool],
    log: LogFn,
) -> None:
    studio_url = studio_url.strip()
    token = token.strip()
    if not studio_url or not token:
        log("Remoto: falta URL del estudio o token.")
        return
    log(f"Remoto: conectando a {studio_url} …")
    try:
        log(probe_remote(studio_url, token))
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", errors="replace")
        log(format_remote_http_error(err.code, body))
    except Exception as err:
        log(f"Remoto: {err}")
    while not should_stop():
        try:
            job = poll_once(studio_url, token, 20)
        except urllib.error.HTTPError as err:
            if should_stop():
                return
            body = err.read().decode("utf-8", errors="replace")
            log(format_remote_http_error(err.code, body))
            time.sleep(8 if err.code in {403, 404} else 3)
            continue
        except Exception as err:
            if should_stop():
                return
            log(f"Remoto: {err}")
            time.sleep(3)
            continue
        if should_stop():
            return
        if not job:
            continue
        job_id = str(job.get("id") or "")
        kind = str(job.get("kind") or "")
        body = job.get("body") if isinstance(job.get("body"), dict) else {}
        log(f"Trabajo {kind} {job_id[:8]}…")
        try:
            result = run_kind(kind, body)
            post_result(studio_url, token, job_id, result)
            log(f"Listo {kind} {job_id[:8]}")
        except Exception as err:
            try:
                post_result(studio_url, token, job_id, {"ok": False, "error": str(err)[:500]})
            except Exception:
                pass
            log(f"Error {kind}: {err}")
