import { describe, expect, it } from "vitest";
import { parseCults3dModelUrl, parseCults3dUserCreationsUrl } from "../src/services/cults3dApi";
import { identifySourceModel, buildImportSourceUrl } from "../src/services/importService";

describe("parseCults3dModelUrl", () => {
  it("parses localized model URLs", () => {
    expect(parseCults3dModelUrl("https://cults3d.com/en/3d-model/123456/example-model")).toEqual({
      modelId: "123456",
    });
    expect(parseCults3dModelUrl("https://www.cults3d.com/fr/modèle-3d/987/game-card-box")).toEqual({
      modelId: "987",
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
    expect(parseCults3dUserCreationsUrl("https://cults3d.com/en/3d-model/123456/x")).toBeNull();
    expect(parseCults3dUserCreationsUrl("https://printables.com/@user")).toBeNull();
  });
});

describe("identifySourceModel / buildImportSourceUrl for cults3d", () => {
  it("round-trips a model URL", () => {
    const source = identifySourceModel("https://cults3d.com/en/3d-model/123456/example-model");
    expect(source).toEqual({ provider: "cults3d", externalId: "123456" });
    expect(buildImportSourceUrl(source!.provider, source!.externalId)).toBe(
      "https://cults3d.com/en/3d-model/123456",
    );
  });
});
