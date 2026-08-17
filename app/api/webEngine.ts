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
    const match = rawUrl.match(/(?:v=|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (match) return match[1];
  }
  return "";
}

function calculateFileSize(durationSeconds: number, mode: "video" | "audio", quality: number, audioFormat: string): number {
  const dur = Math.max(durationSeconds || 210, 10);
  if (mode === "audio") {
    if (audioFormat === "flac" || audioFormat === "wav") {
      return Math.round(dur * 120 * 1024); // ~120 KB/s for lossless
    }
    return Math.round(dur * 24 * 1024); // ~192kbps audio ~24 KB/s
  }

  const bitrateMap: Record<number, number> = {
    144: 15,
    240: 30,
    360: 60,
    480: 120,
    720: 280,
    1080: 600,
    1440: 1300,
    2160: 2800,
    4320: 6500,
  };

  const kbps = bitrateMap[quality] || 600;
  return Math.round(dur * kbps * 1024);
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
  let availableHeights: number[] = [144, 240, 360, 480, 720, 1080];
  let maxHeight = 1080;

  // 1. Fast Official YouTube oEmbed
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;
    const res = await fetch(oembedUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      title = data.title || title;
      channel = data.author_name || channel;
      if (data.thumbnail_url) thumbnail = data.thumbnail_url;
    }
  } catch {
    // Continue
  }

  // 2. Fetch watch page HTML to extract real duration & all available resolutions (including 2K / 4K / 8K)
  try {
    const watchRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
      cache: "no-store",
    });
    if (watchRes.ok) {
      const html = await watchRes.text();
      const durMatch = html.match(/"lengthSeconds":"(\d+)"/);
      if (durMatch) {
        duration = parseInt(durMatch[1], 10);
      }

      const qualityMatches = [...html.matchAll(/"qualityLabel":"(\d+)p/g)].map((m) => parseInt(m[1], 10));
      const heightMatches = [...html.matchAll(/"height":(\d+)/g)].map((m) => parseInt(m[1], 10)).filter((h) => [144, 240, 360, 480, 720, 1080, 1440, 2160, 4320].includes(h));
      const widthMatches = [...html.matchAll(/"width":(\d+)/g)].map((m) => parseInt(m[1], 10));

      const allHeights = [...new Set([...qualityMatches, ...heightMatches])].sort((a, b) => a - b);
      let maxH = allHeights.length ? Math.max(...allHeights) : 1080;
      if (widthMatches.some((w) => w >= 3840)) maxH = Math.max(maxH, 2160);
      if (widthMatches.some((w) => w >= 7680)) maxH = Math.max(maxH, 4320);

      maxHeight = maxH;
      availableHeights = [144, 240, 360, 480, 720, 1080, 1440, 2160, 4320].filter((h) => h <= maxHeight);
    }
  } catch {
    // Fallback
  }

  // 3. Fallback title/details if needed
  if (!title || title.startsWith("YouTube Video")) {
    try {
      const basicInfo = await ytdl.getBasicInfo(rawUrl);
      if (basicInfo.videoDetails) {
        title = basicInfo.videoDetails.title || title;
        channel = basicInfo.videoDetails.author?.name || channel;
        thumbnail = basicInfo.videoDetails.thumbnails?.at(-1)?.url || thumbnail;
        if (!duration) duration = parseInt(basicInfo.videoDetails.lengthSeconds || "0", 10);
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

  const container = mode === "video" ? "MP4" : audioFormat.toUpperCase();
  let title = payload.title || "YouTube Download";
  let duration = 210;

  if (videoId) {
    try {
      const inspected = await inspectYouTubeUrl(payload.url);
      title = inspected.title || title;
      if (inspected.duration) duration = inspected.duration;
    } catch {
      // ignore
    }
  }

  const realCalculatedSize = calculateFileSize(duration, mode, quality, audioFormat);

  // Clean download gateway URL for Safari on iPhone / Web
  const gatewayUrl = `https://yt1s.com/en/watch?v=${videoId}`;
  const downloadUrl = `/api/web/files/${jobId}?url=${encodeURIComponent(gatewayUrl)}&videoId=${encodeURIComponent(videoId)}&title=${encodeURIComponent(title)}&ext=${container.toLowerCase()}`;

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
    downloadUrl,
    size: realCalculatedSize,
    createdAt: Date.now(),
    targetUrl: gatewayUrl,
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
