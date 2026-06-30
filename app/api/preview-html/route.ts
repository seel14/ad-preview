import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });

  try {
    const res = await fetch(url);
    let html = await res.text();

    // Rewrite image/resource URLs to go through our proxy to avoid CORS
    html = html.replace(
      /(src|href)="(https?:\/\/[^"]+)"/g,
      (_match, attr, resourceUrl) => `${attr}="/api/proxy?url=${encodeURIComponent(resourceUrl)}"`
    );
    html = html.replace(
      /url\((["']?)(https?:\/\/[^)"']+)\1\)/g,
      (_match, quote, resourceUrl) => `url(${quote}/api/proxy?url=${encodeURIComponent(resourceUrl)}${quote})`
    );

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
