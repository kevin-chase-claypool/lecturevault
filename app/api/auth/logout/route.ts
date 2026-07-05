import { clearSessionCookie } from "../../../../lib/auth";

export const runtime = "nodejs";

export async function POST() {
  return Response.json(
    { authenticated: false },
    {
      headers: {
        "set-cookie": clearSessionCookie()
      }
    }
  );
}
