import { MAX_BODY_BYTES } from "./gateway";

export type BodyRead = { ok: true; text: string } | { ok: false };

/**
 * Reads a request body but never buffers more than `max` bytes. The gateway's
 * size limit used to run AFTER `request.text()` had already pulled the whole
 * body into memory, so an unauthenticated caller could make the server hold
 * whatever the platform would let through. This refuses on a declared
 * Content-Length up front and, for chunked or lying requests, stops reading
 * the moment the running total passes the cap.
 */
export async function readBodyCapped(request: Request, max: number = MAX_BODY_BYTES): Promise<BodyRead> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) return { ok: false };
  if (!request.body) return { ok: true, text: "" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return { ok: false };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(bytes) };
}
