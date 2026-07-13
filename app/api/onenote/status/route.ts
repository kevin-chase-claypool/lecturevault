import { requireAuthenticatedRequest } from "../../../../lib/auth";
import { oneNoteConnectionStatus } from "../../../../lib/onenote";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authError = requireAuthenticatedRequest(request);
  if (authError) return authError;
  return Response.json(await oneNoteConnectionStatus());
}
