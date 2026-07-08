import { createClient } from "@supabase/supabase-js";

export const SUPABASE_MEDIA_BUCKET =
  process.env.SUPABASE_MEDIA_BUCKET?.trim() || "lecturevault-media";

export function supabaseServerClient() {
  const url = process.env.SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_KEY?.trim();

  if (!url || !key) {
    return null;
  }

  return createClient(url, key, {
    auth: {
      persistSession: false
    }
  });
}

export async function ensureMediaBucket() {
  const client = supabaseServerClient();

  if (!client) {
    return { client: null, error: "Supabase is not configured." };
  }

  const { error } = await client.storage.createBucket(SUPABASE_MEDIA_BUCKET, {
    public: false
  });

  if (error && !/already exists|duplicate/i.test(error.message)) {
    return { client, error: error.message };
  }

  return { client, error: null };
}

export async function storageObjectToDataUrl({
  bucket,
  mimeType,
  path
}: {
  bucket?: string;
  mimeType?: string;
  path?: string;
}) {
  if (!path) {
    return null;
  }

  const client = supabaseServerClient();

  if (!client) {
    return null;
  }

  const { data, error } = await client.storage
    .from(bucket || SUPABASE_MEDIA_BUCKET)
    .download(path);

  if (error || !data) {
    return null;
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  const type = mimeType || data.type || "application/octet-stream";

  return `data:${type};base64,${buffer.toString("base64")}`;
}

export async function storageObjectToBuffer({
  bucket,
  path
}: {
  bucket?: string;
  path?: string;
}) {
  if (!path) {
    return null;
  }

  const client = supabaseServerClient();

  if (!client) {
    return null;
  }

  const { data, error } = await client.storage
    .from(bucket || SUPABASE_MEDIA_BUCKET)
    .download(path);

  if (error || !data) {
    return null;
  }

  return Buffer.from(await data.arrayBuffer());
}
