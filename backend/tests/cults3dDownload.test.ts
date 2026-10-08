import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";

// Cults3D file downloads authorize the user's site session cookie -- the instance-wide API key
// pair covers only the GraphQL metadata API. These tests pin that behavior end-to-end through
// POST /api/import. HTTP and DNS are mocked, so they run offline.

vi.mock("node:dns/promises", () => ({
  default: {
    resolve4: async () => ["93.184.216.34"],
    resolve6: async () => {
      throw new Error("no AAAA");
    },
  },
}));

const { createApp } = await import("../src/app");
const { prisma } = await import("../src/db");
const { setCults3dCredentials } = await import("../src/services/settingsService");
const { normalizeCults3dCookie } = await import("../src/services/cults3dApi");

const app = createApp();
const stamp = Date.now();
let token: string;
const auth = () => ({ Authorization: `Bearer ${token}` });

const BLUEPRINT_NUMERIC_ID = "424242";
const BLUEPRINT_ID = Buffer.from(`Blueprint/${BLUEPRINT_NUMERIC_ID}`).toString("base64");
const DOWNLOAD_URL = `https://cults3d.com/download/blueprint/${BLUEPRINT_NUMERIC_ID}`;
const MODEL_URL = "https://cults3d.com/en/3d-model/home/test-dragon";

const FAKE_STL = Buffer.from(`solid test\nendsolid test\n`);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function png(): Response {
  return new Response(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ),
    { headers: { "content-type": "image/png" } },
  );
}
function stl(): Response {
  return new Response(FAKE_STL, { headers: { "content-type": "application/octet-stream" } });
}
/** The endpoint's answer to a request without a working session: a bounce to the sign-in page. */
function signInRedirect(): Response {
  const res = new Response("<!DOCTYPE html><html>Sign in</html>", {
    status: 200,
    headers: { "content-type": "text/html" },
  });
  Object.defineProperty(res, "url", { value: "https://cults3d.com/users/sign_in" });
  return res;
}
/** Logged in but not entitled (paid, not purchased): the HTML product page, no redirect. */
function productPage(): Response {
  return new Response("<!DOCTYPE html><html>Buy this design</html>", {
    status: 200,
    headers: { "content-type": "text/html" },
  });
}
function cloudflareChallenge(): Response {
  return new Response("<!DOCTYPE html><title>Just a moment...</title>", {
    status: 403,
    headers: { "content-type": "text/html", "cf-mitigated": "challenge", server: "cloudflare" },
  });
}

function creationJson(priceCents: number) {
  return json({
    data: {
      creation: {
        name: "Test Dragon",
        description: "A test dragon.",
        publishedAt: "2026-01-01T00:00:00Z",
        illustrationImageUrl: "https://images.cults3d.com/dragon-cover.png",
        tags: ["dragon"],
        metaTags: [],
        category: { name: "Art", slug: "art" },
        creator: { nick: "DragonMaker", url: "https://cults3d.com/en/users/DragonMaker", imageUrl: null, bio: null },
        illustrations: [{ imageUrl: "https://images.cults3d.com/dragon-cover.png", position: 0 }],
        blueprints: [{ id: BLUEPRINT_ID, fileName: "dragon.stl", fileExtension: "stl" }],
        openPriced: false,
        price: { cents: priceCents, currency: "EUR" },
      },
    },
  });
}

type Routes = Record<string, (init?: RequestInit) => Response>;
const originalFetch = global.fetch;

/** Answers exactly the listed URLs (by prefix); anything else fails the test. */
function mockFetch(routes: Routes) {
  global.fetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async (input, init) => {
    const url = String(input);
    const match = Object.keys(routes)
      .filter((prefix) => url.startsWith(prefix))
      .toSorted((a, b) => b.length - a.length)[0];
    if (!match) throw new Error(`Unexpected fetch to ${url}`);
    return routes[match](init);
  }) as unknown as typeof fetch;
}

beforeAll(async () => {
  const res = await request(app)
    .post("/api/register")
    .send({
      displayName: "Cults3D Download Test",
      email: `cults3d-download-${stamp}@example.com`,
      password: "password123",
    });
  token = res.body.token;
  // Set directly: the settings route verifies against the live API, which is mocked away here.
  await setCults3dCredentials("test-api-key", "test-api-user");
});

afterEach(() => {
  global.fetch = originalFetch;
});

afterAll(async () => {
  await setCults3dCredentials(null, null);
});

describe("normalizeCults3dCookie", () => {
  it("wraps a bare _session_id value into header form", () => {
    expect(normalizeCults3dCookie("abc123")).toBe("_session_id=abc123");
  });
  it("keeps a full Cookie header untouched", () => {
    expect(normalizeCults3dCookie("_session_id=abc; other=1")).toBe("_session_id=abc; other=1");
  });
});

describe("importing from Cults3D", () => {
  it("downloads the model file with the session cookie", async () => {
    let seenCookie: string | null = null;
    let seenAuth: string | null = null;
    mockFetch({
      "https://cults3d.com/graphql": () => creationJson(0),
      [DOWNLOAD_URL]: (init) => {
        const headers = (init?.headers ?? {}) as Record<string, string>;
        seenCookie = headers.Cookie ?? null;
        seenAuth = headers.Authorization ?? null;
        return stl();
      },
      "https://images.cults3d.com/": png,
    });

    const res = await request(app)
      .post("/api/import")
      .set(auth())
      .send({ url: MODEL_URL, cults3d_cookie: "_session_id=live-session" });
    expect(res.status).toBe(200);
    expect(res.body.files_pending).toBe(false);
    expect(res.body.plates).toHaveLength(1);
    expect(res.body.plates[0].filename).toBe("dragon.stl");

    // The download authorized the site session (and still sends the API pair as a fallback).
    expect(seenCookie).toBe("_session_id=live-session");
    expect(seenAuth).toBe(`Basic ${Buffer.from("test-api-user:test-api-key").toString("base64")}`);

    const plate = res.body.plates[0];
    const download = await request(app)
      .get(`/api${plate.url}`)
      .set(auth())
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(download.status).toBe(200);
    expect(Buffer.compare(download.body as Buffer, FAKE_STL)).toBe(0);
  });

  it("falls back to the session cookie saved in Settings", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: `cults3d-download-${stamp}@example.com` } });
    await prisma.user.update({ where: { id: user.id }, data: { cults3dCookie: "_session_id=stored-session" } });

    let seenCookie: string | null = null;
    mockFetch({
      "https://cults3d.com/graphql": () => creationJson(0),
      "https://cults3d.com/en/3d-model/other-dragon": () => productPage(),
      [DOWNLOAD_URL]: (init) => {
        seenCookie = ((init?.headers ?? {}) as Record<string, string>).Cookie ?? null;
        return stl();
      },
      "https://images.cults3d.com/": png,
    });

    const res = await request(app)
      .post("/api/import")
      .set(auth())
      .send({ url: "https://cults3d.com/en/3d-model/other-dragon" });
    expect(res.status).toBe(200);
    expect(seenCookie).toBe("_session_id=stored-session");
  });

  it("says a login is needed when the endpoint bounces to sign-in and no cookie exists", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: `cults3d-download-${stamp}@example.com` } });
    await prisma.user.update({ where: { id: user.id }, data: { cults3dCookie: null } });

    mockFetch({
      "https://cults3d.com/graphql": () => creationJson(0),
      [DOWNLOAD_URL]: signInRedirect,
      "https://images.cults3d.com/": png,
    });

    const res = await request(app)
      .post("/api/import")
      .set(auth())
      .send({ url: "https://cults3d.com/en/3d-model/free-needs-login" });
    expect(res.status).toBe(400);
    expect(res.body.detail ?? "").toMatch(/logged-in account/i);
  });

  it("says the saved cookie expired when it still bounces to sign-in", async () => {
    mockFetch({
      "https://cults3d.com/graphql": () => creationJson(0),
      [DOWNLOAD_URL]: signInRedirect,
      "https://images.cults3d.com/": png,
    });

    const res = await request(app)
      .post("/api/import")
      .set(auth())
      .send({ url: "https://cults3d.com/en/3d-model/expired-cookie", cults3d_cookie: "_session_id=stale" });
    expect(res.status).toBe(400);
    expect(res.body.detail ?? "").toMatch(/rejected the saved session cookie/i);
  });

  it("creates a metadata-only print (files_pending) for a paid model the account hasn't bought", async () => {
    mockFetch({
      "https://cults3d.com/graphql": () => creationJson(499),
      [DOWNLOAD_URL]: productPage,
      "https://images.cults3d.com/": png,
    });

    const res = await request(app)
      .post("/api/import")
      .set(auth())
      .send({ url: "https://cults3d.com/en/3d-model/paid-dragon", cults3d_cookie: "_session_id=live-session" });
    expect(res.status).toBe(200);
    expect(res.body.files_pending).toBe(true);
    expect(res.body.plates).toHaveLength(0);
    expect(res.body.title).toBe("Test Dragon");
  });

  it("maps a Cloudflare challenge on the download to a retryable 429", async () => {
    mockFetch({
      "https://cults3d.com/graphql": () => creationJson(0),
      [DOWNLOAD_URL]: cloudflareChallenge,
      "https://images.cults3d.com/": png,
    });

    const res = await request(app)
      .post("/api/import")
      .set(auth())
      .send({ url: "https://cults3d.com/en/3d-model/cloudflare-dragon", cults3d_cookie: "_session_id=live-session" });
    expect(res.status).toBe(429);
  });
});
