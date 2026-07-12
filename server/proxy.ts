export const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

/** Cap buffered request bodies — a malicious password-holder shouldn't be
 *  able to feed the single-process server gigabyte POSTs. */
export const MAX_BODY_BYTES = 2_000_000;

/** Headers copied from the client request; everything else — including the
 *  browser SDK's placeholder x-api-key, the password header, and the
 *  direct-browser-access flag — is dropped. Upstream headers are built fresh. */
const ALLOWED_REQ_HEADERS = ["anthropic-version", "anthropic-beta", "content-type"];

export async function proxyMessages(
  req: Request,
  apiKey: string,
  upstreamFetch: typeof fetch = fetch
): Promise<Response> {
  const tooLarge = new Response(JSON.stringify({ error: "request too large" }), {
    status: 413,
    headers: { "content-type": "application/json" },
  });
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return tooLarge;

  const headers = new Headers();
  headers.set("x-api-key", apiKey);
  for (const name of ALLOWED_REQ_HEADERS) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has("anthropic-version")) headers.set("anthropic-version", "2023-06-01");

  // Buffer the body (chat requests are modest JSON) — avoids fetch duplex quirks.
  const body = await req.text();
  if (body.length > MAX_BODY_BYTES) return tooLarge.clone();
  const upstream = await upstreamFetch(ANTHROPIC_URL, { method: "POST", headers, body });

  /** Non-sensitive upstream headers worth passing back: content-type for the
   *  stream parser, retry-after* so the SDK's backoff honors Anthropic's
   *  hints, request-id for debuggability. */
  const PASSTHROUGH = [
    "content-type",
    "request-id",
    "retry-after",
    "retry-after-ms",
  ];
  const respHeaders = new Headers();
  for (const name of PASSTHROUGH) {
    const value = upstream.headers.get(name);
    if (value) respHeaders.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
}
