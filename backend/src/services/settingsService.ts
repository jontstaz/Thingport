import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { HttpError } from "../utils/fileUtils";

async function getBoolSetting(key: string, fallback: boolean): Promise<boolean> {
  const row = await prisma.setting.findUnique({ where: { key } });
  if (row === null || row === undefined) return fallback;
  return typeof row.value === "boolean" ? row.value : fallback;
}

async function setBoolSetting(key: string, value: boolean): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export type CaptchaPlace = "login" | "register" | "import" | "change_password" | "change_email";
export type CaptchaSettings = Record<CaptchaPlace, boolean>;
export const CAPTCHA_PLACES: readonly CaptchaPlace[] = [
  "login",
  "register",
  "import",
  "change_password",
  "change_email",
];
const captchaKey = (place: CaptchaPlace) => `captcha_${place}`;

export async function getCaptchaSettings(): Promise<CaptchaSettings> {
  const values = await Promise.all(CAPTCHA_PLACES.map((place) => getBoolSetting(captchaKey(place), false)));
  return Object.fromEntries(CAPTCHA_PLACES.map((place, i) => [place, values[i]])) as CaptchaSettings;
}

export async function isCaptchaEnabled(place: CaptchaPlace): Promise<boolean> {
  return getBoolSetting(captchaKey(place), false);
}

export async function setCaptchaSettings(patch: Partial<CaptchaSettings>): Promise<CaptchaSettings> {
  for (const place of CAPTCHA_PLACES) {
    if (patch[place] !== undefined) await setBoolSetting(captchaKey(place), patch[place]);
  }
  return getCaptchaSettings();
}

const ALLOW_REGISTRATIONS_KEY = "allow_registrations";

export async function getAllowRegistrations(fallback: boolean): Promise<boolean> {
  return getBoolSetting(ALLOW_REGISTRATIONS_KEY, fallback);
}

export async function setAllowRegistrations(value: boolean): Promise<void> {
  await setBoolSetting(ALLOW_REGISTRATIONS_KEY, value);
}

const SIMPLIFY_PREVIEWS_KEY = "simplify_previews";

export async function getSimplifyPreviews(): Promise<boolean> {
  return getBoolSetting(SIMPLIFY_PREVIEWS_KEY, false);
}

export async function setSimplifyPreviews(value: boolean): Promise<void> {
  await setBoolSetting(SIMPLIFY_PREVIEWS_KEY, value);
}

export type PreviewMode = "automatic" | "on-demand" | "disabled";
const PREVIEW_MODES = new Set<PreviewMode>(["automatic", "on-demand", "disabled"]);
const PREVIEW_MODE_KEY = "preview_mode";
const DEFAULT_PREVIEW_MODE: PreviewMode = "automatic";

// Instance-wide: every user's previews share the same storage.
export async function getPreviewMode(): Promise<PreviewMode> {
  const row = await prisma.setting.findUnique({ where: { key: PREVIEW_MODE_KEY } });
  const value = row?.value;
  return typeof value === "string" && PREVIEW_MODES.has(value as PreviewMode)
    ? (value as PreviewMode)
    : DEFAULT_PREVIEW_MODE;
}

export async function setPreviewMode(value: PreviewMode): Promise<void> {
  await prisma.setting.upsert({
    where: { key: PREVIEW_MODE_KEY },
    create: { key: PREVIEW_MODE_KEY, value },
    update: { value },
  });
}

const THINGIVERSE_ACCESS_TOKEN_KEY = "thingiverse_access_token";

// Instance-wide: the token belongs to whichever Thingiverse account registered the app.
export async function getThingiverseAccessToken(): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key: THINGIVERSE_ACCESS_TOKEN_KEY } });
  const value = row?.value;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function setThingiverseAccessToken(value: string | null): Promise<void> {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    await prisma.setting.deleteMany({ where: { key: THINGIVERSE_ACCESS_TOKEN_KEY } });
    return;
  }
  await prisma.setting.upsert({
    where: { key: THINGIVERSE_ACCESS_TOKEN_KEY },
    create: { key: THINGIVERSE_ACCESS_TOKEN_KEY, value: trimmed },
    update: { value: trimmed },
  });
}

const CULTS3D_API_KEY_SETTING_KEY = "cults3d_api_key";
const CULTS3D_API_USER_SETTING_KEY = "cults3d_api_user";

export type Cults3dCredentials = { apiKey: string | null; apiUser: string | null };

/** Instance-wide: the key/user pair belongs to whichever Cults3D account generated it. */
export async function getCults3dCredentials(): Promise<Cults3dCredentials> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: [CULTS3D_API_KEY_SETTING_KEY, CULTS3D_API_USER_SETTING_KEY] } },
  });
  const value = (key: string): string | null => {
    const row = rows.find((r) => r.key === key);
    return typeof row?.value === "string" && row.value.trim() ? row.value.trim() : null;
  };
  return { apiKey: value(CULTS3D_API_KEY_SETTING_KEY), apiUser: value(CULTS3D_API_USER_SETTING_KEY) };
}

export async function getCults3dApiKey(): Promise<string | null> {
  return (await getCults3dCredentials()).apiKey;
}

export async function getCults3dApiUser(): Promise<string | null> {
  return (await getCults3dCredentials()).apiUser;
}

/** Auth pair for a GraphQL call; throws the same auth error the import paths use. */
export async function getCults3dCredentialsForRequest(): Promise<{ apiKey: string; apiUser: string }> {
  const { apiKey, apiUser } = await getCults3dCredentials();
  if (!apiKey || !apiUser) {
    const { Cults3dAuthError } = await import("./cults3dApi");
    throw new Cults3dAuthError();
  }
  return { apiKey, apiUser };
}

/** Both values must be set (or cleared) together -- the API checks the pair. */
export async function setCults3dCredentials(apiKey: string | null, apiUser: string | null): Promise<void> {
  const trimmedKey = (apiKey ?? "").trim();
  const trimmedUser = (apiUser ?? "").trim();
  if (trimmedKey !== "" && trimmedUser === "") {
    throw new HttpError(400, "Both the Cults3D API key and API user are required together.");
  }
  if (trimmedKey === "" || trimmedUser === "") {
    await prisma.setting.deleteMany({
      where: { key: { in: [CULTS3D_API_KEY_SETTING_KEY, CULTS3D_API_USER_SETTING_KEY] } },
    });
    return;
  }
  await Promise.all(
    [CULTS3D_API_KEY_SETTING_KEY, CULTS3D_API_USER_SETTING_KEY].map((key, i) =>
      prisma.setting.upsert({
 where: { key },
        create: { key, value: i === 0 ? trimmedKey : trimmedUser },
        update: { value: i === 0 ? trimmedKey : trimmedUser },
      }),
    ),
  );
}

/** Cheap liveness check for the settings form: a trivial query against the live API. Uses
 * HTTP Basic auth ("user:key") against cults3d.com/graphql, exactly like the import calls. */
export async function verifyCults3dCredentials(apiKey: string, apiUser: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let res: Response;
    try {
      res = await fetch("https://cults3d.com/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Basic ${Buffer.from(`${apiUser}:${apiKey}`).toString("base64")}`,
        },
        body: JSON.stringify({ query: "{ licenses { code } }" }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) return false;
    const body = (await res.json().catch(() => null)) as { errors?: unknown } | null;
    // A GraphQL auth failure comes back as HTTP 200 with an errors array; a query we're not
    // allowed to run means the credentials were still accepted.
    return !body?.errors;
  } catch {
    return false;
  }
}

export type SmtpSettings = {
  host: string | null;
  port: number;
  secure: boolean;
  user: string | null;
  pass: string | null;
  from: string;
};

const SMTP_SETTINGS_KEY = "smtp_settings";
const DEFAULT_SMTP_FROM = "Thingport <no-reply@localhost>";

function envInt(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Seeds from SMTP_* env vars until an admin saves settings; then the DB row wins.
function smtpSeedFromEnv(): SmtpSettings {
  return {
    host: (process.env.SMTP_HOST || "").trim() || null,
    port: envInt("SMTP_PORT", 587),
    secure: process.env.SMTP_SECURE === "true",
    user: (process.env.SMTP_USER || "").trim() || null,
    pass: (process.env.SMTP_PASS || "").trim() || null,
    from: (process.env.SMTP_FROM || "").trim() || DEFAULT_SMTP_FROM,
  };
}

export async function getSmtpSettings(): Promise<SmtpSettings> {
  const row = await prisma.setting.findUnique({ where: { key: SMTP_SETTINGS_KEY } });
  if (row && typeof row.value === "object" && row.value !== null && !Array.isArray(row.value)) {
    return { ...smtpSeedFromEnv(), ...(row.value as Partial<SmtpSettings>) };
  }
  return smtpSeedFromEnv();
}

export async function isSmtpConfigured(): Promise<boolean> {
  return Boolean((await getSmtpSettings()).host);
}

export async function setSmtpSettings(patch: Partial<SmtpSettings>): Promise<SmtpSettings> {
  const next = { ...(await getSmtpSettings()), ...patch };
  await prisma.setting.upsert({
    where: { key: SMTP_SETTINGS_KEY },
    create: { key: SMTP_SETTINGS_KEY, value: next as unknown as Prisma.InputJsonValue },
    update: { value: next as unknown as Prisma.InputJsonValue },
  });
  return next;
}

const AUTH_TOKEN_TTL_KEY = "auth_token_ttl_seconds";
const DEFAULT_AUTH_TOKEN_TTL_SECONDS = 43200;

// Seeds from AUTH_TOKEN_TTL until an admin saves a value. Only affects newly issued tokens.
export async function getAuthTokenTtl(): Promise<number> {
  const row = await prisma.setting.findUnique({ where: { key: AUTH_TOKEN_TTL_KEY } });
  const value = row?.value;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.trunc(value);
  return envInt("AUTH_TOKEN_TTL", DEFAULT_AUTH_TOKEN_TTL_SECONDS);
}

export async function setAuthTokenTtl(seconds: number): Promise<void> {
  await prisma.setting.upsert({
    where: { key: AUTH_TOKEN_TTL_KEY },
    create: { key: AUTH_TOKEN_TTL_KEY, value: seconds },
    update: { value: seconds },
  });
}
