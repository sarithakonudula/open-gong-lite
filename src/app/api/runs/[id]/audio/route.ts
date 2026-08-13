import { NextRequest, NextResponse } from "next/server";
import { readRunAudio } from "@/lib/store";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Range/206 so click-to-play can seek to a transcript timestamp. */
export async function GET(request: NextRequest, context: Ctx) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid run id" }, { status: 400 });
  }

  const audio = await readRunAudio(id);
  if (!audio) {
    return NextResponse.json({ error: "No audio" }, { status: 404 });
  }

  const { bytes, contentType } = audio;
  const size = bytes.length;
  const range = request.headers.get("range");

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!match) {
      return new NextResponse(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }
    let start = match[1] ? Number(match[1]) : 0;
    let end = match[2] ? Number(match[2]) : size - 1;
    if (match[1] === "" && match[2]) {
      // suffix: last N bytes
      const suffix = Number(match[2]);
      start = Math.max(0, size - suffix);
      end = size - 1;
    }
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end >= size ||
      start > end
    ) {
      return new NextResponse(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }
    const slice = bytes.subarray(start, end + 1);
    return new NextResponse(slice, {
      status: 206,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(slice.length),
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, no-store",
      },
    });
  }

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(size),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
    },
  });
}
