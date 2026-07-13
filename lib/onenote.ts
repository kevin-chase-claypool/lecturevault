import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { supabaseServerClient } from "./supabase-server";

const TOKEN_TABLE = "lecturevault_onenote_tokens";
const TOKEN_ID = process.env.LECTUREVAULT_ONENOTE_ACCOUNT_ID?.trim() || "default";
const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";
const TOKEN_REFRESH_MARGIN_MS = 2 * 60 * 1000;

type StoredToken = {
  access_token: string;
  refresh_token?: string;
  expires_at?: string;
  scope?: string;
  account_label?: string;
};

type TokenRow = {
  token_ciphertext: string;
  token_iv: string;
  token_tag: string;
  expires_at?: string | null;
  account_label?: string | null;
};

function clean(value: string | undefined) {
  return value?.trim() || "";
}

function encryptionKey() {
  const value = clean(process.env.ONENOTE_TOKEN_ENCRYPTION_KEY);

  if (!value) {
    throw new Error("ONENOTE_TOKEN_ENCRYPTION_KEY is not configured.");
  }

  const decoded = Buffer.from(value, "base64");
  const key = decoded.length === 32 ? decoded : Buffer.from(value, "utf8");

  if (key.length !== 32) {
    throw new Error("ONENOTE_TOKEN_ENCRYPTION_KEY must be a 32-byte base64 value.");
  }

  return key;
}

export function oneNoteConfig() {
  const clientId = clean(process.env.ONENOTE_CLIENT_ID);
  const clientSecret = clean(process.env.ONENOTE_CLIENT_SECRET);
  const tenant = clean(process.env.ONENOTE_TENANT_ID) || "common";
  const redirectUri = clean(process.env.ONENOTE_REDIRECT_URI);

  return {
    clientId,
    clientSecret,
    configured: Boolean(clientId && clientSecret && redirectUri && clean(process.env.ONENOTE_TOKEN_ENCRYPTION_KEY)),
    redirectUri,
    tenant
  };
}

function authorityUrl(path: string) {
  return `https://login.microsoftonline.com/${oneNoteConfig().tenant}/oauth2/v2.0/${path}`;
}

function encodeToken(token: StoredToken) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(token), "utf8"),
    cipher.final()
  ]);

  return {
    token_ciphertext: ciphertext.toString("base64"),
    token_iv: iv.toString("base64"),
    token_tag: cipher.getAuthTag().toString("base64")
  };
}

function decodeToken(row: TokenRow): StoredToken {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(row.token_iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(row.token_tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(row.token_ciphertext, "base64")),
    decipher.final()
  ]).toString("utf8");

  return JSON.parse(plaintext) as StoredToken;
}

function expiresAt(expiresIn: unknown) {
  const seconds = typeof expiresIn === "number" ? expiresIn : Number(expiresIn);
  return new Date(Date.now() + (Number.isFinite(seconds) ? seconds : 3600) * 1000).toISOString();
}

async function tokenRequest(params: URLSearchParams) {
  const config = oneNoteConfig();
  const response = await fetch(authorityUrl("token"), {
    body: params,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST"
  });
  const data = (await response.json()) as Record<string, unknown>;

  if (!response.ok || typeof data.access_token !== "string") {
    throw new Error(
      typeof data.error_description === "string"
        ? data.error_description
        : "Microsoft did not return an access token."
    );
  }

  return {
    access_token: data.access_token,
    account_label: typeof data.id_token_claims === "object" && data.id_token_claims
      ? String((data.id_token_claims as Record<string, unknown>).preferred_username || "")
      : "",
    expires_at: expiresAt(data.expires_in),
    refresh_token: typeof data.refresh_token === "string" ? data.refresh_token : undefined,
    scope: typeof data.scope === "string" ? data.scope : undefined
  } satisfies StoredToken;
}

async function saveToken(token: StoredToken) {
  const supabase = supabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for OneNote connection storage.");
  }

  const encrypted = encodeToken(token);
  const { error } = await supabase.from(TOKEN_TABLE).upsert({
    id: TOKEN_ID,
    ...encrypted,
    expires_at: token.expires_at || null,
    account_label: token.account_label || null,
    updated_at: new Date().toISOString()
  });

  if (error) {
    throw new Error(`Could not save OneNote connection: ${error.message}`);
  }
}

async function readToken() {
  const supabase = supabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for OneNote connection storage.");
  }

  const { data, error } = await supabase
    .from(TOKEN_TABLE)
    .select("token_ciphertext, token_iv, token_tag, expires_at, account_label")
    .eq("id", TOKEN_ID)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not read OneNote connection: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return decodeToken(data as TokenRow);
}

export function oneNoteAuthorizationUrl(state: string) {
  const config = oneNoteConfig();
  if (!config.configured) {
    throw new Error("OneNote OAuth variables are not fully configured.");
  }

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_mode: "query",
    response_type: "code",
    scope: "openid profile offline_access User.Read Notes.Read",
    state
  });

  return `${authorityUrl("authorize")}?${params.toString()}`;
}

export async function saveOneNoteAuthorizationCode(code: string) {
  const config = oneNoteConfig();
  const token = await tokenRequest(
    new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri
    })
  );
  await saveToken(token);
}

export async function oneNoteConnectionStatus() {
  const config = oneNoteConfig();
  if (!config.configured) {
    return { configured: false, connected: false, reason: "OAuth variables are incomplete." };
  }

  try {
    const token = await readToken();
    return {
      configured: true,
      connected: Boolean(token),
      accountLabel: token?.account_label || "",
      expiresAt: token?.expires_at || ""
    };
  } catch (error) {
    return {
      configured: true,
      connected: false,
      reason: error instanceof Error ? error.message : "Could not read the OneNote connection."
    };
  }
}

export async function disconnectOneNote() {
  const supabase = supabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for OneNote connection storage.");
  }
  const { error } = await supabase.from(TOKEN_TABLE).delete().eq("id", TOKEN_ID);
  if (error) {
    throw new Error(`Could not disconnect OneNote: ${error.message}`);
  }
}

export async function oneNoteAccessToken() {
  const token = await readToken();
  if (!token) {
    throw new Error("Connect OneNote before browsing its pages.");
  }

  const expires = token.expires_at ? Date.parse(token.expires_at) : 0;
  if (expires > Date.now() + TOKEN_REFRESH_MARGIN_MS) {
    return token.access_token;
  }

  if (!token.refresh_token) {
    throw new Error("The OneNote connection expired. Connect OneNote again.");
  }

  const config = oneNoteConfig();
  const refreshed = await tokenRequest(
    new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: token.refresh_token,
      scope: "openid profile offline_access User.Read Notes.Read"
    })
  );
  await saveToken({ ...token, ...refreshed, refresh_token: refreshed.refresh_token || token.refresh_token });
  return refreshed.access_token;
}

export async function graphGet(path: string) {
  const response = await fetch(`${GRAPH_BASE_URL}${path}`, {
    headers: { authorization: `Bearer ${await oneNoteAccessToken()}` }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OneNote request failed (${response.status}): ${text.slice(0, 500)}`);
  }

  return response;
}

export function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|h[1-6]|li|table|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
