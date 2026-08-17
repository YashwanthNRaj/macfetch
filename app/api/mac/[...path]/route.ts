import { NextRequest, NextResponse } from "next/server";
import {
  inspectYouTubeUrl,
  createWebDownloadJob,
  getWebJobs,
  deleteWebJob,
} from "../../webEngine";

export const dynamic = "force-dynamic";

async function handleMacProxyOrFallback(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const subPath = path ? path.join("/") : "";
  const localOrigin = "http://127.0.0.1:8432";

  // Attempt proxy to local macfetch_server.py if running
  try {
    const targetUrl = new URL(`/api/${subPath}${req.nextUrl.search}`, localOrigin);
    const headers = new Headers(req.headers);
    headers.delete("host");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1200);

    const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer();
    const res = await fetch(targetUrl.toString(), {
      method: req.method,
      headers,
      body,
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
    // If local bridge is offline, seamlessly fall back to Web Direct Engine!
  }

  // --- Web Direct Fallback Engine for Mac ---
  if (subPath === "health") {
    return NextResponse.json({ ready: true, mode: "web", outputDir: "~/Downloads/MacFetch" }, { status: 200 });
  }

  if (subPath === "inspect" && req.method === "POST") {
    try {
      const body = await req.json();
      const data = await inspectYouTubeUrl(body.url || "");
      return NextResponse.json(data);
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Video check nahi ho paaya." }, { status: 400 });
    }
  }

  if (subPath === "download" || subPath === "stream") {
    try {
      const body = await req.json();
      const job = await createWebDownloadJob(body);
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
