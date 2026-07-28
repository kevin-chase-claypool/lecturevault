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

type StorageReference = {
  label: string;
  path: string;
};

function collectStorageReferences(
  value: unknown,
  bucketName: string,
  references: StorageReference[],
  fallbackLabel = "Saved LectureVault record"
) {
  if (Array.isArray(value)) {
    value.forEach((item) =>
      collectStorageReferences(item, bucketName, references, fallbackLabel)
    );
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  const record = value as Record<string, unknown>;
  const label =
    (typeof record.title === "string" && record.title.trim()) ||
    (typeof record.name === "string" && record.name.trim()) ||
    fallbackLabel;
  const storagePath = typeof record.storagePath === "string" ? record.storagePath : "";
  const storageBucket =
    typeof record.storageBucket === "string" ? record.storageBucket : bucketName;

  if (storagePath && storageBucket === bucketName) {
    references.push({ label, path: storagePath });
  }

  Object.entries(record).forEach(([key, child]) => {
    if (key === "storagePath" || key === "storageBucket") return;
    collectStorageReferences(child, bucketName, references, label);
  });
}

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

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Delete payload must be valid JSON." }, { status: 400 });
  }

  const paths =
    body && typeof body === "object" && !Array.isArray(body) && "paths" in body && Array.isArray(body.paths)
      ? body.paths.filter((path): path is string => typeof path === "string" && path.trim().length > 0)
      : [];

  if (!paths.length) {
    return Response.json({ error: "Select at least one media object." }, { status: 400 });
  }

  const { data: stateRow, error: stateError } = await client
    .from("lecturevault_state")
    .select("data")
    .eq("id", process.env.LECTUREVAULT_STATE_ID?.trim() || "default")
    .maybeSingle();

  if (stateError) {
    return Response.json(
      { error: "Could not verify media references before deletion." },
      { status: 503 }
    );
  }

  const references: StorageReference[] = [];
  collectStorageReferences(
    stateRow?.data || null,
    SUPABASE_MEDIA_BUCKET,
    references
  );
  const referencesByPath = new Map<string, StorageReference>();
  references.forEach((reference) => referencesByPath.set(reference.path, reference));
  const protectedReferences = paths
    .map((path) => referencesByPath.get(path))
    .filter((reference): reference is StorageReference => Boolean(reference));

  if (protectedReferences.length) {
    return Response.json(
      {
        error:
          "One or more selected files are still referenced by LectureVault records. Remove those records first, or keep the files in the Media Library.",
        protected: protectedReferences.map(({ label, path }) => ({ label, path }))
      },
      { status: 409 }
    );
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
