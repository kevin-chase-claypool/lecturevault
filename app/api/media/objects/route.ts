import { requireAuthenticatedRequest } from "../../../../lib/auth";
import {
  SUPABASE_MEDIA_BUCKET,
  supabaseServerClient
} from "../../../../lib/supabase-server";

export const runtime = "nodejs";

type StorageEntry = {
  created_at?: string;
  id?: string;
  metadata?: {
    mimetype?: string;
    size?: number;
  };
  name: string;
  updated_at?: string;
};

async function listFolder(
  bucket: ReturnType<NonNullable<ReturnType<typeof supabaseServerClient>>["storage"]["from"]>,
  prefix = ""
) {
  const { data, error } = await bucket.list(prefix || undefined, {
    limit: 1000,
    sortBy: {
      column: "name",
      order: "asc"
    }
  });

  if (error) {
    throw new Error(error.message);
  }

  const files: Array<{
    createdAt?: string;
    mimeType?: string;
    name: string;
    path: string;
    size?: number;
    updatedAt?: string;
  }> = [];

  for (const entry of (data || []) as StorageEntry[]) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.id) {
      files.push({
        createdAt: entry.created_at,
        mimeType: entry.metadata?.mimetype,
        name: entry.name,
        path,
        size: entry.metadata?.size,
        updatedAt: entry.updated_at
      });
    } else {
      files.push(...(await listFolder(bucket, path)));
    }
  }

  return files;
}

export async function GET(request: Request) {
  const unauthorized = requireAuthenticatedRequest(request);

  if (unauthorized) {
    return unauthorized;
  }

  const client = supabaseServerClient();

  if (!client) {
    return Response.json(
      { error: "Supabase media storage is not configured." },
      { status: 503 }
    );
  }

  try {
    const files = await listFolder(client.storage.from(SUPABASE_MEDIA_BUCKET));

    return Response.json({
      bucket: SUPABASE_MEDIA_BUCKET,
      files
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not list Supabase media.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const unauthorized = requireAuthenticatedRequest(request);

  if (unauthorized) {
    return unauthorized;
  }

  const client = supabaseServerClient();

  if (!client) {
    return Response.json(
      { error: "Supabase media storage is not configured." },
      { status: 503 }
    );
  }

  const body = (await request.json()) as { paths?: string[] };
  const paths = Array.isArray(body.paths)
    ? body.paths.filter((path) => typeof path === "string" && path.trim())
    : [];

  if (!paths.length) {
    return Response.json({ error: "Select at least one media object." }, { status: 400 });
  }

  const { data, error } = await client.storage
    .from(SUPABASE_MEDIA_BUCKET)
    .remove(paths);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({
    deleted: data?.length || paths.length
  });
}
