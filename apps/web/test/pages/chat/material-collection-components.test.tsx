import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MATERIAL_COLLECTION_BIZ_TYPE } from "@chatai/contracts";
import {
  MaterialCard,
  MaterialExpressionSection,
  MaterialGroupSelectDialog,
  MaterialLibraryDialog,
} from "@/pages/chat/components/material-collection";
import type {
  WorkbenchMaterialCollectionGroupDto,
  WorkbenchMaterialCollectionItemDto,
} from "@chatai/contracts";

describe("material collection components", () => {
  it("submits the selected material group", async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn();

    render(
      <MaterialGroupSelectDialog
        groups={[createGroup({ id: "group-file", title: "常用文件" })]}
        isSaving={false}
        onOpenChange={() => undefined}
        onSubmit={handleSubmit}
        open
      />,
    );

    await user.click(screen.getByRole("radio", { name: "常用文件" }));
    await user.click(screen.getByRole("button", { name: "收录" }));

    expect(handleSubmit).toHaveBeenCalledWith("group-file");
  });

  it("renders collected material with existing message card components", () => {
    render(
      <MaterialCard
        item={createItem({
          content: {
            extension: "pdf",
            fileName: "报价单.pdf",
            fileSizeLabel: "2 KB",
            sourceLabel: "文件",
          },
          contentType: "file",
          title: "报价单.pdf",
        })}
        onSelect={() => undefined}
      />,
    );

    expect(screen.getByText("报价单.pdf")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下载文件：报价单.pdf" }))
      .not.toBeInTheDocument();
  });

  it("renders h5 materials from raw message content fields", () => {
    render(
      <MaterialCard
        item={createItem({
          bizType: MATERIAL_COLLECTION_BIZ_TYPE.H5,
          content: {
            coverUrl: "https://hd-smp-test.iyouke.com/static/image/default-redpacket.png",
            desc: "恭喜发财，大吉大利",
            href: "https://m-scrm-test.dtminds.com/h5/pages/redpacketSend/index",
            title: "红包来啦",
          },
          contentType: "h5",
          groupId: 0,
          title: "红包来啦",
        })}
        onSelect={() => undefined}
      />,
    );

    expect(screen.getByText("红包来啦")).toBeInTheDocument();
    expect(screen.getByText("恭喜发财，大吉大利")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /红包来啦/ })).toHaveAttribute(
      "href",
      "https://m-scrm-test.dtminds.com/h5/pages/redpacketSend/index",
    );
    expect(screen.getByRole("img", { name: "红包来啦" })).toHaveAttribute(
      "src",
      "https://hd-smp-test.iyouke.com/static/image/default-redpacket.png",
    );
  });

  it("selects material and exposes management actions in library dialog", async () => {
    const user = userEvent.setup();
    const handleSelect = vi.fn();
    const handleDelete = vi.fn();
    const handleTop = vi.fn();
    const item = createItem({ id: "material-file-1", title: "报价单.pdf" });

    render(
      <MaterialLibraryDialog
        bizType={MATERIAL_COLLECTION_BIZ_TYPE.FILE}
        groups={[createGroup({ id: "group-file", title: "常用文件" })]}
        items={[item]}
        onCreateGroup={() => undefined}
        onDeleteGroup={() => undefined}
        onDeleteMaterial={handleDelete}
        onMoveMaterial={() => undefined}
        onOpenChange={() => undefined}
        onRenameGroup={() => undefined}
        onSelectMaterial={handleSelect}
        onTopGroup={() => undefined}
        onTopMaterial={handleTop}
        open
      />,
    );

    await user.click(screen.getByRole("button", { name: /选择素材 报价单\.pdf/ }));
    expect(handleSelect).toHaveBeenCalledWith(item);

    await user.click(screen.getByRole("button", { name: "管理" }));
    await user.click(screen.getByRole("button", { name: "置顶 报价单.pdf" }));
    await user.click(screen.getByRole("button", { name: "删除 报价单.pdf" }));

    expect(handleTop).toHaveBeenCalledWith(item);
    expect(handleDelete).toHaveBeenCalledWith(item);
  });

  it("renders collected expression section", async () => {
    const user = userEvent.setup();
    const handleSelect = vi.fn();
    const item = createItem({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION,
      content: {
        alt: "表情",
        imageUrl: "https://cdn.example.com/emotion.gif",
      },
      contentType: "emotion",
      groupId: 0,
      id: "expression-1",
      title: "表情",
    });

    render(
      <MaterialExpressionSection
        items={[item]}
        onSelect={handleSelect}
      />,
    );

    await user.click(screen.getByRole("button", { name: "发送收藏表情 表情" }));

    expect(screen.getByText("收藏的表情")).toBeInTheDocument();
    expect(handleSelect).toHaveBeenCalledWith(item);
  });
});

function createGroup(
  overrides: Partial<WorkbenchMaterialCollectionGroupDto> = {},
): WorkbenchMaterialCollectionGroupDto {
  return {
    bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
    id: "group-1",
    sort: 100,
    title: "分组",
    ...overrides,
  };
}

function createItem(
  overrides: Partial<WorkbenchMaterialCollectionItemDto> = {},
): WorkbenchMaterialCollectionItemDto {
  return {
    bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
    content: {
      extension: "pdf",
      fileName: "报价单.pdf",
      fileSizeLabel: "2 KB",
      sourceLabel: "文件",
    },
    contentType: "file",
    groupId: "group-file",
    id: "material-1",
    messageId: "msg-file-1",
    sort: 100,
    title: "报价单.pdf",
    ...overrides,
  };
}
