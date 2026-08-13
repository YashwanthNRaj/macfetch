# ⚡ MacFetch — Cloud & Local YouTube Media Platform

> A modern, high-performance YouTube video & audio downloader platform built with **Next.js (RSC)**, **Vite**, **Python**, `yt-dlp`, and **FFmpeg**. Features a **SaveFrom.net-style Cloud Web App** (for Vercel deployment) and a **Local macOS App** mode.

---

## 🌟 Key Features

- **🌐 SaveFrom.net Cloud Mode**: Deploy to **Vercel** with direct browser downloads (`.mp4` / `.mp3`) for visitors globally across Desktop, iPhone, and Android.
- **🖥️ Local macOS Engine**: Runs seamlessly on your Mac with 1-click startup (`start.command`), streaming directly into `~/Downloads/MacFetch`.
- **🚀 8K / 4K / High-FPS Support**: Extracts maximum quality streams (up to 4320p) with loss-free single-pass FFmpeg merging.
- **🎧 Audio Extraction**: One-tap extraction into `MP3`, `M4A`, `FLAC`, and `WAV` formats with ID3 metadata preservation.
- **⚡ Live 3D Transfer HUD**: Real-time progress monitoring with smooth 3D Gyro HUD visuals, transfer speed, and ETA calculation.
- **📱 Responsive iOS Companion**: Standalone mobile PWA view (`/ios`) tailored for Safari & Add to Home Screen.

---

## 🏗️ Architecture Overview

```
                          ┌──────────────────────────┐
                          │   Vercel / Next.js UI    │
                          │   (https://macfetch.app) │
                          └─────────────┬────────────┘
                                        │
                                  HTTP / REST API
                                        │
                 ┌──────────────────────┴──────────────────────┐
                 ▼                                             ▼
  ┌─────────────────────────────┐               ┌─────────────────────────────┐
  │   Cloud API Backend Engine  │               │   Local Mac Server Engine   │
  │  (Render / Docker / Fly.io) │               │   (http://127.0.0.1:8432)   │
  └──────────────┬──────────────┘               └──────────────┬──────────────┘
                 │                                             │
          `yt-dlp` Stream                                `yt-dlp` Local
                 │                                             │
                 ▼                                             ▼
  ┌─────────────────────────────┐               ┌─────────────────────────────┐
  │   Browser Direct Download   │               │   Mac Finder Folder         │
  │   (iPhone / PC / Android)   │               │   (~/Downloads/MacFetch)    │
  └─────────────────────────────┘               └─────────────────────────────┘
```

---

## 🚀 Deployment Guide (SaveFrom.net Cloud Mode)

### 1. Deploy Cloud Downloader Engine (Render / Fly.io / Docker)

Deploy the containerized Python API server (`macfetch_server.py`) using the included `Dockerfile` and `render.yaml`:

- **Render**: Connect your GitHub repository to Render — it will automatically detect `render.yaml` and provision a Web Service on port `8432`.
- **Fly.io / Railway**: Run `fly launch` or import the repository to Railway using the `Dockerfile`.

*Copy your deployed API URL (e.g. `https://macfetch-api.onrender.com`).*

### 2. Deploy Frontend to Vercel

1. Push your code to GitHub.
2. Import the project in [Vercel](https://vercel.com).
3. Add the environment variable:
   ```env
   NEXT_PUBLIC_API_URL=https://macfetch-api.onrender.com/api
   ```
4. Deploy! Your SaveFrom-style web app is live at `https://your-project.vercel.app`.

---

## 💻 Local macOS Setup

### One-Click Start

1. Double-click `start.command` in Finder.
2. Open <http://localhost:3000> in your browser.
3. Paste any YouTube URL, select format/quality, and click **Check kar** -> **Download start kar**.

### Requirements

- **macOS 12+**
- **Node.js 22+**
- **Python 3+**
- **yt-dlp** & **FFmpeg** (installed automatically via Homebrew if missing)

---

## 🛠️ Tech Stack

- **Frontend**: Next.js 15 / Vinext, React 19, Lucide Icons, Vanilla CSS Design System
- **Backend Service**: Python 3, `yt-dlp`, FFmpeg
- **Database**: Drizzle ORM / SQLite
- **Deployment**: Vercel (Frontend), Docker / Render (Backend)

---

## 📄 Disclaimer

This project is intended strictly for personal archiving of copyright-free or self-owned content. Please comply with YouTube's Terms of Service and local copyright laws.
