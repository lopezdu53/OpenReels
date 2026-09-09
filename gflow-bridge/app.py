#!/usr/bin/env python3
"""OpenReels Puente — GUI Windows (LAN al Xeon y/o remoto al estudio)."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
from http.server import ThreadingHTTPServer
from pathlib import Path

try:
    import tkinter as tk
    from tkinter import messagebox, scrolledtext
except ImportError as err:  # pragma: no cover
    raise SystemExit("Necesitas Python con Tcl/Tk (el instalador oficial de python.org)") from err

import server
from profiles import (
    find_gflow,
    gflow_login_cmd,
    list_chrome_profiles,
    list_gflow_accounts,
    missing_gflow_message,
    open_flow_in_chrome,
)
from relay_client import run_poll_loop

APP_DIR = Path(os.environ.get("APPDATA") or Path.home() / "AppData" / "Roaming") / "OpenReelsPuente"
CONFIG_PATH = APP_DIR / "config.json"
BG = "#000000"
CARD = "#1c1c1e"
LIME = "#d8ff00"
FG = "#ffffff"
MUTED = "#8e8e93"


def load_config() -> dict:
    APP_DIR.mkdir(parents=True, exist_ok=True)
    if CONFIG_PATH.exists():
        try:
            return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {
        "mode": "both",
        "token": "",
        "xeonIp": "192.168.1.71",
        "port": 8787,
        "studioUrl": "https://contenido.alfonsolopezd.com",
        "project": "",
        "projectName": "OpenReels",
        "autostart": False,
        "chromeProfile": "Default",
        "gflowProfile": "",
        "gflowBin": "",
    }


def save_config(cfg: dict) -> None:
    APP_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2), encoding="utf-8")


def pythonw_cmd() -> list[str]:
    exe = sys.executable
    if exe.lower().endswith("python.exe"):
        alt = exe[:-10] + "pythonw.exe"
        if Path(alt).exists():
            exe = alt
    script = str(Path(__file__).resolve())
    return [exe, script]


class App(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("OpenReels Puente")
        self.configure(bg=BG)
        self.geometry("640x820")
        self.minsize(560, 700)
        self.cfg = load_config()
        self.httpd: ThreadingHTTPServer | None = None
        self.http_thread: threading.Thread | None = None
        self.relay_thread: threading.Thread | None = None
        self.stop_relay = threading.Event()
        self.running = False

        self.mode = tk.StringVar(value=self.cfg.get("mode") or "both")
        self.token = tk.StringVar(value=self.cfg.get("token") or "")
        self.xeon = tk.StringVar(value=self.cfg.get("xeonIp") or "192.168.1.71")
        self.port = tk.StringVar(value=str(self.cfg.get("port") or 8787))
        self.studio = tk.StringVar(value=self.cfg.get("studioUrl") or "https://contenido.alfonsolopezd.com")
        self.project = tk.StringVar(value=self.cfg.get("project") or "")
        self.project_name = tk.StringVar(value=self.cfg.get("projectName") or "OpenReels")
        self.gflow_profile = tk.StringVar(value=self.cfg.get("gflowProfile") or "")
        self.gflow_bin = tk.StringVar(value=self.cfg.get("gflowBin") or find_gflow() or "")
        self.chrome_choice = tk.StringVar(value="")
        self.status = tk.StringVar(value="Apagado")
        self._chrome_by_label: dict[str, str] = {}

        self._build()
        self.protocol("WM_DELETE_WINDOW", self.on_close)
        if self.cfg.get("autostart"):
            self.after(400, self.start)

    def _build(self) -> None:
        pad = {"padx": 16, "pady": 4}
        head = tk.Frame(self, bg=BG)
        head.pack(fill="x", **pad)
        tk.Label(head, text="OPENREELS PUENTE", fg=LIME, bg=BG, font=("Segoe UI", 16, "bold")).pack(anchor="w")
        tk.Label(
            head,
            text="Un clic. Chrome + Flow en ESTE PC. Varios Gmail: elige el perfil de Chrome del plan Gemini, luego «Entrar a Flow».",
            fg=MUTED,
            bg=BG,
            wraplength=600,
            justify="left",
        ).pack(anchor="w")

        card = tk.Frame(self, bg=CARD)
        card.pack(fill="x", padx=16, pady=8)
        tk.Label(card, text="Dónde estás", fg=LIME, bg=CARD, font=("Segoe UI", 9, "bold")).pack(anchor="w", padx=12, pady=(10, 2))
        modes = tk.Frame(card, bg=CARD)
        modes.pack(fill="x", padx=12, pady=4)
        for value, label in (
            ("local", "En casa (red local → Xeon)"),
            ("remote", "Fuera de casa (remoto → estudio)"),
            ("both", "Ambos (casa + nube)"),
        ):
            tk.Radiobutton(
                modes,
                text=label,
                variable=self.mode,
                value=value,
                fg=FG,
                bg=CARD,
                selectcolor=BG,
                activebackground=CARD,
                activeforeground=LIME,
                highlightthickness=0,
            ).pack(anchor="w")

        form = tk.Frame(card, bg=CARD)
        form.pack(fill="x", padx=12, pady=8)
        self._field(form, "Token (el mismo que en EasyPanel)", self.token, show="•")
        self._field(form, "IP del Xeon (solo local)", self.xeon)
        self._field(form, "Puerto local", self.port)
        self._field(form, "URL del estudio (remoto)", self.studio)
        self._field(form, "Project id de Flow (gflow project list)", self.project)
        self._field(form, "Nombre del proyecto", self.project_name)
        self._chrome_menu(form)
        self._field(form, "Perfil gflow (vacío = default). Tras login se nombra con tu Gmail.", self.gflow_profile)
        self._field(form, "Ruta de gflow.exe (si WinError 2, pégala aquí)", self.gflow_bin)

        btns = tk.Frame(self, bg=BG)
        btns.pack(fill="x", padx=16, pady=(8, 2))
        self.go = tk.Button(
            btns,
            text="Conectar",
            command=self.toggle,
            bg=LIME,
            fg=BG,
            font=("Segoe UI", 12, "bold"),
            relief="flat",
            padx=16,
            pady=8,
        )
        self.go.pack(side="left")
        tk.Button(btns, text="Abrir Flow", command=self.open_flow, bg=CARD, fg=FG, relief="flat", padx=12, pady=8).pack(
            side="left", padx=8
        )
        tk.Button(btns, text="Entrar a Flow", command=self.login_flow, bg=CARD, fg=FG, relief="flat", padx=12, pady=8).pack(
            side="left"
        )
        row2 = tk.Frame(self, bg=BG)
        row2.pack(fill="x", padx=16, pady=(2, 8))
        tk.Button(row2, text="Firewall Xeon", command=self.firewall, bg=CARD, fg=FG, relief="flat", padx=12, pady=8).pack(
            side="left"
        )
        tk.Button(row2, text="Inicio con Windows", command=self.toggle_autostart, bg=CARD, fg=FG, relief="flat", padx=12, pady=8).pack(
            side="left", padx=8
        )

        tk.Label(self, textvariable=self.status, fg=LIME, bg=BG, font=("Segoe UI", 10, "bold")).pack(anchor="w", padx=16)
        self.log = scrolledtext.ScrolledText(self, height=14, bg=CARD, fg=FG, insertbackground=FG, relief="flat")
        self.log.pack(fill="both", expand=True, padx=16, pady=(4, 16))
        self._log("Listo. 1) Elige el Chrome del Gmail Gemini. 2) Entrar a Flow. 3) Token + Conectar.")
        self._log("gflow no usa tu Chrome de cada día: al entrar, en la ventana nueva elige ESA cuenta Gemini.")
        self._refresh_gflow_hint()

    def _field(self, parent: tk.Frame, label: str, var: tk.StringVar, show: str | None = None) -> None:
        tk.Label(parent, text=label, fg=MUTED, bg=CARD, font=("Segoe UI", 8)).pack(anchor="w")
        kw: dict = {"textvariable": var, "bg": BG, "fg": FG, "insertbackground": FG, "relief": "flat"}
        if show:
            kw["show"] = show
        tk.Entry(parent, **kw).pack(fill="x", pady=(0, 8), ipady=6)

    def _chrome_menu(self, parent: tk.Frame) -> None:
        tk.Label(
            parent,
            text="Chrome (cuenta Gmail / perfil). Elige el que tiene Gemini Flow.",
            fg=MUTED,
            bg=CARD,
            font=("Segoe UI", 8),
        ).pack(anchor="w")
        profiles = list_chrome_profiles() or [{"directory": "Default", "label": "Default"}]
        self._chrome_by_label = {row["label"]: row["directory"] for row in profiles}
        saved = str(self.cfg.get("chromeProfile") or "Default")
        initial = next(
            (row["label"] for row in profiles if row["directory"] == saved),
            profiles[0]["label"],
        )
        self.chrome_choice.set(initial)
        menu = tk.OptionMenu(parent, self.chrome_choice, *self._chrome_by_label.keys())
        menu.configure(bg=BG, fg=FG, highlightthickness=0, activebackground=CARD, activeforeground=LIME)
        menu.pack(fill="x", pady=(0, 8))

    def _chrome_directory(self) -> str:
        return self._chrome_by_label.get(self.chrome_choice.get(), "Default")

    def _refresh_gflow_hint(self) -> None:
        found = find_gflow(self.gflow_bin.get())
        if found:
            if not self.gflow_bin.get().strip():
                self.gflow_bin.set(found)
            self._log(f"gflow-cli: {found}")
        else:
            self._log(missing_gflow_message())
        accounts = list_gflow_accounts()
        if accounts:
            self._log("Sesiones gflow en este PC: " + " | ".join(accounts))
        else:
            self._log("Aún no hay sesión Flow. Pulsa «Entrar a Flow» y entra con el Gmail Gemini (plan).")

    def open_flow(self) -> None:
        directory = self._chrome_directory()
        try:
            open_flow_in_chrome(directory)
            self._log(f"Chrome perfil «{directory}» → Flow. Agent OFF. Debe ser el Gmail del plan Gemini.")
        except Exception as err:
            messagebox.showerror("Chrome", str(err))

    def login_flow(self) -> None:
        self.persist()
        bin_path = find_gflow(self.gflow_bin.get())
        if not bin_path:
            messagebox.showerror("gflow-cli", missing_gflow_message())
            return
        self.gflow_bin.set(bin_path)
        cmd = gflow_login_cmd(bin_path, self.gflow_profile.get())
        self._log("Abriendo Chrome de gflow. En el selector de Google elige el Gmail del plan Gemini/Flow.")
        self._log("Cuando cargue el editor de Flow, cierra esa ventana de Chrome. No uses otro Gmail.")
        try:
            flags = 0
            if sys.platform == "win32":
                flags = getattr(subprocess, "CREATE_NEW_CONSOLE", 0)
            subprocess.Popen(cmd, creationflags=flags)
        except FileNotFoundError:
            messagebox.showerror("gflow-cli", missing_gflow_message())
        except Exception as err:
            messagebox.showerror("Entrar a Flow", str(err))

    def _log(self, line: str) -> None:
        def append() -> None:
            self.log.insert("end", line + "\n")
            self.log.see("end")

        self.after(0, append)

    def persist(self) -> None:
        self.cfg.update(
            {
                "mode": self.mode.get(),
                "token": self.token.get().strip(),
                "xeonIp": self.xeon.get().strip(),
                "port": int(self.port.get() or 8787),
                "studioUrl": self.studio.get().strip(),
                "project": self.project.get().strip(),
                "projectName": self.project_name.get().strip(),
                "chromeProfile": self._chrome_directory(),
                "gflowProfile": self.gflow_profile.get().strip(),
                "gflowBin": self.gflow_bin.get().strip(),
            }
        )
        save_config(self.cfg)

    def toggle(self) -> None:
        if self.running:
            self.stop()
        else:
            self.start()

    def start(self) -> None:
        self.persist()
        token = self.token.get().strip()
        if not token:
            messagebox.showerror("Token", "Pega el mismo GFLOW_BRIDGE_TOKEN que en EasyPanel.")
            return
        mode = self.mode.get()
        try:
            port = int(self.port.get() or 8787)
        except ValueError:
            messagebox.showerror("Puerto", "Puerto inválido")
            return
        allow = self.xeon.get().strip()
        gflow_bin = find_gflow(self.gflow_bin.get()) or self.gflow_bin.get().strip()
        if not find_gflow(self.gflow_bin.get()):
            messagebox.showerror("gflow-cli", missing_gflow_message())
            return
        self.gflow_bin.set(gflow_bin)
        server.apply_settings(
            token=token,
            allow_ips=allow,
            project=self.project.get().strip(),
            project_name=self.project_name.get().strip() or "OpenReels",
            host="0.0.0.0",
            port=port,
            profile=self.gflow_profile.get().strip(),
            gflow_bin=gflow_bin,
        )
        self.stop_relay.clear()
        self.running = True
        self.go.configure(text="Desconectar")
        if mode in {"local", "both"}:
            try:
                self.httpd = server.serve_forever()
            except Exception as err:
                self.running = False
                self.go.configure(text="Conectar")
                messagebox.showerror("LAN", str(err))
                return
            self.http_thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
            self.http_thread.start()
            self._log(f"LAN: escuchando 0.0.0.0:{port} (Xeon {allow or '*'})")
        if mode in {"remote", "both"}:
            studio = self.studio.get().strip()
            self.relay_thread = threading.Thread(
                target=run_poll_loop,
                args=(studio, token, self.stop_relay.is_set, self._log),
                daemon=True,
            )
            self.relay_thread.start()
        self.status.set("Conectado · " + {"local": "red local", "remote": "remoto", "both": "local + remoto"}[mode])
        self._log(f"gflow: {server.GFLOW_BIN} · perfil gflow: {server.PROFILE or 'default'} · Chrome: {self._chrome_directory()}")

    def stop(self) -> None:
        self.stop_relay.set()
        if self.httpd:
            try:
                self.httpd.shutdown()
                self.httpd.server_close()
            except Exception:
                pass
            self.httpd = None
        self.running = False
        self.go.configure(text="Conectar")
        self.status.set("Apagado")
        self._log("Desconectado.")

    def firewall(self) -> None:
        ip = self.xeon.get().strip() or "192.168.1.71"
        port = self.port.get().strip() or "8787"
        ps = (
            f"Remove-NetFirewallRule -DisplayName 'OpenReels Puente' -ErrorAction SilentlyContinue; "
            f"New-NetFirewallRule -DisplayName 'OpenReels Puente' -Direction Inbound -Protocol TCP "
            f"-LocalPort {port} -RemoteAddress {ip} -Action Allow"
        )
        try:
            subprocess.run(
                ["powershell", "-NoProfile", "-Command", ps],
                check=False,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            self._log(f"Firewall: TCP {port} solo desde {ip}")
            messagebox.showinfo("Firewall", f"Regla lista: puerto {port} solo desde {ip}")
        except Exception as err:
            messagebox.showerror("Firewall", str(err))

    def toggle_autostart(self) -> None:
        self.cfg["autostart"] = not self.cfg.get("autostart")
        save_config(self.cfg)
        if sys.platform != "win32":
            self._log("Autostart solo aplica en Windows.")
            return
        run_key = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run"
        name = "OpenReelsPuente"
        if self.cfg["autostart"]:
            cmd = " ".join(f'"{c}"' for c in pythonw_cmd())
            subprocess.run(["reg", "add", run_key, "/v", name, "/t", "REG_SZ", "/d", cmd, "/f"], check=False)
            self._log("Se abrirá al iniciar Windows.")
        else:
            subprocess.run(["reg", "delete", run_key, "/v", name, "/f"], check=False)
            self._log("Ya no inicia con Windows.")

    def on_close(self) -> None:
        self.stop()
        self.destroy()


def main() -> None:
    App().mainloop()


if __name__ == "__main__":
    main()
