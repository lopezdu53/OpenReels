"""Chrome user profiles + gflow-cli location (Windows-first, stdlib only)."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

FLOW_URL = "https://labs.google/fx/tools/flow"


def _local_app_data() -> Path:
    raw = os.environ.get("LOCALAPPDATA")
    if raw:
        return Path(raw)
    return Path.home() / "AppData" / "Local"


def _roaming_app_data() -> Path:
    raw = os.environ.get("APPDATA")
    if raw:
        return Path(raw)
    return Path.home() / "AppData" / "Roaming"


def chrome_user_data_dir() -> Path:
    return _local_app_data() / "Google" / "Chrome" / "User Data"


def list_chrome_profiles(user_data: Path | None = None) -> list[dict[str, str]]:
    """Chrome people/profiles (Default, Profile 1, …) with Gmail if Chrome stored it."""
    root = user_data or chrome_user_data_dir()
    state_path = root / "Local State"
    rows: list[dict[str, str]] = []
    cache: dict[str, Any] = {}
    if state_path.is_file():
        try:
            data = json.loads(state_path.read_text(encoding="utf-8"))
            cache = data.get("profile", {}).get("info_cache", {}) or {}
        except Exception:
            cache = {}
    if not cache:
        default_dir = root / "Default"
        if default_dir.is_dir() or not state_path.exists():
            return [{"directory": "Default", "name": "Default", "email": "", "label": "Default"}]
        return rows
    for directory, info in cache.items():
        if not isinstance(info, dict):
            continue
        if str(directory).startswith("System") or str(directory) == "Guest Profile":
            continue
        name = str(info.get("name") or directory)
        email = str(info.get("user_name") or info.get("gaia_name") or "").strip()
        label = f"{name} · {email}" if email else f"{name} ({directory})"
        rows.append({"directory": str(directory), "name": name, "email": email, "label": label})
    rows.sort(key=lambda r: (0 if r["directory"] == "Default" else 1, r["label"].lower()))
    return rows


def find_chrome() -> str | None:
    env = (os.environ.get("CHROME_BIN") or os.environ.get("GFLOW_CHROME_BIN") or "").strip()
    if env and Path(env).is_file():
        return env
    pf = os.environ.get("PROGRAMFILES", r"C:\Program Files")
    pf86 = os.environ.get("PROGRAMFILES(X86)", r"C:\Program Files (x86)")
    candidates = [
        Path(pf) / "Google" / "Chrome" / "Application" / "chrome.exe",
        Path(pf86) / "Google" / "Chrome" / "Application" / "chrome.exe",
        _local_app_data() / "Google" / "Chrome" / "Application" / "chrome.exe",
    ]
    for path in candidates:
        if path.is_file():
            return str(path)
    return shutil.which("chrome") or shutil.which("google-chrome") or shutil.which("chrome.exe")


def find_gflow(explicit: str = "") -> str | None:
    if explicit.strip():
        path = Path(explicit.strip())
        if path.is_file():
            return str(path)
    env = (os.environ.get("GFLOW_CLI_BIN") or "").strip()
    if env and Path(env).is_file():
        return env
    from install import bundled_bin_dir

    bundled = bundled_bin_dir() / ("gflow.exe" if sys.platform == "win32" else "gflow")
    if bundled.is_file():
        return str(bundled)
    which = shutil.which("gflow") or shutil.which("gflow.exe")
    if which:
        return which
    home = Path.home()
    hits: list[Path] = [
        home / ".local" / "bin" / "gflow.exe",
        home / ".local" / "bin" / "gflow",
        _roaming_app_data() / "uv" / "tools" / "gflow-cli" / "Scripts" / "gflow.exe",
        _local_app_data() / "uv" / "tools" / "gflow-cli" / "Scripts" / "gflow.exe",
        home / ".local" / "pipx" / "venvs" / "gflow-cli" / "Scripts" / "gflow.exe",
        home / ".local" / "share" / "uv" / "tools" / "gflow-cli" / "bin" / "gflow",
        _local_app_data() / "OpenReelsPuente" / "bin" / "gflow.exe",
    ]
    for folder in (
        _roaming_app_data() / "Python",
        _local_app_data() / "Programs" / "Python",
    ):
        hits.extend(folder.glob("Python*/Scripts/gflow.exe"))
        hits.extend(folder.glob("Python*/Scripts/gflow"))
    for path in hits:
        if path.is_file():
            return str(path)
    return None


def missing_gflow_message() -> str:
    return (
        "Falta gflow-cli. Pulsa «Instalar todo» en esta ventana: el exe baja uv, "
        "gflow-cli y Chromium (sin PowerShell). Luego «Entrar a Flow» con el Gmail Gemini."
    )


def list_gflow_profiles(home: Path | None = None) -> list[dict[str, str]]:
    """gflow-cli sessions: folder profile_<name> + .gflow_account email."""
    root = home or (_local_app_data() / "gflow-cli")
    rows: list[dict[str, str]] = []
    if not root.is_dir():
        return rows
    for acc in sorted(root.glob("profile_*/.gflow_account")):
        try:
            email = acc.read_text(encoding="utf-8").strip()
        except Exception:
            continue
        if not email:
            continue
        folder = acc.parent.name
        name = folder[8:] if folder.startswith("profile_") else folder
        rows.append({"name": name, "email": email, "dir": str(acc.parent)})
    return rows


def list_gflow_accounts(home: Path | None = None) -> list[str]:
    return [f"{row['name']}: {row['email']}" for row in list_gflow_profiles(home)]


def pick_gflow_profile(preferred_email: str = "", home: Path | None = None) -> dict[str, str] | None:
    rows = list_gflow_profiles(home)
    if not rows:
        return None
    want = preferred_email.strip().lower()
    if want:
        for row in rows:
            if row["email"].lower() == want:
                return row
    return rows[0]


def open_flow_in_chrome(profile_directory: str = "Default") -> None:
    chrome = find_chrome()
    url = FLOW_URL
    directory = (profile_directory or "Default").strip() or "Default"
    if not chrome:
        raise RuntimeError("No se encontró Google Chrome. Instálalo o pon CHROME_BIN.")
    flags = 0
    if sys.platform == "win32":
        flags = getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
    subprocess.Popen(
        [chrome, f"--profile-directory={directory}", url],
        creationflags=flags,
        close_fds=False,
    )


def gflow_login_cmd(gflow_bin: str, profile: str = "") -> list[str]:
    cmd = [gflow_bin, "auth", "login", "--browser", "chrome"]
    if profile.strip():
        cmd.extend(["--profile", profile.strip()])
    return cmd


def write_login_batch(gflow_bin: str, profile: str = "") -> Path:
    """cmd.exe script that keeps a console open so gflow can show Chrome + prompts."""
    from install import app_home, find_uv, tool_env

    env = tool_env()
    chrome = find_chrome() or ""
    uv = find_uv() or ""
    dest = app_home() / "entrar-flow.cmd"
    login = subprocess.list2cmdline(gflow_login_cmd(gflow_bin, profile))
    fallback = ""
    if uv:
        extra = ["--profile", profile.strip()] if profile.strip() else []
        fallback = subprocess.list2cmdline(
            [uv, "tool", "run", "--from", "gflow-cli", "gflow", "auth", "login", "--browser", "chrome", *extra]
        )
    lines = [
        "@echo off",
        "title OpenReels — Entrar a Flow",
        "chcp 65001 >nul",
        f'set "UV_TOOL_BIN_DIR={env["UV_TOOL_BIN_DIR"]}"',
        f'set "UV_TOOL_DIR={env["UV_TOOL_DIR"]}"',
        f'set "PATH={env["UV_TOOL_BIN_DIR"]};%PATH%"',
        'set "GFLOW_CLI_AUTH_BROWSER=chrome"',
    ]
    if chrome:
        lines.append(f'set "GFLOW_CHROME_BIN={chrome}"')
        lines.append(f'set "CHROME_BIN={chrome}"')
    lines += [
        "echo.",
        "echo 1) Se abre Chrome de gflow (otro Chrome, no el de cada dia).",
        "echo 2) Entra con el Gmail del plan Gemini.",
        "echo 3) Cuando cargue Flow, CIERRA esa ventana de Chrome.",
        "echo 4) Vuelve a ESTA ventana negra y pulsa una tecla.",
        "echo    NO la cierres antes: si se cierra, no se guarda la sesion.",
        "echo.",
        login,
        "set ERR=%ERRORLEVEL%",
    ]
    if fallback:
        lines += [
            "if %ERR% NEQ 0 (",
            "  echo gflow.exe fallo. Reintento con uv...",
            f"  {fallback}",
            "  set ERR=%ERRORLEVEL%",
            ")",
        ]
    lines += [
        "echo.",
        "echo Codigo %ERR%. Si Chrome no abrio, deja esta ventana y copia el texto.",
        "pause",
        "exit /b %ERR%",
    ]
    dest.write_text("\r\n".join(lines) + "\r\n", encoding="utf-8")
    return dest


def run_gflow_login(gflow_bin: str, profile: str = "") -> int:
    if sys.platform != "win32":
        env = os.environ.copy()
        env["GFLOW_CLI_AUTH_BROWSER"] = "chrome"
        proc = subprocess.run(gflow_login_cmd(gflow_bin, profile), check=False, env=env)
        return int(proc.returncode)
    bat = write_login_batch(gflow_bin, profile)
    proc = subprocess.run(
        ["cmd.exe", "/c", "start", "/wait", "OpenReels Entrar a Flow", str(bat)],
        check=False,
    )
    return int(proc.returncode)
