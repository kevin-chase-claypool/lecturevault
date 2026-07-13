import { createHmac, timingSafeEqual } from "crypto";

const RESEND_API = "https://api.resend.com";

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function emailIntakeConfig() {
  return {
    apiKey: cleanString(process.env.RESEND_API_KEY),
    domain: cleanString(process.env.RESEND_INBOUND_DOMAIN).toLowerCase(),
    webhookSecret: cleanString(process.env.RESEND_WEBHOOK_SECRET)
  };
}

export function intakeEmailAddress(token: string) {
  const { domain } = emailIntakeConfig();
  return domain ? `onenote+${token}@${domain}` : "";
}

export function isEmailIntakeConfigured() {
  const { apiKey, domain, webhookSecret } = emailIntakeConfig();
  return Boolean(apiKey && domain && webhookSecret);
}

export function intakeTokenFromAddress(address: string) {
  const localPart = cleanString(address).toLowerCase().split("@")[0] || "";
  const match = localPart.match(/^onenote\+([a-z0-9_-]{12,})$/i);
  return match?.[1] || "";
}

function webhookSecretBuffer(secret: string) {
  const encoded = secret.replace(/^whsec_/, "");
  return Buffer.from(encoded, "base64");
}

export function verifyResendWebhook({
  body,
  id,
  signature,
  timestamp
}: {
  body: string;
  id: string | null;
  signature: string | null;
  timestamp: string | null;
}) {
  const { webhookSecret } = emailIntakeConfig();

  if (!webhookSecret || !id || !signature || !timestamp) {
    return false;
  }

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt) || Math.abs(Date.now() / 1000 - sentAt) > 5 * 60) {
    return false;
  }

  const expected = createHmac("sha256", webhookSecretBuffer(webhookSecret))
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  const candidates = signature
    .split(" ")
    .map((part) => part.trim().replace(/^v1,/, ""))
    .filter(Boolean);

  return candidates.some((candidate) => {
    const actual = Buffer.from(candidate);
    const expectedBuffer = Buffer.from(expected);
    return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
  });
}

export async function resendAttachmentDownloadUrl({
  attachmentId,
  emailId
}: {
  attachmentId: string;
  emailId: string;
}) {
  const { apiKey } = emailIntakeConfig();
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured.");

  const response = await fetch(
    `${RESEND_API}/emails/receiving/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(attachmentId)}`,
    { headers: { authorization: `Bearer ${apiKey}` } }
  );
  const data = (await response.json()) as { download_url?: string; message?: string };

  if (!response.ok || !data.download_url) {
    throw new Error(data.message || "Could not retrieve the inbound email attachment.");
  }

  return data.download_url;
}
