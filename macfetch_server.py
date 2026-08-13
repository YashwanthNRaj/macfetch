#!/usr/bin/env python3
"""Local-only bridge between the MacFetch UI and yt-dlp."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import threading
import time
import uuid
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

HOST = "127.0.0.1"
PORT = 8432
DEFAULT_OUTPUT_DIR = Path.home() / "Downloads" / "MacFetch"
CONFIG_FILE = Path.home() / "Library" / "Application Support" / "MacFetch" / "config.json"
ALLOWED_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "youtube-nocookie.com", "www.youtube-nocookie.com"}
JOBS: dict[str, dict] = {}
JOBS_LOCK = threading.Lock()
PENDING_DOWNLOADS: deque[tuple[str, dict]] = deque()
QUEUE_CONDITION = threading.Condition()
ACTIVE_PROCESSES: dict[str, subprocess.Popen[str]] = {}
PROCESS_LOCK = threading.Lock()


def load_output_dir() -> Path:
    try:
        configured = json.loads(CONFIG_FILE.read_text(encoding="utf-8")).get("outputDir", "")
        path = Path(configured).expanduser()
        return path if path.is_absolute() else DEFAULT_OUTPUT_DIR
    except (OSError, ValueError, TypeError):
        return DEFAULT_OUTPUT_DIR


OUTPUT_DIR = load_output_dir()


def display_path(path: Path) -> str:
    try:
        return f"~/{path.relative_to(Path.home())}"
    except ValueError:
        return str(path)


def save_output_dir(path: Path) -> None:
    CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps({"outputDir": str(path)}, indent=2), encoding="utf-8")


def tool(name: str) -> str | None:
    return shutil.which(name) or (f"/opt/homebrew/bin/{name}" if Path(f"/opt/homebrew/bin/{name}").exists() else None)


def validate_url(raw: str) -> str:
    value = raw.strip()
    parsed = urlparse(value)
    host = (parsed.hostname or "").lower()
    if parsed.scheme not in {"http", "https"} or host not in ALLOWED_HOSTS:
        raise ValueError("Valid youtube.com ya youtu.be link daalo.")
    return value


def cookie_args(mode: str) -> list[str]:
    return ["--cookies-from-browser", "firefox"] if mode == "firefox" else []


def update_job(job_id: str, **updates: object) -> None:
    with JOBS_LOCK:
        if job_id in JOBS:
            JOBS[job_id].update(updates)


def byte_value(raw: str) -> int:
    try:
        return max(0, int(float(raw)))
    except (TypeError, ValueError):
        return 0


def set_active_process(job_id: str, process: subprocess.Popen[str] | None) -> None:
    with PROCESS_LOCK:
        if process is None:
            ACTIVE_PROCESSES.pop(job_id, None)
        else:
            ACTIVE_PROCESSES[job_id] = process


def refresh_queue_positions(pending_ids: list[str]) -> None:
    with JOBS_LOCK:
        for position, queued_id in enumerate(pending_ids, start=1):
            if queued_id in JOBS:
                JOBS[queued_id]["queuePosition"] = position


def enqueue_download(job_id: str, payload: dict) -> None:
    with QUEUE_CONDITION:
        PENDING_DOWNLOADS.append((job_id, payload))
        refresh_queue_positions([queued_id for queued_id, _ in PENDING_DOWNLOADS])
        QUEUE_CONDITION.notify()


def download_worker() -> None:
    while True:
        with QUEUE_CONDITION:
            while not PENDING_DOWNLOADS:
                QUEUE_CONDITION.wait()
            job_id, payload = PENDING_DOWNLOADS.popleft()
            refresh_queue_positions([queued_id for queued_id, _ in PENDING_DOWNLOADS])
        with JOBS_LOCK:
            if job_id not in JOBS:
                continue
        update_job(job_id, queuePosition=0, startedAt=time.time())
        run_download(job_id, payload)


def run_download(job_id: str, payload: dict) -> None:
    yt_dlp = tool("yt-dlp")
    if not yt_dlp:
        update_job(job_id, status="error", error="yt-dlp install nahi hai.")
        return

    target_dir = OUTPUT_DIR
    target_dir.mkdir(parents=True, exist_ok=True)
    url = payload["url"]
    mode = payload.get("mode", "video")
    quality = int(payload.get("quality", 1080))
    audio_format = payload.get("audioFormat", "m4a")
    output_template = str(target_dir / "%(title).180B [%(id)s].%(ext)s")

    command = [
        yt_dlp,
        "--newline",
        "--progress",
        "--no-playlist",
        "--no-overwrites",
        "--windows-filenames",
        "--progress-template",
        "download:download:%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s",
        "--progress-template",
        "postprocess:PROCESSING",
        "--print",
        "after_move:FINAL_FILE:%(filepath)s",
        "-o",
        output_template,
        *cookie_args(payload.get("cookies", "firefox")),
    ]

    if mode == "audio":
        if audio_format not in {"m4a", "mp3", "flac", "wav"}:
            audio_format = "m4a"
        command.extend(["-f", "bestaudio/best", "-x", "--audio-format", audio_format, "--audio-quality", "0"])
    else:
        quality = quality if quality in {144, 240, 360, 480, 720, 1080, 1440, 2160, 4320} else 1080
        format_selector = (
            f"bestvideo[height<={quality}][ext=mp4]+bestaudio[ext=m4a]/"
            f"bestvideo[height<={quality}]+bestaudio/best[height<={quality}][ext=mp4]/best[height<={quality}]"
        )
        command.extend(["-f", format_selector, "--merge-output-format", "mp4", "--remux-video", "mp4"])

    command.append(url)
    update_job(job_id, status="downloading")
    last_lines: list[str] = []
    final_file = ""

    try:
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        set_active_process(job_id, process)
        assert process.stdout is not None
        for raw_line in process.stdout:
            line = raw_line.strip()
            if not line:
                continue
            last_lines.append(line)
            last_lines = last_lines[-10:]
            print(f"RAW: {repr(raw_line)}", flush=True)
            if line.startswith("download:"):
                parts = line.removeprefix("download:").split("|")
                match = re.search(r"([0-9.]+)%", parts[0])
                progress = float(match.group(1)) if match else 0
                update_job(
                    job_id,
                    status="downloading",
                    progress=min(progress, 99.0),
                    speed=parts[1].strip() if len(parts) > 1 else "",
                    eta=parts[2].strip() if len(parts) > 2 else "",
                    downloadedBytes=byte_value(parts[3]) if len(parts) > 3 else 0,
                    totalBytes=(byte_value(parts[4]) or byte_value(parts[5])) if len(parts) > 5 else 0,
                )
            elif line.startswith("FINAL_FILE:"):
                final_file = line.removeprefix("FINAL_FILE:")
            elif line == "PROCESSING" or "Merging formats" in line or "Post-process" in line:
                update_job(job_id, status="processing", progress=99.0, speed="", eta="")

        exit_code = process.wait()
        set_active_process(job_id, None)
        if exit_code == 0:
            final_size = Path(final_file).stat().st_size if final_file and Path(final_file).is_file() else 0
            update_job(job_id, status="done", progress=100.0, output=str(target_dir), speed="", eta="", size=final_size, downloadedBytes=final_size, totalBytes=final_size)
        else:
            useful = next((line for line in reversed(last_lines) if "ERROR:" in line), last_lines[-1] if last_lines else "yt-dlp stopped unexpectedly.")
            update_job(job_id, status="error", error=useful.removeprefix("ERROR: ")[:320])
    except Exception as exc:
        set_active_process(job_id, None)
        update_job(job_id, status="error", error=str(exc)[:320])


class Handler(BaseHTTPRequestHandler):
    server_version = "MacFetch/1.0"

    def log_message(self, format: str, *args: object) -> None:
        return

    def cors(self) -> None:
        origin = self.headers.get("Origin", "*")
        self.send_header("Access-Control-Allow-Origin", origin if origin else "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")

    def send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def read_json(self) -> dict:
        length = min(int(self.headers.get("Content-Length", "0")), 20_000)
        return json.loads(self.rfile.read(length) or b"{}")

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.cors()
        self.end_headers()

    def do_GET(self) -> None:
        if self.path == "/api/health":
            yt_dlp = tool("yt-dlp")
            ffmpeg = tool("ffmpeg")
            self.send_json(200, {"ready": bool(yt_dlp and ffmpeg), "ytDlp": bool(yt_dlp), "ffmpeg": bool(ffmpeg), "outputDir": display_path(OUTPUT_DIR)})
            return
        if self.path == "/api/jobs":
            with JOBS_LOCK:
                jobs = sorted((dict(job) for job in JOBS.values()), key=lambda item: float(item.get("createdAt", 0)), reverse=True)[:12]
            self.send_json(200, {"jobs": jobs})
            return
        if self.path.startswith("/api/jobs/"):
            job_id = self.path.rsplit("/", 1)[-1]
            with JOBS_LOCK:
                job = JOBS.get(job_id)
            self.send_json(200, job) if job else self.send_json(404, {"error": "Download job not found."})
            return
        self.send_json(404, {"error": "Not found."})

    def do_DELETE(self) -> None:
        if not self.path.startswith("/api/jobs/"):
            self.send_json(404, {"error": "Not found."})
            return
        job_id = self.path.rsplit("/", 1)[-1]
        with QUEUE_CONDITION:
            kept = [(queued_id, payload) for queued_id, payload in PENDING_DOWNLOADS if queued_id != job_id]
            PENDING_DOWNLOADS.clear()
            PENDING_DOWNLOADS.extend(kept)
            refresh_queue_positions([queued_id for queued_id, _ in PENDING_DOWNLOADS])
        with PROCESS_LOCK:
            process = ACTIVE_PROCESSES.get(job_id)
        if process and process.poll() is None:
            process.terminate()
        with JOBS_LOCK:
            removed = JOBS.pop(job_id, None)
        self.send_json(200, {"ok": True, "cancelled": bool(process), "removed": bool(removed)})

    def do_POST(self) -> None:
        global OUTPUT_DIR
        try:
            payload = self.read_json()
            if self.path == "/api/stream":
                url = validate_url(str(payload.get("url", "")))
                mode = payload.get("mode", "video")
                quality = int(payload.get("quality", 1080))
                yt_dlp = tool("yt-dlp")
                if not yt_dlp:
                    self.send_json(503, {"error": "yt-dlp missing on server."})
                    return
                format_spec = f"best[height<={quality}]/best" if mode == "video" else "bestaudio/best"
                cmd = [yt_dlp, "-g", "-f", format_spec, *cookie_args(payload.get("cookies", "firefox")), url]
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
                if result.returncode == 0 and result.stdout.strip():
                    stream_urls = result.stdout.strip().splitlines()
                    self.send_json(200, {"downloadUrl": stream_urls[0], "streamUrls": stream_urls})
                    return
                self.send_json(422, {"error": "Could not extract direct download stream link."})
                return

            if self.path == "/api/inspect":
                url = validate_url(str(payload.get("url", "")))
                yt_dlp = tool("yt-dlp")
                if not yt_dlp:
                    self.send_json(503, {"error": "yt-dlp missing hai. Pehle Homebrew se install karo."})
                    return
                command = [yt_dlp, "--dump-single-json", "--no-playlist", "--no-warnings", *cookie_args(payload.get("cookies", "firefox")), url]
                result = subprocess.run(command, capture_output=True, text=True, timeout=90)
                if result.returncode != 0:
                    error = next((line for line in reversed(result.stderr.splitlines()) if "ERROR:" in line), "Could not read this video.")
                    self.send_json(422, {"error": error.removeprefix("ERROR: ")[:320]})
                    return
                data = json.loads(result.stdout)
                heights = sorted({int(item["height"]) for item in data.get("formats", []) if item.get("height") and item.get("vcodec") != "none"})
                self.send_json(200, {
                    "title": data.get("title") or "Untitled video",
                    "channel": data.get("channel") or data.get("uploader") or "YouTube",
                    "thumbnail": data.get("thumbnail") or "",
                    "duration": data.get("duration") or 0,
                    "maxHeight": max(heights, default=0),
                    "availableHeights": heights,
                })
                return

            if self.path == "/api/download":
                payload["url"] = validate_url(str(payload.get("url", "")))
                job_id = uuid.uuid4().hex
                job = {
                    "id": job_id,
                    "status": "queued",
                    "title": str(payload.get("title") or "YouTube download")[:180],
                    "thumbnail": str(payload.get("thumbnail") or "")[:2048],
                    "progress": 0,
                    "queuePosition": 0,
                    "mode": payload.get("mode", "video"),
                    "format": payload.get("audioFormat", "m4a") if payload.get("mode") == "audio" else f"{int(payload.get('quality', 1080))}p",
                    "createdAt": time.time(),
                }
                with JOBS_LOCK:
                    JOBS[job_id] = job
                enqueue_download(job_id, payload)
                with JOBS_LOCK:
                    job = dict(JOBS[job_id])
                self.send_json(202, job)
                return

            if self.path == "/api/reveal":
                OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
                subprocess.Popen(["open", str(OUTPUT_DIR)])
                self.send_json(200, {"ok": True})
                return

            if self.path == "/api/choose-output":
                current = str(OUTPUT_DIR).replace("\\", "\\\\").replace('"', '\\"')
                script = f'POSIX path of (choose folder with prompt "MacFetch downloads kahan save kare?" default location POSIX file "{current}")'
                result = subprocess.run(["osascript", "-e", script], capture_output=True, text=True, timeout=120)
                if result.returncode != 0:
                    self.send_json(200, {"cancelled": True, "outputDir": display_path(OUTPUT_DIR)})
                    return
                chosen = Path(result.stdout.strip()).expanduser().resolve()
                if not chosen.is_absolute():
                    self.send_json(400, {"error": "Ye folder valid nahi hai."})
                    return
                OUTPUT_DIR = chosen
                OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
                save_output_dir(OUTPUT_DIR)
                self.send_json(200, {"ok": True, "outputDir": display_path(OUTPUT_DIR)})
                return

            if self.path == "/api/clipboard":
                result = subprocess.run(["pbpaste"], capture_output=True, text=True, timeout=3)
                if result.returncode != 0:
                    self.send_json(500, {"error": "macOS clipboard read nahi kar paaya."})
                    return
                self.send_json(200, {"text": result.stdout[:10_000]})
                return

            self.send_json(404, {"error": "Not found."})
        except ValueError as exc:
            self.send_json(400, {"error": str(exc)})
        except subprocess.TimeoutExpired:
            self.send_json(504, {"error": "YouTube reply dene mein zyada time laga. Phir try karo."})
        except Exception as exc:
            self.send_json(500, {"error": str(exc)[:320]})


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    threading.Thread(target=download_worker, daemon=True, name="macfetch-download-queue").start()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"MacFetch service ready at http://{HOST}:{PORT}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
