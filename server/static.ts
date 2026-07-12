import { promises as fs } from "node:fs";
import path from "node:path";

/** Map a URL path to candidate files inside the Next static export
 *  (foo → foo.html per `output: 'export'` without trailingSlash).
 *  Returns null for traversal attempts. */
export function staticCandidates(urlPath: string): string[] | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath.split("?")[0]);
  } catch {
    return null;
  }
  if (decoded.includes("..") || decoded.includes("\0")) return null;
  const trimmed = decoded.replace(/\/+$/, "");
  if (trimmed === "" || trimmed === "/") return ["index.html"];
  const rel = trimmed.replace(/^\/+/, "");
  if (/\.[A-Za-z0-9]+$/.test(rel)) return [rel];
  return [`${rel}.html`, `${rel}/index.html`];
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

export function contentTypeFor(file: string): string {
  return CONTENT_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
}

/** Serve a path from outDir; falls back to 404.html (status 404). */
export async function serveStatic(outDir: string, urlPath: string): Promise<Response> {
  const candidates = staticCandidates(urlPath) ?? [];
  const root = path.resolve(outDir);
  for (const rel of candidates) {
    const abs = path.resolve(root, rel);
    if (!abs.startsWith(root + path.sep) && abs !== root) continue; // belt-and-suspenders
    try {
      const data = await fs.readFile(abs);
      return new Response(data, { status: 200, headers: { "content-type": contentTypeFor(abs) } });
    } catch {
      /* try next candidate */
    }
  }
  try {
    const nf = await fs.readFile(path.join(root, "404.html"));
    return new Response(nf, { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
