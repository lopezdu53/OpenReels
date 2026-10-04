"""gflow-cli exit codes (docs/DEBUGGING.md + .env.template, develop / 0.82).

Fail-fast codes never wait for an mp4: Google did not queue a clip.
"""

from __future__ import annotations

import re
import time
from typing import Any

# Official table (gflow-cli DEBUGGING.md, 0.82.x):
#  3 AuthExpiredError — session cookies died
#  5 ContentPolicyError — Flow blocked the prompt
#  7 WireFormatError — clip/wire parse or download failed (may already be charged)
# 10 WafRejectionError — PUBLIC_ERROR_UNUSUAL_ACTIVITY, not charged
# 23 UiSelectorDriftError — Flow UI selector broke
# 31 FlowAppError — Flow dumped the session on /about
# 36 FlowHostMigratedError — labs kill switch / host moved (not “aspect missing”)
FAIL_FAST_CODES = {3, 5, 10, 23, 31, 36}
WIRE_DOWNLOAD_CODE = 7
WAF_CODE = 10
MIN_GFLOW_VERSION = "0.82.1"
# Documented default in gflow-cli .env.template
BROWSER_WINDOW_POSITION = "-30000,-30000"
JOB_GAP_S = 45.0
WAF_BACKOFF_S = (180.0, 600.0, 1800.0)

SUBMIT_OBSERVED_EVENTS = (
    "migrated.submit_observed",
    "submit_observed",
    "ui_automation.batch_request_intercepted",
    "ui_automation.batch_response_seen",
    "ui_automation.batch_response_captured",
    "ui_automation_video.submit_observed",
    "ui_automation_video.video_submitted",
)

_CLASS_TO_CODE = {
    "authexpirederror": 3,
    "contentpolicyerror": 5,
    "wireformaterror": 7,
    "wafrejectionerror": 10,
    "uiselectordrifterror": 23,
    "flowapperror": 31,
    "flowhostmigratederror": 36,
}

_FRIENDLY = {
    3: "La sesión de Flow caducó (gflow exit 3). En el Puente pulsa Entrar a Flow y vuelve a autenticar.",
    5: "Flow bloqueó el prompt por política de contenido (gflow exit 5). Cambia el texto; no se encoló el clip.",
    7: "gflow no pudo bajar el clip (exit 7, WireFormatError). Si ya se cobró, el Puente intenta `gflow data download`.",
    10: "Google rechazó el envío: actividad inusual (gflow exit 10, WafRejectionError). No se cobró ni se encoló el mp4. El Puente pausa la cola; no reintentes en ráfaga.",
    23: "gflow no encontró un control de Flow (exit 23, selector roto). Actualiza gflow-cli; no se envió el clip.",
    31: "Flow mandó la cuenta a /about (gflow exit 31). Abre Flow a mano, confirma la cuenta y reintenta luego.",
    36: "Esta cuenta está en flow.google.com (gflow exit 36, FlowHostMigratedError). El host de labs no sirve; no se encoló el clip.",
}

_LAST_JOB_END = 0.0
_WAF_UNTIL = 0.0
_WAF_STRIKES = 0


class GflowRunError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        code: int = 1,
        output: str = "",
        payload: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = int(code or 1)
        self.output = output or ""
        self.payload = payload


def exit_code_from_payload(payload: dict[str, Any] | None, proc_code: int) -> int:
    if payload and isinstance(payload.get("error"), dict):
        err = payload["error"]
        raw = err.get("exit_code")
        try:
            if raw is not None:
                return int(raw)
        except (TypeError, ValueError):
            pass
        klass = str(err.get("class") or "").strip().lower()
        if klass in _CLASS_TO_CODE:
            return _CLASS_TO_CODE[klass]
    text = str(payload or "")
    if proc_code:
        return int(proc_code)
    guessed = classify_code_from_text(text)
    return guessed or 1


def classify_code_from_text(text: str) -> int:
    low = (text or "").lower()
    if "wafrejection" in low or "unusual_activity" in low or "actividad inusual" in low:
        return 10
    if "flowhostmigrated" in low or "handed this session to flow.google.com" in low:
        return 36
    if "contentpolicy" in low or "policy of content" in low:
        return 5
    if "authexpired" in low or "auth expired" in low:
        return 3
    if "uiselectordrift" in low:
        return 23
    if "flowapperror" in low or "/about" in low:
        return 31
    if "wireformaterror" in low:
        return 7
    return 0


def is_fail_fast(code: int, text: str = "") -> bool:
    if int(code or 0) in FAIL_FAST_CODES:
        return True
    guessed = classify_code_from_text(text)
    return guessed in FAIL_FAST_CODES


def friendly_exit(code: int, fallback: str = "") -> str:
    msg = _FRIENDLY.get(int(code or 0))
    if msg:
        return msg
    return (fallback or f"gflow exit {code}")[:500]


def submit_was_observed(text: str) -> bool:
    low = (text or "").lower()
    return any(ev in low for ev in SUBMIT_OBSERVED_EVENTS)


def media_ids_from_text(text: str) -> list[str]:
    found = re.findall(
        r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
        text or "",
        flags=re.I,
    )
    out: list[str] = []
    for item in found:
        if item.lower() not in out:
            out.append(item.lower())
    return out


def mark_job_finished() -> None:
    global _LAST_JOB_END
    _LAST_JOB_END = time.time()


def pace_between_jobs() -> None:
    if _LAST_JOB_END <= 0:
        return
    wait = JOB_GAP_S - (time.time() - _LAST_JOB_END)
    if wait <= 0.5:
        return
    print(
        f"[gflow-bridge] pausa {wait:.0f}s entre envíos (un job a la vez)",
        flush=True,
    )
    time.sleep(wait)


def note_waf() -> None:
    global _WAF_UNTIL, _WAF_STRIKES
    idx = min(_WAF_STRIKES, len(WAF_BACKOFF_S) - 1)
    delay = WAF_BACKOFF_S[idx]
    _WAF_STRIKES += 1
    _WAF_UNTIL = time.time() + delay
    mins = max(1, int(delay / 60))
    print(
        f"[gflow-bridge] actividad inusual (exit 10). Cola en pausa {mins} min; no reintento en bucle.",
        flush=True,
    )


def raise_if_waf_cooldown() -> None:
    left = max(0.0, _WAF_UNTIL - time.time())
    if left <= 0:
        return
    mins = max(1, int(left / 60) + (1 if left % 60 else 0))
    raise GflowRunError(
        f"{friendly_exit(10)} Quedan ~{mins} min de pausa (3 / 10 / 30 min).",
        code=10,
    )


def reset_waf_for_tests() -> None:
    global _WAF_UNTIL, _WAF_STRIKES, _LAST_JOB_END
    _WAF_UNTIL = 0.0
    _WAF_STRIKES = 0
    _LAST_JOB_END = 0.0
