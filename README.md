# MacFetch

A private, local YouTube video and audio downloader for macOS. MacFetch wraps `yt-dlp` in a clean browser interface and can use the signed-in Firefox profile on the Mac when a video requires authentication.

## Start on macOS

1. Double-click `start.command` in Finder.
2. macOS may ask for permission the first time. Choose **Open**.
3. Paste a YouTube link, choose video or audio and a quality, then download.

Downloads default to `~/Downloads/MacFetch`. Use **Change** beside the output folder to choose another location with the native macOS folder picker; MacFetch remembers the selection.

Downloads use a first-in, first-out queue. The Mac app runs one job at a time so high-resolution merges do not overload the machine, while the interface keeps showing queue position, speed, ETA, processing state, and completed items.

## iPhone app

The separate `/ios` page is a standalone deployed flow, not a Mac remote. It sends jobs through the website's same-origin API proxy to the containerized service in `services/ios-api`. The service runs `yt-dlp` and FFmpeg, keeps completed files temporarily, and streams the selected file back to Safari so it can be saved in iPhone Files.

Video downloads are always transcoded after fetching: 1080p and below use MP4 + H.264 High Profile + AAC-LC, while 1440p, 4K, and 8K use MP4 + HEVC Main 10 tagged as `hvc1` + AAC-LC. All MP4 files use `faststart`. The 8K output is standards-compatible HEVC, but actual 8K playback remains dependent on the iPhone model's decoder capability.

For a local iPhone preview:

1. Connect the Mac and iPhone to the same Wi-Fi network.
2. Double-click `start.command` and keep its Terminal window open.
3. Open the printed `iPhone preview` URL in Safari.

For production:

1. Deploy `services/ios-api/Dockerfile` to a container host.
2. Set a long random `MACFETCH_SERVICE_TOKEN` in the container.
3. Configure the frontend runtime with `IOS_API_ORIGIN` set to the HTTPS container origin and `IOS_SERVICE_TOKEN` set to the same secret.
4. Deploy the website and open `/ios` on the public HTTPS URL.

The production service supports public videos. Firefox-cookie access is intentionally limited to the local Mac app; a cloud service cannot safely read an individual user's local browser session. Temporary files expire after one hour by default. Rate limits, queue limits, maximum file size, and cleanup behavior are configurable with the variables documented in `services/ios-api/.env.example`.

The iPhone service also defaults to one active job at a time—important for expensive HEVC and 8K conversion—and exposes only each visitor's own queue through the same-origin proxy.

## Requirements

- macOS 12 or newer
- Node.js 22 or newer
- Python 3
- Homebrew (the launcher uses it to install `yt-dlp` and `ffmpeg` if missing)
- Firefox, only if Firefox-cookie access is selected

## Manual development

Run the local service:

```sh
python3 macfetch_server.py
```

In another terminal, run the interface:

```sh
npm run dev
```

Open <http://localhost:3000>.

Only download media you own or have permission to save. YouTube availability and access restrictions still apply.
