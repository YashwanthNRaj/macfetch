"use client";

import {
  ArrowRight,
  Check,
  CircleAlert,
  Clipboard,
  Download,
  Film,
  FolderOpen,
  Gauge,
  HardDrive,
  Headphones,
  LoaderCircle,
  LockKeyhole,
  MonitorDown,
  Music2,
  Play,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PendingLinkEffect from "./PendingLinkEffect";

const API = "http://127.0.0.1:8432/api";
const TYPEWRITER_TEXT = "Seedha tere Mac pe.";
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
  title: string;
  progress: number;
  speed?: string;
  eta?: string;
  output?: string;
  error?: string;
  queuePosition?: number;
  mode?: "video" | "audio";
  format?: string;
  createdAt?: number;
  thumbnail?: string;
  downloadedBytes?: number;
  totalBytes?: number;
  size?: number;
};

function formatDuration(total: number) {
  if (!total) return "—";
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = Math.floor(total % 60);
  return `${hours ? `${hours}:` : ""}${String(minutes).padStart(hours ? 2 : 1, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatBytes(bytes = 0) {
  if (!bytes) return "Size calculate ho raha";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** unit).toFixed(unit > 1 ? 1 : 0)} ${units[unit]}`;
}

function jobDetails(job: Job) {
  const stored = job.size || job.downloadedBytes || 0;
  const storage = job.totalBytes
    ? `${formatBytes(stored)} / ${formatBytes(job.totalBytes)}`
    : formatBytes(stored);
  if (job.status === "queued") return `Queue #${job.queuePosition || 1} · ${storage}`;
  if (job.status === "downloading") return [job.speed || "Speed aa rahi", storage, job.eta ? `${job.eta} baaki` : ""].filter(Boolean).join(" · ");
  if (job.status === "processing") return `${storage} · Video + audio final ho rahe hain`;
  if (job.status === "done") return `${formatBytes(job.size || job.totalBytes)} · Mac pe save ho gaya`;
  return job.error || "Download ruk gaya";
}

function MediaFlowAnimation({ welcome = false }: { welcome?: boolean }) {
  return (
    <div className={`hero-motion ${welcome ? "welcome-motion" : ""}`} aria-hidden="true">
      <span className="motion-orbit motion-orbit-one" />
      <span className="motion-orbit motion-orbit-two" />
      <div className="motion-window">
        <div className="motion-titlebar"><i /><i /><i /><span>macfetch.local</span></div>
        <div className="motion-video">
          <span className="motion-play"><Play size={15} fill="currentColor" /></span>
          <span className="motion-quality">8K</span>
          <div className="motion-waveform"><i /><i /><i /><i /><i /><i /><i /></div>
        </div>
        <div className="motion-meta"><i /><i /></div>
      </div>
      <div className="motion-route"><span /><span /><span /></div>
      <div className="motion-download"><Download size={19} strokeWidth={2.5} /></div>
      <div className="motion-tray">
        <span className="motion-tray-icon"><HardDrive size={17} /></span>
        <span><small>LOCAL DOWNLOAD</small><strong>Saved to Mac</strong></span>
        <span className="motion-check"><Check size={14} strokeWidth={3} /></span>
      </div>
    </div>
  );
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<"video" | "audio">("video");
  const [quality, setQuality] = useState(1080);
  const [audioFormat, setAudioFormat] = useState("m4a");
  const cookieMode = "firefox";
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [serviceReady, setServiceReady] = useState<boolean | null>(null);
  const [outputDir, setOutputDir] = useState("~/Downloads/MacFetch");
  const [inputPulse, setInputPulse] = useState(false);
  const [typedTagline, setTypedTagline] = useState("");
  const [welcomeOpen, setWelcomeOpen] = useState(true);
  const [welcomeLeaving, setWelcomeLeaving] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (window.sessionStorage.getItem("macfetch-welcomed") === "yes") setWelcomeOpen(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!welcomeOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [welcomeOpen]);

  useEffect(() => {
    let timer: number | undefined;
    let character = 0;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const typeNextCharacter = () => {
      character += 1;
      setTypedTagline(TYPEWRITER_TEXT.slice(0, character));
      if (character < TYPEWRITER_TEXT.length) {
        timer = window.setTimeout(typeNextCharacter, 58);
      }
    };

    timer = window.setTimeout(
      reduceMotion ? () => setTypedTagline(TYPEWRITER_TEXT) : typeNextCharacter,
      reduceMotion ? 0 : 320,
    );

    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const checkHealth = async () => {
      try {
        const res = await fetch(`${API}/health`, { cache: "no-store" });
        const data = await res.json();
        if (!active) return;
        setServiceReady(Boolean(data.ready));
        if (data.outputDir) setOutputDir(data.outputDir);
      } catch {
        if (active) setServiceReady(false);
      }
    };
    checkHealth();
    const timer = window.setInterval(checkHealth, 4000);
    window.addEventListener("focus", checkHealth);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", checkHealth);
    };
  }, []);

  useEffect(() => {
    if (!serviceReady) return;
    let active = true;
    const refreshJobs = async () => {
      try {
        const res = await fetch(`${API}/jobs`, { cache: "no-store" });
        if (!res.ok || !active) return;
        const data = await res.json();
        const nextJobs = Array.isArray(data.jobs) ? data.jobs : [];
        setJobs(nextJobs);
      } catch {
        // A later poll can recover if the local service briefly restarts.
      }
    };
    refreshJobs();
    const timer = window.setInterval(refreshJobs, 700);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [serviceReady]);

  useEffect(() => {
    if (!inputPulse) return;
    const timer = window.setTimeout(() => setInputPulse(false), 700);
    return () => window.clearTimeout(timer);
  }, [inputPulse]);

  const availableQuality = useMemo(() => {
    if (!info) return qualities;
    return qualities.filter((item) => item.value <= info.maxHeight);
  }, [info]);

  async function pasteUrl() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) throw new Error("Clipboard is empty");
      setUrl(text.trim());
      setInputPulse(true);
      setInfo(null);
      setMessage("");
    } catch {
      try {
        const res = await fetch(`${API}/clipboard`, { method: "POST" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Clipboard could not be read");
        if (!data.text?.trim()) {
          setMessage("Clipboard khaali hai—YouTube link copy karo, phir Chipka de dabao.");
          return;
        }
        setUrl(data.text.trim());
        setInputPulse(true);
        setInfo(null);
        setMessage("");
      } catch {
        document.querySelector<HTMLInputElement>('.url-row input')?.focus();
        setMessage("Clipboard ne mana kar diya. ⌘V dabao aur link yahan chipka do.");
      }
    }
  }

  async function analyze() {
    if (!url.trim()) {
      setMessage("Pehle YouTube link daalo, boss.");
      return;
    }
    if (!serviceReady) {
      setMessage("Mac service offline hai. Pehle start.command kholo.");
      return;
    }
    setLoading(true);
    setMessage("");
    setInfo(null);
    try {
      const res = await fetch(`${API}/inspect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, cookies: cookieMode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Video check nahi ho paaya.");
      setInfo(data);
      const suggested = qualities.filter((item) => item.value <= data.maxHeight).at(-1)?.value || 720;
      setQuality(Math.min(suggested, 1080));
    } catch (error) {
      if (error instanceof TypeError) {
        setServiceReady(false);
        setMessage("Local service band ho gayi. start.command double-click karo aur Terminal khula rakho.");
      } else {
        setMessage(error instanceof Error ? error.message : "Video check nahi ho paaya.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function startDownload() {
    if (!info) {
      await analyze();
      return;
    }
    setMessage("");
    try {
      const res = await fetch(`${API}/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, mode, quality, audioFormat, cookies: cookieMode, title: info.title, thumbnail: info.thumbnail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Download start nahi ho paaya.");
      setJobs((current) => [data, ...current.filter((item) => item.id !== data.id)]);
    } catch (error) {
      if (error instanceof TypeError) {
        setServiceReady(false);
        setMessage("Local service band ho gayi. start.command double-click karo aur Terminal khula rakho.");
      } else {
        setMessage(error instanceof Error ? error.message : "Download start nahi ho paaya.");
      }
    }
  }

  async function revealOutput() {
    await fetch(`${API}/reveal`, { method: "POST" }).catch(() => undefined);
  }

  async function deleteJob(job: Job) {
    try {
      const res = await fetch(`${API}/jobs/${job.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Queue item delete nahi hua.");
      setJobs((current) => current.filter((item) => item.id !== job.id));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Queue item delete nahi hua.");
    }
  }

  async function chooseOutput() {
    setMessage("");
    try {
      const res = await fetch(`${API}/choose-output`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Output folder badal nahi paaya.");
      if (!data.cancelled && data.outputDir) setOutputDir(data.outputDir);
    } catch (error) {
      setMessage(error instanceof TypeError
        ? "Local service band ho gayi. MacFetch restart karke phir try karo."
        : error instanceof Error ? error.message : "Output folder badal nahi paaya.");
    }
  }

  function moveSpotlight(event: React.PointerEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--spot-x", `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty("--spot-y", `${event.clientY - rect.top}px`);
  }

  function tiltCard(event: React.PointerEvent<HTMLButtonElement>) {
    if (window.matchMedia("(prefers-reduced-motion: reduce), (pointer: coarse)").matches) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const rotateX = ((event.clientY - rect.top) / rect.height - .5) * -3;
    const rotateY = ((event.clientX - rect.left) / rect.width - .5) * 3;
    event.currentTarget.style.setProperty("--tilt-x", `${rotateX}deg`);
    event.currentTarget.style.setProperty("--tilt-y", `${rotateY}deg`);
  }

  function resetTilt(event: React.PointerEvent<HTMLButtonElement>) {
    event.currentTarget.style.setProperty("--tilt-x", "0deg");
    event.currentTarget.style.setProperty("--tilt-y", "0deg");
  }

  function magnetize(event: React.PointerEvent<HTMLButtonElement>) {
    if (window.matchMedia("(prefers-reduced-motion: reduce), (pointer: coarse)").matches) return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--magnet-x", `${((event.clientX - rect.left) / rect.width - .5) * 8}px`);
    event.currentTarget.style.setProperty("--magnet-y", `${((event.clientY - rect.top) / rect.height - .5) * 5}px`);
  }

  function resetMagnet(event: React.PointerEvent<HTMLButtonElement>) {
    event.currentTarget.style.setProperty("--magnet-x", "0px");
    event.currentTarget.style.setProperty("--magnet-y", "0px");
  }

  function finishWelcome() {
    window.sessionStorage.setItem("macfetch-welcomed", "yes");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setWelcomeLeaving(true);
    window.setTimeout(() => setWelcomeOpen(false), reduceMotion ? 0 : 480);
  }

  const activeJobs = jobs.filter((item) => ["queued", "downloading", "processing"].includes(item.status));
  const primaryJob = jobs.find((item) => ["downloading", "processing"].includes(item.status))
    || jobs.find((item) => item.status === "queued")
    || null;

  return (
    <main>
      {welcomeOpen && (
        <section
          className={`welcome-page ${welcomeLeaving ? "is-leaving" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="welcome-title"
        >
          <div className="welcome-grid">
            <div className="welcome-copy">
              <a className="welcome-brand" href="#top" onClick={(event) => event.preventDefault()} aria-label="MacFetch">
                <span><Download size={19} strokeWidth={2.6} /></span>
                <strong>MacFetch</strong>
              </a>
              <div className="welcome-kicker"><Sparkles size={14} /> Welcome, boss</div>
              <h1 id="welcome-title">Download ka scene,<br /><em>ab sorted.</em></h1>
              <p>Video ho ya audio—quality choose karo, link chipkao aur file seedha apne device par le jao.</p>
              <div className="welcome-actions">
                <button onClick={finishWelcome}>
                  <MonitorDown size={18} /> Mac pe chalo <ArrowRight size={17} />
                </button>
                <Link href="/ios" onClick={() => window.sessionStorage.setItem("macfetch-welcomed", "yes")}>
                  <Smartphone size={18} /> iPhone mode
                </Link>
              </div>
              <div className="welcome-trust">
                <span><ShieldCheck size={14} /> Private by design</span>
                <i />
                <span><Gauge size={14} /> 8K tak</span>
                <i />
                <span><LockKeyhole size={14} /> No cloud scene</span>
              </div>
            </div>
            <div className="welcome-art"><MediaFlowAnimation welcome /></div>
          </div>
          <div className="welcome-foot"><span>MACFETCH / LOCAL MEDIA UTILITY</span><span>MAC + IPHONE</span></div>
        </section>
      )}
      <div className="ambient-effects" aria-hidden="true"><span className="orb orb-sage" /><span className="orb orb-coral" /><span className="aurora-glow" /><span className="film-grain" /></div>
      <nav className="nav shell">
        <a className="brand" href="#top" aria-label="MacFetch home">
          <span className="brand-mark"><Download size={18} strokeWidth={2.5} /></span>
          <span className="brand-copy"><strong>MacFetch</strong><small>v2.4 · STEALTH</small></span>
        </a>
        <div className="side-nav-links" aria-label="MacFetch sections">
          <a className="active" href="#workflow"><Download size={17} /><span>Downloader</span></a>
          <a href="#queue"><Film size={17} /><span>Queue</span></a>
        </div>
        <div className="nav-actions">
          <div className="platform-switch" aria-label="Platform choose karo">
            <span className="active" aria-current="page"><MonitorDown size={14} /> <b>Mac</b></span>
            <Link href="/ios"><Smartphone size={14} /> <b>iPhone</b></Link>
          </div>
          <span className="service-pill"><span className={`status-dot ${serviceReady ? "online" : ""}`} /><span className="local-label">{serviceReady === null ? "Mac check ho raha…" : serviceReady ? "Mac full ready" : "Mac offline hai"}</span></span>
        </div>
      </nav>

      <div className="desktop-app-main">
      <section className="hero shell" id="top">
        <div className="hero-intro">
          <div className="hero-message">
            <div className="eyebrow"><ShieldCheck size={14} /> Private. Local. No bakwaas.</div>
            <h1 aria-label="Video aur audio, apne style mein. Seedha tere Mac pe.">
              Video aur audio, apne style mein.<br />
              <span
                className={`typewriter ${typedTagline === TYPEWRITER_TEXT ? "complete" : ""}`}
                aria-hidden="true"
              >
                {typedTagline}
              </span>
            </h1>
            <p className="hero-copy">YouTube videos 8K tak download karo ya clean audio nikaalo—sab kuch tere Mac par. Sign-in chahiye? Firefox session locally kaam karega. Kuch bhi cloud pe nahi jaata.</p>
            <div className="hero-points" aria-label="MacFetch benefits">
              <span><ShieldCheck size={15} /> Mac se bahar nahi</span>
              <span><Gauge size={15} /> 8K tak full flex</span>
              <span><HardDrive size={15} /> Folder tera, choice teri</span>
            </div>
          </div>

          <MediaFlowAnimation />
        </div>

        <div className={`url-card ${loading ? "is-loading" : ""} ${info ? "is-detected" : ""}`}>
          <div className="url-card-top">
            <div className="url-label"><Play size={13} fill="currentColor" /> YouTube URL</div>
            <span>youtube.com ya youtu.be link idhar daalo</span>
          </div>
          <div className="url-row">
            <input
              className={`${inputPulse ? "paste-pulse" : ""} ${info ? "recognized" : ""}`}
              value={url}
              onChange={(event) => { setUrl(event.target.value); setInfo(null); }}
              onPaste={() => setInputPulse(true)}
              onKeyDown={(event) => { if (event.key === "Enter") analyze(); }}
              placeholder="https://www.youtube.com/watch?v=..."
              aria-label="YouTube URL"
            />
            <button className="paste-button" onClick={pasteUrl}><Clipboard size={17} /> <span>Chipka de</span></button>
            <button className="analyze-button" onClick={analyze} disabled={loading}>
              {loading ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={17} />}
              {loading ? "Dekh raha…" : "Check kar"}
            </button>
          </div>
          <div className="privacy-line"><LockKeyhole size={13} /> Sab local. Cloud ka koi scene nahi. <span /> Browsing data Mac pe hi rahega</div>
        </div>
        {message && <div className="notice" role="status" aria-live="polite"><CircleAlert size={17} /> {message}</div>}
      </section>

      <section className={`workspace shell ${info ? "has-info" : ""}`} id="workflow">
        <div className="main-column">
          <div className="workflow-label"><span>Scene set karo</span><small>Bas 3 quick picks. Phir sorted.</small></div>
          {loading && (
            <article className="video-card skeleton-card" aria-label="Video check ho raha hai" aria-busy="true">
              <span className="skeleton skeleton-thumb" />
              <span className="skeleton-copy"><i className="skeleton skeleton-short" /><i className="skeleton skeleton-title" /><i className="skeleton skeleton-meta" /></span>
            </article>
          )}
          {info && (
            <article className="video-card revealed-card">
              <div className="thumb-wrap">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={info.thumbnail} alt="Video thumbnail" />
                <span className="duration">{formatDuration(info.duration)}</span>
              </div>
              <div className="video-meta">
                <span className="found-label"><Check size={13} /> Mil gaya, boss</span>
                <h2>{info.title}</h2>
                <p>{info.channel} · Up to {info.maxHeight >= 4320 ? "8K" : info.maxHeight >= 2160 ? "4K" : `${info.maxHeight}p`}</p>
              </div>
              <span className="video-ready"><Check size={15} /> Full ready</span>
            </article>
          )}

          <section className="panel format-panel">
            <div className="panel-heading">
              <div>
                <span className="step">01</span>
                <div><h2>Apna format choose kar</h2><p>Video ya audio—teri marzi</p></div>
              </div>
              <span className="recommend"><ShieldCheck size={14} /> Smart jugaad</span>
            </div>
            <div className={`mode-tabs mode-${mode}`}>
              <button className={mode === "video" ? "active" : ""} onClick={() => setMode("video")} onPointerMove={tiltCard} onPointerLeave={resetTilt}>
                <span className="mode-icon"><Film size={22} /></span>
                <span><strong>Video wala</strong><small>MP4 · video + audio</small></span>
                {mode === "video" && <span className="selection-check"><Check size={14} /></span>}
              </button>
              <button className={mode === "audio" ? "active" : ""} onClick={() => setMode("audio")} onPointerMove={tiltCard} onPointerLeave={resetTilt}>
                <span className="mode-icon"><Headphones size={22} /></span>
                <span><strong>Sirf audio</strong><small>M4A, MP3, FLAC ya WAV</small></span>
                {mode === "audio" && <span className="selection-check"><Check size={14} /></span>}
              </button>
            </div>
          </section>

          <section className="panel quality-panel">
            <div className="panel-heading">
              <div>
                <span className="step">02</span>
                <div><h2>{mode === "video" ? "Pixels kitne chahiye?" : "Audio format choose kar"}</h2><p>{mode === "video" ? "Tere pick tak best stream utha lenge" : "Best available quality, pakka"}</p></div>
              </div>
            </div>
            {mode === "video" ? (
              <div className="quality-grid">
                {qualities.map((item) => {
                  const unavailable = Boolean(info && !availableQuality.some((q) => q.value === item.value));
                  return (
                    <button
                      key={item.value}
                      className={`${quality === item.value ? "selected" : ""} ${item.value >= 2160 ? "premium-quality" : ""}`}
                      disabled={unavailable}
                      onClick={() => setQuality(item.value)}
                      onPointerMove={moveSpotlight}
                    >
                      <strong>{item.label}</strong>
                      <small>{item.value >= 4320 ? "Full flex" : item.value >= 2160 ? "Full flex" : item.value >= 720 ? "Ekdum crisp" : "Basic scene"}</small>
                      {item.value === 1080 && <em>SABKA FAVE</em>}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="audio-options">
                {["m4a", "mp3", "flac", "wav"].map((format) => (
                  <button key={format} className={audioFormat === format ? "selected" : ""} onClick={() => setAudioFormat(format)} onPointerMove={moveSpotlight}>
                    <Music2 size={18} /><strong>{format.toUpperCase()}</strong><small>{format === "m4a" ? "Best choice" : format === "mp3" ? "Har jagah chalega" : format === "flac" ? "Lossless scene" : "Bilkul raw"}</small>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="panel destination-panel">
            <div className="panel-heading">
              <div>
                <span className="step">03</span>
                <div><h2>Kahan rakhna hai?</h2><p>Downloads ekdum sorted rahenge</p></div>
              </div>
            </div>
            <div className="folder-row">
              <span className="folder-icon"><FolderOpen size={20} /></span>
              <span><small>SAVE KA ADDA</small><strong>{outputDir}</strong></span>
              <span className="folder-actions">
                <button onClick={chooseOutput}>Badal de</button>
                <button onClick={revealOutput}>Khol de</button>
              </span>
            </div>
          </section>

          <button className={`download-button ${info ? "is-ready" : ""} ${activeJobs.length ? "queue-active" : "idle"}`} onClick={startDownload} disabled={loading} onPointerMove={magnetize} onPointerLeave={resetMagnet}>
            <span className={`download-icon ${activeJobs.length ? "is-working" : ""}`}><Download size={21} /></span>
            <span className="download-copy"><strong>{activeJobs.length ? `Queue mein daal · ${activeJobs.length} active` : `Le aa ${mode === "video" ? `${qualities.find((q) => q.value === quality)?.label} MP4` : audioFormat.toUpperCase()}`}</strong><small>{info ? `${info.channel} · ${activeJobs.length ? "Apni turn pe khud start hoga" : "Mac pe hi save hoga"}` : "Pehle link check karke formats unlock kar"}</small></span>
            <ArrowRight className="download-arrow" size={19} />
            {primaryJob && <span className="button-progress" style={{ width: `${Math.max(primaryJob.progress, 2)}%` }} />}
          </button>

          {jobs.length > 0 && (
            <section className="queue-panel panel" id="queue" aria-label="Download queue" aria-live="polite">
              <div className="queue-heading">
                <div><span className="queue-heading-icon"><Download size={17} /></span><span><strong>Download queue</strong><small>{activeJobs.length ? `${activeJobs.length} file line mein hai` : "Sab sorted hai"}</small></span></div>
                <b>{activeJobs.length} active</b>
              </div>
              <div className="queue-list">
                {jobs.slice(0, 6).map((item) => (
                  <article className={`queue-item ${item.status}`} key={item.id}>
                    <div className="queue-animation" style={{ "--queue-progress": `${Math.max(item.progress, 3)}%` } as React.CSSProperties}>
                      {/* eslint-disable @next/next/no-img-element */}
                      {item.thumbnail
                        ? <img className="queue-thumbnail" src={item.thumbnail} alt="" />
                        : <span className="queue-file"><Download size={13} /></span>}
                      {/* eslint-enable @next/next/no-img-element */}
                      <i /><i /><i />
                    </div>
                    <div className="queue-item-copy">
                      <strong>{item.title}</strong>
                      <small>{jobDetails(item)}</small>
                      {!(["queued", "done", "error"].includes(item.status)) && <div className="queue-progress"><span style={{ width: `${item.progress}%` }} /></div>}
                    </div>
                    <div className="queue-item-status">
                      {item.status === "done" ? <button onClick={revealOutput} aria-label="Finder mein dikhao"><FolderOpen size={15} /></button> : item.status === "error" ? <CircleAlert size={17} /> : item.status === "queued" ? <b>#{item.queuePosition || 1}</b> : <b>{Math.round(item.progress)}%</b>}
                      <button className="queue-delete" onClick={() => deleteJob(item)} aria-label={item.status === "done" ? "Queue entry delete karo" : "Download cancel karke queue se hatao"} title={item.status === "done" ? "Queue se hatao" : "Cancel aur delete"}><Trash2 size={14} /></button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>

      </section>

      <footer className="shell">
        <span><Download size={14} /> MacFetch</span>
        <p>Legal rehna: sirf wahi content save karo jo tumhara hai ya jiska permission hai.</p>
        <Link className="footer-platform-link" href="/ios"><Smartphone size={13} /> iPhone version</Link>
      </footer>
      {primaryJob && <PendingLinkEffect status={primaryJob.status} progress={primaryJob.progress} />}
      </div>
    </main>
  );
}
