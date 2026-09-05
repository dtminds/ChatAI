import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MATERIAL_COLLECTION_BIZ_TYPE } from "@chatai/contracts";
import { createMockWorkbenchService, resetWorkbenchService, setWorkbenchService } from "@/pages/chat/api/workbench-service";
import { WechatEmojiPicker } from "@/pages/chat/components/wechat-emoji-picker";
import { useMaterialCollection } from "@/pages/chat/hooks/use-material-collection";

function ExpressionHarness() {
  const material = useMaterialCollection({
    bootstrapStatus: "ready",
    isMountedRef: { current: true },
    onSendFailure: vi.fn(),
    onSent: vi.fn(),
    requestActiveConversationRead: vi.fn(),
    sendAgentMessageSegments: vi.fn(),
  });
  return <WechatEmojiPicker
    collectedExpressions={material.collectedExpressions}
    hasMoreCollectedExpressions={material.hasMoreCollectedExpressions}
    isCollectedExpressionLoadingMore={material.isCollectedExpressionLoadingMore}
    onOpenCollectedExpressions={material.handleOpenCollectedExpressions}
    onLoadMoreCollectedExpressions={material.handleLoadMoreCollectedExpressions}
    onTopCollectedExpression={material.handleTopCollectedExpression}
    onDeleteCollectedExpression={material.handleDeleteCollectedExpression}
    onSelect={vi.fn()}
  />;
}

afterEach(() => resetWorkbenchService());
describe("collected expression service interactions", () => {
  it("manages collected expressions from the custom emoji context menu", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const topMaterialCollection = vi.fn().mockResolvedValue({ ok: true });
    const deleteMaterialCollection = vi.fn().mockResolvedValue({ ok: true });
    const listMaterialCollections = vi.fn(async (request) => {
      if (request.bizType !== MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION) {
        return baseService.listMaterialCollections(request);
      }

      return {
        items: [
          {
            bizType: MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION,
            content: {
              alt: "贴贴表情",
              fileUrl: "https://example.com/expression.gif",
            },
            contentType: "emotion" as const,
            groupId: 0 as const,
            id: "material-expression-001",
            msgInfoId: "9106",
            sort: 1_781_244_000_000,
            title: "贴贴表情",
          },
        ],
        pagination: {
          hasMore: false,
          page: 1,
          pageSize: 100,
          total: 1,
        },
      };
    });

    setWorkbenchService({
      ...baseService,
      deleteMaterialCollection,
      listMaterialCollections,
      topMaterialCollection,
    });

    render(<ExpressionHarness />);

    await user.click(screen.getByRole("tab", { name: "自定义表情" }));

    const expressionButton = await screen.findByRole("button", {
      name: "发送收藏表情 贴贴表情",
    });

    fireEvent.contextMenu(expressionButton);
    await user.click(await screen.findByRole("menuitem", { name: "移到最前" }));

    await waitFor(() => {
      expect(topMaterialCollection).toHaveBeenCalledWith("material-expression-001");
    });

    fireEvent.contextMenu(expressionButton);
    await user.click(await screen.findByRole("menuitem", { name: "删除" }));

    await waitFor(() => {
      expect(deleteMaterialCollection).toHaveBeenCalledWith("material-expression-001");
    });
    expect(listMaterialCollections).toHaveBeenCalledWith({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION,
      groupId: 0,
      page: 1,
      pageSize: 100,
    });
  });

  it("loads more collected expressions from the custom emoji panel", async () => {
    const user = userEvent.setup();
    const baseService = createMockWorkbenchService();
    const listMaterialCollections = vi.fn(async (request) => {
      if (request.bizType !== MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION) {
        return baseService.listMaterialCollections(request);
      }

      const page = request.page ?? 1;

      return {
        items: [
          {
            bizType: MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION,
            content: {
              alt: `贴贴表情${page}`,
              fileUrl: `https://example.com/expression-${page}.gif`,
            },
            contentType: "emotion" as const,
            groupId: 0 as const,
            id: `material-expression-00${page}`,
            msgInfoId: `91${String(page).padStart(2, "0")}`,
            sort: 1_781_244_000_000 - page,
            title: `贴贴表情${page}`,
          },
        ],
        pagination: {
          hasMore: page === 1,
          page,
          pageSize: 100,
          total: 2,
        },
      };
    });

    setWorkbenchService({
      ...baseService,
      listMaterialCollections,
    });

    render(<ExpressionHarness />);

    await user.click(screen.getByRole("tab", { name: "自定义表情" }));

    expect(
      await screen.findByRole("button", { name: "发送收藏表情 贴贴表情1" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "加载更多" }));

    expect(
      await screen.findByRole("button", { name: "发送收藏表情 贴贴表情2" }),
    ).toBeInTheDocument();
    expect(listMaterialCollections).toHaveBeenCalledWith({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION,
      groupId: 0,
      page: 2,
      pageSize: 100,
    });
  });

});

