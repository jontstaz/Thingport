import { IMPORT_BROWSER_USER_AGENT, IMPORT_TIMEOUT_SECONDS } from "../config";
import { HttpError } from "../utils/fileUtils";
import { type ImportedAuthorInfo, type ImportedPageMetadata } from "./importResolvers";
import { htmlToMarkdown } from "./descriptionMarkdown";
import { getCults3dApiKey, getCults3dApiUser } from "./settingsService";

// Official API: https://cults3d.com/en/developers -- GraphQL, authenticated per request with an
// API key + API user pair. Unlike Printables, requests are NOT anonymous.
const CULTS3D_GRAPHQL_URL = "https://api.cults3d.com/graphql";
const CULTS3D_MEDIA_BASE = "https://cdn.cults3d.com/";
const API_TIMEOUT_MS = IMPORT_TIMEOUT_SECONDS * 1000;
const CULTS3D_PROVIDER = "cults3d";

/** Creations listings are paginated; 50 is a sane page size that matches the other providers. */
const CREATIONS_PAGE_SIZE = 50;
/** Hard cap so a pathological listing can't create an unbounded loop. */
const CREATIONS_MAX_PAGES = 40;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function cults3dMediaUrl(filePath: unknown): string | null {
  if (typeof filePath !== "string" || !filePath.trim()) return null;
  const value = filePath.trim();
  return /^https?:\/\//i.test(value) ? value : `${CULTS3D_MEDIA_BASE}${value.replace(/^\//, "")}`;
}

/** The site is localized (/en/, /fr/, ...) but model ids are language-independent. */
export function parseCults3dModelUrl(url: string): { modelId: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (host !== "cults3d.com" && host !== "www.cults3d.com") return null;
  // The path segment itself is localized too: /en/3d-model/, /fr/modèle-3d/ (URL-encoded).
  const segment = decodeURIComponent(parsed.pathname);
  const m = segment.match(/\/(?:[a-z]{2}(?:-[a-z]{2})?)\/(?:3d-model|mod(?:è|e)?le-3d)\/(\d+)/i);
  return m ? { modelId: m[1] } : null;
}

/** Creator creations pages: /en/users/{username}/creations (the /creators/{username} alias also
 * redirects there on the site). */
export function parseCults3dUserCreationsUrl(url: string): { username: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (host !== "cults3d.com" && host !== "www.cults3d.com") return null;
  const m =
    parsed.pathname.match(/\/(?:[a-z]{2}(?:-[a-z]{2})?)\/users\/([^/?#]+)\/creations/i) ||
    parsed.pathname.match(/\/creators\/([^/?#]+)/i);
  return m ? { username: decodeURIComponent(m[1]) } : null;
}

export class Cults3dAuthError extends Error {
  constructor() {
    super(
      "The Cults3D API credentials configured for this instance were rejected. Ask an admin to " +
        "update them in Admin Settings (a pair can be generated at cults3d.com/en/developers).",
    );
    this.name = "Cults3dAuthError";
  }
}

export class Cults3dRateLimitError extends Error {
  constructor() {
    super(
      "Cults3D rate-limited this request. Wait a bit, then retry the same import.",
    );
    this.name = "Cults3dRateLimitError";
  }
}

async function fetchCults3dGraphql(query: string, variables: Record<string, unknown>): Promise<unknown | null> {
  const apiKey = await getCults3dApiKey();
  const apiUser = await getCults3dApiUser();
  if (!apiKey || !apiUser) {
    throw new Cults3dAuthError();
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(CULTS3D_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "User-Agent": IMPORT_BROWSER_USER_AGENT,
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-Api-User": apiUser,
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }

  if (res.status === 401 || res.status === 403) throw new Cults3dAuthError();
  if (res.status === 429) throw new Cults3dRateLimitError();

  const text = await res.text();
  if (!res.ok) {
    // Surface the API's own message so schema drift is diagnosable instead of a silent null.
    throw new HttpError(502, `Cults3D API error (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function firstGraphqlError(response: unknown): string | null {
  if (isRecord(response) && Array.isArray(response.errors) && response.errors.length) {
    const first = response.errors[0];
    return isRecord(first) && typeof first.message === "string" ? first.message : String(first);
  }
  return null;
}

// Field names follow the documented public schema; parsing is defensive everywhere so an added
// or renamed field degrades gracefully instead of breaking imports.
const MODEL_QUERY = `
  query ($id: ID!) {
    product(id: $id) {
      id
      name
      description
      createdAt
      creator {
        id
        username
        profileImage
      }
      images {
        path
        rank
      }
      files {
        id
        name
        formatType
        url
      }
      tags {
        name
      }
    }
  }
`;

const USER_QUERY = `
  query ($username: String!, $offset: Int!, $limit: Int!) {
    user(username: $username) {
      id
      username
      profileImage
      creations(offset: $offset, limit: $limit) {
        totalCount
        products {
          id
          name
          images {
            path
            rank
          }
        }
      }
    }
  }
`;

export type Cults3dGalleryImage = { url: string; filename: string };
export type Cults3dDownloadFile = { id: string; name: string; url: string };

export type Cults3dModelData = {
  meta: Partial<ImportedPageMetadata>;
  downloadUrls: Cults3dDownloadFile[];
  galleryImages: Cults3dGalleryImage[];
};

function extractAuthor(creator: unknown): ImportedAuthorInfo | null {
  if (!isRecord(creator)) return null;
  const username = typeof creator.username === "string" && creator.username.trim() ? creator.username.trim() : null;
  if (!username) return null;
  return {
    provider: CULTS3D_PROVIDER,
    externalId: creator.id != null ? String(creator.id) : "",
    name: username,
    handle: username,
    bio: null,
    bioTranslated: null,
    links: [],
    avatarUrl: cults3dMediaUrl(creator.profileImage),
    backgroundUrl: null,
  };
}

export async function resolveCults3dModel(modelId: string): Promise<Cults3dModelData | null> {
  const response = await fetchCults3dGraphql(MODEL_QUERY, { id: modelId });

  const apiError = firstGraphqlError(response);
  if (apiError?.toLowerCase().includes("not found")) return null;

  if (!isRecord(response) || !isRecord(response.data)) {
    if (apiError) throw new HttpError(502, `Cults3D API: ${apiError}`);
    return null;
  }
  const product = response.data.product;
  if (!isRecord(product)) return null;

  const meta: Partial<ImportedPageMetadata> = {
    title: typeof product.name === "string" ? product.name : null,
  };
  if (typeof product.description === "string" && product.description.trim()) {
    meta.description = htmlToMarkdown(product.description);
  }
  if (typeof product.createdAt === "string") {
    // Uploaded-at isn't in ImportedPageMetadata; nothing consumes it downstream, so skip.
  }

  const author = extractAuthor(product.creator);
  if (author) {
    meta.author = author;
    meta.creator = author.name;
  }

  if (Array.isArray(product.tags)) {
    const tags = product.tags
      .map((t) => (isRecord(t) && typeof t.name === "string" ? t.name.trim() : null))
      .filter((t): t is string => Boolean(t));
    if (tags.length) meta.tags = tags;
  }

  const galleryImages: Cults3dGalleryImage[] = [];  if (Array.isArray(product.images)) {
    const ranked = product.images
      .map((img, idx) => ({
        url: isRecord(img) ? cults3dMediaUrl(img.path) : null,
        rank: isRecord(img) && typeof img.rank === "number" ? img.rank : idx,
      }))
      .filter((img): img is { url: string; rank: number } => Boolean(img.url))
      .toSorted((a, b) => a.rank - b.rank);
    ranked.forEach((img, idx) =>
      galleryImages.push({ filename: `image-${idx}.jpg`, url: img.url }),
    );
  }
  if (galleryImages.length) meta.previewImageUrl = galleryImages[0].url;
  meta.galleryImages = galleryImages;

  // Cults3D only exposes download URLs through the API for content the API user can download.
  // Files without a URL are skipped; if none carry one, the import fails with a clear message.
  const downloadUrls: Cults3dDownloadFile[] = [];
  if (Array.isArray(product.files)) {
    for (const file of product.files) {
      if (!isRecord(file)) continue;
      const url = typeof file.url === "string" && file.url.trim() ? file.url.trim() : null;
      const id = file.id != null ? String(file.id) : null;
      if (!url || !id) continue;
      const name =
        typeof file.name === "string" && file.name.trim()
          ? file.name.trim()
          : `cults3d-${modelId}-${id}${typeof file.formatType === "string" ? `.${file.formatType.toLowerCase()}` : ""}`;
      downloadUrls.push({ id, name, url });
    }
  }

  return { meta, downloadUrls, galleryImages };
}

export type Cults3dUserEntry = { modelId: string; title: string; cover: string | null };

export type Cults3dUserListing = {
  userId: string | null;
  username: string;
  title: string;
  entries: Cults3dUserEntry[];
  total: number;
  truncated: boolean;
};

/** Lists a creator's creations, following pagination up to CREATIONS_MAX_PAGES. */
export async function fetchCults3dUserCreations(username: string): Promise<Cults3dUserListing | null> {
  const entries: Cults3dUserEntry[] = [];
  let totalCount = 0;
  let userId: string | null = null;
  let resolvedUsername = username;

  for (let page = 0; page < CREATIONS_MAX_PAGES; page++) {
    const response = await fetchCults3dGraphql(USER_QUERY, {
      username,
      offset: page * CREATIONS_PAGE_SIZE,
      limit: CREATIONS_PAGE_SIZE,
    });
    if (!isRecord(response) || !isRecord(response.data)) {
      const apiError = firstGraphqlError(response);
      if (apiError) throw new HttpError(502, `Cults3D API: ${apiError}`);
      return entries.length ? buildListing() : null;
    }
    const user = response.data.user;
    if (!isRecord(user)) return entries.length ? buildListing() : null;

    if (user.id != null) userId = String(user.id);
    if (typeof user.username === "string" && user.username.trim()) resolvedUsername = user.username.trim();

    const creations = user.creations;
    if (isRecord(creations)) {
      if (typeof creations.totalCount === "number") totalCount = creations.totalCount;
      if (Array.isArray(creations.products)) {
        for (const product of creations.products) {
          if (!isRecord(product) || product.id == null) continue;
          let cover: string | null = null;
          if (Array.isArray(product.images)) {
            const best = product.images
              .map((img, idx) => ({
                url: isRecord(img) ? cults3dMediaUrl(img.path) : null,
                rank: isRecord(img) && typeof img.rank === "number" ? img.rank : idx,
              }))
              .filter((img): img is { url: string; rank: number } => Boolean(img.url))
              .toSorted((a, b) => a.rank - b.rank)[0];
            cover = best?.url ?? null;
          }
          entries.push({
            modelId: String(product.id),
            title: typeof product.name === "string" && product.name.trim() ? product.name.trim() : `Model ${product.id}`,
            cover,
          });
        }
      }
    }

    if (entries.length >= CREATIONS_PAGE_SIZE * (page + 1) && entries.length < totalCount && (page + 1) * CREATIONS_PAGE_SIZE === entries.length) {
      continue;
    }
    break;
  }

  return buildListing();

  function buildListing(): Cults3dUserListing {
    return {
      userId,
      username: resolvedUsername,
      title: `${resolvedUsername}'s creations`,
      entries,
      total: totalCount || entries.length,
      truncated: totalCount > entries.length,
    };
  }
}
