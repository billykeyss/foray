import type { AnchorHTMLAttributes } from "react";

/**
 * A same-origin link that always does a full document navigation. Use it for links whose target page
 * reads its query string (/?spot=, /?lat=&lon=, /fish/water?w=). Offline, Next's client router reuses
 * a failed prefetch of the bare path (it aliases prefetch entries across search params) and lands on
 * "/" with the query dropped; a document navigation goes through the service worker instead, which
 * serves the precached page with the query intact (see ignoreURLParametersMatching in sw/index.ts).
 */
export default function DocLink(props: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  // eslint-disable-next-line @next/next/no-html-link-for-pages
  return <a {...props} />;
}
