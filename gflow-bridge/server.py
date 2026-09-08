#!/usr/bin/env python3
"""LAN bridge: Xeon OpenReels worker → this Windows box → gflow-cli + Chrome.

Stdlib only. One Chrome profile, so image/I2V run one at a time.
"""

from __future__ import annotations

import base64
import json
import os
import shutil
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

HOST = os.environ.get("GFLOW_BRIDGE_HOST", "0.0.0.0")
PORT = int(os.environ.get("GFLOW_BRIDGE_PORT", "8787"))
TOKEN = (os.environ.get("GFLOW_BRIDGE_TOKEN") or "").strip()
ALLOW_ANON = os.environ.get("GFLOW_BRIDGE_ALLOW_ANON", "") == "1"
ALLOW_IPS = {
    ip.strip()
    for ip in os.environ.get("GFLOW_BRIDGE_ALLOW_IPS", "").split(",")
    if ip.strip()
}
GFLOW_BIN = os.environ.get("GFLOW_CLI_BIN") or shutil.which("gflow") or "gflow"
PROFILE = os.environ.get("GFLOW_CLI_PROFILE") or ""
PROJECT = os.environ.get("GFLOW_CLI_PROJECT") or ""
IMAGE_TIMEOUT = int(os.environ.get("GFLOW_BRIDGE_IMAGE_TIMEOUT", "240"))
VIDEO_TIMEOUT = int(os.environ.get("GFLOW_BRIDGE_VIDEO_TIMEOUT", "480"))
QUEUE_WAIT = int(os.environ.get("GFLOW_BRIDGE_QUEUE_WAIT", "1200"))
MAX_BODY = int(os.environ.get("GFLOW_BRIDGE_MAX_BODY", str(48 * 1024 * 1024)))

LOCK = threading.Lock()


def _decode_b64(raw: str | None) -> bytes | None:
    if not raw:
        return None
    data = raw.split(",", 1)[-1].strip()
    buf = base64.b64decode(data)
    return buf if buf else None


def _parse_gflow_json(stdout: str) -> dict[str, Any]:
    start = stdout.find("{")
    end = stdout.rfind("}")
    if start < 0 or end <= start:
        raise RuntimeError(f"gflow no devolvió JSON: {stdout[:240] or '(vacío)'}")
    return json.loads(stdout[start : end + 1])


def _run_gflow(args: list[str], timeout: int) -> dict[str, Any]:
    cmd = [GFLOW_BIN, *args, "--json"]
    if PROFILE and "--profile" not in args:
        cmd.extend(["--profile", PROFILE])
    if PROJECT and "--project" not in args:
        cmd.extend(["--project", PROJECT])
    env = os.environ.copy()
    env["GFLOW_CLI_LOG_FORMAT"] = "json"
    proc = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
        env=env,
        check=False,
    )
    payload: dict[str, Any] | None = None
    try:
        payload = _parse_gflow_json(proc.stdout or "")
    except Exception:
        payload = None
    if payload and payload.get("status") == "fail":
        err = payload.get("error") or {}
        raise RuntimeError(str(err.get("detail") or err.get("title") or "gflow falló"))
    if proc.returncode != 0:
        err = (payload or {}).get("error") if payload else None
        detail = ""
        if isinstance(err, dict):
            detail = str(err.get("detail") or "")
        raise RuntimeError(detail or (proc.stderr or proc.stdout or f"gflow exit {proc.returncode}")[:400])
    if not payload:
        raise RuntimeError(f"gflow no devolvió JSON: {(proc.stdout or '')[:240]}")
    return payload


def generate_image(body: dict[str, Any]) -> dict[str, Any]:
    prompt = str(body.get("prompt") or "").strip()
    if len(prompt) < 2:
        raise ValueError("prompt requerido")
    style = str(body.get("style") or "").strip()
    full = f"{prompt}. Style: {style}" if style else prompt
    model = str(body.get("model") or "nano2")
    aspect = str(body.get("aspect") or "16:9")
    if aspect not in {"9:16", "16:9", "1:1", "4:3", "3:4"}:
        aspect = "16:9"
    ref = _decode_b64(body.get("referencePng") if isinstance(body.get("referencePng"), str) else None)
    work = Path(tempfile.mkdtemp(prefix="gflow-bridge-img-"))
    dest = work / "out.png"
    ref_path = None
    try:
        args = ["image"]
        if ref and len(ref) > 80:
            ref_path = work / "ref.png"
            ref_path.write_bytes(ref)
            args += ["i2i", full, "--ref", str(ref_path)]
        else:
            args += ["t2i", full]
        args += ["--model", model, "--aspect", aspect, "-o", str(dest)]
        payload = _run_gflow(args, IMAGE_TIMEOUT)
        local = dest if dest.exists() else None
        if local is None:
            images = payload.get("images")
            if isinstance(images, list) and images and isinstance(images[0], dict):
                p = images[0].get("local_path")
                if p:
                    local = Path(str(p))
        if local is None or not local.exists():
            raise RuntimeError("gflow image no escribió el PNG")
        data = local.read_bytes()
        if len(data) < 1000:
            raise RuntimeError(f"gflow image too small ({len(data)} bytes)")
        return {"ok": True, "kind": "image", "png": base64.b64encode(data).decode("ascii"), "bytes": len(data)}
    finally:
        shutil.rmtree(work, ignore_errors=True)


def generate_video(body: dict[str, Any]) -> dict[str, Any]:
    prompt = str(body.get("prompt") or "").strip()
    if len(prompt) < 2:
        raise ValueError("prompt requerido")
    still = _decode_b64(body.get("imagePng") if isinstance(body.get("imagePng"), str) else None)
    if not still or len(still) < 80:
        raise ValueError("imagePng requerido (still PNG en base64)")
    model = str(body.get("model") or "veo-lite")
    aspect = "9:16" if body.get("aspect") == "9:16" else "16:9"
    try:
        duration = int(body.get("durationSeconds") or 6)
    except (TypeError, ValueError):
        duration = 6
    duration = max(4, min(duration, 10))
    work = Path(tempfile.mkdtemp(prefix="gflow-bridge-vid-"))
    still_path = work / "still.png"
    dest = work / "out.mp4"
    still_path.write_bytes(still)
    try:
        payload = _run_gflow(
            [
                "video",
                "i2v",
                "--initial-frame",
                str(still_path),
                prompt,
                "--model",
                model,
                "--duration",
                str(duration),
                "--aspect",
                aspect,
                "-o",
                str(dest),
            ],
            VIDEO_TIMEOUT,
        )
        local = dest if dest.exists() and dest.stat().st_size > 1000 else None
        if local is None and isinstance(payload.get("local_path"), str):
            p = Path(str(payload["local_path"]))
            if p.exists():
                local = p
        if local is None:
            raise RuntimeError("gflow video no escribió el mp4")
        data = local.read_bytes()
        if len(data) < 20_000:
            raise RuntimeError(f"gflow video too small ({len(data)} bytes)")
        return {
            "ok": True,
            "kind": "video",
            "mp4": base64.b64encode(data).decode("ascii"),
            "bytes": len(data),
            "durationSeconds": duration,
        }
    finally:
        shutil.rmtree(work, ignore_errors=True)


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[gflow-bridge] {self.address_string()} {fmt % args}", flush=True)

    def _client_ip(self) -> str:
        return (self.client_address[0] or "").split("%")[0]

    def _forbidden(self, msg: str, code: int = 403) -> None:
        self._json(code, {"ok": False, "error": msg})

    def _json(self, code: int, payload: dict[str, Any]) -> None:
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _auth(self) -> bool:
        ip = self._client_ip()
        if ALLOW_IPS and ip not in ALLOW_IPS and ip not in {"127.0.0.1", "::1"}:
            self._forbidden(f"IP no permitida: {ip}")
            return False
        if not TOKEN:
            if ALLOW_ANON:
                return True
            self._forbidden("Falta GFLOW_BRIDGE_TOKEN en el Windows")
            return False
        header = self.headers.get("Authorization") or ""
        got = header[7:].strip() if header.lower().startswith("bearer ") else ""
        if got != TOKEN:
            self._forbidden("Token inválido", 401)
            return False
        return True

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path in {"/health", "/v1/health"}:
            if not self._auth():
                return
            self._json(
                200,
                {
                    "ok": True,
                    "gflow": GFLOW_BIN,
                    "project": bool(PROJECT),
                    "profile": bool(PROFILE),
                    "busy": LOCK.locked(),
                    "ts": int(time.time()),
                },
            )
            return
        self._json(404, {"ok": False, "error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path not in {"/v1/image", "/v1/video"}:
            self._json(404, {"ok": False, "error": "not found"})
            return
        if not self._auth():
            return
        length = int(self.headers.get("Content-Length") or "0")
        if length <= 0 or length > MAX_BODY:
            self._json(413, {"ok": False, "error": f"body inválido o > {MAX_BODY} bytes"})
            return
        try:
            body = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            self._json(400, {"ok": False, "error": "JSON inválido"})
            return
        if not isinstance(body, dict):
            self._json(400, {"ok": False, "error": "JSON inválido"})
            return
        if not LOCK.acquire(timeout=max(30, QUEUE_WAIT)):
            self._json(429, {"ok": False, "error": "gflow ocupado (un Chrome, una generación a la vez)"})
            return
        try:
            result = generate_image(body) if path == "/v1/image" else generate_video(body)
            self._json(200, result)
        except ValueError as err:
            self._json(400, {"ok": False, "error": str(err)})
        except subprocess.TimeoutExpired:
            self._json(504, {"ok": False, "error": "gflow timeout"})
        except Exception as err:
            self._json(500, {"ok": False, "error": str(err)[:500]})
        finally:
            LOCK.release()


def main() -> None:
    if not TOKEN and not ALLOW_ANON:
        raise SystemExit("Define GFLOW_BRIDGE_TOKEN (el mismo valor que en el Xeon) o GFLOW_BRIDGE_ALLOW_ANON=1")
    print(
        f"[gflow-bridge] {HOST}:{PORT} bin={GFLOW_BIN} token={'yes' if TOKEN else 'anon'} allow={','.join(sorted(ALLOW_IPS)) or '*'}",
        flush=True,
    )
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("[gflow-bridge] stop", flush=True)
        httpd.server_close()


if __name__ == "__main__":
    main()
