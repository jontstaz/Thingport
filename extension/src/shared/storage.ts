// chrome.storage.local keys and their shapes. Nothing is synced across browsers.

export const STORAGE_KEYS = {
  instanceUrl: "instanceUrl",
  email: "email",
  password: "password",
  disabled: "disabled",
  // From the last login: admins get "Add to the queue" in the import panel.
  isAdmin: "isAdmin",
  token: "token",
  tokenExpiresAt: "tokenExpiresAt",
  // Lets the cookie sync skip a redundant PATCH.
  lastSyncedMakerworldCookie: "lastSyncedMakerworldCookie",
  lastSyncedCults3dCookie: "lastSyncedCults3dCookie",
} as const;

export type StoredConfig = {
  instanceUrl?: string;
  email?: string;
  password?: string;
  disabled?: boolean;
  isAdmin?: boolean;
  token?: string;
  tokenExpiresAt?: number;
  lastSyncedMakerworldCookie?: string;
  lastSyncedCults3dCookie?: string;
};

export const CONFIG_CHANGE_KEYS: readonly string[] = [
  STORAGE_KEYS.instanceUrl,
  STORAGE_KEYS.email,
  STORAGE_KEYS.password,
  STORAGE_KEYS.disabled,
  STORAGE_KEYS.isAdmin,
];

export function normalizeInstanceUrl(raw: string | undefined | null): string {
  return (raw || "").trim().replace(/\/+$/, "");
}

export function apiUrl(instanceUrl: string, path: string): string {
  return `${normalizeInstanceUrl(instanceUrl)}/api${path}`;
}
