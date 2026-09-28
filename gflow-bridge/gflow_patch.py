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

# Flow numeric statuses (gflow_cli.api.transports.batchexecute).
STATUS_RUNNING = 2
STATUS_DONE = 3
STATUS_SUBMITTED = 6
def generation_status_flags(status: int | None, *, seen_running: bool) -> tuple[bool, bool]:
    """Return (is_running, is_failed) for one Flow generation status.

    gflow 0.79 only treats 6/2 as in-flight and 3 as done. Lower Priority
    reports 4 (sometimes 1/5) *before* any 2 — that is the queue. The same
    4 *after* a 2 is Flow failing audio on a clip that already rendered;
    treating that 4 as queue made the Puente wait 3600s then hammer download.
    """
    if status == STATUS_DONE:
        return False, False
    if status == STATUS_RUNNING:
        return True, False
    if status == STATUS_SUBMITTED or status in (1, 5):
        return True, False
    if status == 4:
        if seen_running:
            return False, True
        return True, False
    if status is None:
        return False, False
    return False, True

_COMPOSER = "gflow_cli/api/transports/migrated_composer.py"
_LABS_VIDEO = "gflow_cli/api/transports/ui_automation_video.py"

RUNNER_SOURCE = r'''#!/usr/bin/env python3
"""In-memory gflow patches: wait for LP and do not close Chrome on fail."""
from __future__ import annotations

import asyncio
import base64
import os
import sys
from pathlib import Path


def _pace_s() -> float:
    try:
        return max(0.0, float(os.environ.get("GFLOW_BRIDGE_PACE_S") or "8"))
    except ValueError:
        return 8.0


def _wait_s() -> float:
    return float(
        os.environ.get("GFLOW_CLI_TIMEOUT_SECONDS")
        or os.environ.get("GFLOW_BRIDGE_SUBMIT_REPLY_S")
        or "3600"
    )


def _status_flags(status, seen_running: bool) -> tuple[bool, bool]:
    if status == 3:
        return False, False
    if status == 2:
        return True, False
    if status == 6 or status in (1, 5):
        return True, False
    if status == 4:
        if seen_running:
            return False, True
        return True, False
    if status is None:
        return False, False
    return False, True


async def _page_video_srcs(page) -> list[str]:
    try:
        raw = await page.evaluate(
            """() => {
              const out = [];
              for (const v of document.querySelectorAll("video")) {
                if (v.currentSrc) out.push(v.currentSrc);
                if (v.src) out.push(v.src);
                for (const s of v.querySelectorAll("source")) {
                  if (s.src) out.push(s.src);
                }
              }
              return out;
            }"""
        )
    except Exception:
        return []
    return [u for u in (raw or []) if isinstance(u, str) and u]


async def _save_blob_mp4(page, blob_url: str, dest: Path) -> bool:
    try:
        data = await page.evaluate(
            """async (u) => {
              const r = await fetch(u);
              const buf = await r.arrayBuffer();
              const bytes = new Uint8Array(buf);
              let s = "";
              const chunk = 0x8000;
              for (let i = 0; i < bytes.length; i += chunk) {
                s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
              }
              return btoa(s);
            }""",
            blob_url,
        )
        body = base64.b64decode(data or "")
    except Exception as err:
        print(f"[gflow-bridge] blob mp4: {err}", flush=True)
        return False
    if len(body) > 20_000 and body[4:8] == b"ftyp":
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(body)
        print(f"[gflow-bridge] guardé mp4 desde Chrome ({len(body)} bytes) {dest}", flush=True)
        return True
    return False


async def _harvest_video(page, media_id: str) -> str | None:
    found: list[str] = []

    def on_resp(resp) -> None:
        url = str(getattr(resp, "url", "") or "")
        low = url.lower()
        if "flow-content.google" in low or low.endswith(".mp4"):
            found.append(url)

    page.on("response", on_resp)
    try:
        for _ in range(12):
            srcs = await _page_video_srcs(page)
            for src in srcs:
                if src.startswith("https://") or src.startswith("blob:"):
                    return src
            if found:
                return found[0]
            await asyncio.sleep(5)
    finally:
        try:
            page.remove_listener("response", on_resp)
        except Exception:
            pass
    srcs = await _page_video_srcs(page)
    for src in srcs:
        if src.startswith("https://") or src.startswith("blob:"):
            return src
    return found[0] if found else None


async def _page_unusual_activity(page) -> str | None:
    try:
        text = await page.evaluate("() => (document.body && document.body.innerText) || ''")
    except Exception:
        return None
    compact = " ".join((text or "").lower().split())
    for needle in (
        "actividad inusual",
        "unusual activity",
        "no se te cobró",
        "no se te cobro",
        "you were not charged",
        "not charged for this",
        "no se pudo completar la acción",
        "no se pudo completar la accion",
        "couldn't complete the action",
        "could not complete the action",
    ):
        if needle in compact:
            return needle
    return None


def _wire_unusual(text: str) -> bool:
    return "PUBLIC_ERROR_UNUSUAL_ACTIVITY" in (text or "")


def _unusual_activity_error():
    # gflow 0.79 wraps bare RuntimeError as UnexpectedError (no detail).
    # WafRejectionError is the class develop #909 uses for this same reason.
    try:
        from gflow_cli.errors import WafRejectionError

        err = WafRejectionError(
            detail=(
                "UNUSUAL_ACTIVITY: Flow detectó actividad inusual y no generó. "
                "No se cobró. Espera 20–30 min, abre Flow a mano y genera 1 still. "
                "No lances varios jobs seguidos."
            ),
            remediation_hint=(
                "Flow scored this profile as a bot (PUBLIC_ERROR_UNUSUAL_ACTIVITY). "
                "The prompt is not the cause. Wait hours or use another Gmail."
            ),
        )
        err.retryable = False
        return err
    except Exception:
        return RuntimeError(
            "UNUSUAL_ACTIVITY: Flow detectó actividad inusual y no generó. "
            "No se cobró. Espera 20–30 min, abre Flow a mano y genera 1 still. "
            "No lances varios jobs seguidos."
        )


async def _harvest_page_images(page) -> list[str]:
    try:
        raw = await page.evaluate(
            """() => {
              const out = [];
              for (const img of document.querySelectorAll("img")) {
                const s = img.currentSrc || img.src || "";
                if (s.startsWith("https://") && (s.includes("google") || s.includes("ggpht") || s.includes("fife"))) {
                  out.push(s);
                }
              }
              return out;
            }"""
        )
    except Exception:
        return []
    return [u for u in (raw or []) if isinstance(u, str) and u.startswith("https://")]


def _patch() -> None:
    submit = _wait_s()
    grace = float(os.environ.get("GFLOW_BRIDGE_RESULT_URL_GRACE_S", "1200"))
    keep = os.environ.get("GFLOW_BRIDGE_KEEP_CHROME", "1") == "1"
    seen_run: dict[str, bool] = {}
    hold_chrome = {"value": keep}
    try:
        from gflow_cli.api.transports import batchexecute as be

        def _is_running(self) -> bool:
            if self.status == be.STATUS_RUNNING:
                mid = getattr(self, "media_id", "") or ""
                if mid:
                    seen_run[mid] = True
            running, _failed = _status_flags(self.status, seen_run.get(getattr(self, "media_id", "") or "", False))
            return running

        def _is_failed(self) -> bool:
            _running, failed = _status_flags(self.status, seen_run.get(getattr(self, "media_id", "") or "", False))
            return failed

        be.GenerationRecord.is_running = property(_is_running)
        be.GenerationRecord.is_failed = property(_is_failed)
        print(
            "[gflow-bridge] status 4 = en cola solo ANTES de generar; "
            "si ya hubo status 2, 4 = audio falló (no espero 60 min)",
            flush=True,
        )
    except Exception as err:
        print(f"[gflow-bridge] runtime patch status: {err}", flush=True)
    try:
        import gflow_cli.api.transports.migrated_composer as mc
        from gflow_cli.api.transports import batchexecute as be

        mc.SUBMIT_REPLY_BUDGET_S = submit
        mc.RESULT_URL_GRACE_S = grace
        orig_sub = mc.MigratedComposer.submit_and_observe
        orig_dl = mc.MigratedComposer.download

        async def _submit_wait(self, page, *args, **kwargs):
            wait = _wait_s()
            kwargs["poll_timeout_s"] = wait
            mc.SUBMIT_REPLY_BUDGET_S = wait
            print(f"[gflow-bridge] submit_and_observe wait={wait:.0f}s", flush=True)
            pace = _pace_s()
            if pace > 0:
                print(
                    f"[gflow-bridge] espero {pace:.0f}s antes de Generate video "
                    "(ritmo humano; el CLI solo tarda 2s y Flow lo marca)",
                    flush=True,
                )
                await asyncio.sleep(pace)
            if await _page_unusual_activity(page):
                print(
                    "[gflow-bridge] toast de actividad inusual ya visible; no pulso Generate.",
                    flush=True,
                )
                raise _unusual_activity_error()
            try:
                rec = await orig_sub(self, page, *args, **kwargs)
            except Exception as err:
                if _wire_unusual(str(err)) or await _page_unusual_activity(page):
                    print(
                        "[gflow-bridge] Flow bloqueó el video: actividad inusual. No se cobró.",
                        flush=True,
                    )
                    raise _unusual_activity_error() from err
                raise
            mid = getattr(rec, "media_id", "") or ""
            if rec is not None and rec.status == 4 and seen_run.get(mid):
                print(
                    "[gflow-bridge] Flow status 4 después del video: "
                    "falló el audio. Busco el mp4 en Chrome ~60s…",
                    flush=True,
                )
                harvested = await _harvest_video(page, mid)
                out_dir = Path(os.environ.get("GFLOW_CLI_OUTPUT_DIR") or os.getcwd())
                if harvested and harvested.startswith("blob:"):
                    dest = out_dir / "out.mp4"
                    if await _save_blob_mp4(page, harvested, dest):
                        hold_chrome["value"] = False
                        return be.GenerationRecord(
                            workflow_id=rec.workflow_id,
                            project_id=rec.project_id,
                            media_id=rec.media_id,
                            status=be.STATUS_DONE,
                            video_url=rec.video_url,
                            poster_url=rec.poster_url,
                            size_bytes=dest.stat().st_size,
                        )
                if harvested and harvested.startswith("https://"):
                    print(
                        f"[gflow-bridge] encontré URL del video tras fallo de audio: {harvested[:80]}",
                        flush=True,
                    )
                    hold_chrome["value"] = False
                    return be.GenerationRecord(
                        workflow_id=rec.workflow_id,
                        project_id=rec.project_id,
                        media_id=rec.media_id,
                        status=be.STATUS_DONE,
                        video_url=harvested,
                        poster_url=rec.poster_url,
                        size_bytes=rec.size_bytes,
                    )
                print(
                    "[gflow-bridge] no hay URL del mp4: Flow falló el audio. "
                    "No espero 60 min ni reintento el catálogo 20 min.",
                    flush=True,
                )
                hold_chrome["value"] = False
            elif rec is not None and rec.status == be.STATUS_DONE:
                hold_chrome["value"] = False
            return rec

        async def _download_existing(self, page, record, out_dir):
            dest_dir = Path(out_dir or os.environ.get("GFLOW_CLI_OUTPUT_DIR") or os.getcwd())
            ready = dest_dir / "out.mp4"
            if ready.is_file() and ready.stat().st_size > 20_000:
                print(f"[gflow-bridge] mp4 ya estaba en {ready}", flush=True)
                return ready
            return await orig_dl(self, page, record, out_dir)

        mc.MigratedComposer.submit_and_observe = _submit_wait
        mc.MigratedComposer.download = _download_existing
        orig_select = mc.MigratedComposer._select
        orig_img = mc.MigratedComposer.submit_images_and_observe

        async def _select_soft_duration(self, page, pane, *, axis, lig=None, text=None):
            try:
                return await orig_select(self, page, pane, axis=axis, lig=lig, text=text)
            except Exception as err:
                if axis != "duration":
                    raise
                print(
                    f"[gflow-bridge] Flow no tiene duración {text or lig}; "
                    "sigo con la que ya está en el editor.",
                    flush=True,
                )
                return None

        async def _submit_images_flex(self, page, request, *args, **kwargs):
            extra: list = []
            refused: dict = {}

            def on_any(resp) -> None:
                url = str(getattr(resp, "url", "") or "")
                if "batchexecute" not in url.lower():
                    return

                async def _eat() -> None:
                    try:
                        text = await resp.text()
                    except Exception:
                        return
                    if _wire_unusual(text):
                        refused["unusual"] = True
                        print(
                            "[gflow-bridge] wire PUBLIC_ERROR_UNUSUAL_ACTIVITY (ogiZ0b vacío a propósito)",
                            flush=True,
                        )
                        return
                    try:
                        for rpcid, payload in be.parse_frames(text):
                            recs = be.image_records(rpcid, payload)
                            if recs:
                                extra.extend(recs)
                                print(
                                    f"[gflow-bridge] imagen en rpc={rpcid} n={len(recs)}",
                                    flush=True,
                                )
                    except Exception:
                        return

                asyncio.create_task(_eat())

            page.on("response", on_any)
            try:
                pace = _pace_s()
                if pace > 0:
                    print(
                        f"[gflow-bridge] espero {pace:.0f}s antes de Generate still "
                        "(ritmo humano; el CLI solo tarda 2s y Flow lo marca)",
                        flush=True,
                    )
                    await asyncio.sleep(pace)
                if await _page_unusual_activity(page):
                    print(
                        "[gflow-bridge] toast de actividad inusual ya visible; no pulso Generate.",
                        flush=True,
                    )
                    raise _unusual_activity_error()
                try:
                    recs = await orig_img(self, page, request, *args, **kwargs)
                    if refused.get("unusual"):
                        raise _unusual_activity_error()
                    return recs
                except Exception as err:
                    if refused.get("unusual") or _wire_unusual(str(err)) or await _page_unusual_activity(page):
                        print(
                            "[gflow-bridge] Flow bloqueó: actividad inusual. No se cobró. "
                            "No reintento.",
                            flush=True,
                        )
                        raise _unusual_activity_error() from err
                    msg = str(err).lower()
                    if "ogiz0b" not in msg and "wireformat" not in msg:
                        raise
                    print(
                        "[gflow-bridge] ogiZ0b vacío; espero otra respuesta o la imagen en Chrome…",
                        flush=True,
                    )
                    for _ in range(20):
                        if extra:
                            break
                        await asyncio.sleep(1.5)
                    rec = extra[0] if extra else None
                    url = rec.image_url if rec is not None else None
                    if not url:
                        urls = await _harvest_page_images(page)
                        url = urls[0] if urls else None
                    if not url:
                        raise
                    from gflow_cli.api.dto import GeneratedImage

                    return [
                        GeneratedImage(
                            media_name=getattr(rec, "media_id", None) or "harvested",
                            workflow_id=getattr(rec, "workflow_id", None) or "harvested",
                            seed=int(getattr(rec, "seed", 0) or 0),
                            prompt=getattr(rec, "prompt", None) or "",
                            model_name_type=None,
                            aspect_ratio=getattr(getattr(request, "aspect", None), "value", None)
                            or "IMAGE_ASPECT_RATIO_PORTRAIT",
                            fife_url=url,
                            dimensions=getattr(rec, "dimensions", None) or (1080, 1920),
                            display_name=getattr(rec, "display_name", None),
                        )
                    ]
            finally:
                try:
                    page.remove_listener("response", on_any)
                except Exception:
                    pass

        mc.MigratedComposer._select = _select_soft_duration
        mc.MigratedComposer.submit_images_and_observe = _submit_images_flex
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
            if os.environ.get("GFLOW_BRIDGE_KEEP_CHROME") == "1" and hold_chrome["value"]:
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
            if os.environ.get("GFLOW_BRIDGE_KEEP_CHROME") == "1" and hold_chrome["value"]:
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
