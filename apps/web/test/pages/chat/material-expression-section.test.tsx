import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MATERIAL_COLLECTION_BIZ_TYPE } from "@chatai/contracts";
import { MaterialExpressionSection } from "@/pages/chat/components/material-collection";
import type { WorkbenchMaterialCollectionItemDto } from "@chatai/contracts";

describe("MaterialExpressionSection", () => {
  it("keeps collected expression images inside hover tiles without native tooltip", () => {
    render(
      <MaterialExpressionSection
        items={[createExpressionItem()]}
        onSelect={vi.fn()}
      />,
    );

    const image = screen.getByRole("img", { name: "表情" });
    const button = screen.getByRole("button", {
      name: "发送收藏表情 表情",
    });

    expect(image.closest(".grid")).toHaveClass(
      "grid-cols-[repeat(auto-fill,5rem)]",
    );
    expect(button).not.toHaveAttribute("title");
    expect(image.className).not.toContain("group-hover:scale-105");
  });
});

function createExpressionItem(
  overrides: Partial<WorkbenchMaterialCollectionItemDto> = {},
): WorkbenchMaterialCollectionItemDto {
  return {
    bizType: MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION,
    content: {
      alt: "表情",
      imageUrl: "https://cdn.example.com/emotion.gif",
    },
    contentType: "emotion",
    groupId: 0,
    id: "expression-1",
    messageId: "msg-expression-1",
    sort: 100,
    title: "表情",
    ...overrides,
  };
}
