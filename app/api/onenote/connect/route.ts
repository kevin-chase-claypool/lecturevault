import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "../../../../lib/auth";
import { oneNoteAuthorizationUrl } from "../../../../lib/onenote";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authError = requireAuthenticatedRequest(request);
  if (authError) return authError;

  try {
    const state = randomBytes(24).toString("base64url");
    const response = NextResponse.redirect(oneNoteAuthorizationUrl(state));
    response.cookies.set({
      httpOnly: true,
      maxAge: 600,
      name: "lecturevault_onenote_state",
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      value: state
    });
    return response;
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not begin OneNote connection." }, { status: 503 });
  }
}
