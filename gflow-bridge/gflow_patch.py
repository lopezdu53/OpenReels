"""Keep Flow Chrome open: gflow 0.79 hard-caps the submit ACK at 60s.

On flow.google.com, `SUBMIT_REPLY_BUDGET_S = 60` (migrated_composer). If Playwright
misses YhhmEf — or Lower Priority has not ACKed yet — gflow exits, Playwright
closes Chrome, and Flow aborts the clip that was still at ~26%. The local
`gflow data list` catalog stays empty because nothing was recorded.

We rewrite those constants in the installed package (re-applied after upgrades).
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

SUBMIT_REPLY_S = float(os.environ.get("GFLOW_BRIDGE_SUBMIT_REPLY_S", "3600"))
RESULT_URL_GRACE_S = float(os.environ.get("GFLOW_BRIDGE_RESULT_URL_GRACE_S", "1200"))
LABS_SUBMIT_STAGE_S = float(os.environ.get("GFLOW_BRIDGE_LABS_SUBMIT_S", "3600"))

_COMPOSER = "gflow_cli/api/transports/migrated_composer.py"
_LABS_VIDEO = "gflow_cli/api/transports/ui_automation_video.py"


def _rewrite_assignment(text: str, name: str, value: float) -> tuple[str, bool]:
    pattern = rf"^({re.escape(name)}\s*=\s*)([0-9]+(?:\.[0-9]+)?)\s*$"

    def _sub(match: re.Match[str]) -> str:
        current = float(match.group(2))
        if current + 0.01 >= value:
            return match.group(0)
        return f"{match.group(1)}{value}"

    updated, n = re.subn(pattern, _sub, text, flags=re.M)
    return updated, n > 0 and updated != text


def patch_migrated_composer_source(
    text: str,
    *,
    submit_s: float = SUBMIT_REPLY_S,
    grace_s: float = RESULT_URL_GRACE_S,
) -> str:
    text, _ = _rewrite_assignment(text, "SUBMIT_REPLY_BUDGET_S", submit_s)
    text, _ = _rewrite_assignment(text, "RESULT_URL_GRACE_S", grace_s)
    return text


def patch_labs_video_source(text: str, *, submit_s: float = LABS_SUBMIT_STAGE_S) -> str:
    text, _ = _rewrite_assignment(text, "SUBMIT_STAGE_TIMEOUT_S", submit_s)
    return text


def _site_package_roots() -> list[Path]:
    roots: list[Path] = []
    try:
        from install import app_home, gflow_venv_python
    except Exception:
        app_home = None  # type: ignore[assignment]
        gflow_venv_python = None  # type: ignore[assignment]
    candidates: list[Path] = []
    if app_home is not None:
        candidates.append(app_home() / "uv-tools" / "gflow-cli")
    local = os.environ.get("LOCALAPPDATA") or ""
    roaming = os.environ.get("APPDATA") or ""
    if local:
        candidates.append(Path(local) / "uv" / "tools" / "gflow-cli")
        candidates.append(Path(local) / "OpenReelsPuente" / "uv-tools" / "gflow-cli")
    if roaming:
        candidates.append(Path(roaming) / "uv" / "tools" / "gflow-cli")
    for root in candidates:
        if not root.is_dir():
            continue
        for rel in ("Lib/site-packages", "lib/site-packages"):
            packed = root / rel
            if packed.is_dir():
                roots.append(packed)
        roots.extend(root.glob("lib/python*/site-packages"))
    if gflow_venv_python is not None:
        py = gflow_venv_python()
        if py and py.is_file():
            try:
                proc = subprocess.run(
                    [
                        str(py),
                        "-c",
                        "import gflow_cli, pathlib; print(pathlib.Path(gflow_cli.__file__).parent.parent)",
                    ],
                    capture_output=True,
                    text=True,
                    timeout=20,
                    check=False,
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0) if sys.platform == "win32" else 0,
                )
                found = Path((proc.stdout or "").strip())
                if found.is_dir():
                    roots.append(found)
            except Exception:
                pass
    seen: set[str] = set()
    unique: list[Path] = []
    for root in roots:
        key = str(root)
        if key in seen:
            continue
        seen.add(key)
        unique.append(root)
    return unique


def find_gflow_module(relative: str) -> Path | None:
    for root in _site_package_roots():
        path = root / relative
        if path.is_file():
            return path
    return None


def _apply_file(path: Path, rewriter) -> bool:
    original = path.read_text(encoding="utf-8")
    updated = rewriter(original)
    if updated == original:
        return False
    path.write_text(updated, encoding="utf-8")
    return True


def ensure_gflow_wait_patch(
    *,
    submit_s: float = SUBMIT_REPLY_S,
    grace_s: float = RESULT_URL_GRACE_S,
    log=print,
) -> list[str]:
    """Rewrite gflow-cli timeouts so Chrome stays open through Lower Priority."""
    changed: list[str] = []
    composer = find_gflow_module(_COMPOSER)
    if composer is None:
        log("[gflow-bridge] no encuentro migrated_composer.py — gflow seguirá cortando a 60s")
        return changed
    if _apply_file(
        composer,
        lambda text: patch_migrated_composer_source(text, submit_s=submit_s, grace_s=grace_s),
    ):
        changed.append(str(composer))
        log(
            f"[gflow-bridge] gflow: ACK de submit {submit_s:.0f}s y gracia URL {grace_s:.0f}s "
            f"(antes 60s/20s; si no, Chrome se cierra al ~26% y Flow cancela)"
        )
    else:
        log(f"[gflow-bridge] gflow ya espera el ACK {submit_s:.0f}s ({composer})")
    labs = find_gflow_module(_LABS_VIDEO)
    if labs is not None and _apply_file(
        labs, lambda text: patch_labs_video_source(text, submit_s=submit_s)
    ):
        changed.append(str(labs))
        log(f"[gflow-bridge] gflow labs: submit stage {submit_s:.0f}s")
    return changed
