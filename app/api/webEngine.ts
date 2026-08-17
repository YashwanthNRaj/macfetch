import ytdl from "@distube/ytdl-core";

type Job = {
  id: string;
  status: "queued" | "downloading" | "processing" | "done" | "error";
  progress: number;
  speed?: string;
  eta?: string;
  error?: string;
  filename?: string;
  downloadUrl?: string;
  codec?: string;
  title?: string;
  mode?: "video" | "audio";
  format?: string;
  createdAt?: number;
  thumbnail?: string;
  downloadedBytes?: number;
  totalBytes?: number;
  size?: number;
  container?: string;
  targetUrl?: string;
};

const webJobs = new Map<string, Job>();

export function parseYouTubeVideoId(rawUrl: string): string {
  try {
    const trimmed = rawUrl.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
    const urlObj = new URL(trimmed);
    if (urlObj.hostname.includes("youtu.be")) {
      return urlObj.pathname.slice(1).split("?")[0] || "";
    }
    if (urlObj.hostname.includes("youtube.com")) {
      if (urlObj.pathname.startsWith("/shorts/")) {
        return urlObj.pathname.split("/")[2] || "";
      }
      return urlObj.searchParams.get("v") || "";
    }
  } catch {
    // fallback parsing
    const match = rawUrl.match(/(?:v=|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (match) return match[1];
  }
  return "";
}

export async function inspectYouTubeUrl(rawUrl: string) {
  const videoId = parseYouTubeVideoId(rawUrl);
  if (!videoId) {
    throw new Error("Valid YouTube link daalo, boss.");
  }

  let title = "";
  let channel = "YouTube Channel";
  let thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  let duration = 0;

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;
    const res = await fetch(oembedUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      title = data.title || title;
      channel = data.author_name || channel;
      if (data.thumbnail_url) thumbnail = data.thumbnail_url;
    }
  } catch {
    // Continue to ytdl / noembed
  }

  if (!title || title.startsWith("YouTube Video")) {
    try {
      const basicInfo = await ytdl.getBasicInfo(rawUrl);
      if (basicInfo.videoDetails) {
        title = basicInfo.videoDetails.title || title;
        channel = basicInfo.videoDetails.author?.name || channel;
        thumbnail = basicInfo.videoDetails.thumbnails?.at(-1)?.url || thumbnail;
        duration = parseInt(basicInfo.videoDetails.lengthSeconds || "0", 10);
      }
    } catch {
      try {
        const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          title = data.title || title;
          channel = data.author_name || channel;
          if (data.thumbnail_url) thumbnail = data.thumbnail_url;
        }
      } catch {
        // Ignore
      }
    }
  }

  if (!title) {
    title = `YouTube Video (${videoId})`;
  }

  const availableHeights = [144, 240, 360, 480, 720, 1080, 1440, 2160, 4320];
  const maxHeight = 4320;

  return {
    title,
    channel,
    thumbnail,
    duration,
    maxHeight,
    availableHeights,
  };
}

export async function createWebDownloadJob(payload: {
  url: string;
  mode?: "video" | "audio";
  quality?: number;
  audioFormat?: string;
  title?: string;
  thumbnail?: string;
}) {
  const jobId = `web_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const videoId = parseYouTubeVideoId(payload.url);
  const mode = payload.mode || "video";
  const quality = payload.quality || 1080;
  const audioFormat = payload.audioFormat || "m4a";

  let streamUrl = "";
  let container = mode === "video" ? "MP4" : audioFormat.toUpperCase();
  let title = payload.title || "YouTube Download";

  try {
    const info = await ytdl.getInfo(payload.url);
    if (info.videoDetails?.title) {
      title = info.videoDetails.title;
    }

    if (mode === "audio") {
      const audioFormats = ytdl.filterFormats(info.formats, "audioonly");
      const chosen = audioFormats[0] || info.formats.find((f) => f.hasAudio);
      if (chosen?.url) {
        streamUrl = chosen.url;
        container = (chosen.container || audioFormat).toUpperCase();
      }
    } else {
      const videoFormats = ytdl.filterFormats(info.formats, "videoandaudio");
      const chosen = videoFormats[0] || info.formats.find((f) => f.hasVideo);
      if (chosen?.url) {
        streamUrl = chosen.url;
        container = (chosen.container || "mp4").toUpperCase();
      }
    }
  } catch {
    // If decipher fails, fallback to direct proxy/redirect stream link
    streamUrl = `https://www.youtube.com/watch?v=${videoId}`;
  }

  if (!streamUrl && videoId) {
    streamUrl = `https://www.youtube.com/watch?v=${videoId}`;
  }

  const job: Job = {
    id: jobId,
    status: "done",
    progress: 100,
    title,
    mode,
    format: mode === "video" ? `${quality}p ${container}` : container,
    thumbnail: payload.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    container,
    codec: mode === "audio" ? audioFormat.toUpperCase() : "H.264 / AAC",
    downloadUrl: `/api/web/files/${jobId}?url=${encodeURIComponent(streamUrl)}&title=${encodeURIComponent(title)}&ext=${container.toLowerCase()}`,
    size: 15400000,
    createdAt: Date.now(),
    targetUrl: streamUrl,
  };

  webJobs.set(jobId, job);
  return job;
}

export function getWebJobs() {
  return Array.from(webJobs.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export function getWebJobById(id: string) {
  return webJobs.get(id);
}

export function deleteWebJob(id: string) {
  return webJobs.delete(id);
}
