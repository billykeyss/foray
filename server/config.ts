import path from "node:path";
import { fileURLToPath } from "node:url";

export interface ServerConfig {
  port: number;
  /** Server-held Anthropic key; null = chat unconfigured (503). */
  apiKey: string | null;
  /** Shared chat password; null = chat unconfigured (503). */
  password: string | null;
  /** Directory of the Next static export. */
  outDir: string;
}

export function readConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return {
    port: env.PORT !== undefined && Number.isFinite(Number(env.PORT)) ? Number(env.PORT) : 4245,
    apiKey: env.ANTHROPIC_API_KEY || null,
    password: env.FORAY_CHAT_PASSWORD || null,
    outDir: env.FORAY_OUT_DIR || path.resolve(here, "..", "out"),
  };
}
