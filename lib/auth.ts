import { createHmac, timingSafeEqual } from "crypto";

const SESSION_COOKIE = "lecturevault_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function appPassword() {
  return process.env.LECTUREVAULT_APP_PASSWORD?.trim() || "";
}

function signingSecret() {
  return (
    process.env.LECTUREVAULT_AUTH_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    appPassword()
  );
}

function base64Url(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "="
  );
  return Buffer.from(padded, "base64").toString("utf8");
}

function signature(payload: string) {
  return base64Url(createHmac("sha256", signingSecret()).update(payload).digest());
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function cookieHeaderValue(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie") || "";
  const cookies = cookieHeader.split(";").map((item) => item.trim());
  const prefix = `${name}=`;
  const cookie = cookies.find((item) => item.startsWith(prefix));

  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : "";
}

export function authIsConfigured() {
  return Boolean(appPassword() && signingSecret());
}

export function validatePassword(password: string) {
  const expected = appPassword();

  return Boolean(expected) && safeEqual(password, expected);
}

export function createSessionToken() {
  const payload = base64Url(
    JSON.stringify({
      exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
      v: 1
    })
  );

  return `${payload}.${signature(payload)}`;
}

export function verifySessionToken(token: string) {
  const [payload, receivedSignature] = token.split(".");

  if (!payload || !receivedSignature || !safeEqual(signature(payload), receivedSignature)) {
    return false;
  }

  try {
    const parsed = JSON.parse(fromBase64Url(payload)) as { exp?: number };
    return typeof parsed.exp === "number" && parsed.exp > Date.now();
  } catch {
    return false;
  }
}

export function requestIsAuthenticated(request: Request) {
  if (!authIsConfigured()) {
    return false;
  }

  return verifySessionToken(cookieHeaderValue(request, SESSION_COOKIE));
}

export function unauthorizedResponse() {
  return Response.json({ error: "Authentication required." }, { status: 401 });
}

export function requireAuthenticatedRequest(request: Request) {
  return requestIsAuthenticated(request) ? null : unauthorizedResponse();
}

export function sessionCookie(token: string) {
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    process.env.NODE_ENV === "production" ? "Secure" : ""
  ]
    .filter(Boolean)
    .join("; ");
}

export function clearSessionCookie() {
  return [
    `${SESSION_COOKIE}=`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    "Max-Age=0",
    process.env.NODE_ENV === "production" ? "Secure" : ""
  ]
    .filter(Boolean)
    .join("; ");
}
