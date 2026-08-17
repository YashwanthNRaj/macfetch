import { NextRequest, NextResponse } from "next/server";
import {
  inspectYouTubeUrl,
  createWebDownloadJob,
  getWebJobs,
  deleteWebJob,
} from "../../webEngine";

export const dynamic = "force-dynamic";

function getApiConfig() {
  const isDev = process.env.NODE_ENV !== "production";
  const origin = process.env.IOS_API_ORIGIN || process.env.MACFETCH_IOS_API_ORIGIN || (isDev ? "http://127.0.0.1:9432" : "");
  const token = process.env.IOS_SERVICE_TOKEN || process.env.MACFETCH_SERVICE_TOKEN || (isDev ? "macfetch-dev-only" : "");
  return { origin, token };
}

async function handleProxyOrFallback(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const subPath = path ? path.join("/") : "";
  const { origin, token } = getApiConfig();

  // If a remote backend origin is configured, attempt proxying to it
  if (origin) {
    const targetUrl = new URL(`/${subPath}${req.nextUrl.search}`, origin);
    const headers = new Headers(req.headers);
    headers.delete("host");
    headers.delete("cookie");
    if (token) headers.set("X-MacFetch-Service-Token", token);

    try {
      const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer();
      const res = await fetch(targetUrl.toString(), {
        method: req.method,
        headers,
        body,
        cache: "no-store",
      });
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
      // If remote proxy fails, fall through to Web Direct Engine!
    }
  }

  // --- Web Direct Fallback Engine (Runs when backend is offline) ---
  if (subPath === "health") {
    return NextResponse.json({ ready: true, mode: "web", engine: "web-direct" }, { status: 200 });
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

  if (subPath === "download" && req.method === "POST") {
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
  return handleProxyOrFallback(req, ctx);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return handleProxyOrFallback(req, ctx);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return handleProxyOrFallback(req, ctx);
}

export async function HEAD(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return handleProxyOrFallback(req, ctx);
}
