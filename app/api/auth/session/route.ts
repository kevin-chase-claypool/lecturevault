import { authIsConfigured, requestIsAuthenticated } from "../../../../lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return Response.json({
    authenticated: requestIsAuthenticated(request),
    configured: authIsConfigured()
  });
}
