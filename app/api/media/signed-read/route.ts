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

  try {
    const body = (await request.json()) as { objects?: StorageObjectRequest[] };
    const objects = Array.isArray(body.objects) ? body.objects.slice(0, MAX_OBJECTS_PER_REQUEST) : [];
    const urls: Record<string, string> = {};

    for (const object of objects) {
      const path = cleanString(object.path);
      const bucket = cleanString(object.bucket) || SUPABASE_MEDIA_BUCKET;

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
