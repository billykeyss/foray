import { LOCAL_IMAGES } from "./local-images.ts";

/** Return the bundled local path for a known remote image URL, else the URL itself. */
export function localImage(remoteUrl: string | null | undefined): string {
  if (!remoteUrl) return "";
  return LOCAL_IMAGES[remoteUrl] ?? remoteUrl;
}
