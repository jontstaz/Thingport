import { IMPORT_BROWSER_USER_AGENT, IMPORT_TIMEOUT_SECONDS } from "../config";
import { HttpError } from "../utils/fileUtils";
import { looksLikeCloudflareBlock } from "./flaresolverr";
import { type ImportedAuthorInfo, type ImportedPageMetadata } from "./importResolvers";

// https://cults3d.com/graphql, HTTP Basic auth with "apiUser:apiKey". There is no api.cults3d.com
// host. The API exposes rich metadata but no download links: blueprints.fileUrl is populated only
// on the API account's OWN designs, and even the downloadUrl on ordersBatch lines is documented by
// the Cults team (#api-help) as needing a logged-in browser cookie. So downloads go through the
// site's /download/blueprint/{id} endpoint with the user's session cookie -- the Basic pair no
// longer authorizes it (an anonymous/API-key request is redirected to the sign-in or product page).
const CULTS3D_GRAPHQL_URL = "https://cults3d.com/graphql";
const API_TIMEOUT_MS = IMPORT_TIMEOUT_SECONDS * 1000;
const CULTS3D_PROVIDER = "cults3d";

/** Creations listings are paginated with limit/offset; 50 matches the other providers. */
const CREATIONS_PAGE_SIZE = 50;
/** Hard cap so a pathological listing can't create an unbounded loop. */
const CREATIONS_MAX_PAGES = 40;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Model URLs are slug-keyed with a category segment: /en/3d-model/home/vintage-desk-set-….
 * The category isn't part of the model's identity -- only the trailing slug is. */
export function parseCults3dModelUrl(url: string): { modelId: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (host !== "cults3d.com" && host !== "www.cults3d.com") return null;
  // The path segment is localized: /en/3d-model/, /fr/modèle-3d/ (URL-encoded).
  const segment = decodeURIComponent(parsed.pathname);
  const m = segment.match(/\/(?:[a-z]{2}(?:-[a-z]{2})?)\/(?:3d-model|mod(?:è|e)?le-3d)\/([^/]+\/)?([^/]+)/i);
  if (!m) return null;
  const slug = (m[2] || "").trim();
  return slug ? { modelId: slug } : null;
}

/** Creator creations pages: /en/users/{nick}/creations (the /creators/{nick} alias redirects
 * there on the site). */
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
    super("Cults3D rate-limited this request. Wait a bit, then retry the same import.");
    this.name = "Cults3dRateLimitError";
  }
}

async function fetchCults3dGraphql(query: string, variables: Record<string, unknown>): Promise<unknown | null> {
  const { apiKey, apiUser } = await getCults3dCredentialsForRequest();
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
        Authorization: `Basic ${Buffer.from(`${apiUser}:${apiKey}`).toString("base64")}`,
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }

  if (res.status === 401 || res.status === 403) {
    // Cloudflare fronts this endpoint; its block page also 403s. Only a JSON error is a real
    // credentials rejection -- otherwise surface a distinct rate-limit/block signal.
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) throw new Cults3dAuthError();
    throw new Cults3dRateLimitError();
  }
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

// Late import to avoid a settingsService -> fileUtils -> settingsService cycle concern; it's fine
// as a value import but keeps this module's dependency surface explicit.
import { getCults3dCredentialsForRequest } from "./settingsService";

function firstGraphqlError(response: unknown): string | null {
  if (isRecord(response) && Array.isArray(response.errors) && response.errors.length) {
    const first = response.errors[0];
    return isRecord(first) && typeof first.message === "string" ? first.message : String(first);
  }
  return null;
}

// Field names verified by live introspection. Parsing stays defensive so an added or renamed
// field degrades gracefully instead of breaking imports.
const MODEL_QUERY = `
  query ($slug: String!) {
    creation(slug: $slug) {
      name
      description
      publishedAt
      illustrationImageUrl
      tags
      metaTags { name }
      category { name slug }
      creator { nick url imageUrl bio }
      illustrations { imageUrl position }
      blueprints { id fileName fileExtension }
      openPriced
      price { cents currency }
    }
  }
`;

const USER_QUERY = `
  query ($nick: String!, $offset: Int!, $limit: Int!) {
    user(nick: $nick) {
      nick
      imageUrl
      bio
      url
      creationsCount
      creations(offset: $offset, limit: $limit) {
        name
        slug
        illustrationImageUrl
      }
    }
  }
`;

export type Cults3dGalleryImage = { url: string; filename: string };
export type Cults3dDownloadFile = { id: string; numericId: string; name: string; url: string };

export type Cults3dModelData = {
  meta: Partial<ImportedPageMetadata>;
  downloadUrls: Cults3dDownloadFile[];
  galleryImages: Cults3dGalleryImage[];
  /** True when the design has a nonzero fixed price (open-priced "name your price" stays false):
   *  its files then exist only for buyers, so a failed download means "not purchased", not an
   *  error -- the import can proceed as a metadata-only wishlist print. */
  priced: boolean;
};

function extractAuthor(creator: unknown): ImportedAuthorInfo | null {
  if (!isRecord(creator)) return null;
  const nick = typeof creator.nick === "string" && creator.nick.trim() ? creator.nick.trim() : null;
  if (!nick) return null;
  return {
    provider: CULTS3D_PROVIDER,
    // The API keys creations by slug, and users by nick; nick is the stable creator id here.
    externalId: nick,
    name: nick,
    handle: nick,
    bio: typeof creator.bio === "string" && creator.bio.trim() ? creator.bio.trim() : null,
    bioTranslated: null,
    links: typeof creator.url === "string" && creator.url.trim() ? [creator.url.trim()] : [],
    avatarUrl: typeof creator.imageUrl === "string" && creator.imageUrl.trim() ? creator.imageUrl.trim() : null,
    backgroundUrl: null,
  };
}

/** Blueprint ids are base64 of "Blueprint/15724956"; the site's download endpoint takes the
 * numeric half. */
function blueprintNumericId(id: unknown): string | null {
  if (typeof id !== "string" || !id.trim()) return null;
  try {
    const decoded = Buffer.from(id, "base64").toString("utf8");
    const m = decoded.match(/(\d+)$/);
    if (m) return m[1];
  } catch {
    // fall through
  }
  return null;
}

export async function resolveCults3dModel(slug: string): Promise<Cults3dModelData | null> {
  const response = await fetchCults3dGraphql(MODEL_QUERY, { slug });

  const apiError = firstGraphqlError(response);
  if (apiError?.toLowerCase().includes("not found")) return null;

  if (!isRecord(response) || !isRecord(response.data)) {
    if (apiError) throw new HttpError(502, `Cults3D API: ${apiError}`);
    return null;
  }
  const creation = response.data.creation;
  if (!isRecord(creation)) return null;

  const meta: Partial<ImportedPageMetadata> = {
    title: typeof creation.name === "string" ? creation.name : null,
  };
  // Descriptions arrive as plain text with light markdown formatting; use them verbatim.
  if (typeof creation.description === "string" && creation.description.trim()) {
    meta.description = creation.description.trim();
  }

  const author = extractAuthor(creation.creator);
  if (author) {
    meta.author = author;
    meta.creator = author.name;
  }

  const tags: string[] = [];
  if (Array.isArray(creation.tags)) {
    for (const tag of creation.tags) {
      if (typeof tag === "string" && tag.trim()) tags.push(tag.trim());
    }
  }
  if (Array.isArray(creation.metaTags)) {
    for (const tag of creation.metaTags) {
      if (isRecord(tag) && typeof tag.name === "string" && tag.name.trim()) tags.push(tag.name.trim());
    }
  }
  if (tags.length) meta.tags = tags;

  const galleryImages: Cults3dGalleryImage[] = [];
  if (Array.isArray(creation.illustrations)) {
    const ranked = creation.illustrations
      .map((img, idx) => ({
        url: isRecord(img) && typeof img.imageUrl === "string" && img.imageUrl.trim() ? img.imageUrl.trim() : null,
        position: isRecord(img) && typeof img.position === "number" ? img.position : idx,
      }))
      .filter((img): img is { url: string; position: number } => Boolean(img.url))
      .toSorted((a, b) => a.position - b.position);
    ranked.forEach((img, idx) => galleryImages.push({ filename: `image-${idx}`, url: img.url }));
  }
  if (!galleryImages.length && typeof creation.illustrationImageUrl === "string") {
    galleryImages.push({ filename: "image-0", url: creation.illustrationImageUrl });
  }
  if (galleryImages.length) meta.previewImageUrl = galleryImages[0].url;
  meta.galleryImages = galleryImages;

  // No download links come from the API (fileUrl is null on other people's designs); the site's
  // download endpoint takes the numeric blueprint id and checks the user's session cookie.
  const priceCents =
    isRecord(creation.price) && typeof creation.price.cents === "number" ? creation.price.cents : 0;
  const priced = priceCents > 0 && creation.openPriced !== true;
  const downloadUrls: Cults3dDownloadFile[] = [];
  if (Array.isArray(creation.blueprints)) {
    for (const bp of creation.blueprints) {
      if (!isRecord(bp)) continue;
      const numericId = blueprintNumericId(bp.id);
      if (!numericId) continue;
      const ext =
        typeof bp.fileExtension === "string" && bp.fileExtension.trim()
          ? `.${bp.fileExtension.trim().toLowerCase().replace(/^\./, "")}`
          : "";
      const name =
        typeof bp.fileName === "string" && bp.fileName.trim()
          ? bp.fileName.trim()
          : `cults3d-${slug}-${numericId}${ext}`;
      downloadUrls.push({
        id: String(bp.id),
        numericId,
        name,
        url: `https://cults3d.com/download/blueprint/${numericId}`,
      });
    }
  }

  return { meta, downloadUrls, galleryImages, priced };
}

/** Accepts a bare `_session_id` value or a full Cookie header; the download endpoint only needs
 *  the session cookie. */
export function normalizeCults3dCookie(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.includes("=") ? trimmed : `_session_id=${trimmed}`;
}

export type Cults3dCookieCheck =
  | { result: "valid" }
  | { result: "invalid" }
  | { result: "unverifiable"; reason: "network" | "cloudflare" };

/** Checks a session cookie against a logged-in-only page: anonymous visitors are redirected to
 *  /users/sign_in, so a redirect there means the cookie is no good. */
export async function verifyCults3dCookie(cookie: string): Promise<Cults3dCookieCheck> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch("https://cults3d.com/en/orders", {
      headers: {
        "User-Agent": IMPORT_BROWSER_USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        Cookie: normalizeCults3dCookie(cookie),
      },
      redirect: "manual",
      signal: controller.signal,
    });
  } catch {
    return { result: "unverifiable", reason: "network" };
  } finally {
    clearTimeout(timeout);
  }

  try {
    if (res.status === 403 && looksLikeCloudflareBlock(res.headers)) {
      return { result: "unverifiable", reason: "cloudflare" };
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location") || "";
      return /\/users\/sign_in/i.test(location) ? { result: "invalid" } : { result: "valid" };
    }
    if (!res.ok) return { result: "unverifiable", reason: "network" };
    // A 200 that still renders the sign-in form means the cookie wasn't accepted.
    const text = (await res.text()).slice(0, 200_000);
    return /\/users\/sign_in/i.test(text) ? { result: "invalid" } : { result: "valid" };
  } catch {
    return { result: "unverifiable", reason: "network" };
  } finally {
    await res.body?.cancel().catch(() => undefined);
  }
}

export type Cults3dUserEntry = { modelId: string; title: string; cover: string | null };

export type Cults3dUserListing = {
  username: string;
  title: string;
  entries: Cults3dUserEntry[];
  total: number;
  truncated: boolean;
};

/** Lists a creator's creations, following limit/offset pagination up to CREATIONS_MAX_PAGES. */
export async function fetchCults3dUserCreations(username: string): Promise<Cults3dUserListing | null> {
  const entries: Cults3dUserEntry[] = [];
  let totalCount = 0;
  let resolvedUsername = username;

  for (let page = 0; page < CREATIONS_MAX_PAGES; page++) {
    const response = await fetchCults3dGraphql(USER_QUERY, {
      nick: username,
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

    if (typeof user.nick === "string" && user.nick.trim()) resolvedUsername = user.nick.trim();
    if (typeof user.creationsCount === "number") totalCount = user.creationsCount;

    const creations = user.creations;
    if (isRecord(creations) && Array.isArray(creations.results)) {
      for (const product of creations.results) {
        if (!isRecord(product) || typeof product.slug !== "string" || !product.slug.trim()) continue;
        entries.push({
          modelId: product.slug.trim(),
          title:
            typeof product.name === "string" && product.name.trim() ? product.name.trim() : product.slug.trim(),
          cover:
            typeof product.illustrationImageUrl === "string" && product.illustrationImageUrl.trim()
              ? product.illustrationImageUrl.trim()
              : null,
        });
      }
    }
    // User.creations is a plain list (not a connection): stop when a short page comes back.
    if (!Array.isArray(creations) || (creations as unknown[]).length < CREATIONS_PAGE_SIZE) break;
    if (totalCount && entries.length >= totalCount) break;
  }

  return buildListing();

  function buildListing(): Cults3dUserListing {
    return {
      username: resolvedUsername,
      title: `${resolvedUsername}'s creations`,
      entries,
      total: totalCount || entries.length,
      truncated: totalCount > entries.length,
    };
  }
}
