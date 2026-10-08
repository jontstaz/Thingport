import type { ConfiguredConfig } from "./config";
import { apiCall } from "./api";

/** The session cookie is HttpOnly, so pages can't read it but chrome.cookies can. Null (never
 *  throws) when the user isn't logged in or access is blocked. Cults3D file downloads authorize
 *  this site session -- the API key pair covers only the GraphQL metadata API. */
export async function getLiveCults3dCookie(): Promise<string | null> {
  try {
    const cookie = await chrome.cookies.get({ url: "https://cults3d.com", name: "_session_id" });
    if (!cookie) return null;
    // "_session_id=<value>": the backend accepts a bare value too, but the header form is exact.
    return `_session_id=${cookie.value}`;
  } catch {
    return null;
  }
}

/** Best-effort: keeps the stored cookie in sync so the web app's imports benefit too. Never
 *  affects the triggering import. */
export async function maybeSyncCults3dCookie(config: ConfiguredConfig, cookieValue: string): Promise<void> {
  if (config.lastSyncedCults3dCookie === cookieValue) return;
  try {
    await apiCall("PATCH", "/settings/cults3d-cookie", { cookie: cookieValue });
    await chrome.storage.local.set({ lastSyncedCults3dCookie: cookieValue });
  } catch {}
}
