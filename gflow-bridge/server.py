#!/usr/bin/env python3
"""LAN bridge: Xeon OpenReels worker → this Windows box → gflow-cli + Chrome.

Stdlib only. One Chrome profile, so image/t2v/I2V run one at a time.
"""

from __future__ import annotations

import base64
import json
import os
import re
import secrets
import shutil
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from profiles import find_gflow, missing_gflow_message

HOST = os.environ.get("GFLOW_BRIDGE_HOST", "0.0.0.0")
PORT = int(os.environ.get("GFLOW_BRIDGE_PORT", "8787"))
TOKEN = (os.environ.get("GFLOW_BRIDGE_TOKEN") or "").strip()
ALLOW_ANON = os.environ.get("GFLOW_BRIDGE_ALLOW_ANON", "") == "1"
ALLOW_IPS = {
    ip.strip()
    for ip in os.environ.get("GFLOW_BRIDGE_ALLOW_IPS", "").split(",")
    if ip.strip()
}
GFLOW_BIN = find_gflow() or os.environ.get("GFLOW_CLI_BIN") or shutil.which("gflow") or "gflow"
PROFILE = os.environ.get("GFLOW_CLI_PROFILE") or ""
PROJECT = os.environ.get("GFLOW_CLI_PROJECT") or ""
PROJECT_NAME = os.environ.get("GFLOW_CLI_PROJECT_NAME") or ("OpenReels" if PROJECT else "")
IMAGE_TIMEOUT = int(os.environ.get("GFLOW_BRIDGE_IMAGE_TIMEOUT", "240"))
VIDEO_TIMEOUT = int(os.environ.get("GFLOW_BRIDGE_VIDEO_TIMEOUT", "480"))
QUEUE_WAIT = int(os.environ.get("GFLOW_BRIDGE_QUEUE_WAIT", "1200"))
MAX_BODY = int(os.environ.get("GFLOW_BRIDGE_MAX_BODY", str(48 * 1024 * 1024)))
SETTLE_SECONDS = int(os.environ.get("GFLOW_BRIDGE_SETTLE_SECONDS", "8"))
I2V_FALLBACK_T2V = os.environ.get("GFLOW_I2V_FALLBACK_T2V", "") == "1"
# gflow 0.71 picks the library tile then waits for the picker to close. Migrated
# Flow keeps it open until "Add to prompt" — the CLI never clicks that button.
CLICK_ADD_TO_PROMPT = os.environ.get("GFLOW_BRIDGE_CLICK_ADD_TO_PROMPT", "1") != "0"
RECOVER_SECONDS = int(os.environ.get("GFLOW_BRIDGE_RECOVER_SECONDS", "90"))
STILL_PREFIX = "or-i2v-"
ADD_TO_PROMPT_NEEDLES = (
    "add to prompt",
    "añadir al prompt",
    "añadir a la instrucción",
    "adicionar ao prompt",
    "incluir no comando",
    "ajouter à l'invite",
    "zum prompt hinzufügen",
)

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


def _sanitize_prompt(prompt: str) -> str:
    # Migrated I2V rejects @Name / UUID frames.
    return re.sub(r"@\S+", "", prompt).strip()


def _resolve_video_mode(raw: object) -> str:
    mode = str(raw or "t2v").strip().lower()
    return mode if mode in {"t2v", "i2v"} else "t2v"


def _duration_flag(model: str, duration: int | None) -> list[str]:
    # gflow 0.71: only Omni Flash has a duration row on migrated Flow.
    if duration is None or str(model).strip().lower() != "omni-flash":
        return []
    return ["--duration", str(duration)]


def _video_cli_args(
    *,
    mode: str,
    prompt: str,
    model: str,
    duration: int | None,
    aspect: str,
    dest: str,
    still_path: str | None,
) -> list[str]:
    common = ["--model", model, *_duration_flag(model, duration), "--aspect", aspect, "-o", dest]
    if mode == "i2v":
        if not still_path:
            raise ValueError("imagePng requerido (still PNG en base64)")
        return ["video", "i2v", "--initial-frame", still_path, prompt, *common]
    return ["video", "t2v", prompt, *common]


def _should_fallback_t2v(msg: str) -> bool:
    low = msg.lower()
    return any(
        n in low
        for n in (
            "uiselectordrifterror",
            "frame picker",
            "maseq",
            "initial-frame",
            "still.png",
            STILL_PREFIX,
        )
    )


def _is_submit_miss(msg: str) -> bool:
    """gflow clicked submit; Flow queued the clip; the observer missed the ACK."""
    low = msg.lower()
    if "frame picker" in low:
        return False
    return any(
        n in low
        for n in (
            "yhhmef",
            "eb1hjf",
            "mzza6b",
            "transporttimeouterror",
            "reply within",
            "not terminal within",
        )
    )


def _unique_still_name() -> str:
    return f"{STILL_PREFIX}{int(time.time())}-{secrets.token_hex(3)}.png"


def _is_add_to_prompt_label(name: str) -> bool:
    low = name.strip().lower()
    return any(needle in low for needle in ADD_TO_PROMPT_NEEDLES)


def _run_powershell(script: str, timeout: float = 12) -> str:
    encoded = base64.b64encode(script.encode("utf-16le")).decode("ascii")
    proc = subprocess.run(
        ["powershell", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )
    return ((proc.stdout or "") + (proc.stderr or "")).strip()


def _flow_picker_script(action: str, still_needle: str = STILL_PREFIX) -> str:
    """Windows UI Automation: find Flow's frame-picker confirm, or send Escape."""
    labels = ", ".join(repr(n) for n in ADD_TO_PROMPT_NEEDLES)
    needle = still_needle.replace("'", "")
    return f"""
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName UIAutomationClient | Out-Null
$needles = @({labels})
function Test-PromptName([string]$n) {{
  if (-not $n) {{ return $false }}
  $low = $n.ToLowerInvariant()
  foreach ($k in $needles) {{ if ($low.Contains($k)) {{ return $true }} }}
  return $false
}}
function Test-FlowTitle([string]$n) {{
  return $n -match '(?i)flow|openreels|videofx|labs\\.google'
}}
$root = [System.Windows.Automation.AutomationElement]::RootElement
$winType = [System.Windows.Automation.ControlType]::Window
$winCond = New-Object System.Windows.Automation.PropertyCondition(
  [System.Windows.Automation.AutomationElement]::ControlTypeProperty, $winType)
$windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children, $winCond)
$action = '{action}'
$stillNeedle = '{needle}'
foreach ($w in $windows) {{
  if (-not (Test-FlowTitle $w.Current.Name)) {{ continue }}
  if ($action -eq 'escape') {{
    Add-Type -AssemblyName System.Windows.Forms | Out-Null
    $hwnd = [IntPtr]$w.Current.NativeWindowHandle
    Add-Type @"
using System;
using System.Runtime.InteropServices;
public class GflowWinEsc {{
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}}
"@
    [GflowWinEsc]::ShowWindow($hwnd, 9) | Out-Null
    [GflowWinEsc]::SetForegroundWindow($hwnd) | Out-Null
    Start-Sleep -Milliseconds 120
    [System.Windows.Forms.SendKeys]::SendWait('{{ESC}}')
    Write-Output ('esc:' + $w.Current.Name)
    exit 0
  }}
  $editType = [System.Windows.Automation.ControlType]::Edit
  $editCond = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty, $editType)
  $edits = $w.FindAll([System.Windows.Automation.TreeScope]::Descendants, $editCond)
  $searchReady = $false
  foreach ($e in $edits) {{
    $val = ''
    try {{
      $vp = $e.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
      if ($vp) {{ $val = [string]$vp.Current.Value }}
    }} catch {{}}
    if (-not $val) {{ $val = [string]$e.Current.Name }}
    if ($val -and $val.ToLowerInvariant().Contains($stillNeedle.ToLowerInvariant())) {{
      $searchReady = $true
      break
    }}
  }}
  if (-not $searchReady) {{ continue }}
  $btnType = [System.Windows.Automation.ControlType]::Button
  $btnCond = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty, $btnType)
  $buttons = $w.FindAll([System.Windows.Automation.TreeScope]::Descendants, $btnCond)
  foreach ($b in $buttons) {{
    if (-not (Test-PromptName $b.Current.Name)) {{ continue }}
    if ($action -eq 'probe') {{
      Write-Output ('visible:' + $b.Current.Name)
      exit 0
    }}
    $pat = $b.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
    if (-not $pat) {{ continue }}
    $pat.Invoke()
    Write-Output ('clicked:' + $b.Current.Name)
    exit 0
  }}
}}
exit 1
"""


def _dismiss_stale_frame_picker() -> None:
    if os.name != "nt":
        return
    try:
        out = _run_powershell(_flow_picker_script("escape"), timeout=8)
    except Exception as err:
        print(f"[gflow-bridge] picker Escape skipped: {err}", flush=True)
        return
    if out.startswith("esc:"):
        print(f"[gflow-bridge] closed leftover Flow overlay ({out})", flush=True)
        time.sleep(0.35)
        try:
            _run_powershell(_flow_picker_script("escape"), timeout=8)
        except Exception:
            pass


class PickerConfirmWatch:
    """While gflow waits 15s for the picker to close, click Add to prompt."""

    def __init__(self, still_name: str, enabled: bool) -> None:
        self.still_name = still_name
        self.enabled = enabled and CLICK_ADD_TO_PROMPT and os.name == "nt"
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self.clicks = 0

    def __enter__(self) -> PickerConfirmWatch:
        if self.enabled:
            self._thread = threading.Thread(target=self._loop, name="gflow-add-to-prompt", daemon=True)
            self._thread.start()
        return self

    def __exit__(self, *_exc: object) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=4)

    def _loop(self) -> None:
        needle = Path(self.still_name).name if self.still_name else STILL_PREFIX
        while not self._stop.wait(1.1):
            try:
                out = _run_powershell(_flow_picker_script("click", needle), timeout=10)
            except Exception as err:
                print(f"[gflow-bridge] Add to prompt scan: {err}", flush=True)
                continue
            if out.startswith("clicked:"):
                self.clicks += 1
                print(f"[gflow-bridge] clicked Flow picker confirm ({out})", flush=True)
                # Stop scanning: UIA walks of Chrome during submit drop Playwright
                # network events (YhhmEf/eb1hJf miss while Flow still generates).
                self._stop.set()
                return


def _gflow_fail_message(payload: dict[str, Any] | None, stdout: str, stderr: str, code: int) -> str:
    err = payload.get("error") if payload else None
    if isinstance(err, dict):
        detail = str(err.get("detail") or err.get("title") or "")
        hint = str(err.get("remediation_hint") or "")
        klass = str(err.get("class") or "")
        parts = [p for p in (klass, detail, hint) if p]
        if parts:
            return " — ".join(parts)[:500]
    return (stderr or stdout or f"gflow exit {code}")[:400]


def _run_gflow(args: list[str], timeout: int) -> dict[str, Any]:
    cmd = [GFLOW_BIN, *args, "--json"]
    if PROFILE and "--profile" not in args:
        cmd.extend(["--profile", PROFILE])
    if PROJECT and "--project" not in args:
        cmd.extend(["--project", PROJECT])
    if PROJECT_NAME and "--project-name" not in args:
        cmd.extend(["--project-name", PROJECT_NAME])
    env = os.environ.copy()
    env["GFLOW_CLI_LOG_FORMAT"] = "json"
    env["NO_COLOR"] = "1"
    env["FORCE_COLOR"] = "0"
    env.setdefault("GFLOW_CLI_FLOW_HOST", "auto")
    bin_path = Path(GFLOW_BIN)
    if bin_path.is_file():
        env["PATH"] = str(bin_path.parent) + os.pathsep + env.get("PATH", "")
    print(f"[gflow-bridge] exec {' '.join(cmd[:6])} … project={PROJECT or '-'} name={PROJECT_NAME or '-'}", flush=True)
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            env=env,
            check=False,
        )
    except FileNotFoundError as err:
        raise RuntimeError(missing_gflow_message()) from err
    payload: dict[str, Any] | None = None
    try:
        payload = _parse_gflow_json(proc.stdout or "")
    except Exception:
        payload = None
    if (payload and payload.get("status") == "fail") or proc.returncode != 0:
        msg = _gflow_fail_message(payload, proc.stdout or "", proc.stderr or "", proc.returncode)
        print(f"[gflow-bridge] gflow fail: {msg}", flush=True)
        raise RuntimeError(msg)
    if not payload:
        raise RuntimeError(f"gflow no devolvió JSON: {(proc.stdout or '')[:240]}")
    return payload


def _mp4_search_roots(dest: Path) -> list[Path]:
    """Only this I2V request's work dir — never Videos/ or Lab leftovers."""
    return [dest.parent]


def _newest_mp4_since(since: float, dest: Path) -> Path | None:
    if dest.exists() and dest.stat().st_size > 20_000:
        return dest
    found: list[Path] = []
    try:
        for path in dest.parent.glob("*.mp4"):
            try:
                st = path.stat()
            except OSError:
                continue
            if st.st_size > 20_000 and st.st_mtime >= since - 2:
                found.append(path)
    except OSError:
        return None
    if not found:
        return None
    return max(found, key=lambda p: p.stat().st_mtime)


def _catalog_paths_from_list(stdout: str) -> list[Path]:
    paths: list[Path] = []
    text = stdout.strip()
    if not text:
        return paths
    blobs: list[Any] = []
    try:
        blobs.append(json.loads(text[text.find("[") : text.rfind("]") + 1] if "[" in text else text[text.find("{") :]))
    except Exception:
        for line in text.splitlines():
            line = line.strip()
            if line.startswith("{") or line.startswith("["):
                try:
                    blobs.append(json.loads(line))
                except Exception:
                    continue
    rows: list[Any] = []
    for blob in blobs:
        if isinstance(blob, list):
            rows.extend(blob)
        elif isinstance(blob, dict):
            inner = blob.get("videos") or blob.get("items") or blob.get("rows")
            if isinstance(inner, list):
                rows.extend(inner)
            else:
                rows.append(blob)
    for row in rows:
        if not isinstance(row, dict):
            continue
        for key, val in row.items():
            if "path" not in str(key).lower() or not isinstance(val, str):
                continue
            p = Path(val)
            if p.suffix.lower() == ".mp4" and p.exists():
                paths.append(p)
    return paths


def _recover_generated_mp4(dest: Path, since: float) -> Path | None:
    print(f"[gflow-bridge] submit ACK missed; wait {RECOVER_SECONDS}s for Flow to finish the clip", flush=True)
    if RECOVER_SECONDS > 0:
        time.sleep(RECOVER_SECONDS)
    found = _newest_mp4_since(since, dest)
    if found is not None:
        print(f"[gflow-bridge] recovered mp4 {found} ({found.stat().st_size} bytes)", flush=True)
        return found
    print("[gflow-bridge] no mp4 in this I2V work dir (not scanning Lab/Videos/catalog)", flush=True)
    return None


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
    prompt = _sanitize_prompt(str(body.get("prompt") or ""))
    if len(prompt) < 2:
        raise ValueError("prompt requerido")
    mode = _resolve_video_mode(body.get("mode"))
    still = _decode_b64(body.get("imagePng") if isinstance(body.get("imagePng"), str) else None)
    if mode == "i2v" and (not still or len(still) < 80):
        raise ValueError("imagePng requerido (still PNG en base64)")
    model = str(body.get("model") or "veo-lite")
    aspect = "9:16" if body.get("aspect") == "9:16" else "16:9"
    duration: int | None = None
    if str(model).strip().lower() == "omni-flash" and body.get("durationSeconds") is not None:
        try:
            duration = max(4, min(int(body.get("durationSeconds") or 8), 10))
        except (TypeError, ValueError):
            duration = 8
    reported = duration if duration is not None else 8
    work = Path(tempfile.mkdtemp(prefix="gflow-bridge-vid-"))
    dest = work / "out.mp4"
    still_path = work / _unique_still_name()
    if mode == "i2v" and still:
        still_path.write_bytes(still)
    try:
        args = _video_cli_args(
            mode=mode,
            prompt=prompt,
            model=model,
            duration=duration,
            aspect=aspect,
            dest=str(dest),
            still_path=str(still_path) if mode == "i2v" else None,
        )
        started = time.time()
        if mode == "i2v":
            _dismiss_stale_frame_picker()
        with PickerConfirmWatch(still_path.name, enabled=mode == "i2v"):
            try:
                payload = _run_gflow(args, VIDEO_TIMEOUT)
            except Exception as err:
                msg = str(err)
                recovered = _recover_generated_mp4(dest, started) if mode == "i2v" and _is_submit_miss(msg) else None
                if recovered is not None:
                    payload = {"status": "ok", "local_path": str(recovered)}
                elif mode != "i2v" or not _should_fallback_t2v(msg):
                    raise
                else:
                    print(f"[gflow-bridge] I2V picker stuck; wait {SETTLE_SECONDS}s and retry I2V: {err}", flush=True)
                    _dismiss_stale_frame_picker()
                    if SETTLE_SECONDS > 0:
                        time.sleep(SETTLE_SECONDS)
                    try:
                        payload = _run_gflow(args, VIDEO_TIMEOUT)
                    except Exception as err2:
                        miss2 = str(err2)
                        recovered2 = _recover_generated_mp4(dest, started) if _is_submit_miss(miss2) else None
                        if recovered2 is not None:
                            payload = {"status": "ok", "local_path": str(recovered2)}
                        elif not I2V_FALLBACK_T2V:
                            raise
                        else:
                            print(f"[gflow-bridge] I2V retry failed; t2v fallback (credits): {err2}", flush=True)
                            payload = _run_gflow(
                                _video_cli_args(
                                    mode="t2v",
                                    prompt=prompt,
                                    model=model,
                                    duration=duration,
                                    aspect=aspect,
                                    dest=str(dest),
                                    still_path=None,
                                ),
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
            "durationSeconds": reported,
        }
    finally:
        if mode == "i2v" and SETTLE_SECONDS > 0:
            time.sleep(SETTLE_SECONDS)
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
        if code >= 400:
            self.send_header("Connection", "close")
            self.close_connection = True
        self.end_headers()
        self.wfile.write(raw)

    def _read_body(self) -> bytes:
        """Always consume Content-Length so a 401 does not leave PNG/base64 as the next request line (HTTP 414)."""
        try:
            length = int(self.headers.get("Content-Length") or "0")
        except ValueError:
            length = 0
        if length <= 0:
            return b""
        return self.rfile.read(min(length, MAX_BODY + 1))

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
                    "projectName": PROJECT_NAME or "",
                    "profile": bool(PROFILE),
                    "busy": LOCK.locked(),
                    "ts": int(time.time()),
                },
            )
            return
        self._json(404, {"ok": False, "error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        raw = self._read_body()
        if path not in {"/v1/image", "/v1/video"}:
            self._json(404, {"ok": False, "error": "not found"})
            return
        if not self._auth():
            return
        if not raw or len(raw) > MAX_BODY:
            self._json(413, {"ok": False, "error": f"body inválido o > {MAX_BODY} bytes"})
            return
        try:
            body = json.loads(raw.decode("utf-8"))
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


def apply_settings(
    *,
    token: str,
    allow_ips: str = "",
    project: str = "",
    project_name: str = "",
    host: str | None = None,
    port: int | None = None,
    profile: str = "",
    gflow_bin: str = "",
) -> None:
    global TOKEN, ALLOW_IPS, PROJECT, PROJECT_NAME, HOST, PORT, PROFILE, GFLOW_BIN
    TOKEN = (token or "").strip()
    ALLOW_IPS = {ip.strip() for ip in (allow_ips or "").split(",") if ip.strip()}
    PROJECT = (project or "").strip()
    PROJECT_NAME = (project_name or "").strip() or ("OpenReels" if PROJECT else "")
    PROFILE = (profile or "").strip()
    found = find_gflow(gflow_bin) or find_gflow()
    if found:
        GFLOW_BIN = found
    elif gflow_bin.strip():
        GFLOW_BIN = gflow_bin.strip()
    if host:
        HOST = host
    if port:
        PORT = int(port)
    os.environ["GFLOW_BRIDGE_TOKEN"] = TOKEN
    os.environ["GFLOW_BRIDGE_ALLOW_IPS"] = ",".join(sorted(ALLOW_IPS))
    os.environ["GFLOW_CLI_PROJECT"] = PROJECT
    os.environ["GFLOW_CLI_PROJECT_NAME"] = PROJECT_NAME
    if PROFILE:
        os.environ["GFLOW_CLI_PROFILE"] = PROFILE
    if GFLOW_BIN:
        os.environ["GFLOW_CLI_BIN"] = GFLOW_BIN


def run_kind(kind: str, body: dict[str, Any]) -> dict[str, Any]:
    if kind not in {"image", "video"}:
        raise ValueError(f"kind inválido: {kind}")
    if not LOCK.acquire(timeout=max(30, QUEUE_WAIT)):
        raise RuntimeError("gflow ocupado (un Chrome, una generación a la vez)")
    try:
        return generate_image(body) if kind == "image" else generate_video(body)
    finally:
        LOCK.release()


def serve_forever() -> ThreadingHTTPServer:
    if not TOKEN and not ALLOW_ANON:
        raise SystemExit("Define GFLOW_BRIDGE_TOKEN (el mismo valor que en el Xeon) o GFLOW_BRIDGE_ALLOW_ANON=1")
    print(
        f"[gflow-bridge] {HOST}:{PORT} bin={GFLOW_BIN} token={'yes' if TOKEN else 'anon'} allow={','.join(sorted(ALLOW_IPS)) or '*'}",
        flush=True,
    )
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    return httpd


def main() -> None:
    httpd = serve_forever()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("[gflow-bridge] stop", flush=True)
        httpd.server_close()


if __name__ == "__main__":
    main()
