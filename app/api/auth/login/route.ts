import {
  authIsConfigured,
  createSessionToken,
  sessionCookie,
  validatePassword
} from "../../../../lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!authIsConfigured()) {
    return Response.json(
      {
        error:
          "LECTUREVAULT_APP_PASSWORD is not configured. Add it to the deployment environment variables."
      },
      { status: 500 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    password?: string;
  };

  if (!validatePassword(body.password || "")) {
    return Response.json({ error: "Invalid password." }, { status: 401 });
  }

  return Response.json(
    { authenticated: true },
    {
      headers: {
        "set-cookie": sessionCookie(createSessionToken())
      }
    }
  );
}
