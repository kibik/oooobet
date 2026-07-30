import { NextRequest, NextResponse } from "next/server";

// TEMPORARY debug proxy to probe Yandex Eda API from the server IP.
// Restricted to eda.yandex.ru paths + secret key. Remove after use.
const DEBUG_KEY = "79a1ce57626c20a6706c33565e3f0c5a";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("key") !== DEBUG_KEY) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const path = searchParams.get("path") || "";
  if (!path.startsWith("/")) {
    return NextResponse.json({ error: "Bad path" }, { status: 400 });
  }

  const method = searchParams.get("method") || "GET";
  const body = searchParams.get("body");

  const res = await fetch(`https://eda.yandex.ru${path}`, {
    method,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body } : {}),
  });

  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("Content-Type") || "text/plain",
    },
  });
}
