import { TypeCompiler } from "@sinclair/typebox/compiler";
import { describe, expect, it } from "vitest";
import {
  COMPOSER_AI_EDIT_CONTEXT_MAX_LENGTH,
  COMPOSER_AI_EDIT_INPUT_MAX_LENGTH,
  COMPOSER_AI_EDIT_INPUT_MIN_LENGTH,
  ComposerAiEditRequestSchema,
} from "../src/index";

describe("composer AI edit DTOs", () => {
  it("limits selected input text to 5-200 characters", () => {
    const compiler = TypeCompiler.Compile(ComposerAiEditRequestSchema);
    const minimumRequest = {
      action: "polish",
      content: "字".repeat(COMPOSER_AI_EDIT_INPUT_MIN_LENGTH),
      contextAfter: "",
      contextBefore: "",
      conversationId: "conversation-1",
      rewriteMode: "full",
    };
    const maximumRequest = {
      ...minimumRequest,
      content: "字".repeat(COMPOSER_AI_EDIT_INPUT_MAX_LENGTH),
    };

    expect(COMPOSER_AI_EDIT_INPUT_MIN_LENGTH).toBe(5);
    expect(COMPOSER_AI_EDIT_INPUT_MAX_LENGTH).toBe(200);
    expect(compiler.Check(minimumRequest)).toBe(true);
    expect(compiler.Check({ ...minimumRequest, content: "字".repeat(4) })).toBe(false);
    expect(compiler.Check(maximumRequest)).toBe(true);
    expect(compiler.Check({ ...maximumRequest, content: `${maximumRequest.content}字` })).toBe(false);
  });

  it("limits surrounding context to 50 characters on each side", () => {
    const compiler = TypeCompiler.Compile(ComposerAiEditRequestSchema);
    const request = {
      action: "polish",
      content: "这段需要改写",
      contextAfter: "后".repeat(COMPOSER_AI_EDIT_CONTEXT_MAX_LENGTH),
      contextBefore: "前".repeat(COMPOSER_AI_EDIT_CONTEXT_MAX_LENGTH),
      conversationId: "conversation-1",
      rewriteMode: "targeted",
    };

    expect(COMPOSER_AI_EDIT_CONTEXT_MAX_LENGTH).toBe(50);
    expect(compiler.Check(request)).toBe(true);
    expect(compiler.Check({ ...request, contextBefore: `${request.contextBefore}前` })).toBe(false);
    expect(compiler.Check({ ...request, contextAfter: `${request.contextAfter}后` })).toBe(false);
  });
});
