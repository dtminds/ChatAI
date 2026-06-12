import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fireEvent } from "@testing-library/react";
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
        bizType={MATERIAL_COLLECTION_BIZ_TYPE.FILE}
        groups={[createGroup({ id: "group-file", title: "常用文件" })]}
        isSaving={false}
        onCreateGroup={async () => undefined}
        onOpenChange={() => undefined}
        onSubmit={handleSubmit}
        open
      />,
    );

    expect(screen.getByRole("dialog", { name: "收录文件" })).toBeInTheDocument();
    expect(screen.queryByText("默认分组不会新建分组记录")).not.toBeInTheDocument();
    expect(screen.queryByText("默认分组")).not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收录" })).toBeDisabled();

    await user.click(screen.getByRole("combobox", { name: "选择分组" }));
    await user.click(await screen.findByRole("option", { name: "常用文件" }));
    await user.click(screen.getByRole("button", { name: "收录" }));

    expect(handleSubmit).toHaveBeenCalledWith("group-file");
  });

  it("creates a material group from the collection group select", async () => {
    const user = userEvent.setup();
    const handleCreateGroup = vi.fn(async (title: string) =>
      createGroup({ id: "group-new", title }),
    );
    const handleSubmit = vi.fn();

    render(
      <MaterialGroupSelectDialog
        bizType={MATERIAL_COLLECTION_BIZ_TYPE.FILE}
        groups={[]}
        isSaving={false}
        onCreateGroup={handleCreateGroup}
        onOpenChange={() => undefined}
        onSubmit={handleSubmit}
        open
      />,
    );

    expect(screen.getByRole("button", { name: "收录" })).toBeDisabled();

    await user.click(screen.getByRole("combobox", { name: "选择分组" }));
    await user.click(await screen.findByRole("option", { name: "新建分组" }));
    expect(screen.getByRole("dialog", { name: "新建分组" })).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "分组名称" }), "售后文件");
    await user.click(screen.getByRole("button", { name: "新建" }));
    await user.click(screen.getByRole("button", { name: "收录" }));

    expect(handleCreateGroup).toHaveBeenCalledWith("售后文件");
    expect(handleSubmit).toHaveBeenCalledWith("group-new");
  });

  it("renders collected material with existing message card components", () => {
    render(
      <div className="w-80">
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
        />
      </div>,
    );

    expect(screen.getByText("报价单.pdf")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下载文件：报价单.pdf" }))
      .not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择素材 报价单.pdf" }).parentElement)
      .toHaveClass("w-full");
    expect(screen.getByRole("button", { name: "选择素材 报价单.pdf" }))
      .toHaveClass("w-full");
    expect(screen.getByRole("button", { name: "选择素材 报价单.pdf" }).parentElement)
      .not.toHaveClass("hover:border-border");
    expect(screen.getByTestId("file-message-card"))
      .toHaveClass("w-full");
    expect(screen.getByTestId("file-message-card"))
      .not.toHaveClass("h-32");
  });

  it("renders h5 materials from raw message content fields without nested links", () => {
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
          groupId: "group-h5",
          title: "红包来啦",
        })}
        onSelect={() => undefined}
      />,
    );

    expect(screen.getByText("红包来啦")).toBeInTheDocument();
    expect(screen.getByText("恭喜发财，大吉大利")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /红包来啦/ })).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "红包来啦" })).toHaveAttribute(
      "src",
      "https://hd-smp-test.iyouke.com/static/image/default-redpacket.png",
    );
  });

  it("selects material and exposes management actions in library dialog", async () => {
    const user = userEvent.setup();
    const handleSelect = vi.fn();
    const handleCreateGroup = vi.fn();
    const handleDelete = vi.fn();
    const handleDeleteGroup = vi.fn();
    const handleMove = vi.fn();
    const handleRenameGroup = vi.fn();
    const handleTop = vi.fn();
    const handleTopGroup = vi.fn();
    const item = createItem({ id: "material-file-1", title: "报价单.pdf" });
    const promptSpy = vi.spyOn(window, "prompt");

    render(
      <MaterialLibraryDialog
        bizType={MATERIAL_COLLECTION_BIZ_TYPE.FILE}
        groups={[
          createGroup({ id: "group-file", title: "常用文件" }),
          createGroup({ id: "group-target", title: "目标分组" }),
        ]}
        items={[item]}
        onCreateGroup={handleCreateGroup}
        onDeleteGroup={handleDeleteGroup}
        onDeleteMaterial={handleDelete}
        onMoveMaterial={handleMove}
        onOpenChange={() => undefined}
        onRenameGroup={handleRenameGroup}
        onSelectMaterial={handleSelect}
        onTopGroup={handleTopGroup}
        onTopMaterial={handleTop}
        open
      />,
    );

    expect(screen.getByRole("dialog", { name: "收录的文件" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "收录的文件" }))
      .toHaveStyle({
        maxWidth: "calc(100vw - 2rem)",
        width: "60.5rem",
      });
    expect(screen.getAllByText("收录的文件", { selector: "div" })).toHaveLength(1);
    expect(screen.getAllByText("常用文件")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "常用文件" }))
      .toHaveClass("text-left");
    expect(screen.getByLabelText("收录内容列表"))
      .toHaveClass(
        "grid",
        "items-start",
        "gap-6",
      );
    expect(screen.getByLabelText("收录内容列表"))
      .toHaveStyle({
        gridTemplateColumns: "repeat(2, 20rem)",
        width: "41.5rem",
      });
    expect(screen.getByRole("button", { name: "关闭" }))
      .toHaveClass("right-0", "-top-10", "bg-transparent", "text-white", "focus:ring-0");
    expect(screen.queryByRole("textbox", { name: "新建分组名称" }))
      .not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /选择素材 报价单\.pdf/ }));
    expect(handleSelect).toHaveBeenCalledWith(item);

    expect(screen.queryByText("所有分组")).not.toBeInTheDocument();
    expect(screen.queryByText("默认分组")).not.toBeInTheDocument();
    expect(screen.queryByText("暂无分组")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("置顶分组 常用文件")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("重命名分组 常用文件")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("删除分组 常用文件")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "新建分组" }));
    expect(screen.getByRole("dialog", { name: "新建分组" })).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "分组名称" }), "新增分组");
    await user.click(screen.getByRole("button", { name: "新建" }));
    expect(handleCreateGroup).toHaveBeenCalledWith("新增分组");

    await user.click(screen.getByRole("button", { name: "打开 常用文件 操作菜单" }));
    await user.click(await screen.findByRole("menuitem", { name: "移到最前" }));
    await user.click(screen.getByRole("button", { name: "打开 常用文件 操作菜单" }));
    await user.click(await screen.findByRole("menuitem", { name: "编辑" }));
    expect(screen.getByRole("dialog", { name: "编辑分组" })).toBeInTheDocument();
    const groupNameInput = screen.getByRole("textbox", { name: "分组名称" });
    await user.clear(groupNameInput);
    await user.type(groupNameInput, "改名文件");
    await user.click(screen.getByRole("button", { name: "保存" }));
    await user.click(screen.getByRole("button", { name: "打开 常用文件 操作菜单" }));
    await user.click(await screen.findByRole("menuitem", { name: "删除" }));

    expect(screen.queryByRole("button", { name: "管理" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "打开 报价单.pdf 操作菜单" }))
      .not.toBeInTheDocument();
    const materialButton = screen.getByRole("button", { name: "选择素材 报价单.pdf" });
    vi.spyOn(materialButton, "getBoundingClientRect").mockReturnValue({
      bottom: 280,
      height: 120,
      left: 40,
      right: 360,
      top: 160,
      width: 320,
      x: 40,
      y: 160,
      toJSON: () => ({}),
    });

    fireEvent.contextMenu(materialButton, {
      clientX: 120,
      clientY: 220,
    });
    let contextMenu = await screen.findByRole("menu");
    expect(contextMenu).toHaveStyle({
      left: "80px",
      top: "60px",
    });
    await user.click(within(contextMenu).getByRole("menuitem", { name: "移到最前" }));
    fireEvent.contextMenu(materialButton, {
      clientX: 120,
      clientY: 220,
    });
    contextMenu = await screen.findByRole("menu");
    await user.click(within(contextMenu).getByRole("menuitem", { name: "移动分组" }));
    await user.click(within(contextMenu).getByRole("menuitem", { name: "目标分组" }));
    fireEvent.contextMenu(materialButton, {
      clientX: 120,
      clientY: 220,
    });
    contextMenu = await screen.findByRole("menu");
    await user.click(within(contextMenu).getByRole("menuitem", { name: "删除" }));

    expect(handleTop).toHaveBeenCalledWith(item);
    expect(handleMove).toHaveBeenCalledWith(item, "group-target");
    expect(handleDelete).toHaveBeenCalledWith(item);
    expect(handleTopGroup).toHaveBeenCalledWith(
      expect.objectContaining({ id: "group-file" }),
    );
    expect(handleRenameGroup).toHaveBeenCalledWith(
      expect.objectContaining({ id: "group-file" }),
      "改名文件",
    );
    expect(handleDeleteGroup).toHaveBeenCalledWith(
      expect.objectContaining({ id: "group-file" }),
    );
    expect(promptSpy).not.toHaveBeenCalled();
  });

  it("renders empty group state in material library dialog", () => {
    render(
      <MaterialLibraryDialog
        bizType={MATERIAL_COLLECTION_BIZ_TYPE.FILE}
        groups={[]}
        items={[]}
        onCreateGroup={() => undefined}
        onDeleteGroup={() => undefined}
        onDeleteMaterial={() => undefined}
        onMoveMaterial={() => undefined}
        onOpenChange={() => undefined}
        onRenameGroup={() => undefined}
        onSelectMaterial={() => undefined}
        onTopGroup={() => undefined}
        onTopMaterial={() => undefined}
        open
      />,
    );

    expect(screen.getByText("暂无分组")).toBeInTheDocument();
  });

  it("uses mini-program library width for three collected mini-program cards", () => {
    render(
      <MaterialLibraryDialog
        bizType={MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM}
        groups={[createGroup({ id: "group-mini", title: "常用小程序" })]}
        items={[
          createItem({
            bizType: MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM,
            content: {
              appName: "麦当劳",
              sourceLabel: "小程序",
              title: "麦当劳自助点餐",
            },
            contentType: "mini-program",
            groupId: "group-mini",
            id: "mini-1",
            title: "麦当劳自助点餐",
          }),
        ]}
        onCreateGroup={() => undefined}
        onDeleteGroup={() => undefined}
        onDeleteMaterial={() => undefined}
        onMoveMaterial={() => undefined}
        onOpenChange={() => undefined}
        onRenameGroup={() => undefined}
        onSelectMaterial={() => undefined}
        onTopGroup={() => undefined}
        onTopMaterial={() => undefined}
        open
      />,
    );

    expect(screen.getByRole("dialog", { name: "收录的小程序" }))
      .toHaveStyle({
        maxWidth: "calc(100vw - 2rem)",
        width: "76rem",
      });
    expect(screen.getByLabelText("收录内容列表"))
      .toHaveStyle({
        gridTemplateColumns: "repeat(3, 18rem)",
        width: "57rem",
      });
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

    expect(screen.queryByText("收藏的表情")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "表情" })).toHaveClass("size-18");
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
