/**
 * Minimal WebCrypto helpers (Node >= 18, Deno, Bun, edge, browsers). Kept in
 * the contracts package so both sides of the Flow <-> Capture boundary hash
 * and sign identically — this is protocol, not business logic.
 */
const encoder = new TextEncoder();

export function toHex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = "";
  for (const byte of view) out += byte.toString(16).padStart(2, "0");
  return out;
}

export function fromHex(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0 || !/^[a-f0-9]*$/i.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === "string" ? encoder.encode(data) : data;
  return toHex(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
}

async function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret) as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await hmacKey(secret, "sign");
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(message) as BufferSource));
}

/** Constant-time MAC check (delegates the comparison to WebCrypto's verify). */
export async function hmacSha256Verify(secret: string, message: string, signatureHex: string): Promise<boolean> {
  const signature = fromHex(signatureHex);
  if (!signature) return false;
  const key = await hmacKey(secret, "verify");
  return crypto.subtle.verify("HMAC", key, signature as BufferSource, encoder.encode(message) as BufferSource);
}
