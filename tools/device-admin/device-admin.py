#!/usr/bin/env python3
"""
Rally Live — Device Authorization Tool
Encrypted AES-256-GCM + HMAC-SHA256 — Desktop GUI
"""

import sys
import os
import json
import time
import hmac
import hashlib
import base64
import threading
import tkinter as tk
from tkinter import ttk, messagebox
from datetime import datetime

# ─── Check for cryptography package ───────────────────────────────
try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    from cryptography.hazmat.primitives import hashes
except ImportError:
    root = tk.Tk()
    root.withdraw()
    messagebox.showerror(
        "Missing Dependency",
        "'cryptography' package is required.\nInstall it with:  pip install cryptography",
    )
    sys.exit(1)

# ─── Constants ────────────────────────────────────────────────────
SALT = b"rally-live-device-auth-v1"
ITERATIONS = 100_000
KEY_LEN = 32
NONCE_LEN = 12
TAG_LEN = 16

# ─── Theme Colors ─────────────────────────────────────────────────
BG = "#1a1a2e"
BG_SECONDARY = "#16213e"
BG_WIDGET = "#0f3460"
FG = "#e0e0e0"
FG_DIM = "#888899"
ACCENT = "#e94560"
ACCENT_GREEN = "#4ecca3"
ACCENT_CYAN = "#00d2ff"
ACCENT_YELLOW = "#f0c040"
BORDER = "#2a2a4a"


# ─── Env loading ──────────────────────────────────────────────────
def find_env_file():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    env_path = os.path.join(script_dir, ".env")
    if os.path.exists(env_path):
        return env_path
    return None


def load_env_value(key):
    env_path = find_env_file()
    if not env_path:
        return None
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            if k.strip() == key:
                v = v.strip()
                if (v.startswith('"') and v.endswith('"')) or (
                    v.startswith("'") and v.endswith("'")
                ):
                    v = v[1:-1]
                return v
    return None


def get_server_url():
    url = load_env_value("NEXTAUTH_URL")
    if url:
        return url.rstrip("/")
    url = load_env_value("NEXT_PUBLIC_APP_URL")
    if url:
        return url.rstrip("/")
    return "http://localhost:4500"


# ─── Crypto ───────────────────────────────────────────────────────
def derive_key(secret: str) -> bytes:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=KEY_LEN,
        salt=SALT,
        iterations=ITERATIONS,
    )
    return kdf.derive(secret.encode("utf-8"))


def encrypt_payload(key: bytes, plaintext: str) -> str:
    nonce = os.urandom(NONCE_LEN)
    aesgcm = AESGCM(key)
    ct_and_tag = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    return base64.b64encode(nonce + ct_and_tag).decode("ascii")


def decrypt_payload(key: bytes, data: str) -> str:
    raw = base64.b64decode(data)
    nonce = raw[:NONCE_LEN]
    ct_and_tag = raw[NONCE_LEN:]
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, ct_and_tag, None).decode("utf-8")


def compute_hmac(key: bytes, message: str) -> str:
    return hmac.new(key, message.encode("utf-8"), hashlib.sha256).hexdigest()


# ─── Network ─────────────────────────────────────────────────────
import urllib.request
import urllib.error


def api_request(url: str, payload: dict) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "RallyLive-DeviceAdmin/1.0",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        try:
            return json.loads(body)
        except json.JSONDecodeError:
            return {"error": f"HTTP {e.code}: {body[:200]}"}
    except urllib.error.URLError as e:
        return {"error": f"Connection failed: {e.reason}"}
    except Exception as e:
        return {"error": str(e)}


# ─── Challenge-Response Handshake ─────────────────────────────────
def get_challenge(key: bytes, base_url: str) -> tuple[str | None, str | None]:
    """Returns (challenge_token, error_message)."""
    timestamp = str(int(time.time() * 1000))
    hmac_sig = compute_hmac(key, timestamp)

    resp = api_request(
        f"{base_url}/api/admin/device-tool/challenge",
        {"timestamp": timestamp, "hmac": hmac_sig},
    )

    if "error" in resp:
        return None, f"Challenge failed: {resp['error']}"

    encrypted_challenge = resp.get("data")
    if not encrypted_challenge:
        return None, "No challenge data received"

    try:
        decrypted = json.loads(decrypt_payload(key, encrypted_challenge))
        return decrypted.get("challenge"), None
    except Exception as e:
        return None, f"Failed to decrypt challenge: {e}"


def execute_command(
    key: bytes, base_url: str, command: str, args: dict | None = None, log_fn=None
) -> dict | None:
    if log_fn:
        log_fn("Requesting challenge...")
    challenge, err = get_challenge(key, base_url)
    if err:
        if log_fn:
            log_fn(f"ERROR: {err}")
        return None
    if log_fn:
        log_fn("Challenge obtained")

    payload = {
        "challenge": challenge,
        "timestamp": int(time.time() * 1000),
        "command": command,
    }
    if args:
        payload["args"] = args

    encrypted = encrypt_payload(key, json.dumps(payload))
    if log_fn:
        log_fn(f"Sending encrypted '{command}' command...")
    resp = api_request(
        f"{base_url}/api/admin/device-tool",
        {"data": encrypted},
    )

    if "error" in resp:
        if log_fn:
            log_fn(f"ERROR: Command failed: {resp['error']}")
        return None

    encrypted_resp = resp.get("data")
    if not encrypted_resp:
        if log_fn:
            log_fn("ERROR: No response data")
        return None

    try:
        result = json.loads(decrypt_payload(key, encrypted_resp))
        if log_fn:
            log_fn(f"Response decrypted successfully")
        return result
    except Exception as e:
        if log_fn:
            log_fn(f"ERROR: Failed to decrypt response: {e}")
        return None


def mask_token(token: str) -> str:
    if len(token) <= 16:
        return token
    return token[:8] + "..." + token[-4:]


# ─── GUI Application ─────────────────────────────────────────────
class DeviceAdminApp:
    def __init__(self, root: tk.Tk, key: bytes):
        self.root = root
        self.key = key
        self.devices: list[str] = []  # full tokens
        self.pending: list[dict] = []

        self._configure_window()
        self._configure_styles()
        self._build_ui()
        self._auto_refresh()

    # ── Window Setup ──────────────────────────────────────────────

    def _configure_window(self):
        self.root.title("Rally Live — Device Authorization Tool")
        self.root.configure(bg=BG)
        self.root.minsize(640, 720)
        self.root.geometry("700x820")
        # Center on screen
        self.root.update_idletasks()
        w, h = 700, 820
        x = (self.root.winfo_screenwidth() - w) // 2
        y = (self.root.winfo_screenheight() - h) // 2
        self.root.geometry(f"{w}x{h}+{x}+{y}")

    def _configure_styles(self):
        style = ttk.Style()
        style.theme_use("clam")

        style.configure(".", background=BG, foreground=FG, fieldbackground=BG_WIDGET)
        style.configure("TFrame", background=BG)
        style.configure("TLabel", background=BG, foreground=FG, font=("Segoe UI", 10))
        style.configure(
            "Title.TLabel", background=BG, foreground=FG, font=("Segoe UI", 14, "bold")
        )
        style.configure(
            "Subtitle.TLabel",
            background=BG,
            foreground=FG_DIM,
            font=("Segoe UI", 9),
        )
        style.configure(
            "Section.TLabel",
            background=BG,
            foreground=ACCENT_CYAN,
            font=("Segoe UI", 10, "bold"),
        )
        style.configure(
            "Status.TLabel",
            background=BG_SECONDARY,
            foreground=FG_DIM,
            font=("Segoe UI", 9),
        )
        style.configure(
            "TRadiobutton",
            background=BG,
            foreground=FG,
            font=("Segoe UI", 10),
            focuscolor=BG,
        )
        style.map(
            "TRadiobutton",
            background=[("active", BG_SECONDARY)],
            foreground=[("active", FG)],
        )
        style.configure(
            "TEntry",
            fieldbackground=BG_WIDGET,
            foreground=FG,
            insertcolor=FG,
            bordercolor=BORDER,
            font=("Consolas", 10),
        )

        # Accent button
        style.configure(
            "Accent.TButton",
            background=ACCENT,
            foreground="#ffffff",
            font=("Segoe UI", 10, "bold"),
            borderwidth=0,
            padding=(12, 4),
        )
        style.map(
            "Accent.TButton",
            background=[("active", "#c73650"), ("disabled", "#555555")],
            foreground=[("disabled", "#999999")],
        )

        # Standard button
        style.configure(
            "TButton",
            background=BG_WIDGET,
            foreground=FG,
            font=("Segoe UI", 9),
            borderwidth=0,
            padding=(10, 3),
        )
        style.map(
            "TButton",
            background=[("active", BORDER), ("disabled", "#333333")],
            foreground=[("disabled", "#777777")],
        )

        # Green approve button
        style.configure(
            "Approve.TButton",
            background=ACCENT_GREEN,
            foreground="#111111",
            font=("Segoe UI", 9, "bold"),
            borderwidth=0,
            padding=(8, 2),
        )
        style.map("Approve.TButton", background=[("active", "#3baa88")])

        # Red deny button
        style.configure(
            "Deny.TButton",
            background=ACCENT,
            foreground="#ffffff",
            font=("Segoe UI", 9, "bold"),
            borderwidth=0,
            padding=(8, 2),
        )
        style.map("Deny.TButton", background=[("active", "#c73650")])

        # Remove button (small)
        style.configure(
            "Remove.TButton",
            background="#442233",
            foreground=ACCENT,
            font=("Segoe UI", 9),
            borderwidth=0,
            padding=(6, 1),
        )
        style.map("Remove.TButton", background=[("active", "#553344")])

        # Treeview
        style.configure(
            "Treeview",
            background=BG_SECONDARY,
            foreground=FG,
            fieldbackground=BG_SECONDARY,
            borderwidth=0,
            font=("Consolas", 10),
            rowheight=28,
        )
        style.configure(
            "Treeview.Heading",
            background=BG_WIDGET,
            foreground=ACCENT_CYAN,
            font=("Segoe UI", 9, "bold"),
            borderwidth=0,
        )
        style.map(
            "Treeview",
            background=[("selected", BG_WIDGET)],
            foreground=[("selected", ACCENT_CYAN)],
        )

        # LabelFrame
        style.configure(
            "TLabelframe",
            background=BG,
            foreground=ACCENT_CYAN,
            bordercolor=BORDER,
        )
        style.configure(
            "TLabelframe.Label",
            background=BG,
            foreground=ACCENT_CYAN,
            font=("Segoe UI", 10, "bold"),
        )

    # ── Build UI ──────────────────────────────────────────────────

    def _build_ui(self):
        pad = {"padx": 16}
        self.main = ttk.Frame(self.root)
        self.main.pack(fill="both", expand=True)

        # ── Header
        header = ttk.Frame(self.main)
        header.pack(fill="x", **pad, pady=(16, 0))
        ttk.Label(header, text="Rally Live \u2014 Device Authorization Tool", style="Title.TLabel").pack(
            anchor="w"
        )
        ttk.Label(
            header, text="AES-256-GCM + HMAC-SHA256", style="Subtitle.TLabel"
        ).pack(anchor="w")

        # ── Server Toggle
        srv_frame = ttk.Frame(self.main)
        srv_frame.pack(fill="x", **pad, pady=(12, 0))
        ttk.Label(srv_frame, text="Server:", style="Section.TLabel").pack(
            side="left", padx=(0, 10)
        )

        self.server_var = tk.StringVar(value="local")
        local_url = get_server_url()
        prod_url = (load_env_value("NEXT_PUBLIC_APP_URL") or "https://rallylive.ca").rstrip("/")

        ttk.Radiobutton(
            srv_frame,
            text=f"Local ({local_url.split('//')[1]})",
            variable=self.server_var,
            value="local",
        ).pack(side="left", padx=(0, 16))
        ttk.Radiobutton(
            srv_frame,
            text=f"Production ({prod_url.split('//')[1]})",
            variable=self.server_var,
            value="production",
        ).pack(side="left")

        self._local_url = local_url
        self._prod_url = prod_url

        # ── Authorized Devices
        dev_frame = ttk.LabelFrame(self.main, text=" Authorized Devices ")
        dev_frame.pack(fill="both", expand=True, **pad, pady=(12, 0))

        tree_frame = ttk.Frame(dev_frame)
        tree_frame.pack(fill="both", expand=True, padx=8, pady=(4, 8))

        self.device_tree = ttk.Treeview(
            tree_frame, columns=("num", "token"), show="headings", height=5
        )
        self.device_tree.heading("num", text="#", anchor="w")
        self.device_tree.heading("token", text="Device Token", anchor="w")
        self.device_tree.column("num", width=40, minwidth=30, stretch=False)
        self.device_tree.column("token", width=400, minwidth=200)

        scrollbar = ttk.Scrollbar(
            tree_frame, orient="vertical", command=self.device_tree.yview
        )
        self.device_tree.configure(yscrollcommand=scrollbar.set)
        self.device_tree.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

        # Remove button for devices
        dev_btn_frame = ttk.Frame(dev_frame)
        dev_btn_frame.pack(fill="x", padx=8, pady=(0, 8))
        ttk.Button(
            dev_btn_frame,
            text="Remove Selected",
            style="Remove.TButton",
            command=self._on_remove_device,
        ).pack(side="right")

        # ── Token Input
        tok_frame = ttk.Frame(self.main)
        tok_frame.pack(fill="x", **pad, pady=(12, 0))

        ttk.Label(tok_frame, text="Token:", style="Section.TLabel").pack(
            side="left", padx=(0, 8)
        )
        self.token_entry = ttk.Entry(tok_frame, width=44)
        self.token_entry.pack(side="left", fill="x", expand=True, padx=(0, 8))
        self.token_entry.bind("<Return>", lambda e: self._on_add_device())

        ttk.Button(
            tok_frame, text="Add Device", style="Accent.TButton", command=self._on_add_device
        ).pack(side="left", padx=(0, 6))
        ttk.Button(
            tok_frame, text="Refresh", command=self._on_refresh
        ).pack(side="left")

        # ── Pending Requests
        pend_frame = ttk.LabelFrame(self.main, text=" Pending Requests ")
        pend_frame.pack(fill="both", **pad, pady=(12, 0))

        self.pending_container = ttk.Frame(pend_frame)
        self.pending_container.pack(fill="both", padx=8, pady=(4, 8))
        self.pending_label = ttk.Label(
            self.pending_container, text="No pending requests", foreground=FG_DIM
        )
        self.pending_label.pack(anchor="w")

        # ── Log
        log_frame = ttk.LabelFrame(self.main, text=" Log ")
        log_frame.pack(fill="both", expand=True, **pad, pady=(12, 0))

        self.log_text = tk.Text(
            log_frame,
            height=6,
            bg=BG_SECONDARY,
            fg=FG_DIM,
            font=("Consolas", 9),
            borderwidth=0,
            highlightthickness=0,
            insertbackground=FG,
            wrap="word",
            state="disabled",
        )
        self.log_text.pack(fill="both", expand=True, padx=8, pady=(4, 8))

        # ── Status Bar
        self.status_frame = tk.Frame(self.main, bg=BG_SECONDARY, height=28)
        self.status_frame.pack(fill="x", side="bottom", pady=(12, 0))
        self.status_frame.pack_propagate(False)

        self.status_label = tk.Label(
            self.status_frame,
            text="Status: Ready",
            bg=BG_SECONDARY,
            fg=FG_DIM,
            font=("Segoe UI", 9),
            anchor="w",
            padx=16,
        )
        self.status_label.pack(side="left", fill="x", expand=True)

        self.encryption_label = tk.Label(
            self.status_frame,
            text="Encrypted",
            bg=BG_SECONDARY,
            fg=ACCENT_GREEN,
            font=("Segoe UI", 9),
            anchor="e",
            padx=16,
        )
        self.encryption_label.pack(side="right")

    # ── Helpers ───────────────────────────────────────────────────

    def _get_base_url(self) -> str:
        return self._prod_url if self.server_var.get() == "production" else self._local_url

    def _log(self, message: str):
        ts = datetime.now().strftime("%H:%M:%S")
        self.root.after(0, self._log_insert, f"[{ts}] {message}")

    def _log_insert(self, text: str):
        self.log_text.configure(state="normal")
        self.log_text.insert("end", text + "\n")
        self.log_text.see("end")
        self.log_text.configure(state="disabled")

    def _set_status(self, text: str):
        self.root.after(0, lambda: self.status_label.configure(text=f"Status: {text}"))

    def _run_threaded(self, target, *args):
        thread = threading.Thread(target=target, args=args, daemon=True)
        thread.start()

    # ── Auto-refresh on startup ───────────────────────────────────

    def _auto_refresh(self):
        self._log("Application started")
        self._run_threaded(self._fetch_all)

    def _fetch_all(self):
        self._fetch_devices()
        self._fetch_pending()

    # ── Device List ───────────────────────────────────────────────

    def _fetch_devices(self):
        self._set_status("Loading devices...")
        result = execute_command(self.key, self._get_base_url(), "list", log_fn=self._log)
        if not result:
            self._set_status("Failed to load devices")
            return
        if not result.get("success"):
            self._log(f"ERROR: {result.get('message', 'Unknown error')}")
            self._set_status("Error")
            return

        self.devices = result.get("data", {}).get("devices", [])
        msg = result.get("message", "")
        self._log(f"{len(self.devices)} authorized device(s)")
        self._set_status(f"Connected  |  {len(self.devices)} device(s)")
        self.root.after(0, self._render_devices)

    def _render_devices(self):
        for item in self.device_tree.get_children():
            self.device_tree.delete(item)
        for i, token in enumerate(self.devices, 1):
            self.device_tree.insert("", "end", iid=str(i), values=(i, mask_token(token)))

    # ── Add Device ────────────────────────────────────────────────

    def _on_add_device(self):
        token = self.token_entry.get().strip()
        if not token:
            messagebox.showwarning("No Token", "Enter a device token to add.")
            return
        self.token_entry.delete(0, "end")
        self._run_threaded(self._add_device, token)

    def _add_device(self, token: str):
        self._set_status("Adding device...")
        result = execute_command(
            self.key, self._get_base_url(), "add", {"token": token}, log_fn=self._log
        )
        if not result:
            self._set_status("Failed to add device")
            return
        if result.get("success"):
            self._log(f"Added: {mask_token(token)}")
            total = result.get("data", {}).get("total", "?")
            self._log(f"Total devices: {total}")
            self._fetch_devices()
        else:
            self._log(f"ERROR: {result.get('message', 'Failed')}")
            self._set_status("Error adding device")

    # ── Remove Device ─────────────────────────────────────────────

    def _on_remove_device(self):
        selected = self.device_tree.selection()
        if not selected:
            messagebox.showwarning("No Selection", "Select a device to remove.")
            return
        idx = int(selected[0]) - 1
        if idx < 0 or idx >= len(self.devices):
            return
        token = self.devices[idx]
        if not messagebox.askyesno(
            "Confirm Removal",
            f"Remove device {mask_token(token)}?",
        ):
            return
        self._run_threaded(self._remove_device, token)

    def _remove_device(self, token: str):
        self._set_status("Removing device...")
        result = execute_command(
            self.key, self._get_base_url(), "remove", {"token": token}, log_fn=self._log
        )
        if not result:
            self._set_status("Failed to remove device")
            return
        if result.get("success"):
            self._log(f"Removed: {mask_token(token)}")
            remaining = result.get("data", {}).get("total", "?")
            self._log(f"Remaining devices: {remaining}")
            self._fetch_devices()
        else:
            self._log(f"ERROR: {result.get('message', 'Failed')}")
            self._set_status("Error removing device")

    # ── Pending Requests ──────────────────────────────────────────

    def _fetch_pending(self):
        result = execute_command(self.key, self._get_base_url(), "pending", log_fn=self._log)
        if not result:
            return
        if not result.get("success"):
            self._log(f"ERROR: {result.get('message', 'Unknown error')}")
            return

        self.pending = result.get("data", {}).get("requests", [])
        self._log(f"{len(self.pending)} pending request(s)")
        self.root.after(0, self._render_pending)

    def _render_pending(self):
        for w in self.pending_container.winfo_children():
            w.destroy()

        if not self.pending:
            ttk.Label(
                self.pending_container, text="No pending requests", foreground=FG_DIM
            ).pack(anchor="w")
            return

        for req in self.pending:
            row = ttk.Frame(self.pending_container)
            row.pack(fill="x", pady=2)

            req_id = req.get("id", "?")
            ip = req.get("ip", "?")
            display_id = req_id[:8] + "..." if len(req_id) > 8 else req_id

            ttk.Label(row, text=f"ID: {display_id}", foreground=FG, font=("Consolas", 9)).pack(
                side="left", padx=(0, 10)
            )
            ttk.Label(row, text=f"IP: {ip}", foreground=FG_DIM, font=("Consolas", 9)).pack(
                side="left", padx=(0, 10)
            )

            ttk.Button(
                row,
                text="Approve",
                style="Approve.TButton",
                command=lambda rid=req_id: self._run_threaded(self._approve_request, rid),
            ).pack(side="right", padx=(4, 0))
            ttk.Button(
                row,
                text="Deny",
                style="Deny.TButton",
                command=lambda rid=req_id: self._run_threaded(self._deny_request, rid),
            ).pack(side="right")

    def _approve_request(self, request_id: str):
        self._set_status("Approving request...")
        result = execute_command(
            self.key, self._get_base_url(), "approve", {"id": request_id}, log_fn=self._log
        )
        if not result:
            self._set_status("Failed to approve")
            return
        if result.get("success"):
            token = result.get("data", {}).get("token", "")
            self._log(f"Approved: {mask_token(token) if token else request_id[:8]}")
            # Show token in copyable dialog so admin can copy it
            if token:
                self.root.after(0, lambda: self._show_token_dialog(token))
            self._fetch_all()
        else:
            self._log(f"ERROR: {result.get('message', 'Failed')}")
            self._set_status("Error")

    def _show_token_dialog(self, token: str):
        """Show the generated device token in a copyable dialog."""
        dialog = tk.Toplevel(self.root)
        dialog.title("Device Approved")
        dialog.configure(bg=BG)
        dialog.resizable(False, False)

        # Center on parent
        dialog.update_idletasks()
        w, h = 480, 260
        x = self.root.winfo_x() + (self.root.winfo_width() - w) // 2
        y = self.root.winfo_y() + (self.root.winfo_height() - h) // 2
        dialog.geometry(f"{w}x{h}+{x}+{y}")
        dialog.transient(self.root)
        dialog.grab_set()

        # Title
        tk.Label(
            dialog,
            text="Device Approved Successfully",
            bg=BG,
            fg=ACCENT_GREEN,
            font=("Segoe UI", 13, "bold"),
        ).pack(pady=(20, 5))

        tk.Label(
            dialog,
            text="Copy the token below and provide it to the device:",
            bg=BG,
            fg=FG_DIM,
            font=("Segoe UI", 9),
        ).pack(pady=(0, 10))

        # Token display (read-only entry for easy copy)
        token_var = tk.StringVar(value=token)
        token_entry = tk.Entry(
            dialog,
            textvariable=token_var,
            readonlybackground=BG_WIDGET,
            fg=ACCENT_CYAN,
            font=("Consolas", 10),
            borderwidth=0,
            highlightthickness=1,
            highlightcolor=ACCENT_CYAN,
            highlightbackground=BORDER,
            state="readonly",
            justify="center",
        )
        token_entry.pack(fill="x", padx=30, pady=(0, 10))
        token_entry.select_range(0, "end")

        # Buttons frame
        btn_frame = tk.Frame(dialog, bg=BG)
        btn_frame.pack(pady=(5, 20))

        def copy_token():
            dialog.clipboard_clear()
            dialog.clipboard_append(token)
            copy_btn.configure(text="Copied!", state="disabled")
            dialog.after(1500, lambda: copy_btn.configure(text="Copy Token", state="normal"))

        copy_btn = tk.Button(
            btn_frame,
            text="Copy Token",
            bg=ACCENT_GREEN,
            fg="#111111",
            font=("Segoe UI", 10, "bold"),
            borderwidth=0,
            padx=16,
            pady=4,
            cursor="hand2",
            command=copy_token,
        )
        copy_btn.pack(side="left", padx=(0, 10))

        tk.Button(
            btn_frame,
            text="Close",
            bg=BG_WIDGET,
            fg=FG,
            font=("Segoe UI", 10),
            borderwidth=0,
            padx=16,
            pady=4,
            cursor="hand2",
            command=dialog.destroy,
        ).pack(side="left")

    def _deny_request(self, request_id: str):
        self._set_status("Denying request...")
        result = execute_command(
            self.key, self._get_base_url(), "deny", {"id": request_id}, log_fn=self._log
        )
        if not result:
            self._set_status("Failed to deny")
            return
        if result.get("success"):
            self._log(f"Denied request: {request_id[:8]}...")
            self._fetch_pending()
        else:
            self._log(f"ERROR: {result.get('message', 'Failed')}")
            self._set_status("Error")

    # ── Refresh ───────────────────────────────────────────────────

    def _on_refresh(self):
        self._log("Refreshing...")
        self._run_threaded(self._fetch_all)


# ─── Main ─────────────────────────────────────────────────────────
def main():
    secret = load_env_value("BRIDGE_SECRET")
    if not secret:
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror(
            "Configuration Error",
            f"BRIDGE_SECRET not found in .env\n\n"
            f"Make sure .env exists in:\n{os.path.dirname(os.path.abspath(__file__))}",
        )
        sys.exit(1)

    key = derive_key(secret)

    root = tk.Tk()
    app = DeviceAdminApp(root, key)
    root.mainloop()


if __name__ == "__main__":
    main()
