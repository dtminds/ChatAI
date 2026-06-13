import { describe, expect, it } from "vitest";
import { formatValidationErrorMessage } from "../../src/shared/format-validation-error.js";

describe("formatValidationErrorMessage", () => {
  it("maps maxLength validation errors to Chinese field messages", () => {
    expect(
      formatValidationErrorMessage({
        message: "body/description must NOT have more than 64 characters",
        name: "FastifyError",
        validation: [
          {
            instancePath: "/description",
            keyword: "maxLength",
            message: "must NOT have more than 64 characters",
            params: { limit: 64 },
            schemaPath: "#/properties/description/maxLength",
          },
        ],
      }),
    ).toBe("链接描述不能超过 64 个字符");
  });

  it("falls back to a generic Chinese message for unknown validation issues", () => {
    expect(
      formatValidationErrorMessage({
        message: "body must be object",
        name: "FastifyError",
        validation: [
          {
            instancePath: "",
            keyword: "type",
            message: "must be object",
            params: { type: "object" },
            schemaPath: "#",
          },
        ],
      }),
    ).toBe("请求参数有误");
  });
});
