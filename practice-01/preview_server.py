"""Keep the forest preview running independently of the launching terminal."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import hashlib
import json
import os
import signal
import socket
import subprocess
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parent
URL = "http://127.0.0.1:8000/"
HEALTH_PATH = "/__forest_preview_status__"
PROJECT = hashlib.sha256(str(ROOT).lower().encode("utf-8")).hexdigest()


def status():
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(URL.rstrip("/") + HEALTH_PATH, timeout=.6) as response:
            info = json.load(response)
        if info.get("project") == PROJECT and info.get("service") == "forest-preview":
            return info
    except (OSError, ValueError):
        pass
    return None


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == HEALTH_PATH:
            body = json.dumps({"service": "forest-preview", "project": PROJECT, "pid": os.getpid()}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def end_headers(self):
        if self.path.split("?")[0].endswith(("/", ".html", ".js", ".css")):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()


def serve():
    server = ThreadingHTTPServer(("127.0.0.1", 8000), partial(Handler, directory=str(ROOT)))
    server.daemon_threads = True
    print("Forest preview ready:", URL, flush=True)
    server.serve_forever()


def start():
    if status():
        print("Already running:", URL)
        return
    with socket.socket() as probe:
        probe.settimeout(.6)
        try:
            probe.connect(("127.0.0.1", 8000))
        except (ConnectionRefusedError, TimeoutError):
            pass
        else:
            raise RuntimeError("Port 8000 belongs to another server. No process was stopped.")
    options = {"stdin": subprocess.DEVNULL, "close_fds": True, "cwd": str(ROOT)}
    if os.name == "nt":
        options["creationflags"] = (subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_BREAKAWAY_FROM_JOB)
    else:
        options["start_new_session"] = True
    with (ROOT / ".preview.log").open("ab", buffering=0) as log:
        child = subprocess.Popen([sys.executable, "-u", str(Path(__file__).resolve()), "serve"], stdout=log, stderr=log, **options)
    for _ in range(30):
        info = status()
        if info:
            print("Started independent server:", URL, "PID:", info["pid"])
            return
        if child.poll() is not None:
            raise RuntimeError("Server exited. Check practice-01/.preview.log.")
        time.sleep(.1)
    raise RuntimeError("Server did not respond. Check practice-01/.preview.log.")


def stop():
    info = status()
    if not info:
        print("This project's server is not running. No process was stopped.")
        return
    os.kill(int(info["pid"]), signal.SIGTERM)
    print("Stopped this project's preview server.")


if __name__ == "__main__":
    try:
        action = sys.argv[1] if len(sys.argv) > 1 else "start"
        if action == "serve":
            serve()
        elif action == "start":
            start()
        elif action == "stop":
            stop()
        elif action == "status":
            print(json.dumps(status(), ensure_ascii=True))
        else:
            raise ValueError("Use start, stop or status.")
    except Exception as error:
        print("Preview error:", error, file=sys.stderr)
        sys.exit(1)
