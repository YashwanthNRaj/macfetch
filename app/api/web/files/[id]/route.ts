import { NextRequest, NextResponse } from "next/server";
import { getWebJobById } from "../../../webEngine";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const urlParam = req.nextUrl.searchParams.get("url");
  const videoId = req.nextUrl.searchParams.get("videoId");

  const job = id ? getWebJobById(id) : null;
  const targetUrl = urlParam || job?.targetUrl || (videoId ? `https://www.ssyoutube.com/watch?v=${videoId}` : "https://www.youtube.com");

  return NextResponse.redirect(targetUrl, 302);
}
