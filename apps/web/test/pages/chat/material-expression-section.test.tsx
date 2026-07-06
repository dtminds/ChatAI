import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MATERIAL_COLLECTION_BIZ_TYPE } from "@chatai/contracts";
import { MaterialExpressionSection } from "@/pages/chat/components/material-collection";
import type { WorkbenchMaterialCollectionItemDto } from "@chatai/contracts";

describe("MaterialExpressionSection", () => {
  it("renders collected expression images without native tooltip", () => {
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

    expect(image).toBeInTheDocument();
    expect(button).not.toHaveAttribute("title");
  });

  it("opens a right-click menu for collected expression management", async () => {
    const user = userEvent.setup();
    const item = createExpressionItem();
    const handleSelect = vi.fn();
    const handleTop = vi.fn();
    const handleDelete = vi.fn();

    render(
      <MaterialExpressionSection
        items={[item]}
        onDelete={handleDelete}
        onSelect={handleSelect}
        onTop={handleTop}
      />,
    );

    const button = screen.getByRole("button", {
      name: "发送收藏表情 表情",
    });

    fireEvent.contextMenu(button, {
      clientX: 24,
      clientY: 32,
    });

    expect(handleSelect).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("menuitem", { name: "移到最前" }));
    expect(handleTop).toHaveBeenCalledWith(item);

    fireEvent.contextMenu(button, {
      clientX: 24,
      clientY: 32,
    });
    await user.click(await screen.findByRole("menuitem", { name: "删除" }));
    expect(handleDelete).toHaveBeenCalledWith(item);
  });

  it("does not render expression images when fileUrl is missing", () => {
    render(
      <MaterialExpressionSection
        items={[
          createExpressionItem({
            content: {
              alt: "表情",
              url: "https://cdn.example.com/legacy-emotion.gif",
            },
          }),
        ]}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.queryByRole("img", { name: "表情" })).not.toBeInTheDocument();
  });
});

function createExpressionItem(
  overrides: Partial<WorkbenchMaterialCollectionItemDto> = {},
): WorkbenchMaterialCollectionItemDto {
  return {
    bizType: MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION,
    content: {
      alt: "表情",
      fileUrl: "https://cdn.example.com/emotion.gif",
    },
    contentType: "emotion",
    groupId: 0,
    id: "expression-1",
    msgInfoId: "9101",
    sort: 100,
    title: "表情",
    ...overrides,
  };
}
