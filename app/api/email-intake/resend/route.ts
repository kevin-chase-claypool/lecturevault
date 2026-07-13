import { requireAuthenticatedRequest } from "../../../../lib/auth";
import {
  intakeTokenFromAddress,
  isEmailIntakeConfigured,
  resendAttachmentDownloadUrl,
  verifyResendWebhook
} from "../../../../lib/email-intake";
import { ensureMediaBucket, SUPABASE_MEDIA_BUCKET } from "../../../../lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_ATTACHMENT_BYTES = 30 * 1024 * 1024;

function safeName(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "onenote-export";
}

function acceptedAttachment(name: string, mimeType: string) {
  return mimeType.startsWith("image/") || mimeType.includes("pdf") || name.toLowerCase().endsWith(".pdf");
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!isEmailIntakeConfigured() || !verifyResendWebhook({
    body: rawBody,
    id: request.headers.get("svix-id"),
    signature: request.headers.get("svix-signature"),
    timestamp: request.headers.get("svix-timestamp")
  })) {
    return Response.json({ error: "Invalid inbound email webhook." }, { status: 401 });
  }

  const event = JSON.parse(rawBody) as {
    type?: string;
    data?: {
      attachments?: Array<{ content_type?: string; filename?: string; id?: string; size?: number }>;
      email_id?: string;
      to?: string[];
    };
  };
  if (event.type !== "email.received" || !event.data?.email_id) return Response.json({ received: true });

  const emailToken = (event.data.to || []).map(intakeTokenFromAddress).find(Boolean);
  if (!emailToken) return Response.json({ received: true, ignored: "No LectureVault intake address." });

  const { client: supabase, error: bucketError } = await ensureMediaBucket();
  if (!supabase || bucketError) return Response.json({ error: bucketError || "Supabase storage is unavailable." }, { status: 503 });

  const { data: intake, error: intakeError } = await supabase
    .from("lecturevault_email_intake")
    .select("*")
    .eq("email_token", emailToken)
    .maybeSingle();
  if (intakeError || !intake) return Response.json({ received: true, ignored: "Unknown or expired intake address." });
  if (intake.status === "ready") return Response.json({ received: true, duplicate: true });

  try {
    const attachments = event.data.attachments || [];
    const saved = [] as Array<{
      id: string;
      mimeType: string;
      name: string;
      size: number;
      storageBucket: string;
      storagePath: string;
    }>;

    for (const attachment of attachments) {
      const name = safeName(attachment.filename || "onenote-export");
      const mimeType = attachment.content_type || (name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream");
      if (!attachment.id || !acceptedAttachment(name, mimeType)) continue;

      const downloadUrl = await resendAttachmentDownloadUrl({ attachmentId: attachment.id, emailId: event.data.email_id });
      const response = await fetch(downloadUrl);
      if (!response.ok) throw new Error(`Could not download ${name}.`);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (!buffer.length || buffer.length > MAX_ATTACHMENT_BYTES) throw new Error(`${name} is empty or exceeds the 30 MB intake limit.`);

      const storagePath = `email-intake/${intake.id}/${attachment.id}-${name}`;
      const { error: uploadError } = await supabase.storage
        .from(SUPABASE_MEDIA_BUCKET)
        .upload(storagePath, buffer, { contentType: mimeType, upsert: true });
      if (uploadError) throw new Error(`Could not archive ${name}: ${uploadError.message}`);

      saved.push({
        id: attachment.id,
        mimeType,
        name,
        size: buffer.length,
        storageBucket: SUPABASE_MEDIA_BUCKET,
        storagePath
      });
    }

    if (!saved.length) throw new Error("The email did not contain a PDF or image attachment.");
    const { error: updateError } = await supabase
      .from("lecturevault_email_intake")
      .update({ attachments: saved, received_email_id: event.data.email_id, status: "ready", updated_at: new Date().toISOString() })
      .eq("id", intake.id);
    if (updateError) throw new Error(updateError.message);
    return Response.json({ received: true, attachments: saved.length });
  } catch (error) {
    await supabase
      .from("lecturevault_email_intake")
      .update({ status: "error", updated_at: new Date().toISOString() })
      .eq("id", intake.id);
    return Response.json({ error: error instanceof Error ? error.message : "Could not process inbound OneNote email." }, { status: 500 });
  }
}
