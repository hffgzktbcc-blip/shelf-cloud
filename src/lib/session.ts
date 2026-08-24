import crypto from "node:crypto";

/**
 * A single shared password gates the whole app once it's hosted — there's no per-user
 * account system, so a session is just a signed expiry timestamp. The signing key is
 * derived from the password itself, which means rotating SHELF_PASSWORD also invalidates
 * every existing session — the right behaviour for a shared secret.
 */

export const COOKIE_NAME = "shelf_session";
export const MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 days

function signingKey(): Buffer {
  const password = process.env.SHELF_PASSWORD;
  if (!password) throw new Error("SHELF_PASSWORD is not set");
  return crypto.createHash("sha256").update(password).digest();
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

export function createSessionToken(): string {
  const expires = Date.now() + MAX_AGE_SEC * 1000;
  const sig = crypto.createHmac("sha256", signingKey()).update(String(expires)).digest("hex");
  return `${expires}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const [expiresStr, sig] = token.split(".");
  if (!expiresStr || !sig) return false;

  const expires = Number(expiresStr);
  if (!Number.isFinite(expires) || expires < Date.now()) return false;

  const expected = crypto.createHmac("sha256", signingKey()).update(expiresStr).digest("hex");
  return timingSafeStringEqual(sig, expected);
}

export function checkPassword(candidate: string): boolean {
  const password = process.env.SHELF_PASSWORD;
  if (!password) return false;
  return timingSafeStringEqual(candidate, password);
}
