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

  it("allows workflow routes to use workflow metadata labels", () => {
    expect(
      formatValidationErrorMessage({
        message: "body/description must NOT have more than 200 characters",
        name: "FastifyError",
        validation: [
          {
            instancePath: "/description",
            keyword: "maxLength",
            message: "must NOT have more than 200 characters",
            params: { limit: 200 },
            schemaPath: "#/properties/description/maxLength",
          },
        ],
      }, { description: "备注" }),
    ).toBe("备注不能超过 200 个字符");
  });

  it.each([
    ["/variables", "最多添加 10 个变量"],
    ["/tools", "最多添加 10 个工具"],
    ["/kbs", "最多添加 10 个知识库"],
    ["/variables/0/select_sub_ids", "最多选择 10 个标签"],
    ["/promptConfig/availableKbIds", "最多添加 10 个知识库"],
    ["/promptConfig/availableSkillIds", "最多添加 10 个技能"],
  ])("maps maxItems validation errors for %s", (instancePath, message) => {
    expect(
      formatValidationErrorMessage({
        message: "must NOT have more than 10 items",
        name: "FastifyError",
        validation: [
          {
            instancePath,
            keyword: "maxItems",
            message: "must NOT have more than 10 items",
            params: { limit: 10 },
            schemaPath: "#/maxItems",
          },
        ],
      }),
    ).toBe(message);
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
