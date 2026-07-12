export const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

/** Headers copied from the client request; everything else — including the
 *  browser SDK's placeholder x-api-key, the password header, and the
 *  direct-browser-access flag — is dropped. Upstream headers are built fresh. */
const ALLOWED_REQ_HEADERS = ["anthropic-version", "anthropic-beta", "content-type"];

export async function proxyMessages(
  req: Request,
  apiKey: string,
  upstreamFetch: typeof fetch = fetch
): Promise<Response> {
  const headers = new Headers();
  headers.set("x-api-key", apiKey);
  for (const name of ALLOWED_REQ_HEADERS) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has("anthropic-version")) headers.set("anthropic-version", "2023-06-01");

  // Buffer the body (chat requests are modest JSON) — avoids fetch duplex quirks.
  const body = await req.text();
  const upstream = await upstreamFetch(ANTHROPIC_URL, { method: "POST", headers, body });

  // Stream the upstream body back verbatim; only content-type crosses back.
  const respHeaders = new Headers();
  const ct = upstream.headers.get("content-type");
  if (ct) respHeaders.set("content-type", ct);
  return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
}
