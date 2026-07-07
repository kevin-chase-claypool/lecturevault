import { createClient } from "@supabase/supabase-js";
import { requireAuthenticatedRequest } from "../../../lib/auth";

export const runtime = "nodejs";

const TABLE_NAME = "lecturevault_state";
const ROW_ID = process.env.LECTUREVAULT_STATE_ID?.trim() || "default";

function supabaseConfig() {
  const url = process.env.SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_KEY?.trim();

  if (!url || !key) {
    return null;
  }

  return { key, url };
}

function supabaseClient() {
  const config = supabaseConfig();

  if (!config) {
    return null;
  }

  return createClient(config.url, config.key, {
    auth: {
      persistSession: false
    }
  });
}

export async function GET(request: Request) {
  const unauthorized = requireAuthenticatedRequest(request);

  if (unauthorized) {
    return unauthorized;
  }

  const client = supabaseClient();

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

  const client = supabaseClient();

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
