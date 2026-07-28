import { requireAuthenticatedRequest } from "../../../../lib/auth";
import {
  SUPABASE_MEDIA_BUCKET,
  supabaseServerClient
} from "../../../../lib/supabase-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const unauthorized = requireAuthenticatedRequest(request);

  if (unauthorized) {
    return unauthorized;
  }

  const url = new URL(request.url);
  const path = url.searchParams.get("path")?.trim();
  const requestedBucket = url.searchParams.get("bucket")?.trim();

  if (requestedBucket && requestedBucket !== SUPABASE_MEDIA_BUCKET) {
    return Response.json(
      { error: "Only the configured LectureVault media bucket is available." },
      { status: 400 }
    );
  }

  const bucket = SUPABASE_MEDIA_BUCKET;

  if (!path) {
    return Response.json({ error: "Media path is required." }, { status: 400 });
  }

  const client = supabaseServerClient();

  if (!client) {
    return Response.json(
      { error: "Supabase media storage is not configured." },
      { status: 503 }
    );
  }

  const { data, error } = await client.storage.from(bucket).download(path);

  if (error || !data) {
    return Response.json(
      { error: error?.message || "Media object was not found." },
      { status: 404 }
    );
  }

  return new Response(data, {
    headers: {
      "cache-control": "private, max-age=300",
      "content-type": data.type || "application/octet-stream"
    }
  });
}
