import { saveOneNoteAuthorizationCode } from "../../../../lib/onenote";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function cookieValue(request: Request, name: string) {
  const prefix = `${name}=`;
  const part = (request.headers.get("cookie") || "").split(";").map((item) => item.trim()).find((item) => item.startsWith(prefix));
  return part ? decodeURIComponent(part.slice(prefix.length)) : "";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = cookieValue(request, "lecturevault_onenote_state");
  const redirect = new URL("/", url.origin);
  redirect.searchParams.set("onenote", error ? "denied" : "error");

  if (error) {
    redirect.searchParams.set("onenote_message", url.searchParams.get("error_description") || "OneNote access was not granted.");
  } else if (!code || !state || state !== expectedState) {
    redirect.searchParams.set("onenote_message", "OneNote connection could not be verified. Please try again.");
  } else {
    try {
      await saveOneNoteAuthorizationCode(code);
      redirect.searchParams.set("onenote", "connected");
    } catch (callbackError) {
      redirect.searchParams.set("onenote_message", callbackError instanceof Error ? callbackError.message : "Could not save OneNote connection.");
    }
  }

  const response = NextResponse.redirect(redirect);
  response.cookies.set({
    httpOnly: true,
    maxAge: 0,
    name: "lecturevault_onenote_state",
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    value: ""
  });
  return response;
}
