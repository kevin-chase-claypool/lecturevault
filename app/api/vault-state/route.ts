import { requireAuthenticatedRequest } from "../../../lib/auth";
import { supabaseServerClient } from "../../../lib/supabase-server";

export const runtime = "nodejs";

const TABLE_NAME = "lecturevault_state";
const ROW_ID = process.env.LECTUREVAULT_STATE_ID?.trim() || "default";
const STATE_COLLECTION_KEYS = [
  "courses",
  "archiveFolders",
  "lectures",
  "mediaItems",
  "mediaLibraryFolders",
  "mediaLibraryPlacements",
  "textbooks",
  "textbookChunks",
  "transcripts",
  "concepts",
  "exams",
  "reviewFolders",
  "examItems",
  "studyGuides",
  "reconstructionDrafts"
] as const;

type StatePatch = Partial<Record<(typeof STATE_COLLECTION_KEYS)[number], unknown[]>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function sanitizeStatePatch(input: unknown): StatePatch {
  if (!isRecord(input)) return {};

  const patch: StatePatch = {};
  for (const key of STATE_COLLECTION_KEYS) {
    if (Array.isArray(input[key])) {
      patch[key] = input[key];
    }
  }
  return patch;
}

function mergeStatePatch(currentState: unknown, patch: StatePatch) {
  return {
    ...(isRecord(currentState) ? currentState : {}),
    ...patch
  };
}

function legacyStatePatch(currentState: unknown, nextState: unknown): StatePatch {
  const current = isRecord(currentState) ? currentState : {};
  const next = sanitizeStatePatch(nextState);
  const patch: StatePatch = {};

  for (const key of STATE_COLLECTION_KEYS) {
    const nextItems = next[key];
    if (!nextItems) continue;

    if (JSON.stringify(current[key] ?? []) !== JSON.stringify(nextItems)) {
      patch[key] = nextItems;
    }
  }

  return patch;
}

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
    patch?: unknown;
  };

  if (!body) {
    return Response.json({ error: "State payload is required." }, { status: 400 });
  }

  const patch = sanitizeStatePatch(body.patch);
  const hasPatch = Object.keys(patch).length > 0;
  const hasFullState = isRecord(body.state);

  if (!hasPatch && !hasFullState) {
    return Response.json({ error: "State payload is required." }, { status: 400 });
  }

  const expectedUpdatedAt = body.expectedUpdatedAt ?? null;
  const updatedAt = new Date().toISOString();

  try {
    if (expectedUpdatedAt) {
      const current = await readCurrentState(client);
      const effectivePatch = hasPatch
        ? patch
        : legacyStatePatch(current.state, body.state);
      const nextState = mergeStatePatch(current.state, effectivePatch);
      const { data, error } = await client
        .from(TABLE_NAME)
        .update({ data: nextState, updated_at: updatedAt })
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
      const initialState = hasPatch ? patch : body.state;
      const { data, error } = await client
        .from(TABLE_NAME)
        .insert({ data: initialState, id: ROW_ID, updated_at: updatedAt })
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
