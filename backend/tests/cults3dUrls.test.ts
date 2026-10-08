import { describe, expect, it } from "vitest";
import { parseCults3dModelUrl, parseCults3dUserCreationsUrl } from "../src/services/cults3dApi";
import { identifySourceModel, buildImportSourceUrl } from "../src/services/importService";

// Cults3D model URLs are slug-keyed with a category segment: /en/3d-model/home/vintage-desk-set-…
// The category is not part of the model's identity; only the trailing slug is.

describe("parseCults3dModelUrl", () => {
  it("parses localized model URLs, extracting just the slug", () => {
    expect(parseCults3dModelUrl("https://cults3d.com/en/3d-model/home/vintage-desk-set")).toEqual({
      modelId: "vintage-desk-set",
    });
    expect(parseCults3dModelUrl("https://cults3d.com/en/3d-model/vintage-desk-set")).toEqual({
      modelId: "vintage-desk-set",
    });
    expect(parseCults3dModelUrl("https://www.cults3d.com/fr/modèle-3d/987/game-card-box")).toEqual({
      modelId: "game-card-box",
    });
  });

  it("rejects non-model and off-site URLs", () => {
    expect(parseCults3dModelUrl("https://cults3d.com/en/users/someuser/creations")).toBeNull();
    expect(parseCults3dModelUrl("https://cults3d.com/en/3d-model/")).toBeNull();
    expect(parseCults3dModelUrl("https://example.com/en/3d-model/123456/x")).toBeNull();
    expect(parseCults3dModelUrl("not a url")).toBeNull();
  });
});

describe("parseCults3dUserCreationsUrl", () => {
  it("parses creations and creators pages", () => {
    expect(parseCults3dUserCreationsUrl("https://cults3d.com/en/users/lantertronics/creations")).toEqual({
      username: "lantertronics",
    });
    expect(parseCults3dUserCreationsUrl("https://cults3d.com/creators/some-user")).toEqual({
      username: "some-user",
    });
  });

  it("rejects model pages and off-site URLs", () => {
    expect(parseCults3dUserCreationsUrl("https://cults3d.com/en/3d-model/home/example-model")).toBeNull();
    expect(parseCults3dUserCreationsUrl("https://printables.com/@user")).toBeNull();
  });
});

describe("identifySourceModel / buildImportSourceUrl for cults3d", () => {
  it("round-trips a model URL via its slug", () => {
    const source = identifySourceModel("https://cults3d.com/en/3d-model/home/vintage-desk-set");
    expect(source).toEqual({ provider: "cults3d", externalId: "vintage-desk-set" });
    // The canonical rebuilt URL has no category segment: the API keys by slug alone.
    expect(buildImportSourceUrl(source!.provider, source!.externalId)).toBe(
      "https://cults3d.com/en/3d-model/vintage-desk-set",
    );
  });
});
