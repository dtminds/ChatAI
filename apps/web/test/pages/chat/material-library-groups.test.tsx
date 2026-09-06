import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MATERIAL_COLLECTION_BIZ_TYPE } from "@chatai/contracts";
import { createMockWorkbenchService, setWorkbenchService, resetWorkbenchService } from "@/pages/chat/api/workbench-service";
import { MaterialLibraryDialog } from "@/pages/chat/components/material-collection";
import { useMaterialCollection } from "@/pages/chat/hooks/use-material-collection";

function MaterialLibraryHarness() {
  const { activeMaterialLibraryGroupId, materialLibraryGroups, hasMoreMaterialLibraryItems, isMaterialLibraryBusy, isMaterialLibraryGroupsLoading, isMaterialLibraryItemsLoading, isMaterialLibraryLoadingMore, isMaterialLibrarySending, materialLibraryItems, handleCreateMaterialGroup, handleDeleteMaterialGroup, handleDeleteMaterial, handleEditMaterial, handleMoveMaterial, handleRenameMaterialGroup, handleSelectMaterial, handleTopMaterialGroup, handleTopMaterial, materialLibrarySearchKeyword, activeMaterialLibraryBizType, resetMaterialLibrary, handleLoadMoreMaterialLibraryItems, handleSearchMaterialLibraryKeyword, handleSelectMaterialLibraryGroup, handleOpenMaterialLibrary } = useMaterialCollection({
    bootstrapStatus: "idle", isMountedRef: { current: true },
    onSendFailure: vi.fn(), onSent: vi.fn(), requestActiveConversationRead: vi.fn(),
    sendAgentMessageSegments: vi.fn(),
  });
  return <><button onClick={() => void handleOpenMaterialLibrary(MATERIAL_COLLECTION_BIZ_TYPE.FILE)}>收录的文件</button>
      <MaterialLibraryDialog
        activeGroupId={activeMaterialLibraryGroupId}
        bizType={activeMaterialLibraryBizType ?? MATERIAL_COLLECTION_BIZ_TYPE.FILE}
        groups={materialLibraryGroups}
        hasMoreItems={hasMoreMaterialLibraryItems}
        isBusy={isMaterialLibraryBusy}
        isGroupsLoading={isMaterialLibraryGroupsLoading}
        isItemsLoading={isMaterialLibraryItemsLoading}
        isLoadingMoreItems={isMaterialLibraryLoadingMore}
        isMobileLayout={false}
        isSending={isMaterialLibrarySending}
        items={materialLibraryItems}
        onCreateGroup={handleCreateMaterialGroup}
        onDeleteGroup={handleDeleteMaterialGroup}
        onDeleteMaterial={handleDeleteMaterial}
        onEditMaterial={handleEditMaterial}
        onLoadMoreItems={() => {
          void handleLoadMoreMaterialLibraryItems();
        }}
        onMoveMaterial={handleMoveMaterial}
        onOpenChange={(open) => {
          if (!open) {
            resetMaterialLibrary();
          }
        }}
        onRenameGroup={handleRenameMaterialGroup}
        onSearchKeywordChange={(keyword) => {
          void handleSearchMaterialLibraryKeyword(keyword);
        }}
        onSelectGroup={(groupId) => {
          void handleSelectMaterialLibraryGroup(groupId);
        }}
        onSelectMaterial={handleSelectMaterial}
        onTopGroup={handleTopMaterialGroup}
        onTopMaterial={handleTopMaterial}
        open={activeMaterialLibraryBizType !== null}
        searchKeyword={materialLibrarySearchKeyword}
      />
</>;
}

afterEach(() => resetWorkbenchService());
describe("material library group interactions", () => {
  it("reloads only material groups after topping a group", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const topMaterialGroup = vi.fn().mockResolvedValue({ ok: true });
    const listMaterialGroups = vi.fn(async (request) => {
      if (request.bizType !== MATERIAL_COLLECTION_BIZ_TYPE.FILE) {
        return baseService.listMaterialGroups(request);
      }

      return {
        groups: [
          {
            bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
            id: "group-first",
            sort: 300,
            title: "第一分组",
          },
          {
            bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
            id: "group-second",
            sort: 400,
            title: "第二分组",
          },
        ],
      };
    });
    const listMaterialCollections = vi.fn(async (request) => {
      if (request.bizType !== MATERIAL_COLLECTION_BIZ_TYPE.FILE) {
        return baseService.listMaterialCollections(request);
      }

      return {
        items:
          request.groupId === "group-second"
            ? [
                {
                  bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
                  content: {
                    extension: "pdf",
                    fileName: "第二分组文件.pdf",
                    fileSizeLabel: "2 KB",
                    sourceLabel: "文件",
                  },
                  contentType: "file" as const,
                  groupId: "group-second",
                  id: "material-file-second",
                  msgInfoId: "9105",
                  sort: 1,
                  title: "第二分组文件.pdf",
                },
              ]
            : [],
        pagination: {
          hasMore: false,
          page: request.page ?? 1,
          pageSize: 100,
          total: request.groupId === "group-second" ? 1 : 0,
        },
      };
    });

    setWorkbenchService({
      ...baseService,
      listMaterialCollections,
      listMaterialGroups,
      topMaterialGroup,
    });

    render(<MaterialLibraryHarness />);

    await user.click(screen.getByRole("button", { name: "收录的文件" }));
    await user.click(await screen.findByRole("button", { name: "第二分组" }));
    await screen.findByRole("row", {
      name: /第二分组文件\.pdf/,
    });

    const listMaterialGroupsCallsAfterOpen = listMaterialGroups.mock.calls.length;
    const listMaterialCollectionsCallsAfterSelect =
      listMaterialCollections.mock.calls.length;

    await user.click(
      screen.getByRole("button", { name: "打开 第二分组 操作菜单" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "移到最前" }));

    await waitFor(() => {
      expect(topMaterialGroup).toHaveBeenCalledWith(
        "group-second",
        MATERIAL_COLLECTION_BIZ_TYPE.FILE,
      );
    });
    expect(listMaterialGroups.mock.calls.length).toBe(
      listMaterialGroupsCallsAfterOpen + 1,
    );
    expect(listMaterialCollections.mock.calls.length).toBe(
      listMaterialCollectionsCallsAfterSelect,
    );
    expect(
      screen.getByRole("row", { name: /第二分组文件\.pdf/ }),
    ).toBeInTheDocument();
  });

  it("selects the first group and loads items after creating from an empty library", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    let listMaterialGroupsCallCount = 0;
    const createMaterialGroup = vi.fn(async () => ({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
      id: "group-first",
      sort: 400,
      title: "第一分组",
    }));
    const listMaterialGroups = vi.fn(async (request) => {
      if (request.bizType !== MATERIAL_COLLECTION_BIZ_TYPE.FILE) {
        return baseService.listMaterialGroups(request);
      }

      listMaterialGroupsCallCount += 1;

      if (listMaterialGroupsCallCount === 1) {
        return { groups: [] };
      }

      return {
        groups: [
          {
            bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
            id: "group-first",
            sort: 400,
            title: "第一分组",
          },
        ],
      };
    });
    const listMaterialCollections = vi.fn(async (request) => {
      if (request.bizType !== MATERIAL_COLLECTION_BIZ_TYPE.FILE) {
        return baseService.listMaterialCollections(request);
      }

      return {
        items: [],
        pagination: {
          hasMore: false,
          page: 1,
          pageSize: 100,
          total: 0,
        },
      };
    });

    setWorkbenchService({
      ...baseService,
      createMaterialGroup,
      listMaterialCollections,
      listMaterialGroups,
    });

    render(<MaterialLibraryHarness />);

    await user.click(screen.getByRole("button", { name: "收录的文件" }));
    expect(await screen.findByText("暂无分组")).toBeInTheDocument();
    expect(listMaterialCollections).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "新建分组" }));
    await user.type(screen.getByRole("textbox", { name: "分组名称" }), "第一分组");
    await user.click(screen.getByRole("button", { name: "新建" }));

    await waitFor(() => {
      expect(createMaterialGroup).toHaveBeenCalledWith({
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        title: "第一分组",
      });
    });
    expect(screen.queryByText("暂无分组")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "第一分组" })).toBeInTheDocument();
    await waitFor(() => {
      expect(listMaterialCollections).toHaveBeenCalledWith({
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        groupId: "group-first",
        page: 1,
        pageSize: 100,
      });
    });
    expect(await screen.findByText("暂无数据")).toBeInTheDocument();
  });
});
