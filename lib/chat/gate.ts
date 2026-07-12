/** Chat gate probing + password persistence. Pure module (no React, no SDK)
 *  so node tests can import it. The Foray server (server/index.ts) answers
 *  /api/chat/auth/check; on Render there is no server and the probe 404s. */

export type ChatProxyMode = "password-mode" | "byo-mode";

const PW_KEY = "foray.chat.password.v1";
const CHECK_PATH = "/api/chat/auth/check";

export async function probeChatProxy(fetchImpl: typeof fetch = fetch): Promise<ChatProxyMode> {
  try {
    const res = await fetchImpl(CHECK_PATH, { method: "GET" });
    // 401/204 = a gate is present. 503 = server exists but chat unconfigured;
    // 404 = static hosting (Render). Both fall back to bring-your-own-key.
    return res.status === 401 || res.status === 204 ? "password-mode" : "byo-mode";
  } catch {
    return "byo-mode";
  }
}

export async function verifyChatPassword(
  password: string,
  fetchImpl: typeof fetch = fetch
): Promise<boolean> {
  try {
    const res = await fetchImpl(CHECK_PATH, { headers: { "x-foray-password": password } });
    return res.status === 204;
  } catch {
    return false;
  }
}

export function loadChatPassword(): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(PW_KEY);
  } catch {
    return null;
  }
}

export function saveChatPassword(password: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(PW_KEY, password);
  } catch {}
}

export function clearChatPassword(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(PW_KEY);
  } catch {}
}
