"""Persisted settings and log line tags. No Tk — safe to import in tests."""

from __future__ import annotations

import json
import os
from pathlib import Path

APP_DIR = Path(os.environ.get("APPDATA") or Path.home() / "AppData" / "Roaming") / "OpenReelsPuente"
CONFIG_PATH = APP_DIR / "config.json"
DEFAULT_SIZE = "1180x720"


def default_config() -> dict:
    return {
        "mode": "both",
        "token": "",
        "xeonIp": "192.168.1.71",
        "port": 8787,
        "studioUrl": "https://contenido.alfonsolopezd.com",
        "project": "",
        "projectName": "OpenReels",
        "autostart": False,
        "keepAwake": True,
        "chromeProfile": "Default",
        "gflowProfile": "",
        "gflowBin": "",
        "geometry": DEFAULT_SIZE,
    }


def load_config() -> dict:
    APP_DIR.mkdir(parents=True, exist_ok=True)
    cfg = default_config()
    if CONFIG_PATH.exists():
        try:
            stored = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
            if isinstance(stored, dict):
                cfg.update(stored)
        except Exception:
            pass
    return cfg


def save_config(cfg: dict) -> None:
    APP_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2), encoding="utf-8")


def classify_log(line: str) -> str:
    text = line.lower()
    if any(w in text for w in ("error", "fail", "falló", "fallo", "401", "crash", "traceback", "inválido")):
        return "err"
    if any(w in text for w in ("i2v", "veo", "clip de 8", "esperando")):
        return "i2v"
    if any(w in text for w in ("warn", "aviso", "404", "sin mp4", "no se guardó")):
        return "warn"
    if any(w in text for w in ("conectado", "listo", "ok", "mp4 listo", "sesión lista", "protegido")):
        return "ok"
    return "info"
