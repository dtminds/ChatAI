import { describe, expect, it } from "vitest";
import {
  buildAiHelperAskRequestBody,
  collectAiHelperAskStreamText,
  extractAiHelperTemplateConfigParamId,
  mapJavaAiHelperGenerateId,
} from "../../../src/modules/chat/ai-helper-mappers.js";

describe("extractAiHelperTemplateConfigParamId", () => {
  it("reads first configData id", () => {
    expect(
      extractAiHelperTemplateConfigParamId({
        configData: [{ id: 30, type: "textarea" }],
        templateId: 17,
      }),
    ).toBe(30);
  });
});

describe("mapJavaAiHelperGenerateId", () => {
  it("maps generateId from object payload", () => {
    expect(mapJavaAiHelperGenerateId({ generateId: "gen-001" })).toBe("gen-001");
  });

  it("ignores non-scalar generateId values", () => {
    expect(mapJavaAiHelperGenerateId({ generateId: {} })).toBeUndefined();
  });

  it("maps generateId from string payload", () => {
    expect(mapJavaAiHelperGenerateId("gen-002")).toBe("gen-002");
  });
});

describe("buildAiHelperAskRequestBody", () => {
  it("uses numeric generateId when possible", () => {
    expect(buildAiHelperAskRequestBody("2571")).toEqual({ generateId: 2571 });
  });
});

describe("collectAiHelperAskStreamText", () => {
  it("trims streamed text", () => {
    expect(collectAiHelperAskStreamText("  更短的话术  ")).toBe("更短的话术");
  });
});
