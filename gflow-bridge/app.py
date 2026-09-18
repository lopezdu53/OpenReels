#!/usr/bin/env python3
"""OpenReels Puente — GUI Windows (LAN al Xeon y/o remoto al estudio)."""

from __future__ import annotations

import base64
import os
import re
import subprocess
import sys
import threading
import webbrowser
from datetime import datetime
from http.server import ThreadingHTTPServer
from pathlib import Path

try:
    import tkinter as tk
    from tkinter import filedialog, messagebox
except ImportError as err:  # pragma: no cover
    raise SystemExit("Necesitas Python con Tcl/Tk (el instalador oficial de python.org)") from err

import server
from branding import render_icon_png, write_ico
from config import APP_DIR, DEFAULT_SIZE, classify_log, load_config, save_config
from install import format_gflow_status, inspect_gflow, install_gflow_stack, version_newer
from power import KeepAwake, toplevel_hwnd
from profiles import (
    find_chrome,
    find_gflow,
    list_chrome_profiles,
    list_gflow_accounts,
    missing_gflow_message,
    open_flow_in_chrome,
    pick_gflow_profile,
    run_gflow_login,
)
from relay_client import run_poll_loop
from version import APP_NAME, APP_VERSION, COPYRIGHT, FILE_DESCRIPTION, REPO, WEBSITE

BG = "#0b0b0c"
CARD = "#1c1c1e"
PANEL = "#141416"
LIME = "#d8ff00"
FG = "#f5f5f7"
MUTED = "#8e8e93"
RED = "#ff453a"
AMBER = "#ffd60a"
SKY = "#64d2ff"
LOG_BG = "#101012"
DEFAULT_SIZE = "1180x720"
MIN_SIZE = (980, 580)
LEFT_W = 430


def pythonw_cmd() -> list[str]:
    exe = sys.executable
    if exe.lower().endswith("python.exe"):
        alt = exe[:-10] + "pythonw.exe"
        if Path(alt).exists():
            exe = alt
    script = str(Path(__file__).resolve())
    return [exe, script]


class LineForwarder:
    """Send stdout/stderr lines to the GUI log (server.py prints here)."""

    def __init__(self, callback, fallback) -> None:
        self.callback = callback
        self.fallback = fallback
        self._buf = ""
        self._lock = threading.Lock()

    def write(self, data) -> None:
        if not data:
            return
        if self.fallback:
            try:
                self.fallback.write(data)
            except Exception:
                pass
        text = data if isinstance(data, str) else data.decode("utf-8", "replace")
        with self._lock:
            self._buf += text
            while "\n" in self._buf:
                line, self._buf = self._buf.split("\n", 1)
                stripped = line.strip()
                if stripped:
                    self.callback(stripped)

    def flush(self) -> None:
        if self.fallback:
            try:
                self.fallback.flush()
            except Exception:
                pass

    def isatty(self) -> bool:
        return False


class App(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title(f"{APP_NAME} {APP_VERSION}")
        self.configure(bg=BG)
        self.minsize(*MIN_SIZE)
        self.cfg = load_config()
        self.httpd: ThreadingHTTPServer | None = None
        self.http_thread: threading.Thread | None = None
        self.relay_thread: threading.Thread | None = None
        self.stop_relay = threading.Event()
        self.running = False
        self.keep = KeepAwake()
        self._log_lock = threading.Lock()
        self._log_lines = 0

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
        self.gflow_status = tk.StringVar(value="gflow: comprobando…")
        self.power_status = tk.StringVar(value="")
        self.keep_awake = tk.BooleanVar(value=bool(self.cfg.get("keepAwake", True)))
        self.autostart_var = tk.BooleanVar(value=bool(self.cfg.get("autostart")))
        self._tab = tk.StringVar(value="conexion")
        self._chrome_by_label: dict[str, str] = {}
        self._gflow_meta: dict[str, str | None] = {}
        self._installing = False
        self._after_install = None
        self._icon_photo = None
        self._tab_btns: dict[str, tk.Button] = {}
        self._tab_frames: dict[str, tk.Frame] = {}

        self._apply_icon()
        self._place_window()
        self._build()
        self._hook_stdio()
        self.protocol("WM_DELETE_WINDOW", self.on_close)
        self.bind("<F1>", lambda _e: self.show_help())
        self.bind("<Control-q>", lambda _e: self.on_close())
        self.bind("<Control-l>", lambda _e: self.clear_log())
        self.after(200, self._init_power)
        self.after(200, self.refresh_gflow_status)
        if self.cfg.get("autostart"):
            self.after(500, self.start)

    def _apply_icon(self) -> None:
        try:
            png = render_icon_png(64)
            self._icon_photo = tk.PhotoImage(data=base64.b64encode(png).decode("ascii"))
            self.iconphoto(True, self._icon_photo)
        except Exception:
            self._icon_photo = None
        try:
            ico = write_ico(APP_DIR / "openreels.ico")
            self.iconbitmap(str(ico))
        except Exception:
            pass

    def _place_window(self) -> None:
        saved = str(self.cfg.get("geometry") or DEFAULT_SIZE)
        self.geometry(saved)
        self.update_idletasks()
        geo = self.geometry()
        match = re.match(r"(\d+)x(\d+)([+-]\d+)([+-]\d+)", geo)
        if match:
            width, height, px, py = (int(match.group(1)), int(match.group(2)), int(match.group(3)), int(match.group(4)))
        else:
            width, height, px, py = 1180, 720, -1, -1
        sw, sh = self.winfo_screenwidth(), self.winfo_screenheight()
        if px < 0 or py < 0 or px + 200 > sw or py + 200 > sh:
            px = max(0, (sw - width) // 2)
            py = max(0, (sh - height) // 2)
            self.geometry(f"{width}x{height}+{px}+{py}")

    def _build(self) -> None:
        self._menubar()
        body = tk.PanedWindow(
            self,
            orient="horizontal",
            bg=BG,
            sashwidth=8,
            sashrelief="flat",
            bd=0,
            opaqueresize=True,
        )
        body.pack(fill="both", expand=True)
        left = tk.Frame(body, bg=BG, width=LEFT_W)
        right = tk.Frame(body, bg=BG)
        body.add(left, minsize=360, width=LEFT_W, stretch="never")
        body.add(right, minsize=480, stretch="always")
        self._build_left(left)
        self._build_log(right)
        self._statusbar()
        self._log("Listo. Si falta gflow, pulsa Instalar todo (o Conectar: se instala solo).")
        self._log("Elige el Chrome Gemini, Entrar a Flow, pega el token y Conectar.")
        self._log("Activa «Evitar suspensión» para que Windows no duerma a mitad de un clip de 8s.")
        if not find_chrome():
            self._log("No veo Google Chrome. Instálalo: https://www.google.com/chrome/")

    def _menubar(self) -> None:
        menu = tk.Menu(self)
        archivo = tk.Menu(menu, tearoff=0)
        archivo.add_command(label="Conectar / Desconectar", command=self.toggle)
        archivo.add_command(label="Guardar configuración", command=self.persist)
        archivo.add_separator()
        archivo.add_command(label="Salir", command=self.on_close, accelerator="Ctrl+Q")
        menu.add_cascade(label="Archivo", menu=archivo)

        ver = tk.Menu(menu, tearoff=0)
        ver.add_command(label="Limpiar registro", command=self.clear_log, accelerator="Ctrl+L")
        ver.add_command(label="Copiar registro", command=self.copy_log)
        ver.add_command(label="Guardar registro…", command=self.save_log)
        menu.add_cascade(label="Ver", menu=ver)

        tools = tk.Menu(menu, tearoff=0)
        tools.add_command(label="Abrir Flow", command=self.open_flow)
        tools.add_command(label="Entrar a Flow", command=self.login_flow)
        tools.add_command(label="Instalar / actualizar gflow", command=self.install_clicked)
        tools.add_separator()
        tools.add_command(label="Regla de firewall (Xeon)", command=self.firewall)
        tools.add_command(label="Abrir carpeta de datos", command=self.open_data_dir)
        tools.add_command(label="Sitio del estudio", command=lambda: webbrowser.open(WEBSITE))
        menu.add_cascade(label="Herramientas", menu=tools)

        ayuda = tk.Menu(menu, tearoff=0)
        ayuda.add_command(label="Guía rápida", command=self.show_help, accelerator="F1")
        ayuda.add_command(label="Repositorio", command=lambda: webbrowser.open(REPO))
        ayuda.add_separator()
        ayuda.add_command(label=f"Acerca de {APP_NAME}", command=self.show_about)
        menu.add_cascade(label="Ayuda", menu=ayuda)
        self.config(menu=menu)

    def _build_left(self, left: tk.Frame) -> None:
        head = tk.Frame(left, bg=BG)
        head.pack(fill="x", padx=16, pady=(12, 8))
        if self._icon_photo:
            tk.Label(head, image=self._icon_photo, bg=BG).pack(side="left", padx=(0, 10))
        titles = tk.Frame(head, bg=BG)
        titles.pack(side="left", fill="x", expand=True)
        tk.Label(titles, text=APP_NAME.upper(), fg=LIME, bg=BG, font=("Segoe UI", 16, "bold")).pack(anchor="w")
        tk.Label(
            titles,
            text=f"v{APP_VERSION}  ·  Chrome + Flow en este PC",
            fg=MUTED,
            bg=BG,
            font=("Segoe UI", 9),
        ).pack(anchor="w")

        tabs = tk.Frame(left, bg=BG)
        tabs.pack(fill="x", padx=16)
        for key, label in (("conexion", "Conexión"), ("flow", "Flow"), ("sistema", "Sistema")):
            btn = tk.Button(
                tabs,
                text=label,
                command=lambda k=key: self._show_tab(k),
                bg=CARD,
                fg=FG,
                relief="flat",
                padx=12,
                pady=6,
                font=("Segoe UI", 9, "bold"),
                activebackground=LIME,
                activeforeground=BG,
            )
            btn.pack(side="left", padx=(0, 6))
            self._tab_btns[key] = btn

        stack = tk.Frame(left, bg=CARD)
        stack.pack(fill="both", expand=True, padx=16, pady=10)
        stack.pack_propagate(False)
        self._tab_frames["conexion"] = self._tab_conexion(stack)
        self._tab_frames["flow"] = self._tab_flow(stack)
        self._tab_frames["sistema"] = self._tab_sistema(stack)
        actions = tk.Frame(left, bg=BG)
        actions.pack(fill="x", padx=16, pady=(0, 8))
        self.go = tk.Button(
            actions,
            text="Conectar",
            command=self.toggle,
            bg=LIME,
            fg=BG,
            font=("Segoe UI", 11, "bold"),
            relief="flat",
            padx=14,
            pady=8,
        )
        self.go.pack(side="left")
        for text, cmd in (("Abrir Flow", self.open_flow), ("Entrar a Flow", self.login_flow)):
            tk.Button(actions, text=text, command=cmd, bg=CARD, fg=FG, relief="flat", padx=10, pady=8).pack(
                side="left", padx=(8, 0)
            )
        row2 = tk.Frame(left, bg=BG)
        row2.pack(fill="x", padx=16, pady=(0, 12))
        self.install_btn = tk.Button(
            row2,
            text="Instalar todo",
            command=self.install_clicked,
            bg=CARD,
            fg=LIME,
            relief="flat",
            padx=12,
            pady=7,
            font=("Segoe UI", 9, "bold"),
        )
        self.install_btn.pack(side="left")
        tk.Button(row2, text="Firewall Xeon", command=self.firewall, bg=CARD, fg=FG, relief="flat", padx=10, pady=7).pack(
            side="left", padx=8
        )
        self._show_tab("conexion")

    def _tab_conexion(self, parent: tk.Frame) -> tk.Frame:
        card = tk.Frame(parent, bg=CARD)
        tk.Label(card, text="Dónde estás", fg=LIME, bg=CARD, font=("Segoe UI", 9, "bold")).pack(
            anchor="w", padx=12, pady=(12, 4)
        )
        modes = tk.Frame(card, bg=CARD)
        modes.pack(fill="x", padx=12, pady=(0, 8))
        for value, label in (
            ("local", "En casa"),
            ("remote", "Fuera de casa"),
            ("both", "Ambos"),
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
                font=("Segoe UI", 9),
            ).pack(side="left", padx=(0, 14))
        form = tk.Frame(card, bg=CARD)
        form.pack(fill="both", expand=True, padx=12, pady=(0, 12))
        form.columnconfigure(0, weight=3)
        form.columnconfigure(1, weight=1)
        self._grid_field(form, 0, "Token (EasyPanel)", self.token, show="•", span=2)
        self._grid_field(form, 1, "IP del Xeon", self.xeon, col=0)
        self._grid_field(form, 1, "Puerto", self.port, col=1)
        self._grid_field(form, 2, "URL del estudio", self.studio, span=2)
        return card

    def _tab_flow(self, parent: tk.Frame) -> tk.Frame:
        card = tk.Frame(parent, bg=CARD)
        form = tk.Frame(card, bg=CARD)
        form.pack(fill="both", expand=True, padx=12, pady=12)
        form.columnconfigure(0, weight=1)
        self._grid_field(form, 0, "Project id de Flow", self.project)
        self._grid_field(form, 1, "Nombre del proyecto", self.project_name)
        tk.Label(
            form,
            text="Chrome (Gmail / perfil Gemini Flow)",
            fg=MUTED,
            bg=CARD,
            font=("Segoe UI", 8),
        ).grid(row=2, column=0, sticky="w", pady=(8, 0))
        self._chrome_menu(form, row=3)
        self._grid_field(form, 4, "Perfil gflow (vacío = default)", self.gflow_profile)
        self._grid_field(form, 5, "Ruta de gflow.exe", self.gflow_bin)
        tk.Label(
            form,
            text="Abrir Flow usa tu Chrome. Entrar a Flow abre el Chrome de gflow — deja la ventana negra abierta.",
            fg=MUTED,
            bg=CARD,
            wraplength=380,
            justify="left",
            font=("Segoe UI", 8),
        ).grid(row=6, column=0, sticky="w", pady=(8, 0))
        return card

    def _tab_sistema(self, parent: tk.Frame) -> tk.Frame:
        card = tk.Frame(parent, bg=CARD)
        box = tk.Frame(card, bg=PANEL)
        box.pack(fill="x", padx=12, pady=12)
        tk.Label(box, text="Energía y sesión de Windows", fg=LIME, bg=PANEL, font=("Segoe UI", 9, "bold")).pack(
            anchor="w", padx=12, pady=(10, 2)
        )
        tk.Checkbutton(
            box,
            text="Evitar suspensión y cierre de sesión",
            variable=self.keep_awake,
            command=self._on_keep_awake_toggle,
            fg=FG,
            bg=PANEL,
            selectcolor=BG,
            activebackground=PANEL,
            activeforeground=LIME,
            highlightthickness=0,
            font=("Segoe UI", 10, "bold"),
            anchor="w",
        ).pack(fill="x", padx=10)
        tk.Label(
            box,
            text="El PC no duerme, no apaga la pantalla ni bloquea Windows mientras esta app está abierta. Hace falta para los clips de 8s de Flow.",
            fg=MUTED,
            bg=PANEL,
            wraplength=320,
            justify="left",
            font=("Segoe UI", 8),
        ).pack(anchor="w", padx=12, pady=(0, 10))
        tk.Label(box, textvariable=self.power_status, fg=SKY, bg=PANEL, font=("Segoe UI", 8), wraplength=320, justify="left").pack(
            anchor="w", padx=12, pady=(0, 10)
        )

        tk.Checkbutton(
            card,
            text="Inicio con Windows",
            variable=self.autostart_var,
            command=self.toggle_autostart,
            fg=FG,
            bg=CARD,
            selectcolor=BG,
            activebackground=CARD,
            activeforeground=LIME,
            highlightthickness=0,
            font=("Segoe UI", 10),
            anchor="w",
        ).pack(fill="x", padx=16, pady=(0, 8))
        tk.Button(
            card,
            text="Abrir carpeta de datos",
            command=self.open_data_dir,
            bg=BG,
            fg=FG,
            relief="flat",
            padx=10,
            pady=6,
        ).pack(anchor="w", padx=16, pady=(0, 12))
        tk.Label(
            card,
            textvariable=self.gflow_status,
            fg=LIME,
            bg=CARD,
            wraplength=380,
            justify="left",
            font=("Segoe UI", 9),
        ).pack(anchor="w", padx=16, pady=(0, 12))
        return card

    def _show_tab(self, key: str) -> None:
        self._tab.set(key)
        for name, frame in self._tab_frames.items():
            if name == key:
                frame.pack(fill="both", expand=True)
            else:
                frame.pack_forget()
            self._tab_btns[name].configure(bg=LIME if name == key else CARD, fg=BG if name == key else FG)

    def _grid_field(
        self,
        parent: tk.Frame,
        row: int,
        label: str,
        var: tk.StringVar,
        *,
        show: str | None = None,
        span: int = 1,
        col: int = 0,
        width: int | None = None,
    ) -> None:
        box = tk.Frame(parent, bg=CARD)
        box.grid(row=row, column=col, columnspan=span, sticky="nsew", padx=(0, 8), pady=4)
        box.columnconfigure(0, weight=1)
        tk.Label(box, text=label, fg=MUTED, bg=CARD, font=("Segoe UI", 8)).pack(anchor="w")
        kw: dict = {"textvariable": var, "bg": BG, "fg": FG, "insertbackground": FG, "relief": "flat"}
        if show:
            kw["show"] = show
        if width:
            kw["width"] = width
        tk.Entry(box, **kw).pack(fill="x", ipady=5, pady=(2, 0))

    def _chrome_menu(self, parent: tk.Frame, row: int) -> None:
        profiles = list_chrome_profiles() or [{"directory": "Default", "label": "Default"}]
        self._chrome_by_label = {p["label"]: p["directory"] for p in profiles}
        saved = str(self.cfg.get("chromeProfile") or "Default")
        initial = next((p["label"] for p in profiles if p["directory"] == saved), profiles[0]["label"])
        self.chrome_choice.set(initial)
        menu = tk.OptionMenu(parent, self.chrome_choice, *self._chrome_by_label.keys())
        menu.configure(bg=BG, fg=FG, highlightthickness=0, activebackground=CARD, activeforeground=LIME)
        menu.grid(row=row, column=0, sticky="ew", pady=(2, 8))

    def _build_log(self, right: tk.Frame) -> None:
        bar = tk.Frame(right, bg=BG)
        bar.pack(fill="x", padx=8, pady=(12, 4))
        tk.Label(bar, text="Actividad", fg=LIME, bg=BG, font=("Segoe UI", 11, "bold")).pack(side="left")
        tk.Label(bar, text="incluye lo que imprime gflow en este PC", fg=MUTED, bg=BG, font=("Segoe UI", 8)).pack(
            side="left", padx=10
        )
        for text, cmd in (("Copiar", self.copy_log), ("Guardar", self.save_log), ("Limpiar", self.clear_log)):
            tk.Button(bar, text=text, command=cmd, bg=CARD, fg=FG, relief="flat", padx=8, pady=4).pack(side="right", padx=4)

        wrap = tk.Frame(right, bg=LOG_BG)
        wrap.pack(fill="both", expand=True, padx=8, pady=(0, 8))
        scroll = tk.Scrollbar(wrap, bg=CARD, troughcolor=BG, width=12)
        scroll.pack(side="right", fill="y")
        self.log = tk.Text(
            wrap,
            bg=LOG_BG,
            fg=FG,
            insertbackground=FG,
            relief="flat",
            wrap="word",
            font=("Consolas", 10),
            padx=12,
            pady=10,
            highlightthickness=0,
            yscrollcommand=scroll.set,
        )
        self.log.pack(fill="both", expand=True)
        scroll.configure(command=self.log.yview)
        self.log.tag_configure("time", foreground=MUTED)
        self.log.tag_configure("ok", foreground=LIME)
        self.log.tag_configure("err", foreground=RED)
        self.log.tag_configure("warn", foreground=AMBER)
        self.log.tag_configure("i2v", foreground=SKY)
        self.log.tag_configure("info", foreground=FG)
        self.log.configure(state="disabled")

    def _statusbar(self) -> None:
        bar = tk.Frame(self, bg=CARD, height=28)
        bar.pack(fill="x", side="bottom")
        tk.Label(bar, textvariable=self.status, fg=LIME, bg=CARD, font=("Segoe UI", 9, "bold")).pack(
            side="left", padx=12, pady=4
        )
        tk.Label(bar, text=f"v{APP_VERSION}", fg=MUTED, bg=CARD, font=("Segoe UI", 8)).pack(side="right", padx=12)
        tk.Label(bar, textvariable=self.gflow_status, fg=MUTED, bg=CARD, font=("Segoe UI", 8)).pack(side="right", padx=8)

    def _hook_stdio(self) -> None:
        forward = LineForwarder(self._log, getattr(sys, "__stdout__", None) or sys.stdout)
        sys.stdout = forward  # type: ignore[assignment]
        sys.stderr = forward  # type: ignore[assignment]

    def _init_power(self) -> None:
        self.keep.set_hwnd(toplevel_hwnd(self))
        if self.keep_awake.get():
            self._apply_keep_awake(True)
        self._power_tick()

    def _on_keep_awake_toggle(self) -> None:
        self.cfg["keepAwake"] = bool(self.keep_awake.get())
        save_config(self.cfg)
        self._apply_keep_awake(self.keep_awake.get())

    def _apply_keep_awake(self, on: bool) -> None:
        msg = self.keep.enable() if on else self.keep.disable()
        self.power_status.set(msg)
        self._log(msg, "ok" if on else "warn")

    def _power_tick(self) -> None:
        if self.keep_awake.get():
            self.keep.heartbeat()
        self.after(30000, self._power_tick)

    def _chrome_directory(self) -> str:
        return self._chrome_by_label.get(self.chrome_choice.get(), "Default")

    def refresh_gflow_status(self) -> None:
        def work() -> None:
            try:
                meta = inspect_gflow(self.gflow_bin.get())
            except Exception as err:
                meta = {"path": find_gflow(self.gflow_bin.get()), "installed": None, "latest": None, "status": str(err)}
            self.after(0, lambda: self._apply_gflow_meta(meta))

        threading.Thread(target=work, daemon=True).start()

    def _apply_gflow_meta(self, meta: dict[str, str | None]) -> None:
        self._gflow_meta = meta
        path = meta.get("path")
        if path:
            self.gflow_bin.set(path)
        status = meta.get("status") or format_gflow_status(meta.get("installed"), meta.get("latest"))
        self.gflow_status.set(status)
        installed = meta.get("installed")
        latest = meta.get("latest")
        colorama = meta.get("colorama")
        colorama_latest = meta.get("colorama_latest")
        if not path:
            self.install_btn.configure(text="Instalar todo")
            self._log(missing_gflow_message())
        elif latest and installed and version_newer(latest, installed):
            self.install_btn.configure(text=f"Actualizar a {latest}")
            self._log(status)
        elif installed and not colorama:
            self.install_btn.configure(text="Instalar colorama")
            self._log(status)
        elif colorama and colorama_latest and version_newer(colorama_latest, colorama):
            self.install_btn.configure(text=f"Actualizar colorama {colorama_latest}")
            self._log(status)
        else:
            self.install_btn.configure(text="Reinstalar gflow")
            self._log(status + (f" → {path}" if path else ""))
        self._fill_gflow_profile()

    def install_clicked(self) -> None:
        installed = self._gflow_meta.get("installed")
        latest = self._gflow_meta.get("latest")
        colorama = self._gflow_meta.get("colorama")
        colorama_latest = self._gflow_meta.get("colorama_latest")
        gflow_update = bool(installed and latest and version_newer(latest, installed))
        colorama_update = bool(colorama and colorama_latest and version_newer(colorama_latest, colorama))
        missing_colorama = bool(installed and not colorama)
        self.install_stack(upgrade=gflow_update or colorama_update or missing_colorama or bool(installed))

    def install_stack(self, *, upgrade: bool = False, then=None) -> None:
        if self._installing:
            self._log("Ya hay una instalación en curso…")
            return
        self._installing = True
        self._after_install = then
        self.install_btn.configure(text="Instalando…")
        self.gflow_status.set("gflow: instalando uv + gflow-cli + Chromium…")
        self._log("Instalando lo necesario (sin PowerShell). Puede tardar unos minutos.")

        def work() -> None:
            try:
                path = install_gflow_stack(self._log, upgrade=upgrade)
                self.after(0, lambda: self._install_ok(path))
            except Exception as err:
                self.after(0, lambda e=err: self._install_fail(e))

        threading.Thread(target=work, daemon=True).start()

    def _install_ok(self, path: str) -> None:
        self._installing = False
        self.gflow_bin.set(path)
        self.persist()
        self._log(f"gflow listo: {path}", "ok")
        then = self._after_install
        self._after_install = None
        self.refresh_gflow_status()
        if then:
            then()

    def _install_fail(self, err: Exception) -> None:
        self._installing = False
        self._after_install = None
        self.install_btn.configure(text="Instalar todo")
        self.gflow_status.set("gflow: falló la instalación")
        messagebox.showerror("Instalar gflow", str(err)[:600])

    def _ensure_gflow(self, then) -> None:
        path = find_gflow(self.gflow_bin.get())
        if path:
            self.gflow_bin.set(path)
            then()
            return
        self._log("Falta gflow. Lo instalo ahora y sigo…")
        self.install_stack(upgrade=False, then=then)

    def open_flow(self) -> None:
        directory = self._chrome_directory()
        try:
            open_flow_in_chrome(directory)
            self._log(f"Chrome perfil «{directory}» → Flow. Agent OFF. Debe ser el Gmail del plan Gemini.")
        except Exception as err:
            messagebox.showerror("Chrome", str(err))

    def _chrome_email(self) -> str:
        label = self.chrome_choice.get()
        if "·" in label:
            return label.split("·", 1)[1].strip()
        return ""

    def _fill_gflow_profile(self) -> None:
        row = pick_gflow_profile(self._chrome_email())
        accounts = list_gflow_accounts()
        if accounts:
            self._log("Sesiones gflow: " + " | ".join(accounts))
        if not row:
            self._log("Aún no hay sesión gflow. Pulsa «Entrar a Flow» y deja abierta la ventana negra.")
            return
        self.gflow_profile.set(row["name"])
        self.persist()
        self._log(f"Perfil gflow: {row['name']} · {row['email']}", "ok")

    def login_flow(self) -> None:
        self.persist()
        self._ensure_gflow(self._login_flow_now)

    def _login_flow_now(self) -> None:
        bin_path = find_gflow(self.gflow_bin.get())
        if not bin_path:
            messagebox.showerror("gflow-cli", missing_gflow_message())
            return
        self.gflow_bin.set(bin_path)
        self._log("Se abre una ventana negra y Chrome de gflow. NO las cierres al instante.")
        self._log("En Chrome: Gmail del plan Gemini. Cuando cargue Flow, cierra Chrome. Luego una tecla en la ventana negra.")

        def work() -> None:
            try:
                code = run_gflow_login(bin_path, self.gflow_profile.get())
                self.after(0, lambda: self._login_flow_done(code))
            except FileNotFoundError:
                self.after(0, lambda: messagebox.showerror("gflow-cli", missing_gflow_message()))
            except Exception as err:
                self.after(0, lambda e=err: messagebox.showerror("Entrar a Flow", str(e)))

        threading.Thread(target=work, daemon=True).start()

    def _login_flow_done(self, code: int) -> None:
        self._fill_gflow_profile()
        row = pick_gflow_profile(self._chrome_email())
        if row:
            messagebox.showinfo("Flow", f"Sesión lista: {row['email']}")
            return
        hint = (
            "No se guardó ninguna sesión. La ventana negra tiene que quedarse abierta "
            "hasta que Chrome de gflow muestre Flow y la cierres. Código "
            f"{code}."
        )
        self._log(hint, "err")
        messagebox.showerror("Entrar a Flow", hint)

    def _log(self, line: str, level: str | None = None) -> None:
        stamp = datetime.now().strftime("%H:%M:%S")
        kind = level or classify_log(line)

        def append() -> None:
            self.log.configure(state="normal")
            if self._log_lines > 4000:
                self.log.delete("1.0", "200.0")
                self._log_lines = int(self.log.index("end-1c").split(".")[0])
            self.log.insert("end", stamp + "  ", ("time",))
            self.log.insert("end", line + "\n", (kind,))
            self.log.see("end")
            self.log.configure(state="disabled")
            self._log_lines += 1

        try:
            self.after(0, append)
        except Exception:
            pass

    def clear_log(self) -> None:
        self.log.configure(state="normal")
        self.log.delete("1.0", "end")
        self.log.configure(state="disabled")
        self._log_lines = 0

    def copy_log(self) -> None:
        text = self.log.get("1.0", "end-1c")
        self.clipboard_clear()
        self.clipboard_append(text)
        self._log("Registro copiado al portapapeles.", "ok")

    def save_log(self) -> None:
        path = filedialog.asksaveasfilename(
            title="Guardar registro",
            defaultextension=".txt",
            filetypes=[("Texto", "*.txt"), ("Todos", "*.*")],
            initialfile="openreels-puente.log",
        )
        if not path:
            return
        Path(path).write_text(self.log.get("1.0", "end-1c"), encoding="utf-8")
        self._log(f"Registro guardado en {path}", "ok")

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
                "keepAwake": bool(self.keep_awake.get()),
                "autostart": bool(self.autostart_var.get()),
                "geometry": self.geometry(),
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
        try:
            int(self.port.get() or 8787)
        except ValueError:
            messagebox.showerror("Puerto", "Puerto inválido")
            return
        self._ensure_gflow(self._start_now)

    def _start_now(self) -> None:
        token = self.token.get().strip()
        mode = self.mode.get()
        port = int(self.port.get() or 8787)
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
            self._log(f"LAN: escuchando 0.0.0.0:{port} (Xeon {allow or '*'})", "ok")
        if mode in {"remote", "both"}:
            studio = self.studio.get().strip()
            self.relay_thread = threading.Thread(
                target=run_poll_loop,
                args=(studio, token, self.stop_relay.is_set, self._log),
                daemon=True,
            )
            self.relay_thread.start()
        self.status.set("Conectado · " + {"local": "red local", "remote": "remoto", "both": "local + remoto"}[mode])
        self._log(
            f"gflow: {server.GFLOW_BIN} · perfil gflow: {server.PROFILE or 'default'} · Chrome: {self._chrome_directory()}",
            "ok",
        )
        if self.keep_awake.get():
            self.keep.set_hwnd(toplevel_hwnd(self))
            self.keep.enable()

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
            self._log(f"Firewall: TCP {port} solo desde {ip}", "ok")
            messagebox.showinfo("Firewall", f"Regla lista: puerto {port} solo desde {ip}")
        except Exception as err:
            messagebox.showerror("Firewall", str(err))

    def toggle_autostart(self) -> None:
        self.cfg["autostart"] = bool(self.autostart_var.get())
        save_config(self.cfg)
        if sys.platform != "win32":
            self._log("Autostart solo aplica en Windows.")
            return
        run_key = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run"
        name = "OpenReelsPuente"
        if self.cfg["autostart"]:
            cmd = " ".join(f'"{c}"' for c in pythonw_cmd())
            subprocess.run(["reg", "add", run_key, "/v", name, "/t", "REG_SZ", "/d", cmd, "/f"], check=False)
            self._log("Se abrirá al iniciar Windows.", "ok")
        else:
            subprocess.run(["reg", "delete", run_key, "/v", name, "/f"], check=False)
            self._log("Ya no inicia con Windows.")

    def open_data_dir(self) -> None:
        APP_DIR.mkdir(parents=True, exist_ok=True)
        path = str(APP_DIR)
        if sys.platform == "win32":
            os.startfile(path)  # type: ignore[attr-defined]
        else:
            subprocess.run(["xdg-open", path], check=False)

    def show_help(self) -> None:
        win = tk.Toplevel(self)
        win.title("Guía rápida")
        win.configure(bg=BG)
        win.transient(self)
        win.resizable(False, False)
        win.grab_set()
        self._style_dialog(win, 520, 460)
        text = (
            "1. Sistema → Evitar suspensión (déjalo marcado).\n"
            "2. Instalar todo si falta gflow.\n"
            "3. Pestaña Flow: perfil Chrome del Gmail Gemini → Entrar a Flow.\n"
            "   Deja abierta la ventana negra hasta que cargue Flow.\n"
            "4. Pestaña Conexión: token de EasyPanel. En casa, IP del Xeon.\n"
            "   Fuera de casa, URL del estudio.\n"
            "5. Conectar. Agent OFF en Flow.\n\n"
            "El log de la derecha muestra cada still y la espera del clip de 8s.\n"
            "No cierres el puente a mitad de un job."
        )
        tk.Label(win, text="Guía rápida", fg=LIME, bg=BG, font=("Segoe UI", 14, "bold")).pack(anchor="w", padx=20, pady=(16, 8))
        tk.Label(win, text=text, fg=FG, bg=BG, justify="left", font=("Segoe UI", 10), wraplength=480).pack(
            anchor="w", padx=20
        )
        tk.Button(win, text="Cerrar", command=win.destroy, bg=LIME, fg=BG, relief="flat", padx=16, pady=6).pack(
            pady=16
        )

    def show_about(self) -> None:
        win = tk.Toplevel(self)
        win.title(f"Acerca de {APP_NAME}")
        win.configure(bg=BG)
        win.transient(self)
        win.resizable(False, False)
        win.grab_set()
        self._style_dialog(win, 460, 420)
        if self._icon_photo:
            tk.Label(win, image=self._icon_photo, bg=BG).pack(pady=(20, 8))
        tk.Label(win, text=APP_NAME, fg=LIME, bg=BG, font=("Segoe UI", 16, "bold")).pack()
        tk.Label(win, text=f"Versión {APP_VERSION}", fg=FG, bg=BG, font=("Segoe UI", 11)).pack(pady=(4, 8))
        tk.Label(win, text=FILE_DESCRIPTION, fg=MUTED, bg=BG, wraplength=400, justify="center", font=("Segoe UI", 9)).pack()
        gflow = self._gflow_meta.get("installed") or "—"
        tk.Label(
            win,
            text=f"gflow-cli {gflow}\nPython {sys.version.split()[0]}  ·  {sys.platform}",
            fg=MUTED,
            bg=BG,
            justify="center",
            font=("Segoe UI", 8),
        ).pack(pady=10)
        tk.Label(win, text=COPYRIGHT, fg=MUTED, bg=BG, font=("Segoe UI", 8)).pack()
        links = tk.Frame(win, bg=BG)
        links.pack(pady=8)
        tk.Button(links, text="Sitio", command=lambda: webbrowser.open(WEBSITE), bg=CARD, fg=FG, relief="flat", padx=10).pack(
            side="left", padx=4
        )
        tk.Button(links, text="GitHub", command=lambda: webbrowser.open(REPO), bg=CARD, fg=FG, relief="flat", padx=10).pack(
            side="left", padx=4
        )
        tk.Button(win, text="Cerrar", command=win.destroy, bg=LIME, fg=BG, relief="flat", padx=16, pady=6).pack(pady=(8, 16))

    def _style_dialog(self, win: tk.Toplevel, w: int, h: int) -> None:
        self.update_idletasks()
        try:
            px = self.winfo_rootx() + max(40, (self.winfo_width() - w) // 2)
            py = self.winfo_rooty() + max(40, (self.winfo_height() - h) // 2)
        except Exception:
            px, py = 200, 160
        win.geometry(f"{w}x{h}+{px}+{py}")
        try:
            ico = APP_DIR / "openreels.ico"
            if ico.exists():
                win.iconbitmap(str(ico))
        except Exception:
            pass

    def on_close(self) -> None:
        if self.running and not messagebox.askokcancel("Salir", "El puente está conectado. ¿Cerrar igual?"):
            return
        self.persist()
        self.keep.disable()
        self.stop()
        self.destroy()


def main() -> None:
    App().mainloop()


if __name__ == "__main__":
    main()
