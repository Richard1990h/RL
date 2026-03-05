"""
Window scanner for Claude Bridge.
Enumerates visible windows with process info via ctypes + psutil.
No PowerShell/subprocess dependency — works in sandboxed environments.
Writes JSON to a temp file that the bridge reads.
"""
import ctypes
import ctypes.wintypes
import json
import os
import re
import sys
import time

try:
    import psutil
except ImportError:
    psutil = None

SCAN_FILE = os.path.join(
    os.environ.get("TEMP", r"C:\Users\Richard\AppData\Local\Temp"),
    "claude-bridge-windows.json",
)
INTERVAL = 3  # seconds between scans

# ── Windows API ────────────────────────────────────────────────────
user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32

EnumWindowsProc = ctypes.WINFUNCTYPE(
    ctypes.c_bool, ctypes.wintypes.HWND, ctypes.wintypes.LPARAM
)


def get_visible_windows():
    """Enumerate all visible windows with title, PID, and process name."""
    results = []

    def callback(hwnd, _):
        if not user32.IsWindowVisible(hwnd):
            return True
        length = user32.GetWindowTextLengthW(hwnd)
        if length == 0:
            return True
        buf = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buf, length + 1)
        title = buf.value

        pid = ctypes.wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        pid_val = pid.value

        # Get process name via psutil (fastest, no subprocess needed)
        proc_name = ""
        if psutil:
            try:
                proc_name = psutil.Process(pid_val).name()
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass

        # Fallback: ctypes OpenProcess + GetModuleBaseName
        if not proc_name:
            try:
                h = kernel32.OpenProcess(0x0410, False, pid_val)
                if h:
                    buf2 = ctypes.create_unicode_buffer(260)
                    if ctypes.windll.psapi.GetModuleBaseNameW(h, None, buf2, 260):
                        proc_name = buf2.value
                    kernel32.CloseHandle(h)
            except Exception:
                pass

        results.append((hwnd, pid_val, proc_name, title))
        return True

    user32.EnumWindows(EnumWindowsProc(callback), 0)
    return results


def get_child_process_info(parent_pid):
    """Get process info: CWD from the window process itself, plus child process command lines."""
    if not psutil:
        return {"childPid": str(parent_pid), "commandLine": "", "cwd": ""}

    best_cmd = ""
    best_pid = parent_pid
    best_cwd = ""

    # First: get CWD from the window-owning process itself (e.g., claude.exe)
    try:
        parent = psutil.Process(parent_pid)
        best_cwd = parent.cwd()
        pname = parent.name().lower()
        try:
            best_cmd = " ".join(parent.cmdline())
        except (psutil.AccessDenied, psutil.NoSuchProcess):
            pass
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        pass

    # Walk children for richer command line info (snapshot paths, etc.)
    # But do NOT override parent CWD — it's more accurate for Claude Code
    parent_cwd = best_cwd
    visited = set()
    queue = [parent_pid]

    while queue:
        current = queue.pop(0)
        if current in visited:
            continue
        visited.add(current)

        try:
            children = psutil.Process(current).children(recursive=False)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

        for child in children:
            try:
                cname = child.name().lower()
                try:
                    cmdline = child.cmdline()
                    cmd = " ".join(cmdline) if cmdline else ""
                except (psutil.AccessDenied, psutil.NoSuchProcess):
                    cmd = ""

                if cmd and any(k in cname for k in ("node", "claude", "codex", "bash")):
                    if ".claude/projects" in cmd or "shell-snapshots" in cmd:
                        best_cmd = cmd
                        best_pid = child.pid
                        break

                queue.append(child.pid)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue

    # Always prefer the parent process CWD (claude.exe working dir)
    if parent_cwd:
        best_cwd = parent_cwd

    return {"childPid": str(best_pid), "commandLine": best_cmd, "cwd": best_cwd}


def extract_project_dir(command_line, cwd=""):
    """Extract project directory from CWD, command line, or shell-snapshot paths."""
    # Strategy 1: CWD is the most reliable source for Claude Code processes
    if cwd and os.path.isdir(cwd):
        return cwd

    if not command_line:
        return ""

    # Strategy 2: Look for .claude/projects/XXXXX/ in command line
    for source in [command_line]:
        cl = source.replace("\\", "/")
        m = re.search(r'\.claude/projects/([^/\s"]+)', cl)
        if m:
            encoded = m.group(1)
            decoded = encoded.replace("--", "\x00").replace("-", "\\").replace("\x00", "-")
            if len(decoded) > 1 and decoded[1] == "\\":
                decoded = decoded[0] + ":" + decoded[1:]
            return decoded

    # Strategy 3: Look for --cwd or --project flags
    cl = command_line.replace("\\", "/")
    m = re.search(r'(?:--cwd|--project)[=\s]+["\']?([^"\']+)', cl)
    if m:
        return m.group(1).strip()

    return ""


def scan_once():
    """Perform one scan and return the window list as JSON-serializable data."""
    raw_windows = get_visible_windows()
    windows = []

    for hwnd, pid, proc_name, title in raw_windows:
        lower_title = title.lower()
        lower_proc = proc_name.lower().replace(".exe", "")

        # Skip bridge windows
        if any(k in lower_title for k in ("claude_bridge", "claude-bridge", "claude bridge")):
            continue

        # Check if this is a terminal/claude window
        is_terminal = (
            "claude" in lower_title
            or "codex" in lower_title
            or lower_proc in ("claude", "claude-code", "codex", "cmd", "conhost",
                              "powershell", "pwsh", "windowsterminal")
            or "command prompt" in lower_title
            or "powershell" in lower_title
            or "windows terminal" in lower_title
            or "administrator:" in lower_title
        )

        child_info = get_child_process_info(pid) if is_terminal else {"childPid": str(pid), "commandLine": "", "cwd": ""}
        command_line = child_info.get("commandLine", "")
        cwd = child_info.get("cwd", "")
        project_dir = extract_project_dir(command_line, cwd) if is_terminal else ""
        is_codex = "codex" in command_line.lower() if command_line else False

        label = title
        if is_codex:
            label = "Codex"
        elif project_dir:
            segments = [s for s in project_dir.replace("/", "\\").split("\\") if s]
            label = "\\".join(segments[-2:]) if len(segments) >= 2 else project_dir

        windows.append({
            "hwnd": str(hwnd),
            "pid": child_info.get("childPid", str(pid)),
            "windowPid": str(pid),
            "title": title,
            "procName": proc_name,
            "label": label,
            "projectDir": project_dir,
            "commandLine": command_line[:500],  # Truncate long command lines
            "isCodex": is_codex,
            "isTerminal": is_terminal,
        })

    return windows


def main():
    once = "--once" in sys.argv
    data = {}

    while True:
        try:
            windows = scan_once()
            data = {"windows": windows, "scannedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
            # Atomic write
            tmp = SCAN_FILE + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(data, f)
            os.replace(tmp, SCAN_FILE)
        except Exception as e:
            print(f"Scan error: {e}", file=sys.stderr)

        if once:
            sys.stdout.buffer.write(json.dumps(data).encode("utf-8"))
            sys.stdout.buffer.write(b"\n")
            break

        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
