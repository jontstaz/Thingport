// Provider URL recognition, duplicated from the frontend and backend parsers. Keep in sync by hand.

export type Provider = "makerworld" | "thingiverse" | "printables" | "cults3d";

export type Classification =
  | { kind: "single"; provider: "makerworld"; type: "model" }
  | { kind: "single"; provider: "thingiverse"; type: "thing" }
  | { kind: "single"; provider: "printables"; type: "model" }
  | { kind: "single"; provider: "cults3d"; type: "model" }
  | { kind: "batch"; provider: "makerworld"; type: "collection" }
  | { kind: "batch"; provider: "thingiverse"; type: "likes" | "collection" }
  | { kind: "batch"; provider: "printables"; type: "collection" }
  | { kind: "batch"; provider: "cults3d"; type: "creations" };

function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function isHost(parsed: URL, domain: string): boolean {
  const host = parsed.hostname.toLowerCase();
  return host === domain || host === `www.${domain}`;
}

export function parseMakerworldModelUrl(url: string): { designId: string; requestedInstanceId: string | null } | null {
  const parsed = parse(url);
  if (!parsed || !parsed.hostname.toLowerCase().endsWith("makerworld.com")) return null;
  const m = parsed.pathname.match(/\/models?\/(\d+)/i);
  if (!m) return null;
  const hashMatch = parsed.hash.match(/profileid-(\d+)/i);
  return { designId: m[1], requestedInstanceId: hashMatch ? hashMatch[1] : null };
}

/** Mirrors the backend's buildImportSourceUrl. */
export function makerworldModelUrl(designId: string): string {
  return `https://makerworld.com/en/models/${designId}`;
}

export function isMakerworldCollectionUrl(url: string): boolean {
  const parsed = parse(url);
  return Boolean(
    parsed && parsed.hostname.toLowerCase().endsWith("makerworld.com") && /\/collections\/\d+/i.test(parsed.pathname),
  );
}

export function isMakerworldUrl(url: string | undefined | null): boolean {
  return Boolean(url) && (Boolean(parseMakerworldModelUrl(url!)) || isMakerworldCollectionUrl(url!));
}

export function parseThingiverseThingUrl(url: string): { thingId: string } | null {
  const parsed = parse(url);
  if (!parsed || !isHost(parsed, "thingiverse.com")) return null;
  const m = parsed.pathname.match(/thing:(\d+)/i) ?? parsed.pathname.match(/\/things\/(\d+)/i);
  return m ? { thingId: m[1] } : null;
}

export function isThingiverseLikesUrl(url: string): boolean {
  const parsed = parse(url);
  return Boolean(parsed && isHost(parsed, "thingiverse.com") && /^\/[^/]+\/likes\/?$/i.test(parsed.pathname));
}

export function isThingiverseCollectionUrl(url: string): boolean {
  const parsed = parse(url);
  return Boolean(parsed && isHost(parsed, "thingiverse.com") && /\/collections\/\d+/i.test(parsed.pathname));
}

export function parsePrintablesModelUrl(url: string): { modelId: string } | null {
  const parsed = parse(url);
  if (!parsed || !isHost(parsed, "printables.com")) return null;
  const m = parsed.pathname.match(/\/model\/(\d+)/i);
  return m ? { modelId: m[1] } : null;
}

export function isPrintablesCollectionUrl(url: string): boolean {
  const parsed = parse(url);
  return Boolean(parsed && isHost(parsed, "printables.com") && /\/collections\/\d+/i.test(parsed.pathname));
}

/** The path segment is localized too: /en/3d-model/, /fr/modèle-3d/ (URL-encoded). */
export function parseCults3dModelUrl(url: string): { modelId: string } | null {
  const parsed = parse(url);
  if (!parsed || !isHost(parsed, "cults3d.com")) return null;
  const segment = decodeURIComponent(parsed.pathname);
  const m = segment.match(/\/(?:[a-z]{2}(?:-[a-z]{2})?)\/(?:3d-model|mod(?:è|e)?le-3d)\/(\d+)/i);
  return m ? { modelId: m[1] } : null;
}

/** Creator creations pages; the /creators/{name} alias redirects there on the site. */
export function isCults3dCreationsUrl(url: string): boolean {
  const parsed = parse(url);
  return Boolean(
    parsed &&
      isHost(parsed, "cults3d.com") &&
      (/\/users\/[^/]+\/creations/i.test(parsed.pathname) || /\/creators\/[^/]+/i.test(parsed.pathname)),
  );
}

/** Null keeps the icon hidden. "single" pages get a dedup check; "batch" pages always show it. */
export function classifyUrl(url: string): Classification | null {
  if (isMakerworldCollectionUrl(url)) return { kind: "batch", provider: "makerworld", type: "collection" };
  if (isThingiverseLikesUrl(url)) return { kind: "batch", provider: "thingiverse", type: "likes" };
  if (isThingiverseCollectionUrl(url)) return { kind: "batch", provider: "thingiverse", type: "collection" };
  if (isPrintablesCollectionUrl(url)) return { kind: "batch", provider: "printables", type: "collection" };
  if (isCults3dCreationsUrl(url)) return { kind: "batch", provider: "cults3d", type: "creations" };
  if (parseMakerworldModelUrl(url)) return { kind: "single", provider: "makerworld", type: "model" };
  if (parseThingiverseThingUrl(url)) return { kind: "single", provider: "thingiverse", type: "thing" };
  if (parsePrintablesModelUrl(url)) return { kind: "single", provider: "printables", type: "model" };
  if (parseCults3dModelUrl(url)) return { kind: "single", provider: "cults3d", type: "model" };
  return null;
}
