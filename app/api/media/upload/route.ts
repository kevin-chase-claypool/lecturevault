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

  const form = await request.formData();
  const file = form.get("file");
  const lectureId = safeName(String(form.get("lectureId") || "lecture"));
  const mediaId = safeName(String(form.get("mediaId") || crypto.randomUUID()));

  if (!(file instanceof File)) {
    return Response.json({ error: "A media file is required." }, { status: 400 });
  }

  const path = `lectures/${lectureId}/${mediaId}-${safeName(file.name)}`;
  const { error } = await client.storage
    .from(SUPABASE_MEDIA_BUCKET)
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: true
    });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({
    bucket: SUPABASE_MEDIA_BUCKET,
    path
  });
}
