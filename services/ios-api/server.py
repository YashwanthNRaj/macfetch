#!/usr/bin/env python3
"""Container-ready MacFetch API for deployed iPhone clients."""

from __future__ import annotations

import hmac
import json
import mimetypes
import os
import re
import shutil
import subprocess
import threading
import time
import uuid
from collections import defaultdict, deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, urlparse

HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "9432"))
SERVICE_TOKEN = os.environ.get("MACFETCH_SERVICE_TOKEN", "macfetch-dev-only")
WORK_ROOT = Path(os.environ.get("MACFETCH_WORK_ROOT", "/tmp/macfetch-ios"))
JOB_TTL = int(os.environ.get("MACFETCH_JOB_TTL_SECONDS", "3600"))
MAX_ACTIVE = int(os.environ.get("MACFETCH_MAX_ACTIVE", "1"))
MAX_QUEUE = int(os.environ.get("MACFETCH_MAX_QUEUE", "6"))
MAX_FILESIZE = os.environ.get("MACFETCH_MAX_FILESIZE", "4G")
ALLOWED_HOSTS = {
    "youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com",
    "youtu.be", "youtube-nocookie.com", "www.youtube-nocookie.com",
}
JOBS: dict[str, dict] = {}
JOBS_LOCK = threading.Lock()
PENDING_DOWNLOADS: deque[tuple[str, dict]] = deque()
QUEUE_CONDITION = threading.Condition()
RATE_LOCK = threading.Lock()
RATE_EVENTS: dict[tuple[str, str], deque[float]] = defaultdict(deque)
ACTIVE_PROCESSES: dict[str, subprocess.Popen[str]] = {}
PROCESS_LOCK = threading.Lock()


def tool(name: str) -> str | None:
    return shutil.which(name)


def validate_url(raw: str) -> str:
    value = raw.strip()
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or (parsed.hostname or "").lower() not in ALLOWED_HOSTS:
        raise ValueError("Valid YouTube link daalo.")
    return value


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
        update_job(job_id, queuePosition=0, startedAt=time.time(), updatedAt=time.time())
        run_download(job_id, payload)


def public_job(job: dict) -> dict:
    return {key: value for key, value in job.items() if key not in {"directory", "filepath", "clientKey"}}


def rate_allowed(client: str, action: str, limit: int, window: int) -> bool:
    now = time.time()
    key = (client, action)
    with RATE_LOCK:
        events = RATE_EVENTS[key]
        while events and events[0] < now - window:
            events.popleft()
        if len(events) >= limit:
            return False
        events.append(now)
        return True


def cleanup_expired() -> None:
    cutoff = time.time() - JOB_TTL
    expired: list[tuple[str, str]] = []
    with JOBS_LOCK:
        for job_id, job in list(JOBS.items()):
            if job.get("status") in {"done", "error"} and float(job.get("updatedAt", 0)) < cutoff:
                expired.append((job_id, str(job.get("directory", ""))))
                JOBS.pop(job_id, None)
    for _, directory in expired:
        if directory:
            shutil.rmtree(directory, ignore_errors=True)


def useful_error(lines: list[str]) -> str:
    raw = next((line for line in reversed(lines) if "ERROR:" in line), lines[-1] if lines else "Download ruk gaya.")
    return raw.removeprefix("ERROR: ")[:360]


def run_download(job_id: str, payload: dict) -> None:
    yt_dlp = tool("yt-dlp")
    ffmpeg = tool("ffmpeg")
    if not yt_dlp or not ffmpeg:
        update_job(job_id, status="error", error="Download engine ready nahi hai.", updatedAt=time.time())
        return

    directory = WORK_ROOT / job_id
    directory.mkdir(parents=True, exist_ok=True)
    url = payload["url"]
    mode = payload.get("mode", "video")
    quality = int(payload.get("quality", 1080))
    audio_format = payload.get("audioFormat", "m4a")
    template = str(directory / "%(title).180B [%(id)s].%(ext)s")
    command = [
        yt_dlp,
        "--newline",
        "--no-playlist",
        "--no-overwrites",
        "--windows-filenames",
        "--max-filesize", MAX_FILESIZE,
        "--progress-template", "download:%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s",
        "--progress-template", "postprocess:PROCESSING",
        "-o", template,
    ]
    if mode == "audio":
        audio_format = audio_format if audio_format in {"m4a", "mp3", "flac", "wav"} else "m4a"
        command.extend(["-f", "bestaudio/best", "-x", "--audio-format", audio_format, "--audio-quality", "0"])
    else:
        quality = quality if quality in {144, 240, 360, 480, 720, 1080, 1440, 2160, 4320} else 1080
        selector = (
            f"bestvideo[height<={quality}][ext=mp4]+bestaudio[ext=m4a]/"
            f"bestvideo[height<={quality}]+bestaudio/best[height<={quality}][ext=mp4]/best[height<={quality}]"
        )
        command.extend(["-f", selector, "--merge-output-format", "mp4", "--remux-video", "mp4"])
    command.append(url)

    update_job(job_id, status="downloading", updatedAt=time.time())
    lines: list[str] = []
    try:
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        set_active_process(job_id, process)
        assert process.stdout is not None
        for raw_line in process.stdout:
            line = raw_line.strip()
            if not line:
                continue
            lines = [*lines[-14:], line]
            if line.startswith("download:"):
                parts = line.removeprefix("download:").split("|")
                match = re.search(r"([0-9.]+)%", parts[0])
                raw_progress = min(float(match.group(1)) if match else 0, 100.0)
                progress = raw_progress
                update_job(
                    job_id,
                    status="downloading",
                    progress=progress,
                    speed=parts[1].strip() if len(parts) > 1 else "",
                    eta=parts[2].strip() if len(parts) > 2 else "",
                    downloadedBytes=byte_value(parts[3]) if len(parts) > 3 else 0,
                    totalBytes=(byte_value(parts[4]) or byte_value(parts[5])) if len(parts) > 5 else 0,
                    updatedAt=time.time(),
                )
            elif line == "PROCESSING" or "Merging formats" in line or "Post-process" in line:
                update_job(job_id, status="processing", progress=99.0, speed="", eta="", updatedAt=time.time())

        if process.wait() != 0:
            set_active_process(job_id, None)
            update_job(job_id, status="error", error=useful_error(lines), updatedAt=time.time())
            return
        set_active_process(job_id, None)

        files = [path for path in directory.iterdir() if path.is_file() and path.suffix not in {".part", ".ytdl"}]
        if not files:
            update_job(job_id, status="error", error="File create nahi ho paayi.", updatedAt=time.time())
            return
        output = max(files, key=lambda path: path.stat().st_size)
        codec = audio_format.upper() if mode == "audio" else "Source codec"
        update_job(
            job_id,
            status="done",
            progress=100.0,
            speed="",
            eta="",
            filename=output.name,
            filepath=str(output),
            size=output.stat().st_size,
            container="MP4" if mode == "video" else output.suffix.removeprefix(".").upper(),
            codec=codec,
            downloadUrl=f"/api/ios/files/{job_id}",
            updatedAt=time.time(),
        )
    except Exception as exc:
        set_active_process(job_id, None)
        update_job(job_id, status="error", error=str(exc)[:360], updatedAt=time.time())


class Handler(BaseHTTPRequestHandler):
    server_version = "MacFetchCloud/1.0"

    def log_message(self, format: str, *args: object) -> None:
        return

    def authorized(self) -> bool:
        supplied = self.headers.get("X-MacFetch-Service-Token", "")
        return bool(SERVICE_TOKEN and hmac.compare_digest(supplied, SERVICE_TOKEN))

    def send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def read_json(self) -> dict:
        length = min(int(self.headers.get("Content-Length", "0")), 20_000)
        return json.loads(self.rfile.read(length) or b"{}")

    def client_key(self) -> str:
        return self.headers.get("X-MacFetch-Client-IP", self.client_address[0])[:96]

    def send_file(self, job: dict) -> None:
        path = Path(str(job.get("filepath", "")))
        if not path.is_file():
            self.send_json(410, {"error": "File expire ho gayi. Dobara download karo."})
            return
        total = path.stat().st_size
        start, end = 0, total - 1
        status = 200
        range_header = self.headers.get("Range", "")
        match = re.match(r"bytes=(\d*)-(\d*)", range_header)
        if match:
            if match.group(1):
                start = min(int(match.group(1)), total - 1)
            if match.group(2):
                end = min(int(match.group(2)), total - 1)
            if end < start:
                self.send_json(416, {"error": "Invalid file range."})
                return
            status = 206
        length = end - start + 1
        filename = str(job.get("filename", path.name))
        self.send_response(status)
        self.send_header("Content-Type", mimetypes.guess_type(filename)[0] or "application/octet-stream")
        self.send_header("Content-Length", str(length))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Disposition", f"attachment; filename*=UTF-8''{quote(filename)}")
        self.send_header("Cache-Control", "private, no-store")
        if status == 206:
            self.send_header("Content-Range", f"bytes {start}-{end}/{total}")
        self.end_headers()
        with path.open("rb") as handle:
            handle.seek(start)
            remaining = length
            while remaining > 0:
                chunk = handle.read(min(1024 * 1024, remaining))
                if not chunk:
                    break
                self.wfile.write(chunk)
                remaining -= len(chunk)

    def do_GET(self) -> None:
        cleanup_expired()
        if self.path == "/health":
            self.send_json(200, {"ready": bool(tool("yt-dlp") and tool("ffmpeg")), "destination": "iPhone Files / Downloads", "maxFileSize": MAX_FILESIZE})
            return
        if not self.authorized():
            self.send_json(401, {"error": "Service authorization failed."})
            return
        if self.path == "/jobs":
            client = self.client_key()
            with JOBS_LOCK:
                jobs = [public_job(job) for job in JOBS.values() if job.get("clientKey") == client]
            jobs.sort(key=lambda item: float(item.get("createdAt", 0)), reverse=True)
            self.send_json(200, {"jobs": jobs[:12]})
            return
        if self.path.startswith("/jobs/"):
            job_id = self.path.rsplit("/", 1)[-1]
            with JOBS_LOCK:
                stored = JOBS.get(job_id)
                job = public_job(stored) if stored and stored.get("clientKey") == self.client_key() else None
            self.send_json(200, job) if job else self.send_json(404, {"error": "Download job nahi mila."})
            return
        if self.path.startswith("/files/"):
            job_id = self.path.rsplit("/", 1)[-1]
            with JOBS_LOCK:
                stored = JOBS.get(job_id)
                job = dict(stored) if stored and stored.get("clientKey") == self.client_key() else None
            if not job or job.get("status") != "done":
                self.send_json(404, {"error": "Download file ready nahi hai."})
                return
            self.send_file(job)
            return
        self.send_json(404, {"error": "Not found."})

    def do_POST(self) -> None:
        cleanup_expired()
        if not self.authorized():
            self.send_json(401, {"error": "Service authorization failed."})
            return
        try:
            payload = self.read_json()
            if self.path == "/inspect":
                if not rate_allowed(self.client_key(), "inspect", 20, 600):
                    self.send_json(429, {"error": "Bahut fast ho raha hai. Thoda ruk ke try karo."})
                    return
                url = validate_url(str(payload.get("url", "")))
                yt_dlp = tool("yt-dlp")
                if not yt_dlp:
                    self.send_json(503, {"error": "Download engine ready nahi hai."})
                    return
                result = subprocess.run([yt_dlp, "--dump-single-json", "--no-playlist", "--no-warnings", url], capture_output=True, text=True, timeout=90)
                if result.returncode != 0:
                    error = useful_error(result.stderr.splitlines())
                    self.send_json(422, {"error": error})
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
            if self.path == "/download":
                if not rate_allowed(self.client_key(), "download", 6, 3600):
                    self.send_json(429, {"error": "Hourly download limit hit ho gaya. Baad mein try karo."})
                    return
                with JOBS_LOCK:
                    active = sum(1 for job in JOBS.values() if job.get("status") in {"queued", "downloading", "processing"})
                if active >= MAX_QUEUE:
                    self.send_json(503, {"error": "Server abhi full hai. Thodi der mein try karo."})
                    return
                payload["url"] = validate_url(str(payload.get("url", "")))
                job_id = uuid.uuid4().hex
                directory = str(WORK_ROOT / job_id)
                job = {
                    "id": job_id,
                    "status": "queued",
                    "title": str(payload.get("title") or "YouTube download")[:180],
                    "thumbnail": str(payload.get("thumbnail") or "")[:2048],
                    "progress": 0,
                    "queuePosition": 0,
                    "mode": payload.get("mode", "video"),
                    "format": payload.get("audioFormat", "m4a") if payload.get("mode") == "audio" else f"{int(payload.get('quality', 1080))}p",
                    "directory": directory,
                    "clientKey": self.client_key(),
                    "createdAt": time.time(),
                    "updatedAt": time.time(),
                }
                with JOBS_LOCK:
                    JOBS[job_id] = job
                enqueue_download(job_id, payload)
                with JOBS_LOCK:
                    job = dict(JOBS[job_id])
                self.send_json(202, public_job(job))
                return
            self.send_json(404, {"error": "Not found."})
        except ValueError as exc:
            self.send_json(400, {"error": str(exc)})
        except subprocess.TimeoutExpired:
            self.send_json(504, {"error": "YouTube ne time pe reply nahi diya. Phir try karo."})
        except Exception as exc:
            self.send_json(500, {"error": str(exc)[:360]})

    def do_DELETE(self) -> None:
        cleanup_expired()
        if not self.authorized():
            self.send_json(401, {"error": "Service authorization failed."})
            return
        if not self.path.startswith("/jobs/"):
            self.send_json(404, {"error": "Not found."})
            return
        job_id = self.path.rsplit("/", 1)[-1]
        with JOBS_LOCK:
            stored = JOBS.get(job_id)
            if not stored or stored.get("clientKey") != self.client_key():
                self.send_json(404, {"error": "Download job nahi mila."})
                return
            directory = str(stored.get("directory", ""))
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
            JOBS.pop(job_id, None)
        if directory:
            threading.Thread(target=lambda: (time.sleep(0.4), shutil.rmtree(directory, ignore_errors=True)), daemon=True).start()
        self.send_json(200, {"ok": True, "cancelled": bool(process)})


def main() -> None:
    WORK_ROOT.mkdir(parents=True, exist_ok=True)
    for index in range(max(1, MAX_ACTIVE)):
        threading.Thread(target=download_worker, daemon=True, name=f"macfetch-ios-queue-{index + 1}").start()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"MacFetch iOS API ready at http://{HOST}:{PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
