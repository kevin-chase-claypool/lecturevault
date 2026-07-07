import { requireAuthenticatedRequest } from "../../../lib/auth";
import { supabaseServerClient } from "../../../lib/supabase-server";

export const runtime = "nodejs";

const TABLE_NAME = "lecturevault_state";
const ROW_ID = process.env.LECTUREVAULT_STATE_ID?.trim() || "default";

export async function GET(request: Request) {
  const unauthorized = requireAuthenticatedRequest(request);

  if (unauthorized) {
    return unauthorized;
  }

  const client = supabaseServerClient();

  if (!client) {
    return Response.json({
      configured: false,
      state: null,
      updatedAt: null
    });
  }

  const { data, error } = await client
    .from(TABLE_NAME)
    .select("data, updated_at")
    .eq("id", ROW_ID)
    .maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({
    configured: true,
    state: data?.data || null,
    updatedAt: data?.updated_at || null
  });
}

export async function PUT(request: Request) {
  const unauthorized = requireAuthenticatedRequest(request);

  if (unauthorized) {
    return unauthorized;
  }

  const client = supabaseServerClient();

  if (!client) {
    return Response.json(
      { error: "Supabase is not configured for LectureVault state sync." },
      { status: 503 }
    );
  }

  const body = (await request.json()) as { state?: unknown };

  if (!body || typeof body.state !== "object" || body.state === null) {
    return Response.json({ error: "State payload is required." }, { status: 400 });
  }

  const { data, error } = await client
    .from(TABLE_NAME)
    .upsert(
      {
        data: body.state,
        id: ROW_ID,
        updated_at: new Date().toISOString()
      },
      { onConflict: "id" }
    )
    .select("updated_at")
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({
    configured: true,
    updatedAt: data.updated_at
  });
}
