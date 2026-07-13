import { randomBytes } from "crypto";
import { requireAuthenticatedRequest } from "../../../../lib/auth";
import { oneNoteAuthorizationUrl } from "../../../../lib/onenote";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authError = requireAuthenticatedRequest(request);
  if (authError) return authError;

  try {
    const state = randomBytes(24).toString("base64url");
    const response = Response.redirect(oneNoteAuthorizationUrl(state));
    response.headers.append(
      "Set-Cookie",
      [
        `lecturevault_onenote_state=${state}`,
        "HttpOnly",
        "Path=/",
        "SameSite=Lax",
        "Max-Age=600",
        process.env.NODE_ENV === "production" ? "Secure" : ""
      ].filter(Boolean).join("; ")
    );
    return response;
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not begin OneNote connection." }, { status: 503 });
  }
}
