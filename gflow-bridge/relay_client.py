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


def _url(base: str, path: str) -> str:
    return base.rstrip("/") + path


def _req(url: str, token: str, payload: dict[str, Any] | None = None, timeout: int = 40) -> dict[str, Any]:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="GET" if payload is None else "POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as res:
        raw = res.read().decode("utf-8")
    return json.loads(raw) if raw else {}


def poll_once(studio_url: str, token: str, wait_sec: int = 20) -> dict[str, Any] | None:
    payload = _req(
        _url(studio_url, "/api/v1/gflow/bridge/poll"),
        token,
        {"waitSec": wait_sec},
        timeout=wait_sec + 15,
    )
    job = payload.get("job")
    return job if isinstance(job, dict) else None


def post_result(studio_url: str, token: str, job_id: str, result: dict[str, Any]) -> None:
    body = {"id": job_id, **result}
    _req(_url(studio_url, "/api/v1/gflow/bridge/result"), token, body, timeout=120)


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
    while not should_stop():
        try:
            job = poll_once(studio_url, token, 20)
        except urllib.error.HTTPError as err:
            if should_stop():
                return
            body = err.read().decode("utf-8", errors="replace")[:180]
            log(f"Remoto HTTP {err.code}: {body}")
            time.sleep(3)
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
