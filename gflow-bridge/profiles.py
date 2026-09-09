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


def list_gflow_accounts(home: Path | None = None) -> list[str]:
    root = home or (_local_app_data() / "gflow-cli")
    emails: list[str] = []
    if not root.is_dir():
        return emails
    for acc in sorted(root.glob("profile_*/.gflow_account")):
        try:
            email = acc.read_text(encoding="utf-8").strip()
        except Exception:
            continue
        if email:
            emails.append(f"{acc.parent.name}: {email}")
    return emails


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
