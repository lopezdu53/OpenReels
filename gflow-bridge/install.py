"""Install uv + gflow-cli (+ Playwright Chromium) from the GUI. Stdlib only."""

from __future__ import annotations

import json
import os
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile
from collections.abc import Callable
from pathlib import Path

LogFn = Callable[[str], None]

BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
PYPI_URL = "https://pypi.org/pypi/gflow-cli/json"
UV_LATEST = "https://github.com/astral-sh/uv/releases/latest/download/"


def app_home() -> Path:
    raw = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA")
    root = Path(raw) if raw else Path.home() / "AppData" / "Local"
    path = root / "OpenReelsPuente"
    path.mkdir(parents=True, exist_ok=True)
    return path


def bundled_bin_dir() -> Path:
    path = app_home() / "bin"
    path.mkdir(parents=True, exist_ok=True)
    return path


def tool_env() -> dict[str, str]:
    env = os.environ.copy()
    bindir = bundled_bin_dir()
    env["UV_TOOL_BIN_DIR"] = str(bindir)
    env["UV_TOOL_DIR"] = str(app_home() / "uv-tools")
    env["PATH"] = str(bindir) + os.pathsep + env.get("PATH", "")
    return env


def parse_version(text: str) -> str | None:
    match = re.search(r"(\d+\.\d+\.\d+(?:[a-zA-Z0-9.]+)*)", text or "")
    return match.group(1) if match else None


def version_tuple(raw: str) -> tuple[int, ...]:
    parts = [int(p) for p in re.split(r"[^\d]+", raw) if p.isdigit()]
    return tuple(parts) if parts else (0,)


def version_newer(latest: str, installed: str) -> bool:
    return version_tuple(latest) > version_tuple(installed)


def format_gflow_status(installed: str | None, latest: str | None) -> str:
    if not installed:
        if latest:
            return f"gflow: no instalado · última en PyPI {latest} — pulsa Instalar todo"
        return "gflow: no instalado — pulsa Instalar todo"
    if latest and version_newer(latest, installed):
        return f"gflow-cli {installed} · hay {latest} — pulsa Actualizar"
    if latest:
        return f"gflow-cli {installed} · al día"
    return f"gflow-cli {installed}"


def _http_get(url: str, dest: Path | None = None, timeout: int = 60) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": BROWSER_UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as res:
        data = res.read()
    if dest:
        dest.write_bytes(data)
    return data


def pypi_latest_version() -> str | None:
    raw = _http_get(PYPI_URL, timeout=20)
    payload = json.loads(raw.decode("utf-8"))
    version = str(payload.get("info", {}).get("version") or "").strip()
    return version or None


def uv_zip_name() -> str:
    mach = platform.machine().lower()
    if sys.platform == "win32":
        if mach in {"arm64", "aarch64"}:
            return "uv-aarch64-pc-windows-msvc.zip"
        return "uv-x86_64-pc-windows-msvc.zip"
    if sys.platform == "darwin":
        if mach in {"arm64", "aarch64"}:
            return "uv-aarch64-apple-darwin.tar.gz"
        return "uv-x86_64-apple-darwin.tar.gz"
    return "uv-x86_64-unknown-linux-gnu.tar.gz"


def find_uv() -> str | None:
    bundled = bundled_bin_dir() / ("uv.exe" if sys.platform == "win32" else "uv")
    if bundled.is_file():
        return str(bundled)
    return shutil.which("uv") or shutil.which("uv.exe")


def _run(cmd: list[str], *, env: dict[str, str], timeout: int, log: LogFn) -> str:
    log("$ " + " ".join(cmd[:6]) + (" …" if len(cmd) > 6 else ""))
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0) if sys.platform == "win32" else 0
    proc = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
        env=env,
        check=False,
        creationflags=flags,
    )
    out = (proc.stdout or "") + (proc.stderr or "")
    if proc.returncode != 0:
        raise RuntimeError((out or f"exit {proc.returncode}")[-500:])
    return out


def ensure_uv(log: LogFn) -> str:
    found = find_uv()
    if found:
        log(f"uv listo: {found}")
        return found
    if sys.platform != "win32":
        raise RuntimeError("Instala uv (https://docs.astral.sh/uv/) o usa Windows para el exe.")
    name = uv_zip_name()
    url = UV_LATEST + name
    log(f"Descargando uv ({name})…")
    with tempfile.TemporaryDirectory() as tmp:
        archive = Path(tmp) / name
        _http_get(url, archive, timeout=120)
        with zipfile.ZipFile(archive) as zf:
            zf.extractall(tmp)
        src = next(Path(tmp).rglob("uv.exe"), None)
        if not src:
            raise RuntimeError("El zip de uv no trae uv.exe")
        dest = bundled_bin_dir() / "uv.exe"
        shutil.copy2(src, dest)
        uvx = next(Path(tmp).rglob("uvx.exe"), None)
        if uvx:
            shutil.copy2(uvx, bundled_bin_dir() / "uvx.exe")
    log(f"uv instalado: {dest}")
    return str(dest)


def gflow_version(gflow_bin: str) -> str | None:
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0) if sys.platform == "win32" else 0
    env = tool_env()
    for args in (["--version"], ["version"]):
        try:
            proc = subprocess.run(
                [gflow_bin, *args],
                capture_output=True,
                text=True,
                timeout=25,
                env=env,
                check=False,
                creationflags=flags,
            )
        except Exception:
            continue
        found = parse_version((proc.stdout or "") + " " + (proc.stderr or ""))
        if found:
            return found
    uv = find_uv()
    if not uv:
        return None
    try:
        out = _run(
            [uv, "tool", "run", "--from", "gflow-cli", "python", "-c", "import importlib.metadata as m; print(m.version('gflow-cli'))"],
            env=env,
            timeout=40,
            log=lambda _s: None,
        )
        return parse_version(out)
    except Exception:
        return None


def inspect_gflow(explicit: str = "") -> dict[str, str | None]:
    from profiles import find_gflow

    path = find_gflow(explicit)
    installed = gflow_version(path) if path else None
    latest: str | None = None
    try:
        latest = pypi_latest_version()
    except Exception:
        latest = None
    return {
        "path": path,
        "installed": installed,
        "latest": latest,
        "status": format_gflow_status(installed, latest),
    }


def install_gflow_stack(log: LogFn, *, upgrade: bool = False) -> str:
    from profiles import find_gflow

    env = tool_env()
    uv = ensure_uv(log)
    log("Instalando Python 3.12 (uv, una vez)…")
    try:
        _run([uv, "python", "install", "3.12"], env=env, timeout=300, log=log)
    except Exception as err:
        log(f"Python 3.12: {err} (sigo, uv puede traerlo solo)")
    if upgrade:
        log("Actualizando gflow-cli…")
        try:
            _run([uv, "tool", "upgrade", "gflow-cli"], env=env, timeout=600, log=log)
        except Exception:
            _run([uv, "tool", "install", "--force", "gflow-cli"], env=env, timeout=600, log=log)
    else:
        log("Instalando gflow-cli desde PyPI…")
        _run([uv, "tool", "install", "gflow-cli"], env=env, timeout=600, log=log)
    log("Playwright Chromium (una vez, ~150 MB)…")
    try:
        _run(
            [uv, "tool", "run", "--from", "gflow-cli", "playwright", "install", "chromium"],
            env=env,
            timeout=600,
            log=log,
        )
    except Exception as err:
        log(f"Chromium Playwright: {err}. Si tienes Google Chrome, Flow igual funciona.")
    path = find_gflow(str(bundled_bin_dir() / ("gflow.exe" if sys.platform == "win32" else "gflow")))
    if not path:
        path = find_gflow()
    if not path:
        raise RuntimeError("gflow-cli se instaló pero no aparece gflow.exe. Reabre la app.")
    version = gflow_version(path) or "?"
    log(f"Listo: gflow-cli {version} → {path}")
    return path
