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

  const body = (await request.json()) as {
    fileName?: string;
    lectureId?: string;
    mediaId?: string;
  };
  const lectureId = safeName(body.lectureId || "lecture");
  const mediaId = safeName(body.mediaId || crypto.randomUUID());
  const fileName = safeName(body.fileName || "media");
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
