"use client";

import {
  Check,
  CircleAlert,
  Clipboard,
  Download,
  Film,
  Headphones,
  LoaderCircle,
  LockKeyhole,
  MonitorDown,
  Music2,
  Play,
  Smartphone,
  Wifi,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PendingLinkEffect from "../PendingLinkEffect";

const IOS_HERO_TEXT = "Link chipka.\nDownload phone pe.";
const qualities = [
  { label: "144p", value: 144 },
  { label: "240p", value: 240 },
  { label: "360p", value: 360 },
  { label: "480p", value: 480 },
  { label: "720p", value: 720 },
  { label: "1080p", value: 1080 },
  { label: "2K", value: 1440 },
  { label: "4K", value: 2160 },
  { label: "8K", value: 4320 },
];

type VideoInfo = {
  title: string;
  channel: string;
  thumbnail: string;
  duration: number;
  maxHeight: number;
  availableHeights: number[];
};

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
  queuePosition?: number;
  mode?: "video" | "audio";
  format?: string;
  createdAt?: number;
  thumbnail?: string;
  downloadedBytes?: number;
  totalBytes?: number;
  size?: number;
};

function cloudFetch(path: string, init: RequestInit = {}) {
  return fetch(`/api/ios${path}`, { ...init, cache: "no-store" });
}

function formatDuration(total: number) {
  const minutes = Math.floor(total / 60);
  const seconds = Math.floor(total % 60);
  return total ? `${minutes}:${String(seconds).padStart(2, "0")}` : "—";
}

function formatBytes(bytes = 0) {
  if (!bytes) return "Size check ho raha";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** unit).toFixed(unit > 1 ? 1 : 0)} ${units[unit]}`;
}

function jobDetails(job: Job) {
  const stored = job.size || job.downloadedBytes || 0;
  const storage = job.totalBytes ? `${formatBytes(stored)} / ${formatBytes(job.totalBytes)}` : formatBytes(stored);
  if (job.status === "queued") return `Queue #${job.queuePosition || 1} · ${storage}`;
  if (job.status === "downloading") return [job.speed || "Speed aa rahi", storage, job.eta ? `${job.eta} baaki` : ""].filter(Boolean).join(" · ");
  if (job.status === "processing") return `${storage} · Streams merge ho rahe`;
  if (job.status === "done") return `${formatBytes(job.size || job.totalBytes)} · Save dabao aur Files mein rakho`;
  return job.error || "Download ruk gaya";
}

export default function IOSCompanion() {
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<"video" | "audio">("video");
  const [quality, setQuality] = useState(1080);
  const [audioFormat, setAudioFormat] = useState("m4a");
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState<boolean | null>(null);
  const [message, setMessage] = useState("");
  const [typedHero, setTypedHero] = useState("");

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      const reducedTimer = window.setTimeout(() => setTypedHero(IOS_HERO_TEXT), 0);
      return () => window.clearTimeout(reducedTimer);
    }
    let character = 0;
    let timer = 0;
    const typeNext = () => {
      character += 1;
      setTypedHero(IOS_HERO_TEXT.slice(0, character));
      if (character < IOS_HERO_TEXT.length) timer = window.setTimeout(typeNext, character === 12 ? 260 : 64);
    };
    timer = window.setTimeout(typeNext, 280);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const response = await cloudFetch("/health");
        const data = await response.json();
        if (!active) return;
        setReady(response.ok && Boolean(data.ready));
        if (!data.ready || !response.ok) setMessage(data.error || "Download service offline hai.");
      } catch {
        if (active) {
          setReady(false);
          setMessage("Download service offline hai.");
        }
      }
    };
    check();
    const timer = window.setInterval(check, 4000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    const refreshJobs = async () => {
      try {
        const response = await cloudFetch("/jobs");
        if (!response.ok || !active) return;
        const data = await response.json();
        setJobs(Array.isArray(data.jobs) ? data.jobs : []);
      } catch {
        // The next poll can recover if the network briefly drops.
      }
    };
    refreshJobs();
    const timer = window.setInterval(refreshJobs, 800);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [ready]);

  const availableQualities = useMemo(
    () => info ? qualities.filter((item) => item.value <= info.maxHeight) : qualities,
    [info],
  );

  async function pasteLink() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) throw new Error();
      setUrl(text.trim());
      setInfo(null);
      setMessage("");
    } catch {
      document.querySelector<HTMLInputElement>(".ios-url-input")?.focus();
      setMessage("Input ko hold karke iPhone ka Paste option use karo.");
    }
  }

  async function inspectVideo() {
    if (!url.trim()) {
      setMessage("Pehle YouTube link daalo, boss.");
      return;
    }
    if (!ready) {
      setMessage("Download service ready nahi hai. Deployment settings check karo.");
      return;
    }
    setLoading(true);
    setMessage("");
    setInfo(null);
    try {
      const response = await cloudFetch("/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Video check nahi ho paaya.");
      setInfo(data);
      const suggested = qualities.filter((item) => item.value <= data.maxHeight).at(-1)?.value || 720;
      setQuality(Math.min(suggested, 1080));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Video check nahi ho paaya.");
    } finally {
      setLoading(false);
    }
  }

  async function downloadVideo() {
    if (!info) {
      await inspectVideo();
      return;
    }
    setMessage("");
    try {
      const response = await cloudFetch("/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, mode, quality, audioFormat, title: info.title, thumbnail: info.thumbnail }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Download start nahi ho paaya.");
      setJobs((current) => [data, ...current.filter((item) => item.id !== data.id)]);
      if (data.status === "done" && data.downloadUrl) {
        window.open(data.downloadUrl, "_blank");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Download start nahi ho paaya.");
    }
  }

  async function deleteJob(job: Job) {
    try {
      const response = await cloudFetch(`/jobs/${job.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Queue item delete nahi hua.");
      setJobs((current) => current.filter((item) => item.id !== job.id));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Queue item delete nahi hua.");
    }
  }

  function handlePrimaryAction() {
    downloadVideo();
  }

  const activeJobs = jobs.filter((item) => ["queued", "downloading", "processing"].includes(item.status));
  const primaryJob = jobs.find((item) => ["downloading", "processing"].includes(item.status))
    || jobs.find((item) => item.status === "queued")
    || null;
  const actionLabel = activeJobs.length
    ? `Queue mein daal · ${activeJobs.length} active`
    : `Le aa ${mode === "video" ? `${qualities.find((item) => item.value === quality)?.label} MP4` : audioFormat.toUpperCase()}`;
  const [typedFirst = "", typedSecond = ""] = typedHero.split("\n");
  const firstLineDone = typedHero.includes("\n");
  const heroTypingDone = typedHero === IOS_HERO_TEXT;

  return (
    <main className="ios-page">
      <nav className="ios-nav ios-shell">
        <span className="ios-brand"><span><Download size={17} /></span><strong>MacFetch</strong><small>iPhone</small></span>
        <div className="platform-switch ios-platform-switch" aria-label="Platform choose karo">
          <Link href="/"><MonitorDown size={13} /> <b>Mac</b></Link>
          <span className="active" aria-current="page"><Smartphone size={13} /> <b>iPhone</b></span>
        </div>
        <span className={`ios-connection ${ready ? "online" : ""}`}><i />{ready ? "Files save ready" : "Service offline"}</span>
      </nav>

      <div className="ios-shell ios-content">
        <header className="ios-hero">
          <span className="ios-kicker"><Smartphone size={14} /> iPhone downloader</span>
          <h1 aria-label="Link chipka. Download phone pe.">
            <span className={`ios-typewriter-line ${firstLineDone ? "" : "is-typing"}`} aria-hidden="true">{typedFirst}</span><br />
            <em className={`ios-typewriter-line ${firstLineDone ? "is-typing" : ""} ${heroTypingDone ? "complete" : ""}`} aria-hidden="true">{typedSecond}</em>
          </h1>
          <p>Video choose karo, quality set karo aur final file seedha iPhone Files mein save karo. Mac ya same Wi-Fi ki zaroorat nahi.</p>
        </header>

        <section className="ios-card ios-link-card" id="ios-downloader">
          <div className="ios-section-label"><Play size={13} fill="currentColor" /> YouTube link</div>
          <div className="ios-url-row">
            <input
              className="ios-url-input"
              value={url}
              onChange={(event) => { setUrl(event.target.value); setInfo(null); }}
              onKeyDown={(event) => { if (event.key === "Enter") inspectVideo(); }}
              placeholder="YouTube link yahan chipkao"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              aria-label="YouTube link"
            />
            <button onClick={pasteLink} aria-label="Clipboard se link chipkao"><Clipboard size={18} /></button>
          </div>
          <button className="ios-inspect" onClick={inspectVideo} disabled={loading || !ready}>
            {loading ? <LoaderCircle className="spin" size={19} /> : <Wifi size={18} />}
            {loading ? "Dekh raha…" : "Video check kar"}
          </button>
          <p className="ios-privacy"><LockKeyhole size={13} /> Processing secure service par hoti hai; final file Safari se locally iPhone Files mein save hoti hai. Server copy 1 hour mein delete ho jaati hai.</p>
        </section>

        {message && <div className="ios-message" role="status">{message}</div>}

        {loading && (
          <section className="ios-card ios-preview ios-loading" aria-label="Video check ho raha hai" aria-busy="true">
            <span /><div><i /><i /><i /></div>
          </section>
        )}

        {info && (
          <section className="ios-card ios-preview">
            <div className="ios-thumb">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={info.thumbnail} alt="Video thumbnail" />
              <span>{formatDuration(info.duration)}</span>
            </div>
            <div><small><Check size={12} /> Mil gaya, boss</small><h2>{info.title}</h2><p>{info.channel} · {info.maxHeight >= 4320 ? "8K" : info.maxHeight >= 2160 ? "4K" : `${info.maxHeight}p`} tak</p></div>
          </section>
        )}

        <section className="ios-card ios-options" id="ios-format">
          <div className="ios-card-heading"><span>01</span><div><h2>Apna format choose kar</h2><p>Video ya audio—teri marzi</p></div></div>
          <div className={`ios-segment ${mode}`}>
            <span aria-hidden="true" />
            <button className={mode === "video" ? "active" : ""} onClick={() => setMode("video")}><Film size={18} /> Video</button>
            <button className={mode === "audio" ? "active" : ""} onClick={() => setMode("audio")}><Headphones size={18} /> Audio</button>
          </div>
        </section>

        <section className="ios-card ios-options">
          <div className="ios-card-heading"><span>02</span><div><h2>{mode === "video" ? "Pixels kitne chahiye?" : "Audio format kya ho?"}</h2><p>{mode === "video" ? "Quality badhegi toh file bhi heavy hogi" : "Apne use ke hisaab se pick kar"}</p></div></div>
          {mode === "video" ? (
            <>
              <div className="ios-quality-grid">
                {qualities.map((item) => {
                  const unavailable = Boolean(info && !availableQualities.some((available) => available.value === item.value));
                  return <button key={item.value} disabled={unavailable} className={quality === item.value ? "selected" : ""} onClick={() => setQuality(item.value)}><strong>{item.label}</strong><small>{item.value >= 1440 ? "High-res" : item.value >= 720 ? "Crisp" : "Basic"}</small>{quality === item.value && <Check size={13} />}</button>;
                })}
              </div>
            </>
          ) : (
            <div className="ios-audio-grid">
              {["m4a", "mp3", "flac", "wav"].map((format) => <button key={format} className={audioFormat === format ? "selected" : ""} onClick={() => setAudioFormat(format)}><Music2 size={17} /><strong>{format.toUpperCase()}</strong><small>{format === "m4a" ? "Best pick" : format === "mp3" ? "Har jagah" : format === "flac" ? "Lossless" : "Raw"}</small></button>)}
            </div>
          )}
          <button className={`ios-card-action-btn ${activeJobs.length ? "queue-active" : ""}`} onClick={handlePrimaryAction} disabled={loading || !ready}>
            <span>{activeJobs.length ? <LoaderCircle className="spin" size={18} /> : <Download size={18} />}</span>
            <strong>{actionLabel}</strong>
          </button>
        </section>

        <section className="ios-card ios-destination">
          <div className="ios-card-heading"><span>03</span><div><h2>iPhone mein kahan?</h2><p>Safari download ke baad Files mein milegi</p></div></div>
          <div><Download size={19} /><span><small>SAVE KA ADDA</small><strong>Files · Downloads</strong></span></div>
        </section>

        {jobs.length > 0 && (
          <section className="ios-card ios-queue" id="ios-queue" aria-label="Download queue" aria-live="polite">
            <div className="ios-queue-heading">
              <span><Download size={17} /></span>
              <div><h2>Download queue</h2><p>{activeJobs.length ? `${activeJobs.length} file line mein hai` : "Sab sorted hai"}</p></div>
              <b>{activeJobs.length} active</b>
            </div>
            <div className="ios-queue-list">
              {jobs.slice(0, 6).map((item) => (
                <article className={`ios-queue-item ${item.status}`} key={item.id}>
                  <div className="ios-queue-animation" style={{ "--queue-progress": `${Math.max(item.progress, 3)}%` } as React.CSSProperties}>
                    {/* eslint-disable @next/next/no-img-element */}
                    {item.thumbnail
                      ? <img className="ios-queue-thumbnail" src={item.thumbnail} alt="" />
                      : <span><Download size={12} /></span>}
                    {/* eslint-enable @next/next/no-img-element */}
                    <i /><i /><i />
                  </div>
                  <div className="ios-queue-copy">
                    <strong>{item.title || "YouTube download"}</strong>
                    <small>{jobDetails(item)}</small>
                    {!(["queued", "done", "error"].includes(item.status)) && <div className="ios-queue-progress"><span style={{ width: `${item.progress}%` }} /></div>}
                  </div>
                  <div className="ios-queue-state">
                    {item.status === "done" ? <button className="ios-save-file" onClick={() => window.open(item.downloadUrl || `/api/web/files/${item.id}`, "_blank")} aria-label="iPhone Files mein locally save karo"><Download size={15} /><span>Save</span></button> : item.status === "error" ? <CircleAlert size={17} /> : item.status === "queued" ? <b>#{item.queuePosition || 1}</b> : <b>{Math.round(item.progress)}%</b>}
                    <button className="ios-queue-delete" onClick={() => deleteJob(item)} aria-label={item.status === "done" ? "Queue entry delete karo" : "Download cancel karke queue se hatao"} title={item.status === "done" ? "Queue se hatao" : "Cancel aur delete"}><Trash2 size={14} /></button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="ios-companion-note">
          <Smartphone size={19} /><div><strong>Original quality, no conversion</strong><p>Video merge hoke original codec mein save hota hai. 4K aur 8K playback iPhone model aur source codec par depend karega.</p></div>
        </section>
      </div>

      <div className="ios-download-dock">
        <button onClick={handlePrimaryAction} disabled={loading || !ready} className={activeJobs.length ? "queue-active" : ""}>
          <span>{activeJobs.length ? <LoaderCircle className="spin" size={20} /> : <Download size={20} />}</span>
          <strong>{actionLabel}</strong>
          {primaryJob && <i style={{ width: `${Math.max(primaryJob.progress, 2)}%` }} />}
        </button>
      </div>
      {primaryJob && <PendingLinkEffect status={primaryJob.status as "queued" | "downloading" | "processing"} progress={primaryJob.progress} />}
      <nav className="ios-bottom-nav" aria-label="iPhone app sections">
        <a className="active" href="#ios-downloader"><Download size={18} /><span>Downloader</span></a>
        <a href="#ios-format"><Film size={18} /><span>Format</span></a>
        <a href="#ios-queue"><LoaderCircle size={18} /><span>Queue</span></a>
        <Link href="/"><MonitorDown size={18} /><span>Mac</span></Link>
      </nav>
    </main>
  );
}
