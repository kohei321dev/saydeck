import { NextResponse } from "next/server";

import {
  getPreviewAuthBypassCookieValue,
  isPreviewAuthBypassConfigured,
  isPreviewAuthBypassTokenValid,
  previewAuthCookieMaxAgeSeconds,
  previewAuthCookieName,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);

  if (url.searchParams.get("clear") === "1") {
    const response = NextResponse.redirect(new URL("/signin", request.url));
    response.cookies.set(previewAuthCookieName, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    });
    return response;
  }

  if (!isPreviewAuthBypassConfigured()) {
    return NextResponse.json(
      { error: "Preview auth bypass is not configured." },
      { status: 404 },
    );
  }

  if (!isPreviewAuthBypassTokenValid(url.searchParams.get("token"))) {
    return NextResponse.json(
      { error: "Invalid preview auth token." },
      { status: 403 },
    );
  }

  const cookieValue = getPreviewAuthBypassCookieValue();

  if (!cookieValue) {
    return NextResponse.json(
      { error: "Preview auth bypass is not configured." },
      { status: 404 },
    );
  }

  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.set(previewAuthCookieName, cookieValue, {
    httpOnly: true,
    maxAge: previewAuthCookieMaxAgeSeconds,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
