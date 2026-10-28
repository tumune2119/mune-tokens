import { NextResponse, type NextRequest } from "next/server";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/**
 * The server only listens on 127.0.0.1, but a web page you visit could still try to call it.
 * Block DNS-rebinding (foreign Host header) and cross-site writes (foreign Origin) on the API.
 */
export function proxy(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").replace(/:\d+$/, "");
  if (!LOCAL_HOSTS.has(host)) {
    return new NextResponse("MUNE TOKENS only accepts local requests.", { status: 403 });
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    const origin = request.headers.get("origin");
    if (origin && origin !== "null") {
      let originHost = "";
      try {
        originHost = new URL(origin).hostname;
      } catch {}
      const normalized = originHost === "::1" ? "[::1]" : originHost;
      if (!LOCAL_HOSTS.has(normalized)) {
        return NextResponse.json({ error: "Cross-origin request blocked." }, { status: 403 });
      }
    } else if (origin === "null") {
      return NextResponse.json({ error: "Cross-origin request blocked." }, { status: 403 });
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*", "/((?!_next/static|_next/image|icons/).*)"],
};
