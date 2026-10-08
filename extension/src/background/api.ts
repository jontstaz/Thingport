// Every fetch to the Thingport instance goes through here, so auth (including silent re-login) and
// the instance URL live in one place. The host permission granted at setup bypasses CORS.

import type { LoginResult } from "../shared/api";
import { apiUrl } from "../shared/storage";
import { isCults3dUrl, isMakerworldUrl } from "../shared/urls";
import { getStoredConfig, isConfigured, type ConfiguredConfig } from "./config";
import { getLiveMakerworldCookie, maybeSyncMakerworldCookie } from "./makerworldCookie";
import { getLiveCults3dCookie, maybeSyncCults3dCookie } from "./cults3dCookie";

const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

// The instance never asks the extension for a captcha (see captchaService.ts).
const CLIENT_HEADERS = { "X-Thingport-Client": "grab" };

type Credentials = Pick<ConfiguredConfig, "instanceUrl" | "email" | "password">;

async function errorDetail(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: string } | null;
    if (body && body.detail) return body.detail;
  } catch {}
  return fallback;
}

/** Also called once on a 401, so a password change doesn't require reopening the popup. */
export async function loginAndStoreToken(credentials: Credentials): Promise<string> {
  const res = await fetch(apiUrl(credentials.instanceUrl, "/login"), {
    method: "POST",
    headers: { ...CLIENT_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ email: credentials.email, password: credentials.password }),
  });
  if (!res.ok) throw new Error(await errorDetail(res, "Could not sign in to this Thingport instance"));
  const data = (await res.json()) as LoginResult;
  const tokenExpiresAt = Date.now() + data.expires_in * 1000;
  await chrome.storage.local.set({ token: data.token, tokenExpiresAt, isAdmin: data.user?.role === "ADMIN" });
  return data.token;
}

export async function ensureToken(config: ConfiguredConfig, { forceRefresh = false } = {}): Promise<string> {
  if (
    !forceRefresh &&
    config.token &&
    config.tokenExpiresAt &&
    config.tokenExpiresAt - Date.now() > TOKEN_REFRESH_MARGIN_MS
  ) {
    return config.token;
  }
  return loginAndStoreToken(config);
}

export async function requireConfig(): Promise<ConfiguredConfig> {
  const config = await getStoredConfig();
  if (!isConfigured(config)) throw new Error("Thingport Grab isn't configured yet -- open the extension popup first.");
  if (config.disabled) throw new Error("Thingport Grab is disabled -- re-enable it from the extension popup.");
  return config;
}

/** `path` is after `/api`. Provider `/import*` calls get the matching live browser cookie attached
 *  unless the caller set one. */
export async function apiCall<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const config = await requireConfig();

  let finalBody = body as Record<string, unknown> | undefined;
  if (
    path.startsWith("/import") &&
    finalBody &&
    !finalBody.makerworld_cookie &&
    isMakerworldUrl(finalBody.url as string)
  ) {
    const liveCookie = await getLiveMakerworldCookie();
    if (liveCookie) {
      finalBody = { ...finalBody, makerworld_cookie: liveCookie };
      void maybeSyncMakerworldCookie(config, liveCookie);
    }
  }
  // Cults3D downloads authorize the site session, not the API key, so the live cookie is what
  // makes an import downloadable at all.
  if (
    path.startsWith("/import") &&
    finalBody &&
    !finalBody.cults3d_cookie &&
    isCults3dUrl(finalBody.url as string)
  ) {
    const liveCookie = await getLiveCults3dCookie();
    if (liveCookie) {
      finalBody = { ...finalBody, cults3d_cookie: liveCookie };
      void maybeSyncCults3dCookie(config, liveCookie);
    }
  }

  const doFetch = (token: string) =>
    fetch(apiUrl(config.instanceUrl, path), {
      method,
      headers: {
        ...CLIENT_HEADERS,
        Authorization: `Bearer ${token}`,
        ...(finalBody ? { "Content-Type": "application/json" } : {}),
      },
      body: finalBody ? JSON.stringify(finalBody) : undefined,
    });

  let res = await doFetch(await ensureToken(config));
  if (res.status === 401) res = await doFetch(await ensureToken(config, { forceRefresh: true }));
  if (!res.ok) throw new Error(await errorDetail(res, `Request failed (${res.status})`));
  if (res.status === 204) return null as T;
  return (await res.json()) as T;
}

export async function apiFetchBlob(config: ConfiguredConfig, path: string): Promise<Blob | null> {
  const res = await fetch(apiUrl(config.instanceUrl, path), {
    headers: { ...CLIENT_HEADERS, Authorization: `Bearer ${await ensureToken(config)}` },
  });
  return res.ok ? res.blob() : null;
}
