import { requireAuthenticatedRequest } from "../../../../lib/auth";
import { disconnectOneNote } from "../../../../lib/onenote";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authError = requireAuthenticatedRequest(request);
  if (authError) return authError;
  try {
    await disconnectOneNote();
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not disconnect OneNote." }, { status: 500 });
  }
}
