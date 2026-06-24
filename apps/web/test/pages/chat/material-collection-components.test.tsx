import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MATERIAL_COLLECTION_BIZ_TYPE, MATERIAL_COLLECTION_GROUP_MAX_COUNT } from "@chatai/contracts";
import {
  MaterialCard,
  MaterialExpressionSection,
  MaterialGroupSelectDialog,
  MaterialLibraryDialog,
} from "@/pages/chat/components/material-collection";
import { MaterialItemFormDialog } from "@/pages/chat/components/material-collection/material-item-form-dialog";
import type {
  WorkbenchMaterialCollectionGroupDto,
  WorkbenchMaterialCollectionItemDto,
} from "@chatai/contracts";

describe("material collection components", () => {
  it("keeps edited file name while parent re-renders during edit dialog", async () => {
    const user = userEvent.setup();
    const initialValues = {
      description: "",
      fileExtension: "pdf",
      fileName: "报价单.pdf",
      title: "",
    };

    const { rerender } = render(
      <MaterialItemFormDialog
        bizType={MATERIAL_COLLECTION_BIZ_TYPE.FILE}
        initialValues={initialValues}
        onOpenChange={() => undefined}
        onSubmit={() => undefined}
        open
      />,
    );

    const fileNameInput = screen.getByRole("textbox", { name: "文件名称" });
    await user.clear(fileNameInput);
    await user.type(fileNameInput, "新名称");

    rerender(
      <MaterialItemFormDialog
        bizType={MATERIAL_COLLECTION_BIZ_TYPE.FILE}
        initialValues={{ ...initialValues }}
        onOpenChange={() => undefined}
        onSubmit={() => undefined}
        open
      />,
    );

    expect(screen.getByRole("textbox", { name: "文件名称" })).toHaveValue("新名称");
  });

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

    await user.type(screen.getByRole("textbox", { name: "文件名称" }), "报价单.pdf");
    await user.click(screen.getByRole("combobox", { name: "选择分组" }));
    await user.click(await screen.findByRole("option", { name: "常用文件" }));
    await user.click(screen.getByRole("button", { name: "收录" }));

    expect(handleSubmit).toHaveBeenCalledWith({
      fileName: "报价单.pdf",
      groupId: "group-file",
    });
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
    await user.type(screen.getByRole("textbox", { name: "文件名称" }), "售后文件.pdf");
    await user.click(screen.getByRole("button", { name: "收录" }));

    expect(handleCreateGroup).toHaveBeenCalledWith("售后文件");
    expect(handleSubmit).toHaveBeenCalledWith({
      fileName: "售后文件.pdf",
      groupId: "group-new",
    });
  });

  it("limits material group names to 10 characters", async () => {
    const user = userEvent.setup();
    const handleCreateGroup = vi.fn(async (title: string) =>
      createGroup({ id: "group-new", title }),
    );

    render(
      <MaterialGroupSelectDialog
        bizType={MATERIAL_COLLECTION_BIZ_TYPE.FILE}
        groups={[]}
        isSaving={false}
        onCreateGroup={handleCreateGroup}
        onOpenChange={() => undefined}
        onSubmit={() => undefined}
        open
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "选择分组" }));
    await user.click(await screen.findByRole("option", { name: "新建分组" }));
    expect(screen.getByText("0/10")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "分组名称" }), "一二三四五六七八九十甲");
    expect(screen.getByText("10/10")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "新建" }));

    expect(handleCreateGroup).toHaveBeenCalledWith("一二三四五六七八九十");
  });

  it("locks file extension while editing the collected file name", async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn();

    render(
      <MaterialGroupSelectDialog
        bizType={MATERIAL_COLLECTION_BIZ_TYPE.FILE}
        groups={[createGroup({ id: "group-file", title: "常用文件" })]}
        initialValues={{
          description: "",
          fileExtension: "pdf",
          fileName: "报价单.pdf",
          title: "",
        }}
        isSaving={false}
        onCreateGroup={async () => undefined}
        onOpenChange={() => undefined}
        onSubmit={handleSubmit}
        open
      />,
    );

    const fileNameInput = screen.getByRole("textbox", { name: "文件名称" });
    expect(fileNameInput).toHaveValue("报价单");
    expect(screen.getByLabelText("文件后缀 .pdf")).toBeInTheDocument();

    await user.clear(fileNameInput);
    await user.type(fileNameInput, "售后方案");
    await user.click(screen.getByRole("combobox", { name: "选择分组" }));
    await user.click(await screen.findByRole("option", { name: "常用文件" }));
    await user.click(screen.getByRole("button", { name: "收录" }));

    expect(handleSubmit).toHaveBeenCalledWith({
      fileName: "售后方案.pdf",
      groupId: "group-file",
    });
  });

  it("hides create-group option in collect dialog when group limit is reached", async () => {
    const user = userEvent.setup();

    render(
      <MaterialGroupSelectDialog
        bizType={MATERIAL_COLLECTION_BIZ_TYPE.FILE}
        groups={Array.from({ length: MATERIAL_COLLECTION_GROUP_MAX_COUNT }, (_, index) =>
          createGroup({ id: `group-${index}`, title: `分组${index + 1}` }),
        )}
        isSaving={false}
        onCreateGroup={async () => undefined}
        onOpenChange={() => undefined}
        onSubmit={() => undefined}
        open
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "选择分组" }));

    expect(screen.queryByRole("option", { name: "新建分组" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "分组1" })).toBeInTheDocument();
  });

  it("disables create-group button in material library when group limit is reached", () => {
    render(
      <MaterialLibraryDialog
        activeGroupId="group-1"
        bizType={MATERIAL_COLLECTION_BIZ_TYPE.FILE}
        groups={Array.from({ length: MATERIAL_COLLECTION_GROUP_MAX_COUNT }, (_, index) =>
          createGroup({ id: `group-${index}`, title: `分组${index + 1}` }),
        )}
        items={[]}
        onCreateGroup={() => undefined}
        onDeleteGroup={() => undefined}
        onDeleteMaterial={() => undefined}
        onEditMaterial={() => undefined}
        onMoveMaterial={() => undefined}
        onOpenChange={() => undefined}
        onRenameGroup={() => undefined}
        onSelectGroup={() => undefined}
        onSelectMaterial={() => undefined}
        onTopGroup={() => undefined}
        onTopMaterial={() => undefined}
        open
      />,
    );

    expect(screen.getByRole("button", { name: "新建分组" })).toBeDisabled();
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

  it("renders h5 materials stored with legacy linkUrl field", () => {
    render(
      <MaterialCard
        item={createItem({
          bizType: MATERIAL_COLLECTION_BIZ_TYPE.H5,
          content: {
            description: "活动说明",
            linkUrl: "https://example.com/legacy-page",
            title: "活动页",
          },
          contentType: "h5",
          groupId: "group-h5",
          title: "活动页",
        })}
        onSelect={() => undefined}
      />,
    );

    expect(screen.getByText("活动页")).toBeInTheDocument();
    expect(screen.getByText("活动说明")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择素材 活动页" })).toBeInTheDocument();
  });

  it("selects material and exposes management actions in library dialog", async () => {
    const user = userEvent.setup();
    const handleSelect = vi.fn();
    const handleCreateGroup = vi.fn();
    const handleDelete = vi.fn();
    const handleDeleteGroup = vi.fn();
    const handleMove = vi.fn();
    const handleEdit = vi.fn();
    const handleRenameGroup = vi.fn();
    const handleTop = vi.fn();
    const handleTopGroup = vi.fn();
    const handleLoadMore = vi.fn();
    const item = createItem({
      createdAt: 1_736_873_600_000,
      id: "material-file-1",
      title: "报价单.pdf",
    });
    const promptSpy = vi.spyOn(window, "prompt");

    render(
      <MaterialLibraryDialog
        activeGroupId="group-file"
        bizType={MATERIAL_COLLECTION_BIZ_TYPE.FILE}
        groups={[
          createGroup({ id: "group-file", title: "常用文件" }),
          createGroup({ id: "group-target", title: "目标分组" }),
        ]}
        items={[item]}
        hasMoreItems
        onCreateGroup={handleCreateGroup}
        onDeleteGroup={handleDeleteGroup}
        onDeleteMaterial={handleDelete}
        onEditMaterial={handleEdit}
        onLoadMoreItems={handleLoadMore}
        onMoveMaterial={handleMove}
        onOpenChange={() => undefined}
        onRenameGroup={handleRenameGroup}
        onSelectGroup={() => undefined}
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
        width: "60rem",
      });
    expect(screen.getAllByText("收录的文件", { selector: "div" })).toHaveLength(1);
    expect(screen.getAllByText("常用文件")).toHaveLength(1);
    expect(screen.getByText("选择文件后发送，右键菜单可调整排序或删除素材"))
      .toHaveClass("absolute", "-top-9", "text-white/90");
    expect(screen.getByRole("button", { name: "常用文件" }))
      .toHaveClass("text-left");
    expect(screen.getByRole("table", { name: "收录文件列表" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "名称" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "收录时间" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "文件大小" })).toBeInTheDocument();
    expect(screen.getByText("报价单.pdf")).toHaveAttribute("title", "报价单.pdf");
    expect(
      screen.getByText(formatMaterialCollectionDate(item.createdAt!)),
    ).toBeInTheDocument();
    expect(screen.getByText("2 KB")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "关闭" }))
      .toHaveClass("right-0", "-top-10", "bg-transparent", "text-white", "focus:ring-0");
    expect(screen.queryByRole("textbox", { name: "新建分组名称" }))
      .not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "选择 报价单.pdf" }));
    expect(handleSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "发送" })).not.toBeDisabled();
    await user.click(screen.getByRole("button", { name: "选择 报价单.pdf" }));
    expect(screen.getByRole("button", { name: "发送" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "选择 报价单.pdf" }));
    await user.click(screen.getByRole("button", { name: "发送" }));
    expect(handleSelect).toHaveBeenCalledWith(item);
    await user.click(screen.getByRole("button", { name: "加载更多" }));
    expect(handleLoadMore).toHaveBeenCalledTimes(1);

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
    const materialRow = screen.getByRole("row", { name: /报价单\.pdf/ });

    fireEvent.contextMenu(materialRow, {
      clientX: 120,
      clientY: 220,
    });
    let contextMenu = await screen.findByRole("menu");
    expect(contextMenu).toHaveStyle({
      left: "120px",
      top: "220px",
    });
    await user.click(within(contextMenu).getByRole("menuitem", { name: "移到最前" }));
    fireEvent.contextMenu(materialRow, {
      clientX: 120,
      clientY: 220,
    });
    contextMenu = await screen.findByRole("menu");
    await user.click(within(contextMenu).getByRole("menuitem", { name: "编辑" }));
    expect(screen.getByRole("dialog", { name: "编辑文件" })).toBeInTheDocument();
    const fileNameInput = screen.getByRole("textbox", { name: "文件名称" });
    await user.clear(fileNameInput);
    await user.type(fileNameInput, "新报价单");
    expect(screen.getByLabelText("文件后缀 .pdf")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "保存" }));
    fireEvent.contextMenu(materialRow, {
      clientX: 120,
      clientY: 220,
    });
    contextMenu = await screen.findByRole("menu");
    await user.click(within(contextMenu).getByRole("menuitem", { name: "移动分组" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    const moveDialog = await screen.findByRole("dialog", { name: "移动分组" });
    expect(within(moveDialog).getByText("报价单.pdf")).toBeInTheDocument();
    await user.click(within(moveDialog).getByRole("combobox", { name: "选择目标分组" }));
    await user.click(await screen.findByRole("option", { name: "目标分组" }));
    expect(handleMove).not.toHaveBeenCalled();
    await user.click(within(moveDialog).getByRole("button", { name: "确定" }));
    fireEvent.contextMenu(materialRow, {
      clientX: 120,
      clientY: 220,
    });
    contextMenu = await screen.findByRole("menu");
    await user.click(within(contextMenu).getByRole("menuitem", { name: "删除" }));

    expect(handleTop).toHaveBeenCalledWith(item);
    expect(handleEdit).toHaveBeenCalledWith(item, {
      description: "",
      fileExtension: "pdf",
      fileName: "新报价单.pdf",
      title: "",
    });
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
        activeGroupId={null}
        bizType={MATERIAL_COLLECTION_BIZ_TYPE.FILE}
        groups={[]}
        items={[]}
        onCreateGroup={() => undefined}
        onDeleteGroup={() => undefined}
        onDeleteMaterial={() => undefined}
        onEditMaterial={() => undefined}
        onMoveMaterial={() => undefined}
        onOpenChange={() => undefined}
        onRenameGroup={() => undefined}
        onSelectGroup={() => undefined}
        onSelectMaterial={() => undefined}
        onTopGroup={() => undefined}
        onTopMaterial={() => undefined}
        open
      />,
    );

    expect(screen.getByText("暂无分组")).toBeInTheDocument();
  });

  it("constrains material library content to scroll inside the dialog", () => {
    render(
      <MaterialLibraryDialog
        activeGroupId="group-1"
        bizType={MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM}
        groups={Array.from({ length: 20 }, (_, index) =>
          createGroup({ id: `group-${index + 1}`, title: `Test${index + 1}` }),
        )}
        items={Array.from({ length: 20 }, (_, index) =>
          createItem({
            bizType: MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM,
            content: {
              appName: "麦当劳",
              sourceLabel: "小程序",
              title: `小程序${index + 1}`,
            },
            contentType: "mini-program",
            groupId: "group-1",
            id: `mini-${index + 1}`,
            title: `小程序${index + 1}`,
          }),
        )}
        onCreateGroup={() => undefined}
        onDeleteGroup={() => undefined}
        onDeleteMaterial={() => undefined}
        onEditMaterial={() => undefined}
        onMoveMaterial={() => undefined}
        onOpenChange={() => undefined}
        onRenameGroup={() => undefined}
        onSelectGroup={() => undefined}
        onSelectMaterial={() => undefined}
        onTopGroup={() => undefined}
        onTopMaterial={() => undefined}
        open
      />,
    );

    expect(screen.getByRole("dialog", { name: "收录的小程序" }))
      .toHaveClass(
        "h-[min(44rem,calc(100vh-3rem))]",
        "max-h-[calc(100vh-3rem)]",
      );
    expect(screen.getByRole("region", { name: "素材分组列表" }))
      .toHaveClass("h-full", "min-h-0");
    expect(screen.getByRole("region", { name: "素材分组列表" }))
      .not.toHaveClass("px-4");
    expect(screen.getByRole("button", { name: "Test1" }).closest(".space-y-1"))
      .toHaveClass("px-4");
    expect(screen.getByRole("region", { name: "素材内容列表" }))
      .toHaveClass("h-full", "min-h-0");
  });

  it("selects mini-program material from library footer send action", async () => {
    const user = userEvent.setup();
    const handleSelect = vi.fn();
    const item = createItem({
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
    });

    render(
      <MaterialLibraryDialog
        activeGroupId="group-mini"
        bizType={MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM}
        groups={[createGroup({ id: "group-mini", title: "常用小程序" })]}
        items={[item]}
        onCreateGroup={() => undefined}
        onDeleteGroup={() => undefined}
        onDeleteMaterial={() => undefined}
        onEditMaterial={() => undefined}
        onMoveMaterial={() => undefined}
        onOpenChange={() => undefined}
        onRenameGroup={() => undefined}
        onSelectGroup={() => undefined}
        onSelectMaterial={handleSelect}
        onTopGroup={() => undefined}
        onTopMaterial={() => undefined}
        open
      />,
    );

    expect(screen.getByRole("button", { name: "发送" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "选择素材 麦当劳自助点餐" }));
    expect(handleSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "发送" })).not.toBeDisabled();
    await user.click(screen.getByRole("button", { name: "选择素材 麦当劳自助点餐" }));
    expect(screen.getByRole("button", { name: "发送" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "选择素材 麦当劳自助点餐" }));
    await user.click(screen.getByRole("button", { name: "发送" }));
    expect(handleSelect).toHaveBeenCalledWith(item);
  });

  it("shows spinner and disables send button while sending material", async () => {
    const user = userEvent.setup();
    const item = createItem({
      id: "material-file-1",
      title: "报价单.pdf",
    });

    render(
      <MaterialLibraryDialog
        activeGroupId="group-file"
        bizType={MATERIAL_COLLECTION_BIZ_TYPE.FILE}
        groups={[createGroup({ id: "group-file", title: "常用文件" })]}
        isSending
        items={[item]}
        onCreateGroup={() => undefined}
        onDeleteGroup={() => undefined}
        onDeleteMaterial={() => undefined}
        onEditMaterial={() => undefined}
        onMoveMaterial={() => undefined}
        onOpenChange={() => undefined}
        onRenameGroup={() => undefined}
        onSelectGroup={() => undefined}
        onSelectMaterial={() => undefined}
        onTopGroup={() => undefined}
        onTopMaterial={() => undefined}
        open
      />,
    );

    await user.click(screen.getByRole("button", { name: "选择 报价单.pdf" }));

    const sendButton = screen.getByRole("button", { name: "发送" });
    expect(sendButton).toBeDisabled();
    expect(sendButton).toHaveAttribute("aria-busy", "true");
    expect(sendButton.querySelector('[data-slot="spinner"]')).toBeInTheDocument();
  });

  it("keeps the material library open while sending material", async () => {
    const user = userEvent.setup();
    const handleOpenChange = vi.fn();

    render(
      <MaterialLibraryDialog
        activeGroupId="group-file"
        bizType={MATERIAL_COLLECTION_BIZ_TYPE.FILE}
        groups={[createGroup({ id: "group-file", title: "常用文件" })]}
        isSending
        items={[createItem({ id: "material-file-1", title: "报价单.pdf" })]}
        onCreateGroup={() => undefined}
        onDeleteGroup={() => undefined}
        onDeleteMaterial={() => undefined}
        onEditMaterial={() => undefined}
        onMoveMaterial={() => undefined}
        onOpenChange={handleOpenChange}
        onRenameGroup={() => undefined}
        onSelectGroup={() => undefined}
        onSelectMaterial={() => undefined}
        onTopGroup={() => undefined}
        onTopMaterial={() => undefined}
        open
      />,
    );

    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "关闭" }));

    expect(handleOpenChange).not.toHaveBeenCalled();
  });

  it("uses mini-program library width for four collected mini-program cards", () => {
    render(
      <MaterialLibraryDialog
        activeGroupId="group-mini"
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
        onEditMaterial={() => undefined}
        onMoveMaterial={() => undefined}
        onOpenChange={() => undefined}
        onRenameGroup={() => undefined}
        onSelectGroup={() => undefined}
        onSelectMaterial={() => undefined}
        onTopGroup={() => undefined}
        onTopMaterial={() => undefined}
        open
      />,
    );

    expect(screen.getByRole("dialog", { name: "收录的小程序" }))
      .toHaveStyle({
        maxWidth: "calc(100vw - 2rem)",
        width: "74.5rem",
      });
    expect(screen.getByLabelText("收录内容列表"))
      .toHaveStyle({
        gap: "16px",
        gridTemplateColumns: "repeat(4, 210px)",
        width: "888px",
      });
    expect(screen.getByRole("button", { name: "选择素材 麦当劳自助点餐" }).parentElement)
      .toHaveClass("w-[210px]");
    expect(screen.getByText("麦当劳自助点餐"))
      .toHaveClass("line-clamp-1");
  });

  it("renders sphfeed materials with the sphfeed card", () => {
    render(
      <MaterialCard
        item={createItem({
          bizType: MATERIAL_COLLECTION_BIZ_TYPE.SPHFEED,
          content: {
            description: "杭州高架惊现鸵鸟飞奔",
            imageUrl: "https://finder.video.qq.com/cover.jpg",
            sourceLabel: "视频号",
            title: "都市快报",
            url: "https://channels.weixin.qq.com/web/pages/feed?eid=export",
          },
          contentType: "sphfeed",
          groupId: "group-sphfeed",
          title: "都市快报",
        })}
        onSelect={() => undefined}
      />,
    );

    expect(screen.getByText("都市快报")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "都市快报" })).toHaveAttribute(
      "src",
      "https://finder.video.qq.com/cover.jpg",
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("uses sphfeed library width for collected sphfeed cards", () => {
    render(
      <MaterialLibraryDialog
        activeGroupId="group-sphfeed"
        bizType={MATERIAL_COLLECTION_BIZ_TYPE.SPHFEED}
        groups={[createGroup({ id: "group-sphfeed", title: "常用视频号" })]}
        items={[
          createItem({
            bizType: MATERIAL_COLLECTION_BIZ_TYPE.SPHFEED,
            content: {
              description: "杭州高架惊现鸵鸟飞奔",
              imageUrl: "https://finder.video.qq.com/cover.jpg",
              sourceLabel: "视频号",
              title: "都市快报",
              url: "https://channels.weixin.qq.com/web/pages/feed?eid=export",
            },
            contentType: "sphfeed",
            groupId: "group-sphfeed",
            id: "sphfeed-1",
            title: "都市快报",
          }),
        ]}
        onCreateGroup={() => undefined}
        onDeleteGroup={() => undefined}
        onDeleteMaterial={() => undefined}
        onEditMaterial={() => undefined}
        onMoveMaterial={() => undefined}
        onOpenChange={() => undefined}
        onRenameGroup={() => undefined}
        onSelectGroup={() => undefined}
        onSelectMaterial={() => undefined}
        onTopGroup={() => undefined}
        onTopMaterial={() => undefined}
        open
      />,
    );

    expect(screen.getByRole("dialog", { name: "收录的视频号" }))
      .toHaveStyle({
        maxWidth: "calc(100vw - 2rem)",
        width: "74.5rem",
      });
    expect(screen.getByRole("button", { name: "选择素材 都市快报" }).parentElement)
      .toHaveClass("w-[217px]");
  });

  it("renders image materials in a selectable gallery with a preview action", async () => {
    const user = userEvent.setup();
    const handleSelect = vi.fn();
    const handleEdit = vi.fn();
    const item = createItem({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.IMAGE,
      content: {
        alt: "商品图",
        fileUrl: "https://cdn.example.com/product.png",
        imageUrl: "https://cdn.example.com/product.png",
      },
      contentType: "image",
      groupId: "group-image",
      id: "image-1",
      title: "图片",
    });

    render(
      <MaterialLibraryDialog
        activeGroupId="group-image"
        bizType={MATERIAL_COLLECTION_BIZ_TYPE.IMAGE}
        groups={[createGroup({ id: "group-image", title: "常用图片" })]}
        items={[item]}
        onCreateGroup={() => undefined}
        onDeleteGroup={() => undefined}
        onDeleteMaterial={() => undefined}
        onEditMaterial={handleEdit}
        onMoveMaterial={() => undefined}
        onOpenChange={() => undefined}
        onRenameGroup={() => undefined}
        onSelectGroup={() => undefined}
        onSelectMaterial={handleSelect}
        onTopGroup={() => undefined}
        onTopMaterial={() => undefined}
        open
      />,
    );

    expect(screen.getByRole("dialog", { name: "收录的图片" })).toBeInTheDocument();
    const imageButton = screen.getByRole("button", { name: "选择图片 商品图" });

    await user.click(imageButton);

    expect(imageButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "发送" })).toBeEnabled();
    expect(handleSelect).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "查看大图 商品图" }));

    expect(screen.getByRole("dialog", { name: "查看大图" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "商品图" })).toHaveAttribute(
      "src",
      "https://cdn.example.com/product.png",
    );
    expect(imageButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("menuitem", { name: "编辑" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "关闭" }));
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(handleSelect).toHaveBeenCalledWith(item);
    expect(handleEdit).not.toHaveBeenCalled();
  });

  it("renders collected expression section", async () => {
    const user = userEvent.setup();
    const handleSelect = vi.fn();
    const item = createItem({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION,
      content: {
        alt: "表情",
        fileUrl: "https://cdn.example.com/emotion.gif",
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
    msgInfoId: "9101",
    sort: 100,
    title: "报价单.pdf",
    ...overrides,
  };
}

function formatMaterialCollectionDate(timestamp: number) {
  const date = new Date(timestamp);

  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}
