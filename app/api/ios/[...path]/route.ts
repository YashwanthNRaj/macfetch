import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function getApiConfig() {
  const isDev = process.env.NODE_ENV !== "production";
  const origin = process.env.IOS_API_ORIGIN || process.env.MACFETCH_IOS_API_ORIGIN || (isDev ? "http://127.0.0.1:9432" : "");
  const token = process.env.IOS_SERVICE_TOKEN || process.env.MACFETCH_SERVICE_TOKEN || (isDev ? "macfetch-dev-only" : "");
  return { origin, token };
}

async function handleProxy(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const subPath = path ? path.join("/") : "";
  const { origin, token } = getApiConfig();

  if (!origin) {
    if (subPath === "health") {
      return NextResponse.json(
        { ready: false, error: "iPhone download engine deploy nahi hua. Vercel / host par IOS_API_ORIGIN aur IOS_SERVICE_TOKEN configure karo." },
        { status: 200 }
      );
    }
    return NextResponse.json(
      { error: "iPhone download backend offline hai. IOS_API_ORIGIN configured nahi hai." },
      { status: 503 }
    );
  }

  const targetUrl = new URL(`/${subPath}${req.nextUrl.search}`, origin);

  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("cookie");
  if (token) {
    headers.set("X-MacFetch-Service-Token", token);
  }
  headers.set("X-MacFetch-Client-IP", req.headers.get("x-forwarded-for") || "client");

  try {
    const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer();
    const res = await fetch(targetUrl.toString(), {
      method: req.method,
      headers,
      body,
      cache: "no-store",
    });

    const responseHeaders = new Headers(res.headers);
    responseHeaders.set("Cache-Control", "no-store, no-cache, must-revalidate");

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Backend connection error";
    if (subPath === "health") {
      return NextResponse.json({ ready: false, error: `Backend service reach nahi ho pa rahi (${message}).` }, { status: 200 });
    }
    return NextResponse.json({ error: `Backend service error: ${message}` }, { status: 502 });
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return handleProxy(req, ctx);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return handleProxy(req, ctx);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return handleProxy(req, ctx);
}

export async function HEAD(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return handleProxy(req, ctx);
}
