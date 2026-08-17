import { requireAuthenticatedRequest } from "../../../../lib/auth";
import {
  ensureMediaBucket,
  SUPABASE_MEDIA_BUCKET
} from "../../../../lib/supabase-server";

export const runtime = "nodejs";

function safeName(value: string) {
  return (
    value
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "media"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function resumableUploadEndpoint() {
  const configuredUrl = process.env.SUPABASE_URL?.trim();

  if (!configuredUrl) {
    return null;
  }

  try {
    const url = new URL(configuredUrl);

    // Use Storage's direct hostname so large PDFs do not pass through the API gateway.
    if (url.hostname.endsWith(".supabase.co")) {
      url.hostname = `${url.hostname.slice(0, -".supabase.co".length)}.storage.supabase.co`;
    }

    return `${url.origin}/storage/v1/upload/resumable`;
  } catch {
    return null;
  }
}

function publicStorageApiKey() {
  return (
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    null
  );
}

export async function POST(request: Request) {
  const unauthorized = requireAuthenticatedRequest(request);

  if (unauthorized) {
    return unauthorized;
  }

  const { client, error: bucketError } = await ensureMediaBucket();

  if (!client) {
    return Response.json(
      { error: "Supabase media storage is not configured." },
      { status: 503 }
    );
  }

  if (bucketError) {
    return Response.json({ error: bucketError }, { status: 500 });
  }

  let body: Record<string, unknown>;

  try {
    const parsed = await request.json();

    if (!isRecord(parsed)) {
      return Response.json({ error: "Upload payload must be an object." }, { status: 400 });
    }

    body = parsed;
  } catch {
    return Response.json({ error: "Upload payload must be valid JSON." }, { status: 400 });
  }

  const lectureId = safeName(typeof body.lectureId === "string" ? body.lectureId : "lecture");
  const mediaId = safeName(typeof body.mediaId === "string" ? body.mediaId : crypto.randomUUID());
  const fileName = safeName(typeof body.fileName === "string" ? body.fileName : "media");
  const dedupeKey = typeof body.dedupeKey === "string" && /^[a-f0-9]{64}$/i.test(body.dedupeKey)
    ? body.dedupeKey.toLowerCase()
    : "";
  const path = dedupeKey
    ? `textbooks/${dedupeKey}`
    : `lectures/${lectureId}/${mediaId}-${fileName}`;
  if (dedupeKey) {
    const { data: existing } = await client.storage
      .from(SUPABASE_MEDIA_BUCKET)
      .list("textbooks", { limit: 1000, search: dedupeKey });
    const match = existing?.find((entry) => entry.name.toLowerCase().startsWith(dedupeKey));
    if (match) {
      return Response.json({
        alreadyExists: true,
        bucket: SUPABASE_MEDIA_BUCKET,
        path: `textbooks/${match.name}`
      });
    }
  }
  const { data, error } = await client.storage
    .from(SUPABASE_MEDIA_BUCKET)
    .createSignedUploadUrl(path, { upsert: false });

  if (error || !data) {
    if (dedupeKey) {
      const { data: existing } = await client.storage
        .from(SUPABASE_MEDIA_BUCKET)
        .list("textbooks", { limit: 1000, search: dedupeKey });
      const match = existing?.find((entry) => entry.name.toLowerCase().startsWith(dedupeKey));
      if (match) {
        return Response.json({
          alreadyExists: true,
          bucket: SUPABASE_MEDIA_BUCKET,
          path: `textbooks/${match.name}`
        });
      }
    }
    return Response.json(
      { error: error?.message || "Could not create signed upload URL." },
      { status: 500 }
    );
  }

  return Response.json({
    bucket: SUPABASE_MEDIA_BUCKET,
    path: data.path,
    apiKey: publicStorageApiKey(),
    resumableEndpoint: resumableUploadEndpoint(),
    signedUrl: data.signedUrl,
    token: data.token
  });
}
