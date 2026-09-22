"""Keep Flow Chrome open: gflow 0.79 hard-caps the submit ACK at 60s.

On flow.google.com, `SUBMIT_REPLY_BUDGET_S = 60` (migrated_composer). If Playwright
misses YhhmEf — or Lower Priority has not ACKed yet — gflow exits, Playwright
closes Chrome, and Flow aborts the clip that was still at ~26%. The local
`gflow data list` catalog stays empty because nothing was recorded.

Rewriting the .py on disk is not enough: the Puente still launched `gflow.exe`,
which kept the 60s cap (1.6.5 died at ~56s). We now run the venv Python with an
in-memory patch before `gflow_cli.cli.main()`.
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

RUNNER_SOURCE = r'''#!/usr/bin/env python3
"""In-memory gflow patches: wait for LP and do not close Chrome on fail."""
from __future__ import annotations

import os
import sys


def _wait_s() -> float:
    return float(
        os.environ.get("GFLOW_CLI_TIMEOUT_SECONDS")
        or os.environ.get("GFLOW_BRIDGE_SUBMIT_REPLY_S")
        or "3600"
    )


def _patch() -> None:
    submit = _wait_s()
    grace = float(os.environ.get("GFLOW_BRIDGE_RESULT_URL_GRACE_S", "1200"))
    keep = os.environ.get("GFLOW_BRIDGE_KEEP_CHROME", "1") == "1"
    try:
        from gflow_cli.api.transports import batchexecute as be

        # gflow only knows 6=submitted, 2=running, 3=done. Lower Priority
        # reports 4 (and sometimes 1/5) while still queued; treating 4 as
        # fail kills the clip at ~24% / ~35s.
        pending = {1, 4, 5, be.STATUS_RUNNING, be.STATUS_SUBMITTED}

        def _is_running(self) -> bool:
            return self.status in pending

        def _is_failed(self) -> bool:
            return (
                self.status is not None
                and self.status != be.STATUS_DONE
                and self.status not in pending
            )

        be.GenerationRecord.is_running = property(_is_running)
        be.GenerationRecord.is_failed = property(_is_failed)
        print(
            f"[gflow-bridge] status 4/1/5 = en cola (sigo esperando). running={sorted(pending)}",
            flush=True,
        )
    except Exception as err:
        print(f"[gflow-bridge] runtime patch status: {err}", flush=True)
    try:
        import gflow_cli.api.transports.migrated_composer as mc

        mc.SUBMIT_REPLY_BUDGET_S = submit
        mc.RESULT_URL_GRACE_S = grace
        orig_sub = mc.MigratedComposer.submit_and_observe

        async def _submit_wait(self, page, *args, **kwargs):
            wait = _wait_s()
            kwargs["poll_timeout_s"] = wait
            mc.SUBMIT_REPLY_BUDGET_S = wait
            print(f"[gflow-bridge] submit_and_observe wait={wait:.0f}s", flush=True)
            return await orig_sub(self, page, *args, **kwargs)

        mc.MigratedComposer.submit_and_observe = _submit_wait
        print(
            f"[gflow-bridge] runtime ACK={mc.SUBMIT_REPLY_BUDGET_S:.0f}s "
            f"grace={mc.RESULT_URL_GRACE_S:.0f}s keep_chrome={keep}",
            flush=True,
        )
    except Exception as err:
        print(f"[gflow-bridge] runtime patch composer: {err}", flush=True)
    try:
        import gflow_cli.api.transports.ui_automation_video as labs

        labs.SUBMIT_STAGE_TIMEOUT_S = submit
    except Exception:
        pass
    try:
        from gflow_cli.api.client import FlowApiClient

        orig_gv = FlowApiClient.generate_video

        async def _gv_wait(self, *args, **kwargs):
            kwargs["poll_timeout_s"] = _wait_s()
            print(
                f"[gflow-bridge] generate_video poll_timeout={kwargs['poll_timeout_s']:.0f}s",
                flush=True,
            )
            return await orig_gv(self, *args, **kwargs)

        FlowApiClient.generate_video = _gv_wait
        orig_close = FlowApiClient._close_browser_resources

        async def _close_keep(self, *args, **kwargs):
            if os.environ.get("GFLOW_BRIDGE_KEEP_CHROME") == "1":
                print("[gflow-bridge] keep Chrome: no cierro Playwright", flush=True)
                return None
            return await orig_close(self, *args, **kwargs)

        FlowApiClient._close_browser_resources = _close_keep
    except Exception as err:
        print(f"[gflow-bridge] runtime patch client: {err}", flush=True)
    try:
        from gflow_cli.api.transports.ui_automation import UiAutomationTransport

        orig_td = UiAutomationTransport.teardown

        async def _td_keep(self, *args, **kwargs):
            if os.environ.get("GFLOW_BRIDGE_KEEP_CHROME") == "1":
                print("[gflow-bridge] keep Chrome: no ui teardown", flush=True)
                return None
            return await orig_td(self, *args, **kwargs)

        UiAutomationTransport.teardown = _td_keep
    except Exception as err:
        print(f"[gflow-bridge] runtime patch ui teardown: {err}", flush=True)


if __name__ == "__main__":
    _patch()
    sys.argv = ["gflow", *sys.argv[1:]]
    from gflow_cli.cli import main

    main()
'''


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


def find_gflow_python(gflow_bin: str = "") -> Path | None:
    """Python of the uv tool venv that actually imports gflow_cli."""
    guesses: list[Path] = []
    try:
        from install import app_home, gflow_venv_python
    except Exception:
        app_home = None  # type: ignore[assignment]
        gflow_venv_python = None  # type: ignore[assignment]
    if gflow_venv_python is not None:
        py = gflow_venv_python()
        if py is not None:
            guesses.append(py)
    homes: list[Path] = []
    if app_home is not None:
        homes.append(app_home())
    local = os.environ.get("LOCALAPPDATA") or ""
    roaming = os.environ.get("APPDATA") or ""
    if local:
        homes.append(Path(local) / "OpenReelsPuente")
        homes.append(Path(local) / "uv" / "tools")
    if roaming:
        homes.append(Path(roaming) / "uv" / "tools")
    bin_path = Path(gflow_bin or os.environ.get("GFLOW_CLI_BIN") or "")
    if str(bin_path):
        guesses.append(bin_path.with_name("python.exe"))
        guesses.append(bin_path.with_name("python"))
        parent = bin_path.parent
        homes.append(parent.parent)
        homes.append(parent.parent / "uv-tools")
        homes.append(parent.parent / "uv-tools" / "gflow-cli")
        if parent.name.lower() == "scripts":
            homes.append(parent.parent)
    for home in homes:
        guesses.extend(
            [
                home / "uv-tools" / "gflow-cli" / "Scripts" / "python.exe",
                home / "uv-tools" / "gflow-cli" / "Scripts" / "python",
                home / "uv-tools" / "gflow-cli" / "bin" / "python.exe",
                home / "uv-tools" / "gflow-cli" / "bin" / "python",
                home / "gflow-cli" / "Scripts" / "python.exe",
                home / "Scripts" / "python.exe",
            ]
        )
        cfg = home / "uv-tools" / "gflow-cli" / "pyvenv.cfg"
        if not cfg.is_file() and (home / "pyvenv.cfg").is_file():
            cfg = home / "pyvenv.cfg"
        if cfg.is_file():
            root = cfg.parent
            guesses.extend(
                [
                    root / "Scripts" / "python.exe",
                    root / "Scripts" / "python",
                    root / "bin" / "python.exe",
                    root / "bin" / "python",
                ]
            )
    seen: set[str] = set()
    for guess in guesses:
        key = str(guess)
        if key in seen:
            continue
        seen.add(key)
        if guess.is_file():
            return guess
    if app_home is not None:
        venv = app_home() / "uv-tools" / "gflow-cli"
        if venv.is_dir():
            for name in ("python.exe", "python"):
                hits = list(venv.rglob(name))
                for hit in hits:
                    if hit.is_file() and ("Scripts" in hit.parts or "bin" in hit.parts):
                        return hit
    return None


def write_runtime_runner() -> Path:
    try:
        from install import app_home

        dest = app_home() / "gflow_runtime_patch.py"
    except Exception:
        dest = Path(os.environ.get("TEMP") or "/tmp") / "gflow_runtime_patch.py"
    dest.write_text(RUNNER_SOURCE, encoding="utf-8")
    return dest


def gflow_exec_command(gflow_bin: str, args: list[str]) -> list[str]:
    """Prefer venv python + in-memory ACK patch over raw gflow.exe."""
    py = find_gflow_python(gflow_bin)
    if py is None:
        return [gflow_bin, *args, "--json"]
    return [str(py), str(write_runtime_runner()), *args, "--json"]


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
