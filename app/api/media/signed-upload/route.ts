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
  const path = `lectures/${lectureId}/${mediaId}-${fileName}`;
  const { data, error } = await client.storage
    .from(SUPABASE_MEDIA_BUCKET)
    .createSignedUploadUrl(path, { upsert: true });

  if (error || !data) {
    return Response.json(
      { error: error?.message || "Could not create signed upload URL." },
      { status: 500 }
    );
  }

  return Response.json({
    bucket: SUPABASE_MEDIA_BUCKET,
    path: data.path,
    signedUrl: data.signedUrl
  });
}
