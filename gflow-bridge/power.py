"""Keep Windows from sleeping, locking, or ending the session while Flow runs.

A 5-minute film waits on 8s Veo clips with Chrome open. If the PC sleeps or
Windows locks the session, gflow loses the browser and the job falls back to
stills. This module holds a Power Request and pokes the idle timer.
"""

from __future__ import annotations

import ctypes
import sys
import threading
from ctypes import wintypes

ES_CONTINUOUS = 0x80000000
ES_SYSTEM_REQUIRED = 0x00000001
ES_DISPLAY_REQUIRED = 0x00000002
ES_AWAYMODE_REQUIRED = 0x00000040

POWER_REQUEST_CONTEXT_VERSION = 0
POWER_REQUEST_CONTEXT_SIMPLE_STRING = 0x1

PowerRequestDisplayRequired = 0
PowerRequestSystemRequired = 1
PowerRequestAwayModeRequired = 2
PowerRequestExecutionRequired = 3

VK_F16 = 0x7F
KEYEVENTF_KEYUP = 0x0002

REASON = "OpenReels Puente: generación de video en Google Flow"


class _REASON_CONTEXT(ctypes.Structure):
    class _REASON(ctypes.Union):
        class _Detailed(ctypes.Structure):
            _fields_ = [
                ("LocalizedReasonModule", wintypes.HMODULE),
                ("LocalizedReasonId", wintypes.ULONG),
                ("ReasonStringCount", wintypes.ULONG),
                ("ReasonStrings", ctypes.POINTER(wintypes.LPWSTR)),
            ]

        _fields_ = [
            ("Detailed", _Detailed),
            ("SimpleReasonString", wintypes.LPWSTR),
        ]

    _anonymous_ = ("Reason",)
    _fields_ = [
        ("Version", wintypes.ULONG),
        ("Flags", wintypes.DWORD),
        ("Reason", _REASON),
    ]


def is_windows() -> bool:
    return sys.platform == "win32"


class KeepAwake:
    """Prevent sleep / display-off / session idle lock while enabled."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._enabled = False
        self._handle = None
        self._hwnd = 0
        self._reason = REASON
        self._reason_wstr = None

    @property
    def enabled(self) -> bool:
        return self._enabled

    def set_hwnd(self, hwnd: int) -> None:
        self._hwnd = int(hwnd or 0)

    def enable(self, reason: str | None = None) -> str:
        with self._lock:
            self._reason = reason or REASON
            self._enabled = True
            if not is_windows():
                return "Evitar suspensión activo (este PC no es Windows)."
            self._clear_execution_state()
            self._create_power_request()
            self._set_execution_state()
            self._block_shutdown()
            return "PC protegido: no duerme ni cierra la sesión mientras el puente está abierto."

    def disable(self) -> str:
        with self._lock:
            self._enabled = False
            if not is_windows():
                return "Evitar suspensión desactivado."
            self._clear_execution_state()
            self._close_power_request()
            self._unblock_shutdown()
            return "Windows puede suspender o bloquear la sesión otra vez."

    def heartbeat(self) -> None:
        """Call every ~30s so idle timers and flaky Power Requests stay alive."""
        with self._lock:
            if not self._enabled or not is_windows():
                return
            self._set_execution_state()
            self._poke_idle()

    def _kernel32(self):
        k = ctypes.WinDLL("kernel32", use_last_error=True)
        k.SetThreadExecutionState.argtypes = [wintypes.DWORD]
        k.SetThreadExecutionState.restype = wintypes.DWORD
        return k

    def _powrprof(self):
        p = ctypes.WinDLL("powrprof", use_last_error=True)
        p.PowerCreateRequest.argtypes = [ctypes.POINTER(_REASON_CONTEXT)]
        p.PowerCreateRequest.restype = wintypes.HANDLE
        p.PowerSetRequest.argtypes = [wintypes.HANDLE, wintypes.DWORD]
        p.PowerSetRequest.restype = wintypes.BOOL
        p.PowerClearRequest.argtypes = [wintypes.HANDLE, wintypes.DWORD]
        p.PowerClearRequest.restype = wintypes.BOOL
        return p

    def _set_execution_state(self) -> None:
        flags = ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED | ES_AWAYMODE_REQUIRED
        try:
            self._kernel32().SetThreadExecutionState(flags)
        except Exception:
            pass

    def _clear_execution_state(self) -> None:
        try:
            self._kernel32().SetThreadExecutionState(ES_CONTINUOUS)
        except Exception:
            pass

    def _create_power_request(self) -> None:
        self._close_power_request()
        try:
            ctx = _REASON_CONTEXT()
            ctx.Version = POWER_REQUEST_CONTEXT_VERSION
            ctx.Flags = POWER_REQUEST_CONTEXT_SIMPLE_STRING
            self._reason_wstr = ctypes.c_wchar_p(self._reason)
            ctx.SimpleReasonString = self._reason_wstr
            handle = self._powrprof().PowerCreateRequest(ctypes.byref(ctx))
            invalid = ctypes.c_void_p(-1).value
            if not handle or handle == invalid:
                return
            self._handle = handle
            p = self._powrprof()
            for kind in (
                PowerRequestDisplayRequired,
                PowerRequestSystemRequired,
                PowerRequestAwayModeRequired,
                PowerRequestExecutionRequired,
            ):
                p.PowerSetRequest(handle, kind)
        except Exception:
            self._handle = None

    def _close_power_request(self) -> None:
        handle = self._handle
        self._handle = None
        if not handle:
            return
        try:
            p = self._powrprof()
            for kind in (
                PowerRequestDisplayRequired,
                PowerRequestSystemRequired,
                PowerRequestAwayModeRequired,
                PowerRequestExecutionRequired,
            ):
                p.PowerClearRequest(handle, kind)
            ctypes.WinDLL("kernel32").CloseHandle(handle)
        except Exception:
            pass

    def _poke_idle(self) -> None:
        """F16 up/down resets the idle timer without typing into Flow/Chrome."""
        try:
            user32 = ctypes.WinDLL("user32", use_last_error=True)
            user32.keybd_event(VK_F16, 0, 0, 0)
            user32.keybd_event(VK_F16, 0, KEYEVENTF_KEYUP, 0)
        except Exception:
            pass

    def _block_shutdown(self) -> None:
        if not self._hwnd:
            return
        try:
            user32 = ctypes.WinDLL("user32", use_last_error=True)
            user32.ShutdownBlockReasonCreate.argtypes = [wintypes.HWND, wintypes.LPCWSTR]
            user32.ShutdownBlockReasonCreate.restype = wintypes.BOOL
            user32.ShutdownBlockReasonCreate(self._hwnd, self._reason)
        except Exception:
            pass

    def _unblock_shutdown(self) -> None:
        if not self._hwnd:
            return
        try:
            user32 = ctypes.WinDLL("user32", use_last_error=True)
            user32.ShutdownBlockReasonDestroy.argtypes = [wintypes.HWND]
            user32.ShutdownBlockReasonDestroy.restype = wintypes.BOOL
            user32.ShutdownBlockReasonDestroy(self._hwnd)
        except Exception:
            pass


def toplevel_hwnd(widget) -> int:
    """HWND of a Tk toplevel on Windows; 0 elsewhere."""
    if not is_windows():
        return 0
    try:
        widget.update_idletasks()
        wid = int(widget.winfo_id())
        user32 = ctypes.windll.user32
        parent = user32.GetParent(wid)
        return int(parent or wid)
    except Exception:
        return 0
