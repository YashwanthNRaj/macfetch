import { NextRequest, NextResponse } from "next/server";
import {
  inspectYouTubeUrl,
  createWebDownloadJob,
  getWebJobs,
  getWebJobById,
  deleteWebJob,
} from "../../webEngine";

export const dynamic = "force-dynamic";

async function handleMacProxyOrFallback(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const subPath = path ? path.join("/") : "";
  const localOrigin = "http://127.0.0.1:8432";

  // Read request body safely once
  let rawBody: string | undefined = undefined;
  let parsedBody: Record<string, unknown> = {};
  if (req.method !== "GET" && req.method !== "HEAD") {
    try {
      rawBody = await req.text();
      if (rawBody) {
        try {
          parsedBody = JSON.parse(rawBody);
        } catch {
          // not JSON
        }
      }
    } catch {
      // ignore
    }
  }

  // Attempt proxy to local macfetch_server.py if running
  try {
    const targetUrl = new URL(`/api/${subPath}${req.nextUrl.search}`, localOrigin);
    const headers = new Headers(req.headers);
    headers.delete("host");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 800);

    const res = await fetch(targetUrl.toString(), {
      method: req.method,
      headers,
      body: rawBody,
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok || subPath !== "health") {
      const responseHeaders = new Headers(res.headers);
      responseHeaders.set("Cache-Control", "no-store, no-cache, must-revalidate");
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: responseHeaders,
      });
    }
  } catch {
    // If local bridge is offline, fall through to Web Direct Engine!
  }

  // --- Web Direct Fallback Engine for Mac ---
  if (subPath === "health") {
    return NextResponse.json({ ready: true, mode: "web", outputDir: "~/Downloads/MacFetch" }, { status: 200 });
  }

  if (subPath === "inspect" && req.method === "POST") {
    try {
      const url = (parsedBody.url as string) || "";
      const data = await inspectYouTubeUrl(url);
      return NextResponse.json(data);
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Video check nahi ho paaya." }, { status: 400 });
    }
  }

  if (subPath === "download" || subPath === "stream") {
    try {
      const job = await createWebDownloadJob(parsedBody as { url: string; mode?: "video" | "audio"; quality?: number; audioFormat?: string; title?: string; thumbnail?: string });
      return NextResponse.json(job);
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Download start nahi ho paaya." }, { status: 400 });
    }
  }

  if (subPath === "jobs" && req.method === "GET") {
    return NextResponse.json({ jobs: getWebJobs() });
  }

  if (subPath.startsWith("jobs/") && req.method === "DELETE") {
    const jobId = subPath.split("/")[1];
    if (jobId) deleteWebJob(jobId);
    return NextResponse.json({ success: true });
  }

  if (subPath.startsWith("files/")) {
    const jobId = subPath.split("/")[1] || "";
    const job = jobId ? getWebJobById(jobId) : null;
    const target = job?.targetUrl || "https://www.ssyoutube.com";
    return NextResponse.redirect(target, 302);
  }

  return NextResponse.json({ ready: true, mode: "web" }, { status: 200 });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return handleMacProxyOrFallback(req, ctx);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return handleMacProxyOrFallback(req, ctx);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return handleMacProxyOrFallback(req, ctx);
}

export async function HEAD(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return handleMacProxyOrFallback(req, ctx);
}
