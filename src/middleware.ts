import { NextResponse, type NextRequest } from "next/server";

// Cheap gate: no session cookie means no dashboard. Real checks happen server-side.
export function middleware(req: NextRequest) {
  if (!req.cookies.get("session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/dashboard/:path*"] };
