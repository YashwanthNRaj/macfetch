/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IOS_API_ORIGIN?: string;
  IOS_SERVICE_TOKEN?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

function isLocalPreviewHost(hostname: string) {
  return hostname === "localhost"
    || hostname === "127.0.0.1"
    || /^10\./.test(hostname)
    || /^192\.168\./.test(hostname)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
}

async function proxyIOSApi(request: Request, env: Env, url: URL) {
  const localPreview = isLocalPreviewHost(url.hostname);
  const apiOrigin = env.IOS_API_ORIGIN || (localPreview ? "http://127.0.0.1:9432" : "");
  const serviceToken = env.IOS_SERVICE_TOKEN || (localPreview ? "macfetch-dev-only" : "");
  if (!apiOrigin || !serviceToken) {
    return Response.json(
      { error: "iPhone download engine deploy nahi hua. IOS_API_ORIGIN aur IOS_SERVICE_TOKEN configure karo." },
      { status: 503 },
    );
  }

  const upstreamUrl = new URL(`${url.pathname.slice("/api/ios".length)}${url.search}`, apiOrigin);
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("cookie");
  headers.set("X-MacFetch-Service-Token", serviceToken);
  headers.set("X-MacFetch-Client-IP", request.headers.get("CF-Connecting-IP") || "local-preview");
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : request.body;
  const upstream = await fetch(upstreamUrl, { method: request.method, headers, body, redirect: "manual" });
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.set("Cache-Control", "private, no-store");
  responseHeaders.set("X-Content-Type-Options", "nosniff");
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/ios/")) {
      return proxyIOSApi(request, env, url);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
