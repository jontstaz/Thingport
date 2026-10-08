/** URL-shape detection shared by useUploadImport and AddMenu so they can't drift apart. */

export type ImportProviderKey = "makerworld" | "thingiverse" | "printables" | "cults3d";

function parseUrl(url: string): URL | null {
  try {
    return new URL(url.includes("://") ? url : `https://${url}`);
  } catch {
    return null;
  }
}

export function detectImportProvider(url: string): ImportProviderKey | null {
  const parsed = parseUrl(url);
  if (!parsed) return null;
  const host = parsed.hostname.toLowerCase();
  if (host.endsWith("makerworld.com")) return "makerworld";
  if (host === "thingiverse.com" || host === "www.thingiverse.com") return "thingiverse";
  if (host === "printables.com" || host === "www.printables.com") return "printables";
  if (host === "cults3d.com" || host === "www.cults3d.com") return "cults3d";
  return null;
}

/** Collection pages go to the collection picker instead of the single-link flow. */
export function isMakerworldCollectionUrl(url: string): boolean {
  const parsed = parseUrl(url);
  return Boolean(
    parsed && parsed.hostname.toLowerCase().endsWith("makerworld.com") && /\/collections\/\d+/i.test(parsed.pathname),
  );
}

export function isMakerworldModelUrl(url: string): boolean {
  const parsed = parseUrl(url);
  return Boolean(
    parsed && parsed.hostname.toLowerCase().endsWith("makerworld.com") && /\/models?\/\d+/i.test(parsed.pathname),
  );
}

/** Thingiverse and Printables have their own backend import paths, so skip the generic inspect/zip
 * flow for them. */
export function isThingiverseThingUrl(url: string): boolean {
  const parsed = parseUrl(url);
  if (!parsed) return false;
  const host = parsed.hostname.toLowerCase();
  if (host !== "thingiverse.com" && host !== "www.thingiverse.com") return false;
  return /thing:\d+/i.test(parsed.pathname) || /\/things\/\d+/i.test(parsed.pathname);
}

export function isThingiverseLikesUrl(url: string): boolean {
  const parsed = parseUrl(url);
  if (!parsed) return false;
  const host = parsed.hostname.toLowerCase();
  if (host !== "thingiverse.com" && host !== "www.thingiverse.com") return false;
  return /^\/[^/]+\/likes\/?$/i.test(parsed.pathname);
}

export function isThingiverseCollectionUrl(url: string): boolean {
  const parsed = parseUrl(url);
  if (!parsed) return false;
  const host = parsed.hostname.toLowerCase();
  if (host !== "thingiverse.com" && host !== "www.thingiverse.com") return false;
  return /\/collections\/\d+/i.test(parsed.pathname);
}

export function isPrintablesCollectionUrl(url: string): boolean {
  const parsed = parseUrl(url);
  if (!parsed) return false;
  const host = parsed.hostname.toLowerCase();
  if (host !== "printables.com" && host !== "www.printables.com") return false;
  return /\/collections\/\d+/i.test(parsed.pathname);
}

/** See isThingiverseThingUrl. */
export function isPrintablesModelUrl(url: string): boolean {
  const parsed = parseUrl(url);
  if (!parsed) return false;
  const host = parsed.hostname.toLowerCase();
  if (host !== "printables.com" && host !== "www.printables.com") return false;
  return /\/model\/\d+/i.test(parsed.pathname);
}

export function isCults3dModelUrl(url: string): boolean {
  const parsed = parseUrl(url);
  if (!parsed) return false;
  const host = parsed.hostname.toLowerCase();
  if (host !== "cults3d.com" && host !== "www.cults3d.com") return false;
  // Slug-keyed with an optional category segment: /en/3d-model/home/vintage-desk-set.
  const segment = decodeURIComponent(parsed.pathname);
  return /\/(?:[a-z]{2}(?:-[a-z]{2})?)\/(?:3d-model|mod(?:è|e)?le-3d)\/([^/]+\/)?[^/]+/i.test(segment);
}

export function isCults3dCreationsUrl(url: string): boolean {
  const parsed = parseUrl(url);
  if (!parsed) return false;
  const host = parsed.hostname.toLowerCase();
  if (host !== "cults3d.com" && host !== "www.cults3d.com") return false;
  return /\/users\/[^/]+\/creations/i.test(parsed.pathname) || /\/creators\/[^/]+/i.test(parsed.pathname);
}

export const IMPORT_LINK_EXAMPLES: Record<ImportProviderKey, { model: string; collection: string }> = {
  makerworld: {
    model: "https://makerworld.com/en/models/123456-example-model",
    collection: "https://makerworld.com/en/collections/12345-example-collection",
  },
  thingiverse: {
    model: "https://www.thingiverse.com/thing:1234567",
    collection: "https://www.thingiverse.com/username/collections/12345-example-collection",
  },
  printables: {
    model: "https://www.printables.com/model/123456-example-model",
    collection: "https://www.printables.com/@username/collections/12345-example-collection",
  },
  cults3d: {
    model: "https://cults3d.com/en/3d-model/home/example-model",
    collection: "https://cults3d.com/en/users/username/creations",
  },
};
