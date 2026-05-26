import { describe, expect, it } from "vitest";
import { mapJavaKnowledgeFaqAdd } from "../../../src/modules/chat/knowledge-faq-mappers.js";

describe("mapJavaKnowledgeFaqAdd", () => {
  it("maps string doc id from Java envelope data", () => {
    expect(mapJavaKnowledgeFaqAdd("zJd3NJJ8B9PmN2vpdbmUKg")).toEqual({
      docId: "zJd3NJJ8B9PmN2vpdbmUKg",
    });
  });

  it("maps docId object payload", () => {
    expect(mapJavaKnowledgeFaqAdd({ docId: "doc-001" })).toEqual({
      docId: "doc-001",
    });
  });
});
