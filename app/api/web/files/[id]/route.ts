import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const urlParam = req.nextUrl.searchParams.get("url");
  const title = req.nextUrl.searchParams.get("title") || "download";
  const ext = req.nextUrl.searchParams.get("ext") || "mp4";

  if (!urlParam) {
    return NextResponse.json({ error: "Download URL missing" }, { status: 400 });
  }

  // Clean filename for Content-Disposition header
  const safeFilename = title.replace(/[^a-zA-Z0-9 _-]/g, "_").trim() || "video";
  const filename = `${safeFilename}.${ext}`;

  try {
    const upstreamRes = await fetch(urlParam, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!upstreamRes.ok || !upstreamRes.body) {
      // If direct stream proxy is restricted, redirect to the video source
      return NextResponse.redirect(urlParam);
    }

    const contentType = ext === "m4a" || ext === "mp3" ? "audio/mpeg" : "video/mp4";

    return new Response(upstreamRes.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
        "Cache-Control": "no-cache",
      },
    });
  } catch {
    return NextResponse.redirect(urlParam);
  }
}
