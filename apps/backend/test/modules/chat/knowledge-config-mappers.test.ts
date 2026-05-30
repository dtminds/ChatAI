import { describe, expect, it } from "vitest";
import { mapJavaKnowledgeConfig } from "../../../src/modules/chat/knowledge-config-mappers.js";

describe("mapJavaKnowledgeConfig", () => {
  it("maps automaticCheckIllegalWords from Java response", () => {
    expect(
      mapJavaKnowledgeConfig({
        automaticCheckIllegalWords: 1,
      }),
    ).toEqual({
      config: {
        automaticCheckIllegalWords: 1,
      },
    });
  });

  it("normalizes non-positive values to 0", () => {
    expect(
      mapJavaKnowledgeConfig({
        automaticCheckIllegalWords: 0,
      }),
    ).toEqual({
      config: {
        automaticCheckIllegalWords: 0,
      },
    });

    expect(mapJavaKnowledgeConfig({})).toEqual({
      config: {
        automaticCheckIllegalWords: 0,
      },
    });
  });
});
