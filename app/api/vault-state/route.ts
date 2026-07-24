import { requireAuthenticatedRequest } from "../../../lib/auth";
import { supabaseServerClient } from "../../../lib/supabase-server";

export const runtime = "nodejs";

const TABLE_NAME = "lecturevault_state";
const ROW_ID = process.env.LECTUREVAULT_STATE_ID?.trim() || "default";

async function readCurrentState(client: NonNullable<ReturnType<typeof supabaseServerClient>>) {
  const { data, error } = await client
    .from(TABLE_NAME)
    .select("data, updated_at")
    .eq("id", ROW_ID)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return {
    state: data?.data || null,
    updatedAt: data?.updated_at || null
  };
}

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

  try {
    const current = await readCurrentState(client);

    return Response.json({ configured: true, ...current });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not read archive state." },
      { status: 500 }
    );
  }
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

  const body = (await request.json()) as {
    expectedUpdatedAt?: string | null;
    state?: unknown;
  };

  if (!body || typeof body.state !== "object" || body.state === null) {
    return Response.json({ error: "State payload is required." }, { status: 400 });
  }

  const expectedUpdatedAt = body.expectedUpdatedAt ?? null;
  const updatedAt = new Date().toISOString();

  try {
    if (expectedUpdatedAt) {
      const { data, error } = await client
        .from(TABLE_NAME)
        .update({ data: body.state, updated_at: updatedAt })
        .eq("id", ROW_ID)
        .eq("updated_at", expectedUpdatedAt)
        .select("updated_at")
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      if (data) {
        return Response.json({ configured: true, updatedAt: data.updated_at });
      }
    } else {
      const { data, error } = await client
        .from(TABLE_NAME)
        .insert({ data: body.state, id: ROW_ID, updated_at: updatedAt })
        .select("updated_at")
        .maybeSingle();

      if (!error && data) {
        return Response.json({ configured: true, updatedAt: data.updated_at });
      }

      if (error && !/duplicate|unique/i.test(error.message)) {
        throw new Error(error.message);
      }
    }

    const current = await readCurrentState(client);
    return Response.json(
      {
        conflict: true,
        configured: true,
        error: "Archive changed on another device. Your local changes were not discarded.",
        ...current
      },
      { status: 409 }
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not save archive state." },
      { status: 500 }
    );
  }
}
