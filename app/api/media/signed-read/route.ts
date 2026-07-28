import { requireAuthenticatedRequest } from "../../../../lib/auth";
import {
  SUPABASE_MEDIA_BUCKET,
  supabaseServerClient
} from "../../../../lib/supabase-server";

export const runtime = "nodejs";

const MAX_OBJECTS_PER_REQUEST = 80;
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;

type StorageObjectRequest = {
  bucket?: string;
  path?: string;
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function storageKey(bucket: string, path: string) {
  return `${bucket}:${path}`;
}

export async function POST(request: Request) {
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
    return Response.json({ error: "Source-link payload must be valid JSON." }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Source-link payload must be an object." }, { status: 400 });
  }

  try {
    const objects = Array.isArray((body as { objects?: unknown }).objects)
      ? (body as { objects: unknown[] }).objects.slice(0, MAX_OBJECTS_PER_REQUEST)
      : [];
    const urls: Record<string, string> = {};

    for (const object of objects) {
      if (!object || typeof object !== "object" || Array.isArray(object)) {
        continue;
      }

      const record = object as StorageObjectRequest;
      const path = cleanString(record.path);
      const requestedBucket = cleanString(record.bucket);

      if (requestedBucket && requestedBucket !== SUPABASE_MEDIA_BUCKET) {
        continue;
      }

      const bucket = SUPABASE_MEDIA_BUCKET;

      if (!path) {
        continue;
      }

      const { data, error } = await client.storage
        .from(bucket)
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

      if (!error && data?.signedUrl) {
        urls[storageKey(bucket, path)] = data.signedUrl;
      }
    }

    return Response.json({ expiresIn: SIGNED_URL_TTL_SECONDS, urls });
  } catch {
    return Response.json({ error: "Could not create source links." }, { status: 500 });
  }
}
